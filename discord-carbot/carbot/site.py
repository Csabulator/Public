"""Static GitHub Pages view: next 9 days as a 3x3 grid + recently posted."""
import html
import os
from datetime import date
from urllib.parse import quote

WEEKDAYS = ["hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"]
STATUS = {"tervezett": "Tervezett", "jovahagyott": "Jóváhagyva", "kihagy": "Kihagyva",
          "kikuldve": "Kiküldve", "hiba": "Hiba"}

e = lambda s: html.escape(str(s if s is not None else ""), quote=True)  # noqa: E731


def day_label(iso):
    d = date.fromisoformat(iso)
    return f"{d.year}. {d.month:02d}. {d.day:02d}. {WEEKDAYS[d.weekday()]}"


CSS = """
:root{--bg:#0e0f12;--panel:#17191e;--line:#2a2d35;--text:#e9e9ec;--muted:#9a9ca5;--red:#e10600;--green:#2fbf71;--blue:#4c8dff;--amber:#f5a524}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,#1a0605,transparent 60%)}
h1{font-size:20px;margin:0}h1 span{color:var(--red)}.info{color:var(--muted);font-size:13px;display:flex;flex-wrap:wrap;gap:6px 16px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin:28px 24px 12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 24px}
@media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.grid{grid-template-columns:1fr;padding:0 12px}header{padding:12px}}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.tile.today{border-color:var(--red);box-shadow:0 0 0 1px var(--red)}.tile.kihagy{opacity:.45}
.imgs{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr));gap:2px;aspect-ratio:16/8;background:#000;position:relative;overflow:hidden}
.imgs img{width:100%;height:100%;min-height:0;min-width:0;object-fit:cover;display:block}.imgs img:first-child{grid-row:1/3}
.imgs.n1 img{grid-column:1/3}.imgs.n2 img:nth-child(2){grid-row:1/3}
.none{grid-column:1/3;grid-row:1/3;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.badge,.date{position:absolute;top:8px;background:rgba(0,0,0,.75);padding:2px 8px;border-radius:6px}.badge{left:8px;font-weight:700}.date{right:8px;font-size:12px}
.body{padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.title{font-weight:700;display:flex;justify-content:space-between;gap:8px;align-items:baseline}.cat{color:var(--muted);font-size:12px;font-weight:400;text-align:right}
.text{color:#d4d5da;font-size:14px;flex:1}.meta{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);gap:6px;flex-wrap:wrap}
.status{padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600}
.s-tervezett{background:#2b2f3a;color:#c8cad3}.s-jovahagyott{background:rgba(47,191,113,.18);color:var(--green)}.s-kihagy{background:#333;color:#999}
.s-kikuldve{background:rgba(76,141,255,.18);color:var(--blue)}.s-hiba{background:rgba(225,6,0,.2);color:#ff6b66}
.auto{background:rgba(245,165,36,.16);color:var(--amber);padding:2px 8px;border-radius:20px;font-size:12px}
.warn{color:#ff6b66;font-size:12px}.over{color:#ff6b66;font-weight:700}
.actions{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 14px}
.actions a{font-size:13px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#22252d;color:var(--text);text-decoration:none}
.actions a:hover{border-color:#555}.actions a.go{background:var(--red);border-color:var(--red)}a{color:var(--blue)}
details{margin:0 24px;color:var(--muted);font-size:14px}details code{background:#000;padding:1px 5px;border-radius:4px;color:#ddd}
footer{color:var(--muted);font-size:12px;padding:24px}
"""


ISSUE_BODY = ("Kattints lent a zöld **Create** / **Submit new issue** gombra. "
              "A bot pár percen belül végrehajtja, ide visszaírja az eredményt, és lezárja ezt az issue-t.\n\n"
              "(Időpontnál a címben átírhatod az ÓÓ:PP részt.)")


def issue_link(repo, title):
    return f"https://github.com/{repo}/issues/new?title={quote(title)}&body={quote(ISSUE_BODY)}"


