# Docker (Synology NAS included)

One container holds the panel, Wine and SteamCMD. On the first start it
downloads the dedicated server into `./data/server`; later updates are done
with the **Frissítés / telepítés** button in the panel, so you never need to
rebuild the image for a server update.

## Any Docker host

```sh
git clone --depth 1 https://github.com/Csabulator/Public.git
cd Public/ams2-server-panel/docker
# set PANEL_PASSWORD in docker-compose.yml first
docker compose up -d --build
docker compose logs -f
```

Open `http://<host IP>:8080`. The first start takes a few minutes: SteamCMD downloads
the server (plan for at least 2 GB of free space) and Wine prepares itself once.

## Synology NAS (Container Manager)

1. Copy this `docker` folder to the NAS, for example to
   `/volume1/docker/ams2-server`.
2. Edit `docker-compose.yml` and set `PANEL_PASSWORD`.
3. **Container Manager → Project → Create**: choose the folder, select
   *Use existing docker-compose.yml*, and start the project. Container Manager
   builds the image from the `Dockerfile`.
4. Open `http://<NAS IP>:8080`.

The NAS needs an x86-64 CPU (Intel or AMD); ARM models cannot run Wine for
this server. If port 8080 is taken on the NAS, change `PANEL_PORT`.

## What is in `./data`

| Folder | Content |
|---|---|
| `server/` | the dedicated server and its `server.cfg` |
| `panel/` | `panel.json`, presets, cached track/car lists, `server.cfg` backups |
| `wine/` | the Wine prefix |
| `home/` | SteamCMD's cache |

## Password

`PANEL_PASSWORD` is only used on the very first start. After that, change the
password on the **Panel** tab. Forgot it? Stop the container, delete
`data/panel/panel.json`, set a new `PANEL_PASSWORD` and start again.

## Networking

`network_mode: host` opens the panel and the game ports directly on the host,
which is the simplest for a Steam game server. If you prefer port mappings,
remove that line and uncomment the `ports:` block. Forward 8766, 27015 and
27016 (TCP and UDP) on your router to the host.
