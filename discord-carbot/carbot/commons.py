"""Free-licensed car photos from Wikimedia Commons, with author + licence."""
import html
import re
import unicodedata
from urllib.parse import unquote

from . import net

API = "https://commons.wikimedia.org/w/api.php"

# file names that usually don't show the whole car
BAD_WORDS = re.compile(
    r"logo|emblem|badge|interior|dashboard|engine|motor\b|wheel|seat|steering|"
    r"scale model|modell|toy|lego|diecast|die-cast|stamp|brochure|poster|drawing|"
    r"diagram|tail ?light|headlight|detail|plaque|cockpit|\bmap\b",
    re.I,
)

_cache: dict[str, list] = {}


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def search(query: str) -> list[dict]:
    if query in _cache:
        return _cache[query]
    data = net.http(API, params={
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": f"{query} filetype:bitmap",
        "gsrnamespace": "6", "gsrlimit": "30",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1600", "iiextmetadatafilter": "Artist|LicenseShortName",
    })
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 999))
    out = []
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        w, h = info.get("width", 0), info.get("height", 0)
        if w < 1000 or w < h or BAD_WORDS.search(p.get("title", "")):
            continue
        meta = info.get("extmetadata") or {}
        artist = strip_html((meta.get("Artist") or {}).get("value", ""))[:60] or "ismeretlen"
        lic = strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
        out.append({
            "url": info.get("thumburl") or info.get("url"),
            "oldal": info.get("descriptionurl"),
            "szerzo": f"{artist} ({lic})" if lic else artist,
        })
    _cache[query] = out
    return out


def _tokens(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", s)


def rank(name: str, results: list[dict]) -> list[dict]:
    """Prefer files whose name contains the model words of the car name.
    Brand (first word) and words in parentheses count less."""
    main = re.sub(r"\([^)]*\)", " ", name)
    weights = {}
    for i, t in enumerate(_tokens(main)):
        weights.setdefault(t, 0.25 if i == 0 else 1.0)
    for t in _tokens(" ".join(re.findall(r"\(([^)]*)\)", name))):
        weights.setdefault(t, 0.5)

    def score(r):
        title = set(_tokens(unquote(r.get("oldal") or r["url"]).rsplit("/", 1)[-1]))
        return sum(w for t, w in weights.items() if t in title)

    scored = [(score(r), i, r) for i, r in enumerate(results)]
    scored.sort(key=lambda x: (-x[0], x[1]))
    good = [r for sc, _, r in scored if sc > 0.25]
    return good if len(good) >= 3 else [r for _, _, r in scored]


def for_car(car: dict, offset: int = 0, count: int = 3) -> tuple[list[dict], int]:
    """Up to `count` images and the offset actually used (wraps around)."""
    if car.get("kepek"):
        return [{"url": u, "oldal": u, "szerzo": ""} for u in car["kepek"][:count]], 0
    try:
        found = rank(car["nev"], search(car.get("kereses") or car["nev"]))
    except Exception as e:
        print(f"::warning::Commons search failed for {car['nev']}: {e}")
        return [], offset
    if not found:
        return [], 0
    if offset >= len(found):
        offset = 0
    return found[offset:offset + count], offset
