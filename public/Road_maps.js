(function () {
  'use strict';

  const STYLE_ID = 'road-maps-css';
  const PAGE_PATH = '/road-map';
  const FALLBACK_IMAGES = ['7.png', '6.png', '5.png', '4.png', '3.png', '2.png', '1.png'];
  const STATE = {
    lightboxOpen: false,
    lightboxSrc: '',
    lightboxTitle: '',
    zoom: 1,
    fitZoom: 1
  };

  function normalizePath(path) {
    let s = String(path || '/');
    const base = window.__BASE_PATH__ || window.BASE_PATH || window.__SLA_BASE__ || '';
    if (base && s === base) s = '/';
    else if (base && s.startsWith(base + '/')) s = s.slice(String(base).length) || '/';
    if (!s.startsWith('/')) s = '/' + s;
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s;
  }

  function isRoadMapRoute(path) {
    const p = normalizePath(path || window.location.pathname || '/');
    return p === PAGE_PATH || p.startsWith(PAGE_PATH + '/');
  }

  function assetUrl(path) {
    if (typeof window.url === 'function') return window.url(path);
    return path;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .road-maps-page {
        width: 100%;
        max-width: 1232px;
        margin: 0 auto;
        padding: 1.5rem 0;
      }

      .road-map-card {
        border: 1px solid rgba(250, 204, 21, 0.24);
        background: rgba(15, 23, 42, 0.54);
        border-radius: 1rem;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(12px);
      }

      .road-maps-head {
        padding: 0 0.25rem;
        margin-bottom: 0.9rem;
        border: 0;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      .road-maps-title {
        margin: 0;
        color: #facc15;
        font-size: clamp(1.35rem, 2.2vw, 1.6rem);
        line-height: 1.05;
        font-weight: 900;
        letter-spacing: -0.02em;
      }

      .road-maps-desc {
        margin: 0.25rem 0 0;
        color: rgba(226, 232, 240, 0.9);
        font-size: 0.85rem;
        line-height: 1.25;
        font-weight: 600;
      }

      .road-maps-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
      }

      .road-map-card {
        overflow: hidden;
        padding: 0.6rem;
        border-radius: 1rem;
      }

      .road-map-img {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        height: auto;
        object-fit: cover;
        object-position: center;
        cursor: zoom-in;
        border-radius: 0.75rem;
        background: rgba(2, 6, 23, 0.38);
      }

      .road-map-missing {
        min-height: 140px;
        display: grid;
        place-items: center;
        border-radius: 0.75rem;
        border: 1px dashed rgba(148, 163, 184, 0.38);
        background: rgba(2, 6, 23, 0.38);
        color: rgba(226, 232, 240, 0.82);
        font-weight: 800;
        text-align: center;
      }

      .road-map-lightbox {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(2, 6, 23, 0.72);
        backdrop-filter: blur(12px);
      }

      .road-map-lightbox-card {
        width: min(1180px, 100%);
        height: min(860px, calc(100vh - 2rem));
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, .18);
        border-radius: 22px;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
        color: #e2e8f0;
      }

      .road-map-lightbox-head,
      .road-map-lightbox-foot {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-color: rgba(148, 163, 184, .18);
        background: rgba(15, 23, 42, 0.84);
      }

      .road-map-lightbox-head {
        justify-content: space-between;
        border-bottom: 1px solid rgba(148, 163, 184, .18);
      }

      .road-map-lightbox-title {
        min-width: 0;
        color: #facc15;
        font-size: 1rem;
        line-height: 1.2;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .road-map-lightbox-close {
        width: 2.5rem;
        height: 2.5rem;
        display: grid;
        place-items: center;
        border: 1px solid rgba(148, 163, 184, .18);
        border-radius: 14px;
        background: rgba(30, 41, 59, 0.75);
        color: #f8fafc;
        font-size: 1.35rem;
        line-height: 1;
        cursor: pointer;
      }

      .road-map-lightbox-close:hover,
      .road-map-btn:hover {
        background: rgba(51, 65, 85, 0.9);
      }

      .road-map-lightbox-body {
        min-height: 0;
        box-sizing: border-box;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 1rem;
        background: rgba(2, 6, 23, 0.42);
        cursor: grab;
        user-select: none;
      }

      .road-map-lightbox-body.is-dragging {
        cursor: grabbing;
      }

      .road-map-lightbox-stage {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .road-map-lightbox-img {
        display: block;
        flex: 0 0 auto;
        max-width: none;
        height: auto;
        margin: 0 auto;
        transform-origin: top center;
        border-radius: 14px;
        background: rgba(2, 6, 23, 0.55);
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: auto;
      }

      .road-map-lightbox-foot {
        justify-content: space-between;
        flex-wrap: wrap;
        border-top: 1px solid rgba(148, 163, 184, .18);
      }

      .road-map-lightbox-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .road-map-btn,
      .road-map-download {
        min-height: 2.35rem;
        padding: 0 0.8rem;
        border: 1px solid rgba(148, 163, 184, .18);
        border-radius: 13px;
        background: rgba(30, 41, 59, 0.72);
        color: #e2e8f0;
        font-size: 0.88rem;
        font-weight: 800;
        cursor: pointer;
      }

      .road-map-download {
        border-color: rgba(250, 204, 21, 0.35);
        background: rgba(250, 204, 21, 0.14);
        color: #fde68a;
      }

      .road-map-download:hover {
        background: rgba(250, 204, 21, 0.22);
      }

      .road-map-zoom-readout {
        color: rgba(226, 232, 240, 0.9);
        font-size: 0.88rem;
        font-weight: 800;
      }

      @media (max-width: 1100px) {
        .road-maps-list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 640px) {
        .road-maps-page {
          padding: 1rem 0;
        }

        .road-maps-list {
          grid-template-columns: 1fr;
        }

        .road-map-card {
          padding: 0.5rem;
          border-radius: 0.875rem;
        }

        .road-map-lightbox {
          padding: 0.5rem;
        }

        .road-map-lightbox-card {
          height: calc(100vh - 1rem);
          border-radius: 18px;
        }

        .road-map-lightbox-head,
        .road-map-lightbox-foot {
          padding: 0.7rem;
        }

        .road-map-lightbox-body {
          padding: 0.65rem;
        }

        .road-map-btn,
        .road-map-download {
          flex: 1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        if (key === 'class') node.className = String(value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function missingNode() {
    return el('div', { class: 'road-map-missing' }, 'Image not available');
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[road-map]', msg);
  }

  async function loadRoadMapImages() {
    try {
      const res = await fetch(assetUrl('/api/public/road-map-images'), {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      const images = Array.isArray(data?.images)
        ? data.images.map((name) => String(name || '').trim()).filter(Boolean)
        : [];

      return images.length ? images : FALLBACK_IMAGES;
    } catch (e) {
      console.warn('[road-map] failed to load image list', e);
      return FALLBACK_IMAGES;
    }
  }

  function clampZoom(value) {
    return Math.max(0.1, Math.min(10, Number(value) || 1));
  }

  function updateLightboxZoom() {
    const body = document.querySelector('.road-map-lightbox-body');
    const stage = document.querySelector('.road-map-lightbox-stage');
    const img = document.querySelector('.road-map-lightbox-img');
    const readout = document.querySelector('.road-map-zoom-readout');
    if (img) {
      const baseWidth = img.naturalWidth || Number(img.dataset.baseWidth || 0) || Math.round((img.clientWidth || 1) / STATE.zoom);
      if (baseWidth > 1) img.dataset.baseWidth = String(baseWidth);
      const realZoom = STATE.fitZoom * STATE.zoom;
      img.style.width = Math.round(baseWidth * realZoom) + 'px';
      img.style.height = 'auto';
      if (body && stage) {
        const availableW = body.clientWidth;
        const availableH = body.clientHeight;
        const imgW = img.offsetWidth;
        const imgH = img.offsetHeight;

        stage.style.width = imgW > availableW ? imgW + 'px' : '100%';
        stage.style.height = imgH > availableH ? imgH + 'px' : '100%';
      }
    }
    if (readout) {
      readout.textContent = 'Zoom: ' + Math.round(STATE.zoom * 100) + '%';
    }
  }

  function setZoom(nextZoom, options = {}) {
    const preserveCenter = options.preserveCenter !== false;
    const body = document.querySelector('.road-map-lightbox-body');
    const centerXRatio = body && preserveCenter && body.scrollWidth
      ? (body.scrollLeft + body.clientWidth / 2) / body.scrollWidth
      : 0.5;
    const centerYRatio = body && preserveCenter && body.scrollHeight
      ? (body.scrollTop + body.clientHeight / 2) / body.scrollHeight
      : 0.5;

    STATE.zoom = clampZoom(nextZoom);
    updateLightboxZoom();

    if (body && preserveCenter) {
      body.scrollLeft = body.scrollWidth * centerXRatio - body.clientWidth / 2;
      body.scrollTop = body.scrollHeight * centerYRatio - body.clientHeight / 2;
    }
  }

  function centerLightboxScroll() {
    const body = document.querySelector('.road-map-lightbox-body');
    if (!body) return;
    body.scrollLeft = body.scrollWidth > body.clientWidth
      ? Math.round((body.scrollWidth - body.clientWidth) / 2)
      : 0;
    body.scrollTop = body.scrollHeight > body.clientHeight
      ? Math.round((body.scrollHeight - body.clientHeight) / 2)
      : 0;
  }

  function fitLightboxImage() {
    const body = document.querySelector('.road-map-lightbox-body');
    const img = document.querySelector('.road-map-lightbox-img');
    if (!body || !img) return;

    const naturalWidth = img.naturalWidth || Number(img.dataset.baseWidth || 0);
    const naturalHeight = img.naturalHeight || Number(img.dataset.baseHeight || 0);
    if (!naturalWidth || !naturalHeight) {
      STATE.fitZoom = 1;
      setZoom(1, { preserveCenter: false });
      centerLightboxScroll();
      return;
    }

    const fitZoom = Math.min(body.clientWidth / naturalWidth, body.clientHeight / naturalHeight) * 0.95;
    STATE.fitZoom = clampZoom(fitZoom);
    setZoom(1, { preserveCenter: false });
    centerLightboxScroll();
  }

  function openLightbox(src, title) {
    STATE.lightboxOpen = true;
    STATE.lightboxSrc = src;
    STATE.lightboxTitle = title || '';
    STATE.zoom = 1;
    renderLightbox();
  }

  function closeLightbox() {
    STATE.lightboxOpen = false;
    STATE.lightboxSrc = '';
    STATE.lightboxTitle = '';
    STATE.zoom = 1;
    STATE.fitZoom = 1;
    renderLightbox();
  }

  async function downloadCurrentImage() {
    const src = STATE.lightboxSrc;
    const filename = STATE.lightboxTitle || (src.split('/').pop() || 'road-map.png').split('?')[0];
    try {
      const res = await fetch(src, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      window.open(src, '_blank', 'noopener');
      toast('Direct download was blocked, image opened in a new tab.');
    }
  }

  function renderLightbox() {
    const old = document.querySelector('.road-map-lightbox');
    if (old) old.remove();

    document.removeEventListener('keydown', window.__roadMapsEscHandler || function () {});
    window.__roadMapsEscHandler = null;

    if (!STATE.lightboxOpen || !isRoadMapRoute(window.location.pathname)) return;

    const closeBtn = el('button', {
      class: 'road-map-lightbox-close',
      type: 'button',
      title: 'Close',
      'aria-label': 'Close',
      onclick: closeLightbox
    }, 'X');

    const lightboxImg = el('img', {
      class: 'road-map-lightbox-img',
      src: STATE.lightboxSrc,
      alt: STATE.lightboxTitle || 'Road Map',
      draggable: 'false'
    });

    lightboxImg.addEventListener('load', () => {
      lightboxImg.dataset.baseWidth = String(lightboxImg.naturalWidth || lightboxImg.clientWidth || 1);
      lightboxImg.dataset.baseHeight = String(lightboxImg.naturalHeight || lightboxImg.clientHeight || 1);
      fitLightboxImage();
    }, { once: true });

    lightboxImg.addEventListener('dragstart', (e) => e.preventDefault());

    const stage = el('div', { class: 'road-map-lightbox-stage' }, lightboxImg);
    const body = el('div', { class: 'road-map-lightbox-body' }, stage);

    body.addEventListener('wheel', (e) => {
      e.preventDefault();
      setZoom(STATE.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    }, { passive: false });

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = body.scrollLeft;
      startScrollTop = body.scrollTop;
      body.classList.add('is-dragging');
      body.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    body.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      body.scrollLeft = startScrollLeft - (e.clientX - startX);
      body.scrollTop = startScrollTop - (e.clientY - startY);
      e.preventDefault();
    });

    function stopDragging(e) {
      if (!isDragging) return;
      isDragging = false;
      body.classList.remove('is-dragging');
      try { body.releasePointerCapture?.(e.pointerId); } catch (_) {}
    }

    body.addEventListener('pointerup', stopDragging);
    body.addEventListener('pointercancel', stopDragging);

    const overlay = el('div', { class: 'road-map-lightbox', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'road-map-lightbox-card' },
        el('div', { class: 'road-map-lightbox-head' },
          el('div', { class: 'road-map-lightbox-title' }, STATE.lightboxTitle || 'Road Map'),
          closeBtn
        ),
        body,
        el('div', { class: 'road-map-lightbox-foot' },
          el('div', { class: 'road-map-lightbox-actions' },
            el('button', { class: 'road-map-btn', type: 'button', onclick: () => setZoom(STATE.zoom - 0.1) }, 'Zoom -'),
            el('button', { class: 'road-map-btn', type: 'button', onclick: () => setZoom(STATE.zoom + 0.1) }, 'Zoom +'),
            el('button', { class: 'road-map-btn', type: 'button', onclick: fitLightboxImage }, '100%')
          ),
          el('div', { class: 'road-map-lightbox-actions' },
            el('span', { class: 'road-map-zoom-readout' }, 'Zoom: 100%'),
            el('button', { class: 'road-map-download', type: 'button', onclick: downloadCurrentImage }, 'Download'),
            el('button', { class: 'road-map-btn', type: 'button', onclick: closeLightbox }, 'Close')
          )
        )
      )
    );

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    window.__roadMapsEscHandler = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    document.addEventListener('keydown', window.__roadMapsEscHandler);

    document.body.appendChild(overlay);
    if (lightboxImg.complete && lightboxImg.naturalWidth) {
      lightboxImg.dataset.baseWidth = String(lightboxImg.naturalWidth);
      lightboxImg.dataset.baseHeight = String(lightboxImg.naturalHeight || lightboxImg.clientHeight || 1);
      fitLightboxImage();
    } else {
      updateLightboxZoom();
    }
  }

  function renderPage(path, seq, images) {
    if (!isRoadMapRoute(path)) return;

    injectStyles();

    const content = document.getElementById('content');
    if (!content || !isRoadMapRoute(path)) return;

    const page = el('div', { class: 'road-maps-page', 'data-sla-page': 'road-map' });
    const head = el(
      'div',
      { class: 'road-maps-head' },
      el('h1', { class: 'road-maps-title' }, 'Road Map'),
      el('p', { class: 'road-maps-desc' }, 'Solo Leveling: ARISE roadmap archive.')
    );
    const list = el('div', { class: 'road-maps-list' });

    for (const name of images) {
      const img = el('img', {
        class: 'road-map-img',
        src: assetUrl('/picture/Road_Map/' + name),
        alt: 'Road Map ' + name.replace(/\.[^.]+$/, ''),
        title: 'Click to enlarge',
        loading: 'lazy',
        decoding: 'async'
      });

      img.addEventListener('click', () => {
        if (seq !== window.__road_maps_seq || !isRoadMapRoute(window.location.pathname)) return;
        openLightbox(img.src, name);
      });

      img.addEventListener('error', () => {
        if (seq !== window.__road_maps_seq || !isRoadMapRoute(window.location.pathname)) return;
        img.replaceWith(missingNode());
      });

      list.appendChild(el('section', { class: 'road-map-card' }, img));
    }

    page.append(head, list);

    if (seq !== window.__road_maps_seq || !isRoadMapRoute(path)) return;
    content.replaceChildren(page);

    if (typeof window.forceDarkMode === 'function') window.forceDarkMode();
  }

  window.__road_maps_mount = async function __road_maps_mount(path) {
    if (!isRoadMapRoute(path)) return;

    const seq = (window.__road_maps_seq || 0) + 1;
    window.__road_maps_seq = seq;
    closeLightbox();

    const images = await loadRoadMapImages();
    if (seq !== window.__road_maps_seq || !isRoadMapRoute(window.location.pathname)) return;
    renderPage(path, seq, images);
  };
})();
