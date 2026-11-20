/* Varsha Farms — owner page.
 * Two ways to save, picked automatically:
 *  - "server": the site is served by server.js (Node). Files are written to disk. Password = OWNER_PASSWORD.
 *  - "github": the site is static (GitHub Pages / Netlify / Cloudflare Pages). Changes are committed to the
 *    GitHub repo with a token that is stored encrypted (AES-GCM, key from the owner password) in data/owner.json.
 */
(function () {
  'use strict';
  var VF = window.VF, t = VF.t, el = VF.el, $ = VF.$, $$ = VF.$$;

  var MAX_VIDEO_MB = 20;
  var PBKDF2_ITER = 250000;
  var SESSION_KEY = 'vf-owner';

  var backend = null;        // { mode, read(path), commit(files, deletes, msg), where }
  var sheep = [];
  var home = { hero: null, gallery: [] };
  var homeDirty = false;
  var preview = {};          // path -> object URL for files uploaded this session
  var queue = Promise.resolve();

  /* ---------------- small utils ---------------- */
  function show(id) {
    ['scrLoading', 'scrSetup', 'scrLogin', 'scrApp'].forEach(function (s) { $('#' + s).hidden = s !== id; });
  }
  function toast(msg, isErr) {
    var n = $('#toast');
    n.textContent = msg; n.hidden = false; n.classList.toggle('is-error', !!isErr);
    clearTimeout(toast._t); toast._t = setTimeout(function () { n.hidden = true; }, isErr ? 7000 : 4000);
  }
  function src(p) { return preview[p] || p; }
  function stamp() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheep'; }
  function b64FromBytes(bytes) {
    var bin = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function bytesFromB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function textToB64(text) { return b64FromBytes(new TextEncoder().encode(text)); }
  function blobToB64(blob) {
    return blob.arrayBuffer().then(function (buf) { return b64FromBytes(new Uint8Array(buf)); });
  }
  function json(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
  function enqueue(fn) { var p = queue.then(fn); queue = p.catch(function () {}); return p; }

  /* ---------------- crypto (GitHub token at rest) ---------------- */
  function deriveKey(pw, salt, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function encryptToken(token, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt, PBKDF2_ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(token));
    }).then(function (ct) {
      return { v: 1, iter: PBKDF2_ITER, salt: b64FromBytes(salt), iv: b64FromBytes(iv), data: b64FromBytes(new Uint8Array(ct)) };
    });
  }
  function decryptToken(box, pw) {
    return deriveKey(pw, bytesFromB64(box.salt), box.iter || PBKDF2_ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromB64(box.iv) }, key, bytesFromB64(box.data));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }

  /* ---------------- backends ---------------- */
  function ServerBackend(password) {
    function headers() { return { 'Content-Type': 'application/json', 'X-Owner-Password': password || '' }; }
    return {
      mode: 'server',
      where: location.host,
      liveNow: true,
      read: function (path) {
        return fetch(path + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error(path + ' ' + r.status); return r.text();
        });
      },
      commit: function (files, deletes) {
        return Promise.all(files.map(function (f) {
          return (f.blob ? blobToB64(f.blob) : Promise.resolve(textToB64(f.text))).then(function (b) { return { path: f.path, base64: b }; });
        })).then(function (list) {
          return fetch('api/commit', { method: 'POST', headers: headers(), body: JSON.stringify({ files: list, deletes: deletes || [] }) });
        }).then(function (r) {
          if (r.status === 401) throw new Error(t('o.wrong'));
          if (!r.ok) return r.text().then(function (x) { throw new Error(x || r.status); });
        });
      }
    };
  }

  function GitHubBackend(cfg, token) {
    var API = 'https://api.github.com/repos/' + cfg.repo;
    function gh(path, opts) {
      opts = opts || {};
      var h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (opts.raw) h.Accept = 'application/vnd.github.raw+json';
      if (opts.body) h['Content-Type'] = 'application/json';
      return fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (x) {
            var m = x; try { m = JSON.parse(x).message; } catch (e) {}
            var err = new Error('GitHub ' + r.status + ': ' + m); err.status = r.status; throw err;
          });
          return opts.raw ? r.text() : r.json();
        });
    }
    return {
      mode: 'github',
      where: 'GitHub · ' + cfg.repo + ' (' + cfg.branch + ')',
      liveNow: false,
      check: function () { return gh(''); },
      read: function (path) { return gh('/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch), { raw: true }); },
      commit: function (files, deletes, message) {
        var headSha, baseTree;
        return gh('/git/ref/heads/' + encodeURIComponent(cfg.branch)).then(function (ref) {
          headSha = ref.object.sha;
          return gh('/git/commits/' + headSha);
        }).then(function (c) {
          baseTree = c.tree.sha;
          // upload blobs one by one (keeps memory low on phones)
          var entries = [];
          return files.reduce(function (p, f) {
            return p.then(function () {
              return (f.blob ? blobToB64(f.blob) : Promise.resolve(textToB64(f.text)));
            }).then(function (b64) {
              return gh('/git/blobs', { method: 'POST', body: { content: b64, encoding: 'base64' } });
            }).then(function (blob) { entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha }); });
          }, Promise.resolve()).then(function () { return entries; });
        }).then(function (entries) {
          var dels = (deletes || []).map(function (p) { return { path: p, mode: '100644', type: 'blob', sha: null }; });
          return gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: entries.concat(dels) } })
            .catch(function (e) {
              // a file we tried to delete may already be gone — retry without deletions
              if (dels.length && e.status === 422) return gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: entries } });
              throw e;
            });
        }).then(function (tree) {
          return gh('/git/commits', { method: 'POST', body: { message: message || 'Update from owner page', tree: tree.sha, parents: [headSha] } });
        }).then(function (commit) {
          return gh('/git/refs/heads/' + encodeURIComponent(cfg.branch), { method: 'PATCH', body: { sha: commit.sha } });
        });
      }
    };
  }

  function save(files, deletes, message) {
    return enqueue(function () {
      toast(t('o.saving'));
      return backend.commit(files, deletes, message).then(function () {
        toast(t('o.saved') + (backend.liveNow ? '' : ' ' + t('o.liveSoon')));
      });
    }).catch(function (e) {
      toast(t('o.error', { msg: e.message }), true);
      throw e;
    });
  }

  /* ---------------- media processing ---------------- */
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('image')); };
      img.src = url;
    });
  }
  function canvasBlob(c, q) {
    return new Promise(function (r) { c.toBlob(r, 'image/webp', q); }).then(function (b) {
      if (b && b.type === 'image/webp') return { blob: b, ext: 'webp' };
      return new Promise(function (r) { c.toBlob(r, 'image/jpeg', q); }).then(function (j) { return { blob: j, ext: 'jpg' }; });
    });
  }
  function drawScaled(source, w, h, max) {
    var s = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c;
  }
  function processImage(file, base, maxFull) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      return Promise.all([canvasBlob(drawScaled(img, w, h, maxFull), 0.78), canvasBlob(drawScaled(img, w, h, 600), 0.72)]);
    }).then(function (r) {
      var full = base + '.' + r[0].ext, thumb = base + '-sm.' + r[1].ext;
      preview[full] = URL.createObjectURL(r[0].blob);
      preview[thumb] = URL.createObjectURL(r[1].blob);
      return { item: { type: 'image', src: full, thumb: thumb }, files: [{ path: full, blob: r[0].blob }, { path: thumb, blob: r[1].blob }] };
    });
  }
  function processVideo(file, base) {
    var mb = file.size / 1048576;
    if (mb > MAX_VIDEO_MB) return Promise.reject(new Error(t('o.videoTooBig', { mb: mb.toFixed(1), max: MAX_VIDEO_MB })));
    var ext = /webm/.test(file.type) ? 'webm' : /quicktime/.test(file.type) ? 'mov' : 'mp4';
    var path = base + '.' + ext, url = URL.createObjectURL(file);
    preview[path] = url;
    var item = { type: 'video', src: path };
    var files = [{ path: path, blob: file }];
    return new Promise(function (res) {
      var v = document.createElement('video'), done = false;
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      var timer = setTimeout(function () { finish(); }, 8000);
      function finish(blobRes) {
        if (done) return; done = true; clearTimeout(timer);
        if (blobRes && blobRes.blob) {
          var pp = base + '-poster.' + blobRes.ext;
          preview[pp] = URL.createObjectURL(blobRes.blob);
          item.poster = pp; files.push({ path: pp, blob: blobRes.blob });
        }
        res({ item: item, files: files });
      }
      v.onloadeddata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = function () {
        try { canvasBlob(drawScaled(v, v.videoWidth, v.videoHeight, 900), 0.72).then(finish, function () { finish(); }); }
        catch (e) { finish(); }
      };
      v.onerror = function () { finish(); };
    });
  }
  function processFiles(fileList, dir, prefix, maxFull) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve([]);
    toast(t('o.compressing'));
    var out = [];
    return files.reduce(function (p, f) {
      return p.then(function () {
        var base = dir + '/' + prefix + '-' + stamp();
        var job = /^video\//.test(f.type) ? processVideo(f, base) : processImage(f, base, maxFull);
        return job.then(function (r) { out.push(r); }, function (e) { toast(e.message, true); });
      });
    }, Promise.resolve()).then(function () { $('#toast').hidden = true; return out; });
  }
  // Accepts youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID
  function youtubeItem(url) {
    var m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(String(url || '').trim());
    if (!m) return null;
    return { type: 'youtube', id: m[1], poster: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' };
  }
  function wireYoutube(inputSel, btnSel, onItem) {
    var input = $(inputSel);
    function add() {
      var item = youtubeItem(input.value);
      if (!item) { toast(t('o.badLink'), true); input.focus(); return; }
      onItem(item); input.value = '';
    }
    $(btnSel).addEventListener('click', add);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  }
  function mediaPaths(m) { return [m.src, m.thumb, m.poster].filter(Boolean); }
  function allReferenced(exceptSheepId) {
    var set = {};
    sheep.forEach(function (s) { (s.media || []).forEach(function (m) { mediaPaths(m).forEach(function (p) { set[p] = 1; }); }); });
    if (home.hero) mediaPaths(home.hero).forEach(function (p) { set[p] = 1; });
    (home.gallery || []).forEach(function (m) { mediaPaths(m).forEach(function (p) { set[p] = 1; }); });
    return set;
  }
  function unreferenced(paths) {
    var refs = allReferenced();
    return paths.filter(function (p) { return p && !refs[p] && /^media\//.test(p); });
  }

  /* ---------------- media list UI (shared by editor + gallery) ---------------- */
  function mediaList(ul, items, onChange, extra) {
    ul.innerHTML = '';
    items.forEach(function (m, i) {
      var thumb = m.type === 'image' ? (m.thumb || m.src) : m.poster;
      var li = el('li', {}, [
        thumb ? el('img', { src: src(thumb), alt: '' }) : el('div', { class: 'o-ph' }),
        el('div', {}, [el('div', { class: 'o-kind', text: m.type === 'youtube' ? 'YouTube' : m.type === 'video' ? 'Video' : 'Photo ' + (i + 1) }), el('div', { class: 'o-mbtns' })])
      ]);
      var btns = li.querySelector('.o-mbtns');
      function b(label, fn, dis) { var x = el('button', { type: 'button', text: label }); x.disabled = !!dis; x.addEventListener('click', fn); btns.appendChild(x); }
      b(t('o.up'), function () { items.splice(i - 1, 0, items.splice(i, 1)[0]); onChange(); }, i === 0);
      b(t('o.down'), function () { items.splice(i + 1, 0, items.splice(i, 1)[0]); onChange(); }, i === items.length - 1);
      b(t('o.remove'), function () { items.splice(i, 1); onChange(); });
      if (extra) extra(m, b);
      ul.appendChild(li);
    });
  }

  /* ---------------- sheep list ---------------- */
  function renderSheepList() {
    var ul = $('#sheepList'); ul.innerHTML = '';
    if (!sheep.length) { ul.appendChild(el('li', { text: t('o.empty') })); return; }
    sheep.forEach(function (s) {
      var first = (s.media || [])[0];
      var thumb = first ? (first.type === 'image' ? (first.thumb || first.src) : first.poster) : null;
      var li = el('li', { class: 'o-row' }, [
        thumb ? el('img', { src: src(thumb), alt: '' }) : el('div', { class: 'o-ph' }),
        el('div', {}, [
          el('div', { class: 'o-id', text: s.id }),
          el('p', { class: 'o-meta', text: [s.gender ? t('gender.' + s.gender) : '', VF.weight(s.weightKg), VF.price(s.price)].filter(Boolean).join(' · ') })
        ]),
        el('div', { class: 'o-status', role: 'group', 'aria-label': t('f.status') }),
        el('div', { class: 'o-acts' })
      ]);
      var st = li.querySelector('.o-status');
      ['available', 'booked', 'sold'].forEach(function (k) {
        var b = el('button', { type: 'button', text: t('status.' + k), 'aria-pressed': String(s.status === k) });
        b.addEventListener('click', function () {
          if (s.status === k) return;
          var old = s.status; s.status = k; renderSheepList();
          saveSheepJSON('Mark ' + s.id + ' ' + k).catch(function () { s.status = old; renderSheepList(); });
        });
        st.appendChild(b);
      });
      var acts = li.querySelector('.o-acts');
      var e = el('button', { type: 'button', class: 'btn', text: t('o.edit') });
      e.addEventListener('click', function () { openEditor(s); });
      var d = el('button', { type: 'button', class: 'btn btn-danger', text: t('o.delete') });
      d.addEventListener('click', function () { deleteSheep(s); });
      acts.appendChild(e); acts.appendChild(d);
      ul.appendChild(li);
    });
  }

  function saveSheepJSON(message, extraFiles, deletes) {
    var files = (extraFiles || []).concat([{ path: 'data/sheep.json', text: json({ sheep: sheep }) }]);
    return save(files, deletes || [], message);
  }

  function deleteSheep(s) {
    if (!confirm(t('o.confirmDelete', { id: s.id }))) return;
    var idx = sheep.indexOf(s);
    sheep.splice(idx, 1);
    var dels = unreferenced([].concat.apply([], (s.media || []).map(mediaPaths)));
    renderSheepList();
    saveSheepJSON('Delete ' + s.id, [], dels).catch(function () { sheep.splice(idx, 0, s); renderSheepList(); });
  }

  /* ---------------- editor ---------------- */
  var editing = null, draftMedia = [], newFiles = [];

  function openEditor(s) {
    editing = s || null;
    var f = $('#sheepForm');
    f.reset();
    $('#sheepErr').textContent = '';
    var d = s || { id: nextId(), breed: 'amingad', gender: 'ewe', status: 'available', purpose: [], media: [] };
    f.tagId.value = d.id || '';
    f.breed.value = d.breed || 'amingad';
    setRadio(f, 'gender', d.gender); setRadio(f, 'status', d.status || 'available');
    f.ageY.value = d.ageMonths != null && d.ageMonths !== '' ? Math.floor(d.ageMonths / 12) : '';
    f.ageM.value = d.ageMonths != null && d.ageMonths !== '' ? d.ageMonths % 12 : '';
    f.teeth.value = d.teeth || '';
    f.weightKg.value = d.weightKg != null ? d.weightKg : '';
    f.weighedOn.value = d.weighedOn || '';
    f.price.value = d.price != null ? d.price : '';
    $$('input[name=purpose]', f).forEach(function (c) { c.checked = (d.purpose || []).indexOf(c.value) > -1; });
    f.note.value = d.note || '';
    draftMedia = (d.media || []).slice();
    newFiles = [];
    renderDraftMedia();
    $('#editor').showModal();
    f.tagId.focus();
  }
  function setRadio(f, name, v) { $$('input[name=' + name + ']', f).forEach(function (r) { r.checked = r.value === v; }); }
  function nextId() {
    var max = 0;
    sheep.forEach(function (s) { var m = /(\d+)$/.exec(s.id); if (m) max = Math.max(max, +m[1]); });
    return 'VF-' + String(max + 1).padStart(3, '0');
  }
  function renderDraftMedia() { mediaList($('#sheepMedia'), draftMedia, renderDraftMedia); }

  function numOrNull(v) { return v === '' || v == null || isNaN(v) ? null : Number(v); }

  function submitEditor(ev) {
    ev.preventDefault();
    var f = $('#sheepForm'), err = $('#sheepErr');
    var id = f.tagId.value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!id) { err.textContent = t('o.idNeeded'); f.tagId.focus(); return; }
    if (sheep.some(function (s) { return s.id === id && s !== editing; })) { err.textContent = t('o.idTaken'); f.tagId.focus(); return; }
    var y = numOrNull(f.ageY.value), m = numOrNull(f.ageM.value);
    var rec = {
      id: id,
      breed: f.breed.value,
      gender: (f.querySelector('input[name=gender]:checked') || {}).value || '',
      ageMonths: y == null && m == null ? null : (y || 0) * 12 + (m || 0),
      teeth: f.teeth.value,
      weightKg: numOrNull(f.weightKg.value),
      weighedOn: f.weighedOn.value || '',
      price: numOrNull(f.price.value),
      purpose: $$('input[name=purpose]:checked', f).map(function (c) { return c.value; }),
      status: (f.querySelector('input[name=status]:checked') || {}).value || 'available',
      note: f.note.value.trim(),
      media: draftMedia.slice(),
      added: editing ? (editing.added || today()) : today()
    };
    // only upload files that are still in the list
    var keep = {}; rec.media.forEach(function (x) { mediaPaths(x).forEach(function (p) { keep[p] = 1; }); });
    var files = newFiles.filter(function (x) { return keep[x.path]; });
    var before = sheep.slice(), oldRec = editing;
    if (editing) sheep[sheep.indexOf(editing)] = rec; else sheep.unshift(rec);
    var removed = oldRec ? [].concat.apply([], (oldRec.media || []).map(mediaPaths)) : [];
    var dels = unreferenced(removed);
    $('#saveSheep').disabled = true;
    saveSheepJSON((oldRec ? 'Update ' : 'Add ') + id, files, dels).then(function () {
      $('#editor').close(); renderSheepList();
    }, function (e) {
      sheep = before; err.textContent = t('o.error', { msg: e.message });
    }).then(function () { $('#saveSheep').disabled = false; });
  }
  function today() {
    var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------------- home media ---------------- */
  var homeFiles = [], homeRemoved = [];
  function markHomeDirty() { homeDirty = true; $('#saveHome').disabled = false; renderHome(); }
  function renderHome() {
    var hb = $('#heroBox'); hb.innerHTML = '';
    if (home.hero) {
      var p = home.hero.type === 'video' ? home.hero.poster : (home.hero.thumb || home.hero.src);
      if (p) hb.appendChild(el('img', { src: src(p), alt: '' }));
      else hb.appendChild(el('p', { text: home.hero.src }));
    }
    mediaList($('#galleryList'), home.gallery, function () { trackRemovals(); markHomeDirty(); }, function (m, b) {
      if (home.hero !== m && m.type !== 'youtube') b(t('o.makeHero'), function () { if (home.hero && home.gallery.indexOf(home.hero) < 0) homeRemoved.push(home.hero); home.hero = m; markHomeDirty(); });
    });
  }
  var lastGallerySnapshot = [];
  function trackRemovals() {
    lastGallerySnapshot.forEach(function (m) { if (home.gallery.indexOf(m) < 0 && m !== home.hero) homeRemoved.push(m); });
    lastGallerySnapshot = home.gallery.slice();
  }
  function saveHome() {
    var keep = {};
    [home.hero].concat(home.gallery).filter(Boolean).forEach(function (m) { mediaPaths(m).forEach(function (p) { keep[p] = 1; }); });
    var files = homeFiles.filter(function (x) { return keep[x.path]; });
    var dels = unreferenced([].concat.apply([], homeRemoved.map(mediaPaths)));
    files.push({ path: 'data/home.json', text: json(home) });
    $('#saveHome').disabled = true;
    save(files, dels, 'Update home page photos').then(function () {
      homeDirty = false; homeFiles = []; homeRemoved = [];
    }, function () { $('#saveHome').disabled = false; });
  }

  /* ---------------- boot ---------------- */
  function loadData() {
    return Promise.all([
      backend.read('data/sheep.json').then(function (x) { sheep = JSON.parse(x).sheep || []; }),
      backend.read('data/home.json').then(function (x) { home = JSON.parse(x); home.gallery = home.gallery || []; })
    ]).then(function () {
      lastGallerySnapshot = home.gallery.slice();
      show('scrApp'); renderSheepList(); renderHome(); renderSettings();
    });
  }

  function renderSettings() {
    $('#whereText').textContent = t('o.where', { where: backend.where });
    $('#pwForm').hidden = backend.mode !== 'github';
  }

  var ownerCfg = null, serverInfo = null;

  function startGitHub(token) {
    backend = GitHubBackend(ownerCfg, token);
    return loadData();
  }

  function remember(secret) { try { sessionStorage.setItem(SESSION_KEY, secret); } catch (e) {} }
  function recall() { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } }

  function wire() {
    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = this.pw.value, errEl = $('#loginErr'); errEl.textContent = '';
      var btn = this.querySelector('button'); btn.disabled = true;
      var p;
      if (serverInfo) {
        p = fetch('api/login', { method: 'POST', headers: { 'X-Owner-Password': pw } }).then(function (r) {
          if (!r.ok) throw new Error('pw');
          backend = ServerBackend(pw); remember(pw); return loadData();
        });
      } else {
        p = decryptToken(ownerCfg, pw).then(function (token) { remember(token); return startGitHub(token); },
          function () { throw new Error('pw'); });
      }
      p.catch(function (e) { errEl.textContent = e.message === 'pw' ? t('o.wrong') : t('o.error', { msg: e.message }); })
        .then(function () { btn.disabled = false; });
    });

    $('#setupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this, errEl = $('#setupErr'); errEl.textContent = '';
      if (f.pw1.value.length < 8) { errEl.textContent = t('o.short'); return; }
      if (f.pw1.value !== f.pw2.value) { errEl.textContent = t('o.mismatch'); return; }
      var cfg = { repo: f.repo.value.trim().replace(/^https:\/\/github.com\//, '').replace(/\.git$/, ''), branch: f.branch.value.trim() || 'main' };
      var token = f.token.value.trim();
      var gb = GitHubBackend(cfg, token);
      gb.check().then(function () { return encryptToken(token, f.pw1.value); }).then(function (box) {
        ownerCfg = Object.assign({}, cfg, box);
        backend = gb;
        return save([{ path: 'data/owner.json', text: json(ownerCfg) }], [], 'Owner page setup');
      }).then(function () { remember(token); return loadData(); })
        .catch(function (e2) { errEl.textContent = t('o.error', { msg: e2.message }); });
    });

    $('#pwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = this, errEl = $('#pwErr'); errEl.textContent = '';
      if (f.pw1.value.length < 8) { errEl.textContent = t('o.short'); return; }
      if (f.pw1.value !== f.pw2.value) { errEl.textContent = t('o.mismatch'); return; }
      encryptToken(recall(), f.pw1.value).then(function (box) {
        var cfg = Object.assign({ repo: ownerCfg.repo, branch: ownerCfg.branch }, box);
        return save([{ path: 'data/owner.json', text: json(cfg) }], [], 'Change owner password').then(function () { ownerCfg = cfg; f.reset(); toast(t('o.passwordChanged')); });
      }).catch(function (e2) { errEl.textContent = t('o.error', { msg: e2.message }); });
    });

    $$('.o-tabs [data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.o-tabs [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        ['sheep', 'home', 'settings'].forEach(function (k) { $('#tab-' + k).hidden = k !== b.getAttribute('data-tab'); });
      });
    });

    $('#addSheep').addEventListener('click', function () { openEditor(null); });
    $('#cancelEdit').addEventListener('click', function () { $('#editor').close(); });
    $('#sheepForm').addEventListener('submit', submitEditor);
    $('#today').addEventListener('click', function () { $('#sheepForm').weighedOn.value = today(); });
    $('#sheepFile').addEventListener('change', function () {
      var input = this, id = $('#sheepForm').tagId.value || 'sheep';
      processFiles(input.files, 'media/sheep', slug(id), 1400).then(function (rs) {
        rs.forEach(function (r) { draftMedia.push(r.item); newFiles = newFiles.concat(r.files); });
        renderDraftMedia(); input.value = '';
      });
    });

    $('#heroFile').addEventListener('change', function () {
      var input = this;
      processFiles(input.files, 'media/home', 'banner', 1600).then(function (rs) {
        if (!rs.length) return;
        if (home.hero && home.gallery.indexOf(home.hero) < 0) homeRemoved.push(home.hero);
        home.hero = rs[0].item; homeFiles = homeFiles.concat(rs[0].files); input.value = ''; markHomeDirty();
      });
    });
    $('#galleryFile').addEventListener('change', function () {
      var input = this;
      processFiles(input.files, 'media/home', 'farm', 1600).then(function (rs) {
        rs.forEach(function (r) { home.gallery.push(r.item); homeFiles = homeFiles.concat(r.files); });
        lastGallerySnapshot = home.gallery.slice(); input.value = ''; if (rs.length) markHomeDirty();
      });
    });
    $('#saveHome').addEventListener('click', saveHome);
    wireYoutube('#sheepYt', '#addSheepYt', function (item) { draftMedia.push(item); renderDraftMedia(); });
    wireYoutube('#galleryYt', '#addGalleryYt', function (item) { home.gallery.push(item); lastGallerySnapshot = home.gallery.slice(); markHomeDirty(); });

    $('#logout').addEventListener('click', function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
      location.reload();
    });
    window.addEventListener('beforeunload', function (e) { if (homeDirty) { e.preventDefault(); e.returnValue = ''; } });

    document.addEventListener('vf:lang', function () {
      if (!$('#scrApp').hidden) { renderSheepList(); renderHome(); renderSettings(); }
    });
  }

  function boot() {
    wire();
    fetch('api/ping', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (info) {
        if (info && info.vf) {
          serverInfo = info;
          if (!info.auth) { backend = ServerBackend(''); return loadData(); }
          var saved = recall();
          if (saved) { backend = ServerBackend(saved); return loadData().catch(function () { show('scrLogin'); }); }
          show('scrLogin'); return;
        }
        return fetch('data/owner.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
          .then(function (cfg) {
            if (!cfg || !cfg.data) { show('scrSetup'); return; }
            ownerCfg = cfg;
            var tok = recall();
            if (tok) return startGitHub(tok).catch(function () { show('scrLogin'); });
            show('scrLogin');
          });
      }).catch(function (e) { show('scrLogin'); toast(e.message, true); });
  }

  VF.ready.then(boot);
})();