def tile(p, cfg, repo, branch, today, history=False, post_time=None):
    imgs = (p.get("kepek") or [])[:3]
    img_html = "".join(f'<img src="{e(i["url"])}" alt="" loading="lazy" title="{e(i.get("szerzo"))}">' for i in imgs) \
        or '<div class="none">nincs kép</div>'
    is_today = p["nap"] == today and not history
    n = len(p.get("szoveg", ""))
    mx = int(cfg["max_karakter"])
    path = f"discord-carbot/plan/{p['nap']}.json"
    acts = []
    if p.get("link"):
        acts.append(f'<a href="{e(p["link"])}" target="_blank">Megnyitás Discordon ↗</a>')
    if not history and repo:
        d = p["nap"]
        cmd = lambda c: issue_link(repo, f"carbot: {c} {d}")  # noqa: E731
        sent = p.get("allapot") == "kikuldve"
        acts.append(f'<a class="go" href="{e(cmd("kuldes-most"))}" target="_blank">🚀 {"Újraküldés" if sent else "Küldés most"}</a>')
        if not sent:
            acts.append(f'<a href="{e(cmd("masik-auto"))}" target="_blank">🎲 Másik autó</a>')
            acts.append(f'<a href="{e(cmd("uj-kepek"))}" target="_blank">🖼️ Más képek</a>')
            acts.append(f'<a href="{e(issue_link(repo, f"carbot: ido {d} {post_time}"))}" target="_blank">⏰ Időpont</a>')
            if p.get("allapot") == "kihagy":
                acts.append(f'<a href="{e(cmd("visszaallit"))}" target="_blank">↩️ Visszaállít</a>')
            else:
                acts.append(f'<a href="{e(cmd("kihagy"))}" target="_blank">⏭️ Kihagy</a>')
            if cfg.get("csak_jovahagyott") and p.get("allapot") != "jovahagyott":
                acts.append(f'<a href="{e(cmd("jovahagy"))}" target="_blank">✅ Jóváhagy</a>')
        acts.append(f'<a href="https://github.com/{repo}/edit/{branch}/{path}" target="_blank">✏️ Szerkesztés</a>')
    warn = p.get("figyelmeztetes") or (p.get("hiba") if p.get("allapot") == "hiba" else None)
    return f"""<div class="tile {'today' if is_today else ''} {e(p.get('allapot'))}">
  <div class="imgs n{len(imgs)}">{img_html}<div class="badge">#{e(p['sorszam'])}</div>
    <div class="date">{'MA • ' if is_today else ''}{e(day_label(p['nap']))}</div></div>
  <div class="body">
    <div class="title">{e(p.get('auto_nev'))}<span class="cat">{e(p.get('kategoria'))}</span></div>
    <div class="text">{e(p.get('szoveg'))}</div>
    <div class="meta"><span class="status s-{e(p.get('allapot'))}">{e(STATUS.get(p.get('allapot'), p.get('allapot')))}</span>
      {f'<span>🕘 {e(post_time)}</span>' if post_time and not history else ''}
      {'<span class="auto">automatikus – ellenőrizd</span>' if p.get('automatikus') else ''}
      <span class="{'over' if n > mx else ''}">{n}/{mx}</span></div>
    {f'<div class="warn">{e(warn)}</div>' if warn else ''}
  </div>
  <div class="actions">{''.join(acts)}</div></div>"""


