@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 🎵 正在启动 Claude Music...
start "" http://localhost:4567
node server.js
pause
