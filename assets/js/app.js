/* Varsha Farms — public pages. Plain JS, no dependencies. */
(function () {
  'use strict';

  var LANGS = ['en', 'hi', 'kn'];
  var VF = (window.VF = window.VF || {});
  var dict = {};
  var site = null;

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  VF.$ = $; VF.$$ = $$; VF.el = el; VF.getJSON = getJSON;

  /* ---------- language ---------- */
  function storedLang() {
    try { var l = localStorage.getItem('vf-lang'); if (LANGS.indexOf(l) > -1) return l; } catch (e) {}
    var nav = (navigator.language || 'en').slice(0, 2);
    return LANGS.indexOf(nav) > -1 ? nav : 'en';
  }
  VF.lang = storedLang();

  function t(key, vars) {
    var s = dict[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  VF.t = t;

  function applyDict() {
    document.documentElement.lang = VF.lang;
    $$('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $$('[data-i18n-attr]').forEach(function (n) {
      n.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':'); if (p.length === 2) n.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    var titleKey = document.body.getAttribute('data-title');
    if (titleKey && dict[titleKey]) document.title = dict[titleKey];
    $$('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === VF.lang)); });
  }

  function loadLang(lang) {
    return getJSON('i18n/' + lang + '.json').then(function (d) {
      dict = d; VF.lang = lang; applyDict();
      document.dispatchEvent(new CustomEvent('vf:lang'));
    });
  }
  VF.setLang = function (lang) {
    try { localStorage.setItem('vf-lang', lang); } catch (e) {}
    return loadLang(lang);
  };

  /* ---------- formatting ---------- */
  var locales = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };
  VF.price = function (n) {
    if (n == null || n === '' || isNaN(n)) return t('na');
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };
  VF.weight = function (n) {
    if (n == null || n === '' || isNaN(n)) return t('na');
    return t('unit.kg', { n: Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 }) });
  };
  VF.date = function (iso) {
    if (!iso) return t('na');
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return t('na');
    try {
      return new Intl.DateTimeFormat(locales[VF.lang], { day: 'numeric', month: 'short', year: 'numeric', numberingSystem: 'latn' }).format(d);
    } catch (e) { return iso; }
  };
  VF.age = function (months) {
    if (months == null || months === '' || isNaN(months)) return t('na');
    months = Number(months);
    var y = Math.floor(months / 12), m = months % 12, parts = [];
    if (y) parts.push(t('age.y', { n: y }));
    if (m || !y) parts.push(t('age.m', { n: m }));
    return parts.join(' ');
  };
  function opt(prefix, v) { return v ? t(prefix + '.' + v) : t('na'); }

  /* ---------- contacts ---------- */
  function primaryPhone() {
    if (!site) return { tel: '+919535194801', display: '+91 95351 94801' };
    return site.phones.filter(function (p) { return p.primary; })[0] || site.phones[0];
  }
  VF.waLink = function (text, phone) {
    var num = (phone || primaryPhone()).tel.replace(/\D/g, '');
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  };
  VF.telLink = function (phone) { return 'tel:' + (phone || primaryPhone()).tel; };

  function wireContacts() {
    $$('[data-call]').forEach(function (a) {
      var i = a.getAttribute('data-call'); var p = site && site.phones[i] ? site.phones[i] : primaryPhone();
      a.href = VF.telLink(p);
    });
    $$('[data-wa]').forEach(function (a) {
      var i = a.getAttribute('data-wa'); var p = site && site.phones[i] ? site.phones[i] : primaryPhone();
      a.href = VF.waLink(t('wa.general'), p);
      a.target = '_blank'; a.rel = 'noopener';
    });
    $$('[data-phone-text]').forEach(function (n) {
      var p = site && site.phones[n.getAttribute('data-phone-text')];
      if (p) { n.textContent = p.display; if (n.tagName === 'A') n.href = VF.telLink(p); }
    });
    $$('[data-map-link]').forEach(function (a) { if (site && site.map) a.href = site.map.link; });
  }

  /* ---------- icons (two small glyphs only: phone + WhatsApp) ---------- */
  var ICON = {
    call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06a6.7 6.7 0 0 1-3.3-2.9c-.25-.43.25-.4.71-1.33.08-.17.04-.31-.02-.43l-.76-1.83c-.2-.48-.4-.41-.56-.42h-.48a.92.92 0 0 0-.66.31 2.8 2.8 0 0 0-.87 2.07 4.8 4.8 0 0 0 1 2.56 11 11 0 0 0 4.2 3.7c1.56.68 2.18.73 2.96.62.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.15-1.18-.07-.1-.23-.16-.48-.28z"/></svg>'
  };
  VF.ICON = ICON;
  function btn(cls, href, icon, label, newTab) {
    var a = el('a', { class: 'btn ' + cls, href: href });
    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    a.innerHTML = icon;
    a.appendChild(el('span', { text: label }));
    return a;
  }

  /* ---------- sheep card (ear tag) ---------- */
  function mediaNode(m, alt, eager) {
    if (m.type === 'video') {
      return el('video', { src: m.src, poster: m.poster || null, controls: '', preload: 'none', playsinline: '', muted: '' });
    }
    return el('img', { src: m.thumb || m.src, alt: alt, loading: eager ? 'eager' : 'lazy', decoding: 'async', width: 600, height: 450 });
  }

  VF.tagCard = function (s, opts) {
    opts = opts || {};
    var card = el('article', { class: 'tag' + (s.status === 'sold' ? ' is-sold' : ''), id: s.id });
    card.appendChild(el('div', { class: 'tag-neck', 'aria-hidden': 'true' }));
    var body = el('div', { class: 'tag-body' });
    card.appendChild(body);

    var top = el('div', { class: 'tag-top' }, [
      el('h3', { class: 'tag-id', text: s.id }),
      s.status === 'available'
        ? el('span', { class: 'pill pill-available', text: t('status.available') })
        : el('span', { class: 'tag-farm', text: t('brand.name') })
    ]);
    body.appendChild(top);

    var media = el('div', { class: 'tag-media' });
    var items = (s.media || []);
    if (items.length) {
      var slides = el('div', { class: 'tag-slides', role: 'region', tabindex: '0', 'aria-label': t('card.photos', { id: s.id }) });
      items.forEach(function (m, i) { slides.appendChild(mediaNode(m, s.id + ' — ' + (i + 1), opts.eager && i === 0)); });
      media.appendChild(slides);
      if (items.length > 1) media.appendChild(el('span', { class: 'tag-count', text: '1 / ' + items.length }));
      slides.addEventListener('scroll', function () {
        var i = Math.round(slides.scrollLeft / slides.clientWidth) + 1;
        var c = media.querySelector('.tag-count'); if (c) c.textContent = i + ' / ' + items.length;
      }, { passive: true });
    } else {
      media.appendChild(el('div', { class: 'no-photo' }, [el('span', {}, [el('span', { class: 'big', 'aria-hidden': 'true', text: 'ಕುರಿ' }), t('media.noPhoto')])]));
    }
    if (s.status === 'sold' || s.status === 'booked') {
      media.appendChild(el('span', { class: 'stamp stamp-' + s.status, text: t('status.' + s.status) }));
    }
    body.appendChild(media);

    var facts = [
      ['f.breed', opt('breed', s.breed)],
      ['f.gender', opt('gender', s.gender)],
      ['f.age', VF.age(s.ageMonths)],
      ['f.teeth', opt('teeth', s.teeth)],
      ['f.weight', VF.weight(s.weightKg)],
      ['f.weighed', VF.date(s.weighedOn)]
    ];
    var dl = el('dl', { class: 'tag-facts' });
    facts.forEach(function (f) { dl.appendChild(el('dt', { text: t(f[0]) })); dl.appendChild(el('dd', { text: f[1] })); });
    body.appendChild(dl);

    body.appendChild(el('div', { class: 'tag-price' }, [
      el('span', { class: 'label', text: t('f.price') }),
      el('span', { class: 'amount', text: VF.price(s.price) })
    ]));

    if (s.purpose && s.purpose.length) {
      var ul = el('ul', { class: 'tag-purpose', 'aria-label': t('f.purpose') });
      s.purpose.forEach(function (p) { ul.appendChild(el('li', { text: t('purpose.' + p) })); });
      body.appendChild(ul);
    }
    if (s.note) body.appendChild(el('p', { class: 'tag-note', text: s.note }));

    var msg = t('wa.sheep', { id: s.id, weight: VF.weight(s.weightKg), price: VF.price(s.price) });
    body.appendChild(el('div', { class: 'tag-actions' }, [
      btn('btn-wa', VF.waLink(msg), ICON.wa, t('cta.whatsapp'), true),
      btn('btn-soil', VF.telLink(), ICON.call, t('cta.call'))
    ]));
    return card;
  };

  VF.miniTag = function (s) {
    var a = el('a', { class: 'mini-tag', href: 'explore.html#' + encodeURIComponent(s.id) });
    a.appendChild(el('div', { class: 'tag-neck', 'aria-hidden': 'true' }));
    var b = el('div', { class: 'tag-body' });
    b.appendChild(el('div', { class: 'tag-id', text: s.id }));
    var ph = el('div', { class: 'mini-photo' });
    var first = (s.media || []).filter(function (m) { return m.type === 'image' || m.poster; })[0];
    if (first) ph.appendChild(el('img', { src: first.type === 'image' ? (first.thumb || first.src) : first.poster, alt: '', loading: 'lazy', width: 300, height: 300 }));
    else ph.appendChild(el('div', { class: 'no-photo' }, [el('span', { class: 'big', 'aria-hidden': 'true', text: 'ಕುರಿ' })]));
    b.appendChild(ph);
    b.appendChild(el('div', { class: 'mini-line' }, [el('span', { text: VF.weight(s.weightKg) }), el('span', { text: VF.price(s.price) })]));
    a.appendChild(b);
    return a;
  };

  /* ---------- media viewer ---------- */
  function openViewer(item) {
    var d = $('#viewer');
    if (!d) {
      d = el('dialog', { id: 'viewer', class: 'viewer' });
      document.body.appendChild(d);
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.addEventListener('close', function () { d.innerHTML = ''; });
    }
    d.innerHTML = '';
    var close = el('button', { class: 'btn close', type: 'button', text: t('media.close') });
    close.addEventListener('click', function () { d.close(); });
    d.appendChild(close);
    d.appendChild(item.type === 'video'
      ? el('video', { src: item.src, poster: item.poster || null, controls: '', autoplay: '', playsinline: '' })
      : el('img', { src: item.src, alt: t('media.photo') }));
    if (d.showModal) d.showModal(); else window.open(item.src, '_blank');
  }

  /* ---------- pages ---------- */
  var sheepData = null;
  function loadSheep() {
    if (!sheepData) sheepData = getJSON('data/sheep.json').then(function (d) { return d.sheep || []; });
    return sheepData;
  }

  function goodConnection() {
    var c = navigator.connection;
    if (!c) return true;
    if (c.saveData) return false;
    return !/(^|-)2g|3g/.test(c.effectiveType || '');
  }

  var homeData = null;
  function renderHero() {
    var box = $('#heroMedia'); if (!box || !homeData) return;
    var h = homeData.hero || (homeData.gallery || [])[0];
    if (!h) return;
    box.innerHTML = '';
    if (h.type === 'video') {
      var v = el('video', { poster: h.poster || null, muted: '', loop: '', playsinline: '', preload: 'none', 'aria-label': t('media.video') });
      v.muted = true;
      box.appendChild(v);
      var tog = el('button', { class: 'media-toggle', type: 'button', text: t('media.pause') });
      box.appendChild(tog);
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function start() {
        v.src = h.src; v.preload = 'auto';
        var p = v.play(); if (p && p.catch) p.catch(function () { tog.textContent = t('media.play'); });
      }
      tog.addEventListener('click', function () {
        if (!v.src) { start(); tog.textContent = t('media.pause'); return; }
        if (v.paused) { v.play(); tog.textContent = t('media.pause'); } else { v.pause(); tog.textContent = t('media.play'); }
      });
      if (!reduce && goodConnection()) {
        if (document.readyState === 'complete') setTimeout(start, 300);
        else window.addEventListener('load', function () { setTimeout(start, 300); });
      } else tog.textContent = t('media.play');
    } else {
      box.appendChild(el('img', { src: h.src, alt: t('media.photo'), fetchpriority: 'high' }));
    }
  }

  function renderGallery() {
    var g = $('#gallery'); if (!g || !homeData) return;
    g.innerHTML = '';
    (homeData.gallery || []).forEach(function (m) {
      var b = el('button', { type: 'button', class: m.type === 'video' ? 'is-video' : '', 'aria-label': t(m.type === 'video' ? 'media.video' : 'media.photo') });
      b.appendChild(el('img', { src: m.type === 'video' ? m.poster : (m.thumb || m.src), alt: '', loading: 'lazy', decoding: 'async' }));
      b.addEventListener('click', function () { openViewer(m); });
      g.appendChild(b);
    });
  }

  function renderStrip() {
    var s = $('#strip'); if (!s) return;
    loadSheep().then(function (list) {
      var av = list.filter(function (x) { return x.status === 'available'; });
      s.innerHTML = '';
      if (!av.length) { s.appendChild(el('p', { class: 'strip-empty', text: t('home.availableEmpty') })); return; }
      av.forEach(function (x) { s.appendChild(VF.miniTag(x)); });
    }).catch(function () {});
  }

  function initHome() {
    getJSON('data/home.json').then(function (d) { homeData = d; renderHero(); renderGallery(); }).catch(function () {});
    renderStrip();
    document.addEventListener('vf:lang', function () { renderStrip(); renderGallery(); var tg = $('.media-toggle'); var v = $('#heroMedia video'); if (tg && v) tg.textContent = t(v.paused ? 'media.play' : 'media.pause'); });
  }

  /* explore */
  var state = { gender: 'all', status: ['available', 'booked', 'sold'], purpose: [], sort: 'new' };
  function readFilters() {
    var f = $('#filters'); if (!f) return;
    state.gender = (f.querySelector('input[name=gender]:checked') || {}).value || 'all';
    state.status = $$('input[name=status]:checked', f).map(function (i) { return i.value; });
    state.purpose = $$('input[name=purpose]:checked', f).map(function (i) { return i.value; });
    state.sort = $('#sort').value;
  }
  function renderExplore(scrollToHash) {
    var grid = $('#tags'); if (!grid) return;
    loadSheep().then(function (list) {
      var rank = { available: 0, booked: 1, sold: 2 };
      var out = list.filter(function (s) {
        if (state.gender !== 'all' && s.gender !== state.gender) return false;
        if (state.status.length && state.status.indexOf(s.status) < 0) return false;
        if (state.purpose.length && !(s.purpose || []).some(function (p) { return state.purpose.indexOf(p) > -1; })) return false;
        return true;
      });
      out.sort(function (a, b) {
        var r = rank[a.status] - rank[b.status]; if (r) return r;
        if (state.sort === 'priceLow') return (a.price || 0) - (b.price || 0);
        if (state.sort === 'priceHigh') return (b.price || 0) - (a.price || 0);
        if (state.sort === 'weight') return (b.weightKg || 0) - (a.weightKg || 0);
        return String(b.added || '').localeCompare(String(a.added || ''));
      });
      grid.innerHTML = '';
      out.forEach(function (s, i) { grid.appendChild(VF.tagCard(s, { eager: i < 2 })); });
      $('#count').textContent = t('explore.count', { n: out.length });
      $('#none').hidden = out.length > 0;
      if (scrollToHash && location.hash) {
        var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) { target.classList.add('is-target'); target.scrollIntoView({ block: 'start' }); }
      }
    }).catch(function () { $('#none').hidden = false; });
  }
  function initExplore() {
    var f = $('#filters');
    f.addEventListener('change', function () { readFilters(); renderExplore(); });
    $('#reset').addEventListener('click', function () {
      f.reset(); readFilters(); renderExplore();
    });
    readFilters();
    renderExplore(true);
    document.addEventListener('vf:lang', function () { renderExplore(); });
  }

  function initContact() {
    var box = $('#mapBox'), btnLoad = $('#mapLoad');
    if (!box || !btnLoad) return;
    function load() {
      var m = site && site.map; if (!m) return;
      var src = 'https://maps.google.com/maps?q=' + m.lat + ',' + m.lng + '&z=' + (m.zoom || 15) + '&hl=' + VF.lang + '&output=embed';
      var f = el('iframe', { src: src, title: t('contact.mapTitle'), loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: '' });
      box.innerHTML = ''; box.appendChild(f);
    }
    btnLoad.addEventListener('click', load);
    // Load automatically on fast connections; on slow/data-saver, wait for a tap.
    if (goodConnection() && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); siteReady.then(load); } }, { rootMargin: '200px' });
      io.observe(box);
    }
  }

  /* ---------- boot ---------- */
  var siteReady = getJSON('data/site.json').then(function (s) { site = s; VF.site = s; }).catch(function () {});

  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { VF.setLang(b.getAttribute('data-set-lang')); });
  });

  var page = document.body.getAttribute('data-page');
  VF.ready = Promise.all([loadLang(VF.lang).catch(function () {}), siteReady]);
  VF.ready.then(function () {
    wireContacts();
    document.addEventListener('vf:lang', wireContacts);
    if (page === 'home') initHome();
    if (page === 'explore') initExplore();
    if (page === 'contact') initContact();
  });
})();
