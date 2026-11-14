@echo off
rem Real factory (true AutoCAD dimensions): Control Center on the real-factory database, port 8766 (this PC only).
pushd "%~dp0"
if not exist control\data\real-factory.db node control\real\import-site.mjs
start "" http://127.0.0.1:8766/#map
node control\server.mjs --port 8766 --db control\data\real-factory.db
