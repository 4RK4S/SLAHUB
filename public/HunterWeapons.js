'use strict';

/**
 * HunterWeapons.js — Hunters Weapons page module for the new router (LogIn.js).
 * Exposes: window.__hunter_weapons_mount()
 *
 * ✅ 1:1 like SungWeapons.js:
 * - Same Advancement system: - / +, same states, same styling
 * - Same Lv behavior: 0 when not owned, input min=0, clamp to Global Max Lv, bulk live update
 * - Same toolbar behavior: EDIT button in filters (only on My list + logged in), bulk row under filters
 * - Same save/load behavior + payload filtering (save only owned items, adv>0)
 *
 * ✅ Admin (1:1 like SungWeapons.js):
 * - Add / Edit / Remove weapon
 * - Global order (up/down + exact order modal)
 * - Global Max Lv (settings)
 *
 * ✅ Changes (per your request):
 * - Add new weapon: Max Advancement removed (always max / ADV_MAX)
 * - Hunter (optional): dropdown with all hunters + one "HUNTERS" option (no owner)
 * - Same dropdown in Edit modal
 *
 * ✅ LOCAL IMAGES (NO LINKS):
 * - Weapon images are stored as "HWeapon/<rel>" and rendered as "/picture/HWeapon/<rel>"
 * - Admin: dropdown sourced from GET /api/admin/pictures/list?category=HWeapon
 * - No legacy http/https (treated as empty)
 *
 * ✅ AUTO-MATCH IMAGE BY NAME (your request):
 * - Name: "Frieren's Staff" -> image key "Frierens_Staff"
 * - spaces -> "_" and remove "'"
 * - if cannot match => keep empty (manual select)
 * - once manually selected => no auto override
 */

