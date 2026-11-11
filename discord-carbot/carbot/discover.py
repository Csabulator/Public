"""Finds new motorsport cars on Wikipedia and adds them to cars/auto.json.

Pipeline: category members -> skip known -> rank by page views -> parse the
infobox (engine, power, torque, weight, year) -> short Hungarian text
(Claude API if ANTHROPIC_API_KEY is set, otherwise a template) -> keep only
cars that have at least one usable Commons photo."""
import json
import os
import re
import unicodedata

from . import commons, net
from .core import dump_json, load_json

WIKI = "https://en.wikipedia.org/w/api.php"

SKIP_SUBCATS = re.compile(
    r"template|image|list|people|driver|team|engine|manufacturer|race|circuit|season|"
    r"video game|toy|stub|by country|by year|series|championship|personnel|award|logo", re.I)
SKIP_TITLES = re.compile(r"^(List of|Template:|Category:)|\bengine\b|\bseason\b", re.I)


# ---------------------------------------------------------------- helpers
def norm(s: str) -> str:
    s = re.sub(r"\s*\([^)]*\)", "", s or "")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", re.sub(r"\s*\([^)]*\)", "", s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def wiki(params):
    return net.http(WIKI, params={"format": "json", "formatversion": "2", **params})


def category_members(cat: str, depth: int, seen=None) -> set[str]:
    seen = seen if seen is not None else set()
    if cat in seen:
        return set()
    seen.add(cat)
    titles, subcats, cont = set(), [], {}
    while True:
        d = wiki({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{cat}",
                  "cmtype": "page|subcat", "cmlimit": "500", **cont})
        for m in d.get("query", {}).get("categorymembers", []):
            if m["ns"] == 14:
                subcats.append(m["title"].split(":", 1)[1])
            elif m["ns"] == 0 and not SKIP_TITLES.search(m["title"]):
                titles.add(m["title"])
        if "continue" not in d:
            break
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}
    if depth > 0:
        for sc in subcats:
            if not SKIP_SUBCATS.search(sc):
                titles |= category_members(sc, depth - 1, seen)
    return titles


def pageviews(titles: list[str]) -> dict[str, int]:
    out = {}
    for i in range(0, len(titles), 50):
        d = wiki({"action": "query", "prop": "pageviews", "titles": "|".join(titles[i:i + 50])})
        for p in d.get("query", {}).get("pages", []):
            out[p["title"]] = sum(v or 0 for v in (p.get("pageviews") or {}).values())
    return out


# ---------------------------------------------------------------- infobox parsing
def infobox(wikitext: str) -> dict:
    m = re.search(r"\{\{\s*Infobox", wikitext, re.I)
    if not m:
        return {}
    i, depth, start = m.start(), 0, m.start()
    while i < len(wikitext):
        if wikitext.startswith("{{", i):
            depth += 1
            i += 2
        elif wikitext.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                break
        else:
            i += 1
    body = wikitext[start + 2:i - 2]
    fields, cur, d, j = {}, "", 0, 0
    parts = []
    while j < len(body):
        two = body[j:j + 2]
        if two in ("{{", "[["):
            d += 1
            cur += two
            j += 2
            continue
        if two in ("}}", "]]"):
            d -= 1
            cur += two
            j += 2
            continue
        if body[j] == "|" and d == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += body[j]
        j += 1
    parts.append(cur)
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            fields[k.strip().lower().replace(" ", "_")] = v.strip()
    return fields


def clean(v: str) -> str:
    v = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", v or "", flags=re.S)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\{\{\s*(?:convert|cvt)\s*\|\s*([\d.,]+)\s*\|\s*(?:-|to|–)?\s*\|?\s*([^|}]+)[^{}]*\}\}",
               r"\1 \2", v, flags=re.I)
    v = re.sub(r"<br\s*/?>", "; ", v, flags=re.I)
    v = re.sub(r"\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist|hlist)\s*\|([^{}]*)\}\}",
               lambda m: m.group(1).split("|")[0], v, flags=re.I)
    for _ in range(3):
        v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", v)
    v = re.sub(r"'''?|<[^>]+>|&nbsp;", " ", v)
    v = re.sub(r"^\s*[*#]\s*", "", v, flags=re.M)
    return re.sub(r"\s+", " ", v).strip(" ;,")


def _num(s):
    return float(s.replace(",", ""))


def power_le(v: str):
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(PS|hp|bhp|kW|LE|cv|ch)\b", v, re.I)
    if not m:
        return None
    n, u = _num(m.group(1)), m.group(2).lower()
    le = n * 1.36 if u == "kw" else (n * 1.014 if u in ("hp", "bhp") else n)
    return f"{round(le)} LE" if 20 < le < 5000 else None


