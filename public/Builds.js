/* public/builds.js — Builds editor
   - Builds (DB logical files): Hunters/*.json   -> GET /api/builds
   - Gems (DB logical file):    Gems/gems.json  -> GET /api/builds/gems
   - Hunter list (DB logical):  hunter.json     -> GET /api/builds/hunterlist
   - Save: POST /api/admin/builds { filename, content }
*/
(function(){
  const S  = window.STATE || (window.STATE = {});

  // Global scroll-to-top (użyje BackToTop z index.html jeśli jest)
  const toTop = () => {
    try {
      if (typeof window.__scrollTop === 'function') {
        window.__scrollTop();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      window.scrollTo(0, 0);
    }
  };

  // ---------- Safe el + append ----------
  const el = ((base) => {
    return (t, a = {}, ...c) => {
      const maker = typeof base === 'function'
        ? (t,a)=>base(t,a)
        : (t,a)=>{ const n=document.createElement(t);
            for (const [k,v] of Object.entries(a||{})) {
              if (k==='class') n.className=v;
              else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
              else if (k==='html') n.innerHTML=v;
              else {
                // boolean attrs: ustaw tylko gdy true; pomiń gdy false
                const boolAttrs = new Set(['disabled','readonly','checked','selected','autofocus','required','multiple']);
                if (k === 'readOnly') {
                  if (v) n.setAttribute('readonly','');
                } else if (boolAttrs.has(k.toLowerCase())) {
                  if (v) n.setAttribute(k.toLowerCase(), '');
                } else {
                  n.setAttribute(k, v);
                }
              }
            }
            return n;
          };
      const n = maker(t,a);

      // --- POST NORMALIZE: zdejmij błędne boolean atrybuty ustawione przez bazowy window.el
      if (a) {
        if ('disabled' in a && !a.disabled) { n.removeAttribute('disabled'); if ('disabled' in n) n.disabled = false; }
        if ('readOnly' in a && !a.readOnly) { n.removeAttribute('readonly'); if ('readOnly' in n) n.readOnly = false; }
        if ('checked' in a && !a.checked)   { n.removeAttribute('checked');   if ('checked' in n)   n.checked = false; }
        if ('selected' in a && !a.selected) { n.removeAttribute('selected'); }
        if ('multiple' in a && !a.multiple) { n.removeAttribute('multiple'); }
        if ('required' in a && !a.required) { n.removeAttribute('required'); }
        if ('autofocus' in a && !a.autofocus){ n.removeAttribute('autofocus'); }
      }

      for (const k of c.flat()) if (k!=null && k!==false) n.append(k);
      return n;
    };
  })(window.el);

  function appendSafe(p, ...kids){ for(const k of kids.flat()) if(k!=null && k!==false) p.append(k); }

  // ✅ FIX: url() fallback dla /slahub (żeby fetch nie walił w 404)
  // - jeśli app.js daje window.url -> użyjemy tego
  // - jeśli nie -> zrobimy prefix "/slahub"
  const url = window.url || ((p='')=>{
    const base = (window.__APP_BASE_PATH || '/slahub').replace(/\/+$/,''); // "/slahub"
    if (!p) return base;
    if (/^https?:\/\//i.test(p)) return p;           // full URL
    if (!p.startsWith('/')) p = '/' + p;            // enforce leading slash
    if (p.startsWith(base + '/')) return p;          // already prefixed
    return base + p;                                 // "/slahub" + "/api/..."
  });

  // ---------- Styles ----------
  (function injectCSS(){
    const OLD = document.getElementById('builds-css');
    if (OLD) OLD.remove();

    const s = document.createElement('style');
    s.id = 'builds-css';
    s.textContent = `
  /* ===== Foundation: jak w app.js (Tailwind look & feel w czystym CSS) ===== */

  /* Tekst */
  .bd-wrap{ color:#0f172a; }                /* slate-900 */
  .dark .bd-wrap{ color:#e2e8f0; }          /* slate-200 */

  /* Layouty */
  .bd-wrap{width:100%;margin:0 auto;padding:24px 12px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
  @media(min-width:640px){ .bd-wrap{padding-left:24px;padding-right:24px} }

  .bd-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .bd-toolbar{display:flex;gap:8px;align-items:center}
  .bd-list{display:flex;gap:8px;flex-wrap:wrap}
  .bd-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .bd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .bd-grid-4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
  .bd-grid-5{ display:grid; grid-template-columns:1fr 1fr 1fr 1fr auto; gap:10px; }
  @media(max-width:1100px){ .bd-grid-3,.bd-grid-4{grid-template-columns:1fr 1fr} }
  @media(max-width:680px){ .bd-grid,.bd-grid-3,.bd-grid-4{grid-template-columns:1fr} }
  .row{display:flex;gap:8px;align-items:center}
  .small{font-size:12px;opacity:.9}
  .muted{opacity:.7}

  /* ===== Panele/karty – jak w app.js (bg/border/rounded) ===== */
  .bd-panel{
    background:#ffffff;                     /* bg-white */
    border:1px solid #e2e8f0;               /* slate-200 */
    border-radius:0.75rem;                   /* rounded-xl */
    padding:12px; color:inherit;
  }
  .dark .bd-panel{
    background:#1f2937;                     /* slate-800 */
    border-color:#334155;                   /* slate-700 */
  }

  /* Dystans między tabs a belką wyboru pliku */
  .bd-tabs{ margin-bottom:8px; }

  .card{
    background:#ffffff;
    border:1px solid #e2e8f0;
    border-radius:0.5rem;
    padding:10px;
  }
  .dark .card{
    background:#1f2937;
    border-color:#334155;
  }

  /* ===== Inputy / Selecty / Textarea – jak w app.js ===== */
  .bd-input,.bd-text,.bd-select{
    width:100%;
    min-height:40px;
    padding:8px 12px;
    background:#ffffff;                     /* bg-white */
    color:#0f172a;                          /* slate-900 */
    border:1px solid #cbd5e1;               /* slate-300 */
    border-radius:0.75rem;                   /* rounded-xl */
    outline:none;
    transition: box-shadow .12s ease, border-color .12s ease, background .12s ease;
    box-sizing:border-box;
  }
  .bd-text{min-height:84px;resize:vertical}
  .dark .bd-input,.dark .bd-text,.dark .bd-select{
    background:#1f2937;                     /* slate-800 */
    color:#e2e8f0;                          /* slate-200 */
    border-color:#334155;                   /* slate-700 */
  }
  .bd-input:focus,.bd-text:focus,.bd-select:focus{
    border-color:#94a3b8;                   /* slate-400 */
    box-shadow:0 0 0 2px rgba(100,116,139,.35); /* focus ring */
  }

  /* ===== Przyciski ===== */
/* Shared buttons: active = yellow, inactive = glass */
.bd-btn{
  height:40px;
  padding:0 14px;
  border-radius:0.75rem;                   /* rounded-xl */
  border:1px solid rgba(15,23,42,.12);
  background:rgba(15,23,42,.04);
  color:#0f172a;
  cursor:pointer;
  font-size:16px;
  line-height:1;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  transition:background .12s ease, border-color .12s ease, box-shadow .12s ease, color .12s ease;
}
.bd-btn:hover{ background:rgba(15,23,42,.07); }

.bd-btn:focus-visible{
  outline:none;
  box-shadow:0 0 0 2px rgba(250,204,21,.35);
  border-color:rgba(250,204,21,.45);
}

.bd-btn[disabled], .bd-btn:disabled{
  opacity:.5;
  cursor:not-allowed;
  pointer-events:none;
}

.dark .bd-btn{
  background:rgba(30,41,59,0.55);
  border-color:rgba(255,255,255,.12);
  color:#e2e8f0;
}
.dark .bd-btn:hover{ background:rgba(255,255,255,.10); }

/* ACTIVE / PRIMARY */
.bd-btn.active,
.bd-btn.primary{
  background:#facc15;                      /* bg-yellow-400 */
  border-color:#facc15;
  color:#0f172a;                           /* text-black */
}
.bd-btn.active:hover,
.bd-btn.primary:hover{
  background:#fbbf24;                      /* hover:bg-amber-400 */
  border-color:#fbbf24;
}
.dark .bd-btn.active,
.dark .bd-btn.primary{
  background:#facc15;
  border-color:#facc15;
  color:#0f172a;
}

/* Ghost = less prominent (still glassy) */
.bd-btn.ghost{
  background:transparent;
}
.bd-btn.ghost:hover{ background:rgba(15,23,42,.06); }
.dark .bd-btn.ghost{
  background:rgba(30,41,59,0.55);
  border-color:rgba(255,255,255,.14);
}
.dark .bd-btn.ghost:hover{ background:rgba(255,255,255,.08); }


  /* ===== Zakładki ===== */
  .bd-tabs .bd-btn{ height:40px; }

  /* ===== Chip / Podgląd obrazka ===== */
  .bd-chip{
    padding:6px 8px;
    border-radius:0.5rem;
    border:1px solid #e2e8f0;
    background:#ffffff;
    color:#0f172a;
    display:inline-flex;align-items:center;gap:8px
  }
  .dark .bd-chip{
    background:#1f2937;
    color:#e2e8f0;
    border-color:#334155;
  }

  .img-preview{
    width:220px;height:220px;object-fit:contain;
    background:#ffffff;border:1px solid #e2e8f0;border-radius:0.75rem;
  }
  .dark .img-preview{
    background:#1f2937;border-color:#334155;
  }

  /* Cores passives strict 64x64 */
  .core-img{
    width:64px;height:64px;
    min-width:64px;min-height:64px;
    max-width:64px;max-height:64px;
    flex:0 0 64px;
    display:block;
    object-fit:contain;
    border:1px solid #e2e8f0;border-radius:8px;
  }
  .dark .core-img{ border-color:#334155; }

  /* ===== Cores → mainStats ===== */
  .bd-core-card{
    display:flex;
    flex-direction:column;
    gap:6px;
    justify-content:flex-start;
    min-height:88px;               /* Mind/Body/Spirit = 88 */
  }
  .bd-core-card .small{
    font-size:12px;
    line-height:1;
    margin:0;
  }
  .bd-core-card select.bd-select{
    height:36px !important;
    line-height:36px !important;
    padding-top:0 !important;
    padding-bottom:0 !important;
    margin:0 !important;
    box-sizing:border-box;
    -webkit-appearance: none;
    appearance: none;
  }

  /* Globalny odstęp między panelami w układzie „stack” */
  .bd-panel + .bd-panel { margin-top: 10px; }

  /* ===== FIX: w gridach NIE dokładaj margin-top między panelami ===== */
  .bd-grid .bd-panel,
  .bd-grid-3 .bd-panel,
  .bd-grid-4 .bd-panel,
  .bd-grid-5 .bd-panel {
    margin-top: 0 !important;
  }

  /* ikonowe przyciski obok inputa */
  .bd-btn.icon{
    width:40px;
    min-width:40px;
    padding:0;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    line-height:1;
    font-size:14px;
  }
  `;
    document.head.appendChild(s);
  })();

  // ---------- State ----------
  let IS_ADMIN = false;
  const FORCE_EDIT = true;                 // ← ustaw true aby każdy mógł edytować
  const CAN_EDIT   = () => FORCE_EDIT || IS_ADMIN;
  let FILES = [];               // { filename: 'Hunters/xxx.json', content:{} }
  let CURRENT_FILE = null;      // 'Hunters/xxx.json'
  S.buildTab = S.buildTab || 'files';

  // ---------- Dictionaries / Lists ----------
  // Role: show short label, save full with tag
  const ROLES_FULL = [
    "STRIKER <:Class_Striker:1451194012596834407>",
    "BREAKER <:Class_Breaker:1451193978929287221>",
    "SUPPORTER <:Class_Supporter:1451194023552356443>",
    "ELEMENTAL STACKER <:Class_Stacker:1451194002681495562>"
  ];
  const ROLE_LABEL = (full)=> full.split(' ')[0];
  const ROLE_BY_LABEL = Object.fromEntries(ROLES_FULL.map(f=>[ROLE_LABEL(f), f]));

  // Artifacts selections
  const ART_ARMORS = [
    "Iron Will","Warmonger","Destroyer","Solid Foundation","Armed","One-hit Kill",
    "Noble Sacrifice","Angel in White","Guardian","Solid Analysis","Toughness"
  ];
  const ART_ACCESSORY = [
    "Destructive Instinct","Shining Star","Concentration of Firepower","Outstanding Connection",
    "Sylph's Blessing","Expert","Obsidian","Berserker","Executioner","Champion on the Field"
  ];
  const ART_8SET = [
    "Chaotic Infamy","Chaotic Desire","Chaotic Wish",
    "Burning Curse","Burning Blessing","Burning Greed"
  ];
  // Prior stats: show clean label, save full (with tags)
  const PRIOR_STAT_MAP = [
    ["Additional Attack", "<:Attacks:1324508242168254546> Additional Attack"],
    ["Attack %", "<:Attacks:1324508242168254546> Attack %"],
    ["Additional Defense", "<:Defense:1324508500063162389> Additional Defense"],
    ["Defense %", "<:Defense:1324508500063162389> Defense %"],
    ["Additional HP", "<:HPs:1324508528601337988> Additional HP"],
    ["HP %", "<:HPs:1324508528601337988> HP %"],
    ["Additional MP", "<:MP:1324508542174236763> Additional MP"],
    ["Critical Hit Rate", "<:Critical_Hit_Rate:1324508479658004540> Critical Hit Rate"],
    ["Critical Hit Damage", "<:Critical_Hit_Damage:1324508473488314428> Critical Hit Damage"],
    ["Damage Increase", "<:Damage_Increase:1324508491422896158> Damage Increase"],
    ["Defense Penetration", "<:Defense_Penetration:1324508508237987965> Defense Penetration"],
    ["MP Consumption Reduction", "<:MP_Consumption_Reduction:1397654011313918033> MP Consumption Reduction"],
    ["MP Recovery Rate Increase", "<:MP_Recovery_Rate_Increase:1397654645182038056> MP Recovery Rate Increase"]
  ];
  const PRIOR_LABEL_TO_FULL = Object.fromEntries(PRIOR_STAT_MAP);
  const PRIOR_FULL_TO_LABEL = Object.fromEntries(PRIOR_STAT_MAP.map(([l,f])=>[f,l]));

  // Targets keys (dropdown)
  const TARGET_KEYS = [
    "Additional Attack","Attack %","Additional Defense","Defense %","Additional HP","HP %",
    "Additional MP","Critical Hit Rate","Critical Hit Damage","Damage Increase",
    "Defense Penetration","MP Consumption Reduction","MP Recovery Rate Increase"
  ];

  // Weapons
  const WEAPON_RARITY = ["SSR","SR"];
  const RARITY_LABEL_TO_FULL = {
    SSR: "<:SSR:1397612421727649822>",
    SR:  "<:SR:1397630422409810030>"
  };
  const RARITY_FULL_TO_LABEL = Object.fromEntries(
    Object.entries(RARITY_LABEL_TO_FULL).map(([k,v]) => [v, k])
  );

  // --- Rebuild all derived lookups after dictionaries change ---
  function refreshDerivedMaps(){
    // Role
    const byLabel = Object.fromEntries(ROLES_FULL.map(f => [ROLE_LABEL(f), f]));
    for (const k of Object.keys(ROLE_BY_LABEL)) delete ROLE_BY_LABEL[k];
    Object.assign(ROLE_BY_LABEL, byLabel);

    // Prior stats
    const labToFull = Object.fromEntries(PRIOR_STAT_MAP);
    const fullToLab = Object.fromEntries(PRIOR_STAT_MAP.map(([l,f]) => [f,l]));
    for (const k of Object.keys(PRIOR_LABEL_TO_FULL)) delete PRIOR_LABEL_TO_FULL[k];
    Object.assign(PRIOR_LABEL_TO_FULL, labToFull);
    for (const k of Object.keys(PRIOR_FULL_TO_LABEL)) delete PRIOR_FULL_TO_LABEL[k];
    Object.assign(PRIOR_FULL_TO_LABEL, fullToLab);

    // Rarity
    const inv = Object.fromEntries(Object.entries(RARITY_LABEL_TO_FULL).map(([k,v]) => [v,k]));
    for (const k of Object.keys(RARITY_FULL_TO_LABEL)) delete RARITY_FULL_TO_LABEL[k];
    Object.assign(RARITY_FULL_TO_LABEL, inv);
  }

  function refreshCoreMaps(){
    // odśwież CORE_BY_GROUP na podstawie bieżącej CORE_PASSIVES_FULL
    for (const k of Object.keys(CORE_BY_GROUP)) delete CORE_BY_GROUP[k];
    Object.assign(CORE_BY_GROUP, {
      Mind:   CORE_PASSIVES_FULL.filter(s => /\bCore_Mind_0/.test(s)),
      Body:   CORE_PASSIVES_FULL.filter(s => /\bCore_Body_0/.test(s)),
      Spirit: CORE_PASSIVES_FULL.filter(s => /\bCore_Spirit_0/.test(s))
    });
  }

  // --- Fresh dicts (cores) loader używany poza Admin, np. przy wejściu w Builds (files)
  async function ensureDictsFresh(){
    try{
      const r = await fetch(url('/api/builds/dicts'), { cache:'no-store' });
      const all = await r.json();
      const root = (all && typeof all === 'object' && all.dicts && typeof all.dicts === 'object') ? all.dicts : all;

      const pass = Array.isArray(root?.CORE_PASSIVES_FULL) ? root.CORE_PASSIVES_FULL : null;
      const img  = (root?.CORE_IMG && typeof root.CORE_IMG === 'object') ? root.CORE_IMG : null;

      if (pass || img){
        if (pass){
          CORE_PASSIVES_FULL.length = 0;
          CORE_PASSIVES_FULL.push(...pass);
        }
        if (img){
          for (const k of Object.keys(CORE_IMG)) delete CORE_IMG[k];
          Object.assign(CORE_IMG, img);
        }
        refreshCoreMaps();
      }
    }catch(_){
      // cicho – jak się nie uda, zostają lokalne defaulty
    }
  }

  const SR_LIST = ["Steel Longsword","Steel Dagger","Steel Axe","Steel Bow","Steel Shield","Steel Staff","Ancient Grimoire"];

  // Cores mainStats
  const CORE_MAIN_LABELS = {
    Mind: [
      "Additional Attack","Attack %","Critical Hit Rate","Critical Hit Damage",
      "Damage Increase","Defense Penetration","Damage Reduction",
      "Additional MP","MP Consumption Reduction","MP Recovery Rate Increase"
    ],
    Body: [
      "Additional Defense","Defense %","Critical Hit Rate","Critical Hit Damage",
      "Damage Increase","Defense Penetration","Damage Reduction",
      "Additional MP","MP Consumption Reduction","MP Recovery Rate Increase"
    ],
    Spirit: [
      "Additional HP","HP %","Critical Hit Rate","Critical Hit Damage",
      "Damage Increase","Defense Penetration","Damage Reduction",
      "Additional MP","MP Consumption Reduction","MP Recovery Rate Increase"
    ]
  };

  // Cores passives
  const CORE_PASSIVES_FULL = [
    "Nameless Demon's Deception <:Core_Mind_01:1393593242263752825>",
    "Nameless Demon's Horn <:Core_Body_01:1393593252489199668>",
    "Nameless Demon's Magisphere <:Core_Spirit_01:1393593260835999856>",
    "Ancient Wraith's Obsession <:Core_Mind_02:1393593291139977266>",
    "Ancient Wraith's Right Hand <:Core_Body_02:1393593298886721696>",
    "Ancient Wraith's Mana Power <:Core_Spirit_02:1393593306469896282>",
    "Eyes of the Watcher <:Core_Mind_03:1393593315131392060>",
    "Limbs of the Watcher <:Core_Body_03:1393593325558173790>",
    "Teeth of the Watcher <:Core_Spirit_03:1393593332579569715>",
    "Hunger of the Crimson Apex <:Core_Mind_04:1393593338950713405>",
    "Desires of the Crimson Apex <:Core_Body_04:1393593349361111040>",
    "Punishment of the Crimson Apex <:Core_Spirit_04:1393593356617257092>"
  ];
  const CORE_LABEL = (full)=> String(full || '').replace(/\s*<:.*?>\s*$/,'');
  const CORE_IMG = {
    "Ancient Wraith's Obsession": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186063/SLA/Portrait/Core/Ancient_Wraiths_Obsession.png",
    "Ancient Wraith's Mana Power": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186062/SLA/Portrait/Core/Ancient_Wraiths_Mana_Power.png",
    "Ancient Wraith's Right Hand": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186064/SLA/Portrait/Core/Ancient_Wraiths_Right_Hand.png",
    "Nameless Demon's Deception": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186066/SLA/Portrait/Core/Nameless_Demons_Deception.png",
    "Nameless Demon's Horn": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186067/SLA/Portrait/Core/Nameless_Demons_Horn.png",
    "Nameless Demon's Magisphere": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1731186069/SLA/Portrait/Core/Nameless_Demons_Magisphere.png",
    "Eyes of the Watcher": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992887/SLA/Portrait/Core/Eyes_of_the_Watcher.png",
    "Limbs of the Watcher": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992892/SLA/Portrait/Core/Limbs_of_the_Watcher.png",
    "Teeth of the Watcher": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992894/SLA/Portrait/Core/Teeth_of_the_Watcher.png",
    "Hunger of the Crimson Apex": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992889/SLA/Portrait/Core/Hunger_of_the_Crimson_Apex.png",
    "Desires of the Crimson Apex": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992891/SLA/Portrait/Core/Desires_of_the_Crimson_Apex.png",
    "Punishment of the Crimson Apex": "https://res.cloudinary.com/dmfww0zt8/image/upload/v1756992891/SLA/Portrait/Core/Punishment_of_the_Crimson_Apex.png"
  };
  const CORE_BY_GROUP = {
    Mind: CORE_PASSIVES_FULL.filter(s=>/\bCore_Mind_0/.test(s)),
    Body: CORE_PASSIVES_FULL.filter(s=>/\bCore_Body_0/.test(s)),
    Spirit: CORE_PASSIVES_FULL.filter(s=>/\bCore_Spirit_0/.test(s))
  };

  const PRIORITY_SKILLS = ["Basic Attacks","Core Attack","Basic Skill 1","Basic Skill 2","Support Skill","QTE Skill","Ultimate Skill"];
  const TESTING = ["no","yes","new"];

  // ---------- API ----------
  async function isAdmin(){
    try{
      const r = await fetch(url('/api/admin/is-admin'), {credentials:'include', cache:'no-store'});
      const j = await r.json(); return !!j?.isAdmin;
    }catch{ return false; }
  }
  async function fetchBuilds(){
    try{
      const j = await fetch(url('/api/builds'), {cache:'no-store'}).then(r=>r.json());
      FILES = Array.isArray(j?.files) ? j.files : [];
    }catch{ FILES = []; }
  }
  async function loadFileContent(filename){
    try{
      const r = await fetch(url(`/api/builds/${encodeURIComponent(filename)}`), {cache:'no-store'});
      if (!r.ok) return null;
      return await r.json();
    }catch{return null;}
  }
  async function fetchGems(){
    try{
      const r = await fetch(url('/api/builds/gems'), {cache:'no-store'});
      if (!r.ok) return null;
      return await r.json();
    }catch{return null;}
  }
  async function fetchHunterlist(){
    try{
      const r = await fetch(url('/api/builds/hunterlist'), {cache:'no-store'});
      if (!r.ok) return null;
      return await r.json();
    }catch{return null;}
  }
  async function saveBuild(filename, content){
    const res = await fetch(url('/api/admin/builds'), {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ filename, content })
    });
    if(!res.ok){
      let j=null; try{ j=await res.json(); }catch{}
      throw new Error(j?.error || `Save failed (${res.status})`);
    }
    return res.json();
  }
  async function deleteBuildFile(filename){
    const res = await fetch(url(`/api/admin/builds/${encodeURIComponent(filename)}`), {
      method:'DELETE', credentials:'include'
    });
    if(!res.ok) {
      let j=null; try{ j=await res.json(); }catch{}
      throw new Error(j?.error || `Delete failed (${res.status})`);
    }
    return res.json();
  }

  // --- BEST tag do szybkiego kopiowania ---
  const BEST_TAG = "(Best <:BEST:1399866971486556200>)";

  const QUICK_TAGS = [
    "(Support)",
    "(DPS)",
    "(Hunter mode)",
    "(Team Battle Mode)",
    "(Guild Boss)"
  ];

  // --- uniwersalny helper: kopiuj do schowka ---
  async function copyToClipboard(text){
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      return true;
    }
  }

  // mały helper – robi przycisk kopiujący, który po kliknięciu pokazuje "Skopiowano"
  function makeCopyBtn(label, text){
    const btn = el('button', {
      class:'bd-btn',
      onClick: async ()=>{
        await copyToClipboard(text);
        const prev = btn.textContent;
        btn.textContent = 'Skopiowano';
        btn.setAttribute('disabled','');
        setTimeout(()=>{ btn.textContent = prev; btn.removeAttribute('disabled'); }, 900);
      }
    }, label);
    return btn;
  }

  // ---------- Helpers ----------
  function toast(msg){
    const t = el('div',{class:'fixed top-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-xl shadow z-50'}, msg);
    document.body.append(t); setTimeout(()=>t.remove(), 1400);
  }
  function moveInArray(arr, from, to){
    if (to<0 || to>=arr.length) return;
    const [x] = arr.splice(from,1);
    arr.splice(to,0,x);
  }

  function displayBuildName(filename){
    return String(filename || '')
      .replace(/^Hunters\//i, '')
      .replace(/\.json$/i, '');
  }

  function buildFilenameFromName(input){
    const base = String(input || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^Hunters\//i, '')
      .replace(/\.json$/i, '')
      .replace(/^\/+/, '')
      .trim();

    return base ? `Hunters/${base}.json` : null;
  }

  function section(title, ...kids){
    const box = el('div', { class:'bd-panel' });
    box.append(
      el('div',{class:'font-semibold', style:'margin-bottom:6px'}, title),
      ...kids
    );
    return box;
  }

  function buildTopControls(onFileChange, onNewFile, onDeleteFile, selected){
    const wrap   = el('div', { class:'bd-head' });
    const left   = el('div', {});
    const right  = el('div', { class:'bd-toolbar' });

    // --- Combobox ---
    const box    = el('div', { style:'position:relative;min-width:280px' });
    const input  = el('input', {
      class:'bd-input', placeholder:'— choose file (or create new) —',
      value:''
    });
    const list   = el('div', {
      class:'bd-panel', style:'position:absolute;left:0;right:0;top:100%;z-index:30;margin-top:4px;max-height:280px;overflow:auto;display:none;padding:4px'
    });

    let items = [];
    let open  = false;
    let idx   = -1;

    function rebuildItems(q=''){
      const ql = q.trim().toLowerCase();
      const src = ql ? FILES.filter(f => displayBuildName(f.filename).toLowerCase().includes(ql)) : FILES;
      items = src.map(f => ({ label: displayBuildName(f.filename), value: f.filename }));

      list.innerHTML = '';
      if (!items.length){
        list.append(el('div',{class:'muted', style:'padding:6px 8px'}, 'No results'));
        idx = -1;
        return;
      }
      items.forEach((it, i)=>{
        const row = el('div', {
          class:'row', style:`padding:6px 8px;border-radius:8px;cursor:pointer;${i===idx?'outline:2px solid #94a3b8;':''}`,
          onClick: ()=>{
            input.value = it.label;
            closeList();
            onFileChange(it.value);
          },
          onMouseenter: ()=>{ idx=i; paintActive(); }
        }, it.label);
        list.append(row);
      });
    }

    function paintActive(){
      const rows = Array.from(list.children);
      rows.forEach((r,i)=> r.style.outline = (i===idx ? '2px solid #94a3b8' : 'none'));
      if (idx>=0 && rows[idx]){
        const r = rows[idx];
        const top = r.offsetTop, bot = top + r.offsetHeight;
        if (list.scrollTop > top) list.scrollTop = top;
        else if (list.scrollTop + list.clientHeight < bot) list.scrollTop = bot - list.clientHeight;
      }
    }

    function openList(){
      if (open) return;
      open = true; list.style.display = 'block';
      idx = -1; paintActive();
    }
    function closeList(){
      if (!open) return;
      open = false; list.style.display = 'none';
      idx = -1;
    }

    // startowy tekst: jeśli mamy wybrany plik — pokaż jego label
    if (selected){
      const f = FILES.find(x=>x.filename===selected);
      if (f) input.value = displayBuildName(f.filename);
    }
    rebuildItems('');

    input.addEventListener('focus', ()=>{ openList(); rebuildItems(input.value); });
    input.addEventListener('input', ()=>{ openList(); rebuildItems(input.value); });

    input.addEventListener('keydown', (e)=>{
      const key = e.key;
      if (key === 'ArrowDown'){
        e.preventDefault();
        if (!open) openList();
        if (!items.length) return;
        idx = (idx+1) % items.length; paintActive();
      } else if (key === 'ArrowUp'){
        e.preventDefault();
        if (!open) openList();
        if (!items.length) return;
        idx = (idx<=0 ? items.length-1 : idx-1); paintActive();
      } else if (key === 'Enter'){
        if (open && idx>=0 && items[idx]){
          e.preventDefault();
          input.value = items[idx].label;
          const val = items[idx].value;
          closeList();
          onFileChange(val);
        }
      } else if (key === 'Escape'){
        if (open){ e.preventDefault(); closeList(); }
      }
    });

    // klik poza – zamknij
    document.addEventListener('mousedown', (ev)=>{
      if (!wrap.contains(ev.target)) closeList();
    });

    // --- Arrows: prev/next file (wg kolejności FILES) ---
    function currentFilename(){
      if (selected && FILES.some(f=>f.filename===selected)) return selected;
      const lab = input.value.trim();
      const match = FILES.find(f => displayBuildName(f.filename) === lab);
      return match?.filename || null;
    }

    function stepFile(dir){
      if (!FILES.length) return;

      const order = FILES.map(f=>f.filename);
      const cur = currentFilename();
      let i = cur ? order.indexOf(cur) : -1;

      let ni;
      if (i === -1){
        ni = (dir > 0) ? 0 : (order.length - 1);
      } else {
        ni = i + dir;
      }

      if (ni < 0 || ni >= order.length){
        toast(dir > 0 ? 'Last file' : 'First file');
        return;
      }

      const next = order[ni];
      const f = FILES.find(x=>x.filename===next);
      input.value = displayBuildName(f?.filename || next);

      closeList();
      onFileChange(next);
    }

    const upBtn = el('button', {
      class:'bd-btn icon',
      title:'Previous file',
      onClick: ()=> stepFile(-1)
    }, '▲');

    const downBtn = el('button', {
      class:'bd-btn icon',
      title:'Next file',
      onClick: ()=> stepFile(1)
    }, '▼');

    // input + strzałki w jednym wierszu
    const inputRow = el('div', { class:'row', style:'gap:6px; align-items:center;' });
    input.style.flex = '1';
    inputRow.append(input, upBtn, downBtn);

    box.append(inputRow, list);

    // --- Buttons ---
    const newBtn = el('button', { class:'bd-btn', onClick: ()=> onNewFile() }, 'New build');
    const delBtn = el('button', { class:'bd-btn ghost', onClick: ()=> onDeleteFile(items.find(it=>it.label===input.value)?.value || selected || '') }, 'Delete file');

    left.append(box);
    right.append(newBtn, delBtn);
    wrap.append(left, right);
    return wrap;
  }

  // ---------- Dictionaries tab (editor for ROLES/ARTS/PRIOR/... etc.) ----------
  function buildDictionariesEditor(){
    const DICT_META = {
      ROLES_FULL:              { type:'array', ref: ()=>ROLES_FULL },
      ART_ARMORS:              { type:'array', ref: ()=>ART_ARMORS },
      ART_ACCESSORY:           { type:'array', ref: ()=>ART_ACCESSORY },
      ART_8SET:                { type:'array', ref: ()=>ART_8SET },
      PRIOR_STAT_MAP:          { type:'pairs', ref: ()=>PRIOR_STAT_MAP },
      TARGET_KEYS:             { type:'array', ref: ()=>TARGET_KEYS },
      CORES:                   { type:'cores', ref: ()=>({}) },
      PRIORITY_SKILLS:         { type:'array', ref: ()=>PRIORITY_SKILLS },
      RARITY_LABEL_TO_FULL:    { type:'map',   ref: ()=>RARITY_LABEL_TO_FULL }
    };

    const dictNames = Object.keys(DICT_META);
    S.dicts = S.dicts || { selected: dictNames[0] };

    const select = el('select', { class:'bd-select' }, ...dictNames.map(n=>el('option',{value:n},n)));
    select.value = S.dicts.selected;

    const tools = el('div', { class:'bd-toolbar' });
    S.dicts = S.dicts || { selected: 'ROLES', coresRows: [] };

    async function loadOne(name){
      try{
        const r = await fetch(url('/api/builds/dicts'), { cache:'no-store' });
        const all = await r.json();
        const root = (all && typeof all === 'object' && all.dicts && typeof all.dicts === 'object')
          ? all.dicts
          : all;

        if (name === 'CORES') {
          const pass = Array.isArray(root?.CORE_PASSIVES_FULL) ? root.CORE_PASSIVES_FULL : [];
          const img  = (root?.CORE_IMG && typeof root.CORE_IMG === 'object') ? root.CORE_IMG : {};

          CORE_PASSIVES_FULL.length = 0;
          CORE_PASSIVES_FULL.push(...pass);
          for (const k of Object.keys(CORE_IMG)) delete CORE_IMG[k];
          Object.assign(CORE_IMG, img);

          refreshCoreMaps();

          const rows = pass.map(s => {
            const m = String(s||'').match(/^(.*?)(\s*<:.*?>)\s*$/);
            const name = m ? m[1].trim() : String(s||'').trim();
            const emoji = m ? m[2].trim() : '';
            const link = String(img[name] || '').trim();
            return { name, emoji, link };
          });
          S.dicts.coresRows = rows;
          renderBody();
          toast('Loaded ✓');
          return;
        }

        if (!root || typeof root !== 'object' || !(name in root)) { toast('No saved data'); return; }
        applyToDict(name, root[name]);
        renderBody();
        toast('Loaded ✓');
      }catch{ toast('Load failed'); }
    }

    async function saveOne(name){
      if (name === 'CORES') {
        const rows = Array.isArray(S.dicts.coresRows) ? S.dicts.coresRows : [];
        const CORE_PASSIVES_FULL_VAL = rows
          .filter(r => r?.name)
          .map(r => `${String(r.name).trim()} ${String(r.emoji||'').trim()}`.trim());
        const CORE_IMG_VAL = Object.fromEntries(
          rows.filter(r=>r?.name).map(r => [ String(r.name).trim(), String(r.link||'').trim() ])
        );

        for (const [nm, value] of [
          ['CORE_PASSIVES_FULL', CORE_PASSIVES_FULL_VAL],
          ['CORE_IMG',           CORE_IMG_VAL]
        ]) {
          const res = await fetch(url('/api/admin/builds/dicts'), {
            method:'POST', credentials:'include',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ name: nm, value })
          });
          if (!res.ok) { toast(`Save failed (${nm})`); return; }
        }

        CORE_PASSIVES_FULL.length = 0;
        CORE_PASSIVES_FULL.push(...CORE_PASSIVES_FULL_VAL);
        for (const k of Object.keys(CORE_IMG)) delete CORE_IMG[k];
        Object.assign(CORE_IMG, CORE_IMG_VAL);
        refreshCoreMaps();

        toast('Saved ✓');
        S.dicts._loaded = false;
        await loadAllOnce();
        return;
      }

      const { type, ref } = DICT_META[name];
      const val = serializeCurrent(type, ref());
      const res = await fetch(url('/api/admin/builds/dicts'), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, value: val })
      });
      if (!res.ok) { toast('Save failed'); return; }
      toast('Saved ✓');
      S.dicts._loaded = false;
      await loadAllOnce();
    }

    const btnLoad = el('button', { class:'bd-btn ghost',   onClick:()=>loadOne(S.dicts.selected) }, 'Load');
    const btnSave = el('button', { class:'bd-btn primary', onClick:()=>saveOne(S.dicts.selected) }, 'Save');
    tools.append(btnLoad, btnSave);

    select.addEventListener('change', ()=>{ S.dicts.selected = select.value; renderBody(); });

    const headerRow = el('div', { class:'bd-head', style:'margin-bottom:8px' },
      el('div', {}, select),
      tools
    );

    const panel = el('div', { class:'bd-panel' });
    const body  = el('div', {});
    panel.append(body);

    function serializeCurrent(type, data){
      if (type === 'array') return [...data];
      if (type === 'pairs') return data.map(p => Array.isArray(p) ? [String(p[0]||''), String(p[1]||'')] : ["",""]);
      if (type === 'map')   return Object.fromEntries(Object.entries(data).map(([k,v])=>[String(k||''), String(v||'')]));
      return data;
    }

    function applyToDict(name, value){
      const meta = DICT_META[name]; if (!meta) return;
      const { type, ref } = meta;
      const target = ref();
      if (type === 'array' && Array.isArray(value)){
        target.length = 0; target.push(...value.map(x=>String(x||'')));
      } else if (type === 'pairs' && Array.isArray(value)){
        target.length = 0; value.forEach(p => target.push([String(p?.[0]||''), String(p?.[1]||'')]));
      } else if (type === 'map' && value && typeof value === 'object'){
        for (const k of Object.keys(target)) delete target[k];
        for (const [k,v] of Object.entries(value)) target[String(k)] = String(v||'');
      }
      refreshDerivedMaps();
    }

    function renderBody(){
      body.innerHTML = '';
      const name = S.dicts.selected;
      const { type, ref } = DICT_META[name];
      let data = ref();

      S.dicts = S.dicts || {};
      if (!Array.isArray(S.dicts.coresRows)) S.dicts.coresRows = [];

      body.append(
        el('div', { class:'font-semibold', style:'margin-bottom:6px' },
          `${name} (${type})`
        )
      );

      if (type === 'cores') {
        const rows = S.dicts.coresRows;

        if (!rows.length && Array.isArray(CORE_PASSIVES_FULL) && CORE_IMG) {
          S.dicts.coresRows = CORE_PASSIVES_FULL.map(s => {
            const m = String(s||'').match(/^(.*?)(\s*<:.*?>)\s*$/);
            const name  = m ? m[1].trim() : String(s||'').trim();
            const emoji = m ? m[2].trim() : '';
            const link  = String(CORE_IMG[name] || '').trim();
            return { name, emoji, link };
          });
        }

        const wrap = el('div', {});
        const head = el('div', { class:'bd-grid-4 small muted', style:'margin-bottom:6px' },
          el('div',{}, 'Name'),
          el('div',{}, 'Emoji (np. <:Core_Mind_01:...>)'),
          el('div',{}, 'Image link'),
          el('div',{}, '')
        );
        wrap.append(head);

        function renderRows(){
          [...wrap.querySelectorAll('.core-row')].forEach(n => n.remove());

          const rowsRef = S.dicts.coresRows;
          rowsRef.forEach((r, i) => {
            if (!r || typeof r !== 'object') rowsRef[i] = r = { name:'', emoji:'', link:'' };

            const row  = el('div', { class:'bd-grid-4 core-row', style:'margin-bottom:6px' });

            const iName  = el('input', { class:'bd-input', value: String(r.name||'') });
            const iEmoji = el('input', { class:'bd-input', value: String(r.emoji||'') });
            const iLink  = el('input', { class:'bd-input', value: String(r.link||'') });

            iName.addEventListener('input',  ()=>{ rowsRef[i].name  = iName.value;  refreshDerivedMaps(); });
            iEmoji.addEventListener('input', ()=>{ rowsRef[i].emoji = iEmoji.value; refreshDerivedMaps(); });
            iLink.addEventListener('input',  ()=>{ rowsRef[i].link  = iLink.value;  refreshDerivedMaps(); });

            const up   = el('button',{ class:'bd-btn', onClick:()=>{ if(i>0){ rowsRef.splice(i-1,0,rowsRef.splice(i,1)[0]); renderRows(); } } }, '↑');
            const down = el('button',{ class:'bd-btn', onClick:()=>{ if(i<rowsRef.length-1){ rowsRef.splice(i+1,0,rowsRef.splice(i,1)[0]); renderRows(); } } }, '↓');
            const add  = el('button',{ class:'bd-btn', onClick:()=>{ rowsRef.splice(i+1,0,{name:'',emoji:'',link:''}); renderRows(); } }, 'Add');
            const del  = el('button',{ class:'bd-btn ghost', onClick:()=>{ rowsRef.splice(i,1); renderRows(); } }, 'x');

            const actions = el('div', { class:'row' }, up, down, add, del);
            row.append(iName, iEmoji, iLink, actions);
            wrap.append(row);
          });
        }

        renderRows();
        body.append(wrap);
        return;
      }

      // Standard renderers
      if (type === 'array'){
        const list = el('div', {});
        data.forEach((val, i)=>{
          const row  = el('div', { class:'row', style:'margin-bottom:6px' });
          const inp  = el('input', { class:'bd-input', value: String(val||''), style:'flex:1' });
          const up   = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(data, i, i-1); refreshDerivedMaps(); renderBody(); } }, '↑');
          const down = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(data, i, i+1); refreshDerivedMaps(); renderBody(); } }, '↓');
          const add  = el('button',{ class:'bd-btn', onClick:()=>{ data.splice(i+1,0,''); refreshDerivedMaps(); renderBody(); } }, 'Add');
          const del  = el('button',{ class:'bd-btn ghost', onClick:()=>{ data.splice(i,1); refreshDerivedMaps(); renderBody(); } }, 'x');
          inp.addEventListener('input', ()=>{ data[i] = inp.value; refreshDerivedMaps(); });
          row.append(inp, up, down, add, del);
          list.append(row);
        });
        body.append(list);
      }
      else if (type === 'pairs'){
        const list = el('div',{});
        data.forEach((pair, i)=>{
          if (!Array.isArray(pair)) data[i] = pair = ['', ''];
          const [lab0, full0] = pair;
          const row  = el('div', { class:'row', style:'margin-bottom:6px' });
          const inpL = el('input', { class:'bd-input', value:String(lab0||''),  placeholder:'label', style:'flex:1' });
          const inpF = el('input', { class:'bd-input', value:String(full0||''), placeholder:'full', style:'flex:1' });
          const up   = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(data, i, i-1); refreshDerivedMaps(); renderBody(); } }, '↑');
          const down = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(data, i, i+1); refreshDerivedMaps(); renderBody(); } }, '↓');
          const add  = el('button',{ class:'bd-btn', onClick:()=>{ data.splice(i+1,0,["",""]); refreshDerivedMaps(); renderBody(); } }, 'Add');
          const del  = el('button',{ class:'bd-btn ghost', onClick:()=>{ data.splice(i,1); refreshDerivedMaps(); renderBody(); } }, 'x');
          inpL.addEventListener('input', ()=>{ data[i][0] = inpL.value; refreshDerivedMaps(); });
          inpF.addEventListener('input', ()=>{ data[i][1] = inpF.value; refreshDerivedMaps(); });
          row.append(inpL, inpF, up, down, add, del);
          list.append(row);
        });
        body.append(list);
      }
      else if (type === 'map'){
        const rows = Object.entries(data);
        const list = el('div', {});
        rows.forEach(([k0,v0], i)=>{
          const row  = el('div', { class:'row', style:'margin-bottom:6px' });
          const inpK = el('input', { class:'bd-input', value:String(k0||''), placeholder:'label', style:'flex:1' });
          const inpV = el('input', { class:'bd-input', value:String(v0||''), placeholder:'value', style:'flex:1' });

          const up   = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(rows, i, i-1); syncMap(rows); renderBody(); } }, '↑');
          const down = el('button',{ class:'bd-btn', onClick:()=>{ moveInArray(rows, i, i+1); syncMap(rows); renderBody(); } }, '↓');

          const add  = el('button',{ class:'bd-btn', onClick:()=>{
            const placeholder = `__new_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            rows.splice(i+1,0,[placeholder,""]);
            syncMap(rows);
            renderBody();
          } }, 'Add');

          const del  = el('button',{ class:'bd-btn ghost', onClick:()=>{ rows.splice(i,1); syncMap(rows); renderBody(); } }, 'x');

          function sync(){
            let newK = inpK.value.trim();
            const newV = inpV.value;

            if (!newK) newK = k0;

            const used = new Set(rows.map(([kk], idx) => idx!==i ? kk : null).filter(Boolean));
            while (used.has(newK)) newK = newK + '_1';

            rows[i] = [newK, newV];
            syncMap(rows);
          }

          inpK.addEventListener('input', sync);
          inpV.addEventListener('input', sync);
          row.append(inpK, inpV, up, down, add, del);
          list.append(row);
        });
        body.append(list);

        function syncMap(entries){
          const obj = {};
          for (const [kk,vv] of entries){
            if (String(kk||'').trim()) obj[String(kk)] = String(vv||'');
          }
          for (const k of Object.keys(data)) delete data[k];
          Object.assign(data, obj);
          refreshDerivedMaps();
        }
      }
    }

    async function loadAllOnce(){
      if (S.dicts._loaded) return;
      try{
        const r = await fetch(url('/api/builds/dicts'), { cache:'no-store' });
        const all = await r.json();
        const root = (all && typeof all === 'object' && all.dicts && typeof all.dicts === 'object')
          ? all.dicts : all;

        for (const k of ['ROLES_FULL','ART_ARMORS','ART_ACCESSORY','ART_8SET','PRIOR_STAT_MAP','TARGET_KEYS','PRIORITY_SKILLS','RARITY_LABEL_TO_FULL']){
          if (k in root) applyToDict(k, root[k]);
        }

        if (Array.isArray(root?.CORE_PASSIVES_FULL) || root?.CORE_IMG){
          const pass = Array.isArray(root.CORE_PASSIVES_FULL) ? root.CORE_PASSIVES_FULL : [];
          const img  = (root.CORE_IMG && typeof root.CORE_IMG === 'object') ? root.CORE_IMG : {};
          S.dicts.coresRows = pass.map(s=>{
            const m = String(s||'').match(/^(.*?)(\s*<:.*?>)\s*$/);
            const name  = m ? m[1].trim() : String(s||'').trim();
            const emoji = m ? m[2].trim() : '';
            const link  = String(img[name]||'').trim();
            return { name, emoji, link };
          });
        }

        refreshDerivedMaps();
        S.dicts._loaded = true;
        renderBody();
      }catch(_){}
    }

    renderBody();
    loadAllOnce();
    return el('div', {}, headerRow, panel);
  }

  // ---------- Builds editor ----------
  function buildEditor(filename, contentObj, onChange, isReadonly=false){
    const content = Object.assign({
      title:'', imgLink:'', role:[], artifacts:[],
      priorStats:{ statsList:[], targets:{} },
      weapons:[],
      cores:{ mainStats:{ Mind:'', Body:'', Spirit:'' }, passives:{ Mind:'', Body:'', Spirit:'' } },
      prioritySkillsUpgrade:[],
      Testing:'new'
    }, contentObj || {});

    ["Mind","Body","Spirit"].forEach(p=>{
      const v = content?.cores?.passives?.[p];
      if (v == null || String(v).trim().toLowerCase() === 'null') {
        content.cores.passives[p] = '';
      }
    });

    const fileNameInp = el('input',{class:'bd-input', value:displayBuildName(filename), placeholder:'build name (e.g. Alicia_Blanche)', readOnly:isReadonly});
    const titleInp    = el('input',{class:'bd-input', value:content.title, placeholder:'title (e.g. Alicia Blanche)', readOnly:isReadonly});

    const imgInp = el('input',{class:'bd-input', value:content.imgLink, placeholder:'image link (URL)', readOnly:isReadonly});
    const imgPrev = el('img',{class:'img-preview', src: content.imgLink || '', alt:'preview'});
    imgInp.addEventListener('input', ()=>{ imgPrev.src = imgInp.value; if(!isReadonly){ content.imgLink = imgInp.value; onChange(content); }});

    const roleSel = el('select',{class:'bd-select', disabled:isReadonly},
      el('option',{value:''}, '— choose role —'),
      ...ROLES_FULL.map(full => el('option',{ value: ROLE_LABEL(full) }, ROLE_LABEL(full)))
    );
    if (Array.isArray(content.role) && content.role[0]) {
      const lab = ROLE_LABEL(String(content.role[0]));
      roleSel.value = lab;
    }
    roleSel.addEventListener('change', ()=>{
      if (isReadonly) return;
      const lab = roleSel.value;
      content.role = lab ? [ROLE_BY_LABEL[lab]] : [];
      onChange(content);
    });

    // ---------- ARTIFACTS ----------
    const artifactsWrap = el('div',{});
    const artifactsToolbar = el('div', {
      class:'bd-toolbar',
      style:'margin-bottom:6px; flex-wrap:wrap; gap:6px'
    },
      makeCopyBtn('Copy BEST', BEST_TAG),
      ...QUICK_TAGS.map(t => makeCopyBtn(t, t))
    );

    const PATTERN_OPTIONS = ['8','4-4','2-2-4','4-2-2','2-2-2-2'];
    function fieldsForPattern(p){
      if (p==='8') return ['eight'];
      if (p==='4-4') return ['armor','acce'];
      if (p==='2-2-4') return ['armor','armor','acce'];
      if (p==='4-2-2') return ['armor','acce','acce'];
      if (p==='2-2-2-2') return ['armor','armor','acce','acce'];
      return ['armor','acce'];
    }
    const isArmorName = (n)=> ART_ARMORS.includes(n) || ART_8SET.includes(n);
    const isAccName   = (n)=> ART_ACCESSORY.includes(n) || ART_8SET.includes(n);

    function composeArtifact(row){
      const p = row.pattern;
      const names = (row.values||[]).filter(Boolean);
      let s = p;
      if (p==='8'){
        const n = names[0] || '';
        if (n) s += ' ' + n;
      } else {
        if (names.length) s += ' ' + names.join(' & ');
      }
      if (row.tag && row.tag !== '__none__') s += ' ' + row.tag;
      return s.trim();
    }

    function parseArtifactString(txt){
      const str = String(txt||'').trim();
      const m = str.match(/^(\d(?:-\d(?:-\d(?:-\d)?)?)?)\s+(.*)$/);
      if (!m){
        return { pattern:'4-4', values:['',''], tag:'__none__' };
      }
      const pattern = m[1];
      let rest = m[2].trim();

      const knownTags = [BEST_TAG, ...QUICK_TAGS];
      let tag = '__none__';
      for (const t of knownTags){
        if (rest.endsWith(t)){
          tag = t;
          rest = rest.slice(0, -t.length).trim();
          break;
        }
      }

      if (pattern==='8'){
        const eightName = ART_8SET.find(n=>rest.startsWith(n));
        const name = eightName ? eightName : (rest.split('&')[0]||'').trim();
        return { pattern:'8', values:[name||''], tag };
      }

      const parts = rest.split('&').map(s=>s.trim()).filter(Boolean);
      const slots = fieldsForPattern(pattern);
      const values = Array(slots.length).fill('');

      for (const name of parts){
        if (isArmorName(name)){
          const idx = slots.findIndex((t, j)=> t==='armor' && !values[j]);
          if (idx>=0) { values[idx]=name; continue; }
        }
        if (isAccName(name)){
          const idx = slots.findIndex((t, j)=> t==='acce' && !values[j]);
          if (idx>=0) { values[idx]=name; continue; }
        }
        const idx = values.findIndex(v=>!v);
        if (idx>=0) values[idx]=name;
      }

      return { pattern, values, tag };
    }

    const artifactRows = (Array.isArray(content.artifacts)?content.artifacts:[])
      .map(parseArtifactString);

    function renderArtifacts(){
      artifactsWrap.innerHTML = '';

      const rowGrid = (nodes, cols) => {
        const wrap = el('div', { style:`margin-top:6px; display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px; align-items:center;` });
        nodes.forEach(n => n && wrap.append(n));
        return wrap;
      };
      const rowFlexRight = (...nodes) => {
        const w = el('div', { class:'row', style:'justify-content:flex-end; gap:6px; width:100%;' });
        nodes.forEach(n=> w.append(n));
        return w;
      };
      const spacer = () => el('div', { style:'min-height:36px' }, '');

      artifactRows.forEach((row, i) => {
        if (!row || typeof row!=='object') artifactRows[i] = row = { pattern:'4-4', values:['',''], tag:'__none__' };
        if (!PATTERN_OPTIONS.includes(row.pattern)) row.pattern='4-4';
        const slots = fieldsForPattern(row.pattern);
        if (!Array.isArray(row.values)) row.values = [];
        while (row.values.length < slots.length) row.values.push('');
        if (row.values.length > slots.length) row.values.length = slots.length;

        const card = el('div',{class:'card', style:'margin-bottom:8px'});
        card.append(el('div',{class:'font-semibold'}, `Artifact #${i+1}`));

        const patternSel = el('select',{class:'bd-select', disabled:isReadonly},
          ...PATTERN_OPTIONS.map(p => el('option',{value:p}, p))
        );
        patternSel.value = row.pattern;

        const makeArmorSelect = (idx) => {
          const sel = el('select',{class:'bd-select', disabled:isReadonly},
            el('option',{value:''}, '— armor —'),
            ...[...ART_ARMORS, ...ART_8SET].map(x=>el('option',{value:x},x))
          );
          sel.value = row.values[idx] || '';
          sel.addEventListener('change', ()=>{ row.values[idx]=sel.value; syncString(); });
          return sel;
        };
        const makeAccSelect = (idx) => {
          const sel = el('select',{class:'bd-select', disabled:isReadonly},
            el('option',{value:''}, '— accessory —'),
            ...[...ART_ACCESSORY, ...ART_8SET].map(x=>el('option',{value:x},x))
          );
          sel.value = row.values[idx] || '';
          sel.addEventListener('change', ()=>{ row.values[idx]=sel.value; syncString(); });
          return sel;
        };
        const makeEightSelect = () => {
          const sel = el('select',{class:'bd-select', disabled:isReadonly},
            el('option',{value:''}, '— 8set —'),
            ...ART_8SET.map(x=>el('option',{value:x},x))
          );
          sel.value = row.values[0] || '';
          sel.addEventListener('change', ()=>{ row.values[0]=sel.value; syncString(); });
          return sel;
        };

        const TAG_OPTIONS = ['__none__', BEST_TAG, ...QUICK_TAGS];
        const tagSel = el('select',{class:'bd-select', disabled:isReadonly},
          ...TAG_OPTIONS.map(t => el('option',{value:t}, t==='__none__' ? '' : t))
        );
        tagSel.value = row.tag || '__none__';

        const up   = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(artifactRows,i,i-1); renderArtifacts(); syncAll(); }}, '↑');
        const down = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(artifactRows,i,i+1); renderArtifacts(); syncAll(); }}, '↓');
        const del  = el('button',{class:'bd-btn ghost', onClick:()=>{ artifactRows.splice(i,1); renderArtifacts(); syncAll(); }}, 'x');
        const actions = rowFlexRight(up, down, del);

        function syncString(){
          content.artifacts = artifactRows.map(composeArtifact);
          onChange(content);
        }
        function syncAll(){
          row.pattern = patternSel.value;
          row.tag = tagSel.value;
          content.artifacts = artifactRows.map(composeArtifact);
          onChange(content);
        }

        patternSel.addEventListener('change', ()=>{
          row.pattern = patternSel.value;
          const ns = fieldsForPattern(row.pattern);
          const nv = Array(ns.length).fill('');
          for (let k=0;k<Math.min(ns.length, row.values.length);k++) nv[k] = row.values[k];
          row.values = nv;
          renderArtifacts();
          syncString();
        });
        tagSel.addEventListener('change', syncAll);

        if (row.pattern === '4-4') {
          const compact = el('div',{class:'bd-grid-5', style:'margin-top:6px'});
          compact.append(
            patternSel,
            makeArmorSelect(0),
            makeAccSelect(1),
            tagSel,
            actions
          );
          card.append(compact);

        } else if (row.pattern === '8') {
          card.append(rowGrid([
            patternSel,
            makeEightSelect(),
            tagSel,
            actions
          ], 4));

        } else if (row.pattern === '2-2-4') {
          card.append(rowGrid([patternSel], 1));
          card.append(rowGrid([ makeArmorSelect(0), makeAccSelect(2) ], 2));
          card.append(rowGrid([ makeArmorSelect(1), spacer() ], 2));
          card.append(rowGrid([tagSel], 1));
          card.append(rowGrid([actions], 1));

        } else if (row.pattern === '4-2-2') {
          card.append(rowGrid([patternSel], 1));
          card.append(rowGrid([ makeArmorSelect(0), makeAccSelect(1) ], 2));
          card.append(rowGrid([ spacer(), makeAccSelect(2) ], 2));
          card.append(rowGrid([tagSel], 1));
          card.append(rowGrid([actions], 1));

        } else if (row.pattern === '2-2-2-2') {
          card.append(rowGrid([patternSel], 1));
          card.append(rowGrid([ makeArmorSelect(0), makeAccSelect(2) ], 2));
          card.append(rowGrid([ makeArmorSelect(1), makeAccSelect(3) ], 2));
          card.append(rowGrid([tagSel], 1));
          card.append(rowGrid([actions], 1));
        }

        card.append(el('div',{class:'font-semibold', style:'margin-top:6px'}, 'Preview: ', composeArtifact(row)));
        artifactsWrap.append(card);
      });

      if (!isReadonly){
        const addBtn = el('button',{class:'bd-btn', onClick:()=>{
          artifactRows.push({ pattern:'4-4', values:['',''], tag:'__none__' });
          renderArtifacts();
          content.artifacts = artifactRows.map(composeArtifact);
          onChange(content);
        }}, 'Add artifact');
        artifactsWrap.append(el('div',{style:'margin-top:6px'}, addBtn));
      }
    }
    renderArtifacts();

    // --- PRIOR STATS (statsList) ---
    const statsWrap = el('div',{});
    function renderStats(){
      statsWrap.innerHTML='';
      const arr = Array.isArray(content.priorStats?.statsList) ? content.priorStats.statsList : (content.priorStats.statsList = []);
      const rowEl = (i)=>{
        const full = arr[i] || "";
        const labelNow = PRIOR_FULL_TO_LABEL[full] || "";
        const sel = el('select',{class:'bd-select'},
          ...[el('option',{value:''},'— choose stat —'),
             ...PRIOR_STAT_MAP.map(([lab])=>el('option',{value:lab},lab))]
        );
        sel.value = labelNow;
        sel.addEventListener('change', ()=>{
          const lab = sel.value;
          arr[i] = lab ? (PRIOR_LABEL_TO_FULL[lab] || lab) : "";
          if (!lab) { arr.splice(i,1); }
          renderStats(); onChange(content);
        });

        const addBelow = el('button',{class:'bd-btn', onClick:()=>{
          arr.splice(i+1,0,PRIOR_LABEL_TO_FULL["Additional Attack"]);
          renderStats(); onChange(content);
        }}, 'Add');
        const up   = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i-1); renderStats(); onChange(content); }}, '↑');
        const down = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i+1); renderStats(); onChange(content); }}, '↓');
        const del  = el('button',{class:'bd-btn ghost', onClick:()=>{ arr.splice(i,1); renderStats(); onChange(content); }}, 'x');

        return el('div',{class:'row', style:'margin:6px 0'}, sel, addBelow, up, down, del);
      };
      arr.forEach((_,i)=> statsWrap.append(rowEl(i)));
      if (!arr.length) {
        const addFirst = el('button',{class:'bd-btn', onClick:()=>{
          arr.push(PRIOR_LABEL_TO_FULL["Additional Attack"]); renderStats(); onChange(content);
        }}, 'Add first');
        statsWrap.append(addFirst);
      }
    }
    renderStats();

    // --- TARGETS (dropdown key + free text) ---
    const targetsWrap = el('div',{});
    const targetsPairs = Object.entries(content.priorStats?.targets || {});
    function renderTargets(){
      targetsWrap.innerHTML='';
      const arr = targetsPairs;
      const rowUI = (i)=>{
        const [k,v] = arr[i];
        const sel = el('select',{class:'bd-select', disabled:isReadonly},
          ...TARGET_KEYS.map(x=>el('option',{value:x},x))
        );
        sel.value = k;
        const val = el('input',{class:'bd-input', value:v, placeholder:'value (e.g. "7-8K")', readOnly:isReadonly});
        function sync(){
          if (isReadonly) return;
          arr[i] = [sel.value, val.value];
          content.priorStats.targets = Object.fromEntries(arr);
          onChange(content);
        }
        sel.addEventListener('change', sync);
        val.addEventListener('input', sync);
        const add   = !isReadonly ? el('button',{class:'bd-btn', onClick:()=>{ arr.splice(i+1,0,[TARGET_KEYS[0], ""]); renderTargets(); sync(); }}, 'Add') : null;
        const up    = !isReadonly ? el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i-1); renderTargets(); sync(); }}, '↑') : null;
        const down  = !isReadonly ? el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i+1); renderTargets(); sync(); }}, '↓') : null;
        const del   = !isReadonly ? el('button',{class:'bd-btn ghost', onClick:()=>{ arr.splice(i,1); renderTargets(); sync(); }}, 'x') : null;
        return el('div',{class:'row', style:'margin-bottom:6px'}, sel, val, up, down, add, del);
      };
      arr.forEach((_,i)=> targetsWrap.append(rowUI(i)));
      if (!arr.length && !isReadonly){
        const addFirst = el('button',{class:'bd-btn', onClick:()=>{ arr.push([TARGET_KEYS[0], ""]); renderTargets(); content.priorStats.targets=Object.fromEntries(arr); onChange(content); }}, 'Add target');
        targetsWrap.append(addFirst);
      }
    }
    renderTargets();

    // --- WEAPONS ---
    const weaponsWrap = el('div',{});
    function renderWeapons(){
      weaponsWrap.innerHTML='';
      const arr = Array.isArray(content.weapons)?content.weapons: (content.weapons=[]);
      arr.forEach((w,i)=>{
        if (typeof w !== 'object' || !w) content.weapons[i] = w = {name:'', rarity:'SSR'};

        const rareSel = el('select',{class:'bd-select', disabled:isReadonly},
          ...Object.keys(RARITY_LABEL_TO_FULL).map(r=>el('option',{value:r},r))
        );
        rareSel.value = RARITY_FULL_TO_LABEL[w.rarity] || w.rarity || 'SSR';

        const nameNodeSSR = el('input',{class:'bd-input', value:w.name||'', placeholder:'weapon name (SSR free text)', readOnly:isReadonly});
        const nameNodeSR  = el('select',{class:'bd-select', disabled:isReadonly},
          el('option',{value:''}, '— choose SR —'),
          ...SR_LIST.map(x=>el('option',{value:x},x))
        );
        nameNodeSR.value = SR_LIST.includes(w.name) ? w.name : '';

        function applyRaritySync(reRender){
          if (isReadonly) return;
          w.rarity = RARITY_LABEL_TO_FULL[rareSel.value] || rareSel.value;
          const label = (RARITY_FULL_TO_LABEL[w.rarity] || w.rarity);
          if (label === 'SR') w.name = nameNodeSR.value;
          else w.name = nameNodeSSR.value;
          onChange(content);
          if (reRender) renderWeapons();
        }
        rareSel.addEventListener('change', ()=>applyRaritySync(true));
        nameNodeSSR.addEventListener('input', ()=>{ w.name = nameNodeSSR.value; onChange(content); });
        nameNodeSR.addEventListener('change', ()=>{ w.name = nameNodeSR.value; onChange(content); });

        const del = !isReadonly ? el('button',{class:'bd-btn ghost', onClick:()=>{ arr.splice(i,1); renderWeapons(); onChange(content); }}, 'x') : null;

        const currentLabel = RARITY_FULL_TO_LABEL[w.rarity] || w.rarity;
        const nameSlot = (currentLabel === 'SR') ? nameNodeSR : nameNodeSSR;

        weaponsWrap.append(
          el('div',{class:'row', style:'margin:6px 0'},
            nameSlot, rareSel, del
          )
        );
      });

      if (!isReadonly){
        const add = el('button',{class:'bd-btn', onClick:()=>{ (content.weapons||[]).push({name:'', rarity:'SSR'}); renderWeapons(); onChange(content); }}, 'Add weapon');
        weaponsWrap.append(el('div',{style:'margin-top:6px'}, add));
      }
    }
    renderWeapons();

    // --- CORES: mainStats ---
    const coreMainWrap = el('div',{class:'bd-grid-3'});
    ["Mind","Body","Spirit"].forEach(part=>{
      const sel = el('select',{class:'bd-select', disabled:isReadonly},
        el('option',{value:''}, `— ${part} —`),
        ...CORE_MAIN_LABELS[part].map(label => el('option',{value:label}, label))
      );
      const savedFull = content.cores?.mainStats?.[part] || '';
      const initLabel = PRIOR_FULL_TO_LABEL[savedFull] || savedFull || '';
      sel.value = initLabel;
      sel.addEventListener('change', ()=>{
        if (isReadonly) return;
        const label = sel.value;
        content.cores.mainStats[part] = PRIOR_LABEL_TO_FULL[label] || label;
        onChange(content);
      });
      coreMainWrap.append(
        el('div',{class:'bd-panel bd-core-card'},
          el('div',{class:'small'}, part),
          sel
        )
      );
    });

    // --- CORES: passives ---
    const corePassWrap = el('div',{});
    function safeSplitPassives(v){
      if (Array.isArray(v)) {
        return v
          .filter(x => typeof x === 'string')
          .map(x => x.trim())
          .filter(x => x && x.toLowerCase() !== 'null');
      }
      if (typeof v === 'string') {
        return v
          .split(',')
          .map(s => s.trim())
          .filter(s => s && s.toLowerCase() !== 'null');
      }
      return [];
    }
    const passStore = {
      Mind:   safeSplitPassives(content.cores?.passives?.Mind),
      Body:   safeSplitPassives(content.cores?.passives?.Body),
      Spirit: safeSplitPassives(content.cores?.passives?.Spirit)
    };
    function renderPassives(){
      corePassWrap.innerHTML='';
      ["Mind","Body","Spirit"].forEach(part=>{
        const group = el('div',{class:'bd-panel', style:'margin-bottom:8px'});
        group.append(el('div',{class:'font-semibold'}, `CORES — ${part}`));
        let rows = passStore[part] || [];
        rows = rows
          .filter(x => typeof x === 'string')
          .map(x => x.trim())
          .filter(x => x && x.toLowerCase() !== 'null' && CORE_PASSIVES_FULL.includes(x));
        passStore[part] = rows;
        const rowUI = (i)=>{
          const full = rows[i];
          const lab  = CORE_LABEL(full);
          const img = el('img',{ class:'core-img', src: CORE_IMG[lab]||'', alt: lab });
          const sel = el('select',{class:'bd-select'},
            el('option',{value:''},'— choose core —'),
            ...CORE_BY_GROUP[part].map(f => el('option',{value:f}, CORE_LABEL(f)))
          );
          sel.value = CORE_PASSIVES_FULL.includes(full) ? full : '';
          sel.addEventListener('change', ()=>{
            const v = sel.value;
            if (!v) { rows.splice(i,1); sync(); return; }
            rows[i] = v; sync();
          });
          const addBelow = el('button',{class:'bd-btn', onClick:()=>{ rows.splice(i+1,0, CORE_BY_GROUP[part][0]); sync(); }}, 'Add');
          const up   = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(rows,i,i-1); sync(); }}, '↑');
          const down = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(rows,i,i+1); sync(); }}, '↓');
          const del  = el('button',{class:'bd-btn ghost', onClick:()=>{ rows.splice(i,1); sync(); }}, 'x');
          return el('div',{class:'row', style:'margin:6px 0'}, img, sel, addBelow, up, down, del);
        };
        const list = el('div',{});
        rows.forEach((_,i)=> list.append(rowUI(i)));
        const addFirst = el('button',{class:'bd-btn', onClick:()=>{ rows.push(CORE_BY_GROUP[part][0]); sync(); }}, 'Add first');
        function sync(){
          const clean = rows
            .filter(x => typeof x === 'string' && x.trim() && x.trim().toLowerCase() !== 'null')
            .filter(x => CORE_PASSIVES_FULL.includes(x));
          passStore[part] = clean;
          content.cores.passives[part] = clean.join(', ');
          onChange(content);
          renderPassives();
        }
        appendSafe(group, list, (!rows.length ? addFirst : null));
        corePassWrap.append(group);
      });
    }
    renderPassives();

    // --- Priority Skills (ordered) ---
    const prioWrap = el('div',{});
    function renderPriority(){
      prioWrap.innerHTML='';
      const arr = Array.isArray(content.prioritySkillsUpgrade) ? content.prioritySkillsUpgrade : (content.prioritySkillsUpgrade = []);
      const rowUI = (i)=>{
        const sel = el('select',{class:'bd-select'},
          el('option',{value:''},'— choose skill —'),
          ...PRIORITY_SKILLS.map(x=>el('option',{value:x},x))
        );
        sel.value = arr[i] || '';
        sel.addEventListener('change', ()=>{
          const v = sel.value;
          if (!v) { arr.splice(i,1); renderPriority(); onChange(content); return; }
          arr[i] = v; renderPriority(); onChange(content);
        });
        const addBelow = el('button',{class:'bd-btn', onClick:()=>{ arr.splice(i+1,0,PRIORITY_SKILLS[0]); renderPriority(); onChange(content); }}, 'Add');
        const up   = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i-1); renderPriority(); onChange(content); }}, '↑');
        const down = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(arr,i,i+1); renderPriority(); onChange(content); }}, '↓');
        const del  = el('button',{class:'bd-btn ghost', onClick:()=>{ arr.splice(i,1); renderPriority(); onChange(content); }}, 'x');
        return el('div',{class:'row', style:'margin:6px 0'}, sel, addBelow, up, down, del);
      };
      if (!arr.length){
        const addFirst = el('button',{class:'bd-btn', onClick:()=>{ arr.push(PRIORITY_SKILLS[0]); renderPriority(); onChange(content); }}, 'Add first');
        prioWrap.append(addFirst);
      } else {
        arr.forEach((_,i)=> prioWrap.append(rowUI(i)));
      }
    }
    renderPriority();

    const testingSel = el('select',{class:'bd-select', disabled:isReadonly}, ...TESTING.map(s=>el('option',{value:s},s)));
    testingSel.value = content.Testing || 'new';
    testingSel.addEventListener('change', ()=>{ if (isReadonly) return; content.Testing = testingSel.value; onChange(content); });

    titleInp.addEventListener('input', ()=>{ if(isReadonly) return; content.title = titleInp.value; onChange(content); });
    fileNameInp.addEventListener('input', ()=>{});

    const node = el('div', {});
    node.append(
      section(`Build: ${displayBuildName(filename) || '(new)'}`,
        el('div',{class:'bd-grid', style:'margin-top:8px'},
          el('div',{}, el('div',{class:'small'}, 'Build name'), fileNameInp),
          el('div',{}, el('div',{class:'small'}, 'Title'), titleInp)
        )
      ),
      section('Image',
        el('div',{}, el('div',{class:'small'}, 'Image link'), imgInp),
        el('div',{class:'small', style:'margin:6px 0'}, 'Preview'),
        imgPrev
      ),
      section('Role',
        el('div',{class:'bd-grid', style:'margin-top:8px'},
          el('div',{}, roleSel)
        )
      ),
      section('Artifacts', artifactsToolbar, artifactsWrap),
      section('PRIOR STATS - statsList', statsWrap),
      section('PRIOR STATS - targets', targetsWrap),
      section('Weapons', weaponsWrap),
      section('Cores - mainStats', coreMainWrap),
      section('Cores', corePassWrap),
      section('Priority Skills (ordered)', prioWrap),
      section('Testing', testingSel)
    );

    node.getDesiredFilename = function(){
      return buildFilenameFromName(fileNameInp.value);
    };

    if (!isReadonly) {
      const ctrls = node.querySelectorAll('input, select, textarea, button');
      ctrls.forEach(ctrl => {
        ctrl.removeAttribute('disabled');
        ctrl.removeAttribute('readonly');
        if ('disabled' in ctrl) ctrl.disabled = false;
        if ('readOnly' in ctrl) ctrl.readOnly = false;
      });
    }

    return node;
  }

  // ---------- Gems editor ----------
  function buildGemsEditor(content, onChange){
    const obj = Object.assign({ items:[] }, content||{});
    const itemsWrap = el('div', {});

    function gemKeyFromName(name) {
      const n = String(name || '').toUpperCase();
      if (n.startsWith('RED'))    return 'RED';
      if (n.startsWith('BLUE'))   return 'BLUE';
      if (n.startsWith('YELLOW')) return 'YELLOW';
      if (n.startsWith('PURPLE')) return 'PURPLE';
      if (n.startsWith('GREEN'))  return 'GREEN';
      return null;
    }
    const GEM_STAT_OPTIONS = {
      RED:    ["Attack %", "Additional Attack", "Healing Given Increasing"],
      BLUE:   ["Additional HP", "HP %", "Healing Received Increasing"],
      YELLOW: ["Precision", "Critical Hit Damage", "Defense Penetration"],
      PURPLE: ["Speed", "Additional Mana Power", "MP Consumption Reduction"],
      GREEN:  ["Defense %", "Additional Defense", "Damage Reduction"]
    };

    function splitStatToBaseNote(value, opts) {
      const v = String(value || '').trim();
      if (!v) return { base:'', note:'' };
      const options = Array.isArray(opts) ? opts : [];
      for (const o of options) {
        if (v === o) return { base:o, note:'' };
        if (v.startsWith(o + ' ')) return { base:o, note: v.slice(o.length + 1).trim() };
      }
      return { base:'', note:v };
    }
    function joinBaseNote(base, note) {
      const b = String(base || '').trim();
      const n = String(note || '').trim();
      if (b && n) return `${b} ${n}`;
      return b || n;
    }

    function renderOneItemCard(it){
      const colorKey = gemKeyFromName(it.name);
      const options  = GEM_STAT_OPTIONS[colorKey] || [];
      const card     = el('div',{class:'bd-panel', style:'margin-bottom:8px'});

      card.append(el('div',{class:'font-semibold'}, `${colorKey || 'GEM'}`));

      const makeStatRow = (fieldKey, label) => {
        const row = el('div', { style:'margin-top:8px' });
        const current = splitStatToBaseNote(it[fieldKey], options);
        const sel = el('select',{class:'bd-select'},
          el('option',{value:''}, ''),
          ...options.map(o => el('option',{value:o}, o))
        );
        sel.value = current.base || '';
        const note = el('input',{class:'bd-input', placeholder:'opcjonalnie (np. "8 Slot")', value: current.note || ''});
        function sync(){ it[fieldKey] = joinBaseNote(sel.value, note.value); onChange(obj); }
        sel.addEventListener('change', sync);
        note.addEventListener('input', sync);
        const removeBtn = (fieldKey !== 'stat')
          ? el('button', { class:'bd-btn ghost', onClick: () => { delete it[fieldKey]; renderItems(); onChange(obj); } }, 'Remove '+label)
          : null;
        appendSafe(row,
          el('div',{class:'font-semibold'}, label),
          el('div',{class:'bd-grid', style:'margin-top:6px'}, sel, note),
          removeBtn
        );
        return row;
      };

      const stat1 = makeStatRow('stat',  'stat');
      const stat2 = (typeof it.stat2 !== 'undefined') ? makeStatRow('stat2', 'stat2') : null;
      const stat3 = (typeof it.stat3 !== 'undefined') ? makeStatRow('stat3', 'stat3') : null;

      const addMoreWrap = el('div', { style:'margin-top:8px' });
      const canAdd2 = (typeof it.stat2 === 'undefined');
      const canAdd3 = (!canAdd2 && typeof it.stat3 === 'undefined');
      if (canAdd2 || canAdd3) {
        const addBtn = el('button',{class:'bd-btn', onClick:()=>{
          if (typeof it.stat2 === 'undefined') it.stat2 = '';
          else if (typeof it.stat3 === 'undefined') it.stat3 = '';
          renderItems(); onChange(obj);
        }}, 'Add another stat');
        addMoreWrap.append(addBtn);
      }

      card.append(stat1);
      if (stat2) card.append(stat2);
      if (stat3) card.append(stat3);
      card.append(addMoreWrap);
      return card;
    }

    function renderItems(){
      itemsWrap.innerHTML = '';
      (obj.items||[]).forEach((it)=> itemsWrap.append(renderOneItemCard(it)));
    }
    renderItems();

    return el('div',{class:'bd-panel'},
      el('div',{class:'font-semibold'},'GEMS'),
      el('div',{style:'margin-top:8px'}, itemsWrap)
    );
  }

  // ---------- Hunter list editor ----------
  function buildHunterEditor(content, onChange){
    const obj = Object.assign({ fire:[], water:[], wind:[], light:[], dark:[] }, content||{});
    const wrap = el('div',{});

    function renderGroup(key){
      const group = el('div',{class:'bd-panel', style:'margin-bottom:8px'});
      group.append(el('div',{class:'font-semibold'}, key.toUpperCase()));

      const list = el('div',{class:'bd-list', style:'display:block;margin-top:6px'});
      (obj[key]||[]).forEach((name,i)=>{
        const row = el('div',{class:'row', style:'margin:6px 0'});
        const inp = el('input',{class:'bd-input', value:name, style:'flex:1'});

        const up   = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(obj[key], i, i-1); rerender(); onChange(obj); }}, '↑');
        const down = el('button',{class:'bd-btn', onClick:()=>{ moveInArray(obj[key], i, i+1); rerender(); onChange(obj); }}, '↓');
        const addBelow = el('button',{class:'bd-btn', onClick:()=>{ obj[key].splice(i+1,0,''); rerender(); onChange(obj); }}, 'Add');
        const del  = el('button',{class:'bd-btn ghost', onClick:()=>{ obj[key].splice(i,1); rerender(); onChange(obj); }}, 'x');

        inp.addEventListener('input', ()=>{ obj[key][i] = inp.value; onChange(obj); });

        row.append(inp, up, down, addBelow, del);
        list.append(row);
      });

      const saveCat = el('button',{
        class:'bd-btn ghost', style:'margin-left:8px',
        onClick: async ()=>{
          try{
            await saveBuild('hunter.json', obj);
            toast('Saved ✓');
          }catch(e){ toast('Save failed: '+e.message); }
        }
      }, 'Save (category)');

      group.append(list, el('div',{class:'row', style:'margin-top:6px'}, saveCat));
      return group;
    }

    function rerender(){
      wrap.innerHTML = '';
      wrap.append(
        renderGroup('fire'),
        renderGroup('water'),
        renderGroup('wind'),
        renderGroup('light'),
        renderGroup('dark')
      );
    }
    rerender();
    return el('div',{}, wrap);
  }

  // ---------- Render page ----------
  let __RENDER_LOCK = false;

  async function renderBuildsPage(host){
    if (__RENDER_LOCK) return;
    __RENDER_LOCK = true;

    try{
      if (!host) host = document.getElementById('content');
      host.innerHTML = '';
      toTop();

      const main = el('div',{style:'margin-top:8px'});

      async function saveCurrentFile(){
        if (S.buildTab !== 'files') { toast('Open "Builds (files)" tab'); return; }
        if (!CURRENT_FILE) { toast('Pick a file first'); return; }

        const fileObj = FILES.find(f=>f.filename===CURRENT_FILE);
        const content = S.currentContent || fileObj?.content || {};

        const desired = S._buildsEditor?.getDesiredFilename?.();
        if (desired && desired !== CURRENT_FILE){
          await saveBuild(desired, content);
          toast('Saved as ✓');
          await fetchBuilds();
          CURRENT_FILE = desired;
          await rerender();
          return;
        }

        await saveBuild(CURRENT_FILE, content);
        toast('Saved ✓');
        await fetchBuilds();
        await rerender();
      }

      function updateTopSaveFileBtn(){
        const btn = S._topSaveFileBtn;
        if (!btn) return;

        const enabled = CAN_EDIT() && (S.buildTab === 'files') && !!CURRENT_FILE;
        btn.disabled = !enabled;
        if (enabled) btn.removeAttribute('disabled');
        else btn.setAttribute('disabled','');
      }

      const topSaveFileBtn = CAN_EDIT()
        ? el('button', {
            class:'bd-btn primary',
            onClick: async ()=>{
              try{ await saveCurrentFile(); }
              catch(e){ toast('Save failed: ' + e.message); }
            }
          }, 'Save file')
        : null;

      S._topSaveFileBtn = topSaveFileBtn;

      const header = el('div',{class:'bd-head mb-4'},
        el('div',{class:'min-w-0'},
          el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Builds editor'),
          el('div', { class: 'text-sm text-slate-300/90' }, CAN_EDIT() ? 'Admin mode: edit & save to DB' : 'Read-only mode')
        ),
        el('div',{class:'bd-toolbar'},
          topSaveFileBtn,
          CAN_EDIT()
            ? el('button',{
                class:'bd-btn primary',
                onClick: async ()=>{
                  try{ await saveAll(); toast('Saved ✓'); }
                  catch(e){ toast('Save failed: ' + e.message); }
                }
              }, 'Save All')
            : null,
          el('button',{
            class:'bd-btn ghost',
            onClick: async ()=>{
              await fetchBuilds();
              await rerender();
              toast('Reloaded');
            }
          }, 'Reload')
        )
      );

      async function onFileChange(filename){
        if (!filename) {
          CURRENT_FILE = null;
          S.currentContent = null;
          S._buildsEditor = null;
          toTop();
          await rerender();
          return;
        }
        CURRENT_FILE = filename;
        const cached = FILES.find(f=>f.filename===filename);
        let content = cached?.content || null;
        if(!content) content = await loadFileContent(filename) || {};
        S.currentContent = content;
        toTop();
        await rerender();
      }

      async function onNewFile(){
        let name = prompt('Build name:');
        if(!name) return;
        name = buildFilenameFromName(name);
        if (!name) { toast('Build name is required'); return; }

        const template = {
          title:"", imgLink:"", role:[],
          artifacts:[],
          priorStats:{ statsList:[], targets:{} },
          weapons:[],
          cores:{ mainStats:{ Mind:"", Body:"", Spirit:"" }, passives:{ Mind:"", Body:"", Spirit:"" } },
          prioritySkillsUpgrade:[], Testing:"new"
        };

        FILES.unshift({ filename:name, content:template });
        CURRENT_FILE = name;
        S.currentContent = template;

        try {
          if (CAN_EDIT()){
            await saveBuild(name, template);
            await fetchBuilds();
          }
        } catch(e){ toast('Auto-save failed: '+e.message); }

        await rerender();
      }

      async function onDeleteFile(filename){
        if(!filename){ toast('Choose file to delete'); return; }
        if(!confirm(`Delete build ${displayBuildName(filename)}?`)) return;
        try{
          await deleteBuildFile(filename);
          FILES = FILES.filter(f=>f.filename!==filename);
          CURRENT_FILE = null;
          S.currentContent = null;
          S._buildsEditor = null;
          await rerender();
          toast('Deleted ✓');
        }catch(e){ toast('Delete failed: '+e.message); }
      }

      async function rerender(){
        updateTopSaveFileBtn();
        main.innerHTML = '';

        const tabs = el('div',{class:'bd-list bd-tabs'},
          ...[
            ['files','Builds (files)'],
            ['gems','Gems'],
            ['hunters','Hunter list'],
            ['dicts','Admin']
          ].map(([id,label])=>{
            const active = (S.buildTab === id);
            const cls = 'bd-btn' + (active ? ' active' : '');
            return el('button',{
              class: cls,
              onClick:()=>{ S.buildTab = id; toTop(); rerender(); }
            }, label);
          })
        );

        appendSafe(main, tabs);

        if (S.buildTab === 'files'){
          await ensureDictsFresh();
          appendSafe(main, buildTopControls(onFileChange, onNewFile, onDeleteFile, CURRENT_FILE));

          const editorWrap = el('div',{style:'margin-top:8px'});
          if (!CURRENT_FILE){
            S._buildsEditor = null;
            appendSafe(editorWrap, el('div',{class:'bd-panel'}, 'Pick a file on the left or create a new one.'));
          } else {
            let fileObj = FILES.find(f=>f.filename===CURRENT_FILE);
            let content = fileObj?.content || S.currentContent || {};
            const editor = buildEditor(CURRENT_FILE, content, (updated)=>{
              if (fileObj) fileObj.content = updated;
              else FILES = FILES.map(f=>f.filename===CURRENT_FILE ? {filename:CURRENT_FILE, content:updated} : f);
              S.currentContent = updated;
            }, !CAN_EDIT());

            S._buildsEditor = editor;

            const btnRow = el('div',{class:'row', style:'margin-top:8px'});
            if (CAN_EDIT()) {
              const saveBtn = el('button',{class:'bd-btn primary', onClick: async ()=>{
                try{
                  const desired = editor.getDesiredFilename?.();
                  let targetName = CURRENT_FILE;
                  if (desired && desired !== CURRENT_FILE){
                    await saveBuild(desired, S.currentContent || content);
                    toast('Saved as ✓');
                    await fetchBuilds();
                    CURRENT_FILE = desired;
                    await rerender();
                    return;
                  }
                  await saveBuild(targetName, S.currentContent || content);
                  toast('Saved ✓');
                  await fetchBuilds();
                  await rerender();
                }catch(e){ toast('Save failed: '+e.message); }
              }}, 'Save file');

              const saveAsBtn = el('button',{class:'bd-btn ghost', onClick: async ()=>{
                let newName = prompt('Save as:', displayBuildName(CURRENT_FILE));
                if(!newName) return;
                newName = buildFilenameFromName(newName);
                if (!newName) { toast('Build name is required'); return; }
                try{
                  await saveBuild(newName, S.currentContent || content);
                  toast('Saved as ✓');
                  await fetchBuilds();
                  CURRENT_FILE = newName;
                  await rerender();
                }catch(e){ toast('Save failed: '+e.message); }
              }}, 'Save as...');
              appendSafe(btnRow, saveBtn, saveAsBtn);
            }

            appendSafe(editorWrap, editor, btnRow);
          }
          appendSafe(main, editorWrap);
        }

        else if (S.buildTab === 'gems'){
          S._buildsEditor = null;

          if (!S.gemsContent) {
            const g = await fetchGems();
            S.gemsContent = g || { title:'GEMS', imgLink:'', items:[] };
          }
          const editor = buildGemsEditor(S.gemsContent, (updated)=>{ S.gemsContent = updated; });

          const row = el('div',{style:'margin-top:8px'});
          if (CAN_EDIT()) {
            const saveBtn = el('button',{class:'bd-btn primary', onClick: async ()=>{
              try{
                await saveBuild('Gems/gems.json', S.gemsContent);
                toast('Gems saved ✓');
              }catch(e){ toast('Save failed: '+e.message); }
            }}, 'Save Gems');
            appendSafe(row, saveBtn);
          }
          appendSafe(main, el('div',{style:'margin-top:8px'}, editor, row));
        }

        else if (S.buildTab === 'hunters'){
          S._buildsEditor = null;

          if (!S.hunterContent) {
            const h = await fetchHunterlist();
            S.hunterContent = h || { fire:[], water:[], wind:[], light:[], dark:[] };
          }
          const editor = buildHunterEditor(S.hunterContent, (updated)=>{ S.hunterContent = updated; });

          const row = el('div',{style:'margin-top:8px'});
          if (CAN_EDIT()) {
            const saveBtn = el('button',{class:'bd-btn primary', onClick: async ()=>{
              try{
                await saveBuild('hunter.json', S.hunterContent);
                toast('Hunter saved ✓');
              }catch(e){ toast('Save failed: '+e.message); }
            }}, 'Save Hunter list');
            appendSafe(row, saveBtn);
          }
          appendSafe(main, el('div',{style:'margin-top:8px'}, editor, row));
        }

        else if (S.buildTab === 'dicts'){
          S._buildsEditor = null;
          const editor = buildDictionariesEditor();
          appendSafe(main, el('div',{style:'margin-top:8px'}, editor));
        }

        updateTopSaveFileBtn();
      }

      await rerender();
      appendSafe(host, el('div',{class:'bd-wrap'}, header, main));
    } finally {
      __RENDER_LOCK = false;
    }
  }

  // ---------- Save all ----------
  async function saveAll(){
    for (const f of FILES){
      if (!f.filename) continue;
      await saveBuild(f.filename, f.content || {});
    }
    if (S.gemsContent)   await saveBuild('Gems/gems.json', S.gemsContent);
    if (S.hunterContent) await saveBuild('hunter.json', S.hunterContent);
  }

  // ---------- Hook into app.js renderer (FIXED: no duplicates) ----------
  const _renderContent = window.renderContent;
  window.renderContent = async function(){
    if (S.tab === 'builds'){
      window.renderFilters?.();
      if (!FILES.length) await fetchBuilds();
      toTop();
      await renderBuildsPage();
      return;
    }
    return _renderContent?.();
  };

  (async ()=>{ IS_ADMIN = await isAdmin(); })();

  window.__builds_loaded = true;
  window.__builds_mount = async ()=>{
    S.tab = 'builds';
    toTop();
    window.renderFilters?.();
    IS_ADMIN = await isAdmin();
    await fetchBuilds();
    await ensureDictsFresh();
    await renderBuildsPage();
    window.renderTopbar?.();
  };

  window.__builds_public_mount = window.__builds_mount;

})();
