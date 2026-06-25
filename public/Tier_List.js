/* /public/js/Tier_List.js */
(function(){
  // ====== DEBUG ======
  const DEBUG = false;
  const log  = (...a)=> { if (DEBUG) console.log('%c[TIER]', 'color:#9333ea;font-weight:700', ...a); };
  const warn = (...a)=> { if (DEBUG) console.warn('%c[TIER]', 'color:#f59e0b;font-weight:700', ...a); };
  const err  = (...a)=> { if (DEBUG) console.error('%c[TIER]', 'color:#ef4444;font-weight:700', ...a); };
  const group = (title, fn)=> { if (!DEBUG) return fn(); console.groupCollapsed('%c[TIER] '+title,'color:#6ee7b7;font-weight:700'); try{return fn();} finally{console.groupEnd();} };

  // ====== HELPERS ======
  const el = window.el || ((tag, attrs={}, ...kids)=>{
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k==='class') n.className = v;
      else if (k==='style') n.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v==='function') n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k && k.nodeType ? k : document.createTextNode(k ?? ''));
    return n;
  });

  
  // ====== Shared UI helpers ======
  const slcBtnClass = (isActive=false, extra='')=>{
    const base = [
      'h-10 px-4 rounded-xl border text-base font-semibold transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    ].join(' ');
    const on  = 'bg-yellow-400 text-black hover:bg-yellow-300 border-yellow-400/70';
    const off = 'bg-glass text-slate-200 hover:bg-white/10 hover:text-white border-white/10';
    return [isActive ? on : off, base, extra].filter(Boolean).join(' ');
  };

  const slcMiniBtnClass = (isActive=false, extra='')=>{
    const base = [
      'h-9 px-3 rounded-xl border text-sm font-semibold transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    ].join(' ');
    const on  = 'bg-yellow-400 text-black hover:bg-yellow-300 border-yellow-400/70';
    const off = 'bg-glass text-slate-200 hover:bg-white/10 hover:text-white border-white/10';
    return [isActive ? on : off, base, extra].filter(Boolean).join(' ');
  };

  const slcInputClass = (extra='')=>{
    return [
      'h-10 px-3 rounded-xl border',
      'bg-glass text-slate-200 placeholder:text-slate-400',
      'border-white/10',
      'focus:outline-none focus:ring-2 focus:ring-yellow-400/30',
      extra
    ].filter(Boolean).join(' ');
  };

// ✅ FIX: basePath + url() tak jak w innych modułach (/slahub)
  function basePath(){
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }
  function urlLocal(p){
    const b = basePath();
    const path = String(p || '');
    if (!path) return b || '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith(b + '/')) return path; // już ma prefix
    if (path.startsWith('/')) return `${b}${path}`;
    return `${b}/${path}`;
  }

  const url = window.url ? window.url : urlLocal;

  // ✅ NAJWAŻNIEJSZE: upewnij się, że window.STATE jest OBIEKTEM i zapisany globalnie
  window.STATE = window.STATE || {};
  const STATE = window.STATE;

  // ✅ Admin hide toggle key (jak w innych modułach)
  const LS_HIDE_ADMIN_KEY = 'sla_hide_admin_buttons';

  // ✅ FIX: isAdmin bez "undefined"
  const isAdmin = ()=> {
    try{
      if (STATE && (STATE.isAdmin || STATE.admin)) return true;
      const ds = document.body?.dataset || {};
      return (ds.admin === '1' || ds.admin === 'true');
    }catch{
      return false;
    }
  };

  // ✅ FIX: po /api/me ustawiamy admin i UI do STATE + dataset
  function applyMeToState(me){
    try{
      if (!me) return;

      const u = me.user || me?.me || me?.data?.user || null;
      if (!u) return;

      // ✅ only change admin if API explicitly provides it
      const hasAdminField =
        ('isAdmin' in u) || ('admin' in u) || ('is_admin' in u) ||
        ('isAdmin' in me) || ('admin' in me);

      if (hasAdminField){
        const adminFlag =
          !!(u.isAdmin ?? u.admin ?? u.is_admin ?? me.isAdmin ?? me.admin);

        STATE.isAdmin = adminFlag;
        STATE.admin   = adminFlag;

        if (document.body && document.body.dataset){
          document.body.dataset.admin = adminFlag ? '1' : '0';
        }
      } else {
        log('applyMeToState: /api/me has no admin flag → keeping existing admin state');
      }

      // ✅ hideAdminButtons — same rule: only overwrite if explicitly provided
      const hasHideField =
        (u.ui && typeof u.ui.hideAdminButtons !== 'undefined') ||
        (typeof u.hideAdminButtons !== 'undefined') ||
        (STATE.ui && typeof STATE.ui.hideAdminButtons !== 'undefined');

      if (hasHideField){
        const hideFlagRaw =
          (u.ui && typeof u.ui.hideAdminButtons !== 'undefined') ? u.ui.hideAdminButtons :
          (typeof u.hideAdminButtons !== 'undefined') ? u.hideAdminButtons :
          STATE.ui.hideAdminButtons;

        const hideFlag = (hideFlagRaw === true || hideFlagRaw === 1 || hideFlagRaw === '1' || hideFlagRaw === 'true');

        STATE.ui = STATE.ui || {};
        STATE.ui.hideAdminButtons = !!hideFlag;

        if (document.body && document.body.dataset){
          document.body.dataset.hideAdminButtons = hideFlag ? '1' : '0';
        }
      }

      log('applyMeToState()', {
        admin: STATE.isAdmin,
        hideAdminButtons: STATE?.ui?.hideAdminButtons,
        bodyAdmin: document.body?.dataset?.admin,
        bodyHide: document.body?.dataset?.hideAdminButtons
      });

    }catch(e){
      warn('applyMeToState error', e);
    }
  }

  // ✅ NEW: wykrywanie "hide admin buttons" — tak jak reszta projektu
  function hideAdminButtonsEnabled(){
    // 1) główny wariant
    if (window.STATE?.ui?.hideAdminButtons) return true;

    // 2) dataset na body
    const ds = document.body?.dataset || {};
    if (ds.hideAdminButtons === '1' || ds.hideAdminButtons === 'true') return true;
    if (ds.hideadminbuttons === '1' || ds.hideadminbuttons === 'true') return true;

    // 3) localStorage - NAJWAŻNIEJSZY klucz zgodny z Admin.js
    try{
      const v = localStorage.getItem(LS_HIDE_ADMIN_KEY);
      if (v === '1' || v === 'true') return true;
    }catch{}

    // 4) fallback inne klucze (stare wersje)
    try{
      const keys = [
        'hideAdminButtons',
        'ui.hideAdminButtons',
        'slahub.hideAdminButtons'
      ];
      for (const k of keys){
        const v = localStorage.getItem(k);
        if (v === '1' || v === 'true') return true;
      }
    }catch{}

    return false;
  }

  // ✅ EVENT: identycznie jak inne pliki (admin hide/show)
  window.addEventListener('sla:admin-hide-changed', (e)=>{
    try{
      const hide = !!e?.detail?.hide;
      STATE.ui = STATE.ui || {};
      STATE.ui.hideAdminButtons = hide;

      // zsynchronizuj body dataset
      if (document.body?.dataset){
        document.body.dataset.hideAdminButtons = hide ? '1' : '0';
      }

      // zsynchronizuj localStorage
      try{
        localStorage.setItem(LS_HIDE_ADMIN_KEY, hide ? '1' : '0');
      }catch{}

      // wymuś odświeżenie UI
      window.dispatchEvent(new CustomEvent('ui-hide-admin-buttons-changed', { detail:{ hide } }));
    }catch{}
  });

  async function fetchJson(u, fallback=null){
    return group(`fetchJson GET ${u}`, async ()=>{
      try{
        const r = await fetch(u, { credentials:'include', cache:'no-store' });
        if (r.status === 401) { log('fetchJson 401', u); return { __unauth:true }; }
        if (!r.ok) { warn('fetchJson not ok', u, r.status); return fallback; }
        const data = await r.json();
        log('fetchJson ok', u, data);
        return data;
      }catch(e){ err('fetchJson error', u, e); return fallback; }
    });
  }
  async function postJson(u, body){
    return group(`postJson POST ${u}`, async ()=>{
      try{
        log('postJson payload →', body);
        const r = await fetch(u,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify(body)
        });
        if (r.status === 401) { log('postJson 401', u); return { __unauth:true }; }
        const data = await r.json().catch(()=> ({}));
        if (!r.ok) {
          data.__error = true;
          data.__status = r.status;
          warn('postJson not ok', u, r.status, data);
        } else {
          log('postJson response ←', data);
        }
        return data;
      }catch(e){ err('postJson error', u, e); return { __error:true, message:String(e) }; }
    });
  }

  // ====== FILE EXPORT (fallback gdy backend nie zapisze JSON) ======
  function downloadJson(filename, dataObj){
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
  }

  // ====== MODAL ======
  (function ensureTLModal(){
    if (!document.getElementById('tl-modal-css')){
      const s = document.createElement('style'); s.id='tl-modal-css';
      s.textContent = `
        .tl-modal-backdrop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;background:rgba(2,6,23,.55);backdrop-filter:blur(2px)}
        .tl-modal{width:min(720px,92vw);border-radius:1rem;border:1px solid #334155;background:#0f172a;color:#e2e8f0;box-shadow:0 10px 40px rgba(0,0,0,.45)}
        .tl-modal-hd{padding:14px 16px;border-bottom:1px solid #334155;font-weight:700}
        .tl-modal-bd{padding:16px;max-height:65vh;overflow:auto}
        .tl-modal-ft{padding:12px 16px;border-top:1px solid #334155;display:flex;gap:.5rem;justify-content:flex-end}
        .tl-btn{height:40px;padding:0 14px;border-radius:.75rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#e2e8f0;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}
        .tl-btn:hover{background:rgba(255,255,255,.10);color:#ffffff}
        .tl-btn.primary{background:#facc15;color:#0f172a;border-color:rgba(250,204,21,.70)}
        .tl-btn.primary:hover{background:#fde047;color:#0f172a}
        .tl-btn.ghost{background:rgba(255,255,255,.06);color:#e2e8f0;border-color:rgba(255,255,255,.12)}
        .tl-btn.ghost:hover{background:rgba(255,255,255,.10);color:#ffffff}

        .tl-textarea{width:100%;height:16rem;padding:12px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:#e2e8f0;outline:none}
        .tl-hint{font-size:12px;color:#94a3b8;margin-top:6px}
      `;
      document.head.appendChild(s);
      log('Modal CSS injected');
    }
    if (!document.getElementById('tl-modal-root')){
      const root = document.createElement('div'); root.id='tl-modal-root';
      root.className='tl-modal-backdrop';
      root.innerHTML = `
        <div class="tl-modal">
          <div class="tl-modal-hd" id="tlModalTitle"></div>
          <div class="tl-modal-bd" id="tlModalBody"></div>
          <div class="tl-modal-ft">
            <button class="tl-btn ghost" id="tlModalClose" type="button">CLOSE</button>
            <button class="tl-btn primary" id="tlModalPrimary" type="button">SAVE</button>
          </div>
        </div>`;
      document.body.appendChild(root);
      function _hide() {
        root.style.display = 'none';
        document.getElementById('tlModalBody').innerHTML = '';
      }

      function _show(title, bodyBuilder, onPrimary) {
        document.getElementById('tlModalTitle').textContent = title || '';
        const bd = document.getElementById('tlModalBody');
        bd.innerHTML = '';
        const built = typeof bodyBuilder === 'function' ? bodyBuilder() : null;
        if (built) bd.append(built);

        const prim = document.getElementById('tlModalPrimary');
        prim.onclick = typeof onPrimary === 'function' ? onPrimary : null;

        root.style.display = 'flex';
        document.getElementById('tlModalClose').onclick = _hide;
      }

      // 🔻 Zamknij po kliknięciu w tło
      root.addEventListener('click', e => {
        if (e.target === root) _hide();
      });

      // 🔻 Zamknij po ESC
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') _hide();
      });

      window.__tl_hideModal = _hide;
      window.__tl_showModal = _show;
      log('Modal root injected');
    }
  })();

  // ====== ENDPOINTS & KIND MAPS ======
  const KIND = {
    HUNTERS:  'hunters',
    WEAPONS:  'weapons',
    BLESSING: 'blessing',
    RUNES:    'runes',
  };

  const KIND_SINGULAR = {
    [KIND.HUNTERS]:  'hunter',
    [KIND.WEAPONS]:  'weapon',
    [KIND.BLESSING]: 'blessing',
    [KIND.RUNES]:    'rune',
  };

  const KIND_DATASET = {
    [KIND.HUNTERS]:  'hunters',
    [KIND.WEAPONS]:  'sungWeapons',
    [KIND.BLESSING]: 'blessingStones',
    [KIND.RUNES]:    'runes',
  };

  const ENDPOINT = {
    my: (kind)=> url(`/api/tier/user/${KIND_SINGULAR[kind]}`),
    aggregate: (kind, q='')=> url(`/api/tier/aggregate/${KIND_SINGULAR[kind]}${q}`),
    globalOrderGet: (datasetKey)=> url(`/api/global/order?dataset=${encodeURIComponent(datasetKey)}`),
    globalOrderSet: ()=> url(`/api/global/order`),
    tierReset: (datasetKey)=> url(`/api/tier/reset?dataset=${encodeURIComponent(datasetKey)}`)
  };

  // ====== "COMING SOON" FLAGS (per tier kind) ======
  const TIER_COMING_LS_KEY = (kind)=> `tier_coming_${kind}`;

  const TierComing = {
    cache: {},

    async get(kind){
      if (Object.prototype.hasOwnProperty.call(this.cache, kind)) {
        return this.cache[kind];
      }

      let val = false;

      // spróbuj backendu
      try{
        const r = await fetch(url(`/api/global/toggles?key=tierComing_${kind}`), {
          cache:'no-store',
          credentials:'include'
        });
        if (r.ok){
          const j = await r.json().catch(()=> ({}));
          const raw = j?.value;

          if (typeof raw === 'boolean') {
            val = raw;
          } else if (raw === '1' || raw === 1 || raw === 'true') {
            val = true;
          } else if (raw === '0' || raw === 0 || raw === 'false') {
            val = false;
          }
        }
      }catch{}

      // fallback: localStorage
      if (!val){
        try{
          const v = localStorage.getItem(TIER_COMING_LS_KEY(kind));
          if (v === '1') val = true;
        }catch{}
      }

      this.cache[kind] = !!val;
      return this.cache[kind];
    },

    async set(kind, val){
      const v = !!val;
      this.cache[kind] = v;

      // backend
      try{
        await fetch(url(`/api/global/toggles`), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ key:`tierComing_${kind}`, value:v })
        });
      }catch{}

      // localStorage
      try{
        localStorage.setItem(TIER_COMING_LS_KEY(kind), v ? '1' : '0');
      }catch{}

      // event dla innych części UI
      window.dispatchEvent(new CustomEvent('tier-comingsoon-changed', {
        detail:{ kind, value:v }
      }));

      return v;
    }
  };

  // ====== TOP TAB VISIBILITY (GLOBAL) ======
  const TIER_TAB_TOGGLE_KEY = (kind)=> `tierTab_${kind}`;
  const TIER_TAB_LS_KEY = (kind)=> `tier_tab_${kind}`;

  const TierTabVisibility = {
    cache: {},

    async get(kind){
      if (Object.prototype.hasOwnProperty.call(this.cache, kind)) {
        return this.cache[kind];
      }

      let val = true;

      try{
        const r = await fetch(url(`/api/global/toggles?key=${encodeURIComponent(TIER_TAB_TOGGLE_KEY(kind))}`), {
          cache:'no-store',
          credentials:'include'
        });

        if (r.ok){
          const j = await r.json().catch(()=> ({}));
          const raw = j?.value;

          if (typeof raw === 'boolean') {
            val = raw;
          } else if (raw === '1' || raw === 1 || raw === 'true') {
            val = true;
          } else if (raw === '0' || raw === 0 || raw === 'false') {
            val = false;
          }
        }
      }catch{}

      try{
        const v = localStorage.getItem(TIER_TAB_LS_KEY(kind));
        if (v === '1' || v === 'true') val = true;
        else if (v === '0' || v === 'false') val = false;
      }catch{}

      this.cache[kind] = !!val;
      return this.cache[kind];
    },

    async set(kind, val){
      const v = !!val;
      this.cache[kind] = v;

      try{
        await fetch(url(`/api/global/toggles`), {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({
            key: TIER_TAB_TOGGLE_KEY(kind),
            value: v
          })
        });
      }catch{}

      try{
        localStorage.setItem(TIER_TAB_LS_KEY(kind), v ? '1' : '0');
      }catch{}

      window.dispatchEvent(new CustomEvent('tier-tab-visibility-changed', {
        detail:{ kind, value:v }
      }));

      return v;
    }
  };

  // ====== "COMING SOON" PANEL (kopiowany ze stylem z app2.js) ======
  function buildTierComingSoonPanel({ title='Coming soon', subtitle='', note='' } = {}){
    const wrap = el('div', {
      class: [
        'relative w-full max-w-[560px] mx-auto overflow-hidden rounded-2xl border',
        'border-white/10 bg-slate-950/20 backdrop-blur-md',
        'shadow-[0_18px_55px_rgba(0,0,0,.45)]',
        'px-5 py-6 md:px-7 md:py-7',
        'text-center'
      ].join(' ')
    });

    // subtle top line
    const topLine = el('div', {
      class: 'pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10'
    });

    // soft yellow ambient glow
    const glowTop = el('div', {
      class: 'pointer-events-none absolute -top-14 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full blur-2xl opacity-20',
      style: 'background: rgba(250, 204, 21, .40);'
    });

    // extra side glow for depth
    const glowSide = el('div', {
      class: 'pointer-events-none absolute -right-16 top-8 h-40 w-40 rounded-full blur-3xl opacity-10',
      style: 'background: rgba(255,255,255,.25);'
    });

    const bottomShade = el('div', {
      class: 'pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent'
    });

    const inner = el('div', { class: 'relative z-10 text-center' });

    const imgWrap = el('div', { class: 'mb-4 md:mb-5 flex justify-center' });
    const img = el('img', {
      src: '/picture/ComingSoon3.png',
      alt: 'Coming soon illustration',
      class: 'block h-auto w-[250px] md:w-[280px] select-none pointer-events-none opacity-95',
      loading: 'eager',
      decoding: 'async'
    });
    imgWrap.append(img);

    const h = el('div', {
      class: 'text-2xl md:text-3xl font-extrabold tracking-tight text-yellow-400'
    }, title);

    const p = el('p', {
      class: 'mt-4 text-sm md:text-base leading-relaxed text-slate-200/90 max-w-2xl mx-auto whitespace-pre-line'
    }, subtitle || 'This section is being prepared and will be available soon.');

    const small = note
      ? el('div', { class:'mt-1 text-sm md:text-base leading-relaxed text-slate-300/75' }, note)
      : null;

    const divider = el('div', {
      class: 'mx-auto mt-5 h-px w-24 bg-white/10'
    });

    const copy = el('div', {
      class: 'mt-4 text-xs md:text-sm font-medium text-slate-400/85'
    }, '© 2026 SLA Hub');

    inner.append(imgWrap, h, p);
    if (small) inner.append(small);
    inner.append(divider, copy);

    wrap.append(topLine, glowTop, glowSide, bottomShade, inner);
    return wrap;
  }

  // ====== ELEMENT / TYPE ICONS ======
  const ELEMENT_ICONS = {
    Fire:      "/picture/Element/Fires.png",
    Water:     "/picture/Element/Waters.png",
    Wind:      "/picture/Element/Winds.png",
    Light:     "/picture/Element/Lights.png",
    Dark:  "/picture/Element/Darkness.png",
    None:      "/picture/Element/NONE.png",
  };

  const BLESSING_TYPE_ICONS = {
    Empowerment: '/picture/Blessing_Stones/Type/Empowerment2.png',
    Survival: '/picture/Blessing_Stones/Type/Survival2.png',
  };

  // ====== CSS UI ======
  (function injectCss(){
    if (document.getElementById('tierlist-css')) { log('tierlist-css already present'); return; }
    const s = document.createElement('style'); s.id='tierlist-css';
    s.textContent = `
      .tl-tabs-wrap{ overflow-x:auto; overflow-y:hidden; width:100%; }
      .tl-tabs{ display:flex; flex-wrap:nowrap; gap:.5rem; align-items:center; }
      .tl-actions-top{ display:flex; gap:.5rem; align-items:center; margin-top:.5rem; margin-bottom:.75rem; flex-wrap:wrap; }
      .tl-spacer{ height:.5rem; }
      .tl-board{ display:flex; flex-direction:column; gap:.75rem; }
      .tl-row{ display:grid; grid-template-columns: 80px 1fr; align-items:stretch; border:1px solid #334155; border-radius:1rem; overflow:hidden; }
      .tl-row-head{ grid-column:1; display:flex; align-items:center; justify-content:center; min-height:72px; font-weight:800; font-size:14px; letter-spacing:.04em; border-right:1px solid #334155; }
      .tl-row-body{ grid-column:2; display:flex; flex-wrap:wrap; gap:.5rem; padding:.5rem .75rem; align-items:flex-start; min-height:84px; }
      .tl-row-SS{ background: rgba(184,92,234,.10); }
      .tl-row-S { background: rgba(52,211,153,.12); }
      .tl-row-A { background: rgba(59,130,246,.10); }
      .tl-row-B { background: rgba(251,191,36,.12); }
      .tl-row-C { background: rgba(250,204,21,.12); }
      .tl-row-D { background: rgba(239,68,68,.10); }
      .tl-row-E { background: rgba(148,163,184,.12); }
      .tl-row-F { background: rgba(203,213,225,.12); }
      .tl-row-BENCH{ background: rgba(148,163,184,.08); }

      /* CARD */
      .tl-card{
        width:72px;
        height:72px;
        border-radius:.75rem;
        border:2px solid #334155;
        background:#0b1220;
        display:flex;
        align-items:center;
        justify-content:center;
        overflow:hidden;
        cursor:grab;
        user-select:none;
        position:relative;
      }
      .tl-card img{
        width:100%;
        height:100%;
        object-fit:cover;
        display:block;
      }
      .tl-card:active{ cursor:grabbing; }

      /* element badge */
      .tl-card-el-icon{
        position:absolute;
        top:2px;
        left:2px;
        width:20px !important;
        height:20px !important;
        object-fit:contain !important;
        border-radius:4px;
        pointer-events:none;
        z-index:2;
      }

      /* rarity borders */
      .tl-card[data-rarity="SSR"]{ border-color:rgb(167,53,58); }
      .tl-card[data-rarity="SR"] { border-color:rgb(138,95,204); }
      .tl-card[data-rarity="R"]  { border-color:rgb(3,117,179); }

      .tl-drop-over{ outline:2px dashed #64748b; outline-offset:-6px; }
      .tl-banner{ margin-bottom:.75rem; padding:.75rem; border-radius:.75rem; border:1px solid #facc15; background:#fffbeb; color:#7c2d12; }
      .dark .tl-banner{ background:#0b1220; color:#fde68a; border-color:#eab308; }
      .tl-admin-list{ display:flex; flex-direction:column; gap:.5rem; }
      .tl-admin-item{ display:grid; grid-template-columns: 44px 1fr auto; align-items:center; gap:.5rem; border:1px solid #334155; border-radius:.5rem; padding:.35rem .5rem; }
      .tl-admin-thumb{ width:40px; height:40px; border-radius:.35rem; border:1px solid #334155; overflow:hidden; background:#0b1220; }
      .tl-admin-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
      .tl-admin-actions{ display:flex; gap:.35rem; }
      .tl-admin-tabs{ display:flex; gap:.5rem; margin-bottom:.5rem; }

      .tl-row-head{ position:relative; }
      .tl-row-head-collapsible{ cursor:pointer; user-select:none; }
      .tl-row-head-collapsible::after{ content:'▾'; font-size:11px; margin-left:4px; opacity:.7; }
      .tl-row.tl-row-collapsed .tl-row-head-collapsible::after{ content:'▸'; }

      .tl-row.tl-row-collapsed{ grid-template-columns: 80px; }
      .tl-row.tl-row-collapsed .tl-row-body{ display:none; padding:0; min-height:0; }
      .tl-row.tl-row-collapsed .tl-row-head{
        min-height: 32px;
        padding-top: 4px;
        padding-bottom: 4px;
        font-size: 16px;
      }
    `;
    document.head.appendChild(s);
    log('tierlist-css injected');
  })();

  // ====== DATA MODEL ======
  const TIER_KEYS = ['SS','S','A','B','C','D','E','F','BENCH'];
  const COLLAPSED = Object.fromEntries(TIER_KEYS.map(k => [k, false]));
  const LSK = (scope, kind)=> `tierlist_${scope}_${kind}_tiers_v2`;
  const emptyModel = ()=> ({ tiers: Object.fromEntries(TIER_KEYS.map(k=>[k,[]])) });

  const toImage = (x)=> String(x.image_tier_list || x.image || '');

