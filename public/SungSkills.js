'use strict';

/**
 * SungSkills.js - Sung Jinwoo Skills page.
 * Exposes: window.__sung_skills_mount()
 */
(function () {
  const FILTERS = ['All', 'Regular', 'Break', 'QTE', 'Ultimate'];
  const ELEMENTS = ['', 'Fire', 'Water', 'Wind', 'Light', 'Dark'];
  const ELEMENT_ICONS = {
    Fire: '/picture/Element/Fires.png',
    Water: '/picture/Element/Waters.png',
    Wind: '/picture/Element/Winds.png',
    Light: '/picture/Element/Lights.png',
    Dark: '/picture/Element/Darkness.png'
  };
  const BREAK_ICON = '/picture/Rune/Break.png';
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

  const STATE = {
    query: '',
    filter: 'All',
    adminOpen: false,
    loading: false,
    saving: false,
    error: '',
    catalog: { version: 1, skills: [], meta: {} },
    activeRuneBySkill: {},
    expandedSkillIds: {},
    renderedRuneBySkill: {},
    animatingSkillIds: {},
    folderImages: {},
    skillDraft: null,
    runeDraft: null,
    orderText: '',
    orderModalOpen: false,
    publicFilterBeforeAdmin: 'All',
    folderLoadTimers: {}
  };

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }

  function url(p) {
    if (typeof window.url === 'function') return window.url(p);
    const b = basePath();
    const tail = String(p || '').startsWith('/') ? p : `/${p}`;
    return `${b}${tail}`;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else node.setAttribute(k, String(v));
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function toast(message) {
    if (typeof window.showToast === 'function') return window.showToast(message);
    console.log('[sung-skills]', message);
  }

  async function apiGet(path) {
    const r = await fetch(url(path), { cache: 'no-store', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  async function apiPost(path, body) {
    const r = await fetch(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  }

  function normalizeId(value, fallback = 'item') {
    const id = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return id || `${fallback}-${Date.now()}`;
  }

  function uniqueId(base, items) {
    const used = new Set((items || []).map((item) => String(item.id || '')));
    const root = normalizeId(base);
    let id = root;
    let n = 2;
    while (used.has(id)) {
      id = `${root}-${n}`;
      n += 1;
    }
    return id;
  }

  function isAdminTabVisible() {
    if (!window.STATE?.isAdmin) return false;
    if (typeof window.__sla_getAdminButtonsHidden === 'function') {
      try { if (window.__sla_getAdminButtonsHidden()) return false; } catch (_) {}
    }
    try { if (localStorage.getItem('sla_hide_admin_buttons') === '1') return false; } catch (_) {}
    return true;
  }

  function imageUrl(relOrUrl) {
    const s = String(relOrUrl || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || s.startsWith('/picture/')) return url(s);
    return url(`/picture/Rune/${s.replace(/^\/+/, '')}`);
  }

  function elementIcon(element) {
    return ELEMENT_ICONS[element] ? url(ELEMENT_ICONS[element]) : '';
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function descriptionText(description) {
    return (Array.isArray(description) ? description : [])
      .map((block) => {
        if (block?.type === 'effect') return `${block.tag || ''} ${(block.lines || []).join(' ')}`;
        return block?.text || '';
      })
      .join(' ');
  }

  function appendRichInline(container, text) {
    const src = String(text || '');
    const regex = /\[(\/?)(gold|light|orange|mint|keyword|keyword2|break|debuff|b)\]/gi;
    const stack = [];
    let last = 0;
    let match;

    function appendChunk(value) {
      if (!value) return;
      const colorTag = [...stack].reverse().find((tag) => tag !== 'b');
      const bold = stack.includes('b');
      if (!colorTag && !bold) {
        container.append(document.createTextNode(value));
        return;
      }
      const styles = [];
      if (colorTag) styles.push(`color:${TAG_TO_COLOR[colorTag] || '#fff'}`);
      if (bold) styles.push('font-weight:800');
      container.append(el('span', { style: styles.join(';') }, value));
    }

    while ((match = regex.exec(src)) !== null) {
      appendChunk(src.slice(last, match.index));
      const closing = !!match[1];
      const tag = String(match[2] || '').toLowerCase();
      if (closing) {
        const idx = stack.lastIndexOf(tag);
        if (idx >= 0) stack.splice(idx, 1);
      } else {
        stack.push(tag);
      }
      last = regex.lastIndex;
    }
    appendChunk(src.slice(last));
  }

  function renderRichText(text, className = 'sjw-rich-text') {
    const cls = String(className || '').includes('sjw-rich-text') ? className : `sjw-rich-text ${className || ''}`.trim();
    const wrap = el('div', { class: cls });
    const src = String(text || '').replace(/\r\n/g, '\n');
    if (!src.trim()) return wrap;

    let bulletList = null;
    const flushBullets = () => {
      if (!bulletList) return;
      wrap.appendChild(bulletList);
      bulletList = null;
    };

    for (const rawLine of src.split('\n')) {
      const line = String(rawLine || '');
      const trimmed = line.trim();
      if (!trimmed) {
        flushBullets();
        wrap.appendChild(el('div', { class: 'sjw-desc-gap' }));
        continue;
      }
      if (trimmed.startsWith('|')) {
        if (!bulletList) bulletList = el('ul', { class: 'sjw-bullet-list' });
        const item = el('li', {});
        appendRichInline(item, trimmed.slice(1).trim());
        bulletList.appendChild(item);
        continue;
      }
      flushBullets();
      const row = el('div', {});
      appendRichInline(row, line);
      wrap.appendChild(row);
    }
    flushBullets();
    return wrap;
  }

  function insertAroundSelection(textarea, openTag, closeTag) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = textarea.value || '';
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + openTag + selected + closeTag + value.slice(end);
    textarea.value = next;
    const newStart = start + openTag.length;
    const newEnd = newStart + selected.length;
    textarea.focus();
    textarea.setSelectionRange(newStart, newEnd);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function catalogSkills() {
    return Array.isArray(STATE.catalog?.skills) ? STATE.catalog.skills : [];
  }

  function filteredSkills() {
    const q = STATE.query.trim().replace(/\s+/g, ' ').toLowerCase();
    return catalogSkills().filter((skill) => {
      if (STATE.filter !== 'All' && skill.type !== STATE.filter) return false;
      if (!q) return true;
      return String(skill.name || '').trim().replace(/\s+/g, ' ').toLowerCase().includes(q);
    });
  }

  async function loadCatalog() {
    const out = await apiGet('/api/public/sung-skills');
    STATE.catalog = out.catalog || { version: 1, skills: [] };
    if (STATE.adminOpen && !isAdminTabVisible()) STATE.adminOpen = false;
  }

  async function saveCatalog(nextCatalog, message = 'Saved') {
    if (STATE.saving) return false;
    STATE.saving = true;
    render();
    try {
      const out = await apiPost('/api/admin/sung-skills', { action: 'saveAll', catalog: nextCatalog });
      STATE.catalog = out.catalog || nextCatalog;
      toast(message);
      return true;
    } catch (e) {
      toast(`Save failed: ${e?.message || e}`);
      return false;
    } finally {
      STATE.saving = false;
      render();
    }
  }

  async function loadFolderImages(folder) {
    const key = String(folder || '').trim();
    if (!key) return [];
    if (Array.isArray(STATE.folderImages[key])) return STATE.folderImages[key];
    try {
      const out = await apiGet(`/api/public/sung-skills/runes/${encodeURIComponent(key)}`);
      const images = Array.isArray(out.skill?.images) ? out.skill.images : [];
      STATE.folderImages[key] = images;
      return images;
    } catch (_) {
      STATE.folderImages[key] = [];
      return [];
    }
  }

  function toggleAdmin() {
    if (!isAdminTabVisible()) return;
    const opening = !STATE.adminOpen;
    STATE.adminOpen = opening;
    if (opening) {
      STATE.publicFilterBeforeAdmin = STATE.filter;
      preloadVisibleFolders();
      STATE.orderText = catalogSkills().map((skill) => skill.name).join('\n');
    } else if (STATE.publicFilterBeforeAdmin) {
      STATE.filter = STATE.publicFilterBeforeAdmin;
    }
    render();
  }

  function preloadVisibleFolders() {
    for (const skill of catalogSkills()) {
      if (skill.folder) loadFolderImages(skill.folder).then(render);
    }
  }

  function ensureStyles() {
    if (document.getElementById('sungSkillsStyles')) return;
    const style = document.createElement('style');
    style.id = 'sungSkillsStyles';
    style.textContent = `
      [data-sla-page="sung-skills"]{color:#e5e7eb}
      .sjw-shell{width:100%;max-width:none;margin:0 auto;padding:0 0 28px}
      .sjw-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      .sjw-tools{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:14px;border:1px solid rgba(51,65,85,.88);background:rgba(15,23,42,.58);border-radius:8px;margin-bottom:16px}
      .sjw-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
      .sjw-search{height:44px;width:100%;border-radius:8px;border:1px solid rgba(71,85,105,.95);background:rgba(2,6,23,.72);color:#f8fafc;padding:0 14px;font-weight:750;outline:none}
      .sjw-search:focus{border-color:rgba(250,204,21,.65);box-shadow:0 0 0 2px rgba(250,204,21,.16)}
      .sjw-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .sjw-filter{height:40px;border-radius:8px;border:1px solid rgba(71,85,105,.95);background:rgba(30,41,59,.76);color:#e2e8f0;font-weight:850}
      .sjw-filter.is-active{background:#facc15;border-color:#facc15;color:#111827}
      .sjw-shell.is-admin .sjw-filter.is-active{background:rgba(30,41,59,.76);border-color:rgba(71,85,105,.95);color:#e2e8f0;box-shadow:none}
      .sjw-category-stack{display:grid;gap:18px}
      .sjw-category{display:grid;gap:10px}
      .sjw-category-title{display:flex;align-items:center;gap:10px;color:#f8fafc;font-size:15px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}
      .sjw-category-title::after{content:'';height:1px;flex:1;background:linear-gradient(90deg,rgba(148,163,184,.38),transparent)}
      .sjw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}
      .sjw-skill-card{width:100%;min-width:0;min-height:226px;border:1px solid rgba(100,116,139,.44);background:linear-gradient(180deg,rgba(15,23,42,.88),rgba(15,23,42,.68));border-radius:8px;padding:13px;box-shadow:0 12px 30px rgba(0,0,0,.2);height:100%;display:flex;flex-direction:column;gap:12px}
      .sjw-card-head{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:12px;min-width:0;min-height:78px}
      .sjw-skill-icon{width:72px;height:72px;flex:0 0 72px;display:grid;place-items:center;clip-path:polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%);background:linear-gradient(180deg,rgba(148,163,184,.62),rgba(71,85,105,.58));padding:2px;color:#facc15}
      .sjw-skill-icon-inner{width:100%;height:100%;display:grid;place-items:center;clip-path:inherit;background:radial-gradient(circle at 50% 35%,rgba(30,41,59,.96),rgba(2,6,23,.94));overflow:hidden}
      .sjw-skill-icon img{width:82%;height:82%;object-fit:contain}
      .sjw-skill-icon i{font-size:24px}
      .sjw-title-block{min-width:0;flex:1}
      .sjw-title-block h2{font-size:18px;line-height:1.15;font-weight:950;color:#f8fafc;margin:0;overflow-wrap:anywhere}
      .sjw-badge-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
      .sjw-type,.sjw-rune-count{min-height:24px;display:inline-flex;align-items:center;border-radius:6px;padding:0 8px;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}
      .sjw-type{background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.36);color:#bae6fd}
      .sjw-type-break{background:rgba(248,113,113,.14);border-color:rgba(248,113,113,.36);color:#fecaca}
      .sjw-type-qte{background:rgba(52,211,153,.14);border-color:rgba(52,211,153,.36);color:#bbf7d0}
      .sjw-type-ultimate{background:rgba(250,204,21,.14);border-color:rgba(250,204,21,.42);color:#fde68a}
      .sjw-rune-count{background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.26);color:#cbd5e1}
      .sjw-rune-panel{padding:10px;border-radius:8px;border:1px solid rgba(51,65,85,.62);background:rgba(2,6,23,.26)}
      .sjw-rune-row{display:grid;gap:8px}
      .sjw-rune-btn{position:relative;aspect-ratio:1;border:0;border-radius:8px;background:rgba(2,6,23,.58);display:grid;place-items:center;padding:4px;transition:transform .14s,background .14s,box-shadow .14s;min-width:0;outline:1px solid rgba(71,85,105,.58);outline-offset:-1px}
      .sjw-rune-btn:hover{transform:translateY(-1px);background:rgba(15,23,42,.78);box-shadow:0 0 0 2px rgba(250,204,21,.11)}
      .sjw-rune-btn.is-active{background:rgba(250,204,21,.14);box-shadow:0 0 0 2px rgba(250,204,21,.55),0 0 16px rgba(250,204,21,.12);outline-color:transparent}
      .sjw-rune-btn img.sjw-rune-img{width:100%;height:100%;object-fit:contain}
      .sjw-rune-fallback{font-size:12px;font-weight:950;color:#facc15}
      .sjw-mini-badge{position:absolute;width:26px;height:26px;border-radius:999px;border:1px solid rgba(15,23,42,.9);background:rgba(15,23,42,.92);display:grid;place-items:center;overflow:hidden}
      .sjw-mini-badge img{width:100%;height:100%;object-fit:contain}
      .sjw-mini-badge i{display:none;font-size:11px;color:#facc15}
      .sjw-break-badge{left:2px;bottom:2px}
      .sjw-element-badge{right:2px;bottom:2px}
      .sjw-rune-desc-slot{overflow:visible}
      .sjw-selected-rune{margin-top:12px;border-top:1px solid rgba(71,85,105,.72);padding-top:12px;overflow:hidden}
      .sjw-selected-name{font-size:14px;font-weight:950;color:#f8fafc;margin-bottom:8px}
      .sjw-skill-effect{border:1px solid rgba(71,85,105,.58);border-radius:8px;background:rgba(2,6,23,.22);padding:10px}
      .sjw-skill-effect-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:950;color:#fde68a;margin-bottom:8px}
      .sjw-skill-desc{display:grid;gap:8px;color:#cbd5e1;font-size:14px;line-height:1.45}
      .sjw-desc-line{margin:0;white-space:pre-wrap}
      .sjw-rich-text{display:grid;gap:4px;white-space:normal;overflow-wrap:anywhere;color:#cbd5e1}
      .sjw-desc-gap{height:6px}
      .sjw-bullet-list{margin:0;padding-left:20px;list-style:disc;display:grid;gap:4px}
      .sjw-bullet-list li{padding-left:2px}
      .sjw-effect-tag{font-weight:950;color:#facc15}
      .sjw-effect-row{display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:start}
      .sjw-effect-img{width:42px;height:42px;border-radius:8px;object-fit:contain}
      .sjw-effect-copy{color:#e2e8f0;font-weight:400;white-space:normal}
      .sjw-empty{padding:34px 16px;text-align:center;border:1px dashed rgba(148,163,184,.32);border-radius:8px;color:#cbd5e1;background:rgba(15,23,42,.45);font-weight:750}
      .sjw-admin{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
      .sjw-panel{border:1px solid rgba(71,85,105,.82);border-radius:8px;background:rgba(15,23,42,.66);padding:14px}
      .sjw-panel-title{font-size:16px;font-weight:950;color:#f8fafc;margin-bottom:10px}
      .sjw-admin-list{display:grid;gap:8px}
      .sjw-admin-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid rgba(71,85,105,.7);border-radius:8px;background:rgba(2,6,23,.32);padding:10px}
      .sjw-admin-actions{display:flex;flex-wrap:wrap;gap:6px}
      .sjw-btn{height:36px;padding:0 10px;border-radius:8px;border:1px solid rgba(71,85,105,.9);background:rgba(30,41,59,.8);color:#f8fafc;font-weight:850}
      .sjw-btn:hover{background:rgba(51,65,85,.9)}
      .sjw-btn-primary{background:#facc15;border-color:#facc15;color:#111827}
      .sjw-btn-danger{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.45);color:#fecaca}
      .sjw-btn:disabled{opacity:.55;cursor:not-allowed}
      .sjw-form{display:grid;gap:12px}
      .sjw-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .sjw-form-wide{grid-column:1/-1}
      .sjw-field{display:grid;gap:5px}
      .sjw-label{font-size:12px;font-weight:900;color:#cbd5e1;text-transform:uppercase}
      .sjw-input,.sjw-select,.sjw-textarea{width:100%;border-radius:8px;border:1px solid rgba(71,85,105,.95);background:rgba(2,6,23,.62);color:#f8fafc;padding:9px 10px;font-weight:700;outline:none}
      .sjw-textarea{min-height:300px;resize:vertical}
      .sjw-tag-toolbar{display:flex;flex-wrap:wrap;gap:6px}
      .sjw-tag-btn{height:30px;padding:0 9px;border-radius:8px;border:1px solid rgba(71,85,105,.9);background:rgba(30,41,59,.72);font-weight:900}
      .sjw-check{display:flex;align-items:center;gap:8px;color:#e2e8f0;font-weight:800}
      .sjw-image-pick{display:grid;grid-template-columns:52px minmax(0,1fr);gap:8px;align-items:center}
      .sjw-preview{width:52px;height:52px;border-radius:8px;border:1px solid rgba(71,85,105,.8);background:rgba(2,6,23,.6);object-fit:contain}
      .sjw-rune-admin-card{border:1px solid rgba(71,85,105,.58);border-radius:8px;background:rgba(2,6,23,.22);padding:9px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:8px}
      .sjw-block-card{border:1px solid rgba(71,85,105,.65);border-radius:8px;padding:10px;background:rgba(15,23,42,.5);display:grid;gap:8px}
      .sjw-modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68);padding:16px;overflow:hidden}
      .sjw-modal-card{width:min(1300px,94vw);max-height:88vh;overflow:hidden;border:1px solid rgba(71,85,105,.9);border-radius:10px;background:rgba(15,23,42,.98);box-shadow:0 24px 70px rgba(0,0,0,.5);display:grid;grid-template-rows:auto minmax(0,1fr) auto}
      .sjw-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(71,85,105,.72);background:rgba(15,23,42,.98)}
      .sjw-modal-body{overflow:auto;padding:16px}
      .sjw-modal-foot{position:sticky;bottom:0;z-index:2;display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(71,85,105,.72);background:rgba(15,23,42,.98)}
      @media (max-width:1180px){.sjw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sjw-admin{grid-template-columns:1fr}}
      @media (max-width:720px){.sjw-header{align-items:flex-start;flex-direction:column}.sjw-grid{grid-template-columns:1fr}.sjw-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.sjw-search-row{grid-template-columns:1fr}.sjw-admin-item,.sjw-rune-admin-card{grid-template-columns:1fr}.sjw-image-pick{grid-template-columns:1fr}.sjw-form-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderHeader(root, visible, total) {
    root.appendChild(
      el('div', { class: 'sjw-header' },
        el('div', { class: 'min-w-0' },
          el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Sung Jinwoo - Skills'),
          el('div', { class: 'text-sm text-white' }, 'Skills and runes')
        ),
        el('div', { class: 'flex items-center gap-2 flex-wrap justify-end' },
          el('div', { class: 'px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold text-white', 'data-sjw-count': '1' }, `${visible}/${total}`)
        )
      )
    );
  }

  function renderTools(root) {
    const adminBtn = isAdminTabVisible()
      ? el('button', {
        type: 'button',
        class: `sjw-btn ${STATE.adminOpen ? 'sjw-btn-primary' : ''}`,
        onclick: toggleAdmin
      }, 'Admin')
      : null;

    root.appendChild(
      el('div', { class: 'sjw-tools' },
        el('div', { class: 'sjw-search-row' },
          el('input', {
            class: 'sjw-search',
            type: 'search',
            value: STATE.query,
            placeholder: 'Search skill name',
            oninput: (event) => {
              STATE.query = event.target.value || '';
              renderPublicOnly();
            }
          }),
          adminBtn
        ),
        el('div', { class: 'sjw-filters' }, ...FILTERS.map((name) => el('button', {
          type: 'button',
          class: `sjw-filter ${STATE.filter === name ? 'is-active' : ''}`,
          onclick: () => {
            if (STATE.adminOpen) {
              STATE.adminOpen = false;
              STATE.filter = name;
              STATE.publicFilterBeforeAdmin = name;
              render();
              return;
            }
            STATE.filter = name;
            render();
          }
        }, name)))
      )
    );
  }

  function renderPublicOnly() {
    const host = document.querySelector('[data-sjw-public="1"]');
    const count = document.querySelector('[data-sjw-count="1"]');
    if (!host || STATE.adminOpen) return render();
    const visible = filteredSkills().length;
    if (count) count.textContent = `${visible}/${catalogSkills().length}`;
    host.replaceChildren();
    renderPublic(host);
  }

  function renderDescription(rune) {
    const wrap = el('div', { class: 'sjw-skill-desc' });
    const blocks = Array.isArray(rune.description) ? rune.description : [];
    if (!blocks.length) {
      wrap.appendChild(el('p', { class: 'sjw-desc-line' }, 'No description added yet.'));
      return wrap;
    }

    for (const block of blocks) {
      if (block.type === 'effect') {
        if (block.tag) wrap.appendChild(el('div', { class: 'sjw-effect-tag' }, block.tag));
        const lines = Array.isArray(block.lines) ? block.lines : [];
        if (block.imageUrl || block.imageRel) {
          wrap.appendChild(el('div', { class: 'sjw-effect-row' },
            el('img', { class: 'sjw-effect-img', src: imageUrl(block.imageUrl || block.imageRel), alt: '', loading: 'lazy', decoding: 'async' }),
            renderRichText(lines.join('\n'), 'sjw-effect-copy')
          ));
        } else if (lines.length) {
          wrap.appendChild(renderRichText(lines.join('\n'), 'sjw-effect-copy'));
        }
      } else if (block.text) {
        wrap.appendChild(renderRichText(block.text));
      }
    }
    return wrap;
  }

  function selectedRuneNode(rune, animate = false) {
    return el('div', {
      class: 'sjw-selected-rune',
      'data-rune-desc': '1',
      style: animate ? 'height:0;opacity:0' : ''
    },
      el('div', { class: 'sjw-selected-name' }, rune.name || 'Rune'),
      renderDescription(rune)
    );
  }

  function animateHeight(node, opening, done) {
    if (!node) {
      if (done) done();
      return;
    }
    node.style.overflow = 'hidden';
    node.style.height = opening ? '0px' : `${node.scrollHeight}px`;
    node.style.opacity = opening ? '0' : '1';
    node.getBoundingClientRect();
    const targetHeight = opening ? `${node.scrollHeight}px` : '0px';
    const targetOpacity = opening ? '1' : '0';
    node.style.transition = 'height .22s ease, opacity .18s ease';
    node.style.height = targetHeight;
    node.style.opacity = targetOpacity;
    window.setTimeout(() => {
      node.style.transition = '';
      if (opening) {
        node.style.height = 'auto';
        node.style.opacity = '1';
        node.style.overflow = '';
      }
      if (done) done();
    }, 240);
  }

  function setRuneButtonState(card, runeId) {
    card.querySelectorAll('.sjw-rune-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-rune-id') === runeId);
    });
  }

  function toggleRune(skill, runeId) {
    const card = document.querySelector(`.sjw-skill-card[data-skill-id="${cssEscape(skill.id)}"]`);
    const slot = card?.querySelector('.sjw-rune-desc-slot');
    if (!card || !slot || STATE.animatingSkillIds[skill.id]) return;
    const currentRuneId = STATE.renderedRuneBySkill[skill.id] || '';
    const currentNode = slot.querySelector('[data-rune-desc="1"]');

    if (currentRuneId === runeId) {
      STATE.animatingSkillIds[skill.id] = true;
      STATE.expandedSkillIds[skill.id] = false;
      STATE.activeRuneBySkill[skill.id] = '';
      STATE.renderedRuneBySkill[skill.id] = '';
      setRuneButtonState(card, '');
      animateHeight(currentNode, false, () => {
        currentNode?.remove();
        STATE.animatingSkillIds[skill.id] = false;
      });
      return;
    }

    const nextRune = (skill.runes || []).find((rune) => rune.id === runeId);
    if (!nextRune) return;

    const openNext = () => {
      const nextNode = selectedRuneNode(nextRune, true);
      slot.replaceChildren(nextNode);
      STATE.activeRuneBySkill[skill.id] = runeId;
      STATE.expandedSkillIds[skill.id] = true;
      STATE.renderedRuneBySkill[skill.id] = runeId;
      setRuneButtonState(card, runeId);
      animateHeight(nextNode, true, () => {
        STATE.animatingSkillIds[skill.id] = false;
      });
    };

    STATE.animatingSkillIds[skill.id] = true;
    if (currentNode) {
      setRuneButtonState(card, '');
      animateHeight(currentNode, false, () => {
        currentNode.remove();
        openNext();
      });
    } else {
      openNext();
    }
  }

  function runeImageNode(rune) {
    const image = rune.imageUrl || imageUrl(rune.imageRel);
    const kids = [];
    if (image) kids.push(el('img', {
      class: 'sjw-rune-img',
      src: image,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      onerror: (event) => {
        const img = event.currentTarget;
        const parent = img.parentElement;
        img.remove();
        if (parent && !parent.querySelector('.sjw-rune-fallback')) {
          parent.insertBefore(el('span', { class: 'sjw-rune-fallback' }, String(rune.name || 'R').slice(0, 2).toUpperCase()), parent.firstChild);
        }
      }
    }));
    else kids.push(el('span', { class: 'sjw-rune-fallback' }, String(rune.name || 'R').slice(0, 2).toUpperCase()));
    if (rune.hasBreak) {
      kids.push(el('span', { class: 'sjw-mini-badge sjw-break-badge' },
        el('img', {
          src: url(BREAK_ICON),
          alt: 'Break',
          onerror: (event) => {
            event.currentTarget.style.display = 'none';
            const icon = event.currentTarget.parentElement?.querySelector('i');
            if (icon) icon.style.display = 'block';
          }
        }),
        el('i', { class: 'fa-solid fa-shield-halved', 'aria-hidden': 'true' })
      ));
    }
    if (rune.element) {
      kids.push(el('span', { class: 'sjw-mini-badge sjw-element-badge' },
        el('img', { src: elementIcon(rune.element), alt: rune.element })
      ));
    }
    return kids;
  }

  function renderSkillCard(skill) {
    const activeId = STATE.activeRuneBySkill[skill.id] || '';
    const expanded = !!STATE.expandedSkillIds[skill.id];
    const activeRune = (skill.runes || []).find((rune) => rune.id === activeId);

    const runes = skill.runes || [];
    const runeButtons = runes.map((rune) => {
      const active = expanded && activeId === rune.id;
      return el('button', {
        type: 'button',
        class: `sjw-rune-btn ${active ? 'is-active' : ''}`,
        'data-rune-id': rune.id,
        title: rune.name,
        'aria-label': rune.name,
        onclick: () => {
          toggleRune(skill, rune.id);
        }
      }, ...runeImageNode(rune));
    });
    const runeCols = Math.max(1, Math.min(5, runes.length || 1));

    const skillImage = imageUrl(skill.imageUrl || skill.imageRel);
    const hasSkillDescription = Array.isArray(skill.description) && skill.description.length;
    if (expanded && activeRune) STATE.renderedRuneBySkill[skill.id] = activeRune.id;

    const cardClass = [
      'sjw-skill-card',
      runes.length ? 'has-runes' : 'no-runes',
      expanded && activeRune ? 'is-expanded' : '',
      !runes.length && !hasSkillDescription ? 'is-empty' : ''
    ].filter(Boolean).join(' ');

    return el('article', { class: cardClass, 'data-skill-id': skill.id },
      el('div', { class: 'sjw-card-head' },
        el('div', { class: 'sjw-skill-icon' },
          el('div', { class: 'sjw-skill-icon-inner' },
            skillImage ? el('img', {
              src: skillImage,
              alt: '',
              loading: 'lazy',
              decoding: 'async',
              onerror: (event) => {
                const img = event.currentTarget;
                const parent = img.parentElement;
                img.remove();
                parent?.appendChild(el('i', { class: 'fa-solid fa-burst' }));
              }
            }) : el('i', { class: 'fa-solid fa-burst' })
          )
        ),
        el('div', { class: 'sjw-title-block' },
          el('h2', {}, skill.name),
          el('div', { class: 'sjw-badge-row' },
            el('span', { class: `sjw-type sjw-type-${String(skill.type || '').toLowerCase()}` }, skill.type || 'Regular'),
            el('span', { class: 'sjw-rune-count' }, `${(skill.runes || []).length} ${(skill.runes || []).length === 1 ? 'Rune' : 'Runes'}`)
          )
        )
      ),
      hasSkillDescription ? el('div', { class: 'sjw-skill-effect' },
        String(skill.type || '').toLowerCase() === 'ultimate'
          ? el('div', { class: 'sjw-skill-effect-title' }, el('i', { class: 'fas fa-bolt text-warning' }), el('span', {}, 'Ultimate Effect'))
          : null,
        renderDescription({ description: skill.description })
      ) : null,
      runes.length ? el('div', { class: 'sjw-rune-panel' },
        el('div', { class: 'sjw-rune-row', style: `grid-template-columns:repeat(${runeCols},minmax(0,1fr))` }, ...runeButtons),
        el('div', { class: 'sjw-rune-desc-slot' }, expanded && activeRune ? selectedRuneNode(activeRune, false) : null)
      ) : null
    );
  }

  function tagToolbar(textarea) {
    const keepSelection = (event) => event.preventDefault();
    return el('div', { class: 'sjw-tag-toolbar' },
      el('button', { type: 'button', class: 'sjw-tag-btn', style: `color:${COLOR_GOLD}`, onmousedown: keepSelection, onclick: () => insertAroundSelection(textarea, '[keyword]', '[/keyword]') }, 'Keyword'),
      el('button', { type: 'button', class: 'sjw-tag-btn', style: `color:${COLOR_LIGHT}`, onmousedown: keepSelection, onclick: () => insertAroundSelection(textarea, '[keyword2]', '[/keyword2]') }, 'Keyword2'),
      el('button', { type: 'button', class: 'sjw-tag-btn', style: `color:${COLOR_ORANGE}`, onmousedown: keepSelection, onclick: () => insertAroundSelection(textarea, '[break]', '[/break]') }, 'Break'),
      el('button', { type: 'button', class: 'sjw-tag-btn', style: `color:${COLOR_MINT}`, onmousedown: keepSelection, onclick: () => insertAroundSelection(textarea, '[debuff]', '[/debuff]') }, 'Debuff'),
      el('button', { type: 'button', class: 'sjw-tag-btn', style: 'color:#f8fafc;font-weight:950', onmousedown: keepSelection, onclick: () => insertAroundSelection(textarea, '[b]', '[/b]') }, 'B')
    );
  }

  function textareaField(label, value, onInput, fieldKey = '') {
    const textarea = el('textarea', {
      class: 'sjw-textarea',
      'data-field-key': fieldKey,
      placeholder: 'Tags: [keyword]text[/keyword], [keyword2]text[/keyword2], [break]text[/break], [debuff]text[/debuff], [b]bold[/b]. Start a line with | for a bullet.',
      oninput: (event) => onInput(event.target.value)
    }, value || '');
    return el('label', { class: 'sjw-field' },
      el('span', { class: 'sjw-label' }, label),
      tagToolbar(textarea),
      textarea
    );
  }

  function renderPublic(root) {
    const skills = filteredSkills();
    if (STATE.loading) {
      root.appendChild(el('div', { class: 'sjw-empty' }, 'Loading skills...'));
      return;
    }
    if (STATE.error) {
      root.appendChild(el('div', { class: 'sjw-empty' }, STATE.error));
      return;
    }
    if (!skills.length) {
      root.appendChild(el('div', { class: 'sjw-empty' }, 'No skills match the current search.'));
      return;
    }
    const stack = el('div', { class: 'sjw-category-stack' });
    const sectionTypes = ['Regular', 'QTE', 'Ultimate'];
    const groupType = (skill) => {
      const type = String(skill.type || 'Regular');
      return type === 'QTE' || type === 'Ultimate' ? type : 'Regular';
    };
    const groups = sectionTypes
      .map((type) => ({ type, skills: skills.filter((skill) => groupType(skill) === type) }))
      .filter((group) => group.skills.length);
    for (const group of groups) {
      stack.appendChild(el('section', { class: 'sjw-category' },
        el('div', { class: 'sjw-category-title' }, group.type),
        el('div', { class: 'sjw-grid' }, ...group.skills.map(renderSkillCard))
      ));
    }
    root.appendChild(stack);
  }

  function imageSelect(label, value, images, onChange) {
    const current = value || '';
    const preview = imageUrl(current);
    return el('label', { class: 'sjw-field' },
      el('span', { class: 'sjw-label' }, label),
      el('div', { class: 'sjw-image-pick' },
        preview ? el('img', { class: 'sjw-preview', src: preview, alt: '' }) : el('div', { class: 'sjw-preview' }),
        el('select', {
          class: 'sjw-select',
          value: current,
          onchange: (event) => onChange(event.target.value)
        },
          el('option', { value: '' }, 'No image'),
          ...(images || []).map((img) => el('option', { value: img.rel, selected: img.rel === current }, img.rel))
        )
      )
    );
  }

  function captureModalState() {
    const body = document.querySelector('.sjw-modal-body');
    const active = document.activeElement;
    return {
      scrollTop: body ? body.scrollTop : 0,
      key: active?.getAttribute?.('data-field-key') || '',
      selectionStart: typeof active?.selectionStart === 'number' ? active.selectionStart : null,
      selectionEnd: typeof active?.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  function restoreModalState(snapshot) {
    if (!snapshot) return;
    const body = document.querySelector('.sjw-modal-body');
    if (body) body.scrollTop = snapshot.scrollTop || 0;
    if (!snapshot.key) return;
    const field = document.querySelector(`[data-field-key="${cssEscape(snapshot.key)}"]`);
    if (!field) return;
    field.focus();
    if (snapshot.selectionStart != null && typeof field.setSelectionRange === 'function') {
      try { field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd ?? snapshot.selectionStart); } catch (_) {}
    }
  }

  function renderModalPreserved() {
    const snapshot = captureModalState();
    renderModal();
    restoreModalState(snapshot);
  }

  function updateSkillDraft(patch, redraw = false) {
    STATE.skillDraft = { ...(STATE.skillDraft || {}), ...patch };
    if (patch.folder) {
      clearTimeout(STATE.folderLoadTimers.skill);
      STATE.folderLoadTimers.skill = setTimeout(() => {
        loadFolderImages(STATE.skillDraft?.folder).then(() => renderModalPreserved());
      }, 300);
    }
    if (redraw) renderModalPreserved();
  }

  function newSkillDraft() {
    return { id: '', name: '', folder: '', type: 'Regular', imageRel: '', description: [], runes: [], order: catalogSkills().length };
  }

  function editSkill(skill = null) {
    STATE.skillDraft = skill ? clone(skill) : newSkillDraft();
    STATE.runeDraft = null;
    if (STATE.skillDraft.folder) loadFolderImages(STATE.skillDraft.folder).then(render);
    render();
  }

  async function saveSkillDraft() {
    const draft = clone(STATE.skillDraft);
    if (!draft?.name?.trim()) return toast('Name is required');
    draft.folder = String(draft.folder || draft.name).trim();
    const next = clone(STATE.catalog);
    const idx = next.skills.findIndex((skill) => skill.id === draft.id && draft.id);
    if (idx >= 0) {
      next.skills[idx] = { ...next.skills[idx], ...draft, runes: next.skills[idx].runes || draft.runes || [] };
    } else {
      draft.id = uniqueId(draft.name, next.skills);
      draft.order = next.skills.length;
      draft.runes = [];
      next.skills.push(draft);
    }
    if (await saveCatalog(next, 'Skill saved')) {
      STATE.skillDraft = null;
      render();
    }
  }

  async function removeSkill(id) {
    if (!confirm('Delete this skill from catalog? Images will not be deleted.')) return;
    const next = clone(STATE.catalog);
    next.skills = next.skills.filter((skill) => skill.id !== id).map((skill, index) => ({ ...skill, order: index }));
    await saveCatalog(next, 'Skill removed');
  }

  async function moveSkill(id, direction) {
    const next = clone(STATE.catalog);
    const idx = next.skills.findIndex((skill) => skill.id === id);
    const to = idx + (direction === 'down' ? 1 : -1);
    if (idx < 0 || to < 0 || to >= next.skills.length) return;
    const tmp = next.skills[idx];
    next.skills[idx] = next.skills[to];
    next.skills[to] = tmp;
    next.skills = next.skills.map((skill, index) => ({ ...skill, order: index }));
    await saveCatalog(next, 'Order saved');
  }

  async function applyExactOrder() {
    const names = STATE.orderText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const next = clone(STATE.catalog);
    const picked = [];
    const used = new Set();
    for (const name of names) {
      const hit = next.skills.find((skill) => !used.has(skill.id) && skill.name.toLowerCase() === name.toLowerCase());
      if (hit) {
        used.add(hit.id);
        picked.push(hit);
      }
    }
    for (const skill of next.skills) if (!used.has(skill.id)) picked.push(skill);
    next.skills = picked.map((skill, index) => ({ ...skill, order: index }));
    if (await saveCatalog(next, 'Exact order saved')) {
      STATE.orderModalOpen = false;
      render();
    }
  }

  function openExactOrderModal() {
    STATE.orderText = catalogSkills().map((skill) => skill.name).join('\n');
    STATE.orderModalOpen = true;
    render();
  }

  function newRuneDraft(skill) {
    return { id: '', skillId: skill.id, name: '', imageRel: '', element: '', hasBreak: false, description: [], order: (skill.runes || []).length };
  }

  function editRune(skill, rune = null) {
    STATE.runeDraft = rune ? { ...clone(rune), skillId: skill.id } : newRuneDraft(skill);
    STATE.skillDraft = null;
    if (skill.folder) loadFolderImages(skill.folder).then(render);
    render();
  }

  function updateRuneDraft(patch, redraw = false) {
    STATE.runeDraft = { ...(STATE.runeDraft || {}), ...patch };
    if (redraw) renderModalPreserved();
  }

  async function saveRuneDraft() {
    const draft = clone(STATE.runeDraft);
    if (!draft?.name?.trim()) return toast('Rune name is required');
    const next = clone(STATE.catalog);
    const skill = next.skills.find((item) => item.id === draft.skillId);
    if (!skill) return toast('Skill missing');
    skill.runes = Array.isArray(skill.runes) ? skill.runes : [];
    const idx = skill.runes.findIndex((rune) => rune.id === draft.id && draft.id);
    delete draft.skillId;
    if (idx >= 0) skill.runes[idx] = { ...skill.runes[idx], ...draft };
    else {
      draft.id = uniqueId(draft.name, skill.runes);
      draft.order = skill.runes.length;
      skill.runes.push(draft);
    }
    if (await saveCatalog(next, 'Rune saved')) {
      STATE.runeDraft = null;
      render();
    }
  }

  async function removeRune(skillId, runeId) {
    if (!confirm('Delete this rune from catalog? Images will not be deleted.')) return;
    const next = clone(STATE.catalog);
    const skill = next.skills.find((item) => item.id === skillId);
    if (!skill) return;
    skill.runes = (skill.runes || []).filter((rune) => rune.id !== runeId).map((rune, index) => ({ ...rune, order: index }));
    await saveCatalog(next, 'Rune removed');
  }

  async function moveRune(skillId, runeId, direction) {
    const next = clone(STATE.catalog);
    const skill = next.skills.find((item) => item.id === skillId);
    if (!skill) return;
    const idx = skill.runes.findIndex((rune) => rune.id === runeId);
    const to = idx + (direction === 'down' ? 1 : -1);
    if (idx < 0 || to < 0 || to >= skill.runes.length) return;
    const tmp = skill.runes[idx];
    skill.runes[idx] = skill.runes[to];
    skill.runes[to] = tmp;
    skill.runes = skill.runes.map((rune, index) => ({ ...rune, order: index }));
    await saveCatalog(next, 'Rune order saved');
  }

  function descriptionBlockEditor(block, index, blocks, updateDescription, folder, scope = 'desc') {
    const updateBlock = (patch) => {
      const next = blocks.slice();
      next[index] = { ...next[index], ...patch };
      updateDescription(next, false);
    };
    const move = (dir) => {
      const to = index + (dir === 'down' ? 1 : -1);
      if (to < 0 || to >= blocks.length) return;
      const next = blocks.slice();
      const tmp = next[index];
      next[index] = next[to];
      next[to] = tmp;
      updateDescription(next, true);
    };
    const remove = () => updateDescription(blocks.filter((_, i) => i !== index), true);
    const images = STATE.folderImages[folder] || [];
    return el('div', { class: 'sjw-block-card' },
      el('div', { class: 'sjw-admin-actions' },
        el('select', { class: 'sjw-select', onchange: (e) => { updateBlock({ type: e.target.value }); renderModalPreserved(); } },
          el('option', { value: 'text', selected: block.type !== 'effect' }, 'Text'),
          el('option', { value: 'effect', selected: block.type === 'effect' }, 'Effect')
        ),
        el('button', { type: 'button', class: 'sjw-btn', onclick: () => move('up') }, 'Up'),
        el('button', { type: 'button', class: 'sjw-btn', onclick: () => move('down') }, 'Down'),
        el('button', { type: 'button', class: 'sjw-btn sjw-btn-danger', onclick: remove }, 'Delete')
      ),
      block.type === 'effect'
        ? [
          el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Tag'), el('input', { class: 'sjw-input', 'data-field-key': `${scope}-${index}-tag`, value: block.tag || '', oninput: (e) => updateBlock({ tag: e.target.value }) })),
          imageSelect('Effect image', block.imageRel || '', images, (value) => { updateBlock({ imageRel: value }); renderModalPreserved(); }),
          textareaField('Lines', (block.lines || []).join('\n'), (value) => updateBlock({ lines: value.split(/\r?\n/) }), `${scope}-${index}-lines`)
        ]
        : textareaField('Text', block.text || '', (value) => updateBlock({ text: value }), `${scope}-${index}-text`)
    );
  }

  function blockEditor(block, index) {
    const blocks = STATE.runeDraft.description || [];
    const skill = catalogSkills().find((item) => item.id === STATE.runeDraft.skillId);
    return descriptionBlockEditor(block, index, blocks, (description, redraw) => updateRuneDraft({ description }, redraw), skill?.folder, 'rune-desc');
  }

  function renderSkillForm(root, footer) {
    if (!STATE.skillDraft) return;
    const draft = STATE.skillDraft;
    const images = STATE.folderImages[draft.folder] || [];
    const blocks = Array.isArray(draft.description) ? draft.description : [];
    root.appendChild(el('div', { class: 'sjw-panel' },
      el('div', { class: 'sjw-form sjw-form-grid' },
        el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Name'), el('input', { class: 'sjw-input', 'data-field-key': 'skill-name', value: draft.name || '', oninput: (e) => updateSkillDraft({ name: e.target.value }) })),
        el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Folder'), el('input', { class: 'sjw-input', 'data-field-key': 'skill-folder', value: draft.folder || '', oninput: (e) => updateSkillDraft({ folder: e.target.value }) })),
        el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Type'), el('select', { class: 'sjw-select', onchange: (e) => updateSkillDraft({ type: e.target.value }) }, ...FILTERS.filter((x) => x !== 'All').map((type) => el('option', { value: type, selected: draft.type === type }, type)))),
        imageSelect('Main skill image', draft.imageRel || '', images, (value) => updateSkillDraft({ imageRel: value }, true)),
        el('div', { class: 'sjw-panel-title sjw-form-wide' }, 'Skill / Ultimate description'),
        ...blocks.map((block, index) => {
          const node = descriptionBlockEditor(block, index, blocks, (description, redraw) => updateSkillDraft({ description }, redraw), draft.folder, 'skill-desc');
          node.classList.add('sjw-form-wide');
          return node;
        }),
        el('div', { class: 'sjw-admin-actions sjw-form-wide' },
          el('button', { type: 'button', class: 'sjw-btn', onclick: () => updateSkillDraft({ description: [...blocks, { type: 'text', text: '' }] }, true) }, 'Add text'),
          el('button', { type: 'button', class: 'sjw-btn', onclick: () => updateSkillDraft({ description: [...blocks, { type: 'effect', tag: '', imageRel: '', lines: [] }] }, true) }, 'Add effect')
        )
      )
    ));
    footer.append(
      el('button', { type: 'button', class: 'sjw-btn sjw-btn-primary', disabled: STATE.saving, onclick: saveSkillDraft }, 'Save'),
      el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: closeModals }, 'Cancel')
    );
  }

  function renderRuneForm(root, footer) {
    if (!STATE.runeDraft) return;
    const draft = STATE.runeDraft;
    const skill = catalogSkills().find((item) => item.id === draft.skillId);
    const images = STATE.folderImages[skill?.folder] || [];
    const blocks = Array.isArray(draft.description) ? draft.description : [];
    root.appendChild(el('div', { class: 'sjw-panel' },
      el('div', { class: 'sjw-form sjw-form-grid' },
        el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Name'), el('input', { class: 'sjw-input', 'data-field-key': 'rune-name', value: draft.name || '', oninput: (e) => updateRuneDraft({ name: e.target.value }) })),
        imageSelect('Rune image', draft.imageRel || '', images, (value) => updateRuneDraft({ imageRel: value }, true)),
        el('label', { class: 'sjw-field' }, el('span', { class: 'sjw-label' }, 'Element'), el('select', { class: 'sjw-select', onchange: (e) => updateRuneDraft({ element: e.target.value }) }, ...ELEMENTS.map((element) => el('option', { value: element, selected: draft.element === element }, element || 'None')))),
        el('label', { class: 'sjw-check' }, el('input', { type: 'checkbox', checked: !!draft.hasBreak, onchange: (e) => updateRuneDraft({ hasBreak: e.target.checked }) }), 'Break icon'),
        el('div', { class: 'sjw-panel-title sjw-form-wide' }, 'Description blocks'),
        ...blocks.map((block, index) => {
          const node = blockEditor(block, index);
          node.classList.add('sjw-form-wide');
          return node;
        }),
        el('div', { class: 'sjw-admin-actions sjw-form-wide' },
          el('button', { type: 'button', class: 'sjw-btn', onclick: () => updateRuneDraft({ description: [...blocks, { type: 'text', text: '' }] }, true) }, 'Add text'),
          el('button', { type: 'button', class: 'sjw-btn', onclick: () => updateRuneDraft({ description: [...blocks, { type: 'effect', tag: '', imageRel: '', lines: [] }] }, true) }, 'Add effect')
        )
      )
    ));
    footer.append(
      el('button', { type: 'button', class: 'sjw-btn sjw-btn-primary', disabled: STATE.saving, onclick: saveRuneDraft }, 'Save'),
      el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: closeModals }, 'Cancel')
    );
  }

  function renderAdmin(root) {
    const top = el('div', { class: 'sjw-panel' },
      el('div', { class: 'sjw-admin-actions', style: 'margin-bottom:10px' },
        el('button', { type: 'button', class: 'sjw-btn sjw-btn-primary', disabled: STATE.saving, onclick: () => editSkill(null) }, 'Add skill'),
        el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: openExactOrderModal }, 'Exact order')
      )
    );

    const right = el('div', { class: 'sjw-form' });
    for (const skill of catalogSkills()) {
      right.appendChild(el('div', { class: 'sjw-panel' },
        el('div', { class: 'sjw-admin-item', style: 'margin-bottom:10px' },
          el('div', { class: 'min-w-0' },
            el('div', { class: 'font-extrabold text-white truncate' }, skill.name),
            el('div', { class: 'text-xs text-slate-300' }, `${skill.type} / ${skill.folder}`)
          ),
          el('div', { class: 'sjw-admin-actions' },
            el('button', { type: 'button', class: 'sjw-btn sjw-btn-primary', disabled: STATE.saving, onclick: () => editRune(skill, null) }, 'Add rune'),
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => moveSkill(skill.id, 'up') }, 'Up'),
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => moveSkill(skill.id, 'down') }, 'Down'),
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => editSkill(skill) }, 'Edit skill'),
            el('button', { type: 'button', class: 'sjw-btn sjw-btn-danger', disabled: STATE.saving, onclick: () => removeSkill(skill.id) }, 'Delete')
          )
        ),
        ...(skill.runes || []).map((rune) => el('div', { class: 'sjw-rune-admin-card' },
          el('div', { class: 'flex items-center gap-3 min-w-0' },
            el('button', { type: 'button', class: 'sjw-rune-btn', style: 'width:52px;height:52px;flex:0 0 52px', disabled: true }, ...runeImageNode(rune)),
            el('div', { class: 'min-w-0' },
              el('div', { class: 'font-extrabold text-white truncate' }, rune.name),
              el('div', { class: 'text-xs text-slate-300' }, `${rune.element || 'No element'}${rune.hasBreak ? ' / Break' : ''}`)
            )
          ),
          el('div', { class: 'sjw-admin-actions' },
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => moveRune(skill.id, rune.id, 'up') }, 'Up'),
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => moveRune(skill.id, rune.id, 'down') }, 'Down'),
            el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: () => editRune(skill, rune) }, 'Edit'),
            el('button', { type: 'button', class: 'sjw-btn sjw-btn-danger', disabled: STATE.saving, onclick: () => removeRune(skill.id, rune.id) }, 'Delete')
          )
        ))
      ));
    }

    root.appendChild(el('div', { class: 'sjw-admin' }, top, right));
  }

  function closeModals() {
    STATE.skillDraft = null;
    STATE.runeDraft = null;
    STATE.orderModalOpen = false;
    render();
  }

  function renderModal() {
    document.querySelector('[data-sjw-modal="1"]')?.remove();
    if (!STATE.skillDraft && !STATE.runeDraft && !STATE.orderModalOpen) return;

    const overlay = el('div', {
      class: 'sjw-modal',
      'data-sjw-modal': '1',
      onclick: (event) => {
        if (event.target === overlay) closeModals();
      }
    });

    const card = el('div', { class: 'sjw-modal-card' });
    const body = el('div', { class: 'sjw-modal-body' });
    const footer = el('div', { class: 'sjw-modal-foot' });
    const title = STATE.orderModalOpen
      ? 'Exact order'
      : STATE.skillDraft
        ? (STATE.skillDraft.id ? 'Edit skill' : 'Add skill')
        : (STATE.runeDraft?.id ? 'Edit rune' : 'Add rune');

    card.appendChild(el('div', { class: 'sjw-modal-head' },
      el('div', { class: 'sjw-panel-title', style: 'margin:0' }, title),
      el('button', { type: 'button', class: 'sjw-btn', onclick: closeModals }, 'Close')
    ));

    if (STATE.orderModalOpen) {
      body.appendChild(el('div', { class: 'sjw-form' },
        el('label', { class: 'sjw-field' },
          el('span', { class: 'sjw-label' }, 'One skill name per line'),
          el('textarea', {
            class: 'sjw-textarea',
            'data-field-key': 'exact-order',
            style: 'min-height:260px',
            oninput: (event) => { STATE.orderText = event.target.value; }
          }, STATE.orderText || catalogSkills().map((skill) => skill.name).join('\n'))
        )
      ));
      footer.append(
        el('button', { type: 'button', class: 'sjw-btn sjw-btn-primary', disabled: STATE.saving, onclick: applyExactOrder }, 'Save order'),
        el('button', { type: 'button', class: 'sjw-btn', disabled: STATE.saving, onclick: closeModals }, 'Cancel')
      );
    } else if (STATE.skillDraft) {
      renderSkillForm(body, footer);
    } else if (STATE.runeDraft) {
      renderRuneForm(body, footer);
    }

    card.appendChild(body);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function render() {
    ensureStyles();
    const content = document.getElementById('content');
    if (!content) return;

    const visible = filteredSkills().length;
    const total = catalogSkills().length;
    const shell = el('div', { class: `sjw-shell ${STATE.adminOpen ? 'is-admin' : ''}`, 'data-sla-page': 'sung-skills' });
    renderHeader(shell, visible, total);
    renderTools(shell);

    if (STATE.adminOpen && isAdminTabVisible()) renderAdmin(shell);
    else {
      const publicHost = el('div', { 'data-sjw-public': '1' });
      renderPublic(publicHost);
      shell.appendChild(publicHost);
    }

    content.replaceChildren(shell);
    renderModal();
    if (typeof window.forceDarkMode === 'function') window.forceDarkMode();
  }

  window.__sung_skills_mount = async function __sung_skills_mount() {
    STATE.loading = true;
    STATE.error = '';
    render();

    try {
      await loadCatalog();
      preloadVisibleFolders();
    } catch (e) {
      STATE.error = `Failed to load skills: ${e?.message || e}`;
    } finally {
      STATE.loading = false;
      render();
    }
  };
})();
