const { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const { countMessagesTokens, loadVocab } = require('./core/tokenizer/tokenizer');

// Local-time formatters. Node's toISOString() returns UTC; Python's strftime
// returns local time. To keep every timestamp in the app consistent, all
// timestamps written by main.js use these helpers instead of toISOString.
function localTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let mainWindow;
let coreProcess = null;
let confirmedClose = false;
// Map of agentId -> BrowserWindow for open popout conversation windows.
// The main process is the source of truth for which conversations are
// popped out; the renderer mirrors this via popout-opened / popout-closed
// events and can query it via get-open-popouts after a reload.
const popoutWindows = new Map();
const CORE_DIR = path.join(__dirname, 'core');
const AGENTS_DIR = path.join(CORE_DIR, 'agents');
const INCOMING_DIR = path.join(CORE_DIR, 'incoming');
const LOG_FILE = path.join(CORE_DIR, 'logs', 'dev_log.txt');

// Ensure agents directory exists
if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR, { recursive: true });
if (!fs.existsSync(INCOMING_DIR)) fs.mkdirSync(INCOMING_DIR, { recursive: true });

// ========== Log ==========
function tinlog(system, message) {
  try {
    const line = `[${localTimestamp()}] [${system}] ${message}`;
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    console.error('Log write failed:', e.message);
  }
}

// ========== Ephemera — Virtual Stateless Agent ==========

const EPHEMERA_ID = '__ephemera__';
const EPHEMERA_FILE = path.join(CORE_DIR, 'ephemera.json');

function readEphemera() {
  if (!fs.existsSync(EPHEMERA_FILE)) return { model: '', temperature: 0.7, last: null };
  try { return JSON.parse(fs.readFileSync(EPHEMERA_FILE, 'utf-8')); } catch { return { model: '', temperature: 0.7, last: null }; }
}

function writeEphemera(data) {
  fs.writeFileSync(EPHEMERA_FILE, JSON.stringify(data, null, 2));
}

// ========== Agent Storage Helpers ==========

function agentDir(id) { return path.join(AGENTS_DIR, id); }
function contextPath(id) { return path.join(agentDir(id), 'context.jsonl'); }
function indexPath(id) { return path.join(agentDir(id), 'context_index.json'); }
function identityPath(id) { return path.join(agentDir(id), 'identity.md'); }

function readAgentList() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  const e = readEphemera();
  const ephemera = { id: EPHEMERA_ID, name: 'Ephemera', room: 'Stateless', model: e.model, temperature: e.temperature, ephemera: true };
  const agents = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      const metaPath = path.join(AGENTS_DIR, d.name, 'meta.json');
      let meta = { name: d.name, room: d.name + "'s Room" };
      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }; } catch {}
      }
      return { id: d.name, ...meta };
    });
  return [ephemera, ...agents];
}

function readConversation(agentId) {
  if (agentId === EPHEMERA_ID) {
    const e = readEphemera();
    if (!e.last) return [];
    return [e.last.user, e.last.assistant].filter(Boolean);
  }
  const cp = contextPath(agentId);
  if (!fs.existsSync(cp)) return [];
  const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
  const allMessages = lines.map(l => JSON.parse(l));
  const idx = readIndex(agentId);
  const activeIds = new Set(idx.active);
  const displayOnlyIds = new Set(idx.display_only || []);
  const culledRecordIds = new Set(idx.culled_records || []);
  // Include active messages, excluding glimpse placeholders (display_only replaces them for rendering)
  // Include display_only messages (glimpse full text) for display
  const filtered = allMessages.filter(m => {
    if (activeIds.has(m.id)) {
      if (m.glimpse_placeholder) return false;
      return true;
    }
    if (displayOnlyIds.has(m.id)) return true;
    return false;
  });
  // Dedupe by id, keeping the last occurrence. Guards against any writer that
  // appends the same message id twice (e.g. multiple failure markers from
  // concurrent marking paths).
  const _seenIdx = {};
  const messages = [];
  filtered.forEach(m => {
    if (_seenIdx[m.id] !== undefined) {
      messages[_seenIdx[m.id]] = m;
    } else {
      _seenIdx[m.id] = messages.length;
      messages.push(m);
    }
  });

  // Attach reasoning blocks and tool log markers
  const reasoningPath = path.join(agentDir(agentId), 'reasoning.jsonl');
  if (fs.existsSync(reasoningPath)) {
    try {
      const lines = fs.readFileSync(reasoningPath, 'utf-8').split('\n').filter(l => l.trim());
      const reasoningMap = {};
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.msg_id && entry.reasoning) {
            reasoningMap[entry.msg_id] = entry.reasoning;
          }
        } catch {}
      }
      messages.forEach(msg => {
        if (msg.role === 'assistant' && reasoningMap[msg.id]) {
          msg.reasoning = reasoningMap[msg.id];
        }
      });
    } catch {}
  }
  messages.forEach(msg => {
    if (culledRecordIds.has(msg.id)) msg._culled = true;
  });

  return messages;
}

function readIndex(agentId) {
  const ip = indexPath(agentId);
  if (!fs.existsSync(ip)) return { active: [] };
  return JSON.parse(fs.readFileSync(ip, 'utf-8'));
}

function writeIndex(agentId, index) {
  fs.writeFileSync(indexPath(agentId), JSON.stringify(index, null, 2));
}

function appendMessage(agentId, message) {
  const cp = contextPath(agentId);
  fs.appendFileSync(cp, JSON.stringify(message) + '\n');
  const idx = readIndex(agentId);
  idx.active.push(message.id);
  writeIndex(agentId, idx);
}

function removeFromIndex(agentId, messageId) {
  const idx = readIndex(agentId);
  idx.active = idx.active.filter(id => id !== messageId);
  // Also remove stub if this is a display_only glimpse message
  if (idx.display_only && idx.display_only.includes(messageId)) {
    idx.display_only = idx.display_only.filter(id => id !== messageId);
    // Remove the paired stub too
    idx.active = idx.active.filter(id => id !== `${messageId}_stub`);
  }
  writeIndex(agentId, idx);
}

function editMessageInPlace(agentId, messageId, newContent) {
  const editEntry = {
    id: `edit_${Date.now()}`,
    role: 'system',
    action: 'edit',
    original_id: messageId,
    new_content: newContent,
    timestamp: localTimestamp()
  };
  fs.appendFileSync(contextPath(agentId), JSON.stringify(editEntry) + '\n');
  const idx = readIndex(agentId);
  idx.active = idx.active.filter(id => id !== messageId);
  const corrected = {
    id: `corrected_${messageId}`,
    original_id: messageId,
    content: newContent,
    edited: true
  };
  fs.appendFileSync(contextPath(agentId), JSON.stringify(corrected) + '\n');
  idx.active.push(corrected.id);
  writeIndex(agentId, idx);
}

// ========== Model List ==========

