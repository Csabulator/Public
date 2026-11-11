"""Sending to Discord. Preferred: a channel webhook (DISCORD_WEBHOOK_URL).
Alternative: bot token + channel id (DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID).
Embeds that share the same `url` are shown by Discord as one gallery (max 4)."""
import os
from datetime import datetime, timezone
from urllib.parse import quote_plus

from . import net

COLOR = 0xE10600
API = "https://discord.com/api/v10"


def car_link(car: dict) -> str:
    return car.get("link") or f"https://en.wikipedia.org/w/index.php?search={quote_plus(car['nev'])}"


def build_embeds(post: dict, car: dict) -> list[dict]:
    link = car_link(car)
    images = [i for i in post.get("kepek", []) if i.get("url")][:3]
    credits = "; ".join(dict.fromkeys(i["szerzo"] for i in images if i.get("szerzo")))
    footer = f"Autós érdekesség #{post['sorszam']}"
    if credits:
        footer += f" • Kép: {credits}"
        if any("commons.wikimedia.org" in (i.get("oldal") or "") for i in images):
            footer += " – Wikimedia Commons"
    main = {"title": f"🏁 {car['nev']}", "url": link, "description": post["szoveg"],
            "color": COLOR, "footer": {"text": footer[:2048]}}
    if images:
        main["image"] = {"url": images[0]["url"]}
    return [main] + [{"url": link, "image": {"url": i["url"]}} for i in images[1:]]


def configured() -> bool:
    return bool(os.environ.get("DISCORD_WEBHOOK_URL") or
                (os.environ.get("DISCORD_BOT_TOKEN") and os.environ.get("DISCORD_CHANNEL_ID")))


def send(post: dict, car: dict, cfg: dict) -> dict:
    """Returns {'uzenet_id', 'link'}; raises on failure."""
    embeds = build_embeds(post, car)
    hook = os.environ.get("DISCORD_WEBHOOK_URL")
    if hook:
        payload = {"embeds": embeds, "allowed_mentions": {"parse": []}}
        if cfg.get("bot_nev"):
            payload["username"] = cfg["bot_nev"]
        if cfg.get("bot_avatar"):
            payload["avatar_url"] = cfg["bot_avatar"]
        msg = net.http(hook.split("?")[0], params={"wait": "true"}, data=payload, method="POST")
        try:
            guild = net.http(hook.split("?")[0]).get("guild_id")
        except Exception:
            guild = None
    else:
        token, ch = os.environ["DISCORD_BOT_TOKEN"], os.environ["DISCORD_CHANNEL_ID"]
        msg = net.http(f"{API}/channels/{ch}/messages", method="POST",
                       data={"embeds": embeds, "allowed_mentions": {"parse": []}},
                       headers={"Authorization": f"Bot {token}"})
        guild = None
        try:
            guild = net.http(f"{API}/channels/{ch}", headers={"Authorization": f"Bot {token}"}).get("guild_id")
        except Exception:
            pass
    link = f"https://discord.com/channels/{guild}/{msg['channel_id']}/{msg['id']}" if guild else None
    return {"uzenet_id": msg["id"], "link": link,
            "kikuldve": datetime.now(timezone.utc).isoformat(timespec="seconds")}
