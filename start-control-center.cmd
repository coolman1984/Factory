@echo off
rem Factory Control Center: starts the local server and opens it in your browser (this PC only).
pushd "%~dp0"
start "" http://127.0.0.1:8765/
node control\server.mjs
