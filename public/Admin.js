'use strict';

(function forceAdminDarkOnly() {
  function applyDark() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.remove('light');
    root.classList.add('dark');
    root.dataset.theme = 'dark';
    root.style.colorScheme = 'dark';

    if (document.body) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      document.body.style.colorScheme = 'dark';
    }

    try {
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('color-theme', 'dark');
      sessionStorage.setItem('theme', 'dark');
    } catch (_) {}
  }

  applyDark();
  window.forceDarkMode = window.forceDarkMode || applyDark;
})();


/**
 * Admin.js
 * Router:
 * /admin -> loads /Admin.js and calls window.__admin_mount(path)
 *
 * Tabs:
 * - Overview (instant hide/show sidebar admin buttons)
 * - Users (list users + per-user reset modal)
 * - Maintenance (global reset)
 * - Tools (placeholder)
 * - Coming Soon
 *
 * API:
 * - GET  /api/admin/is-admin
 * - GET  /api/admin/ui-prefs
 * - POST /api/admin/ui-prefs  { hideAdminButtons: boolean }
 * - GET  /api/members?page=&pageSize=&name=
 * - POST /api/admin/reset-user-collections { userId, type }
 * - POST /api/admin/mini-game/grant-currency { userId, gold, essence, customTickets, weaponTickets }
 * - POST /api/admin/reset-collections
 *
 * Coming Soon API:
 * - GET  /api/admin/coming-soon
 * - POST /api/admin/coming-soon  { key, enabled }  OR  { flags }
 *
 */

