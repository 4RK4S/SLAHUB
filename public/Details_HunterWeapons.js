'use strict';

(function () {
  const qs = (sel, root = document) => root.querySelector(sel);

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    const b = basePath();
    const path = String(p || '').startsWith('/') ? p : `/${p}`;
  
    // assets i api publiczne bez /slahub prefix
    if (
      path.startsWith('/picture/') ||
      path.startsWith('/api/')
    ) {
      return path;
    }
  
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
      node.append(ch.nodeType ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') {
      return window.showToast(msg);
    }

    const old = document.getElementById('dhw-fallback-toast');
    if (old) old.remove();

    const node = document.createElement('div');
    node.id = 'dhw-fallback-toast';
    node.textContent = String(msg || '');
    node.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 10000;
      background: rgba(15,23,42,.96);
      color: #fff;
      border: 1px solid rgba(148,163,184,.3);
      padding: 10px 14px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font-weight: 700;
    `;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2500);
  }

  async function fetchJsonTry(paths) {
    let lastErr = null;
    for (const p of paths) {
      try {
        const r = await fetch(url(p), { cache: 'no-store', credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Failed to load JSON');
  }

  function clampInt(v, min, max) {
    const n = Number.isFinite(+v) ? parseInt(v, 10) : min;
    return Math.max(min, Math.min(max, n));
  }

  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function slugifyWeaponName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function unslugPathWeapon(pathname) {
    const clean = String(pathname || '').split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const idx = parts.findIndex(x => x === 'hunter-weapons');
    if (idx === -1 || !parts[idx + 1]) return '';
    return decodeURIComponent(parts[idx + 1]);
  }

  function isAdmin() {
    return !!window.STATE?.isAdmin;
  }

  function getHideAdminButtons() {
    try {
      return localStorage.getItem('sla_hide_admin_buttons') === '1';
    } catch (_) {
      return false;
    }
  }

  function canShowAdminButtons() {
    return isAdmin() && !getHideAdminButtons();
  }

  function applyAdminButtonsVisibility() {
    const hidden = getHideAdminButtons();

    if (hidden) {
      STATE.editMode = false;
      STATE.globalEditMode = false;
    }

    document.documentElement.classList.toggle('sla-hide-admin-buttons', hidden);
  }

  function cdnySafe(src, w = 256) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(src, w);
    } catch (_) {}
    return src || '';
  }

  function normalizeElement(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'fire') return 'Fire';
    if (s === 'water') return 'Water';
    if (s === 'wind') return 'Wind';
    if (s === 'light') return 'Light';
    if (s === 'dark') return 'Dark';
    return 'None';
  }

  function normalizeRarity(v) {
    const s = String(v || 'SSR').trim().toUpperCase();
    if (['R', 'SR', 'SSR'].includes(s)) return s;
    return 'SSR';
  }

  function rarityImg(rarity) {
    return url(`/picture/Rarity/${normalizeRarity(rarity)}.png`);
  }

  function elementImg(element) {
    const e = normalizeElement(element);
    const map = {
      Fire: 'Fires.png',
      Water: 'Waters.png',
      Wind: 'Winds.png',
      Light: 'Lights.png',
      Dark: 'Darkness.png',
      None: 'NONE.png'
    };
    return url(`/picture/Element/${map[e] || 'NONE.png'}`);
  }

  function normalizeWeaponImgRel(v) {
    const s = String(v || '').trim().replace(/^\/+/, '');
    if (!s) return '';
    if (s.startsWith('HWeapon/')) return s;
    return `HWeapon/${s}`;
  }

  function weaponImgSrc(item) {
    const rel = normalizeWeaponImgRel(item?.image_build || item?.image || '');
    return rel ? url(`/picture/${rel}`) : '';
  }

  function getWeaponSkinBaseName(weapon) {
    const rel = normalizeWeaponImgRel(weapon?.image_build || weapon?.image || '');
    const file = String(rel || '').split('/').pop() || '';
    const base = file.replace(/\.[^.]+$/i, '').trim();
    return base || slugifyWeaponName(weapon?.name);
  }

  function hunterIconSrc(hunterName) {
    if (!hunterName) return '';
    const clean = String(hunterName).trim().replace(/\s+/g, '_');
    return url(`/picture/Hunter_Icon/${clean}.png`);
  }

  const ADV_MAX = 11;

  function advancementStars(adv) {
    const a = clampInt(adv, 0, ADV_MAX);

    if (a === 0) return "Don't own";
    if (a === 1) return '✧✧✧✧✧';

    if (a >= 2 && a <= 5) {
      const filled = '✦'.repeat(a - 1);
      const empty = '✧'.repeat(6 - a);
      return `${filled}${empty}`;
    }

    if (a === 6) return '✦✦✦✦✦';

    return `✦✦✦✦✦${a - 6}`;
  }

  function inferSkinFolder(weapon) {
    const baseName = getWeaponSkinBaseName(weapon);
    return baseName || '';
  }

  function getFileNameFromSrc(src, fallback = 'image.png') {
    const clean = String(src || '').split('?')[0].split('#')[0];
    const rawName = clean.split('/').pop() || fallback;
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    return hasExt ? rawName : `${rawName}.png`;
  }
  
  function currentSkinLabel() {
    if (!STATE.skins.length || STATE.skinIndex === 0) {
      return STATE.weaponName || '';
    }
  
    const src = STATE.skins[STATE.skinIndex] || '';
    const file = getFileNameFromSrc(src, 'skin.png');
    return file.replace(/\.[^.]+$/i, '').replace(/_/g, ' ').trim() || (STATE.weaponName || '');
  }

  async function listSkinImagesInFolder(folder, baseName) {
    if (!folder || !baseName) return [];
    try {
      const r = await fetch(url(`/api/public/hweapon-skins?folder=${encodeURIComponent(folder)}&baseName=${encodeURIComponent(baseName)}`), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j?.items) ? j.items : [];
      return items
        .map((it) => String(it?.url || '').trim())
        .filter(Boolean)
        .map((src) => {
          if (/^https?:\/\//i.test(src)) return src;
          return src.startsWith('/') ? src : `/${src}`;
        });
    } catch (_) {
      return [];
    }
  }

  const TAG_COLORS = {
    keyword: '#fac700',
    keyword2: '#ffdf7d',
    debuff: '#63fac7',
    break: '#ff8740',
    fire: '#e64b4b',
    water: '#4b96fa',
    wind: '#32c732',
    light: '#fac700',
    dark: '#af63af'
  };

  const COLOR_BTNS = [
    { label: 'Fire', color: '#e64b4b', mode: 'tag', tag: 'fire' },
    { label: 'Water', color: '#4b96fa', mode: 'tag', tag: 'water' },
    { label: 'Wind', color: '#32c732', mode: 'tag', tag: 'wind' },
    { label: 'Light', color: '#fac700', mode: 'tag', tag: 'light' },
    { label: 'Dark', color: '#af63af', mode: 'tag', tag: 'dark' },
    { label: 'keyword', color: '#fac700', mode: 'tag', tag: 'keyword' },
    { label: 'keyword2', color: '#ffdf7d', mode: 'tag', tag: 'keyword2' },
    { label: 'debuff', color: '#63fac7', mode: 'tag', tag: 'debuff' },
    { label: 'break', color: '#ff8740', mode: 'tag', tag: 'break' }
  ];

  const DEFAULT_DETAILS = {
    min: {
      lvl: '',
      adv: '',
      totalPower: '',
      statLabel: '',
      statValue: '',
      description: ''
    },
    max: {
      lvl: '',
      adv: '',
      totalPower: '',
      statLabel: '',
      statValue: '',
      precision: '',
      description: ''
    }
  };

  const STATE = {
    weapon: null,
    weaponName: '',
    skins: [],
    skinIndex: 0,
    lightboxOpen: false,
    levelMax: 100,
    collection: {},
    editMode: false,
    statMode: 'min',
    saving: false,
    globalStats: null,
    globalEditMode: false,
    globalSaving: false,
    weapons: [],
    weaponIndex: -1,
    hunters: [],
    hunterStatsSaving: false
  };

  function prevSkin() {
    if (!STATE.skins.length) return;
    STATE.skinIndex = (STATE.skinIndex - 1 + STATE.skins.length) % STATE.skins.length;
  }

  function nextSkin() {
    if (!STATE.skins.length) return;
    STATE.skinIndex = (STATE.skinIndex + 1) % STATE.skins.length;
  }

  function getWeaponDetailsTarget(weapon) {
    const slug = slugifyWeaponName(weapon?.name || '');
    return slug ? url(`/hunter-weapons/${encodeURIComponent(slug)}`) : '';
  }

  function navigateToWeapon(weapon) {
    const target = getWeaponDetailsTarget(weapon);
    if (!target) return;

    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }

    window.location.href = target;
  }

  function getAdjacentWeapon(dir) {
    const list = Array.isArray(STATE.weapons) ? STATE.weapons : [];
    if (!list.length || STATE.weaponIndex < 0) return null;

    const nextIndex = STATE.weaponIndex + dir;
    if (nextIndex < 0 || nextIndex >= list.length) return null;
    return list[nextIndex] || null;
  }

  function closeLightbox() {
    if (!STATE.lightboxOpen) return;
    STATE.lightboxOpen = false;
    rerender();
  }

  async function downloadCurrentImage() {
    const src = STATE.skins[STATE.skinIndex] || weaponImgSrc(STATE.weapon) || '';
    if (!src) {
      toast('Image not found.');
      return;
    }

    const cleanSrc = String(src).split('?')[0].split('#')[0];
    const fallbackBase = slugifyWeaponName(STATE.weaponName || 'image') || 'image';
    const rawName = cleanSrc.split('/').pop() || `${fallbackBase}.png`;
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    const fileName = hasExt ? rawName : `${rawName}.png`;

    try {
      const r = await fetch(src, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.warn('Download failed, opening image in a new tab.', err);
      window.open(src, '_blank', 'noopener,noreferrer');
      toast('Direct download was blocked, image opened in a new tab.');
    }
  }

  const DEFAULT_GLOBAL_STATS = {
    levelMin: 1,
    levelMax: 100,
    advMin: 1,
    advMax: 11,
    precisionMax: 4000,
    hp: { minStat: 850, maxStat: 6120, minTotalPower: 601, maxTotalPower: 4900 },
    attack: { minStat: 400, maxStat: 3080, minTotalPower: 566, maxTotalPower: 4928 },
    defense: { minStat: 400, maxStat: 3080, minTotalPower: 566, maxTotalPower: 4928 }
  };

  function getGlobalStats() {
    const src = (STATE.globalStats && typeof STATE.globalStats === 'object') ? STATE.globalStats : DEFAULT_GLOBAL_STATS;
    return {
      levelMin: Number.isFinite(+src.levelMin) ? Math.max(1, Math.min(999, Math.floor(+src.levelMin))) : DEFAULT_GLOBAL_STATS.levelMin,
      levelMax: Number.isFinite(+src.levelMax) ? Math.max(1, Math.min(999, Math.floor(+src.levelMax))) : (STATE.levelMax || DEFAULT_GLOBAL_STATS.levelMax),
      advMin: Number.isFinite(+src.advMin) ? Math.max(1, Math.min(11, Math.floor(+src.advMin))) : DEFAULT_GLOBAL_STATS.advMin,
      advMax: Number.isFinite(+src.advMax) ? Math.max(1, Math.min(11, Math.floor(+src.advMax))) : DEFAULT_GLOBAL_STATS.advMax,
      precisionMax: Number.isFinite(+src.precisionMax) ? Math.max(0, Math.min(999999, Math.floor(+src.precisionMax))) : DEFAULT_GLOBAL_STATS.precisionMax,
      hp: { ...(DEFAULT_GLOBAL_STATS.hp || {}), ...((src.hp && typeof src.hp === 'object') ? src.hp : {}) },
      attack: { ...(DEFAULT_GLOBAL_STATS.attack || {}), ...((src.attack && typeof src.attack === 'object') ? src.attack : {}) },
      defense: { ...(DEFAULT_GLOBAL_STATS.defense || {}), ...((src.defense && typeof src.defense === 'object') ? src.defense : {}) }
    };
  }

  function buildAutoPresetsFromGlobal() {
    const gs = getGlobalStats();
    return {
      HP: {
        min: { lvl: String(gs.levelMin), adv: String(gs.advMin), totalPower: String(gs.hp.minTotalPower), statLabel: 'HP', statValue: String(gs.hp.minStat), description: '' },
        max: { lvl: String(gs.levelMax), adv: String(gs.advMax), totalPower: String(gs.hp.maxTotalPower), statLabel: 'HP', statValue: String(gs.hp.maxStat), precision: String(gs.precisionMax), description: '' }
      },
      Attack: {
        min: { lvl: String(gs.levelMin), adv: String(gs.advMin), totalPower: String(gs.attack.minTotalPower), statLabel: 'Attack', statValue: String(gs.attack.minStat), description: '' },
        max: { lvl: String(gs.levelMax), adv: String(gs.advMax), totalPower: String(gs.attack.maxTotalPower), statLabel: 'Attack', statValue: String(gs.attack.maxStat), precision: String(gs.precisionMax), description: '' }
      },
      Defense: {
        min: { lvl: String(gs.levelMin), adv: String(gs.advMin), totalPower: String(gs.defense.minTotalPower), statLabel: 'Defense', statValue: String(gs.defense.minStat), description: '' },
        max: { lvl: String(gs.levelMax), adv: String(gs.advMax), totalPower: String(gs.defense.maxTotalPower), statLabel: 'Defense', statValue: String(gs.defense.maxStat), precision: String(gs.precisionMax), description: '' }
      }
    };
  }

  function normalizeStatLabel(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'attack') return 'Attack';
    if (s === 'defense') return 'Defense';
    return 'HP';
  }

  function autoSlot(mode, statLabel = 'HP') {
    const stat = normalizeStatLabel(statLabel);
    const presets = buildAutoPresetsFromGlobal();
    const base = JSON.parse(JSON.stringify(presets[stat]?.[mode] || presets.HP[mode] || {}));
    if (mode === 'max') base.lvl = String(getGlobalStats().levelMax || STATE.levelMax || 100);
    return { ...(mode === 'max' ? DEFAULT_DETAILS.max : DEFAULT_DETAILS.min), ...base };
  }

  function mergeSlotWithDefaults(slot, mode) {
    const incoming = (slot && typeof slot === 'object') ? slot : {};
    const statLabel = normalizeStatLabel(incoming.statLabel || 'HP');
    const base = autoSlot(mode, statLabel);
    const out = { ...base };

    for (const key of Object.keys(out)) {
      if (key === 'description') continue;
      const raw = incoming[key];
      if (raw == null) continue;
      const s = String(raw).trim();
      if (s) out[key] = s;
    }

    out.statLabel = statLabel;
    out.description = String(incoming.description || '');
    return out;
  }

  function detailsWithStatLabel(existingDetails, statLabel) {
    const stat = normalizeStatLabel(statLabel);
    const makeSlot = (mode) => {
      const current = mergeSlotWithDefaults(existingDetails?.[mode], mode);
      const auto = autoSlot(mode, stat);
      return {
        ...current,
        lvl: auto.lvl || current.lvl || '',
        adv: auto.adv || current.adv || '',
        totalPower: auto.totalPower || current.totalPower || '',
        statLabel: stat,
        statValue: auto.statValue || current.statValue || '',
        ...(mode === 'max' ? { precision: auto.precision || current.precision || '' } : {}),
        description: current.description || ''
      };
    };

    return {
      min: makeSlot('min'),
      max: makeSlot('max')
    };
  }

  function ensureWeaponDetailsEntry() {
    const name = STATE.weaponName;
    if (!name) return JSON.parse(JSON.stringify(DEFAULT_DETAILS));

    const existing = STATE.collection?.[name]?.details || {};
    const details = {
      min: mergeSlotWithDefaults(existing.min, 'min'),
      max: mergeSlotWithDefaults(existing.max, 'max')
    };

    STATE.collection[name] = {
      ...(STATE.collection[name] && typeof STATE.collection[name] === 'object' ? STATE.collection[name] : {}),
      details
    };

    return STATE.collection[name].details;
  }

  function currentDetails() {
    const d = ensureWeaponDetailsEntry();
    return STATE.statMode === 'max' ? d.max : d.min;
  }

  function collectCurrentFormToState() {
    if (!STATE.editMode || !canShowAdminButtons()) return;
  
    const root = ensureWeaponDetailsEntry();
    const slot = STATE.statMode === 'max' ? root.max : root.min;
  
    slot.lvl = qs('#dhw-lvl')?.value?.trim() || '';
    slot.adv = qs('#dhw-adv')?.value?.trim() || '';
    slot.totalPower = qs('#dhw-total-power')?.value?.trim() || '';
    slot.statLabel = qs('#dhw-stat-label')?.value?.trim() || 'HP';
    slot.statValue = qs('#dhw-stat-value')?.value?.trim() || '';
    slot.description = getEditorPlainText().trim() || '';
  
    if (STATE.statMode === 'max') {
      slot.precision = qs('#dhw-precision')?.value?.trim() || '';
    }
  }

  async function loadDropdownConfig() {
    try {
      const r = await fetch(url('/api/public/hunter-weapons-dropdowns'), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      const levelMax = Number.isFinite(+j?.levelMax) ? Math.max(1, Math.min(999, Math.floor(+j.levelMax))) : 100;
      STATE.levelMax = levelMax;
    } catch (_) {
      STATE.levelMax = 100;
    }
  }

  async function loadGlobalStats() {
    try {
      const r = await fetch(url('/api/public/hweapon-global-stats'), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      STATE.globalStats = (j && typeof j.stats === 'object' && j.stats) ? j.stats : JSON.parse(JSON.stringify(DEFAULT_GLOBAL_STATS));
      const lvl = Number.isFinite(+STATE.globalStats?.levelMax) ? Math.max(1, Math.min(999, Math.floor(+STATE.globalStats.levelMax))) : STATE.levelMax;
      STATE.levelMax = lvl || STATE.levelMax || 100;
    } catch (_) {
      STATE.globalStats = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_STATS));
      STATE.globalStats.levelMax = STATE.levelMax || 100;
    }
  }

  async function saveGlobalStats(payload) {
    if (!isAdmin()) {
      toast('Only admin can save global stats.');
      return false;
    }
    if (STATE.globalSaving) return false;

    STATE.globalSaving = true;
    try {
      const r = await fetch(url('/api/admin/hweapon-global-stats'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stats: payload })
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(out?.error || 'Global stats save failed');
        return false;
      }
      STATE.globalStats = (out && typeof out.stats === 'object' && out.stats) ? out.stats : payload;
      STATE.levelMax = Number.isFinite(+STATE.globalStats?.levelMax) ? Math.max(1, Math.min(999, Math.floor(+STATE.globalStats.levelMax))) : STATE.levelMax;
      await loadGlobalDetails();
      ensureWeaponDetailsEntry();
      toast('Global stats saved ✅');
      return true;
    } catch (e) {
      console.error('saveGlobalStats failed:', e);
      toast('Global stats save failed');
      return false;
    } finally {
      STATE.globalSaving = false;
    }
  }

  async function loadGlobalDetails() {
    try {
      const r = await fetch(url(`/api/public/hunter-weapon-details?name=${encodeURIComponent(STATE.weaponName)}`), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      const item = (j && typeof j.item === 'object' && j.item) ? j.item : {};
      STATE.collection = { [STATE.weaponName]: { details: item.details || {} } };
    } catch (e) {
      console.error('loadGlobalDetails failed:', e);
      STATE.collection = {};
    }
  }

  async function saveGlobalDetails() {
    if (!isAdmin()) {
      toast('Only admin can save global details.');
      return false;
    }
    if (STATE.saving) return false;

    STATE.saving = true;
    try {
      const details = ensureWeaponDetailsEntry();
      const r = await fetch(url('/api/admin/hunter-weapon-details'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: STATE.weaponName, details })
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(out?.error || 'Save failed');
        return false;
      }

      await loadGlobalDetails();
      toast('Saved globally ✅');
      return true;
    } catch (e) {
      console.error('saveGlobalDetails failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.saving = false;
    }
  }

  async function loadAllGlobalDetails() {
    try {
      const r = await fetch(url('/api/public/hunter-weapon-details'), {
        credentials: 'include',
        cache: 'no-store'
      });
      const j = await r.json().catch(() => ({}));
      return (j && typeof j.items === 'object' && j.items) ? j.items : {};
    } catch (e) {
      console.error('loadAllGlobalDetails failed:', e);
      return {};
    }
  }

  async function saveWeaponDetailsByName(name, details) {
    const r = await fetch(url('/api/admin/hunter-weapon-details'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, details })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `Save failed for ${name}`);
    return out;
  }

  async function openHunterStatsModal() {
    if (!canShowAdminButtons() || STATE.hunterStatsSaving) return;

    detailsHWeaponShowModal('Stats', () => el('div', { class: 'dhw-wrap', style: 'padding:0' },
      el('div', { class: 'dhw-card dhw-editor-card' },
        el('div', { class: 'dhw-editor-head' },
          el('div', { class: 'dhw-editor-title' }, 'Stats')
        ),
        el('div', { class: 'dhw-muted' }, 'Loading hunters...')
      )
    ), null, '');

    try {
      const [hunters, allDetails] = await Promise.all([
        STATE.hunters.length ? Promise.resolve(STATE.hunters) : loadHunterCatalog(),
        loadAllGlobalDetails()
      ]);
      STATE.hunters = hunters;

      const statOptions = ['HP', 'Attack', 'Defense'];
      const weaponsByHunter = new Map();
      for (const w of (STATE.weapons || [])) {
        const hunter = String(w?.hunter || '').trim();
        if (!hunter) continue;
        if (!weaponsByHunter.has(hunter)) weaponsByHunter.set(hunter, []);
        weaponsByHunter.get(hunter).push(w);
      }

      const statForWeapon = (weaponName) => {
        const item = allDetails?.[weaponName];
        const d = item?.details || {};
        return normalizeStatLabel(d?.min?.statLabel || d?.max?.statLabel || 'HP');
      };

      const rows = [];
      const body = el('div', { class: 'dhw-wrap', style: 'padding:0' },
        el('div', { class: 'dhw-card dhw-editor-card' },
          el('div', { class: 'dhw-editor-head' },
            el('div', {},
              el('div', { class: 'dhw-editor-title' }, 'Stats'),
              el('div', { class: 'dhw-muted' }, 'Change Stat Type for every hunter weapon assigned to a character.')
            )
          )
        )
      );

      const list = el('div', { class: 'dhw-card dhw-editor-card', style: 'display:grid;gap:10px' });

      for (const hunter of hunters) {
        const assigned = weaponsByHunter.get(hunter.name) || [];
        const currentTypes = [...new Set(assigned.map(w => statForWeapon(w.name)))];
        const uniform = currentTypes.length === 1;
        const current = uniform ? currentTypes[0] : 'HP';
        const imgRel = String(hunter.image || '').trim().replace(/^\/?picture\/?/i, '');
        const imgSrc = imgRel ? url(`/picture/${imgRel}`) : hunterIconSrc(hunter.name);

        const select = el('select', { class: 'dhw-select', 'data-hunter': hunter.name, 'data-dirty': '0' });
        for (const opt of statOptions) {
          const o = el('option', { value: opt }, opt);
          if (opt === current) o.selected = true;
          select.append(o);
        }
        select.addEventListener('change', () => { select.dataset.dirty = '1'; });

        rows.push({ hunter: hunter.name, select, weapons: assigned });

        list.append(el('div', {
          class: 'dhw-card',
          style: 'display:flex;align-items:center;gap:12px;padding:10px;background:rgba(15,23,42,.55)'
        },
          imgSrc
            ? el('img', {
                src: cdnySafe(imgSrc, 96),
                alt: hunter.name,
                loading: 'lazy',
                decoding: 'async',
                style: 'width:54px;height:54px;border-radius:14px;object-fit:cover;border:1px solid rgba(148,163,184,.3);background:rgba(15,23,42,.8)',
                onerror: function () { this.style.display = 'none'; }
              })
            : el('div', { style: 'width:54px;height:54px;border-radius:14px;background:rgba(15,23,42,.8)' }),
          el('div', { style: 'min-width:0;flex:1' },
            el('div', { class: 'dhw-editor-title', style: 'font-size:15px' }, hunter.name),
            el('div', { class: 'dhw-muted' },
              assigned.length
                ? `${assigned.length} weapon(s)${uniform ? '' : ' - mixed stat types'}`
                : 'No assigned hunter weapons'
            )
          ),
          el('div', { style: 'min-width:160px' }, select)
        ));
      }

      body.append(list);

      const doSave = async () => {
        if (STATE.hunterStatsSaving) return;
        const dirty = rows.filter((row) => row.select.dataset.dirty === '1');
        if (!dirty.length) {
          toast('No stat changes.');
          return;
        }

        STATE.hunterStatsSaving = true;
        try {
          let changedWeapons = 0;
          for (const row of dirty) {
            const stat = normalizeStatLabel(row.select.value);
            for (const weapon of row.weapons) {
              const existing = allDetails?.[weapon.name]?.details || {};
              await saveWeaponDetailsByName(weapon.name, detailsWithStatLabel(existing, stat));
              changedWeapons++;
            }
          }

          await loadGlobalDetails();
          detailsHWeaponHideModal();
          toast(`Stats saved for ${changedWeapons} weapon(s)`);
          rerender();
        } catch (e) {
          console.error('save hunter stats failed:', e);
          toast(e?.message || 'Stats save failed');
        } finally {
          STATE.hunterStatsSaving = false;
        }
      };

      detailsHWeaponShowModal('Stats', () => body, doSave, 'SAVE');
    } catch (e) {
      console.error('openHunterStatsModal failed:', e);
      detailsHWeaponShowModal('Stats', () => el('div', { class: 'dhw-wrap', style: 'padding:0' },
        el('div', { class: 'dhw-card dhw-editor-card' },
          el('div', { class: 'dhw-editor-title' }, 'Stats'),
          el('div', { class: 'dhw-muted' }, 'Failed to load hunters.')
        )
      ), null, '');
    }
  }

  function ensureHunterWeaponModal() {
    if (document.getElementById('dhw-modal-css')) return;

    const s = document.createElement('style');
    s.id = 'dhw-modal-css';
    s.textContent = `
      .dhwm-backdrop{
        position:fixed;inset:0;display:none;align-items:center;justify-content:center;
        z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)
      }
      .dhwm-modal{
        width:min(1100px,94vw);
        max-height:88vh;
        border-radius:1rem;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(2,6,23,.92);
        color:#e2e8f0;
        box-shadow:0 18px 60px rgba(0,0,0,.55);
        overflow:hidden
      }
      .dhwm-hd{
        padding:14px 16px;
        border-bottom:1px solid rgba(148,163,184,.20);
        font-weight:900;
        letter-spacing:.2px
      }
      .dhwm-bd{
        padding:16px;
        max-height:70vh;
        overflow:auto
      }
      .dhwm-ft{
        padding:12px 16px;
        border-top:1px solid rgba(148,163,184,.20);
        display:flex;
        gap:.5rem;
        justify-content:flex-end;
        align-items:center;
      }
      .dhwm-btn{
        height:40px;
        padding:0 14px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.28);
        background:rgba(15,23,42,.55);
        color:#e2e8f0;
        cursor:pointer;
        font-weight:900;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      }
      .dhwm-btn.primary{
        background:rgba(255,255,255,.95);
        color:#0f172a;
        border-color:rgba(226,232,240,.85)
      }
      .dhwm-btn.ghost{
        background:transparent
      }
    `;
    document.head.appendChild(s);

    const root = document.createElement('div');
    root.id = 'dhw-modal-root';
    root.className = 'dhwm-backdrop';
    root.innerHTML = `
      <div class="dhwm-modal">
        <div class="dhwm-hd" id="dhwmTitle"></div>
        <div class="dhwm-bd" id="dhwmBody"></div>
        <div class="dhwm-ft">
          <button class="dhwm-btn ghost" id="dhwmClose" type="button">CLOSE</button>
          <button class="dhwm-btn primary" id="dhwmPrimary" type="button" style="display:none">SAVE</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    function hide() {
      root.style.display = 'none';
      const bd = document.getElementById('dhwmBody');
      if (bd) bd.innerHTML = '';
      const prim = document.getElementById('dhwmPrimary');
      if (prim) prim.onclick = null;
    }

    function show(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
      const t = document.getElementById('dhwmTitle');
      if (t) t.textContent = title || '';

      const bd = document.getElementById('dhwmBody');
      if (bd) {
        bd.innerHTML = '';
        const built = (typeof bodyBuilder === 'function') ? bodyBuilder() : null;
        if (built) bd.append(built);
      }

      const prim = document.getElementById('dhwmPrimary');
      if (prim) {
        const hasPrimary = typeof onPrimary === 'function';
        prim.style.display = hasPrimary ? 'inline-flex' : 'none';
        prim.textContent = primaryText || 'SAVE';
        prim.onclick = hasPrimary ? onPrimary : null;
      }

      root.style.display = 'flex';
      const close = document.getElementById('dhwmClose');
      if (close) close.onclick = hide;
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

    window.__details_hweapon_hideModal = hide;
    window.__details_hweapon_showModal = show;
  }

  function detailsHWeaponShowModal(title, bodyBuilder, onPrimary = null, primaryText = 'SAVE') {
    ensureHunterWeaponModal();
    window.__details_hweapon_showModal?.(title, bodyBuilder, onPrimary, primaryText);
  }

  function detailsHWeaponHideModal() {
    try { window.__details_hweapon_hideModal?.(); } catch (_) {}
  }

  function openGlobalStatsModal() {
    if (!canShowAdminButtons()) return;

    const gs = getGlobalStats();

    const field = (id, label, value) => el('div', { class: 'dhw-field' },
      el('label', { for: id }, label),
      el('input', {
        id,
        class: 'dhw-input',
        type: 'number',
        value: String(value ?? ''),
        inputmode: 'numeric'
      })
    );

    const section = (title, prefix, data) => el('div', { class: 'dhw-card dhw-editor-card' },
      el('div', { class: 'dhw-editor-head' },
        el('div', { class: 'dhw-editor-title' }, title)
      ),
      el('div', { class: 'dhw-grid' },
        field(`${prefix}-min-stat`, 'Min Stat Value', data.minStat),
        field(`${prefix}-max-stat`, 'Max Stat Value', data.maxStat),
        field(`${prefix}-min-tp`, 'Min Total Power', data.minTotalPower),
        field(`${prefix}-max-tp`, 'Max Total Power', data.maxTotalPower)
      )
    );

    const body = el('div', { class: 'dhw-wrap', style: 'padding:0' },
      el('div', { class: 'dhw-card dhw-editor-card' },
        el('div', { class: 'dhw-editor-head' },
          el('div', { class: 'dhw-editor-title' }, 'Global Stats')
        ),
        el('div', { class: 'dhw-grid' },
          field('gs-level-min', 'Lv. Min', gs.levelMin),
          field('gs-level-max', 'Lv. Max', gs.levelMax),
          field('gs-adv-min', 'Advancement Min', gs.advMin),
          field('gs-adv-max', 'Advancement Max', gs.advMax),
          field('gs-precision-max', 'Precision Max', gs.precisionMax)
        )
      ),
      section('HP', 'hp', gs.hp),
      section('Attack', 'attack', gs.attack),
      section('Defense', 'defense', gs.defense)
    );

    const doSave = async () => {
      const num = (id, fallback) => {
        const v = qs(`#${id}`)?.value?.trim();
        return Number.isFinite(+v) ? Math.floor(+v) : fallback;
      };

      const next = {
        levelMin: num('gs-level-min', gs.levelMin),
        levelMax: num('gs-level-max', gs.levelMax),
        advMin: num('gs-adv-min', gs.advMin),
        advMax: num('gs-adv-max', gs.advMax),
        precisionMax: num('gs-precision-max', gs.precisionMax),
        hp: {
          minStat: num('hp-min-stat', gs.hp.minStat),
          maxStat: num('hp-max-stat', gs.hp.maxStat),
          minTotalPower: num('hp-min-tp', gs.hp.minTotalPower),
          maxTotalPower: num('hp-max-tp', gs.hp.maxTotalPower)
        },
        attack: {
          minStat: num('attack-min-stat', gs.attack.minStat),
          maxStat: num('attack-max-stat', gs.attack.maxStat),
          minTotalPower: num('attack-min-tp', gs.attack.minTotalPower),
          maxTotalPower: num('attack-max-tp', gs.attack.maxTotalPower)
        },
        defense: {
          minStat: num('defense-min-stat', gs.defense.minStat),
          maxStat: num('defense-max-stat', gs.defense.maxStat),
          minTotalPower: num('defense-min-tp', gs.defense.minTotalPower),
          maxTotalPower: num('defense-max-tp', gs.defense.maxTotalPower)
        }
      };

      const ok = await saveGlobalStats(next);
      if (ok) {
        detailsHWeaponHideModal();
        rerender();
      }
    };

    detailsHWeaponShowModal('Global Stats', () => body, doSave, 'SAVE');
  }

  function applyAutoDefaultsToForm(statLabel) {
    const preset = autoSlot(STATE.statMode, statLabel);
    const lvl = qs('#dhw-lvl');
    const adv = qs('#dhw-adv');
    const totalPower = qs('#dhw-total-power');
    const statValue = qs('#dhw-stat-value');
    const precision = qs('#dhw-precision');
    if (lvl) lvl.value = preset.lvl || '';
    if (adv) adv.value = preset.adv || '';
    if (totalPower) totalPower.value = preset.totalPower || '';
    if (statValue) statValue.value = preset.statValue || '';
    if (precision && STATE.statMode === 'max') precision.value = preset.precision || '';
  }

  async function loadWeaponCatalog() {

    const j = await fetchJsonTry([
      '/api/public/hunter-weapons'
    ]);

    const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    if (!Array.isArray(list)) throw new Error('Invalid hunter weapon catalog');

    return list.map((w) => ({
      name: String(w.name || w.weapon_name || w.id || '').trim(),
      rarity: normalizeRarity(w.rarity),
      element: normalizeElement(w.element),
      image: w.image || '',
      image_build: w.image_build || w.imageBuild || w.image || '',
      hunter: String(w.hunter || w.owner || w.hunter_name || '').trim()
    })).filter(x => x.name);
  }

  async function loadHunterCatalog() {
    const j = await fetchJsonTry([
      '/api/public/hunters'
    ]);

    const list = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
    if (!Array.isArray(list)) throw new Error('Invalid hunter catalog');

    return list.map((h) => ({
      name: String(h.name || h.id || '').trim(),
      image: String(h.image_build || h.imageBuild || h.image || '').trim(),
      element: normalizeElement(h.element),
      rarity: normalizeRarity(h.rarity)
    })).filter(x => x.name);
  }

  async function loadGlobalWeaponOrder() {
    try {
      const r = await fetch(url('/api/global/order?dataset=hunterWeapons'), {
        cache: 'no-store',
        credentials: 'include'
      });
      if (!r.ok) return [];
      const j = await r.json().catch(() => ({}));
      return Array.isArray(j?.order) ? j.order : [];
    } catch (_) {
      return [];
    }
  }

  function applyWeaponOrder(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name || '').trim(), idx));

    const copy = [...(Array.isArray(list) ? list : [])];
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

  function findWeaponBySlug(list, slug) {
    const wanted = String(slug || '').trim();
    if (!wanted) return null;

    for (const w of list) {
      if (slugifyWeaponName(w.name) === wanted) return w;
      if (String(w.name).replace(/\s+/g, '_') === wanted) return w;
      if (String(w.name).replace(/\s+/g, '').toLowerCase() === wanted.replace(/_/g, '').toLowerCase()) return w;
    }
    return null;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replaceTagToHtml(text, tagName, color) {
    const re = new RegExp(`\\[${escapeRegExp(tagName)}\\]([\\s\\S]*?)\\[\\/${escapeRegExp(tagName)}\\]`, 'gi');
    return text.replace(re, `<span style="color:${color};font-weight:700">$1</span>`);
  }

  function renderMarkupToHtml(input) {
    let html = escHtml(String(input || ''));
  
    html = replaceTagToHtml(html, 'fire', TAG_COLORS.fire);
    html = replaceTagToHtml(html, 'water', TAG_COLORS.water);
    html = replaceTagToHtml(html, 'wind', TAG_COLORS.wind);
    html = replaceTagToHtml(html, 'light', TAG_COLORS.light);
    html = replaceTagToHtml(html, 'dark', TAG_COLORS.dark);
  
    html = replaceTagToHtml(html, 'keyword', TAG_COLORS.keyword);
    html = replaceTagToHtml(html, 'keyword2', TAG_COLORS.keyword2);
    html = replaceTagToHtml(html, 'debuff', TAG_COLORS.debuff);
    html = replaceTagToHtml(html, 'break', TAG_COLORS.break);
  
    return html.replace(/\n/g, '<br>');
  }

  function wrapSelectionWithTag(tagName) {
    const box = qs('#dhw-richbox');
    if (!box) return;

    box.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!box.contains(range.commonAncestorContainer)) return;

    const selectedText = range.toString();
    const open = `[${tagName}]`;
    const close = `[/${tagName}]`;
    const textNode = document.createTextNode(`${open}${selectedText}${close}`);

    range.deleteContents();
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    sel.removeAllRanges();
    sel.addRange(range);

    updatePreviewFromEditor();
  }

  function getEditorPlainText() {
    const box = qs('#dhw-richbox');
    if (!box) return '';
    return box.innerText.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');
  }

  function updatePreviewFromEditor() {
    const preview = qs('#dhw-viewbox-live');
    if (!preview) return;

    const raw = getEditorPlainText().trim();
    if (!raw) {
      preview.innerHTML = '<div class="dhw-empty">No description yet.</div>';
      return;
    }

    preview.innerHTML = renderMarkupToHtml(raw);
  }

  function setRichColor(color) {
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, color);
    } catch (e) {
      console.warn('Color command failed', e);
    }
  }

  function renderReadView(details) {
    const raw = String(details.description || '').trim();
    return el('div', { class: 'dhw-viewbox' },
      raw
        ? (() => {
            const wrap = document.createElement('div');
            wrap.innerHTML = renderMarkupToHtml(raw);
            return wrap;
          })()
        : el('div', { class: 'dhw-empty' }, 'No description yet.')
    );
  }

  function addStylesOnce() {
    if (document.getElementById('details-hweapon-styles')) return;

    const css = `
      .dhw-wrap{padding:20px;display:grid;gap:18px}
      .dhw-card{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
      .dhw-top{display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px}
      .dhw-left,.dhw-right{min-width:0}
      .dhw-slider{position:relative;border-radius:24px;min-height:400px;overflow:hidden;background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(30,41,59,.8));border:1px solid rgba(148,163,184,.16);display:grid;place-items:center}
      .dhw-main-skin{max-width:100%;max-height:400px;object-fit:contain;border-radius:18px}
      .dhw-arrow{position:absolute;top:50%;transform:translateY(-50%);width:50px;height:50px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96));color:#fff;cursor:pointer;font-size:0;display:grid;place-items:center;backdrop-filter:blur(10px);box-shadow:0 10px 26px rgba(0,0,0,.28);transition:transform .16s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;z-index:3}
      .dhw-arrow::before{content:'';width:12px;height:12px;border-top:3px solid #fff;border-right:3px solid #fff;display:block}
      .dhw-arrow:hover{background:linear-gradient(180deg, rgba(51,65,85,.98), rgba(30,41,59,.98));border-color:rgba(250,199,0,.45);box-shadow:0 14px 34px rgba(0,0,0,.35);transform:translateY(-50%) scale(1.05)}
      .dhw-arrow:active{transform:translateY(-50%) scale(.98)}
      .dhw-arrow.left{left:14px}
      .dhw-arrow.left::before{transform:rotate(-135deg);margin-left:4px}
      .dhw-arrow.right{right:14px}
      .dhw-arrow.right::before{transform:rotate(45deg);margin-right:4px}
      .dhw-dots{display:flex;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap}
      .dhw-dot{width:10px;height:10px;border-radius:999px;border:none;cursor:pointer;background:rgba(255,255,255,.25)}
      .dhw-dot.active{background:#fff;width:24px}
      .dhw-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .dhw-head > .dhw-toggle{align-self:flex-start}
      .dhw-head-main{min-width:0;flex:1}
      .dhw-title-row{display:block}
      .dhw-title{font-size:34px;font-weight:1000;line-height:1.05;color:#f8fafc}
      .dhw-sub{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .dhw-badge{height:34px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.15);font-weight:900;color:#e2e8f0}
      .dhw-badge img{height:25px;width:auto;object-fit:contain}
      .dhw-badge.only-img{padding:0 10px}
      .dhw-toggle{display:inline-flex;align-items:center;gap:6px;width:auto;flex:0 0 auto;padding:6px;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
      .dhw-toggle button{min-width:78px;height:42px;flex:0 0 auto;padding:0 16px;border:1px solid transparent;border-radius:12px;cursor:pointer;background:transparent;color:#cbd5e1;font-size:15px;font-weight:1000;letter-spacing:.01em;transition:background .15s ease,color .15s ease,border-color .15s ease,transform .15s ease}
      .dhw-toggle button:hover{background:rgba(255,255,255,.05);color:#f8fafc}
      .dhw-toggle button.active{background:#facc15;color:#111827;border-color:rgba(250,204,21,.9);box-shadow:0 6px 16px rgba(250,204,21,.18)}
      .dhw-stats{display:grid;gap:12px;margin-top:18px}
      .dhw-stat{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:18px;padding:14px;text-align:center}
      .dhw-stat-label{font-size:13px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
      .dhw-stat-value{font-size:24px;font-weight:1000;color:#f8fafc;margin-top:6px}
      .dhw-inline-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .dhw-mini{border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.5);border-radius:18px;padding:14px;text-align:center}
      .dhw-mini-label{font-size:12px;font-weight:900;color:#94a3b8;text-transform:uppercase}
      .dhw-mini-value{font-size:22px;font-weight:1000;color:#f8fafc;margin-top:6px}
      .dhw-mini-value img{height:34px;width:auto;object-fit:contain;display:block}
      .dhw-owner{display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px 14px;border-radius:18px;background:rgba(15,23,42,.45);border:1px solid rgba(148,163,184,.14)}
      .dhw-owner img{width:52px;height:52px;border-radius:14px;object-fit:cover;background:rgba(255,255,255,.08)}.dhw-owner-text{min-width:0}
      .dhw-editor-card{padding:18px 20px}
      .dhw-editor-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
      .dhw-pagebar{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:0 2px}
      .dhw-page-head{display:grid;gap:4px}
      .dhw-editor-title{font-size:24px;font-weight:800;line-height:1.25;color:#0f172a}
      .dark .dhw-editor-title{color:#facc15}

      .dhw-page-subtitle{font-size:14px;color:rgba(71,85,105,.95)}
      .dark .dhw-page-subtitle{color:rgba(203,213,225,.9)}
      .dhw-btns{display:flex;gap:10px;flex-wrap:wrap;width:auto;flex:0 0 auto;justify-content:flex-end}
      .dhw-btn{height:42px;padding:0 16px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.75);color:#f8fafc;font-weight:900;cursor:pointer}
      .dhw-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .dhw-btn:hover{background:rgba(30,41,59,.95)}
      .dhw-btn.back{height:40px;padding:0 14px;border-radius:14px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:rgba(226,232,240,.95);font-weight:800;display:inline-flex;align-items:center;gap:10px;transition:transform .15s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease;outline:none}
      .dhw-btn.nav{max-width:220px}
      .dhw-btn.nav span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dhw-btn.back:hover{background:rgba(255,255,255,.10);border-color:rgba(148,163,184,.38);color:rgba(255,255,255,.98);transform:translateY(-1px)}
      .dhw-btn.back:focus-visible{box-shadow:0 0 0 3px rgba(250,204,21,.35);border-color:rgba(250,204,21,.55)}
      .dhw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
      .dhw-field{display:grid;gap:8px}
      .dhw-field label{font-size:13px;font-weight:900;color:#94a3b8}
      .dhw-input,.dhw-select{height:46px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.6);color:#f8fafc;padding:0 14px;font-size:16px;font-weight:800}
      .dhw-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
      .dhw-color-btn{min-width:70px;height:38px;padding:0 12px;border-radius:12px;border:none;cursor:pointer;color:#0f172a;font-weight:1000}
      .dhw-richbox{min-height:180px;margin-top:12px;border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.45);color:#f8fafc;padding:16px;outline:none;line-height:1.65;white-space:pre-wrap}
      .dhw-viewbox{min-height:180px;margin-top:14px;border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.38);color:#f8fafc;padding:16px;line-height:1.65;white-space:pre-wrap}
      .dhw-muted{color:#94a3b8}
      .dhw-empty{color:#64748b;font-style:italic}
      .dhw-clickable{cursor:zoom-in}
      .dhw-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.86);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px)}
      .dhw-lightbox-card{width:min(1200px,96vw);height:min(90vh,900px);border-radius:24px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.96));box-shadow:0 20px 60px rgba(0,0,0,.45);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}
      .dhw-lightbox-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}
      .dhw-lightbox-title{font-size:18px;font-weight:1000;color:#facc15}
      .dhw-lightbox-close{width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.6);color:#fff;cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center}
      .dhw-lightbox-body{position:relative;display:flex;align-items:center;justify-content:center;padding:24px 72px;overflow:hidden;min-height:0}
      .dhw-lightbox-img{display:block;width:auto !important;height:auto !important;max-width:min(100%, 760px);max-height:min(100%, 58vh);object-fit:contain;object-position:center center;user-select:none;margin:auto;filter:drop-shadow(0 10px 26px rgba(0,0,0,.28))}
      .dhw-lightbox-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:18px 20px;border-top:1px solid rgba(148,163,184,.14)}
      .dhw-lightbox-foot-title{color:#e2e8f0;font-weight:800;}
      .dhw-lightbox-actions{display:flex;gap:10px;flex-wrap:wrap}
      .dhw-download{text-decoration:none;display:inline-flex;align-items:center;gap:8px}
      .sla-hide-admin-buttons .dhw-admin-only{display:none !important}
      @media (max-width: 980px){
        .dhw-wrap{padding:14px;gap:14px}
        .dhw-top{grid-template-columns:1fr;gap:14px;padding:14px}
        .dhw-head{flex-direction:column;align-items:stretch;gap:12px}
        .dhw-toggle{width:auto;justify-content:flex-start}
        .dhw-head > .dhw-toggle{align-self:flex-start}
        .dhw-btns{width:auto;flex:0 0 auto}
        .dhw-inline-meta,.dhw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media (max-width: 640px){
        .dhw-wrap{padding:10px;gap:12px}
        .dhw-card{border-radius:18px}
        .dhw-top{padding:12px;gap:12px}
        .dhw-pagebar{gap:10px;align-items:stretch}
        .dhw-page-head{gap:2px}
        .dhw-page-subtitle{font-size:12px}
        .dhw-editor-title{font-size:20px;line-height:1.15}
        .dhw-btns{width:auto;gap:8px;flex:0 0 auto}
        .dhw-btn.nav{flex:1;max-width:none;justify-content:center}
        .dhw-btn.nav span{max-width:120px}
        .dhw-btn,.dhw-btn.back{height:38px;padding:0 12px;border-radius:12px;font-size:13px}
        .dhw-slider{min-height:220px;padding:12px;border-radius:18px}
        .dhw-main-skin{max-height:220px}
        .dhw-arrow{width:42px;height:42px}
        .dhw-arrow.left{left:8px}
        .dhw-arrow.right{right:8px}
        .dhw-dots{margin-top:8px;gap:6px}
        .dhw-dot{width:8px;height:8px}
        .dhw-dot.active{width:20px}
        .dhw-title{font-size:18px;line-height:1.15}
        .dhw-sub{gap:8px;margin-top:8px}
        .dhw-badge{height:30px;padding:0 10px;font-size:13px}
        .dhw-badge img{height:20px}
        .dhw-toggle{width:auto;padding:4px;border-radius:14px}
        .dhw-head > .dhw-toggle{align-self:flex-start}
        .dhw-toggle button{flex:0 0 auto;min-width:64px;height:36px;padding:0 10px;font-size:14px;border-radius:10px}
        .dhw-inline-meta{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
        .dhw-stats{gap:10px;margin-top:12px}
        .dhw-stat,.dhw-mini{padding:12px 10px;border-radius:14px}
        .dhw-stat-label,.dhw-mini-label{font-size:11px}
        .dhw-stat-value,.dhw-mini-value{font-size:16px;margin-top:4px}
        .dhw-mini-value img{height:24px}
        .dhw-owner{margin-top:12px;padding:10px 12px;border-radius:14px;gap:10px}
        .dhw-owner img{width:44px;height:44px;border-radius:12px}
        .dhw-owner .dhw-mini-value{font-size:16px !important}
        .dhw-editor-card{padding:14px}
        .dhw-editor-head{gap:10px}
        .dhw-grid{grid-template-columns:1fr;gap:10px;margin-top:12px}
        .dhw-field{gap:6px}
        .dhw-field label{font-size:12px}
        .dhw-input,.dhw-select{height:42px;padding:0 12px;font-size:14px;border-radius:12px}
        .dhw-toolbar{gap:6px;margin-top:12px}
        .dhw-color-btn{min-width:56px;height:34px;padding:0 10px;border-radius:10px;font-size:12px}
        .dhw-richbox,.dhw-viewbox{min-height:140px;margin-top:12px;padding:12px;border-radius:14px;font-size:14px;line-height:1.55}
        .dhw-lightbox{padding:10px}
        .dhw-lightbox-card{width:100%;height:min(92vh,900px);border-radius:18px}
        .dhw-lightbox-head,.dhw-lightbox-foot{padding:12px 14px}
        .dhw-lightbox-body{padding:12px 46px}
        .dhw-lightbox-title{font-size:15px}
        .dhw-lightbox-img{max-width:min(100%, 92vw);max-height:min(100%, 48vh)}
      }
    `;

    document.head.append(el('style', { id: 'details-hweapon-styles' }, css));
  }

  function renderSkinSlider() {
    const box = el('div', {});
    const src = STATE.skins[STATE.skinIndex] || weaponImgSrc(STATE.weapon);

    const slider = el('div', { class: 'dhw-slider' });
    const img = el('img', {
      class: 'dhw-main-skin dhw-clickable',
      src: cdnySafe(src, 768),
      alt: STATE.weaponName || 'Weapon skin',
      loading: 'eager',
      decoding: 'async',
      title: 'Click to enlarge'
    });

    img.addEventListener('click', () => {
      STATE.lightboxOpen = true;
      rerender();
    });

    slider.append(img);

    if (STATE.skins.length > 1) {
      const prev = el('button', { class: 'dhw-arrow left', type: 'button', title: 'Previous skin', 'aria-label': 'Previous skin' });
      const next = el('button', { class: 'dhw-arrow right', type: 'button', title: 'Next skin', 'aria-label': 'Next skin' });

      prev.addEventListener('click', () => {
        prevSkin();
        rerender();
      });
      next.addEventListener('click', () => {
        nextSkin();
        rerender();
      });

      slider.append(prev, next);
    }

    box.append(slider);

    if (STATE.skins.length > 1) {
      const dots = el('div', { class: 'dhw-dots' });
      STATE.skins.forEach((_, i) => {
        const btn = el('button', {
          class: `dhw-dot ${i === STATE.skinIndex ? 'active' : ''}`,
          type: 'button',
          title: i === 0 ? 'Original' : `Skin ${i}`
        });
        btn.addEventListener('click', () => {
          STATE.skinIndex = i;
          rerender();
        });
        dots.append(btn);
      });
      box.append(dots);
    }

    return box;
  }

  function renderLightbox() {
    if (!STATE.lightboxOpen) return null;

    const src = STATE.skins[STATE.skinIndex] || weaponImgSrc(STATE.weapon) || '';
    const overlay = el('div', { class: 'dhw-lightbox' });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    const card = el('div', { class: 'dhw-lightbox-card' });

    const head = el('div', { class: 'dhw-lightbox-head' },
      el('div', { class: 'dhw-lightbox-title' }, `${STATE.weaponName} - Skin Gallery`),
      el('button', {
        class: 'dhw-lightbox-close',
        type: 'button',
        'aria-label': 'Close',
        onclick: () => closeLightbox()
      }, el('i', { class: 'fa-solid fa-xmark' }))
    );

    const body = el('div', { class: 'dhw-lightbox-body' },
      el('img', {
        class: 'dhw-lightbox-img',
        src,
        alt: STATE.weaponName || 'Weapon skin'
      })
    );

    if (STATE.skins.length > 1) {
      const prev = el('button', {
        class: 'dhw-arrow left',
        type: 'button',
        title: 'Previous skin',
        'aria-label': 'Previous skin',
        onclick: (e) => {
          e.stopPropagation();
          prevSkin();
          rerender();
        }
      });

      const next = el('button', {
        class: 'dhw-arrow right',
        type: 'button',
        title: 'Next skin',
        'aria-label': 'Next skin',
        onclick: (e) => {
          e.stopPropagation();
          nextSkin();
          rerender();
        }
      });

      body.append(prev, next);
    }

    const foot = el('div', { class: 'dhw-lightbox-foot' },
      el('div', { class: 'dhw-lightbox-foot-title' }, currentSkinLabel()),
      el('div', { class: 'dhw-lightbox-actions' },
        el('button', {
          class: 'dhw-btn dhw-download',
          type: 'button',
          onclick: () => downloadCurrentImage()
        },
          el('i', { class: 'fa-solid fa-download' }),
          'Download'
        ),
        el('button', {
          class: 'dhw-btn',
          type: 'button',
          onclick: () => closeLightbox()
        }, 'Close')
      )
    );

    card.append(head, body, foot);
    overlay.append(card);
    return overlay;
  }

  function renderStatBlock(label, value) {
    return el('div', { class: 'dhw-stat' },
      el('div', { class: 'dhw-stat-label' }, label),
      el('div', { class: 'dhw-stat-value' }, value || '—')
    );
  }

  function renderMini(label, value, isHtml = false) {
    const valueNode = el('div', { class: 'dhw-mini-value' });
    if (isHtml) valueNode.innerHTML = value || '—';
    else valueNode.textContent = value || '—';
    return el('div', { class: 'dhw-mini' },
      el('div', { class: 'dhw-mini-label' }, label),
      valueNode
    );
  }

  function renderEditor(details) {
    const card = el('div', { class: 'dhw-card dhw-editor-card' });

    const head = el('div', { class: 'dhw-editor-head' },
      el('div', { class: 'dhw-editor-title' }, 'Weapon Details'),
      el('div', { class: 'dhw-btns' },
        ...(canShowAdminButtons() && STATE.editMode
          ? [
              el('div', { class: 'dhw-toggle dhw-admin-only' },
                el('button', {
                  type: 'button',
                  class: STATE.statMode === 'min' ? 'active' : '',
                  onclick: () => {
                    collectCurrentFormToState();
                    STATE.statMode = STATE.statMode === 'min' ? 'max' : 'min';
                    rerender();
                  }
                }, 'Min'),
                el('button', {
                  type: 'button',
                  class: STATE.statMode === 'max' ? 'active' : '',
                  onclick: () => {
                    collectCurrentFormToState();
                    STATE.statMode = STATE.statMode === 'max' ? 'min' : 'max';
                    rerender();
                  }
                }, 'Max')
              )
            ]
          : []),
          
        ...(canShowAdminButtons()
          ? [
              el('button', {
                class: 'dhw-btn dhw-admin-only',
                type: 'button',
                onclick: () => {
                  STATE.editMode = !STATE.editMode;
                  rerender();
                }
              }, STATE.editMode ? 'Close edit' : 'Edit')
            ]
          : []),
          
        ...(canShowAdminButtons() && STATE.editMode
          ? [
              el('button', {
                class: 'dhw-btn dhw-admin-only',
                type: 'button',
                onclick: async () => {
                  collectCurrentFormToState();
                  const ok = await saveGlobalDetails();
                  if (ok) rerender();
                }
              }, STATE.saving ? 'Saving...' : 'Save')
            ]
          : [])
      )
    );

    card.append(head);

    if (!STATE.editMode || !canShowAdminButtons()) {
      card.append(renderReadView(details));
      return card;
    }

    const statOptions = ['HP', 'Attack', 'Defense'];
    const grid = el('div', { class: 'dhw-grid' },
      el('div', { class: 'dhw-field' },
        el('label', { for: 'dhw-lvl' }, 'Lv.'),
        el('input', { id: 'dhw-lvl', class: 'dhw-input', value: details.lvl || '', placeholder: 'e.g. 100' })
      ),
      el('div', { class: 'dhw-field' },
        el('label', { for: 'dhw-adv' }, 'Advancement'),
        el('input', { id: 'dhw-adv', class: 'dhw-input', value: details.adv || '', placeholder: 'e.g. 5' })
      ),
      el('div', { class: 'dhw-field' },
        el('label', { for: 'dhw-total-power' }, 'Total Power'),
        el('input', { id: 'dhw-total-power', class: 'dhw-input', value: details.totalPower || '', placeholder: 'e.g. 53,820' })
      ),
      el('div', { class: 'dhw-field' },
        el('label', { for: 'dhw-stat-label' }, 'Stat Type'),
        (() => {
          const select = el('select', { id: 'dhw-stat-label', class: 'dhw-select' });
          statOptions.forEach((opt) => {
            const o = el('option', { value: opt }, opt);
            if ((details.statLabel || '') === opt) o.selected = true;
            select.append(o);
          });
          if (!details.statLabel) select.value = 'HP';
          select.addEventListener('change', () => applyAutoDefaultsToForm(select.value));
          return select;
        })()
      ),
      el('div', { class: 'dhw-field' },
        el('label', { for: 'dhw-stat-value' }, 'Stat Value'),
        el('input', { id: 'dhw-stat-value', class: 'dhw-input', value: details.statValue || '', placeholder: 'e.g. 4,120' })
      )
    );
    card.append(grid);

    if (STATE.statMode === 'max') {
      card.append(
        el('div', { class: 'dhw-grid' },
          el('div', { class: 'dhw-field' },
            el('label', { for: 'dhw-precision' }, 'Precision'),
            el('input', { id: 'dhw-precision', class: 'dhw-input', value: details.precision || '', placeholder: 'e.g. 4,000' })
          )
        )
      );
    }

    const toolbar = el('div', { class: 'dhw-toolbar' });
    COLOR_BTNS.forEach(({ label, color, mode, tag }) => {
      const btn = el('button', {
        class: 'dhw-color-btn',
        type: 'button',
        style: `background:${color};`,
        title: label
      }, label);

      btn.addEventListener('click', () => {
        const box = qs('#dhw-richbox');
        if (!box) return;
        box.focus();

        if (mode === 'tag' && tag) {
          wrapSelectionWithTag(tag);
        } else {
          setRichColor(color);
        }
      });

      toolbar.append(btn);
    });

    const richbox = el('div', {
      id: 'dhw-richbox',
      class: 'dhw-richbox',
      contenteditable: 'true',
      spellcheck: 'false'
    });

    const initialText = String(details.description || '').trim();

    richbox.innerText = initialText;

    richbox.addEventListener('input', () => {
      updatePreviewFromEditor();
    });

    const previewLabel = el('div', { class: 'dhw-field', style: 'margin-top:14px' },
      el('label', {}, 'Preview')
    );

    const preview = el('div', { id: 'dhw-viewbox-live', class: 'dhw-viewbox' });

    card.append(toolbar, richbox, previewLabel, preview);

    setTimeout(() => updatePreviewFromEditor(), 0);

    return card;
  }

  function renderGlobalStatsEditor() {
    if (!canShowAdminButtons() || !STATE.globalEditMode) return null;

    const gs = getGlobalStats();
    const field = (id, label, value) => el('div', { class: 'dhw-field' },
      el('label', { for: id }, label),
      el('input', { id, class: 'dhw-input', value: String(value ?? ''), inputmode: 'numeric' })
    );

    const section = (title, prefix, data) => el('div', { class: 'dhw-card dhw-editor-card' },
      el('div', { class: 'dhw-editor-head' },
        el('div', { class: 'dhw-editor-title' }, title)
      ),
      el('div', { class: 'dhw-grid' },
        field(`${prefix}-min-stat`, 'Min Stat Value', data.minStat),
        field(`${prefix}-max-stat`, 'Max Stat Value', data.maxStat),
        field(`${prefix}-min-tp`, 'Min Total Power', data.minTotalPower),
        field(`${prefix}-max-tp`, 'Max Total Power', data.maxTotalPower)
      )
    );

    return el('div', { class: 'dhw-wrap', style: 'padding:0' },
      el('div', { class: 'dhw-card dhw-editor-card' },
        el('div', { class: 'dhw-editor-head' },
          el('div', { class: 'dhw-editor-title' }, 'Global Stats'),
          el('div', { class: 'dhw-btns' },
            el('button', {
              class: 'dhw-btn dhw-admin-only',
              type: 'button',
              onclick: () => { STATE.globalEditMode = false; rerender(); }
            }, 'Close'),
            el('button', {
              class: 'dhw-btn dhw-admin-only',
              type: 'button',
              onclick: async () => {
                const num = (id, fallback) => {
                  const v = qs(`#${id}`)?.value?.trim();
                  return Number.isFinite(+v) ? Math.floor(+v) : fallback;
                };
                const next = {
                  levelMin: num('gs-level-min', gs.levelMin),
                  levelMax: num('gs-level-max', gs.levelMax),
                  advMin: num('gs-adv-min', gs.advMin),
                  advMax: num('gs-adv-max', gs.advMax),
                  precisionMax: num('gs-precision-max', gs.precisionMax),
                  hp: {
                    minStat: num('hp-min-stat', gs.hp.minStat),
                    maxStat: num('hp-max-stat', gs.hp.maxStat),
                    minTotalPower: num('hp-min-tp', gs.hp.minTotalPower),
                    maxTotalPower: num('hp-max-tp', gs.hp.maxTotalPower)
                  },
                  attack: {
                    minStat: num('attack-min-stat', gs.attack.minStat),
                    maxStat: num('attack-max-stat', gs.attack.maxStat),
                    minTotalPower: num('attack-min-tp', gs.attack.minTotalPower),
                    maxTotalPower: num('attack-max-tp', gs.attack.maxTotalPower)
                  },
                  defense: {
                    minStat: num('defense-min-stat', gs.defense.minStat),
                    maxStat: num('defense-max-stat', gs.defense.maxStat),
                    minTotalPower: num('defense-min-tp', gs.defense.minTotalPower),
                    maxTotalPower: num('defense-max-tp', gs.defense.maxTotalPower)
                  }
                };
                const ok = await saveGlobalStats(next);
                if (ok) rerender();
              }
            }, STATE.globalSaving ? 'Saving...' : 'Save Global Stats')
          )
        ),
        el('div', { class: 'dhw-grid' },
          field('gs-level-min', 'Lv. Min', gs.levelMin),
          field('gs-level-max', 'Lv. Max', gs.levelMax),
          field('gs-adv-min', 'Advancement Min', gs.advMin),
          field('gs-adv-max', 'Advancement Max', gs.advMax),
          field('gs-precision-max', 'Precision Max', gs.precisionMax)
        )
      ),
      section('HP', 'hp', gs.hp),
      section('Attack', 'attack', gs.attack),
      section('Defense', 'defense', gs.defense)
    );
  }

  function renderTopInfo() {
    const details = currentDetails();

    const head = el('div', { class: 'dhw-head' },
      el('div', { class: 'dhw-head-main' },
        el('div', { class: 'dhw-title-row' },
          el('div', { class: 'dhw-title' }, STATE.weaponName),
          el('div', { class: 'dhw-sub' },
            el('div', { class: 'dhw-badge only-img' },
              el('img', { src: rarityImg(STATE.weapon.rarity), alt: STATE.weapon.rarity })
            ),
            el('div', { class: 'dhw-badge' },
              el('img', { src: elementImg(STATE.weapon.element), alt: STATE.weapon.element }),
              STATE.weapon.element || 'None'
            )
          )
        )
      ),
      el('div', { class: 'dhw-toggle' },
        el('button', {
          type: 'button',
          class: STATE.statMode === 'min' ? 'active' : '',
          onclick: () => {
            collectCurrentFormToState();
            STATE.statMode = STATE.statMode === 'min' ? 'max' : 'min';
            rerender();
          }
        }, 'Min'),
        el('button', {
          type: 'button',
          class: STATE.statMode === 'max' ? 'active' : '',
          onclick: () => {
            collectCurrentFormToState();
            STATE.statMode = STATE.statMode === 'max' ? 'min' : 'max';
            rerender();
          }
        }, 'Max')
      )
    );

    const meta = el('div', { class: 'dhw-inline-meta' },
      renderMini('Lv.', String(details.lvl || '0')),
      renderMini('Advancement', advancementStars(details.adv))
    );

    const statChildren = [
      renderStatBlock('Total Power', details.totalPower || '—'),
      renderStatBlock(details.statLabel || 'Stat', details.statValue || '—')
    ];
    if (STATE.statMode === 'max') {
      statChildren.push(renderStatBlock('Precision', details.precision || '—'));
    }
    const stats = el('div', {
      class: 'dhw-stats',
      style: `grid-template-columns:repeat(${STATE.statMode === 'max' ? 3 : 2}, minmax(0,1fr));`
    }, ...statChildren);

    const owner = el('div', { class: 'dhw-owner' },
      STATE.weapon.hunter
        ? el('img', {
            src: cdnySafe(hunterIconSrc(STATE.weapon.hunter), 128),
            alt: STATE.weapon.hunter,
            loading: 'lazy',
            decoding: 'async',
            onerror: function () { this.style.display = 'none'; }
          })
        : el('div', { class: 'dhw-muted' }, '—'),
      el('div', { class: 'dhw-owner-text' },
        el('div', { class: 'dhw-mini-label' }, 'Hunter'),
        el('div', { class: 'dhw-mini-value', style: 'font-size:18px;text-align:left' }, STATE.weapon.hunter || 'Hunters')
      )
    );

    const info = el('div', { class: 'dhw-right' });
    info.append(head, meta, stats, owner);
    return info;
  }

  function renderPage() {
    const root = qs('#content');
    if (!root) return;

    root.innerHTML = '';

    if (!STATE.weapon) {
      root.append(el('div', { class: 'p-6 text-center text-slate-300' }, 'Weapon not found.'));
      return;
    }

    const wrap = el('div', { class: 'dhw-wrap' });
    const prevWeapon = getAdjacentWeapon(-1);
    const nextWeapon = getAdjacentWeapon(1);
    const pageHead = el('div', { class: 'dhw-pagebar' },
      el('div', { class: 'dhw-page-head' },
        el('div', { class: 'dhw-editor-title' }, 'Hunter Weapons Details'),
        el('div', { class: 'dhw-page-subtitle' }, 'Builds and your personal list')
      ),
      el('div', { class: 'dhw-btns' },
        el('button', {
          class: 'dhw-btn back nav',
          type: 'button',
          title: prevWeapon ? `Previous: ${prevWeapon.name}` : 'First weapon',
          disabled: !prevWeapon,
          onclick: () => { if (prevWeapon) navigateToWeapon(prevWeapon); }
        },
          el('i', { class: 'fa-solid fa-chevron-left' }),
          el('span', {}, prevWeapon ? prevWeapon.name : 'Previous')
        ),
        el('button', {
          class: 'dhw-btn back nav',
          type: 'button',
          title: nextWeapon ? `Next: ${nextWeapon.name}` : 'Last weapon',
          disabled: !nextWeapon,
          onclick: () => { if (nextWeapon) navigateToWeapon(nextWeapon); }
        },
          el('span', {}, nextWeapon ? nextWeapon.name : 'Next'),
          el('i', { class: 'fa-solid fa-chevron-right' })
        ),
        ...(canShowAdminButtons() ? [
          el('button', {
            class: 'dhw-btn dhw-admin-only',
            type: 'button',
            onclick: () => openGlobalStatsModal()
          }, 'Global Stats'),
          el('button', {
            class: 'dhw-btn dhw-admin-only',
            type: 'button',
            onclick: () => openHunterStatsModal()
          }, 'Stats')
        ] : []),
        el('button', {
          class: 'dhw-btn back',
          type: 'button',
          onclick: () => {
            const target = url('/hunter-weapons');
            if (typeof window.routeTo === 'function') window.routeTo(target);
            else window.location.href = target;
          }
        },
          el('i', { class: 'fa-solid fa-arrow-left' }),
          'Back to list'
        )
      )
    );
    const topCard = el('div', { class: 'dhw-card dhw-top' },
      el('div', { class: 'dhw-left' }, renderSkinSlider()),
      renderTopInfo()
    );

    wrap.append(pageHead, topCard, renderEditor(currentDetails()));
    root.append(wrap);

    const lightbox = renderLightbox();
    if (lightbox) root.append(lightbox);
  }

  function rerender() {
    applyAdminButtonsVisibility();
    renderPage();
  }

  async function loadSkinsForWeapon() {
    const original = weaponImgSrc(STATE.weapon);
    const folder = inferSkinFolder(STATE.weapon);
    const baseName = getWeaponSkinBaseName(STATE.weapon);
    const found = await listSkinImagesInFolder(folder, baseName);

    STATE.skins = [
      ...(original ? [original] : []),
      ...found.filter((src) => src && src !== original)
    ];
    STATE.skinIndex = 0;
  }

  document.addEventListener('keydown', (e) => {
    if (!STATE.lightboxOpen) return;

    if (e.key === 'Escape') {
      closeLightbox();
      return;
    }

    if (e.key === 'ArrowLeft' && STATE.skins.length > 1) {
      prevSkin();
      rerender();
      return;
    }

    if (e.key === 'ArrowRight' && STATE.skins.length > 1) {
      nextSkin();
      rerender();
    }
  });

  window.addEventListener('sla:admin-hide-changed', () => {
    applyAdminButtonsVisibility();
    rerender();
  });

  window.__details_hunter_weapons_mount = async function __details_hunter_weapons_mount(path) {
    addStylesOnce();
    applyAdminButtonsVisibility();

    const pathname = String(path || window.location.pathname || '');
    const slug = unslugPathWeapon(pathname);

    if (!slug) {
      const root = qs('#content');
      if (root) root.innerHTML = '<div class="text-center text-slate-300 p-6">Missing weapon in URL.</div>';
      return;
    }

    try {
      const [catalog, order] = await Promise.all([
        loadWeaponCatalog(),
        loadGlobalWeaponOrder()
      ]);
      const weapons = applyWeaponOrder(catalog, order);
      const weapon = findWeaponBySlug(weapons, slug);

      if (!weapon) {
        STATE.weapon = null;
        STATE.weaponName = '';
        STATE.weapons = weapons;
        STATE.weaponIndex = -1;
        rerender();
        return;
      }

      STATE.weapon = weapon;
      STATE.weaponName = weapon.name;
      STATE.weapons = weapons;
      STATE.weaponIndex = weapons.findIndex((w) => String(w?.name || '').trim() === STATE.weaponName);

      await Promise.all([
        loadDropdownConfig(),
        loadGlobalDetails(),
        loadSkinsForWeapon()
      ]);
      await loadGlobalStats();
      ensureWeaponDetailsEntry();
      rerender();
    } catch (e) {
      console.error('Details_HunterWeapons mount failed:', e);
      const root = qs('#content');
      if (root) {
        root.innerHTML = '<div class="text-center text-slate-300 p-6">Failed to load weapon details.</div>';
      }
    }
  };
})();
