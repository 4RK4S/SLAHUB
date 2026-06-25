'use strict';

/**
 * Cores.js — Cores page
 * Card-style version (public + admin)
 * Layout:
 *  - row 1: image
 *  - row 2: name
 *  - row 3: effect
 * Same background colors for all cards
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
    const b = basePath();
    const path = String(p || '');
    if (!path) return b || '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${b}${path}`;
    return `${b}/${path}`;
  }

  function cdnySafe(u, w = 96) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(u, w);
    } catch {}
    return u || '';
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;

      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    }

    for (const ch of children) {
      if (ch == null) continue;
      node.append(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[toast]', msg);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function isAdmin() {
    try {
      if (window.STATE && (window.STATE.isAdmin || window.STATE.admin)) return true;
      const ds = document.body?.dataset || {};
      return ds.admin === '1' || ds.admin === 'true';
    } catch {
      return false;
    }
  }

  async function fetchJson(path) {
    const r = await fetch(url(path), { credentials: 'include', cache: 'no-store' });
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return r.json();
  }

  async function postJson(path, payload) {
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j?.error || `POST ${path} failed (${r.status})`;
      throw new Error(msg);
    }
    return j;
  }

  // --------------------------
  // Local pictures (Core/*)
  // --------------------------
  const CORE_FOLDER_BY_TYPE = {
    mind: 'Mind',
    body: 'Body',
    spirit: 'Spirit'
  };

  const pictureListCache = new Map();

  function isExternalImage(v) {
    const s = String(v || '').trim().toLowerCase();
    return !!s && (s.startsWith('http://') || s.startsWith('https://'));
  }

  function normalizeMatchKey(v) {
    return String(v || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/^.*\//, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(mind|body|spirit|core)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function prettyFileLabel(v) {
    const raw = String(v || '');
    const file = raw.split('/').pop() || raw;
    return file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || file;
  }

  function normalizePictureListResponse(data) {
    const arr = Array.isArray(data)
      ? data
      : (Array.isArray(data?.files) ? data.files : (Array.isArray(data?.items) ? data.items : []));

    return arr.map((it) => {
      if (typeof it === 'string') return { path: it, name: it.split('/').pop() || it };
      if (it && typeof it === 'object') {
        const p = String(it.path || it.url || it.publicPath || it.value || it.name || '').trim();
        if (!p) return null;
        return { path: p, name: String(it.name || p.split('/').pop() || p) };
      }
      return null;
    }).filter(Boolean);
  }

  async function loadCorePictureList(typeKey, force = false) {
    const folder = CORE_FOLDER_BY_TYPE[typeKey];
    if (!folder) return [];
    const cacheKey = `core:${folder}`;
    if (!force && pictureListCache.has(cacheKey)) return pictureListCache.get(cacheKey);

    const tries = [
      `/api/admin/pictures/list?category=Core&subdir=${encodeURIComponent(folder)}`,
      `/api/admin/pictures/list?category=Core/${encodeURIComponent(folder)}`,
      `/api/admin/pictures/list?category=Core`
    ];

    let lastErr = null;

    for (const q of tries) {
      try {
        let list = normalizePictureListResponse(await fetchJson(q));
        if (q.endsWith('category=Core')) {
          const needle = `/core/${folder.toLowerCase()}/`;
          list = list.filter(x => {
            const p = String(x.path || '').toLowerCase();
            return p.includes(needle) || p.startsWith(`${folder.toLowerCase()}/`);
          });
        }

        const out = list.map((x) => {
          let p = String(x.path || '').trim();
          if (!p) return null;
          if (!p.startsWith('/picture/')) {
            if (p.startsWith(`${folder}/`)) p = `/picture/Core/${p}`;
            else if (!p.startsWith('/')) p = `/picture/Core/${folder}/${p}`;
          }
          return { path: p, label: prettyFileLabel(p) };
        }).filter(Boolean);

        pictureListCache.set(cacheKey, out);
        return out;
      } catch (e) {
        lastErr = e;
      }
    }

    if (lastErr) throw lastErr;
    return [];
  }

  function buildCoreImageSelect(typeKey, currentValue, onChange) {
    const select = el('select', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-amber-400/40 max-w-full'
    }, el('option', { value: '' }, 'Select local image…'));

    let currentPath = String(currentValue || '').trim();

    function syncCurrent() {
      if (!currentPath) {
        select.value = '';
        return;
      }
      const has = [...select.options].some(o => o.value === currentPath);
      if (!has) select.appendChild(el('option', { value: currentPath }, prettyFileLabel(currentPath)));
      select.value = currentPath;
    }

    select.addEventListener('change', () => {
      currentPath = String(select.value || '').trim();
      if (typeof onChange === 'function') onChange(currentPath);
    });

    syncCurrent();

    loadCorePictureList(typeKey).then((items) => {
      const selected = currentPath;
      while (select.options.length > 1) select.remove(1);
      for (const item of items) {
        select.appendChild(el('option', { value: item.path }, item.label));
      }
      currentPath = selected;
      syncCurrent();
    }).catch((e) => {
      console.error(e);
      select.appendChild(el('option', { value: '' }, 'Failed to load local images'));
    });

    return select;
  }

  async function autoMatchMissingCoreImages(typeKey) {
    if (!isAdmin()) return toast('Admin only.');

    try {
      const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
      if (!list.length) return toast('No items in this category yet.');

      const pics = await loadCorePictureList(typeKey, true);
      if (!pics.length) return toast('No local images found.');

      const map = new Map();
      for (const p of pics) {
        const key = normalizeMatchKey(p.path);
        if (key && !map.has(key)) map.set(key, p.path);
      }

      let changed = 0;
      const nextList = list.map((c) => {
        const current = String(c.image || '').trim();
        if (current && !isExternalImage(current)) return c;

        const candidates = [c.name, current, current.split('/').pop() || ''].filter(Boolean);
        let matched = '';

        for (const cand of candidates) {
          const key = normalizeMatchKey(cand);
          if (!key) continue;
          if (map.has(key)) {
            matched = map.get(key);
            break;
          }
          for (const [mk, mv] of map.entries()) {
            if (mk.includes(key) || key.includes(mk)) {
              matched = mv;
              break;
            }
          }
          if (matched) break;
        }

        if (!matched || matched === current) return c;
        changed++;
        return { ...c, image: matched };
      });

      if (!changed) return toast('Auto match: no matches found.');
      await saveExactOrder(typeKey, nextList);
      toast(`Auto match done: ${changed} updated.`);
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  // --------------------------
  // Admin hide toggle
  // --------------------------
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  function getHideAdminButtons() {
    try { return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1'; }
    catch { return false; }
  }

  function isAdminTabVisible() {
    return isAdmin() && !state.hideAdminButtons;
  }

  // --------------------------
  // UI helpers
  // --------------------------
  const SHARED_BTN_BASE = 'rounded-xl border font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed';

  function slcTabClass(active) {
    return [
      'h-10 w-full',
      SHARED_BTN_BASE,
      'text-base',
      active
        ? 'bg-yellow-400 text-black border-yellow-300/60'
        : 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
    ].join(' ');
  }

  function slcBtnClass(active, size = 'md') {
    const sizeCls = size === 'sm'
      ? 'h-9 px-3 text-sm'
      : 'h-10 px-4 text-base';

    return [
      sizeCls,
      SHARED_BTN_BASE,
      active
        ? 'bg-yellow-400 text-black border-yellow-300/60'
        : 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
    ].join(' ');
  }

  function slcDangerBtnClass(size = 'sm') {
    const sizeCls = size === 'sm'
      ? 'h-9 px-3 text-sm'
      : 'h-10 px-4 text-base';

    return [
      sizeCls,
      SHARED_BTN_BASE,
      'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/30 text-rose-100'
    ].join(' ');
  }

  function badgeIcon(tabKey) {
    if (tabKey === TAB.mind) return 'fa-solid fa-brain';
    if (tabKey === TAB.body) return 'fa-solid fa-shield-halved';
    if (tabKey === TAB.spirit) return 'fa-solid fa-wand-sparkles';
    return 'fa-solid fa-user-shield';
  }

  function coreCardBg() {
    return 'from-slate-900/95 to-slate-800/90';
  }

  function tabButton(key) {
    const active = state.active === key;
    return el('button', {
      class: slcTabClass(active),
      onClick: () => {
        state.active = key;
        render();
      }
    }, TAB_LABEL[key]);
  }

  function adminSwitchBtn(key) {
    const active = state.adminActive === key;
    return el('button', {
      class: [slcBtnClass(active, 'md'), 'flex items-center gap-2'].join(' '),
      onClick: () => {
        state.adminActive = key;
        state.adminOrderMode = false;
        render();
      }
    }, el('i', { class: badgeIcon(key) }), TAB_LABEL[key]);
  }

  function coreIcon(imageUrl, size = 72) {
    const u = String(imageUrl || '').trim();

    if (!u) {
      return el('div', {
        class: 'rounded-2xl border border-white/10 bg-slate-900/40 flex items-center justify-center overflow-hidden shrink-0',
        style: `width:${size}px;height:${size}px;`
      }, el('i', { class: 'fa-solid fa-gem text-slate-500 text-2xl' }));
    }

    return el('div', {
      class: 'rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden shrink-0 flex items-center justify-center',
      style: `width:${size}px;height:${size}px;`
    }, el('img', {
      src: cdnySafe(u, 256),
      alt: '',
      class: 'w-full h-full object-contain block'
    }));
  }

  // --------------------------
  // Text coloring system
  // --------------------------
  const COLOR_GOLD = '#fac700';
  const COLOR_LIGHT = '#ffdf7d';
  const COLOR_ORANGE = '#ff8740';

  function tagOpen(type) {
    if (type === 'gold') return '{gold}';
    if (type === 'light') return '{light}';
    if (type === 'orange') return '{orange}';
    return '{gold}';
  }

  function tagClose(type) {
    if (type === 'gold') return '{/gold}';
    if (type === 'light') return '{/light}';
    if (type === 'orange') return '{/orange}';
    return '{/gold}';
  }

  function tagColor(type) {
    if (type === 'gold') return COLOR_GOLD;
    if (type === 'light') return COLOR_LIGHT;
    if (type === 'orange') return COLOR_ORANGE;
    return COLOR_GOLD;
  }

  function wrapSelection(textarea, type) {
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = String(textarea.value || '');

    const open = tagOpen(type);
    const close = tagClose(type);

    if (start === end) {
      const insert = open + close;
      textarea.value = value.slice(0, start) + insert + value.slice(end);
      const newPos = start + open.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
      return;
    }

    const selected = value.slice(start, end);
    const replaced = open + selected + close;

    textarea.value = value.slice(0, start) + replaced + value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + open.length, start + open.length + selected.length);
  }

  function removeFormatting(textarea) {
    if (!textarea) return;

    const value = String(textarea.value || '');
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    if (start === end) {
      textarea.value = stripColorTags(value);
      textarea.focus();
      return;
    }

    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    const cleanedSel = stripColorTags(selected);
    textarea.value = before + cleanedSel + after;

    textarea.focus();
    textarea.setSelectionRange(start, start + cleanedSel.length);
  }

  function stripColorTags(s) {
    let out = String(s || '');
    out = out.replace(/\{gold\}([\s\S]*?)\{\/gold\}/g, '$1');
    out = out.replace(/\{light\}([\s\S]*?)\{\/light\}/g, '$1');
    out = out.replace(/\{orange\}([\s\S]*?)\{\/orange\}/g, '$1');
    return out;
  }

  function renderColoredText(text) {
    const raw = String(text || '');
    const parts = [];
    let i = 0;

    const regex = /\{(gold|light|orange)\}([\s\S]*?)\{\/\1\}/g;
    let m;

    while ((m = regex.exec(raw)) !== null) {
      const before = raw.slice(i, m.index);
      if (before) parts.push({ type: 'text', value: before });
      parts.push({ type: 'color', color: m[1], value: m[2] });
      i = m.index + m[0].length;
    }

    const rest = raw.slice(i);
    if (rest) parts.push({ type: 'text', value: rest });

    const nodes = [];
    for (const p of parts) {
      if (p.type === 'text') {
        nodes.push(document.createTextNode(p.value));
      } else {
        const hex = tagColor(p.color);
        nodes.push(el('span', { style: `color:${hex}; font-weight:800;` }, p.value));
      }
    }

    return nodes.length ? nodes : [document.createTextNode('')];
  }

  // --------------------------
  // Core Data
  // --------------------------
  const EMPTY = {
    mind: [],
    body: [],
    spirit: [],
    version: 0
  };

  function normalizeData(d) {
    const out = { ...EMPTY };
    if (d && typeof d === 'object') {
      out.mind = Array.isArray(d.mind) ? d.mind : [];
      out.body = Array.isArray(d.body) ? d.body : [];
      out.spirit = Array.isArray(d.spirit) ? d.spirit : [];
      out.version = Number.isFinite(+d.version) ? +d.version : 0;
    }

    for (const key of ['mind', 'body', 'spirit']) {
      out[key] = out[key]
        .map((x) => ({
          id: String(x?.id || ''),
          name: String(x?.name || ''),
          effect: String(x?.effect || ''),
          image: String(x?.image || '')
        }))
        .filter(x => x.name || x.effect || x.image);
    }

    return out;
  }

  // --------------------------
  // Tabs / state
  // --------------------------
  const TAB = {
    mind: 'mind',
    body: 'body',
    spirit: 'spirit',
    admin: 'admin'
  };

  const TAB_LABEL = {
    mind: 'Mind Cores',
    body: 'Body Cores',
    spirit: 'Spirit Cores',
    admin: 'Admin'
  };

  const state = {
    active: TAB.mind,
    adminActive: TAB.mind,
    adminOrderMode: false,
    data: { ...EMPTY },
    lastVersion: 0,
    pollTimer: null,
    dirtyAdmin: false,
    hideAdminButtons: getHideAdminButtons()
  };

  // --------------------------
  // Public cards
  // --------------------------
  function corePublicCard(tabKey, core) {
    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        coreCardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)]',
        'overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },
        el('div', { class: 'flex justify-center' },
          coreIcon(core.image, 92)
        ),

        el('div', {
          class: 'mt-4 text-center text-slate-100 font-extrabold text-[17px] sm:text-[18px] leading-tight break-words'
        }, core.name || '—'),

        el('div', {
          class: 'mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm sm:text-[14px] text-slate-200/95 leading-6 whitespace-pre-wrap break-words text-center'
        }, ...(core.effect ? renderColoredText(core.effect) : ['—']))
      )
    );
  }

  function renderPublicCards(tabKey) {
    const list = state.data[tabKey] || [];

    return el('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4' },
      ...(list.length
        ? list.map((core) => corePublicCard(tabKey, core))
        : [
          el('div', {
            class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300'
          }, 'No cores yet.')
        ])
    );
  }

  // --------------------------
  // Admin cards
  // --------------------------
  function adminHeader() {
    return el('div', { class: 'flex flex-col gap-3 mb-4' },
      el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' },
        el('div', { class: 'flex items-center gap-3' },
          el('div', {
            class: 'w-10 h-10 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center'
          }, el('i', { class: 'fa-solid fa-user-shield' })),
          el('div', {},
            el('div', { class: 'font-extrabold text-slate-100 text-lg' }, 'Admin'),
            el('div', { class: 'text-xs text-slate-300/85' }, 'Global changes – visible for all users instantly.')
          )
        ),
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('button', {
            class: slcBtnClass(state.adminOrderMode, 'md'),
            onClick: () => {
              state.adminOrderMode = !state.adminOrderMode;
              render();
            }
          }, el('i', { class: 'fa-solid fa-list-ol mr-2' }), 'Set exact order'),
          el('button', {
            class: slcBtnClass(false, 'md'),
            onClick: () => autoMatchMissingCoreImages(state.adminActive)
          }, el('i', { class: 'fa-solid fa-wand-magic-sparkles mr-2' }), 'Auto match missing images'),
          el('button', {
            class: slcBtnClass(true, 'md'),
            onClick: () => openEditModal(state.adminActive, null)
          }, el('i', { class: 'fa-solid fa-plus mr-2' }), 'Add')
        )
      ),
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        adminSwitchBtn(TAB.mind),
        adminSwitchBtn(TAB.body),
        adminSwitchBtn(TAB.spirit)
      )
    );
  }

  function adminCoreCard(typeKey, c) {
    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        coreCardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },
        el('div', { class: 'flex justify-center' },
          coreIcon(c.image, 86)
        ),

        el('div', {
          class: 'mt-4 text-center text-slate-100 font-extrabold text-[17px] leading-tight break-words'
        }, c.name || '—'),

        el('div', {
          class: 'mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200/95 leading-6 whitespace-pre-wrap break-words text-center'
        }, ...(c.effect ? renderColoredText(c.effect) : ['—'])),

        el('div', { class: 'mt-4 grid grid-cols-2 gap-2' },
          el('button', {
            class: slcBtnClass(false, 'sm'),
            onClick: () => openEditModal(typeKey, c)
          }, el('i', { class: 'fa-solid fa-pen mr-2' }), 'Edit'),
          el('button', {
            class: slcDangerBtnClass('sm'),
            onClick: () => removeCore(typeKey, c.id)
          }, el('i', { class: 'fa-solid fa-trash mr-2' }), 'Delete')
        )
      )
    );
  }

  function adminExactOrderCard(typeKey, c, idx, list) {
    const upDisabled = idx === 0;
    const downDisabled = idx === list.length - 1;

    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        coreCardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },
        el('div', { class: 'flex justify-center' },
          coreIcon(c.image, 78)
        ),

        el('div', {
          class: 'mt-4 text-center text-slate-100 font-extrabold text-[16px] leading-tight break-words'
        }, c.name || '—'),

        el('div', {
          class: 'mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200/95 leading-6 whitespace-pre-wrap break-words text-center'
        }, ...(c.effect ? renderColoredText(c.effect) : ['—'])),

        el('div', { class: 'mt-4 flex justify-center' },
          el('div', {
            class: 'w-9 h-9 rounded-xl border border-white/10 bg-white/5 text-slate-100 font-extrabold flex items-center justify-center'
          }, String(idx + 1))
        ),

        el('div', { class: 'mt-4 grid grid-cols-2 gap-2' },
          el('button', {
            class: [
              'h-10 rounded-xl border text-slate-100 font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
              upDisabled
                ? 'bg-slate-800/20 border-slate-700/40 opacity-40 cursor-not-allowed'
                : 'bg-glass border-white/10 hover:bg-white/10'
            ].join(' '),
            disabled: upDisabled,
            onClick: async () => {
              if (upDisabled) return;
              const next = [...list];
              const tmp = next[idx - 1];
              next[idx - 1] = next[idx];
              next[idx] = tmp;
              await saveExactOrder(typeKey, next);
            }
          }, 'Move Up'),
          el('button', {
            class: [
              'h-10 rounded-xl border text-slate-100 font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
              downDisabled
                ? 'bg-slate-800/20 border-slate-700/40 opacity-40 cursor-not-allowed'
                : 'bg-glass border-white/10 hover:bg-white/10'
            ].join(' '),
            disabled: downDisabled,
            onClick: async () => {
              if (downDisabled) return;
              const next = [...list];
              const tmp = next[idx + 1];
              next[idx + 1] = next[idx];
              next[idx] = tmp;
              await saveExactOrder(typeKey, next);
            }
          }, 'Move Down')
        )
      )
    );
  }

  function adminExactOrderView(typeKey) {
    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];

    return el('div', { class: 'w-full' },
      el('div', { class: 'rounded-2xl border border-white/10 bg-glass p-4 mb-4' },
        el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' },
          el('div', {},
            el('div', { class: 'font-extrabold text-slate-100 text-lg' }, `Set exact order — ${TAB_LABEL[typeKey]}`),
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'Use Move Up / Move Down.')
          ),
          el('button', {
            class: slcBtnClass(false, 'md'),
            onClick: () => {
              state.adminOrderMode = false;
              render();
            }
          }, 'Back')
        )
      ),
      el('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4' },
        ...(list.length
          ? list.map((c, idx) => adminExactOrderCard(typeKey, c, idx, list))
          : [
            el('div', { class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300' }, 'No cores in this category yet.')
          ])
      )
    );
  }

  function renderAdminPanel() {
    if (!isAdmin()) {
      return el('div', { class: 'rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100' },
        el('div', { class: 'text-lg font-extrabold mb-2' }, 'Access denied'),
        el('div', { class: 'text-slate-300/90' }, 'You don’t have admin permission.')
      );
    }

    const typeKey = state.adminActive;
    const list = state.data[typeKey] || [];

    const body = state.adminOrderMode
      ? adminExactOrderView(typeKey)
      : el('div', { class: 'grid grid-cols-1 lg:grid-cols-3 gap-4' },
          ...(list.length
            ? list.map((c) => adminCoreCard(typeKey, c))
            : [
              el('div', { class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300' }, 'No cores in this category yet.')
            ])
        );

    return el('div', { class: 'w-full' },
      adminHeader(),
      body
    );
  }

  // --------------------------
  // Modal (add/edit)
  // --------------------------
  let modalEl = null;

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    state.dirtyAdmin = false;
  }

  function openEditModal(typeKey, coreOrNull) {
    if (!isAdmin()) return toast('Admin only.');

    state.dirtyAdmin = true;

    const editing = !!coreOrNull;
    const core = coreOrNull
      ? { ...coreOrNull }
      : { id: '', name: '', effect: '', image: '' };

    const title = editing ? `Edit: ${TAB_LABEL[typeKey]}` : `Add: ${TAB_LABEL[typeKey]}`;

    const nameInput = el('input', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-amber-400/40',
      placeholder: 'Core name…',
      value: core.name || ''
    });

    const effectInput = el('textarea', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-slate-700/60 text-slate-100 outline-none focus:border-amber-400/40 min-h-[170px]'
    }, core.effect || '');
    effectInput.placeholder = 'Effect description…';

    let selectedImagePath = String(core.image || '').trim();

    const preview = el('div', { class: 'flex items-center gap-3 min-w-0' },
      el('div', { class: 'w-16 h-16 rounded-2xl border border-slate-700/60 bg-slate-950/30 flex items-center justify-center overflow-hidden shrink-0' },
        selectedImagePath
          ? el('img', { src: cdnySafe(selectedImagePath, 256), class: 'w-full h-full object-contain' })
          : el('i', { class: 'fa-solid fa-image text-slate-400' })
      ),
      el('div', { class: 'text-xs text-slate-300/85 min-w-0' },
        el('div', { class: 'font-semibold text-slate-200' }, 'Preview'),
        el('div', { class: 'truncate' }, selectedImagePath ? prettyFileLabel(selectedImagePath) : 'Select a local image.')
      )
    );

    function refreshImagePreview(v) {
      const box = preview.firstChild;
      box.innerHTML = '';
      box.append(
        v
          ? el('img', { src: cdnySafe(v, 256), class: 'w-full h-full object-contain' })
          : el('i', { class: 'fa-solid fa-image text-slate-400' })
      );
      const line = preview.lastChild.querySelectorAll('div')[1];
      if (line) line.textContent = v ? prettyFileLabel(v) : 'Select a local image.';
    }

    const imageSelect = buildCoreImageSelect(typeKey, selectedImagePath, (v) => {
      selectedImagePath = String(v || '').trim();
      refreshImagePreview(selectedImagePath);
    });

    const colorBar = el('div', { class: 'flex items-center gap-2 flex-wrap mt-2' },
      el('button', {
        class: slcBtnClass(false, 'sm'),
        onClick: () => wrapSelection(effectInput, 'gold')
      }, el('span', { style: `color:${COLOR_GOLD}; font-weight:900;` }, 'Color')),
      el('button', {
        class: slcBtnClass(false, 'sm'),
        onClick: () => wrapSelection(effectInput, 'light')
      }, el('span', { style: `color:${COLOR_LIGHT}; font-weight:900;` }, 'Color')),
      el('button', {
        class: slcBtnClass(false, 'sm'),
        onClick: () => wrapSelection(effectInput, 'orange')
      }, el('span', { style: `color:${COLOR_ORANGE}; font-weight:900;` }, 'Color')),
      el('button', {
        class: slcDangerBtnClass('sm'),
        onClick: () => removeFormatting(effectInput)
      }, 'Remove')
    );

    const saveBtn = el('button', {
      class: slcBtnClass(true, 'md'),
      onClick: async () => {
        const name = String(nameInput.value || '').trim();
        const effect = String(effectInput.value || '').trim();
        const image = String(selectedImagePath || '').trim();

        if (!name) return toast('Name is required.');
        if (!effect) return toast('Effect is required.');

        const id = editing && core.id ? core.id : `core_${typeKey}_${Date.now()}`;

        try {
          await upsertCore(typeKey, { id, name, effect, image });
          closeModal();
          toast(editing ? 'Core updated.' : 'Core added.');
        } catch (e) {
          console.error(e);
          toast(String(e?.message || e));
        }
      }
    }, el('i', { class: 'fa-solid fa-floppy-disk mr-2' }), 'Save');

    const cancelBtn = el('button', {
      class: slcBtnClass(false, 'md'),
      onClick: closeModal
    }, 'Cancel');

    modalEl = el('div', {
      class: 'fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto',
      style: 'background: rgba(0,0,0,.55); backdrop-filter: blur(6px);'
    },
      el('div', {
        class: 'w-full max-w-2xl rounded-2xl border border-white/10 bg-glass p-5 shadow-2xl max-h-[90vh] overflow-y-auto'
      },
        el('div', { class: 'flex items-start justify-between gap-3 mb-4' },
          el('div', {},
            el('div', { class: 'text-lg font-extrabold text-slate-100' }, title),
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'Global change: visible for all users.')
          ),
          el('button', { class: 'text-slate-300 hover:text-white', onClick: closeModal },
            el('i', { class: 'fa-solid fa-xmark text-xl' })
          )
        ),

        el('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
          el('div', { class: 'flex flex-col gap-2' },
            el('div', { class: 'text-xs font-bold text-slate-300' }, 'Name'),
            nameInput,

            el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, 'Local image'),
            imageSelect,
            preview
          ),
          el('div', { class: 'flex flex-col gap-2' },
            el('div', { class: 'flex items-center justify-between' },
              el('div', { class: 'text-xs font-bold text-slate-300' }, 'Effect'),
              el('div', { class: 'text-[11px] text-slate-300/70' }, 'Select text → Color / Remove')
            ),
            effectInput,
            colorBar
          )
        ),

        el('div', { class: 'flex justify-end gap-2 mt-5' },
          cancelBtn,
          saveBtn
        )
      )
    );

    document.body.appendChild(modalEl);
  }

  // --------------------------
  // Data save / delete
  // --------------------------
  async function saveExactOrder(typeKey, list) {
    try {
      const next = {
        mind: state.data.mind,
        body: state.data.body,
        spirit: state.data.spirit
      };
      next[typeKey] = list;

      const saved = await postJson('/api/cores', next);
      state.data = normalizeData(saved?.data || saved);
      state.lastVersion = state.data.version || 0;
      render();
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  async function upsertCore(typeKey, core) {
    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
    const idx = list.findIndex(x => String(x.id) === String(core.id));

    if (idx >= 0) list[idx] = core;
    else list.unshift(core);

    const next = {
      mind: state.data.mind,
      body: state.data.body,
      spirit: state.data.spirit
    };
    next[typeKey] = list;

    const saved = await postJson('/api/cores', next);
    state.data = normalizeData(saved?.data || saved);
    state.lastVersion = state.data.version || 0;
    render();
  }

  async function removeCore(typeKey, id) {
    if (!confirm('Delete this core?')) return;

    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
    const nextList = list.filter(x => String(x.id) !== String(id));

    const next = {
      mind: state.data.mind,
      body: state.data.body,
      spirit: state.data.spirit
    };
    next[typeKey] = nextList;

    try {
      const saved = await postJson('/api/cores', next);
      state.data = normalizeData(saved?.data || saved);
      state.lastVersion = state.data.version || 0;
      render();
      toast('Deleted.');
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  // --------------------------
  // Data load + polling
  // --------------------------
  async function loadCores() {
    const data = normalizeData(await fetchJson('/api/cores'));
    state.data = data;
    state.lastVersion = data.version || 0;
  }

  function startPolling(root) {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        if (!document.body.contains(root)) return stopPolling();
        if (state.dirtyAdmin) return;

        const data = normalizeData(await fetchJson('/api/cores'));
        if ((data.version || 0) !== (state.lastVersion || 0)) {
          state.data = data;
          state.lastVersion = data.version || 0;
          render();
        }
      } catch {}
    }, 5000);
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // --------------------------
  // Event
  // --------------------------
  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      const hide = !!e?.detail?.hide;
      state.hideAdminButtons = hide;

      if (state.active === TAB.admin && !isAdminTabVisible()) {
        state.active = TAB.mind;
      }

      render();
    } catch {}
  });

  // --------------------------
  // Header / tabs
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Cores'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Browse all cores in Solo Leveling: ARISE')
      )
    );

    root.append(top);
  }

  function renderSubtabs(root) {
    const tabs = [
      { key: TAB.mind, label: TAB_LABEL.mind },
      { key: TAB.body, label: TAB_LABEL.body },
      { key: TAB.spirit, label: TAB_LABEL.spirit }
    ];
    if (isAdminTabVisible()) tabs.push({ key: TAB.admin, label: TAB_LABEL.admin });

    const cols = tabs.length;
    const bar = el('div', {
      class: 'grid ' + (cols === 4 ? 'grid-cols-4' : 'grid-cols-3') + ' gap-2 mb-4'
    });

    const btn = (key, label) => {
      const active = state.active === key;
      const b = el('button', { class: slcTabClass(active) }, label);

      b.addEventListener('click', () => {
        if (state.active === key) return;
        if (key === TAB.admin && !isAdminTabVisible()) state.active = TAB.mind;
        else state.active = key;
        render();
      });

      return b;
    };

    if (state.active === TAB.admin && !isAdminTabVisible()) state.active = TAB.mind;

    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  // --------------------------
  // Render
  // --------------------------
  function render() {
    const content = qs('#content');
    if (!content) return;

    if (state.active === TAB.admin && !isAdminTabVisible()) {
      state.active = TAB.mind;
    }

    let body = null;
    if (state.active === TAB.admin) body = renderAdminPanel();
    else body = renderPublicCards(state.active);

    const wrap = el('div', { class: 'max-w-7xl mx-auto' });
    renderHeader(wrap);
    renderSubtabs(wrap);
    wrap.append(el('div', { class: 'pt-0' }, body));

    content.innerHTML = '';

    const shell = el('div', {
      class: 'w-full mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'cores'
    });

    shell.appendChild(wrap);
    content.appendChild(shell);
  }

  // --------------------------
  // Mount
  // --------------------------
  window.__cores_mount = async function __cores_mount() {
    const content = qs('#content');
    if (!content) return;

    content.innerHTML = '';

    const shell = el('div', {
      class: 'w-full mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'cores'
    });

    shell.innerHTML = `
      <div class="max-w-7xl mx-auto rounded-2xl border border-white/10 bg-glass p-6 text-slate-100">
        <div class="text-lg font-extrabold mb-2">Loading Cores…</div>
        <div class="text-slate-200/80">Please wait.</div>
      </div>
    `;

    content.appendChild(shell);

    state.hideAdminButtons = getHideAdminButtons();

    try {
      await loadCores();
    } catch (e) {
      console.error(e);
      shell.innerHTML = `
        <div class="max-w-7xl mx-auto rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100">
          <div class="text-lg font-extrabold mb-2">Failed to load Cores</div>
          <div class="text-slate-300/90">${escapeHtml(String(e?.message || e))}</div>
        </div>
      `;
      return;
    }

    render();
    startPolling(content);
  };

})();