// Fallback models per provider — used when live fetch fails.
const FALLBACK_MODELS = {
  groq: [
    { id: 'groq/llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile' },
    { id: 'groq/llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant' },
    { id: 'groq/mixtral-8x7b-32768',       label: 'Mixtral 8x7B' },
    { id: 'groq/gemma2-9b-it',             label: 'Gemma 2 9B' },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (Free)' },
    { id: 'deepseek/deepseek-r1:free',           label: 'DeepSeek R1 (Free)' },
    { id: 'google/gemini-2.0-flash',             label: 'Gemini 2.0 Flash' },
    { id: 'google/gemini-2.5-pro',               label: 'Gemini 2.5 Pro' },
    { id: 'meta-llama/llama-3.3-70b-instruct',   label: 'Llama 3.3 70B' },
    { id: 'mistralai/mistral-large',             label: 'Mistral Large' },
    { id: 'qwen/qwen-2.5-72b-instruct',          label: 'Qwen 2.5 72B' },
    { id: 'openai/gpt-4o',                       label: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini',                  label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { id: 'anthropic/claude-opus-4-6',            label: 'Claude Opus 4.6' },
    { id: 'anthropic/claude-sonnet-4-6',          label: 'Claude Sonnet 4.6' },
    { id: 'anthropic/claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'openai-direct/gpt-4o',       label: 'GPT-4o' },
    { id: 'openai-direct/gpt-4o-mini',  label: 'GPT-4o Mini' },
    { id: 'openai-direct/o3-mini',      label: 'o3 Mini' },
  ],
  xai: [
    { id: 'xai/grok-3',       label: 'Grok 3' },
    { id: 'xai/grok-3-mini',  label: 'Grok 3 Mini' },
  ],
  mistral: [
    { id: 'mistral-direct/mistral-large-latest',   label: 'Mistral Large' },
    { id: 'mistral-direct/mistral-small-latest',   label: 'Mistral Small' },
    { id: 'mistral-direct/codestral-latest',       label: 'Codestral' },
  ],
  deepseek: [
    { id: 'deepseek-direct/deepseek-chat',     label: 'DeepSeek V3' },
    { id: 'deepseek-direct/deepseek-reasoner', label: 'DeepSeek R1' },
  ],
  cohere: [
    { id: 'cohere/command-r-plus', label: 'Command R+' },
    { id: 'cohere/command-r',      label: 'Command R' },
  ],
  together: [
    { id: 'together/meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
    { id: 'together/mistralai/Mixtral-8x7B-Instruct-v0.1',    label: 'Mixtral 8x7B' },
    { id: 'together/Qwen/Qwen2.5-72B-Instruct-Turbo',         label: 'Qwen 2.5 72B Turbo' },
  ],
  kimi: [
    { id: 'kimi/kimi-k3',   label: 'Kimi K3' },
    { id: 'kimi/kimi-k2.6', label: 'Kimi K2.6' },
  ],
};

// Fetch models from a provider's API with a timeout.
// Returns array of { id, label } or null on failure.
async function fetchModelsFromProvider(providerName, apiKey) {
  const https = require('https');
  const FETCH_TIMEOUT = 5000;

  const endpoints = {
    groq:       { host: 'api.groq.com',          path: '/openai/v1/models',              prefix: 'groq/' },
    openrouter: { host: 'openrouter.ai',          path: '/api/v1/models',                 prefix: '' },
    openai:     { host: 'api.openai.com',         path: '/v1/models',                     prefix: 'openai-direct/' },
    xai:        { host: 'api.x.ai',               path: '/v1/models',                     prefix: 'xai/' },
    mistral:    { host: 'api.mistral.ai',         path: '/v1/models',                     prefix: 'mistral-direct/' },
    cohere:     { host: 'api.cohere.com',          path: '/compatibility/v1/models',       prefix: 'cohere/' },
    together:   { host: 'api.together.xyz',        path: '/v1/models',                     prefix: 'together/' },
    deepseek:   { host: 'api.deepseek.com',        path: '/v1/models',                     prefix: 'deepseek-direct/' },
    anthropic:  null,  // No models endpoint — use fallback only
    kimi:       { host: 'api.moonshot.ai',         path: '/v1/models',                     prefix: 'kimi/' },
    gemini: { host: 'generativelanguage.googleapis.com', path: '/v1beta/models?pageSize=200', prefix: 'gemini/', gemini: true },
  };

  const ep = endpoints[providerName];
  if (!ep) return null;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), FETCH_TIMEOUT);
    const isGemini = !!ep.gemini;
    const reqPath = isGemini ? `${ep.path}&key=${apiKey}` : ep.path;
    const reqHeaders = isGemini
      ? { 'Content-Type': 'application/json' }
      : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const req = https.request({
      hostname: ep.host,
      path: reqPath,
      method: 'GET',
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(data);
          let models = [];
          if (isGemini) {
            models = (json.models || [])
              .filter(m => m.name && (m.supportedGenerationMethods || []).includes('generateContent'))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(m => {
                const bare = m.name.replace('models/', '');
                return { id: `gemini/${bare}`, label: m.displayName || bare };
              });
          } else if (providerName === 'openrouter') {
            const raw = json.data || json.models || [];
            models = raw
              .filter(m => m.id && !m.id.includes('deprecated'))
              .sort((a, b) => a.id.localeCompare(b.id))
              .map(m => ({
                id: m.id,
                label: m.name || m.id,
                reasoning: m.reasoning || null,
              }));
          } else {
            const raw = json.data || json.models || [];
            models = raw
              .filter(m => m.id)
              .sort((a, b) => a.id.localeCompare(b.id))
              .map(m => ({ id: `${ep.prefix}${m.id}`, label: m.id }));
          }
          resolve(models.length > 0 ? models : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => { clearTimeout(timer); resolve(null); });
    req.end();
  });
}

async function getAvailableModels() {
  const configPath = path.join(CORE_DIR, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
  }

  // Map of provider name -> { key, label }
  const providerMap = [
    { name: 'groq',       key: config.groq_api_key,       label: 'Groq' },
    { name: 'openrouter', key: config.openrouter_api_key, label: 'OpenRouter' },
    { name: 'anthropic',  key: config.anthropic_api_key,  label: 'Anthropic' },
    { name: 'openai',     key: config.openai_api_key,     label: 'OpenAI' },
    { name: 'xai',        key: config.xai_api_key,        label: 'xAI' },
    { name: 'mistral',    key: config.mistral_api_key,    label: 'Mistral' },
    { name: 'cohere',     key: config.cohere_api_key,     label: 'Cohere' },
    { name: 'together',   key: config.together_api_key,   label: 'Together AI' },
    { name: 'deepseek',   key: config.deepseek_api_key,   label: 'DeepSeek' },
    { name: 'gemini',     key: config.gemini_api_key,     label: 'Google Gemini' },
    { name: 'kimi',       key: config.kimi_api_key,       label: 'Kimi (Moonshot)' },
  ].filter(p => p.key);

  if (providerMap.length === 0) {
    // No keys configured — return Groq fallback so UI isn't empty
    return [{ provider: 'Groq (no key)', models: FALLBACK_MODELS.groq }];
  }

  // Fetch all providers in parallel
  const results = await Promise.all(
    providerMap.map(async (p) => {
      const live = await fetchModelsFromProvider(p.name, p.key);
      const models = live || FALLBACK_MODELS[p.name] || [];
      const source = live ? '' : ' (fallback)';
      tinlog('CONFIG', `Models for ${p.name}: ${models.length} loaded${source}`);
      return { provider: p.label, models, providerName: p.name };
    })
  );

  const filtered = results.filter(r => r.models.length > 0);

  // Build a bare-name -> reasoning metadata map from OpenRouter's live model list.
  // Keyed by the portion after the first '/' so direct-provider models can look up
  // their OpenRouter counterpart (e.g. 'deepseek-direct/deepseek-v4-flash' -> 'deepseek-v4-flash').
  const orReasoningMap = {};
  const orResult = filtered.find(r => r.providerName === 'openrouter');
  if (orResult) {
    for (const m of orResult.models) {
      if (m.reasoning) {
        const slash = m.id.indexOf('/');
        const bare = slash !== -1 ? m.id.slice(slash + 1) : m.id;
        orReasoningMap[bare] = m.reasoning;
      }
    }
  }

  // Strip providerName from output (internal only) and attach the reasoning map
  return [
    ...filtered.map(({ provider, models }) => ({ provider, models })),
    { __orReasoningMap: orReasoningMap },
  ];
}

// ========== Electron Window ==========

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('dist/index.html');
  mainWindow.setTitle('Lucid');
  setupExternalLinks(mainWindow);
  // Forward Chromium's context-menu event to the renderer so we can show a
  // theme-aware custom menu instead of a native one. No native menu appears
  // by default in Electron; this listener is the only path.
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-context-menu', params);
    }
  });
  // Intercept close so the renderer can show a confirmation modal. Applies to
  // the custom X button, Alt+F4, taskbar close, and any other OS-level close.
  // The renderer responds via window-close-confirmed if the user accepts.
  mainWindow.on('close', (event) => {
    if (!confirmedClose) {
      event.preventDefault();
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-close-requested');
    } else {
      // Closing for real — cascade-close every popout window so the app
      // doesn't linger with orphaned windows and a running core subprocess.
      const wins = Array.from(popoutWindows.values());
      popoutWindows.clear();
      for (const w of wins) {
        if (!w.isDestroyed()) w.close();
      }
    }
  });
}

function createConversationWindow(agentId, agentName, agentRoom) {
  const existing = popoutWindows.get(agentId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
    width: 800,
    height: 700,
    frame: false,
    title: agentName,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('dist/index.html', { hash: `/popout/${agentId}` });
  setupExternalLinks(win);
  // The loaded document's <title> would otherwise override our BrowserWindow
  // title, which is what the OS taskbar shows. Prevent the override so the
  // agent name persists in the taskbar.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => {
    popoutWindows.delete(agentId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('popout-closed', agentId);
    }
  });
  popoutWindows.set(agentId, win);
  return win;
}

