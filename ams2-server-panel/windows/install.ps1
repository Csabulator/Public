<#
.SYNOPSIS
  Installs the AMS2 dedicated server and its web control panel on Windows.

.DESCRIPTION
  - installs Node.js LTS with winget if it is missing
  - downloads SteamCMD and installs/updates the AMS2 dedicated server (app 1338040)
  - copies the panel to -InstallDir and writes panel.json
  - opens the firewall for the panel and the three game ports
  - registers a scheduled task that starts the panel (and the server) at boot

  Run it from an elevated PowerShell window in this folder:
    Set-ExecutionPolicy -Scope Process Bypass
    .\install.ps1

  Remove everything except the installed files:
    .\install.ps1 -Uninstall

.EXAMPLE
  .\install.ps1 -ServerDir D:\AMS2-DS -Port 8090
#>
[CmdletBinding()]
param(
    [string]$InstallDir  = 'C:\AMS2-Panel',
    [string]$ServerDir   = 'C:\AMS2-DS',
    [string]$SteamCmdDir = 'C:\steamcmd',
    [int]$Port           = 8080,
    [switch]$SkipServerInstall,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'AMS2 Server Panel'
$GamePorts = 8766, 27015, 27016

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

# --- Admin check ---------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error 'Run this script from an elevated PowerShell window (Run as administrator).'
}

# --- Uninstall -----------------------------------------------------------------
if ($Uninstall) {
    Write-Step 'Removing scheduled task and firewall rules'
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName 'AMS2 *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Get-Process -Name DedicatedServerCmd -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Done. The files are still in $InstallDir and $ServerDir; delete them by hand if you no longer need them."
    return
}

# --- Node.js -------------------------------------------------------------------
Write-Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
$nodeOk = $false
if ($node) {
    $major = [int]((& node -v).TrimStart('v').Split('.')[0])
    $nodeOk = $major -ge 18
}
if (-not $nodeOk) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error 'Node.js 18+ is required. Install the LTS version from https://nodejs.org and run this script again.'
    }
    Write-Host 'Installing Node.js LTS with winget...'
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { Write-Error 'Node.js was installed but is not on PATH yet. Open a new PowerShell window and run the script again.' }
}
$nodeExe = $node.Source
Write-Host "Node.js: $nodeExe ($(& node -v))"

# --- Panel files ---------------------------------------------------------------
Write-Step "Copying the panel to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'panel.js'), (Join-Path $PSScriptRoot 'cfg.js') -Destination $InstallDir -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'public') -Destination $InstallDir -Recurse -Force

# --- SteamCMD and the dedicated server ----------------------------------------
$steamCmd = Join-Path $SteamCmdDir 'steamcmd.exe'
if (-not (Test-Path $steamCmd)) {
    Write-Step "Downloading SteamCMD to $SteamCmdDir"
    New-Item -ItemType Directory -Force -Path $SteamCmdDir | Out-Null
    $zip = Join-Path $env:TEMP 'steamcmd.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $SteamCmdDir -Force
    Remove-Item $zip
}

if (-not $SkipServerInstall) {
    Write-Step "Installing / updating the AMS2 dedicated server in $ServerDir (this can take a few minutes)"
    New-Item -ItemType Directory -Force -Path $ServerDir | Out-Null
    & $steamCmd +force_install_dir $ServerDir +login anonymous +app_update 1338040 validate +quit
    if (-not (Test-Path (Join-Path $ServerDir 'DedicatedServerCmd.exe'))) {
        Write-Warning 'DedicatedServerCmd.exe was not found after SteamCMD finished. Run the script again, or use the "Frissites / telepites" (update) button in the panel later.'
    }
}

# --- panel.json ----------------------------------------------------------------
$settingsFile = Join-Path $InstallDir 'panel.json'
$writeSettings = $true
if (Test-Path $settingsFile) {
    $answer = Read-Host 'panel.json already exists. Keep it? (Y/n)'
    if ($answer -notmatch '^[nN]') { $writeSettings = $false }
}
if ($writeSettings) {
    Write-Step 'Panel password'
    do {
        $pw1 = Read-Host 'Choose a password for the web panel' -AsSecureString
        $pw2 = Read-Host 'Type it again' -AsSecureString
        $p1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw1))
        $p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw2))
        if ($p1 -ne $p2) { Write-Host 'The two passwords differ, try again.' -ForegroundColor Yellow }
        elseif ($p1.Length -lt 6) { Write-Host 'Use at least 6 characters.' -ForegroundColor Yellow }
    } while ($p1 -ne $p2 -or $p1.Length -lt 6)

    $settings = [ordered]@{
        port                 = $Port
        bind                 = '0.0.0.0'
        password             = $p1          # hashed by the panel on first start
        serverDir            = $ServerDir
        serverExe            = 'DedicatedServerCmd.exe'
        launcher             = @()
        launchArgs           = @()
        postStop             = @()
        steamcmd             = $steamCmd
        steamAppId           = '1338040'
        forceWindowsPlatform = $false
        dataDir              = (Join-Path $InstallDir 'data')
        autoStart            = $true
        autoRestart          = $true
    }
    # WriteAllText writes UTF-8 without BOM, which Node reads fine.
    [IO.File]::WriteAllText($settingsFile, ($settings | ConvertTo-Json -Depth 3))
}

# --- Firewall ------------------------------------------------------------------
Write-Step 'Opening the firewall'
Get-NetFirewallRule -DisplayName 'AMS2 *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'AMS2 panel' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
foreach ($proto in 'TCP', 'UDP') {
    New-NetFirewallRule -DisplayName "AMS2 game ports $proto" -Direction Inbound -Protocol $proto -LocalPort $GamePorts -Action Allow -Profile Any | Out-Null
}

# --- Scheduled task ------------------------------------------------------------
Write-Step "Registering the '$TaskName' scheduled task"
$action    = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$InstallDir\panel.js`"" -WorkingDirectory $InstallDir
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$taskSet   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $taskSet -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 3
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object -First 1).IPAddress
Write-Host "`nReady. Open the panel at http://localhost:$Port" -ForegroundColor Green
if ($ip) { Write-Host "From another device on your network: http://${ip}:$Port" -ForegroundColor Green }
Write-Host "Forward ports $($GamePorts -join ', ') (TCP and UDP) on your router to this machine so players can join."
