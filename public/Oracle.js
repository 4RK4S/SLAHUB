'use strict';

/**
 * ORACLE.js v2.4
 * Fixes:
 *  - VALUE OCR fallback (multi-pass): PSM swap + threshold sweep + invert sweep
 *  - Bonus repair using Oracle tiers:
 *      displayed "3,941 (+8390)" => tries bonus candidates -> picks bonus that makes base fit tiers
 *  - Keeps black background + white text for VALUE crops (display)
 *  - Keeps Coordinate Picker v2 with working pan (SPACE+LMB or MMB)
 */

(function () {
  // --------------------------
  // Config
  // --------------------------
  const PREPROCESSING = {
    CONTRAST: 1.25,
    BRIGHTNESS: 1.08,
    FILTER_CSS: 'contrast(1.25) brightness(1.08)',
    BINARIZE_THRESHOLD: 150,     // 0-255
    VALUE_CROP_TOP_TRIM: 4,      // px (in 1920x1080 space)
    SHARPEN_AMOUNT: 0.25,        // 0..1
    VALUES_WHITE_ON_BLACK: true, // requested: black bg, white text
    ASSUME_GEAR_MAX_PLUS: true,  // fixes "+2()" => "+20"
  };

  const TARGET_W = 1920;
  const TARGET_H = 1080;
  const TARGET_ASPECT = TARGET_W / TARGET_H;
  const ASPECT_TOL = 0.03;

  const SCALE_NAME = 2;
  const SCALE_VALUE = 4;

  const LS_RECTS = 'oracle_rects_v2';
  const ORACLE_API_PATH = '/api/public/oracle';

  // OCR fallback tuning
  const OCR_FALLBACK = {
    MIN_GOOD_CONF: 55,
    MIN_ACCEPT_CONF: 25,
    THRESH_SWEEP: [-25, 0, +25],
    INVERT_SWEEP: [true, false], // try white-on-black first then invert
  };

  // --------------------------
  // Helpers
  // --------------------------
  const qs = (s, r = document) => r.querySelector(s);
  const _s = (x) => String(x ?? '').trim();

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, String(v));
    }
    for (const kid of kids) {
      if (kid == null) continue;
      n.append(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return n;
  }

  function basePath() {
    const p = location.pathname || '';
    return (p === '/slahub' || p.startsWith('/slahub/')) ? '/slahub' : '';
  }
  function url(p) {
    const b = basePath();
    const path = p.startsWith('/') ? p : `/${p}`;
    return `${b}${path}`;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function clampRect(rect, W, H) {
    const x = Math.max(0, Math.min(W - 1, rect.x));
    const y = Math.max(0, Math.min(H - 1, rect.y));
    const w = Math.max(1, Math.min(W - x, rect.w));
    const h = Math.max(1, Math.min(H - y, rect.h));
    return { x, y, w, h };
  }

  function rectPxToFrac(r) {
    return { x: r.x / TARGET_W, y: r.y / TARGET_H, w: r.w / TARGET_W, h: r.h / TARGET_H };
  }

  function rectFracToPx(rf) {
    return clampRect({
      x: Math.round((rf.x || 0) * TARGET_W),
      y: Math.round((rf.y || 0) * TARGET_H),
      w: Math.round((rf.w || 0) * TARGET_W),
      h: Math.round((rf.h || 0) * TARGET_H),
    }, TARGET_W, TARGET_H);
  }

  function safeJSONParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  // --------------------------
  // Default rects (fallback)
  // --------------------------
  const DEFAULT_RECTS_FRAC = {
    GEAR_NAME:      { x: 0.675, y: 0.110, w: 0.305, h: 0.045 },
    EQUIP_SCORE:    { x: 0.770, y: 0.165, w: 0.140, h: 0.040 },
    MAIN_STAT_NAME: { x: 0.675, y: 0.225, w: 0.220, h: 0.045 },
    MAIN_STAT_VAL:  { x: 0.895, y: 0.225, w: 0.085, h: 0.045 },

    SUB1_NAME:      { x: 0.675, y: 0.285, w: 0.220, h: 0.040 },
    SUB1_VAL:       { x: 0.895, y: 0.285, w: 0.085, h: 0.040 },

    SUB2_NAME:      { x: 0.675, y: 0.335, w: 0.220, h: 0.040 },
    SUB2_VAL:       { x: 0.895, y: 0.335, w: 0.085, h: 0.040 },

    SUB3_NAME:      { x: 0.675, y: 0.385, w: 0.220, h: 0.040 },
    SUB3_VAL:       { x: 0.895, y: 0.385, w: 0.085, h: 0.040 },

    SUB4_NAME:      { x: 0.675, y: 0.435, w: 0.220, h: 0.040 },
    SUB4_VAL:       { x: 0.895, y: 0.435, w: 0.085, h: 0.040 },

    LV_BLOCK:       { x: 0.675, y: 0.085, w: 0.305, h: 0.060 },
  };

  function loadRects() {
    const raw = localStorage.getItem(LS_RECTS);
    const j = raw ? safeJSONParse(raw) : null;
    if (!j || typeof j !== 'object') return { ...DEFAULT_RECTS_FRAC };
    return { ...DEFAULT_RECTS_FRAC, ...j };
  }

  function saveRects(rectsFrac) {
    localStorage.setItem(LS_RECTS, JSON.stringify(rectsFrac));
  }

  // --------------------------
  // Normalize image to 1920x1080
  // --------------------------
  function normalizeTo1920x1080(img) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const aspect = iw / ih;

    if (Math.abs(aspect - TARGET_ASPECT) > ASPECT_TOL) {
      return { canvas: null, error: `Unsupported aspect ratio (${iw}×${ih}). Use 16:9.` };
    }

    const c = document.createElement('canvas');
    c.width = TARGET_W;
    c.height = TARGET_H;

    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, TARGET_W, TARGET_H);

    return { canvas: c, srcW: iw, srcH: ih };
  }

  // --------------------------
  // Preprocessing (overrides supported)
  // --------------------------
  function applyPreprocessing(canvas, opts) {
    const forValues = !!opts?.forValues;

    const thr = clamp(
      Number(opts?.threshold ?? PREPROCESSING.BINARIZE_THRESHOLD) || 150,
      0, 255
    );

    const valueWB = (typeof opts?.valueWhiteOnBlack === 'boolean')
      ? opts.valueWhiteOnBlack
      : PREPROCESSING.VALUES_WHITE_ON_BLACK;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // (1) CSS filter
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });

    tctx.filter = PREPROCESSING.FILTER_CSS;
    tctx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    ctx.drawImage(tmp, 0, 0);

    // (2) grayscale
    let img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let d = img.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let y = (0.299 * r + 0.587 * g + 0.114 * b);

      y = y * PREPROCESSING.BRIGHTNESS;
      y = (y - 128) * PREPROCESSING.CONTRAST + 128;
      y = Math.max(0, Math.min(255, y | 0));

      d[i] = y; d[i + 1] = y; d[i + 2] = y;
    }

    // (3) sharpen (light)
    const amt = Number(PREPROCESSING.SHARPEN_AMOUNT) || 0;
    if (amt > 0.001) {
      const w = canvas.width, h = canvas.height;
      const src = new Uint8ClampedArray(d);
      const a = clamp(amt, 0, 1);
      const c0 = 1 + 4 * a;
      const idx = (x, y) => (y * w + x) * 4;

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = idx(x, y);
          const up = idx(x, y - 1);
          const dn = idx(x, y + 1);
          const lf = idx(x - 1, y);
          const rt = idx(x + 1, y);

          const v = c0 * src[i] - a * src[up] - a * src[dn] - a * src[lf] - a * src[rt];
          const vv = Math.max(0, Math.min(255, v | 0));
          d[i] = vv; d[i + 1] = vv; d[i + 2] = vv;
        }
      }
    }

    // (4) binarize for VALUES
    if (forValues) {
      for (let i = 0; i < d.length; i += 4) {
        const y = d[i];
        let bw;

        // white text on black background
        // typical digits are dark => make them white
        if (valueWB) bw = (y >= thr) ? 0 : 255;
        else bw = (y >= thr) ? 255 : 0;

        d[i] = bw; d[i + 1] = bw; d[i + 2] = bw;
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  // --------------------------
  // Crop generator (supports preprocessing overrides)
  // --------------------------
  function cropToDataURL(baseCanvas, rectPx, scale, { forValues, threshold, valueWhiteOnBlack }) {
    let r = { ...rectPx };

    if (forValues && PREPROCESSING.VALUE_CROP_TOP_TRIM > 0) {
      const trim = Math.min(r.h - 1, Math.max(0, PREPROCESSING.VALUE_CROP_TOP_TRIM));
      r.y += trim;
      r.h -= trim;
    }

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(r.w * scale));
    out.height = Math.max(1, Math.round(r.h * scale));

    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseCanvas, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);

    applyPreprocessing(out, { forValues, threshold, valueWhiteOnBlack });

    return out.toDataURL('image/png');
  }

  // --------------------------
  // Tesseract
  // --------------------------
  async function ensureTesseract() {
    if (window.Tesseract) return window.Tesseract;

    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    if (!window.Tesseract) throw new Error('Failed to load Tesseract.js');
    return window.Tesseract;
  }

  let __worker = null;

  const PSM = { BLOCK: '6', LINE: '7', WORD: '8' };

  async function ocrOnce(dataUrl, mode, onProgress) {
    const Tesseract = await ensureTesseract();

    if (!__worker) {
      __worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => onProgress && onProgress(m),
      });
    }

    const PARAMS = {
      LV_BLOCK: {
        tessedit_pageseg_mode: PSM.BLOCK,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.()%[],: ',
      },
      NAME_LINE: {
        tessedit_pageseg_mode: PSM.LINE,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+()%[]:-. ',
      },
      VALUE_WORD: {
        tessedit_pageseg_mode: PSM.WORD,
        tessedit_char_whitelist: '0123456789.,+()% ',
        classify_bln_numeric_mode: '1',
        load_system_dawg: '0',
        load_freq_dawg: '0',
      },
      VALUE_LINE: {
        tessedit_pageseg_mode: PSM.LINE,
        tessedit_char_whitelist: '0123456789.,+()% ',
        load_system_dawg: '0',
        load_freq_dawg: '0',
      },
    };

    await __worker.setParameters(PARAMS[mode] || PARAMS.NAME_LINE);

    const { data } = await __worker.recognize(dataUrl);
    return {
      text: _s(data?.text || ''),
      confidence: (typeof data?.confidence === 'number') ? data.confidence : 0,
    };
  }

  function isMeaningfulValueText(t) {
    const s = _s(t);
    if (!s) return false;
    // avoid cases like just "%" or just ")" etc.
    const cleaned = s.replace(/\s+/g, '');
    if (cleaned === '%' || cleaned === '%)' || cleaned === ')' || cleaned === '()' || cleaned === '+') return false;
    // must contain digit for value fields
    return /\d/.test(cleaned);
  }

  async function ocrValueWithFallback(makeCropFn, primaryMode, label, onProgress) {
    // makeCropFn: ({threshold, valueWhiteOnBlack}) => dataUrl
    let best = { text: '', confidence: 0, used: { thr: PREPROCESSING.BINARIZE_THRESHOLD, inv: PREPROCESSING.VALUES_WHITE_ON_BLACK, mode: primaryMode } };

    const baseThr = PREPROCESSING.BINARIZE_THRESHOLD;

    const tryModes = (primaryMode === 'VALUE_WORD')
      ? ['VALUE_WORD', 'VALUE_LINE']
      : ['VALUE_LINE', 'VALUE_WORD'];

    for (const inv of OCR_FALLBACK.INVERT_SWEEP) {
      for (const delta of OCR_FALLBACK.THRESH_SWEEP) {
        const thr = clamp(baseThr + delta, 60, 220);

        // try modes
        for (const mode of tryModes) {
          const dataUrl = makeCropFn({ threshold: thr, valueWhiteOnBlack: inv });

          const res = await ocrOnce(dataUrl, mode, onProgress);

          const okText = isMeaningfulValueText(res.text);
          const conf = (typeof res.confidence === 'number') ? res.confidence : 0;

          // scoring: prefer meaningful text, then confidence
          const score = (okText ? 1000 : 0) + conf;

          const bestScore = (isMeaningfulValueText(best.text) ? 1000 : 0) + best.confidence;
          if (score > bestScore) {
            best = { text: res.text, confidence: conf, used: { thr, inv, mode } };
          }

          // early exit if very good
          if (okText && conf >= OCR_FALLBACK.MIN_GOOD_CONF) {
            return best;
          }
        }
      }
    }
    return best;
  }

  // --------------------------
  // API submit
  // --------------------------
  async function submitToApi(payload) {
    try {
      const res = await fetch(url('/api/oracle/submit'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json().catch(() => ({ ok: false }));
    } catch {
      return { ok: false };
    }
  }

  // --------------------------
  // Oracle DB loader
  // --------------------------
  let __oracleCache = null;
  async function loadOracleJSON() {
    if (__oracleCache) return __oracleCache;
    try {
      const res = await fetch(url(ORACLE_API_PATH), { cache: 'no-store' });
      if (!res.ok) throw new Error('Oracle DB fetch failed');
      const j = await res.json();
      const config = (j && typeof j.config === 'object' && !Array.isArray(j.config)) ? j.config : {};
      __oracleCache = config;
      return config;
    } catch (e) {
      console.warn('Oracle DB load failed:', e);
      return null;
    }
  }

  // --------------------------
  // Fuzzy matching (names)
  // --------------------------
  function normName(s) {
    return _s(s)
      .toLowerCase()
      .replace(/[^a-z0-9()% ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dice(a, b) {
    a = normName(a);
    b = normName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const bigrams = (s) => {
      const out = [];
      for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
      return out;
    };

    const A = bigrams(a);
    const B = bigrams(b);
    const map = new Map();
    for (const x of A) map.set(x, (map.get(x) || 0) + 1);

    let inter = 0;
    for (const x of B) {
      const c = map.get(x) || 0;
      if (c > 0) {
        map.set(x, c - 1);
        inter++;
      }
    }
    return (2 * inter) / (A.length + B.length);
  }

  function bestMatch(raw, candidates) {
    const r = _s(raw);
    if (!r || !candidates?.length) return { best: '', score: 0 };
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
      const sc = dice(r, c);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return { best, score: bestScore };
  }

  // --------------------------
  // Parsing values
  // --------------------------
  function cleanNumberToken(s) {
    return _s(s).replace(/[^\d.,%()+-]/g, '');
  }

  function parsePercentToken(s) {
    const t = cleanNumberToken(s);

    // strict expected: x.x% x.xx% xx.x% xx.xx%
    const m = t.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if (!m) return null;

    let num = m[1].replace(',', '.');
    const v = Number(num);
    if (!Number.isFinite(v)) return null;

    const fmtOk = /^(\d{1,2})([.]\d{1,2})?$/.test(num);
    if (!fmtOk) return null;

    return v;
  }

  function parseIntLikeToken(s) {
    const t = cleanNumberToken(s);
    const m = t.match(/(\d[\d.,]*)/);
    if (!m) return null;

    let raw = m[1];

    // 3.888 => 3888 when dot is thousands
    if (raw.includes('.') && !raw.includes(',')) {
      const parts = raw.split('.');
      if (parts.length >= 2 && parts.slice(1).every(p => p.length === 3)) {
        raw = parts.join('');
      }
    }

    // 3,888 => remove commas
    if (raw.includes(',') && !raw.includes('.')) {
      raw = raw.replace(/,/g, '');
    }

    // if both separators, assume thousands and remove both
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.replace(/[.,]/g, '');
    }

    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    return v;
  }

  function parseDisplayedAndBonus(raw, expectPercent, oracleHint) {
    const s = _s(raw);
    if (!s) return { ok: false };

    const isPercent = !!expectPercent || (oracleHint && oracleHint.isPercent) || /%/.test(s);

    const inPar = s.match(/\(\s*\+\s*([^)]+)\)/);

    let displayed = null;
    let bonus = null;

    if (isPercent) {
      displayed = parsePercentToken(s);
      if (inPar) bonus = parsePercentToken(inPar[1] + '%');
    } else {
      displayed = parseIntLikeToken(s);
      if (inPar) bonus = parseIntLikeToken(inPar[1]);
    }

    // fix merged: "1,504,335" => displayed 1504, bonus 335 (only NON-percent)
    if (!isPercent && (displayed != null) && !inPar) {
      const tok = cleanNumberToken(s);
      const g = tok.match(/^(\d{1,3})([.,]\d{3})([.,]\d{3})$/);
      if (g) {
        const d1 = Number((g[1] + g[2]).replace(/[.,]/g, ''));
        const b1 = Number(g[3].replace(/[.,]/g, ''));
        if (oracleHint && oracleHint.maxExpected && d1 <= oracleHint.maxExpected * 3) {
          displayed = d1;
          bonus = b1;
        } else if (d1 <= 50000) {
          displayed = d1;
          bonus = b1;
        }
      }
    }

    if (displayed == null) return { ok: false, isPercent };

    const base = (bonus != null) ? (displayed - bonus) : displayed;
    return { ok: true, isPercent, displayed, bonus, base, raw: s };
  }

  function formatNumberInt(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return '';
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatPercent(n, fixed = 2) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return `${v.toFixed(fixed)}%`;
  }

  function formatDisplayedBonus(parsed) {
    if (!parsed?.ok) return '';
    const isP = !!parsed.isPercent;

    const disp = isP ? formatPercent(parsed.displayed, 2) : formatNumberInt(parsed.displayed);
    if (parsed.bonus == null) return disp;

    const bon = isP ? formatPercent(parsed.bonus, 2) : formatNumberInt(parsed.bonus);
    return `${disp} (+${bon})`;
  }

  // --------------------------
  // Slot detection
  // --------------------------
  function detectSlotFromGear(gearName, oracle) {
    const g = normName(gearName);
    if (!oracle || !g) return null;

    const slots = Object.keys(oracle);
    for (const s of slots) {
      if (new RegExp(`\\b${s}\\b`, 'i').test(g)) return s;
    }
    for (const s of slots) {
      if (g.includes(s)) return s;
    }
    return null;
  }

  // --------------------------
  // Tier penalty + sum(+)=4
  // --------------------------
  function statIsPercentFromOracleRanges(rangesObj) {
    const keys = Object.keys(rangesObj || {});
    for (const k of keys) {
      const rr = rangesObj[k];
      if (!rr) continue;
      if (!Number.isInteger(rr.min) || !Number.isInteger(rr.max)) return true;
    }
    return false;
  }

  function tierPenalty(base, rangesObj, tier) {
    const rr = rangesObj?.[String(tier)];
    if (!rr || base == null || !Number.isFinite(base)) return 9999;

    const mn = Number(rr.min), mx = Number(rr.max);
    const span = Math.max(1e-6, mx - mn);

    if (base >= mn && base <= mx) return 0;
    const dist = (base < mn) ? (mn - base) : (base - mx);
    return dist / span;
  }

  function minTierPenalty(base, rangesObj) {
    let best = 9999;
    for (let t = 0; t <= 4; t++) {
      best = Math.min(best, tierPenalty(base, rangesObj, t));
    }
    return best;
  }

  function bestTiersSum4(subInfos) {
    const N = 4;
    const dp = Array.from({ length: N + 1 }, () => Array.from({ length: 5 }, () => null));
    dp[0][0] = { cost: 0, path: [] };

    for (let i = 0; i < N; i++) {
      for (let sum = 0; sum <= 4; sum++) {
        const cur = dp[i][sum];
        if (!cur) continue;

        for (let tier = 0; tier <= 4; tier++) {
          const info = subInfos[i] || {};
          const base = info.base;
          const rangesObj = info.rangesObj;

          let cost = tierPenalty(base, rangesObj, tier);

          if (info.ocrPlus != null && Number.isFinite(info.ocrPlus)) {
            const confW = clamp((Number(info.nameConf) || 0) / 100, 0, 1);
            const diff = Math.abs(tier - info.ocrPlus);
            cost += diff * (0.10 + 0.30 * confW);
          }

          if (!(Number.isFinite(base))) {
            const confW = clamp((Number(info.nameConf) || 0) / 100, 0, 1);
            cost = 0.8 + (1 - confW) * 0.4 + Math.abs(tier - (info.ocrPlus ?? tier)) * 0.15;
          }

          const ns = sum + tier;
          if (ns > 4) continue;

          const next = dp[i + 1][ns];
          const cand = { cost: cur.cost + cost, path: cur.path.concat([tier]) };
          if (!next || cand.cost < next.cost) dp[i + 1][ns] = cand;
        }
      }
    }
    return dp[N][4] || null;
  }

  // --------------------------
  // Bonus repair using oracle tiers
  // --------------------------
  function genBonusCandidates(bonusRaw) {
    // bonusRaw: string or number (already parsed)
    const s = String(bonusRaw ?? '').replace(/[^\d]/g, '');
    if (!s) return [];

    const nums = new Set();
    const add = (x) => { if (Number.isFinite(x) && x >= 0) nums.add(x); };

    const full = Number(s);
    add(full);

    // last 3 digits (very common fix: 8390 -> 390, 8890 -> 890)
    if (s.length >= 3) add(Number(s.slice(-3)));
    if (s.length >= 4) add(Number(s.slice(-3))); // keep
    if (s.length >= 4) add(Number(s.slice(1)));  // drop first digit
    if (s.length >= 4) add(Number(s.slice(0, 3))); // first 3 digits

    // remove one digit at each position
    if (s.length >= 2) {
      for (let i = 0; i < s.length; i++) {
        const t = (s.slice(0, i) + s.slice(i + 1));
        if (t) add(Number(t));
      }
    }

    // if ends with 0, try removing trailing 0
    if (s.endsWith('0') && s.length >= 2) add(Number(s.slice(0, -1)));

    return [...nums].filter(x => x <= 20000).sort((a, b) => a - b);
  }

  function repairBonusUsingOracle(parsed, rangesObj, warnings, label) {
    if (!parsed?.ok) return parsed;
    if (parsed.isPercent) return parsed;
    if (parsed.bonus == null) return parsed;
    if (!rangesObj) return parsed;

    const displayed = parsed.displayed;
    if (!Number.isFinite(displayed)) return parsed;

    const base0 = displayed - parsed.bonus;
    const p0 = minTierPenalty(base0, rangesObj);

    // if already good (fits some tier) and base not negative, keep
    if (p0 === 0 && base0 >= 0) return parsed;

    // try candidates
    const cands = genBonusCandidates(parsed.bonus);
    if (!cands.length) return parsed;

    let best = { bonus: parsed.bonus, base: base0, pen: p0 };

    for (const b of cands) {
      const base = displayed - b;
      if (!Number.isFinite(base)) continue;
      if (base < 0) continue;
      const pen = minTierPenalty(base, rangesObj);
      if (pen < best.pen) best = { bonus: b, base, pen };
      // early if perfect
      if (pen === 0) {
        best = { bonus: b, base, pen };
        break;
      }
    }

    // accept if improved significantly OR fixed negative base
    const improved = (best.pen + 1e-9) < (p0 - 0.05);
    const fixedNegative = (base0 < 0 && best.base >= 0 && best.pen < 9999);

    if ((improved || fixedNegative) && best.bonus !== parsed.bonus) {
      warnings.push(`• ${label} bonus corrected: ${formatNumberInt(parsed.bonus)} -> ${formatNumberInt(best.bonus)}`);
      return { ...parsed, bonus: best.bonus, base: best.base };
    }

    return parsed;
  }

  // --------------------------
  // Post-processing (validate/correct)
  // --------------------------
  function extractPlusFromName(rawName) {
    const s = _s(rawName);
    if (!s) return { clean: '', plus: 0, hadPlus: false };

    const m = s.match(/^(.*?)(?:\s*\+\s*([0-4]))\s*$/);
    if (m) return { clean: _s(m[1]), plus: Number(m[2]), hadPlus: true };

    const m2 = s.match(/^(.*?)(?:\s*\+\s*)$/);
    if (m2) return { clean: _s(m2[1]), plus: 0, hadPlus: true };

    return { clean: s, plus: 0, hadPlus: false };
  }

  function fixGearPlus(rawGear) {
    let g = _s(rawGear);
    if (!g) return g;

    g = g.replace(/[^\w\s()%+.\-\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    g = g.replace(/\)+\s*$/g, ''); // remove trailing )
    g = g.replace(/\(\s*\)\s*$/g, ''); // remove trailing "()"

    if (!PREPROCESSING.ASSUME_GEAR_MAX_PLUS) return g;

    g = g.replace(/\+\s*\(\s*\)/g, '+20');
    g = g.replace(/\+\s*\(/g, '+20');
    g = g.replace(/\+\s*\[/g, '+20');
    g = g.replace(/\+\s*\{.*?\}/g, '+20');
    g = g.replace(/\+\s*2\s*[\(\[]/g, '+20');
    g = g.replace(/\+\s*2(\s*$)/g, '+20');

    // also fix "+20)" or "+20]"
    g = g.replace(/\+20[\)\]]/g, '+20');

    return g;
  }

  function parseLv(rawLv) {
    const s = _s(rawLv);
    const m = s.match(/lv\.?\s*(\d{1,3})/i);
    if (!m) return '';
    return `Lv.${Number(m[1])}`;
  }

  function inferMainExpected(slotObj, mainName) {
    const expected = slotObj?.main?.[mainName];
    if (expected == null) return null;

    if (typeof expected === 'number') {
      const isPercent = /\(%\)/.test(mainName) || expected < 100;
      return { value: expected, isPercent };
    }

    if (typeof expected === 'string') {
      if (expected.includes('%')) return { value: Number(expected.replace('%', '')), isPercent: true };
      const n = Number(expected);
      if (Number.isFinite(n)) return { value: n, isPercent: false };
    }

    return null;
  }

  function validateWithOracle(raw, confByKey, oracle) {
    const warnings = [];
    const fixed = { ...raw };

    // LV
    fixed.LV_BLOCK = parseLv(raw.LV_BLOCK) || _s(raw.LV_BLOCK);

    // Gear name
    fixed.GEAR_NAME = fixGearPlus(raw.GEAR_NAME);

    // Slot detect
    const slot = detectSlotFromGear(fixed.GEAR_NAME, oracle);
    const slotObj = slot ? oracle?.[slot] : null;

    // Equip Score
    const esParsed = parseDisplayedAndBonus(raw.EQUIP_SCORE, false, null);
    fixed.EQUIP_SCORE = esParsed.ok ? formatNumberInt(esParsed.displayed) : _s(raw.EQUIP_SCORE).replace(/[^\d]/g, '');

    // MAIN name match
    let mainName = _s(raw.MAIN_STAT_NAME);
    if (slotObj?.main) {
      const candidates = Object.keys(slotObj.main);
      const bm = bestMatch(mainName, candidates);
      if (bm.best && bm.score >= 0.72 && bm.best !== mainName) {
        warnings.push(`• MAIN name corrected: "${mainName}" -> "${bm.best}" (score ${(bm.score).toFixed(2)})`);
        mainName = bm.best;
      }
    }
    fixed.MAIN_STAT_NAME = mainName;

    // MAIN value validate (strict)
    const mainExpected = (slotObj && mainName) ? inferMainExpected(slotObj, mainName) : null;
    const mainValRaw = _s(raw.MAIN_STAT_VAL);
    const mainParsed = parseDisplayedAndBonus(mainValRaw, mainExpected?.isPercent, mainExpected ? { isPercent: mainExpected.isPercent } : null);

    if (mainExpected) {
      const exp = mainExpected.value;
      const expIsP = !!mainExpected.isPercent;

      let ok = false;
      if (mainParsed.ok) {
        if (expIsP) {
          const v = mainParsed.displayed;
          ok = Number.isFinite(v) && Math.abs(v - exp) <= 0.30;
        } else {
          const v = mainParsed.displayed;
          ok = Number.isFinite(v) && Math.abs(v - exp) <= 8;
        }
      }

      if (!ok) {
        warnings.push('• MAIN value was missing/invalid -> filled from Oracle data');
        fixed.MAIN_STAT_VAL = expIsP ? formatPercent(exp, 2) : formatNumberInt(exp);
      } else {
        fixed.MAIN_STAT_VAL = expIsP ? formatPercent(mainParsed.displayed, 2) : formatNumberInt(mainParsed.displayed);
      }
    } else {
      if (mainParsed.ok) {
        fixed.MAIN_STAT_VAL = mainParsed.isPercent ? formatPercent(mainParsed.displayed, 2) : formatNumberInt(mainParsed.displayed);
      } else {
        fixed.MAIN_STAT_VAL = mainValRaw;
      }
    }

    // SUBS
    const subs = [];
    const subOut = [];
    const subCandidates = slotObj?.sub ? Object.keys(slotObj.sub) : [];

    for (let i = 1; i <= 4; i++) {
      const nk = `SUB${i}_NAME`;
      const vk = `SUB${i}_VAL`;

      const nameRaw = _s(raw[nk]);
      const valRaw = _s(raw[vk]);
      const nameConf = Number(confByKey?.[nk]) || 0;

      const { clean: cleanNameRaw, plus: ocrPlus, hadPlus } = extractPlusFromName(nameRaw);

      let matchedName = cleanNameRaw;
      let matchScore = 0;

      if (subCandidates.length) {
        const bm = bestMatch(cleanNameRaw, subCandidates);
        matchedName = bm.best || cleanNameRaw;
        matchScore = bm.score || 0;

        const likelyBroken = /[^\w()% ]/.test(nameRaw) || nameConf < 45;
        if (matchedName && matchedName !== cleanNameRaw && (matchScore >= 0.78 || (likelyBroken && matchScore >= 0.70))) {
          warnings.push(`• SUB${i} name corrected: "${nameRaw}" -> "${matchedName}" (score ${(matchScore).toFixed(2)})`);
        }
      }

      const rangesObj = slotObj?.sub?.[matchedName] || null;
      const isPercent = rangesObj ? statIsPercentFromOracleRanges(rangesObj) : /%/.test(matchedName);

      let maxExpected = null;
      if (rangesObj) {
        const r4 = rangesObj['4'];
        if (r4) maxExpected = Number(r4.max);
      }

      let parsed = parseDisplayedAndBonus(valRaw, isPercent, { isPercent, maxExpected });

      if (!parsed.ok) {
        warnings.push(`• SUB${i} value missing (OCR empty/invalid)`);
      } else {
        // IMPORTANT: Repair bonus using oracle tiers (displayed - bonus must fit)
        parsed = repairBonusUsingOracle(parsed, rangesObj, warnings, `SUB${i}`);
      }

      subs.push({
        i,
        matchedName,
        rangesObj,
        isPercent,
        parsed,
        nameConf,
        ocrPlus: hadPlus ? ocrPlus : null,
      });
    }

    // Best tiers sum 4
    if (slotObj?.sub) {
      const subInfos = subs.map(s => ({
        base: s.parsed?.ok ? s.parsed.base : NaN,
        rangesObj: s.rangesObj,
        nameConf: s.nameConf,
        ocrPlus: s.ocrPlus,
      }));

      const sol = bestTiersSum4(subInfos);

      if (sol) {
        const chosenSum = sol.path.reduce((a, b) => a + b, 0);
        if (chosenSum === 4) {
          // warn if OCR sum differs noticeably
          const ocrSum = subInfos.reduce((a, x) => a + (Number.isFinite(x.ocrPlus) ? x.ocrPlus : 0), 0);
          if (ocrSum !== 4) warnings.push('• SUB + distribution adjusted (rule: sum of + across substats = 4)');
        }

        for (let idx = 0; idx < 4; idx++) {
          const s = subs[idx];
          const chosen = sol.path[idx];

          if (s.ocrPlus != null && s.ocrPlus !== chosen) {
            if (s.rangesObj && (s.parsed?.ok || s.nameConf >= 55)) {
              warnings.push(`• SUB${s.i} + corrected: +${s.ocrPlus} -> +${chosen}`);
            }
          }

          const finalValText = s.parsed?.ok ? formatDisplayedBonus(s.parsed) : '';
          subOut.push({ i: s.i, name: s.matchedName, plus: chosen, valueText: finalValText });
        }
      } else {
        for (const s of subs) {
          const p = clamp(Number(s.ocrPlus) || 0, 0, 4);
          subOut.push({ i: s.i, name: s.matchedName, plus: p, valueText: s.parsed?.ok ? formatDisplayedBonus(s.parsed) : '' });
        }
      }
    } else {
      for (const s of subs) {
        const p = clamp(Number(s.ocrPlus) || 0, 0, 4);
        subOut.push({ i: s.i, name: s.matchedName, plus: p, valueText: s.parsed?.ok ? formatDisplayedBonus(s.parsed) : _s(raw[`SUB${s.i}_VAL`]) });
      }
    }

    for (const s of subOut) {
      fixed[`SUB${s.i}_NAME`] = `${s.name} +${s.plus}`.trim();
      fixed[`SUB${s.i}_VAL`] = s.valueText || '';
    }

    return { fixed, warnings, slot: slot || null };
  }

  // --------------------------
  // Text output
  // --------------------------
  function buildSimpleText(ocrText) {
    const lines = [];
    const lv = _s(ocrText.LV_BLOCK);
    const g = _s(ocrText.GEAR_NAME);
    const es = _s(ocrText.EQUIP_SCORE);
    const mn = _s(ocrText.MAIN_STAT_NAME);
    const mv = _s(ocrText.MAIN_STAT_VAL);

    if (lv) lines.push(lv);
    if (g) lines.push(`GEAR: ${g}`);
    if (es) lines.push(`ES: ${es}`);
    if (mn || mv) lines.push(`MAIN: ${mn} ${mv}`.trim());

    for (let i = 1; i <= 4; i++) {
      const sn = _s(ocrText[`SUB${i}_NAME`]);
      const sv = _s(ocrText[`SUB${i}_VAL`]);
      if (sn || sv) lines.push(`SUB${i}: ${sn} ${sv}`.trim());
    }
    return lines.join('\n');
  }

  function buildDebugBlock(rawText, warnings) {
    const parts = [];
    parts.push('— Raw OCR —');
    parts.push(buildSimpleText(rawText) || '(empty)');
    parts.push('');
    parts.push('— Warnings / corrections —');
    if (!warnings?.length) parts.push('(none)');
    else parts.push(...warnings);
    return parts.join('\n');
  }

  // --------------------------
  // Styles
  // --------------------------
  function injectStyles() {
    if (qs('#oracle-v2-style')) return;
    const s = el('style', { id: 'oracle-v2-style' });
    s.textContent = `
      .oracle-wrap{max-width:1300px;margin:0 auto;padding:16px;color:#e5e7eb}
      .oracle-grid{display:grid;grid-template-columns:520px 1fr;gap:14px}
      @media (max-width:1100px){.oracle-grid{grid-template-columns:1fr}}
      .card{border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.55);border-radius:16px;overflow:hidden}
      .head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.16)}
      .title{font-weight:900;font-size:16px}
      .sub{font-weight:800;font-size:12px;opacity:.85}
      .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 14px}
      .btn{height:36px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.6);color:#fff;font-weight:900;cursor:pointer}
      .btn.primary{border-color:rgba(59,130,246,.35);background:rgba(59,130,246,.12)}
      .btn.ghost{background:rgba(15,23,42,.25)}
      .pill{padding:6px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.35);font-size:12px;font-weight:900;opacity:.92}
      .paste{margin:12px 14px;border:1px solid rgba(148,163,184,.20);border-radius:12px;min-height:260px;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
      .paste img{width:100%;height:auto;display:block}
      .tog{margin:0 14px 12px 14px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px;font-weight:900;opacity:.92}
      .tog label{display:flex;gap:8px;align-items:center;cursor:pointer;user-select:none}
      .box{margin:12px 14px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(2,6,23,.35);padding:10px 12px}
      .mono{width:100%;min-height:160px;resize:vertical;border:0;outline:none;background:transparent;color:#e5e7eb;
        font:12px ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;white-space:pre}
      .cuts{margin:12px 14px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(2,6,23,.35);overflow:hidden}
      .cutsHead{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.16);font-weight:900;font-size:12px;opacity:.92;display:flex;align-items:center;justify-content:space-between}
      .cutsGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px}
      @media (max-width:700px){.cutsGrid{grid-template-columns:1fr}}
      .cutCard{border:1px solid rgba(148,163,184,.16);border-radius:12px;overflow:hidden;background:rgba(15,23,42,.30)}
      .cutTitle{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.16);font-weight:900;font-size:12px;opacity:.95;display:flex;flex-direction:column;gap:4px}
      .cutTop{display:flex;justify-content:space-between;gap:10px}
      .cutRead{font-weight:800;font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cutImg{width:100%;height:auto;display:block;background:#000}
      .bar{margin:12px 14px 0 14px;border-radius:12px;padding:10px 12px;font-weight:900;display:none;white-space:pre-line}
      .bar.ok{display:block;border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.10)}
      .bar.err{display:block;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.10)}
      .note{margin:0 14px 12px 14px;font-size:12px;font-weight:900;opacity:.85;line-height:1.35;white-space:pre-line}

      /* Coordinate Picker v2 */
      .cpBack{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999}
      .cpModal{width:95vw;height:92vh;background:rgba(2,6,23,.95);border:1px solid rgba(148,163,184,.18);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
      .cpHead{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.16);display:flex;justify-content:space-between;align-items:center}
      .cpTitle{font-weight:900}
      .cpBody{flex:1;min-height:0;display:flex}
      .cpLeft{width:340px;border-right:1px solid rgba(148,163,184,.16);padding:12px 14px;overflow:auto}
      .cpRight{flex:1;min-width:0;padding:12px 14px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
      .cpHelp{font-size:12px;font-weight:900;opacity:.85;white-space:pre-line;margin-bottom:10px}
      .cpStep{width:100%;text-align:left;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.35);color:#fff;font-weight:900;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:10px}
      .cpStep.active{border-color:rgba(59,130,246,.45);background:rgba(59,130,246,.12)}
      .cpDot{width:10px;height:10px;border-radius:999px;display:inline-block;box-shadow:0 0 0 2px rgba(0,0,0,.35)}
      .cpCoords{margin-top:10px;padding:10px 12px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.25);font-size:12px;font-weight:900;opacity:.9;white-space:pre-line}
      .cpToolbar{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .cpTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .cpPill{padding:6px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.35);font-size:12px;font-weight:900;opacity:.92}
      .cpViewport{flex:1;min-height:0;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#000;overflow:auto;position:relative}
      .cpStage{position:relative;transform-origin:top left;display:inline-block}
      .cpCanvas{display:block;max-width:none}
      .cpRectLayer{position:absolute;inset:0;pointer-events:none}
      .cpRect{position:absolute;border:2px solid rgba(255,255,255,.7);border-radius:6px;box-shadow:0 0 0 2px rgba(0,0,0,.35) inset}
      .cpRect.active{border-width:3px;box-shadow:0 0 0 2px rgba(0,0,0,.35) inset,0 0 16px rgba(255,255,255,.15)}
      .cpCursorPan{cursor:grab}
      .cpCursorPanActive{cursor:grabbing}
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // Main mount
  // --------------------------
  function mount() {
    injectStyles();
    const content = qs('#content');
    if (!content) return;

    const state = {
      fileName: '',
      rawDataUrl: '',
      img: null,
      baseCanvas: null,

      rectsFrac: loadRects(),

      // crops displayed in "What OCR Sees"
      crops: {},

      // OCR best results
      ocrText: {},
      ocrConf: {},
      ocrMeta: {}, // {key:{thr,inv,mode}} for debug
      confAvg: null,

      showImage: true,
      showText: true,
      showCuts: true,
    };

    const fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

    const left = el('div', { class: 'card' },
      el('div', { class: 'head' },
        el('div', {}, el('div', { class: 'title' }, 'Oracle OCR v2.4'), el('div', { class: 'sub' }, 'multi-pass VALUE OCR • bonus repair • PSM 6/7/8')),
        el('div', { class: 'pill', id: '__st' }, 'idle')
      ),
      el('div', { class: 'note' },
        'Jeśli value czasem jest puste: teraz OCR robi kilka prób (różne PSM / threshold / invert) i bierze najlepszy wynik.\n' +
        'Jeśli bonus jest dziwny (np. +8390): teraz jest naprawiany pod Oracle tier ranges tak, aby base=displayed-bonus pasowało.\n'
      ),
      el('div', { class: 'tog' },
        el('label', {}, el('input', { type: 'checkbox', checked: true, onchange: (e) => { state.showImage = e.target.checked; renderPaste(); } }), 'Show pasted image'),
        el('label', {}, el('input', { type: 'checkbox', checked: true, onchange: (e) => { state.showText = e.target.checked; renderTextBox(); } }), 'Show OCR recognized text'),
        el('label', {}, el('input', { type: 'checkbox', checked: true, onchange: (e) => { state.showCuts = e.target.checked; renderCuts(); } }), 'Show what OCR sees (cropped inputs)'),
      ),
      el('div', { class: 'paste', id: '__paste' },
        el('div', { class: 'sub', style: { padding: '12px', textAlign: 'center' } }, 'Paste (CTRL+V) or click Upload')
      ),
      el('div', { class: 'row', style: { paddingTop: 0 } },
        el('button', { class: 'btn primary', type: 'button', onclick: () => fileInput.click() }, 'Upload'),
        el('button', { class: 'btn', type: 'button', onclick: () => runOCR() }, 'Run OCR'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => openPicker() }, 'Measure Coordinates'),
        el('button', { class: 'btn', type: 'button', onclick: () => rebuildCropsOnly() }, 'Rebuild crops'),
        el('button', { class: 'btn', type: 'button', onclick: () => resetRects() }, 'Reset rects'),
        el('button', { class: 'btn', type: 'button', onclick: () => clearAll() }, 'Clear'),
      ),
      el('div', { class: 'bar ok', id: '__ok' }, ''),
      el('div', { class: 'bar err', id: '__err' }, ''),
      fileInput
    );

    const right = el('div', { class: 'card' },
      el('div', { class: 'head' },
        el('div', {}, el('div', { class: 'title' }, 'Recognized Text'), el('div', { class: 'sub', id: '__meta' }, '—')),
        el('div', { class: 'pill', id: '__conf' }, 'conf: —')
      ),
      el('div', { class: 'box', id: '__txtBox', style: { display: 'none' } },
        el('textarea', { class: 'mono', id: '__txt', readonly: true })
      ),
      el('div', { class: 'cuts', id: '__cutsWrap', style: { display: 'none' } },
        el('div', { class: 'cutsHead' },
          el('div', {}, 'What OCR Sees'),
          el('div', { class: 'sub' }, 'Preprocessed crop inputs • conf + read text')
        ),
        el('div', { class: 'cutsGrid', id: '__cuts' })
      )
    );

    content.innerHTML = '';
    content.append(el('div', { class: 'oracle-wrap' }, el('div', { class: 'oracle-grid' }, left, right)));

    // --------------------------
    // UI helpers
    // --------------------------
    function setStatus(t) { qs('#__st').textContent = t; }
    function showOk(msg) {
      const ok = qs('#__ok');
      const er = qs('#__err');
      ok.textContent = msg || '';
      ok.style.display = msg ? 'block' : 'none';
      er.style.display = 'none';
    }
    function showErr(msg) {
      const ok = qs('#__ok');
      const er = qs('#__err');
      er.textContent = msg || '';
      er.style.display = msg ? 'block' : 'none';
      ok.style.display = 'none';
    }

    function renderPaste() {
      const host = qs('#__paste');
      host.innerHTML = '';

      if (!state.showImage) {
        host.append(el('div', { class: 'sub', style: { padding: '12px', textAlign: 'center' } }, 'Image hidden'));
        return;
      }
      if (!state.rawDataUrl) {
        host.append(el('div', { class: 'sub', style: { padding: '12px', textAlign: 'center' } }, 'Paste (CTRL+V) or click Upload'));
        return;
      }
      host.append(el('img', { src: state.rawDataUrl, alt: 'pasted' }));
    }

    function renderTextBox() {
      qs('#__txtBox').style.display = state.showText ? 'block' : 'none';
    }

    function renderCuts() {
      const wrap = qs('#__cutsWrap');
      const grid = qs('#__cuts');

      if (!state.showCuts || !Object.keys(state.crops || {}).length) {
        wrap.style.display = 'none';
        grid.innerHTML = '';
        return;
      }

      const order = [
        ['LV_BLOCK', 'LV (PSM 6)'],
        ['GEAR_NAME', 'Gear Name (PSM 7)'],
        ['EQUIP_SCORE', 'Equipment Score (PSM 8)'],
        ['MAIN_STAT_NAME', 'Main Stat Name (PSM 7)'],
        ['MAIN_STAT_VAL', 'Main Stat Value (PSM 8)'],
        ['SUB1_NAME', 'Sub Stat 1 Name (PSM 7)'],
        ['SUB1_VAL', 'Sub Stat 1 Value (PSM 7)'],
        ['SUB2_NAME', 'Sub Stat 2 Name (PSM 7)'],
        ['SUB2_VAL', 'Sub Stat 2 Value (PSM 7)'],
        ['SUB3_NAME', 'Sub Stat 3 Name (PSM 7)'],
        ['SUB3_VAL', 'Sub Stat 3 Value (PSM 7)'],
        ['SUB4_NAME', 'Sub Stat 4 Name (PSM 7)'],
        ['SUB4_VAL', 'Sub Stat 4 Value (PSM 7)'],
      ];

      grid.innerHTML = '';
      for (const [key, label] of order) {
        const src = state.crops[key];
        if (!src) continue;

        const conf = state.ocrConf?.[key];
        const read = _s(state.ocrText?.[key]);

        grid.append(
          el('div', { class: 'cutCard' },
            el('div', { class: 'cutTitle' },
              el('div', { class: 'cutTop' },
                el('div', {}, label),
                el('div', { class: 'sub' }, (typeof conf === 'number') ? `${conf.toFixed(0)}%` : 'N/A')
              ),
              el('div', { class: 'cutRead', title: read ? read : '' }, read ? `"${read}"` : '""')
            ),
            el('img', { class: 'cutImg', src })
          )
        );
      }

      wrap.style.display = 'block';
    }

    function clearAll() {
      state.fileName = '';
      state.rawDataUrl = '';
      state.img = null;
      state.baseCanvas = null;
      state.crops = {};
      state.ocrText = {};
      state.ocrConf = {};
      state.ocrMeta = {};
      state.confAvg = null;

      qs('#__meta').textContent = '—';
      qs('#__conf').textContent = 'conf: —';
      qs('#__txt').value = '';

      setStatus('idle');
      showOk('');
      showErr('');

      renderPaste();
      renderTextBox();
      renderCuts();
    }

    function resetRects() {
      state.rectsFrac = { ...DEFAULT_RECTS_FRAC };
      saveRects(state.rectsFrac);
      showOk('Rects reset to defaults. Now use Measure Coordinates to set your real regions.');
      rebuildCropsOnly();
    }

    // --------------------------
    // Crops (display)
    // --------------------------
    function isValueKey(key) {
      return (
        key.endsWith('_VAL') ||
        key === 'EQUIP_SCORE' ||
        key === 'MAIN_STAT_VAL' ||
        key === 'SUB1_VAL' || key === 'SUB2_VAL' || key === 'SUB3_VAL' || key === 'SUB4_VAL'
      );
    }

    function rebuildCropsOnly() {
      if (!state.baseCanvas) return;
      const rectsFrac = state.rectsFrac || {};

      const out = {};
      for (const [key, rf] of Object.entries(rectsFrac)) {
        const rectPx = rectFracToPx(rf);

        const forValues = isValueKey(key);
        const isBlock = (key === 'LV_BLOCK');
        const scale = forValues ? SCALE_VALUE : (isBlock ? SCALE_NAME : SCALE_NAME);

        // displayed crops always use default preprocessing (black bg for values)
        out[key] = cropToDataURL(state.baseCanvas, rectPx, scale, {
          forValues,
          threshold: PREPROCESSING.BINARIZE_THRESHOLD,
          valueWhiteOnBlack: PREPROCESSING.VALUES_WHITE_ON_BLACK,
        });
      }

      state.crops = out;
      renderCuts();
    }

    function makeCropFnForKey(key) {
      const rf = state.rectsFrac?.[key];
      if (!rf || !state.baseCanvas) return null;

      const rectPx = rectFracToPx(rf);
      const forValues = isValueKey(key);
      const isBlock = (key === 'LV_BLOCK');
      const scale = forValues ? SCALE_VALUE : (isBlock ? SCALE_NAME : SCALE_NAME);

      return ({ threshold, valueWhiteOnBlack } = {}) => {
        return cropToDataURL(state.baseCanvas, rectPx, scale, {
          forValues,
          threshold,
          valueWhiteOnBlack,
        });
      };
    }

    // --------------------------
    // Ingest image
    // --------------------------
    function readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    }

    async function handleImageFile(file, autoOCR) {
      try {
        showOk('');
        showErr('');
        setStatus('loading image...');

        state.fileName = file?.name || 'pasted-image.png';
        state.rawDataUrl = await readFileAsDataURL(file);
        state.img = await loadImage(state.rawDataUrl);

        const norm = normalizeTo1920x1080(state.img);
        if (!norm.canvas) {
          setStatus('error');
          showErr(norm.error || 'Unsupported screenshot.');
          return;
        }

        state.baseCanvas = norm.canvas;
        qs('#__meta').textContent = `${norm.srcW}×${norm.srcH} → 1920×1080 • ${state.fileName}`;

        rebuildCropsOnly();
        renderPaste();
        renderTextBox();

        setStatus('ready');
        if (autoOCR) runOCR();
      } catch (e) {
        console.error(e);
        setStatus('error');
        showErr('Failed to load image.');
      }
    }

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      await handleImageFile(f, true);
    });

    window.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items || [];
      const imgItem = [...items].find(it => it.type && it.type.startsWith('image/'));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      await handleImageFile(file, true);
    });

    // --------------------------
    // OCR run (with fallback for VALUE)
    // --------------------------
    async function runOCR() {
      try {
        if (!state.baseCanvas || !state.rectsFrac) {
          showErr('No image. Paste or upload first.');
          return;
        }

        showOk('');
        showErr('');
        setStatus('loading OCR engine...');
        await ensureTesseract();

        const tasks = [
          { key: 'LV_BLOCK', mode: 'LV_BLOCK', kind: 'BLOCK' },
          { key: 'GEAR_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'EQUIP_SCORE', mode: 'VALUE_WORD', kind: 'VALUE' },

          { key: 'MAIN_STAT_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'MAIN_STAT_VAL', mode: 'VALUE_WORD', kind: 'VALUE' },

          { key: 'SUB1_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'SUB1_VAL', mode: 'VALUE_LINE', kind: 'VALUE' },

          { key: 'SUB2_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'SUB2_VAL', mode: 'VALUE_LINE', kind: 'VALUE' },

          { key: 'SUB3_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'SUB3_VAL', mode: 'VALUE_LINE', kind: 'VALUE' },

          { key: 'SUB4_NAME', mode: 'NAME_LINE', kind: 'NAME' },
          { key: 'SUB4_VAL', mode: 'VALUE_LINE', kind: 'VALUE' },
        ];

        const ocrText = {};
        const ocrConf = {};
        const ocrMeta = {};
        const confs = [];

        for (const t of tasks) {
          const makeFn = makeCropFnForKey(t.key);
          if (!makeFn) continue;

          setStatus(`OCR ${t.key}...`);

          if (t.kind === 'VALUE') {
            const best = await ocrValueWithFallback(makeFn, t.mode, t.key, (m) => {
              if (m?.status === 'recognizing text') {
                const p = Math.round((m.progress || 0) * 100);
                setStatus(`OCR ${t.key}... ${p}%`);
              }
            });

            ocrText[t.key] = best.text;
            ocrConf[t.key] = best.confidence;
            ocrMeta[t.key] = best.used;
            confs.push(best.confidence);
          } else {
            // single pass for names/blocks
            const dataUrl = makeFn({
              threshold: PREPROCESSING.BINARIZE_THRESHOLD,
              valueWhiteOnBlack: PREPROCESSING.VALUES_WHITE_ON_BLACK,
            });

            const res = await ocrOnce(dataUrl, t.mode, (m) => {
              if (m?.status === 'recognizing text') {
                const p = Math.round((m.progress || 0) * 100);
                setStatus(`OCR ${t.key}... ${p}%`);
              }
            });

            ocrText[t.key] = res.text;
            ocrConf[t.key] = res.confidence;
            ocrMeta[t.key] = { thr: PREPROCESSING.BINARIZE_THRESHOLD, inv: PREPROCESSING.VALUES_WHITE_ON_BLACK, mode: t.mode };
            confs.push(res.confidence);
          }
        }

        state.ocrText = ocrText;
        state.ocrConf = ocrConf;
        state.ocrMeta = ocrMeta;
        state.confAvg = confs.length ? (confs.reduce((a, b) => a + b, 0) / confs.length) : null;

        // Validate
        const oracle = await loadOracleJSON();
        let finalText = '';
        let debug = '';

        if (oracle) {
          const rawForDebug = { ...ocrText };
          const v = validateWithOracle(ocrText, ocrConf, oracle);
          const fixed = v.fixed;

          finalText = buildSimpleText(fixed);
          debug = buildDebugBlock(rawForDebug, v.warnings);

          qs('#__txt').value = `${finalText}\n\n${debug}`;
        } else {
          finalText = buildSimpleText(ocrText);
          qs('#__txt').value = finalText;
        }

        qs('#__conf').textContent = (typeof state.confAvg === 'number')
          ? `conf: ${state.confAvg.toFixed(1)}%`
          : 'conf: —';

        renderTextBox();
        renderCuts();

        setStatus('saving...');
        const result = {
          ts: Date.now(),
          fileName: state.fileName,
          preprocessing: { ...PREPROCESSING },
          ocrFallback: { ...OCR_FALLBACK },
          rects: state.rectsFrac,
          confidence: { avg: state.confAvg, byKey: state.ocrConf },
          raw: state.ocrText,
          used: state.ocrMeta,
          text: qs('#__txt').value,
        };

        const api = await submitToApi({ result, text: qs('#__txt').value });

        if (api?.ok) {
          showOk(`OCR complete.\nSaved to API: yes\nAvg confidence: ${typeof state.confAvg === 'number' ? state.confAvg.toFixed(1) : '—'}%`);
        } else {
          showOk(`OCR complete.\nSaved to API: failed\nAvg confidence: ${typeof state.confAvg === 'number' ? state.confAvg.toFixed(1) : '—'}%`);
        }

        setStatus('done');
      } catch (e) {
        console.error(e);
        setStatus('error');
        showErr(`OCR failed: ${String(e?.message || e)}`);
      }
    }

    // --------------------------
    // Coordinate Picker v2 (unchanged)
    // --------------------------
    function openPicker() {
      if (!state.baseCanvas) {
        showErr('Paste/upload screenshot first (so picker has an image).');
        return;
      }

      const regions = [
        { key: 'GEAR_NAME', label: 'Gear Name Region' },
        { key: 'EQUIP_SCORE', label: 'Equipment Score' },
        { key: 'MAIN_STAT_NAME', label: 'Main Stat Name' },
        { key: 'MAIN_STAT_VAL', label: 'Main Stat Value' },
        { key: 'SUB1_NAME', label: 'Sub Stat 1 Name' },
        { key: 'SUB1_VAL', label: 'Sub Stat 1 Value' },
        { key: 'SUB2_NAME', label: 'Sub Stat 2 Name' },
        { key: 'SUB2_VAL', label: 'Sub Stat 2 Value' },
        { key: 'SUB3_NAME', label: 'Sub Stat 3 Name' },
        { key: 'SUB3_VAL', label: 'Sub Stat 3 Value' },
        { key: 'SUB4_NAME', label: 'Sub Stat 4 Name' },
        { key: 'SUB4_VAL', label: 'Sub Stat 4 Value' },
        { key: 'LV_BLOCK', label: 'LV Block (optional)' },
      ];

      const REGION_COLORS = {
        GEAR_NAME: '#38bdf8',
        EQUIP_SCORE: '#f59e0b',
        MAIN_STAT_NAME: '#a78bfa',
        MAIN_STAT_VAL: '#22c55e',
        SUB1_NAME: '#60a5fa',
        SUB1_VAL: '#34d399',
        SUB2_NAME: '#fb7185',
        SUB2_VAL: '#f97316',
        SUB3_NAME: '#c084fc',
        SUB3_VAL: '#eab308',
        SUB4_NAME: '#94a3b8',
        SUB4_VAL: '#f43f5e',
        LV_BLOCK: '#10b981',
      };

      let activeKey = regions[0].key;
      let scale = 0.75;

      const back = el('div', { class: 'cpBack' });
      const modal = el('div', { class: 'cpModal' });

      let cleanupFns = [];

      const close = () => {
        for (const fn of cleanupFns) { try { fn(); } catch {} }
        back.remove();
      };

      const head = el('div', { class: 'cpHead' },
        el('div', { class: 'cpTitle' }, 'Coordinate Picker'),
        el('button', { class: 'btn', onclick: close }, 'Close')
      );

      const coordsBox = el('div', { class: 'cpCoords', id: '__cpCoords' }, '');

      const leftPanel = el('div', { class: 'cpLeft' },
        el('div', { class: 'cpHelp' },
          'DRAW: LMB drag (bez spacji)\n' +
          'PAN: SPACE + LMB drag lub MMB drag\n' +
          'ZOOM: Ctrl + scroll\n' +
          'TIP: Fit ustawia najlepszy zoom\n'
        ),
        ...regions.map(r =>
          el('button', {
            class: `cpStep ${r.key === activeKey ? 'active' : ''}`,
            onclick: (ev) => {
              activeKey = r.key;
              [...leftPanel.querySelectorAll('.cpStep')].forEach(b => b.classList.remove('active'));
              ev.currentTarget.classList.add('active');
              updateCoordsBox();
              renderRects();
            }
          },
            el('span', { class: 'cpDot', style: { background: (REGION_COLORS[r.key] || '#fff') } }),
            r.label
          )
        ),
        coordsBox
      );

      const rightPanel = el('div', { class: 'cpRight' });

      const pillActive = el('div', { class: 'cpPill', id: '__cpActive' }, `Active: ${activeKey}`);
      const pillZoom = el('div', { class: 'cpPill', id: '__cpZoom' }, `Zoom: ${Math.round(scale * 100)}%`);

      const btnMinus = el('button', { class: 'btn', onclick: () => setZoom(scale * 0.9) }, '−');
      const btnPlus = el('button', { class: 'btn', onclick: () => setZoom(scale * 1.1) }, '+');
      const btnFit = el('button', { class: 'btn', onclick: () => fitToView() }, 'Fit');

      const toolbar = el('div', { class: 'cpToolbar' },
        el('div', { class: 'cpTools' }, pillActive, pillZoom),
        el('div', { class: 'cpTools' }, btnMinus, btnPlus, btnFit)
      );

      const viewport = el('div', { class: 'cpViewport' });
      const stage = el('div', { class: 'cpStage' });

      const c = document.createElement('canvas');
      c.className = 'cpCanvas';
      c.width = TARGET_W;
      c.height = TARGET_H;

      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(state.baseCanvas, 0, 0);

      const rectLayer = el('div', { class: 'cpRectLayer' });

      stage.append(c, rectLayer);
      viewport.append(stage);
      rightPanel.append(toolbar, viewport);

      const body = el('div', { class: 'cpBody' }, leftPanel, rightPanel);

      modal.append(head, body);
      back.append(modal);
      document.body.append(back);

      function setZoom(z) {
        scale = clamp(z, 0.2, 4);
        stage.style.transform = `scale(${scale})`;
        pillZoom.textContent = `Zoom: ${Math.round(scale * 100)}%`;
        renderRects();
      }

      function fitToView() {
        const vp = viewport.getBoundingClientRect();
        const pad = 24;
        const maxW = Math.max(200, vp.width - pad);
        const maxH = Math.max(200, vp.height - pad);
        const s = Math.min(maxW / TARGET_W, maxH / TARGET_H, 1);
        setZoom(s);
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }

      function updateCoordsBox() {
        pillActive.textContent = `Active: ${activeKey}`;
        const rf = state.rectsFrac?.[activeKey];
        const rp = rf ? rectFracToPx(rf) : null;
        coordsBox.textContent =
          `Active: ${activeKey}\n` +
          (rp ? `px: x=${rp.x}, y=${rp.y}, w=${rp.w}, h=${rp.h}\nfrac: ${JSON.stringify(rf)}`
              : 'not set yet');
      }

      function renderRects(tempRectPx = null) {
        rectLayer.innerHTML = '';

        for (const [k, rf] of Object.entries(state.rectsFrac || {})) {
          const rp = rectFracToPx(rf);
          const col = REGION_COLORS[k] || '#fff';

          rectLayer.append(
            el('div', {
              class: `cpRect ${k === activeKey ? 'active' : ''}`,
              style: {
                left: `${rp.x}px`,
                top: `${rp.y}px`,
                width: `${rp.w}px`,
                height: `${rp.h}px`,
                borderColor: col,
              }
            })
          );
        }

        if (tempRectPx) {
          const col = REGION_COLORS[activeKey] || '#fff';
          rectLayer.append(
            el('div', {
              class: 'cpRect active',
              style: {
                left: `${tempRectPx.x}px`,
                top: `${tempRectPx.y}px`,
                width: `${tempRectPx.w}px`,
                height: `${tempRectPx.h}px`,
                borderColor: col,
              }
            })
          );
        }
      }

      function getMousePos(e) {
        const st = stage.getBoundingClientRect();
        const xScaled = e.clientX - st.left;
        const yScaled = e.clientY - st.top;
        const x = Math.round(xScaled / scale);
        const y = Math.round(yScaled / scale);
        return { x: clamp(x, 0, TARGET_W), y: clamp(y, 0, TARGET_H) };
      }

      let spaceHeld = false;
      let mode = null; // 'pan' | 'draw'
      let start = null;
      let last = null;
      let panStart = null;

      function setPanCursor(active) {
        if (active) viewport.classList.add('cpCursorPan');
        else viewport.classList.remove('cpCursorPan');
      }
      function setPanCursorActive(active) {
        if (active) viewport.classList.add('cpCursorPanActive');
        else viewport.classList.remove('cpCursorPanActive');
      }

      const onKeyDown = (e) => {
        if (e.key === ' ') {
          spaceHeld = true;
          setPanCursor(true);
          e.preventDefault();
        }
        if (e.key === 'Escape') close();
      };
      const onKeyUp = (e) => {
        if (e.key === ' ') {
          spaceHeld = false;
          setPanCursor(false);
          setPanCursorActive(false);
        }
      };
      window.addEventListener('keydown', onKeyDown, { passive: false });
      window.addEventListener('keyup', onKeyUp, { passive: false });
      cleanupFns.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });

      const onMouseDown = (e) => {
        const isMMB = (e.button === 1);
        const isLMB = (e.button === 0);
        if (!isLMB && !isMMB) return;

        if (isMMB || spaceHeld) {
          mode = 'pan';
          panStart = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
          };
          setPanCursorActive(true);
          e.preventDefault();
          return;
        }

        mode = 'draw';
        const p = getMousePos(e);
        start = p;
        last = p;
        renderRects(null);
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!mode) return;

        if (mode === 'pan' && panStart) {
          const dx = e.clientX - panStart.x;
          const dy = e.clientY - panStart.y;
          viewport.scrollLeft = panStart.scrollLeft - dx;
          viewport.scrollTop = panStart.scrollTop - dy;
          e.preventDefault();
          return;
        }

        if (mode === 'draw' && start) {
          const p = getMousePos(e);
          last = p;

          const x1 = Math.min(start.x, p.x);
          const y1 = Math.min(start.y, p.y);
          const x2 = Math.max(start.x, p.x);
          const y2 = Math.max(start.y, p.y);

          const r = clampRect({ x: x1, y: y1, w: (x2 - x1), h: (y2 - y1) }, TARGET_W, TARGET_H);
          renderRects(r);
          e.preventDefault();
        }
      };

      const onMouseUp = (e) => {
        if (!mode) return;

        if (mode === 'pan') {
          mode = null;
          panStart = null;
          setPanCursorActive(false);
          e.preventDefault();
          return;
        }

        if (mode === 'draw') {
          mode = null;

          const x1 = Math.min(start.x, last.x);
          const y1 = Math.min(start.y, last.y);
          const x2 = Math.max(start.x, last.x);
          const y2 = Math.max(start.y, last.y);

          const r = clampRect({ x: x1, y: y1, w: (x2 - x1), h: (y2 - y1) }, TARGET_W, TARGET_H);

          if (r.w < 10 || r.h < 10) {
            renderRects(null);
            return;
          }

          const rf = rectPxToFrac(r);
          state.rectsFrac[activeKey] = rf;
          saveRects(state.rectsFrac);

          updateCoordsBox();
          rebuildCropsOnly();
          renderRects(null);
          e.preventDefault();
        }
      };

      viewport.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove, { passive: false });
      window.addEventListener('mouseup', onMouseUp, { passive: false });

      cleanupFns.push(() => {
        viewport.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      });

      const onWheel = (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const dir = Math.sign(e.deltaY);
        const factor = dir > 0 ? 0.92 : 1.08;
        setZoom(scale * factor);
      };
      viewport.addEventListener('wheel', onWheel, { passive: false });
      cleanupFns.push(() => viewport.removeEventListener('wheel', onWheel));

      const onAux = (e) => { if (e.button === 1) e.preventDefault(); };
      viewport.addEventListener('auxclick', onAux);
      cleanupFns.push(() => viewport.removeEventListener('auxclick', onAux));

      updateCoordsBox();
      fitToView();
      renderRects();
    }

    // --------------------------
    // Init
    // --------------------------
    function init() {
      clearAll();
      renderPaste();
      renderTextBox();
      renderCuts();
      setStatus('idle');
    }

    init();
  }

  window.__oracle_mount = function () {
    mount();
  };
})();
