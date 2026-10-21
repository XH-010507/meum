@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "project.config.json" copy "project.config.example.json" "project.config.json" >nul
if not exist "miniprogram\config\local.js" copy "miniprogram\config\local.example.js" "miniprogram\config\local.js" >nul
echo 已准备本机配置，已有文件不会覆盖。
echo 请在微信开发者工具导入本文件夹并填写自己的 AppID。
echo 请在 miniprogram\config\local.js 填写自己的云环境 ID。
pause
