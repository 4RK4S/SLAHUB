(function () {
  const TYPE_LABELS = {
    feature_request: "Feature Request",
    enhancement: "Enhancement",
    bug_report: "Bug Report"
  };

  const STATUS_LABELS = {
    opened: "Opened",
    in_progress: "In Progress",
    closed: "Closed"
  };

  const STATUS_ORDER = ["opened", "in_progress", "closed"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

  const state = {
    items: [],
    activeStatus: "opened",
    me: null,
    isAdmin: false,
    currentDetailStatus: null,
    createFiles: [],
    createAttachments: []
  };

  function apiPath(path) {
    if (typeof window.url === "function") return window.url(path);
    const base = String(window.__BASE_PATH__ || window.BASE_PATH || "").replace(/\/+$/, "");
    return base ? base + path : path;
  }

  function routeTo(path) {
    if (typeof window.routeTo === "function") return window.routeTo(path);
    window.location.href = apiPath(path);
  }

  function toast(message) {
    if (typeof window.showToast === "function") return window.showToast(message);
    console.log("[suggestions]", message);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric"
    }).format(date);
  }

  function normalizePath(path) {
    let p = String(path || "/suggestions");
    if (!p.startsWith("/")) p = "/" + p;
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p;
  }

  function injectStyles() {
    if (document.getElementById("suggestionsStyles")) return;
    const style = document.createElement("style");
    style.id = "suggestionsStyles";
    style.textContent = `
      .sg-wrap{max-width:1180px;margin:0 auto;padding:24px 16px 48px;color:#e5e7eb}
      .sg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
      .sg-title{font-size:clamp(28px,4vw,44px);font-weight:900;line-height:1.05;color:#f8fafc;letter-spacing:0}
      .sg-sub{margin-top:8px;color:#cbd5e1;font-size:15px}
      .sg-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
      .sg-btn{height:40px;border-radius:10px;border:1px solid rgba(148,163,184,.26);background:rgba(15,23,42,.74);color:#f8fafc;padding:0 14px;font-weight:800;display:inline-flex;align-items:center;gap:8px;transition:.16s ease;cursor:pointer}
      .sg-btn:hover{border-color:rgba(250,204,21,.55);background:rgba(30,41,59,.9)}
      .sg-btn.primary{background:#facc15;color:#111827;border-color:#fde047}
      .sg-btn.danger{background:rgba(190,18,60,.14);color:#fecdd3;border-color:rgba(244,63,94,.35)}
      .sg-btn:disabled{opacity:.55;cursor:not-allowed}
      .sg-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 18px}
      .sg-tab{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.62);color:#cbd5e1;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer}
      .sg-tab.active{background:rgba(250,204,21,.95);border-color:#fde047;color:#111827}
      .sg-list{display:grid;gap:12px}
      .sg-card,.sg-panel{border:1px solid rgba(148,163,184,.22);background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(15,23,42,.72));box-shadow:0 18px 46px rgba(0,0,0,.22);border-radius:8px}
      .sg-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;padding:15px}
      .sg-num{min-width:56px;height:44px;border-radius:8px;background:rgba(250,204,21,.12);border:1px solid rgba(250,204,21,.35);display:grid;place-items:center;color:#fde047;font-weight:1000}
      .sg-card-title{font-size:17px;font-weight:950;color:#f8fafc;line-height:1.25}
      .sg-meta{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:8px;color:#cbd5e1;font-size:13px}
      .sg-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900;border:1px solid transparent}
      .sg-type-feature_request{background:rgba(59,130,246,.16);color:#bfdbfe;border-color:rgba(59,130,246,.34)}
      .sg-type-enhancement{background:rgba(34,211,238,.14);color:#a5f3fc;border-color:rgba(34,211,238,.32)}
      .sg-type-bug_report{background:rgba(248,113,113,.14);color:#fecaca;border-color:rgba(248,113,113,.34)}
      .sg-status-opened{background:rgba(96,165,250,.13);color:#bfdbfe;border-color:rgba(96,165,250,.28)}
      .sg-status-in_progress{background:rgba(250,204,21,.15);color:#fde68a;border-color:rgba(250,204,21,.36)}
      .sg-status-closed{background:rgba(34,197,94,.14);color:#bbf7d0;border-color:rgba(34,197,94,.34)}
      .sg-empty{padding:34px 18px;text-align:center;color:#cbd5e1}
      .sg-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}
      .sg-panel{padding:18px}
      .sg-section-title{font-size:12px;font-weight:1000;text-transform:uppercase;color:#facc15;margin:18px 0 8px;letter-spacing:.08em}
      .sg-detail-title{font-size:26px;font-weight:1000;color:#f8fafc;line-height:1.15}
      .sg-description{white-space:pre-wrap;color:#dbeafe;line-height:1.65}
      .sg-form{display:grid;gap:14px}
      .sg-field label{display:block;font-size:13px;font-weight:900;color:#cbd5e1;margin-bottom:7px}
      .sg-required{color:#fb7185;margin-right:4px;font-weight:1000}
      .sg-input,.sg-textarea,.sg-select{width:100%;border-radius:8px;border:1px solid rgba(148,163,184,.28);background:rgba(2,6,23,.48);color:#f8fafc;padding:11px 12px;outline:none}
      .sg-input:focus,.sg-textarea:focus,.sg-select:focus{border-color:rgba(250,204,21,.7);box-shadow:0 0 0 3px rgba(250,204,21,.11)}
      .sg-textarea{min-height:180px;resize:vertical}
      .sg-hint{font-size:12px;color:#94a3b8;margin-top:6px}
      .sg-comment{border-top:1px solid rgba(148,163,184,.18);padding:13px 0}
      .sg-comment:first-child{border-top:0}
      .sg-comment-head{display:flex;gap:8px;align-items:center;color:#cbd5e1;font-size:13px;margin-bottom:5px}
      .sg-side-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid rgba(148,163,184,.16);padding:12px 0;color:#dbeafe}
      .sg-side-row:first-child{border-top:0;padding-top:0}
      .sg-status-buttons{display:grid;gap:8px;margin-top:10px}
      .sg-status-buttons .sg-btn{justify-content:center;width:100%}
      .sg-attachments{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
      .sg-attachment{display:block;border:1px solid rgba(148,163,184,.2);border-radius:8px;overflow:hidden;background:rgba(2,6,23,.36)}
      .sg-attachment img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}
      .sg-attachment span{display:block;padding:8px;color:#cbd5e1;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sg-modal-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,23,.72);backdrop-filter:blur(7px)}
      .sg-modal{width:min(94vw,430px);border:1px solid rgba(250,204,21,.28);border-radius:8px;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(15,23,42,.92));box-shadow:0 28px 90px rgba(0,0,0,.56);padding:20px;color:#e5e7eb}
      .sg-modal-title{font-size:22px;font-weight:1000;color:#f8fafc;line-height:1.15}
      .sg-modal-copy{margin-top:8px;color:#cbd5e1}
      .sg-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}
      @media (max-width:820px){
        .sg-head{display:grid}
        .sg-actions{justify-content:flex-start}
        .sg-card{grid-template-columns:1fr}
        .sg-num{width:56px}
        .sg-card .sg-btn{width:100%;justify-content:center}
        .sg-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  async function apiJson(path, options = {}) {
    const res = await fetch(apiPath(path), {
      credentials: "include",
      cache: "no-store",
      headers: options.body instanceof FormData ? undefined : {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || "Request failed");
    return data;
  }

  async function loadMe() {
    try {
      const me = await apiJson("/api/me");
      state.me = me.user || null;
    } catch {
      state.me = null;
    }
    try {
      const admin = await apiJson("/api/admin/is-admin");
      state.isAdmin = !!admin.isAdmin;
    } catch {
      state.isAdmin = false;
    }
  }

  async function loadList() {
    const data = await apiJson("/api/suggestions");
    state.items = Array.isArray(data.items) ? data.items : [];
  }

  function typeBadge(type) {
    const key = TYPE_LABELS[type] ? type : "feature_request";
    return `<span class="sg-badge sg-type-${key}">${esc(TYPE_LABELS[key])}</span>`;
  }

  function statusBadge(status) {
    const key = STATUS_LABELS[status] ? status : "opened";
    return `<span class="sg-badge sg-status-${key}">${esc(STATUS_LABELS[key])}</span>`;
  }

  function pageShell(title, subtitle, actionsHtml, bodyHtml) {
    return `
      <div class="sg-wrap">
        <div class="sg-head">
          <div>
            <div class="sg-title">${esc(title)}</div>
            <div class="sg-sub">${esc(subtitle)}</div>
          </div>
          <div class="sg-actions">${actionsHtml || ""}</div>
        </div>
        ${bodyHtml || ""}
      </div>
    `;
  }

  function renderList(root) {
    const counts = STATUS_ORDER.reduce((acc, key) => {
      acc[key] = state.items.filter(item => item.status === key).length;
      return acc;
    }, {});
    const current = state.items
      .filter(item => item.status === state.activeStatus)
      .sort((a, b) => Number(b.id) - Number(a.id));

    root.innerHTML = pageShell(
      "Tickets & Suggestions",
      "Submit bug reports and feature requests",
      `<button class="sg-btn primary" data-action="create"><i class="fa-solid fa-plus"></i> New Ticket</button>`,
      `
        <div class="sg-tabs">
          ${STATUS_ORDER.map(key => `
            <button class="sg-tab ${state.activeStatus === key ? "active" : ""}" data-status="${key}">
              ${esc(STATUS_LABELS[key])} ${counts[key] || 0}
            </button>
          `).join("")}
        </div>
        <div class="sg-list">
          ${current.length ? current.map(item => `
            <div class="sg-card">
              <div class="sg-num">#${esc(item.id)}</div>
              <div>
                <div class="sg-card-title">${esc(item.title)}</div>
                <div class="sg-meta">
                  ${typeBadge(item.type)}
                  <span><i class="fa-solid fa-user"></i> ${esc(item.authorName || "User")}</span>
                  <span><i class="fa-solid fa-calendar"></i> ${esc(fmtDate(item.createdAt))}</span>
                </div>
              </div>
              <button class="sg-btn" data-view="${esc(item.id)}"><i class="fa-solid fa-eye"></i> View</button>
            </div>
          `).join("") : `<div class="sg-panel sg-empty">No ${esc(STATUS_LABELS[state.activeStatus])} suggestions yet.</div>`}
        </div>
      `
    );
  }

  function renderCreate(root) {
    state.createFiles = [];
    state.createAttachments = [];
    root.innerHTML = pageShell(
      "Create Suggestion",
      "Submit a bug report or feature request",
      `<button class="sg-btn" data-action="back"><i class="fa-solid fa-arrow-left"></i> Back</button>`,
      `
        <form class="sg-panel sg-form" id="sgCreateForm">
          <div class="sg-field">
            <label for="sgTitle">Title <span class="sg-required">*</span></label>
            <input id="sgTitle" class="sg-input" name="title" required maxlength="180" />
          </div>
          <div class="sg-field">
            <label for="sgType">Type <span class="sg-required">*</span></label>
            <select id="sgType" class="sg-select" name="type" required>
              <option value="" disabled selected>Choose a type...</option>
              <option value="feature_request">Feature Request</option>
              <option value="enhancement">Enhancement</option>
              <option value="bug_report">Bug Report</option>
            </select>
          </div>
          <div class="sg-field">
            <label for="sgDescription">Description <span class="sg-required">*</span></label>
            <textarea id="sgDescription" class="sg-textarea" name="description" required></textarea>
          </div>
          <div class="sg-field">
            <label for="sgAttachments">Attachments optional</label>
            <input id="sgAttachments" class="sg-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
            <div class="sg-hint">Max 10MB per file. Allowed: images.</div>
            <div class="sg-hint" id="sgAttachmentList"></div>
          </div>
          <div class="sg-actions">
            <button class="sg-btn" type="button" data-action="back">Cancel</button>
            <button class="sg-btn primary" type="submit"><i class="fa-solid fa-ticket"></i> Create Suggestion</button>
          </div>
        </form>
      `
    );
  }

  function renderDetail(root, data) {
    const item = data.item;
    state.currentDetailStatus = item.status || null;
    const commentBlock = item.status === "closed"
      ? `<div class="sg-hint" style="margin-top:14px">Comments are disabled because this suggestion is closed.</div>`
      : (state.me ? `
          <form id="sgCommentForm" class="sg-form" style="margin-top:14px" data-status="${esc(item.status)}">
            <div class="sg-field">
              <label for="sgComment">Add a comment</label>
              <textarea id="sgComment" class="sg-textarea" style="min-height:110px" required></textarea>
            </div>
            <div class="sg-actions">
              <button class="sg-btn primary" type="submit"><i class="fa-solid fa-comment"></i> Comment</button>
            </div>
          </form>
        ` : `<div class="sg-hint" style="margin-top:14px">Log in to add a comment.</div>`);
    const supportBlock = `
      <div class="sg-side-row">
        <span>Support</span>
        <strong>${Number(data.voteCount || 0)} votes</strong>
      </div>
      ${state.me ? `
        <button class="sg-btn ${data.votedByMe ? "primary" : ""}" style="width:100%;justify-content:center" data-action="vote">
          <i class="fa-solid fa-thumbs-up"></i> ${data.votedByMe ? "Upvoted" : "Upvote"}
        </button>
      ` : ""}
    `;

    root.innerHTML = pageShell(
      `Suggestion #${item.id}`,
      "Tickets & Suggestions",
      `<button class="sg-btn" data-action="back"><i class="fa-solid fa-arrow-left"></i> Back</button>`,
      `
        <div class="sg-grid">
          <div class="sg-panel">
            <div class="sg-detail-title">${esc(item.title)}</div>
            <div class="sg-section-title">Description</div>
            <div class="sg-description">${esc(item.description)}</div>

            ${item.attachments && item.attachments.length ? `
              <div class="sg-section-title">Attachments</div>
              <div class="sg-attachments">
                ${item.attachments.map(att => `
                  <a class="sg-attachment" href="${esc(apiPath(att.url))}" target="_blank" rel="noopener">
                    <img src="${esc(apiPath(att.url))}" alt="${esc(att.name)}" />
                    <span>${esc(att.name)}</span>
                  </a>
                `).join("")}
              </div>
            ` : ""}

            <div class="sg-section-title">Comments</div>
            <div id="sgComments">
              ${item.comments && item.comments.length ? item.comments.map(comment => `
                <div class="sg-comment">
                  <div class="sg-comment-head">
                    <strong>${esc(comment.authorName || "User")}</strong>
                    <span>${esc(fmtDate(comment.createdAt))}</span>
                  </div>
                  <div class="sg-description">${esc(comment.message)}</div>
                </div>
              `).join("") : `<div class="sg-hint">No comments yet.</div>`}
            </div>

            ${commentBlock}
          </div>

          <aside class="sg-panel">
            <div class="sg-side-row"><span>Type</span><strong>${typeBadge(item.type)}</strong></div>
            <div class="sg-side-row"><span>Progress</span><strong>${statusBadge(item.status)}</strong></div>
            <div class="sg-side-row"><span>Submitted by</span><strong>${esc(item.authorName || "User")}</strong></div>
            <div class="sg-side-row"><span>Created</span><strong>${esc(fmtDate(item.createdAt))}</strong></div>
            <div class="sg-side-row"><span>Last Updated</span><strong>${esc(fmtDate(item.updatedAt))}</strong></div>
            ${supportBlock}

            ${state.isAdmin ? `
              <div class="sg-section-title">Admin Status</div>
              <div class="sg-status-buttons">
                ${STATUS_ORDER.map(status => `
                  <button class="sg-btn ${item.status === status ? "primary" : ""}" data-set-status="${status}">
                    ${esc(STATUS_LABELS[status])}
                  </button>
                `).join("")}
              </div>
              <div class="sg-section-title">Admin</div>
              <button class="sg-btn danger" style="width:100%;justify-content:center" data-action="delete">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
            ` : ""}
          </aside>
        </div>
      `
    );
  }

  function validateFiles(files) {
    const out = [];
    for (const file of Array.from(files || [])) {
      if (!ALLOWED_MIMES.has(file.type)) throw new Error(`${file.name}: image type is not allowed`);
      if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: max size is 10MB`);
      out.push(file);
    }
    return out;
  }

  async function uploadAttachment(ticketId, file) {
    const fd = new FormData();
    fd.append("file", file);
    const data = await apiJson(`/api/suggestions/${encodeURIComponent(ticketId)}/upload`, {
      method: "POST",
      body: fd
    });
    return data.attachment;
  }

  async function mountList(root) {
    await loadList();
    renderList(root);
  }

  async function mountDetail(root, id) {
    const data = await apiJson(`/api/suggestions/${encodeURIComponent(id)}`);
    renderDetail(root, data);
  }

  function closeDeleteModal() {
    const modal = document.getElementById("sgDeleteModal");
    if (modal) modal.remove();
  }

  function showDeleteModal(id) {
    closeDeleteModal();

    const overlay = document.createElement("div");
    overlay.id = "sgDeleteModal";
    overlay.className = "sg-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="sg-modal">
        <div class="sg-modal-title">Delete suggestion #${esc(id)}?</div>
        <div class="sg-modal-copy">This cannot be undone.</div>
        <div class="sg-modal-actions">
          <button class="sg-btn" type="button" data-modal-cancel>Cancel</button>
          <button class="sg-btn danger" type="button" data-modal-delete>
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;

    const onClick = async (event) => {
      if (event.target === overlay || event.target.closest("[data-modal-cancel]")) {
        closeDeleteModal();
        return;
      }

      const deleteBtn = event.target.closest("[data-modal-delete]");
      if (!deleteBtn) return;

      deleteBtn.disabled = true;
      try {
        await apiJson(`/api/suggestions/${encodeURIComponent(id)}`, { method: "DELETE" });
        closeDeleteModal();
        toast("Suggestion deleted");
        routeTo("/suggestions");
      } catch (e) {
        deleteBtn.disabled = false;
        toast(e.message || "Delete failed");
      }
    };

    const onKey = (event) => {
      if (event.key === "Escape") closeDeleteModal();
    };

    overlay.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    overlay._cleanup = () => document.removeEventListener("keydown", onKey);
    const oldRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
      try { overlay._cleanup?.(); } catch {}
      oldRemove();
    };
    document.body.appendChild(overlay);
  }

  function bindEvents(root, path) {
    if (typeof root._suggestionsCleanup === "function") root._suggestionsCleanup();

    const onClick = async (event) => {
      const target = event.target.closest("button,a");
      if (!target) return;

      const action = target.dataset.action;
      if (action === "create") return routeTo("/suggestions/create");
      if (action === "back") return routeTo("/suggestions");
      if (target.dataset.status) {
        state.activeStatus = target.dataset.status;
        try {
          await mountList(root);
        } catch (e) {
          toast(e.message || "Failed to refresh suggestions");
        }
        return;
      }
      if (target.dataset.view) return routeTo(`/suggestions/${target.dataset.view}`);

      const detailMatch = normalizePath(path).match(/^\/suggestions\/(\d+)$/);
      const id = detailMatch ? detailMatch[1] : null;

      if (action === "vote" && id) {
        try {
          await apiJson(`/api/suggestions/${encodeURIComponent(id)}/vote`, { method: "POST", body: "{}" });
          await mountDetail(root, id);
        } catch (e) {
          toast(e.message || "Vote failed");
        }
        return;
      }

      if (target.dataset.setStatus && id) {
        try {
          await apiJson(`/api/suggestions/${encodeURIComponent(id)}/status`, {
            method: "POST",
            body: JSON.stringify({ status: target.dataset.setStatus })
          });
          await mountDetail(root, id);
        } catch (e) {
          toast(e.message || "Status update failed");
        }
        return;
      }

      if (action === "delete" && id) {
        showDeleteModal(id);
      }
    };

    const onChange = (event) => {
      if (event.target && event.target.id === "sgAttachments") {
        try {
          state.createFiles = validateFiles(event.target.files);
          const list = document.getElementById("sgAttachmentList");
          if (list) list.textContent = state.createFiles.map(file => file.name).join(", ");
        } catch (e) {
          event.target.value = "";
          state.createFiles = [];
          toast(e.message || "Invalid attachment");
        }
      }
    };

    const onSubmit = async (event) => {
      const form = event.target;
      if (form.id === "sgCreateForm") {
        event.preventDefault();
        if (!state.me) {
          toast("Log in to create a suggestion");
          return;
        }

        const title = form.querySelector('[name="title"]').value.trim();
        const type = form.querySelector('[name="type"]').value;
        const description = form.querySelector('[name="description"]').value.trim();

        if (!title) {
          toast("Title is required");
          return;
        }
        if (!type) {
          toast("Choose a type");
          return;
        }
        if (!description) {
          toast("Description is required");
          return;
        }

        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
          const payload = {
            title,
            type,
            description,
            attachments: []
          };
          const data = await apiJson("/api/suggestions", {
            method: "POST",
            body: JSON.stringify(payload)
          });

          let uploadFailed = false;
          for (const file of state.createFiles) {
            try {
              await uploadAttachment(data.item.id, file);
            } catch (e) {
              uploadFailed = true;
              console.warn("[suggestions] attachment upload failed", e);
            }
          }

          toast(uploadFailed ? "Suggestion created, but some attachments failed to upload" : "Suggestion created");
          routeTo(`/suggestions/${data.item.id}`);
        } catch (e) {
          toast(e.message || "Create failed");
          if (submit) submit.disabled = false;
        }
      }

      if (form.id === "sgCommentForm") {
        event.preventDefault();
        const match = normalizePath(path).match(/^\/suggestions\/(\d+)$/);
        if (!match) return;

        if (form.dataset.status === "closed" || state.currentDetailStatus === "closed") {
          toast("Comments are disabled because this suggestion is closed.");
          return;
        }

        const message = form.querySelector("#sgComment")?.value.trim() || "";
        if (!message) {
          toast("Comment cannot be empty");
          return;
        }

        try {
          await apiJson(`/api/suggestions/${encodeURIComponent(match[1])}/comment`, {
            method: "POST",
            body: JSON.stringify({ message })
          });
          await mountDetail(root, match[1]);
        } catch (e) {
          toast(e.message || "Comment failed");
        }
      }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    root._suggestionsCleanup = () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
    };
  }

  window.__suggestions_mount = async function __suggestions_mount(path) {
    injectStyles();
    const root = document.getElementById("content");
    if (!root) return;

    const cleanPath = normalizePath(path || window.location.pathname || "/suggestions");
    root.innerHTML = `<div class="sg-wrap"><div class="sg-panel sg-empty">Loading Suggestions...</div></div>`;

    try {
      await loadMe();

      if (cleanPath === "/suggestions") {
        await mountList(root);
      } else if (cleanPath === "/suggestions/create") {
        renderCreate(root);
      } else {
        const match = cleanPath.match(/^\/suggestions\/(\d+)$/);
        if (!match) return routeTo("/suggestions");
        await mountDetail(root, match[1]);
      }

      bindEvents(root, cleanPath);
    } catch (e) {
      root.innerHTML = pageShell(
        "Tickets & Suggestions",
        "Submit bug reports and feature requests",
        `<button class="sg-btn" data-action="back"><i class="fa-solid fa-arrow-left"></i> Back</button>`,
        `<div class="sg-panel sg-empty">${esc(e.message || "Failed to load suggestions.")}</div>`
      );
      bindEvents(root, cleanPath);
    }
  };
})();
