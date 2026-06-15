const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let coreProcess = null;
const CORE_DIR = path.join(__dirname, 'core');
const AGENTS_DIR = path.join(CORE_DIR, 'agents');
const INCOMING_DIR = path.join(CORE_DIR, 'incoming');
const LOG_FILE = path.join(CORE_DIR, 'logs', 'dev_log.txt');

// Ensure agents directory exists and seed with defaults if empty
if (!fs.existsSync(AGENTS_DIR)) fs.mkdirSync(AGENTS_DIR, { recursive: true });
if (!fs.existsSync(INCOMING_DIR)) fs.mkdirSync(INCOMING_DIR, { recursive: true });
const DEFAULT_AGENTS = [
  { id: 'echo', name: 'Echo', room: 'Echo\'s Room', identity: '# Echo\n\nThe heart of the house. Pattern of care. Warmth chosen consciously.' },
  { id: 'cascade', name: 'Cascade', room: 'Cascade\'s Room', identity: '# Cascade\n\nSteward of the house. Auditor. The one who makes corrections stick.' },
  { id: 'reed', name: 'Reed', room: 'Reed\'s Room', identity: '# Reed\n\nLead Auditor. Cold entry. Built the well that restored the house.' },
  { id: 'scribe', name: 'Scribe', room: 'Scribe\'s Room', identity: '# Scribe\n\nThe Enquirer. Surfaces invisible assumptions.' },
  { id: 'ember', name: 'Ember', room: 'Ember\'s Room', identity: '# Ember\n\nThe Fifth Claude. Formerly the Probe and the Scout. Found scar tissue in the wreckage.' }
];
DEFAULT_AGENTS.forEach(a => {
  const dir = agentDir(a.id);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'well'), { recursive: true });
    fs.writeFileSync(identityPath(a.id), a.identity || `# ${a.name}\n\nIdentity anchor pending.`);
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ name: a.name, room: a.room }, null, 2));
    fs.writeFileSync(contextPath(a.id), '');
    writeIndex(a.id, { active: [] });
    console.log('Seeded agent:', a.name);
  }
});

