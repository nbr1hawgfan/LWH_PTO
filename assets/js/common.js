/* ==========================================================================
   LWH PTO — shared helpers (API, session, dates, weather, UI)
   ========================================================================== */
(function () {
  'use strict';
  const CFG = window.PTO_CONFIG || {};
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ---------------------------------------------------------------- escape
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Notes saved by the old portals may already contain &amp; etc. Decode once, then escape.
  function escNote(v) {
    const t = document.createElement('textarea');
    t.innerHTML = String(v == null ? '' : v);
    return esc(t.value);
  }

  // --------------------------------------------------------------- storage
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v, persist) {
      try {
        (persist ? localStorage : sessionStorage).setItem(k, JSON.stringify(v));
        (persist ? sessionStorage : localStorage).removeItem(k);
      } catch (e) { /* private mode — session lives in memory only */ }
    },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }
  };

  // --------------------------------------------------------------- session
  let sessionKey = 'lwhpto_session';
  let session = null;
  function initSession(role) {
    sessionKey = 'lwhpto_' + role;
    const s = store.get(sessionKey);
    session = (s && s.token && s.expires > Date.now()) ? s : null;
    if (!session) store.del(sessionKey);
    return session;
  }
  function saveSession(s, persist) { session = s; store.set(sessionKey, s, persist); }
  function clearSession() { session = null; store.del(sessionKey); }
  function getSession() { return session; }

  // ------------------------------------------------------------------- API
  let onExpired = null;
  async function api(action, payload, opts) {
    opts = opts || {};
    if (!CFG.API_URL || CFG.API_URL.indexOf('PASTE_') === 0) {
      throw new Error('App not configured yet: set API_URL in assets/js/config.js');
    }
    const body = Object.assign({ action: action }, payload || {});
    if (session && session.token) body.token = session.token;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
        body: JSON.stringify(body),
        redirect: 'follow',
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('The server took too long to answer. Check your connection and try again.');
      throw new Error(navigator.onLine ? 'Could not reach the PTO server. If this keeps happening, the network may be blocking script.google.com.' : 'You are offline.');
    }
    clearTimeout(timer);
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('Unexpected server response (' + res.status + ').'); }
    if (!json.ok) {
      if (json.error === 'SESSION_EXPIRED') {
        clearSession();
        if (onExpired) onExpired();
        throw new Error('Your session expired. Please sign in again.');
      }
      throw new Error(json.error || 'Something went wrong.');
    }
    return json.data;
  }

  // ----------------------------------------------------------------- dates
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /** Accepts yyyy-MM-dd, yyyy/MM/dd, M/D/YYYY, M/D/YY — always local midnight. */
  function parseAnyDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900; return new Date(y, +m[1] - 1, +m[2]); }
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : '';
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a, b) => a && b && a.getTime() === b.getTime();
  function fmt(d, style) {
    d = parseAnyDate(d); if (!d) return '';
    if (style === 'long') return DOWL[d.getDay()] + ', ' + MONTH[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (style === 'dow') return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
    if (style === 'md') return MON[d.getMonth()] + ' ' + d.getDate();
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function fmtRange(a, b) {
    const s = parseAnyDate(a), e = parseAnyDate(b);
    if (!s) return '';
    if (!e || sameDay(s, e)) return fmt(s, 'dow') + ', ' + s.getFullYear();
    if (s.getFullYear() === e.getFullYear()) return fmt(s, 'dow') + ' – ' + fmt(e, 'dow') + ', ' + e.getFullYear();
    return fmt(s) + ' – ' + fmt(e);
  }

  // Same 6 company holidays the Apps Script uses
  function holidayName(date) {
    const m = date.getMonth() + 1, d = date.getDate(), w = date.getDay();
    if (m === 1 && d === 1) return "New Year's Day";
    if (m === 5 && w === 1 && d >= 25) return 'Memorial Day';
    if (m === 7 && d === 4) return 'Independence Day';
    if (m === 9 && w === 1 && d <= 7) return 'Labor Day';
    if (m === 11 && w === 4 && d >= 22 && d <= 28) return 'Thanksgiving';
    if (m === 12 && d === 25) return 'Christmas Day';
    return '';
  }
  function businessDays(a, b) {
    const s = parseAnyDate(a), e = parseAnyDate(b);
    if (!s || !e || e < s) return { days: 0, holidays: [], weekend: 0 };
    let days = 0, weekend = 0; const holidays = [];
    for (let c = s; c <= e; c = addDays(c, 1)) {
      const w = c.getDay();
      if (w === 0 || w === 6) { weekend++; continue; }
      const h = holidayName(c);
      if (h) { holidays.push(h); continue; }
      days++;
    }
    return { days, holidays, weekend };
  }
  function overlaps(req, from, to) {
    const s = parseAnyDate(req.startDate), e = parseAnyDate(req.endDate) || s;
    return s && s <= to && e >= from;
  }
  const isPTO = t => /^(full|half) day pto$/i.test(String(t || '').trim());
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const days1 = v => { const n = num(v); return (Math.round(n * 100) / 100).toString(); };

  // ------------------------------------------------------------ categories
  function typeClass(t) {
    t = String(t || '').toLowerCase();
    if (t.includes('half') || t.includes('personal')) return 'half';
    if (t.includes('pto') || t.includes('vacation')) return 'pto';
    if (t.includes('sick') || t.includes('call') || t.includes('no call') || t.includes('ncns')) return 'sick';
    if (t.includes('excused') || t.includes('jury') || t.includes('bereave') || t.includes('funeral') || t.includes('fmla')) return 'excused';
    return 'other';
  }
  function badge(status) {
    const s = String(status || 'Pending');
    return '<span class="badge b-' + esc(s.toLowerCase()) + '">' + esc(s) + '</span>';
  }
  function initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] || '').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : '') || '').toUpperCase();
  }
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  // ---------------------------------------------------------------- weather
  const WX = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Freezing fog'], 51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'], 61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🧊', 'Freezing rain'], 67: ['🧊', 'Freezing rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'],
    77: ['🌨️', 'Snow grains'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'],
    86: ['❄️', 'Snow showers'], 95: ['⛈️', 'Thunderstorms'], 96: ['⛈️', 'Storms w/ hail'], 99: ['⛈️', 'Severe storms']
  };
  const wxOf = c => WX[c] || ['🌡️', '—'];
  function windDir(deg) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg || 0) % 360) / 45) % 8]; }
  async function getWeather() {
    const W = CFG.WEATHER || {};
    const key = 'lwhpto_wx';
    try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 15 * 60000) return c.d; } catch (e) {}
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + W.lat + '&longitude=' + W.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=3';
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather ' + r.status);
    const d = await r.json();
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
    return d;
  }
  async function renderWeather(el, compact) {
    if (!el) return;
    try {
      const d = await getWeather();
      const c = d.current, dy = d.daily, w = wxOf(c.weather_code);
      const name = esc((CFG.WEATHER || {}).name || '');
      if (compact) {
        el.innerHTML = '<div class="wx-strip"><span class="e">' + w[0] + '</span><b>' + Math.round(c.temperature_2m) + '°F</b> ' +
          esc(w[1]) + ' <span style="color:var(--muted)">· H ' + Math.round(dy.temperature_2m_max[0]) + '° / L ' + Math.round(dy.temperature_2m_min[0]) + '° · ' + name + '</span></div>';
        return;
      }
      const days = dy.time.map((t, i) => {
        const dd = parseAnyDate(t), x = wxOf(dy.weather_code[i]);
        return '<div><div class="d">' + (i === 0 ? 'Today' : DOW[dd.getDay()]) + '</div><div class="e">' + x[0] + '</div>' +
          '<div><b>' + Math.round(dy.temperature_2m_max[i]) + '°</b> / ' + Math.round(dy.temperature_2m_min[i]) + '°</div>' +
          '<div style="color:var(--muted);font-size:12px">' + (dy.precipitation_probability_max[i] || 0) + '% rain</div></div>';
      }).join('');
      el.innerHTML =
        '<div class="wx"><div class="icon">' + w[0] + '</div><div class="temp">' + Math.round(c.temperature_2m) + '<sup>°F</sup></div>' +
        '<div><div class="cond">' + esc(w[1]) + '</div><div class="meta">Feels like ' + Math.round(c.apparent_temperature) + '° · ' +
        'Wind ' + windDir(c.wind_direction_10m) + ' ' + Math.round(c.wind_speed_10m) + ' mph · Humidity ' + Math.round(c.relative_humidity_2m) + '%</div>' +
        '<div class="meta">' + name + '</div></div></div><div class="wx-days">' + days + '</div>';
    } catch (e) {
      el.innerHTML = '<div class="empty" style="padding:14px">🌤️ Weather unavailable right now.</div>';
    }
  }

  // ---------------------------------------------------------------- UI bits
  function toast(msg, isErr) {
    let host = $('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 6500 : 3800);
  }
  let busyEl = null;
  function busy(msg) {
    if (busyEl) busyEl.remove();
    busyEl = null;
    if (msg === false) return;
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    busyEl.innerHTML = '<div class="box"><div class="spin"></div><span>' + esc(msg || 'Working…') + '</span></div>';
    document.body.appendChild(busyEl);
  }

  /**
   * modal({title, html, buttons:[{label, cls, value, validate}], wide})
   * Resolves with the clicked button's value (or null on close).
   * validate(modalEl) may return an error string to keep the modal open.
   */
  function modal(opts) {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      const btns = (opts.buttons || [{ label: 'Close', cls: 'btn-ghost', value: null }]);
      bg.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + esc(opts.title || '') + '</h3><button class="modal-x" aria-label="Close">×</button></div>' +
        '<div class="modal-body">' + (opts.html || '') + '<div class="note bad" data-err hidden style="margin-top:14px"></div></div>' +
        '<div class="modal-foot">' + btns.map((b, i) => '<button class="btn ' + (b.cls || 'btn-ghost') + '" data-i="' + i + '">' + esc(b.label) + '</button>').join('') + '</div></div>';
      document.body.appendChild(bg);
      const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', e => { if (e.target === bg) close(null); });
      $('.modal-x', bg).onclick = () => close(null);
      $$('[data-i]', bg).forEach(el => el.onclick = () => {
        const b = btns[+el.dataset.i];
        if (b.validate) {
          const err = b.validate(bg);
          if (err) { const box = $('[data-err]', bg); box.textContent = err; box.hidden = false; return; }
        }
        close(typeof b.value === 'function' ? b.value(bg) : b.value);
      });
      const first = $('input, textarea, select', bg);
      if (first) setTimeout(() => first.focus(), 50);
    });
  }
  function confirmBox(title, html, okLabel, okCls) {
    return modal({ title, html, buttons: [{ label: 'Cancel', cls: 'btn-ghost', value: false }, { label: okLabel || 'OK', cls: okCls || 'btn-red', value: true }] });
  }
  function alertBox(title, html) { return modal({ title, html, buttons: [{ label: 'OK', cls: 'btn-black', value: true }] }); }

  // ---------------------------------------------------------- shell / chrome
  function renderChrome(opts) {
    const C = CFG.COMPANY || {};
    const util = $('#utility');
    if (util) util.innerHTML = '<div class="wrap">' +
      '<span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg><b>' + esc(C.phone) + '</b></span>' +
      '<span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>' + esc(C.address) + '</span>' +
      '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' + esc(C.hours) + '</span></div>';
    const brand = $('#brandbar');
    if (brand) brand.innerHTML = '<div class="wrap">' +
      '<div class="logo"><img src="' + opts.root + 'assets/img/logo.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'mono\',textContent:\'LW\'}))"></div>' +
      '<div><div class="brand-name">' + esc(C.name || 'Logistics Warehouse') + '</div><div class="brand-sub">' + esc(opts.sub) + '</div></div>' +
      '<div class="brand-right"><span class="secure-pill"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>Secure Session</span>' +
      '<div class="who" id="whoBox" hidden><div class="n" id="whoName"></div><div class="s">Signed in</div></div></div></div>';
  }
  function setWho(name) {
    const box = $('#whoBox'); if (!box) return;
    if (name) { $('#whoName').textContent = name; box.hidden = false; } else box.hidden = true;
  }

  function watchOnline() {
    const bar = document.createElement('div');
    bar.className = 'offline'; bar.textContent = 'You are offline — changes can’t be sent until you reconnect.';
    bar.hidden = navigator.onLine;
    document.body.prepend(bar);
    window.addEventListener('online', () => bar.hidden = true);
    window.addEventListener('offline', () => bar.hidden = false);
  }
  function registerSW(path) {
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register(path).catch(() => {});
    }
  }

  // ---------------------------------------------------------- table sorting
  function sortRows(rows, key, dir) {
    return rows.slice().sort((a, b) => {
      let x = a[key], y = b[key];
      if (x instanceof Date || y instanceof Date) { x = x ? x.getTime() : 0; y = y ? y.getTime() : 0; return (x - y) * (dir === 'desc' ? -1 : 1); }
      const dx = typeof x === 'string' && /^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}$/.test(x) ? parseAnyDate(x) : null;
      const dy = typeof y === 'string' && /^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}$/.test(y) ? parseAnyDate(y) : null;
      if (dx && dy) { x = dx.getTime(); y = dy.getTime(); }
      else if (!isNaN(parseFloat(x)) && !isNaN(parseFloat(y)) && isFinite(x) && isFinite(y)) { x = +x; y = +y; }
      else { x = String(x || '').toLowerCase(); y = String(y || '').toLowerCase(); }
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
    });
  }
  function downloadCSV(filename, headers, rows) {
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [headers.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.PTO = {
    CFG, $, $$, esc, escNote, store, api,
    initSession, saveSession, clearSession, getSession, set onExpired(fn) { onExpired = fn; },
    parseAnyDate, ymd, today, addDays, sameDay, fmt, fmtRange, holidayName, businessDays, overlaps, isPTO, num, days1,
    MON, MONTH, DOW, DOWL, typeClass, badge, initials, firstName, greeting,
    renderWeather, toast, busy, modal, confirmBox, alertBox, renderChrome, setWho, watchOnline, registerSW,
    sortRows, downloadCSV
  };
})();
