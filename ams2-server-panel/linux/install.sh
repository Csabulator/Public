#!/usr/bin/env bash
# Installs the AMS2 dedicated server (Windows build, run through Wine) and its
# web control panel on Debian 12 / Ubuntu 22.04+ as a systemd service.
#
#   sudo ./install.sh              install or update
#   sudo ./install.sh --uninstall  remove the service (files stay)
#
# Settings can be changed with environment variables, for example:
#   sudo PANEL_PORT=8090 SERVER_DIR=/srv/ams2 ./install.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ams2-panel}"
SERVER_DIR="${SERVER_DIR:-/opt/ams2-ds}"
STEAMCMD_DIR="${STEAMCMD_DIR:-/opt/steamcmd}"
SVC_USER="${SVC_USER:-ams2}"
SVC_HOME="/var/lib/${SVC_USER}"
PANEL_PORT="${PANEL_PORT:-8080}"
SERVICE=ams2-panel
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run it with sudo: sudo $0"

if [[ "${1:-}" == "--uninstall" ]]; then
  step "Removing the ${SERVICE} service"
  systemctl disable --now "${SERVICE}" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE}.service"
  systemctl daemon-reload
  echo "Done. Files remain in ${INSTALL_DIR}, ${SERVER_DIR}, ${STEAMCMD_DIR} and ${SVC_HOME}."
  exit 0
fi

command -v apt-get >/dev/null || die "This script supports Debian and Ubuntu (apt). On other distributions use the Docker version."

# --- Packages ------------------------------------------------------------------
step "Installing packages (Wine, Xvfb, SteamCMD libraries)"
dpkg --add-architecture i386
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl tar xvfb xauth wine wine64 lib32gcc-s1 lib32stdc++6

node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//' || echo 0; }
if ! command -v node >/dev/null || [[ "$(node_major)" -lt 18 ]]; then
  step "Installing Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

# --- Service user --------------------------------------------------------------
if ! id "${SVC_USER}" >/dev/null 2>&1; then
  step "Creating the ${SVC_USER} user"
  useradd --system --home-dir "${SVC_HOME}" --create-home --shell /usr/sbin/nologin "${SVC_USER}"
fi
mkdir -p "${SVC_HOME}" "${SERVER_DIR}" "${STEAMCMD_DIR}"

# --- SteamCMD ------------------------------------------------------------------
if [[ ! -x "${STEAMCMD_DIR}/steamcmd.sh" ]]; then
  step "Downloading SteamCMD to ${STEAMCMD_DIR}"
  curl -fsSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar -xz -C "${STEAMCMD_DIR}"
fi
chown -R "${SVC_USER}:${SVC_USER}" "${SVC_HOME}" "${SERVER_DIR}" "${STEAMCMD_DIR}"

as_svc() { sudo -u "${SVC_USER}" env HOME="${SVC_HOME}" WINEPREFIX="${SVC_HOME}/wine" WINEDEBUG=-all "$@"; }

# --- Dedicated server ----------------------------------------------------------
step "Installing / updating the AMS2 dedicated server in ${SERVER_DIR} (this can take a few minutes)"
as_svc "${STEAMCMD_DIR}/steamcmd.sh" +@sSteamCmdForcePlatformType windows \
  +force_install_dir "${SERVER_DIR}" +login anonymous +app_update 1338040 validate +quit || true
[[ -f "${SERVER_DIR}/DedicatedServerCmd.exe" ]] || echo "WARNING: DedicatedServerCmd.exe not found yet - run the script again or use the update button in the panel."

if [[ ! -d "${SVC_HOME}/wine" ]]; then
  step "Preparing the Wine prefix (first time only)"
  as_svc xvfb-run -a wineboot -i >/dev/null 2>&1 || true
fi

# --- Panel ---------------------------------------------------------------------
step "Copying the panel to ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp -r "${HERE}/panel.js" "${HERE}/cfg.js" "${HERE}/public" "${INSTALL_DIR}/"

SETTINGS="${INSTALL_DIR}/panel.json"
write_settings=1
if [[ -f "${SETTINGS}" ]]; then
  read -rp "panel.json already exists. Keep it? (Y/n) " keep
  [[ "${keep}" =~ ^[nN] ]] || write_settings=0
fi
if [[ ${write_settings} -eq 1 ]]; then
  while :; do
    read -rsp "Choose a password for the web panel: " pw1; echo
    read -rsp "Type it again: " pw2; echo
    [[ "${pw1}" == "${pw2}" ]] || { echo "The two passwords differ, try again."; continue; }
    [[ ${#pw1} -ge 6 ]] || { echo "Use at least 6 characters."; continue; }
    break
  done
  # The panel hashes the password on its first start and removes the plain text.
  PW="${pw1}" PANEL_PORT="${PANEL_PORT}" SERVER_DIR="${SERVER_DIR}" STEAMCMD_DIR="${STEAMCMD_DIR}" \
  INSTALL_DIR="${INSTALL_DIR}" SETTINGS="${SETTINGS}" node -e '
    const s = {
      port: Number(process.env.PANEL_PORT), bind: "0.0.0.0", password: process.env.PW,
      serverDir: process.env.SERVER_DIR, serverExe: "DedicatedServerCmd.exe",
      launcher: ["xvfb-run", "-a", "wine"], launchArgs: [], postStop: ["wineserver", "-k"],
      steamcmd: process.env.STEAMCMD_DIR + "/steamcmd.sh", steamAppId: "1338040", forceWindowsPlatform: true,
      dataDir: process.env.INSTALL_DIR + "/data", autoStart: true, autoRestart: true };
    require("fs").writeFileSync(process.env.SETTINGS, JSON.stringify(s, null, 2) + "\n");'
  chmod 600 "${SETTINGS}"
fi
chown -R "${SVC_USER}:${SVC_USER}" "${INSTALL_DIR}"

# --- systemd -------------------------------------------------------------------
step "Installing the ${SERVICE} systemd service"
sed -e "s|@USER@|${SVC_USER}|g" -e "s|@HOME@|${SVC_HOME}|g" -e "s|@DIR@|${INSTALL_DIR}|g" -e "s|@NODE@|$(command -v node)|g" \
  "${HERE}/ams2-panel.service" > "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload
systemctl enable "${SERVICE}"
systemctl restart "${SERVICE}"

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  step "Opening ports in ufw"
  ufw allow "${PANEL_PORT}/tcp"
  for p in 8766 27015 27016; do ufw allow "${p}"; done
fi

sleep 2
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
printf '\n\033[32mReady. Open the panel at http://%s:%s\033[0m\n' "${IP:-localhost}" "${PANEL_PORT}"
echo "Logs: journalctl -u ${SERVICE} -f"
echo "Forward ports 8766, 27015 and 27016 (TCP and UDP) on your router to this machine so players can join."
