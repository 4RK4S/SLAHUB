'use strict';

/**
 * Successors.js - lightweight Successors page.
 * Global catalog, per-user ownership only. No add/remove list behavior.
 */
(function () {
  const DEFAULT_SUCCESSOR = {
    name: 'Myro',
    image_build: '/picture/Successors/Myro.png',
    element: 'none',
    successor_type_image: ''
  };

  const STATE = {
    me: null,
    isAdmin: false,
    loading: false,
    error: null,
    tab: 'builds',
    edit: false,
    filtersModalOpen: false,
    filters: {
      name: '',
      elements: []
    },
    pictureFiles: [],
    pictureFilesLoaded: false,
    successorTypePictureFiles: [],
    successorTypePictureFilesLoaded: false,
    items: [],
    order: [],
    collection: {
      loaded: false,
      loading: false,
      saving: false,
      successors: {}
    }
  };

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    if (typeof window.url === 'function') return window.url(p);
    const path = String(p || '').startsWith('/') ? String(p || '') : `/${p}`;
    return `${basePath()}${path}`;
  }

  function toAssetUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;
    return url(s);
  }

  function cdnySafe(u, w) {
    try {
      if (typeof window.cdny === 'function') return window.cdny(toAssetUrl(u), w);
    } catch (_) {}
    return toAssetUrl(u);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'style') node.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else node.setAttribute(k, String(v));
    }
    for (const ch of children) {
      if (ch == null || ch === false) continue;
      if (Array.isArray(ch)) ch.forEach(x => node.append(x instanceof Node ? x : document.createTextNode(String(x))));
      else node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[successors]', msg);
  }

  function slcBtnClass(active, extra = '') {
    const base = 'h-10 rounded-xl border text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed';
    const on = 'bg-yellow-400 text-black border-yellow-400';
    const off = 'bg-glass text-slate-200 border-white/10 hover:bg-white/10 hover:text-white';
    return `${base} ${active ? on : off} ${extra}`.trim();
  }

  function smallImageFromBuild(buildImage) {
    const u = String(buildImage || '').trim();
    if (!u) return '';
    if (/_Small(\.[a-z0-9]+)([?#].*)?$/i.test(u)) return u;
    return u.replace(/(\.[a-z0-9]+)([?#].*)?$/i, '_Small$1$2');
  }

  function successorFileNameFromPath(path) {
    const raw = String(path || '').split('?')[0].split('#')[0];
    try {
      return decodeURIComponent(raw.split('/').pop() || '');
    } catch (_) {
      return raw.split('/').pop() || '';
    }
  }

  function successorPathFromFileName(file) {
    const name = String(file || '').trim();
    if (!name) return '';
    return `/picture/Successors/${name}`;
  }

  function successorTypePathFromFileName(file) {
    const name = String(file || '').trim();
    if (!name) return '';
    return `/picture/Successors_List/Successors/${name}`;
  }

  function isBuildImageFile(file) {
    const name = successorFileNameFromPath(file);
    return !!name && !/_Small\.[a-z0-9]+$/i.test(name);
  }

  function normElement(value) {
    const v = String(value || '').trim().toLowerCase();
    return ['fire', 'water', 'wind', 'light', 'dark', 'none'].includes(v) ? v : 'none';
  }

  function slugifySuccessorName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function getSuccessorDetailsTarget(item) {
    const slug = slugifySuccessorName(item?.name || '');
    return slug ? url(`/successors/${encodeURIComponent(slug)}`) : '';
  }

  function openSuccessorDetails(item) {
    const target = getSuccessorDetailsTarget(item);
    if (!target) return;
    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }
    try {
      history.pushState({}, '', target);
    } catch (_) {}
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function elementIconSrc(value) {
    const element = normElement(value);
    const icons = {
      fire:  url('/picture/Element/Fires.png'),
      water: url('/picture/Element/Waters.png'),
      wind:  url('/picture/Element/Winds.png'),
      light: url('/picture/Element/Lights.png'),
      dark:  url('/picture/Element/Darkness.png'),
      none:  url('/picture/Element/NONE.png')
    };
    return icons[element] || icons.none;
  }

  function successorBaseIconSrc() {
    return url('/picture/Successors_List/Successor.png');
  }

  function successorTypeImageSrc(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw) || /^data:/i.test(raw)) return raw;
    if (raw.startsWith('/picture/')) return url(raw);
    if (raw.startsWith('picture/')) return url('/' + raw);
    if (raw.startsWith('Successors_List/')) return url('/picture/' + raw);
    if (raw.startsWith('Successors/')) return url('/picture/Successors_List/' + raw);
    return url('/picture/Successors_List/Successors/' + raw.replace(/^\/+/, ''));
  }

  function successorTypeLabel(value) {
    const file = String(value || '').split('?')[0].split('#')[0].split('/').pop() || '';
    const noExt = file.replace(/\.[a-z0-9]+$/i, '');
    if (!noExt) return '';
    return noExt.replace(/_/g, ' ').trim();
  }

  function normalizeItem(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const name = String(src.name || '').trim();
    const image_build = String(src.image_build || src.buildImage || src.image || '').trim();
    const successor_type_image = String(
      src.successor_type_image ||
      src.successorTypeImage ||
      src.successor_image ||
      src.type_image ||
      ''
    ).trim();
    return {
      name,
      image_build,
      element: normElement(src.element),
      successor_type_image,
      image_small: smallImageFromBuild(image_build)
    };
  }

  function isLoggedIn() {
    return !!(STATE.me && (STATE.me.id || STATE.me.discordId));
  }

  function ownedValue(name) {
    return Number(STATE.collection.successors[String(name || '').trim()] || 0) === 1 ? 1 : 0;
  }

  function isOwned(name) {
    return ownedValue(name) === 1;
  }

  function setOwnedValue(name, value, opts = {}) {
    const key = String(name || '').trim();
    if (!key) return;
    const next = Number(value) === 1 ? 1 : 0;
    if (next === 1) STATE.collection.successors[key] = 1;
    else delete STATE.collection.successors[key];
    if (opts.save) queueSave();
  }

  function ownedCount() {
    return (STATE.items || []).reduce((sum, item) => sum + (isOwned(item.name) ? 1 : 0), 0);
  }

  function hasInArray(arr, value) {
    return Array.isArray(arr) && arr.includes(value);
  }

  function toggleInArray(arr, value) {
    const src = Array.isArray(arr) ? arr : [];
    return src.includes(value) ? src.filter(x => x !== value) : [...src, value];
  }

  function resetFilters() {
    STATE.filters.name = '';
    STATE.filters.elements = [];
  }

  function filteredSuccessors() {
    const nameQuery = String(STATE.filters.name || '').trim().toLowerCase();
    const elements = Array.isArray(STATE.filters.elements) ? STATE.filters.elements : [];

    return (STATE.items || []).filter((item) => {
      if (nameQuery && !String(item.name || '').toLowerCase().includes(nameQuery)) return false;
      if (elements.length && !elements.includes(normElement(item.element))) return false;
      return true;
    });
  }

  async function fetchJson(path, opts = {}) {
    const r = await fetch(url(path), {
      cache: 'no-store',
      credentials: 'include',
      ...opts
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  function apiErrorMessage(error) {
    return String(error?.message || error || 'Request failed');
  }

  async function loadMe() {
    try {
      const j = await fetchJson('/api/me');
      STATE.me = j?.user || null;
      try {
        if (!window.STATE) window.STATE = {};
        window.STATE.me = STATE.me;
      } catch (_) {}
    } catch (_) {
      STATE.me = null;
    }
  }

  async function loadAdminFlag() {
    STATE.isAdmin = false;
    if (!isLoggedIn()) return;
    try {
      const j = await fetchJson('/api/admin/is-admin');
      STATE.isAdmin = !!j?.isAdmin;
    } catch (_) {
      STATE.isAdmin = false;
    }
  }

  function applyOrder(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name), idx));
    return [...(list || [])].sort((a, b) => {
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      const ai = map.has(an) ? map.get(an) : 1e9;
      const bi = map.has(bn) ? map.get(bn) : 1e9;
      if (ai !== bi) return ai - bi;
      return an.localeCompare(bn);
    });
  }

  async function loadCatalog() {
    STATE.loading = true;
    STATE.error = null;
    try {
      const [cat, ord] = await Promise.all([
        fetchJson('/api/public/successors'),
        fetchJson('/api/public/successors-order')
      ]);
      const list = Array.isArray(cat) ? cat : (Array.isArray(cat?.items) ? cat.items : []);
      STATE.items = list.map(normalizeItem).filter(x => x.name);
      STATE.order = Array.isArray(ord?.order) ? ord.order : [];
      STATE.items = applyOrder(STATE.items, STATE.order);
    } catch (e) {
      console.error('Successors load failed:', e);
      STATE.error = null;
      STATE.items = [normalizeItem(DEFAULT_SUCCESSOR)];
    } finally {
      STATE.loading = false;
    }
  }

  async function loadSuccessorPictures() {
    if (STATE.pictureFilesLoaded) return STATE.pictureFiles;
    try {
      const out = await fetchJson('/api/admin/pictures/list?category=Successors');
      const raw = Array.isArray(out?.items) ? out.items : (Array.isArray(out) ? out : []);
      const files = raw.map((item) => {
        if (typeof item === 'string') return successorFileNameFromPath(item);
        return successorFileNameFromPath(item?.name || item?.file || item?.filename || item?.path || item?.url || '');
      }).filter(isBuildImageFile);
      STATE.pictureFiles = Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));
      STATE.pictureFilesLoaded = true;
      return STATE.pictureFiles;
    } catch (e) {
      console.warn('loadSuccessorPictures failed:', e);
      STATE.pictureFiles = [];
      STATE.pictureFilesLoaded = true;
      toast(apiErrorMessage(e));
      return [];
    }
  }

  async function loadSuccessorTypePictures() {
    if (STATE.successorTypePictureFilesLoaded) return STATE.successorTypePictureFiles;
    try {
      const out = await fetchJson('/api/admin/pictures/list?category=Successors_List/Successors');
      const raw = Array.isArray(out?.items) ? out.items : (Array.isArray(out) ? out : []);
      const files = raw.map((item) => {
        if (typeof item === 'string') return successorFileNameFromPath(item);
        return successorFileNameFromPath(item?.name || item?.file || item?.filename || item?.path || item?.url || item?.rel || '');
      }).filter((file) => /\.png$/i.test(file));
      STATE.successorTypePictureFiles = Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));
      STATE.successorTypePictureFilesLoaded = true;
      return STATE.successorTypePictureFiles;
    } catch (e) {
      console.warn('loadSuccessorTypePictures failed:', e);
      STATE.successorTypePictureFiles = [];
      STATE.successorTypePictureFilesLoaded = true;
      toast(apiErrorMessage(e));
      return [];
    }
  }

  async function loadMyCollection() {
    if (STATE.collection.loaded || STATE.collection.loading) return;
    if (!isLoggedIn()) {
      STATE.collection.successors = {};
      STATE.collection.loaded = true;
      return;
    }

    STATE.collection.loading = true;
    try {
      const j = await fetchJson('/api/data');
      const src = (j && typeof j.successors === 'object' && j.successors) ? j.successors : {};
      const next = {};
      for (const [name, value] of Object.entries(src)) {
        if (Number(value) === 1 || value === true) next[name] = 1;
      }
      STATE.collection.successors = next;
      STATE.collection.loaded = true;
    } catch (e) {
      console.error('loadMySuccessorsCollection failed:', e);
      STATE.collection.successors = {};
      STATE.collection.loaded = true;
    } finally {
      STATE.collection.loading = false;
    }
  }

  let SAVE_TIMER = null;
  function queueSave() {
    if (!isLoggedIn()) return;
    if (SAVE_TIMER) clearTimeout(SAVE_TIMER);
    SAVE_TIMER = setTimeout(() => {
      SAVE_TIMER = null;
      saveMyCollection();
    }, 350);
  }

  async function saveMyCollection() {
    if (!isLoggedIn() || STATE.collection.saving) return false;
    STATE.collection.saving = true;
    try {
      const payload = {};
      for (const item of STATE.items || []) {
        if (isOwned(item.name)) payload[item.name] = 1;
      }

      await fetchJson('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successors: payload })
      });
      STATE.collection.successors = payload;
      toast('Saved');
      return true;
    } catch (e) {
      console.error('saveMySuccessorsCollection failed:', e);
      toast('Save failed');
      return false;
    } finally {
      STATE.collection.saving = false;
    }
  }

  function ensureStyles() {
    if (document.getElementById('successors-module-style')) return;
    const s = document.createElement('style');
    s.id = 'successors-module-style';
    s.textContent = `
      [data-sla-page="successors"],[data-sla-page="successors"] *{box-sizing:border-box}
      [data-sla-page="successors"]{overflow-x:hidden}
      .successors-grid{display:grid;gap:12px;grid-template-columns:repeat(7,minmax(0,1fr))}
      .successor-card{position:relative;display:block;min-height:0;aspect-ratio:3/4;border-radius:16px;overflow:hidden;border:1px solid rgba(100,116,139,.35);background:linear-gradient(180deg,rgba(88,28,135,.28),rgba(2,6,23,.72));box-shadow:0 10px 28px rgba(0,0,0,.2);text-decoration:none;color:inherit;cursor:pointer}
      .successor-card img{width:100%;height:100%;object-fit:cover;display:block}
      .successor-card .shade{position:absolute;inset:auto 0 0 0;height:46%;background:linear-gradient(180deg,transparent,rgba(2,6,23,.94));pointer-events:none}
      .successor-card .name{position:absolute;left:12px;right:12px;bottom:14px;color:#fff;font-weight:1000;font-size:18px;line-height:1.1;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.75);overflow-wrap:anywhere}
      .successor-element-stack{position:absolute;left:10px;top:10px;display:grid;gap:5px;z-index:2;pointer-events:none}
      .successor-element-badge,.successor-base-type-badge,.successor-type-badge{width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45))}
      .successor-element-badge img,.successor-base-type-badge img,.successor-type-badge img{width:28px;height:28px;object-fit:contain}
      .successor-type-badge{position:absolute;right:10px;top:10px;z-index:2;pointer-events:none}
      .successors-toolbar{display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(100,116,139,.35);background:rgba(15,23,42,.35);flex-wrap:wrap;max-width:100%;box-sizing:border-box;margin-bottom:14px}
      .successors-toolbar .search{flex:1 1 320px;width:100%;max-width:520px;min-width:0;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}
      .successors-toolbar .filter-group{display:flex;align-items:center;gap:10px;padding-left:14px;border-left:1px solid rgba(148,163,184,.18);min-width:0}
      .successors-toolbar .icon-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .successors-toolbar .icon-btn{width:32px;height:32px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);display:grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto}
      .successors-toolbar .icon-btn.is-active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22)}
      .successors-toolbar .icon-btn img{width:22px;height:22px;object-fit:contain;pointer-events:none}
      .successors-toolbar .toolbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .successors-toolbar .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}
      .successors-toolbar .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      .successors-toolbar .edit-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.92);color:#0f172a;font-weight:900;cursor:pointer}
      .successors-toolbar .edit-btn.is-edit{border-color:rgba(250,204,21,.55);background:rgba(250,204,21,.92);color:#0f172a;box-shadow:0 0 0 3px rgba(250,204,21,.18)}
      .filters-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);color:#e2e8f0;font-weight:900;cursor:pointer;display:none;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;width:100%}
      .successors-list,.successor-progress-grid{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
      .successor-progress-card{position:relative;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%,rgba(15,23,42,.82) 100%);backdrop-filter:blur(10px);padding:14px;box-shadow:0 12px 28px rgba(0,0,0,.18);min-height:118px;transition:border-color .12s ease,background .12s ease,box-shadow .12s ease}
      .successor-progress-card.is-owned{border-color:rgba(250,204,21,.58);background:linear-gradient(180deg,rgba(250,204,21,.12) 0%,rgba(15,23,42,.82) 100%);box-shadow:0 0 0 1px rgba(250,204,21,.12),0 12px 28px rgba(0,0,0,.18)}
      .successor-progress-bulk-card{border-color:rgba(168,85,247,.35);box-shadow:0 0 0 1px rgba(168,85,247,.10),0 12px 28px rgba(0,0,0,.18);background:linear-gradient(180deg,rgba(88,28,135,.24) 0%,rgba(15,23,42,.82) 100%)}
      .successor-progress-head{display:flex;align-items:center;gap:12px;min-width:0}
      .successor-progress-avatar{width:64px;height:64px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:rgba(2,6,23,.65);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
      .successor-progress-avatar img{width:100%;height:100%;object-fit:cover;display:block}
      .successor-progress-meta{min-width:0;flex:1}
      .successor-progress-name{font-weight:1000;color:#fff;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .successor-progress-title{display:flex;align-items:center;gap:8px;min-width:0}
      .successor-progress-element{width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;filter:drop-shadow(0 6px 12px rgba(0,0,0,.42))}
      .successor-progress-element img{width:31px;height:31px;object-fit:contain}
      .successor-progress-sub{margin-top:5px;color:#94a3b8;font-size:12px;font-weight:800}
      .successor-progress-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
      .successor-owned-badge{height:26px;padding:0 10px;border-radius:999px;border:1px solid rgba(250,204,21,.48);background:rgba(250,204,21,.12);color:#fde68a;font-size:12px;font-weight:900;display:inline-flex;align-items:center}
      .successor-state-select{height:38px;min-width:76px;border-radius:12px;border:1px solid rgba(100,116,139,.75);background:rgba(15,23,42,.84);color:#e5e7eb;padding:0 10px;font-weight:900}
      .successor-admin-row{display:grid;gap:10px;grid-template-columns:minmax(140px,1fr) minmax(180px,2fr) minmax(160px,2fr) minmax(110px,140px) auto;align-items:center}
      .successor-admin-list-title{font-size:16px;font-weight:1000;color:#fff;margin:18px 0 10px}
      .successor-admin-item{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:center;border-radius:16px;border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.48);padding:10px}
      .successor-admin-thumb{width:54px;height:54px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:rgba(2,6,23,.65);display:flex;align-items:center;justify-content:center}
      .successor-admin-thumb img{width:100%;height:100%;object-fit:cover}
      .successor-admin-name{font-weight:1000;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .successor-admin-meta{min-width:0;display:grid;gap:5px}
      .successor-admin-element{display:flex;align-items:center;gap:8px;color:#cbd5e1;font-weight:900;text-transform:capitalize}
      .successor-admin-element img{width:28px;height:28px;object-fit:contain}
      .successor-admin-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .successor-icon-action{width:40px;height:40px;border-radius:12px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);color:#e5e7eb;font-weight:1000;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .successor-icon-action:hover{background:rgba(255,255,255,.10)}
      .successor-icon-action.danger{border-color:rgba(244,63,94,.45);background:rgba(244,63,94,.14);color:#fecdd3}
      .successor-input{height:40px;border-radius:12px;border:1px solid rgba(100,116,139,.75);background:rgba(15,23,42,.72);color:#e5e7eb;padding:0 12px;min-width:0}
      .successor-textarea{width:100%;min-height:180px;border-radius:14px;border:1px solid rgba(100,116,139,.75);background:rgba(15,23,42,.72);color:#e5e7eb;padding:12px;resize:vertical;font-weight:800}
      .succ-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);padding:18px}
      .succ-modal{width:min(760px,94vw);border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.94);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden}
      .succ-modal-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:1000;color:#facc15}
      .succ-modal-bd{padding:16px;max-height:68vh;overflow:auto}
      .succ-modal-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .succ-filter-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9998;background:rgba(2,6,23,.58);backdrop-filter:blur(3px);padding:14px}
      .succ-filter-modal{width:calc(100vw - 28px);max-width:420px;max-height:80vh;border-radius:16px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.94);color:#e2e8f0;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column}
      .succ-filter-hd{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.20);font-weight:1000;color:#facc15}
      .succ-filter-bd{padding:16px;overflow:auto;display:grid;gap:14px}
      .succ-filter-ft{padding:12px 16px;border-top:1px solid rgba(148,163,184,.20);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .succ-filter-search{width:100%;height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(148,163,184,.35);outline:none;color:#e2e8f0;background:rgba(15,23,42,.55);font-weight:900}
      .succ-filter-icons{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .succ-filter-icons .icon-btn{width:36px;height:36px;border-radius:10px;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.55);display:grid;place-items:center;cursor:pointer;padding:0}
      .succ-filter-icons .icon-btn.is-active{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.12);box-shadow:0 0 0 3px rgba(250,204,21,.22)}
      .succ-filter-icons .icon-btn img{width:24px;height:24px;object-fit:contain}
      .succ-filter-ft .reset-btn{height:38px;padding:0 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.15);color:#fecaca;font-weight:900;display:flex;align-items:center;gap:8px;cursor:pointer}
      .succ-filter-ft .reset-x{display:grid;place-items:center;width:20px;height:20px;border-radius:7px;background:rgba(239,68,68,.30);border:1px solid rgba(239,68,68,.55);color:#fff;font-size:14px;font-weight:900;line-height:1}
      @media (max-width:1350px){.successors-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
      @media (max-width:1178px){.successors-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
      @media (max-width:1006px){.successors-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width:834px){.successors-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.successors-toolbar{display:none}.filters-btn{display:flex;width:100%}}
      @media (max-width:566px){.successors-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:1024px){.successors-list,.successor-progress-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media (max-width:640px){.successors-list,.successor-progress-grid{grid-template-columns:1fr}.successor-admin-row{grid-template-columns:1fr}.successor-admin-row .successor-input,.successor-admin-row button{width:100%;min-width:0}.successor-admin-item{grid-template-columns:54px minmax(0,1fr);grid-template-areas:"thumb meta" "actions actions";gap:10px}.successor-admin-thumb{grid-area:thumb;width:54px;height:54px}.successor-admin-meta{grid-area:meta;min-width:0}.successor-admin-actions{grid-area:actions;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%}.successor-icon-action,.successor-admin-edit{width:100%;height:38px;padding-left:0!important;padding-right:0!important}.successor-card .name{font-size:16px}.successors-toolbar .filter-group{padding-left:0;border-left:none}.successors-toolbar .toolbar-right{margin-left:0;width:100%}}
      @media (max-width:420px){.successors-tabs button{font-size:13px;padding-left:6px!important;padding-right:6px!important}}
      @media (max-width:392px){.successors-grid{grid-template-columns:repeat(1,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function refreshTailwindSoon() {
    try {
      if (window.tailwind && typeof window.tailwind.refresh === 'function') {
        window.tailwind.refresh();
        setTimeout(() => window.tailwind.refresh(), 30);
      }
    } catch (_) {}
  }

  function ensureRoot() {
    const host = document.querySelector('#content') || document.querySelector('#mainContent') || document.querySelector('#app');
    if (host) {
      const existing = host.querySelector('[data-sla-page="successors"]');
      if (existing) return existing;
      host.innerHTML = '';
      const shell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'successors' });
      host.appendChild(shell);
      refreshTailwindSoon();
      return shell;
    }
    let d = document.getElementById('successorsRoot');
    if (!d) {
      d = document.createElement('div');
      d.id = 'successorsRoot';
      document.body.appendChild(d);
    }
    d.className = 'w-full mx-auto px-3 sm:px-6 py-6';
    d.setAttribute('data-sla-page', 'successors');
    return d;
  }

  function renderHeader(root) {
    const owned = ownedCount();
    const total = STATE.items.length;
    root.append(
      el('div', { class: 'flex items-center justify-between gap-3 mb-4' },
        el('div', { class: 'min-w-0' },
          el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Successors'),
          el('div', { class: 'text-sm text-slate-100' }, 'Builds and your personal ownership')
        ),
        el('div', { class: 'px-3 py-1 rounded-full border border-white/10 bg-glass text-sm font-semibold text-slate-200' }, `${owned}/${total || 0}`)
      )
    );
  }

  function renderTabs(root) {
    if (!isLoggedIn()) STATE.edit = false;
    if (!isLoggedIn() && STATE.tab === 'list') STATE.tab = 'builds';
    if (STATE.tab === 'admin' && !STATE.isAdmin) STATE.tab = 'builds';

    const tabs = [{ key: 'builds', label: 'Builds' }];
    if (isLoggedIn()) tabs.push({ key: 'list', label: 'My list' });
    if (STATE.isAdmin) tabs.push({ key: 'admin', label: 'Admin' });

    const cols = tabs.length === 3 ? 'grid-cols-3' : tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
    const bar = el('div', { class: `successors-tabs grid ${cols} gap-2 mb-4` });

    for (const tab of tabs) {
      const btn = el('button', { type: 'button', class: slcBtnClass(STATE.tab === tab.key, 'w-full') }, tab.label);
      btn.addEventListener('click', async () => {
        STATE.tab = tab.key;
        if (tab.key === 'list') await loadMyCollection();
        if (tab.key !== 'list') STATE.edit = false;
        render();
      });
      bar.append(btn);
    }
    root.append(bar);
  }

  function renderSuccessorsToolbar(root) {
    if (STATE.tab !== 'builds' && STATE.tab !== 'list' && STATE.tab !== 'admin') return;

    const mobileBtn = el('button', { type: 'button', class: 'filters-btn' },
      el('i', { class: 'fa-solid fa-filter', 'aria-hidden': 'true' }),
      el('span', {}, 'Filters')
    );
    mobileBtn.addEventListener('click', openFiltersModal);
    root.append(mobileBtn);

    const bar = el('div', { class: 'successors-toolbar' });
    const search = el('input', {
      type: 'search',
      placeholder: 'Search by name',
      value: STATE.filters.name,
      class: 'search'
    });
    search.addEventListener('input', () => {
      STATE.filters.name = search.value || '';
      render();
      requestAnimationFrame(() => {
        const next = document.querySelector('.successors-toolbar .search');
        if (next) {
          next.focus();
          try {
            const len = String(next.value || '').length;
            next.setSelectionRange(len, len);
          } catch (_) {}
        }
      });
    });

    const elementRow = el('div', { class: 'icon-row' });
    for (const element of ['fire', 'water', 'wind', 'light', 'dark']) {
      const active = hasInArray(STATE.filters.elements, element);
      const btn = el('button', {
        type: 'button',
        class: `icon-btn ${active ? 'is-active' : ''}`,
        title: element,
        'aria-label': `Filter ${element}`
      }, el('img', { src: elementIconSrc(element), alt: element, loading: 'lazy', decoding: 'async' }));
      btn.addEventListener('click', () => {
        STATE.filters.elements = toggleInArray(STATE.filters.elements, element);
        render();
      });
      elementRow.append(btn);
    }

    const group = el('div', { class: 'filter-group' }, elementRow);
    const right = el('div', { class: 'toolbar-right' });
    const reset = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' },
      el('span', { class: 'reset-x' }, 'x'),
      el('span', {}, 'Reset')
    );
    reset.addEventListener('click', () => {
      resetFilters();
      render();
    });
    if (STATE.tab === 'list' && isLoggedIn()) {
      const edit = el('button', { type: 'button', class: `edit-btn ${STATE.edit ? 'is-edit' : ''}` }, 'Edit');
      edit.addEventListener('click', () => {
        STATE.edit = !STATE.edit;
        render();
      });
      right.append(edit);
    }
    right.append(reset);

    bar.append(search, group, right);
    root.append(bar);
  }

  function ensureFiltersModal() {
    let back = document.getElementById('succ-filter-backdrop');
    if (back) return back;

    back = el('div', { id: 'succ-filter-backdrop', class: 'succ-filter-backdrop' });
    back.addEventListener('mousedown', (ev) => {
      if (ev.target === back) hideFiltersModal();
    });
    document.body.appendChild(back);
    return back;
  }

  function hideFiltersModal() {
    STATE.filtersModalOpen = false;
    const back = document.getElementById('succ-filter-backdrop');
    if (!back) return;
    back.style.display = 'none';
    back.innerHTML = '';
  }

  function openFiltersModal() {
    STATE.filtersModalOpen = true;
    const back = ensureFiltersModal();
    back.innerHTML = '';

    const modal = el('div', { class: 'succ-filter-modal' });
    const hd = el('div', { class: 'succ-filter-hd' }, 'Filters');
    const bd = el('div', { class: 'succ-filter-bd' });
    const ft = el('div', { class: 'succ-filter-ft' });

    const search = el('input', {
      type: 'search',
      class: 'succ-filter-search',
      placeholder: 'Search by name',
      value: STATE.filters.name
    });
    search.addEventListener('input', () => {
      STATE.filters.name = search.value || '';
      render();
      openFiltersModal();
    });

    const icons = el('div', { class: 'succ-filter-icons' });
    for (const element of ['fire', 'water', 'wind', 'light', 'dark']) {
      const active = hasInArray(STATE.filters.elements, element);
      const btn = el('button', {
        type: 'button',
        class: `icon-btn ${active ? 'is-active' : ''}`,
        title: element,
        'aria-label': `Filter ${element}`
      }, el('img', { src: elementIconSrc(element), alt: element, loading: 'lazy', decoding: 'async' }));
      btn.addEventListener('click', () => {
        STATE.filters.elements = toggleInArray(STATE.filters.elements, element);
        render();
        openFiltersModal();
      });
      icons.append(btn);
    }

    bd.append(
      el('label', { class: 'grid gap-2 text-sm font-extrabold text-slate-200' }, 'Name', search),
      el('div', { class: 'grid gap-2 text-sm font-extrabold text-slate-200' }, 'Element', icons)
    );

    const reset = el('button', { type: 'button', class: 'reset-btn', title: 'Reset filters' },
      el('span', { class: 'reset-x' }, 'x'),
      el('span', {}, 'Reset')
    );
    reset.addEventListener('click', () => {
      resetFilters();
      render();
      openFiltersModal();
    });

    const close = el('button', { type: 'button', class: slcBtnClass(false, 'px-4 font-extrabold') }, 'Close');
    const apply = el('button', { type: 'button', class: slcBtnClass(true, 'px-4 font-extrabold') }, 'Apply');
    close.addEventListener('click', hideFiltersModal);
    apply.addEventListener('click', hideFiltersModal);
    ft.append(reset, close, apply);

    modal.append(hd, bd, ft);
    back.append(modal);
    back.style.display = 'flex';

    requestAnimationFrame(() => {
      const input = back.querySelector('.succ-filter-search');
      if (input) {
        input.focus();
        try {
          const len = String(input.value || '').length;
          input.setSelectionRange(len, len);
        } catch (_) {}
      }
    });
  }

  function renderBuilds(root) {
    if (STATE.loading) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading successors...'));
      return;
    }
    const data = filteredSuccessors();
    if (!STATE.items.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No successors yet.'));
      return;
    }
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No successors found.'));
      return;
    }

    const grid = el('div', { class: 'successors-grid' });
    for (const item of data) {
      const target = getSuccessorDetailsTarget(item);
      const typeSrc = successorTypeImageSrc(item.successor_type_image);
      const typeLabel = successorTypeLabel(item.successor_type_image);
      const card = el('a', {
        class: 'successor-card',
        href: target || '#',
        title: item.name,
        'aria-label': item.name
      },
        item.image_build
          ? el('img', { src: cdnySafe(item.image_build, 480), alt: item.name, loading: 'lazy', decoding: 'async' })
          : el('div', { class: 'w-full h-full flex items-center justify-center text-slate-400' }, 'No image'),
        el('div', { class: 'successor-element-stack' },
          el('div', { class: 'successor-element-badge', title: normElement(item.element) },
            el('img', { src: elementIconSrc(item.element), alt: normElement(item.element), loading: 'lazy', decoding: 'async' })
          ),
          el('div', { class: 'successor-base-type-badge', title: 'Successor' },
            el('img', { src: successorBaseIconSrc(), alt: 'Successor', loading: 'lazy', decoding: 'async' })
          )
        ),
        typeSrc
          ? el('div', { class: 'successor-type-badge', title: typeLabel },
              el('img', { src: typeSrc, alt: typeLabel || 'Successor type', loading: 'lazy', decoding: 'async' })
            )
          : null,
        el('div', { class: 'shade' }),
        el('div', { class: 'name' }, item.name)
      );
      card.addEventListener('click', (ev) => {
        if (ev.defaultPrevented || ev.button !== 0) return;
        if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        openSuccessorDetails(item);
      });
      grid.append(card);
    }
    root.append(grid);
  }

  function renderMyList(root) {
    if (STATE.collection.loading && !STATE.collection.loaded) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading your list...'));
      return;
    }
    const data = filteredSuccessors();
    if (!STATE.items.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No successors yet.'));
      return;
    }
    if (!data.length) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'No results.'));
      return;
    }

    const list = el('div', { class: 'successor-progress-grid' });

    if (STATE.edit && isLoggedIn()) {
      const bulk = el('div', { class: 'successor-progress-card successor-progress-bulk-card' },
        el('div', { class: 'successor-progress-head' },
          el('div', { class: 'successor-progress-avatar' }, el('div', { class: 'text-sm font-black text-yellow-300' }, 'ALL')),
          el('div', { class: 'successor-progress-meta' },
            el('div', { class: 'successor-progress-name' }, 'Edit all'),
            el('div', { class: 'successor-progress-sub' }, 'Apply one ownership state to every Successor')
          )
        )
      );
      const bulkSelect = el('select', { class: 'successor-state-select' },
        el('option', { value: '' }, 'No change'),
        el('option', { value: '0' }, '0'),
        el('option', { value: '1' }, '1')
      );
      bulkSelect.addEventListener('change', () => {
        if (bulkSelect.value !== '0' && bulkSelect.value !== '1') return;
        for (const item of data) setOwnedValue(item.name, bulkSelect.value);
        render();
      });
      const saveAll = el('button', { type: 'button', class: slcBtnClass(true, 'px-4 font-extrabold') }, 'Save all');
      saveAll.addEventListener('click', async () => {
        await saveMyCollection();
        STATE.edit = false;
        render();
      });
      bulk.append(el('div', { class: 'successor-progress-actions' }, bulkSelect, saveAll));
      list.append(bulk);
    }

    for (const item of data) {
      const owned = isOwned(item.name);
      const card = el('div', { class: `successor-progress-card ${owned ? 'is-owned' : ''}` },
        el('div', { class: 'successor-progress-head' },
          el('div', { class: 'successor-progress-avatar' },
            item.image_small
              ? el('img', { src: cdnySafe(item.image_small, 128), alt: item.name, loading: 'lazy', decoding: 'async' })
              : el('div', { class: 'text-slate-500 text-xs font-black' }, 'IMG')
          ),
          el('div', { class: 'successor-progress-meta' },
            el('div', { class: 'successor-progress-title' },
              el('div', { class: 'successor-progress-name', title: item.name }, item.name),
              el('span', { class: 'successor-progress-element', title: normElement(item.element) },
                el('img', { src: elementIconSrc(item.element), alt: normElement(item.element), loading: 'lazy', decoding: 'async' })
              )
            ),
            el('div', { class: 'successor-progress-sub' }, owned ? 'Owned' : 'Not owned')
          )
        )
      );

      if (STATE.edit) {
        const sel = el('select', { class: 'successor-state-select', 'aria-label': `${item.name} ownership` },
          el('option', { value: '0' }, '0'),
          el('option', { value: '1' }, '1')
        );
        sel.value = String(ownedValue(item.name));
        sel.addEventListener('change', () => {
          setOwnedValue(item.name, sel.value);
          renderHeaderCounterOnly();
          const sub = card.querySelector('.successor-progress-sub');
          if (sub) sub.textContent = Number(sel.value) === 1 ? 'Owned' : 'Not owned';
          card.classList.toggle('is-owned', Number(sel.value) === 1);
        });
        card.append(el('div', { class: 'successor-progress-actions' }, sel));
      } else if (owned) {
        card.append(el('div', { class: 'successor-progress-actions' }, el('span', { class: 'successor-owned-badge' }, 'Owned')));
      }

      list.append(card);
    }
    root.append(list);
  }

  function renderHeaderCounterOnly() {
    const root = document.querySelector('[data-sla-page="successors"]');
    if (!root) return;
    const badge = root.querySelector('.flex.items-center.justify-between .rounded-full');
    if (badge) badge.textContent = `${ownedCount()}/${STATE.items.length || 0}`;
  }

  function input(value, placeholder) {
    return el('input', { class: 'successor-input', value: value || '', placeholder });
  }

  function makeElementSelect(value) {
    const sel = el('select', { class: 'successor-input' });
    for (const option of ['fire', 'water', 'wind', 'light', 'dark']) {
      sel.append(el('option', { value: option }, option));
    }
    const normalized = normElement(value);
    sel.value = normalized === 'none' ? 'fire' : normalized;
    return sel;
  }

  function makeImageSelect(value) {
    const curFile = successorFileNameFromPath(value);
    const files = [...STATE.pictureFiles];
    if (curFile && isBuildImageFile(curFile) && !files.includes(curFile)) files.unshift(curFile);

    const sel = el('select', { class: 'successor-input' });
    sel.append(el('option', { value: '' }, files.length ? 'Build image' : 'No images found'));
    for (const file of files) sel.append(el('option', { value: file }, file));
    sel.value = files.includes(curFile) ? curFile : '';
    return sel;
  }

  function makeSuccessorTypeImageSelect(value) {
    const curFile = successorFileNameFromPath(value);
    const files = [...STATE.successorTypePictureFiles];
    if (curFile && /\.png$/i.test(curFile) && !files.includes(curFile)) files.unshift(curFile);

    const sel = el('select', { class: 'successor-input' });
    sel.append(el('option', { value: '' }, files.length ? 'Successor type image' : 'No type images found'));
    for (const file of files) sel.append(el('option', { value: file }, file));
    sel.value = files.includes(curFile) ? curFile : '';
    return sel;
  }

  async function adminAction(body) {
    try {
      await fetchJson('/api/admin/successors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadCatalog();
      render();
      return true;
    } catch (e) {
      toast(apiErrorMessage(e));
      return false;
    }
  }

  async function saveOrder(order) {
    try {
      await fetchJson('/api/admin/successors-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
      STATE.order = order;
      STATE.items = applyOrder(STATE.items, order);
      return true;
    } catch (e) {
      toast(apiErrorMessage(e));
      return false;
    }
  }

  function normalizedExactOrder(raw) {
    const existing = STATE.items.map(x => x.name).filter(Boolean);
    const existingSet = new Set(existing);
    const seen = new Set();
    const out = [];

    for (const line of String(raw || '').split(/\r?\n/)) {
      const name = line.trim();
      if (!name || !existingSet.has(name) || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }

    for (const name of existing) {
      if (!seen.has(name)) out.push(name);
    }

    return out;
  }

  function ensureSuccessorsModal() {
    let back = document.getElementById('succ-modal-backdrop');
    if (back) return back;

    back = el('div', { id: 'succ-modal-backdrop', class: 'succ-modal-backdrop' });
    back.addEventListener('mousedown', (ev) => {
      if (ev.target === back) hideSuccessorsModal();
    });
    document.body.appendChild(back);
    window.__successors_hideModal = hideSuccessorsModal;
    return back;
  }

  function hideSuccessorsModal() {
    const back = document.getElementById('succ-modal-backdrop');
    if (!back) return;
    back.style.display = 'none';
    back.innerHTML = '';
  }

  function showSuccessorsModal(title, bodyFactory, footerFactory) {
    const back = ensureSuccessorsModal();
    back.innerHTML = '';
    const modal = el('div', { class: 'succ-modal' });
    const hd = el('div', { class: 'succ-modal-hd' }, title);
    const bd = el('div', { class: 'succ-modal-bd' });
    const ft = el('div', { class: 'succ-modal-ft' });
    bd.append(bodyFactory?.() || '');
    const footer = footerFactory?.() || el('button', { type: 'button', class: slcBtnClass(false, 'px-4'), onclick: hideSuccessorsModal }, 'Close');
    if (Array.isArray(footer)) ft.append(...footer);
    else ft.append(footer);
    modal.append(hd, bd, ft);
    back.append(modal);
    back.style.display = 'flex';
  }

  function openExactOrderModal() {
    let area = null;
    showSuccessorsModal(
      'Set exact order',
      () => {
        area = el('textarea', { class: 'successor-textarea' }, STATE.items.map(x => x.name).filter(Boolean).join('\n'));
        return el('div', { class: 'grid gap-3' },
          el('div', { class: 'text-sm text-slate-300 font-semibold' }, 'One Successor name per line. Unknown names are ignored; missing names are appended at the end.'),
          area
        );
      },
      () => {
        const close = el('button', { type: 'button', class: slcBtnClass(false, 'px-4 font-extrabold') }, 'Close');
        const save = el('button', { type: 'button', class: slcBtnClass(true, 'px-4 font-extrabold') }, 'Save');
        close.addEventListener('click', hideSuccessorsModal);
        save.addEventListener('click', async () => {
          try {
            const order = normalizedExactOrder(area?.value || '');
            const ok = await saveOrder(order);
            if (!ok) return;
            toast('Order saved');
            hideSuccessorsModal();
            await loadCatalog();
            render();
          } catch (e) {
            toast(apiErrorMessage(e));
          }
        });
        return [close, save];
      }
    );
  }

  function openEditSuccessorModal(item) {
    let nameInput = null;
    let imageSelect = null;
    let typeImageSelect = null;
    let elementSelect = null;

    showSuccessorsModal(
      `Edit: ${item.name}`,
      () => {
        nameInput = input(item.name, 'Name');
        imageSelect = makeImageSelect(item.image_build);
        typeImageSelect = makeSuccessorTypeImageSelect(item.successor_type_image);
        elementSelect = makeElementSelect(item.element);
        return el('div', { class: 'grid gap-3' },
          el('label', { class: 'grid gap-1 text-sm font-extrabold text-slate-200' }, 'Name', nameInput),
          el('label', { class: 'grid gap-1 text-sm font-extrabold text-slate-200' }, 'Build image', imageSelect),
          el('label', { class: 'grid gap-1 text-sm font-extrabold text-slate-200' }, 'Successor type image', typeImageSelect),
          el('label', { class: 'grid gap-1 text-sm font-extrabold text-slate-200' }, 'Element', elementSelect)
        );
      },
      () => {
        const close = el('button', { type: 'button', class: slcBtnClass(false, 'px-4 font-extrabold') }, 'Close');
        const save = el('button', { type: 'button', class: slcBtnClass(true, 'px-4 font-extrabold') }, 'Save');
        close.addEventListener('click', hideSuccessorsModal);
        save.addEventListener('click', async () => {
          try {
            const next = normalizeItem({
              name: nameInput?.value,
              image_build: successorPathFromFileName(imageSelect?.value),
              element: elementSelect?.value,
              successor_type_image: successorTypePathFromFileName(typeImageSelect?.value)
            });
            if (!next.name || !next.image_build) return toast('Name and build image are required');
            const ok = await adminAction({
              action: 'update',
              originalName: item.name,
              item: { name: next.name, image_build: next.image_build, element: next.element, successor_type_image: next.successor_type_image }
            });
            if (!ok) return;
            toast('Saved');
            hideSuccessorsModal();
          } catch (e) {
            toast(apiErrorMessage(e));
          }
        });
        return [close, save];
      }
    );
  }

  function renderAdmin(root) {
    if (!STATE.isAdmin) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Admin only.'));
      return;
    }

    if (!STATE.pictureFilesLoaded || !STATE.successorTypePictureFilesLoaded) {
      root.append(el('div', { class: 'p-6 text-center text-white' }, 'Loading Successors images...'));
      Promise.all([loadSuccessorPictures(), loadSuccessorTypePictures()]).then(render).catch(() => render());
      return;
    }

    const card = el('div', { class: 'bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-sm' },
      el('div', { class: 'mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3' },
        el('div', {},
          el('div', { class: 'text-lg font-extrabold text-yellow-400' }, 'Successors - Admin'),
          el('div', { class: 'text-sm text-slate-100' }, 'Add, edit, remove and reorder successors.')
        ),
        el('button', { type: 'button', class: slcBtnClass(false, 'px-4 font-extrabold'), onclick: openExactOrderModal }, 'Set exact order')
      )
    );

    const addName = input('', 'Name');
    const addBuild = makeImageSelect('');
    const addTypeImage = makeSuccessorTypeImageSelect('');
    const addElement = makeElementSelect('fire');
    const addBtn = el('button', { type: 'button', class: slcBtnClass(true, 'px-4 font-extrabold') }, 'Add');
    addBtn.addEventListener('click', async () => {
      const item = normalizeItem({
        name: addName.value,
        image_build: successorPathFromFileName(addBuild.value),
        element: addElement.value,
        successor_type_image: successorTypePathFromFileName(addTypeImage.value)
      });
      if (!item.name || !item.image_build) return toast('Name and build image are required');
      const ok = await adminAction({ action: 'add', item: { name: item.name, image_build: item.image_build, element: item.element, successor_type_image: item.successor_type_image } });
      if (ok) {
        addName.value = '';
        addBuild.value = '';
        addTypeImage.value = '';
        addElement.value = 'fire';
        toast('Added');
      }
    });

    card.append(el('div', { class: 'successor-admin-row mb-4' }, addName, addBuild, addTypeImage, addElement, addBtn));

    const rows = el('div', { class: 'grid gap-3' });
    const data = filteredSuccessors();
    card.append(el('div', { class: 'successor-admin-list-title' }, 'Successors list'));

    if (!STATE.items.length) {
      rows.append(el('div', { class: 'p-4 text-center text-slate-300 font-semibold' }, 'No successors yet.'));
    } else if (!data.length) {
      rows.append(el('div', { class: 'p-4 text-center text-slate-300 font-semibold' }, 'No results.'));
    }

    data.forEach((item) => {
      const idx = STATE.items.findIndex(x => x.name === item.name);
      const actions = el('div', { class: 'successor-admin-actions' });
      const up = el('button', { type: 'button', class: 'successor-icon-action', title: 'Move up', disabled: idx <= 0 }, '↑');
      const down = el('button', { type: 'button', class: 'successor-icon-action', title: 'Move down', disabled: idx < 0 || idx >= STATE.items.length - 1 }, '↓');
      const edit = el('button', { type: 'button', class: slcBtnClass(false, 'px-3 font-extrabold successor-admin-edit') }, 'Edit');
      const del = el('button', { type: 'button', class: 'successor-icon-action danger', title: 'Delete' }, '×');

      up.addEventListener('click', async () => {
        if (idx <= 0) return;
        const arr = [...STATE.items];
        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
        const ok = await saveOrder(arr.map(x => x.name));
        if (ok) render();
      });
      down.addEventListener('click', async () => {
        if (idx < 0 || idx >= STATE.items.length - 1) return;
        const arr = [...STATE.items];
        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
        const ok = await saveOrder(arr.map(x => x.name));
        if (ok) render();
      });
      edit.addEventListener('click', () => openEditSuccessorModal(item));
      del.addEventListener('click', async () => {
        const ok = await adminAction({ action: 'remove', name: item.name });
        if (ok) toast('Deleted');
      });

      actions.append(up, down, edit, del);
      rows.append(el('div', { class: 'successor-admin-item' },
        el('div', { class: 'successor-admin-thumb' },
          item.image_small
            ? el('img', { src: cdnySafe(item.image_small, 128), alt: item.name, loading: 'lazy', decoding: 'async' })
            : el('div', { class: 'text-xs font-black text-slate-500' }, 'IMG')
        ),
        el('div', { class: 'successor-admin-meta' },
          el('div', { class: 'successor-admin-name', title: item.name }, item.name),
          el('div', { class: 'successor-admin-element' },
            el('img', { src: elementIconSrc(item.element), alt: normElement(item.element), loading: 'lazy', decoding: 'async' }),
            el('span', {}, normElement(item.element))
          )
        ),
        actions
      ));
    });

    card.append(rows);
    root.append(card);
  }

  function render() {
    ensureStyles();
    const root = ensureRoot();
    root.innerHTML = '';

    if (STATE.error) {
      root.append(el('div', { class: 'p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 font-semibold' }, STATE.error));
      return;
    }

    renderHeader(root);
    renderTabs(root);
    renderSuccessorsToolbar(root);

    if (STATE.tab === 'list') renderMyList(root);
    else if (STATE.tab === 'admin') renderAdmin(root);
    else renderBuilds(root);

    refreshTailwindSoon();
  }

  let INITED = false;
  async function init() {
    if (INITED) {
      render();
      return;
    }
    INITED = true;
    try {
      ensureStyles();
      await loadMe();
      await loadAdminFlag();
      await loadCatalog();
      if (isLoggedIn()) await loadMyCollection();
      render();
    } catch (e) {
      console.error('Successors init failed:', e);
      STATE.error = 'Init failed.';
      render();
    }
  }

  window.__successors_mount = async function __successors_mount() {
    await init();
  };
})();
