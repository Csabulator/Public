@echo off
rem Runs the panel in this window without installing it (portable mode).
rem Settings are read from panel.json next to panel.js.
cd /d "%~dp0"
node panel.js
pause
