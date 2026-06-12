@echo off

chcp 65001 >nul

setlocal



cd /d "%~dp0"



echo ========================================

echo   专利撰写助手 - 安装包构建

echo ========================================



set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set CSC_IDENTITY_AUTO_DISCOVERY=false



echo [1/3] 安装依赖...

call npm install

if errorlevel 1 goto :fail



echo [2/3] 构建前端...

cd client

call npm install

call npm run build

cd ..

if errorlevel 1 goto :fail



echo [3/3] 打包 NSIS 安装程序（单 exe）...

call npm run build

if errorlevel 1 goto :fail



echo.

echo 构建完成！请分发以下单个安装包：

dir /b dist\*Setup*.exe 2>nul

echo.

echo 用户双击安装包即可完成安装与初始配置。

echo 开发调试如需免安装目录版，请执行: npm run build:dir

echo.

pause

exit /b 0



:fail

echo 构建失败，请检查上方错误信息。

pause

exit /b 1