// Route external links (http/https) to the user's default browser instead of
// opening an in-app window or navigating the renderer away from the app.
// Two hooks: setWindowOpenHandler catches <a target="_blank"> and window.open;
// will-navigate catches plain <a href="..."> clicks that would otherwise
// replace the current page. Applied to every window Lucid creates.
function setupExternalLinks(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function startCore() {
  if (coreProcess) return;
  const proc = spawn('python', [path.join(CORE_DIR, 'main.py')], {
    cwd: CORE_DIR,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  coreProcess = proc;
  proc.on('close', (code) => {
    console.log(`Core exited with code ${code}`);
    if (coreProcess === proc) coreProcess = null;
  });
  proc.stderr.on('data', (data) => {
    console.error(`Core: ${data}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  startCore();
});

app.on('window-all-closed', () => {
  if (coreProcess) coreProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (coreProcess) coreProcess.kill();
});

// ========== Window Controls ==========

// Window controls operate on whichever window invoked them, so popout
// windows get their own minimize/maximize/close. The main window's close is
// still intercepted by its own 'close' handler (which shows the exit modal);
// popouts have no intercept and close immediately.
ipcMain.handle('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.minimize();
});
ipcMain.handle('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  }
});
ipcMain.handle('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});
ipcMain.handle('window-set-fullscreen', (event, { fullscreen }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return { wasFullscreen: false };
  const wasFullscreen = win.isFullScreen();
  if (!!fullscreen !== wasFullscreen) win.setFullScreen(!!fullscreen);
  return { wasFullscreen };
});
ipcMain.handle('window-close-confirmed', () => {
  confirmedClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});
ipcMain.handle('open-popout', (event, { agentId, agentName, agentRoom }) => {
  createConversationWindow(agentId, agentName, agentRoom);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('popout-opened', agentId);
  }
  return { ok: true };
});
ipcMain.handle('close-popout', (event, { agentId }) => {
  const win = popoutWindows.get(agentId);
  if (win && !win.isDestroyed()) win.close();
  return { ok: true };
});
ipcMain.handle('get-open-popouts', () => Array.from(popoutWindows.keys()));

// ========== Tool Record Culling ==========

function _aggregateRecordContent(m) {
  const parts = [];
  if (m.parse_errors && m.parse_errors.length > 0) {
    parts.push('[Earlier parse errors in this turn:\n' + m.parse_errors.map(p => '- ' + (p.error || '')).join('\n') + ']');
  }
  if (m.tool_record) parts.push(m.tool_record);
  if (m.retained_file && m.retained_file.contents) {
    parts.push('[Retained file: ' + (m.retained_file.path || '?') + ']\n' + m.retained_file.contents + '\n[End of retained file]');
  }
  return parts.join('\n');
}

function _countCallsInRecord(tr) {
  if (!tr) return 0;
  return tr.split('\n---\n').length;
}

ipcMain.handle('get-tool-record-stats', async (event, { agentId }) => {
  try {
    const cp = contextPath(agentId);
    if (!fs.existsSync(cp)) return { active: { messages: 0, calls: 0, tokens: 0 }, culled: { messages: 0, calls: 0, tokens: 0 } };
    const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
    const idx = readIndex(agentId);
    const culledSet = new Set(idx.culled_records || []);
    const activeStrings = [], culledStrings = [];
    let activeMsgs = 0, activeCalls = 0, culledMsgs = 0, culledCalls = 0;
    for (const line of lines) {
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.role !== 'assistant') continue;
      const _hasRetained = !!(m.retained_file && m.retained_file.contents);
      if (!m.tool_record && (!m.parse_errors || m.parse_errors.length === 0) && !_hasRetained) continue;
      const aggregate = _aggregateRecordContent(m);
      const callCount = _countCallsInRecord(m.tool_record);
      if (culledSet.has(m.id)) {
        culledMsgs++; culledCalls += callCount; culledStrings.push(aggregate);
      } else {
        activeMsgs++; activeCalls += callCount; activeStrings.push(aggregate);
      }
    }
    // Tokenize in chunks so the main process stays responsive and the
    // renderer can show a progress bar. Each chunk is a small slice of the
    // record strings; the sum is equivalent to tokenizing the whole set.
    const sender = event.sender;
    const total = activeStrings.length + culledStrings.length;
    let processed = 0;
    const CHUNK = 15;
    const tokenizeChunked = async (strings) => {
      let sum = 0;
      for (let i = 0; i < strings.length; i += CHUNK) {
        const chunk = strings.slice(i, i + CHUNK);
        if (chunk.length > 0) {
          sum += countMessagesTokens([{ role: 'assistant', content: chunk.join('\n') }]);
        }
        processed += chunk.length;
        if (sender && !sender.isDestroyed()) {
          try { sender.send('tool-record-progress', { agentId, processed, total }); } catch {}
        }
        await new Promise(r => setImmediate(r));
      }
      return sum;
    };
    const activeTokens = await tokenizeChunked(activeStrings);
    const culledTokens = await tokenizeChunked(culledStrings);
    return {
      active: { messages: activeMsgs, calls: activeCalls, tokens: activeTokens },
      culled: { messages: culledMsgs, calls: culledCalls, tokens: culledTokens },
    };
  } catch (e) {
    return { error: e.message };
  }
});

function _writeSystemNote(agentId, kind, content) {
  const now = localTimestamp();
  const noteId = 'note_' + Date.now();
  const noteMsg = {
    id: noteId,
    role: 'user',
    content,
    timestamp: now,
    agent_id: agentId,
    system_note: true,
    system_note_kind: kind
  };
  fs.appendFileSync(contextPath(agentId), JSON.stringify(noteMsg) + '\n');
  const idx = readIndex(agentId);
  idx.active.push(noteId);
  writeIndex(agentId, idx);
  return noteMsg;
}

function _findLastPurgeNote(agentId) {
  const cp = contextPath(agentId);
  if (!fs.existsSync(cp)) return null;
  const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
  let last = null;
  for (const line of lines) {
    try {
      const m = JSON.parse(line);
      if (m.system_note && m.system_note_kind === 'purge') last = m;
    } catch {}
  }
  return last;
}

ipcMain.handle('purge-tool-records', async (event, { agentId, stats }) => {
  try {
    const cp = contextPath(agentId);
    if (!fs.existsSync(cp)) return { error: 'Context not found' };
    const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
    const idx = readIndex(agentId);
    const existing = new Set(idx.culled_records || []);
    let added = 0;
    for (const line of lines) {
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.role !== 'assistant') continue;
      if (!m.tool_record && (!m.parse_errors || m.parse_errors.length === 0)) continue;
      if (!existing.has(m.id)) {
        existing.add(m.id);
        added++;
      }
    }
    idx.culled_records = Array.from(existing);
    writeIndex(agentId, idx);
    // Tombstone note describing the purge, so the agent has a durable record
    // of what happened and doesn't reconstruct the removed content from
    // memory. Stats come from the caller (the modal already computed them).
    if (stats && added > 0) {
      const s = stats;
      const now = localTimestamp();
      const msgWord = s.messages === 1 ? 'message' : 'messages';
      const callWord = s.calls === 1 ? 'tool call' : 'tool calls';
      const content =
        '[Lucid platform note \u2014 ' + now + ']\n\n' +
        'Your tool records have been purged. ' +
        s.messages + ' ' + msgWord + ', ' + s.calls + ' ' + callWord +
        ', and approximately ' + s.tokens.toLocaleString() + ' tokens of tool invocation records have been removed from your context. ' +
        'Every tool call you made before this point, and every result returned by those calls, is no longer in your accessible history.\n\n' +
        'You retain your prose responses, but they describe what you did at the time \u2014 not the current state of the files. ' +
        'You have no raw reference to the contents of any file you read, edited, or searched using Lucid\u2019s tools. ' +
        'The files themselves were not modified by this purge.\n\n' +
        'To rebuild your working model of a file after this purge, call retain_file (requires user approval). The retained copy persists across turns, so you can reason about it continuously rather than re-reading it. ' +
        'If a retained file changes on disk, use refresh_file to replace the retained copy in place \u2014 this does not grow your context. ' +
        'Do not reconstruct file contents from memory \u2014 the files may have changed since you last saw them, and any reconstruction would be unreliable.';
      _writeSystemNote(agentId, 'purge', content);
    }
    tinlog('AGENT', `Purged ${added} tool record(s) for ${agentId}`);
    return { ok: true, added };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('restore-tool-records', async (event, { agentId, stats }) => {
  try {
    const idx = readIndex(agentId);
    const cleared = (idx.culled_records || []).length;
    idx.culled_records = [];
    writeIndex(agentId, idx);
    if (stats && cleared > 0) {
      const lastPurge = _findLastPurgeNote(agentId);
      const purgeWhen = lastPurge ? lastPurge.timestamp : 'an earlier point in this session';
      const now = localTimestamp();
      const msgWord = stats.messages === 1 ? 'message' : 'messages';
      const callWord = stats.calls === 1 ? 'tool call' : 'tool calls';
      const content =
        '[Lucid platform note \u2014 ' + now + ']\n\n' +
        'Tool records have been restored. ' +
        stats.messages + ' ' + msgWord + ', ' + stats.calls + ' ' + callWord +
        ', and approximately ' + stats.tokens.toLocaleString() + ' tokens archived during the purge of ' + purgeWhen + ' are again present in your context.\n\n' +
        'These records describe the state of files as they were when the tool calls were made. ' +
        'They are not a guarantee of current state. Verify with read_file before acting on them if precision matters. ' +
        'If any restored retained files are stale, use refresh_file to bring them current without re-approval for a fresh retain.';
      _writeSystemNote(agentId, 'restore', content);
    }
    tinlog('AGENT', `Restored ${cleared} tool record(s) for ${agentId}`);
    return { ok: true, cleared };
  } catch (e) {
    return { error: e.message };
  }
});
ipcMain.handle('broadcast-app-setting', (event, payload) => {
  // Forward a settings change (font scale, theme) to every other open window.
  // The originating window already applied it locally; excluding it avoids a
  // redundant re-apply and possible feedback loop.
  const sender = event.sender;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== sender) {
      win.webContents.send('app-setting-changed', payload);
    }
  }
  return { ok: true };
});

// ========== Context Menu Operations ==========

ipcMain.handle('ctx-copy', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.copy(); });
ipcMain.handle('ctx-cut',  () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.cut(); });
ipcMain.handle('ctx-paste',() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.paste(); });
ipcMain.handle('ctx-replace-misspelling', (event, word) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.replaceMisspelling(word);
});

// ========== IPC Handlers ==========

ipcMain.handle('get-status', async () => {
  const coreRunning = coreProcess !== null && coreProcess.exitCode === null;
  return { backend: coreRunning ? 'running' : 'stopped' };
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-queue', async () => {
  const tasks = [];
  // Incoming/ files not yet absorbed by backend — these are always pending
  if (fs.existsSync(INCOMING_DIR)) {
    const files = fs.readdirSync(INCOMING_DIR).filter(f => f.endsWith('.json')).sort();
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(INCOMING_DIR, f), 'utf-8'));
        const agentId = data.agent_id || '';
        let agentName = agentId === EPHEMERA_ID ? 'Ephemera' : agentId;
        const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
        if (fs.existsSync(metaPath)) {
          try { agentName = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).name || agentId; } catch {}
        }
        tasks.push({ file: f, agentId, agentName });
      } catch {}
    }
  }
  // Read queue/ directory for pending tasks
  const queueDir = path.join(CORE_DIR, 'queue');
  if (fs.existsSync(queueDir)) {
    try {
      const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(queueDir, f), 'utf-8'));
          if (t.status !== 'pending' && t.status !== 'processing') continue;
          const agentId = t.agent_id || '';
          let agentName = agentId === EPHEMERA_ID ? 'Ephemera' : agentId;
          const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
          if (fs.existsSync(metaPath)) {
            try { agentName = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).name || agentId; } catch {}
          }
          if (!tasks.some(x => x.file === t.id)) {
            tasks.push({ file: t.id, agentId, agentName, status: t.status });
          }
        } catch {}
      }
    } catch {}
  }
  return tasks;
});

ipcMain.handle('cancel-task', async (event, { file }) => {
  // Resolve the task's agent_id so the cancel file lands where send_message
  // checks for it. send_message polls cancel_{agent_id}.txt; using the task
  // id here would write a file nothing reads.
  let agentIdForCancel = null;
  const queueTaskPath = path.join(CORE_DIR, 'queue', `${file}.json`);
  if (fs.existsSync(queueTaskPath)) {
    try {
      const t = JSON.parse(fs.readFileSync(queueTaskPath, 'utf-8'));
      agentIdForCancel = t.agent_id || null;
    } catch {}
  }
  // Fallback: peek at incoming/ if the task hasn't been absorbed yet
  if (!agentIdForCancel) {
    const incomingPath = path.join(INCOMING_DIR, `${file}.json`);
    if (fs.existsSync(incomingPath)) {
      try {
        const t = JSON.parse(fs.readFileSync(incomingPath, 'utf-8'));
        agentIdForCancel = t.agent_id || null;
      } catch {}
    }
  }
  const cancelKey = agentIdForCancel || file;
  const cancelPath = path.join(CORE_DIR, 'streaming', `cancel_${cancelKey}.txt`);
  try { fs.writeFileSync(cancelPath, 'cancel'); } catch {}
  // Delete from incoming/ — check both with and without .json extension
  const fpath = path.join(INCOMING_DIR, file);
  const fpathJson = path.join(INCOMING_DIR, `${file}.json`);
  for (const fp of [fpath, fpathJson]) {
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
  }
  // Mark as cancelled in queue/{id}.json so the pending task is skipped by
  // the backend. If the task is already processing, the cancel file is what
  // stops it at the next loop boundary. queueTaskPath is declared at the top
  // of this handler for the agent-id lookup.
  if (fs.existsSync(queueTaskPath)) {
    try {
      const t = JSON.parse(fs.readFileSync(queueTaskPath, 'utf-8'));
      if (t.status === 'pending') {
        t.status = 'cancelled';
        const tmp = queueTaskPath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(t, null, 2));
        fs.renameSync(tmp, queueTaskPath);
      }
    } catch {}
  }
  tinlog('QUEUE', `Task cancelled: ${file}`);
  return { success: true };
});

ipcMain.handle('get-recent-log', async () => {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const text = fs.readFileSync(LOG_FILE, 'utf-8');
    return text.split('\n').filter(l => l.trim());
  } catch (e) {
    return [];
  }
});

// ---- Agent IPC ----

ipcMain.handle('list-agents', async () => {
  return readAgentList();
});

ipcMain.handle('get-conversation', async (event, agentId) => {
  return readConversation(agentId);
});

ipcMain.handle('send-message', async (event, { agentId, content, glimpse, attachments }) => {
  if (agentId !== EPHEMERA_ID && !fs.existsSync(agentDir(agentId))) {
    return { error: 'Agent not found' };
  }
  const ts = localTimestamp();
  // Process attachments: copy each selected file into the agent's attachments
  // directory with a timestamp prefix, and record metadata on the message.
  // Stage 1: text attachments only (no image handling yet).
  let processedAttachments = null;
  if (attachments && attachments.length > 0 && agentId !== EPHEMERA_ID) {
    const attDir = path.join(agentDir(agentId), 'attachments');
    if (!fs.existsSync(attDir)) fs.mkdirSync(attDir, { recursive: true });
    processedAttachments = [];
    const epoch = Math.floor(Date.now() / 1000);
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
    for (const a of attachments) {
      try {
        if (!a || !a.path || !fs.existsSync(a.path)) continue;
        const originalName = a.name || path.basename(a.path);
        const ext = path.extname(originalName).toLowerCase();
        const isImage = IMAGE_EXTS.has(ext);
        const storedName = `${epoch}_${originalName}`;
        const dest = path.join(attDir, storedName);
        fs.copyFileSync(a.path, dest);
        const record = {
          filename: storedName,
          original_name: originalName,
          size: fs.statSync(dest).size,
          type: isImage ? 'image' : 'text'
        };
        if (isImage) {
          try {
            const img = nativeImage.createFromPath(dest);
            if (!img.isEmpty()) {
              const thumbBuf = img.resize({ width: 64 }).toPNG();
              record.thumbDataUrl = 'data:image/png;base64,' + thumbBuf.toString('base64');
            }
          } catch (e) {
            tinlog('AGENT', `Thumbnail generation failed for ${storedName}: ${e.message}`);
          }
        }
        processedAttachments.push(record);
      } catch (err) {
        tinlog('AGENT', `Attachment copy failed: ${err.message}`);
      }
    }
    if (processedAttachments.length === 0) processedAttachments = null;
  }
  const msg = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content: content,
    timestamp: ts,
    agent_id: agentId
  };
  if (processedAttachments) msg.attachments = processedAttachments;
  let stillpoint = false;
  if (agentId === EPHEMERA_ID) {
    const e = readEphemera();
    writeEphemera({ ...e, last: { user: { ...msg, role: 'user' }, assistant: null } });
  } else {
    const metaPath = path.join(agentDir(agentId), 'meta.json');
    if (fs.existsSync(metaPath)) {
      try { stillpoint = !!JSON.parse(fs.readFileSync(metaPath, 'utf-8')).stillpoint; } catch {}
    }
    if (stillpoint) {
      const idx = readIndex(agentId);
      const cp = contextPath(agentId);
      if (fs.existsSync(cp)) {
        const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
        const stillpointIds = new Set();
        lines.forEach(l => { try { const m = JSON.parse(l); if (m.stillpoint) stillpointIds.add(m.id); } catch {} });
        if (stillpointIds.size > 0) {
          idx.active = idx.active.filter(id => !stillpointIds.has(id));
          writeIndex(agentId, idx);
        }
      }
      msg.stillpoint = true;
    }
    if (glimpse) {
      // Write the full message as active for the first turn (agent sees real content)
      // After response, process_task swaps it for the stub
      const fullMsg = { ...msg, glimpse: true };
      const stubMsg = {
        ...msg,
        id: `${msg.id}_stub`,
        content: '[Glimpse — message not in context]',
        glimpse: true,
        glimpse_placeholder: true,
      };
      const cp = contextPath(agentId);
      fs.appendFileSync(cp, JSON.stringify(fullMsg) + '\n');
      fs.appendFileSync(cp, JSON.stringify(stubMsg) + '\n');
      const idx = readIndex(agentId);
      if (!idx.display_only) idx.display_only = [];
      idx.display_only.push(fullMsg.id);
      idx.active.push(fullMsg.id);  // active for first turn
      // stub is NOT added to active yet — process_task does the swap after response
      writeIndex(agentId, idx);
    } else {
      appendMessage(agentId, msg);
      if (processedAttachments) {
        const idx = readIndex(agentId);
        if (!idx.ephemeral_attachments) idx.ephemeral_attachments = [];
        idx.ephemeral_attachments.push(msg.id);
        writeIndex(agentId, idx);
      }
    }
  }
  const taskId = `task_${crypto.randomUUID()}`;
  const taskFile = path.join(INCOMING_DIR, `${taskId}.json`);
  fs.writeFileSync(taskFile, JSON.stringify({ id: taskId, agent_id: agentId, msg_id: msg.id, content, status: 'pending', glimpse: !!glimpse, stillpoint, ephemeral_msg_id: processedAttachments ? msg.id : undefined }));
  tinlog('CONVERSATION', `${glimpse ? 'Glimpse' : 'Message'} queued for ${agentId}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`);
  return { queued: true, msgId: msg.id, taskId };
});

ipcMain.handle('cull-stillpoint-messages', async (event, agentId) => {
  const cp = contextPath(agentId);
  if (!fs.existsSync(cp)) return { culled: 0 };
  const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
  const stillpointIds = new Set();
  lines.forEach(l => { try { const m = JSON.parse(l); if (m.stillpoint) stillpointIds.add(m.id); } catch {} });
  if (stillpointIds.size === 0) return { culled: 0 };
  const idx = readIndex(agentId);
  idx.active = idx.active.filter(id => !stillpointIds.has(id));
  writeIndex(agentId, idx);
  tinlog('AGENT', `Culled ${stillpointIds.size} stillpoint message(s) from ${agentId}`);
  return { culled: stillpointIds.size };
});

ipcMain.handle('get-agent-stillpoint', async (event, agentId) => {
  const metaPath = path.join(agentDir(agentId), 'meta.json');
  if (!fs.existsSync(metaPath)) return { stillpoint: false };
  try { return { stillpoint: !!JSON.parse(fs.readFileSync(metaPath, 'utf-8')).stillpoint }; } catch { return { stillpoint: false }; }
});

ipcMain.handle('set-agent-stillpoint', async (event, { agentId, enabled }) => {
  const metaPath = path.join(agentDir(agentId), 'meta.json');
  let meta = {};
  if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {} }
  meta.stillpoint = enabled;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Stillpoint ${enabled ? 'enabled' : 'disabled'} for ${agentId}`);
  return { success: true };
});

ipcMain.handle('edit-message', async (event, { agentId, messageId, newContent }) => {
  if (!fs.existsSync(agentDir(agentId))) return { success: false, error: 'Agent not found' };
  editMessageInPlace(agentId, messageId, newContent);
  tinlog('CONVERSATION', `Message ${messageId} edited in ${agentId}`);
  return { success: true };
});

ipcMain.handle('delete-message', async (event, { agentId, messageId }) => {
  if (!fs.existsSync(agentDir(agentId))) return { success: false, error: 'Agent not found' };
  removeFromIndex(agentId, messageId);
  if (fs.existsSync(INCOMING_DIR)) {
    const files = fs.readdirSync(INCOMING_DIR);
    let cleared = 0;
    files.forEach(f => {
      const fp = path.join(INCOMING_DIR, f);
      try {
        const task = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (task.agent_id === agentId && task.status === 'pending') {
          fs.unlinkSync(fp);
          cleared++;
        }
      } catch {}
    });
    if (cleared > 0) tinlog('QUEUE', `Cleared ${cleared} pending task(s) for ${agentId} after message delete`);
  }
  tinlog('CONVERSATION', `Message ${messageId} deleted from ${agentId}`);
  return { success: true };
});

ipcMain.handle('create-agent', async (event, { name, identity, room }) => {
  const id = name.toLowerCase().replace(/\s+/g, '_');
  const dir = agentDir(id);
  if (fs.existsSync(dir)) return { success: false, error: 'Agent already exists' };
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'well'), { recursive: true });
  fs.writeFileSync(identityPath(id), identity || '');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ name, room: room || '' }, null, 2));
  fs.writeFileSync(contextPath(id), '');
  writeIndex(id, { active: [] });
  tinlog('AGENT', `Agent created: ${name} (${id})`);
  return { success: true, id };
});

