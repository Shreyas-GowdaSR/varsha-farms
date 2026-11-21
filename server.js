#!/usr/bin/env node
/*
 * VSSR Farms — tiny optional server (no dependencies, Node 18+).
 *
 *   node server.js                      # local preview on http://localhost:8080 (owner page works without password, localhost only)
 *   OWNER_PASSWORD=secret node server.js  # production on a VPS / any Node host with a persistent disk
 *
 * Serves the static site and lets the owner page save files to disk.
 * On static hosting (GitHub Pages, Netlify, Cloudflare Pages) this file is not used —
 * the owner page saves to GitHub instead.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const PASSWORD = process.env.OWNER_PASSWORD || '';
const MAX_BODY = 40 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};
const PRIVATE = /^(server\.js|package\.json|\.git|\.github|node_modules|README\.md)(\/|$)/;

function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
function authed(req) {
  if (!PASSWORD) return isLocal(req);
  const given = Buffer.from(String(req.headers['x-owner-password'] || ''));
  const want = Buffer.from(PASSWORD);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
// Only these places may be written by the owner page.
function writablePath(p) {
  if (typeof p !== 'string' || p.includes('\0') || p.includes('..') || p.startsWith('/')) return null;
  const ok = /^data\/(sheep|home)\.json$/.test(p) || /^media\/(sheep|home)\/[A-Za-z0-9._-]+$/.test(p);
  return ok ? path.join(ROOT, p) : null;
}
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function api(req, res, route) {
  if (route === 'ping') return send(res, 200, JSON.stringify({ vf: true, auth: !!PASSWORD }), 'application/json');
  if (req.method !== 'POST') return send(res, 405, 'POST only');
  if (!authed(req)) return send(res, 401, 'wrong password');
  if (route === 'login') return send(res, 200, 'ok');
  if (route === 'commit') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return send(res, 400, 'bad request'); }
    const files = Array.isArray(body.files) ? body.files : [];
    const deletes = Array.isArray(body.deletes) ? body.deletes : [];
    for (const f of files) if (!writablePath(f.path)) return send(res, 400, 'not allowed: ' + f.path);
    for (const f of files) {
      const dest = writablePath(f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, Buffer.from(String(f.base64 || ''), 'base64'));
      fs.renameSync(tmp, dest);
    }
    for (const p of deletes) {
      const dest = writablePath(p);
      if (dest && /^media\//.test(p)) fs.rm(dest, { force: true }, () => {});
    }
    return send(res, 200, 'ok');
  }
  send(res, 404, 'not found');
}

function serveFile(req, res, rel) {
  if (PRIVATE.test(rel)) return send(res, 404, 'not found');
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); return serveFile(req, res, path.relative(ROOT, file).split(path.sep).join('/')); }
    if (err) return fs.readFile(path.join(ROOT, '404.html'), (e, b) => send(res, 404, e ? 'not found' : b, 'text/html; charset=utf-8'));
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      // data + pages: always revalidate; media files never change name, so cache them long
      'Cache-Control': /^media\//.test(rel) ? 'public, max-age=604800' : 'no-cache',
      'Last-Modified': st.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff'
    };
    const since = Date.parse(req.headers['if-modified-since'] || '');
    if (!req.headers.range && since && Math.floor(st.mtimeMs / 1000) * 1000 <= since) { res.writeHead(304, headers); return res.end(); }
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const m = /^api\/(\w+)$/.exec(rel);
  if (m) return api(req, res, m[1]).catch((e) => send(res, 500, String(e.message || e)));
  if (rel === '') rel = 'index.html';
  serveFile(req, res, rel);
}).listen(PORT, () => {
  console.log(`VSSR Farms on http://localhost:${PORT}` + (PASSWORD ? ' (owner password set)' : ' (owner page: localhost only, no password)'));
});
