/* /public/events.js — Events editor (flat UI, month-compatible storage)
   - Editable name & description
   - Single image preview (next to link field)
   - TRUE dropdown combobox with search (overlay panel with groups)
   - hunter_* uses hunter_event preset (link-only)
   - *_upcoming special rules as requested
   - SAVE FIX: always store link as string; times always YYYY-MM-DDTHH:MM:SS
   - Admin tab: preset editor (buttons only)
   - Groups: one card per group; after “+ Add variant to …” the card ends and next starts
*/
(function () {
  // ────────────────────────────────────────────────────────────────────────────
  // Globals / helpers from app.js (fallbacks if missing)
  const S  = window.STATE || (window.STATE = {});
  const el = window.el || ((t, a = {}, ...c) => {
    const n = document.createElement(t);
    for (const [k, v] of Object.entries(a)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const k of c) n.append(k);
    return n;
  });
  const url = window.url || ((p)=>p);
  // Globalny helper przewijania do góry (korzysta z index.html BackToTop)
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


  // ────────────────────────────────────────────────────────────────────────────
  // CSS
 (function injectCSS(){
   if (document.getElementById('events-css')) return;
   const s = document.createElement('style');
   s.id = 'events-css';
   s.textContent = `
     /* layout */
     .ev-wrap{width:100%;margin:0 auto;padding:24px 12px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px}
     @media (min-width:640px){.ev-wrap{padding-left:24px;padding-right:24px}}
     .ev-head{display:flex;align-items:center;gap:8px;justify-content:space-between}
     .ev-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
     .ev-fields .full{grid-column:1/-1}
     @media (max-width:980px){.ev-fields{grid-template-columns:1fr}}

     /* card */
     .ev-card{
       width:100%;
       border:1px solid #cbd5e1;
       border-radius:16px;
       padding:12px;
       background:#ffffff;
       color:#0f172a;
     }
     .dark .ev-card{
       background:rgba(30,41,59,0.6);
       border-color:#334155;
       color:#e2e8f0;
     }

     /* panels (no nested cards inside) */
     .ev-panel{border:1px dashed #cbd5e1;border-radius:12px;padding:10px}
     .dark .ev-panel{border-color:#334155}
     .ev-panel + .ev-panel{margin-top:10px}

     /* inputs/textarea */
     .ev-input,.ev-text,.ev-filter{
       width:100%;
       border:1px solid #cbd5e1;
       border-radius:12px;
       background:#ffffff;
       color:#0f172a;
       padding:10px;
       outline:none;
     }
     .dark .ev-input,.dark .ev-text,.dark .ev-filter{
       background:#1f2937;
       border-color:#334155;
       color:#e5e7eb;
     }

     .ev-input,.ev-filter{height:40px}

     .ev-text{ min-height:120px; resize:vertical; overflow:hidden; }

     /* buttons (shared: active=yellow, inactive=glass) */
     .ev-btn,.ev-mini{
       border:1px solid rgba(148,163,184,0.45); /* slate-400/45 */
       background:rgba(15,23,42,0.04);         /* light glass */
       color:#0f172a;
       cursor:pointer;
       transition:background .15s ease,color .15s ease,opacity .15s ease,border-color .15s ease,box-shadow .15s ease;
       outline:none;
     }
     .ev-btn{height:40px;padding:0 14px;border-radius:12px;font-size:16px;line-height:1}
     .ev-mini{height:36px;padding:0 12px;border-radius:10px;font-size:14px;line-height:1}

     .ev-btn:hover,.ev-mini:hover{background:rgba(15,23,42,0.06)}
     .dark .ev-btn,.dark .ev-mini{
       background:rgba(30,41,59,0.55);         /* bg-glass */
       border-color:rgba(148,163,184,0.28);    /* slate-400/28 */
       color:#e2e8f0;                          /* text-slate-200 */
     }
     .dark .ev-btn:hover,.dark .ev-mini:hover{background:rgba(51,65,85,0.65)} /* hover:bg-white/10 vibe */

     /* focus ring */
     .ev-btn:focus-visible,.ev-mini:focus-visible{
       box-shadow:0 0 0 2px rgba(250,204,21,0.35); /* ring-yellow-400/35 */
       border-color:rgba(250,204,21,0.45);
     }

     /* disabled */
     .ev-btn:disabled,.ev-mini:disabled{
       opacity:.5;
       cursor:not-allowed;
     }

     /* active / primary */
     .ev-btn.active,.ev-mini.active,.ev-btn.primary{
       background:rgb(250,204,21); /* yellow-400 */
       color:#0f172a;
       border-color:rgba(250,204,21,0.85);
       font-weight:700;
     }
     .ev-btn.active:hover,.ev-mini.active:hover,.ev-btn.primary:hover{background:rgb(234,179,8)} /* yellow-500 */

     .ev-btn.ghost{opacity:.9}

     .ev-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
     .ev-sub{opacity:.8;font-size:12px}
     .ev-img{max-width:260px;border-radius:10px;border:1px solid #cbd5e1}
     .dark .ev-img{border-color:#334155}

     /* combobox overlay */
     .ev-combo{position:relative}
     .ev-dd{
       position:absolute;left:0;right:0;z-index:60;margin-top:6px;
       max-height:260px;overflow:auto;display:none;
       border:1px solid #cbd5e1;border-radius:12px;
       background:#ffffff;box-shadow:0 10px 24px rgba(0,0,0,.1);
     }
     .dark .ev-dd{background:#1f2937;border-color:#334155;box-shadow:0 10px 24px rgba(0,0,0,.4)}
     .ev-dd.open{display:block}
     .ev-dd-group{
       position:sticky;top:0;padding:6px 10px;font-weight:700;
       background:#ffffff;color:#475569;
     }
     .dark .ev-dd-group{background:#1f2937;color:rgba(250,204,21,0.9)}
     .ev-dd-item{padding:8px 10px;cursor:pointer}
     .ev-dd-item:hover{background:#f1f5f9}
     .dark .ev-dd-item:hover{background:#334155}
     .ev-dd-empty{padding:10px;color:#94a3b8}

     /* time buttons row */
     .ev-btnrow{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}

     /* tabs (Editor/Admin) */
     .ev-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}

     /* stack spacing */
     .ev-stack{display:flex;flex-direction:column;gap:10px}

     /* full-width CTA */
     .ev-fullbtn{width:100%}

     /* segmented file buttons (above cards) */
     .ev-seg{display:flex;gap:6px;flex-wrap:wrap}

     /* page footer */
     .ev-footer{margin-top:8px}
   `;
   document.head.appendChild(s);
 })();


  // ────────────────────────────────────────────────────────────────────────────
  // State
  let IS_ADMIN = false;
  let EVENTS = { events: [] };              // { events: [ {month, events:[...]}, ...] }
  const PRESETS = Object.create(null);      // cache for event preset API
  S.eventsTab = S.eventsTab || 'editor';    // 'editor' | 'admin'
  const EVENT_SUBPRESETS = ['web','repetitive','normal','special'];
  const ADMIN_MAIN_GROUPS = ['events','hunter_event','guild_boss','unstable_dungeon','power_of_calamity','mind_rift'];
  const ADMIN_FILES = [...EVENT_SUBPRESETS,'hunter_event','guild_boss','unstable_dungeon','power_of_calamity','mind_rift'];
  const PRESET_LABELS = {
    events: 'Events',
    web: 'Web Event',
    repetitive: 'Repetitive Event',
    normal: 'Normal Event',
    special: 'Special Event',
    hunter_event: 'Hunter Event',
    guild_boss: 'Guild Boss',
    unstable_dungeon: 'Unstable Dungeon',
    power_of_calamity: 'Power of Calamity',
    mind_rift: 'Mind Rift'
  };
  S.presetFile = S.presetFile || 'web';
  if (!ADMIN_FILES.includes(S.presetFile)) S.presetFile = 'web';
  S.presetMainGroup = S.presetMainGroup || (EVENT_SUBPRESETS.includes(S.presetFile) ? 'events' : S.presetFile);
  if (!ADMIN_MAIN_GROUPS.includes(S.presetMainGroup)) S.presetMainGroup = 'events';
  S.guildBossKey = S.guildBossKey || '';
  S.showEmptyGuildBosses = !!S.showEmptyGuildBosses;

  // ────────────────────────────────────────────────────────────────────────────
  // API
  async function isAdmin(){
    try{
      const r = await fetch(url('/api/admin/is-admin'), {credentials:'include', cache:'no-store'});
      const j = await r.json(); return !!j?.isAdmin;
    }catch{ return false; }
  }
  async function fetchEvents(){
    try{
      const j = await fetch(url('/api/events'), {cache:'no-store'}).then(r=>r.json());
      EVENTS = (j && Array.isArray(j.events)) ? j : { events: [] };
      // Normalize on load
      for (const blk of (EVENTS.events||[])){
        for (const ev of (blk.events||[])){
          if (Array.isArray(ev.link)) ev.link = ev.link[0] || '';
          if (ev.link==null) ev.link='';
          if (ev.name==null) ev.name='';
          if (ev.description==null) ev.description='';
          if (typeof ev.description === 'string') {
            ev.description = ev.description.replace(/\\n/g, '\n');
          }
          const canon = canonicalNameFor(ev.id);
          if (canon) ev.name = canon;
        }
      }
    }catch{ EVENTS = { events: [] }; }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Admin: helpers for newline encoding/decoding
  const decodeNL = s => String(s ?? '').replace(/\\n/g, '\n');
  const encodeNL = s => String(s ?? '').replace(/\r\n/g, '\n').replace(/\n/g, '\\n');
  const slugify = s => String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  function syncActivePresetFromMainGroup(){
    if (S.presetMainGroup === 'events') {
      if (!EVENT_SUBPRESETS.includes(S.presetFile)) S.presetFile = 'web';
      return;
    }
    S.presetFile = S.presetMainGroup;
  }

  function hasGuildBossVariants(boss){
    return Array.isArray(boss?.variants) && boss.variants.length > 0;
  }

  function visibleGuildBosses(data){
    const bosses = Array.isArray(data) ? data : [];
    return S.showEmptyGuildBosses ? bosses : bosses.filter(hasGuildBossVariants);
  }

  function pickFallbackGuildBoss(data){
    const bosses = Array.isArray(data) ? data : [];
    return bosses.find(hasGuildBossVariants) || bosses[0] || null;
  }

  function ensureActiveGuildBoss(data){
    const bosses = Array.isArray(data) ? data : [];
    if (!bosses.length) {
      S.guildBossKey = '';
      return null;
    }

    const candidates = visibleGuildBosses(bosses);
    let boss = candidates.find(b => String(b?.key || '') === String(S.guildBossKey || ''));
    if (!boss) {
      boss = candidates[0] || pickFallbackGuildBoss(bosses);
      S.guildBossKey = String(boss?.key || '');
    }
    return boss;
  }

  // Admin: load & save presets
  async function loadPresetFile(file){
    if (PRESETS[file]) return PRESETS[file];
    try{
      const r = await fetch(url(`/api/events/presets/${encodeURIComponent(file)}`), {cache:'no-store'});
      const j = r.ok ? await r.json() : {};
      const data = Array.isArray(j?.data) ? j.data : [];
      PRESETS[file] = data;
    }catch{ PRESETS[file] = []; }
    return PRESETS[file];
  }

  // Encode descriptions (\n -> \\n) deep before save
  function encodeDescriptionsDeep(data){
    const walk = (node)=>{
      if (Array.isArray(node)){
        node.forEach(walk);
      }else if (node && typeof node === 'object'){
        if (typeof node.description === 'string'){
          node.description = encodeNL(node.description);
        }
        for (const k in node){
          if (Array.isArray(node[k])) walk(node[k]);
        }
      }
    };
    const clone = JSON.parse(JSON.stringify(data ?? []));
    walk(clone);
    return clone;
  }

  async function savePresetFile(file, data){
    try{
      const payload = encodeDescriptionsDeep(data);
      const res = await fetch(url('/api/admin/events/presets'),{
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ file, data: payload })
      });
      if(!res.ok){
        const j = await res.json().catch(()=>({}));
        throw new Error(j?.error || `Save failed (${res.status})`);
      }
      PRESETS[file] = data; // decoded in-memory
      return await res.json();
    }catch(e){
      toast('Save preset failed: ' + e.message);
      throw e;
    }
  }

  async function saveAllPresets(){
    for (const f of ADMIN_FILES){
      if (!PRESETS[f]) await loadPresetFile(f);
      await savePresetFile(f, PRESETS[f]);
    }
    toast('All presets saved ✓');
  }

  async function exportPresetFile(file){
    try{
      PRESETS[file] = null;
      const data = await loadPresetFile(file);
      const blob = new Blob([JSON.stringify(data || [], null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file}.json`;
      document.body.append(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
      toast('Preset exported ✓');
    }catch(e){
      toast('Export failed: ' + e.message);
    }
  }

  function importPresetFile(file){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async ()=>{
      const picked = input.files && input.files[0];
      if (!picked) return;
      try{
        const text = await picked.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error('JSON must be an array []');
        await savePresetFile(file, data);
        PRESETS[file] = data;
        if (file === 'guild_boss') {
          const withVariants = data.find(hasGuildBossVariants);
          S.showEmptyGuildBosses = !withVariants && data.length > 0;
          S.guildBossKey = String((withVariants || data[0])?.key || '');
        }
        toast('Preset imported ✓');
        await rerender({ preserveScroll: true });
      }catch(e){
        toast('Import failed: ' + e.message);
      }
    });
    input.click();
  }

  // Events save
  function normalizeForSave(src){
    const data = JSON.parse(JSON.stringify(src || {events:[]}));
    if (!Array.isArray(data.events)) data.events = [];
    for (const blk of data.events){
      if (!Array.isArray(blk.events)) { blk.events = []; continue; }
      for (const ev of blk.events){
        ev.id = String(ev.id ?? '').trim();
        const canon = canonicalNameFor(ev.id);
        ev.name = canon || String(ev.name ?? '').trim();
        if (Array.isArray(ev.link)) ev.link = ev.link[0] || '';
        if (ev.link == null) ev.link = '';
        ev.link = String(ev.link);
        ev.description = String(ev.description ?? '').replace(/\r\n/g, '\n');
        ev.start_time = ensureIsoSeconds(String(ev.start_time ?? '').trim());
        ev.end_time   = ensureIsoSeconds(String(ev.end_time   ?? '').trim());
      }
    }
    return data;
  }
  async function saveEvents(){
    const payload = normalizeForSave(EVENTS);
    const res = await fetch(url('/api/admin/events'),{
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      throw new Error(j?.error || `Save failed (${res.status})`);
    }
    return res.json();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  function canonicalNameFor(id) {
    const s = String(id || '');
    if (s.startsWith('web')) return 'Web Event';
    if (s.startsWith('repetitive')) return 'Repetitive Event';
    if (s.startsWith('normal')) return 'Normal Event';
    if (s.startsWith('special')) return 'Special Event';
    if (s === 'instance_encore_upcoming' || s.startsWith('instance_encore'))
      return 'Unstable Dungeon';
    if (s.startsWith('instance_period') || s.startsWith('encore_period') || s.startsWith('unstable_dungeon'))
      return 'Unstable Dungeon';
    if (s.startsWith('power_of_destruction') || s.startsWith('power_of_calamity'))
      return 'Power of Calamity';
    if (s.startsWith('mind_rift'))
      return 'Mind Rift';
    if (s.startsWith('guild_boss'))
      return 'Guild Boss';
    return null;
  }

  function ensureIsoSeconds(v){
    if (!v) return '';
    const mFull = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    if (mFull) return mFull[1];
    const mNoSec = v.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/);
    if (mNoSec) return mNoSec[1] + ':00';
    const d = new Date(v);
    if (!isNaN(d.getTime())){
      const p = n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    return v.slice(0,19);
  }

  const toLocalInputValue = (isoLike) => {
    const s = String(isoLike||'');
    if (!s) return '';
    return ensureIsoSeconds(s);
  };

  const addDays = (isoLike, days=7) => {
    const d = new Date(ensureIsoSeconds(isoLike) || new Date());
    if (isNaN(d.getTime())) return toLocalInputValue(isoLike);
    d.setDate(d.getDate()+days);
    const p = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  function toast(msg){
    const t = el('div',{class:'fixed top-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-xl shadow z-50'}, msg);
    document.body.append(t); setTimeout(()=>t.remove(), 1600);
  }

  const isUpcoming = id => /_upcoming$/.test(String(id||''));
  function typeOf(evId){
    const id = String(evId||'');
    if (id.startsWith('web'))                return 'web';
    if (id.startsWith('repetitive'))         return 'repetitive';
    if (id.startsWith('normal'))             return 'normal';
    if (id.startsWith('special'))            return 'special';
    if (id.startsWith('guild_boss'))         return 'guild_boss';
    if (id.startsWith('instance_period') || id.startsWith('encore_period') || id.startsWith('instance_encore') || id.startsWith('unstable_dungeon')) return 'unstable_dungeon';
    if (id.startsWith('power_of_destruction') || id.startsWith('power_of_calamity')) return 'power_of_calamity';
    if (id.startsWith('mind_rift'))          return 'mind_rift';
    if (id.startsWith('hunter_'))            return 'hunter_event';
    return 'normal';
  }

  // flatten helper for combobox
  function flattenToRows(data, defaults={}){
    const rows = [];
    if (!Array.isArray(data)) return rows;

    if (data.some(x => Array.isArray(x?.variants))){
      for (const g of data){
        const groupName = g.name || g.key || defaults.group || 'Group';
        for (const v of (g.variants || [])){
          rows.push({
            group: groupName,
            label: v.label || v.key || '(variant)',
            link:  v.link || v.image || '',
            name:  g.name || '',
            description: v.description || ''
          });
        }
      }
      return rows;
    }

    for (const it of data){
      rows.push({
        group: defaults.group || 'Presets',
        label: it.label || it.name || it.key || '(item)',
        link:  it.link || it.image || '',
        name:  it.name || '',
        description: it.description || ''
      });
    }
    return rows;
  }

  function guildBossRows(data){
    const rows = [];
    if (!Array.isArray(data)) return rows;

    for (const boss of data){
      const bossName = boss?.name || boss?.key || 'Guild Boss';
      for (const v of (Array.isArray(boss?.variants) ? boss.variants : [])){
        const variantLabel = v.label || v.key || '(variant)';
        rows.push({
          group: 'Guild Boss',
          label: `${bossName} - ${variantLabel}`,
          link: v.link || v.image || '',
          name: bossName,
          description: v.description || ''
        });
      }
    }
    return rows;
  }

  function rowsToGroups(rows){
    const byGroup = new Map();
    for (const r of (rows||[])){
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group).push({ label:r.label, link:r.link, name:r.name||'', description:r.description||'' });
    }
    return Array.from(byGroup.entries()).map(([group, options])=>({group, options}));
  }

  // Combobox (overlay panel). onPick({link,name,description,label})
  async function getRowsFor(evId){
    const id = String(evId||'');
    const base = typeOf(id);
    const upcoming = isUpcoming(id);

    if (base==='guild_boss' && upcoming) return guildUpcomingRows();
    if (base==='unstable_dungeon' && upcoming) return unstableUpcomingRows();
    if (base==='mind_rift' && upcoming) return mindRiftUpcomingRows();
    if (base==='power_of_calamity' && upcoming){
      const data = await loadPresetFile('power_of_calamity');
      return flattenToRows(data, {group:'Power of Calamity (upcoming)'});
    }

    if (base==='guild_boss'){
      const data = await loadPresetFile('guild_boss');
      return guildBossRows(data);
    }
    if (base==='unstable_dungeon'){
      const data = await loadPresetFile('unstable_dungeon');
      return flattenToRows(data, {group:'Unstable Dungeon'});
    }
    if (base==='power_of_calamity'){
      const data = await loadPresetFile('power_of_calamity');
      return flattenToRows(data, {group:'Power of Calamity'});
    }
    if (base==='mind_rift'){
      const data = await loadPresetFile('mind_rift');
      return flattenToRows(data, {group:'Mind Rift'});
    }
    if (base==='hunter_event'){
      const data = await loadPresetFile('hunter_event');
      return flattenToRows((Array.isArray(data)?data:[]).map(x=>({
        label: x.label || x.name || x.key || '(item)',
        link:  x.link || '',
        name: '', description: ''
      })), {group:'Hunter Event'});
    }
    if (['web','repetitive','normal','special'].includes(base)){
      const data = await loadPresetFile(base);
      return flattenToRows(data, {group: PRESET_LABELS[base] || base}).map(r => ({...r, name:'', description:''}));
    }
    return [];
  }

  function resolveComboEventId(evId){
    return (typeof evId === 'function') ? evId() : evId;
  }

  function buildCombo(evId, onPick){
    const wrap   = el('div', { class:'full ev-combo' });
    const label  = el('label', { class:'ev-sub' }, 'Image preset (optional)');
    const input  = el('input', { class:'ev-filter', placeholder:'Type to search…', autocomplete:'off' });
    const panel  = el('div', { class:'ev-dd' });
    wrap.append(label, input, panel);

    let groups = [];
    function close(){ panel.classList.remove('open'); }
    function openPanel(){ panel.classList.add('open'); }
    function render(){
      panel.innerHTML = '';
      const q = input.value.trim().toLowerCase();
      let any = 0;
      for (const g of groups){
        const opts = g.options.filter(o => {
          if (!q) return true;
          const label = String(o.label || '').toLowerCase();
          const name = String(o.name || '').toLowerCase();
          const desc = String(o.description || '').toLowerCase();
          const group = String(g.group || '').toLowerCase();
        
          return (
            label.includes(q) ||
            name.includes(q) ||
            desc.includes(q) ||
            group.includes(q)
          );
        });
        if (!opts.length) continue;
        any += opts.length;
        panel.append(el('div', { class:'ev-dd-group' }, g.group));
        for (const o of opts){
          const row = el('div', { class:'ev-dd-item' }, o.label);
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = o.label;
            onPick({ link:o.link, name:o.name, description:o.description, label:o.label, group:g.group });
            close();
          });
          panel.append(row);
        }
      }
      if (!any){
        panel.append(el('div', { class:'ev-dd-empty' }, 'No matches'));
      }
    }
    async function refreshGroups(){
      groups = rowsToGroups(await getRowsFor(resolveComboEventId(evId)));
      render();
    }
    refreshGroups();
    input.addEventListener('focus', ()=>{ openPanel(); refreshGroups(); });
    input.addEventListener('input', ()=>{ openPanel(); render(); });
    document.addEventListener('click', (e)=>{ if (!wrap.contains(e.target)) close(); });
    return wrap;
  }

  function imagePreview(urlStr){
    const img = el('img', { class:'ev-img', src:urlStr||'', alt:'preview',
      onError:()=>img.style.display='none', onLoad:()=>img.style.display='' });
    if (!urlStr) img.style.display='none';
    return img;
  }

  // Special upcoming presets
  function guildUpcomingRows(){
    return [
      { group:'Guild Boss (upcoming)', label:'Queen Ant',
        link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_125/SLA/EVENT/Guild/Queen_Ant.png',
        name:'Queen Ant',
        description:'**Queen Ant**\\n-# [Recommended Element: <:NONE:1407739841399230517> & <:NONE:1407739841399230517> | <:NONE:1407739841399230517>]' },

      { group:'Guild Boss (upcoming)', label:'Fachtna the King of the Desert',
        link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_125/SLA/EVENT/Guild/Fachtna_the_King_of_the_Desert.png',
        name:'Fachtna the King of the Desert',
        description:'**Fachtna the King of the Desert**\\n-# [Recommended Element: <:NONE:1407739841399230517> & <:NONE:1407739841399230517> | <:NONE:1407739841399230517>]' },

      { group:'Guild Boss (upcoming)', label:'Giant Statue',
        link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_125/SLA/EVENT/Guild/Giant_Statue.png',
        name:'Giant Statue',
        description:'**Giant Statue**\\n-# [Recommended Element: <:NONE:1407739841399230517> & <:NONE:1407739841399230517> | <:NONE:1407739841399230517>]' },

      { group:'Guild Boss (upcoming)', label:'Manticore, the Eager Engager',
        link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_125/SLA/EVENT/Guild/Manticore_the_Eager_Engager.png',
        name:'Manticore, the Eager Engager',
        description:'**Manticore, the Eager Engager**\\n-# [Recommended Element: <:NONE:1407739841399230517> & <:NONE:1407739841399230517> | <:NONE:1407739841399230517>]' }
    ];
  }
  function unstableUpcomingRows(){
    return [{
      group:'Unstable Dungeon (upcoming)',
      label:'BG',
      link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_250/SLA/EVENT/boss/BG.png',
      name:'Unstable Dungeon',
      description:'**???**'
    }];
  }

  function mindRiftUpcomingRows(){
    return [{
      group:'Mind Rift (upcoming)',
      label:'BG',
      link:'https://res.cloudinary.com/dmfww0zt8/image/upload/c_scale,w_250/SLA/EVENT/boss/BG.png',
      name:'Mind Rift',
      description:'**???**'
    }];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Event card (Editor tab)
  function eventCard(blockIdx, evIdx){
    const ev   = EVENTS.events[blockIdx].events[evIdx];
    const id   = String(ev.id || '');

    const idInp   = el('input', { class:'ev-input', value: ev.id || '', placeholder:'id' });
    const nameInp = el('input', { class:'ev-input', value: ev.name || '', placeholder:'name (editable)' });

    { const canon = canonicalNameFor(ev.id); if (canon) nameInp.value = canon; }
    idInp.addEventListener('input', () => {
      const canon = canonicalNameFor(idInp.value.trim());
      if (canon) nameInp.value = canon;
    });

    const stInp = el('input', { class:'ev-input', type:'datetime-local', step:'1', value: toLocalInputValue(ev.start_time) });
    const enInp = el('input', { class:'ev-input', type:'datetime-local', step:'1', value: toLocalInputValue(ev.end_time) });

    const stMinus   = el('button', { class:'ev-mini', type:'button', onClick:()=>{ stInp.value = addDays(stInp.value, -7); } }, '-7 days');
    const stPlus    = el('button', { class:'ev-mini', type:'button', onClick:()=>{ stInp.value = addDays(stInp.value,  7); } }, '+7 days');
    const stPlus28  = el('button', { class:'ev-mini', type:'button', onClick:()=>{ stInp.value = addDays(stInp.value, 28); } }, '+28 days');
    const enMinus   = el('button', { class:'ev-mini', type:'button', onClick:()=>{ enInp.value = addDays(enInp.value, -7); } }, '-7 days');
    const enPlus    = el('button', { class:'ev-mini', type:'button', onClick:()=>{ enInp.value = addDays(enInp.value,  7); } }, '+7 days');
    const enPlus28  = el('button', { class:'ev-mini', type:'button', onClick:()=>{ enInp.value = addDays(enInp.value, 28); } }, '+28 days');

    const linkInp = el('input', { class:'ev-input', value: ev.link || '', placeholder:'link (image URL)' });
    const preview = imagePreview(linkInp.value);
    linkInp.addEventListener('input', ()=>{ preview.src = linkInp.value.trim(); preview.style.display = linkInp.value.trim() ? '' : 'none'; });

    const descInp = el('textarea', { class:'ev-text', placeholder:'description (editable)' },
      (ev.description||'').replace(/\\n/g,'\n')
    );

    const picker = buildCombo(() => idInp.value.trim() || id, ({link, name, description})=>{
      if (!link) return;
      const selectedId = idInp.value.trim() || id;
      const selectedKind = typeOf(selectedId);
      const selectedUpcoming = isUpcoming(selectedId);
      linkInp.value = link; preview.src = link; preview.style.display = '';
      if (['guild_boss','unstable_dungeon','power_of_calamity','mind_rift'].includes(selectedKind)){
        if (name) nameInp.value = name;
        if (description) descInp.value = String(description).replace(/\\n/g, '\n');
      }
      if ((selectedKind === 'unstable_dungeon' || selectedKind === 'mind_rift') && selectedUpcoming) descInp.value = '**???**';
      const canon = canonicalNameFor(selectedId); if (canon) nameInp.value = canon;
      toast('Image selected ✓');
    });

    function autoGrow(t){ t.style.height='auto'; t.style.height = t.scrollHeight + 'px'; }
    autoGrow(descInp);
    descInp.addEventListener('input', ()=>autoGrow(descInp));

    const saveOne = async ()=>{
      ev.id = idInp.value.trim();
      ev.name = canonicalNameFor(ev.id) || nameInp.value.trim();
      ev.start_time = ensureIsoSeconds(stInp.value.trim());
      ev.end_time   = ensureIsoSeconds(enInp.value.trim());
      ev.link = String(linkInp.value.trim());
      ev.description = descInp.value;
      try{ await saveEvents(); toast('Saved ✓'); }
      catch(e){ toast('Save failed: ' + e.message); }
    };

    const delOne = async ()=>{
      EVENTS.events[blockIdx].events.splice(evIdx, 1);
      await rerender({ preserveScroll: true });
    };

    const addAfter = async ()=>{
      EVENTS.events[blockIdx].events.splice(evIdx+1, 0, { id:'', name:'', start_time:'', end_time:'', link:'', description:'' });
      await rerender({ preserveScroll: true });
    };

    return el('div', { class:'ev-card' },
      el('div', { class:'ev-head' },
        el('div', { class:'font-semibold' }, 'Event'),
        el('div', { class:'ev-toolbar' },
          IS_ADMIN ? el('button', { class:'ev-btn primary', onClick:saveOne }, 'Save') : null,
          IS_ADMIN ? el('button', { class:'ev-btn ghost', onClick:delOne }, 'Delete') : null
        )
      ),
      el('div', { class:'ev-fields' },
        el('div', {}, el('label',{class:'ev-sub'}, 'id'), idInp),
        el('div', {}, el('label',{class:'ev-sub'}, 'name'), nameInp),
        el('div', {}, el('label',{class:'ev-sub'}, 'start_time'), stInp, el('div',{class:'ev-btnrow'}, stMinus, stPlus, stPlus28)),
        el('div', {}, el('label',{class:'ev-sub'}, 'end_time'),   enInp, el('div',{class:'ev-btnrow'}, enMinus, enPlus, enPlus28)),
        el('div', { class:'full' }, picker),
        el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'link (image URL)'), linkInp),
        el('div', { class:'full' }, preview),
        el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'description'), descInp)
      ),
      IS_ADMIN ? el('div', { class:'mt-3' }, el('button', { class:'ev-btn primary', onClick:addAfter }, 'Add event')) : null
    );
  }

  // ADMIN: two-level preset navigation
  async function adminButtonsBar(onChange){
    syncActivePresetFromMainGroup();

    const wrap = el('div', { class:'ev-stack' });
    const main = el('div', { class:'ev-seg' },
      ...ADMIN_MAIN_GROUPS.map(group=>{
        return el('button', {
          class: 'ev-btn' + (S.presetMainGroup===group ? ' active' : ''),
          onClick: async ()=>{
            S.presetMainGroup = group;
            syncActivePresetFromMainGroup();
            if (group === 'guild_boss') {
              const bosses = await loadPresetFile('guild_boss');
              ensureActiveGuildBoss(bosses);
            }
            onChange?.(S.presetFile);
          }
        }, PRESET_LABELS[group] || group);
      })
    );
    wrap.append(main);

    if (S.presetMainGroup === 'events') {
      wrap.append(el('div', { class:'ev-seg' },
        ...EVENT_SUBPRESETS.map(file=>el('button', {
          class: 'ev-mini' + (S.presetFile===file ? ' active' : ''),
          onClick: ()=>{ S.presetFile = file; onChange?.(file); }
        }, PRESET_LABELS[file] || file))
      ));
    }

    if (S.presetMainGroup === 'guild_boss') {
      const bosses = await loadPresetFile('guild_boss');
      ensureActiveGuildBoss(bosses);
      const visibleBosses = visibleGuildBosses(bosses);
      if (visibleBosses.length) {
        wrap.append(el('div', { class:'ev-seg' },
          ...visibleBosses.map((boss, i)=>{
            const key = String(boss?.key || '');
            const active = key && key === S.guildBossKey;
            return el('button', {
              class: 'ev-mini' + (active || (!S.guildBossKey && i === 0) ? ' active' : ''),
              onClick: ()=>{ S.guildBossKey = key; onChange?.('guild_boss'); }
            }, boss?.name || boss?.key || `Boss ${i+1}`);
          })
        ));
      }
    }

    return wrap;
  }

  // Build one GROUP CARD (variants inside as panels; “+ Add variant to …” closes this card)
  function buildGroupCard(file, grp, gi, groups){
    const gTitle = grp.name || grp.key || `Group ${gi+1}`;
    const isGuildBoss = file === 'guild_boss';
    if (isGuildBoss && !Array.isArray(grp.variants)) grp.variants = [];

    const card = el('div', { class:'ev-card' },
      el('div', { class:'ev-head', style:'margin-bottom:6px' },
        el('div', { class:'font-semibold' }, `${gTitle}`),
        isGuildBoss && IS_ADMIN ? el('div', { class:'ev-toolbar' },
          el('button', {
            class:'ev-mini active',
            onClick: async ()=>{
              try{
                await savePresetFile('guild_boss', PRESETS.guild_boss);
                toast('Saved ✓');
                await rerender({ preserveScroll: true });
              }catch{}
            }
          }, 'Save boss'),
          el('button', {
            class:'ev-mini ghost',
            onClick: async ()=>{
              if (!confirm(`Delete boss "${grp.name || grp.key || gTitle}"?`)) return;
              groups.splice(gi, 1);
              const fallback = pickFallbackGuildBoss(groups);
              S.guildBossKey = String(fallback?.key || '');
              await rerender({ preserveScroll: true });
            }
          }, 'Delete boss')
        ) : null
      )
    );

    // panels host
    const panelsHost = el('div', { class:'ev-stack' });
    if (isGuildBoss) {
      const keyInp = el('input', { class:'ev-input', value: grp.key ?? '', placeholder:'boss key' });
      const nameInp = el('input', { class:'ev-input', value: grp.name ?? '', placeholder:'boss name' });
      keyInp.addEventListener('input', ()=>{
        grp.key = keyInp.value.trim();
        S.guildBossKey = grp.key;
      });
      nameInp.addEventListener('input', ()=>{
        grp.name = nameInp.value.trim();
        if (!keyInp.value.trim()) {
          grp.key = slugify(grp.name);
          keyInp.value = grp.key;
          S.guildBossKey = grp.key;
        }
      });
      panelsHost.append(
        el('div', { class:'ev-panel' },
          el('div', { class:'ev-fields' },
            el('div', {}, el('label',{class:'ev-sub'}, 'boss key'), keyInp),
            el('div', {}, el('label',{class:'ev-sub'}, 'boss name'), nameInp)
          )
        )
      );
    }

    if (isGuildBoss && !grp.variants.length) {
      panelsHost.append(el('div', { class:'ev-sub' }, 'No variants'));
    }

    (grp.variants || []).forEach((v, vi)=>{
      const keyInp   = el('input', { class:'ev-input', value: v.key ?? '', placeholder:'key' });
      const labelInp = el('input', { class:'ev-input', value: v.label ?? '', placeholder:'label' });
      const linkInp  = el('input', { class:'ev-input', value: v.link || v.image || '', placeholder:'link (image URL)' });
      const preview  = imagePreview(linkInp.value);
      linkInp.addEventListener('input', ()=>{ preview.src = linkInp.value.trim(); preview.style.display = linkInp.value.trim() ? '' : 'none'; });
      const descInp  = el('textarea', { class:'ev-text', placeholder:'description' }, decodeNL(v.description ?? ''));

      const fields = [
        el('div', {}, el('label',{class:'ev-sub'}, 'key'), keyInp),
        el('div', {}, el('label',{class:'ev-sub'}, 'label'), labelInp),
        el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'link'), linkInp),
        el('div', { class:'full' }, preview),
        el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'description'), descInp),
      ];

      const panel = el('div', { class:'ev-panel' },
        el('div',{ class:'ev-toolbar' },
          el('div', { class:'ev-sub ev-grow' }, `Variant ${vi+1}`),
          IS_ADMIN ? el('button', {
            class:'ev-mini active',
            onClick: async ()=>{
              try{ await savePresetFile(S.presetFile, PRESETS[S.presetFile]); toast('Saved ✓'); }catch{}
            }
          }, 'Save') : null,
          IS_ADMIN ? el('button', {
            class:'ev-mini',
            onClick:()=>{
              grp.variants.splice(vi+1, 0, { key:'', label:'', link:'', description:'' });
              rerender({ preserveScroll: true });
            }
          }, '+ Add below') : null,
          IS_ADMIN ? el('button', { class:'ev-mini ghost', onClick:()=>{
            grp.variants.splice(vi,1);
            panel.remove();
          }}, 'Delete') : null
        ),
        el('div', { class:'ev-fields' }, ...fields)
      );

      keyInp.addEventListener('input', ()=> v.key = keyInp.value.trim());
      labelInp.addEventListener('input', ()=> v.label = labelInp.value.trim());
      linkInp.addEventListener('input', ()=> { v.link = linkInp.value.trim(); delete v.image; });
      descInp.addEventListener('input', ()=> v.description = descInp.value);

      panelsHost.append(panel);
    });

    // add at end — last element in this card
    if (IS_ADMIN){
      panelsHost.append(
        el('div', { class:'ev-toolbar' },
          el('button', {
            class:'ev-btn',
            onClick:()=>{
              grp.variants = grp.variants || [];
              grp.variants.push({ key:'', label:'', link:'', description:'' });
              rerender({ preserveScroll: true });
            }
          }, isGuildBoss ? '+ Add variant' : `+ Add variant to ${gTitle}`)
        )
      );
    }

    card.append(panelsHost);
    return card; // << after this button, card ends; next group starts a new card
  }

  // Build FLAT CARD (single card with item panels)
  function buildFlatCard(file, data){
    const isSimple3 = (file==='hunter_event'); // key,label,link
    const card = el('div', { class:'ev-card' },
      el('div', { class:'ev-head', style:'margin-bottom:6px' },
        el('div', { class:'font-semibold' }, `${PRESET_LABELS[file] || file} preset`)
      )
    );

    const host = el('div', { class:'ev-stack' });

    (Array.isArray(data) ? data : []).forEach((it, i)=>{
      const keyInp   = el('input', { class:'ev-input', value: it.key ?? '', placeholder:'key' });
      const labelInp = el('input', { class:'ev-input', value: it.label ?? '', placeholder:'label' });
      const linkInp  = el('input', { class:'ev-input', value: it.link || it.image || '', placeholder:'link (image URL)' });
      const preview  = imagePreview(linkInp.value);
      linkInp.addEventListener('input', ()=>{ preview.src = linkInp.value.trim(); preview.style.display = linkInp.value.trim() ? '' : 'none'; });
      const descInp  = !isSimple3 ? el('textarea', { class:'ev-text', placeholder:'description' }, decodeNL(it.description ?? '')) : null;

      const fields = isSimple3
        ? [
            el('div', {}, el('label',{class:'ev-sub'}, 'key'), keyInp),
            el('div', {}, el('label',{class:'ev-sub'}, 'label'), labelInp),
            el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'link'), linkInp),
            el('div', { class:'full' }, preview),
          ]
        : [
            el('div', {}, el('label',{class:'ev-sub'}, 'key'), keyInp),
            el('div', {}, el('label',{class:'ev-sub'}, 'label'), labelInp),
            el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'link'), linkInp),
            el('div', { class:'full' }, preview),
            el('div', { class:'full' }, el('label',{class:'ev-sub'}, 'description'), descInp),
          ];

      const panel = el('div', { class:'ev-panel' },
        el('div',{ class:'ev-toolbar' },
          el('div', { class:'ev-sub ev-grow' }, `Item ${i+1}`),
          IS_ADMIN ? el('button', {
            class:'ev-mini active',
            onClick: async ()=>{
              try{ await savePresetFile(S.presetFile, PRESETS[S.presetFile]); toast('Saved ✓'); }catch{}
            }
          }, 'Save') : null,
          IS_ADMIN ? el('button', {
            class:'ev-mini',
            onClick:()=>{
              (data).splice(i+1, 0, isSimple3 ? { key:'', label:'', link:'' } : { key:'', label:'', link:'', description:'' });
              rerender({ preserveScroll: true });
            }
          }, '+ Add below') : null,
          IS_ADMIN ? el('button', { class:'ev-mini ghost', onClick:()=>{
            (data).splice(i,1); panel.remove();
          }}, 'Delete') : null
        ),
        el('div', { class:'ev-fields' }, ...fields)
      );

      keyInp.addEventListener('input', ()=> it.key = keyInp.value.trim());
      labelInp.addEventListener('input', ()=> it.label = labelInp.value.trim());
      linkInp.addEventListener('input', ()=> { it.link = linkInp.value.trim(); delete it.image; });
      if (descInp) descInp.addEventListener('input', ()=> it.description = descInp.value);

      host.append(panel);
    });

    // add item at end
    if (IS_ADMIN){
      host.append(el('button', { class:'ev-btn ev-fullbtn', onClick:()=>{
        (data).push(isSimple3 ? { key:'', label:'', link:'' } : { key:'', label:'', link:'', description:'' });
        rerender({ preserveScroll: true });
      }}, '+ Add item'));
    }

    card.append(host);
    return card;
  }

  // ADMIN: render view (buttons bar + cards list)
  async function renderAdminView(){
    syncActivePresetFromMainGroup();
    const file = S.presetFile;
    const data = await loadPresetFile(file);

    const wrap = el('div', { class:'ev-stack' });

    // Header toolbar (per-file actions)
    const head = el('div', { class:'ev-head' },
      el('div', { class:'font-semibold' }, `Admin - ${PRESET_LABELS[file] || file} preset`),
      el('div', { class:'ev-toolbar' },
        el('button', { class:'ev-btn',
          onClick: async ()=>{ await exportPresetFile(file); }}, 'Export .json'),
        IS_ADMIN ? el('button', { class:'ev-btn',
          onClick: ()=>{ importPresetFile(file); }}, 'Import .json') : null,
        el('button', { class:'ev-btn',
          onClick: async ()=>{
            PRESETS[file] = null;
            await loadPresetFile(file);
            toast('Reloaded preset ✓');
            await rerender({ preserveScroll: true });
          }}, 'Reload preset'),
        el('button', { class:'ev-btn primary',
          onClick: async ()=>{
            try{
              await savePresetFile(file, PRESETS[file] || data);
              toast('Saved preset ✓');
            }catch{}
          }}, 'Save preset')
      )
    );
    wrap.append(head);

    if (!Array.isArray(data) || data.length === 0) {
      wrap.append(el('div', { class:'ev-card ev-sub' },
        'This preset is empty in DB. Scheduled events from /api/events are shown in the Editor tab.'
      ));
    }

    if (file === 'guild_boss' && IS_ADMIN) {
      wrap.append(el('div', { class:'ev-toolbar' },
        el('button', {
          class:'ev-btn' + (S.showEmptyGuildBosses ? ' active' : ''),
          onClick: async ()=>{
            S.showEmptyGuildBosses = !S.showEmptyGuildBosses;
            ensureActiveGuildBoss(data);
            await rerender({ preserveScroll: true });
          }
        }, 'Show empty bosses'),
        el('button', {
          class:'ev-btn primary',
          onClick: async ()=>{
            const name = 'New Guild Boss';
            let key = slugify(name);
            let n = 2;
            while (data.some(b => String(b?.key || '') === key)) key = `${slugify(name)}_${n++}`;
            data.push({ key, name, variants: [] });
            S.showEmptyGuildBosses = true;
            S.guildBossKey = key;
            await rerender({ preserveScroll: true });
          }
        }, '+ Add boss')
      ));
    }

    // Cards
    if (file === 'guild_boss') {
      const activeBoss = ensureActiveGuildBoss(data);
      if (activeBoss) {
        const activeIndex = data.indexOf(activeBoss);
        wrap.append(buildGroupCard(file, activeBoss, activeIndex, data));
      }
    }else if (Array.isArray(data) && data.some(x => Array.isArray(x?.variants))){
      (data || []).forEach((grp, gi)=>{
        wrap.append(buildGroupCard(file, grp, gi, data));
      });
    }else{
      wrap.append(buildFlatCard(file, data));
    }

    return wrap;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Page render
  async function renderEventsPage(host, { preserveScroll = false } = {}){
    if (!host) host = document.getElementById('content');
    host.innerHTML = '';

    // ⬇️ Przewijaj do góry tylko gdy nie chcemy zachować scrolla
    if (!preserveScroll) toTop();

    const header = el('div', { class:'ev-head', style:'margin-bottom:6px' },
      el('div', {},
        el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Admin Events'),
        el('div', { class: 'text-sm text-slate-300/90' }, 'Events data editor for SLA (used in filters, upcoming events, etc.)' )
      ),
      el('div', { class:'ev-toolbar' },
        IS_ADMIN ? el('button', { class:'ev-btn primary', onClick: async()=>{
          try{ await saveEvents(); toast('Saved ✓'); }
          catch(e){ toast('Save failed: '+e.message); }
        } }, 'Save All Events') : null,
        el('button', { class:'ev-btn ghost', onClick: async()=>{
          await fetchEvents();
          await rerender({ preserveScroll: true });
          toast('Reloaded');
        } }, 'Reload')
      )
    );

    const tabs = el('div', { class: 'ev-tabs' },
      ...[
        ['editor','Editor'],
        ['admin','Admin']
      ].map(([id,label])=>{
        const b = el('button',{
          class: 'ev-btn' + (S.eventsTab===id ? ' active' : ''),
          onClick: ()=>{
            S.eventsTab = id;
            // przy zmianie zakładki faktycznie chcemy być na górze
            toTop();
            rerender({ preserveScroll: false });
          }
        }, label);
        return b;
      })
    );

    const main = el('div', { class: 'ev-stack' });

    if (S.eventsTab === 'editor') {
      const cards = [];
      for (let bi=0; bi<(EVENTS.events||[]).length; bi++){
        const block = EVENTS.events[bi];
        for (let ei=0; ei<(block.events||[]).length; ei++){
          cards.push(eventCard(bi, ei));
        }
      }

      const addTop = IS_ADMIN ? el('button', {
        class:'ev-btn primary ev-fullbtn', onClick: async ()=>{
          if (!EVENTS.events.length) EVENTS.events.push({ month:'', events:[] });
          EVENTS.events[0].events.unshift({ id:'', name:'', start_time:'', end_time:'', link:'', description:'' });
          await rerender({ preserveScroll: true });
        }
      }, 'Add event (top)') : null;

      main.append(addTop, ...cards);

    } else if (S.eventsTab === 'admin') {
      // Buttons bar ABOVE the list of cards
      const btnBar = await adminButtonsBar(async ()=>{ await rerender({ preserveScroll: true }); });
      main.append(btnBar, await renderAdminView());

      // Footer: Save all presets
      if (IS_ADMIN){
        main.append(
          el('div', { class:'ev-footer' },
            el('button', { class:'ev-btn primary ev-fullbtn', onClick: async()=>{ await saveAllPresets(); } }, 'Save All Presets')
          )
        );
      }
    }

    host.append(el('div', { class:'ev-wrap' }, header, tabs, main));
  }

  // ✅ rerender z zachowaniem scrolla
  async function rerender({ preserveScroll = true } = {}){
    const host = document.getElementById('content');
    if (!host || S.tab !== 'events') return;

    const y = window.scrollY;

    await renderEventsPage(host, { preserveScroll });

    if (preserveScroll) {
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Hook into app.js renderer
  const _renderContent = window.renderContent;
  window.renderContent = async function(){
    if (S.tab === 'events'){
      window.renderFilters?.();
      if (!EVENTS.events.length) await fetchEvents();

      // ⛔️ NIE robimy tu toTop() bo to psuło scroll
      await renderEventsPage(undefined, { preserveScroll: false });
      return;
    }
    return _renderContent?.();
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Init & debug helpers
  (async ()=>{ IS_ADMIN = await isAdmin(); })();

  window.__events_loaded = true;
  window.__events_mount  = async ()=>{
    S.tab = 'events';
    toTop();
    await fetchEvents();
    await renderEventsPage(undefined, { preserveScroll: false });
    window.renderTopbar?.();
    window.renderAuth?.();
    window.renderSidebar?.();
    window.renderFilters?.();
  };
})();
