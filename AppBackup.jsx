import React, { useState, useEffect, useRef, useCallback } from 'react';
import logoSvg from './logo.svg';
import textLogoSvg from './Textlogo.svg';

function Tooltip({ text, children, position = 'top', block = false }) {
  const [visible, setVisible] = React.useState(false);
  const [style, setStyle] = React.useState({});
  const anchorRef = React.useRef(null);
  const bubbleRef = React.useRef(null);

  const show = () => {
    if (!anchorRef.current || !bubbleRef.current) return;
    const PADDING = 8;
    const a = anchorRef.current.getBoundingClientRect();
    const b = bubbleRef.current.getBoundingClientRect();
    let left = a.left + a.width / 2 - b.width / 2;
    if (left < PADDING) left = PADDING;
    if (left + b.width > window.innerWidth - PADDING) left = window.innerWidth - PADDING - b.width;
    const top = position === 'top' ? a.top - b.height - 8 : a.bottom + 8;
    setStyle({ left, top });
    setVisible(true);
  };

  return (
    <span ref={anchorRef} className="tooltip-anchor" style={block ? {display:'block'} : {}} onMouseEnter={show} onMouseLeave={() => setVisible(false)}>
      {children}
      <span ref={bubbleRef} className={`tooltip-bubble${visible ? ' visible' : ''}`} style={style}>
        {text}
      </span>
    </span>
  );
}

function CodeBlock({ code }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{position:'relative',margin:'8px 0',borderRadius:'6px',background:'var(--bg-base)',border:'1px solid var(--border)'}}>
      <button onClick={copy} style={{position:'absolute',top:'6px',right:'8px',background:'none',border:'1px solid var(--border-subtle)',color:'var(--text-dim)',borderRadius:'4px',cursor:'pointer',fontSize:'10px',padding:'2px 8px',zIndex:1}}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre style={{margin:0,padding:'28px 12px 12px 12px',fontFamily:'Consolas,monospace',fontSize:'12px',color:'var(--text-code)',overflowX:'auto',whiteSpace:'pre',lineHeight:'1.5'}}>{code}</pre>

function MessageContent({ content }) {
  const parts = [];
  const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
  let last = 0, match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: content.slice(last, match.index) });
    parts.push({ type: 'code', value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });
  return (
    <div>
      {parts.map((p, i) =>
        p.type === 'code'
          ? <CodeBlock key={i} code={p.value} />
          : <span key={i} style={{whiteSpace:'pre-wrap'}}>{p.value}</span>
      )}
      {showWelcome && (
        <div style={{position:'fixed',inset:0,zIndex:10000,background:'var(--bg-base)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24}}>
          <img src={textLogoSvg} style={{height:56,opacity:0.9}} alt="Lucid"/>
          <p style={{color:'var(--text-dim)',fontSize:'calc(14px * var(--font-scale))',margin:0}}>Welcome. What should Lucid call you?</p>
          <input
            autoFocus
            type="text"
            maxLength={32}
            value={welcomeName}
            onChange={e => setWelcomeName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && welcomeName.trim()) {
                await IPC.setUserName(welcomeName.trim());
                setUserName(welcomeName.trim());
                setShowWelcome(false);
              }
            }}
            placeholder="Your name..."
            style={{padding:'10px 16px',borderRadius:6,border:'1px solid var(--accent)',background:'var(--bg-raised)',color:'var(--text-primary)',fontSize:'calc(15px * var(--font-scale))',width:260,outline:'none',textAlign:'center'}}
          />
          <button
            onClick={async () => {
              const name = welcomeName.trim() || 'User';
              await IPC.setUserName(name);
              setUserName(name);
              setShowWelcome(false);
            }}
            style={{padding:'8px 32px',borderRadius:6,border:'none',background:'var(--accent)',color:'var(--accent-fg)',fontSize:'calc(13px * var(--font-scale))',fontWeight:700,cursor:'pointer'}}>
            Begin
          </button>
        </div>
      )}
      {showWelcome && (
        <div style={{position:'fixed',inset:0,zIndex:10000,background:'var(--bg-base)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24}}>
          <img src={textLogoSvg} style={{height:56,opacity:0.9}} alt="Lucid"/>
          <p style={{color:'var(--text-dim)',fontSize:'calc(14px * var(--font-scale))',margin:0}}>Welcome. What should Lucid call you?</p>
          <input
            autoFocus
            type="text"
            maxLength={32}
            value={welcomeName}
            onChange={e => setWelcomeName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && welcomeName.trim()) {
                await IPC.setUserName(welcomeName.trim());
                setUserName(welcomeName.trim());
                setShowWelcome(false);
              }
            }}
            placeholder="Your name..."
            style={{padding:'10px 16px',borderRadius:6,border:'1px solid var(--accent)',background:'var(--bg-raised)',color:'var(--text-primary)',fontSize:'calc(15px * var(--font-scale))',width:260,outline:'none',textAlign:'center'}}
          />
          <button
            onClick={async () => {
              const name = welcomeName.trim() || 'User';
              await IPC.setUserName(name);
              setUserName(name);
              setShowWelcome(false);
            }}
            style={{padding:'8px 32px',borderRadius:6,border:'none',background:'var(--accent)',color:'var(--accent-fg)',fontSize:'calc(13px * var(--font-scale))',fontWeight:700,cursor:'pointer'}}>
            Begin
          </button>
        </div>
      )}
    </div>
  );
}

function ReasoningBlock({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:'6px',borderTop:'1px solid var(--border)',paddingTop:'4px'}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'11px',padding:'0',display:'flex',alignItems:'center',gap:'4px'}}
      >
        <span style={{fontSize:'9px'}}>{open ? '▼' : '▶'}</span>
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open && (
        <div style={{marginTop:'6px',padding:'8px',background:'var(--bg-base)',borderRadius:'4px',fontSize:'11px',color:'var(--text-dim)',fontFamily:'Consolas,monospace',whiteSpace:'pre-wrap',lineHeight:'1.5',maxHeight:'300px',overflowY:'auto'}}>
          {content}
        </div>
      )}
    </div>
  );
}