def build(bot, out_dir, repo=None, branch="main"):
    repo = repo or os.environ.get("GITHUB_REPOSITORY") or bot.cfg.get("repo", "")
    today = bot.now().date()
    posts = bot.all_posts()
    upcoming = [posts[d] for d in sorted(posts) if d >= today.isoformat()][: int(bot.cfg["tervezett_napok"])]
    history = sorted((p for p in list(posts.values()) + bot.extra_posts() if p.get("allapot") == "kikuldve"),
                     key=lambda p: p.get("kikuldve") or "", reverse=True)[:9]
    cfg = bot.cfg
    n_cur = sum(1 for c in bot.cars.values() if not c.get("auto"))
    n_auto = len(bot.cars) - n_cur
    hist_html = "".join(tile(p, cfg, repo, branch, today.isoformat(), True) for p in history) \
        or '<div style="color:var(--muted)">Még nincs kiküldött poszt.</div>'
    actions_url = f"https://github.com/{repo}/actions/workflows/discord-carbot.yml" if repo else "#"
    page = f"""<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Autós érdekességek – posztterv</title>
<style>{CSS}</style></head><body>
<header><h1>🏁 Autós érdekességek <span>/</span> posztterv</h1>
<div class="info"><span>Küldés: naponta {e(cfg['kuldes_ideje'])} ({e(cfg['idozona'])})
<a href="{e(issue_link(repo, 'carbot: alap-ido ' + cfg['kuldes_ideje']))}" target="_blank">módosítás</a></span>
<span>{'⏸️ SZÜNETEL' if cfg['szunet'] else ('Csak jóváhagyott posztok' if cfg['csak_jovahagyott'] else 'Automatikus küldés')}</span>
<span>Autók: {n_cur} válogatott + {n_auto} automatikusan talált</span>
<a href="{actions_url}" target="_blank">Futások ↗</a></div></header>
<h2>Következő {e(cfg['tervezett_napok'])} nap</h2>
<div class="grid">{''.join(tile(p, cfg, repo, branch, today.isoformat(), post_time=bot.post_time(p)) for p in upcoming)}</div>
<h2>Felülbírálás</h2>
<details open><summary>Hogyan?</summary><p><b>Gombokkal:</b> a 🚀 🎲 🖼️ ⏰ ⏭️ gombok egy előre kitöltött GitHub issue-t nyitnak meg –
csak a zöld <b>Create</b> gombra kell kattintani. A bot pár percen belül végrehajtja, visszaírja az eredményt és lezárja az issue-t.
A ⏰ Időpontnál a címben írd át az ÓÓ:PP részt. Egy jövőbeli nap posztját a 🚀 azonnal kiküldi, és arra a napra új autót tesz a tervbe.</p>
<p><b>Kézzel:</b> a ✏️ Szerkesztés gombbal a nap fájlja nyílik meg; írd át, majd <b>Commit changes</b>.</p><ul>
<li><code>"szoveg"</code>: a leírás (max. {e(cfg['max_karakter'])} karakter)</li>
<li><code>"allapot": "kihagy"</code>: aznap nem posztol · <code>"jovahagyott"</code>: jóváhagyva</li>
<li><code>"muvelet": "masik-auto"</code>: új autót sorsol · <code>"uj-kepek"</code>: következő 3 kép · <code>"kuldes-most"</code>: azonnal kiküldi</li>
<li><code>"kuldes_ideje": "18:30"</code>: csak erre a napra más időpont (üresen az alapértelmezett)</li>
<li><code>"auto_id"</code>: konkrét autó az autólistából · <code>"kepek"</code>: saját kép URL-ek (max. 3)</li></ul></details>
<h2>Legutóbb kiküldött</h2><div class="grid">{hist_html}</div>
<footer>Képek: Wikimedia Commons (szabad licenc, szerzőjelöléssel a Discord-posztban). Frissítve: {e(bot.now().strftime('%Y-%m-%d %H:%M'))}</footer>
</body></html>"""
    os.makedirs(os.path.join(out_dir, "carbot"), exist_ok=True)
    with open(os.path.join(out_dir, "carbot", "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    index = os.path.join(out_dir, "index.html")
    if not os.path.exists(index):
        with open(index, "w", encoding="utf-8") as f:
            f.write('<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=carbot/">'
                    '<a href="carbot/">Autós érdekességek – posztterv</a>')
