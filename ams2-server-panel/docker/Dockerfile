# AMS2 dedicated server + web panel in one container.
# The dedicated server is a Windows program, so it runs through Wine with a
# virtual display (Xvfb). The server itself is downloaded by SteamCMD on the
# first start into the /data volume, so updates do not need a new image.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN dpkg --add-architecture i386 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl tar nodejs xvfb xauth wine wine64 lib32gcc-s1 lib32stdc++6 \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/steamcmd \
 && curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar -xz -C /opt/steamcmd \
 && /opt/steamcmd/steamcmd.sh +quit || true

WORKDIR /app
COPY panel.js cfg.js ./
COPY public ./public

ENV PANEL_PORT=8080 \
    PANEL_SETTINGS=/data/panel/panel.json \
    PANEL_DATA=/data/panel \
    AMS2_DIR=/data/server \
    STEAMCMD=/opt/steamcmd/steamcmd.sh \
    AMS2_INSTALL_IF_MISSING=1 \
    WINEPREFIX=/data/wine \
    WINEDEBUG=-all \
    HOME=/data/home

VOLUME /data
EXPOSE 8080/tcp 8766/tcp 8766/udp 27015/tcp 27015/udp 27016/tcp 27016/udp

CMD ["sh", "-c", "mkdir -p /data/home /data/panel && exec node /app/panel.js"]
