"""CLI:  python -m carbot run | site OUT | discover [N] | check

run      – plan the next days, process manual edits, post if due
site     – build the GitHub Pages view into OUT
discover – look for new cars on Wikipedia (cars/auto.json)
check    – validate car lists and plan files (non-zero exit on error)
"""
import os
import sys

from . import discord_post, discover, site
from .core import Bot


def gh_output(**kv):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in kv.items():
                f.write(f"{k}={v}\n")


def cmd_run(bot: Bot, force_day=None, force_action=None) -> int:
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
            break
        try:
            res = discord_post.send(post, car, bot.cfg)
            post.update(allapot="kikuldve", muvelet="", hiba=None, **res)
            print(f"Posted #{post['sorszam']} {car['nev']}")
        except Exception as e:
            post.update(allapot="hiba", muvelet="", hiba=str(e)[:300],
                        probalkozas=post.get("probalkozas", 0) + 1)
            print(f"::error::Posting failed: {e}")
            rc = 1
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
