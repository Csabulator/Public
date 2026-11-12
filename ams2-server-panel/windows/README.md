# Windows

## Install

1. Download this folder (or the whole repository as ZIP) to the machine that
   will run the server.
2. Open **PowerShell as administrator** in this folder and run:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\install.ps1
   ```

3. Choose a password for the panel when asked.
4. Open `http://localhost:8080`, or `http://<this PC's IP>:8080` from another
   device on your network.

The script:

- installs Node.js LTS with `winget` if it is missing
- downloads SteamCMD to `C:\steamcmd` and installs the dedicated server to
  `C:\AMS2-DS`
- copies the panel to `C:\AMS2-Panel` and writes `panel.json` there
- opens the Windows firewall for the panel (8080/TCP) and the game ports
  (8766, 27015, 27016, TCP and UDP)
- registers the **AMS2 Server Panel** scheduled task, which starts the panel
  and the server at boot and restarts the panel if it stops

Other folders or port:

```powershell
.\install.ps1 -InstallDir D:\AMS2-Panel -ServerDir D:\AMS2-DS -SteamCmdDir D:\steamcmd -Port 8090
```

Run the script again to update the panel; it asks whether to keep the existing
`panel.json`.

## Router

Forward 8766, 27015 and 27016 (TCP and UDP) to this machine so players can
join from the internet. Do not forward the panel port unless you put it behind
HTTPS.

## Without installing

`start-panel.cmd` runs the panel from this folder in a console window. Create
`panel.json` next to it first:

```json
{ "password": "choose-one", "serverDir": "C:\\AMS2-DS", "steamcmd": "C:\\steamcmd\\steamcmd.exe" }
```

## Uninstall

```powershell
.\install.ps1 -Uninstall
```

This removes the scheduled task and firewall rules. Delete the folders by hand
if you no longer need them.
