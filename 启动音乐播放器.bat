@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=C:\Users\chenqianxi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

echo Starting music player...
echo Open this URL after the server starts:
echo http://127.0.0.1:5173
echo Keep this window open while using the player.
echo.

"%NODE_EXE%" server.js

pause
