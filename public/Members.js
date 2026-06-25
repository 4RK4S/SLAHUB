'use strict';

// Members.js (module)
// Mount: window.__members_mount()

const DEFAULT_PAGE_SIZE = 12;

const ROLE_OPTIONS = ['All', 'Admin', 'Hunter', 'Founder', 'Supporter'];
const SORT_OPTIONS = ['Newest', 'Most visits', 'Name A-Z'];

function ensureMembersCss() {
  if (document.getElementById('slaMembersCss')) return;

  const s = document.createElement('style');
  s.id = 'slaMembersCss';
  s.textContent = `
    /* Smooth filter collapse */
    .sla-filterWrap {
      overflow: hidden;
      max-height: 0px;
      opacity: 0;
      transform: translateY(-6px);
      transition: max-height 260ms ease, opacity 220ms ease, transform 220ms ease;
      will-change: max-height, opacity, transform;
    }
    .sla-filterWrap.is-open {
      opacity: 1;
      transform: translateY(0);
    }

    /* Pagination: base */
    .sla-page-btn { color: #ffffff !important; }

    /* Active page: yellow bg + black text */
    .sla-page-btn.sla-page-active { color: #0f172a !important; }

    /* ✅ Single page "1" should NOT look disabled/gray */
    .sla-page-btn.sla-page-single {
      opacity: 1 !important;
      cursor: default !important;
      pointer-events: none !important;
    }

    /* Member card anchors look like cards (no underline) */
    .sla-member-card {
      text-decoration: none !important;
      color: inherit !important;
      display: block;
    }
  `;
  document.head.appendChild(s);
}

function isPlainLeftClick(e) {
  return e && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

/* =========================
   ✅ BASE PATH helpers (aligned with LogIn.js)
   ========================= */

function apiPath(p) {
  try {
    if (typeof window.url === 'function') return window.url(p);
  } catch (_) {}
  return p;
}

// for frontend navigation (/members/123)
function withBase(path) {
  // window.url() already prepends /slahub if needed
  return apiPath(path);
}

/* =========================
   ✅ local UI state
   ========================= */

function getUiState() {
  window.STATE = window.STATE || {};
  window.STATE.members = window.STATE.members || {};
  const s = window.STATE.members;

  if (!s.filters) {
    s.filters = { name: '', guild: '', role: 'All', sort: 'Newest' };
  }
  if (!s.page) s.page = 1;
  if (!s.pageSize) s.pageSize = DEFAULT_PAGE_SIZE;
  if (typeof s.filtersOpen !== 'boolean') s.filtersOpen = false;

  return s;
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '-';
  }
}

function safeText(x, fallback = '') {
  const v = (x == null) ? '' : String(x);
  return v.trim() || fallback;
}

function pillRole(role) {
  const label = safeText(role, 'Hunter');

  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ";
  const map = {
    Admin: base + "border-red-400/50 text-red-200 bg-red-500/10",
    Founder: base + "border-yellow-400/50 text-yellow-200 bg-yellow-500/10",
    Supporter: base + "border-sky-400/50 text-sky-200 bg-sky-500/10",
    Hunter: base + "border-slate-400/40 text-slate-200 bg-white/5",
  };
  return window.el('span', { class: map[label] || map.Hunter }, label);
}

/* =========================
   ✅ API
   ========================= */

async function fetchMembers({ page, pageSize, name, guild, role, sort }) {
  const params = new URLSearchParams();
  params.set('page', String(page || 1));
  params.set('pageSize', String(pageSize || DEFAULT_PAGE_SIZE));
  if (name) params.set('name', name);
  if (guild) params.set('guild', guild);
  if (role && role !== 'All') params.set('role', role);
  if (sort) params.set('sort', sort);

  const res = await fetch(apiPath(`/api/members?${params.toString()}`), {
    headers: { 'Accept': 'application/json' },
    credentials: 'include',
    cache: 'no-store'
  });

  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    throw new Error(out.error || 'Failed to load members');
  }
  return res.json();
}

