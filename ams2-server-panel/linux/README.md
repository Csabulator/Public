# Linux (Debian / Ubuntu)

The AMS2 dedicated server only exists as a Windows program, so here it runs
through Wine with a virtual display (Xvfb). The install script sets this up.

## Install

```sh
git clone --depth 1 https://github.com/Csabulator/Public.git
cd Public/ams2-server-panel/linux
sudo ./install.sh
```

Choose a password for the panel when asked, then open
`http://<server IP>:8080`.

The script:

- installs Wine, Xvfb, the 32-bit libraries SteamCMD needs, and Node.js 22 if
  your Node.js is older than 18
- creates the `ams2` system user; the panel and the server run as this user
- downloads SteamCMD to `/opt/steamcmd` and installs the dedicated server to
  `/opt/ams2-ds`
- copies the panel to `/opt/ams2-panel` and writes `panel.json` there
- installs and starts the `ams2-panel` systemd service
- opens the ports in `ufw` if it is active

Other folders or port:

```sh
sudo PANEL_PORT=8090 SERVER_DIR=/srv/ams2-ds INSTALL_DIR=/srv/ams2-panel ./install.sh
```

Run the script again to update the panel; it asks whether to keep the existing
`panel.json`.

## Useful commands

```sh
systemctl status ams2-panel      # is it running?
journalctl -u ams2-panel -f      # panel output
sudo systemctl restart ams2-panel
```

Stopping the service also stops the dedicated server.

## Router

Forward 8766, 27015 and 27016 (TCP and UDP) to this machine.

## Uninstall

```sh
sudo ./install.sh --uninstall
```
