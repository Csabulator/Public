# discord-carbot 🏁

Egy Discord-bot autószimulátoros közösségeknek. Naponta kitesz egy autós érdekességet: 1–3 fotót
(Wikimedia Commons) és egy legfeljebb 180 karakteres leírást (motor, LE, Nm, versenymúlt).
Az egészet a **GitHub Actions** futtatja, nem kell hozzá szerver. A következő 9 nap terve egy
**GitHub Pages** oldalon látszik 3×3-as csempén.

*English summary: a GitHub-Actions-only Discord bot that posts one motorsport car fact per day
(photos from Wikimedia Commons, ≤180-char Hungarian text). The 9-day plan is a folder of JSON
files you edit on GitHub. The plan view is published to GitHub Pages, and new cars are found
weekly on Wikipedia.*

## Hogyan működik

| Mikor | Mit csinál |
|---|---|
| 15 percenként | megtervezi a következő 9 napot, feldolgozza a kézi módosításokat, és a beállított időpont után kiküldi a napi posztot |
| ha megnyomsz egy gombot a Pages oldalon | pár percen belül végrehajtja (küldés most, másik autó, más képek, időpont, kihagyás) |
| minden hétfőn | új autókat keres a Wikipédián (B csoport, WRC, Le Mans, Can-Am, F1, túraautók, GT-k, szuperautók, hot hatchek, muscle carok…) |
| ha módosítasz valamit | pár percen belül feldolgozza, és frissül a Pages oldal |

- **Autók:** 286 kézzel válogatott autó van (versenyautók és érdekes utcai sport-, szuper- és hiperautók) a `cars/kuralt.json`-ban, a hetente talált újak a `cars/auto.json`-ba kerülnek.
  Amíg van még ki nem posztolt autó, nem ismétel. A talált autók a válogatottak közé keverednek (`auto_arany`, alapból 30%),
  a csempén „automatikus – ellenőrizd” jelzést kapnak, és 9 nappal a kiküldés előtt már látszanak.
- **Terv:** minden nap egy fájl: `plan/ÉÉÉÉ-HH-NN.json`. Sorszámot, dátumot, autót, szöveget, képeket és állapotot tartalmaz.

## Beállítás (egyszeri)

1. **Discord webhook:** a csatornán ⚙️ *Csatorna szerkesztése → Integrációk → Webhookok → Új webhook → Webhook URL másolása*.
   (Nem kell botot regisztrálni: a posztok a `config.json`-ban megadott `bot_nev` néven jelennek meg.)
2. **Secret:** a repóban *Settings → Secrets and variables → Actions → New repository secret*:
   - `DISCORD_WEBHOOK_URL`: a webhook URL-je
   - *(opcionális)* `ANTHROPIC_API_KEY`: ha megvan, az újonnan talált autók leírását a Claude írja meg magyarul
     a Wikipédia adataiból. Nélküle a leírás csak a műszaki adatokból áll össze, sablon alapján.
3. **Pages:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
4. **Első futás:** *Actions → discord-carbot → Run workflow*. Ezután az oldal itt érhető el:
   `https://csabulator.github.io/Public/carbot/`

*Bot tokennel is működik webhook helyett: `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` secret, a botnak legyen
Send Messages és Embed Links joga. Ha a bot még sosem csatlakozott a Discord gatewayhez, a Discord elutasíthatja az üzenetet.
Ezért a webhook az ajánlott.*

## Felülbírálás

### Gombokkal (ajánlott)

A Pages oldalon minden csempén ott vannak ezek a gombok:

| Gomb | Mit csinál |
|---|---|
| 🚀 Küldés most | azonnal kiküldi. Ha jövőbeli nap posztja volt, arra a napra új autó kerül, a mai poszt pedig ugyanúgy kimegy a maga idejében |
| 🎲 Másik autó | új autót sorsol arra a napra |
| 🖼️ Más képek | a következő 3 fotó |
| ⏰ Időpont | csak arra a napra más küldési idő (a címben írd át az ÓÓ:PP részt) |
| ⏭️ Kihagy / ↩️ Visszaállít | aznap nincs poszt / mégis legyen |
| ✏️ Szerkesztés | a nap fájlja a GitHub szerkesztőjében (szöveg, képek kézzel) |

