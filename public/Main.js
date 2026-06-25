'use strict';

/**
 * public/Main.js (Home)
 * Patch v3:
 * - Weekly reset hidden when it falls on the SAME LOCAL DAY as Next patch.
 * - Stats count-up animation (0 → target).
 * - Better timers loading UX (no "pop-in" placeholders).
 * - Edit modal smaller: 53vh height, right panel min-h 380.
 *
 * FIXES:
 * - Timers reorder automatically by "nearest to finish".
 * - Patch countdown works during patch (between start and end) even across cycles.
 * - Active tab in modal has NO hover and cannot be clicked again.
 * - Active tab has better visibility (yellow bg, black text).
 * - Left tab buttons are shorter (smaller height).
 * - Timers auto-rebuild when any timer reaches 00 to avoid "stuck at 00:00:00".
 * - Time format:
 *    - minutes left => mm:ss
 *    - seconds left => SS
 */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  // ✅ Admin UI Hide toggle key (per-user)
  const ADMIN_HIDE_KEY = 'sla_hide_admin_buttons';

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) return '';
    return s;
  }

  function isTruthy(v) {
    return v === true || String(v).toLowerCase() === 'true' || String(v) === '1';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ✅ base-path aware API helper (LogIn.js exposes window.url())
  function apiPath(p) {
    try {
      if (typeof window.url === 'function') return window.url(p);
    } catch (_) {}
    return p;
  }

  // ✅ localStorage bool helper (for per-user admin-hide only)
  function loadBoolLS(key, fallback = false) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return fallback;
      return v === '1';
    } catch {
      return fallback;
    }
  }

  // ✅ Read "hide admin buttons" from STATE first (preferred), fallback to localStorage
  function isAdminHidden() {
    try {
      if (window.STATE?.ui && typeof window.STATE.ui.hideAdminButtons !== 'undefined') {
        return !!window.STATE.ui.hideAdminButtons;
      }
    } catch (_) {}
    return loadBoolLS(ADMIN_HIDE_KEY, false);
  }

  // ✅ check admin status (cached if possible)
  async function ensureIsAdmin() {
    // Only trust cached TRUE. Cached false can happen before session/cookies are ready.
    try {
      if (window.STATE && typeof window.STATE.isAdmin === 'boolean' && window.STATE.isAdmin === true) {
        return true;
      }
    } catch (_) {}

    try {
      const r = await fetch(apiPath('/api/admin/is-admin'), {
        cache: 'no-store',
        credentials: 'include'
      });
      const j = await r.json().catch(() => ({}));
      const ok = !!j?.isAdmin;

      try {
        if (window.STATE) {
          window.STATE.isAdmin = ok;
          window.STATE.admin = ok;
        }
        if (document.body?.dataset) document.body.dataset.admin = ok ? '1' : '0';
      } catch (_) {}

      return ok;
    } catch {
      return false;
    }
  }


  // ✅ load per-admin UI prefs early (so Edit buttons don't "pop in" after navigation)
  async function loadAdminUiPrefsIfAdmin(isAdmin) {
    if (!isAdmin) return null;
    try {
      const r = await fetch(apiPath('/api/admin/ui-prefs'), {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      const hide = !!j?.prefs?.hideAdminButtons;

      window.STATE = window.STATE || {};
      window.STATE.ui = window.STATE.ui || {};
      window.STATE.ui.hideAdminButtons = hide;

      // keep LS in sync as a fallback
      try { localStorage.setItem(ADMIN_HIDE_KEY, hide ? '1' : '0'); } catch (_) {}

      return hide;
    } catch (_) {
      return null;
    }
  }

  // ✅ show Edit button only if admin AND NOT hidden
  function updateHomeEditBtnVisibility(isAdmin) {
    const btn = document.getElementById('homeEditTimersBtn');
    if (!btn) return;

    const hide = isAdminHidden();
    const shouldShow = !!isAdmin && !hide;

    btn.style.display = shouldShow ? '' : 'none';
    btn.disabled = !shouldShow;
  }

  function updateHomeCodesEditBtnVisibility(isAdmin) {
    const btn = document.getElementById('homeEditCodesBtn');
    if (!btn) return;

    const hide = isAdminHidden();
    const shouldShow = !!isAdmin && !hide;

    btn.style.display = shouldShow ? '' : 'none';
    btn.disabled = !shouldShow;
  }

  // ✅ fetchJson ALWAYS base-path aware
  async function fetchJson(url) {
    const u = apiPath(url);
    const res = await fetch(u, { cache: 'no-store', credentials: 'include' });
    if (!res.ok) throw new Error(`${u} -> ${res.status}`);
    return res.json();
  }

  // ✅ NEW: smart duration formatting
  function fmtDurationSmart(ms) {
    if (!Number.isFinite(ms)) return '—';
    if (ms < 0) ms = 0;

    const totalSec = Math.floor(ms / 1000);

    if (totalSec < 60) {
      return pad2(totalSec);
    }

    if (totalSec < 3600) {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${pad2(m)}:${pad2(s)}`;
    }

    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const parts = [];
    if (d) parts.push(`${d}d`);
    parts.push(`${pad2(h)}:${pad2(m)}:${pad2(s)}`);
    return parts.join(' ');
  }

  function fmtDurationSmartNoSec(ms) {
    if (!Number.isFinite(ms)) return '—';
    if (ms < 0) ms = 0;

    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 3600) return fmtDurationSmart(ms);

    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);

    const parts = [];
    if (d) parts.push(`${d}d`);
    parts.push(`${pad2(h)}:${pad2(m)}`);
    return parts.join(' ');
  }

  function setDurationAuto(el, ms) {
    el.textContent = fmtDurationSmart(ms);
    if (el.scrollWidth > el.clientWidth) el.textContent = fmtDurationSmartNoSec(ms);
  }

  // LOCAL TIME (browser timezone), formatted in English
  function humanLocalEn(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso || '');
      return d.toLocaleString('en-GB', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
      });
    } catch (_) {
      return String(iso || '');
    }
  }

  function localKey(dt) {
    const d = (dt instanceof Date) ? dt : new Date(dt);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  async function loadGlobalTimerSettings() {
    const STATE = {
      patch: null,
      lives: { korean: null, global: null, japan: null },
      weekly: { weekdayUTC: 4, hourUTC: 0, minuteUTC: 0 } // Thursday 00:00 UTC
    };

    try {
      const p = await fetchJson('/api/patch-settings');
      if (p?.settings) STATE.patch = { ...p.settings };
    } catch (_) {}

    try {
      const l = await fetchJson('/api/live-settings');
      if (l?.settings) {
        STATE.lives.korean = { ...(l.settings.korean || {}) };
        STATE.lives.global = { ...(l.settings.global || {}) };
        if (l.settings.japan) STATE.lives.japan = { ...(l.settings.japan || {}) };
      }
    } catch (_) {}

    return STATE;
  }

  function getPatchPhase(STATE, now = new Date()) {
    const start0 = new Date(STATE.patch?.startISO);
    const end0 = new Date(STATE.patch?.endISO);
    const cycleDays = Math.max(1, Number(STATE.patch?.cycleDays) || 28);

    if (isNaN(start0.getTime()) || isNaN(end0.getTime())) return null;
    if (end0 <= start0) return null;

    const cycleMs = cycleDays * 24 * 3600 * 1000;
    const durMs = end0.getTime() - start0.getTime();

    if (now < start0) {
      return { phase: 'pre', ref: start0, label: 'Next patch' };
    }

    let k = Math.floor((now.getTime() - start0.getTime()) / cycleMs);
    if (k < 0) k = 0;

    const curStart = new Date(start0.getTime() + k * cycleMs);
    const curEnd = new Date(curStart.getTime() + durMs);

    if (now >= curStart && now <= curEnd) {
      return { phase: 'during', ref: curEnd, label: 'Patch ends' };
    }

    const nextStart = new Date(curStart.getTime() + cycleMs);
    return { phase: 'post', ref: nextStart, label: 'Next patch' };
  }

  function getLivePhase(cfg, fallbackCycleDays, now = new Date()) {
    if (!cfg?.startISO) return null;

    const start0 = new Date(cfg.startISO);
    if (isNaN(start0.getTime())) return null;

    const durMs = Math.max(1, Number(cfg.durationMin) || 60) * 60 * 1000;
    const cycleMs = Math.max(1, Number(cfg.cycleDays) || fallbackCycleDays || 28) * 24 * 3600 * 1000;

    let start = new Date(start0.getTime());
    let end = new Date(start.getTime() + durMs);

    while (now > end) {
      start = new Date(start.getTime() + cycleMs);
      end = new Date(end.getTime() + cycleMs);
    }

    if (now < start) return { phase: 'pre', ref: start, start, end };
    if (now >= start && now <= end) return { phase: 'during', ref: end, start, end };
    return { phase: 'pre', ref: start, start, end };
  }

  function getCurrentCycleWindow(cfg, now = new Date()) {
    if (!cfg?.startISO || !cfg?.cycleDays || !cfg?.durationMin) return null;
    const base = new Date(cfg.startISO);
    if (isNaN(base.getTime())) return null;

    const periodMs = Math.max(1, Number(cfg.cycleDays)) * 24 * 60 * 60 * 1000;
    const durMs = Math.max(1, Number(cfg.durationMin)) * 60 * 1000;

    let k = Math.floor((now - base) / periodMs);
    if (k < 0) k = 0;

    const start = new Date(base.getTime() + k * periodMs);
    const end = new Date(start.getTime() + durMs);
    return { start, end };
  }

  function getWeeklyPhase(STATE, now = new Date()) {
    const w = STATE.weekly;
    const n = new Date(now.getTime());

    const day = n.getUTCDay(); // 0=Sun
    let addDays = w.weekdayUTC - day;

    const curMin = n.getUTCHours() * 60 + n.getUTCMinutes();
    const resetMin = w.hourUTC * 60 + w.minuteUTC;
    if (addDays < 0 || (addDays === 0 && curMin >= resetMin)) addDays += 7;

    const next = new Date(Date.UTC(
      n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + addDays,
      w.hourUTC, w.minuteUTC, 0, 0
    ));

    return { ref: next, label: 'Weekly reset' };
  }

  function buildTimers(STATE) {
    const now = new Date();
    const timers = [];

    let patchRef = null;
    if (STATE.patch) {
      const ph = getPatchPhase(STATE, now);
      if (ph) {
        patchRef = ph.ref;
        timers.push({
          key: 'patch',
          title: ph.label,
          refMs: ph.ref.getTime(),
          bottom: `Local time: ${humanLocalEn(ph.ref.toISOString())}`,
          big: true,
          badge: ph.phase === 'during' ? 'MAINTENANCE' : 'UPCOMING',
          badgeType: ph.phase === 'during' ? 'maintenance' : 'upcoming'
        });
      }
    }

    const weekly = getWeeklyPhase(STATE, now);
    const sameLocalDay = patchRef && localKey(patchRef) === localKey(weekly.ref);
    if (!sameLocalDay) {
      timers.push({
        key: 'weekly',
        title: weekly.label,
        refMs: weekly.ref.getTime(),
        bottom: `Local time: ${humanLocalEn(weekly.ref.toISOString())}`,
        big: false
      });
    }

    const patchCycle = Math.max(1, Number(STATE.patch?.cycleDays) || 28);
    const order = ['global', 'japan', 'korean'];

    for (const region of order) {
      const cfg = STATE.lives?.[region];
      if (!cfg) continue;

      const enabled = isTruthy(cfg.enabled);
      if (region === 'japan' && !enabled) continue;

      const ph = getLivePhase(cfg, patchCycle, now);
      if (!ph) continue;

      const name =
        region === 'korean' ? 'Korea Live' :
        region === 'global' ? 'Global Live' :
        region === 'japan' ? 'Japan Live' :
        `${region[0].toUpperCase()}${region.slice(1)} Live`;

      const link = safeUrl(cfg.ytLink);

      timers.push({
        key: `live-${region}`,
        region,
        title: name,
        refMs: ph.ref.getTime(),
        bottom: `Local time: ${humanLocalEn(ph.ref.toISOString())}`,
        big: false,
        link,
        badge: ph.phase === 'during' ? 'LIVE' : 'UPCOMING',
        badgeType: ph.phase === 'during' ? 'live' : 'upcoming'
      });
    }

    const nowMs = now.getTime();
    timers.sort((a, b) => (a.refMs - nowMs) - (b.refMs - nowMs));

    if (timers.length === 3) {
      timers.forEach((t, i) => t.big = (i === 0));
    } else if (timers.length === 4) {
      timers.forEach((t, i) => t.big = (i === 0));
    } else if (timers.length === 5) {
      timers.forEach((t, i) => t.big = (i === 0 || i === 1));
    } else {
      timers.forEach((t) => t.big = (t.key === 'patch'));
    }

    return timers;
  }

  function badgeClassByType(type) {
    const t = String(type || '').toLowerCase();

    if (t === 'live') {
      return 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-300';
    }
    if (t === 'upcoming') {
      return 'border border-yellow-400/30 bg-yellow-400/15 text-yellow-300';
    }
    if (t === 'maintenance') {
      return 'border border-rose-400/30 bg-rose-400/15 text-rose-300';
    }
    if (t === 'offline' || t === 'down') {
      return 'border border-red-400/30 bg-red-400/15 text-red-300';
    }

    return 'border border-slate-400/30 bg-slate-400/10 text-slate-200';
  }

  function timerCard(timer, idx, big) {
    const titleCls = big ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl';
    const clockCls = big ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl';

    const href = safeUrl(timer?.link || timer?.ytLink || timer?.url);
    const Tag = href ? 'a' : 'div';

    const baseCard =
      `block w-full rounded-2xl border border-slate-700/60 bg-glass px-6 ${big ? 'py-6' : 'py-5'} text-center shadow-sm no-underline`;

    const interactive = href
      ? ' cursor-pointer hover:bg-slate-800/40 hover:border-yellow-400/30 ' +
        'focus:outline-none focus:ring-2 focus:ring-yellow-400/40 ' +
        'active:scale-[0.99] transition'
      : '';

    const attrs = href
      ? `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open link for ${escapeHtml(timer.title)}"`
      : '';

    const badgeCls = badgeClassByType(timer?.badgeType || timer?.badge);
    const badge = timer?.badge
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold tracking-wide ${badgeCls}">${escapeHtml(timer.badge)}</span>`
      : '';

    const statusCardClass =
      (timer?.badgeType === 'live') ? ' border-emerald-400/35 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]' :
      (timer?.badgeType === 'maintenance') ? ' border-rose-400/35 shadow-[0_0_0_1px_rgba(251,113,133,0.08)]' :
      '';

    const clickHint = `
      <div class="mt-2 text-[10px] tracking-wide min-h-[14px] ${href ? 'text-slate-300/60' : 'text-transparent select-none'}">
        ${href ? '↗ Click to open' : ''}
      </div>
    `;

    return `
      <${Tag} ${attrs} class="${baseCard}${interactive}${statusCardClass}">
        <div class="flex items-center justify-center gap-2">
          <div class="${titleCls} font-extrabold text-slate-100">${escapeHtml(timer.title)}</div>
          ${badge}
        </div>

        <div class="mt-3 ${clockCls} font-mono font-extrabold whitespace-nowrap text-yellow-400"
             data-timer-idx="${idx}">—</div>

        <div class="mt-3 text-[11px] text-slate-300/80">${escapeHtml(timer.bottom || '')}</div>
        ${clickHint}

      </${Tag}>
    `;
  }

  function timersGridHtml(timers) {
    const n = timers.length;
    if (n === 0) return `<div class="text-center text-slate-300/80">No timers configured.</div>`;

    if (n === 3) {
      return `
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">${timerCard(timers[0], 0, true)}</div>
          <div class="col-span-2 md:col-span-1">${timerCard(timers[1], 1, false)}</div>
          <div class="col-span-2 md:col-span-1">${timerCard(timers[2], 2, false)}</div>
        </div>
      `;
    }

    if (n === 4) {
      return `
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-3">${timerCard(timers[0], 0, true)}</div>
          <div class="col-span-3 md:col-span-1">${timerCard(timers[1], 1, false)}</div>
          <div class="col-span-3 md:col-span-1">${timerCard(timers[2], 2, false)}</div>
          <div class="col-span-3 md:col-span-1">${timerCard(timers[3], 3, false)}</div>
        </div>
      `;
    }

    if (n === 5) {
      return `
        <div class="grid grid-cols-6 gap-3">
          <div class="col-span-6 md:col-span-3">${timerCard(timers[0], 0, true)}</div>
          <div class="col-span-6 md:col-span-3">${timerCard(timers[1], 1, true)}</div>
          <div class="col-span-6 md:col-span-2">${timerCard(timers[2], 2, false)}</div>
          <div class="col-span-6 md:col-span-2">${timerCard(timers[3], 3, false)}</div>
          <div class="col-span-6 md:col-span-2">${timerCard(timers[4], 4, false)}</div>
        </div>
      `;
    }

    const cols = n <= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';
    return `
      <div class="grid ${cols} gap-3">
        ${timers.map((t, i) => timerCard(t, i, !!t.big)).join('')}
      </div>
    `;
  }

  async function savePatchSettings(payload) {
    const res = await fetch(apiPath('/api/admin/patch-settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
    return out;
  }

  async function saveLiveSettingsMerged(partial) {
    const current = await fetchJson('/api/live-settings').catch(() => ({ settings: {} }));
    const merged = { ...(current?.settings || {}) };
    for (const [k, v] of Object.entries(partial || {})) {
      merged[k] = { ...(merged[k] || {}), ...(v || {}) };
    }

    const res = await fetch(apiPath('/api/admin/live-settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(merged),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
    return out;
  }

  async function loadActiveCodesAdmin() {
    const out = await fetchJson('/api/admin/active-codes').catch(() => ({ items: [] }));
    return Array.isArray(out?.items) ? out.items : [];
  }

  async function saveActiveCodesAdmin(items) {
    const res = await fetch(apiPath('/api/admin/active-codes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: Array.isArray(items) ? items : [] }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
    return out;
  }

  async function rescanActiveCodesAdmin() {
    const res = await fetch(apiPath('/api/admin/active-codes/rescan-full'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
    return out;
  }

  const ACTIVE_CODE_TZ_OPTIONS = [
    { value: 'kst', label: 'KST (UTC+9)' },
    { value: 'jst', label: 'JST (UTC+9)' },
    { value: 'utc+9', label: 'UTC+9' },
    { value: 'pdt', label: 'PDT (UTC-7)' },
    { value: 'pst', label: 'PST (UTC-8)' },
    { value: 'utc+0', label: 'UTC+0' },
    { value: 'japan', label: 'Japan / JST (UTC+9)' },
  ];

  function makeSelect(options, value) {
    const s = document.createElement('select');
    s.className = 'w-full rounded-xl border border-slate-700/60 bg-slate-950/40 text-slate-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400/30';

    for (const opt of options) {
      const o = document.createElement('option');
      o.value = String(opt.value);
      o.textContent = String(opt.label);
      if (String(opt.value) === String(value ?? '')) o.selected = true;
      s.append(o);
    }

    return s;
  }

  function showTimersLoading() {
    const root = $('#homeTimers');
    if (!root) return;
    root.innerHTML = `
      <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-8 text-center text-slate-300/80">
        Loading timers…
      </div>`;
  }

  function showActiveCodesLoading() {
    const root = $('#homeActiveCodes');
    if (!root) return;
    root.innerHTML = `
      <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-8 text-center text-slate-300/80">
        Loading active codes…
      </div>`;
  }

  function showNoActiveCodes() {
    const root = $('#homeActiveCodes');
    if (!root) return;
    root.innerHTML = `
      <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-8 text-center text-slate-300/80">
        No active codes right now.
      </div>`;
  }

  function startTimerTick(timers, STATE) {
    const root = $('#homeTimers');
    if (!root) return;

    root.classList.add('opacity-0', 'transition-opacity', 'duration-300');
    root.innerHTML = timersGridHtml(timers);
    requestAnimationFrame(() => root.classList.remove('opacity-0'));

    function rebuildIfNeeded() {
      const rebuilt = buildTimers(STATE);
      startTimerTick(rebuilt, STATE);
    }

    function tick() {
      const now = Date.now();

      for (let i = 0; i < timers.length; i++) {
        const msLeft = timers[i].refMs - now;
        if (msLeft <= 0) {
          rebuildIfNeeded();
          return;
        }
      }

      try {
        const jp = STATE?.lives?.japan;
        if (jp && isTruthy(jp.enabled)) {
          const win = getCurrentCycleWindow(jp, new Date());
          if (win && Date.now() > win.end.getTime()) {
            jp.enabled = false;
            saveLiveSettingsMerged({ japan: { ...jp } }).catch(() => {});
            rebuildIfNeeded();
            return;
          }
        }
      } catch (_) {}

      for (let i = 0; i < timers.length; i++) {
        const el = root.querySelector(`[data-timer-idx="${i}"]`);
        if (!el) continue;
        const ms = timers[i].refMs - now;
        setDurationAuto(el, ms);
      }
    }

    tick();
    if (window.__SLA_HOME_TIMER_INT) clearInterval(window.__SLA_HOME_TIMER_INT);
    window.__SLA_HOME_TIMER_INT = setInterval(tick, 250);
  }

  function isCodeNew(code, hours = 48) {
    let ms = Number(code?.publicActiveAtMs);
    if (!Number.isFinite(ms)) ms = Number(code?.startsAtMs);
    if (!Number.isFinite(ms)) {
      ms = new Date(code?.firstDetectedAt || code?.createdAt || code?.publishedAt || 0).getTime();
    }
    if (!Number.isFinite(ms) || ms <= 0) return false;
    return (Date.now() - ms) <= (hours * 60 * 60 * 1000);
  }

  async function copyTextToClipboard(text) {
    const value = String(text ?? '');

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    textarea.style.opacity = '0';
    document.body.append(textarea);

    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      textarea.remove();
    }
  }

  function showCodeCopiedFeedback(el, copied = true) {
    const card = el?.closest?.('[data-active-code-card]');
    const feedback = card?.querySelector?.('[data-copy-feedback]');
    if (!feedback) return;

    if (feedback.__copyTimer) clearTimeout(feedback.__copyTimer);

    feedback.textContent = copied ? 'Copied!' : 'Copy failed';
    feedback.classList.remove('opacity-0');
    feedback.classList.toggle('text-emerald-300', copied);
    feedback.classList.toggle('text-red-300', !copied);

    feedback.__copyTimer = setTimeout(() => {
      feedback.textContent = 'Click code to copy';
      feedback.classList.add('opacity-0');
      feedback.classList.remove('text-emerald-300', 'text-red-300');
    }, 1700);
  }

  function inactiveCodeCardLegacy(code, idx) {
    const expiresText = Number.isFinite(code?.expiresAtMs)
      ? `Local time: ${escapeHtml(humanLocalEn(new Date(code.expiresAtMs).toISOString()))}`
      : 'Local time: —';
  
    const isNew = isCodeNew(code, 48);
    const postHref = code?.postSlug ? apiPath(`/posts/${encodeURIComponent(code.postSlug)}`) : '';
  
    const rewardLines = String(code?.reward || '')
      .split('•')
      .map(s => s.trim())
      .filter(Boolean);

    return `
      <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-5 shadow-sm">
        <div class="flex flex-col items-center text-center">
          <div class="text-[11px] tracking-[0.22em] text-slate-400 uppercase">Redeem code</div>

          <div class="mt-2 text-2xl md:text-3xl font-mono font-bold text-yellow-400 break-all">
            ${escapeHtml(code.code)}
          </div>

          <div class="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide border border-emerald-400/30 bg-emerald-400/15 text-emerald-300">
              ACTIVE
            </span>

            ${isNew ? `
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide bg-red-500 text-white">
                NEW
              </span>
            ` : ''}
          </div>
        </div>

        ${
          rewardLines.length
            ? `
              <div class="mt-5 rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-3">
                <div class="text-[11px] tracking-[0.18em] text-slate-400 uppercase text-center">Reward</div>
                <div class="mt-3 grid gap-2 text-sm text-slate-300/90">
                  ${rewardLines.map(line => `<div class="text-left">• ${escapeHtml(line.replace(/^-+\s*/, ''))}</div>`).join('')}
                </div>
              </div>
            `
            : ''
        }

        <div class="mt-5 text-center">
          <div class="text-[11px] tracking-[0.18em] text-slate-400 uppercase">Remaining time</div>
          <div class="mt-2 text-3xl md:text-4xl font-mono whitespace-nowrap text-yellow-400"
               data-code-timer-idx="${idx}">—</div>
        </div>

        <div class="mt-4 text-center text-[11px] text-slate-300/80">${expiresText}</div>
              
        ${postHref ? `
          <div class="mt-2 text-center">
            <a href="${escapeHtml(postHref)}"
               class="text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
               onclick="event.stopPropagation();">
              View source post
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }

  function activeCodesGridHtml(codes) {
    if (!codes.length) {
      return `
        <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-8 text-center text-slate-300/80">
          No active codes right now.
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${codes.map((code, idx) => activeCodeCard(code, idx)).join('')}
      </div>
    `;
  }

  async function loadActiveCodes() {
    const out = await fetchJson('/api/active-codes').catch(() => ({ items: [] }));
    return Array.isArray(out?.items) ? out.items : [];
  }

  function bindActiveCodesCopyHandler(root) {
    if (!root || root.__activeCodesCopyBound) return;
    root.__activeCodesCopyBound = true;

    root.addEventListener('click', async (event) => {
      const btn = event.target?.closest?.('[data-copy-code]');
      if (!btn || !root.contains(btn)) return;

      event.preventDefault();
      event.stopPropagation();

      const copied = await copyTextToClipboard(btn.dataset.copyCode || '');
      showCodeCopiedFeedback(btn, copied);
    });
  }

  function startActiveCodesTick(codes) {
    const root = $('#homeActiveCodes');
    if (!root) return;
    bindActiveCodesCopyHandler(root);
    let allCodes = Array.isArray(codes) ? [...codes] : [];
    let lastRefreshAt = Date.now();
    let refreshInFlight = false;

    function rebuildVisibleList() {
      const now = Date.now();
      const active = allCodes.filter(c =>
        (!Number.isFinite(c.startsAtMs) || c.startsAtMs <= now) &&
        (!Number.isFinite(c.expiresAtMs) || c.expiresAtMs > now)
      );
      root.innerHTML = activeCodesGridHtml(active);
      return active;
    }

    let current = rebuildVisibleList();

    function tick() {
      const now = Date.now();

      let needsRebuild = false;
      for (const code of current) {
        if (Number.isFinite(code.expiresAtMs) && code.expiresAtMs <= now) {
          needsRebuild = true;
          break;
        }
      }

      if (!needsRebuild) {
        const displayed = new Set(current.map(code => String(code?.codeKey || code?.code || '').trim().toUpperCase()).filter(Boolean));
        for (const code of allCodes) {
          const key = String(code?.codeKey || code?.code || '').trim().toUpperCase();
          if (
            key &&
            !displayed.has(key) &&
            (!Number.isFinite(code.startsAtMs) || code.startsAtMs <= now) &&
            (!Number.isFinite(code.expiresAtMs) || code.expiresAtMs > now)
          ) {
            needsRebuild = true;
            break;
          }
        }
      }

      if (!refreshInFlight && now - lastRefreshAt >= 60000) {
        refreshInFlight = true;
        lastRefreshAt = now;
        loadActiveCodes()
          .then((fresh) => {
            allCodes = Array.isArray(fresh) ? fresh : [];
            current = rebuildVisibleList();
          })
          .catch(() => {})
          .finally(() => {
            refreshInFlight = false;
          });
      }

      if (needsRebuild) {
        current = rebuildVisibleList();
        return;
      }

      for (let i = 0; i < current.length; i++) {
        const el = root.querySelector(`[data-code-timer-idx="${i}"]`);
        if (!el) continue;

        const ms = Number.isFinite(current[i].expiresAtMs)
          ? current[i].expiresAtMs - now
          : NaN;

        setDurationAuto(el, ms);
      }
    }

    tick();
    if (window.__SLA_HOME_CODES_INT) clearInterval(window.__SLA_HOME_CODES_INT);
    window.__SLA_HOME_CODES_INT = setInterval(tick, 1000);
  }

  async function renderActiveCodesHome() {
    try {
      showActiveCodesLoading();
      const codes = await loadActiveCodes();
      startActiveCodesTick(codes);
    } catch (_) {
      showNoActiveCodes();
    }
  }

  function activeCodeCard(code, idx) {
    const expiresText = Number.isFinite(code?.expiresAtMs)
      ? `Local time: ${escapeHtml(humanLocalEn(new Date(code.expiresAtMs).toISOString()))}`
      : 'Local time: —';

    const isNew = isCodeNew(code, 48);
    const postHref = code?.postSlug ? apiPath(`/posts/${encodeURIComponent(code.postSlug)}`) : '';
    const rewardLines = String(code?.reward || '')
      .split(/[•\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const rawNote = String(code?.note || code?.availabilityNote || '').trim();
    const note = (
      rawNote &&
      Number.isFinite(code?.startsAtMs) &&
      Number(code.startsAtMs) <= Date.now() &&
      /valid\s+after/i.test(rawNote)
    ) ? '' : rawNote;

    return `
      <div class="rounded-2xl border border-slate-700/60 bg-glass px-6 py-5 shadow-sm" data-active-code-card>
        <div class="flex flex-col items-center text-center">
          <div class="text-[11px] tracking-[0.22em] text-slate-400 uppercase">Redeem code</div>
          <button type="button"
            class="mt-2 max-w-full cursor-pointer rounded-lg px-2 py-1 text-2xl md:text-3xl font-mono font-bold text-yellow-400 break-all transition hover:bg-yellow-400/10 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
            data-copy-code="${escapeHtml(code.code)}"
            aria-label="Copy redeem code ${escapeHtml(code.code)}"
            title="Copy code">
            ${escapeHtml(code.code)}
          </button>
          <div class="mt-1 min-h-[16px] text-[11px] font-semibold opacity-0 transition-opacity" data-copy-feedback aria-live="polite">Click code to copy</div>
          <div class="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide border border-emerald-400/30 bg-emerald-400/15 text-emerald-300">ACTIVE</span>
            ${isNew ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide bg-red-500 text-white">NEW</span>` : ''}
          </div>
        </div>
        ${
          rewardLines.length
            ? `<div class="mt-5 rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-3">
                <div class="text-[11px] tracking-[0.18em] text-slate-400 uppercase text-center">Reward</div>
                <div class="mt-3 grid gap-2 text-sm text-slate-300/90">
                  ${rewardLines.map(line => `<div class="text-left">• ${escapeHtml(line.replace(/^-+\s*/, ''))}</div>`).join('')}
                </div>
              </div>`
            : ''
        }
        <div class="mt-5 text-center">
          <div class="text-[11px] tracking-[0.18em] text-slate-400 uppercase">Remaining time</div>
          <div class="mt-2 text-3xl md:text-4xl font-mono whitespace-nowrap text-yellow-400" data-code-timer-idx="${idx}">—</div>
        </div>
        <div class="mt-4 text-center text-[11px] text-slate-300/80">${expiresText}</div>
        ${note ? `<div class="mt-2 text-center text-[11px] text-slate-300/80">${escapeHtml(note)}</div>` : ''}
        ${postHref ? `<div class="mt-2 text-center"><a href="${escapeHtml(postHref)}" class="text-[11px] text-yellow-400 hover:text-yellow-300 underline underline-offset-2" onclick="event.stopPropagation();">View source post</a></div>` : ''}
      </div>
    `;
  }

  function showModal(title) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-2 md:p-4';

    const isActiveCodesModal = String(title || '') === 'Edit Active Codes';
    const cardHeight = isActiveCodesModal
      ? 'h-[calc(100dvh-16px)] max-h-[calc(100dvh-16px)] md:h-[78vh] md:max-h-none'
      : 'h-[53vh]';
    const bodyHeight = isActiveCodesModal
      ? 'h-[calc(100dvh-80px)] md:h-[calc(78vh-64px)]'
      : 'h-[calc(53vh-64px)]';

    const card = document.createElement('div');
    card.className = `w-full ${isActiveCodesModal ? 'max-w-none md:max-w-6xl' : 'max-w-5xl'} ${cardHeight} rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-xl overflow-hidden`;

    const head = document.createElement('div');
    head.className = `flex items-center justify-between px-4 py-3 md:px-5 md:py-4 border-b border-slate-700/60 ${isActiveCodesModal ? 'sticky top-0 z-10 bg-slate-900/95 backdrop-blur' : ''}`;

    const h = document.createElement('div');
    h.className = 'text-lg font-bold text-slate-100';
    h.textContent = title;

    const close = document.createElement('button');
    close.className = 'px-3 py-2 rounded-xl border border-slate-600/60 text-slate-200 hover:bg-slate-800 transition';
    close.textContent = 'Close';
    close.onclick = () => overlay.remove();

    head.append(h, close);

    const body = document.createElement('div');
    body.className = `${bodyHeight} overflow-y-auto overflow-x-hidden p-3 md:p-5`;

    card.append(head, body);
    overlay.append(card);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.append(overlay);

    return { overlay, body };
  }

  function makeInput(type, value) {
    const i = document.createElement('input');
    i.type = type;
    i.value = value || '';
    i.className = 'w-full rounded-xl border border-slate-700/60 bg-slate-950/40 text-slate-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400/30';
    return i;
  }

  function makeTextarea(value, rows = 4) {
    const t = document.createElement('textarea');
    t.value = value || '';
    t.rows = rows;
    t.className = 'w-full rounded-xl border border-slate-700/60 bg-slate-950/40 text-slate-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400/30 resize-y';
    return t;
  }

  function makeCheckbox(checked) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.className = 'h-4 w-4';
    return cb;
  }

  function field(label, el) {
    const row = document.createElement('div');
    row.className = 'grid gap-2';
    const l = document.createElement('div');
    l.className = 'text-sm text-slate-200 font-semibold';
    l.textContent = label;
    row.append(l, el);
    return row;
  }

  function twoColsField(labelLeft, elLeft, labelRight, elRight) {
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-1 md:grid-cols-2 gap-3';
    wrap.append(field(labelLeft, elLeft), field(labelRight, elRight));
    return wrap;
  }

  function tabButton(text) {
    const b = document.createElement('button');
    b.className =
      'w-full text-left px-4 py-2 rounded-xl border border-slate-700/60 ' +
      'bg-slate-950/20 text-slate-200 text-sm transition ' +
      'hover:bg-slate-800/50 ' +
      'disabled:opacity-100 disabled:cursor-default';
    b.textContent = text;
    b.dataset.tab = '1';
    return b;
  }

  function inputToUTCDate(dtLocalValue) {
    if (!dtLocalValue) return null;
    const d = new Date(dtLocalValue + ':00Z');
    if (isNaN(d.getTime())) return null;
    return d;
  }

  async function openEditModal(STATE, onSaved) {
    const { overlay, body } = showModal('Edit timers');

    const layout = document.createElement('div');
    layout.className = 'grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4';

    const left = document.createElement('div');
    left.className = 'grid gap-2';

    const right = document.createElement('div');
    right.className = 'rounded-2xl border border-slate-700/60 bg-slate-950/20 p-4 min-h-[380px]';

    const content = document.createElement('div');
    content.className = 'grid gap-4';

    right.append(content);
    layout.append(left, right);
    body.append(layout);

    function setActive(btn) {
      const BASE =
        'w-full text-left px-4 py-2 rounded-xl border border-slate-700/60 ' +
        'text-sm transition disabled:opacity-100 disabled:cursor-default';

      const INACTIVE = BASE + ' bg-slate-950/20 text-slate-200 hover:bg-slate-800/50';
      const ACTIVE = BASE + ' bg-yellow-400 text-black font-bold border-yellow-300';

      left.querySelectorAll('button[data-tab="1"]').forEach(b => {
        b.disabled = false;
        b.className = INACTIVE;
      });

      btn.disabled = true;
      btn.className = ACTIVE;
    }

    function showSection(title, fields, onSave, headerRightEl = null) {
      content.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-3';

      const h = document.createElement('div');
      h.className = 'text-slate-100 font-bold text-lg';
      h.textContent = title;

      header.append(h);
      if (headerRightEl) header.append(headerRightEl);

      content.append(header, ...fields);

      if (onSave) {
        const actions = document.createElement('div');
        actions.className = 'flex items-center justify-end gap-2 pt-2';

        const msg = document.createElement('div');
        msg.className = 'mr-auto text-sm text-slate-300';
        msg.textContent = '';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'px-4 py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:opacity-90 transition';
        saveBtn.textContent = 'Save';

        actions.append(msg, saveBtn);
        content.append(actions);

        saveBtn.onclick = async () => {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving…';
          msg.textContent = 'Saving…';
          try {
            await onSave();
            msg.textContent = 'Saved!';
            await onSaved();
          } catch (err) {
            msg.textContent = `Error: ${err?.message || err}`;
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
          }
        };
      }
    }

    const btnPatch = tabButton('Patch');
    btnPatch.onclick = () => {
      setActive(btnPatch);

      const ps = makeInput('datetime-local', '');
      const pe = makeInput('datetime-local', '');
      const pc = makeInput('number', String(STATE.patch?.cycleDays ?? 28));

      if (STATE.patch?.startISO) {
        const d = new Date(STATE.patch.startISO);
        if (!isNaN(d.getTime())) ps.value = d.toISOString().slice(0, 16);
      }
      if (STATE.patch?.endISO) {
        const d = new Date(STATE.patch.endISO);
        if (!isNaN(d.getTime())) pe.value = d.toISOString().slice(0, 16);
      }

      showSection('Patch', [
        field('Start (UTC+0)', ps),
        field('End (UTC+0)', pe),
        field('Cycle days', pc),
      ], async () => {
        const start = inputToUTCDate(ps.value);
        const end = inputToUTCDate(pe.value);
        const cycleDays = Math.max(1, Number(pc.value) || 28);
        if (!start || !end) throw new Error('Start/end required.');
        if (end <= start) throw new Error('End must be after start.');
        await savePatchSettings({ startISO: start.toISOString(), endISO: end.toISOString(), cycleDays });
      });
    };

    function regionTab(regionKey, label, showEnabledToggle) {
      const btn = tabButton(label);
      btn.onclick = () => {
        setActive(btn);

        const cfg = STATE.lives?.[regionKey] || {};

        const start = makeInput('datetime-local', '');
        if (cfg.startISO) {
          const d = new Date(cfg.startISO);
          if (!isNaN(d.getTime())) start.value = d.toISOString().slice(0, 16);
        }

        const dur = makeInput('number', String(cfg.durationMin ?? 60));
        const cyc = makeInput('number', String(cfg.cycleDays ?? (STATE.patch?.cycleDays ?? 28)));
        const yt = makeInput('text', String(cfg.ytLink ?? ''));

        let enabledCb = null;
        let headerRight = null;

        if (showEnabledToggle) {
          enabledCb = makeCheckbox(isTruthy(cfg.enabled));

          headerRight = document.createElement('label');
          headerRight.className = 'flex items-center gap-2 text-slate-200';
          headerRight.innerHTML = `<span class="text-sm font-semibold">Enabled</span>`;
          headerRight.append(enabledCb);
        }

        const fields = [
          field('Start (UTC+0)', start),
          twoColsField('Duration (minutes)', dur, 'Cycle days', cyc),
          field('YouTube link (optional)', yt),
        ];

        showSection(label, fields, async () => {
          const ds = inputToUTCDate(start.value);
          if (!ds) throw new Error('Bad start date.');

          const base = {
            startISO: ds.toISOString(),
            durationMin: Math.max(1, Number(dur.value) || 60),
            cycleDays: Math.max(1, Number(cyc.value) || 28),
            ytLink: String(yt.value || '')
          };

          const payload = {};
          if (showEnabledToggle) {
            payload[regionKey] = { ...base, enabled: !!enabledCb.checked };
          } else {
            payload[regionKey] = { ...base };
          }

          await saveLiveSettingsMerged(payload);
        }, headerRight);
      };
      return btn;
    }

    const btnKorea = regionTab('korean', 'Korea Live', false);
    const btnGlobal = regionTab('global', 'Global Live', false);
    const btnJapan = regionTab('japan', 'Japan Live', true);

    left.append(btnPatch, btnKorea, btnGlobal, btnJapan);
    btnPatch.click();

    window.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        window.removeEventListener('keydown', esc);
      }
    });
  }

  async function openActiveCodesEditModal(onSaved) {
    const itemsStart = await loadActiveCodesAdmin();
    let items = Array.isArray(itemsStart) ? [...itemsStart] : [];
    let selectedIndex = items.length ? 0 : -1;
  
    const { overlay, body } = showModal('Edit Active Codes');
  
    const layout = document.createElement('div');
    layout.className = 'grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 h-full';
  
    const left = document.createElement('div');
    left.className = 'rounded-2xl border border-slate-700/60 bg-slate-950/20 p-3 grid grid-rows-[auto_1fr] gap-3 min-h-[420px]';
  
    const right = document.createElement('div');
    right.className = 'rounded-2xl border border-slate-700/60 bg-slate-950/20 p-4 min-h-[420px]';
  
    const leftTop = document.createElement('div');
    leftTop.className = 'flex items-center justify-between gap-2';
  
    const leftTitle = document.createElement('div');
    leftTitle.className = 'text-slate-100 font-bold';
    leftTitle.textContent = 'Active codes';
  
    const addBtn = document.createElement('button');
    addBtn.className = 'px-3 py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:opacity-90 transition';
    addBtn.textContent = '+ Add';
  
    const navWrap = document.createElement('div');
    navWrap.className = 'grid gap-2 overflow-y-auto pr-1';
  
    const content = document.createElement('div');
    content.className = 'grid gap-4';
  
    const actions = document.createElement('div');
    actions.className = 'flex items-center justify-end gap-2 pt-2';
  
    const msg = document.createElement('div');
    msg.className = 'mr-auto text-sm text-slate-300';
    msg.textContent = '';
  
    const saveBtn = document.createElement('button');
    saveBtn.className = 'px-4 py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:opacity-90 transition';
    saveBtn.textContent = 'Save';
  
    function ensureSelectedIndex() {
      if (!items.length) {
        selectedIndex = -1;
        return;
      }
      const visibleIndexes = items
        .map((item, idx) => ({ item, idx }))
        .filter(entry => entry.item?.deleted !== true)
        .map(entry => entry.idx);

      if (!visibleIndexes.length) {
        selectedIndex = -1;
        return;
      }

      if (!visibleIndexes.includes(selectedIndex)) {
        selectedIndex = visibleIndexes[0];
      }
    }
  
    function makeCodeNavButton(item, index) {
      const btn = document.createElement('button');
      const codeText = String(item.code || '').trim() || `Code ${index + 1}`;
      const enabled = item.enabled !== false;
    
      btn.type = 'button';
      btn.className = [
        'w-full text-left px-3 py-3 rounded-xl border transition',
        index === selectedIndex
          ? 'border-yellow-400/40 bg-yellow-400/15 text-yellow-200'
          : 'border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60'
      ].join(' ');
    
      btn.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="font-semibold truncate">${escapeHtml(codeText)}</div>
          <span class="text-[10px] px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/20' : 'bg-slate-700/40 text-slate-300 border border-slate-600/40'}">
            ${enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      `;
    
      btn.onclick = () => {
        selectedIndex = index;
        renderAll();
      };
    
      return btn;
    }
  
    function buildEditor(item = {}, index = 0) {
      const wrap = document.createElement('div');
      wrap.className = 'grid gap-4';
    
      const code = makeInput('text', item.code || '');
      const reward = makeInput('text', item.reward || '');
      const source = makeInput('text', item.source || '');
      const date = makeInput('date', item.expiresDate || '');
      const time = makeInput('time', item.expiresTime || '23:59');
      const tz = makeSelect(ACTIVE_CODE_TZ_OPTIONS, item.timezone || 'utc+0');
      const enabled = makeCheckbox(item.enabled !== false);
    
      const top = document.createElement('div');
      top.className = 'flex items-center justify-between gap-3';
    
      const title = document.createElement('div');
      title.className = 'text-slate-100 font-bold text-lg';
      title.textContent = `Edit code ${index + 1}`;
    
      const enabledWrap = document.createElement('label');
      enabledWrap.className = 'flex items-center gap-2 text-sm text-slate-200';
      const enabledText = document.createElement('span');
      enabledText.textContent = 'Enabled';
      enabledWrap.append(enabledText, enabled);
    
      top.append(title, enabledWrap);
    
      const removeBtn = document.createElement('button');
      removeBtn.className = 'px-3 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition';
      removeBtn.textContent = 'Remove code';
      removeBtn.onclick = () => {
        items.splice(index, 1);
        if (!items.length) {
          selectedIndex = -1;
        } else if (selectedIndex >= items.length) {
          selectedIndex = items.length - 1;
        }
        renderAll();
      };
    
      wrap.append(
        top,
        twoColsField('Code', code, 'Reward', reward),
        twoColsField('Date', date, 'Time', time),
        twoColsField('Timezone', tz, 'Source', source),
        removeBtn
      );
    
      wrap.__getValue = () => ({
        id: item.id || `manual-${Date.now()}-${index}`,
        code: String(code.value || '').trim().toUpperCase(),
        reward: String(reward.value || '').trim(),
        source: String(source.value || '').trim(),
        expiresDate: String(date.value || '').trim(),
        expiresTime: String(time.value || '').trim(),
        timezone: String(tz.value || 'utc+0').trim(),
        enabled: !!enabled.checked,
        sortOrder: index,
        createdAt: item.createdAt || new Date().toISOString()
      });
    
      [code, reward, source, date, time, tz, enabled].forEach(el => {
        const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(evt, () => {
          const next = wrap.__getValue();
          items[index] = { ...items[index], ...next };
          renderNavOnly();
        });
      });
    
      return wrap;
    }
  
    function renderNavOnly() {
      navWrap.innerHTML = '';
    
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'text-sm text-slate-300/80';
        empty.textContent = 'No active codes yet.';
        navWrap.append(empty);
        return;
      }
    
      ensureSelectedIndex();
      items.forEach((item, idx) => navWrap.append(makeCodeNavButton(item, idx)));
    }
  
    function renderEditor() {
      content.innerHTML = '';
    
      if (!items.length || selectedIndex < 0) {
        const empty = document.createElement('div');
        empty.className = 'h-full min-h-[320px] grid place-items-center text-center text-slate-300/80';
        empty.innerHTML = '<div><div class="text-lg font-semibold text-slate-100">No code selected</div><div class="mt-2 text-sm">Add a new active code from the left side.</div></div>';
        content.append(empty);
        return;
      }
    
      ensureSelectedIndex();
      content.append(buildEditor(items[selectedIndex], selectedIndex));
    }
  
    function renderAll() {
      ensureSelectedIndex();
      renderNavOnly();
      renderEditor();
    }
  
    addBtn.onclick = () => {
      items.push({
        code: '',
        reward: '',
        source: '',
        expiresDate: '',
        expiresTime: '23:59',
        timezone: 'utc+0',
        enabled: true
      });
      selectedIndex = items.length - 1;
      renderAll();
    };
  
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      msg.textContent = 'Saving…';
    
      try {
        const next = items
          .map((item, idx) => ({
            ...item,
            id: item.id || `manual-${Date.now()}-${idx}`,
            code: String(item.code || '').trim().toUpperCase(),
            reward: String(item.reward || '').trim(),
            source: String(item.source || '').trim(),
            expiresDate: String(item.expiresDate || '').trim(),
            expiresTime: String(item.expiresTime || '').trim(),
            timezone: String(item.timezone || 'utc+0').trim(),
            enabled: item.enabled !== false,
            sortOrder: idx,
            createdAt: item.createdAt || new Date().toISOString()
          }))
          .filter(x => x.code);
        
        await saveActiveCodesAdmin(next);
        msg.textContent = 'Saved!';
        if (typeof onSaved === 'function') await onSaved();
      } catch (err) {
        msg.textContent = `Error: ${err?.message || err}`;
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };
  
    actions.append(msg, saveBtn);
    leftTop.append(leftTitle, addBtn);
    left.append(leftTop, navWrap);
    right.append(content, actions);
    layout.append(left, right);
    body.append(layout);
  
    renderAll();
  
    window.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        window.removeEventListener('keydown', esc);
      }
    });
  }

  async function openActiveCodesEditModal(onSaved) {
    let items = await loadActiveCodesAdmin();
    items = Array.isArray(items) ? items.map((item, idx) => ({ ...item, sortOrder: idx })) : [];
    let selectedIndex = items.length ? 0 : -1;
    let hideInactive = true;

    const { overlay, body } = showModal('Edit Active Codes');

    const layout = document.createElement('div');
    layout.className = 'grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-3 md:gap-4 h-full min-h-0 overflow-x-hidden';

    const left = document.createElement('div');
    left.className = 'rounded-2xl border border-slate-700/60 bg-slate-950/20 p-3 grid grid-rows-[auto_1fr] gap-3 min-h-[320px] md:min-h-[560px] min-w-0 overflow-hidden';

    const right = document.createElement('div');
    right.className = 'rounded-2xl border border-slate-700/60 bg-slate-950/20 p-3 md:p-4 min-h-[420px] md:min-h-[560px] min-w-0 overflow-x-hidden overflow-visible md:overflow-y-auto';

    const leftTop = document.createElement('div');
    leftTop.className = 'grid gap-2';

    const leftTitleRow = document.createElement('div');
    leftTitleRow.className = 'flex flex-wrap items-center justify-between gap-2';

    const leftTitle = document.createElement('div');
    leftTitle.className = 'w-full md:w-auto text-slate-100 font-bold';
    leftTitle.textContent = 'Active codes';

    const addBtn = document.createElement('button');
    addBtn.className = 'w-[calc(50%-0.25rem)] md:w-auto px-3 py-3 sm:py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:opacity-90 transition';
    addBtn.textContent = '+ Add';

    const rescanBtn = document.createElement('button');
    rescanBtn.className = 'w-[calc(50%-0.25rem)] md:w-auto md:ml-auto px-3 py-3 sm:py-2 rounded-xl border border-slate-600/60 text-slate-200 hover:bg-slate-800 transition text-sm';
    rescanBtn.innerHTML = '<span class="md:hidden">Rescan</span><span class="hidden md:inline">Rescan from posts</span>';

    const helperText = document.createElement('div');
    helperText.className = 'hidden md:block text-xs text-slate-400';
    helperText.textContent = 'Manual codes, Netmarble auto codes, and edited overrides appear in one list.';

    const filtersRow = document.createElement('div');
    filtersRow.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2';

    const hideInactiveWrap = document.createElement('label');
    hideInactiveWrap.className = 'inline-flex items-center gap-2 text-sm text-slate-200';
    const hideInactiveCb = makeCheckbox(hideInactive);
    hideInactiveCb.classList.add('h-5', 'w-5');
    const hideInactiveText = document.createElement('span');
    hideInactiveText.textContent = 'Hide inactive';
    hideInactiveWrap.append(hideInactiveCb, hideInactiveText);

    const countsText = document.createElement('div');
    countsText.className = 'text-xs text-slate-400';

    filtersRow.append(hideInactiveWrap, countsText);

    const statusBox = document.createElement('div');
    statusBox.className = 'hidden rounded-xl border px-3 py-2 text-sm break-words';

    const navWrap = document.createElement('div');
    navWrap.className = 'grid gap-2 overflow-y-auto overflow-x-hidden pr-1 min-w-0 max-h-[28dvh] md:max-h-none';

    const content = document.createElement('div');
    content.className = 'grid gap-4 min-w-0 pb-24 md:pb-0';

    const actions = document.createElement('div');
    actions.className = 'sticky bottom-0 z-10 flex flex-col md:flex-row md:items-center justify-end gap-2 pt-3 pb-2 bg-slate-950/95 md:bg-transparent border-t border-slate-700/40 md:border-t-0';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'w-full md:w-auto px-4 py-3 md:py-2 rounded-xl bg-yellow-400 text-black font-semibold hover:opacity-90 transition';
    saveBtn.textContent = 'Save';
    let statusHideTimer = null;

    function setStatus(message = '', tone = 'muted', options = {}) {
      if (statusHideTimer) {
        clearTimeout(statusHideTimer);
        statusHideTimer = null;
      }

      const text = String(message || '').trim();
      if (!text) {
        statusBox.className = 'hidden rounded-xl border px-3 py-2 text-sm break-words';
        statusBox.textContent = '';
        return;
      }

      const toneClass =
        tone === 'error'
          ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          : tone === 'success'
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : tone === 'loading'
              ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-100'
              : 'border-slate-600/50 bg-slate-900/40 text-slate-300';

      statusBox.className = `rounded-xl border px-3 py-2 text-sm break-words ${toneClass}`;
      statusBox.textContent = text;

      const autoHideMs = Number(options?.autoHideMs);
      if (Number.isFinite(autoHideMs) && autoHideMs > 0) {
        statusHideTimer = setTimeout(() => {
          statusHideTimer = null;
          statusBox.className = 'hidden rounded-xl border px-3 py-2 text-sm break-words';
          statusBox.textContent = '';
        }, autoHideMs);
      }
    }

    function originBadgeClass(item) {
      const label = String(item?.badgeLabel || item?.origin || '').toLowerCase();
      if (label.includes('edited')) return 'border-blue-400/25 bg-blue-400/15 text-blue-200';
      if (label.includes('auto')) return 'border-cyan-400/25 bg-cyan-400/15 text-cyan-200';
      return 'border-yellow-400/25 bg-yellow-400/15 text-yellow-200';
    }

    function ensureTimezoneOptions(value) {
      const tz = String(value || 'utc+0').trim();
      if (ACTIVE_CODE_TZ_OPTIONS.some(opt => String(opt.value) === tz)) return ACTIVE_CODE_TZ_OPTIONS;
      return [{ value: tz, label: tz.toUpperCase() }, ...ACTIVE_CODE_TZ_OPTIONS];
    }

    function ensureSelectedIndex() {
      const visibleIndexes = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item?.deleted !== true)
        .filter(({ item }) => !hideInactive || !isInactiveItem(item))
        .map(({ idx }) => idx);

      if (!items.length || !visibleIndexes.length) {
        selectedIndex = -1;
        return;
      }
      if (!visibleIndexes.includes(selectedIndex)) selectedIndex = visibleIndexes[0];
    }

    function activeCodeStatus(item, now = Date.now()) {
      if (item?.deleted === true) return 'deleted';
      if (item?.enabled === false) return 'disabled';
      if (Number.isFinite(item?.expiresAtMs) && Number(item.expiresAtMs) <= now) return 'expired';
      if (Number.isFinite(item?.startsAtMs) && Number(item.startsAtMs) > now) return 'scheduled';
      return 'active';
    }

    function isInactiveItem(item) {
      const status = activeCodeStatus(item);
      // Scheduled codes are not public yet, but stay visible with "Hide inactive"
      // so admins can find and edit upcoming codes before launch.
      return status === 'disabled' || status === 'deleted' || status === 'expired';
    }

    function getVisibleNavItems() {
      const all = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item?.deleted !== true);
      return all.filter(({ item }) => !hideInactive || !isInactiveItem(item));
    }

    function makeCodeNavButton(item, index) {
      const btn = document.createElement('button');
      const codeText = String(item.code || '').trim() || `Code ${index + 1}`;
      const status = activeCodeStatus(item);
      const statusClasses = {
        active: 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/20',
        scheduled: 'bg-sky-400/15 text-sky-200 border border-sky-400/20',
        expired: 'bg-amber-400/15 text-amber-200 border border-amber-400/20',
        disabled: 'bg-slate-700/40 text-slate-300 border border-slate-600/40',
        deleted: 'bg-rose-400/15 text-rose-200 border border-rose-400/20'
      };
      const statusLabels = {
        active: 'ON',
        scheduled: 'Scheduled',
        expired: 'Expired',
        disabled: 'OFF',
        deleted: 'Deleted'
      };

      btn.type = 'button';
      btn.className = [
        'w-full min-w-0 min-h-[72px] text-left px-3 py-3 rounded-xl border transition overflow-hidden',
        index === selectedIndex
          ? 'border-yellow-400/40 bg-yellow-400/15 text-yellow-200'
          : 'border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60'
      ].join(' ');

      btn.innerHTML = `
        <div class="flex items-start justify-between gap-2 min-w-0">
          <div class="min-w-0 flex-1 text-sm font-semibold leading-tight truncate">${escapeHtml(codeText)}</div>
          <span class="shrink-0 text-[10px] px-2 py-0.5 rounded-full ${statusClasses[status] || statusClasses.disabled}">
            ${statusLabels[status] || 'OFF'}
          </span>
        </div>
        <div class="mt-2 flex items-center gap-2 flex-wrap">
          <span class="text-[10px] px-2 py-0.5 rounded-full border ${originBadgeClass(item)}">${escapeHtml(String(item.badgeLabel || item.origin || 'Manual'))}</span>
        </div>
      `;

      btn.onclick = () => {
        const oldScrollTop = navWrap.scrollTop;
        selectedIndex = index;
        renderNavOnly();
        renderEditor();
        requestAnimationFrame(() => {
          navWrap.scrollTop = oldScrollTop;
        });
      };

      return btn;
    }

    function buildEditor(item = {}, index = 0) {
      const wrap = document.createElement('div');
      wrap.className = 'grid gap-4';

      const code = makeInput('text', item.code || '');
      const reward = makeTextarea(item.reward || '', 5);
      const date = makeInput('date', item.expiresDate || '');
      const time = makeInput('time', item.expiresTime || '23:59');
      const startsDate = makeInput('date', item.startsDate || '');
      const startsTime = makeInput('time', item.startsTime || '');
      const tz = makeSelect(ensureTimezoneOptions(item.timezone || 'utc+0'), item.timezone || 'utc+0');
      const enabled = makeCheckbox(item.enabled !== false);
      const note = makeTextarea(item.note || item.availabilityNote || '', 3);

      [code, date, time, startsDate, startsTime, tz].forEach((el) => el.classList.add('min-h-[44px]'));
      reward.classList.add('min-h-[132px]');
      note.classList.add('min-h-[104px]');
      enabled.classList.add('h-5', 'w-5');

      const top = document.createElement('div');
      top.className = 'flex items-center justify-between gap-3 flex-wrap';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'grid gap-2';

      const title = document.createElement('div');
      title.className = 'text-slate-100 font-bold text-lg';
      title.textContent = `Edit code ${index + 1}`;

      const badge = document.createElement('div');
      badge.className = `inline-flex items-center px-2 py-1 rounded-full border text-[11px] ${originBadgeClass(item)}`;
      badge.textContent = String(item.badgeLabel || item.origin || 'Manual');

      const status = activeCodeStatus(item);
      const statusBadge = document.createElement('div');
      statusBadge.className = [
        'inline-flex items-center px-2 py-1 rounded-full border text-[11px]',
        status === 'scheduled'
          ? 'border-sky-400/25 bg-sky-400/15 text-sky-200'
          : status === 'active'
            ? 'border-emerald-400/25 bg-emerald-400/15 text-emerald-200'
            : 'border-slate-500/35 bg-slate-700/30 text-slate-300'
      ].join(' ');
      statusBadge.textContent = status === 'scheduled' ? 'Scheduled' : status.charAt(0).toUpperCase() + status.slice(1);

      const badgeRow = document.createElement('div');
      badgeRow.className = 'flex flex-wrap gap-2';
      badgeRow.append(badge, statusBadge);

      titleWrap.append(title, badgeRow);

      const enabledWrap = document.createElement('label');
      enabledWrap.className = 'flex items-center gap-3 text-sm text-slate-200 min-h-[40px]';
      enabledWrap.append(document.createTextNode('Enabled'), enabled);

      top.append(titleWrap, enabledWrap);

      const meta = document.createElement('div');
      meta.className = 'rounded-xl border border-slate-700/50 bg-slate-900/30 px-4 py-3 text-sm text-slate-300 grid gap-2';
      meta.innerHTML = `
        <div class="hidden md:block"><span class="text-slate-400">Source:</span> ${escapeHtml(String(item.source || (item.origin === 'manual' ? 'Manual entry' : 'Netmarble post')))}</div>
        ${item.postTitle ? `<div class="hidden md:block"><span class="text-slate-400">Post:</span> ${escapeHtml(String(item.postTitle))}</div>` : ''}
        ${item.startsAtMs ? `<div class="hidden md:block"><span class="text-slate-400">Available from:</span> ${escapeHtml(humanLocalEn(new Date(item.startsAtMs).toISOString()))}</div>` : ''}
        <div class="md:hidden text-slate-200 font-medium">${item.postTitle || item.sourceUrl || item.postSlug ? 'Post source' : 'Source details'}</div>
      `;

      if (item.sourceUrl || item.postSlug) {
        const sourceLink = document.createElement('a');
        sourceLink.href = item.sourceUrl || apiPath(`/posts/${encodeURIComponent(item.postSlug)}`);
        if (item.sourceUrl) {
          sourceLink.target = '_blank';
          sourceLink.rel = 'noopener noreferrer';
        }
        sourceLink.className = 'inline-flex w-full md:w-auto items-center justify-center px-3 py-3 md:py-2 rounded-xl border border-slate-600/60 text-slate-100 hover:bg-slate-800 transition text-sm no-underline';
        sourceLink.textContent = item.sourceUrl ? 'Open source URL' : 'Open source post';
        meta.append(sourceLink);
      }

      let expiryTouched = false;
      let estimatedExpiryNote = null;
      if (item.expiryEstimated === true) {
        estimatedExpiryNote = document.createElement('div');
        estimatedExpiryNote.className = 'rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100';
        estimatedExpiryNote.textContent = 'Estimated expiry: no date was found in the post, so this was set to post date + 14 days. Please verify manually.';
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'px-3 py-2 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 transition';
      removeBtn.textContent = item.origin === 'manual' ? 'Remove manual code' : 'Reset edit override';
      removeBtn.onclick = () => {
        if (item.origin === 'manual') {
          items.splice(index, 1);
        } else {
          items[index] = {
            ...(item.rawAuto || item),
            origin: 'auto',
            badgeLabel: 'Auto from Netmarble',
            matchCodeKey: item.matchCodeKey || item.autoCodeKey || item.codeKey || '',
            autoCodeKey: item.autoCodeKey || item.matchCodeKey || item.codeKey || ''
          };
        }

        if (!items.length) selectedIndex = -1;
        else if (selectedIndex >= items.length) selectedIndex = items.length - 1;
        renderAll();
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'px-3 py-2 rounded-xl border border-rose-500/40 text-rose-200 hover:bg-rose-500/15 transition';
      deleteBtn.textContent = item.origin === 'manual' ? 'Delete code' : 'Delete code permanently';
      deleteBtn.onclick = () => {
        const confirmed = window.confirm(
          item.origin === 'manual'
            ? 'Delete this manual code?'
            : 'Delete this auto code permanently? It will stay hidden after future syncs.'
        );
        if (!confirmed) return;

        if (item.origin === 'manual') {
          items.splice(index, 1);
        } else {
          items[index] = {
            ...item,
            deleted: true,
            enabled: false,
            origin: 'override',
            badgeLabel: 'Deleted',
            matchCodeKey: item.matchCodeKey || item.autoCodeKey || item.codeKey || '',
            autoCodeKey: item.autoCodeKey || item.matchCodeKey || item.codeKey || ''
          };
        }

        ensureSelectedIndex();
        renderAll();
      };

      wrap.append(
        top,
        meta,
        ...(estimatedExpiryNote ? [estimatedExpiryNote] : []),
        twoColsField('Code', code, 'Timezone', tz),
        field('Reward', reward),
        twoColsField('Expiry date', date, 'Expiry time', time),
        twoColsField('Start date', startsDate, 'Start time', startsTime),
        (() => {
          const el = document.createElement('div');
          el.className = 'text-xs text-slate-400 -mt-2';
          el.textContent = 'Optional. Leave empty if the code is active immediately.';
          return el;
        })(),
        field('Note', note),
        removeBtn,
        deleteBtn
      );

      wrap.__getValue = () => {
        const nextStartsDate = String(startsDate.value || '').trim();
        const nextStartsTime = String(startsTime.value || '').trim();
        const hasStartOverride = !!(nextStartsDate || nextStartsTime);

        return {
          ...item,
          id: item.id || `manual-${Date.now()}-${index}`,
          code: String(code.value || '').trim(),
          reward: String(reward.value || '').trim(),
          note: String(note.value || '').trim(),
          expiresDate: String(date.value || '').trim(),
          expiresTime: String(time.value || '').trim(),
          startsDate: nextStartsDate,
          startsTime: nextStartsTime,
          startsAtMs: null,
          startsAtIso: null,
          startsOverridden: hasStartOverride,
          timezone: String(tz.value || 'utc+0').trim(),
          enabled: !!enabled.checked,
          sortOrder: index,
          createdAt: item.createdAt || new Date().toISOString(),
          origin: item.origin || 'manual',
          expiryEstimated: expiryTouched ? false : item.expiryEstimated === true,
          expiryEstimateReason: expiryTouched ? '' : (item.expiryEstimateReason || ''),
          expiryEstimateDays: expiryTouched ? null : (item.expiryEstimateDays ?? null),
          deleted: item.deleted === true,
          matchCodeKey: item.matchCodeKey || item.autoCodeKey || item.codeKey || '',
          autoCodeKey: item.autoCodeKey || item.matchCodeKey || item.codeKey || ''
        };
      };

      [code, reward, note, date, time, startsDate, startsTime, tz, enabled].forEach(el => {
        const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(evt, () => {
          if (el === date || el === time || el === tz) expiryTouched = true;
          items[index] = { ...items[index], ...wrap.__getValue() };
          if (items[index].origin === 'auto') {
            items[index].origin = 'override';
            items[index].badgeLabel = 'Edited override';
          } else if (items[index].origin === 'override') {
            items[index].badgeLabel = 'Edited override';
          }
          renderNavOnly();
        });
      });

      return wrap;
    }

    function renderNavOnly() {
      const oldScrollTop = navWrap.scrollTop;
      navWrap.innerHTML = '';
      const visibleItems = getVisibleNavItems();
      const totalVisibleBase = items.filter(item => item?.deleted !== true).length;
      countsText.innerHTML = `<span class="md:hidden">${visibleItems.length} / ${totalVisibleBase}</span><span class="hidden md:inline">Showing ${visibleItems.length} of ${totalVisibleBase} codes</span>`;

      if (!visibleItems.length) {
        const empty = document.createElement('div');
        empty.className = 'text-sm text-slate-300/80';
        empty.textContent = items.length ? 'No codes match the current filter.' : 'No active codes yet.';
        navWrap.append(empty);
        return;
      }

      ensureSelectedIndex();
      visibleItems.forEach(({ item, idx }) => {
        navWrap.append(makeCodeNavButton(item, idx));
      });

      navWrap.scrollTop = oldScrollTop;
    }

    function renderEditor() {
      content.innerHTML = '';

      if (!items.length || selectedIndex < 0 || items[selectedIndex]?.deleted === true) {
        const empty = document.createElement('div');
        empty.className = 'h-full min-h-[320px] grid place-items-center text-center text-slate-300/80';
        empty.innerHTML = '<div><div class="text-lg font-semibold text-slate-100">No code selected</div><div class="mt-2 text-sm">Add a manual code or rescan posts from the left side.</div></div>';
        content.append(empty);
        return;
      }

      ensureSelectedIndex();
      content.append(buildEditor(items[selectedIndex], selectedIndex));
    }

    function renderAll() {
      ensureSelectedIndex();
      renderNavOnly();
      renderEditor();
    }

    async function reloadItems(keepCode = '') {
      const refreshed = await loadActiveCodesAdmin();
      items = Array.isArray(refreshed) ? refreshed.map((item, idx) => ({ ...item, sortOrder: idx })) : [];
      if (keepCode) {
        const nextIndex = items.findIndex(item => String(item.code || '').trim() === String(keepCode).trim());
        selectedIndex = nextIndex >= 0 ? nextIndex : (items.length ? 0 : -1);
      } else {
        selectedIndex = items.length ? 0 : -1;
      }
      renderAll();
    }

    addBtn.onclick = () => {
      items.push({
        code: '',
        reward: '',
        source: 'Manual entry',
        note: '',
        expiresDate: '',
        expiresTime: '23:59',
        startsDate: '',
        startsTime: '',
        timezone: 'utc+0',
        enabled: true,
        deleted: false,
        origin: 'manual',
        badgeLabel: 'Manual'
      });
      selectedIndex = items.length - 1;
      renderAll();
    };

    hideInactiveCb.addEventListener('change', () => {
      hideInactive = !!hideInactiveCb.checked;
      renderAll();
    });

    rescanBtn.onclick = async () => {
      const keepCode = items[selectedIndex]?.code || '';
      rescanBtn.disabled = true;
      setStatus('Rescanning posts…', 'loading');
      try {
        const out = await rescanActiveCodesAdmin();
        await reloadItems(keepCode);
        setStatus(`Rescan done: ${Number(out?.foundCodes || 0)} codes, +${Number(out?.newCodes || 0)} new, ${Number(out?.updatedCodes || 0)} updated.`, 'success', { autoHideMs: 3000 });
        if (typeof onSaved === 'function') await onSaved();
      } catch (err) {
        setStatus(`Error: ${err?.message || err}`, 'error');
      } finally {
        rescanBtn.disabled = false;
      }
    };

    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      setStatus('Saving…', 'loading');

      try {
        const next = items
          .map((item, idx) => {
            const startsDateValue = String(item.startsDate || '').trim();
            const startsTimeValue = String(item.startsTime || '').trim();
            const hasStartOverride = !!(startsDateValue || startsTimeValue);

            return {
              ...item,
              id: item.id || `manual-${Date.now()}-${idx}`,
              code: String(item.code || '').trim(),
              reward: String(item.reward || '').trim(),
              note: String(item.note || '').trim(),
              expiresDate: String(item.expiresDate || '').trim(),
              expiresTime: String(item.expiresTime || '').trim(),
              startsDate: startsDateValue,
              startsTime: startsTimeValue,
              startsAtMs: null,
              startsAtIso: null,
              startsOverridden: hasStartOverride,
              timezone: String(item.timezone || 'utc+0').trim(),
              enabled: item.enabled !== false,
              sortOrder: idx,
              createdAt: item.createdAt || new Date().toISOString(),
              origin: item.origin || 'manual',
              deleted: item.deleted === true,
              matchCodeKey: item.matchCodeKey || item.autoCodeKey || item.codeKey || '',
              autoCodeKey: item.autoCodeKey || item.matchCodeKey || item.codeKey || ''
            };
          })
          .filter(x => x.code || x.deleted === true);

        const out = await saveActiveCodesAdmin(next);
        items = Array.isArray(out?.items) ? out.items.map((item, idx) => ({ ...item, sortOrder: idx })) : next;
        selectedIndex = items.length ? Math.min(selectedIndex, items.length - 1) : -1;
        renderAll();
        setStatus('Saved!', 'success', { autoHideMs: 3000 });
        if (typeof onSaved === 'function') await onSaved();
      } catch (err) {
        setStatus(`Error: ${err?.message || err}`, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };

    actions.append(saveBtn);
    leftTitleRow.append(leftTitle, addBtn, rescanBtn);
    leftTop.append(leftTitleRow, helperText, filtersRow, statusBox);
    left.append(leftTop, navWrap);
    right.append(content, actions);
    layout.append(left, right);
    body.append(layout);

    renderAll();

    window.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        window.removeEventListener('keydown', esc);
      }
    });
  }

  async function loadStats() {
    const listFromApi = (payload, key) => {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.items)) return payload.items;
      if (key && Array.isArray(payload?.[key])) return payload[key];
      return [];
    };

    let totalUsers = '—';
    try {
      const j = await fetchJson('/api/members?page=1&pageSize=1');
      const n = Number(j.totalItems ?? j.total ?? j.count);
      totalUsers = Number.isFinite(n) ? String(n) : '—';
    } catch (_) {}

    let huntersAvailable = '—';
    try {
      const hunters = await fetchJson('/api/public/hunters');
      huntersAvailable = String(listFromApi(hunters, 'hunters').length);
    } catch (_) {}

    let weaponsAvailable = '—';
    try {
      const [hw, sw] = await Promise.all([
        fetchJson('/api/public/hunter-weapons'),
        fetchJson('/api/public/sung-weapons'),
      ]);
      const a = listFromApi(hw, 'weapons').length;
      const b = listFromApi(sw, 'weapons').length;
      weaponsAvailable = String(a + b);
    } catch (_) {}

    let successorsAvailable = '—';
    try {
      const out = await fetchJson('/api/public/successors');
      const items = Array.isArray(out?.items) ? out.items : [];
      successorsAvailable = String(items.length);
    } catch (_) {}

    return { totalUsers, huntersAvailable, weaponsAvailable, successorsAvailable };
  }

  function statCard(value, label, key) {
    const n = Number(value);
    const isNum = Number.isFinite(n);
    const display = isNum ? '0' : escapeHtml(value);

    return `
      <div class="stat-card bg-glass border border-slate-700/60 rounded-2xl px-6 py-5 text-center shadow-sm">
        <div class="text-yellow-400 text-4xl font-extrabold leading-none"
             ${isNum ? `data-count-key="${escapeHtml(key)}" data-count-to="${n}"` : ''}>${display}</div>
        <div class="mt-2 text-[11px] tracking-[0.24em] text-slate-300/90">${escapeHtml(label)}</div>
      </div>`;
  }

  function animateCounts() {
    const els = document.querySelectorAll('[data-count-to]');
    if (!els.length) return;

    const start = performance.now();
    const duration = 750;

    function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);

      for (const el of els) {
        const target = Number(el.getAttribute('data-count-to'));
        if (!Number.isFinite(target)) continue;
        const cur = Math.round(target * eased);
        el.textContent = String(cur);
      }

      if (p < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function renderHome(container, stats) {
    container.innerHTML = `
      <section class="pt-10">
        <div class="text-center">
          <div class="text-yellow-400 text-3xl md:text-5xl font-extrabold gold-title">SLA HUB</div>
          <div class="mt-2 text-slate-300/90">Your Complete Wiki &amp; Progress Manager</div>
        </div>
  
        <div class="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${statCard(stats.totalUsers, 'TOTAL USERS', 'users')}
          ${statCard(stats.huntersAvailable, 'HUNTERS AVAILABLE', 'hunters')}
          ${statCard(stats.weaponsAvailable, 'WEAPONS AVAILABLE', 'weapons')}
          ${statCard(stats.successorsAvailable, 'SUCCESSORS', 'successors')}
        </div>
      </section>
  
      <div class="mt-10 thin-gold-line"></div>
  
      <section class="mt-10">
        <div class="flex items-center justify-between">
          <div class="w-[90px]"></div>
          <div class="text-center flex-1">
            <div class="text-yellow-400 text-2xl md:text-3xl font-extrabold gold-title">TIMER</div>
            <div class="mt-1 text-[11px] md:text-xs text-slate-300/70 tracking-wide">
            </div>
          </div>
          <div class="w-[90px] flex justify-end">
            <button id="homeEditTimersBtn"
              class="px-3 py-2 rounded-xl border border-slate-700/60 bg-glass text-slate-100 text-sm hover:bg-slate-800/50 transition">
              Edit
            </button>
          </div>
        </div>
  
        <div class="mt-6" id="homeTimers"></div>
  
        <div class="mt-10">
          <div class="flex items-center justify-between">
            <div class="w-[90px]"></div>
            <div class="text-center flex-1">
              <div class="text-yellow-400 text-2xl md:text-3xl font-extrabold gold-title">ACTIVE CODES</div>
              <div class="mt-1 text-[11px] md:text-xs text-slate-300/70 tracking-wide">
                Code and remaining time
              </div>
            </div>
            <div class="w-[90px] flex justify-end">
              <button id="homeEditCodesBtn"
                class="px-3 py-2 rounded-xl border border-slate-700/60 bg-glass text-slate-100 text-sm hover:bg-slate-800/50 transition">
                Edit
              </button>
            </div>
          </div>
  
          <div class="mt-6" id="homeActiveCodes"></div>
        </div>
      </section>
    `;
  }

  function clearSidebarActive() {
    const sidebarItems = document.querySelectorAll(
      '.side a, .side button, .sidebar a, .sidebar button, [data-nav]'
    );
    for (const el of sidebarItems) {
      el.classList.remove('active', 'is-active', 'selected', 'current');
      el.classList.remove('bg-white', 'text-black');
    }
  }

  async function boot() {
    const container = document.getElementById('content');
    if (!container) return;

    clearSidebarActive();

    const isAdmin = await ensureIsAdmin();
    await loadAdminUiPrefsIfAdmin(isAdmin);

    renderHome(container, { totalUsers: 0, huntersAvailable: 0, weaponsAvailable: 0, successorsAvailable: 0 });

    updateHomeEditBtnVisibility(isAdmin);
    updateHomeCodesEditBtnVisibility(isAdmin);
    showTimersLoading();
    showActiveCodesLoading();

    const stats = await loadStats();
    renderHome(container, stats);
    animateCounts();

    updateHomeEditBtnVisibility(isAdmin);
    updateHomeCodesEditBtnVisibility(isAdmin);

    let STATE = await loadGlobalTimerSettings();
    let timers = buildTimers(STATE);
    startTimerTick(timers, STATE);
    renderActiveCodesHome().catch(() => {});

    const btn = document.getElementById('homeEditTimersBtn');
    if (btn) {
      btn.onclick = async () => {
        updateHomeEditBtnVisibility(isAdmin);
        if (btn.style.display === 'none' || btn.disabled) return;

        await openEditModal(STATE, async () => {
          STATE = await loadGlobalTimerSettings();
          timers = buildTimers(STATE);
          startTimerTick(timers, STATE);
        });
      };
    }

    const btnCodes = document.getElementById('homeEditCodesBtn');
    if (btnCodes) {
      updateHomeCodesEditBtnVisibility(isAdmin);

      btnCodes.onclick = async () => {
        updateHomeCodesEditBtnVisibility(isAdmin);
        if (btnCodes.style.display === 'none' || btnCodes.disabled) return;

        await openActiveCodesEditModal(async () => {
          await renderActiveCodesHome();
        });
      };
    }

    window.addEventListener('ui-hide-admin-buttons-changed', () => {
      updateHomeEditBtnVisibility(isAdmin);
      updateHomeCodesEditBtnVisibility(isAdmin);
    });

    window.addEventListener('sla:admin-hide-changed', () => {
      updateHomeEditBtnVisibility(isAdmin);
      updateHomeCodesEditBtnVisibility(isAdmin);
    });

    window.addEventListener('focus', () => {
      loadAdminUiPrefsIfAdmin(isAdmin).then(() => {
        updateHomeEditBtnVisibility(isAdmin);
        updateHomeCodesEditBtnVisibility(isAdmin);
      }).catch(() => {});
    });
  }

  window.renderMainPage = boot;
})();
