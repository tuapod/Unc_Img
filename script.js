import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client@1.10.0/+esm";

(function () {
    'use strict';

    /* ══════════════════════════════════════════
       API CONFIG — MAIN MODELS
       ══════════════════════════════════════════ */
    const MODELS_CONFIG = {
        standard: {
            url: "https://933669fdbff613247d.gradio.live/",
            apiName: "/generate",
            label: "Standard"
        },
        uncensored: {
            url: "https://5f85467f4ac08b7e27.gradio.live/",
            apiName: "/generate",
            label: "Uncensored"
        }
    };

    /* ══════════════════════════════════════════
       ENGINES — sub-models per main model
       ══════════════════════════════════════════ */
    const ENGINES = {
        standard: [
            {
                value: "Anime Style (Animagine XL 3.1)",
                label: "Anime Style",
                hint: "Animagine XL 3.1 — best for anime & illustration",
                defaults: { steps: 28, cfg: 6.5 }
            },
            {
                value: "Photorealistic (RealVisXL V4.0)",
                label: "Photorealistic",
                hint: "RealVisXL V4.0 — realistic photos, skin texture",
                defaults: { steps: 28, cfg: 5.5 }
            },
            {
                value: "3D / CGI (Juggernaut XL V9)",
                label: "3D / CGI",
                hint: "Juggernaut XL V9 — renders, Unreal-style 3D",
                defaults: { steps: 30, cfg: 6.0 }
            }
        ],
        uncensored: [
            {
                value: "Uncensored (Default)",
                label: "Uncensored Default",
                hint: "Unrestricted content — no filters",
                defaults: { steps: 25, cfg: 6.0 }
            }
        ]
    };

    /* ══════════════════════════════════════════
       RATIOS PER MODEL — matches each server's
       ASPECT_RATIOS keys EXACTLY
       ══════════════════════════════════════════ */
    const RATIOS_PER_MODEL = {
        standard: [
            { value: "16:9 Landscape (1216x832)", label: "16:9 Landscape" },
            { value: "1:1 Square (1024x1024)",    label: "1:1 Square" },
            { value: "9:16 Portrait (832x1216)",  label: "9:16 Portrait" }
        ],
        uncensored: [
            { value: "16:9 (Landscape - یوتیوب)",           label: "16:9 Landscape" },
            { value: "1:1 (Square - اینستاگرام و آواتار)",   label: "1:1 Square" },
            { value: "9:16 (Portrait - شورتس و استوری)",    label: "9:16 Portrait" },
            { value: "4:3 (کلاسیک)",                         label: "4:3 Classic" }
        ]
    };

    const STORAGE_KEY = "vernier.chats.v1";
    const $ = (id) => document.getElementById(id);

    /* ══════════════════════════════════════════
       DOM REFERENCES
       ══════════════════════════════════════════ */
    const promptEl    = $('prompt');
    const charCountEl = $('char-count');
    const sendBtn     = $('send-btn');
    const mainEl      = $('main');
    const messagesEl  = $('messages');
    const errorToast  = $('error-toast');

    const negativeEl  = $('negative');
    const ratioEl     = $('ratio');
    const stepsEl     = $('steps');
    const stepsVal    = $('steps-value');
    const cfgEl       = $('cfg');
    const cfgVal      = $('cfg-value');
    const seedEl      = $('seed');
    const ratingEl    = $('rating');

    const engineEl    = $('engine');
    const engineBadge = $('engine-badge');
    const engineHint  = $('engine-hint');

    const sidebar        = $('sidebar');
    const sidebarOverlay = $('sidebar-overlay');
    const historyList    = $('history-list');
    const historySearch  = $('history-search');

    const settingsModal  = $('settings-modal');

    const modelSelector = $('model-selector');
    const modelTrigger  = $('model-trigger');
    const modelNameEl   = $('model-name');
    const modelOptions  = document.querySelectorAll('.model-option');

    /* ══════════════════════════════════════════
       STATE
       ══════════════════════════════════════════ */
    let isGenerating  = false;
    let chats         = [];
    let currentChatId = null;
    let searchQuery   = '';
    let currentModel  = 'standard';
    let currentEngine = ENGINES.standard[0].value;

    const clients = { standard: null, uncensored: null };
    let _lastPhase = '';

    /* ══════════════════════════════════════════
       STORAGE
       ══════════════════════════════════════════ */
    function loadChats() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            chats = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(chats)) chats = [];
        } catch (e) {
            console.warn('Failed to load chats:', e);
            chats = [];
        }
    }

    function saveChats() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
        } catch (e) {
            console.warn('Failed to save chats:', e);
        }
    }

    function getChat(id) {
        return chats.find(c => c.id === id) || null;
    }

    function createChat(firstMessage) {
        const chat = {
            id: 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            title: (firstMessage || 'New chat').slice(0, 60),
            model: currentModel,
            engine: currentEngine,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
        chats.unshift(chat);
        saveChats();
        return chat;
    }

    function deleteChat(id) {
        chats = chats.filter(c => c.id !== id);
        saveChats();
        if (currentChatId === id) {
            currentChatId = null;
            newChatUI();
        }
        renderHistory();
    }

    function updateChatTitle(chatId, text) {
        const chat = getChat(chatId);
        if (!chat) return;
        if (chat.messages.filter(m => m.role === 'user').length <= 1) {
            chat.title = (text || 'New chat').slice(0, 60);
        }
        chat.updatedAt = Date.now();
        saveChats();
    }

    /* ══════════════════════════════════════════
       ENGINES + RATIOS POPULATION
       ══════════════════════════════════════════ */
    function populateEngines(modelKey) {
        const list = ENGINES[modelKey] || [];

        engineEl.innerHTML = '';
        list.forEach(eng => {
            const opt = document.createElement('option');
            opt.value = eng.value;
            opt.textContent = eng.label;
            engineEl.appendChild(opt);
        });

        if (list.length > 0) {
            engineEl.value = list[0].value;
            currentEngine = list[0].value;
            updateEngineHint(list[0]);

            if (list[0].defaults) {
                stepsEl.value = list[0].defaults.steps;
                stepsVal.textContent = list[0].defaults.steps;
                cfgEl.value = list[0].defaults.cfg;
                cfgVal.textContent = list[0].defaults.cfg.toFixed(1);
            }
        }

        engineBadge.textContent = list.length + ' available';
        engineBadge.classList.remove('pop');
        void engineBadge.offsetWidth;
        engineBadge.classList.add('pop');
        setTimeout(() => engineBadge.classList.remove('pop'), 400);

        populateRatios(modelKey);
    }

    function populateRatios(modelKey) {
        const list = RATIOS_PER_MODEL[modelKey] || [];
        if (!ratioEl) return;

        ratioEl.innerHTML = '';
        list.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.textContent = r.label;
            ratioEl.appendChild(opt);
        });

        if (list.length > 0) ratioEl.value = list[0].value;
    }

    function updateEngineHint(engine) {
        if (!engine) { engineHint.textContent = ''; return; }
        engineHint.textContent = engine.hint || '';
        engineHint.classList.add('updated');
        setTimeout(() => engineHint.classList.remove('updated'), 600);
    }

    function findEngine(modelKey, value) {
        return (ENGINES[modelKey] || []).find(e => e.value === value) || null;
    }

    engineEl.addEventListener('change', () => {
        const eng = findEngine(currentModel, engineEl.value);
        if (!eng) return;
        currentEngine = eng.value;

        if (eng.defaults) {
            stepsEl.value = eng.defaults.steps;
            stepsVal.textContent = eng.defaults.steps;
            cfgEl.value = eng.defaults.cfg;
            cfgVal.textContent = eng.defaults.cfg.toFixed(1);
        }

        updateEngineHint(eng);
    });

    /* ══════════════════════════════════════════
       TEXTAREA
       ══════════════════════════════════════════ */
    function syncTextarea() {
        promptEl.style.height = 'auto';
        const h = Math.min(Math.max(promptEl.scrollHeight, 52), 200);
        promptEl.style.height = h + 'px';

        const len = promptEl.value.length;
        charCountEl.textContent = len;
        charCountEl.classList.toggle('visible', len > 0);

        updateSendBtn();
    }

    function updateSendBtn() {
        const hasText = promptEl.value.trim().length > 0;
        sendBtn.disabled = isGenerating || !hasText;
    }

    promptEl.addEventListener('input', syncTextarea);
    syncTextarea();

    /* ══════════════════════════════════════════
       SLIDERS
       ══════════════════════════════════════════ */
    stepsEl.addEventListener('input', () => stepsVal.textContent = stepsEl.value);
    cfgEl.addEventListener('input', () => cfgVal.textContent = parseFloat(cfgEl.value).toFixed(1));

    /* ══════════════════════════════════════════
       SIDEBAR
       ══════════════════════════════════════════ */
    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('open');
        sidebar.setAttribute('aria-hidden', 'false');
        renderHistory();
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
        sidebar.setAttribute('aria-hidden', 'true');
    }

    $('menu-btn').addEventListener('click', openSidebar);
    $('close-sidebar').addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    /* ══════════════════════════════════════════
       SETTINGS MODAL
       ══════════════════════════════════════════ */
    function openSettings() {
        settingsModal.classList.add('open');
        settingsModal.setAttribute('aria-hidden', 'false');
    }

    function closeSettings() {
        settingsModal.classList.remove('open');
        settingsModal.setAttribute('aria-hidden', 'true');
    }

    $('settings-btn').addEventListener('click', openSettings);
    $('close-settings').addEventListener('click', closeSettings);
    $('save-settings').addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    /* ══════════════════════════════════════════
       MODEL SELECTOR
       ══════════════════════════════════════════ */
    function openModelDropdown() {
        modelSelector.classList.add('open');
        modelTrigger.setAttribute('aria-expanded', 'true');
    }

    function closeModelDropdown() {
        modelSelector.classList.remove('open');
        modelTrigger.setAttribute('aria-expanded', 'false');
    }

    modelTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (modelSelector.classList.contains('open')) {
            closeModelDropdown();
        } else {
            openModelDropdown();
        }
    });

    modelOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = opt.dataset.model;
            const name  = opt.querySelector('.model-opt-name').textContent;

            currentModel = value;
            modelNameEl.textContent = name;
            modelSelector.setAttribute('data-model', value);

            modelOptions.forEach(o => {
                o.classList.remove('active');
                o.setAttribute('aria-selected', 'false');
            });
            opt.classList.add('active');
            opt.setAttribute('aria-selected', 'true');

            populateEngines(value);
            closeModelDropdown();
        });
    });

    document.addEventListener('click', (e) => {
        if (!modelSelector.contains(e.target)) {
            closeModelDropdown();
        }
    });

    /* ══════════════════════════════════════════
       HISTORY RENDERING
       ══════════════════════════════════════════ */
    const CHAT_ICON = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
    `;

    const TRASH_ICON = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        </svg>
    `;

    function renderHistory() {
        const q = searchQuery.trim().toLowerCase();
        const filtered = q
            ? chats.filter(c => c.title.toLowerCase().includes(q))
            : chats;

        historyList.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-history';
            empty.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div>${q ? 'No chats match your search' : 'No chats yet'}</div>
            `;
            historyList.appendChild(empty);
            return;
        }

        filtered.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'history-item';
            if (chat.id === currentChatId) item.classList.add('active');
            item.dataset.id = chat.id;

            item.innerHTML = `
                <div class="icon">${CHAT_ICON}</div>
                <div class="title"></div>
                <button class="delete-btn" title="Delete chat">${TRASH_ICON}</button>
            `;
            item.querySelector('.title').textContent = chat.title;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                loadChat(chat.id);
            });

            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this chat?')) deleteChat(chat.id);
            });

            historyList.appendChild(item);
        });
    }

    historySearch.addEventListener('input', () => {
        searchQuery = historySearch.value;
        renderHistory();
    });

    /* ══════════════════════════════════════════
       CHAT LOADING
       ══════════════════════════════════════════ */
    function clearMessagesUI() {
        messagesEl.innerHTML = '';
    }

    function loadChat(chatId) {
        if (isGenerating) return;
        const chat = getChat(chatId);
        if (!chat) return;

        currentChatId = chatId;
        clearMessagesUI();

        if (chat.model && MODELS_CONFIG[chat.model]) {
            currentModel = chat.model;
            const name = MODELS_CONFIG[chat.model].label;
            modelNameEl.textContent = name;
            modelSelector.setAttribute('data-model', chat.model);

            modelOptions.forEach(o => {
                const isActive = o.dataset.model === chat.model;
                o.classList.toggle('active', isActive);
                o.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            populateEngines(chat.model);
            if (chat.engine && findEngine(chat.model, chat.engine)) {
                engineEl.value = chat.engine;
                currentEngine = chat.engine;
                updateEngineHint(findEngine(chat.model, chat.engine));
            }
        }

        if (chat.messages.length === 0) {
            enterEmptyMode();
        } else {
            enterChatMode();
            chat.messages.forEach(msg => {
                if (msg.role === 'user') {
                    addUserMessageToDOM(msg.text, false);
                } else if (msg.type === 'image') {
                    addBotImageToDOM(msg.src, false, msg.model || chat.model);
                } else if (msg.type === 'error') {
                    addBotErrorToDOM(msg.text, false);
                }
            });
            scrollBottom(false);
        }

        renderHistory();
        closeSidebar();
    }

    /* ══════════════════════════════════════════
       HELPERS
       ══════════════════════════════════════════ */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function enterChatMode() {
        mainEl.classList.remove('empty');
        mainEl.classList.add('chat-mode');
    }

    function enterEmptyMode() {
        mainEl.classList.add('empty');
        mainEl.classList.remove('chat-mode');
    }

    function scrollBottom(smooth = true) {
        requestAnimationFrame(() => {
            messagesEl.scrollTo({
                top: messagesEl.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        });
    }

    function showError(msg) {
        errorToast.textContent = msg;
        errorToast.classList.add('visible');
        clearTimeout(showError._t);
        showError._t = setTimeout(() => {
            errorToast.classList.remove('visible');
        }, 6000);
    }

    function hideError() {
        errorToast.classList.remove('visible');
    }

    /* ══════════════════════════════════════════
       DOM MESSAGE BUILDERS
       ══════════════════════════════════════════ */
    const WHALE_SVG = `
        <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 18.2c0-4.9 4-8.9 8.9-8.9h.6c2.1 0 4 .7 5.5 1.9L23.5 8v6.4c.4.7.7 1.6.7 2.5 0 4.4-3.6 8-8 8h-5.7c-4.4 0-8-3-8-6.7z"/>
            <circle cx="9.2" cy="15.2" r="1.15" fill="#1a1a1a"/>
        </svg>
    `;

    function modelTag(modelKey) {
        const label = MODELS_CONFIG[modelKey]?.label || 'Vernier';
        return `Vernier · ${label}`;
    }

    function addUserMessageToDOM(text, animate = true) {
        const el = document.createElement('div');
        el.className = 'msg user';
        if (!animate) el.style.animation = 'none';
        el.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
        messagesEl.appendChild(el);
        if (animate) scrollBottom();
        return el;
    }

    function addBotLoadingToDOM(modelKey) {
        const el = document.createElement('div');
        el.className = 'msg bot';
        el.id = 'bot-pending';
        el.innerHTML = `
            <div class="bot-head">
                <div class="bot-icon">${WHALE_SVG}</div>
                <span>${modelTag(modelKey)}</span>
            </div>
            <div class="bubble pending-bubble">
                <div class="pending-status">
                    <div class="loading-dots"><span></span><span></span><span></span></div>
                    <span class="loading-text" id="loading-text">Connecting...</span>
                </div>
                <div class="pending-progress" id="pending-progress" hidden>
                    <div class="progress-track">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="progress-meta">
                        <span id="progress-desc">Starting...</span>
                        <span id="progress-pct">0%</span>
                    </div>
                </div>
            </div>
        `;
        messagesEl.appendChild(el);
        scrollBottom();
        return el;
    }

    function setLoadingText(text) {
        const el = $('loading-text');
        if (el && el.textContent !== text) el.textContent = text;
    }

    function showProgress() {
        const p = $('pending-progress');
        if (p && p.hidden) p.hidden = false;
    }

    function setProgress(pct) {
        const fill = $('progress-fill');
        const lbl  = $('progress-pct');
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        if (fill) fill.style.width = p + '%';
        if (lbl)  lbl.textContent = p + '%';
    }

    function setProgressDesc(text) {
        const el = $('progress-desc');
        if (!el) return;
        const clean = String(text || '').trim();
        if (el.textContent !== clean) el.textContent = clean;
    }

    function addBotImageToDOM(src, animate = true, modelKey) {
        const el = document.createElement('div');
        el.className = 'msg bot';
        if (!animate) el.style.animation = 'none';
        const head = modelKey ? modelTag(modelKey) : 'Vernier';
        el.innerHTML = `
            <div class="bot-head">
                <div class="bot-icon">${WHALE_SVG}</div>
                <span>${head}</span>
            </div>
            <div class="msg-image" role="button" tabindex="0" title="Click to open full size">
                <img src="${src}" alt="Generated image" loading="lazy">
            </div>
        `;
        const wrap = el.querySelector('.msg-image');
        const openFull = () => window.open(src, '_blank', 'noopener');
        wrap.addEventListener('click', openFull);
        wrap.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openFull();
            }
        });
        messagesEl.appendChild(el);
        if (animate) scrollBottom();
        return el;
    }

    function addBotErrorToDOM(msg, animate = true) {
        const el = document.createElement('div');
        el.className = 'msg bot';
        if (!animate) el.style.animation = 'none';
        el.innerHTML = `
            <div class="bot-head">
                <div class="bot-icon">${WHALE_SVG}</div>
                <span>Vernier</span>
            </div>
            <div class="bubble" style="color:#fca5a5;border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.06);">
                ⚠️ ${escapeHtml(msg)}
            </div>
        `;
        messagesEl.appendChild(el);
        if (animate) scrollBottom();
        return el;
    }

    /* ══════════════════════════════════════════
       NEW CHAT
       ══════════════════════════════════════════ */
    function newChatUI() {
        if (isGenerating) return;
        currentChatId = null;
        clearMessagesUI();
        enterEmptyMode();
        promptEl.value = '';
        promptEl.style.height = '';
        syncTextarea();
        errorToast.classList.remove('visible');
        promptEl.focus({ preventScroll: true });
    }

    function newChatAndClose() {
        newChatUI();
        closeSidebar();
    }

    $('new-chat-btn').addEventListener('click', newChatAndClose);
    $('new-chat-side').addEventListener('click', newChatAndClose);

    /* ══════════════════════════════════════════
       CLEAR ALL
       ══════════════════════════════════════════ */
    $('clear-all').addEventListener('click', () => {
        if (isGenerating) return;
        if (!confirm('Delete all chats? This cannot be undone.')) return;
        chats = [];
        saveChats();
        currentChatId = null;
        newChatUI();
        renderHistory();
    });

    /* ══════════════════════════════════════════
       ENHANCE
       ══════════════════════════════════════════ */
    const enhanceBtn = $('enhance-btn');
    if (enhanceBtn) {
        enhanceBtn.addEventListener('click', () => {
            const enhancements = 'masterpiece, best quality, highly detailed, sharp focus, cinematic lighting, 8k';
            const current = promptEl.value.trim();
            if (!current.includes('masterpiece')) {
                promptEl.value = current ? `${current}, ${enhancements}` : enhancements;
                syncTextarea();
                promptEl.focus({ preventScroll: true });
            }
        });
    }

    /* ══════════════════════════════════════════
       SEARCH / BRAND
       ══════════════════════════════════════════ */
    $('search-btn').addEventListener('click', () => {
        openSidebar();
        setTimeout(() => historySearch.focus(), 350);
    });

    $('brand-btn').addEventListener('click', () => {
        if (sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    /* ══════════════════════════════════════════
       GRADIO CLIENT
       ══════════════════════════════════════════ */
    async function getClient(modelKey) {
        if (clients[modelKey]) return clients[modelKey];

        const config = MODELS_CONFIG[modelKey];
        if (!config) throw new Error(`Unknown model: ${modelKey}`);

        setLoadingText(`Connecting to ${config.label} server...`);
        clients[modelKey] = await Client.connect(config.url);
        return clients[modelKey];
    }

    /* ══════════════════════════════════════════
       STATUS HANDLER
       ══════════════════════════════════════════ */
    function handleStatus(status) {
        if (!status || typeof status !== 'object') return;

        const stage = status.stage;

        if (stage === 'pending') {
            setLoadingText('In queue...');
            return;
        }

        if (stage === 'generating') {
            const pd = Array.isArray(status.progress_data)
                ? status.progress_data[status.progress_data.length - 1]
                : null;

            if (pd && typeof pd === 'object') {
                showProgress();

                let pct = 0;
                if (typeof pd.progress === 'number') {
                    pct = pd.progress > 1 ? pd.progress : pd.progress * 100;
                }
                setProgress(pct);

                const desc = pd.desc || '';
                if (desc) setProgressDesc(desc);

                const lower = desc.toLowerCase();
                let phase = '';

                if (lower.includes('loading weights')) {
                    phase = 'Loading model weights...';
                } else if (lower.includes('loading pipeline') || lower.includes('configuring')) {
                    phase = 'Loading pipeline components...';
                } else if (lower.includes('freeing')) {
                    phase = 'Freeing VRAM memory...';
                } else if (lower.includes('uploading to github')) {
                    phase = 'Uploading to GitHub...';
                } else if (lower.includes('engine ready') || lower.includes('ready')) {
                    phase = 'Engine ready';
                } else if (lower.includes('step') || pd.unit === 'steps') {
                    phase = 'Generating image...';
                } else if (!desc && !_lastPhase) {
                    phase = 'Starting...';
                }

                if (phase && phase !== _lastPhase) {
                    _lastPhase = phase;
                    setLoadingText(phase);
                }
            } else {
                if (!_lastPhase) {
                    _lastPhase = 'Generating image...';
                    setLoadingText('Generating image...');
                }
            }
            return;
        }

        if (stage === 'complete') {
            setLoadingText('Finalizing...');
            showProgress();
            setProgress(100);
            return;
        }
    }

    /* ══════════════════════════════════════════
       BUILD PAYLOAD — per server
       ══════════════════════════════════════════
       Standard:   [engine, prompt, neg, ratio, steps, cfg, seed]
       Uncensored: [prompt, neg, rating, ratio, steps, cfg, seed]
       ══════════════════════════════════════════ */
    function buildPayload(modelKey, engine, prompt) {
        const neg   = negativeEl.value.trim() || "";
        const ratio = ratioEl.value;
        const steps = parseInt(stepsEl.value, 10);
        const cfg   = parseFloat(cfgEl.value);
        const seed  = parseInt(seedEl.value, 10);

        if (modelKey === 'uncensored') {
            const rating = (ratingEl && ratingEl.value) ? ratingEl.value : "explicit";
            return [prompt, neg, rating, ratio, steps, cfg, seed];
        }

        return [engine, prompt, neg, ratio, steps, cfg, seed];
    }

    /* ══════════════════════════════════════════
       SEND / GENERATE
       ══════════════════════════════════════════ */
    async function send() {
        if (isGenerating) return;

        const prompt = promptEl.value.trim();
        if (!prompt) {
            promptEl.focus({ preventScroll: true });
            return;
        }

        const modelKey = currentModel;
        const config   = MODELS_CONFIG[modelKey];
        const engine   = currentEngine;

        if (!currentChatId) {
            const chat = createChat(prompt);
            currentChatId = chat.id;
            enterChatMode();
        }

        const chat = getChat(currentChatId);
        if (!chat) return;

        hideError();
        enterChatMode();

        addUserMessageToDOM(prompt);
        chat.messages.push({ role: 'user', text: prompt, ts: Date.now(), model: modelKey });
        updateChatTitle(currentChatId, prompt);
        renderHistory();

        promptEl.value = '';
        promptEl.style.height = '';
        syncTextarea();

        isGenerating = true;
        sendBtn.classList.add('loading');
        updateSendBtn();

        _lastPhase = '';
        addBotLoadingToDOM(modelKey);

        try {
            const app = await getClient(modelKey);
            setLoadingText('Sending parameters...');

            const payload = buildPayload(modelKey, engine, prompt);

            console.log(`[${modelKey}] payload:`, payload);

            const submission = app.submit(config.apiName, payload);

            let finalResult = null;

            for await (const msg of submission) {
                if (!msg || typeof msg !== 'object') continue;

                if (msg.type === 'status') {
                    try { handleStatus(msg); } catch (_) {}
                } else if (msg.type === 'data') {
                    finalResult = msg;
                }
            }

            setLoadingText('Finalizing...');
            setProgress(100);

            /* Server returns: [image, github_url] */
            const data = finalResult && finalResult.data ? finalResult.data : finalResult;

            const githubUrl = (Array.isArray(data) &&
                               data.length > 1 &&
                               typeof data[1] === 'string' &&
                               data[1].startsWith('http'))
                ? data[1]
                : null;

            let src = null;

            if (githubUrl) {
                src = githubUrl;
            } else {
                const first = Array.isArray(data) ? data[0] : data;

                if (typeof first === 'string') {
                    if (first.startsWith('data:image')) src = first;
                    else if (first.startsWith('http'))  src = first;
                    else                                src = 'data:image/png;base64,' + first;
                } else if (first && typeof first === 'object') {
                    if (first.url)       src = first.url;
                    else if (first.path) src = first.path;
                    else if (first.name) src = first.name;
                }
            }

            if (!src) throw new Error('No image data received from API.');

            const pending = $('bot-pending');
            if (pending) pending.remove();
            addBotImageToDOM(src, true, modelKey);

            chat.messages.push({
                role: 'bot', type: 'image', src,
                model: modelKey, engine, ts: Date.now()
            });
            chat.updatedAt = Date.now();
            saveChats();

        } catch (err) {
            console.error('Generation error:', err);
            let msg = 'Something went wrong.';
            if (err && err.message) {
                if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                    msg = 'Could not reach the API. Make sure the Gradio server is running.';
                } else if (err.message.toLowerCase().includes('timeout')) {
                    msg = 'Request timed out. Please try again.';
                } else {
                    msg = err.message;
                }
            }

            const pending = $('bot-pending');
            if (pending) pending.remove();
            addBotErrorToDOM(msg);
            showError(msg);

            chat.messages.push({ role: 'bot', type: 'error', text: msg, ts: Date.now() });
            chat.updatedAt = Date.now();
            saveChats();

        } finally {
            isGenerating = false;
            sendBtn.classList.remove('loading');
            updateSendBtn();
            promptEl.focus({ preventScroll: true });
        }
    }

    /* ══════════════════════════════════════════
       EVENTS
       ══════════════════════════════════════════ */
    sendBtn.addEventListener('click', send);

    promptEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isGenerating && promptEl.value.trim()) {
                send();
            }
        }
    });

    promptEl.addEventListener('paste', () => {
        setTimeout(syncTextarea, 0);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (settingsModal.classList.contains('open')) {
                closeSettings();
            } else if (sidebar.classList.contains('open')) {
                closeSidebar();
            }
            closeModelDropdown();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openSidebar();
            setTimeout(() => historySearch.focus(), 350);
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            newChatUI();
        }
    });

    /* ══════════════════════════════════════════
       INIT
       ══════════════════════════════════════════ */
    loadChats();
    renderHistory();
    populateEngines(currentModel);
    promptEl.focus({ preventScroll: true });

})();