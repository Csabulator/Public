"""CLI:  python -m carbot run | site OUT | discover [N] | check

run      – plan the next days, process manual edits, post if due
site     – build the GitHub Pages view into OUT
discover – look for new cars on Wikipedia (cars/auto.json)
check    – validate car lists and plan files (non-zero exit on error)
"""
import json
import os
import re
import sys

from . import discord_post, discover, site
from .core import Bot, dump_json

RESULT_FILE = os.environ.get("CARBOT_RESULT_FILE", "")
COMMANDS = {
    "kuldes-most": "kiküldés most", "masik-auto": "másik autó", "uj-kepek": "új képek",
    "kihagy": "kihagyás", "jovahagy": "jóváhagyás", "visszaallit": "visszaállítás",
    "ido": "küldési idő", "alap-ido": "alapértelmezett küldési idő",
}


def gh_output(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def report(msg: str):
    print(msg)
    if RESULT_FILE:
        with open(RESULT_FILE, "a", encoding="utf-8") as f:
            f.write(msg + "\n")


def apply_command(bot: Bot, text: str) -> bool:
    """'carbot: <muvelet> [ÉÉÉÉ-HH-NN] [OO:PP]' – from an issue title (Pages buttons)."""
    m = re.match(r"\s*carbot\s*:\s*([a-z-]+)\s*(\d{4}-\d{2}-\d{2})?\s*(\d{1,2}:\d{2})?", text or "", re.I)
    if not m or m.group(1).lower() not in COMMANDS:
        report(f"❌ Ismeretlen parancs: `{text}`. Lehetőségek: {', '.join(COMMANDS)}")
        return False
    cmd, day, hhmm = m.group(1).lower(), m.group(2), m.group(3)
    if hhmm:
        hhmm = hhmm.zfill(5)
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", hhmm):
            report(f"❌ Hibás időpont: {hhmm} (ÓÓ:PP kell)")
            return False
    if cmd == "alap-ido":
        if not hhmm:
            report("❌ Add meg az időpontot, pl. `carbot: alap-ido 18:30`")
            return False
        path = os.path.join(bot.root, "config.json")
        cfg = json.load(open(path, encoding="utf-8"))
        cfg["kuldes_ideje"] = hhmm
        dump_json(path, cfg)
        bot.cfg["kuldes_ideje"] = hhmm
        report(f"✅ Az alapértelmezett küldési idő mostantól {hhmm}.")
        return True
    p = bot.all_posts().get(day or "")
    if not p:
        report(f"❌ Nincs ilyen nap a tervben: {day}")
        return False
    if p.get("allapot") == "kikuldve" and cmd != "kuldes-most":
        report(f"❌ A(z) {day} poszt már ki lett küldve, ezen nem változtatok.")
        return False
    if cmd in ("kuldes-most", "masik-auto", "uj-kepek"):
        p["muvelet"] = cmd
    elif cmd == "kihagy":
        p["allapot"] = "kihagy"
    elif cmd == "jovahagy":
        p["allapot"] = "jovahagyott"
    elif cmd == "visszaallit":
        p["allapot"] = "tervezett"
    elif cmd == "ido":
        p["kuldes_ideje"] = hhmm or ""
    bot.save(p)
    extra = f" ({hhmm or 'alapértelmezett'})" if cmd == "ido" else ""
    report(f"✅ {COMMANDS[cmd].capitalize()}{extra}: #{p['sorszam']} {p['auto_nev']} – {day}")
    return True


def cmd_run(bot: Bot, force_day=None, force_action=None) -> int:
    command = os.environ.get("CARBOT_COMMAND")
    if command and not apply_command(bot, command):
        gh_output(changed="false")
        return 1
    if force_day and force_action:          # from the manual "Run workflow" form
        p = bot.all_posts().get(force_day)
        if not p:
            print(f"::error::Nincs ilyen nap a tervben: {force_day}")
            return 1
        p["muvelet"] = force_action
        bot.save(p)
    changed = bot.refresh()
    print(f"Plan refreshed, changed: {changed or '-'}")
    rc = 0
    for post in bot.due():
        car = bot.cars.get(post["auto_id"])
        if not car or not bot.sendable(post):
            print(f"::warning::#{post['sorszam']} nem küldhető: {post.get('figyelmeztetes')}")
            post["muvelet"] = ""
            bot.save(post)
            continue
        if not discord_post.configured():
            print("::warning::Nincs DISCORD_WEBHOOK_URL (vagy bot token) secret – nem posztolok.")
            report("⚠️ Nincs DISCORD_WEBHOOK_URL secret, ezért nem posztoltam.")
            break
        try:
            res = discord_post.send(post, car, bot.cfg)
            post.update(allapot="kikuldve", muvelet="", hiba=None, **res)
            report(f"🚀 Kiküldve: #{post['sorszam']} {car['nev']}" + (f" – {res['link']}" if res.get("link") else ""))
            today = bot.now().date()
            if post["nap"] > today.isoformat():
                bot.save(post)
                bot.archive_early(post, today)
                report(f"ℹ️ A(z) {post['nap']} napra új autó került a tervbe.")
                changed.append(post["nap"])
                continue
        except Exception as e:
            post.update(allapot="hiba", muvelet="", hiba=str(e)[:300],
                        probalkozas=post.get("probalkozas", 0) + 1)
            # not a failing exit code: the error state must still be committed (retry counter)
            print(f"::error::Posting failed: {e}")
            report(f"❌ Nem sikerült kiküldeni: {str(e)[:200]}")
        bot.save(post)
        changed.append(post["nap"])
    gh_output(changed="true" if changed else "false")
    return rc


def cmd_check(bot: Bot) -> int:
    errors = []
    ids = set()
    for c in bot.cars.values():
        if c["id"] in ids:
            errors.append(f"duplicate id {c['id']}")
        ids.add(c["id"])
        for k in ("id", "nev", "szoveg"):
            if not c.get(k):
                errors.append(f"{c.get('id')}: missing {k}")
        if len(c.get("szoveg", "")) > bot.max:
            errors.append(f"{c['id']}: text {len(c['szoveg'])} > {bot.max}")
    for p in bot.all_posts().values():
        if p.get("figyelmeztetes"):
            print(f"::warning::{p['nap']}: {p['figyelmeztetes']}")
    for e in errors:
        print(f"::error::{e}")
    print(f"{len(bot.cars)} cars, {len(errors)} errors")
    return 1 if errors else 0


def main(argv):
    bot = Bot()
    cmd = argv[0] if argv else "run"
    if cmd == "run":
        return cmd_run(bot, os.environ.get("CARBOT_DAY") or None, os.environ.get("CARBOT_ACTION") or None)
    if cmd == "site":
        site.build(bot, argv[1] if len(argv) > 1 else "_site")
        return 0
    if cmd == "discover":
        added = discover.run(bot, int(argv[1]) if len(argv) > 1 else None)
        print(f"Added {len(added)} cars")
        gh_output(changed="true" if added else "false")
        return 0
    if cmd == "check":
        return cmd_check(bot)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
