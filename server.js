// Run: DRIVER_KEY=yourSecret node server.js   (Node 18+, no dependencies)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const DRIVER_KEY = process.env.DRIVER_KEY || 'change-me';
const STALE_MS = 30000; // vehicle disappears if no update for 30s
const vehicles = {};    // id -> {id,type,name,lat,lng,route,t}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

function body(req) {
  return new Promise((res, rej) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch (e) { rej(e); } });
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/api/vehicles') {
    const now = Date.now();
    for (const id in vehicles) if (now - vehicles[id].t > STALE_MS) delete vehicles[id];
    return send(res, 200, Object.values(vehicles).map(({ t, ...v }) => v));
  }

  if (req.method === 'POST' && (url.pathname === '/api/update' || url.pathname === '/api/stop')) {
    try {
      const b = await body(req);
      if (req.headers['x-key'] !== DRIVER_KEY) return send(res, 401, { error: 'bad key' });
      if (!b.id) return send(res, 400, { error: 'id required' });
      if (url.pathname === '/api/stop') { delete vehicles[b.id]; return send(res, 200, { ok: true }); }
      if (!['fire', 'ambulance'].includes(b.type) || typeof b.lat !== 'number' || typeof b.lng !== 'number')
        return send(res, 400, { error: 'invalid data' });
      const prev = vehicles[b.id] || {};
      vehicles[b.id] = {
        id: String(b.id).slice(0, 40), type: b.type, name: String(b.name || b.id).slice(0, 40),
        lat: b.lat, lng: b.lng,
        route: Array.isArray(b.route) ? b.route : (prev.route || []),
        t: Date.now()
      };
      return send(res, 200, { ok: true });
    } catch (e) { return send(res, 400, { error: 'bad json' }); }
  }

  // static files from ./public
  let f = url.pathname === '/' ? '/index.html' : url.pathname;
  f = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Make Way running on port ' + PORT));