// ====== LOCAL IMAGE NORMALIZATION (Hunter / SGWeapon) ======
const IMG_PREFIX = {
  hunters: '/picture/Hunter/',
  weapons: '/picture/SGWeapon/',
};

function isExternalImage(v){
  const s = String(v || '').trim();
  if (!s) return false;
  if (s.startsWith('/picture/')) return false;
  return /^https?:\/\//i.test(s);
}

function basenameFromAny(v){
  // normalize Windows backslashes to URL-style slashes
  const s = String(v || '').trim().replace(/\\/g,'/');
  if (!s) return '';
  // strip query/hash
  const clean = s.split('#')[0].split('?')[0];
  // if URL, take last path segment
  const parts = clean.split('/');
  const file = parts[parts.length-1] || '';
  return String(file)
    .replace(/:/g, '')
    .replace(/[“”\"'`´]/g, '')
    .trim();
}

// normalize any image value into local /picture/... path for given kind (hunters/weapons)
function normalizeTierImage(kind, value){
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/picture/')) return raw;

  // if it already looks like "Hunter/Name.png" or "/Hunter/Name.png"
  const cleaned = raw.replace(/\\/g,'/').split('#')[0].split('?')[0];

  // external URL -> local by filename
  if (/^https?:\/\//i.test(cleaned)){
    const file = basenameFromAny(cleaned);
    const pref = IMG_PREFIX[kind] || '/picture/';
    return file ? (pref + file) : cleaned;
  }

  // relative path with folder -> keep only filename, re-home under correct prefix
  const file = basenameFromAny(cleaned);
  const pref = IMG_PREFIX[kind] || '/picture/';
  if (!file) return cleaned;

  // if user already typed just filename, same logic
  return pref + file;
}

  // Load local picture options for admin dropdowns (Hunters / Weapons)
  // Uses /api/admin/pictures/list and caches results per kind.
  const __localOptionsCache = new Map();
  async function loadLocalOptions(kind){
    const k = String(kind||'');
    if (__localOptionsCache.has(k)) return __localOptionsCache.get(k);

    const toLabel = (filename)=> String(filename||'')
      .replace(/\.[a-z0-9]+$/i,'')
      .replace(/[_-]+/g,' ')
      .trim();

    // Category names may vary; try a few sensible ones.
    const candidates = (k === 'hunters')
      ? ['Hunter', 'Hunters']
      : (k === 'weapons')
        ? ['SGWeapon', 'SungWeapon', 'Weapons']
        : [];

    let files = [];
    for (const cat of candidates){
      try {
        const res = await fetchJson(`/api/admin/pictures/list?category=${encodeURIComponent(cat)}`, {});
        // API returns: { ok:true, category, items:[{rel, ...}], root }
        const arr =
          Array.isArray(res?.items) ? res.items.map(it => it?.rel).filter(Boolean) :
          Array.isArray(res?.files) ? res.files :
          (Array.isArray(res) ? res : []);
        if (arr && arr.length){ files = arr; break; }
      } catch (_) {}
    }

    const pref = IMG_PREFIX[k] || '/picture/';
    const opts = (files||[])
      .map(f => String(f||'').replace(/\\/g,'/'))
      .filter(Boolean)
      .map(p => ({
        value: pref + basenameFromAny(p),
        label: toLabel(basenameFromAny(p))
      }))
      .sort((a,b)=> a.label.localeCompare(b.label));

    __localOptionsCache.set(k, opts);
    return opts;
  }

  const buildIndex = (list, kind)=>{
    const byId = new Map();
    for (const x of (list||[])){
      const id = String(x.id ?? x.name ?? x.slug ?? x.image_tier_list ?? x.image);
      const name = String(x.name ?? id);
      const image_tier_list = normalizeTierImage(kind, toImage(x));
      const rarity = String(x.rarity || '').toUpperCase();
      const element = String(x.element || 'None');
      byId.set(id, { id, name, image_tier_list, rarity, element });
    }
    log('buildIndex', { count: byId.size });
    return byId;
  };


  function normalizeLocalPicRelCategory(value, category){
    const s = String(value || '').trim();
    const cat = String(category || '').trim();
    if (!s || !cat) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/picture/')) return s;
    if (s.startsWith(`${cat}/`)) return `/picture/${s}`;
    return `/picture/${cat}/${basenameFromAny(s)}`;
  }

  function normalizeSungWeaponTierImage(value){
    const s = String(value || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/picture/')) return s.replace(/:/g, '');

    const cleaned = s.replace(/\\/g,'/').split('#')[0].split('?')[0].replace(/:/g, '');
    const knownCats = ['SWeapon', 'SungWeapon', 'Sung_Weapon', 'Weapon_Sung', 'SGWeapon'];
    const hit = knownCats.find(cat => cleaned.startsWith(cat + '/'));
    if (hit) return `/picture/${cleaned}`;
    return `/picture/SGWeapon/${basenameFromAny(cleaned)}`;
  }

  function normalizeBlessingTierImage(value){
    const s = String(value || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/picture/')) return s;
    const cleaned = s.replace(/\\/g,'/').split('#')[0].split('?')[0];
    if (cleaned.startsWith('Blessing_Stones/')) return `/picture/${cleaned}`;
    return `/picture/Blessing_Stones/Blessing/${basenameFromAny(cleaned)}`;
  }

  async function fetchJsonTryLocal(paths, fallback = null){
    let last = fallback;
    for (const p of (paths || [])){
      const out = await fetchJson(url(p), null);
      if (out && !out.__unauth) return out;
      last = out;
    }
    return last ?? fallback;
  }

  function normalizeCatalogItem(kind, raw){
    if (kind === KIND.HUNTERS){
      const name = String(raw?.name || raw?.id || '').trim();
      if (!name) return null;
      return {
        id: name,
        name,
        rarity: String(raw?.rarity || 'SSR').toUpperCase(),
        element: String(raw?.element || 'None'),
        image_tier_list: normalizeLocalPicRelCategory(raw?.image || raw?.image_build || '', 'Hunter_Icon')
      };
    }

    if (kind === KIND.WEAPONS){
      const name = String(raw?.name || raw?.weapon_name || raw?.id || '').trim();
      if (!name) return null;
      return {
        id: name,
        name,
        rarity: String(raw?.rarity || 'SSR').toUpperCase(),
        element: String(raw?.element || 'None'),
        image_tier_list: normalizeSungWeaponTierImage(raw?.image || raw?.image_build || raw?.imageUrl || raw?.img || '')
      };
    }

    if (kind === KIND.BLESSING){
      const name = String(raw?.name || raw?.id || '').trim();
      if (!name) return null;
      const blessingTypeRaw = String(raw?.type || raw?.category || '').trim().toLowerCase();
      const blessingType = (blessingTypeRaw === 'survival') ? 'Survival' : 'Empowerment';
      return {
        id: String(raw?.id || name),
        name,
        rarity: '',
        element: blessingType,
        image_tier_list: normalizeBlessingTierImage(raw?.image || '')
      };
    }

    const name = String(raw?.name || raw?.id || '').trim();
    if (!name) return null;
    return {
      id: String(raw?.id || name),
      name,
      rarity: String(raw?.rarity || '').toUpperCase(),
      element: String(raw?.element || 'None'),
      image_tier_list: String(raw?.image_tier_list || raw?.image || '').trim()
    };
  }

  async function loadCatalogByKind(kind){
    const scope = KIND_SINGULAR[kind] || 'rune';
    const data = await fetchJson(url(`/api/public/tier-catalog/${encodeURIComponent(scope)}`), {});
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    return arr.map(x => normalizeCatalogItem(kind, x)).filter(Boolean);
  }

  const materializeModel = (model, indexMap)=>{
    const out = {};
    for (const t of TIER_KEYS) {
      out[t] = (model.tiers[t]||[])
        .map(id=> indexMap.get(String(id)))
        .filter(Boolean);
    }
    log('materializeModel', Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.map(i=>i?.name)])));
    return out;
  };

  function sortBenchByBase(model, baseList){
    const idx = new Map((baseList||[]).map((x,i)=> [String(x.id ?? x.name), i]));
    const bench = model.tiers.BENCH || [];
    bench.sort((a,b)=> (idx.get(String(a))??999999) - (idx.get(String(b))??999999));
  }

  function ensureBaseCoverage(model, baseList){
    const all = new Set(Object.values(model.tiers).flat().map(String));
    const bench = model.tiers.BENCH || (model.tiers.BENCH = []);
    for (const x of (baseList || [])){
      const id = String(x.id ?? x.name ?? x.image_tier_list ?? '');
      if (!id) continue;
      if (!all.has(id)) { bench.push(id); all.add(id); }
    }
    sortBenchByBase(model, baseList);
  }

  function normalizeIncomingFromApi(saved, baseList){
    log('normalizeIncomingFromApi input', { saved, baseListLen: baseList.length });
    const model = emptyModel();

    if (saved && saved.tiers && typeof saved.tiers==='object'){
      for (const k of TIER_KEYS){
        const arr = Array.isArray(saved.tiers[k]) ? saved.tiers[k] : [];
        model.tiers[k] = arr.map(v=>String(v||'')).filter(Boolean);
      }
      const inTiers = new Set(Object.values(model.tiers).flat().map(String));

      if (Array.isArray(saved.items)){
        for (const it of saved.items){
          const id = String(it?.name||'');
          if (id && !inTiers.has(id)) {
            model.tiers.BENCH.push(id);
            inTiers.add(id);
          }
        }
      }

      ensureBaseCoverage(model, baseList);
      log('normalizeIncomingFromApi result (tiers)', model);
      return model;
    }

    if (saved && Array.isArray(saved.items) && saved.items.length){
      const byName = new Map((baseList || []).map(x => [String(x.name), String(x.id ?? x.name)]));
      model.tiers.BENCH = saved.items
        .map(x => byName.get(String(x.name)) || String(x.id || x.name || ''))
        .filter(Boolean);
      ensureBaseCoverage(model, baseList);
      log('normalizeIncomingFromApi result (items only)', model);
      return model;
    }

    model.tiers.BENCH = (baseList||[]).map(x=> String(x.id ?? x.name ?? x.image_tier_list));
    log('normalizeIncomingFromApi result (fallback baseList)', model);
    return model;
  }

  function serializeForApi(model, indexMap){
    const ordered = [].concat(
      model.tiers.SS,
      model.tiers.S,
      model.tiers.A,
      model.tiers.B,
      model.tiers.C,
      model.tiers.D,
      model.tiers.E,
      model.tiers.F,
      model.tiers.BENCH
    ).map(String);

    const seen = new Set();
    const items = ordered
      .filter(id=> { if (seen.has(id)) return false; seen.add(id); return true; })
      .map(id=> indexMap.get(id))
      .filter(Boolean)
      .map(x=> ({
        name: x.name,
        image_tier_list: x.image_tier_list,
        rarity: x.rarity || '',
        element: x.element || 'None'
      }));

    const tiers = Object.fromEntries(TIER_KEYS.map(k=> [k, (model.tiers[k]||[]).map(String)]));
    log('serializeForApi', { itemsCount: items.length, tiers });
    return { items, tiers };
  }

  const LStore = {
    get(scope,kind){
      try{
        const v = JSON.parse(localStorage.getItem(LSK(scope,kind))||'null');
        log('LStore.get', scope, kind, v);
        return v;
      }catch(e){
        warn('LStore.get error', e);
        return null;
      }
    },
    set(scope,kind,data){
      try{
        localStorage.setItem(LSK(scope,kind), JSON.stringify(data));
        log('LStore.set', scope, kind);
      }catch(e){
        warn('LStore.set error', e);
      }
    }
  };

  // ====== ADMIN OVERLAY ======
  const overlayKey = (kind)=> `tierlist_admin_overlay_${kind}`;

  function saveOverlay(kind, items, _base){
    const simplified = items.map(it => ({
      name: String(it.name || ''),
      image_tier_list: String(it.image_tier_list || it.image || ''),
      rarity: String(it.rarity || '').toUpperCase(),
      element: String(it.element || 'None')
    }));
    try {
      localStorage.setItem(overlayKey(kind), JSON.stringify(simplified));
    } catch {}
    log('overlay saved', { kind, count: simplified.length });
  }

  function readOverlay(kind){
    try { return JSON.parse(localStorage.getItem(overlayKey(kind)) || '[]'); }
    catch { return []; }
  }

  // ====== DND ======
  let draggingId = null, autoScrollRAF = 0;
  function nearestIndex(zone, clientX, clientY){
    const cards = Array.from(zone.querySelectorAll('.tl-card')).filter(c=> c.dataset.id!==draggingId);
    if (!cards.length) return 0;
    let bestI=0,bestD=Infinity;
    for (let i=0; i<cards.length; i++){
      const r = cards[i].getBoundingClientRect();
      const cx = r.left + r.width/2;
      const cy = r.top + r.height/2;
      const d2 = (cx-clientX)**2 + (cy-clientY)**2;
      if (d2<bestD){bestD=d2;bestI=i;}
    }
    const r = cards[bestI].getBoundingClientRect();
    return (clientX < (r.left + r.width/2)) ? bestI : bestI+1;
  }
  function enableAutoScroll(e){
    cancelAnimationFrame(autoScrollRAF);
    function step(){
      const vh=window.innerHeight, y=e.clientY, m=80;
      let dy=0;
      if (y<m) dy=-12;
      else if (y>vh-m) dy=12;
      if (dy) window.scrollBy(0,dy);
      autoScrollRAF=requestAnimationFrame(step);
    }
    autoScrollRAF=requestAnimationFrame(step);
  }
  function disableAutoScroll(){ cancelAnimationFrame(autoScrollRAF); }
  function enableDnD(container, onDrop){
    log('enableDnD on container', container);
    container.querySelectorAll('.tl-card').forEach(card=>{
      card.draggable = true;
      card.addEventListener('dragstart', (e)=>{
        draggingId = card.dataset.id || null;
        e.dataTransfer.setData('text/plain', draggingId||'');
        e.dataTransfer.effectAllowed='move';
        log('dragstart', draggingId);
      });
      card.addEventListener('dragend', ()=>{
        log('dragend', draggingId);
        draggingId = null;
        disableAutoScroll();
      });
    });
    container.querySelectorAll('.tl-row-body').forEach(zone=>{
      zone.addEventListener('dragover', (e)=>{
        e.preventDefault();
        zone.classList.add('tl-drop-over');
        e.dataTransfer.dropEffect='move';
        enableAutoScroll(e);
      });
      zone.addEventListener('dragleave', ()=> zone.classList.remove('tl-drop-over'));
      zone.addEventListener('drop', (e)=>{
        e.preventDefault();
        zone.classList.remove('tl-drop-over');
        disableAutoScroll();
        const id = e.dataTransfer.getData('text/plain');
        const tier = zone.closest('.tl-row')?.dataset.tier;
        const idx = nearestIndex(zone, e.clientX, e.clientY);
        if (!id || !tier) return;
        log('drop', { id, tier, idx });
        onDrop(id, tier, idx);
      });
    });
  }

  // ====== UI: tabs + scope toggle ======
  const LS_LAST_KIND  = 'tierlist:last_kind';
  const LS_LAST_SCOPE = 'tierlist:last_scope_logged_in';

  function buttonsBar(activeKind, scope, setKind, setScope, loggedIn){
    const labels = {
      [KIND.HUNTERS]: 'Hunters',
      [KIND.WEAPONS]: 'Weapons',
      [KIND.BLESSING]:'Blessing',
      [KIND.RUNES]:   'Runes',
    };
    const allKinds = [KIND.HUNTERS, KIND.WEAPONS, KIND.BLESSING, KIND.RUNES];

    const wrap = el('div', { class:'w-full' });

    const visibleKinds = allKinds.filter(k => {
      const cached = TierTabVisibility.cache[k];
      return typeof cached === 'boolean' ? cached : true;
    });

    const kinds = visibleKinds.length ? visibleKinds : [KIND.HUNTERS];

    const colsClass =
      kinds.length === 1 ? 'grid-cols-1' :
      kinds.length === 2 ? 'grid-cols-2' :
      kinds.length === 3 ? 'grid-cols-2 sm:grid-cols-3' :
                           'grid-cols-2 sm:grid-cols-4';

    // Row 1: kind tabs (full width)
    const kindRow = el('div', { class:`grid ${colsClass} gap-2 w-full` });

    const mkKindBtn = (kind)=> {
      const isActive = (kind===activeKind);
      return el('button', {
        class: slcBtnClass(isActive,'w-full'),
        type:'button',
        onClick:()=> setKind(kind)
      }, labels[kind] || String(kind));
    };

    for (const k of kinds) kindRow.append(mkKindBtn(k));
    wrap.append(kindRow);

    // Row 2: scope toggle + admin
    const controls = [];
    const canToggleScope = (loggedIn || window.STATE?.viewUserId);

    if (canToggleScope){
      const toggleLabel = (scope === 'global') ? 'Change to MY' : 'Change to Global';
      const scopeIsMy = (scope === 'my');
      const toggleBtn = el('button', {
        class: slcBtnClass(scopeIsMy,'w-full'),
        type:'button',
        onClick:()=> setScope(scope === 'global' ? 'my' : 'global')
      }, toggleLabel);
      controls.push(toggleBtn);
    }

    if (isAdmin() && !hideAdminButtonsEnabled()){
      const adminActive = (activeKind === 'admin');
      const adminBtn = el('button', {
        class: slcBtnClass(adminActive,'w-full'),
        type:'button',
        onClick:()=> setKind('admin')
      }, 'Admin');
      controls.push(adminBtn);
    }

    if (controls.length){
      const cols = controls.length >= 2 ? 2 : 1;
      const ctrlRow = el('div', {
        class: 'grid ' + (cols === 2 ? 'grid-cols-2' : 'grid-cols-1') + ' gap-2 w-full mt-2'
      });
      for (const c of controls) ctrlRow.append(c);
      wrap.append(ctrlRow);
    }

    return wrap;
  }


  function bannerLogin(){
    const bar = el('div', { class:'tl-banner' });
    bar.append(
      el('span', {}, 'Zaloguj się, aby zapisać swoją osobistą tier listę. '),
      el('a', { href: url('/auth/discord'), class:'underline font-semibold' }, 'Login with Discord')
    );
    return bar;
  }

  // ====== CARD RENDER ======
  function row(label, key, items, opts = {}){
    const { collapsible = false } = opts;
    const isCollapsed = !!COLLAPSED[key];

    const row = el('div', {
      class: `tl-row tl-row-${key}` + (isCollapsed ? ' tl-row-collapsed' : ''),
      'data-tier': key
    });

    const headAttrs = {
      class: 'tl-row-head' + (collapsible ? ' tl-row-head-collapsible' : '')
    };

    if (collapsible) {
      headAttrs.onClick = () => {
        COLLAPSED[key] = !COLLAPSED[key];
        if (COLLAPSED[key]) row.classList.add('tl-row-collapsed');
        else row.classList.remove('tl-row-collapsed');
      };
    }

    const head = el('div', headAttrs, label === 'BENCH' ? 'BENCH' : label);
    const body = el('div', { class:'tl-row-body' });

    for (const it of (items || [])){
      const c = el('div', {
        class:'tl-card',
        'data-id': it.id,
        'data-rarity': it.rarity || '',
        title: it.id
      });

      const portraitImg = el('img', { src: it.image_tier_list, alt: '' });
      c.append(portraitImg);

      const elemKey = String(it.element || 'None');
      const elemNormalized = elemKey.trim().toLowerCase();
      const isBlessingType = elemKey === 'Empowerment' || elemKey === 'Survival';
      const elemSrc = isBlessingType
        ? BLESSING_TYPE_ICONS[elemKey]
        : (ELEMENT_ICONS[elemKey] || ELEMENT_ICONS.None);
      const showElemBadge = isBlessingType
        ? !!elemSrc
        : (!!elemSrc && elemNormalized !== 'none' && elemNormalized !== 'non' && elemNormalized !== 'neutral' && elemNormalized !== 'no element');
      if (showElemBadge){
        const elemBadge = el('img', {
          class:'tl-card-el-icon',
          src: elemSrc,
          alt: elemKey
        });
        c.append(elemBadge);
      }

      body.append(c);
    }

    row.append(head, body);
    return row;
  }

  function renderBoardInto(container, model, indexMap, onDrop, opts = {}){
    const { hideBench = false, collapsible = false } = opts;
    container.innerHTML = '';

    const m = materializeModel(model, indexMap);
    const parts = [
      ['SS','SS'], ['S','S'], ['A','A'], ['B','B'],
      ['C','C'], ['D','D'], ['E','E'], ['F','F']
    ];
    if (!hideBench) parts.push(['BENCH','BENCH']);

    for (const [label,key] of parts){
      container.append( row(label, key, m[key], { collapsible }) );
    }

    log('renderBoardInto', {
      hideBench,
      tiers: Object.fromEntries(Object.entries(m).map(([k,v])=>[k, v.map(i=>i?.id)]))
    });
    requestAnimationFrame(()=> enableDnD(container, onDrop));
  }

  // ====== ADMIN helpers ======
  async function saveCatalogAll(){ return { ok:false, method:'disabled' }; }

  // ====== ADMIN EDITOR ======
  function renderAdmin(root){
    log('renderAdmin mount', root);
    root.innerHTML='';

    const wrap = el('div', { class:'grid gap-4' });
    const info = el('div', {
      class:'rounded-2xl border border-white/10 bg-glass p-4 text-sm text-slate-300'
    },
      el('div', { class:'text-base font-extrabold text-yellow-400 mb-1' }, 'Tier List Admin'),
      el('div', {}, 'Tier List now reads the same source catalogs as Hunters, Sung Weapons and Blessing Stones pages.'),
      el('div', { class:'mt-1 text-slate-400' }, 'You can manage Coming soon and top tab visibility here.')
    );

    const kinds = [KIND.HUNTERS, KIND.WEAPONS, KIND.BLESSING, KIND.RUNES];
    const labels = {
      [KIND.HUNTERS]: 'Hunters',
      [KIND.WEAPONS]: 'Weapons',
      [KIND.BLESSING]: 'Blessing Stones',
      [KIND.RUNES]: 'Runes'
    };

    const list = el('div', { class:'grid gap-3' });

    function buildRow(kind){
      const row = el('div', {
        class:'rounded-2xl border border-white/10 bg-slate-900/40 p-4 flex flex-col gap-3'
      });

      const top = el('div', { class:'min-w-0' },
        el('div', { class:'font-extrabold text-slate-100' }, labels[kind] || kind),
        el('div', { class:'text-sm text-slate-400' }, `Manage visibility and Coming soon state for ${labels[kind] || kind}.`)
      );

      const comingStatus = el('div', { class:'text-sm font-semibold text-slate-300 min-w-[110px]' }, 'Loading…');
      const comingBtn = el('button', { class: slcBtnClass(false), type:'button' }, 'Loading…');

      const visibleStatus = el('div', { class:'text-sm font-semibold text-slate-300 min-w-[110px]' }, 'Loading…');
      const visibleBtn = el('button', { class: slcBtnClass(false), type:'button' }, 'Loading…');

      async function sync(){
        const comingOn = await TierComing.get(kind);
        const visibleOn = await TierTabVisibility.get(kind);

        comingStatus.textContent = comingOn ? 'Coming: ON' : 'Coming: OFF';
        comingBtn.textContent = comingOn ? 'Coming soon: ON' : 'Coming soon: OFF';
        comingBtn.className = slcBtnClass(comingOn);

        visibleStatus.textContent = visibleOn ? 'Visible: ON' : 'Visible: OFF';
        visibleBtn.textContent = visibleOn ? 'Visible: ON' : 'Visible: OFF';
        visibleBtn.className = slcBtnClass(visibleOn);
      }

      comingBtn.addEventListener('click', async ()=>{
        comingBtn.disabled = true;
        try{
          const current = await TierComing.get(kind);
          await TierComing.set(kind, !current);
          await sync();
          if (window.showToast) window.showToast('Saved');
        } finally {
          comingBtn.disabled = false;
        }
      });

      visibleBtn.addEventListener('click', async ()=>{
        visibleBtn.disabled = true;
        try{
          const current = await TierTabVisibility.get(kind);
          await TierTabVisibility.set(kind, !current);
          await sync();
          if (window.showToast) window.showToast('Saved');
        } finally {
          visibleBtn.disabled = false;
        }
      });

      const controls = el('div', {
        class:'grid grid-cols-1 md:grid-cols-2 gap-3'
      },
        el('div', { class:'flex items-center gap-3 flex-wrap' }, comingStatus, comingBtn),
        el('div', { class:'flex items-center gap-3 flex-wrap' }, visibleStatus, visibleBtn)
      );

      row.append(top, controls);
      sync();
      return row;
    }

    kinds.forEach(kind => list.append(buildRow(kind)));
    wrap.append(info, list);
    root.append(wrap);
  }

  window.renderAdmin = renderAdmin;

  // ====== GLOBAL CONFIG ======
  const GLOBAL_BUCKETS = [
    { tier:'SS', q:0.12 },
    { tier:'S',  q:0.13 },
    { tier:'A',  q:0.21 },
    { tier:'B',  q:0.20 },
    { tier:'C',  q:0.18 },
    { tier:'D',  q:0.12 },
    { tier:'E',  q:0.04 },
    { tier:'F',  q:0.00 },
  ];

  const AGG_QUERY = `?method=borda&w=0.30&alpha=1&full=1`;

  function bucketsToTiers(sortedIds){
    const n = sortedIds.length;
    const model = emptyModel();
    let idx = 0;
    for (let i=0; i<GLOBAL_BUCKETS.length; i++){
      const b = GLOBAL_BUCKETS[i];
      const take = (i === GLOBAL_BUCKETS.length-1) ? (n - idx) : Math.round(n * b.q);
      for (let k=0; k<take && idx<n; k++, idx++){
        model.tiers[b.tier].push(sortedIds[idx]);
      }
    }
    log('bucketsToTiers out', model.tiers);
    return model;
  }

  function forceScrollTop(){
    const go = () => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { window.scrollTo(0,0); }
      const c = document.getElementById('content');
      if (c && typeof c.scrollTo === 'function') c.scrollTo(0, 0);
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  // ====== MAIN VIEW (tier list UI) ======
  window.renderTierList = async function(root){
    if (!root) {
      root = document.getElementById('content');
      if (!root) {
        root = document.createElement('div');
        root.id='content';
        document.body.appendChild(root);
      }
    }

    const me = await fetchJson(url('/api/me'), { user:null });

    // ✅ NAJWAŻNIEJSZY FIX: ustaw admin/hide po zalogowaniu (żeby nie było undefined)
    applyMeToState(me);

    const loggedIn = !!(me && me.user && me.user.id);
    const lastKind  = localStorage.getItem(LS_LAST_KIND)  || KIND.HUNTERS;
    const lastScope = loggedIn ? (localStorage.getItem(LS_LAST_SCOPE) || 'global') : 'global';

    let active = { kind: lastKind, scope: lastScope };

    const shell = el('div', { class: 'w-full mx-auto px-3 sm:px-6 py-6', 'data-sla-page': 'tier-list' });

    const headerEl = el('div');
    const headBar = el('div');
    const actionsTop = el('div',{class:'tl-actions-top'});
    const spacer = el('div',{class:'tl-spacer'});
    const boardEl = el('div',{class:'tl-board'});

    root.innerHTML='';
    root.append(shell);
    shell.append(headerEl, headBar, actionsTop, spacer, boardEl);

    let baseList=[]; let indexMap=new Map(); let model=emptyModel(); let scopeUrl='';

    const setKind = async (kind)=>{
      // ✅ jeśli admin został ukryty w trakcie → nie pozwól wejść / zostać
      if (kind === 'admin' && (!isAdmin() || hideAdminButtonsEnabled())){
        active.kind = KIND.HUNTERS;
      } else {
        active.kind = kind;
      }

      localStorage.setItem(LS_LAST_KIND, active.kind);
      forceScrollTop();
      await mountView();
    };

    const setScope = async (scope)=>{
      if (!loggedIn && !window.STATE?.viewUserId) return;
      active.scope = (scope==='my') ? 'my' : 'global';
      localStorage.setItem(LS_LAST_SCOPE, active.scope);
      forceScrollTop();
      await mountView();
    };

    const drawTabs = ()=>{
      headBar.innerHTML='';
      if (!loggedIn && !window.STATE?.viewUserId && active.scope === 'my') active.scope = 'global';

      // ✅ jeśli jesteśmy w admin a admin się schował → wróć do hunters
      if (active.kind === 'admin' && (!isAdmin() || hideAdminButtonsEnabled())){
        active.kind = KIND.HUNTERS;
      }

      headBar.append(
        buttonsBar(active.kind, active.scope, setKind, setScope, loggedIn)
      );
      drawHeader();
    };

    const kindLabel = (k)=>{
      if (k === 'admin') return 'Admin';
      if (k === KIND.HUNTERS) return 'Hunters';
      if (k === KIND.WEAPONS) return 'Weapons';
      if (k === KIND.BLESSING) return 'Blessing';
      if (k === KIND.RUNES) return 'Runes';
      return String(k||'');
    };

    const computeProgress = ()=>{
      const catalogTotal = indexMap?.size || 0;
      if (!model || !model.tiers) return { placed: 0, total: catalogTotal };

      const placedSet = new Set();
      const visibleSet = new Set();
      for (const k of Object.keys(model.tiers)){
        for (const id of (model.tiers[k] || [])) {
          const sid = String(id);
          visibleSet.add(sid);
          if (k !== 'BENCH') placedSet.add(sid);
        }
      }

      const total = visibleSet.size || catalogTotal;
      return { placed: Math.min(total, placedSet.size), total };
    };

    const drawHeader = ()=>{
      headerEl.innerHTML = '';

      const title = `Tier List • ${kindLabel(active.kind)}`;
      let subtitle = '';

      if (active.kind === 'admin'){
        subtitle = 'Manage tier list settings';
      } else if (active.scope === 'global'){
        subtitle = 'Global ranking';
      } else {
        subtitle = 'Drag & drop to rank, then Save';
      }

      const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

      top.append(
        el('div', { class: 'min-w-0' },
          el('div', { class: 'text-2xl font-extrabold text-slate-900 dark:text-yellow-400 leading-tight' }, title),
          el('div', { class: 'text-sm text-slate-500 dark:text-slate-300/90' }, subtitle)
        )
      );

      // progress pill (only when it helps)
      if (active.kind !== 'admin' && active.scope === 'my'){
        const { placed, total } = computeProgress();
        if (total > 0){
          const count = el(
            'div',
            { class: 'px-3 py-1 rounded-full border bg-glass border-white/10 text-sm font-semibold text-slate-200' },
            `${placed}/${total}`
          );
          top.append(el('div', { class:'flex items-center gap-2 flex-wrap justify-end' }, count));
        }
      }

      headerEl.append(top);
    };

    // ✅ auto-refresh tabs gdy hideAdminButtons się zmienia
    (function watchHideAdmin(){
      let raf = 0;
      const refresh = ()=>{
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(async ()=> {
          // jeśli admin ukryty i był aktywny admin tab → wróć
          if (active.kind === 'admin' && hideAdminButtonsEnabled()){
            active.kind = KIND.HUNTERS;
            try { localStorage.setItem(LS_LAST_KIND, active.kind); } catch {}
          }

          const visibleKindsNow = [KIND.HUNTERS, KIND.WEAPONS, KIND.BLESSING, KIND.RUNES]
            .filter(k => TierTabVisibility.cache[k] !== false);

          if (active.kind !== 'admin' && !visibleKindsNow.includes(active.kind)) {
            active.kind = visibleKindsNow[0] || KIND.HUNTERS;
            try { localStorage.setItem(LS_LAST_KIND, active.kind); } catch {}
          }

          drawTabs();
          // header updates later again after data load
          drawHeader();
        });
      };

      const obs = new MutationObserver(refresh);
      obs.observe(document.body, { attributes:true });

      window.addEventListener('ui-hide-admin-buttons-changed', refresh);
      window.addEventListener('sla:admin-hide-changed', refresh);
      window.addEventListener('tier-tab-visibility-changed', refresh);
      window.addEventListener('storage', refresh);
    })();

    function drawActions(isViewingOther){
      actionsTop.innerHTML='';
      if (active.kind==='admin') return;
      if (active.scope==='global') return;

      if ((active.scope==='my' && !isViewingOther)){
        const saveBtn = el('button',{
          class: slcBtnClass(true),
          type:'button',
          onClick: async ()=>{
            const payload = serializeForApi(model, indexMap);
            const res = await postJson(scopeUrl, payload);
            if (res && res.__unauth) return alert('Musisz się zalogować, aby zapisać.');
            LStore.set(active.scope, active.kind, model);
            const t = saveBtn.textContent;
            saveBtn.textContent = 'Saved ✓';
            saveBtn.disabled = true;
            setTimeout(()=>{
              saveBtn.textContent = t;
              saveBtn.disabled = false;
            },1200);
          }
        }, 'Save');

        const resetBtn = el('button',{
          class: slcBtnClass(false),
          type:'button',
          onClick:()=>{
            model = emptyModel();
            model.tiers.BENCH = Array.from(indexMap.keys());
            log('Reset model -> bench size', model.tiers.BENCH.length);
          
            drawHeader();
          
            renderBoardInto(boardEl, model, indexMap, handleDrop, {
              hideBench: false,
              collapsible: true
            });
          }
        },'Reset');

        actionsTop.append(saveBtn, resetBtn);
      }
    }

    function handleDrop(id, dropTier, dropIndex){
      for (const t of TIER_KEYS){
    const i = model.tiers[t].indexOf(id);
    if (i >= 0) model.tiers[t].splice(i, 1);
      }
    
      const arr = model.tiers[dropTier];
      const idx = Math.max(0, Math.min(dropIndex ?? arr.length, arr.length));
      arr.splice(idx, 0, id);
    
      log('handleDrop', {
        id, dropTier, idx,
        tierSizes: Object.fromEntries(TIER_KEYS.map(k => [k, model.tiers[k].length]))
      });
    
      const isViewingOther = !!STATE.viewUserId;
    
      // ✅ odśwież licznik 1/58 od razu po zmianie pozycji
      drawHeader();
    
      renderBoardInto(boardEl, model, indexMap, handleDrop, {
        hideBench: (active.scope === 'global') || isViewingOther,
        collapsible: (active.scope === 'my' && !isViewingOther)
      });
    }

    async function mountView(){
      forceScrollTop();
      for (const key of TIER_KEYS) COLLAPSED[key] = false;
      if (!loggedIn && !STATE.viewUserId && active.scope==='my') active.scope='global';

      await Promise.all([
        TierTabVisibility.get(KIND.HUNTERS),
        TierTabVisibility.get(KIND.WEAPONS),
        TierTabVisibility.get(KIND.BLESSING),
        TierTabVisibility.get(KIND.RUNES),
      ]);

      // ✅ jeśli admin ukryty i był aktywny admin tab → wróć do hunters
      if (active.kind === 'admin' && (!isAdmin() || hideAdminButtonsEnabled())){
        active.kind = KIND.HUNTERS;
      }

      const visibleKindsNow = [KIND.HUNTERS, KIND.WEAPONS, KIND.BLESSING, KIND.RUNES]
        .filter(k => TierTabVisibility.cache[k] !== false);

      if (active.kind !== 'admin' && !visibleKindsNow.includes(active.kind)) {
        active.kind = visibleKindsNow[0] || KIND.HUNTERS;
      }

      drawTabs();

      if (active.kind==='admin'){
        actionsTop.innerHTML='';
        boardEl.innerHTML='';
        if (window.renderAdmin) window.renderAdmin(boardEl);
        return;
      }

      const kind  = active.kind;
      const scope = active.scope;
      const isViewingOther = !!STATE.viewUserId;

      const adminVisible = isAdmin() && !hideAdminButtonsEnabled();

      log('▶️ mountView start', { kind, scope, isViewingOther, loggedIn });

      const comingOn = await TierComing.get(kind);

      if (comingOn && !adminVisible){
        actionsTop.innerHTML = '';
        boardEl.innerHTML = '';

        let subtitle = '';
        if (kind === KIND.HUNTERS){
          subtitle = 'The tier list for Hunters is currently being prepared.\n' +
                     'Please check back later.';
        } else if (kind === KIND.WEAPONS){
          subtitle = 'The tier list for Weapons is currently being prepared.\n' +
                     'Please check back later.';
        } else if (kind === KIND.BLESSING){
          subtitle = 'The tier list for Blessing Stones is currently being prepared.\n' +
                     'Please check back later.';
        } else if (kind === KIND.RUNES){
          subtitle = 'The tier list for Runes is currently being prepared.\n' +
                     'Please check back later.';
        }

        const holder = el('div', {
          class: 'w-full flex items-center justify-center mt-4 mb-6 px-2'
        });
        const panel = buildTierComingSoonPanel({
          title: 'Coming soon',
          subtitle
        });
        holder.append(panel);
        drawHeader();
        boardEl.append(holder);
        return;
      }

      baseList = await loadCatalogByKind(kind);

      const localOverlay = readOverlay(kind);
      if (localOverlay.length){
        const byName = new Map(baseList.map(x=>[String(x.name),x]));
        for (const it of localOverlay){
          const nm = String(it.name);
          if (!nm) continue;
          if (byName.has(nm)){
            const baseObj = byName.get(nm);
            if (!baseObj.rarity && it.rarity) baseObj.rarity = it.rarity;
            if (!baseObj.element && it.element) baseObj.element = it.element;
          } else {
            baseList.push(it);
            warn('Client added locally-known item to baseList view', it.name);
          }
        }
      }

      const dataset = KIND_DATASET[kind];
      const got = await fetchJson(ENDPOINT.globalOrderGet(dataset), { order: [] });
      const order = Array.isArray(got?.order) ? got.order : [];
      if (order.length) {
        const byName = new Map(baseList.map(x => [String(x.name), x]));
        const seen = new Set();
        const sorted = [];
        for (const n of order) {
          const v = byName.get(String(n));
          if (v && !seen.has(n)) {
            sorted.push(v);
            seen.add(n);
          }
        }
        const missing = baseList
          .filter(x => !seen.has(String(x.name)))
          .sort((a,b)=> a.name.localeCompare(b.name));
        baseList = sorted.concat(missing);
        log('✅ baseList after global order (+local overlay)', baseList.map(x=>x.name));
      } else {
        log('⚠️ no global order found, using baseList as-is');
      }

      // build index for current kind (hunters / weapons / ...)
      indexMap = buildIndex(baseList, kind);

      if (scope === 'global'){
        const agg = await fetchJson(ENDPOINT.aggregate(kind, `?method=borda&w=0.30&alpha=1&full=1`), { items:[] });
        if (!agg || !Array.isArray(agg.items) || agg.items.length===0){
          log('GLOBAL: empty aggregation → render empty tiers (no BENCH)');
          model = emptyModel();
          drawHeader();
          renderBoardInto(boardEl, model, indexMap, handleDrop, {
            hideBench: true,
            collapsible: false
          });

          if (comingOn && adminVisible){
            const note = el('div', {
              class:'text-center text-xs text-amber-600 dark:text-amber-400 -mt-1 mb-2'
            }, 'Note: non-admin users currently see "Coming soon" here.');
            boardEl.append(note);
          }

          drawActions(false);
          return;
        }

        const sortedIds = (agg.items||[])
          .sort((a,b)=> b.score - a.score)
          .map(x=> String(x.name));
        log('GLOBAL: agg result count', sortedIds.length);
        model = bucketsToTiers(sortedIds);
        drawHeader();
        renderBoardInto(boardEl, model, indexMap, handleDrop, {
          hideBench: true,
          collapsible: false
        });

        if (comingOn && adminVisible){
          const note = el('div', {
            class:'text-center text-xs text-amber-600 dark:text-amber-400 -mt-1 mb-2'
          }, 'Note: non-admin users currently see "Coming soon" here.');
          boardEl.append(note);
        }

        drawActions(false);
        return;
      }

      const useLocal = (scope==='my' && !isViewingOther);
      scopeUrl = ENDPOINT.my(kind) + (isViewingOther ? `?user=${STATE.viewUserId}` : '');

      const saved = await fetchJson(scopeUrl, null);

      boardEl.innerHTML='';
      if ((saved && saved.__unauth) || (!loggedIn && !STATE.viewUserId)) {
        boardEl.append(bannerLogin());
      }

      if (useLocal){
        const ls = LStore.get(scope, kind);
        model = (ls && ls.tiers) ? ls : normalizeIncomingFromApi(saved, baseList);
      } else {
        model = normalizeIncomingFromApi(saved, baseList);
      }
      ensureBaseCoverage(model, baseList);

      drawHeader();
      renderBoardInto(boardEl, model, indexMap, handleDrop, {
        hideBench: isViewingOther,
        collapsible: !isViewingOther
      });

      if (comingOn && adminVisible){
        const note = el('div', {
          class:'text-center text-xs text-amber-600 dark:text-amber-400 -mt-1 mb-2'
        }, 'Note: non-admin users currently see "Coming soon" here.');
        boardEl.append(note);
      }

      drawActions(isViewingOther);
    }

    await mountView();
  };

  // ✅ mount dla routera (tak jak inne moduły)
  window.__tier_list_mount = async function __tier_list_mount(){
    try{
      const content = document.getElementById('content') || document.body;
      await window.renderTierList(content);
      log('__tier_list_mount OK');
    }catch(e){
      err('__tier_list_mount ERROR', e);
    }
  };

  // ✅ fallback auto-mount
  try{
    const c = document.getElementById('content');
    if (c && c.children.length === 0 && typeof window.renderTierList === 'function'){
      log('Auto-mount fallback (content empty)');
      window.renderTierList(c);
    }
  }catch{}
})();
