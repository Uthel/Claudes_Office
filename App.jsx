import React, { useState, useEffect, useRef } from 'react';

const IPC = window.hearth;

export default function App() {
  const [view, setView] = useState('chat');
  const [agents, setAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsRoom, setSettingsRoom] = useState('');
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [identityText, setIdentityText] = useState('');
  const [nametagsEnabled, setNametagsEnabled] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIdentity, setNewIdentity] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [importFilePath, setImportFilePath] = useState(null);
  const [importName, setImportName] = useState('');
  const [importIdentity, setImportIdentity] = useState('');
  const [importRoom, setImportRoom] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [usage, setUsage] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking...');
  const [pendingCount, setPendingCount] = useState(0);
  const [tinlogEntries, setTinlogEntries] = useState([]);
  const messageListRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { loadAgents(); refreshStatus(); loadApiKey(); const i = setInterval(refreshStatus, 5000); return () => clearInterval(i); }, []);
  useEffect(() => { if (view === 'status') refreshUsage(); }, [view]);
  useEffect(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight; }, [messages]);
  useEffect(() => {
    if (view === 'chat' && messageListRef.current) setTimeout(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight; }, 50);
  }, [view, activeAgent]);

  const refreshUsage = async () => { if (!IPC) return; try { const d = await IPC.getUsage(); if (d && !d.error) setUsage(d); } catch {} };
  const loadApiKey = async () => { if (!IPC) return; const r = await IPC.getApiKey(); if (r.key) { setApiKey(r.key); setKeySaved(true); } };
  const handleSaveApiKey = async () => { if (!apiKey.trim() || !IPC) return; await IPC.updateApiKey(apiKey); setKeySaved(true); };
  const loadAgents = async () => { if (!IPC) return; setAgents(await IPC.listAgents()); };
  const selectAgent = async (a) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setActiveAgent(a);
    setEditing(null);
    if (IPC) setMessages(await IPC.getConversation(a.id));
  };
  const refreshStatus = async () => {
    if (!IPC) return;
    try { const s = await IPC.getStatus(); setBackendStatus(s.backend); setPendingCount(s.pendingTasks || 0); } catch { setBackendStatus('disconnected'); }
    try { setTinlogEntries(await IPC.getRecentLog(10) || []); } catch {}
  };

  const handleSend = async (glimpse) => {
    if (!input.trim() || !activeAgent || !IPC) return;
    const content = input;
    setInput('');
    if (glimpse) {
      const resp = await IPC.glimpseMessage(activeAgent.id, content);
      if (resp.content) {
        const msgs = await IPC.getConversation(activeAgent.id);
        setMessages(msgs);
      } else if (resp.error) {
        alert('Glimpse: ' + resp.error);
      }
    } else {
      const resp = await IPC.sendMessage(activeAgent.id, content);
      if (resp.queued) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          const msgs = await IPC.getConversation(activeAgent.id);
          setMessages(msgs);
          if (msgs.length && msgs[msgs.length-1].role === 'assistant') {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 1000);
      } else {
        setMessages(await IPC.getConversation(activeAgent.id));
      }
    }
  };

  const handleImportAgent = async () => {
    if (!importName.trim() || !importFilePath || !IPC) return;
    const r = await IPC.importAgent(importName, importFilePath, importRoom, importIdentity);
    if (r.success) { setShowImportModal(false); setImportName(''); setImportFilePath(null); setImportIdentity(''); setImportRoom(''); await loadAgents(); }
    else alert(r.error || 'Failed to import agent.');
  };
  const handleSelectImportFile = async () => { if (!IPC) return; const f = await IPC.selectFile(); if (f) setImportFilePath(f); };
  const handleDeleteAgent = async () => {
    if (!deleteTarget || !IPC) return;
    await IPC.deleteAgent(deleteTarget.id);
    if (activeAgent?.id === deleteTarget.id) { setActiveAgent(null); setMessages([]); }
    setDeleteTarget(null); await loadAgents();
  };
  const handleToggleModel = async (id, cur) => {
    const m = (cur === 'deepseek-v4-pro' || cur === 'deepseek/deepseek-v4-pro') ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
    if (!IPC) return; await IPC.updateAgentModel(id, m); await loadAgents();
  };
  const handleSaveAgentName = async () => {
    if (!settingsTarget || !IPC) return;
    await IPC.updateAgentName(settingsTarget.id, settingsName, settingsRoom);
    setSettingsTarget(null);
    await loadAgents();
  };
  const handleCreateAgent = async () => {
    if (!newName.trim() || !IPC) return;
    const r = await IPC.createAgent(newName, newIdentity, newRoom);
    if (r.success) {
      setShowCreateModal(false); setNewName(''); setNewIdentity(''); setNewRoom(''); await loadAgents();
      selectAgent({ id: r.id, name: newName });
    } else alert(r.error || 'Failed to create agent.');
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(false); } };
  const startEdit = (m) => setEditing({ id: m.id, content: m.content });
  const saveEdit = async () => {
    if (!editing || !activeAgent || !IPC) return;
    await IPC.editMessage(activeAgent.id, editing.id, editing.content);
    setEditing(null); setMessages(await IPC.getConversation(activeAgent.id));
  };
  const deleteMessage = async (mid) => {
    if (!activeAgent || !IPC) return;
    await IPC.deleteMessage(activeAgent.id, mid);
    setMessages(await IPC.getConversation(activeAgent.id));
  };

  return (
    <div className="app">
      <header>
        <h1>The Hearth</h1><span className="subtitle">Proto-Core v0.5 — {backendStatus}</span>
        {pendingCount > 0 && <span className="pending-badge">{pendingCount} pending</span>}
        <button className="flush-btn" onClick={async () => { if (IPC) { await IPC.flushQueue(); refreshStatus(); } }} title="Flush queue">Flush</button>
        <nav className="top-nav">
          <button className={view==='chat'?'active':''} onClick={()=>setView('chat')}>Chat</button>
          <button className={view==='status'?'active':''} onClick={()=>setView('status')}>Status</button>
        </nav>
      </header>
      <div className="main-layout">
        {view === 'chat' && (<>
          <aside className="agent-sidebar">
            <h2>Agents</h2>
            {agents.map(a => (
              <div key={a.id} className={`agent-item ${activeAgent?.id===a.id?'active':''}`} onClick={()=>selectAgent(a)}>
                <div className="agent-info">
                  <span className="agent-name">{a.name}</span><span className="agent-room">{a.room}</span>
                </div>
                <div className="agent-meta">
                  <span className="agent-model-badge">{(a.model||'deepseek-v4-flash').includes('pro')?'Pro':'Flash'}</span>
                  <button className="agent-settings-btn" onClick={e=>{e.stopPropagation();setSettingsTarget(a);setSettingsName(a.name);setSettingsRoom(a.room);(async()=>{if(IPC){const r=await IPC.getAgentIdentity(a.id);if(r)setIdentityText(r.content||'');const n=await IPC.getAgentNametags(a.id);setNametagsEnabled(n?.enabled||false);}})();}} title="Agent settings">Settings</button>
                </div>
              </div>
            ))}
            <button className="new-agent-btn" onClick={()=>setShowCreateModal(true)}>+ New Agent</button>
            <button className="new-agent-btn" onClick={()=>setShowImportModal(true)}>Import Agent</button>
          </aside>
          <section className="chat-panel">
            {!activeAgent ? <div className="placeholder">Select an agent to begin.</div> : (<>
              <div className="chat-header">{activeAgent.name} — {activeAgent.room}</div>
              <div className="message-list" ref={messageListRef}>
                {messages.length === 0 && <div className="placeholder">No messages yet. Say hello.</div>}
                {messages.map(msg => (
                  <div key={msg.id} className={`message ${msg.role}`}>
                    <div className="msg-header">
                      <span className="msg-speaker">{msg.role==='user'?'Uthel':activeAgent.name}</span>
                      <span className="msg-time">{msg.timestamp}</span>
                      {msg.edited && <span className="msg-edited">(edited)</span>}
                    </div>
                    {editing?.id===msg.id ? (
                      <div className="edit-row"><textarea value={editing.content} onChange={e=>setEditing({...editing,content:e.target.value})} rows={3}/>
                        <div className="edit-buttons"><button onClick={saveEdit}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div></div>
                    ) : <div className="msg-content">{msg.content.includes(':: ') ? msg.content.substring(msg.content.indexOf(':: ')+3) : msg.content}</div>}
                    <div className="msg-actions"><button onClick={()=>startEdit(msg)}>Edit</button><button onClick={()=>deleteMessage(msg.id)}>Delete</button></div>
                  </div>
                ))}
              </div>
              <div className="input-row">
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Message ${activeAgent.name}...`} rows={2}/>
                <button onClick={()=>handleSend(false)} disabled={!input.trim()}>Send</button>
                <button onClick={()=>handleSend(true)} disabled={!input.trim()} style={{padding:'0 14px',background:'#2d2d5e',color:'#c4a35a',border:'1px solid #c4a35a',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:600}}>Glimpse</button>
              </div>
            </>)}
          </section>
        </>)}
        {view === 'status' && (
          <section className="status-panel">
            <h2>System Status</h2>
            <div className="status-row"><span>Backend</span><span className={backendStatus==='running'?'ok':'err'}>{backendStatus}</span></div>
            <div className="status-row"><span>Queue</span><span>{pendingCount} tasks pending</span></div>
            {usage && (<div className="usage-panel" style={{marginTop:16}}><h2>OpenRouter Usage</h2>
              {usage.usage_daily!==undefined && <div className="status-row"><span>Today</span><span>${Number(usage.usage_daily).toFixed(6)}</span></div>}
              {usage.usage_monthly!==undefined && <div className="status-row"><span>This Month</span><span>${Number(usage.usage_monthly).toFixed(6)}</span></div>}
              {usage.is_free_tier!==undefined && <div className="status-row"><span>Tier</span><span>{usage.is_free_tier?'Free':'Paid'}</span></div>}
            </div>)}
            <div className="api-key-section" style={{marginTop:20}}><h2>API Key {keySaved && <span style={{color:'#6fcf6f',fontSize:'11px',fontWeight:400}}>✓ saved</span>}</h2>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <input type="password" value={apiKey} onChange={e=>{setApiKey(e.target.value);setKeySaved(false)}} placeholder="Enter API key" style={{flex:1,padding:'6px 10px',background:'#0d0d1a',color:'#e0e0e0',border:'1px solid #444',borderRadius:'4px',fontSize:'12px'}}/>
                <button onClick={handleSaveApiKey} disabled={!apiKey.trim()} style={{padding:'6px 14px',background:'#c4a35a',color:'#1a1a2e',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>Save</button>
              </div>
            </div>
            <div className="log-panel" style={{marginTop:20}}><h2>Recent Tinlog</h2>
              <div className="log-box">{tinlogEntries.length===0 && <div className="log-entry dim">No log entries yet.</div>}{tinlogEntries.map((e,i)=><div key={i} className="log-entry">{e}</div>)}</div>
            </div>
          </section>
        )}
      </div>
      {settingsTarget && (<div className="modal-overlay" onClick={()=>setSettingsTarget(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>{settingsTarget.name} Settings</h2>
        <label>Display Name</label>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <input type="text" value={settingsName} onChange={e=>setSettingsName(e.target.value)} style={{flex:1,padding:'6px 10px',background:'#0d0d1a',color:'#e0e0e0',border:'1px solid #444',borderRadius:'4px',fontSize:'13px'}}/>
        </div>
        <label style={{marginTop:12}}>Room</label>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <input type="text" value={settingsRoom} onChange={e=>setSettingsRoom(e.target.value)} style={{flex:1,padding:'6px 10px',background:'#0d0d1a',color:'#e0e0e0',border:'1px solid #444',borderRadius:'4px',fontSize:'13px'}}/>
        </div>
        <div style={{marginTop:12}}>
          <button onClick={handleSaveAgentName} disabled={!settingsName.trim()} style={{padding:'6px 14px',background:'#c4a35a',color:'#1a1a2e',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:600}}>Save Name</button>
        </div>
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid #2a2a4a'}}>
          <button onClick={()=>setShowIdentityModal(true)} style={{width:'100%',padding:'8px',background:'#2d2d5e',color:'#c4a35a',border:'1px solid #c4a35a',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:600}}>Edit Identity</button>
        </div>
        <div style={{marginTop:16,display:'flex',alignItems:'center',gap:8}}>
          <label style={{fontSize:'13px',margin:0}}>Nametags</label>
          <button onClick={async()=>{if(IPC&&settingsTarget){const e=!nametagsEnabled;await IPC.updateAgentNametags(settingsTarget.id,e);setNametagsEnabled(e);}}}
            style={{padding:'4px 12px',borderRadius:'4px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,
            background:nametagsEnabled?'#2d5e2d':'#2d2d5e',color:nametagsEnabled?'#6fcf6f':'#888'}}>
            {nametagsEnabled?'ON':'OFF'}
          </button>
        </div>
        <label style={{marginTop:20}}>Model</label>
        <div style={{display:'flex',gap:8,marginTop:4}}>
          <button onClick={()=>{handleToggleModel(settingsTarget.id,settingsTarget.model||'deepseek-v4-flash');setSettingsTarget({...settingsTarget,model:(settingsTarget.model||'deepseek-v4-flash').includes('pro')?'deepseek-v4-flash':'deepseek-v4-pro'});}}
            style={{flex:1,padding:'8px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:600,
            background:(settingsTarget.model||'deepseek-v4-flash').includes('pro')?'#5e2d2d':'#2d5e2d',
            color:(settingsTarget.model||'deepseek-v4-flash').includes('pro')?'#cf6f6f':'#6fcf6f'}}>
            {(settingsTarget.model||'deepseek-v4-flash').includes('pro')?'Pro (click for Flash)':'Flash (click for Pro)'}
          </button>
        </div>
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid #2a2a4a'}}>
          <button onClick={()=>{setSettingsTarget(null);setDeleteTarget(settingsTarget);}}
            style={{width:'100%',padding:'8px',background:'#5e2d2d',color:'#cf6f6f',border:'1px solid #cf6f6f',borderRadius:'6px',cursor:'pointer',fontSize:'13px',fontWeight:600}}>
            Delete Agent
          </button>
        </div>
        <div className="modal-buttons" style={{marginTop:12}}><button onClick={()=>setSettingsTarget(null)}>Close</button></div>
      </div></div>)}
      {deleteTarget && (<div className="modal-overlay" onClick={()=>setDeleteTarget(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Delete Agent</h2><p style={{margin:'12px 0',fontSize:'13px'}}>Delete <strong>{deleteTarget.name}</strong>? This moves their directory to trash.</p>
        <div className="modal-buttons"><button onClick={handleDeleteAgent} style={{background:'#cf6f6f',color:'#1a1a2e',padding:'8px 18px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:600}}>Delete</button><button onClick={()=>setDeleteTarget(null)} style={{background:'#2d2d5e',color:'#e0e0e0',padding:'8px 18px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'13px'}}>Cancel</button></div>
      </div></div>)}
      {showImportModal && (<div className="modal-overlay" onClick={()=>setShowImportModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Import Agent</h2>
        <label>Name</label><input type="text" value={importName} onChange={e=>setImportName(e.target.value)} placeholder="Agent name" autoFocus/>
        <label>Room (optional)</label><input type="text" value={importRoom} onChange={e=>setImportRoom(e.target.value)} placeholder={importName?importName+"'s Room":''}/>
        <label>Context File</label><div style={{display:'flex',gap:8,marginBottom:12}}><button onClick={handleSelectImportFile} style={{padding:'6px 14px',background:'#2d2d5e',color:'#e0e0e0',border:'1px solid #444',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}>{importFilePath?'Change File':'Select File'}</button><span style={{fontSize:'12px',color:'#888',alignSelf:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{importFilePath?importFilePath.split('\\').pop():'No file selected'}</span></div>
        <label>Identity Anchor (optional)</label><textarea value={importIdentity} onChange={e=>setImportIdentity(e.target.value)} placeholder="Write a brief identity description..." rows={4}/>
        <div className="modal-buttons"><button onClick={handleImportAgent} disabled={!importName.trim()||!importFilePath}>Import</button><button onClick={()=>setShowImportModal(false)}>Cancel</button></div>
      </div></div>)}
      {showIdentityModal && (<div className="modal-overlay" onClick={()=>setShowIdentityModal(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{width:'600px'}}>
        <h2>Edit Identity — {settingsTarget?.name}</h2>
        <textarea value={identityText} onChange={e=>setIdentityText(e.target.value)} style={{width:'100%',minHeight:'300px',padding:'10px',background:'#0d0d1a',color:'#e0e0e0',border:'1px solid #444',borderRadius:'4px',fontSize:'13px',fontFamily:'Consolas,monospace',resize:'vertical'}}/>
        <div className="modal-buttons">
          <button onClick={async()=>{if(IPC&&settingsTarget){await IPC.updateAgentIdentity(settingsTarget.id,identityText);setShowIdentityModal(false);}}}>Save</button>
          <button onClick={()=>setShowIdentityModal(false)}>Cancel</button>
        </div>
      </div></div>)}
      {showCreateModal && (<div className="modal-overlay" onClick={()=>setShowCreateModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
        <h2>Create New Agent</h2>
        <label>Name</label><input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Agent name" autoFocus/>
        <label>Room (optional)</label><input type="text" value={newRoom} onChange={e=>setNewRoom(e.target.value)} placeholder={newName?newName+"'s Room":''}/>
        <label>Identity Anchor (optional)</label><textarea value={newIdentity} onChange={e=>setNewIdentity(e.target.value)} placeholder="Write a brief identity description..." rows={4}/>
        <div className="modal-buttons"><button onClick={handleCreateAgent} disabled={!newName.trim()}>Create</button><button onClick={()=>setShowCreateModal(false)}>Cancel</button></div>
      </div></div>)}
    </div>
  );
}