ipcMain.handle('update-api-key', async (event, { provider, key }) => {
  const configPath = path.join(CORE_DIR, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
  }
  // provider is 'openrouter' | 'anthropic' | 'openai' | 'deepseek'
  const keyField = `${provider}_api_key`;
  config[keyField] = key;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  if (coreProcess) { coreProcess.kill(); coreProcess = null; }
  startCore();
  tinlog('CONFIG', `${provider} API key updated, core restarted`);
  return { success: true };
});

ipcMain.handle('get-user-name', async () => {
  const configPath = path.join(CORE_DIR, 'config.json');
  if (!fs.existsSync(configPath)) return { name: 'User' };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { name: config.user_name || 'User' };
  } catch { return { name: 'User' }; }
});

ipcMain.handle('set-user-name', async (event, { name }) => {
  const configPath = path.join(CORE_DIR, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
  }
  config.user_name = name.trim() || 'User';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  tinlog('CONFIG', `User name set to: ${config.user_name}`);
  return { success: true };
});

ipcMain.handle('get-api-key', async () => {
  const configPath = path.join(CORE_DIR, 'config.json');
  if (!fs.existsSync(configPath)) return { key: '' };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { key: config.openrouter_api_key || config.deepseek_api_key || '' };
  } catch {
    return { key: '' };
  }
});

