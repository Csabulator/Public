"""Config, car lists and the file-based plan (one editable JSON per day)."""
import json
import os
import random
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from . import commons

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STATES = ("tervezett", "jovahagyott", "kihagy", "kikuldve", "hiba")
ACTIONS = ("masik-auto", "uj-kepek", "kuldes-most")

HELP = (
    "Szerkesztheto: szoveg (max. 180 karakter), kepek (max. 3 URL), "
    "allapot (tervezett / jovahagyott / kihagy), kuldes_ideje (pl. \"18:30\", ures = alapertelmezett). "
    "Masik auto: auto_id legyen egy id a cars/*.json-bol, vagy \"\" a sorsolashoz "
    "(ilyenkor a szoveg es a kepek is cserelodnek). "
    "muvelet: \"masik-auto\" | \"uj-kepek\" (kovetkezo 3 kep) | \"kuldes-most\". "
    "Mentes (commit) utan par percen belul feldolgozza."
)


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def dump_json(path, data):
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if f.read() == text:
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True


class Bot:
    def __init__(self, root=ROOT):
        self.root = root
        self.cfg = {
            "kuldes_ideje": "09:00", "idozona": "Europe/Budapest", "tervezett_napok": 9,
            "max_karakter": 180, "csak_jovahagyott": False, "szunet": False,
            "auto_arany": 0.3, "bot_nev": "Autós érdekességek", "bot_avatar": "",
        }
        self.cfg.update(load_json(os.path.join(root, "config.json"), {}))
        self.tz = ZoneInfo(self.cfg["idozona"])
        self.max = int(self.cfg["max_karakter"])
        self.cars = {}
        for name in ("kuralt.json", "auto.json"):
            for c in load_json(os.path.join(root, "cars", name), []):
                c.setdefault("auto", name == "auto.json")
                self.cars[c["id"]] = c
        self.plan_dir = os.path.join(root, "plan")
        self.log: list[str] = []

    # ---------- plan files ----------
    def path(self, day: str):
        return os.path.join(self.plan_dir, f"{day}.json")

    def all_posts(self) -> dict:
        out = {}
        if os.path.isdir(self.plan_dir):
            for fn in sorted(os.listdir(self.plan_dir)):
                if fn.endswith(".json"):
                    p = load_json(os.path.join(self.plan_dir, fn))
                    out[p["nap"]] = p
        return out

    def extra_posts(self) -> list:
        """Posts sent ahead of their day ("kuldes-most" on a future day)."""
        d = os.path.join(self.plan_dir, "elore")
        if not os.path.isdir(d):
            return []
        return [load_json(os.path.join(d, fn)) for fn in sorted(os.listdir(d)) if fn.endswith(".json")]

    def archive_early(self, post, today: date):
        """A future day's post went out early: keep it in plan/elore/, give the day a new car."""
        post = dict(post, eredeti_nap=post["nap"], kuldve_nap=today.isoformat())
        dump_json(os.path.join(self.plan_dir, "elore", f"{post['nap']}_{post['sorszam']}.json"), post)
        os.remove(self.path(post["nap"]))
        return self.refresh(today)

    def post_time(self, post) -> str:
        t = (post or {}).get("kuldes_ideje") or ""
        return t if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t) else self.cfg["kuldes_ideje"]

    def save(self, post) -> bool:
        ordered = {"_sugo": HELP}
        ordered.update({k: v for k, v in post.items() if k != "_sugo"})
        return dump_json(self.path(post["nap"]), ordered)

    def now(self):
        return datetime.now(self.tz)

    # ---------- choosing ----------
    def pick_car(self, posts: dict, exclude=()) -> str:
        last = {}
        for p in list(posts.values()) + self.extra_posts():
            last[p["auto_id"]] = max(last.get(p["auto_id"], ""), p["nap"])
        pool = [c for c in self.cars if c not in exclude] or list(self.cars)
        fresh = [c for c in pool if c not in last]
        if fresh:
            cur = [c for c in fresh if not self.cars[c].get("auto")]
            aut = [c for c in fresh if self.cars[c].get("auto")]
            if cur and aut:
                return random.choice(aut if random.random() < float(self.cfg["auto_arany"]) else cur)
            return random.choice(cur or aut)
        pool.sort(key=lambda c: last.get(c, ""))          # least recently used first
        return random.choice(pool[: max(1, len(pool) // 5)])

    def apply_car(self, post, car_id):
        car = self.cars[car_id]
        imgs, off = commons.for_car(car)
        post.update(auto_id=car_id, auto_nev=car["nev"], kategoria=car.get("kategoria", ""),
                    szoveg=car["szoveg"][: self.max], kepek=imgs, kep_offset=off,
                    automatikus=bool(car.get("auto")), hiba=None)

    # ---------- the main pass ----------
    def refresh(self, today: date | None = None) -> list[str]:
        """Create missing days, process manual edits. Returns days whose file changed."""
        today = today or self.now().date()
        posts = self.all_posts()
        changed = []
        next_no = max((p["sorszam"] for p in list(posts.values()) + self.extra_posts()), default=0) + 1
        for i in range(int(self.cfg["tervezett_napok"])):
            day = (today + timedelta(days=i)).isoformat()
            post = posts.get(day)
            if post is None:
                window = {posts[d]["auto_id"] for d in posts if d >= today.isoformat()}
                post = {"sorszam": next_no, "nap": day, "allapot": "tervezett", "muvelet": "",
                        "probalkozas": 0, "kikuldve": None, "uzenet_id": None}
                next_no += 1
                self.apply_car(post, self.pick_car(posts, exclude=window))
                posts[day] = post
                self.process_edits(post, posts)
            elif post.get("allapot") != "kikuldve":
                self.process_edits(post, posts)
            if self.save(post):
                changed.append(day)
        return changed

    def process_edits(self, post, posts):
        action = (post.get("muvelet") or "").strip()
        car_id = (post.get("auto_id") or "").strip()
        if action == "masik-auto" or not car_id:
            car_id = self.pick_car(posts, exclude={p["auto_id"] for p in posts.values()})
            self.apply_car(post, car_id)
        elif car_id in self.cars and self.cars[car_id]["nev"] != post.get("auto_nev"):
            self.apply_car(post, car_id)          # user typed a different car id
        if action == "uj-kepek" and post.get("auto_id") in self.cars:
            imgs, off = commons.for_car(self.cars[post["auto_id"]], post.get("kep_offset", 0) + 3)
            post.update(kepek=imgs, kep_offset=off)
        # normalise hand-edited images: plain URL strings are fine
        imgs = []
        for im in (post.get("kepek") or [])[:3]:
            if isinstance(im, str):
                im = {"url": im.strip(), "oldal": im.strip(), "szerzo": ""}
            if im.get("url", "").startswith(("http://", "https://")):
                imgs.append(im)
        if not imgs and post.get("auto_id") in self.cars and action != "uj-kepek":
            imgs, post["kep_offset"] = commons.for_car(self.cars[post["auto_id"]])
        post["kepek"] = imgs
        post["szoveg"] = (post.get("szoveg") or "").strip()
        warn = None
        if post.get("allapot") not in STATES:
            warn = f"Ismeretlen allapot: {post.get('allapot')} (tervezettre allitva)"
            post["allapot"] = "tervezett"
        elif len(post["szoveg"]) > self.max:
            warn = f"A szoveg {len(post['szoveg'])} karakter, max. {self.max} - igy nem kuldom ki."
        elif not post["szoveg"]:
            warn = "Ures szoveg - igy nem kuldom ki."
        elif post.get("auto_id") not in self.cars:
            warn = f"Ismeretlen auto_id: {post.get('auto_id')}"
        elif post.get("kuldes_ideje") and self.post_time(post) != post["kuldes_ideje"]:
            warn = f"Hibas kuldes_ideje: {post['kuldes_ideje']} (OO:PP kell) - az alapertelmezettet hasznalom."
        post["figyelmeztetes"] = warn
        post["muvelet"] = "kuldes-most" if action == "kuldes-most" else ""

    def sendable(self, post) -> bool:
        w = post.get("figyelmeztetes") or ""
        return not (w.startswith(("A szoveg", "Ures")) or not post.get("szoveg"))

    # ---------- posting ----------
    def due(self, now=None):
        """Posts that should go out now: today's (if time passed) + any 'kuldes-most'."""
        now = now or self.now()
        posts = self.all_posts()
        out = [p for p in posts.values() if p.get("muvelet") == "kuldes-most"]
        p = posts.get(now.date().isoformat())
        if p and p not in out and not self.cfg["szunet"]:
            hh, mm = (int(x) for x in self.post_time(p).split(":"))
            ok_state = p["allapot"] in (("jovahagyott",) if self.cfg["csak_jovahagyott"] else ("tervezett", "jovahagyott"))
            retry = p["allapot"] == "hiba" and p.get("probalkozas", 0) < 3
            if (now.hour, now.minute) >= (hh, mm) and (ok_state or retry):
                out.append(p)
        return out
