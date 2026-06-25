'use strict';

/**
 * comingsoon.js — Reusable Coming Soon / Maintenance panel (SLA Hub style)
 *
 * Exposes:
 *  - window.buildComingSoonPanel(opts)
 *  - window.__comingsoon_mount(host, opts)
 *
 * Notes:
 *  - Text/content is controlled from LogIn.js
 *  - `icon` / `badgeText` may still be passed for compatibility, but are NOT rendered
 */

(function () {
  const el = window.el || function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);

    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (typeof v === 'boolean') {
        if (v) node.setAttribute(k, '');
      } else {
        node.setAttribute(k, v);
      }
    }

    for (const c of children) {
      if (c == null) continue;
      node.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }

    return node;
  };

  function normalizePath(path) {
    let p = String(path || '/').trim();
    if (!p) p = '/';
    p = p.split('?')[0].split('#')[0];
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function stripBaseFromPath(pathname) {
    const base = String(
      window.__BASE_PATH__ ||
      window.BASE_PATH ||
      window.__SLA_BASE__ ||
      ''
    ).trim().replace(/\/+$/, '');

    const p = String(pathname || '/');
    if (!base) return p;
    if (p === base) return '/';
    if (p.startsWith(base + '/')) return p.slice(base.length) || '/';
    return p;
  }

  function getCurrentCleanPath() {
    try {
      return normalizePath(stripBaseFromPath(window.location.pathname || '/'));
    } catch {
      return '/';
    }
  }

  function goTo(href) {
    const target = String(href || '/').trim() || '/';

    if (typeof window.routeTo === 'function') {
      window.routeTo(target);
      return;
    }

    try {
      history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.href = target;
    }
  }

  function getComingSoonBackTarget(pathname) {
    const p = normalizePath(pathname || getCurrentCleanPath());
  
    if (p.startsWith('/hunter-weapons/')) {
      return {
        href: '/hunter-weapons',
        label: 'Back to Hunter Weapons'
      };
    }
  
    if (p.startsWith('/sjw-weapons/')) {
      return {
        href: '/sjw-weapons',
        label: 'Back to Sung Weapons'
      };
    }
  
    if (p.startsWith('/hunters/')) {
      return {
        href: '/hunters',
        label: 'Back to Hunters'
      };
    }

    if (p.startsWith('/shadows/')) {
      return {
        href: '/shadows',
        label: 'Back to Shadows'
      };
    }
  
    return null;
  }

  function buildBackButton(backTarget) {
    if (!backTarget || !backTarget.href) return null;

    return el(
      'button',
      {
        type: 'button',
        class: [
          'mx-auto mb-4 inline-flex items-center justify-center gap-2',
          'h-11 rounded-xl border px-4',
          'border-white/10 bg-white/5 text-slate-100',
          'hover:bg-white/10 hover:border-white/20',
          'transition-colors duration-200',
          'font-semibold text-sm md:text-base'
        ].join(' '),
        onclick: () => goTo(backTarget.href)
      },
      el('i', { class: 'fa-solid fa-arrow-left text-sm' }),
      backTarget.label || 'Back'
    );
  }

  function buildComingSoonPanel({
    title = 'Coming Soon',
    subtitle = '',
    note = '',
    copyright = '© 2026 SLA Hub',

    imageSrc = '/picture/ComingSoon3.png',
    imageAlt = 'Coming soon illustration',
    showImage = true,

    panelClass = '',
    holderClass = '',
    minHeightClass = 'min-h-[65vh]',

    // compatibility only (ignored visually)
    icon = '',
    badgeText = '',
    showBadge = false,

    // visual toggles
    showDeco = true,

    // back button
    backTarget = null
  } = {}) {
    const wrap = el('section', {
      class: [
        'relative w-full max-w-[560px] overflow-hidden rounded-2xl border',
        'border-white/10 bg-slate-950/20 backdrop-blur-md',
        'shadow-[0_18px_55px_rgba(0,0,0,.45)]',
        'px-5 py-6 md:px-7 md:py-7',
        panelClass
      ].filter(Boolean).join(' ')
    });

    const topLine = el('div', {
      class: 'pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10'
    });

    const glowTop = showDeco ? el('div', {
      class: 'pointer-events-none absolute -top-14 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full blur-2xl opacity-20',
      style: 'background: rgba(250, 204, 21, .40);'
    }) : null;

    const glowSide = showDeco ? el('div', {
      class: 'pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full blur-3xl opacity-10',
      style: 'background: rgba(255, 255, 255, .25);'
    }) : null;

    const bottomShade = el('div', {
      class: 'pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent'
    });

    const inner = el('div', { class: 'relative z-10 text-center' });

    const backBtn = buildBackButton(backTarget);
    if (backBtn) inner.append(backBtn);

    if (showImage && imageSrc) {
      const imgWrap = el('div', {
        class: 'mb-4 md:mb-5 flex justify-center'
      });

      const img = el('img', {
        src: imageSrc,
        alt: imageAlt,
        class: [
          'block h-auto w-[250px] md:w-[280px]',
          'select-none pointer-events-none',
          'opacity-95'
        ].join(' '),
        loading: 'eager',
        decoding: 'async'
      });

      imgWrap.append(img);
      inner.append(imgWrap);
    }

    const titleEl = el('h2', {
      class: [
        'text-2xl md:text-3xl font-extrabold tracking-tight',
        'text-yellow-400'
      ].join(' ')
    }, title);

    const subtitleEl = el('p', {
      class: [
        'mt-4 text-sm md:text-base leading-relaxed',
        'text-slate-200/90'
      ].join(' ')
    }, subtitle || 'This page is currently being prepared.');

    const noteEl = note
      ? el('p', {
          class: 'mt-1 text-sm md:text-base leading-relaxed text-slate-300/75'
        }, note)
      : null;

    const divider = el('div', {
      class: 'mx-auto mt-5 h-px w-24 bg-white/10'
    });

    const copyEl = el('div', {
      class: 'mt-4 text-xs md:text-sm font-medium text-slate-400/85'
    }, copyright);

    inner.append(titleEl, subtitleEl);
    if (noteEl) inner.append(noteEl);
    inner.append(divider, copyEl);

    wrap.append(topLine);
    if (glowTop) wrap.append(glowTop);
    if (glowSide) wrap.append(glowSide);
    wrap.append(bottomShade, inner);

    return wrap;
  }

  function mountComingSoon(host, opts = {}) {
    if (!host) host = document.getElementById('content');
    if (!host) return null;

    const cleanPath = normalizePath(
      opts.path ||
      opts.pathname ||
      getCurrentCleanPath()
    );

    const resolvedBackTarget =
      opts.backTarget === false
        ? null
        : (opts.backTarget || getComingSoonBackTarget(cleanPath));

    const holder = el('div', {
      class: [
        'w-full flex items-center justify-center',
        opts.minHeightClass || 'min-h-[65vh]',
        'px-4 py-6',
        opts.holderClass || ''
      ].filter(Boolean).join(' ')
    });

    const panel = buildComingSoonPanel({
      ...opts,
      backTarget: resolvedBackTarget
    });

    holder.append(panel);

    host.innerHTML = '';
    host.append(holder);

    try {
      const tw = window.tailwind;
      if (tw && typeof tw.refresh === 'function') {
        try { tw.refresh(); } catch {}
        requestAnimationFrame(() => { try { tw.refresh(); } catch {} });
        setTimeout(() => { try { tw.refresh(); } catch {} }, 30);
      }
    } catch {}

    return { holder, panel };
  }

  window.buildComingSoonPanel = buildComingSoonPanel;
  window.__comingsoon_mount = mountComingSoon;
})();