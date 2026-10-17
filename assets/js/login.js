/* ==========================================================================
   LWH PTO — shared sign-in screen (employee + manager)
   ========================================================================== */
(function () {
  'use strict';
  const P = window.PTO;

  /**
   * P.renderLogin(el, { role: 'employee'|'manager', title, subtitle, rememberDefault, onSuccess(session) })
   */
  P.renderLogin = function (el, opts) {
    const role = opts.role;
    el.innerHTML =
      '<div class="login-wrap"><div class="login-card"><div class="card-body">' +
      '<h1>' + P.esc(opts.title) + '</h1><p class="sub">' + P.esc(opts.subtitle) + '</p>' +
      '<div class="note bad" id="lgErr" hidden style="margin-bottom:16px"></div>' +
      '<div class="field"><label for="lgSearch">Your name</label>' +
      '<input class="input" id="lgSearch" placeholder="Type to search…" autocomplete="off" style="margin-bottom:8px">' +
      '<select class="input" id="lgName"><option value="">Loading names…</option></select></div>' +
      '<div class="field"><label for="lgPin" id="lgPinLbl">4-digit PIN</label>' +
      '<input class="input pin" id="lgPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••"></div>' +
      '<div class="field" id="lgPin2Wrap" hidden><label for="lgPin2">Confirm new PIN</label>' +
      '<input class="input pin" id="lgPin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••"></div>' +
      '<div class="note" id="lgNew" hidden style="margin-bottom:14px">First time here? Choose a 4-digit PIN. You’ll use it every time you sign in.</div>' +
      '<label class="check"><input type="checkbox" id="lgRemember"' + (opts.rememberDefault ? ' checked' : '') + '> Keep me signed in on this device</label>' +
      '<button class="btn btn-red btn-block" id="lgBtn">Sign in</button>' +
      '<div class="login-foot">' + P.esc(opts.footer || 'Forgot your PIN? Ask HR to reset it.') + '</div>' +
      '</div></div></div>';

    const sel = P.$('#lgName', el), search = P.$('#lgSearch', el), pin = P.$('#lgPin', el), pin2 = P.$('#lgPin2', el);
    const btn = P.$('#lgBtn', el), err = P.$('#lgErr', el);
    let people = [], creating = false, checkSeq = 0;
    const lastKey = 'lwhpto_last_' + role;

    const showErr = m => { err.textContent = m; err.hidden = !m; };
    function fill(list) {
      const keep = sel.value || (P.store.get(lastKey) || '');
      sel.innerHTML = '<option value="">— Select your name —</option>' +
        list.map(p => '<option value="' + P.esc(p.id) + '">' + P.esc(p.name) + '</option>').join('');
      if (keep && list.some(p => p.id === keep)) { sel.value = keep; onPick(); }
    }
    function setMode(isNew) {
      creating = isNew;
      P.$('#lgPin2Wrap', el).hidden = !isNew;
      P.$('#lgNew', el).hidden = !isNew;
      P.$('#lgPinLbl', el).textContent = isNew ? 'Create a 4-digit PIN' : '4-digit PIN';
      btn.textContent = isNew ? 'Create PIN & sign in' : 'Sign in';
    }
    async function onPick() {
      showErr('');
      setMode(false);
      const id = sel.value; if (!id) return;
      const seq = ++checkSeq;
      try {
        const r = await P.api('hasPin', { id });
        if (seq === checkSeq) setMode(!r.exists);
      } catch (e) { /* login will surface errors */ }
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      fill(q ? people.filter(p => p.name.toLowerCase().includes(q)) : people);
      if (q) { const m = people.filter(p => p.name.toLowerCase().includes(q)); if (m.length === 1) { sel.value = m[0].id; onPick(); } }
    });
    sel.addEventListener('change', onPick);
    [pin, pin2].forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); }));
    pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    pin2.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    btn.addEventListener('click', go);

    async function go() {
      showErr('');
      const id = sel.value, p = pin.value;
      if (!id) return showErr('Please select your name.');
      if (!/^\d{4}$/.test(p)) return showErr('PIN must be exactly 4 digits.');
      if (creating && p !== pin2.value) return showErr('The two PINs don’t match.');
      btn.disabled = true; btn.textContent = creating ? 'Creating…' : 'Signing in…';
      try {
        const s = await P.api(creating ? 'setupPin' : 'login', { id, pin: p, role });
        P.store.set(lastKey, id, true);
        P.saveSession(s, P.$('#lgRemember', el).checked);
        opts.onSuccess(s); // replaces this screen
      } catch (e) {
        showErr(e.message);
        pin.value = ''; pin2.value = ''; pin.focus();
        btn.disabled = false; setMode(creating);
      }
    }

    P.api(role === 'manager' ? 'managers' : 'employees')
      .then(list => { people = list || []; fill(people); if (!people.length) showErr('No names found.'); })
      .catch(e => { sel.innerHTML = '<option value="">Unavailable</option>'; showErr(e.message); });
  };
})();
