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
| óránként | megtervezi a következő 9 napot, feldolgozza a kézi módosításokat, és a beállított időpont után kiküldi a napi posztot |
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

A Pages oldalon minden csempén van egy **✏️ Szerkesztés** gomb. Ez megnyitja a nap fájlját a GitHub szerkesztőjében.
Írd át, majd **Commit changes**:

| Mező | Mire jó |
|---|---|
| `"szoveg"` | a leírás (max. 180 karakter, különben nem küldi ki, és figyelmeztet) |
| `"allapot"` | `"tervezett"` · `"jovahagyott"` · `"kihagy"` (aznap nincs poszt) |
| `"muvelet"` | `"masik-auto"` új autót sorsol · `"uj-kepek"` a következő 3 kép · `"kuldes-most"` azonnal kiküldi |
| `"auto_id"` | konkrét autó id-ja a `cars/*.json`-ból (a szöveg és a képek is cserélődnek) |
| `"kepek"` | saját kép URL-ek, max. 3 (`["https://…", "https://…"]`) |

Ugyanezek a műveletek az *Actions → Run workflow* űrlapon is elérhetők (művelet + nap).

**Általános beállítások** a `config.json`-ban: `kuldes_ideje` (pl. `"09:00"`), `csak_jovahagyott` (csak a jóváhagyott
posztok mennek ki), `szunet`, `auto_arany`, `bot_nev`, `bot_avatar`, és a felfedezés kategóriái.

## Jó tudni

- **Időzítés:** a GitHub ütemezett futásai csúszhatnak (jellemzően pár perc, csúcsidőben akár egy óra is lehet).
  A poszt az időpont utáni első óránkénti futással megy ki, 09:00-ra állítva tehát kb. 09:20 körül.
- **Hibák:** ha a küldés nem sikerül, a csempe pirosan jelzi, és óránként még legfeljebb háromszor újrapróbálja.
- **Nyilvánosság:** a repó nyilvános, így a terv és a Pages oldal is mindenki számára látható. A webhook URL secretként rejtve marad.
- **Pontosság:** az adatokat gondosan válogattuk, de ha valami nem stimmel, a `cars/kuralt.json` szabadon javítható.
- **Inaktivitás:** a GitHub 60 nap inaktivitás után leállítja az ütemezett futásokat egy nyilvános repóban.
  A bot naponta commitol, ez elvileg aktívan tartja. Ha mégis leállna, az Actions fülön egy kattintással újraindítható.

## Fejlesztés

Csak a Python 3.11+ standard könyvtárát használja.

```sh
cd discord-carbot
python -m unittest discover tests     # offline tesztek
python -m carbot run                  # terv + posztolás (DISCORD_WEBHOOK_URL kell)
python -m carbot site _site           # Pages oldal
python -m carbot discover 5           # 5 új autó keresése
python -m carbot check                # adatellenőrzés
```

Licenc: MIT