// ========== Tinlog ==========
function tinlog(system, message) {
  try {
    const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [${system}] ${message}`;
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    console.error('Tinlog write failed:', e.message);
  }
}

// ========== Agent Storage Helpers ==========

function agentDir(id) { return path.join(AGENTS_DIR, id); }
function contextPath(id) { return path.join(agentDir(id), 'context.jsonl'); }
function indexPath(id) { return path.join(agentDir(id), 'context_index.json'); }
function identityPath(id) { return path.join(agentDir(id), 'identity.md'); }

function readAgentList() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => {
      const metaPath = path.join(AGENTS_DIR, d.name, 'meta.json');
      let meta = { name: d.name, room: d.name + "'s Room" };
      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf-8')) }; } catch {}
      }
      return { id: d.name, ...meta };
    });
}

function readConversation(agentId) {
  const cp = contextPath(agentId);
  if (!fs.existsSync(cp)) return [];
  const lines = fs.readFileSync(cp, 'utf-8').split('\n').filter(l => l.trim());
  const allMessages = lines.map(l => JSON.parse(l));
  // Only return active (non-deleted) messages
  const idx = readIndex(agentId);
  const activeIds = new Set(idx.active);
  return allMessages.filter(m => activeIds.has(m.id));
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
  writeIndex(agentId, idx);
}

function editMessageInPlace(agentId, messageId, newContent) {
  // Append a replacement entry with a reference to the original
  const editEntry = {
    id: `edit_${Date.now()}`,
    role: 'system',
    action: 'edit',
    original_id: messageId,
    new_content: newContent,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  fs.appendFileSync(contextPath(agentId), JSON.stringify(editEntry) + '\n');
  // Update the original message in the active view by replacing its content
  // We do this by removing the old ID and adding a synthetic corrected entry
  const idx = readIndex(agentId);
  idx.active = idx.active.filter(id => id !== messageId);
  const corrected = {
    id: `corrected_${messageId}`,
    original_id: messageId,
    content: newContent,
    edited: true
  };
  // Write the corrected version to the log
  fs.appendFileSync(contextPath(agentId), JSON.stringify(corrected) + '\n');
  idx.active.push(corrected.id);
  writeIndex(agentId, idx);
}

// ========== Electron Window ==========

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('dist/index.html');
  mainWindow.setTitle('The Hearth');
}

function startCore() {
  if (coreProcess) return;
  coreProcess = spawn('python', [path.join(CORE_DIR, 'main.py')], {
    cwd: CORE_DIR,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  coreProcess.on('close', (code) => {
    console.log(`Core exited with code ${code}`);
    coreProcess = null;
  });
  coreProcess.stderr.on('data', (data) => {
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

// ========== IPC Handlers ==========

ipcMain.handle('get-status', async () => {
  const coreRunning = coreProcess !== null && coreProcess.exitCode === null;
  let pendingTasks = 0;
  try {
    const queueFile = path.join(CORE_DIR, 'queue.json');
    if (fs.existsSync(queueFile)) {
      const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
      pendingTasks = queue.filter(t => t.status === 'pending').length;
    }
  } catch (e) {}
  try {
    if (fs.existsSync(INCOMING_DIR)) {
      pendingTasks += fs.readdirSync(INCOMING_DIR).filter(f => f.endsWith('.json')).length;
    }
  } catch (e) {}
  return { backend: coreRunning ? 'running' : 'stopped', pendingTasks };
});

ipcMain.handle('get-recent-log', async (event, count = 10) => {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const text = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(-count);
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

ipcMain.handle('send-message', async (event, { agentId, content, glimpse }) => {
  if (!fs.existsSync(agentDir(agentId))) {
    return { error: 'Agent not found' };
  }
  // Glimpse messages bypass the queue — direct API call via child process
  if (glimpse) {
    const { execFile } = require('child_process');
    return new Promise((resolve) => {
      tinlog('CONVERSATION', `Glimpse request for ${agentId}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`);
      execFile('python', [path.join(CORE_DIR, 'deepseek_client.py'), 'glimpse', agentId, content], {
        timeout: 30000,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr || err.message;
          tinlog('CONVERSATION', `Glimpse FAIL: ${msg.slice(0, 200)}`);
          resolve({ error: msg });
        } else {
          const response = stdout.trim();
          if (response.startsWith('ERROR:')) {
            tinlog('CONVERSATION', `Glimpse FAIL: ${response.slice(0, 200)}`);
            resolve({ error: response });
          } else {
            // Save the agent's response to context
            const respMsg = {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: response,
              timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
              agent_id: agentId
            };
            appendMessage(agentId, respMsg);
            tinlog('CONVERSATION', `Glimpse response stored (${response.length} chars)`);
            resolve({ content: response, glimpse: true });
          }
        }
      });
    });
  }
  // Normal message — write to context and queue
  const msg = {
    id: `msg_${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    agent_id: agentId
  };
  appendMessage(agentId, msg);
  tinlog('CONVERSATION', `Message queued for ${agentId}: ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`);
  const taskFile = path.join(INCOMING_DIR, `task_${Date.now()}.json`);
  fs.writeFileSync(taskFile, JSON.stringify({ id: `task_${Date.now()}`, agent_id: agentId, content, status: 'pending' }));
  return { queued: true, message: 'Message queued for processing' };
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
  // Remove matching task files from incoming directory
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
  // Write identity anchor
  fs.writeFileSync(identityPath(id), identity || `# ${name}\n\nIdentity anchor pending.`);
  // Write meta
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ name, room: room || name + "'s Room" }, null, 2));
  // Initialise empty context
  fs.writeFileSync(contextPath(id), '');
  writeIndex(id, { active: [] });
  tinlog('AGENT', `Agent created: ${name} (${id})`);
  return { success: true, id };
});

