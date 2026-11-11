"""Small stdlib-only HTTP helper (no pip install needed on GitHub Actions)."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = os.environ.get(
    "CARBOT_USER_AGENT",
    "discord-carbot/1.0 (https://github.com/Csabulator/Public; community car-facts bot)",
)


class HttpError(RuntimeError):
    def __init__(self, status, body, url):
        super().__init__(f"HTTP {status} {url.split('?')[0]}: {body[:300]}")
        self.status = status
        self.body = body


def request(url, params=None, data=None, headers=None, method=None, retries=2, timeout=30):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    body = None
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    hdrs.update(headers or {})
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            if e.code == 429 or e.code >= 500:
                if attempt < retries:
                    wait = float(e.headers.get("Retry-After", 2 * (attempt + 1)))
                    time.sleep(min(wait, 30))
                    continue
            raise HttpError(e.code, text, url) from None
        except urllib.error.URLError:
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            raise


# swapped out in tests
http = request
