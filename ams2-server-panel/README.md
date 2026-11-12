# ams2-server-panel

A web control panel for the **Automobilista 2 dedicated server**. It replaces
the built-in web tool with a clear interface, so you can:

- see whether the server runs, which track is loaded and who is on it
- start, stop and restart the server, and update it with SteamCMD
- pick track, class and car by name from drop-down lists instead of numeric IDs
- set grid, session lengths, damage, tyre wear, fuel, penalties, weather and the
  race rules as checkboxes instead of one big number
- send the setup to the **next race** without a restart, or save it into
  `server.cfg`
- save setups as presets ("Stock Car Interlagos", "GT3 Spa"…) and load them
  with one click
- kick or ban players and send chat messages
- turn the Lua addons (rotation, MOTD, stats) on and off
- edit `server.cfg` directly with a syntax check and automatic backups
- follow the server log live

The interface is in English and works on PC and phone. Date and time formats
can be set on the **Panel** tab.

> **Status:** the panel is tested against a simulated dedicated server.
> Reports from real servers are welcome: open an issue with what you saw.

## Pick your platform

| Folder | For | How it runs |
|---|---|---|
| [`windows/`](windows/) | Windows 10/11 or Windows Server | Scheduled task at boot, server runs natively |
| [`linux/`](linux/) | Debian 12, Ubuntu 22.04 / 24.04 | systemd service, server runs through Wine |
| [`docker/`](docker/) | Any Docker host, Synology NAS included | One container with Wine, server is downloaded on the first start |

The three folders contain the same panel (`panel.js`, `cfg.js`, `public/`);
only the install files differ. The panel needs Node.js 18 or newer and no npm
packages. The install scripts set everything up, including the dedicated
server itself (Steam app 1338040, anonymous login).

The AMS2 dedicated server is a Windows program. On Linux and in Docker it runs
through Wine with a virtual display (Xvfb), the same way the community
hosting images run it.

## Why the server "did not react"

Two settings in the stock `server.cfg` decide whether anything sent to the
server takes effect:

- `enableHttpApi : false` turns off the HTTP API, so nothing can talk to the
  running server.
- `controlGameSetup : false` leaves the setup to the host player. Track, car and
  session settings sent through the API are then ignored.

The panel shows a warning while either is off. A third pitfall: `server.cfg`
is only read when the server starts, so changes saved into the file need a
restart. Use **Send to next race** to change the next race without
one.

## What changed compared to the stock config

[`server.cfg.example`](server.cfg.example) is the cleaned starting config the
panel writes on a fresh install.

**Changed**

- `enableHttpApi` and `controlGameSetup` are `true` (see above).
- `maxPlayerCount` is 32 instead of 64. The game does not support sessions
  larger than 32.
- `Flags` is 656104. The stock value 656106 also has bit 2,
  `FORCE_IDENTICAL_VEHICLES`, set, so everyone was forced into the same car,
  even though the comment beside the vehicle says it is not forced.
- `ServerControlsTrack` is 1, so the server, not the host, picks the track.

**Removed**

- the `"//" : "..."` dummy comment entry (real `//` comments work now)
- the notes about 32-bit clients (AMS2 is 64-bit only) and the duplicated line
  about `controlGameSetup`
- `httpApiExtraHeaders` with `Access-Control-Allow-Origin: *`: the panel runs
  on the same machine and does not need it, and it would let any web page read
  the API
- the empty `httpApiAccessLevels`, `httpApiAccessFilters`, `httpApiUsers` and
  `httpApiGroups` blocks: the built-in defaults already allow only this
  machine, which is what the panel uses
- `staticWebFiles`: only the built-in web tool used it

Everything else (ports, Lua addons, session attributes) stays. Unknown keys in
an existing `server.cfg`, such as black- and whitelists, are kept when the
panel saves the file.

## Security

- The panel asks for a password. It is stored as a salted scrypt hash.
- The dedicated server's own HTTP API stays on `127.0.0.1`; only the panel
  talks to it.
- The panel speaks plain HTTP. Use it on your home network, or put it behind a
  VPN or an HTTPS reverse proxy (Synology's built-in reverse proxy works) if
  you want to reach it from outside.

## License

MIT
