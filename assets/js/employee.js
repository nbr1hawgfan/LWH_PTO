/* ==========================================================================
   LWH PTO — Employee app
   ========================================================================== */
(function () {
  'use strict';
  const P = window.PTO, $ = P.$, $$ = P.$$, esc = P.esc;
  const VIEWS = ['home', 'request', 'ask', 'requests', 'message'];
  const state = { profile: null, balance: null, requests: [], asks: [], loadedAt: 0, type: 'Full Day PTO', filter: 'upcoming', timing: 'allday' };

  // ---------------------------------------------------------------- boot
  P.renderChrome({ root: '', sub: 'Employee PTO Portal' });
  P.watchOnline();
  P.registerSW('sw.js');
  P.onExpired = () => showLogin();

  if (P.initSession('employee')) startApp(); else showLogin();

  function showLogin() {
    $('#app').hidden = true; $('#nav').hidden = true; P.setWho('');
    const el = $('#login'); el.hidden = false;
    P.renderLogin(el, {
      role: 'employee', title: 'PTO Portal Sign In', subtitle: 'Select your name and enter your PIN.',
      rememberDefault: true, onSuccess: () => startApp()
    });
  }

  function startApp() {
    const s = P.getSession();
    $('#login').hidden = true; $('#login').innerHTML = '';
    $('#app').hidden = false; $('#nav').hidden = false;
    P.setWho(s.profile.name);
    state.profile = s.profile;
    setWelcome();
    P.renderWeather($('#wxBox'));
    go(location.hash.replace('#', ''), true);
    load();
  }

  function setWelcome() {
    const n = P.firstName(state.profile && state.profile.name);
    $('#welcome').textContent = 'Welcome back, ' + n;
    $('#welcomeSub').textContent = P.greeting() + ' — here’s your time off at a glance.';
  }

  async function load(quiet) {
    try {
      const d = await P.api('emp.bootstrap');
      state.profile = Object.assign({}, state.profile, d.profile);
      state.balance = d.balance || { allocated: 0, used: 0, remaining: 0 };
      state.requests = (d.requests || []).map(r => Object.assign(r, { _s: P.parseAnyDate(r.startDate), _e: P.parseAnyDate(r.endDate) || P.parseAnyDate(r.startDate) }));
      state.asks = d.asks || [];
      state.loadedAt = Date.now();
      renderAll();
    } catch (e) {
      if (!quiet) P.toast(e.message, true);
      if (!state.loadedAt) $('#balanceBox').innerHTML = '<div class="note bad">' + esc(e.message) + '</div>';
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && P.getSession() && Date.now() - state.loadedAt > 120000) { setWelcome(); load(true); }
  });

  function renderAll() {
    renderBalance(); renderUpcoming(); renderList(); renderSummary(); renderAsks();
    const wait = state.asks.filter(a => a.status === 'Waiting').length;
    const ac = $('#askCount'); ac.textContent = wait; ac.hidden = !wait;
    const pend = state.requests.filter(r => r.status === 'Pending').length;
    const pc = $('#pendCount'); pc.textContent = pend; pc.hidden = !pend;
    const p = state.profile || {};
    $('#mgrLine').textContent = p.manager ? 'Your manager: ' + p.manager : '';
    $('#msgTo').textContent = p.manager ? 'To: ' + p.manager : '';
    $('#askTo').textContent = p.manager ? 'Goes to: ' + p.manager : '';
  }

  // --------------------------------------------------------------- routing
  function go(view, replace) {
    if (VIEWS.indexOf(view) === -1) view = 'home';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
    $$('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (replace) history.replaceState(null, '', '#' + view); else if (location.hash !== '#' + view) history.pushState(null, '', '#' + view);
    window.scrollTo(0, 0);
    if (view === 'request') renderSummary();
  }
  window.addEventListener('popstate', () => go(location.hash.replace('#', ''), true));
  $$('#nav [data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
  document.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t) go(t.dataset.go); });
  $('#logoutBtn').onclick = async () => {
    if (await P.confirmBox('Sign out?', '<p>You’ll need your PIN to sign back in.</p>', 'Sign out', 'btn-black')) {
      P.clearSession(); location.hash = ''; showLogin();
    }
  };
  $('#refreshBtn').onclick = () => { load(); P.toast('Refreshing…'); };

  // ---------------------------------------------------------------- home
  function pendingPTODays() {
    const t = P.today();
    return state.requests.filter(r => r.status === 'Pending' && P.isPTO(r.absenceType)).reduce((a, r) => a + P.num(r.daysCount), 0);
  }
  function renderBalance() {
    const b = state.balance, alloc = P.num(b.allocated), rem = P.num(b.remaining), used = P.num(b.used);
    const pct = alloc > 0 ? Math.max(0, Math.min(100, (rem / alloc) * 100)) : 0;
    const pend = pendingPTODays();
    $('#balYear').textContent = new Date().getFullYear();
    $('#balanceBox').innerHTML =
      '<div class="balance"><div><div class="big">' + P.days1(rem) + '<small>days</small></div><div class="lbl">Remaining</div></div>' +
      '<div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="facts"><span>Allocated <b>' + P.days1(alloc) + '</b></span><span>Used <b>' + P.days1(used) + '</b></span>' +
      (pend ? '<span>Pending <b>' + P.days1(pend) + '</b></span>' : '') + '</div></div></div>' +
      (pend ? '<div class="note warn" style="margin-top:14px">You have ' + P.days1(pend) + ' day(s) waiting on approval. They come off your balance once approved.</div>' : '') +
      (rem <= (P.CFG.LOW_BALANCE_DAYS || 2) ? '<div class="note bad" style="margin-top:10px">Your balance is getting low.</div>' : '');
  }

  function upcomingList() {
    const t = P.today();
    return state.requests
      .filter(r => (r.status === 'Approved' || r.status === 'Pending') && r._e && r._e >= t)
      .sort((a, b) => a._s - b._s);
  }
  function renderUpcoming() {
    const list = upcomingList().slice(0, 4);
    if (!list.length) {
      $('#upcomingBox').innerHTML = '<div class="empty"><div class="e">🏖️</div>Nothing scheduled yet.<div style="margin-top:12px"><button class="btn btn-red btn-sm" data-go="request">Request time off</button></div></div>';
      return;
    }
    const t = P.today();
    $('#upcomingBox').innerHTML = list.map(r => {
      const d = Math.round((r._s - t) / 86400000);
      const when = d <= 0 ? (r._e >= t && r._s <= t ? 'Happening now' : 'Today') : d === 1 ? 'Tomorrow' : 'In ' + d + ' days';
      return reqRow(r, '<span class="badge" style="background:var(--black);color:#fff">' + when + '</span>', false);
    }).join('');
  }

  function reqRow(r, extraBadge, withActions) {
    const st = String(r.status || 'Pending').toLowerCase();
    const canCancel = withActions && (r.status === 'Pending' || r.status === 'Approved');
    const unit = P.isPTO(r.absenceType) ? 'PTO day' : 'day';
    const n = P.num(r.daysCount);
    let meta = 'Submitted ' + esc(r.submittedDate || '—');
    if (r.status === 'Approved' && r.approvedBy) meta += ' · Approved by ' + esc(r.approvedBy) + (r.decisionDate ? ' on ' + esc(r.decisionDate) : '');
    if (r.status === 'Denied') meta += ' · Denied' + (r.decisionDate ? ' ' + esc(r.decisionDate) : '');
    if (r.status === 'Cancelled') meta += ' · Withdrawn' + (r.decisionDate ? ' ' + esc(r.decisionDate) : '');
    const reason = (r.status === 'Denied' || r.status === 'Cancelled') && r.denialReason
      ? '<div class="n"><b>' + (r.status === 'Denied' ? 'Reason for denial' : 'Withdraw reason') + ':</b> ' + P.escNote(r.denialReason) + '</div>' : '';
    return '<div class="req ' + esc(st) + '"><div class="stripe"></div><div>' +
      '<div class="t">' + esc(r.absenceType) + ' ' + P.badge(r.status) + ' ' + (extraBadge || '') + '</div>' +
      '<div class="d">' + esc(P.fmtRange(r._s, r._e)) + '</div>' +
      '<div class="m">' + meta + '</div>' +
      (r.notes ? '<div class="n">' + P.escNote(r.notes) + '</div>' : '') + reason +
      '</div><div class="act"><div class="days">' + P.days1(n) + '<small>' + unit + (n === 1 ? '' : 's') + '</small></div>' +
      (canCancel ? '<button class="btn btn-ghost btn-sm" data-cancel="' + esc(r.requestId) + '">Withdraw</button>' : '') +
      '</div></div>';
  }

  // ---------------------------------------------------------- my requests
  $$('#reqFilter .chip').forEach(c => c.onclick = () => {
    state.filter = c.dataset.f;
    $$('#reqFilter .chip').forEach(x => x.classList.toggle('on', x === c));
    renderList();
  });
  function renderList() {
    const t = P.today(), f = state.filter;
    let list = state.requests.slice();
    if (f === 'upcoming') list = upcomingList();
    else if (f === 'pending') list = list.filter(r => r.status === 'Pending');
    else if (f === 'approved') list = list.filter(r => r.status === 'Approved');
    else if (f === 'past') list = list.filter(r => r._e && r._e < t && r.status === 'Approved');
    else if (f === 'closed') list = list.filter(r => r.status === 'Denied' || r.status === 'Cancelled');
    if (f !== 'upcoming') list.sort((a, b) => (b._s || 0) - (a._s || 0));
    $('#reqList').innerHTML = list.length ? list.map(r => reqRow(r, '', true)).join('')
      : '<div class="empty"><div class="e">📋</div>No requests here.</div>';
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    const r = state.requests.find(x => String(x.requestId) === b.dataset.cancel); if (!r) return;
    const reason = await P.modal({
      title: 'Withdraw Request',
      html: '<dl class="kv"><dt>Type</dt><dd>' + esc(r.absenceType) + '</dd><dt>Dates</dt><dd>' + esc(P.fmtRange(r._s, r._e)) + '</dd>' +
        '<dt>Days</dt><dd>' + P.days1(r.daysCount) + '</dd><dt>Status</dt><dd>' + P.badge(r.status) + '</dd></dl>' +
        (r.status === 'Approved' && P.isPTO(r.absenceType) ? '<div class="note good" style="margin-top:14px">This was approved — ' + P.days1(r.daysCount) + ' day(s) will go back on your balance.</div>' : '') +
        '<div class="field" style="margin-top:16px"><label for="wdReason">Reason for withdrawing</label><textarea class="input" id="wdReason" maxlength="500" placeholder="e.g. Plans changed"></textarea></div>',
      buttons: [
        { label: 'Keep it', cls: 'btn-ghost', value: null },
        { label: 'Withdraw', cls: 'btn-red', validate: m => $('#wdReason', m).value.trim() ? '' : 'Please give a reason.', value: m => $('#wdReason', m).value.trim() }
      ]
    });
    if (!reason) return;
    P.busy('Withdrawing…');
    try {
      const res = await P.api('emp.cancel', { requestId: r.requestId, reason });
      P.busy(false);
      P.toast(res.balanceRestored ? 'Withdrawn — your PTO balance was restored.' : 'Request withdrawn. Your manager and HR were notified.');
      load();
    } catch (err) { P.busy(false); P.toast(err.message, true); }
  });

  // ---------------------------------------------------------------- request
  const minDate = P.ymd(P.addDays(P.today(), -(P.CFG.PAST_DAYS_ALLOWED || 180)));
  $('#rqStart').min = minDate; $('#rqEnd').min = minDate;
  $$('#typeSeg button').forEach(b => b.onclick = () => {
    state.type = b.dataset.type;
    $$('#typeSeg button').forEach(x => x.classList.toggle('on', x === b));
    const half = state.type === 'Half Day PTO';
    $('#rqEndWrap').hidden = half;
    $('#rqStartLbl').textContent = half ? 'Date' : 'First day off';
    renderSummary();
  });
  $('#rqStart').addEventListener('change', () => {
    const s = $('#rqStart').value, e = $('#rqEnd');
    if (s && (!e.value || e.value < s)) e.value = s;
    e.min = s || minDate;
    renderSummary();
  });
  $('#rqEnd').addEventListener('change', renderSummary);
  $$('#rqChips .chip').forEach(c => c.onclick = () => {
    const ta = $('#rqNotes'), v = c.textContent.trim();
    ta.value = ta.value.trim() ? ta.value.trim() + ' — ' + v : v;
  });

  function calc() {
    const half = state.type === 'Half Day PTO';
    const s = $('#rqStart').value, e = half ? s : ($('#rqEnd').value || s);
    if (!s) return null;
    const sd = P.parseAnyDate(s), ed = P.parseAnyDate(e);
    if (ed < sd) return { error: 'The last day can’t be before the first day.' };
    const bd = P.businessDays(sd, ed);
    let days = bd.days;
    if (half) {
      const w = sd.getDay();
      if (w === 0 || w === 6) return { error: 'That date is a weekend.' };
      if (P.holidayName(sd)) return { error: P.holidayName(sd) + ' is a company holiday.' };
      days = 0.5;
    }
    return { s, e, sd, ed, days, bd, half, past: sd < P.today() };
  }

  function renderSummary() {
    const box = $('#rqSummary'); if (!box) return;
    const rem = state.balance ? P.num(state.balance.remaining) : null;
    const c = calc();
    let html = '<dl class="kv"><dt>Balance now</dt><dd><b>' + (rem == null ? '—' : P.days1(rem) + ' days') + '</b></dd>';
    if (!c) {
      box.innerHTML = html + '</dl><div class="note" style="margin-top:16px">Pick a date to see how many days this uses.<br><br>' +
        '<b>1 day off:</b> same first and last day.<br><b>Several days:</b> your first and last day off — both count.</div>';
      return;
    }
    if (c.error) { box.innerHTML = html + '</dl><div class="note bad" style="margin-top:16px">' + esc(c.error) + '</div>'; return; }
    const after = rem == null ? null : rem - c.days;
    html += '<dt>Dates</dt><dd>' + esc(c.half ? P.fmt(c.sd, 'long') : P.fmtRange(c.sd, c.ed)) + '</dd>' +
      '<dt>This request</dt><dd><b style="color:var(--red)">' + P.days1(c.days) + ' day' + (c.days === 1 ? '' : 's') + '</b></dd>' +
      (after == null ? '' : '<dt>After approval</dt><dd><b>' + P.days1(after) + ' days</b></dd>') + '</dl>';
    const notes = [];
    if (!c.half && c.bd.weekend) notes.push('<div class="note">' + c.bd.weekend + ' weekend day(s) not counted.</div>');
    if (!c.half && c.bd.holidays.length) notes.push('<div class="note">Company holiday not counted: ' + esc(c.bd.holidays.join(', ')) + '.</div>');
    if (c.days === 0) notes.push('<div class="note bad">These dates don’t include any work days.</div>');
    if (after != null && after < 0) notes.push('<div class="note bad">Not enough PTO — this needs ' + P.days1(c.days) + ' day(s) but you have ' + P.days1(rem) + '.</div>');
    else if (after != null && after < 1 && c.days > 0) notes.push('<div class="note warn">This leaves you with less than 1 day of PTO.</div>');
    if (c.past) notes.push('<div class="note warn">This date is in the past — it will be marked as a past-date submission for your manager.</div>');
    const overlap = state.requests.filter(r => (r.status === 'Pending' || r.status === 'Approved') && r._s && r._s <= c.ed && r._e >= c.sd);
    if (overlap.length) notes.push('<div class="note warn">You already have ' + overlap.length + ' request(s) on these dates: ' +
      overlap.map(r => esc(r.absenceType + ' ' + P.fmtRange(r._s, r._e) + ' (' + r.status + ')')).join('; ') + '</div>');
    box.innerHTML = html + (notes.length ? '<div style="margin-top:16px">' + notes.join('') + '</div>' : '');
  }

  $('#rqSubmit').onclick = async () => {
    const c = calc();
    if (!c) return P.toast('Please pick a date.', true);
    if (c.error) return P.toast(c.error, true);
    if (c.days <= 0) return P.toast('These dates don’t include any work days.', true);
    const rem = state.balance ? P.num(state.balance.remaining) : 0;
    if (c.days > rem) return P.alertBox('Not Enough PTO', '<p>This request needs <b>' + P.days1(c.days) + '</b> day(s) but your balance is <b>' + P.days1(rem) + '</b>.</p><p style="margin-top:10px">Adjust your dates or talk to HR.</p>');
    const overlap = state.requests.filter(r => (r.status === 'Pending' || r.status === 'Approved') && r._s && r._s <= c.ed && r._e >= c.sd);
    const ok = await P.confirmBox('Submit Request?',
      '<dl class="kv"><dt>Type</dt><dd>' + esc(state.type) + '</dd><dt>Dates</dt><dd>' + esc(c.half ? P.fmt(c.sd, 'long') : P.fmtRange(c.sd, c.ed)) + '</dd>' +
      '<dt>PTO days</dt><dd><b>' + P.days1(c.days) + '</b></dd><dt>Balance after</dt><dd>' + P.days1(rem - c.days) + ' days</dd></dl>' +
      (overlap.length ? '<div class="note warn" style="margin-top:14px">Heads up: you already have a request overlapping these dates.</div>' : ''),
      'Submit', 'btn-red');
    if (!ok) return;
    const btn = $('#rqSubmit'); btn.disabled = true;
    P.busy('Submitting…');
    try {
      const res = await P.api('emp.submit', { absenceType: state.type, startDate: c.s, endDate: c.e, notes: $('#rqNotes').value.trim() });
      P.busy(false);
      $('#rqStart').value = ''; $('#rqEnd').value = ''; $('#rqNotes').value = '';
      await P.alertBox('Request Submitted ✅', '<p><b>' + P.days1(res.daysCount) + '</b> day(s) — status <b>' + esc(res.status || 'Pending') + '</b>.</p>' +
        '<p style="margin-top:10px">Your manager and HR have been emailed. You’ll get an email when it’s approved or denied.</p>');
      await load();
      state.filter = 'upcoming'; $$('#reqFilter .chip').forEach(x => x.classList.toggle('on', x.dataset.f === 'upcoming')); renderList();
      go('requests');
    } catch (e) { P.busy(false); P.toast(e.message, true); }
    finally { btn.disabled = false; }
  };


  // ------------------------------------------------------------------- asks
  const todayStr = P.ymd(P.today());
  $('#akStart').min = todayStr; $('#akEnd').min = todayStr;
  $('#akStart').addEventListener('change', () => { const s = $('#akStart').value, e = $('#akEnd'); e.min = s || todayStr; if (e.value && e.value < s) e.value = ''; });
  $$('#akTiming button').forEach(b => b.onclick = () => {
    state.timing = b.dataset.t;
    $$('#akTiming button').forEach(x => x.classList.toggle('on', x === b));
    const t = state.timing;
    $('#akTimes').hidden = t === 'allday';
    $('#akT2Wrap').hidden = t !== 'custom';
    $('#akT1Lbl').textContent = t === 'leave' ? 'Leave at' : t === 'arrive' ? 'Arrive at' : 'From';
  });
  $$('#akChips .chip').forEach(c => c.onclick = () => { const ta = $('#akReason'), v = c.textContent.trim(); ta.value = ta.value.trim() ? ta.value.trim() + ' — ' + v : v; ta.focus(); });

  const ASK_STATUS = {
    Waiting: ['b-pending', 'Waiting', 'Waiting on your manager — <b>not approved yet</b>.'],
    Recorded: ['b-approved', 'Approved & recorded', ''],
    Declined: ['b-denied', 'Declined', ''],
    Withdrawn: ['b-cancelled', 'Withdrawn', '']
  };
  function renderAsks() {
    const box = $('#askList'); if (!box) return;
    if (!state.asks.length) { box.innerHTML = '<div class="empty"><div class="e">🙋</div>No asks yet.</div>'; return; }
    box.innerHTML = state.asks.map(a => {
      const st = ASK_STATUS[a.status] || ASK_STATUS.Waiting;
      let extra = st[2];
      if (a.status === 'Recorded') extra = 'Recorded as <b>' + esc(a.recordedAs) + '</b> by ' + esc(a.handledBy) + '. You’re approved for this time.';
      if (a.status === 'Declined') extra = '<b>' + esc(a.handledBy) + ':</b> ' + P.escNote(a.managerNote);
      const cls = a.status === 'Recorded' ? 'approved' : a.status === 'Declined' ? 'denied' : a.status === 'Withdrawn' ? 'cancelled' : '';
      return '<div class="req ' + cls + '"><div class="stripe"></div><div>' +
        '<div class="t">' + esc(P.fmtRange(a.startDate, a.endDate)) + ' <span class="badge ' + st[0] + '">' + st[1] + '</span></div>' +
        '<div class="d">' + esc(a.timingLabel) + '</div>' +
        '<div class="n">' + P.escNote(a.reason) + '</div>' +
        (extra ? '<div class="m" style="margin-top:6px;font-size:13.5px;color:var(--ink-2)">' + extra + '</div>' : '') +
        '</div><div class="act">' + (a.status === 'Waiting' ? '<button class="btn btn-ghost btn-sm" data-askwd="' + esc(a.askId) + '">Withdraw</button>' : '') + '</div></div>';
    }).join('');
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-askwd]'); if (!b) return;
    if (!(await P.confirmBox('Withdraw Ask?', '<p>Your manager will be told you no longer need this time.</p>', 'Withdraw', 'btn-red'))) return;
    P.busy('Withdrawing…');
    try { await P.api('emp.askWithdraw', { askId: b.dataset.askwd }); P.busy(false); P.toast('Ask withdrawn.'); load(); }
    catch (err) { P.busy(false); P.toast(err.message, true); }
  });
  $('#akSend').onclick = async () => {
    const s = $('#akStart').value, e = $('#akEnd').value || s, t = state.timing, t1 = $('#akT1').value, t2 = $('#akT2').value, reason = $('#akReason').value.trim();
    if (!s) return P.toast('Pick a date.', true);
    if (e < s) return P.toast('“Through” can’t be before the first date.', true);
    if ((t === 'leave' || t === 'arrive') && !t1) return P.toast('Pick a time.', true);
    if (t === 'custom' && (!t1 || !t2 || t2 <= t1)) return P.toast('Pick a start and end time.', true);
    if (!reason) return P.toast('Add a short reason for your manager.', true);
    const label = t === 'allday' ? 'All day' : t === 'leave' ? 'Leave early at ' + to12(t1) : t === 'arrive' ? 'Come in late at ' + to12(t1) : to12(t1) + ' – ' + to12(t2);
    const ok = await P.confirmBox('Send this ask?',
      '<dl class="kv"><dt>To</dt><dd>' + esc((state.profile && state.profile.manager) || 'Your manager') + '</dd><dt>When</dt><dd>' + esc(P.fmtRange(s, e)) + '</dd>' +
      '<dt>What</dt><dd>' + esc(label) + '</dd><dt>Reason</dt><dd>' + esc(reason) + '</dd></dl>' +
      '<div class="note warn" style="margin-top:14px"><b>This is not approval.</b> You don’t have this time off unless your manager says yes.</div>', 'Send Ask', 'btn-black');
    if (!ok) return;
    const btn = $('#akSend'); btn.disabled = true; P.busy('Sending…');
    try {
      await P.api('emp.ask', { startDate: s, endDate: e, timing: t, startTime: t1, endTime: t2, reason });
      P.busy(false);
      ['akStart', 'akEnd', 'akT1', 'akT2', 'akReason'].forEach(id => $('#' + id).value = '');
      P.toast('Ask sent to your manager — not approved yet. Watch your email.');
      load();
    } catch (err) { P.busy(false); P.toast(err.message, true); }
    finally { btn.disabled = false; }
  };
  function to12(t) { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return t; let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }

  // ---------------------------------------------------------------- message
  $$('#msgChips .chip').forEach(c => c.onclick = () => {
    $('#msgSubject').value = c.dataset.s;
    $$('#msgChips .chip').forEach(x => x.classList.toggle('on', x === c));
  });
  $('#msgSubject').addEventListener('input', () => $$('#msgChips .chip').forEach(x => x.classList.toggle('on', x.dataset.s === $('#msgSubject').value)));
  $('#msgSend').onclick = async () => {
    const subject = $('#msgSubject').value.trim(), message = $('#msgBody').value.trim();
    if (!subject || !message) return P.toast('Please add a subject and a message.', true);
    const btn = $('#msgSend'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await P.api('emp.message', { subject, message });
      $('#msgSubject').value = ''; $('#msgBody').value = ''; $$('#msgChips .chip').forEach(x => x.classList.remove('on'));
      P.toast('Message sent — your manager can reply by email.');
    } catch (e) { P.toast(e.message, true); }
    finally { btn.disabled = false; btn.textContent = 'Send Message'; }
  };
})();