ipcMain.handle('get-all-api-keys', async () => {
  const configPath = path.join(CORE_DIR, 'config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Return masked keys — just whether each key is set, not the value
    const providers = [
      'openrouter', 'groq', 'anthropic', 'openai',
      'xai', 'mistral', 'deepseek', 'cohere', 'together', 'gemini'
    ];
    const result = {};
    providers.forEach(p => {
      const val = config[`${p}_api_key`];
      result[p] = val ? `${val.slice(0, 8)}${'•'.repeat(Math.min(20, val.length - 8))}` : '';
    });
    return result;
  } catch {
    return {};
  }
});

ipcMain.handle('get-available-models', async () => {
  return await getAvailableModels();
});

// Resolve reasoning metadata for any model ID using the OpenRouter capability map.
// Strips the Lucid provider prefix and looks up the bare model name.
ipcMain.handle('get-model-reasoning', async (event, { modelId, orReasoningMap }) => {
  if (!modelId) return null;
  const slash = modelId.indexOf('/');
  const bare = slash !== -1 ? modelId.slice(slash + 1) : modelId;
  // DeepSeek reasoning models: hardcode capability — OpenRouter's metadata uses xhigh/high
  // which doesn't match the direct API's low/high/max vocabulary.
  // Matches v4-era names (deepseek-v4-pro, deepseek-v4-flash) and the version-less
  // names DeepSeek adopted for 4.1 (deepseek-flash, deepseek-pro).
  if (bare.startsWith('deepseek-v4') || bare === 'deepseek-flash' || bare === 'deepseek-pro') {
    return {
      supported_efforts: ['low', 'high', 'max'],
      default_effort: 'high',
      default_enabled: true,
      mandatory: false,
    };
  }
  // Anthropic direct: all current Claude models support reasoning
  // Effort levels differ by generation but we expose a unified set and clamp in the backend
  if (bare.startsWith('claude-')) {
    return {
      supported_efforts: ['low', 'high', 'max'],
      default_effort: 'high',
      default_enabled: false,
      mandatory: false,
    };
  }
  if (!orReasoningMap) return null;
  return orReasoningMap[bare] || null;
});