/* =========================
   ✅ Pagination (FIXED COLORS)
   ========================= */

function renderPagination({ page, totalPages, onPage }) {
  const wrap = window.el('div', {
    class: "flex items-center justify-center gap-1 mt-4 flex-wrap"
  });

  const btnBase =
    "sla-page-btn min-w-[38px] h-9 px-3 rounded-lg border transition " +
    "bg-glass border-white/10 text-slate-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-yellow-400/50";

  const btnDisabled = "opacity-50 cursor-not-allowed hover:bg-glass";

  function pageBtn(label, p, active = false, disabled = false, single = false) {
    const b = window.el('button', {
      type: 'button',
      class:
        btnBase +
        (active ? " sla-page-active bg-yellow-400/90 border-yellow-300" : "") +
        (disabled ? ` ${btnDisabled}` : "") +
        (single ? " sla-page-single" : "")
    }, label);

    if (!disabled && typeof onPage === 'function') b.onclick = () => onPage(p);
    return b;
  }

  const total = Math.max(1, Number(totalPages || 1));
  const cur = Math.min(Math.max(1, Number(page || 1)), total);

  // ✅ If only one page: show ‹ 1 › but "1" stays WHITE (not active)
  if (total === 1) {
    wrap.append(pageBtn('‹', 1, false, true));
    wrap.append(pageBtn('1', 1, false, true, true)); // ✅ white + neutral
    wrap.append(pageBtn('›', 1, false, true));
    return wrap;
  }

  // normal pagination
  wrap.append(pageBtn('‹', cur - 1, false, cur <= 1));

  const maxButtons = 9;
  let start = Math.max(1, cur - Math.floor(maxButtons / 2));
  let end = Math.min(total, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);

  for (let p = start; p <= end; p++) {
    wrap.append(pageBtn(String(p), p, p === cur, false));
  }

  wrap.append(pageBtn('›', cur + 1, false, cur >= total));
  return wrap;
}

/* =========================
   ✅ Navigation
   ========================= */

function goToMemberPage(id) {
  const uid = Number(id);
  if (!uid) return;

  const target = `/members/${uid}`;

  if (typeof window.routeTo === 'function') {
    window.routeTo(target);
  } else {
    window.location.href = withBase(target);
  }
}

/* =========================
   ✅ Render
   ========================= */

