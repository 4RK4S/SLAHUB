'use strict';

(function () {
  const STATE = {
    items: [],
    current: null,
    index: -1,
    lightbox: null,
    lightboxOpen: false
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
    console.log('[successor-details]', msg);
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

  function slugifySuccessorName(name) {
    return String(name || '')
      .trim()
      .replace(/'/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '_')
      .replace(/_+/g, '_');
  }

  function unslugPathSuccessor(pathname) {
    const path = String(pathname || location.pathname || '').split('?')[0].split('#')[0];
    const marker = '/successors/';
    const idx = path.indexOf(marker);
    if (idx < 0) return '';
    const raw = path.slice(idx + marker.length).split('/')[0] || '';
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function getCurrentSuccessor() {
    return STATE.current || null;
  }

  function isSuccessorDetailsPath(pathname = location.pathname) {
    return !!unslugPathSuccessor(pathname);
  }

  function normElement(value) {
    const v = String(value || '').trim().toLowerCase();
    return ['fire', 'water', 'wind', 'light', 'dark', 'none'].includes(v) ? v : 'none';
  }

  function elementIconSrc(value) {
    const element = normElement(value);
    const icons = {
      fire: url('/picture/Element/Fires.png'),
      water: url('/picture/Element/Waters.png'),
      wind: url('/picture/Element/Winds.png'),
      light: url('/picture/Element/Lights.png'),
      dark: url('/picture/Element/Darkness.png'),
      none: url('/picture/Element/NONE.png')
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
    let noExt = file.replace(/\.[a-z0-9]+$/i, '');
    if (!noExt) return '';
    noExt = noExt.replace(/^(Img_|Icon_)/i, '');
    return noExt
      .replace(/_/g, ' ')
      .replace(/SuccessorGrowth/g, 'Successor Growth')
      .trim();
  }

  function normalizeItem(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const successor_type_image = String(
      src.successor_type_image ||
      src.successorTypeImage ||
      src.successor_image ||
      src.type_image ||
      ''
    ).trim();
    return {
      name: String(src.name || '').trim(),
      image_build: String(src.image_build || src.buildImage || src.image || '').trim(),
      element: normElement(src.element),
      successor_type_image
    };
  }

  async function fetchJson(path) {
    const r = await fetch(url(path), {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  function applyOrder(list, order) {
    const ord = Array.isArray(order) ? order : [];
    const map = new Map();
    ord.forEach((name, idx) => map.set(String(name), idx));
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      const ai = map.has(an) ? map.get(an) : 1e9;
      const bi = map.has(bn) ? map.get(bn) : 1e9;
      if (ai !== bi) return ai - bi;
      return an.localeCompare(bn);
    });
  }

  async function loadSuccessors() {
    const [catalog, orderPayload] = await Promise.all([
      fetchJson('/api/public/successors'),
      fetchJson('/api/public/successors-order').catch(() => ({ order: [] }))
    ]);
    const raw = Array.isArray(catalog?.items) ? catalog.items
      : Array.isArray(catalog?.successors) ? catalog.successors
      : Array.isArray(catalog) ? catalog
      : [];
    const items = raw.map(normalizeItem).filter(x => x.name);
    return applyOrder(items, Array.isArray(orderPayload?.order) ? orderPayload.order : []);
  }

  function successorPath(item) {
    const slug = slugifySuccessorName(item?.name || '');
    return slug ? url(`/successors/${encodeURIComponent(slug)}`) : url('/successors');
  }

  function getFileNameFromSrc(src, fallback = 'image.png') {
    const clean = String(src || '').split('?')[0].split('#')[0];
    const rawName = clean.split('/').pop() || fallback;
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    return hasExt ? rawName : `${rawName}.png`;
  }

  function navigate(path) {
    if (typeof window.routeTo === 'function') {
      window.routeTo(path);
      return;
    }
    try {
      history.pushState({}, '', path);
    } catch (_) {}
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function backToList() {
    navigate(url('/successors'));
  }

  function goToSuccessor(item) {
    if (!item) return;
    navigate(successorPath(item));
  }

  function closeLightbox() {
    if (!STATE.lightbox) return;
    STATE.lightbox.classList.add('hidden');
    STATE.lightboxOpen = false;
    document.body.classList.remove('dh-no-scroll');
  }

  async function downloadCurrentLightboxImage() {
    if (!STATE.lightbox || !STATE.lightbox._img?.src) {
      toast('Image not found.');
      return;
    }

    const src = STATE.lightbox._img.src;
    const current = getCurrentSuccessor();
    const fallback = `${slugifySuccessorName(current?.name || 'successor')}.png`;
    const fileName = getFileNameFromSrc(src, fallback);

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

  function openLightbox(src, alt = '', title = '') {
    const imageSrc = String(src || '').trim();
    if (!imageSrc) return;

    if (!STATE.lightbox) {
      const lb = el('div', { class: 'dh-lightbox hidden', role: 'dialog', 'aria-modal': 'true' });
      const titleNode = el('div', { class: 'dh-lightbox-title' });
      const closeBtn = el('button', { type: 'button', class: 'dh-lightbox-close', title: 'Close', 'aria-label': 'Close preview' },
        el('i', { class: 'fa-solid fa-xmark' })
      );
      const img = el('img', { class: 'dh-lightbox-img', loading: 'eager', decoding: 'async' });
      const footTitle = el('div', { class: 'dh-lightbox-foot-title' });
      const footActions = el('div', { class: 'dh-lightbox-actions' },
        el('button', { class: 'dh-btn dh-download', type: 'button', onclick: () => downloadCurrentLightboxImage() },
          el('i', { class: 'fa-solid fa-download' }),
          'Download'
        ),
        el('button', { class: 'dh-btn', type: 'button', onclick: () => closeLightbox() }, 'Close')
      );

      closeBtn.addEventListener('click', closeLightbox);
      lb.addEventListener('mousedown', (ev) => {
        if (ev.target === lb) closeLightbox();
      });
      lb.append(el('div', { class: 'dh-lightbox-card' },
        el('div', { class: 'dh-lightbox-head' }, titleNode, closeBtn),
        el('div', { class: 'dh-lightbox-body' }, img),
        el('div', { class: 'dh-lightbox-foot' }, footTitle, footActions)
      ));
      lb._title = titleNode;
      lb._img = img;
      lb._footTitle = footTitle;
      lb._footActions = footActions;
      STATE.lightbox = lb;
      document.body.append(lb);
    }

    const current = getCurrentSuccessor();
    const previewTitle = String(title || `${current?.name || 'Successor'} - Image Preview`);
    const previewAlt = String(alt || current?.name || '');
    STATE.lightbox._title.textContent = previewTitle;
    STATE.lightbox._img.src = imageSrc;
    STATE.lightbox._img.alt = previewAlt;
    STATE.lightbox._footTitle.textContent = previewAlt || previewTitle || '';
    STATE.lightbox.classList.remove('hidden');
    STATE.lightboxOpen = true;
    document.body.classList.add('dh-no-scroll');
  }

  function renderChip(label, imgSrc, options = {}) {
    const clickable = typeof options.onClick === 'function';

    return el(clickable ? 'button' : 'div', {
      class: `ds-chip${options.className ? ' ' + options.className : ''}${clickable ? ' clickable' : ''}`,
      type: clickable ? 'button' : null,
      title: clickable ? `Open ${label || 'preview'}` : (label || ''),
      onClick: clickable ? options.onClick : null
    },
      imgSrc
        ? el('img', {
            src: imgSrc,
            alt: label || '',
            loading: 'lazy',
            decoding: 'async',
            onerror: function () { this.style.display = 'none'; }
          })
        : null,
      el('span', {}, label || '-')
    );
  }

  function ensureStyles() {
    if (document.getElementById('details-successors-style')) return;
    document.head.append(el('style', { id: 'details-successors-style' }, `
      .dh-page{max-width:1280px;margin:0 auto;padding:20px;display:grid;gap:18px;color:#e5eefc}
      .dh-card{border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg, rgba(15,23,42,.85), rgba(2,6,23,.85));border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.25)}
      .dh-top-wrap{overflow:hidden}
      .dh-top{display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px;align-items:start}
      .dh-left-wrap{min-width:0;display:flex;flex-direction:column}
      .dh-left{position:relative;border-radius:24px;height:460px;min-height:460px;max-height:460px;overflow:hidden;background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(30,41,59,.8));border:1px solid rgba(148,163,184,.16);display:grid;place-items:center}
      .dh-left img{width:auto;height:100%;max-width:118%;max-height:118%;object-fit:contain;display:block;filter:drop-shadow(0 22px 36px rgba(0,0,0,.42));transform:none;user-select:none}
      .dh-right{min-width:0;min-height:210px;display:grid;gap:16px;align-content:start;border-radius:0;background:transparent;border:0;box-shadow:none}
      .dh-name{font-size:34px;line-height:1.05;font-weight:1000;color:#fff;margin:0}
      .dh-pagebar,.dh-top-actions{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
      .dh-page-head{display:grid;gap:4px}
      .dh-page-title{font-size:24px;font-weight:800;line-height:1.25;color:#facc15}
      .dh-page-subtitle{font-size:14px;color:rgba(203,213,225,.9)}
      .dh-btns{display:flex;gap:10px;flex-wrap:wrap}
      .dh-btn{height:42px;padding:0 16px;border-radius:14px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.75);color:#fff;font-weight:900;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 24px rgba(0,0,0,.18);transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease,background .15s ease}
      .dh-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .dh-btn.nav{max-width:220px}
      .dh-btn.nav span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dh-btn:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(250,204,21,.35);background:rgba(30,41,59,.92);box-shadow:0 14px 28px rgba(0,0,0,.24)}
      .ds-tags{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:100%;min-width:0}
      .ds-chip{appearance:none;height:40px;min-width:0;max-width:100%;display:inline-flex;align-items:center;gap:9px;padding:8px 12px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.65);font-size:14px;font-weight:900;text-transform:capitalize;color:#f8fafc;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
      button.ds-chip{cursor:pointer;font-family:inherit}
      .ds-chip.clickable{transition:transform .15s ease,border-color .15s ease,background .15s ease,box-shadow .15s ease}
      .ds-chip.clickable:hover{transform:translateY(-1px);border-color:rgba(250,204,21,.45);background:rgba(30,41,59,.85);box-shadow:0 12px 26px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.05)}
      .ds-chip.clickable:active{transform:translateY(0)}
      .ds-chip img{width:auto;height:25px;max-width:30px;object-fit:contain;filter:drop-shadow(0 8px 14px rgba(0,0,0,.42));flex:0 0 auto}
      .ds-chip.ds-type-chip img{height:32px;max-width:38px}
      .ds-chip span{min-width:0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dh-no-scroll{overflow:hidden}
      .dh-lightbox{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(2,6,23,.72);backdrop-filter:blur(8px)}
      .dh-lightbox.hidden{display:none}
      .dh-lightbox-card{width:min(1200px,96vw);height:min(90vh,900px);border-radius:24px;border:1px solid rgba(148,163,184,.18);background:linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.96));box-shadow:0 20px 60px rgba(0,0,0,.45);display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;color:#e5eefc}
      .dh-lightbox-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}
      .dh-lightbox-title{font-size:18px;font-weight:1000;color:#facc15;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dh-lightbox-close{width:42px;height:42px;min-width:42px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.6);color:#fff;cursor:pointer;font-size:20px;line-height:1;display:inline-flex;align-items:center;justify-content:center;font-weight:1000}
      .dh-lightbox-body{position:relative;display:flex;align-items:center;justify-content:center;padding:24px 72px;overflow:hidden;min-height:0}
      .dh-lightbox-img{display:block;width:auto!important;height:auto!important;max-width:min(100%,760px);max-height:min(100%,58vh);object-fit:contain;object-position:center center;user-select:none;margin:auto;filter:drop-shadow(0 10px 26px rgba(0,0,0,.28))}
      .dh-lightbox-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:18px 20px;border-top:1px solid rgba(148,163,184,.14);color:#e2e8f0;font-weight:800;overflow:hidden}
      .dh-lightbox-foot-title{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e2e8f0;font-weight:900}
      .dh-lightbox-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:0 0 auto}
      .dh-download{background:rgba(250,204,21,.95);border-color:rgba(250,204,21,.75);color:#111827}
      .dh-download:hover{background:#facc15;color:#111827}
      .ds-empty{max-width:640px;margin:48px auto;padding:24px;border-radius:18px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);text-align:center;color:#e2e8f0}
      @media (max-width:980px){.dh-top{grid-template-columns:1fr;gap:14px;padding:14px}.dh-left{height:420px;min-height:420px;max-height:420px;overflow:hidden}.dh-left img{max-width:115%;max-height:115%;width:auto;height:auto;transform:none}.dh-right{min-height:0}}
      @media (max-width:640px){.dh-lightbox{padding:14px}.dh-lightbox-card{width:96vw;height:min(88vh,760px);border-radius:18px}.dh-lightbox-body{padding:18px}.dh-lightbox-img{max-width:100%;max-height:62vh}.dh-lightbox-foot{align-items:stretch}.dh-lightbox-actions{width:100%}.dh-lightbox-actions .dh-btn{flex:1;min-width:0}}
      @media (max-width:560px){.dh-page{padding:14px}.dh-card{border-radius:18px}.dh-top{padding:12px;gap:12px}.dh-pagebar{gap:10px;align-items:stretch}.dh-btns{width:100%}.dh-btn.nav{flex:1;max-width:none}.dh-name{font-size:28px}.dh-left{height:340px;min-height:340px;max-height:340px;border-radius:18px}.dh-left img{max-width:110%;max-height:110%;height:auto;width:auto;transform:none}.dh-right{padding:14px}.ds-chip{height:38px;font-size:13px}.ds-chip img{height:24px}.ds-chip.ds-type-chip img{height:28px;max-width:34px}.ds-chip span{max-width:180px}}
    `));
  }

  function renderNotFound() {
    const root = document.getElementById('content');
    if (!root) return;
    root.innerHTML = '';
    const btn = el('button', { type: 'button', class: 'dh-btn' }, 'Back to list');
    btn.addEventListener('click', backToList);
    root.append(el('div', { class: 'dh-page' },
      el('div', { class: 'ds-empty' },
        el('h1', { class: 'dh-name' }, 'Successor not found'),
        el('div', { style: 'margin-top:16px;display:flex;justify-content:center' }, btn)
      )
    ));
  }

  function renderPage() {
    const root = document.getElementById('content');
    if (!root) return;
    const current = getCurrentSuccessor();
    if (!current) {
      renderNotFound();
      return;
    }

    root.innerHTML = '';
    const prev = STATE.index > 0 ? STATE.items[STATE.index - 1] : null;
    const next = STATE.index >= 0 && STATE.index < STATE.items.length - 1 ? STATE.items[STATE.index + 1] : null;
    const typeSrc = successorTypeImageSrc(current.successor_type_image);
    const typeLabel = successorTypeLabel(current.successor_type_image);

    const prevBtn = el('button', { type: 'button', class: 'dh-btn nav', disabled: !prev, title: prev ? `Previous: ${prev.name}` : 'First Successor' },
      el('i', { class: 'fa-solid fa-chevron-left' }),
      el('span', {}, prev ? prev.name : 'Previous')
    );
    const nextBtn = el('button', { type: 'button', class: 'dh-btn nav', disabled: !next, title: next ? `Next: ${next.name}` : 'Last Successor' },
      el('span', {}, next ? next.name : 'Next'),
      el('i', { class: 'fa-solid fa-chevron-right' })
    );
    const statsBtn = el('button', { type: 'button', class: 'dh-btn dh-admin-only', title: 'Global Stats' }, 'Global Stats');
    const backBtn = el('button', { type: 'button', class: 'dh-btn back' },
      el('i', { class: 'fa-solid fa-arrow-left' }),
      el('span', {}, 'Back to list')
    );

    prevBtn.addEventListener('click', () => goToSuccessor(prev));
    nextBtn.addEventListener('click', () => goToSuccessor(next));
    statsBtn.addEventListener('click', () => toast('Coming soon'));
    backBtn.addEventListener('click', backToList);

    root.append(el('div', { class: 'dh-page' },
      el('div', { class: 'dh-pagebar dh-top-actions' },
        el('div', { class: 'dh-page-head' },
          el('div', { class: 'dh-page-title' }, 'Successor Details'),
          el('div', { class: 'dh-page-subtitle' }, 'Builds and your personal list')
        ),
        el('div', { class: 'dh-btns' }, prevBtn, nextBtn, ...(canShowAdminButtons() ? [statsBtn] : []), backBtn)
      ),
      el('div', { class: 'dh-card dh-top-wrap' },
        el('div', { class: 'dh-top' },
          el('div', { class: 'dh-left-wrap' },
            el('div', { class: 'dh-left' },
              current.image_build
                ? el('img', { src: cdnySafe(current.image_build, 900), alt: current.name, loading: 'eager', decoding: 'async' })
                : el('div', { class: 'text-slate-400 font-black' }, 'No image')
            )
          ),
          el('div', { class: 'dh-right' },
            el('h1', { class: 'dh-name' }, current.name),
            el('div', { class: 'ds-tags' },
              renderChip(normElement(current.element), elementIconSrc(current.element)),
              renderChip('Successor', successorBaseIconSrc(), {
                onClick: () => openLightbox(successorBaseIconSrc(), 'Successor', `${current.name} - Successor Preview`)
              }),
              typeSrc
                ? renderChip(typeLabel, typeSrc, {
                    className: 'ds-type-chip',
                    onClick: () => openLightbox(typeSrc, typeLabel || 'Successor type', `${current.name} - ${typeLabel || 'Successor Type'} Preview`)
                  })
                : null
            )
          )
        )
      )
    ));
  }

  window.addEventListener('sla:admin-hide-changed', () => {
    if (isSuccessorDetailsPath()) renderPage();
  });

  document.addEventListener('keydown', (ev) => {
    if (!STATE.lightboxOpen) return;
    if (ev.key === 'Escape') closeLightbox();
  });

  async function mount(pathArg) {
    ensureStyles();
    const slug = unslugPathSuccessor(pathArg || location.pathname || '');
    if (!slug) {
      renderNotFound();
      return;
    }

    try {
      const items = await loadSuccessors();
      const wanted = String(slug).trim().toLowerCase();
      const match = items.find(item => slugifySuccessorName(item.name).toLowerCase() === wanted);
      STATE.items = items;
      STATE.current = match || null;
      STATE.index = match ? items.findIndex(item => item.name === match.name) : -1;
      renderPage();
    } catch (e) {
      console.error('Details_Successors mount failed:', e);
      renderNotFound();
    }
  }

  window.slugifySuccessorName = window.slugifySuccessorName || slugifySuccessorName;
  window.__details_successors_mount = mount;
})();