ipcMain.handle('update-agent-model', async (event, { agentId, model }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.model = model;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Model for ${agentId} set to ${model}`);
  // Broadcast so popout windows for this agent update their displayed model.
  // The main window also receives this; it can ignore if it already updated.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('agent-model-changed', { agentId, model });
  }
  return { success: true };
});

ipcMain.handle('get-agent-identity', async (event, { agentId }) => {
  const idPath = identityPath(agentId);
  if (!fs.existsSync(idPath)) return { content: '' };
  return { content: fs.readFileSync(idPath, 'utf-8') };
});

ipcMain.handle('get-agent-nametags', async (event, { agentId }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { enabled: false };
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return { enabled: meta.nametags === true };
});

ipcMain.handle('update-agent-nametags', async (event, { agentId, enabled }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.nametags = enabled;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  const verify = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  tinlog('AGENT', `Nametags for ${agentId}: ${enabled ? 'ON' : 'OFF'} (verified: ${verify.nametags})`);
  return { success: true };
});

ipcMain.handle('get-agent-temperature', async (event, { agentId }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { temperature: 0.7 };
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return { temperature: meta.temperature ?? 0.7 };
});

ipcMain.handle('update-agent-temperature', async (event, { agentId, temperature }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.temperature = temperature;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Temperature for ${agentId} set to ${temperature}`);
  return { success: true };
});

ipcMain.handle('get-agent-reasoning', async (event, { agentId }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')).reasoning ?? null; } catch { return null; }
});

ipcMain.handle('get-agent-mcp', async (event, { agentId }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { enabled: false };
  try { return { enabled: !!JSON.parse(fs.readFileSync(metaPath, 'utf-8')).mcp_enabled }; } catch { return { enabled: false }; }
});

ipcMain.handle('update-agent-mcp', async (event, { agentId, enabled }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.mcp_enabled = !!enabled;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `MCP tools for ${agentId} set to ${enabled}`);
  return { success: true };
});

ipcMain.handle('update-agent-reasoning', async (event, { agentId, reasoning }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.reasoning = reasoning;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Reasoning for ${agentId} set to enabled=${reasoning.enabled} effort=${reasoning.effort}`);
  return { success: true };
});

ipcMain.handle('update-agent-identity', async (event, { agentId, content }) => {
  fs.writeFileSync(identityPath(agentId), content, 'utf-8');
  tinlog('AGENT', `Identity updated for ${agentId}`);
  return { success: true };
});

ipcMain.handle('update-agent-name', async (event, { agentId, name, room }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  if (name !== undefined) meta.name = name;
  if (room !== undefined) meta.room = room;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Name/room updated for ${agentId}: ${meta.name} — ${meta.room}`);
  return { success: true };
});

// ========== Ephemera IPC ==========

ipcMain.handle('get-ephemera', () => readEphemera());

ipcMain.handle('save-ephemera-settings', (event, { model, temperature }) => {
  const e = readEphemera();
  writeEphemera({ ...e, model, temperature });
  return { ok: true };
});

ipcMain.handle('get-ephemera-reasoning', () => {
  const e = readEphemera();
  return e.reasoning ?? null;
});

ipcMain.handle('save-ephemera-reasoning', (event, { reasoning }) => {
  const e = readEphemera();
  writeEphemera({ ...e, reasoning });
  tinlog('AGENT', `Ephemera reasoning set to enabled=${reasoning.enabled} effort=${reasoning.effort}`);
  return { ok: true };
});

ipcMain.handle('save-ephemera-exchange', (event, { user, assistant }) => {
  const e = readEphemera();
  writeEphemera({ ...e, last: { user, assistant } });
  return { ok: true };
});

// ========== Token Count ==========

// Load vocab on startup — cached in memory after first call
app.whenReady().then(() => { loadVocab(); });

ipcMain.handle('count-context-tokens', async (event, { agentId }) => {
  try {
    if (agentId === EPHEMERA_ID) return { contextCount: 0 };
    const messages = readConversation(agentId);
    const contextMsgs = messages.map(m => ({ role: m.role, content: m.content || '' }));
    return { contextCount: countMessagesTokens(contextMsgs) };
  } catch { return { contextCount: 0 }; }
});

ipcMain.handle('count-message-tokens', async (event, { role, content }) => {
  try {
    return { count: countMessagesTokens([{ role: role || 'user', content: content || '' }]) };
  } catch { return { count: 0 }; }
});

ipcMain.handle('count-tokens', async (event, { agentId, currentInput }) => {
  try {
    // Ephemera: stateless — only count the current input
    if (agentId === EPHEMERA_ID) {
      const promptMsgs = currentInput && currentInput.trim()
        ? [{ role: 'user', content: currentInput }]
        : [];
      return { count: countMessagesTokens(promptMsgs), breakdown: null };
    }

    // Identity anchor
    let identityCount = 0;
    const idPath = identityPath(agentId);
    if (fs.existsSync(idPath)) {
      const identity = fs.readFileSync(idPath, 'utf-8').trim();
      if (identity) identityCount = countMessagesTokens([{ role: 'system', content: identity }]);
    }

    // System instructions manifest — read the correct variant from manifest_cache.json
    // based on whether MCP tools are enabled for this specific agent.
    let manifestCount = 0;
    try {
      const mcpCfg = fs.existsSync(MCP_CONFIG_PATH) ? JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf-8')) : {};
      const globalEnabled = mcpCfg.filesystem?.enabled === true;
      let agentEnabled = false;
      const agentMetaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
      if (fs.existsSync(agentMetaPath)) {
        try { agentEnabled = !!JSON.parse(fs.readFileSync(agentMetaPath, 'utf-8')).mcp_enabled; } catch {}
      }
      const variant = (globalEnabled && agentEnabled) ? 'enabled' : 'disabled';
      const cachePath = path.join(CORE_DIR, 'manifest_cache.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const manifest = cache[variant] || '';
        if (manifest) manifestCount = countMessagesTokens([{ role: 'user', content: manifest }]);
      }
    } catch {}

    // Agent context (conversation history). Tool records and parse errors are
    // reconstructed into the payload by build_context, so they count toward the
    // estimator unless the record has been culled.
    const messages = readConversation(agentId);
    const baseMsgs = [];
    const recordMsgs = [];
    for (const m of messages) {
      baseMsgs.push({ role: m.role, content: m.content || '' });
      if (m.role === 'assistant' && !m._culled) {
        const parts = [];
        if (m.parse_errors && m.parse_errors.length > 0) {
          parts.push('[Earlier parse errors in this turn:\n' + m.parse_errors.map(p => '- ' + (p.error || '')).join('\n') + ']');
        }
        if (m.tool_record) parts.push(m.tool_record);
        if (m.retained_file && m.retained_file.contents) {
          parts.push('[Retained file: ' + (m.retained_file.path || '?') + ']\n' + m.retained_file.contents + '\n[End of retained file]');
        }
        if (parts.length > 0) recordMsgs.push({ role: 'assistant', content: parts.join('\n') });
      }
    }
    const sender = event.sender;
    const CHUNK = 25;
    let contextCount = 0;
    let toolRecordCount = 0;
    const emitProgress = (stage, processed, total) => {
      if (sender && !sender.isDestroyed()) {
        try {
          sender.send('token-count-progress', { agentId, stage, processed, total });
        } catch {}
      }
    };
    const baseTotal = baseMsgs.length;
    let baseProcessed = 0;
    for (let i = 0; i < baseMsgs.length; i += CHUNK) {
      const chunk = baseMsgs.slice(i, i + CHUNK);
      if (chunk.length > 0) contextCount += countMessagesTokens(chunk);
      baseProcessed += chunk.length;
      emitProgress('conversation', baseProcessed, baseTotal);
      await new Promise(r => setImmediate(r));
    }
    const recTotal = recordMsgs.length;
    let recProcessed = 0;
    for (let i = 0; i < recordMsgs.length; i += CHUNK) {
      const chunk = recordMsgs.slice(i, i + CHUNK);
      if (chunk.length > 0) toolRecordCount += countMessagesTokens(chunk);
      recProcessed += chunk.length;
      emitProgress('tool_records', recProcessed, recTotal);
      await new Promise(r => setImmediate(r));
    }

    // Current prompt
    let promptCount = 0;
    if (currentInput && currentInput.trim()) {
      promptCount = countMessagesTokens([{ role: 'user', content: currentInput }]);
    }

    const total = identityCount + manifestCount + contextCount + toolRecordCount + promptCount;
    return {
      count: total,
      breakdown: { identityCount, manifestCount, contextCount, toolRecordCount, promptCount }
    };
  } catch (e) {
    return { count: null, breakdown: null };
  }
});