A gombok egy **előre kitöltött GitHub issue-t** nyitnak meg (pl. `carbot: kuldes-most 2026-11-15`), csak a zöld **Create** gombra kell kattintani.
A bot pár percen belül végrehajtja, az issue-ba visszaírja az eredményt, és lezárja. Biztonság: csak a repó tulajdonosától fogad el ilyen parancsot,
másokéra el sem indul. **Az alapértelmezett küldési időt** a fejlécben lévő „módosítás” linkkel lehet átállítani (`carbot: alap-ido 18:30`).

### Fájl szerkesztésével

A ✏️ Szerkesztés gomb megnyitja a nap fájlját. Írd át, majd **Commit changes**:

| Mező | Mire jó |
|---|---|
| `"szoveg"` | a leírás (max. 180 karakter, különben nem küldi ki, és figyelmeztet) |
| `"allapot"` | `"tervezett"` · `"jovahagyott"` · `"kihagy"` (aznap nincs poszt) |
| `"kuldes_ideje"` | pl. `"18:30"` – csak erre a napra; üresen a `config.json` szerinti idő |
| `"muvelet"` | `"masik-auto"` új autót sorsol · `"uj-kepek"` a következő 3 kép · `"kuldes-most"` azonnal kiküldi |
| `"auto_id"` | konkrét autó id-ja a `cars/*.json`-ból (a szöveg és a képek is cserélődnek) |
| `"kepek"` | saját kép URL-ek, max. 3 (`["https://…", "https://…"]`) |

**Általános beállítások** a `config.json`-ban: `kuldes_ideje` (pl. `"09:00"`), `csak_jovahagyott` (csak a jóváhagyott
posztok mennek ki), `szunet`, `auto_arany`, `bot_nev`, `bot_avatar`, és a felfedezés kategóriái.

## Jó tudni

- **Időzítés:** a GitHub az ütemezett futásokat terhelés idején késlelteti vagy **ki is hagyja**. Ezért a bot 15 percenként
  kéri a futást, és a poszt az időpont utáni első lefutó körrel megy ki. Ha ez sem elég megbízható, lásd lent a külső időzítőt.
- **Hibák:** ha a küldés nem sikerül, a csempe pirosan jelzi, és óránként még legfeljebb háromszor újrapróbálja.
- **Nyilvánosság:** a repó nyilvános, így a terv és a Pages oldal is mindenki számára látható. A webhook URL secretként rejtve marad.
- **Pontosság:** az adatokat gondosan válogattuk, de ha valami nem stimmel, a `cars/kuralt.json` szabadon javítható.
- **Inaktivitás:** a GitHub 60 nap inaktivitás után leállítja az ütemezett futásokat egy nyilvános repóban.
  A bot naponta commitol, ez elvileg aktívan tartja. Ha mégis leállna, az Actions fülön egy kattintással újraindítható.

## Külső időzítő (opcionális, a pontos időzítéshez)

Ha a GitHub saját ütemezője kihagy futásokat, egy külső gép is „megbökheti” a botot. Ilyenkor azonnal lefut.

1. **Token:** GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   Repository access: *Only select repositories → Public*. Permissions → Repository → **Contents: Read and write**. Lejárat tetszőleges.
2. **Synology NAS:** *Vezérlőpult → Feladatütemező → Létrehozás → Ütemezett feladat → Felhasználó által megadott parancsfájl*.
   Ütemezés: naponta, ismétlés 15 percenként. Parancs (a `TOKEN` helyére a tokent):
   ```sh
   curl -s -X POST -H "Authorization: Bearer TOKEN" -H "Accept: application/vnd.github+json" \
     https://api.github.com/repos/Csabulator/Public/dispatches -d '{"event_type":"carbot-tick"}'
   ```
   (Ugyanez működik a cron-job.org-ról is.) A token csak ehhez az egy repóhoz fér hozzá. Ha kiszivárogna, a GitHubon visszavonható.

## Fejlesztés

Csak a Python 3.11+ standard könyvtárát használja.

```sh
cd discord-carbot
python -m unittest discover tests     # offline tesztek
python -m carbot run                  # terv + posztolás (DISCORD_WEBHOOK_URL kell)
CARBOT_COMMAND="carbot: kihagy 2026-11-20" python -m carbot run   # ugyanaz, mint a gomb
python -m carbot site _site           # Pages oldal
python -m carbot discover 5           # 5 új autó keresése
python -m carbot check                # adatellenőrzés
```

Licenc: MIT