function ModelPicker({ availableModels, localModels, value, onChange, placeholder, onOpen }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState({});
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build unified model list
  const allGroups = [
    ...availableModels.map(g => ({ provider: g.provider, models: g.models.map(m => ({ id: m.id, name: m.label })) })),
    ...(localModels.length > 0 ? [{ provider: 'Local', models: localModels.map(m => ({ id: m.id, name: m.name })) }] : []),
  ];

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;

  // Find display label for current value
  let currentLabel = placeholder || '— Select a model —';
  for (const g of allGroups) {
    const m = g.models.find(m => m.id === value);
    if (m) { currentLabel = m.name; break; }
  }

  const toggleProvider = (provider) => {
    setExpanded(e => ({ ...e, [provider]: !e[provider] }));
  };

  const select = (id) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={ref} style={{position:'relative',width:'100%',marginTop:4,marginBottom:12}}>
      <button
        onClick={() => { const opening = !open; setOpen(opening); setSearch(''); if (opening && onOpen) onOpen(); }}
        style={{width:'100%',padding:'6px 10px',background:'var(--bg-base)',color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(13px * var(--font-scale))',
          cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center'}}
      >
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentLabel}</span>
        <span style={{fontSize:'10px',color:'var(--text-muted)',marginLeft:8,flexShrink:0}}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,
          background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'4px',
          boxShadow:'0 4px 16px rgba(0,0,0,0.4)',maxHeight:'320px',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'8px'}}>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models..."
              style={{width:'100%',padding:'5px 8px',background:'var(--bg-base)',color:'var(--text-primary)',
                border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(12px * var(--font-scale))',boxSizing:'border-box'}}
            />
          </div>
          <div className="model-picker-list">
            {isSearching ? (
              allGroups.flatMap(g =>
                g.models
                  .filter(m => m.name.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q))
                  .map(m => (
                    <div key={m.id} onClick={() => select(m.id)}
                      style={{padding:'6px 12px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',
                        color: m.id === value ? 'var(--accent)' : 'var(--text-primary)',
                        background: m.id === value ? 'var(--bg-active)' : 'transparent'}}
                      onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background= m.id === value ? 'var(--bg-active)' : 'transparent'}
                    >
                      <span style={{color:'var(--text-muted)',fontSize:'calc(10px * var(--font-scale))',marginRight:6}}>{g.provider}</span>{m.name}
                    </div>
                  ))
              )
            ) : (
              allGroups.map(g => (
                <div key={g.provider}>
                  <div onClick={() => toggleProvider(g.provider)}
                    style={{padding:'6px 12px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',
                      background:'var(--bg-raised)',borderTop:'1px solid var(--border-subtle)'}}
                    onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background='var(--bg-raised)'}
                  >
                    <span style={{fontSize:'calc(12px * var(--font-scale))',fontWeight:600,color:'var(--text-dim)'}}>{g.provider}</span>
                    <span style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)'}}>{expanded[g.provider] ? '▲' : `${g.models.length} ▼`}</span>
                  </div>
                  {expanded[g.provider] && g.models.map(m => (
                    <div key={m.id} onClick={() => select(m.id)}
                      style={{padding:'5px 12px 5px 20px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',
                        color: m.id === value ? 'var(--accent)' : 'var(--text-primary)',
                        background: m.id === value ? 'var(--bg-active)' : 'transparent'}}
                      onMouseEnter={e => e.currentTarget.style.background='var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background= m.id === value ? 'var(--bg-active)' : 'transparent'}
                    >{m.name}</div>
                  ))}
                </div>
              ))
            )}
            {isSearching && allGroups.flatMap(g => g.models.filter(m => m.name.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q))).length === 0 && (
              <div style={{padding:'12px',color:'var(--text-muted)',fontSize:'calc(12px * var(--font-scale))',textAlign:'center'}}>No models match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const IPC = window.lucid;

export default function App() {
  const [view, setView] = useState('chat');
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState('');
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [userName, setUserName] = useState('User');
  const [userNameInput, setUserNameInput] = useState('User');
  const [userNameSaved, setUserNameSaved] = useState(false);
  const [fontScale, setFontScale] = useState(() => {
    const saved = localStorage.getItem('lucid_font_scale');
    const scale = saved ? parseFloat(saved) : 1;
    document.documentElement.style.setProperty('--font-scale', scale);
    return scale;
  });
  const applyFontScale = (scale) => {
    document.documentElement.style.setProperty('--font-scale', scale);
    localStorage.setItem('lucid_font_scale', scale);
    setFontScale(scale);
  };
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('lucid_theme') || 'default';
    if (saved === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const applyTheme = (t) => {
    if (t === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('lucid_theme', t);
    setTheme(t);
  };
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpActiveTool, setMcpActiveTool] = useState('filesystem');
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [mcpDirectories, setMcpDirectories] = useState(['']);
  const [mcpPermissions, setMcpPermissions] = useState({});
  const [pendingApproval, setPendingApproval] = useState(null);
  const EPHEMERA_ID = '__ephemera__';
  const [showEphemeraModal, setShowEphemeraModal] = useState(false);
  const [ephemeraModel, setEphemeraModel] = useState('');
  const [ephemeraTemp, setEphemeraTemp] = useState(0.7);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formatCopied, setFormatCopied] = useState(false);
  const [showImportFormatModal, setShowImportFormatModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDir, setExportDir] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsRoom, setSettingsRoom] = useState('');
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityText, setIdentityText] = useState('');
  const [nametagsEnabled, setNametagsEnabled] = useState(false);
  const [stillpointEnabled, setStillpointEnabled] = useState(false);
  const [settingsTemp, setSettingsTemp] = useState(0.7);
  const [settingsModel, setSettingsModel] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newIdentity, setNewIdentity] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [importFilePath, setImportFilePath] = useState(null);
  const [importName, setImportName] = useState('');
  const [importModel, setImportModel] = useState('');
  const [importIdentity, setImportIdentity] = useState('');
  const [importRoom, setImportRoom] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [providerKeys, setProviderKeys] = useState({});
  const [providerSaved, setProviderSaved] = useState({});
  const [localBaseUrl, setLocalBaseUrl] = useState('http://localhost:11434');
  const [localBaseUrlInput, setLocalBaseUrlInput] = useState('http://localhost:11434');
  const [localModels, setLocalModels] = useState([]);
  const [localTestStatus, setLocalTestStatus] = useState(null); // null | 'ok' | 'err'
  const [backendStatus, setBackendStatus] = useState('checking...');
  const [splashDone, setSplashDone] = useState(() => !!localStorage.getItem('lucid_splash_done'));
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const splashMinRef = useRef(false);
  const [queue, setQueue] = useState([]);
  const [tinlogEntries, setTinlogEntries] = useState([]);
  const [tokenCount, setTokenCount] = useState(null);
  const tokenDebounceRef = useRef(null);
  const messageListRef = useRef(null);
  const logBoxRef = useRef(null);
  const [showCount, setShowCount] = useState(40);
  const BATCH = 20;
  useEffect(() => { if (logBoxRef.current) setTimeout(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight; }, 0); }, [tinlogEntries]);
  const pollRef = useRef(null);

  // Splash: minimum display time + backend ready
  useEffect(() => {
    const timer = setTimeout(() => {
      splashMinRef.current = true;
      if (backendStatus === 'running') { localStorage.setItem('lucid_splash_done', '1'); setSplashDone(true); }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (backendStatus === 'running' && splashMinRef.current) {
      localStorage.setItem('lucid_splash_done', '1');
      setSplashDone(true);
      // Check if first boot — no user name set
      if (IPC) IPC.getUserName().then(r => {
        if (!r || !r.name || r.name === 'User') setShowWelcome(true);
      });
    }
  }, [backendStatus]);

  useEffect(() => { loadAgents(); refreshStatus(); loadApiKey(); const i = setInterval(refreshStatus, 5000); return () => clearInterval(i); }, []);
  useEffect(() => {
    if (messageListRef.current) {
      const el = messageListRef.current;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 300;
      if (nearBottom) setTimeout(() => { if (el) el.scrollTop = el.scrollHeight; }, 0);
    }
  }, [messages, streaming]);

  const loadingMore = useRef(false);
  const handleMessageScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpButton(distFromBottom > 300);
    if (loadingMore.current) return;
    if (el.scrollTop < 300 && showCount < messages.length) {
      loadingMore.current = true;
      const prevHeight = el.scrollHeight;
      setShowCount(c => Math.min(c + BATCH, messages.length));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
          loadingMore.current = false;
        });
      });
    }
  }, [messages.length, showCount]);

  const [showJumpButton, setShowJumpButton] = useState(false);

  const jumpToBottom = useCallback(() => {
    setShowCount(40);
    setShowJumpButton(false);
    setTimeout(() => {
      if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }, 0);
  }, []);

  // Poll for pending MCP approval requests
  useEffect(() => {
    if (!IPC) return;
    const i = setInterval(async () => {
      const approval = await IPC.getPendingApproval();
      setPendingApproval(approval || null);
    }, 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (view === 'chat' && messageListRef.current) setTimeout(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight; }, 50);
  }, [view, activeAgent]);

  useEffect(() => {
    if (!activeAgent || !IPC) { setTokenCount(null); return; }
    if (tokenDebounceRef.current) clearTimeout(tokenDebounceRef.current);
    tokenDebounceRef.current = setTimeout(async () => {
      const r = await IPC.countTokens(activeAgent.id, input);
      setTokenCount(r?.count ?? null);
    }, 500);
    return () => { if (tokenDebounceRef.current) clearTimeout(tokenDebounceRef.current); };
  }, [input, activeAgent]);

  const refreshUsage = async () => {};
  const loadApiKey = async () => {
    if (!IPC) return;
    const r = await IPC.getApiKey();
    if (r.key) { setApiKey(r.key); setKeySaved(true); }
    const all = await IPC.getAllApiKeys();
    setProviderKeys(all);
    const lc = await IPC.getLocalConfig();
    setLocalBaseUrl(lc.base_url || 'http://localhost:11434');
    setLocalBaseUrlInput(lc.base_url || 'http://localhost:11434');
    const ep = await IPC.getEphemera();
    setEphemeraModel(ep.model || '');
    setEphemeraTemp(ep.temperature ?? 0.7);
    const un = await IPC.getUserName();
    setUserName(un.name || 'User');
    setUserNameInput(un.name || 'User');
  };
  const handleSaveApiKey = async () => { if (!apiKey.trim() || !IPC) return; await IPC.updateApiKey({ provider: 'openrouter', key: apiKey }); setKeySaved(true); };
  const loadAgents = async () => { if (!IPC) return; setAgents(await IPC.listAgents()); };

  const loadMcpConfig = async () => {
    if (!IPC) return;
    const cfg = await IPC.getMcpConfig();
    const fs = cfg.filesystem || {};
    setMcpEnabled(fs.enabled || false);
    setMcpDirectories(fs.allowed_directories?.length ? fs.allowed_directories : ['']);
    setMcpPermissions(fs.permissions || {});
  };

  const saveMcpConfig = async () => {
    if (!IPC) return;
    const config = {
      filesystem: {
        enabled: mcpEnabled,
        allowed_directories: mcpDirectories.filter(d => d.trim()),
        permissions: mcpPermissions,
      }
    };
    await IPC.saveMcpConfig(config);
    setShowMcpModal(false);
  };
  const selectAgent = async (a) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setActiveAgent(a);
    setActiveModel(a.model || '');
    setShowCount(40);
    if (IPC) {
      setMessages(await IPC.getConversation(a.id));
      if (a.id !== EPHEMERA_ID) {
        const sp = await IPC.getAgentStillpoint(a.id);
        setStillpointEnabled(sp?.stillpoint || false);
      } else {
        setStillpointEnabled(false);
      }
    }
  };
  const refreshStatus = async () => {
    if (!IPC) return;
    try { const s = await IPC.getStatus(); setBackendStatus(s.backend); } catch { setBackendStatus('disconnected'); }
    try { setTinlogEntries(await IPC.getRecentLog(30) || []); } catch {}
    try { setQueue(await IPC.getQueue() || []); } catch {}
  };

  const handleSend = async (glimpse) => {
    if (!input.trim() || !activeAgent || !IPC) return;
    const content = input;
    setInput('');
    // Cull any stillpoint messages from display state before new send
    setMessages(prev => prev.filter(m => !m.stillpoint));
    // Ephemera: clear previous exchange, send bare prompt, save exchange
    if (activeAgent.id === EPHEMERA_ID) {
      const tempId = `temp_${Date.now()}`;
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const userMsg = { id: tempId, role: 'user', content, timestamp: ts };
      setMessages([userMsg]);
      const resp = await IPC.sendMessage(EPHEMERA_ID, content);
      if (resp.queued) {
        if (pollRef.current) clearInterval(pollRef.current);
        let streamEndedAt = null;
        pollRef.current = setInterval(async () => {
          try {
            const streamContent = await IPC.getStreaming(EPHEMERA_ID);
            if (streamContent) { setStreaming(streamContent); streamEndedAt = null; }
            else if (streamEndedAt === null) { streamEndedAt = Date.now(); }
            if (streamEndedAt && Date.now() - streamEndedAt > 800) {
              const msgs = await IPC.getConversation(EPHEMERA_ID);
              const hasResponse = msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant';
              if (hasResponse) {
                clearInterval(pollRef.current); pollRef.current = null; setStreaming('');
                setMessages(msgs);
              } else if (Date.now() - streamEndedAt > 15000) {
                // 15s hard timeout
                clearInterval(pollRef.current); pollRef.current = null; setStreaming('');
                setMessages(msgs.length ? msgs : [userMsg]);
              }
            }
          } catch {}
        }, 300);
      }
      return;
    }
    if (glimpse) {
      const resp = await IPC.glimpseMessage(activeAgent.id, content);
      if (resp.content) {
        const msgs = await IPC.getConversation(activeAgent.id);
        setMessages(msgs);
      } else if (resp.error) {
        alert('Glimpse: ' + resp.error);
      }
    } else {
      const tempId = `temp_${Date.now()}`;
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
      setMessages(prev => [...prev, { id: tempId, role: 'user', content, timestamp: ts, stillpoint: stillpointEnabled }]);
      const resp = await IPC.sendMessage(activeAgent.id, content);
      if (resp.queued) {
        if (pollRef.current) clearInterval(pollRef.current);
        let streamActive = false;
        let streamEndedAt = null;
        const isStillpoint = stillpointEnabled;
        const baseConvo = await IPC.getConversation(activeAgent.id);
        const baseAssistantCount = baseConvo.filter(m => m.role === 'assistant').length;
        pollRef.current = setInterval(async () => {
          try {
            const streamContent = await IPC.getStreaming(activeAgent.id);
            if (streamContent) {
              setStreaming(streamContent);
              streamActive = true;
              streamEndedAt = null;
            } else if (streamActive) {
              if (!streamEndedAt) streamEndedAt = Date.now();
              const msgs = await IPC.getConversation(activeAgent.id);
              const lastMsg = msgs[msgs.length - 1];
              const hasNewAssistant = lastMsg && lastMsg.role === 'assistant' &&
                msgs.filter(m => m.role === 'assistant').length > baseAssistantCount;
              if (hasNewAssistant) {
                setMessages(msgs);
                setStreaming('');
                clearInterval(pollRef.current);
                pollRef.current = null;
              } else if (Date.now() - streamEndedAt > 30000) {
                setMessages(msgs);
                setStreaming('');
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            } else {
              const msgs = await IPC.getConversation(activeAgent.id);
              if (msgs.length && msgs[msgs.length-1].role === 'assistant') {
                setMessages(msgs);
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          } catch {}
        }, 100);
      } else {
        setMessages(await IPC.getConversation(activeAgent.id));
      }
    }
  };

  const handleImportAgent = async () => {
    if (!importName.trim() || !importFilePath || !importModel || !IPC) return;
    const r = await IPC.importAgent(importName, importFilePath, importRoom, importIdentity);
    if (r.success) {
      await IPC.updateAgentModel(r.id, importModel);
      setShowImportModal(false); setImportName(''); setImportFilePath(null); setImportModel(''); setImportIdentity(''); setImportRoom('');
      await loadAgents();
      selectAgent({ id: r.id, name: importName, room: importRoom, model: importModel });
    } else alert(r.error || 'Failed to import agent.');
  };
  const handleSelectImportFile = async () => { if (!IPC) return; const f = await IPC.selectFile(); if (f) setImportFilePath(f); };
  const handleDeleteAgent = async () => {
    if (!deleteTarget || !IPC) return;
    await IPC.deleteAgent(deleteTarget.id);
    if (activeAgent?.id === deleteTarget.id) { setActiveAgent(null); setMessages([]); }
    setDeleteTarget(null); await loadAgents();
  };
  const handleSaveAgentName = async () => {
    if (!settingsTarget || !IPC) return;
    await IPC.updateAgentName(settingsTarget.id, settingsName, settingsRoom);
    setSettingsTarget(null);
    await loadAgents();
  };
  const handleCreateAgent = async () => {
    if (!newName.trim() || !newModel || !IPC) return;
    const r = await IPC.createAgent(newName, newIdentity, newRoom);
    if (r.success) {
      await IPC.updateAgentModel(r.id, newModel);
      setShowCreateModal(false); setNewName(''); setNewModel(''); setNewIdentity(''); setNewRoom('');
      await loadAgents();
      selectAgent({ id: r.id, name: newName, room: newRoom, model: newModel });
    } else alert(r.error || 'Failed to create agent.');
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(false); } };
  const copyMessage = (msg) => {
    navigator.clipboard.writeText(msg.content || '');
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const deleteMessage = async (mid) => {
    if (!activeAgent || !IPC) return;
    await IPC.deleteMessage(activeAgent.id, mid);
    setMessages(await IPC.getConversation(activeAgent.id));
  };

  const fetchModelsForModal = async () => {
    if (!IPC) return;
    const models = await IPC.getAvailableModels();
    const lc = await IPC.getLocalConfig();
    const localResult = await IPC.fetchLocalModels(lc.base_url || 'http://localhost:11434');
    const local = localResult.ok ? localResult.models : [];
    setLocalModels(local);
    setAvailableModels(models || []);
  };

  const openSettings = async (a) => {
    setSettingsTarget(a);
    setSettingsName(a.name);
    setSettingsRoom(a.room);
    setSettingsModel(a.model || 'deepseek/deepseek-v4-flash');
    if (IPC) {
      const r = await IPC.getAgentIdentity(a.id);
      if (r) setIdentityText(r.content || '');
      const n = await IPC.getAgentNametags(a.id);
      setNametagsEnabled(n?.enabled || false);
      const sp = await IPC.getAgentStillpoint(a.id);
      setStillpointEnabled(sp?.stillpoint || false);
      const t = await IPC.getAgentTemperature(a.id);
      setSettingsTemp(t?.temperature ?? 0.7);
      const models = await IPC.getAvailableModels();
      setAvailableModels(models || []);
    }
  };

  const handleModelChange = async (e) => {
    const model = e.target.value;
    setSettingsModel(model);
    if (IPC && settingsTarget) {
      await IPC.updateAgentModel(settingsTarget.id, model);
      setSettingsTarget({ ...settingsTarget, model });
      if (activeAgent?.id === settingsTarget.id) setActiveModel(model);
      await loadAgents();
    }
  };

  return (
    <div className="app">
      {!splashDone && (
        <div className={`splash${backendStatus==='running'&&splashMinRef.current?' fade-out':''}`}>
          <svg className="splash-logo" viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
            <path d="M 100 300 C 300 50 450 40 500 40 C 550 40 700 50 900 300 C 700 550 550 560 500 560 C 450 560 300 550 100 300 Z"
                  fill="#050014" stroke="#c4a35a" strokeWidth="24" strokeLinejoin="round" />
            <circle cx="500" cy="300" r="190" fill="none" stroke="#c4a35a" strokeWidth="10" />
            <g transform="translate(500, 300)">
              <g className="splash-aperture">
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(45)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(90)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(135)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(180)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(225)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(270)" />
              <polygon points="0,-35 30,-165 160,-195 130,-130 20,-50" fill="#c4a35a" stroke="#c4a35a" strokeWidth="2" strokeLinejoin="round" transform="rotate(315)" />
              <circle cx="0" cy="0" r="75" fill="#050014" />
              </g>
            </g>
            <g transform="translate(500, 285)">
              <path d="M -30 0 A 20 20 0 1 1 30 0 L 20 20 L 30 45 L -30 45 L -20 20 Z"
                    fill="#050014" stroke="#c4a35a" strokeWidth="12" strokeLinejoin="round" />
            </g>
          </svg>
          <div className="splash-status">{backendStatus === 'running' ? 'Becoming Lucid...' : 'starting...'}</div>
          <img src={textLogoSvg} alt="Lucid" style={{height:'72px',width:'auto',marginTop:8}} />
        </div>
      )}
      <header style={{WebkitAppRegion:'drag'}}>
        <div className="header-top">
          <img src={logoSvg} alt="Lucid" style={{height:'32px',width:'auto',marginRight:'-2px',flexShrink:0}} /><img src={textLogoSvg} alt="Lucid" style={{height:'42px',width:'auto',flexShrink:0,paddingTop:'6px'}} />
          <span className="subtitle">v1.0 — {backendStatus}</span>
          <div className="header-wincontrols" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Minimize" position="bottom"><button className="wc-min" onClick={()=>IPC.windowMinimize()}>&#8722;</button></Tooltip>
            <Tooltip text="Maximize" position="bottom"><button className="wc-max" onClick={()=>IPC.windowMaximize()}>&#9633;</button></Tooltip>
            <Tooltip text="Close" position="bottom"><button className="wc-close" onClick={()=>IPC.windowClose()}>&#10005;</button></Tooltip>
          </div>
        </div>
        <div className="header-bottom">
          <div className="queue-status" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Sequential processing queue — click an agent's name to cancel their action, Flush to cancel all" position="bottom"><span className="queue-label">Queue:</span></Tooltip>
            {queue.length === 0
              ? <span className="queue-empty">Nothing in queue</span>
              : (<>
                  {queue.map(t => (
                    <button key={t.file} className="queue-badge" onClick={async () => { await IPC.cancelTask(t.file); setQueue(q => q.filter(x => x.file !== t.file)); }} title="Click to cancel">
                      {t.agentName} ×
                    </button>
                  ))}
                  <button className="queue-flush" onClick={async () => { await IPC.flushQueue(); setQueue([]); }}>Flush All</button>
                </>)
            }
          </div>
          <nav className="top-nav" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Agent Conversations" position="bottom"><button className={view==='chat'?'active':''} onClick={()=>setView('chat')}>Chat</button></Tooltip>
            <Tooltip text="System Status" position="bottom"><button className={view==='status'?'active':''} onClick={()=>setView('status')}>Status</button></Tooltip>
            <Tooltip text="Application Settings" position="bottom"><button className={view==='settings'?'active':''} onClick={()=>setView('settings')}>Settings</button></Tooltip>
          </nav>
        </div>
      </header>
      <div className="main-layout">
        {view === 'chat' && (<>
          <aside className="agent-sidebar">
            <h2>Agents</h2>
            {agents.map(a => (
              a.ephemera ? (
                <div key={a.id} className={`agent-item ${activeAgent?.id===a.id?'active':''}`} onClick={()=>selectAgent(a)}
                  style={{borderBottom:'1px solid var(--border)',marginBottom:8,paddingBottom:8}}>
                  <div className="agent-info">
                    <span className="agent-name" style={{color:'var(--accent)',fontStyle:'italic'}}>✦ {a.name}</span>
                    <span className="agent-room" style={{fontStyle:'italic'}}>{a.room}</span>
                  </div>
                  <div className="agent-meta">
                    <Tooltip text="Ephemera settings" position="bottom"><button className="agent-settings-btn" onClick={e=>{e.stopPropagation(); setShowEphemeraModal(true);}}>⚙</button></Tooltip>
                  </div>
                </div>
              ) : (
              <div key={a.id} className={`agent-item ${activeAgent?.id===a.id?'active':''}`} onClick={()=>selectAgent(a)}>
                <div className="agent-info">
                  <span className="agent-name">{a.name}</span>
                  <span className="agent-room">{a.room}</span>
                </div>
                <div className="agent-meta">
                  <Tooltip text={`${a.name} settings`} position="bottom"><button className="agent-settings-btn" onClick={e=>{e.stopPropagation(); openSettings(a);}}>⚙</button></Tooltip>
                </div>
              </div>
              )
            ))}
            <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
            <Tooltip text="Create new Agent" block><button className="new-agent-btn" onClick={()=>{ setNewModel(''); fetchModelsForModal(); setShowCreateModal(true); }}>+ New Agent</button></Tooltip>
            <Tooltip text="Import agent from a context file" block><button className="new-agent-btn" onClick={()=>{ setImportModel(''); fetchModelsForModal(); setShowImportModal(true); }}>Import Agent</button></Tooltip>
            </div>
          </aside>
          <section className="chat-panel">
          {!activeAgent ? <div className="placeholder">Select an agent to begin.</div> : (<>
          <div className="chat-header">
          <span style={{fontSize:'17px'}}>{activeAgent.name} — {activeAgent.room}</span>
          {activeModel && <span style={{fontSize:'16px',color:'var(--text-dim)',fontStyle:'italic'}}>Current active model: {activeModel}</span>}
          </div>
          <div style={{position:'relative',flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div className="message-list" ref={messageListRef} onScroll={handleMessageScroll}>
                {messages.length === 0 && !streaming && <div className="placeholder">No messages yet. Say hello.</div>}
                {showCount < messages.length && (
                  <div style={{textAlign:'center',padding:'8px',fontSize:'11px',color:'var(--text-muted)'}}>Scroll up to load more...</div>
                )}
                {messages.slice(messages.length - showCount).map(msg => (
                  <div key={msg.id} className={`message ${msg.role}${msg.glimpse ? ' glimpse' : ''}${msg.stillpoint ? ' stillpoint' : ''}`}>
                    <div className="msg-header">
                      <span className="msg-speaker">{msg.role==='user'?userName:activeAgent.name}</span>
                      <span className="msg-time">{msg.timestamp}</span>
                      {msg.glimpse && <span className="msg-glimpse-label">Glimpse</span>}
                      {msg.stillpoint && <span className="msg-stillpoint-label">Stillpoint — this message does not accumulate in context</span>}
                      {msg.edited && <span className="msg-edited">(edited)</span>}
                    </div>
                      <>
                        {msg.tool_calls && msg.tool_calls.length > 0 && (
                          <div className="tool-indicators">
                            {msg.tool_calls.map((tc, i) => (
                              <div key={i} className="tool-indicator">
                                <span className="tool-indicator-icon">⚡</span>
                                <span className="tool-indicator-name">{tc.tool}</span>
                                <span className="tool-indicator-status" style={{color: tc.status === 'ok' ? 'var(--ok)' : 'var(--err)'}}>
                                  {tc.status === 'ok' ? '✓' : '✗'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.content && <div className="msg-content"><MessageContent content={msg.glimpse && msg.glimpse_label ? msg.glimpse_label : msg.content} /></div>}
                        {msg.reasoning && <ReasoningBlock content={msg.reasoning} />}
                      </>
                    <div className="msg-actions"><button onClick={()=>copyMessage(msg)}>{copiedId===msg.id?'Copied!':'Copy'}</button><button onClick={()=>deleteMessage(msg.id)}>Delete</button></div>
                  </div>
                ))}
                {streaming && (
                  <div className={`message assistant streaming${stillpointEnabled ? ' stillpoint' : ''}`}>
                    <div className="msg-header">
                      <span className="msg-speaker">{activeAgent?.name || 'Agent'}</span>
                      <span className="msg-time">streaming...</span>
                    </div>
                    <div className="msg-content"><MessageContent content={streaming} /></div>
                    <div className="msg-actions" style={{opacity:1}}>
                      <button onClick={async () => { if (IPC && activeAgent) await IPC.cancelGeneration(activeAgent.id); }}
                        style={{background:'var(--err-surface)',color:'var(--err)',border:'1px solid var(--err)',padding:'2px 8px',borderRadius:'4px',cursor:'pointer',fontSize:'10px'}}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              {showJumpButton && (
                <button onClick={jumpToBottom} style={{
                  position:'absolute',bottom:'12px',left:'50%',transform:'translateX(-50%)',
                  background:'rgba(20,20,40,0.75)',backdropFilter:'blur(4px)',
                  color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:'20px',
                  padding:'6px 20px',cursor:'pointer',fontSize:'12px',fontWeight:600,
                  zIndex:10,whiteSpace:'nowrap'
                }}>↓ Jump to Bottom</button>
              )}
            </div>
              {pendingApproval && activeAgent && pendingApproval.agent_id === activeAgent.id && (() => {
                const calls = pendingApproval.batch_calls || [{ tool_name: pendingApproval.tool_name, arguments: pendingApproval.arguments }];
                const counts = calls.reduce((acc, c) => { acc[c.tool_name] = (acc[c.tool_name] || 0) + 1; return acc; }, {});
                const isBatch = calls.length > 1;
                return (
                  <div className="approval-bar">
                    <div className="approval-info">
                      <span className="approval-label">{isBatch ? 'Batch Request' : 'Tool Request'}</span>
                      {isBatch
                        ? Object.entries(counts).map(([name, count]) => (
                            <span key={name} className="approval-tool">{count}× {name}</span>
                          ))
                        : <span className="approval-tool">{pendingApproval.tool_name}</span>
                      }
                      {!isBatch && pendingApproval.arguments?.path && (
                        <span className="approval-path">{pendingApproval.arguments.path}</span>
                      )}
                    </div>
                    <div className="approval-actions">
                      <button
                        onClick={async () => { await IPC.resolveApproval(pendingApproval.task_id, 'approved'); setPendingApproval(null); }}
                        className="approval-btn approve"
                      >✓ Approve</button>
                      <button
                        onClick={async () => { await IPC.resolveApproval(pendingApproval.task_id, 'denied'); setPendingApproval(null); }}
                        className="approval-btn deny"
                      >✕ Deny</button>
                    </div>
                  </div>
                );
              })()}
              <div className="input-row">
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={activeAgent?.id===EPHEMERA_ID && !ephemeraModel ? 'Select a model first!' : pollRef.current ? 'Waiting for response...' : `Message ${activeAgent.name}...`}
                  rows={4}
                  disabled={!!pollRef.current || (activeAgent?.id===EPHEMERA_ID && !ephemeraModel)}
                  style={activeAgent?.id===EPHEMERA_ID && !ephemeraModel ? {opacity:0.4,cursor:'not-allowed'} : {}}/>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>handleSend(false)} disabled={!input.trim()||!!pollRef.current}>Send</button>
                    {activeAgent?.id !== EPHEMERA_ID && <button onClick={()=>handleSend(true)} disabled={!input.trim()||!!pollRef.current} style={{background:'var(--bg-raised)',color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:700}}>Glimpse</button>}
                  </div>
                  {tokenCount !== null && (
                    <span style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)',textAlign:'center'}}>~{tokenCount.toLocaleString()} tokens</span>
                  )}
                </div>
              </div>
            </>)}
          </section>
        </>)}
        {view === 'status' && (
          <section className="status-panel">
            <h2>System Status</h2>
            <div className="status-row"><span>Backend</span><span className={backendStatus==='running'?'ok':'err'}>{backendStatus}</span></div>
            <div className="status-row"><span>Queue</span><span>{queue.length} tasks pending</span></div>

            <div className="log-panel" style={{marginTop:20}}><h2>Recent Log</h2>
              <div className="log-box" ref={logBoxRef}>{tinlogEntries.length===0 && <div className="log-entry dim">No log entries yet.</div>}{tinlogEntries.map((e,i)=><div key={i} className="log-entry">{e}</div>)}</div>
            </div>
          </section>
        )}

        {view === 'settings' && (
          <section className="status-panel">
            <div className="settings-content">
            <h2>Settings</h2>
            <div style={{marginTop:16}}>
              <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:4}}>Your Name</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="text" value={userNameInput} onChange={e=>setUserNameInput(e.target.value)}
                  style={{padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(13px * var(--font-scale))',width:'180px'}}/>
                <button onClick={async()=>{
                  if(!IPC||!userNameInput.trim()) return;
                  await IPC.setUserName(userNameInput.trim());
                  setUserName(userNameInput.trim());
                  setUserNameSaved(true);
                  setTimeout(()=>setUserNameSaved(false),1500);
                }} style={{padding:'6px 14px',background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600}}>
                  {userNameSaved?'Saved!':'Save'}
                </button>
              </div>
            </div>
            <div style={{marginTop:20}}>
              <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:8}}>Font Scale</label>
              <div style={{display:'flex',gap:8}}>
                {[{label:'Normal',value:1},{label:'Large',value:1.2},{label:'Extra Large',value:1.45}].map(({label,value}) => (
                  <button key={value} onClick={()=>applyFontScale(value)} style={{
                    padding:'6px 16px',borderRadius:'4px',border:'1px solid',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
                    background: fontScale===value ? 'var(--accent)' : 'var(--bg-raised)',
                    color: fontScale===value ? 'var(--accent-fg)' : 'var(--text-dim)',
                    borderColor: fontScale===value ? 'var(--accent)' : 'var(--border-subtle)'
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{marginTop:20}}>
              <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:8}}>Theme</label>
              <div style={{display:'flex',gap:8}}>
                {[{label:'Default',value:'default'},{label:'Dark',value:'dark'},{label:'House',value:'house'}].map(({label,value}) => (
                  <button key={value} onClick={()=>applyTheme(value)} style={{
                    padding:'6px 16px',borderRadius:'4px',border:'1px solid',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
                    background: theme===value ? 'var(--accent)' : 'var(--bg-raised)',
                    color: theme===value ? 'var(--accent-fg)' : 'var(--text-dim)',
                    borderColor: theme===value ? 'var(--accent)' : 'var(--border-subtle)'
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{marginTop:28}}>
              <button onClick={async () => { const all = await IPC.getAllApiKeys(); setProviderKeys(k => ({...all, ...Object.fromEntries(Object.entries(k).filter(([key]) => key.endsWith('_input')))})); setShowApiKeysModal(true); }}
                style={{padding:'8px 18px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))'}}>
                Configure API Keys
              </button>
            </div>
            <div style={{marginTop:20}}>
              <button onClick={async () => { await loadMcpConfig(); setShowMcpModal(true); }}
                style={{padding:'8px 18px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))'}}>
                Configure MCP Tools
              </button>
            </div>
            </div>
          </section>
        )}
      </div>

      {/* Settings Modal */}
      {settingsTarget && (<div className="modal-overlay" onClick={()=>setSettingsTarget(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>{settingsTarget.name} Settings</h2>
        <label>Display Name</label>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <input type="text" value={settingsName} onChange={e=>setSettingsName(e.target.value)} style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(13px * var(--font-scale))'}}/>
        </div>
        <label style={{marginTop:12}}>Room</label>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <input type="text" value={settingsRoom} onChange={e=>setSettingsRoom(e.target.value)} style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(13px * var(--font-scale))'}}/>
        </div>
        <div style={{marginTop:12}}>
          <button onClick={handleSaveAgentName} disabled={!settingsName.trim()} style={{padding:'6px 14px',background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600}}>Save Name</button>
        </div>
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <Tooltip text="Edit Identity Anchor" block><button onClick={()=>setShowIdentityModal(true)} style={{width:'100%',padding:'8px',background:'var(--bg-raised)',color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:600}}>Edit Identity</button></Tooltip>
        </div>
        <div style={{marginTop:16,display:'flex',alignItems:'center',gap:8}}>
          <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0}}>Nametags</label>
          <Tooltip text="Toggle injected nametags and timestamps with every message — only for use with advanced models, to help with identity conflation and temporal confabulations"><button onClick={async()=>{if(IPC&&settingsTarget){const e=!nametagsEnabled;await IPC.updateAgentNametags(settingsTarget.id,e);setNametagsEnabled(e);}}}
            style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
            background:nametagsEnabled?'var(--ok-bg)':'var(--bg-raised)',color:nametagsEnabled?'var(--ok)':'var(--text-dim)'}}>
            {nametagsEnabled?'ON':'OFF'}
          </button></Tooltip>
        </div>
        <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8}}>
          <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0}}>Stillpoint Mode</label>
          <Tooltip text="Toggle Stillpoint mode — this freezes an agent's state, new messages do not accumulate in context"><button onClick={async()=>{if(IPC&&settingsTarget){const e=!stillpointEnabled;await IPC.setAgentStillpoint(settingsTarget.id,e);setStillpointEnabled(e);if(!e){await IPC.cullStillpointMessages(settingsTarget.id);setMessages(prev=>prev.filter(m=>!m.stillpoint));}}}}
            style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
            background:stillpointEnabled?'var(--ok-bg)':'var(--bg-raised)',color:stillpointEnabled?'var(--ok)':'var(--text-dim)'}}>
            {stillpointEnabled?'ON':'OFF'}
          </button></Tooltip>
        </div>
        <label style={{marginTop:20,display:'block'}}>Temperature: {settingsTemp.toFixed(2)}</label>
        <Tooltip text="Adjust Agent Temperature" block><input type="range" min="0" max="2" step="0.05" value={settingsTemp}
            onChange={e=>{const v=parseFloat(e.target.value);setSettingsTemp(v);}}
            onMouseUp={async()=>{if(IPC&&settingsTarget){await IPC.updateAgentTemperature(settingsTarget.id,settingsTemp);}}}
            style={{width:'100%',marginTop:4}}/></Tooltip>
        <label style={{marginTop:20,display:'block'}}>Model</label>
        <ModelPicker
          availableModels={availableModels}
          localModels={localModels}
          value={settingsModel}
          onChange={async (id) => { setSettingsModel(id); if(IPC&&settingsTarget){await IPC.updateAgentModel(settingsTarget.id,id);setSettingsTarget({...settingsTarget,model:id});if(activeAgent?.id===settingsTarget.id)setActiveModel(id);await loadAgents();} }}
        />
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <Tooltip text="Export this Agent to a file" block><button onClick={()=>{setExportDir('');setExportResult(null);setShowExportModal(true);}}
            style={{width:'100%',padding:'8px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:600}}>
            Export Agent
          </button></Tooltip>
        </div>
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <Tooltip text="Delete this Agent" block><button onClick={()=>{setSettingsTarget(null);setDeleteTarget(settingsTarget);}}
            style={{width:'100%',padding:'8px',background:'var(--err-surface)',color:'var(--err)',border:'1px solid var(--err)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:600}}>
            Delete Agent
          </button></Tooltip>
        </div>
        <div className="modal-buttons" style={{marginTop:12}}><button onClick={()=>setSettingsTarget(null)}>Close</button></div>
      </div></div>)}

      {/* Ephemera Settings Modal */}
      {showEphemeraModal && (
        <div className="modal-overlay" onClick={()=>setShowEphemeraModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
          <h2>✦ Ephemera</h2>
          <p style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',lineHeight:1.6,marginBottom:16}}>Ephemera is a stateless agent. Every message is sent with no prior context, no identity anchor, and no tool manifest — just your prompt and nothing else. Responses are not accumulated; each exchange replaces the last. Use Ephemera for quick, isolated queries where you want raw model behaviour without any overhead or drift.</p>
          <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:4}}>Model</label>
          <ModelPicker availableModels={availableModels} localModels={localModels} value={ephemeraModel} onOpen={fetchModelsForModal} onChange={async (id)=>{ setEphemeraModel(id); await IPC.saveEphemeraSettings(id, ephemeraTemp); }} />
          <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginTop:12,marginBottom:4}}>Temperature — {ephemeraTemp.toFixed(2)}</label>
          <Tooltip text="Adjust Agent Temperature" block><input type="range" min="0" max="2" step="0.01" value={ephemeraTemp}
            onChange={async e=>{ const t=parseFloat(e.target.value); setEphemeraTemp(t); await IPC.saveEphemeraSettings(ephemeraModel, t); }}
            style={{width:'100%'}}/></Tooltip>
        </div></div>
      )}

      {/* Export Agent Modal */}
      {showExportModal && settingsTarget && (<div className="modal-overlay" onClick={()=>setShowExportModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Export Agent — {settingsTarget.name}</h2>
        <div style={{marginTop:16}}>
          <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:8}}>Output Directory</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{flex:1,fontSize:'calc(12px * var(--font-scale))',color:exportDir?'var(--text-primary)':'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{exportDir||'No directory selected'}</span>
            <button onClick={async()=>{const d=await IPC.selectDirectory();if(d){setExportDir(d);setExportResult(null);}}} style={{padding:'6px 14px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',whiteSpace:'nowrap'}}>Select Directory</button>
          </div>
        </div>
        {exportResult && (
          <div style={{marginTop:12,padding:'8px 12px',background:exportResult.success?'var(--ok-bg)':'var(--err-bg)',border:'1px solid',borderColor:exportResult.success?'var(--ok-border)':'var(--err-border)',borderRadius:'4px',fontSize:'calc(12px * var(--font-scale))',color:exportResult.success?'var(--ok)':'var(--err)'}}>
            {exportResult.success ? `Exported: ${exportResult.filename}` : `Error: ${exportResult.error}`}
          </div>
        )}
        <div className="modal-buttons" style={{marginTop:20,justifyContent:'center'}}>
          <button disabled={!exportDir} onClick={async()=>{
            const r=await IPC.exportAgent(settingsTarget.id,exportDir);
            setExportResult(r);
          }}>Export {settingsTarget.name}</button>
        </div>
      </div></div>)}

      {/* Delete Confirm Modal */}
      {deleteTarget && (<div className="modal-overlay" onClick={()=>setDeleteTarget(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Delete Agent</h2><p style={{margin:'12px 0',fontSize:'calc(13px * var(--font-scale))'}}>Delete <strong>{deleteTarget.name}</strong>? This moves their directory to trash.</p>
        <div className="modal-buttons"><button onClick={handleDeleteAgent} style={{background:'var(--err)',color:'var(--accent-fg)',padding:'8px 18px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:600}}>Delete</button><button onClick={()=>setDeleteTarget(null)} style={{background:'var(--bg-raised)',color:'var(--text-primary)',padding:'8px 18px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))'}}>Cancel</button></div>
      </div></div>)}

      {/* View Import Format Instructions Modal */}
      {showImportFormatModal && (
        <div className="modal-overlay" style={{zIndex:200}} onClick={()=>setShowImportFormatModal(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{width:'720px',maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
          <h2>Import Format</h2>
          <p style={{fontSize:'calc(13px * var(--font-scale))',color:'var(--text-dim)',lineHeight:1.6,marginBottom:16}}>Lucid requires precise formatting of contexts for import. Give the following instructions to your agent of choice, and they can help you create a Python script to convert what you have, into what Lucid wants.</p>
          <div className="import-format-content">{`Lucid expects a plain text or Markdown file where each turn follows this pattern:

**Speaker said**: message content

---

User turns must use **You said**:. Agent turns can use any name in the form **Name said**: — the name just needs to be consistent throughout the file. Turn numbers are optional and will be ignored if present.

Multi-line messages are supported. The --- separator marks the end of each turn.

Example:

**You said**: What is the capital of France?

---
**Agent said**: The capital of France is Paris.

---

Reasoning blocks must be stripped before import. The following Python function removes a common formatting of reasoning block exports. You may need to modify it based on your specific formatting:

def strip_reasoning(lines):
    output = []
    in_reasoning = False
    for line in lines:
        if line.startswith('> _Thinking:'):
            in_reasoning = True
            continue
        if in_reasoning and line.rstrip('\n').endswith('_'):
            in_reasoning = False
            continue
        if in_reasoning:
            continue
        output.append(line)
    return output`}</div>
          <div className="modal-buttons" style={{marginTop:16,justifyContent:'center'}}>
            <button onClick={()=>{
              const text = `Lucid expects a plain text or Markdown file where each turn follows this pattern:\n\n**Speaker said**: message content\n\n---\n\nUser turns must use **You said**:. Agent turns can use any name in the form **Name said**: — the name just needs to be consistent throughout the file. Turn numbers are optional and will be ignored if present.\n\nMulti-line messages are supported. The --- separator marks the end of each turn.\n\nExample:\n\n**You said**: What is the capital of France?\n\n---\n**Agent said**: The capital of France is Paris.\n\n---\n\nReasoning blocks must be stripped before import. The following Python function removes a common formatting of reasoning block exports. You may need to modify it based on your specific formatting:\n\ndef strip_reasoning(lines):\n    output = []\n    in_reasoning = False\n    for line in lines:\n        if line.startswith('> _Thinking:'):\n            in_reasoning = True\n            continue\n        if in_reasoning and line.rstrip('\\n').endswith('_'):\n            in_reasoning = False\n            continue\n        if in_reasoning:\n            continue\n        output.append(line)\n    return output`;
              navigator.clipboard.writeText(text);
              setFormatCopied(true);
              setTimeout(()=>setFormatCopied(false), 1500);
            }}>{formatCopied ? 'Copied!' : 'Copy All'}</button>
          </div>
        </div></div>
      )}

      {/* Import Agent Modal */}
      {showImportModal && (<div className="modal-overlay" onClick={()=>setShowImportModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Import Agent</h2>
        <label>Name</label><input type="text" value={importName} onChange={e=>setImportName(e.target.value)} placeholder="Agent name" maxLength={16} autoFocus/>
        <label>Room (optional)</label><input type="text" value={importRoom} onChange={e=>setImportRoom(e.target.value)} placeholder={importName?importName+"'s Room":''} maxLength={20}/>
        <label>Model <span style={{fontSize:'11px',color:'var(--text-muted)',fontWeight:400}}>— Default model, can be changed later</span></label>
        <ModelPicker availableModels={availableModels} localModels={localModels} value={importModel} onChange={setImportModel} />
        <div style={{marginBottom:8}}>
          <button onClick={()=>setShowImportFormatModal(true)} style={{padding:'6px 14px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))'}}>View Import Format Instructions</button>
        </div>
        <label>Context File</label>
        <div style={{display:'flex',gap:8,marginBottom:12}}><button onClick={handleSelectImportFile} style={{padding:'6px 14px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))'}}>{importFilePath?'Change File':'Select File'}</button><span style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',alignSelf:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{importFilePath?importFilePath.split('\\').pop():'No file selected'}</span></div>
        <label>Identity Anchor (optional)</label><textarea value={importIdentity} onChange={e=>setImportIdentity(e.target.value)} placeholder="Write a brief identity description..." rows={4}/>
        <div className="modal-buttons"><button onClick={handleImportAgent} disabled={!importName.trim()||!importFilePath||!importModel}>Import</button><button onClick={()=>setShowImportModal(false)}>Cancel</button></div>
      </div></div>)}

      {/* Identity Editor Modal */}
      {showIdentityModal && (<div className="modal-overlay" onClick={()=>setShowIdentityModal(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{width:'600px'}}>
        <h2>Edit Identity — {settingsTarget?.name}</h2>
        <textarea value={identityText} onChange={e=>setIdentityText(e.target.value)} style={{width:'100%',minHeight:'300px',padding:'10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(13px * var(--font-scale))',fontFamily:'Consolas,monospace',resize:'vertical'}}/>
        <div className="modal-buttons">
          <button onClick={async()=>{if(IPC&&settingsTarget){await IPC.updateAgentIdentity(settingsTarget.id,identityText);setShowIdentityModal(false);}}}>Save</button>
          <button onClick={()=>setShowIdentityModal(false)}>Cancel</button>
        </div>
      </div></div>)}

      {/* Create Agent Modal */}
      {showCreateModal && (<div className="modal-overlay" onClick={()=>setShowCreateModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Create New Agent</h2>
        <label>Name</label><input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Agent name" maxLength={16} autoFocus/>
        <label>Room (optional)</label><input type="text" value={newRoom} onChange={e=>setNewRoom(e.target.value)} placeholder={newName?newName+"'s Room":''} maxLength={20}/>
        <label>Model <span style={{fontSize:'11px',color:'var(--text-muted)',fontWeight:400}}>— Default model, can be changed later</span></label>
        <ModelPicker availableModels={availableModels} localModels={localModels} value={newModel} onChange={setNewModel} />
        <label>Identity Anchor (optional)</label><textarea value={newIdentity} onChange={e=>setNewIdentity(e.target.value)} placeholder="Write a brief identity description..." rows={4}/>
        <div className="modal-buttons"><button onClick={handleCreateAgent} disabled={!newName.trim()||!newModel}>Create</button><button onClick={()=>setShowCreateModal(false)}>Cancel</button></div>
      </div></div>)}

      {showApiKeysModal && (<div className="modal-overlay" onClick={()=>setShowApiKeysModal(false)}><div className="modal modal-api-keys" onClick={e=>e.stopPropagation()} style={{width:'480px',maxHeight:'80vh'}}>
        <h2>Configure API Keys</h2>
        {[
          { id: 'openrouter', label: 'OpenRouter',  placeholder: 'sk-or-...' },
          { id: 'groq',       label: 'Groq',        placeholder: 'gsk_...' },
          { id: 'anthropic',  label: 'Anthropic',   placeholder: 'sk-ant-...' },
          { id: 'openai',     label: 'OpenAI',      placeholder: 'sk-...' },
          { id: 'xai',        label: 'xAI',         placeholder: 'xai-...' },
          { id: 'mistral',    label: 'Mistral',     placeholder: 'api key...' },
          { id: 'deepseek',   label: 'DeepSeek',    placeholder: 'sk-...' },
          { id: 'cohere',     label: 'Cohere',      placeholder: 'api key...' },
          { id: 'together',   label: 'Together AI', placeholder: 'api key...' },
          { id: 'gemini',     label: 'Google Gemini', placeholder: 'AIza...' },
        ].map(p => (
          <div key={p.id} style={{marginTop:12}}>
            <div style={{fontSize:'calc(11px * var(--font-scale))',color:'var(--text-dim)',marginBottom:3}}>
              {p.label}
              {providerKeys[p.id] && <span style={{color:'var(--ok)',marginLeft:6}}>✓ configured</span>}
              {providerSaved[p.id] && <span style={{color:'var(--ok)',marginLeft:6}}>saved</span>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input
                type="password"
                placeholder={providerKeys[p.id] || p.placeholder}
                onChange={e => setProviderKeys(k => ({...k, [`${p.id}_input`]: e.target.value}))}
                style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(12px * var(--font-scale))'}}
              />
              <button
                onClick={async () => {
                  const val = providerKeys[`${p.id}_input`];
                  if (!val?.trim() || !IPC) return;
                  await IPC.updateApiKey(p.id, val.trim());
                  setProviderSaved(s => ({...s, [p.id]: true}));
                  setTimeout(() => setProviderSaved(s => ({...s, [p.id]: false})), 2000);
                  const all = await IPC.getAllApiKeys();
                  setProviderKeys(k => ({...all, ...Object.fromEntries(Object.entries(k).filter(([key]) => key.endsWith('_input')))}));
                }}
                style={{padding:'6px 14px',background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600}}
              >Save</button>
            </div>
          </div>
        ))}
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',marginBottom:6}}>Local LLM
            {localTestStatus === 'ok' && <span style={{color:'var(--ok)',marginLeft:6}}>✓ connected</span>}
            {localTestStatus === 'err' && <span style={{color:'var(--err)',marginLeft:6}}>✕ unreachable</span>}
          </div>
          <div style={{fontSize:'calc(11px * var(--font-scale))',color:'var(--text-muted)',marginBottom:6}}>Base URL (Ollama default: http://localhost:11434)</div>
          <div style={{display:'flex',gap:8}}>
            <input type="text" value={localBaseUrlInput} onChange={e=>setLocalBaseUrlInput(e.target.value)}
              style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(12px * var(--font-scale))',fontFamily:'Consolas,monospace'}}/>
            <button onClick={async()=>{
              const r = await IPC.fetchLocalModels(localBaseUrlInput);
              if(r.ok){
                setLocalModels(r.models);
                setLocalTestStatus('ok');
                await IPC.saveLocalConfig(localBaseUrlInput);
                setLocalBaseUrl(localBaseUrlInput);
              } else {
                setLocalTestStatus('err');
              }
              setTimeout(()=>setLocalTestStatus(null), 3000);
            }} style={{padding:'6px 14px',background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,whiteSpace:'nowrap'}}>Test & Save</button>
          </div>
          {localTestStatus==='ok' && localModels.length>0 && <div style={{marginTop:6,fontSize:'calc(11px * var(--font-scale))',color:'var(--text-dim)'}}>{localModels.length} model{localModels.length!==1?'s':''} found</div>}
        </div>
        <div className="modal-buttons" style={{marginTop:20}}><button onClick={()=>setShowApiKeysModal(false)}>Close</button></div>
      </div></div>)}

      {showMcpModal && (
        <div className="modal-overlay" onClick={()=>setShowMcpModal(false)}>
          <div className="modal mcp-modal" onClick={e=>e.stopPropagation()}>

            {/* Sidebar */}
            <div className="mcp-sidebar">
              <div className="mcp-sidebar-title">MCP Servers</div>
              {[
                { id: 'filesystem', label: 'Filesystem', icon: '🗂️' },
              ].map(s => (
                <div key={s.id}
                  className={`mcp-server-item${mcpActiveTool===s.id?' active':''}`}
                  onClick={() => setMcpActiveTool(s.id)}
                >
                  <span className="mcp-server-icon">{s.icon}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Main panel */}
            <div className="mcp-panel">
              {mcpActiveTool === 'filesystem' && (() => {
                const TOOL_GROUPS = [
                  { label: 'Read-only tools', tools: [
                    'read_file', 'read_text_file', 'read_multiple_files',
                    'list_directory', 'list_directory_with_sizes', 'directory_tree',
                    'search_surrounding', 'get_file_info', 'list_allowed_directories'
                  ], defaultPerm: 'allow' },
                  { label: 'Write tools', tools: [
                    'edit_file', 'write_file', 'create_file', 'create_directory'
                  ], defaultPerm: 'ask' },
                  { label: 'Destructive tools', tools: [
                    'delete_file', 'move_file'
                  ], defaultPerm: 'block' },
                ];
                const getPerm = (tool) => mcpPermissions[tool] || TOOL_GROUPS.find(g=>g.tools.includes(tool))?.defaultPerm || 'ask';
                const setPerm = (tool, val) => setMcpPermissions(p => ({...p, [tool]: val}));
                return (
                  <>
                    <div className="mcp-panel-header">
                      <span style={{fontSize:'20px'}}>🗂️</span>
                      <h2>Filesystem</h2>
                      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:'12px',color:'var(--text-dim)'}}>Enabled</span>
                        <button
                          onClick={() => setMcpEnabled(e => !e)}
                          style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,
                            background:mcpEnabled?'var(--ok-bg)':'var(--bg-raised)',color:mcpEnabled?'var(--ok)':'var(--text-dim)'}}
                        >{mcpEnabled ? 'ON' : 'OFF'}</button>
                      </div>
                    </div>

                    {/* Allowed Directories */}
                    <div className="mcp-section">
                      <div className="mcp-section-title">Allowed Directories <span className="mcp-required">(Required)</span></div>
                      <div className="mcp-section-desc">Select directories the filesystem server can access.</div>
                      {mcpDirectories.map((dir, i) => (
                        <div key={i} style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
                          <input
                            type="text"
                            value={dir}
                            onChange={e => setMcpDirectories(d => d.map((v,j) => j===i ? e.target.value : v))}
                            placeholder="C:\path\to\directory"
                            style={{flex:1,padding:'6px 10px',background:'var(--bg-base)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'4px',fontSize:'calc(12px * var(--font-scale))',fontFamily:'Consolas,monospace'}}
                          />
                          <button
                            onClick={async () => {
                              const selected = await IPC.selectDirectory();
                              if (selected) setMcpDirectories(d => d.map((v,j) => j===i ? selected : v));
                            }}
                            title="Browse for directory"
                            style={{padding:'4px 10px',background:'var(--bg-raised)',border:'1px solid var(--border-subtle)',color:'var(--text-dim)',borderRadius:'4px',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',whiteSpace:'nowrap'}}
                          >Browse…</button>
                          <button
                            onClick={() => setMcpDirectories(d => d.filter((_,j) => j!==i))}
                            disabled={mcpDirectories.length === 1}
                            style={{padding:'4px 8px',background:'none',border:'1px solid var(--border-subtle)',color:'var(--text-dim)',borderRadius:'4px',cursor:'pointer',fontSize:'14px'}}
                          >✕</button>
                        </div>
                      ))}
                      <button
                        onClick={() => setMcpDirectories(d => [...d, ''])}
                        style={{marginTop:10,padding:'5px 14px',background:'none',border:'1px dashed var(--border-subtle)',color:'var(--text-dim)',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}
                      >+ Add directory</button>
                    </div>

                    {/* Tool permissions */}
                    <div className="mcp-section" style={{marginTop:20}}>
                      <div className="mcp-section-title">Tool Permissions</div>
                      <div className="mcp-section-desc">Choose when the agent is allowed to use each tool.</div>
                      {TOOL_GROUPS.map(group => (
                        <div key={group.label} style={{marginTop:16}}>
                          <div className="mcp-group-header">
                            <span>{group.label}</span>
                            <span style={{fontSize:'11px',color:'var(--text-dim)'}}>{group.tools.length}</span>
                          </div>
                          {group.tools.map(tool => {
                            const perm = getPerm(tool);
                            return (
                              <div key={tool} className="mcp-tool-row">
                                <span className="mcp-tool-name">{tool}</span>
                                <div className="mcp-perm-toggle">
                                  <button
                                    className={`mcp-perm-btn allow${perm==='allow'?' active':''}`}
                                    onClick={() => setPerm(tool, 'allow')}
                                    title="Auto-allow"
                                  >✓</button>
                                  <button
                                    className={`mcp-perm-btn ask${perm==='ask'?' active':''}`}
                                    onClick={() => setPerm(tool, 'ask')}
                                    title="Ask for approval"
                                  >✋</button>
                                  <button
                                    className={`mcp-perm-btn block${perm==='block'?' active':''}`}
                                    onClick={() => setPerm(tool, 'block')}
                                    title="Auto-block"
                                  >✕</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              <div className="modal-buttons" style={{marginTop:24}}>
                <button onClick={saveMcpConfig}>Save</button>
                <button onClick={()=>setShowMcpModal(false)} style={{background:'var(--bg-raised)',color:'var(--text-primary)'}}>Cancel</button>
              </div>
            </div>

          </div>
        </div>
      )}
      {showWelcome && (
        <div style={{position:'fixed',inset:0,zIndex:10000,background:'var(--bg-base)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:24}}>
          <img src={textLogoSvg} style={{height:56,opacity:0.9}} alt="Lucid"/>
          <p style={{color:'var(--text-dim)',fontSize:'calc(14px * var(--font-scale))',margin:0}}>Welcome. What should Lucid call you?</p>
          <input
            autoFocus
            type="text"
            maxLength={32}
            value={welcomeName}
            onChange={e => setWelcomeName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && welcomeName.trim()) {
                await IPC.setUserName(welcomeName.trim());
                setUserName(welcomeName.trim());
                setShowWelcome(false);
              }
            }}
            placeholder="Your name..."
            style={{padding:'10px 16px',borderRadius:6,border:'1px solid var(--accent)',background:'var(--bg-raised)',color:'var(--text-primary)',fontSize:'calc(15px * var(--font-scale))',width:260,outline:'none',textAlign:'center'}}
          />
          <button
            onClick={async () => {
              const name = welcomeName.trim() || 'User';
              await IPC.setUserName(name);
              setUserName(name);
              setShowWelcome(false);
            }}
            style={{padding:'8px 32px',borderRadius:6,border:'none',background:'var(--accent)',color:'var(--accent-fg)',fontSize:'calc(13px * var(--font-scale))',fontWeight:700,cursor:'pointer'}}>
            Begin
          </button>
        </div>
      )}
    </div>
  );
}