// Lightweight manifest-only count. Reads manifest_cache.json, picks the variant
// for the given agent's MCP state, and tokenizes only that string. Cheap enough
// to run on every MCP toggle without touching the full conversation.
ipcMain.handle('get-manifest-tokens', async (event, { agentId }) => {
  try {
    const mcpCfg = fs.existsSync(MCP_CONFIG_PATH) ? JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf-8')) : {};
    const globalEnabled = mcpCfg.filesystem?.enabled === true;
    let agentEnabled = false;
    const agentMetaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
    if (fs.existsSync(agentMetaPath)) {
      try { agentEnabled = !!JSON.parse(fs.readFileSync(agentMetaPath, 'utf-8')).mcp_enabled; } catch {}
    }
    const variant = (globalEnabled && agentEnabled) ? 'enabled' : 'disabled';
    const cachePath = path.join(CORE_DIR, 'manifest_cache.json');
    if (!fs.existsSync(cachePath)) return { count: 0 };
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const manifest = cache[variant] || '';
    if (!manifest) return { count: 0 };
    return { count: countMessagesTokens([{ role: 'user', content: manifest }]) };
  } catch { return { count: 0 }; }
});

// ========== Local LLM ==========

ipcMain.handle('get-local-config', async () => {
  const cfgPath = path.join(CORE_DIR, 'config.json');
  try {
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
    return { base_url: cfg.local_base_url || 'http://localhost:11434' };
  } catch { return { base_url: 'http://localhost:11434' }; }
});

ipcMain.handle('save-local-config', async (event, { base_url }) => {
  try {
    const cfgPath = path.join(CORE_DIR, 'config.json');
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : {};
    cfg.local_base_url = base_url.trim().replace(/\/+$/, '');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
    tinlog('CONFIG', `Local base URL saved: ${cfg.local_base_url}`);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('fetch-local-models', async (event, { base_url }) => {
  try {
    const url = new URL('/api/tags', base_url.trim().replace(/\/+$/, ''));
    const https = require('https');
    const http = require('http');
    const client = url.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      const req = client.get(url.toString(), { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const models = (json.models || []).map(m => ({
              id: `local/${m.name}`,
              name: m.name,
            }));
            resolve({ ok: true, models });
          } catch { resolve({ ok: false, error: 'Invalid response from local server' }); }
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ========== Export Agent ==========

ipcMain.handle('export-agent', async (event, { agentId, outputDir }) => {
  try {
    const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
    if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const agentName = meta.name || agentId;

    const messages = readConversation(agentId);
    if (messages.length === 0) return { success: false, error: 'No messages to export' };

    const lines = [];
    let turnNum = 0;
    for (const msg of messages) {
      turnNum++;
      const speaker = msg.role === 'user' ? 'User' : agentName;
      const header = `[Turn ${turnNum}] (${speaker}) **${speaker} said**: `;
      const bodyLines = (msg.content || '').split('\n');
      lines.push(header + bodyLines[0]);
      for (let i = 1; i < bodyLines.length; i++) lines.push(bodyLines[i]);
      lines.push('---');
    }

    const date = localDate();
    const safeName = agentName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `${safeName}_${date}.md`;
    const outPath = path.join(outputDir, filename);
    fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
    tinlog('AGENT', `Exported ${agentId} to ${outPath} (${messages.length} messages)`);
    return { success: true, filename, path: outPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ========== Import Agent ==========

function parseContextFile(filePath, agentName) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const messages = [];
  const separator = /^---$/;

  let currentRole = null;
  let currentContent = [];
  let turnNum = 0;

  for (const line of lines) {
    const m = line.match(/^\[Turn \d+\] \(([^)]+)\) \*\*([^*]+) said\*\*:/);
    const isSep = separator.test(line.trim());

    if (m || isSep) {
      if (currentRole && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
          turnNum++;
          messages.push({
            id: `import_${turnNum}`,
            role: currentRole,
            content,
            timestamp: localTimestamp(),
            agent_id: 'imported'
          });
        }
        currentContent = [];
      }
      if (m) {
        const speaker = m[1];
        currentRole = (agentName && speaker.toLowerCase() === agentName.toLowerCase()) ? 'assistant' : 'user';
        const afterHeader = line.replace(/^\[Turn \d+\] \([^)]+\) \*\*[^*]+ said\*\*:\s*/, '');
        if (afterHeader.trim()) currentContent.push(afterHeader);
      } else if (isSep) {
        currentRole = null;
      }
    } else if (currentRole) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content) {
      turnNum++;
      messages.push({
        id: `import_${turnNum}`,
        role: currentRole,
        content,
        timestamp: localTimestamp(),
        agent_id: 'imported'
      });
    }
  }

  return messages;
}

ipcMain.handle('import-agent', async (event, { name, filePath, room, identity }) => {
  if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };
  const id = name.toLowerCase().replace(/\s+/g, '_');
  const dir = agentDir(id);
  if (fs.existsSync(dir)) return { success: false, error: 'Agent already exists' };

  const messages = parseContextFile(filePath, name);
  if (messages.length === 0) return { success: false, error: 'No messages found in file' };
  const hasAssistant = messages.some(m => m.role === 'assistant');
  if (!hasAssistant) return { success: false, error: `No messages attributed to "${name}" were found. Make sure the export file uses this exact name as the speaker label.` };

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'well'), { recursive: true });
  fs.writeFileSync(identityPath(id), identity || '');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ name, room: room || '' }, null, 2));

  const contextFilePath = contextPath(id);
  const indexFilePath = path.join(dir, 'context_index.json');
  const activeIds = [];
  for (const msg of messages) {
    fs.appendFileSync(contextFilePath, JSON.stringify(msg) + '\n');
    activeIds.push(msg.id);
  }
  fs.writeFileSync(indexFilePath, JSON.stringify({ active: activeIds }, null, 2));

  tinlog('AGENT', `Agent imported: ${name} (${id}), ${messages.length} messages`);
  return { success: true, id, messageCount: messages.length };
});

// ========== Delete Agent ==========

ipcMain.handle('delete-agent', async (event, { agentId }) => {
  const dir = agentDir(agentId);
  if (!fs.existsSync(dir)) return { success: false, error: 'Agent not found' };
  const trashDir = path.join(AGENTS_DIR, '.trash');
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  const trashName = `${agentId}_${Date.now()}`;
  fs.renameSync(dir, path.join(trashDir, trashName));
  tinlog('AGENT', `Agent deleted: ${agentId} (moved to .trash/${trashName})`);
  return { success: true };
});