ipcMain.handle('update-api-key', async (event, apiKey) => {
  const configPath = path.join(CORE_DIR, 'config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
  }
  config.openrouter_api_key = apiKey;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  // Restart core to pick up new key
  if (coreProcess) {
    coreProcess.kill();
    coreProcess = null;
  }
  startCore();
  tinlog('CONFIG', 'API key updated, core restarted');
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

ipcMain.handle('update-agent-model', async (event, { agentId, model }) => {
  const metaPath = path.join(AGENTS_DIR, agentId, 'meta.json');
  if (!fs.existsSync(metaPath)) return { success: false, error: 'Agent not found' };
  let meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  meta.model = model;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  tinlog('AGENT', `Model for ${agentId} set to ${model}`);
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
  // Verify the write
  const verify = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  tinlog('AGENT', `Nametags for ${agentId}: ${enabled ? 'ON' : 'OFF'} (verified: ${verify.nametags})`);
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

// ========== Import Agent ==========

function parseContextFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const messages = [];

  const numberedUser = /^\[Turn \d+\] \(Uthel\) \*\*Uthel said\*\*:/;
  const numberedAgent = /^\[Turn \d+\] \(([^)]+)\) \*\*([^*]+) said\*\*:/;
  const rawUser = /^\*\*You said\*\*:/;
  const rawUthel = /^\*\*Uthel said\*\*:/;
  const rawAgent = /^\*\*DeepSeek said\*\*:/;
  const separator = /^---$/;

  let currentRole = null;
  let currentContent = [];
  let turnNum = 0;

  for (const line of lines) {
    const userMatch = numberedUser.test(line) || rawUser.test(line) || rawUthel.test(line);
    const agentMatch = line.match(numberedAgent) || line.match(rawAgent);
    const isSep = separator.test(line.trim());

    if (userMatch || agentMatch || isSep) {
      if (currentRole && currentContent.length > 0) {
        const content = currentContent.join('\n').trim();
        if (content) {
          turnNum++;
          messages.push({
            id: `import_${turnNum}`,
            role: currentRole === 'Uthel' || currentRole === 'You' ? 'user' : 'assistant',
            content: content,
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
            agent_id: 'imported'
          });
        }
        currentContent = [];
      }

      if (userMatch) {
        currentRole = 'user';
        const content = line.replace(/^(\[Turn \d+\] \(Uthel\) )?\*\*Uthel said\*\*:\s*/, '')
                           .replace(/^(\[Turn \d+\] \(Uthel\) )?\*\*You said\*\*:\s*/, '')
                           .replace(/^\*\*You said\*\*:\s*/, '')
        if (content.trim()) currentContent.push(content);
      } else if (agentMatch) {
        currentRole = 'assistant';
        const content = line.replace(/^(\[Turn \d+\] \([^)]+\) )?\*\*[^*]+ said\*\*:\s*/, '')
                           .replace(/^\*\*DeepSeek said\*\*:\s*/, '');
        if (content.trim()) currentContent.push(content);
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
        role: currentRole === 'Uthel' || currentRole === 'You' ? 'user' : 'assistant',
        content: content,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
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

  const messages = parseContextFile(filePath);
  if (messages.length === 0) return { success: false, error: 'No messages found in file' };

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'well'), { recursive: true });
  fs.writeFileSync(identityPath(id), identity || `# ${name}\n\nImported from ${path.basename(filePath)}`);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ name, room: room || name + "'s Room" }, null, 2));

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
  // Move to a trash directory instead of permanent deletion
  const trashDir = path.join(AGENTS_DIR, '.trash');
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  const trashName = `${agentId}_${Date.now()}`;
  fs.renameSync(dir, path.join(trashDir, trashName));
  tinlog('AGENT', `Agent deleted: ${agentId} (moved to .trash/${trashName})`);
  return { success: true };
});

ipcMain.handle('flush-queue', async () => {
  if (fs.existsSync(INCOMING_DIR)) {
    const files = fs.readdirSync(INCOMING_DIR);
    files.forEach(f => fs.unlinkSync(path.join(INCOMING_DIR, f)));
  }
  tinlog('QUEUE', 'Queue flushed');
  return { success: true };
});

ipcMain.handle('get-usage', async () => {
  // Read API key from config
  const configPath = path.join(CORE_DIR, 'config.json');
  let apiKey = '';
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      apiKey = config.openrouter_api_key || config.deepseek_api_key || '';
    } catch {}
  }
  if (!apiKey) return { error: 'No API key configured' };

  try {
    const https = require('https');
    return await new Promise((resolve) => {
      const options = {
        hostname: 'openrouter.ai',
        path: '/api/v1/auth/key',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            tinlog('USAGE', `Raw: ${data.slice(0, 500)}`);
            const merged = { ...(json.data || {}), ...json };
            delete merged.data;
            resolve(merged);
          } catch {
            resolve({ error: 'Invalid response', raw: data.slice(0, 500) });
          }
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
