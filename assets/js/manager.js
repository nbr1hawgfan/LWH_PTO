/* ==========================================================================
   LWH PTO — Manager app
   ========================================================================== */
(function () {
  'use strict';
  const P = window.PTO, $ = P.$, $$ = P.$$, esc = P.esc;
  const VIEWS = ['home', 'approvals', 'calendar', 'record', 'balances', 'analytics', 'hr'];
  const LOW = P.CFG.LOW_BALANCE_DAYS || 2;
  const S = {
    profile: null, employees: [], empById: {}, types: [], team: [], teamById: {}, requests: [], hrEmails: [],
    loadedAt: 0, scope: 'all', calMonth: new Date(P.today().getFullYear(), P.today().getMonth(), 1), calSel: P.today(),
    balSort: { key: 'name', dir: 'asc' }, hrSort: { key: '_s', dir: 'desc' }, anRows: []
  };

  // ---------------------------------------------------------------- boot
  P.renderChrome({ root: '../', sub: 'PTO Manager Portal' });
  P.watchOnline();
  P.registerSW('sw.js');
  P.onExpired = () => showLogin();
  if (P.initSession('manager')) startApp(); else showLogin();

  function showLogin() {
    $('#app').hidden = true; $('#nav').hidden = true; P.setWho('');
    const el = $('#login'); el.hidden = false;
    P.renderLogin(el, {
      role: 'manager', title: 'Manager Sign In', subtitle: 'Managers only. Select your name and enter your PIN.',
      rememberDefault: false, footer: 'Manager sessions sign out automatically after 12 hours.', onSuccess: () => startApp()
    });
  }
  function startApp() {
    const s = P.getSession();
    $('#login').hidden = true; $('#login').innerHTML = '';
    $('#app').hidden = false; $('#nav').hidden = false;
    S.profile = s.profile;
    P.setWho(s.profile.name);
    setWelcome();
    P.renderWeather($('#wxBox'));
    fillYears();
    go(location.hash.replace('#', ''), true);
    load();
  }
  function setWelcome() {
    $('#welcome').textContent = 'Welcome back, ' + P.firstName(S.profile && S.profile.name);
    $('#welcomeSub').textContent = P.greeting() + ' — here’s what’s happening with time off today.';
    $('#todayLbl').textContent = P.fmt(P.today(), 'long');
  }

  async function load(quiet) {
    try {
      const d = await P.api('mgr.bootstrap');
      S.employees = (d.employees || []).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      S.empById = {}; S.employees.forEach(e => S.empById[e.id] = e);
      S.types = d.absenceTypes || [];
      S.team = d.team || []; S.teamById = {}; S.team.forEach(t => S.teamById[t.id] = t);
      S.hrEmails = d.hrEmails || [];
      S.requests = (d.requests || []).map(r => {
        const e = S.empById[r.employeeId] || {};
        return Object.assign(r, { _s: P.parseAnyDate(r.startDate), _e: P.parseAnyDate(r.endDate) || P.parseAnyDate(r.startDate), _dept: e.department || '', _mgr: e.manager || '' });
      });
      S.loadedAt = Date.now();
      fillFilters();
      renderAll();
    } catch (e) {
      if (!quiet) P.toast(e.message, true);
      if (!S.loadedAt) $('#outToday').innerHTML = '<div class="card-body"><div class="note bad">' + esc(e.message) + '</div></div>';
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && P.getSession() && Date.now() - S.loadedAt > 90000) { setWelcome(); load(true); }
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-refresh]')) { P.toast('Refreshing…'); load(); } });

  function renderAll() {
    renderHome(); renderApprovals(); renderCalendar(); renderBalances(); renderAnalytics(true); renderHR(); renderRecordPreview();
    const pend = S.requests.filter(r => r.status === 'Pending').length;
    const pc = $('#pendCount'); pc.textContent = pend; pc.hidden = !pend;
  }

  // --------------------------------------------------------------- routing
  function go(view, replace) {
    if (VIEWS.indexOf(view) === -1) view = 'home';
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + view));
    $$('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const btn = $('#nav [data-view="' + view + '"]'); if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (replace) history.replaceState(null, '', '#' + view); else if (location.hash !== '#' + view) history.pushState(null, '', '#' + view);
    window.scrollTo(0, 0);
    if (view === 'analytics') renderAnalytics();
  }
  window.addEventListener('popstate', () => go(location.hash.replace('#', ''), true));
  $$('#nav [data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
  document.addEventListener('click', e => { const t = e.target.closest('[data-go]'); if (t) go(t.dataset.go); });
  $('#logoutBtn').onclick = async () => {
    if (await P.confirmBox('Sign out?', '<p>You’ll need your PIN to sign back in.</p>', 'Sign out', 'btn-black')) {
      P.clearSession(); location.hash = ''; showLogin();
    }
  };

  // ----------------------------------------------------------------- utils
  const active = r => r.status === 'Approved' || r.status === 'Pending';
  function balanceOf(id) { const t = S.teamById[id]; return t ? P.num(t.remaining) : null; }
  function isMine(r) {
    const me = S.profile || {};
    const byEmail = me.email && r.managerEmail && String(r.managerEmail).toLowerCase() === String(me.email).toLowerCase();
    const byName = me.name && r._mgr && String(r._mgr).toLowerCase() === String(me.name).toLowerCase();
    return byEmail || byName;
  }
  function personRow(r, right) {
    return '<div data-detail="' + esc(r.requestId) + '" style="cursor:pointer"><div class="avatar">' + esc(P.initials(r.employeeName)) + '</div>' +
      '<div style="min-width:0"><div class="who-n">' + esc(r.employeeName) + '</div><div class="who-m">' + esc(r.absenceType) + (r._dept ? ' · ' + esc(r._dept) : '') + '</div></div>' +
      '<div class="right">' + right + '</div></div>';
  }
  const emptyBox = (icon, msg) => '<div class="empty"><div class="e">' + icon + '</div>' + msg + '</div>';

  // ------------------------------------------------------------------ home
  function renderHome() {
    const t = P.today();
    // on weekends, "this week" means the coming work week
    const mon = t.getDay() === 6 ? P.addDays(t, 2) : t.getDay() === 0 ? P.addDays(t, 1) : P.addDays(t, -(t.getDay() - 1));
    const fri = P.addDays(mon, 4);
    const approved = S.requests.filter(r => r.status === 'Approved' && r._s);
    const outToday = approved.filter(r => r._s <= t && r._e >= t);
    const outWeekIds = new Set(approved.filter(r => r._s <= fri && r._e >= mon).map(r => r.employeeId));
    const low = S.team.filter(e => P.num(e.remaining) <= LOW);
    const pend = S.requests.filter(r => r.status === 'Pending').sort((a, b) => (a._s || 0) - (b._s || 0));
    $('#tPend').textContent = pend.length;
    $('#tToday').textContent = outToday.length;
    $('#tTodayH').textContent = outToday.length ? outToday.slice(0, 3).map(r => P.firstName(r.employeeName)).join(', ') + (outToday.length > 3 ? '…' : '') : 'Everyone’s in';
    $('#tWeek').textContent = outWeekIds.size;
    $('#tWeekH').textContent = P.fmt(mon, 'md') + ' – ' + P.fmt(fri, 'md');
    $('#tLow').textContent = low.length;
    $('#tLowH').textContent = 'At or under ' + LOW + ' days';

    $('#outToday').innerHTML = outToday.length
      ? '<div class="plist">' + outToday.map(r => personRow(r, '<div style="font-weight:600">' + (P.sameDay(r._s, r._e) ? 'Today' : 'Back after ' + P.fmt(r._e, 'md')) + '</div><div class="who-m">' + P.days1(r.daysCount) + ' day(s)</div>')).join('') + '</div>'
      : emptyBox('✅', 'No one is out today.');

    const end = P.addDays(t, 14);
    const soon = S.requests.filter(r => active(r) && r._s && r._s > t && r._s <= end).sort((a, b) => a._s - b._s);
    $('#outSoon').innerHTML = soon.length
      ? '<div class="plist">' + soon.slice(0, 12).map(r => personRow(r, '<div style="font-weight:600">' + esc(P.fmtRange(r._s, r._e).replace(/, \d{4}$/, '')) + '</div><div class="who-m">' + (r.status === 'Pending' ? P.badge('Pending') : P.days1(r.daysCount) + ' day(s)') + '</div>')).join('') + '</div>'
      : emptyBox('📅', 'Nothing scheduled in the next two weeks.');

    $('#pendPreview').innerHTML = pend.length
      ? '<div class="plist">' + pend.slice(0, 5).map(r => personRow(r, '<div style="font-weight:600">' + esc(P.fmt(r._s, 'md')) + '</div><div class="who-m">' + P.days1(r.daysCount) + ' day(s)</div>')).join('') + '</div>'
      : emptyBox('👍', 'No pending requests.');
  }

  // ------------------------------------------------------------- approvals
  $$('#apScope .chip').forEach(c => c.onclick = () => {
    S.scope = c.dataset.s; $$('#apScope .chip').forEach(x => x.classList.toggle('on', x === c)); renderApprovals();
  });
  function renderApprovals() {
    let pend = S.requests.filter(r => r.status === 'Pending');
    if (S.scope === 'mine') pend = pend.filter(isMine);
    pend.sort((a, b) => (a._s || 0) - (b._s || 0));
    $('#apCount').textContent = pend.length + ' pending';
    $('#apList').innerHTML = pend.length ? pend.map(r => {
      const bal = balanceOf(r.employeeId), days = P.num(r.daysCount), pto = P.isPTO(r.absenceType);
      const after = bal == null ? null : bal - days;
      const others = S.requests.filter(x => x !== r && x.status === 'Approved' && x._s && x._s <= r._e && x._e >= r._s && x._dept && x._dept === r._dept);
      return '<div class="req"><div class="stripe"></div><div>' +
        '<div class="t">' + esc(r.employeeName) + ' <span style="font-weight:500;color:var(--muted);font-size:13.5px">' + esc(r._dept) + '</span></div>' +
        '<div class="d"><b>' + esc(r.absenceType) + '</b> · ' + esc(P.fmtRange(r._s, r._e)) + '</div>' +
        '<div class="m">Submitted ' + esc(r.submittedDate || '—') + ' by ' + esc(r.submittedBy || 'Employee') +
        (pto && bal != null ? ' · Balance ' + P.days1(bal) + ' → <b style="color:' + (after < 0 ? 'var(--red)' : after <= LOW ? '#A85F00' : 'var(--green)') + '">' + P.days1(after) + '</b>' : '') + '</div>' +
        (r.notes ? '<div class="n">' + P.escNote(r.notes) + '</div>' : '') +
        (others.length ? '<div class="note warn" style="margin-top:8px;font-size:13px">Also out from ' + esc(r._dept) + ': ' + others.map(o => esc(o.employeeName) + ' (' + esc(P.fmtRange(o._s, o._e).replace(/, \d{4}$/, '')) + ')').join(', ') + '</div>' : '') +
        (pto && after != null && after < 0 ? '<div class="note bad" style="margin-top:8px;font-size:13px">Approving would put this balance below zero.</div>' : '') +
        '</div><div class="act"><div class="days">' + P.days1(days) + '<small>day' + (days === 1 ? '' : 's') + '</small></div>' +
        '<div class="btn-row"><button class="btn btn-green btn-sm" data-approve="' + esc(r.requestId) + '">Approve</button>' +
        '<button class="btn btn-red btn-sm" data-deny="' + esc(r.requestId) + '">Deny</button></div></div></div>';
    }).join('') : emptyBox('✅', S.scope === 'mine' ? 'No pending requests for your team.' : 'No pending approvals. Nice work.');

    const recent = S.requests.filter(r => (r.status === 'Approved' || r.status === 'Denied') && r.decisionDate && r.approvedBy !== 'Auto-Approved')
      .sort((a, b) => (P.parseAnyDate(b.decisionDate) || 0) - (P.parseAnyDate(a.decisionDate) || 0)).slice(0, 8);
    $('#apRecent').innerHTML = recent.length ? '<div class="plist">' + recent.map(r => personRow(r,
      P.badge(r.status) + '<div class="who-m">' + esc(r.decisionDate) + (r.approvedBy ? ' · ' + esc(r.approvedBy) : '') + '</div>')).join('') + '</div>'
      : emptyBox('🗂️', 'No recent decisions.');
  }

  document.addEventListener('click', async e => {
    const a = e.target.closest('[data-approve]'), d = e.target.closest('[data-deny]');
    if (!a && !d) return;
    const id = (a || d).dataset.approve || (a || d).dataset.deny;
    const r = S.requests.find(x => String(x.requestId) === id); if (!r) return;
    const summary = '<dl class="kv"><dt>Employee</dt><dd>' + esc(r.employeeName) + '</dd><dt>Type</dt><dd>' + esc(r.absenceType) + '</dd>' +
      '<dt>Dates</dt><dd>' + esc(P.fmtRange(r._s, r._e)) + '</dd><dt>Days</dt><dd>' + P.days1(r.daysCount) + '</dd></dl>';
    if (a) {
      const bal = balanceOf(r.employeeId), pto = P.isPTO(r.absenceType);
      const ok = await P.confirmBox('Approve Request?', summary +
        (pto && bal != null ? '<div class="note" style="margin-top:14px">Balance goes from <b>' + P.days1(bal) + '</b> to <b>' + P.days1(bal - P.num(r.daysCount)) + '</b> days.</div>' : '') +
        '<p class="hint" style="margin-top:12px">Emails + the PDF record go out automatically. This takes a few seconds.</p>', 'Approve', 'btn-green');
      if (!ok) return;
      P.busy('Approving…');
      try { await P.api('mgr.approve', { requestId: id }, { timeout: 90000 }); P.busy(false); P.toast('Approved — ' + r.employeeName + ' has been notified.'); load(); }
      catch (err) { P.busy(false); P.toast(err.message, true); load(true); }
    } else {
      const reason = await P.modal({
        title: 'Deny Request',
        html: summary + '<div class="field" style="margin-top:16px"><label for="dnReason">Reason (sent to the employee)</label><textarea class="input" id="dnReason" maxlength="500"></textarea></div>',
        buttons: [{ label: 'Cancel', cls: 'btn-ghost', value: null },
          { label: 'Deny', cls: 'btn-red', validate: m => $('#dnReason', m).value.trim() ? '' : 'A reason is required.', value: m => $('#dnReason', m).value.trim() }]
      });
      if (!reason) return;
      P.busy('Denying…');
      try { await P.api('mgr.deny', { requestId: id, reason }); P.busy(false); P.toast('Denied — ' + r.employeeName + ' has been notified.'); load(); }
      catch (err) { P.busy(false); P.toast(err.message, true); load(true); }
    }
  });

  // --------------------------------------------------------- detail modal
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-detail]'); if (!el) return;
    if (e.target.closest('button')) return;
    const r = S.requests.find(x => String(x.requestId) === el.dataset.detail); if (!r) return;
    const bal = balanceOf(r.employeeId);
    P.modal({
      title: r.employeeName,
      html: '<dl class="kv">' +
        '<dt>Status</dt><dd>' + P.badge(r.status) + '</dd>' +
        '<dt>Type</dt><dd><b>' + esc(r.absenceType) + '</b></dd>' +
        '<dt>Dates</dt><dd>' + esc(P.sameDay(r._s, r._e) ? P.fmt(r._s, 'long') : P.fmt(r._s, 'long') + ' → ' + P.fmt(r._e, 'long')) + '</dd>' +
        '<dt>Days</dt><dd>' + P.days1(r.daysCount) + '</dd>' +
        '<dt>Department</dt><dd>' + esc(r._dept || '—') + '</dd>' +
        (bal != null ? '<dt>PTO balance</dt><dd>' + P.days1(bal) + ' days</dd>' : '') +
        '<dt>Submitted</dt><dd>' + esc(r.submittedDate || '—') + ' by ' + esc(r.submittedBy || '—') + '</dd>' +
        (r.approvedBy ? '<dt>Decided by</dt><dd>' + esc(r.approvedBy) + (r.decisionDate ? ' · ' + esc(r.decisionDate) : '') + '</dd>' : '') +
        (r.denialReason ? '<dt>' + (r.status === 'Cancelled' ? 'Withdraw reason' : 'Denial reason') + '</dt><dd>' + P.escNote(r.denialReason) + '</dd>' : '') +
        '<dt>Request ID</dt><dd style="font-family:monospace;font-size:13px">' + esc(r.requestId) + '</dd></dl>' +
        (r.notes ? '<div class="note warn" style="margin-top:14px"><b>Notes:</b> ' + P.escNote(r.notes) + '</div>' : ''),
      buttons: r.status === 'Pending'
        ? [{ label: 'Close', cls: 'btn-ghost', value: null }, { label: 'Go to approvals', cls: 'btn-black', value: 'ap' }]
        : [{ label: 'Close', cls: 'btn-black', value: null }]
    }).then(v => { if (v === 'ap') go('approvals'); });
  });

  // -------------------------------------------------------------- calendar
  $('#calPrev').onclick = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1); renderCalendar(); };
  $('#calNext').onclick = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1); renderCalendar(); };
  $('#calToday').onclick = () => { const t = P.today(); S.calMonth = new Date(t.getFullYear(), t.getMonth(), 1); S.calSel = t; renderCalendar(); };
  $('#calDept').onchange = renderCalendar;
  $('#calPending').onchange = renderCalendar;

  function calEvents() {
    const dept = $('#calDept').value, withPend = $('#calPending').checked;
    return S.requests.filter(r => r._s && (r.status === 'Approved' || (withPend && r.status === 'Pending')) && (!dept || r._dept === dept));
  }
  function renderCalendar() {
    const m = S.calMonth, t = P.today();
    $('#calMonth').textContent = P.MONTH[m.getMonth()] + ' ' + m.getFullYear();
    const start = P.addDays(m, -m.getDay());
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const end = P.addDays(last, 6 - last.getDay());
    const evs = calEvents().filter(r => r._s <= end && r._e >= start).sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));
    let html = P.DOW.map(d => '<div class="dow">' + d + '</div>').join('');
    for (let d = start; d <= end; d = P.addDays(d, 1)) {
      const w = d.getDay(), hol = P.holidayName(d);
      const weekend = w === 0 || w === 6;
      // multi-day requests skip weekends on the grid; single-day entries always show
      const day = evs.filter(r => r._s <= d && r._e >= d && (!weekend || P.sameDay(r._s, r._e)));
      const cls = ['day'];
      if (d.getMonth() !== m.getMonth()) cls.push('out');
      if (weekend) cls.push('wknd');
      if (P.sameDay(d, t)) cls.push('today');
      if (P.sameDay(d, S.calSel)) cls.push('sel');
      const shown = day.slice(0, 3);
      html += '<div class="' + cls.join(' ') + '" data-day="' + P.ymd(d) + '"><span class="num">' + d.getDate() + '</span>' +
        (hol ? '<div class="hol">' + esc(hol) + '</div>' : '') +
        shown.map(r => '<span class="ev ' + P.typeClass(r.absenceType) + (r.status === 'Pending' ? ' pending' : '') + '" data-detail="' + esc(r.requestId) + '" title="' + esc(r.employeeName + ' — ' + r.absenceType + ' (' + r.status + ')') + '">' + esc(P.firstName(r.employeeName)) + ' ' + esc((r.employeeName.split(' ').slice(-1)[0] || '').charAt(0)) + '.</span>').join('') +
        (day.length > 3 ? '<span class="ev more">+' + (day.length - 3) + ' more</span>' : '') +
        (day.length ? '<div class="cal-dots">' + day.slice(0, 6).map(() => '<i></i>').join('') + '</div>' : '') +
        '</div>';
    }
    $('#calGrid').innerHTML = html;
    renderDay();
  }
  $('#calGrid').addEventListener('click', e => {
    if (e.target.closest('[data-detail]') && window.innerWidth > 720) return; // modal handler takes it
    const cell = e.target.closest('[data-day]'); if (!cell) return;
    S.calSel = P.parseAnyDate(cell.dataset.day);
    $$('#calGrid .day').forEach(c => c.classList.toggle('sel', c === cell));
    renderDay();
    if (window.innerWidth <= 720) $('#dayTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function renderDay() {
    const d = S.calSel;
    $('#dayTitle').textContent = P.fmt(d, 'long');
    const hol = P.holidayName(d);
    const list = calEvents().filter(r => r._s <= d && r._e >= d);
    $('#dayList').innerHTML = (hol ? '<div class="card-body" style="padding-bottom:0"><div class="note">🎉 ' + esc(hol) + ' — company holiday.</div></div>' : '') +
      (list.length ? '<div class="plist">' + list.map(r => personRow(r, P.badge(r.status) + '<div class="who-m">' + esc(P.fmtRange(r._s, r._e).replace(/, \d{4}$/, '')) + '</div>')).join('') + '</div>'
        : emptyBox('👍', 'No one out this day.'));
  }

  // ---------------------------------------------------------------- record
  const reMin = P.ymd(P.addDays(P.today(), -(P.CFG.PAST_DAYS_ALLOWED || 180)));
  $('#reStart').min = reMin; $('#reEnd').min = reMin;
  function fillRecordSelects() {
    const q = $('#reSearch').value.trim().toLowerCase(), cur = $('#reEmp').value;
    const list = q ? S.employees.filter(e => String(e.name).toLowerCase().includes(q)) : S.employees;
    $('#reEmp').innerHTML = '<option value="">— Select employee —</option>' + list.map(e => '<option value="' + esc(e.id) + '">' + esc(e.name) + (e.department ? ' (' + esc(e.department) + ')' : '') + '</option>').join('');
    if (list.some(e => e.id === cur)) $('#reEmp').value = cur; else if (q && list.length === 1) $('#reEmp').value = list[0].id;
    const ct = $('#reType').value;
    $('#reType').innerHTML = '<option value="">— Select type —</option>' + S.types.map(t => '<option>' + esc(t.name) + '</option>').join('');
    if (ct) $('#reType').value = ct;
  }
  $('#reSearch').addEventListener('input', () => { fillRecordSelects(); renderRecordPreview(); });
  ['reEmp', 'reType', 'reEnd', 'reT1', 'reT2'].forEach(id => $('#' + id).addEventListener('change', () => { updateRecordForm(); renderRecordPreview(); }));
  $('#reStart').addEventListener('change', () => {
    const s = $('#reStart').value, e = $('#reEnd');
    if (s && (!e.value || e.value < s)) e.value = s;
    renderRecordPreview();
  });
  $$('#reChips .chip').forEach(c => c.onclick = () => { const ta = $('#reReason'), v = c.textContent.trim(); ta.value = ta.value.trim() ? ta.value.trim() + ' — ' + v : v; ta.focus(); });
  $('#reClear').onclick = () => { ['reSearch', 'reStart', 'reEnd', 'reT1', 'reT2', 'reReason'].forEach(id => $('#' + id).value = ''); $('#reEmp').value = ''; $('#reType').value = ''; fillRecordSelects(); updateRecordForm(); renderRecordPreview(); };

  function updateRecordForm() {
    const t = $('#reType').value.toLowerCase();
    const half = t.includes('half');
    $('#reEndWrap').hidden = half;
    $('#reStartLbl').textContent = half ? 'Date' : 'Start date';
    $('#reTimeWrap').hidden = !(t.includes('personal') || t.includes('call'));
  }
  function recordCalc() {
    const emp = $('#reEmp').value, type = $('#reType').value, s = $('#reStart').value;
    const half = type.toLowerCase().includes('half');
    const e = half ? s : ($('#reEnd').value || s);
    const t1 = $('#reTimeWrap').hidden ? '' : $('#reT1').value, t2 = $('#reTimeWrap').hidden ? '' : $('#reT2').value;
    let days = 0, bd = null;
    if (s) {
      bd = P.businessDays(s, e);
      if (type === 'Half Day PTO') days = 0.5;
      else if (/personal/i.test(type) && t1 && t2) { const [h1, m1] = t1.split(':').map(Number), [h2, m2] = t2.split(':').map(Number); days = Math.round((((h2 * 60 + m2) - (h1 * 60 + m1)) / 60 / 8) * 100) / 100; }
      else days = bd.days;
    }
    return { emp, type, s, e, t1, t2, days, bd, half, pto: P.isPTO(type) };
  }
  function renderRecordPreview() {
    const c = recordCalc(), emp = S.empById[c.emp], bal = c.emp ? balanceOf(c.emp) : null;
    let html = '<dl class="kv"><dt>Employee</dt><dd>' + (emp ? esc(emp.name) : '—') + '</dd>' +
      (bal != null ? '<dt>PTO balance</dt><dd>' + P.days1(bal) + ' days</dd>' : '') +
      '<dt>Type</dt><dd>' + (c.type ? esc(c.type) : '—') + '</dd>' +
      '<dt>Dates</dt><dd>' + (c.s ? esc(c.half ? P.fmt(c.s, 'long') : P.fmtRange(c.s, c.e)) : '—') + '</dd>' +
      (c.t1 && c.t2 ? '<dt>Time</dt><dd>' + esc(c.t1 + ' – ' + c.t2) + '</dd>' : '') +
      '<dt>Counts as</dt><dd><b>' + (c.s && c.type ? P.days1(c.days) + ' day(s)' : '—') + '</b></dd></dl>';
    const notes = [];
    if (c.type) notes.push(c.pto ? '<div class="note warn">PTO type — this will be <b>Pending</b> until approved, then deducted.</div>'
      : '<div class="note good">Recorded as <b>approved</b> immediately — does not touch the PTO balance.</div>');
    if (c.pto && bal != null && c.s && c.days > bal) notes.push('<div class="note bad">Not enough PTO — needs ' + P.days1(c.days) + ', balance ' + P.days1(bal) + '.</div>');
    if (c.bd && c.bd.holidays.length) notes.push('<div class="note">Company holiday not counted: ' + esc(c.bd.holidays.join(', ')) + '.</div>');
    if (c.emp && c.s) {
      const sd = P.parseAnyDate(c.s), ed = P.parseAnyDate(c.e);
      const ov = S.requests.filter(r => r.employeeId === c.emp && active(r) && r._s && r._s <= ed && r._e >= sd);
      if (ov.length) notes.push('<div class="note warn">Already on file for these dates: ' + ov.map(r => esc(r.absenceType + ' ' + P.fmtRange(r._s, r._e) + ' (' + r.status + ')')).join('; ') + '</div>');
    }
    $('#rePreview').innerHTML = html + (notes.length ? '<div style="margin-top:16px">' + notes.join('') + '</div>' : '');
  }

  $('#reSubmit').onclick = async () => {
    const c = recordCalc(), reason = $('#reReason').value.trim();
    if (!c.emp || !c.type || !c.s) return P.toast('Pick an employee, type and date.', true);
    if (!c.half && c.e < c.s) return P.toast('End date can’t be before start date.', true);
    if (!reason) return P.toast('Please add a reason.', true);
    const emp = S.empById[c.emp], bal = balanceOf(c.emp);
    if (c.pto && bal != null && c.days > bal) {
      return P.alertBox('Not Enough PTO', '<p>' + esc(emp.name) + ' needs <b>' + P.days1(c.days) + '</b> day(s) but has <b>' + P.days1(bal) + '</b>.</p><p style="margin-top:10px">Choose a different absence type or adjust the dates.</p>');
    }
    const btn = $('#reSubmit'); btn.disabled = true;
    try {
      const dups = await P.api('mgr.checkDup', { employeeId: c.emp, startDate: c.s, endDate: c.e });
      if (dups && dups.length) {
        const go2 = await P.confirmBox('Possible Duplicate', '<p>' + esc(emp.name) + ' already has ' + dups.length + ' request(s) on these dates:</p>' +
          '<div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead><tbody>' +
          dups.map(d => '<tr><td>' + esc(d.absenceType) + '</td><td>' + esc(P.fmtRange(d.startDate, d.endDate)) + '</td><td>' + P.days1(d.daysCount) + '</td><td>' + P.badge(d.status) + '</td></tr>').join('') +
          '</tbody></table></div><p class="hint" style="margin-top:12px">Only continue if this is a different or corrected entry.</p>', 'Record anyway', 'btn-red');
        if (!go2) return;
      }
      P.busy('Recording…');
      const res = await P.api('mgr.record', { employeeId: c.emp, absenceType: c.type, startDate: c.s, endDate: c.e, reason, startTime: c.t1, endTime: c.t2 }, { timeout: 90000 });
      P.busy(false);
      P.toast('Recorded for ' + emp.name + ' — ' + P.days1(res.daysCount) + ' day(s). ' + (res.message || ''));
      $('#reClear').click();
      load();
    } catch (e) { P.busy(false); P.toast(e.message, true); }
    finally { btn.disabled = false; }
  };

  // -------------------------------------------------------------- balances
  ['balDept', 'balMgr'].forEach(id => $('#' + id).onchange = renderBalances);
  $('#balSearch').addEventListener('input', renderBalances);
  function balRows() {
    const dept = $('#balDept').value, mgr = $('#balMgr').value, q = $('#balSearch').value.trim().toLowerCase();
    return P.sortRows(S.team.filter(e => (!dept || e.department === dept) && (!mgr || e.manager === mgr) && (!q || String(e.name).toLowerCase().includes(q)))
      .map(e => Object.assign({}, e, { allocated: P.num(e.allocated), used: P.num(e.used), remaining: P.num(e.remaining) })), S.balSort.key, S.balSort.dir);
  }
  function renderBalances() {
    const rows = balRows();
    const cols = [['name', 'Employee'], ['department', 'Department'], ['manager', 'Manager'], ['allocated', 'Allocated', 1], ['used', 'Used', 1], ['remaining', 'Remaining', 1]];
    $('#balSub').textContent = rows.length + ' employee' + (rows.length === 1 ? '' : 's') + ' · red = ' + LOW + ' days or less';
    $('#balTable').innerHTML = rows.length ? '<table class="tbl"><thead><tr>' + cols.map(c => '<th class="sortable ' + (S.balSort.key === c[0] ? S.balSort.dir : '') + (c[2] ? ' num' : '') + '" data-sort="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(e => '<tr><td><b>' + esc(e.name) + '</b></td><td>' + esc(e.department) + '</td><td>' + esc(e.manager) + '</td><td class="num">' + P.days1(e.allocated) + '</td><td class="num">' + P.days1(e.used) + '</td><td class="num ' + (e.remaining <= LOW ? 'low' : '') + '"><b>' + P.days1(e.remaining) + '</b></td></tr>').join('') +
      '</tbody></table>' : emptyBox('🔍', 'No employees match.');
  }
  $('#balTable').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    S.balSort = { key: th.dataset.sort, dir: S.balSort.key === th.dataset.sort && S.balSort.dir === 'asc' ? 'desc' : 'asc' };
    renderBalances();
  });
  $('#balCsv').onclick = () => P.downloadCSV('PTO_Balances_' + P.ymd(P.today()) + '.csv', ['Employee', 'Department', 'Manager', 'Allocated', 'Used', 'Remaining'],
    balRows().map(e => [e.name, e.department, e.manager, e.allocated, e.used, e.remaining]));
  $('#balEmail').onclick = async () => {
    if (!(await P.confirmBox('Email PTO Report', '<p>Send the team PTO balance report to <b>' + esc(S.profile.email || 'your email') + '</b>?</p>', 'Send', 'btn-black'))) return;
    P.busy('Sending…');
    try { await P.api('mgr.exportTeam'); P.busy(false); P.toast('PTO report sent to your email.'); } catch (e) { P.busy(false); P.toast(e.message, true); }
  };

  // ------------------------------------------------------------- analytics
  function fillYears() {
    const y = new Date().getFullYear();
    const opts = Array.from({ length: 6 }, (_, i) => '<option>' + (y - i) + '</option>').join('');
    $('#anYear').innerHTML = opts; $('#hrYear').innerHTML = opts;
  }
  ['anDept', 'anYear'].forEach(id => $('#' + id).onchange = () => renderAnalytics());
  $('#anEmp').onchange = () => drawAnalytics();
  let anSeq = 0;
  async function renderAnalytics(silent) {
    if (silent && !$('#v-analytics').classList.contains('active')) return;
    const seq = ++anSeq;
    $('#anTable').innerHTML = '<div class="card-body"><div class="skel"></div><div class="skel"></div></div>';
    try {
      const rows = await P.api('mgr.analytics', { department: $('#anDept').value, year: +$('#anYear').value });
      if (seq !== anSeq) return;
      S.anRows = rows || [];
      drawAnalytics();
    } catch (e) { $('#anTable').innerHTML = '<div class="card-body"><div class="note bad">' + esc(e.message) + '</div></div>'; }
  }
  function anFiltered() { const emp = $('#anEmp').value; return emp ? S.anRows.filter(r => r.employeeId === emp) : S.anRows; }
  function drawAnalytics() {
    const rows = anFiltered(), totals = {};
    let ptoUsed = 0;
    rows.forEach(r => { ptoUsed += P.num(r.ptoAllocated) - P.num(r.ptoRemaining); Object.keys(r.absences || {}).forEach(t => { totals[t] = totals[t] || { count: 0, days: 0 }; totals[t].count += r.absences[t].count; totals[t].days += P.num(r.absences[t].days); }); });
    const types = Object.keys(totals).sort();
    const top = types.slice().sort((a, b) => totals[b].count - totals[a].count).slice(0, 2);
    $('#anTiles').innerHTML = '<div class="tile dark"><div class="k">Employees</div><div class="v">' + rows.length + '</div></div>' +
      '<div class="tile"><div class="k">PTO Used</div><div class="v">' + P.days1(ptoUsed) + '</div><div class="h">days, current balances</div></div>' +
      top.map(t => '<div class="tile amber"><div class="k">' + esc(t) + '</div><div class="v">' + totals[t].count + '</div><div class="h">' + P.days1(totals[t].days) + ' days</div></div>').join('');
    $('#anTable').innerHTML = rows.length ? '<table class="tbl"><thead><tr><th>Employee</th><th>Department</th><th class="num">PTO Used</th>' + types.map(t => '<th class="num">' + esc(t) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.slice().sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName))).map(r => '<tr><td><b>' + esc(r.employeeName) + '</b></td><td>' + esc(r.department) + '</td><td class="num">' + P.days1(P.num(r.ptoAllocated) - P.num(r.ptoRemaining)) + ' / ' + P.days1(r.ptoAllocated) + '</td>' +
        types.map(t => { const a = (r.absences || {})[t]; return '<td class="num">' + (a ? a.count + ' <span style="color:var(--muted)">(' + P.days1(a.days) + 'd)</span>' : '<span style="color:#ccc">–</span>') + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table>' : emptyBox('📈', 'No absence data for this filter.');
  }
  $('#anCsv').onclick = () => {
    const rows = anFiltered(), types = Array.from(new Set([].concat.apply([], rows.map(r => Object.keys(r.absences || {}))))).sort();
    P.downloadCSV('Absence_Summary_' + $('#anYear').value + '.csv', ['Employee', 'Department', 'PTO Allocated', 'PTO Remaining'].concat([].concat.apply([], types.map(t => [t + ' Count', t + ' Days']))),
      rows.map(r => [r.employeeName, r.department, r.ptoAllocated, r.ptoRemaining].concat([].concat.apply([], types.map(t => { const a = (r.absences || {})[t] || { count: 0, days: 0 }; return [a.count, a.days]; })))));
  };
  $('#anEmail').onclick = async () => {
    if (!(await P.confirmBox('Email Absence Report', '<p>Send the ' + new Date().getFullYear() + ' absence summary' + ($('#anDept').value ? ' for <b>' + esc($('#anDept').value) + '</b>' : '') + ' to <b>' + esc(S.profile.email || 'your email') + '</b>?</p>', 'Send', 'btn-black'))) return;
    P.busy('Sending…');
    try { await P.api('mgr.exportAbsence', { department: $('#anDept').value }); P.busy(false); P.toast('Absence report sent to your email.'); } catch (e) { P.busy(false); P.toast(e.message, true); }
  };

  // ------------------------------------------------------------- HR report
  ['hrEmp', 'hrYear', 'hrStatus', 'hrType'].forEach(id => $('#' + id).onchange = renderHR);
  function hrRows() {
    const emp = $('#hrEmp').value, y = +$('#hrYear').value, st = $('#hrStatus').value, ty = $('#hrType').value;
    return P.sortRows(S.requests.filter(r => r._s && (!emp || r.employeeId === emp) && r._s.getFullYear() === y && (!st || r.status === st) && (!ty || r.absenceType === ty)),
      S.hrSort.key, S.hrSort.dir);
  }
  function renderHR() {
    const rows = hrRows(), byType = {};
    let total = 0;
    rows.forEach(r => { byType[r.absenceType] = byType[r.absenceType] || { c: 0, d: 0 }; byType[r.absenceType].c++; byType[r.absenceType].d += P.num(r.daysCount); total += P.num(r.daysCount); });
    const top = Object.keys(byType).sort((a, b) => byType[b].c - byType[a].c).slice(0, 2);
    $('#hrTiles').innerHTML = '<div class="tile dark"><div class="k">Records</div><div class="v">' + rows.length + '</div></div>' +
      '<div class="tile"><div class="k">Total Days</div><div class="v">' + P.days1(total) + '</div></div>' +
      top.map(t => '<div class="tile amber"><div class="k">' + esc(t) + '</div><div class="v">' + byType[t].c + '</div><div class="h">' + P.days1(byType[t].d) + ' days</div></div>').join('');
    const cols = [['employeeName', 'Employee'], ['absenceType', 'Type'], ['_s', 'Start'], ['_e', 'End'], ['daysCount', 'Days', 1], ['status', 'Status'], ['notes', 'Notes'], ['submittedDate', 'Submitted'], ['approvedBy', 'Decided By']];
    $('#hrTable').innerHTML = rows.length ? '<table class="tbl"><thead><tr>' + cols.map(c => '<th class="sortable ' + (S.hrSort.key === c[0] ? S.hrSort.dir : '') + (c[2] ? ' num' : '') + '" data-sort="' + c[0] + '">' + c[1] + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr data-detail="' + esc(r.requestId) + '" style="cursor:pointer"><td><b>' + esc(r.employeeName) + '</b></td><td>' + esc(r.absenceType) + '</td><td>' + esc(P.fmt(r._s)) + '</td><td>' + esc(P.fmt(r._e)) + '</td><td class="num">' + P.days1(r.daysCount) + '</td><td>' + P.badge(r.status) + '</td>' +
        '<td class="clip" title="' + P.escNote(r.notes) + '">' + (r.notes ? P.escNote(r.notes) : '–') + '</td><td>' + esc(r.submittedDate || '') + '</td><td>' + esc(r.approvedBy || '–') + '</td></tr>').join('') +
      '</tbody></table>' : emptyBox('📋', 'No records for this filter.');
  }
  $('#hrTable').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    S.hrSort = { key: th.dataset.sort, dir: S.hrSort.key === th.dataset.sort && S.hrSort.dir === 'asc' ? 'desc' : 'asc' };
    renderHR();
  });
  $('#hrCsv').onclick = () => P.downloadCSV('Absence_Report_' + ($('#hrEmp').value || 'ALL') + '_' + $('#hrYear').value + '.csv',
    ['Request ID', 'Employee ID', 'Employee Name', 'Absence Type', 'Start Date', 'End Date', 'Days', 'Status', 'Notes', 'Submitted Date', 'Submitted By', 'Decision Date', 'Approved By', 'Denial Reason'],
    hrRows().map(r => [r.requestId, r.employeeId, r.employeeName, r.absenceType, P.ymd(r._s), P.ymd(r._e), r.daysCount, r.status, r.notes, r.submittedDate, r.submittedBy, r.decisionDate, r.approvedBy, r.denialReason]));
  $('#hrEmail').onclick = async () => {
    const emp = $('#hrEmp').value, y = $('#hrYear').value;
    const v = await P.modal({
      title: 'Email HR Report',
      html: '<p style="margin-bottom:12px">' + (emp ? esc((S.empById[emp] || {}).name || emp) : 'All employees') + ' · ' + esc(y) + ' · HTML summary + CSV attachment</p>' +
        '<div class="field"><label for="hrTo">Send to (comma-separated)</label><textarea class="input" id="hrTo" style="min-height:70px">' + esc(P.CFG.HR_REPORT_DEFAULT_EMAILS || S.hrEmails.join(', ')) + '</textarea></div>' +
        '<p class="hint">The emailed report includes all statuses for the year (status/type filters only apply on screen).</p>',
      buttons: [{ label: 'Cancel', cls: 'btn-ghost', value: null },
        { label: 'Send', cls: 'btn-black', validate: m => $('#hrTo', m).value.trim() ? '' : 'Enter at least one email.', value: m => $('#hrTo', m).value }]
    });
    if (!v) return;
    P.busy('Sending report…');
    try {
      const res = await P.api('mgr.emailReport', { employeeId: emp, year: +y, emails: v.split(/[,;\s]+/).filter(Boolean) }, { timeout: 90000 });
      P.busy(false);
      if (res && res.success === false) P.toast(res.message || 'No records found.', true); else P.toast((res && res.message) || 'Report sent.');
    } catch (e) { P.busy(false); P.toast(e.message, true); }
  };

  // ------------------------------------------------------------ filter fill
  function fillFilters() {
    const depts = Array.from(new Set(S.employees.map(e => e.department).filter(Boolean))).sort();
    const mgrs = Array.from(new Set(S.employees.map(e => e.manager).filter(Boolean))).sort();
    const setOpts = (id, first, vals, labels) => {
      const el = $('#' + id), cur = el.value;
      el.innerHTML = '<option value="">' + first + '</option>' + vals.map((v, i) => '<option value="' + esc(v) + '">' + esc(labels ? labels[i] : v) + '</option>').join('');
      if (vals.indexOf(cur) !== -1) el.value = cur;
    };
    ['calDept', 'balDept', 'anDept'].forEach(id => setOpts(id, 'All departments', depts));
    setOpts('balMgr', 'All managers', mgrs);
    ['anEmp', 'hrEmp'].forEach(id => setOpts(id, 'All employees', S.employees.map(e => e.id), S.employees.map(e => e.name)));
    setOpts('hrType', 'All types', Array.from(new Set(S.requests.map(r => r.absenceType).filter(Boolean))).sort());
    fillRecordSelects();
  }
})();