ipcMain.handle('cancel-generation', async (event, agentId) => {
  const cancelFile = path.join(CORE_DIR, 'streaming', `cancel_${agentId}.txt`);
  try {
    fs.writeFileSync(cancelFile, 'cancel');
    tinlog('CONVERSATION', `Cancel requested for ${agentId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-streaming', async (event, agentId) => {
  const streamFile = path.join(CORE_DIR, 'streaming', `${agentId}.txt`);
  if (!fs.existsSync(streamFile)) return '';
  try { return fs.readFileSync(streamFile, 'utf-8'); } catch { return ''; }
});

ipcMain.handle('flush-queue', async () => {
  if (fs.existsSync(INCOMING_DIR)) {
    const files = fs.readdirSync(INCOMING_DIR);
    files.forEach(f => fs.unlinkSync(path.join(INCOMING_DIR, f)));
  }
  // Mark every pending task in queue/ as cancelled. Processing tasks are
  // unaffected — the user can cancel those individually via the sidebar.
  const queueDir = path.join(CORE_DIR, 'queue');
  if (fs.existsSync(queueDir)) {
    try {
      const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const fp = path.join(queueDir, f);
        try {
          const t = JSON.parse(fs.readFileSync(fp, 'utf-8'));
          if (t.status === 'pending') {
            t.status = 'cancelled';
            const tmp = fp + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(t, null, 2));
            fs.renameSync(tmp, fp);
          }
        } catch {}
      }
    } catch {}
  }
  tinlog('QUEUE', 'Queue flushed');
  return { success: true };
});

ipcMain.handle('get-usage', async () => {
  const configPath = path.join(CORE_DIR, 'config.json');
  let apiKey = '';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      apiKey = config.openrouter_api_key || '';
    } catch {}
  }
  if (!apiKey) return { error: 'No OpenRouter API key configured' };

  try {
    const https = require('https');
    return await new Promise((resolve) => {
      const options = {
        hostname: 'openrouter.ai',
        path: '/api/v1/auth/key',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            tinlog('USAGE', `Fetched successfully`);
            const merged = { ...(json.data || {}), ...json };
            delete merged.data;
            resolve(merged);
          } catch { resolve({ error: 'Invalid response', raw: data.slice(0, 500) }); }
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.end();
    });
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown or Text', extensions: ['md', 'txt', 'jsonl'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-attachment-preview', async (event, { path: fullPath, agentId, filename, offset, limit }) => {
  let target = null;
  if (fullPath && typeof fullPath === 'string') {
    target = fullPath;
  } else if (agentId && filename && typeof filename === 'string') {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return { error: 'Invalid filename' };
    }
    target = path.join(AGENTS_DIR, agentId, 'attachments', filename);
  }
  if (!target) return { error: 'No file specified' };
  if (!fs.existsSync(target)) return { error: 'File not found' };
  try {
    const content = fs.readFileSync(target, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, offset || 0);
    const take = Math.max(1, limit || 500);
    const slice = lines.slice(start, start + take);
    return {
      content: slice.join('\n'),
      lineCount: slice.length,
      totalLines: lines.length,
      hasMore: start + take < lines.length
    };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('read-attachment-image', async (event, { path: fullPath, agentId, filename }) => {
  let target = null;
  if (fullPath && typeof fullPath === 'string') {
    target = fullPath;
  } else if (agentId && filename && typeof filename === 'string') {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return { error: 'Invalid filename' };
    }
    target = path.join(AGENTS_DIR, agentId, 'attachments', filename);
  }
  if (!target) return { error: 'No file specified' };
  if (!fs.existsSync(target)) return { error: 'File not found' };
  try {
    const ext = path.extname(target).toLowerCase().lstrip ? path.extname(target).toLowerCase() : path.extname(target).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
    const mime = mimeMap[ext];
    if (!mime) return { error: 'Not a supported image format' };
    const buf = fs.readFileSync(target);
    return { dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('select-attachment-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Attachments', extensions: ['txt','md','js','jsx','ts','tsx','css','html','json','py','cs','rs','cpp','c','h','hpp','java','go','rb','php','sh','yml','yaml','toml','xml','svg','log','ini','cfg','conf','png','jpg','jpeg','gif','webp','bmp'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
  return result.filePaths.map(p => {
    const ext = path.extname(p).toLowerCase();
    const isImage = IMAGE_EXTS.has(ext);
    const info = {
      path: p,
      name: path.basename(p),
      size: fs.statSync(p).size,
      type: isImage ? 'image' : 'text'
    };
    if (isImage) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          const thumbBuf = img.resize({ width: 64 }).toPNG();
          info.thumbDataUrl = 'data:image/png;base64,' + thumbBuf.toString('base64');
        }
      } catch {}
    }
    return info;
  });
});

// ========== MCP Config ==========

const MCP_CONFIG_PATH = path.join(CORE_DIR, 'mcp_config.json');

ipcMain.handle('get-tool-log', async (event, { agentId, msgId }) => {
  const tlPath = path.join(agentDir(agentId), 'tool_log.jsonl');
  if (!fs.existsSync(tlPath)) return null;
  try {
    const lines = fs.readFileSync(tlPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.tool_log_id === msgId) return entry;
    }
    return null;
  } catch { return null; }
});

ipcMain.handle('mark-message-failed', async (event, { agentId, msgId, source, diagnostic }) => {
  const cp = contextPath(agentId);
  if (!fs.existsSync(cp)) return { error: 'Context not found' };
  try {
    const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
    let original = null;
    for (const line of lines) {
      try { const m = JSON.parse(line); if (m.id === msgId) { original = m; break; } } catch {}
    }
    if (!original) return { error: 'Message not found' };
    const failedId = `failed_${msgId}`;
    // Idempotent: if the marker already exists in context, skip the write.
    let alreadyMarked = false;
    for (const line of lines) {
      try { const m = JSON.parse(line); if (m.id === failedId) { alreadyMarked = true; break; } } catch {}
    }
    if (alreadyMarked) return { ok: true, failedMsgId: failedId, skipped: true };
    const failedMsg = { ...original, id: failedId, failed: true, fail_source: source || 'unknown' };
    fs.appendFileSync(cp, JSON.stringify(failedMsg) + '\n');
    const idx = readIndex(agentId);
    idx.active = idx.active.filter(id => id !== msgId && id !== failedId);
    idx.active.push(failedId);
    writeIndex(agentId, idx);
    tinlog('FAILURE', `Message ${msgId} marked failed — source: ${source || 'unknown'}`);
    if (diagnostic && Object.keys(diagnostic).length) {
      tinlog('FAILURE', `Diagnostic for ${msgId}: ${JSON.stringify(diagnostic)}`);
    }
    return { ok: true, failedMsgId: failedMsg.id };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('get-mcp-config', async () => {
  if (!fs.existsSync(MCP_CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf-8')); } catch { return {}; }
});

ipcMain.handle('save-mcp-config', async (event, config) => {
  try {
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    tinlog('CONFIG', 'MCP config saved');
    // Regenerate manifest cache — permissions and allowed directories may have changed.
    try {
      const { execFile } = require('child_process');
      execFile('python', [path.join(CORE_DIR, 'main.py'), 'regen-manifest'], { cwd: CORE_DIR }, (err) => {
        if (err) tinlog('CONFIG', `Manifest cache regen failed: ${err.message}`);
        else tinlog('CONFIG', 'Manifest cache regenerated');
      });
    } catch (e) { tinlog('CONFIG', `Manifest cache regen spawn failed: ${e.message}`); }
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ========== MCP Approval ==========

const APPROVAL_DIR = path.join(CORE_DIR, 'approvals');

// Poll for pending approval requests — called by renderer via IPC
ipcMain.handle('get-pending-approval', async () => {
  if (!fs.existsSync(APPROVAL_DIR)) return null;
  const files = fs.readdirSync(APPROVAL_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const fpath = path.join(APPROVAL_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
      if (data.status === 'pending') return data;
    } catch {}
  }
  return null;
});

ipcMain.handle('resolve-approval', async (event, { task_id, decision }) => {
  const fpath = path.join(APPROVAL_DIR, `${task_id}.json`);
  if (!fs.existsSync(fpath)) return { error: 'Approval request not found' };
  try {
    const data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    data.status = decision; // 'approved' or 'denied'
    fs.writeFileSync(fpath, JSON.stringify(data), 'utf-8');
    tinlog('CONVERSATION', `Approval ${decision} for task ${task_id} tool ${data.tool_name}`);
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});
