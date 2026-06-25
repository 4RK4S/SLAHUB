'use strict';

/**
 * Creator-Code.js
 * SLA Hub — Creator Codes Tool (embedded page)
 *
 * Router contract:
 *   window.__creator_code_mount(path)
 *
 * Mount target:
 *   <div id="content"></div>
 *
 * Provides:
 * - Extract codes -> unique -> batches of 250 -> pipe-separated output
 * - Send to Discord -> sends creator codes to bot API through SLA Hub backend
 */

(function () {
  function forceDark() {
    const root = document.documentElement;
    if (root) {
      root.classList.remove('light');
      root.classList.add('dark');
      root.dataset.theme = 'dark';
      root.style.colorScheme = 'dark';
    }
    if (document.body) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
      document.body.style.colorScheme = 'dark';
    }
  }

  forceDark();

  // ---------------- Helpers ----------------
  const CODE_RE = /^[A-Z0-9]{8,20}$/;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function extractCodes(raw) {
    const seen = new Set();
    const out = [];

    String(raw || '')
      .split(/\r?\n/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => CODE_RE.test(s))
      .forEach((code) => {
        if (!seen.has(code)) {
          seen.add(code);
          out.push(code);
        }
      });

    return out;
  }

  function chunk(arr, n = 250) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function ensureToast() {
    let t = document.getElementById('cc_toast');
    if (t) return t;

    t = document.createElement('div');
    t.id = 'cc_toast';
    t.className =
      'fixed bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-white text-sm shadow-lg z-50';
    t.style.opacity = '0';
    t.style.transition = 'opacity .15s ease';
    document.body.appendChild(t);
    return t;
  }

  function toast(msg, duration = 1400) {
    const t = ensureToast();
    t.textContent = msg || 'OK';
    t.style.opacity = '1';
    clearTimeout(t.__hideT);
    t.__hideT = setTimeout(() => {
      t.style.opacity = '0';
    }, duration);
  }

  async function copyToClipboard(text) {
    const val = String(text || '');
    if (!val) {
      toast('Nothing to copy');
      return false;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(val);
        toast('Copied');
        return true;
      }
    } catch (_) {}

    try {
      const ta = document.createElement('textarea');
      ta.value = val;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('Copied');
      return true;
    } catch {
      toast('Copy error');
      return false;
    }
  }

  function normalizeExpireText(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    // Netmarble style is treated as MM.DD.YYYY.
    // Accepts:
    // 06.11.2026
    // 06.11.2026 02:29
    // 06.11.2026, 02:29
    // pasted block containing date + "02:29 (UTC+9)"
    const dateMatch = /\b(\d{2}\.\d{2}\.\d{4})\b/.exec(text);
    if (!dateMatch) return '';

    const timeMatch = /\b(\d{2}:\d{2})\b/.exec(text);
    const time = timeMatch ? timeMatch[1] : '11:00';

    return `${dateMatch[1]} ${time}`;
  }

  function buildPipeBatch(codes) {
    return (codes || []).join('|');
  }

  // ---------------- UI ----------------
  function pageTemplate() {
    return `
      <div class="w-full mx-auto px-3 sm:px-6 py-6">
        <div class="mb-4">
          <div class="text-2xl font-extrabold text-yellow-400 leading-tight">Creator Code</div>
          <div class="text-sm text-slate-300/90">Creator Code Generator</div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-glass p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-yellow-400">Creator Codes</h1>
              <p class="text-sm text-slate-300/90 mt-1">Extract codes and send them to Discord quickly.</p>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button id="cc_tab_extract" class="h-10 px-4 rounded-xl border border-yellow-400 bg-yellow-400 text-black text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50">
              <i class="fa-solid fa-folder-closed mr-2"></i>Extract codes
            </button>
            <button id="cc_tab_discord" class="h-10 px-4 rounded-xl border border-white/10 bg-glass text-slate-200 text-base font-semibold hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50">
              <i class="fa-solid fa-paper-plane mr-2"></i>Send to Discord
            </button>
          </div>

          <!-- TAB: EXTRACT -->
          <section id="cc_pane_extract" class="mt-5 space-y-4">
            <div>
              <label class="block mb-2 font-semibold text-slate-100">Paste copied data (dates + codes):</label>
              <textarea id="cc_raw_1" class="w-full h-48 p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                placeholder="09.25.2025\n02:59 (UTC+9)\n0CLRGIZWYJEV\n09.25.2025\n02:59 (UTC+9)\n0CLWNBYQW9DZ\n..."></textarea>
              <p class="text-xs text-slate-300/80 mt-2">Codes are auto-detected (A–Z / 0–9, 8–20 chars). Dates/lines in between are ignored.</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button id="cc_extract_1" class="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500">Extract</button>
              <button id="cc_clear_1" class="px-4 py-2 rounded-xl bg-slate-700 text-slate-100 hover:bg-slate-600">Clear</button>
            </div>

            <div id="cc_summary_1" class="text-sm text-slate-300"></div>

            <div>
              <label class="block mb-2 font-semibold text-slate-100">Batches of 250 (pipe-separated):</label>
              <div id="cc_chunks_1" class="space-y-3"></div>
            </div>
          </section>

          <!-- TAB: SEND -->
          <section id="cc_pane_discord" class="mt-5 space-y-4 hidden">
            <div>
              <label class="block mb-2 font-semibold text-slate-100">Paste copied data (dates + codes):</label>
              <textarea id="cc_raw_2" class="w-full h-48 p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono"
                placeholder="10.15.2025\n18:26 (UTC+9)\n9WD6ZQEN0KXV\n10.15.2025\n18:26 (UTC+9)\n9WDJQYMO19VM"></textarea>
              <p class="text-xs text-slate-300/80 mt-2">You can paste the whole Netmarble block here. Dates and times are ignored as codes.</p>
            </div>

            <div class="grid md:grid-cols-2 gap-3">
              <div>
                <label class="block mb-2 font-semibold text-slate-100">Coupon Name:</label>
                <input id="cc_coupon_name" type="text" class="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100"
                  placeholder="e.g. Weapon Enhancement Gear III x20, Gold x500,000">
              </div>
              <div>
                <label class="block mb-2 font-semibold text-slate-100">Creator:</label>
                <input id="cc_creator" type="text" class="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100"
                  value="(Creator Plus)" readonly>
              </div>
            </div>

            <div>
              <label class="block mb-2 font-semibold text-slate-100">Redemption Period:</label>
              <input id="cc_expire" type="text" class="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100"
                placeholder="06.11.2026 02:29">
              <p class="text-xs text-slate-300/80 mt-1">If empty, the first date/time from pasted data is used. Date is treated as <code class="px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100">MM.DD.YYYY</code>.</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button id="cc_send_discord" class="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed">Send to Discord</button>
              <button id="cc_clear_2" class="px-4 py-2 rounded-xl bg-slate-700 text-slate-100 hover:bg-slate-600">Clear</button>
            </div>

            <div id="cc_summary_2" class="text-sm text-slate-300"></div>

          </section>
        </div>
      </div>
    `;
  }

  function setTab(root, which) {
    const tab1 = $('#cc_tab_extract', root);
    const tab2 = $('#cc_tab_discord', root);
    const pane1 = $('#cc_pane_extract', root);
    const pane2 = $('#cc_pane_discord', root);

    const active = 'h-10 px-4 rounded-xl border border-yellow-400 bg-yellow-400 text-black text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50';
    const idle = 'h-10 px-4 rounded-xl border border-white/10 bg-glass text-slate-200 text-base font-semibold hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50';

    if (which === 'discord') {
      pane1?.classList.add('hidden');
      pane2?.classList.remove('hidden');
      if (tab1) tab1.className = idle;
      if (tab2) tab2.className = active;
    } else {
      pane2?.classList.add('hidden');
      pane1?.classList.remove('hidden');
      if (tab2) tab2.className = idle;
      if (tab1) tab1.className = active;
    }
  }

  function renderCodeBatches(codes, chunksEl, summaryEl, options = {}) {
    const uniqueCodes = extractCodes((codes || []).join('\n'));
    const packs = chunk(uniqueCodes, 250);
    const prefix = options.prefix || 'Batch';
    const emptyText = options.emptyText || 'No codes detected';

    if (summaryEl) {
      summaryEl.textContent = uniqueCodes.length
        ? `Found ${uniqueCodes.length} unique code(s). Batches of 250: ${packs.length}.`
        : emptyText;
      summaryEl.className = uniqueCodes.length ? 'text-sm text-slate-300' : 'text-sm text-red-300';
    }

    if (!chunksEl) return packs;
    chunksEl.innerHTML = '';

    packs.forEach((p, i) => {
      const wrap = document.createElement('div');
      wrap.className =
        'border border-slate-700 rounded-2xl p-3 bg-slate-900/70 shadow-sm';

      const header = document.createElement('div');
      header.className = 'mb-2 flex justify-between items-center text-sm';
      header.innerHTML = `
        <strong>${prefix} ${i + 1}</strong>
        <button class="h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50" data-cc-copy-batch="${i}">
          Copy
        </button>
      `;

      const ta = document.createElement('textarea');
      ta.className = 'w-full h-32 p-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 font-mono';
      ta.readOnly = true;
      ta.value = buildPipeBatch(p);

      wrap.appendChild(header);
      wrap.appendChild(ta);
      chunksEl.appendChild(wrap);
    });

    chunksEl.querySelectorAll('button[data-cc-copy-batch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-cc-copy-batch'));
        copyToClipboard(buildPipeBatch(packs[idx] || []));
      });
    });

    return packs;
  }

  function renderExtractBatches(root) {
    const raw1 = $('#cc_raw_1', root);
    const summary1 = $('#cc_summary_1', root);
    const chunks1 = $('#cc_chunks_1', root);
    const codes = extractCodes(raw1?.value || '');

    renderCodeBatches(codes, chunks1, summary1, { prefix: 'Batch' });

    if (!codes.length) {
      toast('No codes detected');
      return codes;
    }

    toast('Batches built');
    return codes;
  }

  function renderSendBatches(root) {
    const raw2 = $('#cc_raw_2', root);
    const couponName = $('#cc_coupon_name', root);
    const expire = $('#cc_expire', root);
    const summary2 = $('#cc_summary_2', root);

    const codes = extractCodes(raw2?.value || '');
    const name = String(couponName?.value || '').trim();
    const exp = normalizeExpireText(expire?.value || raw2?.value || '');

    if (!codes.length) {
      renderCodeBatches([], chunks2, summary2);
      toast('No codes detected');
      return codes;
    }
    if (!name) {
      if (summary2) {
        summary2.textContent = 'Enter Coupon Name';
        summary2.className = 'text-sm text-red-300';
      }
      toast('Enter Coupon Name');
      return codes;
    }
    if (!exp) {
      if (summary2) {
        summary2.textContent = 'Enter Redemption Period';
        summary2.className = 'text-sm text-red-300';
      }
      toast('Enter Redemption Period');
      return codes;
    }

    renderCodeBatches(codes, chunks2, summary2, { prefix: 'Code Batch' });
    toast('Batches built');
    return codes;
  }

  async function sendDiscordCodes(root, sendBtn) {
    const raw2 = $('#cc_raw_2', root);
    const couponName = $('#cc_coupon_name', root);
    const creator = $('#cc_creator', root);
    const expire = $('#cc_expire', root);
    const summary2 = $('#cc_summary_2', root);

    const codes = extractCodes(raw2?.value || '');
    const name = String(couponName?.value || '').trim();
    const creatorName = String(creator?.value || '').trim();
    const exp = normalizeExpireText(expire?.value || raw2?.value || '');

    if (!codes.length) {
      if (summary2) {
        summary2.textContent = 'No codes detected';
        summary2.className = 'text-sm text-red-300';
      }
      return toast('No codes detected');
    }
    if (!name) {
      if (summary2) {
        summary2.textContent = 'Enter Coupon Name';
        summary2.className = 'text-sm text-red-300';
      }
      return toast('Enter Coupon Name');
    }
    if (!exp) {
      if (summary2) {
        summary2.textContent = 'Enter Redemption Period';
        summary2.className = 'text-sm text-red-300';
      }
      return toast('Enter Redemption Period');
    }

    const prevText = sendBtn?.textContent || 'Send to Discord';
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }
    if (summary2) {
      summary2.textContent = 'Sending...';
      summary2.className = 'text-sm text-slate-300';
    }
    toast('Sending...');

    try {
      const resp = await fetch('/api/admin/creator-code/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          codes,
          key_words: `${name} ${creatorName}`.trim(),
          expire: exp
        })
      });

      const text = await resp.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }

      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || data?.message || text || 'Send failed');
      }

      const sent = Number(data?.sent || codes.length);
      const msg = `Sent ${sent} codes to Discord`;
      if (summary2) {
        summary2.textContent = msg;
        summary2.className = 'text-sm text-slate-300';
      }
      toast(msg);

      // Keep coupon/expire, clear only codes after success.
      if (raw2) raw2.value = '';
      } catch (e) {
      const msg = e?.message || 'Send failed';
      if (summary2) {
        summary2.textContent = msg;
        summary2.className = 'text-sm text-red-300';
      }
      toast(msg, 2800);
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = prevText;
      }
    }
  }

  function bind(root) {
    const tabExtract = $('#cc_tab_extract', root);
    const tabDiscord = $('#cc_tab_discord', root);

    tabExtract?.addEventListener('click', () => setTab(root, 'extract'));
    tabDiscord?.addEventListener('click', () => setTab(root, 'discord'));

    // Tab 1
    const raw1 = $('#cc_raw_1', root);
    const extract1 = $('#cc_extract_1', root);
    const clear1 = $('#cc_clear_1', root);
    const summary1 = $('#cc_summary_1', root);
    const chunks1 = $('#cc_chunks_1', root);

    extract1?.addEventListener('click', () => {
      renderExtractBatches(root);
    });


    clear1?.addEventListener('click', () => {
      if (raw1) raw1.value = '';
      if (chunks1) chunks1.innerHTML = '';
      if (summary1) summary1.textContent = '';
      toast('Cleared');
    });

    // Tab 2
    const raw2 = $('#cc_raw_2', root);
    const couponName = $('#cc_coupon_name', root);
    const creator = $('#cc_creator', root);
    const expire = $('#cc_expire', root);
    const sendDiscord = $('#cc_send_discord', root);
    const clear2 = $('#cc_clear_2', root);
    const summary2 = $('#cc_summary_2', root);


    sendDiscord?.addEventListener('click', () => {
      sendDiscordCodes(root, sendDiscord);
    });

    clear2?.addEventListener('click', () => {
      if (raw2) raw2.value = '';
      if (couponName) couponName.value = '';
      if (expire) expire.value = '';
      if (creator) creator.value = '(Creator Plus)';
      if (summary2) summary2.textContent = '';
      toast('Cleared');
    });

    // default
    setTab(root, 'extract');

    if (creator) creator.value = '(Creator Plus)';
  }

  // ---------------- Public API (router mount) ----------------
  function mountCreatorCode() {
    const content = document.getElementById('content');
    if (!content) return;

    content.innerHTML = pageTemplate();
    forceDark();
    bind(content);
    forceDark();
  }

  window.__creator_code_mount = mountCreatorCode;
  window.__creator_code_refresh = mountCreatorCode;
})();
