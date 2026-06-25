/* Pictures.js — Admin Picture Manager (/picture/*)
   Renders into #content (same as Hunters/PvP/Gems)
*/
(function () {
	'use strict';

	// --------------------------
	// Small helpers
	// --------------------------
	const qs = (sel, root = document) => root.querySelector(sel);

	function el(tag, attrs, ...children) {
		const n = document.createElement(tag);
		if (attrs) {
			for (const [k, v] of Object.entries(attrs)) {
				if (k === 'class') n.className = v;
				else if (k === 'style') n.setAttribute('style', String(v));
				else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
				else if (v !== undefined && v !== null) n.setAttribute(k, String(v));
			}
		}
		for (const c of children.flat()) {
			if (c == null) continue;
			n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		}
		return n;
	}

	const url = (p) => (typeof window.url === 'function' ? window.url(p) : p);

	async function apiGet(path) {
		const r = await fetch(url(path), { cache: 'no-store' });
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(j?.error || `HTTP_${r.status}`);
		return j;
	}

	async function apiPostJson(path, body) {
		const r = await fetch(url(path), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body || {}),
		});
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(j?.error || `HTTP_${r.status}`);
		return j;
	}

	async function apiPostForm(path, fd) {
		const r = await fetch(url(path), { method: 'POST', body: fd });
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(j?.error || `HTTP_${r.status}`);
		return j;
	}

	function toast(msg) {
		if (typeof window.showToast === 'function') return window.showToast(msg);
		console.log('[pictures]', msg);
	}

	function niceSize(bytes) {
		const b = Number(bytes || 0);
		if (!b) return '';
		const kb = b / 1024;
		if (kb < 1024) return `${kb.toFixed(1)} KB`;
		return `${(kb / 1024).toFixed(2)} MB`;
	}

	function picUrl(rel) {
		return url(`/picture/${rel}`);
	}

	// --------------------------
	// Config: categories + subtabs
	// --------------------------
	const CATEGORIES = [
		'Hunter',
		'Hunter_Icon',
		'Hunter_Skin',
		'Hunter_Skill',
		'HWeapon',
		'HWeapon_Skin',
		'SGWeapon',
		'SGWeapon_Skin',
		'SGWeapon_Description_Pictures',
		'SGWeapon_Skill',
		'Shadow',
		'Special_Commission',
		'Core',
		'Artifact',
		'Rune',
		'Pvp',
		'Gems',
		'Blessing_Stones',
		'Road_Map',
		'Guild',
		'Element',
		'Recommended_Stats',
		'Growth',
		'Rarity',
		'STARS',
		'Stats',
		'Type',
		'Menu',
		'Class',
	];

	const SUBTABS_BY_CATEGORY = {
		Artifact: ['Helmet', 'Gloves', 'Body', 'Boots', 'Necklace', 'Bracelet', 'Earrings', 'Ring'],
		Core: ['Mind', 'Body', 'Spirit'],
		Gems: ['Gems', 'Leter', 'Pages', 'Stats', 'Upgrads'],
		Pvp: ['Cards', 'Type'],
		Shadow: ['Shadows', 'Weapon', 'Additional'],
		Blessing_Stones: ['Blessing', 'Frame', 'Type'],
		Menu: ['BG', 'Icon'],
	};

	const DYNAMIC_SUBTAB_SOURCES = {
		Hunter_Skin: 'Hunter',
		Hunter_Skill: 'Hunter',
		HWeapon_Skin: 'HWeapon',
		SGWeapon_Skin: 'SGWeapon',
		SGWeapon_Description_Pictures: 'SGWeapon',
		SGWeapon_Skill: 'SGWeapon',
	};

	function getSubtabs(category) {
		if (Object.prototype.hasOwnProperty.call(DYNAMIC_SUBTAB_SOURCES, category)) {
			return STATE.dynamicSubtabs[category] || [];
		}
		return SUBTABS_BY_CATEGORY[category] || null;
	}

	function getOrderCategory(category) {
		return DYNAMIC_SUBTAB_SOURCES[category] || category;
	}

	function hasSubtabs(category) {
		const tabs = getSubtabs(category);
		return Array.isArray(tabs) && tabs.length > 0;
	}

	// --------------------------
	// State
	// --------------------------
	const STATE = {
		category: 'Hunter',
		subtab: null,
		items: [],
		loading: false,
		error: null,
		query: '',
		modal: null,
		dynamicSubtabs: {},
		categoriesExpanded: false,
		categoriesVisibleCount: 4,
	};

	function ensureSubtab() {
		const tabs = getSubtabs(STATE.category);
		if (!Array.isArray(tabs) || !tabs.length) {
			STATE.subtab = null;
			return;
		}
		if (!STATE.subtab || !tabs.includes(STATE.subtab)) {
			STATE.subtab = tabs[0];
		}
	}

	// --------------------------
	// Modal (in-page)
	// --------------------------
	function openModal(modal) {
		STATE.modal = modal;
		renderModal();
	}
	function closeModal() {
		STATE.modal = null;
		renderModal();
	}

	async function loadDynamicSubtabs(category = STATE.category) {
		if (!Object.prototype.hasOwnProperty.call(DYNAMIC_SUBTAB_SOURCES, category)) return;
		const j = await apiGet(`/api/admin/pictures/subtabs?category=${encodeURIComponent(category)}`);
		STATE.dynamicSubtabs[category] = Array.isArray(j?.subtabs) ? j.subtabs : [];
	}

	async function uploadFiles(files, opts = {}) {
		const list = Array.from(files || []).filter((f) => /\.(png|webp|jpe?g)$/i.test(f.name || ''));
		if (!list.length) {
			toast('No supported image files selected');
			return;
		}

		ensureSubtab();
		const tabs = getSubtabs(STATE.category);
		const finalSubdir = Array.isArray(tabs) && tabs.length ? (STATE.subtab || tabs[0]) : '';

		for (const f of list) {
			const fd = new FormData();
			fd.append('category', STATE.category);
			fd.append('subdir', finalSubdir);
			fd.append('filename', opts.filename && list.length === 1 ? opts.filename : f.name);
			fd.append('replace', '1');
			fd.append('file', f);
			await apiPostForm('/api/admin/pictures/upload', fd);
		}

		toast(list.length === 1 ? 'Uploaded' : `Uploaded ${list.length} files`);
		await refresh();
	}

	async function openExactOrderModal() {
		const orderCategory = getOrderCategory(STATE.category);
		const j = await apiGet(`/api/admin/pictures/order?category=${encodeURIComponent(orderCategory)}`);
		const current = Array.isArray(j?.order) ? j.order : [];

		const textarea = el('textarea', {
			class: 'w-full min-h-[260px] px-3 py-3 rounded-xl bg-slate-900/50 border border-slate-700 text-slate-100 font-semibold outline-none',
			spellcheck: 'false'
		}, current.join('\n'));

		const body = el('div', { class: 'space-y-3' },
			el('div', { class: 'text-sm text-slate-300' }, `One name per line. Missing names from ${orderCategory} will be appended.`),
			textarea
		);

		openModal({
			title: `Set exact order: ${orderCategory}`,
			confirmText: 'Save',
			customBody: body,
			onConfirm: async () => {
				const order = (textarea.value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
				await apiPostJson('/api/admin/pictures/order', { category: orderCategory, order });
				toast('Order saved');
				await refresh();
			}
		});
	}

	function renderModal() {
		const old = qs('[data-pictures-modal="1"]');
		if (old) old.remove();
		if (!STATE.modal) return;

		const m = STATE.modal;

		const overlay = el('div', {
			class: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4',
			'data-pictures-modal': '1'
		});

		const box = el('div', {
			class: 'w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl p-4'
		});

		box.append(el('div', { class: 'text-lg font-extrabold mb-1' }, m.title || 'Confirm'));

		if (m.customBody) {
			box.append(el('div', { class: 'mb-4' }, m.customBody));
		} else {
			box.append(
				el('div', { class: 'text-sm text-slate-100 mb-4 whitespace-pre-wrap' }, m.message || '')
			);
		}

		const btnRow = el('div', { class: 'flex gap-2 justify-end' });

		const cancelBtn = el('button', {
			class: 'px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 transition text-sm font-semibold text-slate-100',
			onclick: () => closeModal()
		}, 'Cancel');

		const okBtn = el('button', {
			class: 'px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 transition text-sm font-semibold text-white',
			onclick: async () => {
				try {
					if (typeof m.onConfirm === 'function') await m.onConfirm();
				} catch (e) {
					toast(`Action failed: ${e?.message || e}`);
					return;
				}
				closeModal();
			}
		}, m.confirmText || 'OK');

		btnRow.append(cancelBtn, okBtn);
		box.append(btnRow);

		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) closeModal();
		});

		overlay.appendChild(box);
		document.body.appendChild(overlay);
	}

	function openUploadModal() {
		ensureSubtab();

		const tabs = getSubtabs(STATE.category);
		const hasTabsNow = Array.isArray(tabs) && tabs.length > 0;
		const computedSubdir = hasTabsNow ? (STATE.subtab || tabs[0]) : '';
		const subdirLine = hasTabsNow ? `/${STATE.category}/${computedSubdir}` : `/${STATE.category}`;

		const fileInput = el('input', {
			type: 'file',
			multiple: 'multiple',
			accept: '.png,.webp,.jpg,.jpeg',
			class: 'block w-full text-sm text-white ' +
				'file:mr-3 file:rounded-xl file:border-0 file:px-3 file:py-2 file:font-semibold ' +
				'file:bg-slate-800 file:text-slate-100 hover:file:bg-slate-700'
		});

		const nameInput = el('input', {
			type: 'text',
			placeholder: 'Filename (auto from selected file)',
			class: 'w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700 text-slate-100 placeholder:text-slate-400'
		});

		fileInput.addEventListener('change', () => {
			const f = fileInput.files && fileInput.files[0];
			if (!f) return;
			nameInput.value = f.name;
		});

		const body = el('div', { class: 'space-y-3' },
			el('div', { class: 'text-sm text-slate-100' },
				'Upload to ',
				el('span', { class: 'font-semibold text-slate-100' }, `/picture${subdirLine}`)
			),
			fileInput,
			nameInput,
			el('div', { class: 'text-xs text-slate-300' },
				hasTabsNow ? `Subfolder is selected by tabs (${tabs.join(', ')}).` : 'This category has no subfolders.'
			)
		);

		openModal({
			title: 'Upload picture',
			confirmText: 'Upload',
			customBody: body,
			onConfirm: async () => {
				if (!fileInput.files || !fileInput.files[0]) {
					throw new Error('Pick a file first');
				}

				const firstFile = fileInput.files[0];
				const finalName = (nameInput.value || '').trim() || firstFile.name;
				await uploadFiles(fileInput.files, { filename: finalName });
			}
		});
	}

	// --------------------------
	// Header (exact style requested)
	// --------------------------
	function renderHeader(root) {
		const top = el('div', { class: 'flex items-center justify-between gap-3 mb-4' });

		top.append(
			el('div', { class: 'min-w-0' },
				el('div', { class: 'text-2xl font-extrabold text-yellow-400 leading-tight' }, 'Pictures'),
				el('div', { class: 'text-sm text-slate-100/90' }, 'Manage local assets in /picture/*'),
			)
		);

		root.append(top);
	}

	// --------------------------
	// Categories (animated)
	// --------------------------
	function buildCategoryBtn(c) {
		const active = STATE.category === c;

		const b = el(
			'button',
			{
				class:
					'h-10 px-3 rounded-xl border text-sm font-semibold transition-colors whitespace-nowrap overflow-hidden text-ellipsis ' +
					(active
						? 'bg-yellow-400 text-slate-900 border-yellow-400 hover:bg-yellow-300'
						: 'bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700')
			},
			c
		);

		b.addEventListener('click', () => {
			if (STATE.category === c) return;
			STATE.category = c;
			STATE.query = '';
			STATE.subtab = null;
			ensureSubtab();
			refresh();
		});

		return b;
	}

	function buildArrowBtn(expanded) {
		return el(
			'button',
			{
				class:
					'h-10 w-9 self-center justify-self-center rounded-md border text-[9px] font-medium leading-none p-0 flex items-center justify-center transition-colors ' +
					'bg-slate-800 text-white border-slate-700 hover:bg-slate-700',
				title: expanded ? 'Collapse categories' : 'Expand categories',
				'aria-label': expanded ? 'Collapse categories' : 'Expand categories',
				onclick: () => toggleCategoriesAnimated()
			},
			expanded ? '▲' : '▼'
		);
	}

	function renderTabs(root) {
		const all = [...CATEGORIES];
		const visibleCount = Math.max(1, Number(STATE.categoriesVisibleCount || 4));
		const expanded = !!STATE.categoriesExpanded;
		const shown = expanded ? all : all.slice(0, visibleCount);
		const hasMore = all.length > visibleCount;

		const wrap = el('div', { class: 'mb-4' });

		const animWrap = el('div', {
			'data-pictures-cats-anim': '1',
			class: 'overflow-hidden transition-[height] duration-300 ease-out'
		});

		const inner = el('div', {
			'data-pictures-cats-inner': '1',
			class: 'transition-opacity duration-200 ease-out opacity-100'
		});

		const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

		if (isMobile) {
			const grid = el('div', { class: 'grid grid-cols-2 gap-2' });

			for (const c of shown) grid.appendChild(buildCategoryBtn(c));

			if (hasMore) {
				if (shown.length % 2 !== 0) grid.appendChild(el('div', { class: 'h-10' }));
				grid.appendChild(buildArrowBtn(expanded));
			}

			inner.appendChild(grid);
		} else {
			// Desktop/tablet with narrow arrow column:
			// collapsed: 4 categories + narrow arrow col
			// expanded: rows of 4; last row = 4 + narrow arrow col (no giant hole)
			if (!expanded) {
				const row = el('div', {
					class: 'grid gap-2',
					style: 'grid-template-columns: repeat(4, minmax(0, 1fr)) 2.25rem;'
				});

				for (const c of shown) row.appendChild(buildCategoryBtn(c));
				row.appendChild(hasMore ? buildArrowBtn(false) : el('div', { class: 'h-10' }));

				inner.appendChild(row);
			} else {
				const rowsWrap = el('div', { class: 'space-y-2' });

				const chunks = [];
				for (let i = 0; i < shown.length; i += 4) {
					chunks.push(shown.slice(i, i + 4));
				}

				chunks.forEach((chunk, idx) => {
					const isLast = idx === chunks.length - 1;

					const row = el('div', {
						class: 'grid gap-2',
						style: isLast
							? 'grid-template-columns: repeat(4, minmax(0, 1fr)) 2.25rem;'
							: 'grid-template-columns: repeat(4, minmax(0, 1fr));'
					});

					for (const c of chunk) row.appendChild(buildCategoryBtn(c));

					if (isLast) {
						while (chunk.length < 4) {
							chunk.push(null);
							row.appendChild(el('div', { class: 'h-10' }));
						}
						row.appendChild(hasMore ? buildArrowBtn(true) : el('div', { class: 'h-10' }));
					}

					rowsWrap.appendChild(row);
				});

				inner.appendChild(rowsWrap);
			}
		}

		animWrap.appendChild(inner);
		wrap.appendChild(animWrap);
		root.appendChild(wrap);

		requestAnimationFrame(() => {
			animWrap.style.height = `${inner.scrollHeight}px`;
		});
	}

	function toggleCategoriesAnimated() {
		const animWrap = qs('[data-pictures-cats-anim="1"]');
		const inner = qs('[data-pictures-cats-inner="1"]');

		if (!animWrap || !inner) {
			STATE.categoriesExpanded = !STATE.categoriesExpanded;
			render();
			return;
		}

		const startH = Math.round(animWrap.getBoundingClientRect().height || inner.scrollHeight);
		animWrap.style.height = `${startH}px`;

		inner.classList.remove('opacity-100');
		inner.classList.add('opacity-70');

		requestAnimationFrame(() => {
			STATE.categoriesExpanded = !STATE.categoriesExpanded;
			render();

			const newAnimWrap = qs('[data-pictures-cats-anim="1"]');
			const newInner = qs('[data-pictures-cats-inner="1"]');
			if (!newAnimWrap || !newInner) return;

			const targetH = Math.round(newInner.scrollHeight);

			newAnimWrap.style.height = `${startH}px`;
			newInner.classList.remove('opacity-100');
			newInner.classList.add('opacity-0');

			requestAnimationFrame(() => {
				newAnimWrap.style.height = `${targetH}px`;
				newInner.classList.remove('opacity-0');
				newInner.classList.add('opacity-100');

				const done = () => {
					newAnimWrap.style.height = `${Math.round(newInner.scrollHeight)}px`;
					newAnimWrap.removeEventListener('transitionend', done);
				};
				newAnimWrap.addEventListener('transitionend', done);
			});
		});
	}

	// --------------------------
	// Subtabs
	// --------------------------
	function renderSubTabs(root) {
		const tabs = getSubtabs(STATE.category);
		if (!Array.isArray(tabs)) return;
		if (!tabs.length) {
			if (Object.prototype.hasOwnProperty.call(DYNAMIC_SUBTAB_SOURCES, STATE.category)) {
				root.appendChild(el('div', { class: 'mb-4 text-sm text-slate-300' }, 'No subtabs yet.'));
			}
			return;
		}

		ensureSubtab();

		const wrap = el('div', { class: 'mb-4' });

		const bar = el('div', {
			class: 'grid gap-2',
			style: 'grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));'
		});

		for (const s of tabs) {
			const active = STATE.subtab === s;

			const b = el(
				'button',
				{
					class:
						'min-h-12 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors w-full ' +
						'overflow-hidden text-center leading-tight break-words [overflow-wrap:anywhere] ' +
						(active
							? 'bg-yellow-400 text-slate-900 border-yellow-400 hover:bg-yellow-300'
							: 'bg-white/90 text-slate-900 border-slate-300 hover:bg-slate-50 ' +
							'dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700'),
					style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal;overflow-wrap:anywhere;',
					title: s
				},
				s
			);

			b.addEventListener('click', () => {
				if (STATE.subtab === s) return;
				STATE.subtab = s;
				rerenderContentArea();
			});

			bar.appendChild(b);
		}

		wrap.appendChild(bar);
		root.appendChild(wrap);
	}

	// --------------------------
	// Toolbar (search + buttons in one row)
	// --------------------------
	function renderToolbar(root) {
		const wrap = el('div', {
			class: 'p-4 rounded-2xl border border-slate-700 bg-slate-900/30 mb-4'
		});

		const search = el('input', {
			type: 'text',
			value: STATE.query,
			placeholder: 'Search files…',
			class: 'w-full min-w-0 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700 text-slate-100 placeholder:text-slate-400'
		});

		search.addEventListener('input', () => {
			STATE.query = search.value || '';
			rerenderGridOnly();
		});

		const uploadBtn = el(
			'button',
			{
				class: 'h-10 px-4 rounded-xl bg-yellow-400 text-slate-900 font-semibold hover:bg-yellow-300 transition whitespace-nowrap',
				onclick: () => openUploadModal()
			},
			'Upload'
		);

		const orderBtn = el(
			'button',
			{
				class: 'h-10 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 transition text-slate-100 whitespace-nowrap',
				onclick: () => openExactOrderModal().catch((e) => toast(`Order load failed: ${e?.message || e}`))
			},
			'Set exact order'
		);

		const refreshBtn = el(
			'button',
			{
				class: 'h-10 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 transition text-slate-100 whitespace-nowrap',
				onclick: () => refresh()
			},
			'Refresh'
		);

		wrap.append(
			el('div', { class: 'grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-center' },
				search,
				uploadBtn,
				orderBtn,
				refreshBtn
			)
		);

		root.appendChild(wrap);
	}

	// --------------------------
	// Grid renderer
	// --------------------------
	function getFilteredItems() {
		const q = (STATE.query || '').trim().toLowerCase();

		let items = q
			? STATE.items.filter(x =>
				String(x.rel || '').toLowerCase().includes(q) ||
				String(x.name || '').toLowerCase().includes(q)
			)
			: [...STATE.items];

		const tabs = getSubtabs(STATE.category);
		if (Array.isArray(tabs) && tabs.length) {
			ensureSubtab();
			const pref = `${STATE.subtab}/`.toLowerCase();
			items = items.filter(x => String(x.rel || '').toLowerCase().startsWith(pref));
		}

		return items;
	}

	function renderGridInto(container) {
		if (!container) return;

		const items = getFilteredItems();
		container.innerHTML = '';
		container.className = 'rounded-2xl border border-dashed border-transparent transition-colors';

		let dragDepth = 0;
		const setDragging = (on) => {
			container.classList.toggle('border-yellow-400', !!on);
			container.classList.toggle('bg-yellow-400/10', !!on);
		};

		container.ondragenter = (e) => {
			if (!e.dataTransfer?.types?.includes('Files')) return;
			e.preventDefault();
			dragDepth += 1;
			setDragging(true);
		};

		container.ondragover = (e) => {
			if (!e.dataTransfer?.types?.includes('Files')) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			setDragging(true);
		};

		container.ondragleave = () => {
			dragDepth = Math.max(0, dragDepth - 1);
			if (!dragDepth) setDragging(false);
		};

		container.ondrop = async (e) => {
			if (!e.dataTransfer?.files?.length) return;
			e.preventDefault();
			dragDepth = 0;
			setDragging(false);
			try {
				await uploadFiles(e.dataTransfer.files);
			} catch (err) {
				toast(`Upload failed: ${err?.message || err}`);
			}
		};

		const countLine = el(
			'div',
			{ class: 'mb-3 text-sm text-slate-300 px-1' },
			`Files: ${items.length}`
		);

		const grid = el('div', { class: 'grid grid-cols-1 xl:grid-cols-2 gap-3' });

		for (const it of items) {
			const rel = `${STATE.category}/${it.rel}`.replace(/\/+/g, '/');

			const preview = el('img', {
				src: picUrl(rel) + (it.mtimeMs ? `?v=${Math.floor(it.mtimeMs)}` : ''),
				class: 'w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-xl bg-slate-900/40 border border-slate-700',
				loading: 'lazy'
			});

			preview.addEventListener('error', () => {
				preview.style.opacity = '0.5';
			});

			const copyBtn = el(
				'button',
				{
					class: 'mt-2 text-xs underline text-slate-300 hover:text-white text-center',
					onclick: async () => {
						const full = picUrl(rel);
						try {
							await navigator.clipboard.writeText(full);
							toast('Copied URL');
						} catch {
							toast('Clipboard failed');
						}
					}
				},
				'Copy URL'
			);

			const leftCol = el(
				'div',
				{ class: 'flex flex-col items-center shrink-0' },
				preview,
				copyBtn
			);

			const renameInput = el('input', {
				type: 'text',
				value: it.name,
				class: 'w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700 text-sm text-slate-100'
			});

			const renameBtn = el(
				'button',
				{
					class: 'h-10 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 transition text-sm text-slate-100',
					onclick: async () => {
						const newName = (renameInput.value || '').trim();
						if (!newName || newName === it.name) return;

						try {
							await apiPostJson('/api/admin/pictures/rename', {
								category: STATE.category,
								fromRel: it.rel,
								toName: newName
							});
							toast('Renamed');
							refresh();
						} catch (e) {
							toast(`Rename failed: ${e.message}`);
						}
					}
				},
				'Rename'
			);

			const delBtn = el(
				'button',
				{
					class: 'h-10 px-3 rounded-xl bg-red-500 hover:bg-red-400 transition text-sm font-semibold text-white',
					onclick: async () => {
						openModal({
							title: 'Delete file',
							message: `Are you sure you want to delete:\n/picture/${rel}\n\nThis cannot be undone.`,
							confirmText: 'Delete',
							onConfirm: async () => {
								await apiPostJson('/api/admin/pictures/delete', {
									category: STATE.category,
									rel: it.rel
								});
								toast('Deleted');
								await refresh();
							}
						});
					}
				},
				'Delete'
			);

			const card = el(
				'div',
				{ class: 'p-3 rounded-2xl bg-slate-900/30 border border-slate-700/60 flex flex-col sm:flex-row gap-3 items-start' },
				leftCol,
				el(
					'div',
					{ class: 'min-w-0 flex-1 w-full' },
					el('div', { class: 'text-sm font-semibold text-slate-100 truncate' }, it.rel),
					el('div', { class: 'text-xs text-slate-300 mb-2' }, niceSize(it.size)),
					renameInput,
					el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2' }, renameBtn, delBtn)
				)
			);

			grid.appendChild(card);
		}

		container.append(countLine, grid);
	}

	// --------------------------
	// Partial rerenders
	// --------------------------
	function rerenderGridOnly() {
		const gridHost = qs('[data-pictures-grid="1"]');
		if (!gridHost) return;
		renderGridInto(gridHost);
	}

	function rerenderSubtabsOnly() {
		const host = qs('[data-pictures-subtabs="1"]');
		if (!host) return;
		host.innerHTML = '';
		renderSubTabs(host);
	}

	function rerenderToolbarOnly() {
		const host = qs('[data-pictures-toolbar="1"]');
		if (!host) return;
		host.innerHTML = '';
		renderToolbar(host);
	}

	function rerenderContentArea() {
		rerenderSubtabsOnly();
		rerenderToolbarOnly();
		rerenderGridOnly();
	}

	// --------------------------
	// Main render
	// --------------------------
	function render() {
		const content = qs('#content');
		if (!content) return;

		content.innerHTML = '';

		const shell = el('div', {
			class: 'w-full mx-auto px-3 sm:px-6 py-6',
			'data-sla-page': 'pictures'
		});

		ensureSubtab();

		renderHeader(shell);
		renderTabs(shell);

		const subtabsHost = el('div', { 'data-pictures-subtabs': '1' });
		shell.appendChild(subtabsHost);
		renderSubTabs(subtabsHost);

		if (STATE.loading) {
			shell.append(el('div', { class: 'p-6 text-center text-slate-300' }, 'Loading…'));
			content.appendChild(shell);
			renderModal();
			return;
		}

		if (STATE.error) {
			shell.append(el('div', { class: 'p-6 text-center text-red-600 dark:text-red-400 font-semibold' }, STATE.error));
			content.appendChild(shell);
			renderModal();
			return;
		}

		const toolbarHost = el('div', { 'data-pictures-toolbar': '1' });
		shell.appendChild(toolbarHost);
		renderToolbar(toolbarHost);

		const gridHost = el('div', { 'data-pictures-grid': '1' });
		shell.appendChild(gridHost);

		content.appendChild(shell);

		renderGridInto(gridHost);

		try {
			requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
		} catch {}

		renderModal();
	}

	// --------------------------
	// Load
	// --------------------------
	async function refresh() {
		STATE.loading = true;
		STATE.error = null;
		render();

		try {
			await loadDynamicSubtabs(STATE.category);
			ensureSubtab();
			const j = await apiGet(`/api/admin/pictures/list?category=${encodeURIComponent(STATE.category)}`);
			STATE.items = Array.isArray(j?.items) ? j.items : [];
		} catch (e) {
			console.warn('[pictures] load failed', e);
			STATE.items = [];
			STATE.error = `Failed to load files for ${STATE.category}.`;
		}

		STATE.loading = false;
		render();
	}

	// --------------------------
	// Mount (router calls this)
	// --------------------------
	window.__pictures_mount = async function __pictures_mount() {
		if (typeof window.forceDarkMode === 'function') window.forceDarkMode();
		ensureSubtab();
		await refresh();
		if (typeof window.forceDarkMode === 'function') window.forceDarkMode();
	};
})();
