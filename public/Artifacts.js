'use strict';

/**
 * Artifacts.js — Artifacts page
 * Card-style version for:
 *  - Complete Set
 *  - Armor Set
 *  - Accessories Set
 *  - Admin
 *
 * Layout:
 *  - row 1: set name
 *  - row 2: images
 *    * complete: 2 rows (4 + 4)
 *    * armor/accessories: 1 row (4)
 *  - row 3: pieces vertical
 *    * 2-Piece
 *      description
 *    * 4-Piece
 *      description
 *    * 8-Piece
 *      description
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
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (typeof v === 'boolean') {
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
  // Shared UI helpers
  // --------------------------
  function slcBtnClass(active, size = 'tab', extra = '') {
    const sizeClass =
      size === 'tab' ? 'h-10 px-4 text-base font-semibold' :
      size === 'lg'  ? 'h-10 px-4 text-base font-bold' :
      size === 'xs'  ? 'h-9 px-3 text-xs font-bold' :
                       'h-9 px-3 text-sm font-bold';

    const base =
      'rounded-xl border transition-colors inline-flex items-center justify-center ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed';

    const on = 'bg-yellow-400 text-black border-yellow-300/60';
    const off = 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white';

    return [sizeClass, base, active ? on : off, extra].filter(Boolean).join(' ');
  }

  function slcTabClass(active) {
    return slcBtnClass(active, 'tab', 'w-full');
  }

  // --------------------------
  // Local pictures (Artifact/*)
  // --------------------------
  const __artifactPicturesCache = new Map();
  const ARTIFACT_SLOT_FOLDERS = {
    complete: ['Helmet', 'Body', 'Gloves', 'Boots', 'Necklace', 'Bracelet', 'Ring', 'Earrings'],
    armor: ['Helmet', 'Body', 'Gloves', 'Boots'],
    accessories: ['Necklace', 'Bracelet', 'Ring', 'Earrings']
  };

  function normalizeNameKey(v) {
    return String(v || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '');
  }

  function isExternalImage(v) {
    const s = String(v || '').trim();
    if (!s) return false;
    if (s.startsWith('/picture/')) return false;
    return /^https?:\/\//i.test(s);
  }

  function toArtifactPicturePath(relOrPath) {
    const s = String(relOrPath || '').trim().replace(/\\/g, '/');
    if (!s) return '';
    if (s.startsWith('/picture/')) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return `/picture/Artifact/${s.replace(/^\/+/, '')}`;
  }

  function artifactImageSrc(v, w = 256) {
    const p = toArtifactPicturePath(v);
    return cdnySafe(p, w);
  }

  async function loadArtifactPictures(force = false) {
    const cacheKey = 'Artifact';
    if (!force && __artifactPicturesCache.has(cacheKey)) return __artifactPicturesCache.get(cacheKey);

    const j = await fetchJson('/api/admin/pictures/list?category=' + encodeURIComponent('Artifact'));
    const items = Array.isArray(j?.items) ? j.items : [];
    __artifactPicturesCache.set(cacheKey, items);
    return items;
  }

  function optionsForArtifactSlot(allItems, folderName) {
    const target = String(folderName || '').toLowerCase();
    return (Array.isArray(allItems) ? allItems : [])
      .filter(it => String(it?.rel || '').split('/')[0]?.toLowerCase() === target)
      .map(it => ({ rel: String(it.rel || ''), path: toArtifactPicturePath(it.rel), name: String(it.name || '') }));
  }

  function artifactSlotAliasKeys(folderName) {
    const f = String(folderName || '').toLowerCase();
    const map = {
      helmet: ['helmet'],
      body: ['body', 'armor', 'armour'],
      gloves: ['glove', 'gloves'],
      boots: ['boot', 'boots', 'shoes'],
      earrings: ['earring', 'earrings'],
      bracelet: ['bracelet', 'bracelets', 'bangle'],
      necklace: ['necklace', 'necklaces'],
      ring: ['ring', 'rings']
    };
    return (map[f] || [f]).map(normalizeNameKey).filter(Boolean);
  }

  function stripSlotPrefixKey(key, folderName) {
    let out = normalizeNameKey(key);
    if (!out) return '';
    const aliases = artifactSlotAliasKeys(folderName);
    for (const a of aliases) {
      if (!a) continue;
      if (out.startsWith(a + 'of')) out = out.slice((a + 'of').length);
      else if (out.startsWith(a)) out = out.slice(a.length);
    }
    return out;
  }

  function basenameNoExt(v) {
    const s = String(v || '').replace(/\\/g, '/');
    const b = s.split('/').pop() || '';
    return b.replace(/\.[a-z0-9]+$/i, '');
  }

  function bestArtifactMatchForSet(allItems, folderName, setName, currentImage) {
    const opts = optionsForArtifactSlot(allItems, folderName);
    if (!opts.length) return null;

    const rawQuery = String(setName || '').trim();
    const nk = normalizeNameKey(rawQuery);
    const nkStripped = stripSlotPrefixKey(rawQuery, folderName);
    const currentBase = basenameNoExt(currentImage || '');
    const currentKey = normalizeNameKey(currentBase);
    const currentStripped = stripSlotPrefixKey(currentBase, folderName);
    const queries = [nk, nkStripped, currentKey, currentStripped].filter(Boolean);
    if (!queries.length) return null;

    const scored = opts.map(o => {
      const relKey = normalizeNameKey(o.rel);
      const nameKey = normalizeNameKey(o.name);
      const baseKey = normalizeNameKey(basenameNoExt(o.name));
      const relBaseKey = normalizeNameKey(basenameNoExt(o.rel));
      const baseStripped = stripSlotPrefixKey(o.name, folderName);
      const relBaseStripped = stripSlotPrefixKey(o.rel, folderName);
      const cands = [nameKey, relKey, baseKey, relBaseKey, baseStripped, relBaseStripped].filter(Boolean);

      let score = 0;
      for (const q of queries) {
        for (const c of cands) {
          if (!q || !c) continue;
          if (c === q) score = Math.max(score, 140);
          else if (c.startsWith(q) || q.startsWith(c)) score = Math.max(score, 95);
          else if (c.includes(q) || q.includes(c)) score = Math.max(score, 70);
        }
      }
      return { o, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.o.rel.localeCompare(b.o.rel));

    return scored[0]?.o || null;
  }

  // --------------------------
  // Route safety / admin hide
  // --------------------------
  function isArtifactsRoute() {
    try {
      const p = location.pathname || '';
      return p === '/artifacts' || p.endsWith('/artifacts') || p.includes('/artifacts/');
    } catch {
      return false;
    }
  }

  function safeRender() {
    if (!isArtifactsRoute()) return;
    render();
  }

  const LS_HIDE_KEY = 'sla_hide_admin_buttons';

  function isAdminTabHiddenByPrefs() {
    try {
      return localStorage.getItem(LS_HIDE_KEY) === '1';
    } catch {
      return false;
    }
  }

  // --------------------------
  // Text coloring system
  // --------------------------
  const COLOR_GOLD = '#fac700';
  const COLOR_LIGHT = '#ffdf7d';
  const COLOR_ORANGE = '#ff8740';
  const COLOR_MINT = '#63fac7';

  const TAG_TO_COLOR = {
    gold: COLOR_GOLD,
    light: COLOR_LIGHT,
    orange: COLOR_ORANGE,
    mint: COLOR_MINT,
    keyword: COLOR_GOLD,
    keyword2: COLOR_LIGHT,
    break: COLOR_ORANGE,
    debuff: COLOR_MINT
  };

  function tagOpen(type) {
    if (type === 'keyword') return '[keyword]';
    if (type === 'keyword2') return '[keyword2]';
    if (type === 'break') return '[break]';
    if (type === 'debuff') return '[debuff]';
    return '[keyword]';
  }

  function tagClose(type) {
    if (type === 'keyword') return '[/keyword]';
    if (type === 'keyword2') return '[/keyword2]';
    if (type === 'break') return '[/break]';
    if (type === 'debuff') return '[/debuff]';
    return '[/keyword]';
  }

  function tagColor(type) {
    return TAG_TO_COLOR[String(type || '').toLowerCase()] || COLOR_GOLD;
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
      textarea.dispatchEvent(new Event('input'));
      return;
    }

    const selected = value.slice(start, end);
    const replaced = open + selected + close;

    textarea.value = value.slice(0, start) + replaced + value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + open.length, start + open.length + selected.length);
    textarea.dispatchEvent(new Event('input'));
  }

  function stripColorTags(s) {
    let out = String(s || '');

    out = out.replace(/\[(keyword|keyword2|break|debuff)\]([\s\S]*?)\[\/\1\]/gi, '$2');
    out = out.replace(/\{gold\}([\s\S]*?)\{\/gold\}/gi, '$1');
    out = out.replace(/\{light\}([\s\S]*?)\{\/light\}/gi, '$1');
    out = out.replace(/\{orange\}([\s\S]*?)\{\/orange\}/gi, '$1');
    out = out.replace(/\{mint\}([\s\S]*?)\{\/mint\}/gi, '$1');

    return out;
  }

  function removeFormatting(textarea) {
    if (!textarea) return;

    const value = String(textarea.value || '');
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    if (start === end) {
      textarea.value = stripColorTags(value);
      textarea.focus();
      textarea.dispatchEvent(new Event('input'));
      return;
    }

    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    const cleanedSel = stripColorTags(selected);
    textarea.value = before + cleanedSel + after;

    textarea.focus();
    textarea.setSelectionRange(start, start + cleanedSel.length);
    textarea.dispatchEvent(new Event('input'));
  }

  function renderColoredText(text) {
    const wrap = el('div', {
      class: 'leading-relaxed text-sm text-slate-200 whitespace-pre-wrap break-words text-left'
    });
  
    const src = String(text || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return [wrap];
  
    const lines = src.split('\n');
  
    function appendInlineStyled(container, line) {
      let last = 0;
    
      const regex = /(\[(gold|light|orange|mint|keyword|keyword2|break|debuff)\]([\s\S]*?)\[\/\2\]|\{(gold|light|orange|mint)\}([\s\S]*?)\{\/\4\})/gi;
      let m;
    
      while ((m = regex.exec(line)) !== null) {
        const before = line.slice(last, m.index);
        if (before) container.append(document.createTextNode(before));
      
        const tag = String(m[2] || m[4] || '').toLowerCase();
        const content = m[3] ?? m[5] ?? '';
      
        container.append(el('span', {
          style: `color:${tagColor(tag)}; font-weight:800;`
        }, content));
      
        last = regex.lastIndex;
      }
    
      const tail = line.slice(last);
      if (tail) container.append(document.createTextNode(tail));
    }
  
    let bulletList = null;
  
    function flushBulletList() {
      if (bulletList) {
        wrap.appendChild(bulletList);
        bulletList = null;
      }
    }
  
    for (const rawLine of lines) {
      const line = String(rawLine || '');
      const trimmed = line.trim();
    
      if (!trimmed) {
        flushBulletList();
        wrap.appendChild(el('div', { class: 'h-2' }));
        continue;
      }
    
      // bullet with dot
      if (trimmed.startsWith('|')) {
        if (!bulletList) {
          bulletList = el('ul', {
            class: 'list-disc pl-5 mt-1 space-y-1'
          });
        }
      
        const li = el('li', {});
        appendInlineStyled(li, trimmed.slice(1).trim());
        bulletList.appendChild(li);
        continue;
      }
    
      flushBulletList();
    
      // indent only, no dot
      if (trimmed.startsWith('>')) {
        const div = el('div', {
          class: 'pl-5 mt-1'
        });
        appendInlineStyled(div, trimmed.slice(1).trim());
        wrap.appendChild(div);
        continue;
      }
    
      const p = el('div', {});
      appendInlineStyled(p, line);
      wrap.appendChild(p);
    }
  
    flushBulletList();
    return [wrap];
  }

  // --------------------------
  // Data model
  // --------------------------
  const EMPTY = {
    complete: [],
    armor: [],
    accessories: [],
    version: 0
  };

  function requiredArtifactsImagesCount(key) {
    if (key === 'complete') return 8;
    if (key === 'armor') return 4;
    if (key === 'accessories') return 4;
    return 4;
  }

  function normalizeData(d) {
    const out = { ...EMPTY };

    if (d && typeof d === 'object') {
      out.complete = Array.isArray(d.complete) ? d.complete : [];
      out.armor = Array.isArray(d.armor) ? d.armor : [];
      out.accessories = Array.isArray(d.accessories) ? d.accessories : [];
      out.version = Number.isFinite(+d.version) ? +d.version : 0;
    }

    for (const key of ['complete', 'armor', 'accessories']) {
      out[key] = out[key]
        .map((x) => {
          const pass = (x?.passives && typeof x.passives === 'object') ? x.passives : {};

          const p2 = String(pass.p2 || x?.p2 || '');
          const p4 = String(pass.p4 || x?.p4 || '');
          const p8 = key === 'complete' ? String(pass.p8 || x?.p8 || '') : '';

          const images = Array.isArray(x?.images)
            ? x.images.map(v => String(v || '').trim())
            : [];

          return {
            id: String(x?.id || ''),
            name: String(x?.name || ''),
            subName: String(x?.subName || ''),
            images,
            p2,
            p4,
            p8
          };
        })
        .filter(x =>
          x.name ||
          x.subName ||
          (x.images || []).some(Boolean) ||
          x.p2 ||
          x.p4 ||
          (key === 'complete' ? x.p8 : false)
        );
    }

    return out;
  }

  // --------------------------
  // Tabs / state
  // --------------------------
  const TAB = {
    complete: 'complete',
    armor: 'armor',
    accessories: 'accessories',
    admin: 'admin'
  };

  const TAB_LABEL = {
    complete: 'Complete Set',
    armor: 'Armor Set',
    accessories: 'Accessories Set',
    admin: 'Admin'
  };

  const TAB_LABEL_MOBILE = {
    complete: 'Complete',
    armor: 'Armor',
    accessories: 'Accessories',
    admin: 'Admin'
  };

  const state = {
    active: TAB.complete,
    adminActive: TAB.complete,
    adminOrderMode: false,
    data: { ...EMPTY },
    lastVersion: 0,
    pollTimer: null,
    dirtyAdmin: false,
    resizeHandler: null,
    adminHideHandler: null
  };

  function badgeIcon(tabKey) {
    if (tabKey === TAB.complete) return 'fa-solid fa-layer-group';
    if (tabKey === TAB.armor) return 'fa-solid fa-shield-halved';
    if (tabKey === TAB.accessories) return 'fa-solid fa-gem';
    return 'fa-solid fa-user-shield';
  }

  function cardBg() {
    return 'from-slate-900/95 to-slate-800/90';
  }

  // --------------------------
  // Layout helpers
  // --------------------------
  function artifactImagesRows(images, key) {
    const list = Array.isArray(images) ? images.filter(Boolean) : [];

    if (!list.length) {
      return el('div', { class: 'text-slate-500 text-sm text-center' }, '—');
    }

    const imgBox = (src, idx) => el(
      'div',
      {
        class: 'rounded-xl border border-white/10 bg-black/20 p-2 flex items-center justify-center'
      },
      el('img', {
        src: artifactImageSrc(src, 256),
        alt: '',
        class: 'object-contain block',
        style: 'width:52px;height:52px;',
        'data-key': `${key}_${idx}`
      })
    );

    if (list.length >= 8) {
      const top = list.slice(0, 4);
      const bottom = list.slice(4, 8);

      return el('div', { class: 'flex flex-col gap-2' },
        el('div', { class: 'grid grid-cols-4 gap-2 justify-center' },
          ...top.map((src, idx) => imgBox(src, idx))
        ),
        el('div', { class: 'grid grid-cols-4 gap-2 justify-center' },
          ...bottom.map((src, idx) => imgBox(src, idx + 4))
        )
      );
    }

    return el('div', { class: 'grid grid-cols-4 gap-2 justify-center' },
      ...list.map((src, idx) => imgBox(src, idx))
    );
  }

  function passivePieceBox(label, value) {
    const v = String(value || '').trim();

    return el('div', { class: 'mb-4 last:mb-0' },
      el('div', {
        class: 'text-[16px] sm:text-[17px] font-extrabold text-yellow-400 leading-none mb-2'
      }, label),
      el('div', {
        class: 'rounded-2xl border border-white/10 bg-black/20 p-4 text-[14px] text-slate-200/95 leading-6 whitespace-pre-wrap break-words text-left'
      }, ...(v ? renderColoredText(v) : ['—']))
    );
  }

  function passivePiecesGrid(tabKey, item) {
    const boxes = [];
    const hasP2 = String(item?.p2 || '').trim();
    const hasP4 = String(item?.p4 || '').trim();
    const hasP8 = String(item?.p8 || '').trim();

    if (tabKey === TAB.complete) {
      if (hasP2) boxes.push(passivePieceBox('2-Piece', item.p2));
      if (hasP4) boxes.push(passivePieceBox('4-Piece', item.p4));
      if (hasP8) boxes.push(passivePieceBox('8-Piece', item.p8));
    } else {
      boxes.push(passivePieceBox('2-Piece', item.p2));
      boxes.push(passivePieceBox('4-Piece', item.p4));
    }

    if (!boxes.length) {
      boxes.push(passivePieceBox('Passive', ''));
    }

    return el('div', { class: 'flex flex-col' }, ...boxes);
  }

  // --------------------------
  // Public cards
  // --------------------------
  function publicArtifactCard(tabKey, item) {
    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        cardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },

        el('div', { class: 'text-center' },
          el('div', {
            class: 'text-yellow-400 font-extrabold text-[18px] sm:text-[19px] leading-tight break-words'
          }, item.name || '—'),
          (String(item.subName || '').trim()
            ? el('div', {
                class: 'mt-1 text-white/95 text-[13px] sm:text-[14px] leading-tight break-words'
              }, `(${item.subName})`)
            : null)
        ),

        el('div', { class: 'mt-4 flex justify-center' },
          el('div', { class: 'w-full max-w-[420px]' },
            artifactImagesRows(item.images, item.id)
          )
        ),

        el('div', { class: 'mt-4' },
          passivePiecesGrid(tabKey, item)
        )
      )
    );
  }

  function renderPublicCards(tabKey) {
    const list = state.data[tabKey] || [];

    return el('div', { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' },
      ...(list.length
        ? list.map((item) => publicArtifactCard(tabKey, item))
        : [
          el('div', {
            class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300'
          }, 'No artifacts yet.')
        ])
    );
  }

  // --------------------------
  // Admin cards
  // --------------------------
  function tabLabelNode(key) {
    const desktop = TAB_LABEL[key] || key;
    const mobile = TAB_LABEL_MOBILE[key] || desktop;
    if (desktop === mobile) return mobile;

    return el('span', { class: 'inline-flex flex-col sm:flex-row sm:items-center sm:justify-center' },
      el('span', { class: 'sm:hidden' }, mobile),
      el('span', { class: 'hidden sm:inline' }, desktop)
    );
  }

  function tabButton(key) {
    const active = state.active === key;
    return el('button', {
      class: slcTabClass(active),
      onClick: () => {
        if (state.active === key) return;
        state.active = key;
        safeRender();
      }
    }, tabLabelNode(key));
  }

  function adminSwitchBtn(key) {
    const active = state.adminActive === key;
    return el('button', {
      class: slcBtnClass(active, 'sm', 'flex items-center gap-2'),
      onClick: () => {
        state.adminActive = key;
        state.adminOrderMode = false;
        safeRender();
      }
    }, el('i', { class: badgeIcon(key) }), TAB_LABEL[key]);
  }

  function adminHeader() {
    return el('div', { class: 'flex flex-col gap-3 mb-4' },
      el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' },
        el('div', { class: 'flex items-center gap-3' },
          el('div', {
            class: 'w-10 h-10 rounded-2xl bg-glass border border-white/10 flex items-center justify-center'
          }, el('i', { class: 'fa-solid fa-user-shield' })),
          el('div', {},
            el('div', { class: 'font-extrabold text-yellow-400 text-lg' }, 'Admin'),
            el('div', { class: 'text-xs text-slate-300/90' }, 'Global changes – visible for all users instantly.')
          )
        ),
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('button', {
            class: slcBtnClass(state.adminOrderMode, 'sm'),
            onClick: () => {
              state.adminOrderMode = !state.adminOrderMode;
              safeRender();
            }
          }, el('i', { class: 'fa-solid fa-list-ol mr-2' }), 'Set exact order'),
          el('button', {
            class: slcBtnClass(false, 'sm'),
            onClick: () => autoMatchMissingArtifactImages(state.adminActive)
          }, el('i', { class: 'fa-solid fa-wand-magic-sparkles mr-2' }), 'Auto match missing images'),
          el('button', {
            class: slcBtnClass(true, 'sm'),
            onClick: () => openEditModal(state.adminActive, null)
          }, el('i', { class: 'fa-solid fa-plus mr-2' }), 'Add')
        )
      ),
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        adminSwitchBtn(TAB.complete),
        adminSwitchBtn(TAB.armor),
        adminSwitchBtn(TAB.accessories)
      )
    );
  }

  function adminArtifactCard(typeKey, item) {
    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        cardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },

        el('div', { class: 'text-center' },
          el('div', {
            class: 'text-yellow-400 font-extrabold text-[18px] leading-tight break-words'
          }, item.name || '—'),
          (String(item.subName || '').trim()
            ? el('div', {
                class: 'mt-1 text-white/95 text-[13px] leading-tight break-words'
              }, `(${item.subName})`)
            : null)
        ),

        el('div', { class: 'mt-4 flex justify-center' },
          el('div', { class: 'w-full max-w-[420px]' },
            artifactImagesRows(item.images, item.id)
          )
        ),

        el('div', { class: 'mt-4' },
          passivePiecesGrid(typeKey, item)
        ),

        el('div', { class: 'mt-4 grid grid-cols-2 gap-2' },
          el('button', {
            class: slcBtnClass(false, 'sm'),
            onClick: () => openEditModal(typeKey, item)
          }, el('i', { class: 'fa-solid fa-pen mr-2' }), 'Edit'),
          el('button', {
            class: 'h-9 px-3 rounded-xl border border-rose-400/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-100 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
            onClick: () => removeItem(typeKey, item.id)
          }, el('i', { class: 'fa-solid fa-trash mr-2' }), 'Delete')
        )
      )
    );
  }

  function adminExactOrderCard(typeKey, item, idx, list) {
    const upDisabled = idx === 0;
    const downDisabled = idx === list.length - 1;

    return el('div', {
      class: [
        'rounded-[22px] border border-white/10 bg-gradient-to-br',
        cardBg(),
        'shadow-[0_10px_30px_rgba(0,0,0,.20)] overflow-hidden'
      ].join(' ')
    },
      el('div', { class: 'p-4 sm:p-5' },

        el('div', {
          class: 'text-center text-slate-100 font-extrabold text-[17px] leading-tight break-words'
        }, item.name || '—'),

        el('div', { class: 'mt-4 flex justify-center' },
          el('div', { class: 'w-full max-w-[420px]' },
            artifactImagesRows(item.images, item.id)
          )
        ),

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
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'Use Move Up / Move Down or open the names list.')
          ),
          el('div', { class: 'flex items-center gap-2 flex-wrap' },
            el('button', {
              class: 'h-9 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-100',
              type: 'button',
              onClick: () => openExactOrderModal(typeKey)
            }, 'Set exact order'),
            el('button', {
              class: slcBtnClass(false, 'sm'),
              onClick: () => {
                state.adminOrderMode = false;
                safeRender();
              }
            }, 'Back')
          )
        )
      ),
      el('div', { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' },
        ...(list.length
          ? list.map((item, idx) => adminExactOrderCard(typeKey, item, idx, list))
          : [
            el('div', { class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300' }, 'No artifacts in this category yet.')
          ])
      )
    );
  }

  function renderAdminPanel() {
    if (!isAdmin()) {
      return el('div', { class: 'rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100' },
        el('div', { class: 'text-lg font-extrabold mb-2' }, 'Access denied'),
        el('div', { class: 'text-slate-200/90' }, 'You don’t have admin permission.')
      );
    }

    const typeKey = state.adminActive;
    const list = state.data[typeKey] || [];

    const body = state.adminOrderMode
      ? adminExactOrderView(typeKey)
      : el('div', { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' },
          ...(list.length
            ? list.map((item) => adminArtifactCard(typeKey, item))
            : [
              el('div', { class: 'rounded-2xl border border-white/10 bg-glass p-6 text-slate-300' }, 'No artifacts in this category yet.')
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

  function makeColorBar(textarea) {
    const mkBtn = (type, label) => el('button', {
      class: slcBtnClass(false, 'sm'),
      type: 'button',
      onClick: () => wrapSelection(textarea, type)
    }, el('span', { style: `color:${tagColor(type)}; font-weight:900;` }, label));

    return el('div', { class: 'flex items-center gap-2 flex-wrap mt-2' },
      mkBtn('keyword', 'Keyword'),
      mkBtn('keyword2', 'Keyword2'),
      mkBtn('break', 'Break'),
      mkBtn('debuff', 'Debuff'),
      el('button', {
        type: 'button',
        class: 'h-9 px-3 rounded-xl border border-rose-400/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-100 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
        onClick: () => removeFormatting(textarea)
      }, 'Remove')
    );
  }

  function openEditModal(typeKey, itemOrNull) {
    if (!isAdmin()) return toast('Admin only.');

    state.dirtyAdmin = true;

    const editing = !!itemOrNull;
    const item = itemOrNull
      ? { ...itemOrNull }
      : { id: '', name: '', subName: '', images: [], p2: '', p4: '', p8: '' };

    const title = editing ? `Edit: ${TAB_LABEL[typeKey]}` : `Add: ${TAB_LABEL[typeKey]}`;
    const isComplete = typeKey === TAB.complete;
    const needImagesCount = requiredArtifactsImagesCount(typeKey);

    const nameInput = el('input', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50',
      placeholder: 'Set name…',
      value: item.name || ''
    });

    const subNameInput = el('input', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50',
      placeholder: 'Sub name…',
      value: item.subName || ''
    });

    const imageInputs = Array.from({ length: needImagesCount }, (_, i) => {
      return el('input', {
        class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50',
        placeholder: `Local image path #${i + 1}`,
        value: String(item.images?.[i] || '')
      });
    });

    const slotFolders = ARTIFACT_SLOT_FOLDERS[typeKey] || [];
    const prettyArtifactPickerLabel = (pathOrName) => {
      const raw = String(pathOrName || '').trim();
      let s = raw;
      if (s.includes('/')) s = s.split('/').pop() || s;
      s = s.replace(/\.[a-z0-9]+$/i, '');
      s = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return s || raw || 'Unnamed image';
    };

    const imagePickers = imageInputs.map((inp, i) => {
      const folder = slotFolders[i] || '';
      const sel = el('select', {
        class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50'
      }, el('option', { value: '' }, folder ? `Select local image… (${folder})` : 'Select local image…'));

      sel.addEventListener('change', () => {
        const v = String(sel.value || '');
        if (v) inp.value = v;
        refreshImagesPreview();
      });
      return { sel, folder };
    });

    let artifactPicturesForModal = [];
    let nameAutoMatchTimer = null;

    function syncPickerValue(index) {
      const picker = imagePickers[index];
      if (!picker) return;

      const current = String(imageInputs[index]?.value || '').trim();
      const sel = picker.sel;
      const exists = Array.from(sel.options).some(opt => opt.value === current);

      if (current && !exists) {
        sel.appendChild(el('option', { value: current }, prettyArtifactPickerLabel(current)));
      }
      sel.value = current || '';
    }

    function tryMatchImagesFromName(setName, force = false) {
      const query = String(setName || '').trim();
      if (!query || !artifactPicturesForModal.length) return 0;

      let changed = 0;
      imagePickers.forEach(({ folder }, i) => {
        const current = String(imageInputs[i]?.value || '').trim();
        const shouldReplace = force || !current || isExternalImage(current);
        if (!shouldReplace) return;

        const match = bestArtifactMatchForSet(artifactPicturesForModal, folder, query, current);
        if (!match?.path || match.path === current) return;

        imageInputs[i].value = match.path;
        syncPickerValue(i);
        changed++;
      });

      if (changed) refreshImagesPreview();
      return changed;
    }

    function scheduleNameAutoMatch() {
      if (nameAutoMatchTimer) clearTimeout(nameAutoMatchTimer);
      nameAutoMatchTimer = setTimeout(() => {
        tryMatchImagesFromName(nameInput.value, false);
      }, 180);
    }

    (async () => {
      try {
        artifactPicturesForModal = await loadArtifactPictures(false);
        imagePickers.forEach(({ sel, folder }, i) => {
          const opts = optionsForArtifactSlot(artifactPicturesForModal, folder);
          const current = String(imageInputs[i].value || '').trim();
          opts.forEach(o => {
            sel.appendChild(el('option', { value: o.path }, prettyArtifactPickerLabel(o.name || o.path)));
          });
          if (current) {
            const has = opts.some(o => o.path === current);
            if (!has) sel.appendChild(el('option', { value: current }, prettyArtifactPickerLabel(current)));
            sel.value = current;
          }
        });

        tryMatchImagesFromName(nameInput.value, false);
      } catch (e) {
        console.warn('artifact picker load failed', e);
      }
    })();

    const p2Input = el('textarea', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50 min-h-[220px]'
    }, item.p2 || '');
    p2Input.placeholder = isComplete
      ? 'Optional 2-Piece passive… Use tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [break]...[/break], [debuff]...[/debuff]'
      : '2-Piece passive… Use tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [break]...[/break], [debuff]...[/debuff]';

    const p4Input = el('textarea', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50 min-h-[220px]'
    }, item.p4 || '');
    p4Input.placeholder = '4-Piece passive… Use tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [break]...[/break], [debuff]...[/debuff]';

    const p8Input = isComplete ? el('textarea', {
      class: 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50 min-h-[220px]'
    }, item.p8 || '') : null;
    if (p8Input) p8Input.placeholder = '8-Piece passive… Use tags: [keyword]...[/keyword], [keyword2]...[/keyword2], [break]...[/break], [debuff]...[/debuff]';

    const colorBar2 = makeColorBar(p2Input);
    const colorBar4 = makeColorBar(p4Input);
    const colorBar8 = p8Input ? makeColorBar(p8Input) : null;

    const imagesPreviewGrid = el('div', { class: 'grid grid-cols-2 gap-2 mt-2' },
      ...imageInputs.map((inp, idx) => {
        const src = String(inp.value || '').trim();
        return el('div', {
          class: 'rounded-xl border border-white/10 bg-glass p-2 flex items-center justify-center'
        },
          src
            ? el('img', { src: artifactImageSrc(src, 256), class: 'object-contain block', style: 'width:50px;height:50px;' })
            : el('div', { class: 'text-slate-500 text-xs' }, `#${idx + 1}`)
        );
      })
    );

    function refreshImagesPreview() {
      imagesPreviewGrid.innerHTML = '';
      imageInputs.forEach((inp, idx) => {
        const src = String(inp.value || '').trim();
        imagesPreviewGrid.appendChild(
          el('div', {
            class: 'rounded-xl border border-white/10 bg-glass p-2 flex items-center justify-center'
          },
            src
              ? el('img', { src: artifactImageSrc(src, 256), class: 'object-contain block', style: 'width:50px;height:50px;' })
              : el('div', { class: 'text-slate-500 text-xs' }, `#${idx + 1}`)
          )
        );
      });
    }

    imageInputs.forEach((inp) => {
      inp.addEventListener('input', () => refreshImagesPreview());
    });

    nameInput.addEventListener('input', scheduleNameAutoMatch);
    nameInput.addEventListener('blur', () => tryMatchImagesFromName(nameInput.value, false));

    const matchNameBtn = el('button', {
      type: 'button',
      class: slcBtnClass(false, 'sm'),
      onClick: () => {
        const changed = tryMatchImagesFromName(nameInput.value, true);
        toast(changed ? `Matched ${changed} image(s) from set name.` : 'No matching local images found for this set name.');
      }
    }, el('i', { class: 'fa-solid fa-wand-magic-sparkles mr-2' }), 'Match');

    const leftCol = el('div', { class: 'md:col-span-1 flex flex-col gap-2' },
      el('div', { class: 'text-xs font-bold text-slate-300' }, 'Set Name'),
      nameInput,
      el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, 'Sub Name'),
      subNameInput,
      el('div', { class: 'flex items-center justify-between gap-2 mt-1' },
        el('div', { class: 'text-[11px] text-slate-300/70' }, 'After typing a name, matching local images are searched automatically.'),
        matchNameBtn
      ),
      el('div', { class: 'text-xs font-bold text-slate-300 mt-2' }, `Images (${needImagesCount})`),
      el('div', { class: 'flex flex-col gap-3' },
        ...imageInputs.map((inp, i) => el('div', { class: 'flex flex-col gap-2' },
          el('div', { class: 'text-[11px] font-bold text-slate-300/80' }, (slotFolders[i] || `Slot ${i + 1}`)),
          imagePickers[i].sel
        ))
      ),
      el('div', { class: 'text-xs text-slate-300/70' }, 'Select local images from the list.'),
      imagesPreviewGrid
    );

    const rightCol = el('div', { class: 'md:col-span-2 flex flex-col gap-4' },
      el('div', { class: 'flex flex-col gap-2' },
        el('div', { class: 'text-xs font-bold text-slate-300' }, isComplete ? '2-Piece (optional)' : '2-Piece'),
        p2Input,
        colorBar2
      ),
      el('div', { class: 'flex flex-col gap-2' },
        el('div', { class: 'text-xs font-bold text-slate-300' }, '4-Piece'),
        p4Input,
        colorBar4
      ),
      ...(isComplete ? [
        el('div', { class: 'flex flex-col gap-2' },
          el('div', { class: 'text-xs font-bold text-slate-300' }, '8-Piece'),
          p8Input,
          colorBar8
        )
      ] : [])
    );

    const saveBtn = el('button', {
      class: slcBtnClass(true, 'lg'),
      onClick: async () => {
        const name = String(nameInput.value || '').trim();
        const subName = String(subNameInput.value || '').trim();
        const images = imageInputs.map(i => toArtifactPicturePath(String(i.value || '').trim()));
        const rawImgs = images.filter(Boolean);
        const p2 = String(p2Input.value || '').trim();
        const p4 = String(p4Input.value || '').trim();
        const p8 = p8Input ? String(p8Input.value || '').trim() : '';

        if (!name) return toast('Name is required.');
        if (!rawImgs.length) return toast('Images are required.');
        if (!isComplete && !p2) return toast('2-Piece is required.');
        if (!p4) return toast('4-Piece is required.');
        if (isComplete && !p8) return toast('8-Piece is required.');

        const id = editing && item.id ? item.id : `artifact_${typeKey}_${Date.now()}`;

        try {
          await upsertItem(typeKey, {
            id,
            name,
            subName,
            images,
            passives: { p2, p4, ...(isComplete ? { p8 } : {}) }
          });
          closeModal();
          toast(editing ? 'Artifact updated.' : 'Artifact added.');
        } catch (e) {
          console.error(e);
          toast(String(e?.message || e));
        }
      }
    }, el('i', { class: 'fa-solid fa-floppy-disk mr-2' }), 'Save');

    const cancelBtn = el('button', {
      class: slcBtnClass(false, 'lg'),
      onClick: closeModal
    }, 'Cancel');

    modalEl = el('div', {
      class: 'fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto',
      style: 'background: rgba(0,0,0,.55); backdrop-filter: blur(6px);'
    },
      el('div', {
        class: 'w-full max-w-6xl rounded-2xl border border-white/10 bg-glass p-5 shadow-2xl max-h-[92vh] overflow-y-auto'
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
        el('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4' }, leftCol, rightCol),
        el('div', { class: 'flex justify-end gap-2 mt-5' }, cancelBtn, saveBtn)
      )
    );

    document.body.appendChild(modalEl);
  }

  // --------------------------
  // Data actions
  // --------------------------

  function openExactOrderModal(typeKey) {
    if (!isAdmin()) return toast('Admin only.');

    closeModal();

    const order = (Array.isArray(state.data[typeKey]) ? state.data[typeKey] : [])
      .map(it => String(it?.name || '').trim())
      .filter(Boolean);

    const textarea = el('textarea', {
      class: 'w-full rounded-xl bg-slate-950/40 border border-white/10 text-slate-100 outline-none focus:border-yellow-400/50 min-h-[320px] px-3 py-2 font-extrabold'
    }, order.join('\n'));

    const saveBtn = el('button', {
      class: slcBtnClass(true, 'lg'),
      onClick: async () => {
        const baseItems = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
        const baseNames = baseItems.map(it => String(it?.name || '').trim()).filter(Boolean);
        const baseSet = new Set(baseNames);

        const lines = String(textarea.value || '')
          .split(/\r?\n/)
          .map(x => x.trim())
          .filter(Boolean);

        const nextNames = [];
        const seen = new Set();
        for (const name of lines) {
          if (!baseSet.has(name) || seen.has(name)) continue;
          seen.add(name);
          nextNames.push(name);
        }
        for (const name of baseNames) {
          if (seen.has(name)) continue;
          seen.add(name);
          nextNames.push(name);
        }

        const buckets = new Map();
        for (const it of baseItems) {
          const n = String(it?.name || '').trim();
          if (!n) continue;
          if (!buckets.has(n)) buckets.set(n, []);
          buckets.get(n).push(it);
        }

        const nextList = [];
        for (const name of nextNames) {
          const group = buckets.get(name) || [];
          nextList.push(...group);
          buckets.delete(name);
        }
        for (const group of buckets.values()) nextList.push(...group);

        await saveExactOrder(typeKey, nextList);
        closeModal();
      }
    }, el('i', { class: 'fa-solid fa-floppy-disk mr-2' }), 'Save');

    const cancelBtn = el('button', {
      class: slcBtnClass(false, 'lg'),
      onClick: closeModal
    }, 'Cancel');

    modalEl = el('div', {
      class: 'fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto',
      style: 'background: rgba(0,0,0,.55); backdrop-filter: blur(6px);'
    },
      el('div', {
        class: 'w-full max-w-3xl rounded-2xl border border-white/10 bg-glass p-5 shadow-2xl max-h-[92vh] overflow-y-auto'
      },
        el('div', { class: 'flex items-start justify-between gap-3 mb-4' },
          el('div', {},
            el('div', { class: 'text-lg font-extrabold text-slate-100' }, `Set exact order — ${TAB_LABEL[typeKey]}`),
            el('div', { class: 'text-xs text-slate-300/85 mt-0.5' }, 'One set name per line. Missing sets will be appended automatically.')
          ),
          el('button', { class: 'text-slate-300 hover:text-white', onClick: closeModal },
            el('i', { class: 'fa-solid fa-xmark text-xl' })
          )
        ),
        el('div', { class: 'flex flex-col gap-3' },
          textarea,
          el('div', { class: 'text-xs text-slate-300/75' }, 'Names must match existing artifact set names exactly.')
        ),
        el('div', { class: 'flex justify-end gap-2 mt-5' }, cancelBtn, saveBtn)
      )
    );

    document.body.appendChild(modalEl);
  }

  async function autoMatchMissingArtifactImages(typeKey) {
    if (!isAdmin()) return toast('Admin only.');
    try {
      const folderOrder = ARTIFACT_SLOT_FOLDERS[typeKey] || [];
      if (!folderOrder.length) return toast('No slot mapping for this category.');

      const allItems = await loadArtifactPictures(false);
      const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
      if (!list.length) return toast('No items to process.');

      let changedSets = 0;
      let changedImages = 0;

      const nextList = list.map((it) => {
        const images = Array.isArray(it.images) ? [...it.images] : [];
        let localChanges = 0;
        for (let i = 0; i < folderOrder.length; i++) {
          const cur = String(images[i] || '').trim();
          const needs = !cur || isExternalImage(cur);
          if (!needs) continue;
          const match = bestArtifactMatchForSet(allItems, folderOrder[i], it.name || it.id || '', cur);
          if (!match) continue;
          const nextPath = match.path;
          if (nextPath && nextPath !== cur) {
            images[i] = nextPath;
            localChanges++;
            changedImages++;
          }
        }
        if (!localChanges) return it;
        changedSets++;
        return { ...it, images };
      });

      if (!changedImages) return toast('No missing/external images matched.');
      await saveExactOrder(typeKey, nextList);
      toast(`Auto matched ${changedImages} image(s) in ${changedSets} set(s).`);
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  async function saveExactOrder(typeKey, list) {
    try {
      const next = {
        complete: state.data.complete,
        armor: state.data.armor,
        accessories: state.data.accessories
      };
      next[typeKey] = list;

      const saved = await postJson('/api/artifacts', next);
      state.data = normalizeData(saved?.data || saved);
      state.lastVersion = state.data.version || 0;
      safeRender();
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  async function upsertItem(typeKey, item) {
    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];

    const pass = (item?.passives && typeof item.passives === 'object') ? item.passives : {};
    const normalized = {
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      subName: String(item?.subName || ''),
      images: Array.isArray(item?.images) ? item.images.map(v => String(v || '').trim()) : [],
      p2: String(pass.p2 || item?.p2 || ''),
      p4: String(pass.p4 || item?.p4 || ''),
      p8: typeKey === TAB.complete ? String(pass.p8 || item?.p8 || '') : ''
    };

    const idx = list.findIndex(x => String(x.id) === String(normalized.id));
    if (idx >= 0) list[idx] = normalized;
    else list.unshift(normalized);

    const next = {
      complete: state.data.complete,
      armor: state.data.armor,
      accessories: state.data.accessories
    };
    next[typeKey] = list;

    const payloadForApi = {
      complete: next.complete.map(x => ({
        id: x.id,
        name: x.name,
        subName: x.subName,
        images: x.images,
        passives: { p2: x.p2, p4: x.p4, p8: x.p8 }
      })),
      armor: next.armor.map(x => ({
        id: x.id,
        name: x.name,
        subName: x.subName,
        images: x.images,
        passives: { p2: x.p2, p4: x.p4 }
      })),
      accessories: next.accessories.map(x => ({
        id: x.id,
        name: x.name,
        images: x.images,
        passives: { p2: x.p2, p4: x.p4 }
      }))
    };

    const saved = await postJson('/api/artifacts', payloadForApi);
    state.data = normalizeData(saved?.data || saved);
    state.lastVersion = state.data.version || 0;
    safeRender();
  }

  async function removeItem(typeKey, id) {
    if (!confirm('Delete this artifact set?')) return;

    const list = Array.isArray(state.data[typeKey]) ? [...state.data[typeKey]] : [];
    const nextList = list.filter(x => String(x.id) !== String(id));

    const next = {
      complete: state.data.complete,
      armor: state.data.armor,
      accessories: state.data.accessories
    };
    next[typeKey] = nextList;

    try {
      const payloadForApi = {
        complete: next.complete.map(x => ({
          id: x.id, name: x.name, subName: x.subName, images: x.images, passives: { p2: x.p2, p4: x.p4, p8: x.p8 }
        })),
        armor: next.armor.map(x => ({
          id: x.id, name: x.name, subName: x.subName, images: x.images, passives: { p2: x.p2, p4: x.p4 }
        })),
        accessories: next.accessories.map(x => ({
          id: x.id, name: x.name, images: x.images, passives: { p2: x.p2, p4: x.p4 }
        }))
      };

      const saved = await postJson('/api/artifacts', payloadForApi);
      state.data = normalizeData(saved?.data || saved);
      state.lastVersion = state.data.version || 0;
      safeRender();
      toast('Deleted.');
    } catch (e) {
      console.error(e);
      toast(String(e?.message || e));
    }
  }

  // --------------------------
  // Data load + polling
  // --------------------------
  async function loadArtifacts() {
    const data = normalizeData(await fetchJson('/api/artifacts'));
    state.data = data;
    state.lastVersion = data.version || 0;
  }

  function startPolling(root) {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        if (!isArtifactsRoute()) return;
        if (!document.body.contains(root)) return stopPolling();
        if (state.dirtyAdmin) return;

        const data = normalizeData(await fetchJson('/api/artifacts'));
        if ((data.version || 0) !== (state.lastVersion || 0)) {
          state.data = data;
          state.lastVersion = data.version || 0;
          safeRender();
        }
      } catch {}
    }, 5000);
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  // --------------------------
  // Render
  // --------------------------
  function render() {
    const content = qs('#content');
    if (!content) return;

    const isAdm = isAdmin();
    const adminHidden = isAdminTabHiddenByPrefs();
    const showAdminTab = isAdm && !adminHidden;

    if (!showAdminTab && state.active === TAB.admin) {
      state.active = TAB.complete;
    }

    const head = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });
    head.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Artifacts'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Browse all artifact sets in Solo Leveling: ARISE')
      )
    );

    const tabs = [TAB.complete, TAB.armor, TAB.accessories, ...(showAdminTab ? [TAB.admin] : [])];
    const cols = tabs.length;
    const tabsWrap = el('div', { class: 'grid ' + (cols === 4 ? 'grid-cols-4' : 'grid-cols-3') + ' gap-2 mb-4' },
      ...tabs.map(k => tabButton(k))
    );

    let body = null;
    if (state.active === TAB.admin) body = renderAdminPanel();
    else body = renderPublicCards(state.active);

    const shell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'artifacts' });
    const wrap = el('div', { class: 'max-w-7xl mx-auto' },
      head,
      tabsWrap,
      el('div', {}, body)
    );

    content.innerHTML = '';
    shell.appendChild(wrap);
    content.appendChild(shell);
  }

  // --------------------------
  // Mount
  // --------------------------
  window.__artifacts_mount = async function __artifacts_mount() {
    const content = qs('#content');
    if (!content) return;

    content.innerHTML = '';

    const shell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'artifacts' });
    shell.append(
      el('div', { class: 'max-w-7xl mx-auto rounded-2xl border border-white/10 bg-glass p-6 text-slate-100' },
        el('div', { class: 'text-lg font-extrabold mb-2' }, 'Loading Artifacts…'),
        el('div', { class: 'text-slate-200/80' }, 'Please wait.')
      )
    );
    content.appendChild(shell);

    try {
      await loadArtifacts();
    } catch (e) {
      console.error(e);
      content.innerHTML = '';

      const failShell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'artifacts' });
      failShell.append(
        el('div', { class: 'max-w-7xl mx-auto rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-slate-100' },
          el('div', { class: 'text-lg font-extrabold mb-2' }, 'Failed to load Artifacts'),
          el('div', { class: 'text-slate-200/90' }, escapeHtml(String(e?.message || e)))
        )
      );
      content.appendChild(failShell);
      return;
    }

    safeRender();
    startPolling(content);

    if (state.resizeHandler) {
      window.removeEventListener('resize', state.resizeHandler);
      state.resizeHandler = null;
    }
    state.resizeHandler = () => safeRender();
    window.addEventListener('resize', state.resizeHandler);

    if (state.adminHideHandler) {
      window.removeEventListener('sla:admin-hide-changed', state.adminHideHandler);
      state.adminHideHandler = null;
    }
    state.adminHideHandler = () => safeRender();
    window.addEventListener('sla:admin-hide-changed', state.adminHideHandler);
  };

})();