def torque_nm(v: str):
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(N[·⋅\s-]?m|Nm|lb[·⋅\s-]?ft|lbf[·⋅\s-]?ft|lb-ft)", v, re.I)
    if not m:
        return None
    n = _num(m.group(1)) * (1.356 if m.group(2).lower().startswith("lb") else 1)
    return f"{round(n)} Nm" if 20 < n < 5000 else None


LAYOUTS = [
    (r"\bV-?(\d{1,2})\b", lambda m: f"V{m.group(1)}"),
    (r"\bW-?(\d{1,2})\b", lambda m: f"W{m.group(1)}"),
    (r"flat[- ]?(four|six|eight|twelve)|boxer", lambda m: "boxer-" + {"four": "4", "six": "6", "eight": "8", "twelve": "12"}.get((m.group(1) or "").lower(), "")),
    (r"(?:inline|straight)[- ]?(three|four|five|six|eight)|\bI(\d)\b",
     lambda m: "soros " + ({"three": "3", "four": "4", "five": "5", "six": "6", "eight": "8"}.get((m.group(1) or "").lower()) or m.group(2))),
    (r"rotary|wankel", lambda m: "Wankel"),
    (r"electric", lambda m: "villanymotor"),
]


def engine_hu(v: str):
    if not v:
        return None
    parts = []
    m = re.search(r"(\d[.,]\d{1,2})\s*(?:L|l|litre|liter)\b", v)
    if m:
        parts.append(m.group(1).replace(".", ",") + " l")
    elif (m := re.search(r"(\d{1,2}[,.\s]?\d{3}|\d{3,4})\s*(?:cc|cm3|cm³)", v)):
        cc = int(re.sub(r"\D", "", m.group(1)))
        parts.append(f"{cc / 1000:.1f}".replace(".", ",") + " l")
    if re.search(r"twin[- ]?turbo|bi-?turbo", v, re.I):
        parts.append("biturbó")
    elif re.search(r"turbo", v, re.I):
        parts.append("turbó")
    elif re.search(r"supercharg", v, re.I):
        parts.append("kompresszoros")
    for rx, fn in LAYOUTS:
        if (m := re.search(rx, v, re.I)):
            parts.append(fn(m))
            break
    if re.search(r"hybrid", v, re.I):
        parts.append("+ hibrid")
    return " ".join(parts) if len(parts) >= 2 else None


def first_year(*vals):
    for v in vals:
        if v and (m := re.search(r"\b(19[0-9]{2}|20[0-4][0-9])\b", v)):
            return m.group(1)
    return None


def facts_from(title: str, wikitext: str) -> dict:
    ib = {k: clean(v) for k, v in infobox(wikitext).items()}
    eng = ib.get("engine") or ib.get("engine_name") or ""
    return {
        "nev": re.sub(r"\s*\([^)]*\)$", "", title),
        "ev": first_year(ib.get("production"), ib.get("debut"), ib.get("years"), ib.get("season"),
                         ib.get("model_years"), ib.get("first_race")),
        "motor": engine_hu(eng),
        "motor_eredeti": eng[:120],
        "teljesitmeny": power_le(ib.get("power", "") or ib.get("max_power", "") or eng),
        "nyomatek": torque_nm(ib.get("torque", "") or eng),
        "tomeg": (m.group(1) + " kg") if (m := re.search(r"(\d[\d,]{2,4})\s*kg", ib.get("weight", "") + ib.get("mass", "") + ib.get("curb_weight", ""))) else None,
    }


# ---------------------------------------------------------------- text
def template_text(f: dict, sentence: str, max_len: int) -> str:
    head = f"{f['nev']}" + (f" ({f['ev']})" if f.get("ev") else "")
    specs = [x for x in (f.get("motor"), f.get("teljesitmeny"), f.get("nyomatek"), f.get("tomeg")) if x]
    tail = f" {sentence.rstrip('.')}." if sentence else ""
    for k in range(len(specs), 0, -1):
        t = f"{head} – {', '.join(specs[:k])}.{tail}"
        if len(t) <= max_len:
            return t
        t = f"{head} – {', '.join(specs[:k])}."
        if len(t) <= max_len:
            return t
    return head[:max_len]


EXAMPLES = [
    "Ferrari F40 (1987) – 2,9 l biturbó V8, 478 LE, 577 Nm, kb. 1100 kg. Enzo utolsó jóváhagyott Ferrarija; LM és GTE versenyváltozatban is futott.",
    "Lancia 037 (1982) – 2,0 l soros 4 Volumex kompresszorral, evóban kb. 325 LE, hátsókerék. 1983-ban legyőzte a quattrót: az utolsó RWD márka-vb-győztes.",
]


