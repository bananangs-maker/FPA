'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const getMarket = require('./market.cjs').createMarketService();
const cliPort = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (cliPort >= 0 ? process.argv[cliPort + 1] : 8080));
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const iconFiles = new Map([
  ['/favicon-v181.ico', {type:'image/x-icon',body:fs.readFileSync(path.join(__dirname,'favicon-v181.ico'))}],
  ['/favicon-v180.ico', {type:'image/x-icon',body:fs.readFileSync(path.join(__dirname,'favicon-v180.ico'))}],
  ['/fpa-icon-172.png', {type:'image/png',body:fs.readFileSync(path.join(__dirname,'fpa-icon-172.png'))}],
  ['/fpa-touch-172.png', {type:'image/png',body:fs.readFileSync(path.join(__dirname,'fpa-touch-172.png'))}],
  ['/safari-pinned-172.svg', {type:'image/svg+xml',body:fs.readFileSync(path.join(__dirname,'safari-pinned-172.svg'))}],
  ['/favicon-safari-162.ico', {type: 'image/x-icon', body: fs.readFileSync(path.join(__dirname, 'favicon-safari-162.ico'))}],
  ['/favicon.svg', {type: 'image/svg+xml', body: fs.readFileSync(path.join(__dirname, 'favicon.svg'))}]
,  ['/favicon.ico', {type: 'image/x-icon', body: fs.readFileSync(path.join(__dirname, 'favicon.ico'))}]
,  ['/favicon-16.png', {type: 'image/png', body: fs.readFileSync(path.join(__dirname, 'favicon-16.png'))}]
,  ['/favicon-32.png', {type: 'image/png', body: fs.readFileSync(path.join(__dirname, 'favicon-32.png'))}]
,  ['/apple-touch-icon.png', {type: 'image/png', body: fs.readFileSync(path.join(__dirname, 'apple-touch-icon.png'))}]
,  ['/favicon-512.png', {type: 'image/png', body: fs.readFileSync(path.join(__dirname, 'favicon-512.png'))}]
]);
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
  }
  if (pathname === '/api/market') {
    if (new URL(req.url, 'http://localhost').search || req.headers['content-length'] || req.headers['transfer-encoding']) { res.writeHead(400); return res.end('No input accepted'); }
    if (req.method === 'HEAD') { res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'}); return res.end(); }
    try { const data = await getMarket(); res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); return res.end(JSON.stringify(data)); }
    catch { res.writeHead(503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end(JSON.stringify({error:'시세를 조회할 수 없습니다.'})); }
  }
  const icon = iconFiles.get(pathname);
  if (icon) {
    res.writeHead(200, { 'Content-Type': icon.type, 'Cache-Control': 'no-cache, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff' });
    return res.end(req.method === 'HEAD' ? undefined : icon.body);
  }
  if (pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : 'Not found');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    'Cache-Control': 'no-cache',
    'Link': '</favicon-v181.ico>; rel="icon"; type="image/x-icon"',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(req.method === 'HEAD' ? undefined : html);
});
server.listen(port, '0.0.0.0', () => console.log('FPA is running on port ' + server.address().port));
function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
