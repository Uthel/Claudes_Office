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
    <span ref={anchorRef} className={`tooltip-anchor${block ? ' block-anchor' : ''}`} onMouseEnter={show} onMouseLeave={() => setVisible(false)}>
      {children}
      <span ref={bubbleRef} className={`tooltip-bubble${visible ? ' visible' : ''}`} style={style}>
        {text}
      </span>
    </span>
  );
}

// Split text into spans and link elements. Recognizes markdown-style links
// [label](url) and bare http(s) URLs. Code blocks are handled separately and
// left untouched.
function renderTextWithLinks(text, keyPrefix) {
  const parts = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let last = 0, match, i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last, match.index)}</span>);
    }
    const isMd = !!match[1];
    const href = isMd ? match[2] : match[3];
    const display = isMd ? match[1] : match[3];
    parts.push(<a key={`${keyPrefix}-a${i++}`} href={href} target="_blank" rel="noopener noreferrer" className="msg-link">{display}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last)}</span>);
  }
  return parts;
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
    </div>
  );
}

function MessageContent({ content }) {
  // Strip <lucid>...</lucid> blocks before rendering
  const stripped = content.replace(/<lucid>[\s\S]*?<\/lucid>/g, '').trim();
  const parts = [];
  const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
  let last = 0, match;
  while ((match = regex.exec(stripped)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: stripped.slice(last, match.index) });
    parts.push({ type: 'code', value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < stripped.length) parts.push({ type: 'text', value: stripped.slice(last) });
  return (
    <div>
      {parts.map((p, i) =>
        p.type === 'code'
          ? <CodeBlock key={i} code={p.value} />
          : <span key={i} style={{whiteSpace:'pre-wrap'}}>{renderTextWithLinks(p.value, i)}</span>
      )}
    </div>
  );
}

function EphemeraReasoningSection({ ephemeraReasoning, orReasoningMap }) {
  const [epRsn, setEpRsn] = React.useState(null);
  React.useEffect(() => {
    if (IPC) IPC.getEphemeraReasoning().then(r => setEpRsn(r));
  }, [ephemeraReasoning]);
  if (!ephemeraReasoning) return null;
  const efforts = ephemeraReasoning.supported_efforts || null;
  const defaultEffort = (ephemeraReasoning.default_effort && ephemeraReasoning.default_effort !== 'none') ? ephemeraReasoning.default_effort : (efforts?.[0] || 'high');
  const mandatory = !!ephemeraReasoning.mandatory;
  const isOn = epRsn?.enabled ?? (ephemeraReasoning.default_enabled !== false);
  const currentEffort = epRsn?.effort ?? defaultEffort;
  const EFFORT_LABELS = {low:'Low',medium:'Medium',high:'High',xhigh:'X-High',max:'Max',minimal:'Minimal'};
  return (
    <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}}>
      <div style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',marginBottom:8,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Reasoning</div>
      {!mandatory && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0}}>Enabled</label>
          <Tooltip text="Enable reasoning/thinking mode">
            <button onClick={async () => { const cur=epRsn??{enabled:isOn,effort:currentEffort}; const next={...cur,enabled:!cur.enabled}; await IPC.saveEphemeraReasoning(next); setEpRsn(next); }}
              style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
                background:isOn?'var(--ok-bg)':'var(--bg-raised)',color:isOn?'var(--ok)':'var(--text-dim)'}}>
              {isOn?'ON':'OFF'}
            </button>
          </Tooltip>
        </div>
      )}
      {efforts && efforts.length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0,marginRight:4}}>Effort</label>
          {efforts.map(level => (
            <button key={level} onClick={async () => { const cur=epRsn??{enabled:isOn,effort:currentEffort}; const next={...cur,effort:level}; await IPC.saveEphemeraReasoning(next); setEpRsn(next); }}
              style={{padding:'4px 12px',borderRadius:'4px',border:'1px solid',cursor:'pointer',fontSize:'calc(11px * var(--font-scale))',fontWeight:600,
                background:currentEffort===level?'var(--accent)':'var(--bg-raised)',
                color:currentEffort===level?'var(--accent-fg)':'var(--text-dim)',
                borderColor:currentEffort===level?'var(--accent)':'var(--border-subtle)'}}>
              {EFFORT_LABELS[level]||level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatToolName(name) {
  if (!name) return 'tool call';
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function LiveToolBlock({ toolName, content }) {
  return (
    <div style={{marginBottom:'10px',border:'1px solid var(--border-subtle)',borderRadius:'6px',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',background:'var(--bg-raised)',borderBottom:'1px solid var(--border-subtle)'}}>
        <span style={{fontSize:'calc(11px * var(--font-scale))',color:'var(--accent)',fontWeight:700}}>⚡</span>
        <span style={{fontSize:'calc(11px * var(--font-scale))',color:'var(--text-primary)',fontWeight:600}}>{formatToolName(toolName)}</span>
        <span style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)',marginLeft:4,fontStyle:'italic'}}>working...</span>
      </div>
      <pre className="tool-stream-scroll" style={{margin:0,padding:'8px',background:'var(--bg-base)',fontSize:'calc(11px * var(--font-scale))',color:'var(--text-dim)',fontFamily:'Consolas,monospace',whiteSpace:'pre-wrap',wordBreak:'break-all',lineHeight:1.5,maxHeight:'300px',overflowY:'auto'}}>{content}</pre>
    </div>
  );
}

function ReasoningContent({ content }) {
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
          ? <div key={i} style={{margin:'6px 0',borderRadius:'4px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',padding:'6px 8px',overflowX:'auto'}}>
              <pre style={{margin:0,fontFamily:'Consolas,monospace',fontSize:'calc(11px * var(--font-scale))',color:'var(--text-primary)',whiteSpace:'pre',lineHeight:'1.5'}}>{p.value}</pre>
            </div>
          : <span key={i} style={{whiteSpace:'pre-wrap'}}>{renderTextWithLinks(p.value, i)}</span>
      )}
    </div>
  );
}

function ReasoningBlock({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:'6px',marginBottom:'10px',borderTop:'1px solid var(--border)',paddingTop:'4px'}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:'calc(11px * var(--font-scale))',padding:'0',display:'flex',alignItems:'center',gap:'4px'}}
      >
        <span style={{fontSize:'calc(9px * var(--font-scale))'}}>{open ? '▼' : '▶'}</span>
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open && (
        <div style={{marginTop:'10px',padding:'8px',background:'var(--bg-base)',borderRadius:'4px',fontSize:'calc(11px * var(--font-scale))',color:'var(--text-dim)',fontFamily:'Consolas,monospace',whiteSpace:'pre-wrap',lineHeight:'1.5'}}>
          <ReasoningContent content={content} />
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

// Local-time formatter matching Python's strftime output. Used for temp
// messages rendered before the real ones land from context.jsonl.
function localTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function App() {
  // Popout routing: the hash fragment #/popout/{agentId} indicates this
  // renderer is a popped-out conversation window. Computed once at render;
  // the value is stable for the lifetime of the window.
  const popoutAgentId = (() => {
    const m = window.location.hash.match(/^#\/popout\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  })();
  const isPopout = !!popoutAgentId;
  // Main-window only: set of agent IDs whose conversations are currently
  // open in popout windows. Updated via IPC events from the main process.
  const [poppedOutAgents, setPoppedOutAgents] = useState(() => new Set());
  const [view, setView] = useState('chat');
  const [appVersion, setAppVersion] = useState('');

  // Fetch the app version once from package.json (via main process). Used in
  // the header subtitle and, in a future batch, the manifest boilerplate.
  useEffect(() => {
    if (!IPC || !IPC.getAppVersion) return;
    IPC.getAppVersion().then(v => { if (v) setAppVersion(v); }).catch(() => {});
  }, []);
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [messagesByAgent, setMessagesByAgent] = useState({});
  const [streamingByAgent, setStreamingByAgent] = useState({});
  const [inputsByAgent, setInputsByAgent] = useState({});
  const [attachmentsByAgent, setAttachmentsByAgent] = useState({});
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [attachmentExpanded, setAttachmentExpanded] = useState(false);
  const preExpansionFullscreenRef = useRef(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
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
  const applyFontScale = (scale, broadcast = true) => {
    document.documentElement.style.setProperty('--font-scale', scale);
    localStorage.setItem('lucid_font_scale', scale);
    setFontScale(scale);
    if (broadcast && IPC && IPC.broadcastAppSetting) {
      IPC.broadcastAppSetting({ type: 'font_scale', value: scale });
    }
  };
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('lucid_theme') || 'default';
    if (saved === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', saved);
    return saved;
  });
  const applyTheme = (t, broadcast = true) => {
    if (t === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('lucid_theme', t);
    setTheme(t);
    if (broadcast && IPC && IPC.broadcastAppSetting) {
      IPC.broadcastAppSetting({ type: 'theme', value: t });
    }
  };
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [toolRecordModal, setToolRecordModal] = useState(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [mcpActiveTool, setMcpActiveTool] = useState('filesystem');
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [mcpDirectories, setMcpDirectories] = useState(['']);
  const [mcpPermissions, setMcpPermissions] = useState({});
  const [pendingApproval, setPendingApproval] = useState(null);
  const EPHEMERA_ID = '__ephemera__';
  const [showEphemeraModal, setShowEphemeraModal] = useState(false);
  const [ephemeraModel, setEphemeraModel] = useState('');
  const [ephemeraTemp, setEphemeraTemp] = useState(0.7);
  const [ephemeraReasoning, setEphemeraReasoning] = useState(null);
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
  const [orReasoningMap, setOrReasoningMap] = useState({});
  const [settingsReasoning, setSettingsReasoning] = useState(null); // null = not supported, object = OR metadata
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
  const [tokenBreakdown, setTokenBreakdown] = useState(null);
  const [tokenProgress, setTokenProgress] = useState(null);
  const tokenDebounceRef = useRef(null);
  const cachedContextTokens = useRef({});
  const cachedIdentityTokens = useRef({});
  const cachedManifestTokens = useRef({});
  const cachedToolRecordTokens = useRef({});
  const countingAgentsRef = useRef(new Set());
  const activeAgentRef = useRef(null);
  const countedMessageIds = useRef({});
  const countedAgentsRef = useRef(new Set());
  const [tokenCacheVersion, setTokenCacheVersion] = useState(0);
  const bumpTokenCache = () => setTokenCacheVersion(v => v + 1);

  // Per-agent scoped state. Each agent has its own messages, streaming, and poll
  // bookkeeping, so multiple agents can generate in the background without
  // stepping on each other's state.
  const activeId = activeAgent?.id;
  const messages = activeId ? (messagesByAgent[activeId] || []) : [];
  const streaming = activeId ? (streamingByAgent[activeId] || '') : '';
  const input = activeId ? (inputsByAgent[activeId] || '') : '';
  const activeAttachments = activeId ? (attachmentsByAgent[activeId] || []) : [];

  const setActiveAttachments = useCallback((updater) => {
    if (!activeId) return;
    setAttachmentsByAgent(prev => {
      const current = prev[activeId] || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeId]: next };
    });
  }, [activeId]);

  const setInput = useCallback((updater) => {
    if (!activeId) return;
    setInputsByAgent(prev => {
      const current = prev[activeId] || '';
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeId]: next };
    });
  }, [activeId]);

  const setMessages = useCallback((updater) => {
    if (!activeId) return;
    setMessagesByAgent(prev => {
      const current = prev[activeId] || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeId]: next };
    });
  }, [activeId]);

  const setStreaming = useCallback((updater) => {
    if (!activeId) return;
    setStreamingByAgent(prev => {
      const current = prev[activeId] || '';
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [activeId]: next };
    });
  }, [activeId]);

  const setAgentMessages = useCallback((agentId, updater) => {
    setMessagesByAgent(prev => {
      const current = prev[agentId] || [];
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [agentId]: next };
    });
  }, []);

  const setAgentStreaming = useCallback((agentId, updater) => {
    setStreamingByAgent(prev => {
      const current = prev[agentId] || '';
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [agentId]: next };
    });
  }, []);

  // Count tokens for any messages not yet marked as counted, add to cache, mark them counted.
  // This is called after every turn completion to capture tool results, read_file responses,
  // and any other content added to context that the incremental per-message approach misses.
  const countAndMarkNewMessages = useCallback(async (agentId, msgs) => {
    if (!IPC || !IPC.countMessageTokens) return msgs;
    if (!countedMessageIds.current[agentId]) countedMessageIds.current[agentId] = new Set();
    const seen = countedMessageIds.current[agentId];
    const uncounted = msgs.filter(m => !seen.has(m.id));
    if (!uncounted.length) return msgs;
    let added = 0;
    let recordAdded = 0;
    for (const msg of uncounted) {
      const r = await IPC.countMessageTokens(msg.role, msg.content || '');
      if (r?.count) added += r.count;
      if (msg.role === 'assistant' && !msg._culled) {
        const parts = [];
        if (msg.parse_errors && msg.parse_errors.length > 0) {
          parts.push('[Earlier parse errors in this turn:\n' + msg.parse_errors.map(p => '- ' + (p.error || '')).join('\n') + ']');
        }
        if (msg.tool_record) parts.push(msg.tool_record);
        if (msg.retained_file && msg.retained_file.contents) {
          parts.push('[Retained file: ' + (msg.retained_file.path || '?') + ']\n' + msg.retained_file.contents + '\n[End of retained file]');
        }
        if (parts.length > 0) {
          const rr = await IPC.countMessageTokens('assistant', parts.join('\n'));
          if (rr?.count) recordAdded += rr.count;
        }
      }
      seen.add(msg.id);
    }
    if (added) {
      cachedContextTokens.current[agentId] = (cachedContextTokens.current[agentId] || 0) + added;
    }
    if (recordAdded) {
      cachedToolRecordTokens.current[agentId] = (cachedToolRecordTokens.current[agentId] || 0) + recordAdded;
    }
    if (added || recordAdded) bumpTokenCache();
    return msgs;
  }, []);
  const messageListRef = useRef(null);
  const logBoxRef = useRef(null);
  const logAtBottom = useRef(true);
  const inputRef = useRef(null);
  const ctxMenuRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0, params: null, targetEl: null, adjusted: false });
  const [showCount, setShowCount] = useState(40);
  const BATCH = 20;
  const handleLogScroll = useCallback(() => {
    const el = logBoxRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    logAtBottom.current = distFromBottom < 30;
  }, []);
  useEffect(() => { if (!logAtBottom.current) return; if (logBoxRef.current) setTimeout(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight; }, 0); }, [tinlogEntries]);
  useEffect(() => { if (view === 'status') { logAtBottom.current = true; if (logBoxRef.current) setTimeout(() => { if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight; }, 50); } }, [view]);
  const pollRef = useRef({});
  const sentMsgIdRef = useRef({});
  const popoutTakeoverPolls = useRef({});
  const isAtBottom = useRef(true);
  const reasoningCache = useRef({});

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

  useEffect(() => {
    loadAgents();
    if (!isPopout) {
      refreshStatus();
      loadApiKey();
      loadMcpConfig();
      const i = setInterval(refreshStatus, 5000);
      return () => clearInterval(i);
    }
  }, []);

  // Popout mount: fix the active agent to the routed one, bypassing the
  // sidebar flow entirely. If the agent is mid-stream when the popout opens
  // (user popped out during generation), start a takeover poll so the stream
  // continues to render seamlessly in the new window.
  useEffect(() => {
    if (!isPopout || !IPC || !popoutAgentId) return;
    (async () => {
      try {
        const list = await IPC.listAgents();
        const match = (list || []).find(a => a.id === popoutAgentId);
        if (!match) return;
        setActiveAgent(match);
        setActiveModel(match.model || '');
        const fresh = await IPC.getConversation(match.id);
        setAgentMessages(match.id, fresh.map(m => ({ ...m, _counted: true })));
        const streamContent = await IPC.getStreaming(match.id);
        if (streamContent) {
          // Render the in-progress stream immediately, then poll for updates.
          setAgentStreaming(match.id, streamContent);
          const lastSeenId = fresh.length > 0 ? fresh[fresh.length - 1].id : null;
          if (popoutTakeoverPolls.current[match.id]) clearInterval(popoutTakeoverPolls.current[match.id]);
          popoutTakeoverPolls.current[match.id] = setInterval(async () => {
            try {
              const sc = await IPC.getStreaming(match.id);
              if (sc) {
                setAgentStreaming(match.id, sc);
                return;
              }
              // Stream file gone: turn ended. Detect completion via a new last
              // message ID (assistant response or failed_ marker) and finish.
              const msgs = await IPC.getConversation(match.id);
              const newLastId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;
              if (newLastId !== lastSeenId) {
                clearInterval(popoutTakeoverPolls.current[match.id]);
                popoutTakeoverPolls.current[match.id] = null;
                setAgentStreaming(match.id, '');
                const counted = await countAndMarkNewMessages(match.id, msgs);
                setAgentMessages(match.id, counted);
              }
            } catch {}
          }, 100);
        }
      } catch {}
    })();
  }, []);

  // Main-window sync: fetch which agents are already popped out (e.g. after
  // a main-window reload while popouts exist). Popout windows skip this.
  useEffect(() => {
    if (isPopout || !IPC || !IPC.getOpenPopouts) return;
    (async () => {
      try {
        const open = await IPC.getOpenPopouts();
        setPoppedOutAgents(new Set(open || []));
      } catch {}
    })();
  }, []);

  // Every window (main and popout) listens for agent model changes so the
  // displayed "Current active model" stays accurate even if the change was
  // made in a different window. Only update if the changed agent is the one
  // this window is displaying.
  useEffect(() => {
    if (!IPC || !IPC.onAgentModelChanged) return;
    const unsub = IPC.onAgentModelChanged(({ agentId, model }) => {
      if (activeAgent && activeAgent.id === agentId) {
        setActiveModel(model);
      }
    });
    return unsub;
  }, [activeAgent]);

  // Main-window subscriptions: track popout open/close events so the
  // placeholder state stays in sync.
  useEffect(() => {
    if (isPopout || !IPC || !IPC.onPopoutOpened) return;
    const unsubOpen = IPC.onPopoutOpened((agentId) => {
      setPoppedOutAgents(prev => {
        const next = new Set(prev);
        next.add(agentId);
        return next;
      });
    });
    const unsubClose = IPC.onPopoutClosed(async (agentId) => {
      setPoppedOutAgents(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      try {
        const fresh = await IPC.getConversation(agentId);
        const counted = await countAndMarkNewMessages(agentId, fresh);
        setAgentMessages(agentId, counted);
        // If the popout was closed mid-generation, the backend is still
        // writing to streaming/{agentId}.txt. Start a takeover poll so the
        // stream continues to render in the main window, closing the gap
        // that would otherwise appear until the next completion.
        const streamContent = await IPC.getStreaming(agentId);
        if (streamContent) {
          const lastSeenId = fresh.length > 0 ? fresh[fresh.length - 1].id : null;
          if (popoutTakeoverPolls.current[agentId]) clearInterval(popoutTakeoverPolls.current[agentId]);
          popoutTakeoverPolls.current[agentId] = setInterval(async () => {
            try {
              const sc = await IPC.getStreaming(agentId);
              if (sc) {
                setAgentStreaming(agentId, sc);
                return;
              }
              // Stream file gone: the turn ended. Detect whether anything
              // new landed (assistant message or failed_ marker) and, if
              // so, refresh and stop the poll.
              const msgs = await IPC.getConversation(agentId);
              const newLastId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;
              if (newLastId !== lastSeenId) {
                clearInterval(popoutTakeoverPolls.current[agentId]);
                popoutTakeoverPolls.current[agentId] = null;
                setAgentStreaming(agentId, '');
                const counted2 = await countAndMarkNewMessages(agentId, msgs);
                setAgentMessages(agentId, counted2);
              }
            } catch {}
          }, 100);
        }
      } catch {}
    });
    return () => {
      if (unsubOpen) unsubOpen();
      if (unsubClose) unsubClose();
    };
  }, []);
  useEffect(() => {
    if (!isAtBottom.current) return;
    if (messageListRef.current) {
      const el = messageListRef.current;
      setTimeout(() => { if (el) el.scrollTop = el.scrollHeight; }, 0);
    }
  }, [messages, streaming]);

  const loadingMore = useRef(false);
  // Auto-resize the input textarea up to roughly double its default height.
  // Beyond that, the existing scrollbar takes over. Runs on input changes and
  // on agent switch (since input is per-agent).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-scale')) || 1;
    const maxH = 160 * scale;
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [input]);

  const handleMessageScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottom.current = distFromBottom < 30;
    setShowJumpButton(distFromBottom > 30);
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
  const [toolLogModal, setToolLogModal] = useState(null); // null | { loading: true } | { log: {...} }

  const jumpToBottom = useCallback(() => {
    isAtBottom.current = true;
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

  // Poll the backend queue so the badge strip reflects actual task state:
  // entries transition from pending to processing as the backend absorbs and
  // dispatches them. Replaces the local queue state on each tick so file
  // rename (incoming/ -> queue/) is transparent to the UI.
  useEffect(() => {
    if (!IPC || !IPC.getQueue) return;
    const i = setInterval(async () => {
      try {
        const tasks = await IPC.getQueue();
        setQueue(tasks || []);
      } catch {}
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // Subscribe to Chromium's context-menu events forwarded from the main process.
  // Capture the right-click target element before the menu renders so Select All
  // can be bounded to that specific element (input, message, etc.).
  // Receive settings changes from other windows (font scale, theme). The
  // broadcast=false flag prevents this window from re-broadcasting, which
  // would loop. Both main and popout windows run this effect.
  useEffect(() => {
    if (!IPC || !IPC.onAppSettingChanged) return;
    const unsub = IPC.onAppSettingChanged(({ type, value }) => {
      if (type === 'font_scale') applyFontScale(value, false);
      else if (type === 'theme') applyTheme(value, false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!IPC || !IPC.onWindowCloseRequested) return;
    const unsub = IPC.onWindowCloseRequested(() => setShowCloseConfirm(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!showCloseConfirm) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowCloseConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCloseConfirm]);

  useEffect(() => {
    if (!IPC || !IPC.onShowContextMenu) return;
    const unsub = IPC.onShowContextMenu((params) => {
      const el = document.elementFromPoint(params.x, params.y);
      setCtxMenu({ visible: true, x: params.x, y: params.y, params, targetEl: el, adjusted: false });
    });
    return unsub;
  }, []);

  // Dismiss on outside click, Escape, or window blur.
  useEffect(() => {
    if (!ctxMenu.visible) return;
    const dismiss = () => setCtxMenu(c => ({ ...c, visible: false }));
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    const onDown = (e) => {
      if (ctxMenuRef.current && ctxMenuRef.current.contains(e.target)) return;
      dismiss();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', dismiss);
    };
  }, [ctxMenu.visible]);

  // Edge-flip: after the menu first renders, measure it and adjust position if
  // it overflows the viewport.
  useEffect(() => {
    if (!ctxMenu.visible || ctxMenu.adjusted) return;
    const el = ctxMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = ctxMenu.x, y = ctxMenu.y;
    if (x + rect.width > window.innerWidth) x = Math.max(8, window.innerWidth - rect.width - 8);
    if (y + rect.height > window.innerHeight) y = Math.max(8, window.innerHeight - rect.height - 8);
    setCtxMenu(c => ({ ...c, x, y, adjusted: true }));
  }, [ctxMenu.visible, ctxMenu.adjusted, ctxMenu.x, ctxMenu.y]);

  // Bounded Select All: selects the current input's contents, or the contents
  // of a single message bubble. Nothing else.
  const ctxSelectAll = useCallback(() => {
    const el = ctxMenu.targetEl;
    if (!el || !el.closest) return;
    const textarea = el.closest('textarea');
    if (textarea) {
      textarea.focus();
      textarea.select();
      return;
    }
    const bubble = el.closest('.message');
    if (bubble) {
      const range = document.createRange();
      range.selectNodeContents(bubble);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [ctxMenu.targetEl]);

  const ctxHasSelectAllTarget = !!(ctxMenu.targetEl && ctxMenu.targetEl.closest &&
    (ctxMenu.targetEl.closest('textarea') || ctxMenu.targetEl.closest('.message')));
  // When a placeholder (popped-out conversation) is replaced by the actual
  // panel, the message list remounts with scrollTop 0. Include this derived
  // flag in the deps so the effect fires at that transition and restores
  // the bottom-anchored scroll.
  useEffect(() => {
    if (view === 'chat' && messageListRef.current) setTimeout(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight; }, 50);
  }, [view, activeAgent, activeAgent && poppedOutAgents.has(activeAgent.id) && !isPopout]);

  useEffect(() => {
    if (!IPC || !IPC.onTokenCountProgress) return;
    const unsub = IPC.onTokenCountProgress(({ agentId, stage, processed, total }) => {
      if (activeAgent?.id === agentId) setTokenProgress({ stage, processed, total });
    });
    return unsub;
  }, [activeAgent]);

  // Track the currently-active agent ID in a ref so async token count
  // completions can check against the live value rather than a stale closure.
  useEffect(() => { activeAgentRef.current = activeAgent; }, [activeAgent]);

  useEffect(() => {
    if (!activeAgent || !IPC) { setTokenCount(null); setTokenBreakdown(null); setTokenProgress(null); return; }
    const id = activeAgent.id;
    // Skip full recount if this agent has already been counted this session.
    // The cached value iterates incrementally from there.
    if (countedAgentsRef.current.has(id)) {
      const ctx = cachedContextTokens.current[id] || 0;
      const idc = cachedIdentityTokens.current[id] || 0;
      const mfc = cachedManifestTokens.current[id] || 0;
      const trc = cachedToolRecordTokens.current[id] || 0;
      setTokenCount(ctx + idc + mfc + trc);
      setTokenBreakdown({ contextCount: ctx, identityCount: idc, manifestCount: mfc, toolRecordCount: trc, promptCount: 0 });
      setTokenProgress(null);
      return;
    }
    // A count for this agent is already in flight (user switched away and
    // back). Do not restart it; let the original promise finish and update
    // the caches. Progress events will resume on the next tick.
    if (countingAgentsRef.current.has(id)) {
      setTokenCount(null);
      setTokenBreakdown(null);
      return;
    }
    countingAgentsRef.current.add(id);
    setTokenProgress(null);
    IPC.countTokens(id, '').then(r => {
      countingAgentsRef.current.delete(id);
      if (!r) return;
      cachedContextTokens.current[id]     = r.breakdown?.contextCount    ?? 0;
      cachedIdentityTokens.current[id]    = r.breakdown?.identityCount   ?? 0;
      cachedManifestTokens.current[id]    = r.breakdown?.manifestCount   ?? 0;
      cachedToolRecordTokens.current[id]  = r.breakdown?.toolRecordCount ?? 0;
      countedAgentsRef.current.add(id);
      // Only touch the displayed values if the user is still on this agent.
      // Otherwise just populate the cache; the display refreshes from cache
      // the next time this agent is selected.
      if (activeAgentRef.current?.id === id) {
        setTokenCount(cachedContextTokens.current[id] + cachedIdentityTokens.current[id] + cachedManifestTokens.current[id] + cachedToolRecordTokens.current[id]);
        setTokenBreakdown(r.breakdown ?? null);
        setTokenProgress(null);
      }
    });
  }, [activeAgent]);

  useEffect(() => {
    if (!activeAgent || !IPC) return;
    if (tokenDebounceRef.current) clearTimeout(tokenDebounceRef.current);
    tokenDebounceRef.current = setTimeout(async () => {
      const id = activeAgent.id;
      // Only count the current input — add to cached context total
      const promptCount = input.trim()
        ? ((await IPC.countMessageTokens('user', input))?.count ?? 0)
        : 0;
      const ctx = cachedContextTokens.current[id] || 0;
      const idc = cachedIdentityTokens.current[id] || 0;
      const mfc = cachedManifestTokens.current[id] || 0;
      const trc = cachedToolRecordTokens.current[id] || 0;
      const total = ctx + idc + mfc + trc + promptCount;
      setTokenCount(total);
      setTokenBreakdown(bd => bd ? { ...bd, promptCount, contextCount: ctx, manifestCount: mfc, toolRecordCount: trc } : null);
    }, 300);
    return () => { if (tokenDebounceRef.current) clearTimeout(tokenDebounceRef.current); };
  }, [input, activeAgent, tokenCacheVersion]);

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

  // Lightweight manifest-only token refresh. Called after MCP config changes so
  // the estimator reflects the new manifest size without re-counting the entire
  // conversation. Full context counts are unaffected and stay cached.
  const refreshManifestTokens = useCallback(async (agentId) => {
    if (!IPC || !IPC.getManifestTokens) return;
    const r = await IPC.getManifestTokens(agentId);
    const next = r?.count ?? 0;
    if ((cachedManifestTokens.current[agentId] || 0) === next) return;
    cachedManifestTokens.current[agentId] = next;
    bumpTokenCache();
  }, []);

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
    // Global MCP change may shift the manifest variant for any agent. Refresh the
    // active agent's manifest count now; other agents get refreshed when visited.
    if (activeAgent) refreshManifestTokens(activeAgent.id);
    setShowMcpModal(false);
  };
  const selectAgent = async (a) => {
    setActiveAgent(a);
    setActiveModel(a.model || '');
    setShowCount(40);
    if (IPC) {
      // Load from disk only if not cached. Cached state may be fresher (mid-stream).
      if (!messagesByAgent[a.id]) {
        const fresh = await IPC.getConversation(a.id);
        countedMessageIds.current[a.id] = new Set(fresh.map(m => m.id));
        setAgentMessages(a.id, fresh.map(m => ({ ...m, _counted: true })));
      }
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
    try { setTinlogEntries(await IPC.getRecentLog() || []); } catch {}
    // Queue is event-driven now — managed by handleSend, poll completion, and markFailed
  };

  const handleAddAttachment = async () => {
    if (!IPC || !activeAgent || activeAgent.id === EPHEMERA_ID) return;
    const files = await IPC.selectAttachmentFiles();
    if (!files || files.length === 0) return;
    setActiveAttachments(prev => [...prev, ...files]);
  };

  const handleRemoveAttachment = (idx) => {
    setActiveAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  // Trigger an automatic agent response to a system note (tombstone or
  // restore note). Writes a blank user message via the standard send path
  // so the manifest appends to it, then runs a poll loop watching for the
  // reply. Same shape as the glimpse poll; the blank message is invisible
  // to the agent because providers concatenate consecutive user turns.
  const triggerAgentResponse = useCallback(async (agentId) => {
    if (!IPC) return;
    const resp = await IPC.sendMessage(agentId, '');
    if (!resp || !resp.queued) return;
    const baseConvo = await IPC.getConversation(agentId);
    const baseAssistantCount = baseConvo.filter(m => m.role === 'assistant').length;
    if (pollRef.current[agentId]) clearInterval(pollRef.current[agentId]);
    let streamEndedAt = null;
    pollRef.current[agentId] = setInterval(async () => {
      try {
        const streamContent = await IPC.getStreaming(agentId);
        if (streamContent) {
          setAgentStreaming(agentId, streamContent);
          streamEndedAt = null;
        } else if (streamEndedAt === null) {
          streamEndedAt = Date.now();
        }
        if (streamEndedAt && Date.now() - streamEndedAt > 800) {
          const msgs = await IPC.getConversation(agentId);
          const hasNew = msgs.filter(m => m.role === 'assistant').length > baseAssistantCount;
          if (hasNew) {
            clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
            setAgentStreaming(agentId, '');
            const counted = await countAndMarkNewMessages(agentId, msgs);
            setAgentMessages(agentId, counted);
          } else if (Date.now() - streamEndedAt > 120000) {
            clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
            setAgentStreaming(agentId, '');
          }
        }
      } catch {}
    }, 300);
  }, []);

  const recountAgentTokens = useCallback(async (agentId) => {
    if (!IPC) return;
    const r = await IPC.countTokens(agentId, '');
    if (!r) return;
    cachedContextTokens.current[agentId]  = r.breakdown?.contextCount  ?? 0;
    cachedIdentityTokens.current[agentId] = r.breakdown?.identityCount ?? 0;
    cachedManifestTokens.current[agentId] = r.breakdown?.manifestCount ?? 0;
    countedAgentsRef.current.add(agentId);
    if (activeAgent?.id === agentId) {
      setTokenCount(cachedContextTokens.current[agentId] + cachedIdentityTokens.current[agentId] + cachedManifestTokens.current[agentId]);
      setTokenBreakdown(r.breakdown ?? null);
    }
  }, [activeAgent]);

  const openToolRecordModal = useCallback(async () => {
    if (!IPC || !settingsTarget) return;
    const agentId = settingsTarget.id;
    const agentName = settingsTarget.name;
    setToolRecordModal({ agentId, agentName, loading: true, stats: null, progress: null });
    const stats = await IPC.getToolRecordStats(agentId);
    setToolRecordModal(prev => prev && prev.agentId === agentId ? { ...prev, loading: false, stats, progress: null } : prev);
  }, [settingsTarget]);

  // Progress events for the tool-record stats tokenization. Filtered by
  // agentId so a stale event from a previous modal-open doesn't update the
  // current one.
  useEffect(() => {
    if (!IPC || !IPC.onToolRecordProgress) return;
    const unsub = IPC.onToolRecordProgress(({ agentId, processed, total }) => {
      setToolRecordModal(prev => prev && prev.agentId === agentId
        ? { ...prev, progress: { processed, total } }
        : prev);
    });
    return unsub;
  }, []);

  // Purge and restore use delta updates on the stats modal and the token
  // cache. The stats were computed when the modal opened, and no tool
  // records can be created while the settings modal is blocking the chat,
  // so the deltas are exact. This avoids a full re-tokenization.
  const handlePurgeRecords = useCallback(async () => {
    if (!IPC || !toolRecordModal || !toolRecordModal.stats) return;
    const { agentId, stats } = toolRecordModal;
    const r = await IPC.purgeToolRecords(agentId, stats.active);
    if (r && r.ok) {
      const nextStats = {
        active: { messages: 0, calls: 0, tokens: 0 },
        culled: {
          messages: stats.active.messages + stats.culled.messages,
          calls:    stats.active.calls    + stats.culled.calls,
          tokens:   stats.active.tokens   + stats.culled.tokens,
        },
      };
      setToolRecordModal(prev => prev ? { ...prev, stats: nextStats } : prev);
      // Tool records just left the payload — adjust the dedicated cache slot
      cachedToolRecordTokens.current[agentId] = Math.max(0, (cachedToolRecordTokens.current[agentId] || 0) - stats.active.tokens);
      countedAgentsRef.current.add(agentId);
      bumpTokenCache();
      if (activeId === agentId) {
        const ctx = cachedContextTokens.current[agentId] || 0;
        const idc = cachedIdentityTokens.current[agentId] || 0;
        const mfc = cachedManifestTokens.current[agentId] || 0;
        const trc = cachedToolRecordTokens.current[agentId] || 0;
        setTokenCount(ctx + idc + mfc + trc);
        setTokenBreakdown(bd => bd ? { ...bd, toolRecordCount: trc } : null);
      }
      // The backend just wrote a tombstone note to context.jsonl. Refresh
      // the conversation so it appears immediately, then trigger a
      // response so the agent acknowledges the state change and control
      // returns to the user with the agent's reaction in hand.
      const fresh = await IPC.getConversation(agentId);
      const counted = await countAndMarkNewMessages(agentId, fresh);
      setAgentMessages(agentId, counted);
      await triggerAgentResponse(agentId);
    }
    setShowPurgeConfirm(false);
  }, [toolRecordModal, activeId]);

  const handleRestoreRecords = useCallback(async () => {
    if (!IPC || !toolRecordModal || !toolRecordModal.stats) return;
    const { agentId, stats } = toolRecordModal;
    const r = await IPC.restoreToolRecords(agentId, stats.culled);
    if (r && r.ok) {
      const nextStats = {
        active: {
          messages: stats.active.messages + stats.culled.messages,
          calls:    stats.active.calls    + stats.culled.calls,
          tokens:   stats.active.tokens   + stats.culled.tokens,
        },
        culled: { messages: 0, calls: 0, tokens: 0 },
      };
      setToolRecordModal(prev => prev ? { ...prev, stats: nextStats } : prev);
      cachedToolRecordTokens.current[agentId] = (cachedToolRecordTokens.current[agentId] || 0) + stats.culled.tokens;
      countedAgentsRef.current.add(agentId);
      bumpTokenCache();
      if (activeId === agentId) {
        const ctx = cachedContextTokens.current[agentId] || 0;
        const idc = cachedIdentityTokens.current[agentId] || 0;
        const mfc = cachedManifestTokens.current[agentId] || 0;
        const trc = cachedToolRecordTokens.current[agentId] || 0;
        setTokenCount(ctx + idc + mfc + trc);
        setTokenBreakdown(bd => bd ? { ...bd, toolRecordCount: trc } : null);
      }
      // Refresh so the restore note appears immediately, then trigger a
      // response acknowledging the restore.
      const fresh = await IPC.getConversation(agentId);
      const counted = await countAndMarkNewMessages(agentId, fresh);
      setAgentMessages(agentId, counted);
      await triggerAgentResponse(agentId);
    }
  }, [toolRecordModal, activeId, triggerAgentResponse]);

  const openAttachmentPreview = useCallback(async (title, loadParams, kind) => {
    if (!IPC) return;
    setAttachmentExpanded(false);
    if (kind === 'image') {
      if (!IPC.readAttachmentImage) return;
      setAttachmentPreview({ title, loadParams, kind: 'image', content: '', imageDataUrl: '', nextOffset: 0, totalLines: 0, hasMore: false, loading: true });
      const r = await IPC.readAttachmentImage(loadParams);
      if (r?.error) {
        setAttachmentPreview({ title, loadParams, kind: 'image', content: 'Error: ' + r.error, imageDataUrl: '', nextOffset: 0, totalLines: 0, hasMore: false, loading: false });
        return;
      }
      setAttachmentPreview({ title, loadParams, kind: 'image', content: '', imageDataUrl: r.dataUrl, nextOffset: 0, totalLines: 0, hasMore: false, loading: false });
      return;
    }
    if (!IPC.readAttachmentPreview) return;
    setAttachmentPreview({ title, loadParams, kind: 'text', content: '', imageDataUrl: '', nextOffset: 0, totalLines: 0, hasMore: false, loading: true });
    const r = await IPC.readAttachmentPreview({ ...loadParams, offset: 0, limit: 500 });
    if (r?.error) {
      setAttachmentPreview({ title, loadParams, kind: 'text', content: 'Error: ' + r.error, imageDataUrl: '', nextOffset: 0, totalLines: 0, hasMore: false, loading: false });
      return;
    }
    setAttachmentPreview({
      title, loadParams, kind: 'text',
      content: r.content,
      imageDataUrl: '',
      nextOffset: r.lineCount,
      totalLines: r.totalLines,
      hasMore: r.hasMore,
      loading: false
    });
  }, []);

  const expandAttachment = useCallback(async () => {
    if (IPC && IPC.windowSetFullscreen) {
      const r = await IPC.windowSetFullscreen(true);
      preExpansionFullscreenRef.current = !!(r && r.wasFullscreen);
    }
    setAttachmentExpanded(true);
  }, []);

  const collapseAttachment = useCallback(async () => {
    if (IPC && IPC.windowSetFullscreen) {
      await IPC.windowSetFullscreen(preExpansionFullscreenRef.current);
    }
    setAttachmentExpanded(false);
  }, []);

  const loadMorePreview = useCallback(async () => {
    if (!attachmentPreview || attachmentPreview.loading || !attachmentPreview.hasMore) return;
    const cur = attachmentPreview;
    setAttachmentPreview(p => ({ ...p, loading: true }));
    const r = await IPC.readAttachmentPreview({ ...cur.loadParams, offset: cur.nextOffset, limit: 500 });
    if (r?.error) {
      setAttachmentPreview(p => ({ ...p, loading: false, content: p.content + '\n\n[Error: ' + r.error + ']', hasMore: false }));
      return;
    }
    setAttachmentPreview(p => ({
      ...p,
      content: p.content + (p.content.endsWith('\n') ? '' : '\n') + r.content,
      nextOffset: p.nextOffset + r.lineCount,
      hasMore: r.hasMore,
      loading: false
    }));
  }, [attachmentPreview]);

  const handleSend = async (glimpse) => {
    const hasAttachments = activeId ? (attachmentsByAgent[activeId] || []).length > 0 : false;
    if ((!input.trim() && !hasAttachments) || !activeAgent || !IPC) return;
    isAtBottom.current = true;
    const agentId = activeAgent.id;
    const agentName = activeAgent.name;
    const content = input;
    const outgoingAttachments = activeId ? (attachmentsByAgent[activeId] || []) : [];
    setInput('');
    if (outgoingAttachments.length > 0 && activeId) setActiveAttachments([]);
    // Cull any stillpoint messages from display state before new send
    setAgentMessages(agentId, prev => prev.filter(m => !m.stillpoint));
    // Ephemera: clear previous exchange, send bare prompt, save exchange
    if (activeAgent.id === EPHEMERA_ID) {
      const tempId = `temp_${Date.now()}`;
      const ts = localTimestamp();
      const userMsg = { id: tempId, role: 'user', content, timestamp: ts };
      setAgentMessages(EPHEMERA_ID, [userMsg]);
      const resp = await IPC.sendMessage(EPHEMERA_ID, content);
      if (resp.queued) {
        if (pollRef.current[EPHEMERA_ID]) clearInterval(pollRef.current[EPHEMERA_ID]);
        let streamEndedAt = null;
        pollRef.current[EPHEMERA_ID] = setInterval(async () => {
          try {
            const streamContent = await IPC.getStreaming(EPHEMERA_ID);
            if (streamContent) { setAgentStreaming(EPHEMERA_ID, streamContent); streamEndedAt = null; }
            else if (streamEndedAt === null) { streamEndedAt = Date.now(); }
            if (streamEndedAt && Date.now() - streamEndedAt > 800) {
              const msgs = await IPC.getConversation(EPHEMERA_ID);
              const hasResponse = msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant';
              if (hasResponse) {
                clearInterval(pollRef.current[EPHEMERA_ID]); pollRef.current[EPHEMERA_ID] = null; setAgentStreaming(EPHEMERA_ID, '');
                setAgentMessages(EPHEMERA_ID, msgs);
              } else if (Date.now() - streamEndedAt > 15000) {
                // 15s hard timeout
                clearInterval(pollRef.current[EPHEMERA_ID]); pollRef.current[EPHEMERA_ID] = null; setAgentStreaming(EPHEMERA_ID, '');
                setAgentMessages(EPHEMERA_ID, msgs.length ? msgs : [userMsg]);
              }
            }
          } catch {}
        }, 300);
      }
      return;
    }
    if (glimpse) {
      const ts = localTimestamp();
      const glimpseUserMsg = { id: `glimpse_user_${Date.now()}`, role: 'user', content, glimpse: true, timestamp: ts };
      setAgentMessages(agentId, prev => [...prev.filter(m => !m.stillpoint), glimpseUserMsg]);
      const resp = await IPC.glimpseMessage(agentId, content);
      if (!resp.queued) {
        alert('Glimpse failed: ' + (resp.error || 'unknown error'));
        return;
      }
      sentMsgIdRef.current[agentId] = glimpseUserMsg.id;
      if (pollRef.current[agentId]) clearInterval(pollRef.current[agentId]);
      let streamEndedAt = null;
      pollRef.current[agentId] = setInterval(async () => {
        try {
          const streamContent = await IPC.getStreaming(agentId);
          if (streamContent) { setAgentStreaming(agentId, streamContent); streamEndedAt = null; }
          else if (streamEndedAt === null) { streamEndedAt = Date.now(); }
          if (streamEndedAt && Date.now() - streamEndedAt > 800) {
            const msgs = await IPC.getConversation(agentId);
            const hasResponse = msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant';
            if (hasResponse) {
              clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null; setAgentStreaming(agentId, '');
              const counted = await countAndMarkNewMessages(agentId, msgs);
              setAgentMessages(agentId, counted);
            } else if (Date.now() - streamEndedAt > 15000) {
              clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null; setAgentStreaming(agentId, '');
            }
          }
          // Backend-detected failures now appear as failed_ markers in the
          // conversation. Presence of that marker is the completion signal for
          // a failed glimpse.
          const _gSentId = sentMsgIdRef.current[agentId];
          if (_gSentId) {
            const _gMsgs = await IPC.getConversation(agentId);
            if (_gMsgs.find(m => m.id === `failed_${_gSentId}`)) {
              clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null; setAgentStreaming(agentId, '');
              setAgentMessages(agentId, _gMsgs);
            }
          }
        } catch (e) {
          clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null; setAgentStreaming(agentId, '');
        }
      }, 300);
      return;
    } else {
      const tempId = `temp_${Date.now()}`;
      const ts = localTimestamp();
      // Mirror the on-disk attachment metadata shape for the instant-displayed
      // message so the chips render before the API resolves. The filenames are
      // placeholder-only — the real timestamped names arrive when the message
      // is reloaded from context.jsonl after send.
      const displayedAttachments = outgoingAttachments.length > 0
        ? outgoingAttachments.map(a => ({
            filename: a.name,
            original_name: a.name,
            size: a.size,
            type: a.type,
            thumbDataUrl: a.thumbDataUrl
          }))
        : null;
      const tempMsg = { id: tempId, role: 'user', content, timestamp: ts, stillpoint: stillpointEnabled };
      if (displayedAttachments) tempMsg.attachments = displayedAttachments;
      setAgentMessages(agentId, prev => [...prev, tempMsg]);
      const resp = await IPC.sendMessage(agentId, content, outgoingAttachments.length > 0 ? outgoingAttachments : undefined);
      if (resp.queued) {
        // Add task to queue state immediately — uses real taskId from backend for cancel/flush
        const taskEntry = { file: resp.taskId, agentId, agentName };
        setQueue(prev => [...prev, taskEntry]);
        if (pollRef.current[agentId]) clearInterval(pollRef.current[agentId]);
        // Update context token cache with the user message immediately
        if (IPC.countMessageTokens) {
          IPC.countMessageTokens('user', content).then(r => {
            if (r?.count) cachedContextTokens.current[agentId] = (cachedContextTokens.current[agentId] || 0) + r.count;
            if (resp.msgId) {
              if (!countedMessageIds.current[agentId]) countedMessageIds.current[agentId] = new Set();
              countedMessageIds.current[agentId].add(resp.msgId);
            }
            bumpTokenCache();
          });
        }
        let streamActive = false;
        let streamEndedAt = null;
        let pollRunning = false;
        const isStillpoint = stillpointEnabled;
        const baseConvo = await IPC.getConversation(agentId);
        const baseAssistantCount = baseConvo.filter(m => m.role === 'assistant').length;
        const sentMsgId = resp.msgId;
        sentMsgIdRef.current[agentId] = sentMsgId;
        const sendTime = Date.now();
        const markFailed = async (source, diagnostic = {}) => {
          clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null; setAgentStreaming(agentId, '');
          setQueue(q => q.filter(t => t.agentId !== agentId));
          if (sentMsgId) {
            await IPC.markMessageFailed(agentId, sentMsgId, source || 'unknown', diagnostic);
            setAgentMessages(agentId, await IPC.getConversation(agentId));
          }
          // Keep a slow recovery poll running — backend task may still complete
          // (e.g. after approval timeout). When it does, refresh the conversation.
          // Recovery poll: a task that appeared to fail might still complete
          // on the backend (e.g. approval eventually granted). Watch the
          // conversation for a new assistant message and refresh if one arrives.
          const recoveryPoll = setInterval(async () => {
            const msgs = await IPC.getConversation(agentId);
            const hasNew = msgs.filter(m => m.role === 'assistant').length > baseAssistantCount;
            if (hasNew) {
              clearInterval(recoveryPoll);
              setAgentMessages(agentId, msgs);
              setAgentStreaming(agentId, '');
            }
          }, 1000);
          // Stop recovery poll after 5 minutes regardless
          setTimeout(() => clearInterval(recoveryPoll), 300000);
        };
        pollRef.current[agentId] = setInterval(async () => {
          if (pollRunning) return;
          pollRunning = true;
          try {
            // Check backend task status — catches rate limits, bad keys, etc. within ~6s
            // Backend-detected failures appear as failed_ markers in the
            // conversation; the frontend no longer polls task status. This
            // check only runs before any streaming has begun, so it has a
            // narrow window and one conversation read per tick.
            if (Date.now() - sendTime > 5000 && !streamActive && sentMsgId) {
              const _failMsgs = await IPC.getConversation(agentId);
              if (_failMsgs.find(m => m.id === `failed_${sentMsgId}`)) {
                clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
                setAgentStreaming(agentId, '');
                setQueue(q => q.filter(t => t.agentId !== agentId));
                setAgentMessages(agentId, _failMsgs);
                return;
              }
            }
            // Hard timeout — suspended while reasoning is streaming or approval is pending
            const isReasoning = streaming && streaming.startsWith('<<<REASONING>>>');
            if (Date.now() - sendTime > 240000 && !pendingApproval && !isReasoning) {
              // One final check — approval may have appeared between poll intervals
              const finalApprovalCheck = await IPC.getPendingApproval(agentId);
              if (!finalApprovalCheck) {
                await markFailed('240s hard timeout', {
                  elapsed_ms: Date.now() - sendTime,
                  pendingApproval,
                  isReasoning,
                  finalApprovalCheck,
                });
                return;
              }
              setPendingApproval(finalApprovalCheck);
            }
            const streamContent = await IPC.getStreaming(agentId);
            if (streamContent) {
              setAgentStreaming(agentId, streamContent);
              streamActive = true;
              streamEndedAt = null;
            } else if (streamActive) {
              if (!streamEndedAt) streamEndedAt = Date.now();
              const currentEndedAt = streamEndedAt;
              const msgs = await IPC.getConversation(agentId);
              // Mid-stream cancellation writes a failed_ marker on the user
              // message (via the backend cancel path). Detect it here and end
              // the poll, same as the pre-streaming failure branch does.
              if (sentMsgId && msgs.find(m => m.id === `failed_${sentMsgId}`)) {
                clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
                setAgentStreaming(agentId, '');
                setQueue(q => q.filter(t => t.agentId !== agentId));
                setAgentMessages(agentId, msgs);
                return;
              }
              const hasNewAssistant = msgs.filter(m => m.role === 'assistant').length > baseAssistantCount;
              if (hasNewAssistant) {
                clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
                setQueue(q => q.filter(t => t.agentId !== agentId));
                const counted = await countAndMarkNewMessages(agentId, msgs);
                setAgentMessages(agentId, counted);
                setAgentStreaming(agentId, '');
              } else if (Date.now() - currentEndedAt > 120000 && !pendingApproval && !isReasoning) {
                await markFailed('120s post-stream timeout', {
                  streamEndedAt_raw: currentEndedAt,
                  streamEndedAt_type: typeof currentEndedAt,
                  now_ms: Date.now(),
                  elapsed_since_stream_end_ms: Date.now() - currentEndedAt,
                  pendingApproval,
                  isReasoning,
                });
              }
            } else {
              const msgs = await IPC.getConversation(agentId);
              if (msgs.length && msgs[msgs.length-1].role === 'assistant' &&
                  msgs.filter(m => m.role === 'assistant').length > baseAssistantCount) {
                setAgentMessages(agentId, msgs);
                clearInterval(pollRef.current[agentId]); pollRef.current[agentId] = null;
                setQueue(q => q.filter(t => t.agentId !== agentId));
              }
            }
          } catch {} finally { pollRunning = false; }
        }, 100);
      } else {
        setAgentMessages(agentId, await IPC.getConversation(agentId));
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
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const hasAtt = activeId ? (attachmentsByAgent[activeId] || []).length > 0 : false; if (activeAgent && !pollRef.current[activeAgent.id] && (input.trim() || hasAtt)) handleSend(false); } };
  const copyMessage = (msg) => {
    const content = (msg.content || '').replace(/^\[[^\]]+completed\]\n?/, '');
    navigator.clipboard.writeText(content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const deleteMessage = async (mid) => {
    if (!activeAgent || !IPC) return;
    const id = activeAgent.id;
    const msg = messages.find(m => m.id === mid);
    await IPC.deleteMessage(id, mid);
    if (countedMessageIds.current[id]) countedMessageIds.current[id].delete(mid);
    if (msg && IPC.countMessageTokens) {
      IPC.countMessageTokens(msg.role, msg.content || '').then(r => {
        if (r?.count) cachedContextTokens.current[id] = Math.max(0, (cachedContextTokens.current[id] || 0) - r.count);
        bumpTokenCache();
      });
    }
    setMessages(await IPC.getConversation(activeAgent.id));
  };
  const resendMessage = async (msg) => {
    if (!activeAgent || !IPC) return;
    const content = msg.content;
    await IPC.deleteMessage(activeAgent.id, msg.id);
    setInput(content);
    // Brief delay so state settles, then send
    setTimeout(() => handleSend(false), 50);
  };

  const fetchModelsForModal = async () => {
    if (!IPC) return;
    const raw = await IPC.getAvailableModels();
    const lc = await IPC.getLocalConfig();
    const localResult = await IPC.fetchLocalModels(lc.base_url || 'http://localhost:11434');
    const local = localResult.ok ? localResult.models : [];
    setLocalModels(local);
    // Separate the reasoning map sentinel from the actual provider groups
    const mapEntry = (raw || []).find(r => r.__orReasoningMap);
    const map = mapEntry ? mapEntry.__orReasoningMap : {};
    setOrReasoningMap(map);
    setAvailableModels((raw || []).filter(r => !r.__orReasoningMap));
  };

  const openSettings = async (a) => {
    setSettingsTarget(a);
    setSettingsName(a.name);
    setSettingsRoom(a.room);
    setSettingsModel(a.model || 'deepseek/deepseek-v4-flash');
    // Apply cached reasoning immediately — no pop-in on re-open
    const modelId = a.model || '';
    if (reasoningCache.current[modelId] !== undefined) {
      setSettingsReasoning(reasoningCache.current[modelId]);
    }
    if (IPC) {
      const r = await IPC.getAgentIdentity(a.id);
      if (r) setIdentityText(r.content || '');
      const n = await IPC.getAgentNametags(a.id);
      setNametagsEnabled(n?.enabled || false);
      const sp = await IPC.getAgentStillpoint(a.id);
      setStillpointEnabled(sp?.stillpoint || false);
      const t = await IPC.getAgentTemperature(a.id);
      setSettingsTemp(t?.temperature ?? 0.7);
      const raw = await IPC.getAvailableModels();
      const mapEntry = (raw || []).find(r => r.__orReasoningMap);
      const map = mapEntry ? mapEntry.__orReasoningMap : {};
      setOrReasoningMap(map);
      setAvailableModels((raw || []).filter(r => !r.__orReasoningMap));
      // Resolve reasoning capability for the current model
      const reasoning = await IPC.getModelReasoning(a.model || '', map);
      reasoningCache.current[a.model || ''] = reasoning;
      setSettingsReasoning(reasoning);
      // Seed settingsTarget with fresh reasoning and MCP state from meta (sidebar 'a' may be stale)
      const savedReasoning = await IPC.getAgentReasoning(a.id);
      const mcpState = await IPC.getAgentMcp(a.id);
      setSettingsTarget(prev => prev ? { ...prev, reasoning: savedReasoning, mcp_enabled: mcpState?.enabled ?? false } : prev);
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
      {!splashDone && !isPopout && (
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
          {!isPopout && (
            <>
              <img src={logoSvg} alt="Lucid" style={{height:'32px',width:'auto',marginRight:'-2px',flexShrink:0}} /><img src={textLogoSvg} alt="Lucid" style={{height:'42px',width:'auto',flexShrink:0,paddingTop:'6px'}} />
              <span className="subtitle">{appVersion ? `v${appVersion} — ${backendStatus}` : backendStatus}</span>
            </>
          )}
          <div className="header-wincontrols" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Minimize" position="bottom"><button className="wc-min" onClick={()=>IPC.windowMinimize()}>&#8722;</button></Tooltip>
            <Tooltip text="Maximize" position="bottom"><button className="wc-max" onClick={()=>IPC.windowMaximize()}>&#9633;</button></Tooltip>
            <Tooltip text="Close" position="bottom"><button className="wc-close" onClick={()=>IPC.windowClose()}>&#10005;</button></Tooltip>
          </div>
        </div>
        {!isPopout && <div className="header-bottom">
          <div className="queue-status" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Sequential processing queue — click an agent's name to cancel their action, Flush to cancel all" position="bottom"><span className="queue-label">Queue:</span></Tooltip>
            {queue.length === 0
              ? <span className="queue-empty">Nothing in queue</span>
              : (() => {
                  const pendingTasks = queue.filter(t => t.status !== 'processing');
                  const processingTasks = queue.filter(t => t.status === 'processing');
                  return (<>
                    {pendingTasks.length > 0 && (
                      <>
                        <span className="queue-section-label">Pending:</span>
                        {pendingTasks.map(t => (
                          <button key={t.file} className="queue-badge" onClick={() => { IPC.cancelTask(t.file); setQueue(q => q.filter(x => x.file !== t.file)); }} title="Click to cancel">
                            {t.agentName} ×
                          </button>
                        ))}
                      </>
                    )}
                    {processingTasks.length > 0 && (
                      <>
                        <span className="queue-section-label">Processing:</span>
                        {processingTasks.map(t => (
                          <button key={t.file} className="queue-badge queue-badge-processing" onClick={() => { IPC.cancelTask(t.file); setQueue(q => q.filter(x => x.file !== t.file)); }} title="Click to cancel">
                            {t.agentName} ×
                          </button>
                        ))}
                      </>
                    )}
                    <button className="queue-flush" onClick={() => {
                      const entries = [...queue];
                      for (const t of entries) IPC.cancelTask(t.file);
                      setQueue([]);
                    }}>Flush All</button>
                  </>);
                })()
            }
          </div>
          {!isPopout && <nav className="top-nav" style={{WebkitAppRegion:'no-drag'}}>
            <Tooltip text="Agent Conversations" position="bottom"><button className={view==='chat'?'active':''} onClick={()=>setView('chat')}>Chat</button></Tooltip>
            <Tooltip text="System Status" position="bottom"><button className={view==='status'?'active':''} onClick={()=>setView('status')}>Status</button></Tooltip>
            <Tooltip text="Application Settings" position="bottom"><button className={view==='settings'?'active':''} onClick={()=>setView('settings')}>Settings</button></Tooltip>
          </nav>}
        </div>}
      </header>
      <div className="main-layout">
        {view === 'chat' && (<>
          {!isPopout && <aside className="agent-sidebar">
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
                    <Tooltip text="Ephemera settings" position="bottom"><button className="agent-settings-btn" onClick={async e=>{e.stopPropagation(); fetchModelsForModal(); if(ephemeraModel&&reasoningCache.current[ephemeraModel]!==undefined){setEphemeraReasoning(reasoningCache.current[ephemeraModel]);}setShowEphemeraModal(true); if(IPC){const ep=await IPC.getEphemera();const raw=await IPC.getAvailableModels();const mapEntry=(raw||[]).find(r=>r.__orReasoningMap);const map=mapEntry?mapEntry.__orReasoningMap:{};setOrReasoningMap(map);setAvailableModels((raw||[]).filter(r=>!r.__orReasoningMap));const modelId=ep.model||'';const rsn=await IPC.getModelReasoning(modelId,map);reasoningCache.current[modelId]=rsn;setEphemeraReasoning(rsn);}}}>⚙</button></Tooltip>
                  </div>
                </div>
              ) : (
              <div key={a.id} className={`agent-item ${activeAgent?.id===a.id?'active':''}`} onClick={()=>selectAgent(a)}>
                <div className="agent-info">
                  <span className="agent-name">{queue.some(t => t.agentId === a.id && t.status === 'processing') && <span className="agent-pulse" />}{a.name}</span>
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
          </aside>}
          <section className="chat-panel">
          {!activeAgent ? <div className="placeholder">Select an agent to begin.</div> : poppedOutAgents.has(activeAgent.id) && !isPopout ? (
            <div className="popout-placeholder">
              <div className="popout-placeholder-title">{activeAgent.name} is open in a separate window</div>
              <div className="popout-placeholder-sub">The conversation is running there. You can re-attach it here at any time.</div>
              <button className="popout-placeholder-btn" onClick={() => { if (IPC && IPC.closePopout) IPC.closePopout(activeAgent.id); }}>Re-attach conversation</button>
            </div>
          ) : (<>
          <div className="chat-header">
          <span className="chat-header-left">
            <span style={{fontSize:'17px'}}>{activeAgent.name}{activeAgent.room ? ` — ${activeAgent.room}` : ''}</span>
            {!isPopout && activeAgent.id !== EPHEMERA_ID && !poppedOutAgents.has(activeAgent.id) && (
              <Tooltip text="Open in new window" position="bottom">
                <button className="popout-trigger" onClick={() => { if (IPC && IPC.openPopout) IPC.openPopout(activeAgent.id, activeAgent.name, activeAgent.room); }} aria-label="Pop out conversation">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6" />
                    <path d="M10 14L21 3" />
                    <path d="M21 14v7H3V3h7" />
                  </svg>
                </button>
              </Tooltip>
            )}
          </span>
          {activeModel && <span style={{fontSize:'16px',color:'var(--text-dim)',fontStyle:'italic'}}>Current active model: {activeModel}</span>}
          </div>
          <div style={{position:'relative',flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                <div className="message-list" ref={messageListRef} onScroll={handleMessageScroll}>
                {messages.length === 0 && !streaming && <div className="placeholder">No messages yet. Say hello.</div>}
                {showCount < messages.length && (
                  <div style={{textAlign:'center',padding:'8px',fontSize:'11px',color:'var(--text-muted)'}}>Scroll up to load more...</div>
                )}
                {messages.slice(Math.max(0, messages.length - showCount)).map(msg => (
                  msg.role === 'user' && !msg.content && !msg.system_note ? null :
                  msg.system_note ? (
                    <div key={msg.id} className="system-note">
                      {msg.content}
                      <div className="system-note-actions">
                        <button onClick={() => deleteMessage(msg.id)}>Delete</button>
                      </div>
                    </div>
                  ) : msg.failed ? (
                    <div key={msg.id} style={{display:'flex',flexDirection:'column',alignSelf:'flex-end',maxWidth:'80%',gap:'8px'}}>
                      <div className={`message user failed`}>
                        <div className="msg-header">
                          <span className="msg-speaker">{userName}</span>
                          <span className="msg-time">{msg.timestamp}</span>
                        </div>
                        {msg.reasoning && <ReasoningBlock content={msg.reasoning} />}
                      {msg.content && <div className="msg-content"><MessageContent content={msg.content} /></div>}
                        <div className="msg-actions"><button onClick={()=>copyMessage(msg)}>{copiedId===msg.id?'Copied!':'Copy'}</button></div>
                      </div>
                      <div className="msg-failed-actions" style={{display:'flex',justifyContent:'flex-end',gap:'8px'}}>
                        <Tooltip text="Re-send Prompt">
                          <button className="msg-failed-btn resend" onClick={() => resendMessage(msg)}>↺</button>
                        </Tooltip>
                        <Tooltip text="Cancel Prompt">
                          <button className="msg-failed-btn cancel" onClick={() => deleteMessage(msg.id)}>✕</button>
                        </Tooltip>
                      </div>
                      <div className="msg-failed-text">Operation failed — {msg.fail_source || 'source not recorded'}. See log for diagnostics.</div>
                    </div>
                  ) : (
                  <div key={msg.id} className={`message ${msg.role}${msg.glimpse ? ' glimpse' : ''}${msg.stillpoint ? ' stillpoint' : ''}${msg.failed ? ' failed' : ''}`}>
                    <div className="msg-header">
                      <span className="msg-speaker">{msg.role==='user'?userName:activeAgent.name}</span>
                      <span className="msg-time">{msg.timestamp}</span>
                      {msg.glimpse && <span className="msg-glimpse-label">Glimpse</span>}
                      {msg.stillpoint && <span className="msg-stillpoint-label">Stillpoint — this message does not accumulate in context</span>}
                      {msg.edited && <span className="msg-edited">(edited)</span>}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="msg-attachments">
                        {msg.attachments.map((a, ai) => (
                          <div
                            key={ai}
                            className="msg-attachment clickable"
                            onClick={() => openAttachmentPreview(a.original_name || a.filename, { agentId: activeAgent.id, filename: a.filename }, a.type === 'image' ? 'image' : 'text')}
                          >
                            {a.type === 'image' && a.thumbDataUrl
                              ? <img className="msg-attachment-thumb" src={a.thumbDataUrl} alt="" />
                              : <span className="msg-attachment-icon">📄</span>}
                            <span className="msg-attachment-name">{a.original_name || a.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                      <>
                        {msg.tool_calls && msg.tool_calls.length > 0 && (
                          <div className="tool-indicators">
                            {msg.tool_calls.map((tc, i) => (
                              <div key={i} className="tool-indicator">
                                <span className="tool-indicator-icon">⚡</span>
                                <span className="tool-indicator-name">{formatToolName(tc.tool)}</span>
                                <span className="tool-indicator-status" style={{color: tc.status === 'ok' ? 'var(--ok)' : 'var(--err)'}}>
                                  {tc.status === 'ok' ? '✓' : '✗'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.tool_log_id && (
                          <button className="tool-log-btn" onClick={async () => {
                            setToolLogModal({ loading: true });
                            const log = await IPC.getToolLog(activeAgent.id, msg.tool_log_id);
                            setToolLogModal({ log });
                          }}>View tool log</button>
                        )}
                        {msg.reasoning && <ReasoningBlock content={msg.reasoning} />}
                        {msg.content && <div className="msg-content"><MessageContent content={msg.role==='user' && msg.glimpse && msg.glimpse_label ? msg.glimpse_label : msg.content.replace(/^\[[^\]]+completed\]\n?/, '').replace(/<<<TOOL_RECORD>>>/g, '').replace(/<<<END_TOOL_RECORD>>>/g, '').trim()} /></div>}


                      </>
                    {msg.failed ? null : (
                      <div className="msg-actions"><button onClick={()=>copyMessage(msg)}>{copiedId===msg.id?'Copied!':'Copy'}</button><button onClick={()=>deleteMessage(msg.id)}>Delete</button></div>
                    )}
                  </div>
                  )
                ))}
                {streaming && (() => {
                  const contentMarker   = '<<<CONTENT>>>';
                  const reasoningMarker = '<<<REASONING>>>';
                  const toolMarkerRe    = /^<<<TOOL:([^>]*)>>>/;
                  const toolMatch = streaming.match(toolMarkerRe);
                  const isToolStream = !!toolMatch;
                  let reasoningPart = '', contentPart = '', toolName = '', toolContent = '';
                  if (isToolStream) {
                    toolName = toolMatch[1];
                    toolContent = streaming.slice(toolMatch[0].length);
                  } else {
                    const contentIdx = streaming.indexOf(contentMarker);
                    const hasContent = contentIdx !== -1;
                    if (hasContent) {
                      const beforeContent = streaming.slice(0, contentIdx);
                      if (beforeContent.startsWith(reasoningMarker)) {
                        reasoningPart = beforeContent.slice(reasoningMarker.length);
                      }
                      contentPart = streaming.slice(contentIdx + contentMarker.length).trimStart();
                    } else if (streaming.startsWith(reasoningMarker)) {
                      reasoningPart = streaming.slice(reasoningMarker.length);
                    }
                  }
                  return (
                  <div className={`message assistant streaming${stillpointEnabled ? ' stillpoint' : ''}`}>
                    <div className="msg-header">
                      <span className="msg-speaker">{activeAgent?.name || 'Agent'}</span>
                      <span className="msg-time">{isToolStream ? (pendingApproval && activeAgent && pendingApproval.agent_id === activeAgent.id ? 'awaiting approval...' : 'working...') : 'streaming...'}</span>
                    </div>
                    {reasoningPart && (
                      <div style={{marginBottom:'8px',padding:'8px',background:'var(--bg-base)',borderRadius:'4px',fontSize:'calc(11px * var(--font-scale))',color:'var(--text-dim)',fontFamily:'Consolas,monospace',whiteSpace:'pre-wrap',lineHeight:'1.5',border:'1px solid var(--border-subtle)'}}>
                        <div style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)',marginBottom:'4px',textTransform:'uppercase',letterSpacing:'0.06em'}}>Thinking...</div>
                        {reasoningPart}
                      </div>
                    )}
                    {isToolStream && <LiveToolBlock toolName={toolName} content={toolContent} />}
                    {!isToolStream && contentPart && <div className="msg-content"><MessageContent content={contentPart} /></div>}
                    {!isToolStream && !contentPart && reasoningPart && <div style={{color:'var(--text-muted)',fontSize:'calc(11px * var(--font-scale))',fontStyle:'italic'}}>Thinking...</div>}
                    <div className="msg-actions" style={{opacity:1}}>
                      <button onClick={async () => { if (IPC && activeAgent) await IPC.cancelGeneration(activeAgent.id); }}
                        style={{background:'var(--err-surface)',color:'var(--err)',border:'1px solid var(--err)',padding:'2px 8px',borderRadius:'4px',cursor:'pointer',fontSize:'10px'}}>Cancel</button>
                    </div>
                  </div>
                  );
                })()}
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
                <div className="input-textarea-wrap">
                  {activeAttachments.length > 0 && (
                    <div className="attachment-tray-inline">
                      {activeAttachments.map((a, i) => (
                        <div
                          key={i}
                          className="attachment-chip clickable"
                          onClick={() => openAttachmentPreview(a.name, { path: a.path }, a.type === 'image' ? 'image' : 'text')}
                        >
                          {a.type === 'image' && a.thumbDataUrl
                            ? <img className="attachment-chip-thumb" src={a.thumbDataUrl} alt="" />
                            : <span className="attachment-chip-icon">📄</span>}
                          <span className="attachment-chip-name">{a.name}</span>
                          <button className="attachment-chip-remove" onClick={(e) => { e.stopPropagation(); handleRemoveAttachment(i); }} title="Remove">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder={activeAgent?.id===EPHEMERA_ID && !ephemeraModel ? 'Select a model first!' : `Message ${activeAgent.name}...`}
                    rows={4}
                    style={activeAgent?.id===EPHEMERA_ID && !ephemeraModel ? {opacity:0.4,cursor:'not-allowed'} : {}}/>
                  {activeAgent?.id !== EPHEMERA_ID && (
                    <Tooltip text="Attach files" position="top">
                      <button className="attach-btn" onClick={handleAddAttachment} aria-label="Attach files">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                        </svg>
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>handleSend(false)} disabled={(!input.trim() && activeAttachments.length === 0)||!!(activeAgent && pollRef.current[activeAgent.id])}>Send</button>
                    {activeAgent?.id !== EPHEMERA_ID && <button onClick={()=>handleSend(true)} disabled={(!input.trim() && activeAttachments.length === 0)||!!(activeAgent && pollRef.current[activeAgent.id])} style={{background:'var(--bg-raised)',color:'var(--accent)',border:'1px solid var(--accent)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:700}}>Glimpse</button>}
                  </div>
                  {tokenProgress ? (
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',alignItems:'stretch',minWidth:'140px'}}>
                      <span style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)',textAlign:'center'}}>
                        {tokenProgress.stage === 'conversation'
                          ? 'Tokenizing ' + tokenProgress.total + ' conversation turns'
                          : tokenProgress.stage === 'tool_records'
                            ? 'Tokenizing ' + tokenProgress.total + ' tool records'
                            : 'Tokenizing'}
                        {' (' + Math.round(((tokenProgress.processed || 0) / Math.max(1, tokenProgress.total || 1)) * 100) + '%)'}
                      </span>
                      <div style={{height:'3px',borderRadius:'2px',background:'var(--bg-raised)',overflow:'hidden'}}>
                        <div style={{height:'100%',width:Math.round(((tokenProgress.processed || 0) / Math.max(1, tokenProgress.total || 1)) * 100) + '%',background:'var(--accent)',transition:'width 0.15s ease'}} />
                      </div>
                    </div>
                  ) : tokenCount !== null && (
                    <Tooltip block text={tokenBreakdown ? [
                      `Identity anchor:   ~${tokenBreakdown.identityCount.toLocaleString()} tokens`,
                      `System manifest:   ~${tokenBreakdown.manifestCount.toLocaleString()} tokens`,
                      `Tool records:   ~${(tokenBreakdown.toolRecordCount || 0).toLocaleString()} tokens`,
                      `Agent context:   ~${tokenBreakdown.contextCount.toLocaleString()} tokens`,
                      `Current prompt:   ~${tokenBreakdown.promptCount.toLocaleString()} tokens`,
                      ``,
                      `Total:   ~${tokenCount.toLocaleString()} tokens`,
                    ].join('\n') : `~${tokenCount.toLocaleString()} tokens`} position="top">
                      <span style={{fontSize:'calc(10px * var(--font-scale))',color:'var(--text-muted)',textAlign:'center',cursor:'default'}}>~{tokenCount.toLocaleString()} tokens</span>
                    </Tooltip>
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
              <div className="log-box" ref={logBoxRef} onScroll={handleLogScroll}>{tinlogEntries.length===0 && <div className="log-entry dim">No log entries yet.</div>}{tinlogEntries.map((e,i)=><div key={i} className="log-entry">{e}</div>)}</div>
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
      {settingsTarget && (<div className="modal-overlay" onClick={()=>{setSettingsTarget(null);setSettingsReasoning(null);loadAgents();}}><div className="modal modal--scrollable modal--settings" onClick={e=>e.stopPropagation()}>
        <h2>{settingsTarget.name} Settings</h2>
        <div className="settings-two-col">
        <div className="settings-col">
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
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
        <Tooltip text="Adjust Agent Temperature" block><input type="range" min="0" max="2" step="0.05" value={settingsTemp}
            onChange={e=>{const v=parseFloat(e.target.value);setSettingsTemp(v);}}
            onMouseUp={async()=>{if(IPC&&settingsTarget){await IPC.updateAgentTemperature(settingsTarget.id,settingsTemp);}}}
            className="temperature-slider"
            style={{width:'100%',marginTop:0,background:`linear-gradient(to right, var(--accent) 0%, var(--accent) calc(${(settingsTemp/2)*100}% + ${9 - settingsTemp*9}px), var(--bg-raised) calc(${(settingsTemp/2)*100}% + ${9 - settingsTemp*9}px), var(--bg-raised) 100%)`}}/></Tooltip>
        <label style={{display:'block',textAlign:'center',marginTop:8,marginBottom:0,fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)'}}>Temperature: {settingsTemp.toFixed(2)}</label>
        </div>
        <label style={{marginTop:20,display:'block'}}>Model</label>
        <ModelPicker
          availableModels={availableModels}
          localModels={localModels}
          value={settingsModel}
          onChange={async (id) => { setSettingsModel(id); if(IPC&&settingsTarget){await IPC.updateAgentModel(settingsTarget.id,id);setSettingsTarget({...settingsTarget,model:id});if(activeAgent?.id===settingsTarget.id)setActiveModel(id);await loadAgents(); const r=await IPC.getModelReasoning(id,orReasoningMap);reasoningCache.current[id]=r;setSettingsReasoning(r);} }}
        />
        </div>
        <div className="settings-col">
        {mcpEnabled && settingsTarget && settingsTarget.id !== '__ephemera__' && (
          <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}}>
            <div style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',marginBottom:8,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>MCP Filesystem Tools</div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0}}>Enabled for this agent</label>
              <Tooltip text="Give this agent access to MCP filesystem tools">
                <button
                  onClick={async () => {
                    if (!IPC || !settingsTarget) return;
                    const next = !settingsTarget.mcp_enabled;
                    await IPC.updateAgentMcp(settingsTarget.id, next);
                    setSettingsTarget({ ...settingsTarget, mcp_enabled: next });
                    // Manifest size changed for this agent — refresh its manifest count only,
                    // no full context recount.
                    refreshManifestTokens(settingsTarget.id);
                  }}
                  style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
                    background:settingsTarget?.mcp_enabled?'var(--ok-bg)':'var(--bg-raised)',
                    color:settingsTarget?.mcp_enabled?'var(--ok)':'var(--text-dim)'}}
                >{settingsTarget?.mcp_enabled ? 'ON' : 'OFF'}</button>
              </Tooltip>
            </div>
          </div>
        )}
        {settingsReasoning && (() => {
          const efforts = settingsReasoning.supported_efforts || null;
          const defaultEffort = (settingsReasoning.default_effort && settingsReasoning.default_effort !== 'none')
            ? settingsReasoning.default_effort
            : (efforts?.[0] || 'high');
          const mandatory = !!settingsReasoning.mandatory;
          const isOn = settingsTarget?.reasoning?.enabled ?? (settingsReasoning.default_enabled !== false);
          const currentEffort = settingsTarget?.reasoning?.effort ?? defaultEffort;
          return (
            <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',marginBottom:8,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Reasoning</div>
              {!mandatory && (
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0}}>Enabled</label>
                  <Tooltip text={mandatory ? 'Always on for this model' : 'Enable reasoning/thinking mode'}>
                    <button
                      onClick={async () => {
                        if (!IPC || !settingsTarget) return;
                        const cur = settingsTarget.reasoning ?? { enabled: isOn, effort: currentEffort };
                        const next = { ...cur, enabled: !cur.enabled };
                        await IPC.updateAgentReasoning(settingsTarget.id, next);
                        setSettingsTarget({ ...settingsTarget, reasoning: next });
                      }}
                      style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'calc(12px * var(--font-scale))',fontWeight:600,
                        background:isOn?'var(--ok-bg)':'var(--bg-raised)',color:isOn?'var(--ok)':'var(--text-dim)'}}
                    >{isOn ? 'ON' : 'OFF'}</button>
                  </Tooltip>
                </div>
              )}
              {efforts && efforts.length > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <label style={{fontSize:'calc(13px * var(--font-scale))',margin:0,marginRight:4}}>Effort</label>
                  {efforts.map(level => {
                    const EFFORT_LABELS = {low:'Low',medium:'Medium',high:'High',xhigh:'X-High',max:'Max',minimal:'Minimal'};
                    const label = EFFORT_LABELS[level] || level;
                    return (
                    <button key={level}
                      onClick={async () => {
                        if (!IPC || !settingsTarget) return;
                        const cur = settingsTarget.reasoning ?? { enabled: isOn, effort: currentEffort };
                        const next = { ...cur, effort: level };
                        await IPC.updateAgentReasoning(settingsTarget.id, next);
                        setSettingsTarget({ ...settingsTarget, reasoning: next });
                      }}
                      style={{padding:'4px 12px',borderRadius:'4px',border:'1px solid',cursor:'pointer',fontSize:'calc(11px * var(--font-scale))',fontWeight:600,
                        background:currentEffort===level?'var(--accent)':'var(--bg-raised)',
                        color:currentEffort===level?'var(--accent-fg)':'var(--text-dim)',
                        borderColor:currentEffort===level?'var(--accent)':'var(--border-subtle)'}}
                    >{label}</button>
                  )})}
                </div>
              )}
            </div>
          );
        })()}
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <Tooltip text="Manage this agent's tool records" block><button onClick={openToolRecordModal}
            style={{width:'100%',padding:'8px',background:'var(--bg-raised)',color:'var(--text-primary)',border:'1px solid var(--border-subtle)',borderRadius:'6px',cursor:'pointer',fontSize:'calc(13px * var(--font-scale))',fontWeight:600}}>
            Tool Record Management
          </button></Tooltip>
        </div>
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
        </div>
        </div>
        <div className="modal-buttons" style={{marginTop:12}}><button onClick={()=>{setSettingsTarget(null);setSettingsReasoning(null);loadAgents();}}>Close</button></div>
      </div></div>)}

      {/* Ephemera Settings Modal */}
      {showEphemeraModal && (
        <div className="modal-overlay" onClick={()=>{setShowEphemeraModal(false);setEphemeraReasoning(null);}}><div className="modal modal--scrollable" onClick={e=>e.stopPropagation()}>
          <h2>✦ Ephemera</h2>
          <p style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',lineHeight:1.6,marginBottom:16}}>Ephemera is a stateless agent. Every message is sent with no prior context, no identity anchor, and no tool manifest — just your prompt and nothing else. Responses are not accumulated; each exchange replaces the last. Use Ephemera for quick, isolated queries where you want raw model behaviour without any overhead or drift.</p>
          <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginBottom:4}}>Model</label>
          <ModelPicker availableModels={availableModels} localModels={localModels} value={ephemeraModel} onOpen={fetchModelsForModal} onChange={async (id)=>{ setEphemeraModel(id); await IPC.saveEphemeraSettings(id, ephemeraTemp); if(activeAgent?.id===EPHEMERA_ID) setActiveModel(id); const rsn=await IPC.getModelReasoning(id,orReasoningMap); reasoningCache.current[id]=rsn; setEphemeraReasoning(rsn); }} />
          <label style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-dim)',display:'block',marginTop:12,marginBottom:4}}>Temperature — {ephemeraTemp.toFixed(2)}</label>
          <Tooltip text="Adjust Agent Temperature" block><input type="range" min="0" max="2" step="0.01" value={ephemeraTemp}
            onChange={async e=>{ const t=parseFloat(e.target.value); setEphemeraTemp(t); await IPC.saveEphemeraSettings(ephemeraModel, t); }}
            style={{width:'100%'}}/></Tooltip>
          <EphemeraReasoningSection ephemeraReasoning={ephemeraReasoning} orReasoningMap={orReasoningMap} />
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

User turns must use **You said**:. Agent turns must use the exact same name as entered in the Import Agent dialog, in the form **Name said**: — this name must match precisely. Turn numbers are optional and will be ignored if present.

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
              const text = `Lucid expects a plain text or Markdown file where each turn follows this pattern:\n\n**Speaker said**: message content\n\n---\n\nUser turns must use **You said**:. Agent turns must use the exact same name as entered in the Import Agent dialog, in the form **Name said**: — this name must match precisely. Turn numbers are optional and will be ignored if present.\n\nMulti-line messages are supported. The --- separator marks the end of each turn.\n\nExample:\n\n**You said**: What is the capital of France?\n\n---\n**Agent said**: The capital of France is Paris.\n\n---\n\nReasoning blocks must be stripped before import. The following Python function removes a common formatting of reasoning block exports. You may need to modify it based on your specific formatting:\n\ndef strip_reasoning(lines):\n    output = []\n    in_reasoning = False\n    for line in lines:\n        if line.startswith('> _Thinking:'):\n            in_reasoning = True\n            continue\n        if in_reasoning and line.rstrip('\\n').endswith('_'):\n            in_reasoning = False\n            continue\n        if in_reasoning:\n            continue\n        output.append(line)\n    return output`;
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
        <p style={{fontSize:'calc(11px * var(--font-scale))',color:'var(--text-muted)',margin:'4px 0 10px',lineHeight:1.5}}>The agent name must exactly match the speaker label used in the export file.</p>
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
          { id: 'kimi',       label: 'Kimi (Moonshot)', placeholder: 'sk-...' },
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
      {toolLogModal && (
        <div className="modal-overlay" onClick={() => setToolLogModal(null)}>
          <div className="modal tool-log-modal" onClick={e => e.stopPropagation()}>
            {toolLogModal.loading ? (
              <div className="tool-log-header"><h2>View tool log</h2><div className="tool-log-meta">Loading...</div></div>
            ) : toolLogModal.log ? (() => {
              const log = toolLogModal.log;
              const WRITE_TOOLS = ['edit_file', 'write_file', 'create_file', 'move_file', 'delete_file', 'create_directory'];
              return (
                <>
                  <div className="tool-log-header">
                    <h2>Tool log</h2>
                    <div className="tool-log-meta">{log.timestamp} &nbsp;·&nbsp; {log.tool_calls.length} call{log.tool_calls.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="tool-log-body">
                    {log.tool_calls.map((tc, i) => {
                      const isWrite = WRITE_TOOLS.includes(tc.tool);
                      const args = tc.arguments || {};
                      const argLines = Object.entries(args)
                        .filter(([k]) => !['old_text','new_text','content','text','edits'].includes(k))
                        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                        .join('\n');
                      const edits = Array.isArray(args.edits) ? args.edits : null;
                      return (
                        <div key={i} className="tool-log-entry">
                          <div className="tool-log-entry-header">
                            <span className="tool-log-entry-index">#{i + 1}</span>
                            <span className="tool-log-entry-name">{formatToolName(tc.tool)}</span>
                            <span className={`tool-log-entry-status ${tc.status === 'ok' ? 'ok' : 'err'}`}>
                              {tc.status === 'ok' ? '✓ ok' : '✗ ' + tc.status}
                            </span>
                          </div>
                          {argLines && (
                            <div className="tool-log-args">
                              <div className="tool-log-args-label">Arguments</div>
                              <div className="tool-log-args-content">{argLines}</div>
                            </div>
                          )}
                          {tc.repairs && tc.repairs.length > 0 && (
                            <div className="tool-log-repairs">
                              <div className="tool-log-args-label">Auto-repairs</div>
                              {tc.repairs.map((r, j) => (
                                <div key={j} className="tool-log-repair-item">{r}</div>
                              ))}
                            </div>
                          )}
                          <div className="tool-log-result">
                            <div className="tool-log-result-label">{isWrite ? 'Changes' : 'Result'}</div>
                            {isWrite ? (
                              <div className="tool-log-diff">
                                {tc.tool === 'edit_file' && edits ? (
                                  edits.map((edit, j) => (
                                    <div key={j}>
                                      {edits.length > 1 && <div className="tool-log-args-label" style={{padding:'4px 0 2px'}}>Edit {j + 1} of {edits.length}</div>}
                                      <div className="tool-log-diff-block">
                                        <div className="tool-log-diff-label before">Before</div>
                                        <div className="tool-log-diff-text before">{edit.oldText ?? '(empty)'}</div>
                                      </div>
                                      <div className="tool-log-diff-block">
                                        <div className="tool-log-diff-label after">After</div>
                                        <div className="tool-log-diff-text after">{edit.newText ?? '(empty)'}</div>
                                      </div>
                                    </div>
                                  ))
                                ) : (args.content != null || args.text != null) ? (
                                  <div className="tool-log-diff-block">
                                    <div className="tool-log-diff-label after">Content written</div>
                                    <div className="tool-log-diff-text after">{args.content ?? args.text}</div>
                                  </div>
                                ) : null}
                                {tc.status !== 'ok' && (
                                  <div className="tool-log-result-content err">{tc.error || 'Unknown error'}</div>
                                )}
                              </div>
                            ) : (
                              <div className={`tool-log-result-content${tc.status !== 'ok' ? ' err' : ''}`}>
                                {tc.status === 'ok' ? (tc.content || '(no content)') : (tc.error || 'Unknown error')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="tool-log-footer">
                    <button onClick={() => setToolLogModal(null)}>Close</button>
                  </div>
                </>
              );
            })() : (
              <div className="tool-log-header"><h2>Tool log</h2><div className="tool-log-meta">Log not found.</div></div>
            )}
          </div>
        </div>
      )}
      {ctxMenu.visible && ctxMenu.params && (
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 20000 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {ctxMenu.params.misspelledWord && ctxMenu.params.dictionarySuggestions && ctxMenu.params.dictionarySuggestions.length > 0 && (
            <>
              {ctxMenu.params.dictionarySuggestions.slice(0, 3).map((s, i) => (
                <div key={i} className="ctx-menu-item" onClick={() => {
                  if (IPC && IPC.ctxReplaceMisspelling) IPC.ctxReplaceMisspelling(s);
                  setCtxMenu(c => ({ ...c, visible: false }));
                }}>{s}</div>
              ))}
              <div className="ctx-menu-sep" />
            </>
          )}
          {ctxHasSelectAllTarget && (
            <div className="ctx-menu-item" onClick={() => {
              ctxSelectAll();
              setCtxMenu(c => ({ ...c, visible: false }));
            }}>Select All</div>
          )}
          <div className={`ctx-menu-item${ctxMenu.params.editFlags && ctxMenu.params.editFlags.canCopy ? '' : ' disabled'}`} onClick={() => {
            if (!(ctxMenu.params.editFlags && ctxMenu.params.editFlags.canCopy)) return;
            if (IPC && IPC.ctxCopy) IPC.ctxCopy();
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>Copy</div>
          <div className={`ctx-menu-item${ctxMenu.params.editFlags && ctxMenu.params.editFlags.canCut ? '' : ' disabled'}`} onClick={() => {
            if (!(ctxMenu.params.editFlags && ctxMenu.params.editFlags.canCut)) return;
            if (IPC && IPC.ctxCut) IPC.ctxCut();
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>Cut</div>
          <div className={`ctx-menu-item${ctxMenu.params.editFlags && ctxMenu.params.editFlags.canPaste ? '' : ' disabled'}`} onClick={() => {
            if (!(ctxMenu.params.editFlags && ctxMenu.params.editFlags.canPaste)) return;
            if (IPC && IPC.ctxPaste) IPC.ctxPaste();
            setCtxMenu(c => ({ ...c, visible: false }));
          }}>Paste</div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="modal-overlay" onClick={() => setShowCloseConfirm(false)}>
          <div className="modal" style={{width:'300px'}} onClick={e => e.stopPropagation()}>
            <h2 style={{textAlign:'center'}}>Exit Lucid</h2>
            <p style={{margin:'12px 0',fontSize:'calc(13px * var(--font-scale))',textAlign:'center'}}>Are you sure you want to exit Lucid?</p>
            <div className="modal-buttons" style={{justifyContent:'center'}}>
              <button onClick={() => { if (IPC && IPC.windowCloseConfirmed) IPC.windowCloseConfirmed(); }}>Exit Now</button>
              <button onClick={() => setShowCloseConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toolRecordModal && (
        <div className="modal-overlay" style={{zIndex:500}} onClick={() => setToolRecordModal(null)}>
          <div className="modal" style={{width:'560px'}} onClick={e => e.stopPropagation()}>
            <h2>Tool Record Management</h2>
            <p style={{fontSize:'calc(13px * var(--font-scale))',color:'var(--text-dim)',lineHeight:1.6,margin:'0 0 12px'}}>
              Tool records are Lucid's episodic memory of what <strong>{toolRecordModal.agentName}</strong> did: the specific files read, the exact edits made, the queries run. They're kept in the agent's context so it can remember its own past actions across turns. Over long sessions, they accumulate. Purging archives them — removing them from the agent's active context so future turns use fewer tokens.
            </p>
            <p style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-muted)',lineHeight:1.6,margin:'0 0 16px'}}>
              The agent keeps its prose summaries; only the raw tool invocations are archived. Records are not deleted. Restoring brings them back into context.
            </p>
            {toolRecordModal.loading ? (() => {
              const p = toolRecordModal.progress;
              const pct = p && p.total > 0 ? Math.round((p.processed / p.total) * 100) : 0;
              return (
                <div style={{padding:'16px 0',marginBottom:16}}>
                  <div style={{fontSize:'calc(12px * var(--font-scale))',color:'var(--text-muted)',textAlign:'center',marginBottom:8}}>
                    {p && p.total > 0 ? `Analyzing records… ${p.processed} of ${p.total} (${pct}%)` : 'Analyzing records…'}
                  </div>
                  <div style={{height:'6px',borderRadius:'3px',background:'var(--bg-raised)',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:'var(--accent)',transition:'width 0.15s ease'}} />
                  </div>
                </div>
              );
            })() : toolRecordModal.stats ? (
              <div style={{background:'var(--bg-base)',border:'1px solid var(--border-subtle)',borderRadius:'6px',padding:'12px 16px',marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'calc(12px * var(--font-scale))',marginBottom:6}}>
                  <span style={{color:'var(--text-dim)'}}>Active in context</span>
                  <span style={{color:'var(--text-primary)',fontFamily:'Consolas,monospace'}}>
                    {toolRecordModal.stats.active.messages} msg · {toolRecordModal.stats.active.calls} calls · ~{toolRecordModal.stats.active.tokens.toLocaleString()} tokens
                  </span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'calc(12px * var(--font-scale))'}}>
                  <span style={{color:'var(--text-dim)'}}>Archived (restorable)</span>
                  <span style={{color:toolRecordModal.stats.culled.tokens > 0 ? 'var(--ok)' : 'var(--text-muted)',fontFamily:'Consolas,monospace'}}>
                    {toolRecordModal.stats.culled.messages} msg · {toolRecordModal.stats.culled.calls} calls · ~{toolRecordModal.stats.culled.tokens.toLocaleString()} tokens
                  </span>
                </div>
              </div>
            ) : null}
            <div className="modal-buttons" style={{justifyContent:'center'}}>
              <button
                onClick={() => setShowPurgeConfirm(true)}
                disabled={toolRecordModal.loading || !toolRecordModal.stats || toolRecordModal.stats.active.messages === 0}
                style={{background:'var(--accent)',color:'var(--accent-fg)'}}
              >Purge Tool Records</button>
              <button
                onClick={handleRestoreRecords}
                disabled={toolRecordModal.loading || !toolRecordModal.stats || toolRecordModal.stats.culled.messages === 0}
                style={{background:'var(--bg-raised)',color:'var(--text-primary)'}}
              >Restore Tool Records</button>
            </div>
            <div className="modal-buttons" style={{marginTop:12,justifyContent:'center'}}>
              <button onClick={() => setToolRecordModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showPurgeConfirm && toolRecordModal && toolRecordModal.stats && (
        <div className="modal-overlay" style={{zIndex:600}} onClick={() => setShowPurgeConfirm(false)}>
          <div className="modal" style={{width:'440px'}} onClick={e => e.stopPropagation()}>
            <h2 style={{textAlign:'center'}}>Confirm Purge</h2>
            <p style={{fontSize:'calc(13px * var(--font-scale))',textAlign:'center',margin:'12px 0'}}>
              This will archive {toolRecordModal.stats.active.messages} tool record{toolRecordModal.stats.active.messages === 1 ? '' : 's'} (~{toolRecordModal.stats.active.tokens.toLocaleString()} tokens) from <strong>{toolRecordModal.agentName}</strong>'s active context. They can be restored later.
            </p>
            <div className="modal-buttons" style={{justifyContent:'center'}}>
              <button onClick={handlePurgeRecords}>Purge Now</button>
              <button onClick={() => setShowPurgeConfirm(false)} style={{background:'var(--bg-raised)',color:'var(--text-primary)'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {attachmentPreview && (
        <div
          className={`modal-overlay${attachmentExpanded ? ' attachment-preview-fullscreen' : ''}`}
          onClick={() => { if (attachmentExpanded) collapseAttachment(); else setAttachmentPreview(null); }}
        >
          <div
            className="modal attachment-preview-modal"
            onClick={e => { e.stopPropagation(); if (attachmentExpanded) collapseAttachment(); }}
          >
            {attachmentExpanded ? (
              <img className="attachment-preview-image-fullscreen" src={attachmentPreview.imageDataUrl} alt={attachmentPreview.title} />
            ) : (
              <>
                <h2>Attachment Preview</h2>
                <div className="attachment-preview-meta">
                  {attachmentPreview.kind === 'image'
                    ? attachmentPreview.title
                    : <>
                        {attachmentPreview.title} · {attachmentPreview.totalLines.toLocaleString()} line{attachmentPreview.totalLines === 1 ? '' : 's'}
                        {attachmentPreview.totalLines > attachmentPreview.nextOffset && (
                          <> · showing {attachmentPreview.nextOffset.toLocaleString()}</>
                        )}
                      </>
                  }
                </div>
                {attachmentPreview.kind === 'image' ? (
                  <div className="attachment-preview-image-wrap">
                    {attachmentPreview.imageDataUrl
                      ? <img className="attachment-preview-image" src={attachmentPreview.imageDataUrl} alt={attachmentPreview.title} />
                      : <div className="attachment-preview-image-placeholder">{attachmentPreview.loading ? 'Loading…' : attachmentPreview.content}</div>}
                  </div>
                ) : (
                  <>
                    <pre className="attachment-preview-content">{attachmentPreview.content || (attachmentPreview.loading ? 'Loading…' : '')}</pre>
                    <div className="attachment-preview-actions">
                      {attachmentPreview.hasMore && (
                        <button onClick={loadMorePreview} disabled={attachmentPreview.loading}>
                          {attachmentPreview.loading ? 'Loading…' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </>
                )}
                <div className="modal-buttons">
                  {attachmentPreview.kind === 'image' && attachmentPreview.imageDataUrl && (
                    <button onClick={expandAttachment}>Expand</button>
                  )}
                  <button onClick={() => setAttachmentPreview(null)}>Close</button>
                </div>
              </>
            )}
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