(function () {
  // --------------------------
  // Tiny helpers
  // --------------------------
  const qs = (sel, root = document) => root.querySelector(sel);

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    const b = basePath();
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${b}${path}`;
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

  async function fetchJson(u, opt) {
    const r = await fetch(u, opt);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: j };
  }

  function clampInt(v, min, max) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : min;
    return Math.max(min, Math.min(max, n));
  }

  function slugifyWeaponName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function getWeaponDetailsTarget(w) {
    const slug = slugifyWeaponName(w?.name || '');
    if (!slug) return '';
    return url(`/hunter-weapons/${encodeURIComponent(slug)}`);
  }

  function openWeaponDetails(w, opt = {}) {
    const target = getWeaponDetailsTarget(w);
    if (!target) return;

    const newTab = !!opt?.newTab;

    if (newTab) {
      try {
        window.open(target, '_blank', 'noopener');
      } catch (_) {}
      return;
    }

    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }

    try {
      history.pushState({}, '', target);
    } catch (_) {}

    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function handleWeaponDetailsPointerOpen(ev, w) {
    if (!w) return;

    if (ev?.button === 1 || ev?.ctrlKey || ev?.metaKey) {
      ev.preventDefault?.();
      openWeaponDetails(w, { newTab: true });
      return;
    }

    if (ev?.button === 0) {
      openWeaponDetails(w);
    }
  }

  // --------------------------
  // LOCAL WEAPON IMAGES (NO LINKS)
  // --------------------------
  const PIC_CACHE = { HWeapon: null, HWeaponPromise: null };

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || '').trim());
  }

  function normalizeLocalPicRel(v, category) {
    const s = String(v || '').trim();
    const cat = String(category || '').trim();
    if (!s || !cat) return '';
    if (isHttpUrl(s)) return '';
    if (s.startsWith(`${cat}/`)) return s;
    return `${cat}/${s.replace(/^\/+/, '')}`;
  }

  function localPicSrc(v, category) {
    const rel = normalizeLocalPicRel(v, category);
    return rel ? url(`/picture/${rel}`) : '';
  }

  function resolveLocalOrRemoteSrc(v, category, w) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return s;
    return localPicSrc(s, category);
  }

  function hunterIconImgSrc(h, w) {
    return resolveLocalOrRemoteSrc(h?.image || h?.image_build || '', 'Hunter_Icon', w);
  }

  // normalize to: "HWeapon/<rel>" OR "" (empty)
  function normalizeHWeaponRel(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (isHttpUrl(s)) return '';                // ❌ no legacy
    if (s.startsWith('HWeapon/')) return s;     // ✅ already correct
    // allow passing "Skins/Foo.webp" or "Foo.webp"
    return `HWeapon/${s.replace(/^\/+/, '')}`;
  }

  function resolveWeaponImgSrc(w) {
    const rel = normalizeHWeaponRel(w?.image_build || w?.image || '');
    if (!rel) return '';
    return url(`/picture/${rel}`);
  }

  async function getHWeaponPictures() {
    if (Array.isArray(PIC_CACHE.HWeapon)) return PIC_CACHE.HWeapon;
    if (PIC_CACHE.HWeaponPromise) return PIC_CACHE.HWeaponPromise;

    PIC_CACHE.HWeaponPromise = (async () => {
      const out = await fetchJson(url('/api/admin/pictures/list?category=HWeapon'), {
        credentials: 'include',
        cache: 'no-store'
      });

      const items = (out.ok && Array.isArray(out.data?.items)) ? out.data.items : [];
      // items: [{ rel: "Skins/Foo.webp", name, size, mtimeMs }]
      PIC_CACHE.HWeapon = items;
      return items;
    })();

    return PIC_CACHE.HWeaponPromise;
  }

  function prettyPicName(rel) {
    const s = String(rel || '');
    const noExt = s.replace(/\.[a-z0-9]+$/i, '');
    const fileOnly = noExt.split('/').pop() || noExt; // bez folderu
    return fileOnly.replace(/_/g, ' ');               // _ -> spacja
  }

  function fillPictureSelect(box, items, currentRel) {
    if (!box) return;

    const input = box.inputEl;
    const list  = box.listEl;
    if (!input || !list) return;

    const arr = Array.isArray(items) ? items : [];
    box._itemsRaw = arr;

    // map to combobox items
    box._items = arr.map(it => {
      const rel = String(it?.rel || '').trim();
      const label = prettyPicName(rel); // visible text (with spaces)
    
      return {
        label,
        value: rel, // real rel path (saved)
        searchText: `${label} ${rel}`.toLowerCase() // search by pretty + raw path
      };
    }).filter(x => x.value);

    // start value
    box.value = currentRel || '';
    input.value = currentRel ? prettyPicName(currentRel) : '';

    // render initial list
    box.rebuildItems(input.value || '');
  }

  function mkPictureSelect(currentRel = '', extra = '') {
    // wrapper behaves like old select: supports .value
    const box = el('div', {
      class: `${extra} hweapon-pic-select relative min-w-[360px] flex-1`
    });

    const input = el('input', {
      type: 'text',
      class: 'h-10 w-full px-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400',
      placeholder: 'Loading images…',
      value: ''
    });

    const list = el('div', {
      class: 'rounded-xl border border-slate-700 bg-slate-800 text-yellow-400',
      style: 'position:absolute;left:0;right:0;top:100%;z-index:30;margin-top:4px;max-height:280px;overflow:auto;display:none;padding:4px;box-shadow:0 10px 24px rgba(0,0,0,.18)'
    });

    box.append(input, list);

    // exposed refs
    box.inputEl = input;
    box.listEl = list;
    box._items = [];
    box._itemsRaw = [];
    box._open = false;
    box._idx = -1;
    box._selectedValue = String(currentRel || '').trim();

    // select-compatible value API (IMPORTANT)
    Object.defineProperty(box, 'value', {
      get() {
        return box._selectedValue || '';
      },
      set(v) {
        const val = String(v || '').trim();
        box._selectedValue = val;

        // show label in input if found, else raw value (so manual typing still visible)
        const found = (box._items || []).find(it => it.value === val);
        input.value = found ? found.label : (val || '');

        // if empty -> clear typed text too
        if (!val) input.value = '';
      }
    });

    function paintActive() {
      const rows = Array.from(list.children);
      rows.forEach((r, i) => {
        r.style.outline = (i === box._idx ? '2px solid #94a3b8' : 'none');
      });

      if (box._idx >= 0 && rows[box._idx]) {
        const r = rows[box._idx];
        const top = r.offsetTop;
        const bot = top + r.offsetHeight;
        if (list.scrollTop > top) list.scrollTop = top;
        else if (list.scrollTop + list.clientHeight < bot) list.scrollTop = bot - list.clientHeight;
      }
    }

    function openList() {
      if (box._open) return;
      box._open = true;
      list.style.display = 'block';
      box._idx = -1;
      paintActive();
    }

    function closeList() {
      if (!box._open) return;
      box._open = false;
      list.style.display = 'none';
      box._idx = -1;
    }

    function chooseItem(it) {
      if (!it) return;
      box._selectedValue = it.value;   // real rel path
      input.value = it.label;          // pretty text in field
      closeList();

      // trigger change-like event if needed
      box.dispatchEvent?.(new Event('change', { bubbles: true }));
    }

    box.rebuildItems = function rebuildItems(q = '') {
      const ql = String(q || '').trim().toLowerCase();

      const src = ql
        ? (box._items || []).filter(it => (it.searchText || '').includes(ql))
        : (box._items || []);

      list.innerHTML = '';

      if (!src.length) {
        list.append(el('div', {
          class: 'text-xs opacity-70',
          style: 'padding:6px 8px'
        }, 'No results'));
        box._visibleItems = [];
        box._idx = -1;
        return;
      }

      box._visibleItems = src;

      src.forEach((it, i) => {
        const folder = (() => {
          const parts = String(it.value || '').split('/');
          return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        })();
      
        const row = el('div', {
          class: 'flex items-center justify-between gap-2',
          style: `padding:6px 8px;border-radius:8px;cursor:pointer;${i===box._idx?'outline:2px solid #94a3b8;':''}`,
          onClick: () => chooseItem(it),
          onMouseenter: () => { box._idx = i; paintActive(); }
        },
          el('div', { class: 'truncate', style: 'font-weight:700;' }, it.label),
          folder
            ? el('div', { class: 'truncate text-xs opacity-60', style: 'max-width:35%;text-align:right;' }, folder)
            : el('div', { style: 'width:1px' })
        );
      
        list.append(row);
      });
    };

    // typing = searchable dropdown
    input.addEventListener('focus', () => {
      openList();
      box.rebuildItems(input.value);
    });

    input.addEventListener('input', () => {
      // user types custom text -> clear selected rel until they choose exact item
      box._selectedValue = '';
      openList();
      box.rebuildItems(input.value);
    });

    input.addEventListener('keydown', (e) => {
      const items = box._visibleItems || [];
      const key = e.key;

      if (key === 'ArrowDown') {
        e.preventDefault();
        if (!box._open) openList();
        if (!items.length) return;
        box._idx = (box._idx + 1) % items.length;
        paintActive();
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        if (!box._open) openList();
        if (!items.length) return;
        box._idx = (box._idx <= 0 ? items.length - 1 : box._idx - 1);
        paintActive();
      } else if (key === 'Enter') {
        if (box._open && box._idx >= 0 && items[box._idx]) {
          e.preventDefault();
          chooseItem(items[box._idx]);
        }
      } else if (key === 'Escape') {
        if (box._open) {
          e.preventDefault();
          closeList();
        }
      }
    });

    // on blur, if typed text matches item exactly => bind value
    input.addEventListener('blur', () => {
      // delay so click on dropdown row still works
      setTimeout(() => {
        const typed = String(input.value || '').trim().toLowerCase();
        const exact = (box._items || []).find(it =>
          it.label.toLowerCase() === typed || it.value.toLowerCase() === typed
        );

        if (exact) {
          box._selectedValue = exact.value;
          input.value = exact.label;
        }
        closeList();
      }, 120);
    });

    // click outside close
    document.addEventListener('mousedown', (ev) => {
      if (!box.contains(ev.target)) closeList();
    });

    // initial loading
    getHWeaponPictures()
      .then(items => {
        fillPictureSelect(box, items, currentRel);
        input.placeholder = 'Select local image…';
      })
      .catch(() => {
        fillPictureSelect(box, [], currentRel);
        input.placeholder = 'No local images found';
      });

    return box;
  }

  // --------------------------
  // AUTO-MATCH IMAGE BY NAME (NEW)
  // --------------------------
  function nameToImageKey(name) {
    return String(name || '')
      .trim()
      .replace(/[']/g, '')      // remove apostrophes
      .replace(/\s+/g, '_')     // spaces -> underscore
      .replace(/__+/g, '_')
      .toLowerCase();
  }

  function relToImageKey(rel) {
    const s = String(rel || '').trim();
    if (!s) return '';

    // take filename only
    const file = s.split('/').pop() || s;

    // remove extension
    const base = file.replace(/\.[a-z0-9]+$/i, '');

    return base.toLowerCase();
  }

  function makeNameVariantsForImageMatch(name) {
    const raw = String(name || '').trim();
    if (!raw) return [];

    const variants = new Set();

    // original
    variants.add(raw);

    // no apostrophes
    variants.add(raw.replace(/[']/g, ''));
    variants.add(raw.replace(/[’]/g, ''));
    variants.add(raw.replace(/[’']/g, ''));

    // normalize dashes (many files use - or _)
    const dashNorm = raw.replace(/[‐-‒–—]/g, '-');
    variants.add(dashNorm);
    variants.add(dashNorm.replace(/[’']/g, ''));

    // remove punctuation except spaces/hyphen
    variants.add(raw.replace(/[^\w\s-]/g, ''));
    variants.add(raw.replace(/[^\w\s-]/g, '').replace(/[’']/g, ''));

    // spaces around hyphens normalized
    variants.add(raw.replace(/\s*-\s*/g, '-'));
    variants.add(raw.replace(/\s*-\s*/g, '-').replace(/[’']/g, ''));

    return Array.from(variants)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function findBestHWeaponPictureRelByName(name, items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';

    const variants = makeNameVariantsForImageMatch(name);
    if (!variants.length) return '';

    const targets = variants.map(v => nameToImageKey(v)).filter(Boolean);

    // candidate map with metadata (for scoring)
    const candidates = list.map(it => {
      const rel = String(it?.rel || '').trim();
      const file = rel.split('/').pop() || '';
      const baseNoExt = file.replace(/\.[a-z0-9]+$/i, '');
      const key = relToImageKey(rel);

      return { rel, file, baseNoExt, key };
    }).filter(c => c.rel);

    // 1) exact key match
    for (const t of targets) {
      const exact = candidates.find(c => c.key === t);
      if (exact) return exact.rel;
    }

    // 2) exact filename (case-insensitive, no ext)
    for (const t of targets) {
      const exactFile = candidates.find(c => c.baseNoExt.toLowerCase() === t);
      if (exactFile) return exactFile.rel;
    }

    // 3) startsWith (e.g. Night-cleaving_Flash_skin1)
    for (const t of targets) {
      const pref = candidates.find(c => c.key.startsWith(t));
      if (pref) return pref.rel;
    }

    // 4) contains all tokens (good fallback)
    for (const t of targets) {
      const toks = t.split(/[_-]+/).filter(Boolean);
      if (!toks.length) continue;

      const hit = candidates.find(c => toks.every(tok => c.key.includes(tok)));
      if (hit) return hit.rel;
    }

    return '';
  }

  async function tryAutoSelectHWeaponImageByName(name, selectEl) {
    if (!selectEl) return false;

    // if already manually selected, do nothing
    if (String(selectEl.value || '').trim()) return true;

    try {
      const items = await getHWeaponPictures();
      const rel = findBestHWeaponPictureRelByName(name, items);
      if (rel) {
        selectEl.value = rel; // select uses raw rel like "Skins/Foo.webp"
        return true;
      }
    } catch (e) {
      console.warn('Auto image match failed:', e);
    }

    return false;
  }

  async function autoFillHWeaponImageIfMissing(name, pickerEl) {
    if (!pickerEl) return false;

    // only when missing
    if (String(pickerEl.value || '').trim()) return false;

    try {
      const items = await getHWeaponPictures();
      const rel = findBestHWeaponPictureRelByName(name, items);
      if (!rel) return false;

      pickerEl.value = rel; // updates visible label via combobox setter
      return true;
    } catch (e) {
      console.warn('autoFillHWeaponImageIfMissing failed:', e);
      return false;
    }
  }

  async function autoMatchMissingHunterWeaponImagesBatch() {
    const weapons = Array.isArray(STATE.data.weapons) ? STATE.data.weapons : [];
    if (!weapons.length) return { checked: 0, matched: 0, updated: 0, skipped: 0, failed: 0 };

    const picItems = await getHWeaponPictures();

    let checked = 0;
    let matched = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const w of weapons) {
      const name = String(w?.name || '').trim();
      if (!name) { skipped++; continue; }

      const currentRel = normalizeHWeaponRel(w?.image_build || w?.image || '');
      if (currentRel) { skipped++; continue; } // already has image -> skip

      checked++;

      const rel = findBestHWeaponPictureRelByName(name, picItems);
      if (!rel) continue;

      matched++;

      const image = normalizeHWeaponRel(rel); // -> HWeapon/<rel>

      const rarity = String(w.rarity || 'SSR').toUpperCase();
      const element = String(w.element || 'None');
      const maxGrowth = clampInt((w.maxGrowth ?? ADV_MAX), 1, ADV_MAX);
      const owner = String(w.hunter || '').trim() || 'HUNTERS';

      try {
        const out = await fetchJson(url('/api/admin/weapons'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dataset: 'hunterWeapons',
            action: 'update',
            originalName: w.name,
            item: {
              name: w.name,
              image,
              image_build: image,
              rarity,
              element,
              maxGrowth,
              owner
            }
          })
        });

        if (out.ok) updated++;
        else {
          failed++;
          console.warn('Auto-match update failed for', w.name, out?.data || out);
        }
      } catch (e) {
        failed++;
        console.warn('Auto-match exception for', w.name, e);
      }
    }

    return { checked, matched, updated, skipped, failed };
  }

  // --------------------------
  // Modal helper (local) — same feel as Hunters
  // --------------------------
  function ensureHunterWeaponsModal() {
    if (document.getElementById('hw2-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'hw2-modal-css';
    s.textContent = `
      .hw2m-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
      .hw2m-modal{width:min(760px,92vw);border-radius:1rem;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.92);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .hw2m-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:900;letter-spacing:.2px}
      .hw2m-bd{padding:16px;max-height:65vh;overflow:auto}
      .hw2m-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:.5rem;justify-content:flex-end}
      .hw2m-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:#e2e8f0;cursor:pointer;font-weight:900}
      .hw2m-btn.primary{background:rgba(255,255,255,.95);color:#0f172a;border-color:rgba(226,232,240,.85)}
      .hw2m-btn.ghost{background:transparent}
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'hw2-modal-root';
    root.className = 'hw2m-backdrop';
    root.innerHTML = `
      <div class="hw2m-modal">
        <div class="hw2m-hd" id="hw2mTitle"></div>
        <div class="hw2m-bd" id="hw2mBody"></div>
        <div class="hw2m-ft">
          <button class="hw2m-btn ghost" id="hw2mClose" type="button">CLOSE</button>
          <button class="hw2m-btn primary" id="hw2mPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('hw2mBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('hw2mPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary, primaryText) {
      const t = document.getElementById('hw2mTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('hw2mBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('hw2mPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('hw2mClose');
      if (close) close.onclick = hide;
    }

    root.addEventListener('click', (e) => { if (e.target === root) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__hw2_hideModal = hide;
    window.__hw2_showModal = show;
  }

  function hw2ShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureHunterWeaponsModal();
    window.__hw2_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function hw2HideModal() {
    try { window.__hw2_hideModal?.(); } catch {}
  }

  function hw2Confirm(title, message, confirmText = 'CONFIRM', cancelText = 'CANCEL') {
    return new Promise((resolve) => {
      const wrap = el('div', { class: 'grid gap-3' },
        el('div', { class: 'text-sm text-slate-200/95 whitespace-pre-line' }, message),
        el('div', { class: 'flex justify-end gap-2 pt-2' },
          (() => {
            const btnCancel = el('button', {
              type: 'button',
              class: 'h-10 px-3 rounded-xl border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700 font-extrabold'
            }, cancelText);

            btnCancel.addEventListener('click', () => {
              hw2HideModal();
              resolve(false);
            });

            return btnCancel;
          })(),
          (() => {
            const btnOk = el('button', {
              type: 'button',
              class: 'h-10 px-3 rounded-xl border bg-white text-yellow-400 hover:bg-slate-100 font-extrabold'
            }, confirmText);

            btnOk.addEventListener('click', () => {
              hw2HideModal();
              resolve(true);
            });

            return btnOk;
          })()
        )
      );

      hw2ShowModal(title, () => wrap);
    });
  }

  // --------------------------
  // Admin helpers (hide Admin tab like Admin.js)
  // --------------------------
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  function isAdminUser() {
    return !!(window.STATE && window.STATE.isAdmin);
  }

  function getHideAdminButtons() {
    try { return localStorage.getItem(LS_HIDE_ADMIN_KEY) === '1'; } catch { return false; }
  }

  function isAdminTabVisible() {
    return isAdminUser() && !STATE.ui.hideAdminButtons;
  }

  window.addEventListener('sla:admin-hide-changed', (e) => {
    try {
      const hide = !!e?.detail?.hide;
      STATE.ui.hideAdminButtons = hide;

      if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
        setSubtab('builds');
      }
      render();
    } catch {}
  });

  // --------------------------
  // Global order (ALL users)
  // --------------------------
  async function loadGlobalOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=hunterWeapons'), { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch {
      return [];
    }
  }

  async function saveGlobalOrder(order) {
    const out = await fetchJson(url('/api/global/order'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataset: 'hunterWeapons', order: Array.isArray(order) ? order : [] })
    });
    if (!out.ok) throw new Error(out?.data?.error || `HTTP ${out.status}`);
    return true;
  }

  function applyOrder(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name || '').trim(), idx));

    const copy = [...(list || [])];
    copy.sort((a, b) => {
      const an = String(a?.name || '').trim();
      const bn = String(b?.name || '').trim();

      const ia = map.has(an) ? map.get(an) : 1e9;
      const ib = map.has(bn) ? map.get(bn) : 1e9;
      if (ia !== ib) return ia - ib;
      return an.localeCompare(bn);
    });
    return copy;
  }

  // --------------------------
  // Icons
  // --------------------------
  const ICONS = {
    element: {
      fire:  url('/picture/Element/Fires.png'),
      water: url('/picture/Element/Waters.png'),
      wind:  url('/picture/Element/Winds.png'),
      light: url('/picture/Element/Lights.png'),
      dark:  url('/picture/Element/Darkness.png'),
      none:  url('/picture/Element/NONE.png')
    },
    rarity: {
      SSR: url('/picture/Rarity/SSR.png'),
      SR:  url('/picture/Rarity/SR.png'),
      R:   url('/picture/Rarity/R.png')
    },
    role: {
      Striker: url('/picture/Type/Striker.png'),
      Breaker: url('/picture/Type/Breaker.png'),
      Supporter: url('/picture/Type/Supporter.png'),
      'Elemental Stacker': url('/picture/Type/Stacker.png')
    }
  };

  function normElement(e) {
    const raw = String(e ?? '').trim().toLowerCase();
    const alias = { non: 'none', neutral: 'none', 'no element': 'none' };
    return alias[raw] ?? raw;
  }

  function normRole(r) {
    const raw = String(r ?? '').trim().toLowerCase();
    const alias = {
      striker: 'Striker',
      breaker: 'Breaker',
      supporter: 'Supporter',
      support: 'Supporter',
      'elemental stacker': 'Elemental Stacker',
      stacker: 'Elemental Stacker'
    };
    return alias[raw] || String(r || '').trim();
  }

  // --------------------------
  // Advancement (EXACT like Hunter.js / SungWeapons.js)
  // --------------------------
  const ADV_MAX = 11;

  function advToDisplay(advIndex) {
    const a = clampInt(advIndex, 0, ADV_MAX);

    if (a === 0) return { type: 'dontown', text: "Don't own" };
    if (a === 1) return { type: 'stars', text: "✧✧✧✧✧" };

    if (a >= 2 && a <= 5) {
      const filled = "✦".repeat(a - 1); // 2->1 .. 5->4
      const empty  = "✧".repeat(6 - a); // 2->4 .. 5->1
      return { type: 'stars', text: `${filled}${empty}` };
    }

    if (a === 6) return { type: 'stars', text: "✦✦✦✦✦" };

    // 7..11 => 1..5
    return { type: 'stars', text: `✦✦✦✦✦${a - 6}` };
  }

  function advInternalToMenuValue(advIndex) {
    const a = clampInt(advIndex, 0, ADV_MAX);
    return a <= 0 ? 'dontown' : String(a - 1);
  }

  function advMenuValueToInternal(v, maxInternal = ADV_MAX) {
    if (String(v || '') === 'dontown') return 0;
    return clampInt(Number(v) + 1, 1, Math.max(1, maxInternal));
  }

  function makeAdvancementSelect(currentAdv, maxInternal, onChange) {
    const sel = el('select', { class: 'hunter-edit-select' });
    sel.append(el('option', { value: 'dontown' }, 'Do not own'));
    const top = Math.max(0, clampInt(maxInternal, 1, ADV_MAX) - 1);
    for (let i = 0; i <= top; i++) sel.append(el('option', { value: String(i) }, String(i)));
    sel.value = advInternalToMenuValue(clampInt(currentAdv, 0, Math.max(1, maxInternal)));
    sel.addEventListener('change', () => onChange?.(advMenuValueToInternal(sel.value, maxInternal)));
    return sel;
  }

  // per-weapon max advancement (stored in maxGrowth fields for compatibility)
  function getWeaponMaxAdv(w) {
    const mg = (w && (w.maxGrowth ?? w.max_growth ?? w.maxAdvancement ?? w.max_advancement));
    const n = clampInt(mg ?? ADV_MAX, 0, ADV_MAX);
    return n <= 0 ? ADV_MAX : n;
  }

  // --------------------------
  // Rarity icons
  // --------------------------
  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function rarityFilterIconSrc(r) {
    const R = String(r || '').toUpperCase();

    if (R === 'R') {
      return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#1e3759"/>
              <stop offset="1" stop-color="#0375b3"/>
            </linearGradient>
          </defs>
          <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#93c5fd" stroke-width="2"/>
          <text x="32" y="40" font-size="22" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">R</text>
        </svg>
      `.trim());
    }

    if (R === 'SR') {
      return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#6d28d9"/>
              <stop offset="1" stop-color="#a855f7"/>
            </linearGradient>
          </defs>
          <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#d8b4fe" stroke-width="2"/>
          <text x="32" y="40" font-size="22" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SR</text>
        </svg>
      `.trim());
    }

    return svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#b91c1c"/>
            <stop offset="1" stop-color="#ef4444"/>
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" stroke="#fecaca" stroke-width="2"/>
        <text x="32" y="40" font-size="20" font-family="Arial" font-weight="900" text-anchor="middle" fill="#ffffff">SSR</text>
      </svg>
    `.trim());
  }

  function rarityWeaponIconSrc(r) {
    const R = String(r || 'SSR').toUpperCase();
    return ICONS.rarity[R] || ICONS.rarity.SSR;
  }

  function buildsRarityClass(rarity) {
    const r = String(rarity || 'SSR').toUpperCase();
    if (r === 'SSR') return 'rar-SSR';
    if (r === 'SR') return 'rar-SR';
    if (r === 'R') return 'rar-R';
    return 'rar-SSR';
  }

  // --------------------------
  // CSS scoping (Hunter Weapons only)
  // --------------------------
  const HW_SCOPE = '#content [data-sla-page="hunter-weapons"]';

  function scopeCss(css, scope) {
    const scopeChunk = (chunk) =>
      chunk.replace(/(^|})\s*([^{@}][^{]*)\{/g, (m, brace, selectorPart) => {
        const selectors = selectorPart
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(sel => {
            if (sel.includes('[data-sla-page="hunter-weapons"]')) return sel;

            if (/#content\b/.test(sel)) {
              return sel.replace(/(^|[\s>+~,(])#content\b/g, `$1${scope}`);
            }

            return `${scope} ${sel}`;
          })
          .join(', ');

        return `${brace} ${selectors} {`;
      });

    let out = '';
    let i = 0;

    while (i < css.length) {
      const rest = css.slice(i);
      const m = rest.match(/@media[^{]*\{/);
      if (!m) {
        out += scopeChunk(rest);
        break;
      }

      const start = i + m.index;
      out += scopeChunk(css.slice(i, start));

      const openBraceIdx = start + m[0].length - 1; // '{'
      let depth = 0;
      let j = openBraceIdx;

      for (; j < css.length; j++) {
        const ch = css[j];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { j++; break; }
        }
      }

      const mediaBlock = css.slice(start, j);
      const headEnd = mediaBlock.indexOf('{') + 1;
      const inner = mediaBlock.slice(headEnd, -1);

      out += mediaBlock.slice(0, headEnd) + scopeChunk(inner) + '}';
      i = j;
    }

    return out;
  }

  function injectLocalStyles() {
    if (document.getElementById('hunter-weapons2-module-style')) return;

    const s = document.createElement('style');
    s.id = 'hunter-weapons2-module-style';
    const rawCss = `
      [data-sla-page="hunter-weapons"],[data-sla-page="hunter-weapons"] *{box-sizing:border-box}
      [data-sla-page="hunter-weapons"]{overflow-x:hidden}

      /* Grid */
      .sw-grid{
        display:grid;
        gap:12px;
        grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
      }

      /* Builds card */
      .sw-card{
        position:relative;
        border-radius:16px;
        overflow:hidden;
        border:1px solid rgba(100,116,139,.35);
        box-shadow: 0 6px 16px rgba(0,0,0,.12);
        aspect-ratio: 3 / 4;
        cursor:pointer;
        transition: transform .12s ease, box-shadow .12s ease, opacity .2s ease;
        outline:none;
      }
      .sw-card:hover{
        transform: translateY(-2px);
        box-shadow: 0 10px 22px rgba(0,0,0,.18);
      }
      .sw-card:active{
        transform: translateY(0px) scale(0.99);
      }
      .sw-card:focus-visible{
        box-shadow: 0 0 0 3px rgba(255,255,255,.35), 0 0 0 6px rgba(59,130,246,.45);
      }
      .dark .sw-card:focus-visible{
        box-shadow: 0 0 0 3px rgba(15,23,42,.65), 0 0 0 6px rgba(59,130,246,.55);
      }

      /* rarity backgrounds */
      .avatar.solo.rar-R   { background: linear-gradient(180deg,#1e3759 0%, #0375b3 53%); }
      .avatar.solo.rar-SR  { background: linear-gradient(180deg,#343659 0%, #8a5fcc 53%); }
      .avatar.solo.rar-SSR { background: linear-gradient(180deg,#3b3550 0%, #a7353a 53%); }

      /* Full image */
      .sw-card .portrait{
        position:absolute;
        inset:0;
        width:100%;
        height:100%;
        object-fit:cover;
      }

      /* Badges */
      .sw-badges{
        position:absolute;
        top:8px;
        left:8px;
        display:flex;
        flex-direction:column;
        gap:6px;
        z-index:2;
      }
      .sw-badges img{
        width:28px;
        height:28px;
        object-fit:contain;
      }

      /* Name bottom overlay */
      .sw-card .name{
        position:absolute;
        left:0; right:0; bottom:0;
        padding:10px 12px;
        text-align:center;
        font-weight:700;
        z-index:2;
        color:#e2e8f0;
        text-shadow: 0 1px 2px rgba(0,0,0,.55);
        background:
          linear-gradient(to top, rgba(2,6,23,.65) 0%, rgba(2,6,23,.35) 60%, rgba(2,6,23,0) 100%);
        backdrop-filter: blur(2px);
      }

      /* --------------------------
         Toolbar (Filters) — same as Hunters
      -------------------------- */
      .hunters-toolbar{
        display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(100,116,139,.35);
        background:rgba(15,23,42,.35);flex-wrap:wrap;max-width:100%;
        box-sizing:border-box;
      }
      .hunters-toolbar .search{
        flex:1 1 320px;
        width:100%;
        max-width:520px;
        min-width:0;
        height:38px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.35);
        outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);
        font-weight:900;
      }
      .icon-row{display:flex;align-items:center;gap:8px}
      .filter-group{
        display:flex;align-items:center;gap:10px;
        padding-left:14px;border-left:1px solid rgba(148,163,184,.18);
        min-width:0;
      }
      .filter-group:first-of-type{padding-left:0;border-left:none}
      .icon-btn{width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);
        display:grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto}
      .icon-btn.is-active{border-color:rgba(251,191,36,.85);box-shadow:0 0 0 3px rgba(251,191,36,.22)}
      .icon-btn img{width:22px;height:22px;object-fit:contain;pointer-events:none}
      .icon-btn.rarity img{width:26px;height:26px}

      .toolbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);
        color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}
      .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);
        border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.92);
        color:#0f172a;font-weight:900;cursor:pointer}

      .edit-btn.is-on{background:rgba(251,191,36,.95);color:#0f172a;border-color:rgba(253,230,138,.85);box-shadow:0 0 0 3px rgba(251,191,36,.12)}
      .filters-btn{
        height:38px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.35);
        background:rgba(15,23,42,.55);
        color:#e2e8f0;
        font-weight:900;
        cursor:pointer;
        display:none;
        align-items:center;
        justify-content:center;
        gap:8px;
        margin-bottom:14px;
        width:100%;
      }

      .hweapon-filter-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9998;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);padding:14px}
      .hweapon-filter-modal{width:calc(100vw - 28px);max-width:420px;max-height:80vh;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.94);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column}
      .hweapon-filter-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:1000;color:#facc15}
      .hweapon-filter-bd{padding:16px;overflow:auto;display:grid;gap:14px}
      .hweapon-filter-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .hweapon-filter-search{width:100%;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}
      .hweapon-filter-icons{display:flex;align-items:center;gap:8px;flex-wrap:wrap;overflow-x:hidden}
      .hweapon-filter-icons .icon-btn{width:36px;height:36px;border-radius:10px}
      .hweapon-filter-icons .icon-btn img{width:24px;height:24px}

      /* tooltip on top */
      .tip{ position:relative; z-index:auto; }
      .tip:hover{ z-index:auto; }
      .tip:hover::after{
        content:attr(data-tip);
        position:absolute;
        left:50%;
        bottom:calc(100% + 8px);
        transform:translateX(-50%);
        white-space:nowrap;
        background:rgba(15,23,42,.92);
        border:1px solid rgba(148,163,184,.25);
        color:#e2e8f0;
        font-weight:900;
        padding:6px 10px;
        border-radius:10px;
        font-size:12px;
        box-shadow:0 10px 26px rgba(0,0,0,.28);
        pointer-events:none;
        z-index:50;
      }
      .tip:hover::before{
        content:'';
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        bottom:calc(100% + 2px);
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:6px solid rgba(15,23,42,.92);
        pointer-events:none;
        z-index:50;
      }

      /* Toolbar mobile */
      @media (max-width: 834px){
        .hunters-toolbar{display:none}
        .filters-btn{display:flex;width:100%}
        .filter-group{padding-left:0;border-left:none}
        .icon-row{flex-wrap:wrap;overflow-x:hidden;padding-bottom:0}
        .icon-btn{width:30px;height:30px;border-radius:10px}
        .icon-btn img{width:20px;height:20px}
        .icon-btn.rarity img{width:24px;height:24px}
      }

      /* --------------------------
         Card-style My list (HW2)
      -------------------------- */
      .hunters-cards-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));width:100%}
      .hunter-progress-card{
        position:relative;
        border-radius:18px;
        border:1px solid rgba(148,163,184,.26);
        background:linear-gradient(180deg,rgba(51,65,85,.45) 0%, rgba(15,23,42,.78) 100%);
        box-shadow:0 12px 28px rgba(0,0,0,.18);
        padding:16px;
        overflow:visible;
      }
      .hunter-progress-card.rar-R{background:linear-gradient(0deg,rgba(30,55,89,.42) 0%, rgba(3,117,179,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card.rar-SR{background:linear-gradient(0deg,rgba(52,54,89,.44) 0%, rgba(138,95,204,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card.rar-SSR{background:linear-gradient(0deg,rgba(59,53,80,.46) 0%, rgba(167,53,58,.18) 100%), rgba(15,23,42,.88)}
      .hunter-progress-card::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
      .hunter-progress-head,.hunter-progress-owner-head{display:flex;gap:14px;align-items:center}
      .hunter-progress-avatar,.hunter-progress-owner-thumb{
        width:72px;height:72px;border-radius:18px;overflow:hidden;display:grid;place-items:center;
        background:rgba(15,23,42,.52);border:1px solid rgba(148,163,184,.22);flex:0 0 auto
      }
      .hunter-progress-avatar img,.hunter-progress-owner-thumb img{width:100%;height:100%;object-fit:cover}
      .hunter-progress-meta,.hunter-progress-owner-meta{min-width:0;display:grid;gap:8px}
      .hunter-progress-name,.hunter-progress-owner-name{font-size:18px;font-weight:900;color:#e2e8f0;line-height:1.15}
      .hunter-progress-owner-name{font-size:16px}
      .hunter-progress-badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .hunter-progress-badge{
        height:36px;min-width:36px;padding:0 13px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;
        border:1px solid rgba(148,163,184,.22);background:rgba(255,255,255,.04);color:#f8d574;font-weight:900;font-size:13px
      }
      .hunter-progress-badge.icon{padding:0;width:41px}
      .hunter-progress-badge.icon img{width:31px;height:31px;object-fit:contain}
      .hunter-progress-badge.rarity-icon{padding:0;width:54px;background:transparent;border:0}
      .hunter-progress-badge.rarity-icon img{width:50px;height:32px;object-fit:contain}
      .hunter-progress-stats,.hunter-progress-owner-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .hunter-progress-stat{
        min-width:0;border-radius:14px;border:1px solid rgba(148,163,184,.18);
        background:rgba(255,255,255,.04);padding:12px;display:grid;gap:10px;overflow:visible
      }
      .hunter-progress-stat-full{grid-column:1 / -1}
      .hunter-progress-stat-label{font-size:12px;font-weight:900;color:rgba(226,232,240,.72);text-transform:uppercase;text-align:center;display:flex;align-items:center;justify-content:center}
      .hunter-progress-stat-value{font-size:20px;font-weight:900;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;display:flex;justify-content:center;align-items:center}
      .hunter-progress-stat-value.dontown{font-size:14px}
      .hunter-progress-level-chip{
        min-width:68px;height:46px;padding:0 14px;border-radius:11px;background:linear-gradient(180deg,#8b97a6 0%, #6c7788 100%);
        color:#f8fafc;font-size:22px;font-weight:1000;display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)
      }
      .hunter-progress-level-input,.hunter-edit-select{
        width:min(180px,100%);height:42px;border-radius:12px;border:1px solid rgba(148,163,184,.24);background:rgba(15,23,42,.72);
        color:#e2e8f0;font-weight:900;font-size:20px;text-align:center;outline:none;padding:0 12px
      }
      .hunter-edit-select{font-size:18px;padding-right:30px}
      .hunter-progress-owner-card{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16);overflow:visible}
      .hunter-progress-owner-empty{margin-top:16px;padding-top:16px;border-top:1px solid rgba(148,163,184,.16);color:rgba(226,232,240,.62);font-weight:800;text-align:center}
      .hunter-progress-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(148,163,184,.16)}
      .hunter-progress-btn{height:40px;border:0;border-radius:8px;font-weight:900;cursor:pointer;color:#0f172a}
      .hunter-progress-btn.view{background:#22d3ee}
      .hunter-progress-btn.edit{background:#2563eb;color:#eff6ff}
      .hunter-progress-bulk-card{border-color:rgba(168,85,247,.35);box-shadow:0 0 0 1px rgba(168,85,247,.10), 0 12px 28px rgba(0,0,0,.18);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%, rgba(15,23,42,.82) 100%)}
      .hunter-progress-all-badge{white-space:pre-line;text-align:center}
      .hunter-progress-bulk-sub{font-size:13px;font-weight:700;color:rgba(226,232,240,.68)}

      @media (max-width: 900px){
        .hunters-cards-grid{grid-template-columns:1fr}
      }
      @media (max-width: 520px){
        .hunter-progress-card{padding:14px}
        .hunter-progress-avatar,.hunter-progress-owner-thumb{width:64px;height:64px;border-radius:16px}
        .hunter-progress-name{font-size:17px}
        .hunter-progress-stats,.hunter-progress-owner-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
        .hunter-progress-level-chip{font-size:24px;min-width:58px}
        .hunter-progress-stat-full{grid-column:1 / -1}
        .hunter-progress-btn{height:42px}
      }

      .admin-card{background:rgba(2,6,23,.20);border:1px solid rgba(148,163,184,.25);border-radius:18px;padding:14px}
      .admin-title{font-size:18px;font-weight:900;color:#e2e8f0}
      .admin-sub{font-size:13px;color:rgba(148,163,184,.95);font-weight:700}
      .admin-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;min-width:0}
      .admin-in{
        height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);
        color:#e2e8f0;outline:none;font-weight:900;min-width:0;
      }
      .admin-btn{height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.55);
        color:#e2e8f0;font-weight:900;cursor:pointer}
      .admin-btn.primary{background:rgba(255,255,255,.92);color:#0f172a}
      .admin-grid{display:grid;gap:10px}
      @media (max-width:640px){
        .hweapon-admin-add-row{display:grid !important;grid-template-columns:1fr !important;width:100%}
        .hweapon-admin-add-row > *, .hweapon-admin-add-row input, .hweapon-admin-add-row select, .hweapon-admin-add-row button{
          width:100% !important;min-width:0 !important;max-width:100% !important;box-sizing:border-box !important;
        }
        .hweapon-pic-select{min-width:0 !important;width:100% !important;max-width:100% !important;box-sizing:border-box !important}
        .hweapon-pic-select > input{width:100% !important;max-width:100% !important;box-sizing:border-box !important}
        .hweapon-pic-select > div[style*="position:absolute"]{left:0 !important;right:0 !important;width:100% !important;max-width:100% !important;overflow-x:hidden !important;box-sizing:border-box !important}
        .hweapon-pic-select > div[style*="position:absolute"] .truncate{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      }
    `;
    const css = scopeCss(rawCss, HW_SCOPE);
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --------------------------
  // Toggle helpers
  // --------------------------
  function toggleInArray(arr, val) {
    const a = Array.isArray(arr) ? arr : [];
    const v = String(val);
    const idx = a.indexOf(v);
    if (idx >= 0) return a.filter((x) => x !== v);
    return [...a, v];
  }

  function hasInArray(arr, val) {
    return Array.isArray(arr) && arr.includes(String(val));
  }

  // --------------------------
  // Dropdown config (public/admin) — like Hunter.js
  // --------------------------
  const LS_SUBTAB = 'hunterWeapons.ui.subtab';

  const DEFAULT_CFG = {
    levelMax: 100
  };

  async function loadHunterWeaponsDropdowns() {
    try {
      const r = await fetch(url('/api/public/hunter-weapons-dropdowns'), { cache: 'no-store' });
      if (!r.ok) return { ...DEFAULT_CFG };

      const j = await r.json().catch(() => ({}));
      const levelMax = clampInt(j?.levelMax ?? DEFAULT_CFG.levelMax, 1, 999);

      return { levelMax };
    } catch {
      return { ...DEFAULT_CFG };
    }
  }

  // --------------------------
  // Per-user progress helpers (My list)
  // --------------------------
  function normKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replaceAll('’', "'")
      .replace(/\s+/g, ' ');
  }

  function normalizeEntry(v) {
    if (v === true) return { adv: 1, lvl: 1 };

    const o = (v && typeof v === 'object') ? v : {};

    const advRaw = (o.adv ?? o.advancement ?? o.growth ?? o.Growth ?? 0);
    const adv = clampInt(advRaw, 0, ADV_MAX);

    const lvRaw = (o.lvl ?? o.level ?? o.lv ?? 1);
    const lvl = clampInt(lvRaw, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

    return { adv, lvl };
  }

  function getMyEntry(name) {
    const obj = STATE.collection.progress || {};
    if (obj[name]) return normalizeEntry(obj[name]);

    const target = normKey(name);
    for (const [k, v] of Object.entries(obj)) {
      if (normKey(k) === target) return normalizeEntry(v);
    }
    return { adv: 0, lvl: 1 };
  }

  function setMyEntry(name, patch) {
    const obj = STATE.collection.progress || (STATE.collection.progress = {});
    const cur = getMyEntry(name);
    const next = { ...cur, ...(patch || {}) };

    next.adv = clampInt(next.adv, 0, ADV_MAX);
    next.lvl = clampInt(next.lvl, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

    obj[name] = next;
    STATE.collection.dirty = true;
  }

  function isOwned(name) {
    const e = getMyEntry(name);
    return clampInt(e?.adv, 0, ADV_MAX) >= 1;
  }

  function getTotalUnique() {
    return new Set((STATE.data.weapons || []).map(w => String(w?.name || '').trim()).filter(Boolean)).size;
  }

  function getOwnedCountAll() {
    const unique = new Set((STATE.data.weapons || []).map(w => String(w?.name || '').trim()).filter(Boolean));
    let owned = 0;
    for (const name of unique) {
      if (isOwned(name)) owned++;
    }
    return owned;
  }

  const USER_PROGRESS_SYNC_EVENT = 'slahub:user-progress-sync';

  function emitUserProgressSync(detail = {}) {
    try {
      window.dispatchEvent(new CustomEvent(USER_PROGRESS_SYNC_EVENT, { detail }));
    } catch (e) {
      console.warn('emitUserProgressSync failed:', e);
    }
  }

  async function loadMyHunterWeaponsProgress() {
    if (STATE.collection.loaded || STATE.collection.loading) return;

    const me = window.STATE?.me || null;
    if (!me) {
      STATE.session.loggedIn = false;
      STATE.collection.progress = {};
      STATE.collection.loaded = true;
      return;
    }

    STATE.collection.loading = true;
    try {
      const r = await fetch(url('/api/data'), { credentials: 'include', cache: 'no-store' });

      if (r.status === 401 || r.status === 403) {
        STATE.session.loggedIn = false;
        STATE.collection.progress = {};
        STATE.collection.loaded = true;
        return;
      }
      STATE.session.loggedIn = true;

      if (!r.ok) {
        STATE.collection.progress = {};
        STATE.collection.loaded = true;
        return;
      }

      const j = await r.json().catch(() => ({}));
      const src = (j && typeof j.hunterWeapons === 'object' && j.hunterWeapons) ? j.hunterWeapons : {};
      STATE.collection.progress = { ...src };
      STATE.collection.loaded = true;
    } catch (e) {
      console.error('loadMyHunterWeaponsProgress failed:', e);
      STATE.collection.progress = {};
      STATE.collection.loaded = true;
    } finally {
      STATE.collection.loading = false;
    }
  }

  function buildSavePayload() {
    const out = {};
    const p = STATE.collection.progress || {};
    for (const [name, v] of Object.entries(p)) {
      const e = normalizeEntry(v);
      const adv = clampInt(e?.adv, 0, ADV_MAX);
      if (adv <= 0) continue;

      const lvl = clampInt(e?.lvl, 1, (STATE.cfg?.levelMax ?? DEFAULT_CFG.levelMax));

      out[name] = {
        adv,
        growth: adv,
        lvl
      };
    }
    return out;
  }

  async function saveMyHunterWeaponsProgress() {
    if (!STATE.session.loggedIn) return false;
    if (STATE.collection.saving) return false;
    if (!STATE.collection.dirty) return true;

    STATE.collection.saving = true;
    try {
      const payload = { hunterWeapons: buildSavePayload() };

      const r = await fetch(url('/api/data'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(out.error || 'Save failed');
        return false;
      }

      STATE.collection.dirty = false;
      emitUserProgressSync({ source: 'HunterWeapons', type: 'hunterWeapons' });
      toast('Saved ✅');
      return true;
    } catch (e) {
      console.error('saveMyHunterWeaponsProgress failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  // --------------------------
  // State
  // --------------------------
  const STATE = {
    subtab: (localStorage.getItem(LS_SUBTAB) || 'builds'),
    filters: {
      name: '',
      rarities: [],
      elements: []
    },
    data: {
      weapons: [],
      hunters: [], // ✅ used for Admin hunter dropdown
      huntersMeta: []
    },

    cfg: { ...DEFAULT_CFG },

    session: { loggedIn: true },

    collection: {
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      progress: {}
    },

    bulk: { adv: 0, lvl: 1 },

    ui: {
      hideAdminButtons: getHideAdminButtons(),
      editMode: false
    },

    globalOrder: [],

    loading: false,
    error: null
  };

  function setSubtab(v) {
    STATE.subtab = v;
    try { localStorage.setItem(LS_SUBTAB, v); } catch {}
  }

  function resetFilters() {
    STATE.filters.name = '';
    STATE.filters.rarities = [];
    STATE.filters.elements = [];
  }

  // --------------------------
  // Data loading
  // --------------------------
  async function fetchJsonTry(paths) {
    let lastErr = null;
    for (const p of paths) {
      try {
        const r = await fetch(url(p), { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('No data');
  }

  async function loadHuntersCatalog() {
    try {
      const j = await fetchJsonTry([
        '/api/public/hunters'
      ]);

      const arr = Array.isArray(j)
        ? j
        : (Array.isArray(j?.items) ? j.items : (Array.isArray(j?.hunters) ? j.hunters : []));
      const items = [];
      const names = [];
      const seen = new Set();

      for (const h of (arr || [])) {
        const nm = String(h?.name ?? h?.hunter_name ?? h?.hunterName ?? h?.id ?? '').trim();
        if (!nm) continue;
        const key = normKey(nm);
        if (seen.has(key)) continue;
        seen.add(key);

        const item = {
          name: nm,
          rarity: String(h?.rarity || 'SSR').toUpperCase(),
          element: String(h?.element || 'None'),
          role: String(h?.role || ''),
          image: String(h?.image || '').trim(),
          image_build: String(h?.image_build || '').trim()
        };

        items.push(item);
        names.push(nm);
      }

      names.sort((a, b) => a.localeCompare(b));
      STATE.data.hunters = names;
      STATE.data.huntersMeta = items;
    } catch {
      STATE.data.hunters = [];
      STATE.data.huntersMeta = [];
    }
  }

  async function loadWeapons() {
    STATE.loading = true;
    STATE.error = null;

    try {
      const j = await fetchJsonTry([
        '/api/public/hunter-weapons'
      ]);

      const arr = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
      if (!Array.isArray(arr)) throw new Error('Invalid hunter weapons catalog');

      STATE.data.weapons = arr.map((w) => {
        const name = w.name || w.weapon_name || w.id || 'Unknown Weapon';
        const rarity = (w.rarity || 'SSR');
        const element = (w.element || 'None');

        // ✅ NO LINKS: normalize to "HWeapon/<rel>" OR ""
        const imageRaw = w.image || w.imageUrl || w.img || '';
        const imageBuildRaw = w.image_build || w.imageBuild || imageRaw;

        const image = normalizeHWeaponRel(imageRaw);
        const image_build = normalizeHWeaponRel(imageBuildRaw);

        const hunter = (w.hunter || w.owner || w.hunter_name || '').trim();

        const maxGrowth = clampInt(
          (w.maxGrowth ?? w.max_growth ?? w.maxAdvancement ?? w.max_advancement ?? ADV_MAX),
          1,
          ADV_MAX
        );

        return { name, rarity, element, image, image_build, maxGrowth, hunter };
      });

      const ord = await loadGlobalOrder();
      STATE.globalOrder = ord;
      STATE.data.weapons = applyOrder(STATE.data.weapons, ord);

    } catch (e) {
      console.error('Hunter weapons load failed:', e);
      STATE.error = 'Failed to load Hunter weapons data.';
      STATE.data.weapons = [];
    } finally {
      STATE.loading = false;
    }
  }

  // --------------------------
  // Filtering
  // --------------------------
  function getHunterByName(name) {
    const target = normKey(name);
    return (STATE.data.huntersMeta || []).find((h) => normKey(h?.name || '') === target) || null;
  }

  function filteredWeapons() {
    const f = STATE.filters;

    const rarityFilterActive = f.rarities.length > 0;
    const elementFilterActive = f.elements.length > 0;

    return (STATE.data.weapons || []).filter((w) => {
      if (f.name) {
        const q = String(f.name).trim().toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);

        const hay = `${String(w.name || '')} ${String(w.hunter || '')}`.toLowerCase();

        for (const t of tokens) {
          if (!hay.includes(t)) return false;
        }
      }

      if (rarityFilterActive) {
        const rr = String(w.rarity || 'SSR').toUpperCase();
        if (!f.rarities.includes(rr)) return false;
      }

      if (elementFilterActive) {
        const ee = normElement(w.element);
        if (!f.elements.includes(ee)) return false;
      }

      return true;
    });
  }

  // --------------------------
  // UI pieces
  // --------------------------
  function renderHeader(root) {
    const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

    top.append(
      el('div', { class: 'min-w-0' },
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Hunter Weapons'),
        el('div', { class: 'text-sm text-white' }, 'Builds and your personal list')
      )
    );

    const right = el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' });

    const total = getTotalUnique();
    const owned = getOwnedCountAll();

    const count = el(
      'div',
      { class: 'px-3 py-1 rounded-full border bg-slate-800 border-slate-700 text-sm font-semibold text-white' },
      `${owned}/${total || 0}`
    );

    right.append(count);
    top.append(right);
    root.append(top);
  }

  function subtabBtnClass(active) {
    return [
      'h-10 rounded-xl border text-base font-semibold transition-colors',
      active
        ? 'bg-yellow-400 text-black shadow border-yellow-300'
        : 'bg-glass text-slate-200 hover:bg-slate-800/50 border-slate-700/60'
    ].join(' ');
  }

  function renderSubtabs(root) {
    const tabs = [
      { key: 'builds', label: 'Builds' }
    ];
    if (STATE.session.loggedIn) tabs.push({ key: 'list', label: 'My list' });
    if (isAdminTabVisible()) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length;
    const gridCols = cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: 'grid ' + gridCols + ' gap-2 mb-4' });

    const btn = (key, label) => {
      const active = STATE.subtab === key;
      const b = el(
        'button',
        {
          class: subtabBtnClass(active)
        },
        label
      );

      b.addEventListener('click', async () => {
        if (STATE.subtab === key) return;

        if (STATE.ui.editMode && STATE.subtab === 'list') {
          const ok = await saveMyHunterWeaponsProgress();
          if (!ok) toast('Save failed ❌');
          STATE.ui.editMode = false;
        }

        setSubtab(key);

        if (key === 'list' && STATE.session.loggedIn) {
          await loadMyHunterWeaponsProgress();
        }

        render();
      });

      return b;
    };

    if (STATE.subtab === 'admin' && !isAdminTabVisible()) {
      setSubtab('builds');
    }
    if (STATE.subtab === 'list' && !STATE.session.loggedIn) {
      setSubtab('builds');
    }

    for (const t of tabs) bar.append(btn(t.key, t.label));
    root.append(bar);
  }

  function iconButton({ title, iconSrc, active, className = '', onClick }) {
    const b = el('button', {
      type: 'button',
      class: `icon-btn ${className} ${active ? 'is-active' : ''}`,
      title,
      'aria-label': title
    });
    b.append(el('img', { src: iconSrc, alt: title }));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderFilters(root) {
    const isMobile = false;

    const bar = el('div', { class: 'hunters-toolbar mb-4' });

    const search = el('input', {
      type: 'text',
      value: STATE.filters.name,
      placeholder: 'Search weapon…',
      class: 'search'
    });
    search.addEventListener('input', () => {
      STATE.filters.name = search.value || '';
      renderKeepSearchFocus();
    });

    const makeRarityRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const rarItems = [
        { v: 'R', label: 'R', icon: rarityFilterIconSrc('R') },
        { v: 'SR', label: 'SR', icon: rarityFilterIconSrc('SR') },
        { v: 'SSR', label: 'SSR', icon: rarityFilterIconSrc('SSR') }
      ];

      for (const it of rarItems) {
        row.append(
          iconButton({
            title: it.label,
            iconSrc: it.icon,
            active: hasInArray(STATE.filters.rarities, it.v),
            className: 'rarity',
            onClick: () => {
              STATE.filters.rarities = toggleInArray(STATE.filters.rarities, it.v);
              afterToggle?.();
            }
          })
        );
      }
      return row;
    };

    const makeElementRow = (afterToggle) => {
      const row = el('div', { class: 'icon-row' });
      const elItems = [
        { v: 'fire', label: 'Fire', icon: ICONS.element.fire },
        { v: 'water', label: 'Water', icon: ICONS.element.water },
        { v: 'wind', label: 'Wind', icon: ICONS.element.wind },
        { v: 'light', label: 'Light', icon: ICONS.element.light },
        { v: 'dark', label: 'Dark', icon: ICONS.element.dark },
        { v: 'none', label: 'None', icon: ICONS.element.none }
      ];

      for (const it of elItems) {
        row.append(
          iconButton({
            title: it.label,
            iconSrc: it.icon,
            active: hasInArray(STATE.filters.elements, it.v),
            onClick: () => {
              STATE.filters.elements = toggleInArray(STATE.filters.elements, it.v);
              afterToggle?.();
            }
          })
        );
      }
      return row;
    };

    const right = el('div', { class: 'toolbar-right' });

    if (STATE.session.loggedIn && STATE.subtab === 'list') {
      const btnEdit = el(
        'button',
        {
          type: 'button',
          class: `edit-btn ${STATE.ui.editMode ? 'is-on' : ''}` ,
          title: STATE.ui.editMode ? 'Exit edit (auto-save)' : 'Edit your list'
        },
        STATE.ui.editMode ? 'EXIT EDIT' : 'EDIT'
      );

      btnEdit.addEventListener('click', async () => {
        if (STATE.subtab !== 'list') {
          setSubtab('list');
          await loadMyHunterWeaponsProgress();
          STATE.ui.editMode = true;
          render();
          return;
        }

        if (STATE.ui.editMode) {
          const ok = await saveMyHunterWeaponsProgress();
          if (!ok) toast('Save failed ❌');
          STATE.ui.editMode = false;
          render();
          return;
        }

        STATE.ui.editMode = true;
        render();
      });

      right.append(btnEdit);
    }

    const reset = el(
      'button',
      { type: 'button', class: 'reset-btn', title: 'Reset filters' },
      el('span', { class: 'reset-x' }, '×'),
      'Reset'
    );
    reset.addEventListener('click', () => {
      resetFilters();
      render();
    });

    const openFiltersSheet = () => {
      const rebuild = () => {
        render();
        openFiltersSheet();
      };

      hw2ShowModal('Filters', () => {
        const box = el('div', { class: 'grid gap-4' });

        box.append(
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
          makeRarityRow(rebuild),

          el('div', { class: 'text-sm font-extrabold text-yellow-400/90 mt-2' }, 'Element'),
          makeElementRow(rebuild),

          el(
            'div',
            { class: 'flex gap-2 justify-end mt-2' },
            el(
              'button',
              {
                type: 'button',
                class: 'reset-btn',
                title: 'Reset filters',
                onClick: () => {
                  resetFilters();
                  rebuild();
                }
              },
              el('span', { class: 'reset-x' }, '×'),
              'Reset'
            )
          )
        );

        return box;
      });
    };

    const openMobileFiltersSheet = () => {
      const page = document.querySelector('[data-sla-page="hunter-weapons"]');
      if (!page) return;
      let back = page.querySelector('.hweapon-filter-backdrop');
      if (!back) {
        back = el('div', { class: 'hweapon-filter-backdrop' });
        back.addEventListener('mousedown', (ev) => {
          if (ev.target === back) {
            back.style.display = 'none';
            back.innerHTML = '';
          }
        });
        page.append(back);
      }
      const closeModal = () => {
        back.style.display = 'none';
        back.innerHTML = '';
      };
      const rebuild = () => { render(); openMobileFiltersSheet(); };
      const modalSearch = el('input', { type: 'text', value: STATE.filters.name, placeholder: 'Search weapon...', class: 'hweapon-filter-search' });
      modalSearch.addEventListener('input', () => {
        STATE.filters.name = modalSearch.value || '';
        render();
        openMobileFiltersSheet();
      });

      back.innerHTML = '';
      const resetModal = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' }, el('span', { class: 'reset-x' }, 'x'), 'Reset');
      resetModal.addEventListener('click', () => { resetFilters(); render(); openMobileFiltersSheet(); });
      const close = el('button', { type: 'button', class: 'admin-btn' }, 'Close');
      const apply = el('button', { type: 'button', class: 'admin-btn primary' }, 'Apply');
      close.addEventListener('click', closeModal);
      apply.addEventListener('click', closeModal);
      const modal = el('div', { class: 'hweapon-filter-modal' },
        el('div', { class: 'hweapon-filter-hd' }, 'Filters'),
        el('div', { class: 'hweapon-filter-bd' },
          modalSearch,
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Rarity'),
          el('div', { class: 'hweapon-filter-icons' }, makeRarityRow(rebuild)),
          el('div', { class: 'text-sm font-extrabold text-yellow-400/90' }, 'Element'),
          el('div', { class: 'hweapon-filter-icons' }, makeElementRow(rebuild))
        ),
        el('div', { class: 'hweapon-filter-ft' }, resetModal, close, apply)
      );
      back.append(modal);
      back.style.display = 'flex';
      requestAnimationFrame(() => {
        const input = back.querySelector('.hweapon-filter-search');
        if (input) input.focus({ preventScroll: true });
      });
    };

    if (isMobile) {
      const btnFilters = el('button', { type: 'button', class: 'filters-btn' }, 'Filters');
      btnFilters.addEventListener('click', openFiltersSheet);

      right.append(reset);
      bar.append(search, btnFilters, right);
    } else {
      const g1 = el('div', { class: 'filter-group' }, makeRarityRow(() => render()));
      const g2 = el('div', { class: 'filter-group' }, makeElementRow(() => render()));

      right.append(reset);
      bar.append(search, g1, g2, right);
    }

    const mobileBtnFilters = el('button', { type: 'button', class: 'filters-btn' }, 'Filters');
    mobileBtnFilters.addEventListener('click', openMobileFiltersSheet);
    root.append(mobileBtnFilters);
    root.append(bar);

  }

  // --------------------------
  // Bulk row (Edit all filtered)
  // --------------------------
  function renderBulkRow() {
    const card = el('div', { class: 'hunter-progress-card hunter-progress-bulk-card' });

    const header = el('div', { class: 'hunter-progress-head' });
    const imgWrap = el('div', { class: 'hunter-progress-avatar' },
      el('div', { class: 'ml-all hunter-progress-all-badge' }, 'EDIT\nALL')
    );

    const meta = el('div', { class: 'hunter-progress-meta' },
      el('div', { class: 'hunter-progress-name', title: 'Bulk edit for all filtered weapons' }, 'Edit all'),
      el('div', { class: 'hunter-progress-bulk-sub' }, 'After exiting edit mode, applies changes to all visible weapons if modifications were made')
    );
    header.append(imgWrap, meta);
    card.append(header);

    function applyToAll(patch, allowDontOwn = false) {
      const list = filteredWeapons().map(x => x.name).filter(Boolean);
      if (!list.length) return;
      for (const n of list) {
        const cur = getMyEntry(n);
        const owned = cur.adv >= 1;
        if (!allowDontOwn && patch.lvl != null && !owned) continue;
        setMyEntry(n, patch);
      }
    }

    const stats = el('div', { class: 'hunter-progress-stats' });

    const advSelect = makeAdvancementSelect(STATE.bulk.adv, ADV_MAX, (nextAdv) => {
      STATE.bulk.adv = nextAdv;
      applyToAll({ adv: nextAdv }, true);
      render();
    });

    const advBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
      el('div', { class: 'hunter-progress-stat-value' }, advSelect)
    );

    const lvInput = el('input', {
      type: 'number',
      class: 'hunter-progress-level-input',
      min: '0',
      max: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
      value: String(STATE.bulk.lvl)
    });
    lvInput.addEventListener('input', () => {
      const v = clampInt(lvInput.value, 0, STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
      STATE.bulk.lvl = v;
      const list = filteredWeapons().map(x => x.name).filter(Boolean);
      for (const weaponName of list) {
        const cur = getMyEntry(weaponName);
        if (cur.adv <= 0) continue;
        const real = clampInt(v, 1, STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
        setMyEntry(weaponName, { lvl: real });
      }
    });

    const lvBlock = el('div', { class: 'hunter-progress-stat' },
      el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
      el('div', { class: 'hunter-progress-stat-value' }, lvInput)
    );

    stats.append(advBlock, lvBlock);
    card.append(stats);
    return card;
  }

  // --------------------------
  // Views
  // --------------------------
  function renderBuilds(root) {
    const data = filteredWeapons();

    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const grid = el('div', { class: 'sw-grid' });

    for (const w of data) {
      const elemKey = normElement(w.element);
      const badgeElem = ICONS.element[elemKey] || '';
      const rarityClass = buildsRarityClass(w.rarity);

      const card = el('a', {
        href: getWeaponDetailsTarget(w) || '#',
        class: `sw-card avatar solo ${rarityClass}`,
        title: w.name,
        'aria-label': w.name
      });

      const src = resolveWeaponImgSrc(w);
      const portrait = src
        ? el('img', { class: 'portrait', loading: 'lazy', src, alt: w.name })
        : el('div', { class: 'portrait', style: 'display:grid;place-items:center;font-size:34px;opacity:.8' }, '🗡️');

      const badges = el('div', { class: 'sw-badges' });
      if (badgeElem) badges.append(el('img', { src: badgeElem, alt: w.element || '' }));

      card.append(portrait, badges, el('div', { class: 'name' }, w.name));
      card.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        openWeaponDetails(w);
      });

      grid.append(card);
    }

    root.append(grid);
  }

  function renderList(root) {

    if (STATE.collection.loading && !STATE.collection.loaded) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      return;
    }

    const data = filteredWeapons();
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const wrap = el('div', { class: 'hunters-cards-grid' });

    if (STATE.ui.editMode && STATE.session.loggedIn) {
      wrap.append(renderBulkRow());
    }

    for (const w of data) {
      const entry = getMyEntry(w.name);
      const owned = entry.adv >= 1;
      const rar = String(w.rarity || 'SSR').toUpperCase();
      const rarityClass = buildsRarityClass(rar);
      const elemKey = normElement(w.element);
      const elemIcon = ICONS.element[elemKey] || ICONS.element.none;
      const rarityIcon = ICONS.rarity[rar] || ICONS.rarity.SSR;

      const card = el('div', { class: `hunter-progress-card ${rarityClass}` });

      const header = el('div', { class: 'hunter-progress-head' });
      const weaponSrc = resolveWeaponImgSrc(w);
      const imgWrap = el('div', { class: 'hunter-progress-avatar' },
        weaponSrc
          ? el('img', { src: weaponSrc, loading: 'lazy', decoding: 'async', alt: w.name })
          : el('div', { style: 'font-size:22px' }, '🗡️')
      );

      const meta = el('div', { class: 'hunter-progress-meta' },
        el('div', { class: 'hunter-progress-name', title: w.name }, w.name),
        el('div', { class: 'hunter-progress-badges' },
          el('span', { class: 'hunter-progress-badge rarity-icon' },
            el('img', { src: rarityIcon, alt: rar, loading: 'lazy', decoding: 'async' })
          ),
          el('span', { class: 'hunter-progress-badge icon' },
            el('img', { src: elemIcon, alt: w.element || 'Element', loading: 'lazy', decoding: 'async' })
          )
        )
      );
      header.append(imgWrap, meta);
      card.append(header);

      let advValue;
      if (!STATE.ui.editMode) {
        const d = advToDisplay(entry.adv);
        advValue = el('div', { class: `hunter-progress-stat-value ${d.type === 'dontown' ? 'dontown' : ''}` }, d.text);
      } else {
        advValue = makeAdvancementSelect(entry.adv, getWeaponMaxAdv(w), (nextAdv) => {
          const cur = getMyEntry(w.name);
          const nextLvl = nextAdv >= 1 ? clampInt(cur.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : cur.lvl;
          setMyEntry(w.name, { adv: nextAdv, lvl: nextLvl });
          render();
        });
      }

      let lvValue;
      if (!STATE.ui.editMode) {
        lvValue = el('div', { class: 'hunter-progress-level-chip' }, String(owned ? clampInt(entry.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : 0));
      } else {
        const input = el('input', {
          type: 'number',
          class: 'hunter-progress-level-input',
          min: '0',
          max: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
          value: String(owned ? clampInt(entry.lvl, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax)) : 0),
          disabled: !owned
        });
        input.addEventListener('input', () => {
          const cur = getMyEntry(w.name);
          if (cur.adv <= 0) return;
          const v = clampInt(input.value, 1, (STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax));
          setMyEntry(w.name, { lvl: v });
        });
        lvValue = input;
      }

      const stats = el('div', { class: 'hunter-progress-stats' },
        el('div', { class: 'hunter-progress-stat' },
          el('div', { class: 'hunter-progress-stat-label' }, 'Advancement'),
          advValue
        ),
        el('div', { class: 'hunter-progress-stat' },
          el('div', { class: 'hunter-progress-stat-label' }, 'Lv.'),
          el('div', { class: 'hunter-progress-stat-value' }, lvValue)
        )
      );
      card.append(stats);

      const ownerName = String(w.hunter || '').trim();
      const owner = ownerName ? getHunterByName(ownerName) : null;
      if (ownerName) {
        const ownerElemKey = normElement(owner?.element || 'None');
        const ownerElemIcon = ICONS.element[ownerElemKey] || ICONS.element.none;
        const ownerRar = String(owner?.rarity || 'SSR').toUpperCase();
        const ownerRarityIcon = ICONS.rarity[ownerRar] || ICONS.rarity.SSR;
        const ownerRole = normRole(owner?.role || '');
        const ownerRoleIcon = ICONS.role[ownerRole] || '';
        const ownerImg = owner ? hunterIconImgSrc(owner, 160) : '';

        const ownerCard = el('div', { class: 'hunter-progress-owner-card' });
        ownerCard.append(
          el('div', { class: 'hunter-progress-owner-head' },
            el('div', { class: 'hunter-progress-owner-thumb' },
              ownerImg
                ? el('img', { src: ownerImg, loading: 'lazy', decoding: 'async', alt: ownerName })
                : el('div', { style: 'font-size:22px' }, '👤')
            ),
            el('div', { class: 'hunter-progress-owner-meta' },
              el('div', { class: 'hunter-progress-owner-name', title: ownerName }, ownerName),
              el('div', { class: 'hunter-progress-badges' },
                el('span', { class: 'hunter-progress-badge rarity-icon' },
                  el('img', { src: ownerRarityIcon, alt: ownerRar, loading: 'lazy', decoding: 'async' })
                ),
                el('span', { class: 'hunter-progress-badge icon' },
                  el('img', { src: ownerElemIcon, alt: owner?.element || 'Element', loading: 'lazy', decoding: 'async' })
                ),
                ownerRoleIcon
                  ? el('span', { class: 'hunter-progress-badge icon' },
                      el('img', { src: ownerRoleIcon, alt: ownerRole || 'Type', loading: 'lazy', decoding: 'async' })
                    )
                  : ''
              )
            )
          )
        );
        card.append(ownerCard);
      } else {
        card.append(el('div', { class: 'hunter-progress-owner-empty' }, 'No hunter assigned'));
      }
      wrap.append(card);
    }

    root.append(wrap);
  }

  // --------------------------
  // Admin tab
  // --------------------------
  function mkRaritySelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400`
    });
    const opts = ['SSR', 'SR', 'R'];
    for (const o of opts) sel.append(el('option', { value: o }, o));
    sel.value = String(value || 'SSR').toUpperCase();
    return sel;
  }

  function mkElementSelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400`
    });
    const opts = ['None', 'Fire', 'Water', 'Wind', 'Light', 'Dark'];
    for (const o of opts) sel.append(el('option', { value: o }, o));

    const v = String(value || 'None');
    const norm = {
      none: 'None', fire: 'Fire', water: 'Water', wind: 'Wind', light: 'Light', dark: 'Dark',
      None: 'None', Fire: 'Fire', Water: 'Water', Wind: 'Wind', Light: 'Light', Dark: 'Dark'
    };
    sel.value = norm[v] ?? v;
    return sel;
  }

  function mkMaxAdvSelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400`
    });
    for (let i = 1; i <= ADV_MAX; i++) {
      sel.append(el('option', { value: String(i) }, `Max Adv: ${i}`));
    }
    sel.value = String(clampInt(value ?? ADV_MAX, 1, ADV_MAX));
    return sel;
  }

  // ✅ Hunter dropdown: includes "HUNTERS" + all hunters
  function mkHunterSelect(value, extra = '') {
    const sel = el('select', {
      class: `${extra} px-2 rounded-xl border border-slate-700 bg-slate-800 text-yellow-400`
    });

    // ✅ dropdown: includes ONE "HUNTERS" option + all hunters
    const rawHunters = Array.isArray(STATE.data.hunters) ? STATE.data.hunters : [];
    const curRaw = String(value ?? '').trim();

    // treat literal "HUNTERS" as the global option
    const cur = (curRaw.toUpperCase() === 'HUNTERS') ? '' : curRaw;

    // normalize list: unique, no empties, no "HUNTERS"
    const hunters = [];
    const seen = new Set();
    for (const h of rawHunters) {
      const nm = String(h ?? '').trim();
      if (!nm) continue;
      if (nm.toUpperCase() === 'HUNTERS') continue;
      if (seen.has(nm)) continue;
      seen.add(nm);
      hunters.push(nm);
    }

    hunters.sort((a, b) => a.localeCompare(b));

    // first: global / none owner
    sel.append(el('option', { value: '' }, 'HUNTERS'));

    for (const name of hunters) {
      sel.append(el('option', { value: name }, name));
    }

    // if current is custom / not in list — preserve it (still NOT "HUNTERS")
    if (cur && !hunters.includes(cur)) {
      sel.append(el('option', { value: cur }, cur));
    }

    sel.value = cur || '';
    return sel;
  }

  function renderAdmin(root) {
    if (!isAdminUser()) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Admin only.'));
      return;
    }

    const cfgBox = el('div', { class: 'admin-card admin-grid', style: 'background:rgba(15,23,42,.18); margin-bottom: 12px;' });
    cfgBox.append(el('div', { class: 'admin-title', style: 'font-size:16px' }, 'Hunter Weapons Settings'));

    const inLevelMax = el('input', {
      class: 'admin-in',
      type: 'number',
      min: '1',
      max: '999',
      value: String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax),
      placeholder: 'Max Lv'
    });

    const btnLoadCfg = el('button', { class: 'admin-btn', type: 'button' }, 'Reload settings');
    btnLoadCfg.addEventListener('click', async () => {
      STATE.cfg = await loadHunterWeaponsDropdowns();
      inLevelMax.value = String(STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax);
      toast('Settings reloaded ✅');
      render();
    });

    const btnSaveCfg = el('button', { class: 'admin-btn primary', type: 'button' }, 'Save settings');
    btnSaveCfg.addEventListener('click', async () => {
      const levelMax = clampInt(inLevelMax.value, 1, 999);

      const out = await fetchJson(url('/api/admin/hunter-weapons-dropdowns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ config: { levelMax } })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Save failed');
        return;
      }

      toast('Saved ✅');
      STATE.cfg = await loadHunterWeaponsDropdowns();
      render();
    });

    cfgBox.append(
      el('div', { class: 'admin-row' },
        el('div', { class: 'admin-sub', style: 'min-width: 140px;' }, 'Max Lv'),
        inLevelMax,
        btnLoadCfg,
        btnSaveCfg
      )
    );

    root.append(cfgBox);

    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' });

    const header = el('div', { class: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4' },
      el('div', {},
        el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Hunter Weapons — Admin'),
        el('div', { class: 'text-sm text-white' }, 'Edit weapons, change global order, add new weapons.')
      )
    );

    const actions = el('div', { class: 'flex flex-wrap items-center gap-2' });

    const btnAutoMatchMissing = el('button', {
      class: 'h-9 px-3 rounded-xl border bg-slate-800 border-slate-700 hover:bg-slate-700 text-sm font-semibold',
      type: 'button',
      title: 'Auto-match and save missing images by weapon name'
    }, 'Auto match missing images');

    btnAutoMatchMissing.addEventListener('click', async () => {
      const ok = await hw2Confirm(
        'Auto match missing images',
        'Auto-match missing images for all hunter weapons that do not have an image yet?',
        'START',
        'CANCEL'
      );
      if (!ok) return;
    
      const oldText = btnAutoMatchMissing.textContent;
      btnAutoMatchMissing.disabled = true;
      btnAutoMatchMissing.textContent = 'Matching...';
    
      try {
        const res = await autoMatchMissingHunterWeaponImagesBatch();
      
        toast(`Auto match ✅ Updated ${res.updated} (matched ${res.matched}, checked ${res.checked}, failed ${res.failed})`);
      
        await loadWeapons();
        render();
      } catch (e) {
        console.error('autoMatchMissingHunterWeaponImagesBatch failed:', e);
        toast('Auto match failed');
      } finally {
        btnAutoMatchMissing.disabled = false;
        btnAutoMatchMissing.textContent = oldText;
      }
    });

    const btnExact = el('button', {
      class: 'h-9 px-3 rounded-xl border bg-slate-800 border-slate-700 hover:bg-slate-700 text-sm font-semibold',
      type: 'button'
    }, 'Set exact order');

    btnExact.addEventListener('click', () => openExactOrderModal());

    actions.append(btnAutoMatchMissing, btnExact);
    header.append(actions);

    // ----- Add new weapon -----
    const addWrap = el('div', { class: 'grid gap-2 p-3 rounded-2xl border border-slate-700 bg-slate-50/60/30 mb-4' });
    addWrap.append(el('div', { class: 'font-extrabold text-white' }, 'Add new weapon'));

    const row1 = el('div', { class: 'hweapon-admin-add-row flex flex-wrap gap-2' });
    const inName = el('input', { class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 min-w-[240px]', placeholder: 'Name (unique)' });

    // ✅ Dropdown instead of link
    const selImg = mkPictureSelect('', 'h-10');

    // ✅ AUTO: try to select image by name (only if not chosen)
    let addNameAutoTimer = null;
    inName.addEventListener('input', () => {
      clearTimeout(addNameAutoTimer);
      addNameAutoTimer = setTimeout(() => {
        tryAutoSelectHWeaponImageByName(inName.value, selImg);
      }, 180);
    });
    inName.addEventListener('blur', () => {
      tryAutoSelectHWeaponImageByName(inName.value, selImg);
    });

    const selRarity = mkRaritySelect('SSR', 'h-10');
    const selElement = mkElementSelect('None', 'h-10');

    // ✅ removed MaxAdv select here — always max
    const selHunter = mkHunterSelect('', 'h-10');

    const btnAdd = el('button', {
      class: 'h-10 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 font-extrabold',
      type: 'button'
    }, 'Add');

    btnAdd.addEventListener('click', async () => {
      // ✅ final auto-try before validation (paste+click)
      if (!String(selImg.value || '').trim()) {
        await tryAutoSelectHWeaponImageByName(inName.value, selImg);
      }

      const name = (inName.value || '').trim();

      const pickedRel = String(selImg.value || '').trim();   // "Skins/Foo.webp"
      const image = normalizeHWeaponRel(pickedRel);          // "HWeapon/Skins/Foo.webp"

      const rarity = String(selRarity.value || 'SSR').toUpperCase();
      const element = String(selElement.value || 'None');

      // ✅ always max for new weapons
      const maxGrowth = ADV_MAX;

      // ✅ dropdown: "" means HUNTERS (no owner)
      const owner = String(selHunter.value || '').trim() || 'HUNTERS';

      if (!name || !image) {
        toast('Name + Image required');
        return;
      }

      const out = await fetchJson(url('/api/admin/weapons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dataset: 'hunterWeapons',
          action: 'add',
          item: { name, image, image_build: image, rarity, element, maxGrowth, owner }
        })
      });

      if (!out.ok) {
        toast(out?.data?.error || 'Add failed');
        return;
      }

      inName.value = '';
      selImg.value = '';
      selRarity.value = 'SSR';
      selElement.value = 'None';
      selHunter.value = '';

      toast('Added ✅');
      await loadWeapons();
      render();
    });

    // ✅ row without maxAdv
    row1.append(inName, selImg, selRarity, selElement, selHunter, btnAdd);
    addWrap.append(row1);

    // ----- List -----
    const list = el('div', { class: 'grid gap-2' });

    const data = filteredWeapons();

    function ensureOrder() {
      const cur = (STATE.globalOrder && STATE.globalOrder.length) ? [...STATE.globalOrder] : [];
      const names = (STATE.data.weapons || []).map(w => w.name).filter(Boolean);
      const set = new Set(cur);
      for (const n of names) if (!set.has(n)) cur.push(n);
      return cur;
    }

    async function commitOrder(nextOrder) {
      try {
        if (!Array.isArray(nextOrder) || !nextOrder.length) {
          toast('Order save blocked: empty order');
          return;
        }

        const namesNow = new Set((STATE.data.weapons || []).map(w => String(w?.name || '').trim()).filter(Boolean));
        const cleaned = [];
        const seen = new Set();

        for (const n of nextOrder) {
          const name = String(n || '').trim();
          if (!name || !namesNow.has(name) || seen.has(name)) continue;
          seen.add(name);
          cleaned.push(name);
        }

        for (const n of namesNow) {
          if (!seen.has(n)) cleaned.push(n);
        }

        await saveGlobalOrder(cleaned);
        STATE.globalOrder = cleaned;
        STATE.data.weapons = applyOrder(STATE.data.weapons, cleaned);
        toast('Order saved ✅');
        render();
      } catch (err) {
        toast(`Order save failed: ${err?.message || err}`);
      }
    }

    function adminRow(w) {
      const row = el('div', {
        class: 'rounded-2xl border border-slate-700 bg-slate-900/20 p-3 flex flex-col md:flex-row md:items-center gap-3'
      });

      const src = resolveWeaponImgSrc(w);
      const img = src
        ? el('img', { src, class: 'w-14 h-14 rounded-2xl object-cover bg-[rgb(24_34_52)] border border-slate-700', loading: 'lazy' })
        : el('div', { class: 'w-14 h-14 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-xl' }, '🗡️');

      const meta = el('div', { class: 'min-w-0 flex-1' },
        el('div', { class: 'font-extrabold text-white truncate' }, w.name),
        el('div', { class: 'text-xs text-white' },
          `${String(w.rarity || 'SSR').toUpperCase()} • ${w.element || 'None'}${w.hunter ? ` • ${w.hunter}` : ''}`
        )
      );

      const right = el('div', { class: 'flex flex-wrap items-center gap-2 justify-start md:justify-end' });

      const btnUp = el('button', {
        class: 'h-9 w-9 rounded-xl border bg-slate-800 border-slate-700 hover:bg-slate-700 font-extrabold',
        title: 'Move up',
        type: 'button'
      }, '↑');

      const btnDown = el('button', {
        class: 'h-9 w-9 rounded-xl border bg-slate-800 border-slate-700 hover:bg-slate-700 font-extrabold',
        title: 'Move down',
        type: 'button'
      }, '↓');

      btnUp.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(w.name);
        if (i <= 0) return;
        { const tmp = order[i - 1]; order[i - 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      btnDown.addEventListener('click', async () => {
        const order = ensureOrder();
        const i = order.indexOf(w.name);
        if (i < 0 || i >= order.length - 1) return;
        { const tmp = order[i + 1]; order[i + 1] = order[i]; order[i] = tmp; }
        await commitOrder(order);
      });

      const btnEdit = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 font-extrabold',
        type: 'button'
      }, 'Edit');
      btnEdit.addEventListener('click', () => openEditWeaponModal(w));

      const btnRemove = el('button', {
        class: 'h-9 px-3 rounded-xl border bg-rose-600/15 border-rose-500 text-rose-200 hover:bg-rose-600/25 font-extrabold',
        type: 'button',
        title: 'Remove weapon'
      }, 'Remove');

      btnRemove.addEventListener('click', async () => {
        const ok = confirm(`Remove weapon: "${w.name}" ?`);
        if (!ok) return;

        const out = await fetchJson(url('/api/admin/weapons'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dataset: 'hunterWeapons',
            action: 'remove',
            name: w.name
          })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Remove failed');
          return;
        }

        toast('Removed ✅');
        await loadWeapons();
        render();
      });

      right.append(btnUp, btnDown, btnEdit, btnRemove);
      row.append(img, meta, right);
      return row;
    }

    for (const w of data) list.append(adminRow(w));

    if (!data.length) {
      list.append(el('div', { class: 'p-4 text-center text-white' }, 'No results.'));
    }

    card.append(header, addWrap, list);
    root.append(card);

    function openExactOrderModal() {
      const order = ensureOrder();
      const textarea = el('textarea', {
        class: 'w-full min-h-[240px] p-3 rounded-xl border border-slate-700 bg-slate-900 text-yellow-400',
        placeholder: 'One name per line…'
      }, order.join('\n'));

      const saveBtn = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 font-extrabold',
        type: 'button'
      }, 'Save order');

      const wrap = el('div', { class: 'grid gap-3' },
        el('div', { class: 'text-sm text-white' }, 'Paste / edit exact order. Unknown names ignored. Missing weapons appended at the end.'),
        textarea,
        el('div', { class: 'flex justify-end' }, saveBtn)
      );

      const doSave = async () => {
        const lines = (textarea.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const baseNames = (STATE.data.weapons || []).map(w => w.name).filter(Boolean);
        const baseSet = new Set(baseNames);

        const next = [];
        const seen = new Set();
        for (const n of lines) {
          if (!baseSet.has(n)) continue;
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
        }
        for (const n of baseNames) {
          if (!seen.has(n)) next.push(n);
        }

        await commitOrder(next);
        hw2HideModal();
      };

      saveBtn.addEventListener('click', doSave);
      hw2ShowModal('Set exact order', () => wrap);
    }

    function openEditWeaponModal(w) {
      const inName = el('input', { class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-900', value: w.name || '' });

      // ✅ Dropdown instead of link
      const currentRel = normalizeHWeaponRel(w.image_build || w.image || '').replace(/^HWeapon\//, '');
      const selImg = mkPictureSelect(currentRel, 'h-10');
      // Auto-fill image on modal open if missing and match exists
      queueMicrotask(() => {
        autoFillHWeaponImageIfMissing(inName.value, selImg);
      });

      // ✅ AUTO: try to select image by name if image is empty
      let editNameAutoTimer = null;
      inName.addEventListener('input', () => {
        clearTimeout(editNameAutoTimer);
        editNameAutoTimer = setTimeout(() => {
          tryAutoSelectHWeaponImageByName(inName.value, selImg);
        }, 180);
      });
      inName.addEventListener('blur', () => {
        tryAutoSelectHWeaponImageByName(inName.value, selImg);
      });

      // ✅ Hunter dropdown in Edit
      const selHunter = mkHunterSelect((w.hunter || '').trim(), 'h-10');

      const selR = mkRaritySelect(String(w.rarity || 'SSR').toUpperCase(), 'h-10');
      const selE = mkElementSelect(String(w.element || 'None'), 'h-10');

      const save = el('button', {
        class: 'h-10 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 font-extrabold',
        type: 'button'
      }, 'Save');

      const body = el('div', { class: 'grid gap-2' },
        el('div', { class: 'text-sm text-white' }, 'Name / Image / Element / Rarity / Owner'),
        el('div', { class: 'grid gap-2' },
          el('label', { class: 'text-xs font-bold text-white' }, 'Name'),
          inName,
          el('label', { class: 'text-xs font-bold text-white' }, 'Image (local)'),
          el('div', { class: 'flex gap-2 items-center' },
            selImg,
            (() => {
              const btnAutoImg = el('button', {
                type: 'button',
                class: 'h-10 px-3 rounded-xl border bg-slate-900 text-white hover:bg-slate-800 font-extrabold'
              }, 'Auto');
            
              btnAutoImg.addEventListener('click', async () => {
                const changed = await autoFillHWeaponImageIfMissing(inName.value, selImg);
                toast(changed ? 'Image matched ✅' : 'No match found');
              });
            
              return btnAutoImg;
            })()
          ),
          el('div', { class: 'flex flex-wrap gap-2 items-center' }, selR, selE),
          el('label', { class: 'text-xs font-bold text-white' }, 'Hunter (optional)'),
          selHunter
        ),
        el('div', { class: 'flex justify-end pt-2' }, save)
      );

      save.addEventListener('click', async () => {
        const name = (inName.value || '').trim();

        // ✅ final auto-try if empty
        if (!String(selImg.value || '').trim()) {
          await tryAutoSelectHWeaponImageByName(inName.value, selImg);
        }

        const pickedRel = String(selImg.value || '').trim();
        const image = normalizeHWeaponRel(pickedRel);

        const rarity = String(selR.value || 'SSR').toUpperCase();
        const element = String(selE.value || 'None');
        const maxGrowth = ADV_MAX; // always
        const owner = String(selHunter.value || '').trim(); // "" => HUNTERS

        if (!name) return toast('Name required');
        if (!image) return toast('Image required');

        const out = await fetchJson(url('/api/admin/weapons'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            dataset: 'hunterWeapons',
            action: 'update',
            originalName: w.name,
            item: { name, image, image_build: image, rarity, element, maxGrowth, owner }
          })
        });

        if (!out.ok) {
          toast(out?.data?.error || 'Save failed');
          return;
        }

        toast('Saved ✅');
        await loadWeapons();
        render();
        hw2HideModal();
      });

      hw2ShowModal(`Edit: ${w.name}`, () => body);
    }
  }

  // --------------------------
  // Quick modal
  // --------------------------
  function openQuickModal(w) {
    hw2ShowModal(w.name || 'Weapon', () => {
      const wrap = el('div', { class: 'grid gap-3' });

      const top = el('div', { class: 'flex items-center gap-3' });

      const src = resolveWeaponImgSrc(w);
      const img = src
        ? el('img', { src, class: 'w-28 h-28 rounded-2xl object-cover bg-[rgb(24_34_52)]', loading: 'lazy' })
        : el('div', { class: 'w-28 h-28 rounded-2xl bg-[rgb(24_34_52)] grid place-items-center text-3xl' }, '🗡️');

      const info = el('div', { class: 'grid gap-1 text-sm text-white' });

      const rar = String(w.rarity || 'SSR').toUpperCase();
      info.append(el('div', {}, `${rar} • ${w.element || 'None'} • Max Lv ${STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax}`));
      if ((w.hunter || '').trim()) info.append(el('div', {}, `Hunter: ${(w.hunter || '').trim()}`));

      const entry = getMyEntry(w.name);
      info.append(el('div', {}, `Status: ${entry.adv >= 1 ? 'OWNED' : 'MISSING'}`));
      info.append(el('div', {}, `Advancement: ${advToDisplay(entry.adv).text}`));
      info.append(el('div', {}, entry.adv >= 1 ? `Lv: ${entry.lvl}/${STATE.cfg.levelMax ?? DEFAULT_CFG.levelMax}` : 'Lv: 0'));

      top.append(img, info);
      wrap.append(top);

      return wrap;
    });
  }

  // --------------------------
  // Keep focus in search input after render()
  // --------------------------
  function renderKeepSearchFocus() {
    const active = document.activeElement;
    const hadFocus = !!(active && active.classList && active.classList.contains('search'));
    const caret = hadFocus ? (active.selectionStart ?? 0) : 0;

    render();

    if (hadFocus) {
      const next = document.querySelector('.hunters-toolbar .search');
      if (next) {
        next.focus({ preventScroll: true });
        const p = Math.min(caret, next.value.length);
        try { next.setSelectionRange(p, p); } catch {}
      }
    }
  }

  // --------------------------
  // Main render
  // --------------------------
  function render() {
    injectLocalStyles();

    const content = qs('#content');
    if (!content) return;
    content.innerHTML = '';

    const shell = el('div', {
      class: 'max-w-7xl mx-auto px-3 sm:px-6 py-6',
      'data-sla-page': 'hunter-weapons'
    });

    renderHeader(shell);
    renderSubtabs(shell);
    renderFilters(shell);

    if (STATE.loading) {
      shell.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading…'));
      content.append(shell);
      return;
    }
    if (STATE.error) {
      shell.append(el('div', { class: 'p-6 text-center text-red-600 dark:text-red-400 font-semibold' }, STATE.error));
      content.append(shell);
      return;
    }

    if (STATE.subtab === 'builds') renderBuilds(shell);
    else if (STATE.subtab === 'admin') renderAdmin(shell);
    else renderList(shell);

    content.append(shell);
  }

  // --------------------------
  // Public mount
  // --------------------------
  window.__hunter_weapons_mount = async function __hunter_weapons_mount() {
    injectLocalStyles();

    if (!window.__hunterWeaponsProgressSyncBound) {
      window.__hunterWeaponsProgressSyncBound = true;
      window.addEventListener(USER_PROGRESS_SYNC_EVENT, () => {
        STATE.collection.loaded = false;
        STATE.collection.loading = false;
      });
    }

    STATE.collection.loaded = false;
    STATE.collection.loading = false;
  
    STATE.cfg = await loadHunterWeaponsDropdowns();
  
    // ✅ load hunter list for admin dropdown (safe for all)
    await loadHuntersCatalog();
  
    if (!STATE.data.weapons?.length && !STATE.loading) {
      await loadWeapons();
    }
  
    await loadMyHunterWeaponsProgress();
  
    render();
  };
})();