function renderMembers(root) {
  ensureMembersCss();
  const ui = getUiState();

  const pageWrap = window.el('div', { class: "w-full" });

  const header = window.el('div', { class: "text-center mb-6" });
  header.append(
    window.el('div', {
      class: "font-display text-4xl sm:text-6xl tracking-wide text-yellow-400 drop-shadow font-bold"
    }, "COMMUNITY"),
    window.el('div', {
      class: "mt-2 text-slate-300/90 text-sm sm:text-base px-2"
    }, "Meet our members, see their profiles and progress.")
  );

  const actions = window.el('div', { class: "flex items-center justify-end mb-3" });

  const filtersBtn = window.el('button', {
    type: 'button',
    class:
      "px-4 h-10 rounded-xl border transition inline-flex items-center gap-2 " +
      "bg-glass border-white/10 text-slate-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-yellow-400/50"
  });
  filtersBtn.append(
    window.el('i', { class: 'fa-solid fa-filter text-[14px]' }),
    window.el('span', { class: 'text-sm font-semibold' }, 'Filters')
  );
  actions.append(filtersBtn);

  const filterWrap = window.el('div', { class: "sla-filterWrap" });

  const panel = window.el('div', {
    class:
      "border rounded-2xl p-4 mb-4 " +
      "bg-glass border-white/10"
  });

  const panelTitle = window.el('div', { class: "text-yellow-400 font-extrabold mb-3" }, "Filter Members");

  const grid = window.el('div', { class: "grid grid-cols-1 md:grid-cols-3 gap-4" });

  function fieldLabel(txt) {
    return window.el('div', { class: "text-sm font-bold text-slate-200 mb-1" }, txt);
  }
  function input(val, placeholder) {
    return window.el('input', {
      value: val || '',
      placeholder,
      class:
        "w-full px-3 py-2 rounded-xl border outline-none " +
        "bg-glass border-white/10 text-slate-200 placeholder-slate-400 " +
        "focus:ring-2 focus:ring-yellow-400/40"
    });
  }
  function select(val, opts) {
    const sel = window.el('select', {
      class:
        "w-full px-3 py-2 rounded-xl border outline-none " +
        "bg-glass border-white/10 text-slate-200 " +
        "focus:ring-2 focus:ring-yellow-400/40"
    });

    for (const o of opts) sel.append(window.el('option', { value: o }, o));
    sel.value = val || opts[0];
    return sel;
  }

  const nameWrap = window.el('div');
  const nameInp = input(ui.filters.name, "Search by name...");
  nameWrap.append(fieldLabel("Name"), nameInp);

  const guildWrap = window.el('div');
  const guildInp = input(ui.filters.guild, "Search by guild...");
  guildWrap.append(fieldLabel("Guild"), guildInp);

  const roleWrap = window.el('div');
  const roleSel = select(ui.filters.role, ROLE_OPTIONS);
  roleWrap.append(fieldLabel("Role"), roleSel);

  const sortWrap = window.el('div', { class: "md:col-span-1" });
  const sortSel = select(ui.filters.sort, SORT_OPTIONS);
  sortWrap.append(fieldLabel("Sort"), sortSel);

  grid.append(nameWrap, guildWrap, roleWrap, sortWrap);

  const panelActions = window.el('div', { class: "mt-4 flex items-center justify-end gap-2 flex-wrap" });

  const applyBtn = window.el('button', {
    type: 'button',
    class:
      "px-4 h-10 rounded-xl font-extrabold text-black bg-yellow-400 hover:bg-yellow-300 inline-flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-yellow-400/50"
  });
  applyBtn.append(
    window.el('i', { class: 'fa-solid fa-filter' }),
    window.el('span', {}, 'Apply Filters')
  );

  const resetBtn = window.el('button', {
    type: 'button',
    class:
      "px-4 h-10 rounded-xl border bg-glass border-white/10 text-slate-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-yellow-400/50"
  }, "Reset");

  panelActions.append(applyBtn, resetBtn);
  panel.append(panelTitle, grid, panelActions);

  filterWrap.append(panel);

  function setPanelOpen(open) {
    ui.filtersOpen = !!open;

    if (ui.filtersOpen) {
      filterWrap.classList.add('is-open');
      requestAnimationFrame(() => {
        filterWrap.style.maxHeight = (panel.scrollHeight + 24) + "px";
      });
    } else {
      filterWrap.style.maxHeight = "0px";
      filterWrap.classList.remove('is-open');
    }
  }

  filtersBtn.onclick = () => setPanelOpen(!ui.filtersOpen);
  setTimeout(() => setPanelOpen(ui.filtersOpen), 0);

  const resultsTop = window.el('div', { class: "flex items-center justify-between mb-3 gap-2 flex-wrap" });
  const leftHint = window.el('div', { class: "text-sm text-slate-300" }, "");
  const rightPagerSlot = window.el('div', { class: "w-full sm:w-auto" });
  resultsTop.append(leftHint, rightPagerSlot);

  const cardsGrid = window.el('div', {
    class: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
  });

  const bottomPagerSlot = window.el('div');

  pageWrap.append(header, actions, filterWrap, resultsTop, cardsGrid, bottomPagerSlot);
  root.append(pageWrap);

  async function loadAndRender() {
    cardsGrid.innerHTML = '';
    rightPagerSlot.innerHTML = '';
    bottomPagerSlot.innerHTML = '';

    leftHint.textContent = 'Loading...';

    let payload;
    try {
      payload = await fetchMembers({
        page: ui.page,
        pageSize: ui.pageSize,
        name: ui.filters.name,
        guild: ui.filters.guild,
        role: ui.filters.role,
        sort: ui.filters.sort
      });
    } catch (e) {
      leftHint.textContent = 'Failed to load members.';
      const err = window.el('div', { class: "text-slate-300 mt-3" }, String(e?.message || e));
      cardsGrid.append(err);
      return;
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const totalItems = Number(payload.totalItems || items.length || 0);
    const totalPages = Number(payload.totalPages || 1);
    const page = Number(payload.page || ui.page || 1);

    ui.page = page;

    leftHint.textContent = totalItems ? `Members: ${totalItems}` : 'No members found';

    const onPage = (p) => {
      ui.page = p;
      loadAndRender();
      try { window.__scrollTop?.(0, true); } catch {}
    };

    rightPagerSlot.append(renderPagination({ page, totalPages, onPage }));
    bottomPagerSlot.append(renderPagination({ page, totalPages, onPage }));

    for (const u of items) {
      const name = safeText(u.displayName || u.username, 'Unknown');
      const role = safeText(u.role, 'Hunter');
      const guild = safeText(u.guild, 'No Guild');
      const visits = Number(u.visits || 0);
      const reg = fmtDate(u.createdAt);

      const uid = Number(u?.id || 0);
      const href = uid ? withBase(`/members/${uid}`) : '#';

      const card = window.el('a', {
        href,
        class:
          "sla-member-card border rounded-2xl overflow-hidden bg-glass border-white/10 " +
          "shadow-sm hover:shadow-md hover:bg-slate-900/45 transition cursor-pointer"
      });

      const body = window.el('div', { class: "p-5 text-center" });

      const avatarWrap = window.el('div', { class: "flex justify-center" });

      const avatar = u.avatar
        ? window.el('img', {
            src: u.avatar,
            class: "w-24 h-24 rounded-full object-cover ring-4 ring-slate-900/40 border border-slate-600",
            alt: ""
          })
        : window.el('div', {
            class: "w-24 h-24 rounded-full bg-slate-800 border border-white/10 grid place-items-center text-3xl"
          }, "👤");

      avatarWrap.append(avatar);

      const nameEl = window.el('div', { class: "mt-4 text-xl font-extrabold text-slate-100" }, name);

      const roleEl = window.el('div', { class: "mt-2 flex justify-center" });
      roleEl.append(pillRole(role));

      const regEl = window.el('div', { class: "mt-3 text-sm text-slate-300" });
      regEl.innerHTML = `Registration: <span class="font-semibold text-slate-100">${reg}</span>`;

      const guildEl = window.el('div', { class: "mt-4 text-slate-100 font-bold" }, guild);

      body.append(avatarWrap, nameEl, roleEl, regEl, guildEl);

      const footer = window.el('div', {
        class: "border-t border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-300/90 text-center"
      }, `Visits: ${visits}`);

      card.append(body, footer);

      // ✅ SPA only on normal left click
      card.addEventListener('click', (e) => {
        if (!uid) return;
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        goToMemberPage(uid);
      });

      cardsGrid.append(card);
    }

    if (ui.filtersOpen) {
      requestAnimationFrame(() => {
        filterWrap.style.maxHeight = (panel.scrollHeight + 24) + "px";
      });
    }
  }

  applyBtn.onclick = () => {
    ui.filters.name = nameInp.value.trim();
    ui.filters.guild = guildInp.value.trim();
    ui.filters.role = roleSel.value;
    ui.filters.sort = sortSel.value;
    ui.page = 1;
    loadAndRender();
  };

  resetBtn.onclick = () => {
    nameInp.value = '';
    guildInp.value = '';
    roleSel.value = 'All';
    sortSel.value = 'Newest';

    ui.filters = { name: '', guild: '', role: 'All', sort: 'Newest' };
    ui.page = 1;
    loadAndRender();
  };

  nameInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyBtn.click();
  });
  guildInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyBtn.click();
  });

  loadAndRender();
}

window.__members_mount = function __members_mount() {
  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = '';
  renderMembers(content);
};