def claude_text(f: dict, extract: str, label: str, max_len: int, model: str):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    prompt = (
        "Írj EGYETLEN magyar nyelvű, legfeljebb {n} karakteres leírást egy autós Discord-csatornára, "
        "benzinvérűeknek. Formátum: Név (év) – motor, LE, Nm (ha van), majd egy rövid versenyes érdekesség. "
        "KIZÁRÓLAG az alábbi tényekből dolgozz, semmit ne találj ki; ha valami hiányzik, hagyd ki. "
        "Csak a kész szöveget add vissza.\n\nPéldák:\n- {ex}\n\nKategória: {label}\nTények: {facts}\n"
        "Wikipedia-bevezető (angol): {extract}"
    ).format(n=max_len, ex="\n- ".join(EXAMPLES), label=label,
             facts=json.dumps(f, ensure_ascii=False), extract=extract[:1500])
    for attempt in range(2):
        try:
            r = net.http("https://api.anthropic.com/v1/messages", method="POST",
                         headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                         data={"model": model, "max_tokens": 300,
                               "messages": [{"role": "user", "content": prompt}]})
            text = "".join(b.get("text", "") for b in r.get("content", [])).strip().strip('"')
        except Exception as e:
            print(f"::warning::Claude API error: {e}")
            return None
        if 40 <= len(text) <= max_len:
            return text
        prompt += f"\n\nAz előző válasz {len(text)} karakter volt – legyen rövidebb, max. {max_len}!"
    return None


# ---------------------------------------------------------------- main entry
def run(bot, limit=None, dry=False) -> list[dict]:
    cfg = {"kategoriak": [], "melyseg": 1, "hetente": 15, "modell": "claude-haiku-5-5"}
    cfg.update(bot.cfg.get("felfedezes", {}))
    limit = limit or int(cfg["hetente"])
    state_path = os.path.join(bot.root, "cars", "felfedezes_allapot.json")
    state = load_json(state_path, {"megvizsgalt": {}})
    known = {norm(c["nev"]) for c in bot.cars.values()}
    known |= {norm(a) for c in bot.cars.values() for a in c.get("aliasok", [])}
    known |= {norm(t) for t in state["megvizsgalt"]}

    cand_label, cand_sentence = {}, {}
    for cat in cfg["kategoriak"]:
        name, label = cat["nev"], cat.get("cimke", "")
        try:
            members = category_members(name, int(cat.get("melyseg", cfg["melyseg"])))
            print(f"  category {name!r}: {len(members)} pages")
            if not members:
                print(f"::warning::Empty or missing Wikipedia category: {name}")
            for t in members:
                cand_label.setdefault(t, label)
                cand_sentence.setdefault(t, cat.get("mondat", ""))
        except Exception as e:
            print(f"::warning::category {name}: {e}")
    cands = [t for t in cand_label if norm(t) not in known]
    print(f"{len(cand_label)} candidates in categories, {len(cands)} new")
    if not cands:
        return []
    views = pageviews(cands)
    cands.sort(key=lambda t: views.get(t, 0), reverse=True)

    added = []
    auto_path = os.path.join(bot.root, "cars", "auto.json")
    auto = load_json(auto_path, [])
    for title in cands[: limit * 4]:
        if len(added) >= limit:
            break
        verdict = "ok"
        try:
            d = wiki({"action": "query", "prop": "extracts|revisions", "exintro": "1", "explaintext": "1",
                      "rvprop": "content", "rvslots": "main", "rvsection": "0", "redirects": "1",
                      "titles": title})
            page = d["query"]["pages"][0]
            wt = page["revisions"][0]["slots"]["main"]["content"]
            extract = page.get("extract", "")
            f = facts_from(page["title"], wt)
            if not (f["motor"] and f["teljesitmeny"]):
                verdict = "kevés adat"
            else:
                car = {"id": slug(f["nev"]), "nev": f["nev"], "kategoria": cand_label[title],
                       "kereses": f["nev"], "link": f"https://en.wikipedia.org/wiki/{page['title'].replace(' ', '_')}",
                       "auto": True, "nezettseg_60nap": views.get(title, 0), "tenyek": f}
                imgs, _ = commons.for_car(car)
                if not imgs:
                    verdict = "nincs kép"
                else:
                    car["szoveg"] = (claude_text(f, extract, cand_label[title], bot.max, cfg["modell"])
                                     or template_text(f, cand_sentence[title], bot.max))
                    if car["id"] in bot.cars:
                        car["id"] += "-" + (f["ev"] or "x")
                    added.append(car)
        except Exception as e:
            verdict = f"hiba: {str(e)[:80]}"
        if not verdict.startswith("hiba"):
            state["megvizsgalt"][title] = verdict
        print(f"  {verdict:12} {title}")
    if not dry:
        dump_json(auto_path, auto + added)
        dump_json(state_path, state)
    return added