(function () {
  // --------------------------
  // Helpers
  // --------------------------
  const qs = (sel, root = document) => root.querySelector(sel);

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    if (typeof window.url === 'function') return window.url(p);
    const b = basePath();
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${b}${path}`;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;

      if (k === 'class') node.className = v;
      else if (k === 'style' && v && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else node.setAttribute(k, String(v));
    }

    for (const ch of children) {
      if (ch == null) continue;
      node.append(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  async function fetchJson(path, opts = {}) {
    const res = await fetch(url(path), {
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(opts.headers || {}),
      },
      ...opts,
    });

    if (!res.ok) {
      let msg = '';
      try {
        const j = await res.json();
        msg = j?.error || j?.message || '';
      } catch {}
      const err = new Error(msg || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function clamp(n, a, b) {
    n = Number(n || 0);
    return Math.max(a, Math.min(b, n));
  }

  function safeStr(x) {
    return String(x ?? '').trim();
  }

  // --------------------------
  // Route guard
  // --------------------------
  function isAdminRoute() {
    try {
      const p = location.pathname || '';
      return p === '/admin' || p.endsWith('/admin') || p.includes('/admin/');
    } catch {
      return false;
    }
  }

  function safeRender() {
    try { if (typeof window.forceDarkMode === 'function') window.forceDarkMode(); } catch (_) {}
    if (!isAdminRoute()) return;
    render();
  }

  // --------------------------
  // Hide buttons toggle
  // --------------------------
  const LS_HIDE_KEY = 'sla_hide_admin_buttons';
  const LS_VIEW_MENU_LIKE_USER_KEY = 'sla_admin_view_menu_like_user';
  const LS_VIEW_COMING_SOON_LIKE_USER_KEY = 'sla_admin_view_coming_soon_like_user';
  const DEFAULT_SITE_MAINTENANCE = {
    enabled: false,
    messageTitle: '\uD83D\uDEA7 We\u2019ll be back soon!',
    messageBody: 'Our site is currently undergoing scheduled maintenance.\nPlease check back later.',
    imageSrc: '/picture/ComingSoon3.png'
  };

  function loadBool(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v === null) return fallback;
      return v === '1';
    } catch {
      return fallback;
    }
  }

  function saveBool(key, val) {
    try {
      localStorage.setItem(key, val ? '1' : '0');
    } catch {}
  }

  function applySidebarHidden(hide) {
    saveBool(LS_HIDE_KEY, !!hide);

    if (typeof window.__sla_setAdminButtonsHidden === 'function') {
      window.__sla_setAdminButtonsHidden(!!hide);
    }

    window.dispatchEvent(new CustomEvent('sla:admin-hide-changed', { detail: { hide: !!hide } }));
  }

  function setAdminViewMenuLikeUser(enabled) {
    saveBool(LS_VIEW_MENU_LIKE_USER_KEY, !!enabled);
    window.__sla_adminViewMenuLikeUser = () => loadBool(LS_VIEW_MENU_LIKE_USER_KEY, false);
    window.dispatchEvent(new CustomEvent('sla:admin-view-menu-like-user-changed', { detail: { enabled: !!enabled } }));
    try { window.renderSidebar?.(); } catch {}
    try { window.renderMenu?.(); } catch {}
  }

  function setAdminViewComingSoonLikeUser(enabled) {
    saveBool(LS_VIEW_COMING_SOON_LIKE_USER_KEY, !!enabled);
    window.__sla_adminViewComingSoonLikeUser = () => loadBool(LS_VIEW_COMING_SOON_LIKE_USER_KEY, false);
    try {
      if (window.STATE?.ui?.comingSoon) {
        window.STATE.ui.comingSoon.loaded = false;
        window.STATE.ui.comingSoon.loadedAt = 0;
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('sla:admin-view-coming-soon-like-user-changed', { detail: { enabled: !!enabled } }));
  }

  // --------------------------
  // Local CSS
  // --------------------------
  function injectStyles() {
    if (document.getElementById('admin-module-style')) return;
    const s = document.createElement('style');
    s.id = 'admin-module-style';
    s.textContent = `
      .admin-shell{ width: 100%; margin: 0 auto; padding: 24px 12px; box-sizing: border-box; }
      @media (min-width: 640px){
        .admin-shell{ padding-left: 24px; padding-right: 24px; }
      }

      .admin-title{
        font-size: 34px; font-weight: 900; letter-spacing: -0.02em;
        color: rgb(15,23,42);
      }
      /* Page title should be yellow in dark mode. */
      .dark .admin-title{ color: rgb(250,204,21); }
      .admin-sub{
        margin-top: 6px;
        color: rgba(100,116,139,.95);
        font-weight: 600;
      }
      /* Slightly brighter description in dark mode. */
      .dark .admin-sub{ color: rgba(203,213,225,.90); }

      .admin-tabs{
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
      }
      @media (max-width: 900px){
        .admin-tabs{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (max-width: 560px){
        .admin-tabs{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .admin-tab{
        height: 40px; /* h-10 */
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,.25);
        background: rgba(255,255,255,.92);
        font-weight: 900;
        color: rgb(15,23,42);
        transition: transform .1s ease, background .12s ease, border-color .12s ease, box-shadow .12s ease;
        outline: none;
      }
      .dark .admin-tab{
        /* bg-glass */
        background: rgba(15,23,42,.72);
        border-color: rgba(148,163,184,.22);
        color: rgba(226,232,240,.95);
      }
      .admin-tab:hover{
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(0,0,0,.10);
      }
      .dark .admin-tab:hover{ background: rgba(255,255,255,.08); }
      .admin-tab:focus-visible{
        box-shadow: 0 0 0 2px rgba(250,204,21,.35);
      }
      /* Active tab = yellow. */
      .admin-tab.is-active{
        background: rgb(250,204,21) !important;
        color: rgb(15,23,42) !important;
        border-color: rgba(250,204,21,.85) !important;
        box-shadow: 0 0 0 1px rgba(250,204,21,.18), 0 10px 24px rgba(0,0,0,.16) !important;
      }
      .dark .admin-tab.is-active{
        background: rgb(250,204,21) !important;
        color: rgb(15,23,42) !important;
        border-color: rgba(250,204,21,.85) !important;
        box-shadow: 0 0 0 1px rgba(250,204,21,.18), 0 10px 24px rgba(0,0,0,.16) !important;
      }

      .admin-card{
        margin-top: 12px;
        border-radius: 18px;
        border: 1px solid rgba(148,163,184,.25);
        background: #fff;
        padding: 14px;
        box-shadow: 0 10px 26px rgba(0,0,0,.06);
      }
      .dark .admin-card{
        background: rgba(15,23,42,.58);
        border-color: rgba(148,163,184,.18);
        box-shadow: 0 14px 34px rgba(0,0,0,.20);
      }

      .admin-row{ display:flex; align-items:center; gap:10px; flex-wrap: wrap; }
      .admin-row.space{ justify-content: space-between; }

      .admin-btn{
        height: 40px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,.35);
        background: rgba(248,250,252,.95);
        color: rgb(15,23,42);
        font-weight: 900;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        cursor:pointer;
        transition: transform .1s ease, box-shadow .12s ease, background .12s ease;
        outline: none;
      }
      .admin-btn:hover{
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(0,0,0,.10);
        background: rgba(255,255,255,.98);
      }
      .dark .admin-btn:hover{ background: rgba(255,255,255,.08); }
      .dark .admin-btn{
        /* bg-glass */
        background: rgba(2,6,23,.52);
        border-color: rgba(148,163,184,.25);
        color: rgba(226,232,240,.95);
      }
      .admin-btn:focus-visible{ box-shadow: 0 0 0 2px rgba(250,204,21,.35); }

      .admin-btn.danger{
        border-color: rgba(239,68,68,.55);
        background: rgba(239,68,68,.12);
        color: rgba(254,202,202,.95);
      }
      .admin-btn.primary{
        border-color: rgba(250,204,21,.85);
        background: rgb(250,204,21);
        color: rgb(15,23,42);
      }
      .dark .admin-btn.primary{ color: rgb(15,23,42); }
      .admin-btn:disabled{
        opacity:.6;
        cursor:not-allowed;
        transform:none;
        box-shadow:none;
      }

      .admin-btn.small{ height: 36px; border-radius: 12px; padding: 0 12px; }

      .admin-input{
        height: 40px;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,.35);
        padding: 0 14px;
        background: rgba(248,250,252,.95);
        color: rgb(15,23,42);
        font-weight: 800;
        outline: none;
        min-width: 240px;
      }
      .dark .admin-input{
        background: rgba(2,6,23,.52);
        border-color: rgba(148,163,184,.25);
        color: rgba(226,232,240,.95);
      }
      .admin-textarea{
        min-height: 110px;
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,.35);
        padding: 12px 14px;
        background: rgba(248,250,252,.95);
        color: rgb(15,23,42);
        font-weight: 800;
        outline: none;
        resize: vertical;
      }
      .dark .admin-textarea{
        background: rgba(2,6,23,.52);
        border-color: rgba(148,163,184,.25);
        color: rgba(226,232,240,.95);
      }

      .admin-pill{
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(148,163,184,.25);
        font-weight: 900;
        font-size: 12px;
        color: rgba(15,23,42,.92);
        background: rgba(241,245,249,.9);
        display:flex;
        align-items:center;
        gap:8px;
      }
      .dark .admin-pill{
        color: rgba(226,232,240,.95);
        background: rgba(2,6,23,.30);
      }
      .admin-pill.ok{
        border-color: rgba(34,197,94,.35);
        background: rgba(34,197,94,.12);
      }
      .admin-pill.bad{
        border-color: rgba(239,68,68,.35);
        background: rgba(239,68,68,.12);
      }

      .admin-table{ display:flex; flex-direction:column; gap:10px; margin-top: 10px; }
      .admin-item{
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; flex-wrap: wrap;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 18px;
        padding: 12px;
        background: rgba(248,250,252,.75);
      }
      .dark .admin-item{
        background: rgba(2,6,23,.40);
        border-color: rgba(148,163,184,.16);
      }
      .admin-item-left{ display:flex; align-items:center; gap:12px; min-width: 0; }
      .admin-avatar{
        width: 44px; height: 44px;
        border-radius: 16px;
        object-fit: cover;
        border: 1px solid rgba(148,163,184,.25);
        background: rgba(15,23,42,.25);
      }
      .admin-name{ font-weight: 950; color: rgba(15,23,42,.95); }
      .dark .admin-name{ color: rgba(226,232,240,.95); }
      .admin-meta{ font-size: 12px; color: rgba(100,116,139,.95); font-weight: 700; white-space: pre-wrap; }
      .dark .admin-meta{ color: rgba(148,163,184,.9); }

      /* Simple modal */
      .adm-modal-backdrop{
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.55);
        display: grid;
        place-items: center;
        z-index: 9999;
        padding: 18px;
      }
      .adm-modal{
        width: min(720px, 100%);
        border-radius: 20px;
        border: 1px solid rgba(148,163,184,.25);
        background: #fff;
        padding: 14px;
        box-shadow: 0 24px 60px rgba(0,0,0,.35);
      }
      .dark .adm-modal{
        background: rgba(2,6,23,.96);
        border-color: rgba(148,163,184,.20);
      }
      .adm-modal-title{
        font-weight: 950;
        font-size: 18px;
        color: rgba(15,23,42,.95);
      }
      .dark .adm-modal-title{ color: rgba(226,232,240,.95); }
      .adm-modal-sub{
        margin-top: 2px;
        font-size: 13px;
        color: rgba(100,116,139,.95);
        font-weight: 700;
      }
      .dark .adm-modal-sub{ color: rgba(148,163,184,.9); }

      .adm-grid{
        display:grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      @media (max-width: 560px){
        .adm-grid{ grid-template-columns: 1fr; }
      }

      /* Toast fixed overlay (no pushing content) */
      .toast{
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        z-index: 99999;
        padding: 10px 12px;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,.25);
        background: rgba(241,245,249,.92);
        font-weight: 900;
        color: rgba(15,23,42,.92);
        box-shadow: 0 16px 40px rgba(0,0,0,.20);
        max-width: min(560px, calc(100vw - 24px));
        pointer-events: none;
      }
      .dark .toast{
        background: rgba(2,6,23,.75);
        color: rgba(226,232,240,.95);
        border-color: rgba(148,163,184,.18);
      }
      .toast.ok{ border-color: rgba(34,197,94,.35); }
      .toast.bad{ border-color: rgba(239,68,68,.35); }

      .mini-status{
        margin-left: 6px;
        font-size: 12px;
        font-weight: 900;
        color: rgba(100,116,139,.95);
      }
      .dark .mini-status{ color: rgba(148,163,184,.92); }

      .section-title{
        font-weight: 950;
        color: rgba(15,23,42,.95);
      }
      .dark .section-title{ color: rgba(226,232,240,.95); }

      .hint{
        margin-top: 10px;
        font-size: 12px;
        opacity: .85;
        color: rgba(100,116,139,.95);
        font-weight: 700;
        line-height: 1.35;
      }
      .dark .hint{
        color: rgba(148,163,184,.90);
      }

      /* Coming Soon toggles */
      .cs-row{
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        border: 1px solid rgba(148,163,184,.22);
        border-radius: 18px;
        padding: 12px;
        background: rgba(248,250,252,.75);
        margin-top: 10px;
      }
      .dark .cs-row{
        background: rgba(2,6,23,.40);
        border-color: rgba(148,163,184,.16);
      }
      .cs-name{ font-weight: 950; color: rgba(15,23,42,.95); }
      .dark .cs-name{ color: rgba(226,232,240,.95); }

      .menu-vis-group{
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .menu-vis-group-head{
        display:flex;
        align-items:center;
        gap:8px;
        padding: 0 2px 2px;
        color: rgba(100,116,139,.95);
        font-size: 12px;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .dark .menu-vis-group-head{
        color: rgba(148,163,184,.92);
      }
      .menu-vis-group-head i{
        color: rgba(250,204,21,.82);
        font-size: 12px;
      }

      .cs-btn{
        height: 36px;
        padding: 0 12px;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,.35);
        background: rgba(248,250,252,.95);
        color: rgb(15,23,42);
        font-weight: 950;
        cursor: pointer;
        outline: none;
        transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, transform .1s ease;
      }
      .dark .cs-btn{
        background: rgba(2,6,23,.52);
        border-color: rgba(148,163,184,.25);
        color: rgba(226,232,240,.95);
      }
      .cs-btn:hover{
        transform: translateY(-1px);
        background: rgba(255,255,255,.98);
      }
      .dark .cs-btn:hover{ background: rgba(255,255,255,.08); }
      .cs-btn:focus-visible{ box-shadow: 0 0 0 2px rgba(250,204,21,.35); }
      /* Active = yellow, regardless of ON/OFF button */
      .cs-btn.is-active-on,
      .cs-btn.is-active-off{
        border-color: rgba(250,204,21,.85) !important;
        background: rgb(250,204,21) !important;
        color: rgb(15,23,42) !important;
        box-shadow: 0 0 0 1px rgba(250,204,21,.18), 0 8px 18px rgba(0,0,0,.14) !important;
      }
      .cs-btn:disabled{ opacity: .6; cursor: not-allowed; }
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // Modal helper
  // --------------------------
  function openModal(title, subtitle, bodyNode) {
    if (typeof window.showModal === 'function') {
      window.showModal(title, () => {
        const wrap = el('div', { class: 'grid gap-3' });
        if (subtitle) wrap.append(el('div', { class: 'text-sm text-slate-500 dark:text-slate-400 font-semibold' }, subtitle));
        wrap.append(bodyNode);
        return wrap;
      });
      return;
    }

    const back = el('div', { class: 'adm-modal-backdrop' });
    const modal = el('div', { class: 'adm-modal' });

    const head = el('div', {},
      el('div', { class: 'adm-modal-title' }, title || 'Modal'),
      subtitle ? el('div', { class: 'adm-modal-sub' }, subtitle) : null
    );

    const closeBtn = el('button', { class: 'admin-btn', type: 'button' }, 'Close');
    closeBtn.addEventListener('click', () => back.remove());

    const footer = el('div', { class: 'admin-row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, closeBtn);

    modal.append(head, bodyNode, footer);
    back.append(modal);

    back.addEventListener('click', (e) => {
      if (e.target === back) back.remove();
    });

    document.body.append(back);
  }

  // --------------------------
  // State
  // --------------------------
  const LS_TAB = 'admin.ui.tab';

  const COMING_PAGES = [
    { key: '/dashboard', label: 'Dashboard' },
    { key: '/hunters', label: 'Hunters' },
    { key: '/hunters-details', label: 'Hunters - Details' },
    { key: '/hunter-weapons', label: 'Hunters - Weapons' },
    { key: '/hunter-weapons-details', label: 'Hunters - Weapons Details' },
    { key: '/sjw-weapons', label: 'Sung Jinwoo - Weapons' },
    { key: '/sjw-weapons-details', label: 'Sung Jinwoo - Weapons Details' },
    { key: '/shadows', label: 'Shadows' },
    { key: '/shadows-details', label: 'Shadows - Details' },
    { key: '/successors', label: 'Successors' },
    { key: '/successors-details', label: 'Successors - Details' },
    { key: '/gems', label: 'Gems' },
    { key: '/tier-list', label: 'Tier List' },
    { key: '/special-commission', label: 'Special Commission' },
    { key: '/cores', label: 'Cores' },
    { key: '/artifacts', label: 'Artifacts' },
    { key: '/blessing-stones', label: 'Blessing Stones' },
    { key: '/pvp', label: 'PvP' },
    { key: '/mini-game', label: 'Mini Game' },
    { key: '/hunter-guess', label: 'Hunter Guess' },
    { key: '/events', label: 'Events' },
    { key: '/members', label: 'Members' },
    { key: '/calculator', label: 'Calculator' },
    { key: '/posts', label: 'Posts' },
    { key: '/road-map', label: 'Road Map' },
    { key: '/suggestions', label: 'Suggestions' },
  ];

  const MENU_VISIBILITY_GROUPS = [
    {
      group: 'Collection',
      icon: 'fa-solid fa-layer-group',
      items: [
        { key: 'hunters', label: 'Hunters' },
        { key: 'hunterWeapons', label: 'Hunters - Weapons' },
        { key: 'sungWeapons', label: 'Sung Jinwoo - Weapons' },
        { key: 'shadows', label: 'Shadows' },
        { key: 'successors', label: 'Successors' },
      ],
    },
    {
      group: 'Systems',
      icon: 'fa-solid fa-gears',
      items: [
        { key: 'gems', label: 'Gems' },
        { key: 'tierList', label: 'Tier List' },
        { key: 'specialCommission', label: 'Special Commission' },
        { key: 'cores', label: 'Cores' },
        { key: 'artifacts', label: 'Artifacts' },
        { key: 'blessingStones', label: 'Blessing Stones' },
        { key: 'pvp', label: 'PvP' },
        { key: 'calculator', label: 'Calculator' },
      ],
    },
    {
      group: 'Mini Games',
      icon: 'fa-solid fa-gamepad',
      items: [
        { key: 'miniGame', label: 'Mini Game' },
        { key: 'hunterGuess', label: 'Hunter Guess' },
      ],
    },
    {
      group: 'Community',
      icon: 'fa-solid fa-comments',
      items: [
        { key: 'posts', label: 'Posts' },
        { key: 'roadMap', label: 'Road Map' },
        { key: 'suggestions', label: 'Suggestions' },
      ],
    },
  ];

  const STATE = {
    tab: localStorage.getItem(LS_TAB) || 'overview',
    isAdmin: null,

    uiPrefs: {
      hideAdminButtons: loadBool(LS_HIDE_KEY, false),
    },

    savingHide: false,

    members: {
      page: 1,
      pageSize: 12,
      totalPages: 1,
      totalItems: 0,
      name: '',
      items: [],
      loading: false,
      error: null,
    },

    coming: {
      loading: false,
      savingKey: null,
      error: null,
      flags: {},
    },

    menuVisibility: {
      loading: false,
      savingKey: null,
      error: null,
      flags: {},
      adminFlags: {},
    },

    siteMaintenance: {
      loading: false,
      saving: false,
      error: null,
      settings: { ...DEFAULT_SITE_MAINTENANCE },
      draft: { ...DEFAULT_SITE_MAINTENANCE },
    },

    toast: null,
    toastTimer: null,
  };

  if (!['overview', 'users', 'maintenance', 'tools', 'coming', 'menuVisibility', 'siteMaintenance'].includes(STATE.tab)) {
    STATE.tab = 'overview';
    try { localStorage.setItem(LS_TAB, STATE.tab); } catch {}
  }

  function setTab(tab) {
    STATE.tab = tab;
    try { localStorage.setItem(LS_TAB, tab); } catch {}
  }

  function setToast(type, text) {
    STATE.toast = { type, text };

    if (STATE.toastTimer) {
      clearTimeout(STATE.toastTimer);
      STATE.toastTimer = null;
    }

    safeRender();

    STATE.toastTimer = setTimeout(() => {
      STATE.toast = null;
      safeRender();
    }, 2600);
  }

  // --------------------------
  // API
  // --------------------------
  async function ensureIsAdmin() {
    if (STATE.isAdmin !== null) return STATE.isAdmin;
    try {
      const out = await fetchJson('/api/admin/is-admin');
      STATE.isAdmin = !!out?.isAdmin;
      return STATE.isAdmin;
    } catch {
      STATE.isAdmin = false;
      return false;
    }
  }

  async function loadUiPrefs() {
    try {
      const out = await fetchJson('/api/admin/ui-prefs');
      const hide = !!out?.prefs?.hideAdminButtons;

      STATE.uiPrefs.hideAdminButtons = hide;
      saveBool(LS_HIDE_KEY, hide);

      applySidebarHidden(hide);
    } catch {
      applySidebarHidden(STATE.uiPrefs.hideAdminButtons);
    }
  }

  async function saveUiPrefs(hideAdminButtons) {
    const out = await fetchJson('/api/admin/ui-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hideAdminButtons: !!hideAdminButtons }),
    });
    return !!out?.prefs?.hideAdminButtons;
  }

  async function loadMembers() {
    STATE.members.loading = true;
    STATE.members.error = null;
    safeRender();

    try {
      const page = clamp(STATE.members.page, 1, 9999);
      const pageSize = clamp(STATE.members.pageSize, 4, 48);

      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('pageSize', String(pageSize));
      if (safeStr(STATE.members.name)) q.set('name', safeStr(STATE.members.name));

      const out = await fetchJson(`/api/members?${q.toString()}`);
      STATE.members.items = Array.isArray(out?.items) ? out.items : [];
      STATE.members.page = Number(out?.page || page);
      STATE.members.pageSize = Number(out?.pageSize || pageSize);
      STATE.members.totalPages = Number(out?.totalPages || 1);
      STATE.members.totalItems = Number(out?.totalItems || 0);
    } catch (e) {
      STATE.members.error = e?.message || 'Failed to load members';
      STATE.members.items = [];
    } finally {
      STATE.members.loading = false;
      safeRender();
    }
  }

  async function resetAllUsersCollections() {
    return fetchJson('/api/admin/reset-collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }

  async function resetUserCollections(userId, type) {
    return fetchJson('/api/admin/reset-user-collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: Number(userId), type: String(type || '').trim() }),
    });
  }

  async function getMiniGameCurrency(userId) {
    return fetchJson(`/api/admin/mini-game/balance?userId=${encodeURIComponent(Number(userId))}`);
  }

  async function setMiniGameCurrency(userId, payload) {
    return fetchJson('/api/admin/mini-game/grant-currency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: Number(userId), mode: 'set', ...(payload || {}) }),
    });
  }

  async function loadComingSoonFlags() {
    STATE.coming.loading = true;
    STATE.coming.error = null;
    safeRender();

    try {
      const out = await fetchJson('/api/admin/coming-soon');
      const flags = (out && typeof out.flags === 'object' && out.flags) ? out.flags : {};
      STATE.coming.flags = flags;
    } catch (e) {
      STATE.coming.error = e?.message || 'Failed to load Coming Soon flags';
      STATE.coming.flags = {};
    } finally {
      STATE.coming.loading = false;
      safeRender();
    }
  }

  async function saveComingSoonKey(key, enabled) {
    return fetchJson('/api/admin/coming-soon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: String(key), enabled: !!enabled }),
    });
  }

  function normalizeSiteMaintenanceSettings(raw) {
    const src = (raw && typeof raw === 'object') ? (raw.settings || raw) : {};
    const imageRaw = safeStr(src.imageSrc);
    const imageSrc = imageRaw === '/picture/ComingSoon3' ? '/picture/ComingSoon3.png' : imageRaw;
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : !!src.enabled,
      messageTitle: safeStr(src.messageTitle) || DEFAULT_SITE_MAINTENANCE.messageTitle,
      messageBody: safeStr(src.messageBody) || DEFAULT_SITE_MAINTENANCE.messageBody,
      imageSrc: imageSrc || DEFAULT_SITE_MAINTENANCE.imageSrc,
    };
  }

  async function loadSiteMaintenanceSettings() {
    STATE.siteMaintenance.loading = true;
    STATE.siteMaintenance.error = null;
    safeRender();

    try {
      const out = await fetchJson('/api/admin/maintenance');
      const settings = normalizeSiteMaintenanceSettings(out);
      STATE.siteMaintenance.settings = settings;
      STATE.siteMaintenance.draft = { ...settings };
    } catch (e) {
      STATE.siteMaintenance.error = e?.message || 'Failed to load Site Maintenance settings';
      STATE.siteMaintenance.settings = { ...DEFAULT_SITE_MAINTENANCE };
      STATE.siteMaintenance.draft = { ...DEFAULT_SITE_MAINTENANCE };
    } finally {
      STATE.siteMaintenance.loading = false;
      safeRender();
    }
  }

  async function saveSiteMaintenanceSettings(settings) {
    return fetchJson('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizeSiteMaintenanceSettings(settings)),
    });
  }

  async function loadMenuVisibilityFlags() {
    STATE.menuVisibility.loading = true;
    STATE.menuVisibility.error = null;
    safeRender();

    try {
      const out = await fetchJson('/api/admin/menu-visibility');
      const flags = (out && typeof out.flags === 'object' && out.flags) ? out.flags : {};
      const adminFlags = (out && typeof out.adminFlags === 'object' && out.adminFlags) ? out.adminFlags : {};
      STATE.menuVisibility.flags = flags;
      STATE.menuVisibility.adminFlags = adminFlags;
    } catch (e) {
      STATE.menuVisibility.error = e?.message || 'Failed to load menu visibility flags';
      STATE.menuVisibility.flags = {};
      STATE.menuVisibility.adminFlags = {};
    } finally {
      STATE.menuVisibility.loading = false;
      safeRender();
    }
  }

  async function saveMenuVisibilityKey(key, visible) {
    return fetchJson('/api/admin/menu-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: String(key), visible: !!visible }),
    });
  }

  async function saveMenuVisibilityAdminKey(key, adminVisible) {
    return fetchJson('/api/admin/menu-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: String(key), adminVisible: !!adminVisible }),
    });
  }

  // --------------------------
  // UI
  // --------------------------
  function renderHeader(root) {
    root.append(
      el('div', { class: 'admin-row space' },
        el('div', {},
          el('div', { class: 'admin-title' }, 'Admin Panel'),
          el('div', { class: 'admin-sub' }, 'Reset user progress, manage tools, and control data')
        ),
        el('div', { class: 'admin-row' },
          el('div', { class: `admin-pill ${STATE.isAdmin ? 'ok' : 'bad'}` }, STATE.isAdmin ? 'Admin access: YES' : 'Admin access: NO')
        )
      )
    );

    if (STATE.toast?.text) {
      root.append(el('div', { class: `toast ${STATE.toast.type === 'ok' ? 'ok' : 'bad'}` }, STATE.toast.text));
    }
  }

  function renderTabs(root) {
    const tabs = el('div', { class: 'admin-tabs' });
    const items = [
      { k: 'overview', label: 'Overview' },
      { k: 'users', label: 'Users' },
      { k: 'maintenance', label: 'Maintenance' },
      { k: 'tools', label: 'Tools' },
      { k: 'coming', label: 'Coming Soon' },
      { k: 'menuVisibility', label: 'Menu Visibility' },
      { k: 'siteMaintenance', label: 'Site Maintenance' },
    ];

    for (const it of items) {
      const b = el('button', {
        type: 'button',
        class: `admin-tab ${STATE.tab === it.k ? 'is-active' : ''}`,
      }, it.label);

      b.addEventListener('click', () => {
        if (STATE.tab === it.k) return;
        setTab(it.k);

        if (it.k === 'users') loadMembers().catch(() => {});
        if (it.k === 'coming') loadComingSoonFlags().catch(() => {});
        if (it.k === 'menuVisibility') loadMenuVisibilityFlags().catch(() => {});
        if (it.k === 'siteMaintenance') loadSiteMaintenanceSettings().catch(() => {});

        safeRender();
      });

      tabs.append(b);
    }
    root.append(tabs);
  }

  function renderOverview(root) {
    const card = el('div', { class: 'admin-card' });

    const hidden = !!STATE.uiPrefs.hideAdminButtons;
    const viewMenuLikeUser = loadBool(LS_VIEW_MENU_LIKE_USER_KEY, false);
    const viewComingSoonLikeUser = loadBool(LS_VIEW_COMING_SOON_LIKE_USER_KEY, false);

    card.append(
      el('div', { class: 'section-title' }, 'Overview'),
      el('div', { class: 'admin-meta' }, 'Local admin preview controls and synced admin UI preferences.')
    );

    const pills = el('div', { class: 'admin-row', style: { marginTop: '12px' } },
      el('div', { class: `admin-pill ${STATE.isAdmin ? 'ok' : 'bad'}` }, STATE.isAdmin ? 'Admin access: YES' : 'Admin access: NO'),
      el('div', { class: `admin-pill ${hidden ? '' : 'ok'}` }, `Admin buttons: ${hidden ? 'HIDDEN' : 'VISIBLE'}`),
      el('div', { class: `admin-pill ${viewMenuLikeUser ? 'ok' : ''}` }, `Menu preview: ${viewMenuLikeUser ? 'ON' : 'OFF'}`),
      el('div', { class: `admin-pill ${viewComingSoonLikeUser ? 'ok' : ''}` }, `Coming Soon preview: ${viewComingSoonLikeUser ? 'ON' : 'OFF'}`)
    );

    const toggleBtn = el(
      'button',
      {
        class: 'admin-btn primary',
        type: 'button',
        disabled: (!STATE.isAdmin || STATE.savingHide),
      },
      hidden ? 'Show admin buttons in sidebar' : 'Hide admin buttons in sidebar'
    );

    toggleBtn.addEventListener('click', async () => {
      if (!STATE.isAdmin) return;
      if (STATE.savingHide) return;

      const cur = !!STATE.uiPrefs.hideAdminButtons;
      const next = !cur;

      STATE.uiPrefs.hideAdminButtons = next;
      STATE.savingHide = true;

      saveBool(LS_HIDE_KEY, next);
      applySidebarHidden(next);

      safeRender();

      try {
        const saved = await saveUiPrefs(next);

        STATE.uiPrefs.hideAdminButtons = !!saved;
        saveBool(LS_HIDE_KEY, !!saved);
        applySidebarHidden(!!saved);

        setToast('ok', 'Saved');
      } catch (err) {
        STATE.uiPrefs.hideAdminButtons = cur;
        saveBool(LS_HIDE_KEY, cur);
        applySidebarHidden(cur);

        setToast('bad', `Error: ${err?.message || err}`);
      } finally {
        STATE.savingHide = false;
        safeRender();
      }
    });

    const menuPreviewBtn = el('button', {
      class: `admin-btn ${viewMenuLikeUser ? 'primary' : ''}`,
      type: 'button',
      disabled: !STATE.isAdmin,
      onclick: () => {
        if (!STATE.isAdmin) return;
        setAdminViewMenuLikeUser(!loadBool(LS_VIEW_MENU_LIKE_USER_KEY, false));
        safeRender();
      }
    }, viewMenuLikeUser ? 'View menu as admin' : 'View menu like normal user');

    const comingPreviewBtn = el('button', {
      class: `admin-btn ${viewComingSoonLikeUser ? 'primary' : ''}`,
      type: 'button',
      disabled: !STATE.isAdmin,
      onclick: () => {
        if (!STATE.isAdmin) return;
        setAdminViewComingSoonLikeUser(!loadBool(LS_VIEW_COMING_SOON_LIKE_USER_KEY, false));
        safeRender();
      }
    }, viewComingSoonLikeUser ? 'View Coming Soon as admin' : 'View Coming Soon like normal user');

    card.append(pills);
    card.append(
      el('div', { class: 'cs-row' },
        el('div', {},
          el('div', { class: 'cs-name' }, 'Hide admin buttons in sidebar'),
          el('div', { class: 'admin-meta' },
            `${hidden ? 'ON = admin-only sidebar buttons are hidden' : 'OFF = admin-only sidebar buttons are visible'}\n` +
            'Synced admin preference. You can still open /admin manually.'
          )
        ),
        el('div', { class: 'admin-row' }, toggleBtn)
      ),
      el('div', { class: 'cs-row' },
        el('div', {},
          el('div', { class: 'cs-name' }, 'View menu like normal user'),
          el('div', { class: 'admin-meta' },
            viewMenuLikeUser
              ? 'ON = admin sees menu visibility like normal user.'
              : 'OFF = admin sees all admin-visible menu items.'
          )
        ),
        el('div', { class: 'admin-row' }, menuPreviewBtn)
      ),
      el('div', { class: 'cs-row' },
        el('div', {},
          el('div', { class: 'cs-name' }, 'View Coming Soon like normal user'),
          el('div', { class: 'admin-meta' },
            viewComingSoonLikeUser
              ? 'ON = admin is affected by Coming Soon.'
              : 'OFF = admin bypasses Coming Soon.'
          )
        ),
        el('div', { class: 'admin-row' }, comingPreviewBtn)
      ),
      el('div', { class: 'hint' }, 'The two preview modes are local to this browser and do not change settings for other users.')
    );

    root.append(card);
  }

  function renderUsers(root) {
    const card = el('div', { class: 'admin-card' });

    const top = el('div', { class: 'admin-row space' },
      el('div', {},
        el('div', { class: 'section-title' }, 'Users'),
        el('div', { class: 'admin-meta' }, `Total: ${STATE.members.totalItems || 0}`)
      ),
      el('div', { class: 'admin-row' },
        el('input', {
          class: 'admin-input',
          type: 'text',
          placeholder: 'Search by name...',
          value: STATE.members.name || '',
          oninput: (e) => { STATE.members.name = e.target.value || ''; }
        }),
        el('button', {
          class: 'admin-btn',
          type: 'button',
          onclick: () => { STATE.members.page = 1; loadMembers().catch(() => {}); }
        }, 'Search'),
        el('div', { class: 'admin-pill' }, `Page ${STATE.members.page}/${STATE.members.totalPages}`)
      )
    );

    card.append(top);

    if (STATE.members.loading) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px' } }, 'Loading users...'));
      root.append(card);
      return;
    }

    if (STATE.members.error) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px', color: 'rgba(239,68,68,.95)' } }, STATE.members.error));
      root.append(card);
      return;
    }

    const list = el('div', { class: 'admin-table' });

    for (const u of (STATE.members.items || [])) {
      const avatar = u.avatar || '';
      const name = u.displayName || u.username || `User #${u.id}`;
      const meta = `ID: ${u.id} - Role: ${u.role || 'Hunter'} - Visits: ${Number(u.visits || 0)}`;

      const miniStatus = el('span', { class: 'mini-status' }, '');

      const row = el('div', { class: 'admin-item' },
        el('div', { class: 'admin-item-left' },
          avatar
            ? el('img', { class: 'admin-avatar', src: avatar, alt: '' })
            : el('div', { class: 'admin-avatar', style: { display: 'grid', placeItems: 'center', fontWeight: '900' } }, 'User'),
          el('div', { style: { minWidth: '0' } },
            el('div', { class: 'admin-name' }, name),
            el('div', { class: 'admin-meta' }, meta)
          )
        ),
        el('div', { class: 'admin-row' },
          el('button', {
            class: 'admin-btn primary small',
            type: 'button',
            onclick: () => openMiniGameGrantModal(u, miniStatus)
          }, 'Edit Balance'),
          el('button', {
            class: 'admin-btn danger small',
            type: 'button',
            onclick: () => openResetUserModal(u, miniStatus)
          }, 'Reset'),
          miniStatus
        )
      );

      list.append(row);
    }

    card.append(list);
    root.append(card);
  }

  function openResetUserModal(user, statusNode) {
    const userId = user?.id;
    const title = 'Reset user data';
    const subtitle = `${user?.displayName || user?.username || 'User'} - ID: ${userId}`;

    const body = el('div', {});
    body.append(el('div', { class: 'admin-meta' }, 'Each button resets ONLY that category.'));

    const grid = el('div', { class: 'adm-grid' });

    const makeBtn = (label, type, danger = false) => {
      const b = el('button', { class: `admin-btn ${danger ? 'danger' : ''}`, type: 'button' }, label);

      b.addEventListener('click', async () => {
        const prev = statusNode ? statusNode.textContent : '';
        b.disabled = true;
        if (statusNode) statusNode.textContent = 'Resetting...';

        try {
          const out = await resetUserCollections(userId, type);
          const resetList = Array.isArray(out?.reset) ? out.reset.join(', ') : String(type);

          if (statusNode) statusNode.textContent = `Done: ${label}`;
          setToast('ok', `Reset done for ${userId}: ${resetList}`);
        } catch (e) {
          if (statusNode) statusNode.textContent = 'Error';
          setToast('bad', e?.message || `Reset failed: ${label}`);
          if (statusNode) setTimeout(() => (statusNode.textContent = prev || ''), 2200);
        } finally {
          b.disabled = false;
        }
      });

      return b;
    };

    grid.append(
      makeBtn('Reset Hunters', 'hunters'),
      makeBtn('Reset Hunter Weapons', 'hunterWeapons'),
      makeBtn('Reset Sung Weapons', 'sungWeapons'),
      makeBtn('Reset Builds', 'builds'),
      makeBtn('Reset Mini Game', 'miniGame'),
      makeBtn('Reset Special Commission V2', 'specialCommissionV2State'),
      makeBtn('Reset Tier: Hunters', 'tier_hunter'),
      makeBtn('Reset Tier: Weapons', 'tier_weapon'),
      makeBtn('Reset Tier: Blessings', 'tier_blessing'),
      makeBtn('Reset Tier: Runes', 'tier_rune'),
      makeBtn('Reset ALL (everything above)', 'all', true)
    );

    body.append(grid);
    openModal(title, subtitle, body);
  }

  async function openMiniGameGrantModal(user, statusNode) {
    const userId = user?.id;
    const title = 'Edit Mini Game balance';
    const subtitle = `${user?.displayName || user?.username || 'User'} - ID: ${userId}`;
    let current;
    try {
      current = (await getMiniGameCurrency(userId))?.balance || {};
    } catch (e) {
      setToast('bad', e?.message || 'Could not load Mini Game balance');
      return;
    }
    const values = {
      gold: Number(current.gold || 0),
      essence: Number(current.essence || 0),
      customTickets: Number(current.customTickets || 0),
      weaponTickets: Number(current.weaponTickets || 0)
    };
    const field = (label, key) => el('label', { style: { display: 'grid', gap: '6px' } },
      el('span', { class: 'admin-meta' }, label),
      el('input', {
        class: 'admin-input',
        type: 'number',
        min: '0',
        step: '1',
        value: String(values[key]),
        oninput: (e) => { values[key] = Math.max(0, Math.floor(Number(e.target.value || 0))); }
      })
    );

    const body = el('div', {},
      el('div', { class: 'admin-meta' }, 'Current values are shown below. Saving replaces the user balance with these exact amounts.'),
      el('div', { class: 'adm-grid', style: { marginTop: '12px' } },
        field('Gold', 'gold'),
        field('Essence', 'essence'),
        field('Draw Tickets', 'customTickets'),
        field('Weapon Tickets', 'weaponTickets')
      )
    );

    const grantBtn = el('button', { class: 'admin-btn primary', type: 'button', style: { marginTop: '12px' } }, 'Save Balance');
    grantBtn.addEventListener('click', async () => {
      const prev = statusNode ? statusNode.textContent : '';
      grantBtn.disabled = true;
      if (statusNode) statusNode.textContent = 'Saving...';
      try {
        const out = await setMiniGameCurrency(userId, values);
        const b = out?.balance || {};
        if (statusNode) statusNode.textContent = 'Balance updated';
        setToast('ok', `Mini Game balance: ${b.gold ?? '?'} gold, ${b.essence ?? '?'} essence`);
      } catch (e) {
        if (statusNode) statusNode.textContent = 'Error';
        setToast('bad', e?.message || 'Balance update failed');
        if (statusNode) setTimeout(() => (statusNode.textContent = prev || ''), 2200);
      } finally {
        grantBtn.disabled = false;
      }
    });
    body.append(grantBtn);
    openModal(title, subtitle, body);
  }

  function renderMaintenance(root) {
    const card = el('div', { class: 'admin-card' });

    card.append(
      el('div', { class: 'section-title' }, 'Maintenance'),
      el('div', { class: 'admin-meta' }, 'Global tools that affect ALL users. Use with care.')
    );

    const btn = el('button', { class: 'admin-btn danger', type: 'button' }, 'Reset ALL users (global)');
    btn.addEventListener('click', () => {
      const body = el('div', {},
        el('div', { class: 'admin-meta' }, 'This will reset ALL users collections (endpoint decides what).'),
        el('div', { class: 'admin-row', style: { marginTop: '12px' } },
          el('button', {
            class: 'admin-btn danger',
            type: 'button',
            onclick: async () => {
              try {
                const out = await resetAllUsersCollections();
                setToast('ok', `Global reset done. Users reset: ${out?.usersReset ?? '?'}`);
              } catch (e) {
                setToast('bad', e?.message || 'Global reset failed.');
              }
            }
          }, 'Confirm reset')
        )
      );
      openModal('Confirm global reset', 'This action affects ALL users', body);
    });

    card.append(el('div', { class: 'admin-row', style: { marginTop: '12px' } }, btn));
    root.append(card);
  }

  function renderTools(root) {
    const card = el('div', { class: 'admin-card' });

    card.append(
      el('div', { class: 'admin-row space' },
        el('div', {},
          el('div', { class: 'section-title' }, 'Tools'),
          el('div', { class: 'admin-meta' }, 'Admin utilities / shortcuts.')
        ),
        el('button', {
          class: 'admin-btn small',
          type: 'button',
          onclick: () => {
            window.location.href = url('/oracle');
          }
        }, 'Open Oracle')
      )
    );

    root.append(card);
  }

  function renderComingSoon(root) {
    const card = el('div', { class: 'admin-card' });

    card.append(
      el('div', { class: 'section-title' }, 'Coming Soon'),
      el('div', { class: 'admin-meta' },
        'ON  = Coming Soon enabled (users see Coming Soon)\n' +
        'OFF = Coming Soon disabled (users see real page)\n' +
        'Admins bypass Coming Soon unless local preview mode is enabled in Overview.'
      )
    );

    if (STATE.coming.loading) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px' } }, 'Loading flags...'));
      root.append(card);
      return;
    }

    if (STATE.coming.error) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px', color: 'rgba(239,68,68,.95)' } }, STATE.coming.error));
    }

    const flags = STATE.coming.flags || {};

    const topRow = el('div', { class: 'admin-row', style: { marginTop: '12px' } },
      el('button', {
        class: 'admin-btn small',
        type: 'button',
        onclick: () => loadComingSoonFlags().catch(() => {})
      }, 'Refresh')
    );
    card.append(topRow);

    for (const p of COMING_PAGES) {
      const enabled = (typeof flags[p.key] === 'boolean') ? flags[p.key] : true;

      const left = el('div', {},
        el('div', { class: 'cs-name' }, p.label),
        el('div', { class: 'admin-meta' }, `${p.key} - ${enabled ? 'ON (Coming Soon enabled)' : 'OFF (Coming Soon disabled)'}`)
      );

      const toggleBtn = el('button', {
        class: `cs-btn ${enabled ? 'is-active-on' : ''}`,
        type: 'button',
        disabled: STATE.coming.savingKey === p.key,
        onclick: async () => {
          try {
            STATE.coming.savingKey = p.key;
            safeRender();

            const next = !enabled;
            const out = await saveComingSoonKey(p.key, next);
            STATE.coming.flags = (out && typeof out.flags === 'object' && out.flags) ? out.flags : { ...flags, [p.key]: next };

            try { if (window.STATE?.ui?.comingSoon) window.STATE.ui.comingSoon.loadedAt = 0; } catch {}
            try { window.dispatchEvent(new CustomEvent('sla:comingsoon-updated', { detail: { flags: STATE.coming.flags } })); } catch {}

            setToast('ok', 'Saved');
          } catch (e) {
            setToast('bad', e?.message || 'Error');
          } finally {
            STATE.coming.savingKey = null;
            safeRender();
          }
        }
      }, enabled ? 'ON' : 'OFF');
      const row = el('div', { class: 'cs-row' },
        left,
        el('div', { class: 'admin-row' }, toggleBtn)
      );

      card.append(row);
    }

    root.append(card);
  }

  function renderMenuVisibility(root) {
    const card = el('div', { class: 'admin-card' });

    card.append(
      el('div', { class: 'section-title' }, 'Menu Visibility'),
      el('div', { class: 'admin-meta' },
        'Visible = users see the sidebar/menu button.\n' +
        'Hidden = non-admin users do not see the button.\n' +
        'Admin visible = admins see the button. Admin hidden overrides Overview preview and hides it completely.'
      )
    );

    if (STATE.menuVisibility.loading) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px' } }, 'Loading menu visibility...'));
      root.append(card);
      return;
    }

    if (STATE.menuVisibility.error) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px', color: 'rgba(239,68,68,.95)' } }, STATE.menuVisibility.error));
    }

    const flags = STATE.menuVisibility.flags || {};
    const adminFlags = STATE.menuVisibility.adminFlags || {};

    card.append(el('div', { class: 'admin-row', style: { marginTop: '12px' } },
      el('button', {
        class: 'admin-btn small',
        type: 'button',
        onclick: () => loadMenuVisibilityFlags().catch(() => {})
      }, 'Refresh')
    ));

    const appendVisibilityPage = (target, p) => {
      const visible = (typeof flags[p.key] === 'boolean') ? flags[p.key] : true;
      const adminVisible = (typeof adminFlags[p.key] === 'boolean') ? adminFlags[p.key] : true;

      const left = el('div', {},
        el('div', { class: 'cs-name' }, p.label),
        el('div', { class: 'admin-meta' },
          `${p.key} - ${visible ? 'Visible for users' : 'Hidden for users'} - ${adminVisible ? 'Visible for admins' : 'Hidden for admins'}`
        )
      );

      const toggleBtn = el('button', {
        class: `cs-btn ${visible ? 'is-active-on' : ''}`,
        type: 'button',
        disabled: STATE.menuVisibility.savingKey === `${p.key}:users`,
        onclick: async () => {
          try {
            STATE.menuVisibility.savingKey = `${p.key}:users`;
            safeRender();

            const next = !visible;
            const out = await saveMenuVisibilityKey(p.key, next);
            STATE.menuVisibility.flags = (out && typeof out.flags === 'object' && out.flags) ? out.flags : { ...flags, [p.key]: next };
            STATE.menuVisibility.adminFlags = (out && typeof out.adminFlags === 'object' && out.adminFlags) ? out.adminFlags : adminFlags;

            try {
              window.dispatchEvent(new CustomEvent('sla:menu-visibility-changed', {
                detail: { flags: STATE.menuVisibility.flags, adminFlags: STATE.menuVisibility.adminFlags }
              }));
            } catch {}

            setToast('ok', 'Saved');
          } catch (e) {
            setToast('bad', e?.message || 'Error');
          } finally {
            STATE.menuVisibility.savingKey = null;
            safeRender();
          }
        }
      }, visible ? 'Visible' : 'Hidden');

      const adminToggleBtn = el('button', {
        class: `cs-btn ${adminVisible ? 'is-active-on' : ''}`,
        type: 'button',
        disabled: STATE.menuVisibility.savingKey === `${p.key}:admins`,
        onclick: async () => {
          try {
            STATE.menuVisibility.savingKey = `${p.key}:admins`;
            safeRender();

            const next = !adminVisible;
            const out = await saveMenuVisibilityAdminKey(p.key, next);
            STATE.menuVisibility.flags = (out && typeof out.flags === 'object' && out.flags) ? out.flags : flags;
            STATE.menuVisibility.adminFlags = (out && typeof out.adminFlags === 'object' && out.adminFlags) ? out.adminFlags : { ...adminFlags, [p.key]: next };

            try {
              window.dispatchEvent(new CustomEvent('sla:menu-visibility-changed', {
                detail: { flags: STATE.menuVisibility.flags, adminFlags: STATE.menuVisibility.adminFlags }
              }));
            } catch {}

            setToast('ok', 'Saved');
          } catch (e) {
            setToast('bad', e?.message || 'Error');
          } finally {
            STATE.menuVisibility.savingKey = null;
            safeRender();
          }
        }
      }, adminVisible ? 'Admin visible' : 'Admin hidden');

      target.append(el('div', { class: 'cs-row' },
        left,
        el('div', { class: 'admin-row' }, toggleBtn, adminToggleBtn)
      ));
    };

    for (const group of MENU_VISIBILITY_GROUPS) {
      const groupEl = el('div', { class: 'menu-vis-group' });
      groupEl.append(el('div', { class: 'menu-vis-group-head' },
        el('i', { class: group.icon || 'fa-solid fa-circle' }),
        el('span', {}, group.group)
      ));

      for (const p of group.items) {
        appendVisibilityPage(groupEl, p);
      }

      card.append(groupEl);
    }

    root.append(card);
  }

  function renderSiteMaintenance(root) {
    const card = el('div', { class: 'admin-card' });
    const draft = STATE.siteMaintenance.draft || { ...DEFAULT_SITE_MAINTENANCE };
    const enabled = !!draft.enabled;

    card.append(
      el('div', { class: 'section-title' }, 'Site Maintenance'),
      el('div', { class: 'admin-meta' },
        'When enabled, normal users will see the maintenance screen. Admins can still access the site normally.'
      )
    );

    if (STATE.siteMaintenance.loading) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px' } }, 'Loading Site Maintenance settings...'));
      root.append(card);
      return;
    }

    if (STATE.siteMaintenance.error) {
      card.append(el('div', { class: 'admin-meta', style: { marginTop: '12px', color: 'rgba(239,68,68,.95)' } }, STATE.siteMaintenance.error));
    }

    card.append(el('div', { class: 'admin-row', style: { marginTop: '12px' } },
      el('div', { class: `admin-pill ${enabled ? 'bad' : 'ok'}` }, `Maintenance: ${enabled ? 'ON' : 'OFF'}`),
      el('button', {
        class: `admin-btn ${enabled ? 'danger' : 'primary'}`,
        type: 'button',
        disabled: STATE.siteMaintenance.saving,
        onclick: () => {
          STATE.siteMaintenance.draft = { ...draft, enabled: !enabled };
          safeRender();
        }
      }, enabled ? 'Disable Maintenance' : 'Enable Maintenance'),
      el('button', {
        class: 'admin-btn small',
        type: 'button',
        disabled: STATE.siteMaintenance.saving,
        onclick: () => loadSiteMaintenanceSettings().catch(() => {})
      }, 'Refresh')
    ));

    const titleInput = el('input', {
      class: 'admin-input',
      style: { width: '100%', marginTop: '8px' },
      value: draft.messageTitle || DEFAULT_SITE_MAINTENANCE.messageTitle,
      oninput: (e) => {
        STATE.siteMaintenance.draft = { ...STATE.siteMaintenance.draft, messageTitle: e.target.value };
      }
    });

    const bodyInput = el('textarea', {
      class: 'admin-textarea',
      style: { marginTop: '8px' },
      oninput: (e) => {
        STATE.siteMaintenance.draft = { ...STATE.siteMaintenance.draft, messageBody: e.target.value };
      }
    }, draft.messageBody || DEFAULT_SITE_MAINTENANCE.messageBody);

    const imageInput = el('input', {
      class: 'admin-input',
      style: { width: '100%', marginTop: '8px' },
      value: draft.imageSrc || DEFAULT_SITE_MAINTENANCE.imageSrc,
      oninput: (e) => {
        STATE.siteMaintenance.draft = { ...STATE.siteMaintenance.draft, imageSrc: e.target.value };
      }
    });

    card.append(
      el('div', { style: { marginTop: '14px' } },
        el('div', { class: 'cs-name' }, 'Title'),
        titleInput
      ),
      el('div', { style: { marginTop: '14px' } },
        el('div', { class: 'cs-name' }, 'Message'),
        bodyInput
      ),
      el('div', { style: { marginTop: '14px' } },
        el('div', { class: 'cs-name' }, 'Image'),
        imageInput,
        el('div', { class: 'admin-meta', style: { marginTop: '6px' } }, 'Default: /picture/ComingSoon3.png')
      )
    );

    card.append(el('div', { class: 'admin-row', style: { marginTop: '16px' } },
      el('button', {
        class: 'admin-btn primary',
        type: 'button',
        disabled: STATE.siteMaintenance.saving,
        onclick: async () => {
          try {
            STATE.siteMaintenance.saving = true;
            safeRender();

            const out = await saveSiteMaintenanceSettings(STATE.siteMaintenance.draft);
            const settings = normalizeSiteMaintenanceSettings(out);
            STATE.siteMaintenance.settings = settings;
            STATE.siteMaintenance.draft = { ...settings };

            try {
              if (window.STATE?.ui?.maintenance) {
                window.STATE.ui.maintenance.loaded = false;
                window.STATE.ui.maintenance.loadedAt = 0;
              }
            } catch {}
            try {
              window.dispatchEvent(new CustomEvent('sla:maintenance-updated', { detail: { settings } }));
            } catch {}

            setToast('ok', 'Saved');
          } catch (e) {
            setToast('bad', e?.message || 'Error');
          } finally {
            STATE.siteMaintenance.saving = false;
            safeRender();
          }
        }
      }, STATE.siteMaintenance.saving ? 'Saving...' : 'Save')
    ));

    root.append(card);
  }

  function render() {
    injectStyles();
    const content = qs('#content');
    if (!content) return;

    content.innerHTML = '';
    const shell = el('div', { class: 'admin-shell' });

    renderHeader(shell);
    renderTabs(shell);

    if (!STATE.isAdmin) {
      shell.append(
        el('div', { class: 'admin-card' },
          el('div', { class: 'section-title' }, 'Access denied'),
          el('div', { class: 'admin-meta' }, 'You are not an admin.')
        )
      );
      content.append(shell);
      return;
    }

    if (STATE.tab === 'overview') renderOverview(shell);
    if (STATE.tab === 'users') renderUsers(shell);
    if (STATE.tab === 'maintenance') renderMaintenance(shell);
    if (STATE.tab === 'tools') renderTools(shell);
    if (STATE.tab === 'coming') renderComingSoon(shell);
    if (STATE.tab === 'menuVisibility') renderMenuVisibility(shell);
    if (STATE.tab === 'siteMaintenance') renderSiteMaintenance(shell);

    content.append(shell);
  }

  window.__admin_mount = async function __admin_mount() {
    try {
      const ok = await ensureIsAdmin();
      if (!ok) {
        safeRender();
        return;
      }

      await loadUiPrefs();

      if (STATE.tab === 'users') await loadMembers();
      if (STATE.tab === 'coming') await loadComingSoonFlags();
      if (STATE.tab === 'menuVisibility') await loadMenuVisibilityFlags();
      if (STATE.tab === 'siteMaintenance') await loadSiteMaintenanceSettings();
      if (STATE.tab !== 'menuVisibility') {
        loadMenuVisibilityFlags().catch(() => {});
      }

      safeRender();
    } catch (e) {
      console.error(e);
      const content = qs('#content');
      if (!content) return;
      content.innerHTML = '';
      content.append(
        el('div', { class: 'admin-shell' },
          el('div', { class: 'admin-card' },
            el('div', { class: 'section-title' }, 'Admin load failed'),
            el('div', { class: 'admin-meta' }, e?.message || 'Unknown error')
          )
        )
      );
    }
  };
})();
