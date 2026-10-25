import http from 'node:http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.listen(3002, '0.0.0.0', () => {
  console.log('Test server listening on 0.0.0.0:3002');
  console.log('Server address:', server.address());
});