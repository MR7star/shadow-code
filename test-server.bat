@echo off
start /B node test-server.mjs
timeout /t 2 /nobreak
node -e "fetch('http://127.0.0.1:3002').then(r => console.log('OK:', r.status)).catch(e => console.error('Error:', e.message, e.cause?.code || ''))"