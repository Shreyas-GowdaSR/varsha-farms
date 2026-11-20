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

  /* ---------- icons (phone + WhatsApp only) ---------- */
  var ICON = {
    call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
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

  /* ---------- sheep card ---------- */
  function mediaNode(m, alt, eager) {
    if (m.type === 'video') {
      return el('video', { src: m.src, poster: m.poster || null, controls: '', preload: 'none', playsinline: '', muted: '' });
    }
    return el('img', { src: m.thumb || m.src, alt: alt, loading: eager ? 'eager' : 'lazy', decoding: 'async', width: 600, height: 750 });
  }
  function noPhoto() {
    return el('div', { class: 'no-photo' }, [el('span', {}, [el('span', { class: 'big', 'aria-hidden': 'true', text: 'ಕುರಿ' }), t('media.noPhoto')])]);
  }
  function titleOf(s) { return [s.gender ? t('gender.' + s.gender) : null, s.breed ? t('breed.' + s.breed) : null].filter(Boolean).join(' · '); }

  VF.tagCard = function (s, opts) {
    opts = opts || {};
    var card = el('article', { class: 'sheep-card' + (s.status === 'sold' ? ' is-sold' : ''), id: s.id });

    var media = el('div', { class: 'sc-media' });
    var items = s.media || [];
    if (items.length) {
      var slides = el('div', { class: 'sc-slides', role: 'region', tabindex: '0', 'aria-label': t('card.photos', { id: s.id }) });
      items.forEach(function (m, i) { slides.appendChild(mediaNode(m, s.id + ' — ' + (i + 1), opts.eager && i === 0)); });
      media.appendChild(slides);
      if (items.length > 1) {
        var cnt = el('span', { class: 'sc-count', text: '1 / ' + items.length });
        media.appendChild(cnt);
        slides.addEventListener('scroll', function () {
          cnt.textContent = (Math.round(slides.scrollLeft / slides.clientWidth) + 1) + ' / ' + items.length;
        }, { passive: true });
      }
    } else media.appendChild(noPhoto());
    if (s.status === 'available') media.appendChild(el('span', { class: 'sc-badge', text: t('status.available') }));
    if (s.status === 'sold' || s.status === 'booked') media.appendChild(el('span', { class: 'seal seal-' + s.status, text: t('status.' + s.status) }));
    card.appendChild(media);

    card.appendChild(el('div', { class: 'sc-head' }, [
      el('p', { class: 'sc-id', text: t('f.id') + ' ' + s.id }),
      el('p', { class: 'sc-price', text: VF.price(s.price) })
    ]));
    card.appendChild(el('h3', { class: 'sc-title', text: titleOf(s) || s.id }));

    var dl = el('dl', { class: 'sc-facts' });
    [['f.age', VF.age(s.ageMonths)], ['f.teeth', opt('teeth', s.teeth)], ['f.weight', VF.weight(s.weightKg)], ['f.weighed', VF.date(s.weighedOn)]]
      .forEach(function (f) { dl.appendChild(el('div', {}, [el('dt', { text: t(f[0]) }), el('dd', { text: f[1] })])); });
    card.appendChild(dl);

    if (s.purpose && s.purpose.length) {
      var pp = el('p', { class: 'sc-purpose' });
      pp.appendChild(el('span', { class: 'visually-hidden', text: t('f.purpose') + ': ' }));
      s.purpose.forEach(function (p) { pp.appendChild(el('span', { class: 'p', text: t('purpose.' + p) })); });
      card.appendChild(pp);
    }
    if (s.note) card.appendChild(el('p', { class: 'sc-note', text: s.note }));

    var msg = t('wa.sheep', { id: s.id, weight: VF.weight(s.weightKg), price: VF.price(s.price) });
    card.appendChild(el('div', { class: 'sc-actions' }, [
      btn('btn-wa', VF.waLink(msg), ICON.wa, t('cta.whatsapp'), true),
      btn('', VF.telLink(), ICON.call, t('cta.call'))
    ]));
    return card;
  };

  VF.flockCard = function (s) {
    var a = el('a', { class: 'flock-card', href: 'explore.html#' + encodeURIComponent(s.id) });
    var ph = el('div', { class: 'fc-img' });
    var first = (s.media || []).filter(function (m) { return m.type === 'image' || m.poster; })[0];
    if (first) ph.appendChild(el('img', { src: first.type === 'image' ? (first.thumb || first.src) : first.poster, alt: '', loading: 'lazy', width: 400, height: 500 }));
    else ph.appendChild(noPhoto());
    a.appendChild(ph);
    a.appendChild(el('p', { class: 'fc-id', text: t('f.id') + ' ' + s.id }));
    a.appendChild(el('p', { class: 'fc-title', text: (s.gender ? t('gender.' + s.gender) : '') + (s.ageMonths != null ? ' · ' + VF.age(s.ageMonths) : '') }));
    a.appendChild(el('p', { class: 'fc-meta', text: VF.weight(s.weightKg) + '  —  ' + VF.price(s.price) }));
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
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Autoplaying, muted, looping video that loads only after the page and only on good connections.
  function ambientVideo(box, item, alt) {
    box.innerHTML = '';
    var v = el('video', { poster: item.poster || null, muted: '', loop: '', playsinline: '', preload: 'none', 'aria-label': alt });
    v.muted = true;
    box.appendChild(v);
    var tog = el('button', { class: 'media-toggle', type: 'button', text: t('media.pause') });
    box.appendChild(tog);
    function start() {
      if (!v.src) { v.src = item.src; v.preload = 'auto'; }
      var p = v.play(); if (p && p.catch) p.catch(function () { tog.textContent = t('media.play'); });
      tog.textContent = t('media.pause');
    }
    tog.addEventListener('click', function () {
      if (!v.src || v.paused) start(); else { v.pause(); tog.textContent = t('media.play'); }
    });
    document.addEventListener('vf:lang', function () { tog.textContent = t(v.src && !v.paused ? 'media.pause' : 'media.play'); });
    if (!reduceMotion && goodConnection()) {
      var go = function () { setTimeout(start, 400); };
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { if (document.readyState === 'complete') go(); else window.addEventListener('load', go); io.disconnect(); }
          });
        }, { rootMargin: '200px' });
        io.observe(box);
      } else go();
    } else tog.textContent = t('media.play');
  }

  var homeData = null;
  function featureVideo() { return (homeData.gallery || []).filter(function (m) { return m.type === 'video'; })[0] || null; }

  function renderHero() {
    var box = $('#heroMedia'); if (!box || !homeData) return;
    var h = homeData.hero || (homeData.gallery || [])[0];
    if (!h) return;
    if (h.type === 'video') ambientVideo(box, h, t('media.video'));
    else {
      var cur = box.querySelector('img');
      if (!cur || cur.getAttribute('src') !== h.src) { box.innerHTML = ''; box.appendChild(el('img', { src: h.src, alt: '', fetchpriority: 'high' })); }
    }
  }
  function renderFeature() {
    var box = $('#featureMedia'); if (!box || !homeData) return;
    var v = featureVideo();
    if (v) ambientVideo(box, v, t('media.video'));
    else {
      var img = (homeData.gallery || []).filter(function (m) { return m.type === 'image'; })[1];
      if (img) { box.innerHTML = ''; box.appendChild(el('img', { src: img.src, alt: '', loading: 'lazy' })); }
    }
  }
  function renderGallery() {
    var g = $('#gallery'); if (!g || !homeData) return;
    var fv = featureVideo();
    g.innerHTML = '';
    (homeData.gallery || []).filter(function (m) { return m !== fv; }).forEach(function (m) {
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
      av.forEach(function (x) { s.appendChild(VF.flockCard(x)); });
    }).catch(function () {});
  }
  function initHome() {
    getJSON('data/home.json').then(function (d) { homeData = d; renderHero(); renderFeature(); renderGallery(); }).catch(function () {});
    renderStrip();
    document.addEventListener('vf:lang', function () { renderStrip(); renderGallery(); });
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
    var grid = $('#cards'); if (!grid) return;
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
    $('#reset').addEventListener('click', function () { f.reset(); readFilters(); renderExplore(); });
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
      box.innerHTML = '';
      box.appendChild(el('iframe', { src: src, title: t('contact.mapTitle'), loading: 'lazy', referrerpolicy: 'no-referrer-when-downgrade', allowfullscreen: '' }));
    }
    btnLoad.addEventListener('click', load);
    if (goodConnection() && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '200px' });
      io.observe(box);
    }
  }

  /* ---------- menu + reveal ---------- */
  function initMenu() {
    var btnMenu = $('.menu-btn'), nav = $('#nav');
    if (!btnMenu || !nav) return;
    function set(open) {
      nav.classList.toggle('is-open', open);
      btnMenu.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) { var a = nav.querySelector('a'); if (a) a.focus(); } else btnMenu.focus();
    }
    btnMenu.addEventListener('click', function () { set(true); });
    var close = $('.nav-close', nav); if (close) close.addEventListener('click', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) set(false); });
  }
  function initReveal() {
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach(function (n) { n.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------- boot ---------- */
  var siteReady = getJSON('data/site.json').then(function (s) { site = s; VF.site = s; }).catch(function () {});

  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { VF.setLang(b.getAttribute('data-set-lang')); });
  });
  initMenu();
  initReveal();

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
