@echo off
chcp 65001 >nul
cd /d "%~dp0"

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo 启动专利撰写助手...
start "" "dist\win-unpacked\专利撰写助手.exe"
