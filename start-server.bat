@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo   导航站本地服务器
echo ------------------------------------------
echo   启动后请用浏览器访问: http://localhost:8080
echo   关闭此窗口即停止服务
echo ==========================================
echo.
start "" http://localhost:8080
python -m http.server 8080
if errorlevel 1 (
  echo.
  echo [启动失败] 未找到 python 命令。
  echo 请先安装 Python，或改用其他本地服务器工具。
  pause
)
