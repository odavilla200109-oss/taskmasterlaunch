/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                   TASKMASTER v1.0                           ║
 * ║          Frontend — conectado ao backend real               ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Dependências extras no seu projeto Vite/React:             ║
 * ║    npm install @react-oauth/google                          ║
 * ║                                                             ║
 * ║  No main.jsx, envolva com:                                  ║
 * ║    import { GoogleOAuthProvider } from "@react-oauth/google"║
 * ║    <GoogleOAuthProvider clientId="SEU_GOOGLE_CLIENT_ID">   ║
 * ║      <App />                                                ║
 * ║    </GoogleOAuthProvider>                                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { useState, useRef, useCallback, useEffect, createContext, useContext } from "react";
import { useGoogleLogin } from "@react-oauth/google";

// ═══════════════════════════════════════════════════════
//  CONFIGURAÇÃO DA API
// ═══════════════════════════════════════════════════════
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Lê/escreve token no localStorage
const TokenStore = {
  get:    ()    => localStorage.getItem("tm_token"),
  set:    (t)   => localStorage.setItem("tm_token", t),
  clear:  ()    => localStorage.removeItem("tm_token"),
};

// Wrapper de fetch autenticado
async function apiFetch(path, options = {}) {
  const token = TokenStore.get();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ═══════════════════════════════════════════════════════
//  UTILITÁRIOS
// ═══════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2, 9);
const PRIORITY_ORDER = ["none","low","medium","high"];
const PRIORITY_COLOR = { none:"#a7f3d0", low:"#34d399", medium:"#f59e0b", high:"#ef4444" };
const PRIORITY_ICON  = { none:"○", low:"↓", medium:"◆", high:"▲" };
const PRIORITY_LABEL = { none:"Sem Prioridade", low:"Baixa", medium:"Média", high:"Alta" };
const NODE_W = 210, NODE_H = 96;

const SUBTITLES = [
  "Organize suas ideias de maneira fácil.",
  "Ferramenta de Brainstorm e Task List gratuita.",
  "Transforme caos em clareza, um nó por vez.",
  "Planejamento visual que flui com você.",
  "Do pensamento à execução, sem fricção.",
  "Suas tarefas, do seu jeito.",
];

function getDescendants(nodes, id) {
  const found = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((n) => {
      if (n.parentId && found.has(n.parentId) && !found.has(n.id)) {
        found.add(n.id); changed = true;
      }
    });
  }
  return found;
}

// ═══════════════════════════════════════════════════════
//  CONTEXTO GLOBAL
// ═══════════════════════════════════════════════════════
const AppCtx = createContext(null);

// ═══════════════════════════════════════════════════════
//  HOOK: Fundo animado
// ═══════════════════════════════════════════════════════
function useAnimatedBg(ref) {
  const targetHue = useRef(145), currHue = useRef(145), raf = useRef(null);
  useEffect(() => {
    const tick = () => {
      currHue.current += (targetHue.current - currHue.current) * 0.025;
      const h = currHue.current;
      if (ref.current) {
        ref.current.style.background = `
          radial-gradient(ellipse 80% 60% at 20% 30%,hsl(${h},85%,94%) 0%,transparent 60%),
          radial-gradient(ellipse 60% 80% at 80% 70%,hsl(${h+25},70%,96%) 0%,transparent 60%),
          hsl(${h+10},50%,98%)`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [ref]);
  return useCallback((e) => { targetHue.current = 128 + (e.clientX / window.innerWidth) * 40; }, []);
}

// ═══════════════════════════════════════════════════════
//  COMPONENTE: Partículas de conclusão
// ═══════════════════════════════════════════════════════
function BurstEffect({ x, y }) {
  return (
    <>
      {[0,72,144,216,288].map((angle, i) => {
        const rad=angle*Math.PI/180, tx=Math.cos(rad)*60, ty=Math.sin(rad)*60;
        return <div key={i} style={{
          position:"absolute",left:x,top:y,width:8,height:8,borderRadius:"50%",
          pointerEvents:"none",zIndex:9999,transform:"translate(-50%,-50%)",
          background:["#10b981","#34d399","#6ee7b7","#fbbf24","#a7f3d0"][i],
          animation:`tmB${i} .7s ease-out forwards`,
        }}/>;
        void tx; void ty;
      })}
      <style>{[0,72,144,216,288].map((angle,i)=>{
        const rad=angle*Math.PI/180,tx=Math.cos(rad)*60,ty=Math.sin(rad)*60;
        return `@keyframes tmB${i}{0%{transform:translate(-50%,-50%)scale(1);opacity:1}100%{transform:translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px))scale(0);opacity:0}}`;
      }).join("")}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════
//  COMPONENTE: Nó de tarefa
// ═══════════════════════════════════════════════════════
function NodeCard({ node, isEditing, editVal, setEditVal, onFinishEdit, onStartEdit,
                    onDelete, onComplete, onCyclePriority, onAddChild, onDragStart, isNew }) {
  const inputRef = useRef(null);
  const [pop, setPop] = useState(false);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  const handleComplete = () => {
    if (!node.completed) { setPop(true); setTimeout(()=>setPop(false),400); }
    onComplete();
  };
  const pc = PRIORITY_COLOR[node.priority];

  return (
    <div onMouseDown={onDragStart} onDoubleClick={(e)=>{e.stopPropagation();onStartEdit();}}
      style={{
        position:"absolute",left:node.x,top:node.y,width:NODE_W,borderRadius:16,
        background:node.completed?"rgba(240,253,244,0.96)":"rgba(255,255,255,0.97)",
        border:`2px solid ${node.completed?"#86efac":pc}`,
        boxShadow:node.completed?"0 4px 16px rgba(16,185,129,0.1)":`0 4px 24px rgba(16,185,129,0.18),0 1px 4px rgba(0,0,0,0.06)`,
        cursor:"grab",willChange:"transform",transition:"box-shadow .2s,transform .2s",
        animation:isNew?"tmNodeIn .35s cubic-bezier(.34,1.56,.64,1) forwards":"none",
      }} className="tm-node">
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:5,borderRadius:"16px 0 0 16px",background:pc,transition:"background .3s"}}/>
      <div style={{padding:"11px 12px 8px 18px",minHeight:48}}>
        {isEditing ? (
          <input ref={inputRef} value={editVal} onChange={(e)=>setEditVal(e.target.value)}
            onBlur={()=>onFinishEdit(editVal)}
            onKeyDown={(e)=>{if(e.key==="Enter")onFinishEdit(editVal);if(e.key==="Escape")onFinishEdit(node.title||"");}}
            onMouseDown={(e)=>e.stopPropagation()} placeholder="Nome da tarefa..."
            style={{width:"100%",border:"none",outline:"none",background:"transparent",
              fontFamily:"'DM Sans',sans-serif",fontWeight:500,fontSize:13,color:"#064e3b"}}/>
        ) : (
          <div style={{fontWeight:500,fontSize:13,color:node.completed?"#6b7280":"#064e3b",
            textDecoration:node.completed?"line-through":"none",lineHeight:1.45,wordBreak:"break-word"}}>
            {node.title||<span style={{color:"#9ca3af",fontStyle:"italic",fontWeight:400}}>Duplo clique para editar</span>}
          </div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:2,padding:"4px 8px 8px 14px",borderTop:"1px solid rgba(16,185,129,0.12)"}}>
        <button title={`Prioridade: ${PRIORITY_LABEL[node.priority]}`}
          onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onCyclePriority();}}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:node.priority!=="none"?pc:"#9ca3af",borderRadius:6,padding:"3px 6px",fontWeight:700}}>
          {PRIORITY_ICON[node.priority]}
        </button>
        <button title="Adicionar subtarefa" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onAddChild();}}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:"#10b981",borderRadius:6,padding:"2px 6px",fontWeight:600,lineHeight:1}}>
          ＋
        </button>
        <div style={{flex:1}}/>
        <button title="Excluir" onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();onDelete();}}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#f87171",borderRadius:6,padding:"3px 6px"}}>✕</button>
        <button title={node.completed?"Desmarcar":"Concluir"} onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();handleComplete();}}
          style={{
            background:node.completed?"#10b981":"none",border:`2px solid ${node.completed?"#10b981":"#d1fae5"}`,
            cursor:"pointer",fontSize:11,color:node.completed?"white":"#10b981",
            borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",
            transition:"all .2s",transform:pop?"scale(1.5)":"scale(1)",fontWeight:700,
          }}>
          {node.completed?"✓":""}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  TELA: App (canvas)
// ═══════════════════════════════════════════════════════
function AppScreen() {
  const { user, setScreen, canvasId } = useContext(AppCtx);
  const [nodes,  setNodes]  = useState([]);
  const [past,   setPast]   = useState([]);
  const [future, setFuture] = useState([]);
  const [scale,  setScale]  = useState(1);
  const [pan,    setPan]    = useState({ x:0, y:0 });
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState("");
  const [bursts, setBursts]   = useState([]);
  const [newId,  setNewId]    = useState(null);
  const [saving, setSaving]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [error,  setError]    = useState(null);

  const panRef    = useRef({x:0,y:0}), scaleRef = useRef(1);
  const wrapRef   = useRef(null), bgRef = useRef(null);
  const isPanning = useRef(false), lastMouse = useRef({x:0,y:0});
  const dragging  = useRef(null), dragSaved = useRef(false);
  const nodesRef  = useRef(nodes);
  const saveTimer = useRef(null);

  nodesRef.current = nodes;
  useEffect(()=>{ panRef.current   = pan;   },[pan]);
  useEffect(()=>{ scaleRef.current = scale; },[scale]);

  const onBgMove = useAnimatedBg(bgRef);

  // ── Carregar nós ─────────────────────────────────────
  useEffect(() => {
    if (!canvasId) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/canvases/${canvasId}/nodes`)
      .then((data) => { setNodes(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [canvasId]);

  // ── Auto-save ─────────────────────────────────────────
  useEffect(() => {
    if (!canvasId || loading) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch(`/api/canvases/${canvasId}/nodes`, { method:"PUT", body: { nodes } });
      } catch (e) { console.error("Erro ao salvar:", e); }
      setSaving(false);
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [nodes, canvasId, loading]);

  // ── Histórico ─────────────────────────────────────────
  const saveHistory = useCallback((next) => {
    setPast((p)=>[...p.slice(-40), nodesRef.current]);
    setFuture([]);
    setNodes(next);
  }, []);

  const undo = useCallback(() => setPast((p)=>{
    if(!p.length) return p;
    const prev=p[p.length-1];
    setFuture((f)=>[nodesRef.current,...f]);
    setNodes(prev);
    return p.slice(0,-1);
  }), []);

  const redo = useCallback(() => setFuture((f)=>{
    if(!f.length) return f;
    const next=f[0];
    setPast((p)=>[...p,nodesRef.current]);
    setNodes(next);
    return f.slice(1);
  }), []);

  useEffect(() => {
    const h=(e)=>{
      if(e.target.tagName==="INPUT") return;
      if((e.ctrlKey||e.metaKey)&&e.key==="z"){e.preventDefault();undo();}
      if((e.ctrlKey||e.metaKey)&&(e.key==="y"||(e.shiftKey&&e.key==="z"))){e.preventDefault();redo();}
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[undo,redo]);

  // ── Nós ───────────────────────────────────────────────
  const addNode = useCallback((parentId=null, cx=null, cy=null)=>{
    const id=uid();
    const w=wrapRef.current?.clientWidth??800, h=wrapRef.current?.clientHeight??600;
    let x=cx??(-panRef.current.x+w/2)/scaleRef.current-NODE_W/2;
    let y=cy??(-panRef.current.y+h/2)/scaleRef.current-NODE_H/2;
    if(parentId){
      const parent=nodesRef.current.find((n)=>n.id===parentId);
      const siblings=nodesRef.current.filter((n)=>n.parentId===parentId).length;
      if(parent){x=parent.x+(siblings-.5)*(NODE_W+30);y=parent.y+NODE_H+70;}
    }
    saveHistory([...nodesRef.current,{id,title:"",x,y,priority:"none",completed:false,parentId}]);
    setEditingId(id);setEditVal("");setNewId(id);setTimeout(()=>setNewId(null),500);
  },[saveHistory]);

  const finishEdit = useCallback((id,title)=>{
    if(!title.trim()) saveHistory(nodesRef.current.filter((n)=>n.id!==id));
    else saveHistory(nodesRef.current.map((n)=>n.id===id?{...n,title}:n));
    setEditingId(null);
  },[saveHistory]);

  const deleteNode = useCallback((id)=>{
    const del=getDescendants(nodesRef.current,id);
    saveHistory(nodesRef.current.filter((n)=>!del.has(n.id)));
  },[saveHistory]);

  const completeNode = useCallback((id)=>{
    const node=nodesRef.current.find((n)=>n.id===id);
    if(!node) return;
    const done=!node.completed;
    saveHistory(nodesRef.current.map((n)=>n.id===id?{...n,completed:done}:n));
    if(done){
      const bId=uid();
      setBursts((b)=>[...b,{id:bId,x:node.x+NODE_W/2,y:node.y+NODE_H/2}]);
      setTimeout(()=>setBursts((b)=>b.filter((x)=>x.id!==bId)),800);
    }
  },[saveHistory]);

  const cyclePriority = useCallback((id)=>{
    const node=nodesRef.current.find((n)=>n.id===id);
    if(!node) return;
    const next=PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(node.priority)+1)%PRIORITY_ORDER.length];
    saveHistory(nodesRef.current.map((n)=>n.id===id?{...n,priority:next}:n));
  },[saveHistory]);

  // ── Canvas ────────────────────────────────────────────
  const onWheel = useCallback((e)=>{
    e.preventDefault();
    const rect=wrapRef.current.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const factor=e.deltaY<0?1.1:0.9;
    const oldS=scaleRef.current, newS=Math.min(Math.max(oldS*factor,0.15),4);
    const ratio=newS/oldS;
    setPan((p)=>({x:mx-(mx-p.x)*ratio,y:my-(my-p.y)*ratio}));
    setScale(newS);
  },[]);

  const onCanvasDown = useCallback((e)=>{
    if(e.button!==0) return;
    if(e.target===wrapRef.current||e.target.dataset.canvas){
      isPanning.current=true; lastMouse.current={x:e.clientX,y:e.clientY};
    }
  },[]);

  const startDrag = useCallback((e,id)=>{
    if(e.button!==0) return; e.stopPropagation();
    const node=nodesRef.current.find((n)=>n.id===id); if(!node) return;
    const rect=wrapRef.current.getBoundingClientRect();
    const mx=(e.clientX-rect.left-panRef.current.x)/scaleRef.current;
    const my=(e.clientY-rect.top-panRef.current.y)/scaleRef.current;
    dragging.current={id,ox:mx-node.x,oy:my-node.y}; dragSaved.current=false;
  },[]);

  const onMouseMove = useCallback((e)=>{
    onBgMove(e);
    const drag=dragging.current;
    if(drag){
      if(!dragSaved.current){setPast((p)=>[...p.slice(-40),nodesRef.current]);setFuture([]);dragSaved.current=true;}
      const rect=wrapRef.current?.getBoundingClientRect(); if(!rect) return;
      const mx=(e.clientX-rect.left-panRef.current.x)/scaleRef.current;
      const my=(e.clientY-rect.top-panRef.current.y)/scaleRef.current;
      setNodes((ns)=>ns.map((n)=>n.id===drag.id?{...n,x:mx-drag.ox,y:my-drag.oy}:n));
      return;
    }
    if(isPanning.current){
      setPan((p)=>({x:p.x+(e.clientX-lastMouse.current.x),y:p.y+(e.clientY-lastMouse.current.y)}));
      lastMouse.current={x:e.clientX,y:e.clientY};
    }
  },[onBgMove]);

  const onMouseUp   = useCallback(()=>{dragging.current=null;isPanning.current=false;},[]);
  const onDblClick  = useCallback((e)=>{
    if(!e.target.dataset.canvas&&e.target!==wrapRef.current) return;
    const rect=wrapRef.current.getBoundingClientRect();
    const x=(e.clientX-rect.left-panRef.current.x)/scaleRef.current-NODE_W/2;
    const y=(e.clientY-rect.top-panRef.current.y)/scaleRef.current-NODE_H/2;
    addNode(null,x,y);
  },[addNode]);

  // ── Toolbar ───────────────────────────────────────────
  const organizeByPriority = useCallback(()=>{
    const order=["high","medium","low","none"];
    const roots=nodes.filter((n)=>!n.parentId).sort((a,b)=>order.indexOf(a.priority)-order.indexOf(b.priority));
    const next=[...nodes];
    roots.forEach((node,i)=>{const idx=next.findIndex((n)=>n.id===node.id);next[idx]={...next[idx],x:i*(NODE_W+50),y:80};});
    saveHistory(next);
  },[nodes,saveHistory]);

  const makeIndependent = useCallback(()=>saveHistory(nodes.map((n)=>({...n,parentId:null}))),[nodes,saveHistory]);

  const exportCanvas = useCallback(()=>{
    const blob=new Blob([JSON.stringify({nodes,version:1},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url;a.download="taskmaster-canvas.json";a.click();URL.revokeObjectURL(url);
  },[nodes]);

  const importCanvas = useCallback(()=>{
    const input=document.createElement("input");input.type="file";input.accept=".json";
    input.onchange=(e)=>{
      const file=e.target.files[0];if(!file)return;
      const reader=new FileReader();
      reader.onload=(ev)=>{try{const d=JSON.parse(ev.target.result);saveHistory(d.nodes||[]);}catch{}};
      reader.readAsText(file);
    };input.click();
  },[saveHistory]);

  const handleLogout = async () => {
    try { await apiFetch("/api/auth/logout",{method:"POST"}); } catch {}
    TokenStore.clear();
    setScreen("login");
  };

  const connections = nodes
    .filter((n)=>n.parentId&&nodes.find((p)=>p.id===n.parentId))
    .map((n)=>({child:n,parent:nodes.find((p)=>p.id===n.parentId)}));

  if (loading) return (
    <div style={{width:"100%",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"hsl(145,50%,98%)",fontFamily:"'DM Sans',sans-serif",color:"#059669",fontSize:15}}>
      <span style={{animation:"tmSpin 1s linear infinite",display:"inline-block",marginRight:10,fontSize:20}}>⟳</span>
      Carregando seu workspace…
    </div>
  );

  if (error) return (
    <div style={{width:"100%",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",background:"hsl(145,50%,98%)",fontFamily:"'DM Sans',sans-serif",gap:12}}>
      <div style={{fontSize:32}}>⚠️</div>
      <div style={{color:"#b91c1c",fontWeight:500}}>Erro ao carregar: {error}</div>
      <button onClick={()=>window.location.reload()}
        style={{background:"#10b981",color:"white",border:"none",borderRadius:10,padding:"9px 20px",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>
        Tentar novamente
      </button>
    </div>
  );

  return (
    <div ref={bgRef} style={{width:"100%",height:"100vh",overflow:"hidden",position:"relative",userSelect:"none"}}>
      {/* HEADER */}
      <header style={{
        position:"fixed",top:0,left:0,right:0,zIndex:1000,
        display:"flex",alignItems:"center",gap:8,padding:"10px 20px",
        backdropFilter:"blur(24px) saturate(160%)",background:"rgba(255,255,255,0.72)",
        borderBottom:"1.5px solid rgba(16,185,129,0.18)",
        boxShadow:"0 2px 24px rgba(16,185,129,0.1)",fontFamily:"'DM Sans',sans-serif",
      }}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:"#064e3b",letterSpacing:-1,display:"flex",alignItems:"baseline",gap:2}}>
          TM<span style={{fontSize:10,fontFamily:"'DM Sans',sans-serif",fontWeight:400,color:"#6ee7b7",marginLeft:4,letterSpacing:2,textTransform:"uppercase"}}>taskmaster</span>
        </div>
        <div style={{width:1,height:26,background:"rgba(16,185,129,0.25)",margin:"0 4px"}}/>
        <button className="tm-hbtn" onClick={()=>addNode()}
          style={{background:"linear-gradient(135deg,#10b981 0%,#059669 100%)",color:"white",border:"none",cursor:"pointer",borderRadius:10,padding:"7px 16px",fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:13,boxShadow:"0 2px 8px rgba(16,185,129,0.3)"}}>
          + Nova Tarefa
        </button>
        {[{label:"↩",title:"Desfazer",action:undo,enabled:past.length>0},{label:"↪",title:"Refazer",action:redo,enabled:future.length>0}].map((b)=>(
          <button key={b.label} className="tm-hbtn" onClick={b.action} disabled={!b.enabled} title={b.title}
            style={{background:"rgba(16,185,129,0.1)",color:"#065f46",border:"none",cursor:b.enabled?"pointer":"not-allowed",borderRadius:10,padding:"7px 12px",fontWeight:600,fontSize:14,opacity:b.enabled?1:0.35,fontFamily:"'DM Sans',sans-serif"}}>
            {b.label}
          </button>
        ))}
        <div style={{flex:1}}/>
        {saving&&<span style={{fontSize:11,color:"#6ee7b7",fontFamily:"'DM Sans',sans-serif",animation:"tmPulse 1s ease infinite"}}>● salvando…</span>}
        {[
          {label:"📊 Organizar",action:organizeByPriority,title:"Organizar por prioridade"},
          {label:"⊡ Independentes",action:makeIndependent,title:"Tornar todos independentes"},
          {label:"↑ Exportar",action:exportCanvas,title:"Exportar JSON"},
          {label:"↓ Importar",action:importCanvas,title:"Importar JSON"},
          {label:"🗑 Limpar",action:()=>saveHistory([]),title:"Excluir todos",danger:true},
        ].map((b)=>(
          <button key={b.label} className="tm-hbtn" onClick={b.action} title={b.title}
            style={{background:b.danger?"rgba(239,68,68,0.08)":"rgba(16,185,129,0.08)",color:b.danger?"#b91c1c":"#065f46",border:"none",cursor:"pointer",borderRadius:10,padding:"7px 13px",fontFamily:"'DM Sans',sans-serif",fontWeight:500,fontSize:12.5}}>
            {b.label}
          </button>
        ))}
        <div style={{width:1,height:26,background:"rgba(16,185,129,0.2)",margin:"0 4px"}}/>
        {user&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {user.photo
              ? <img src={user.photo} alt="" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover"}}/>
              : <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:13,fontFamily:"'Syne',sans-serif"}}>
                  {user.name?.[0]?.toUpperCase()||"U"}
                </div>
            }
            <span style={{fontSize:13,color:"#065f46",fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>{user.name}</span>
            <button className="tm-hbtn" onClick={handleLogout}
              style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:"4px 8px"}}>
              Sair
            </button>
          </div>
        )}
      </header>

      {/* CANVAS */}
      <div ref={wrapRef} data-canvas="true"
        style={{position:"absolute",inset:0,top:56,overflow:"hidden",cursor:"grab"}}
        onMouseDown={onCanvasDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp} onWheel={onWheel} onDoubleClick={onDblClick}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs>
            <pattern id="tmDots" x={pan.x%(20*scale)} y={pan.y%(20*scale)} width={20*scale} height={20*scale} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={1} fill="rgba(16,185,129,0.15)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tmDots)"/>
        </svg>
        <div data-canvas="true" style={{position:"absolute",top:0,left:0,transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`,transformOrigin:"0 0",width:6000,height:6000}}>
          <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"visible"}}>
            <defs>
              <marker id="tmArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="rgba(16,185,129,0.5)"/>
              </marker>
            </defs>
            {connections.map(({parent,child})=>{
              const x1=parent.x+NODE_W/2,y1=parent.y+NODE_H,x2=child.x+NODE_W/2,y2=child.y,ym=(y1+y2)/2;
              return <path key={`${parent.id}-${child.id}`} d={`M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`}
                fill="none" stroke="rgba(16,185,129,0.45)" strokeWidth={2} strokeDasharray="7 4" markerEnd="url(#tmArrow)"/>;
            })}
          </svg>
          {bursts.map((b)=><BurstEffect key={b.id} x={b.x} y={b.y}/>)}
          {nodes.map((node)=>(
            <NodeCard key={node.id} node={node} isEditing={editingId===node.id} editVal={editVal} setEditVal={setEditVal} isNew={node.id===newId}
              onFinishEdit={(v)=>finishEdit(node.id,v)} onStartEdit={()=>{setEditingId(node.id);setEditVal(node.title);}}
              onDelete={()=>deleteNode(node.id)} onComplete={()=>completeNode(node.id)}
              onCyclePriority={()=>cyclePriority(node.id)} onAddChild={()=>addNode(node.id)} onDragStart={(e)=>startDrag(e,node.id)}/>
          ))}
        </div>
      </div>

      {nodes.length===0&&(
        <div style={{position:"fixed",bottom:48,left:"50%",transform:"translateX(-50%)",
          background:"rgba(255,255,255,0.82)",backdropFilter:"blur(12px)",
          border:"1.5px dashed rgba(16,185,129,0.4)",borderRadius:14,padding:"12px 28px",
          pointerEvents:"none",color:"#059669",fontSize:13.5,fontWeight:500,
          fontFamily:"'DM Sans',sans-serif",boxShadow:"0 4px 20px rgba(16,185,129,0.08)"}}>
          Duplo clique no canvas para criar uma tarefa ✦
        </div>
      )}
      <div style={{position:"fixed",bottom:20,right:20,zIndex:100,background:"rgba(255,255,255,0.8)",
        backdropFilter:"blur(10px)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:10,padding:"5px 12px",
        fontFamily:"'DM Sans',sans-serif",color:"#065f46",fontSize:12,fontWeight:600}}>
        {Math.round(scale*100)}%
      </div>
      {nodes.length>0&&(
        <div style={{position:"fixed",bottom:20,left:20,zIndex:100,background:"rgba(255,255,255,0.8)",
          backdropFilter:"blur(10px)",border:"1px solid rgba(16,185,129,0.2)",borderRadius:10,padding:"5px 14px",
          fontFamily:"'DM Sans',sans-serif",color:"#065f46",fontSize:12,display:"flex",gap:12}}>
          <span>📋 {nodes.length} {nodes.length===1?"tarefa":"tarefas"}</span>
          <span>✓ {nodes.filter((n)=>n.completed).length} concluídas</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  TELA: Login
// ═══════════════════════════════════════════════════════
function TypewriterSubtitle() {
  const [index,setIndex]=useState(0),[displayed,setDisplayed]=useState(""),[phase,setPhase]=useState("typing");
  const timeout=useRef(null);
  useEffect(()=>{
    const current=SUBTITLES[index];
    if(phase==="typing"){
      if(displayed.length<current.length) timeout.current=setTimeout(()=>setDisplayed(current.slice(0,displayed.length+1)),42);
      else timeout.current=setTimeout(()=>setPhase("pause"),2200);
    }else if(phase==="pause"){timeout.current=setTimeout(()=>setPhase("erasing"),400);}
    else if(phase==="erasing"){
      if(displayed.length>0) timeout.current=setTimeout(()=>setDisplayed(displayed.slice(0,-1)),22);
      else{setIndex((i)=>(i+1)%SUBTITLES.length);setPhase("typing");}
    }
    return()=>clearTimeout(timeout.current);
  },[displayed,phase,index]);
  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:"clamp(14px,2vw,19px)",fontWeight:400,
      color:"#065f46cc",minHeight:32,letterSpacing:0.2,display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
      <span>{displayed}</span>
      <span style={{display:"inline-block",width:2,height:"1.1em",background:"#10b981",borderRadius:2,
        marginLeft:2,animation:"tmBlink 1s step-end infinite",verticalAlign:"middle"}}/>
    </div>
  );
}

function FloatingNode({x,y,size,delay}){
  return(
    <div style={{position:"absolute",left:`${x}%`,top:`${y}%`,width:size,borderRadius:12,
      background:"rgba(255,255,255,0.6)",border:"1.5px solid rgba(16,185,129,0.25)",
      boxShadow:"0 4px 20px rgba(16,185,129,0.08)",padding:"10px 14px",pointerEvents:"none",
      backdropFilter:"blur(6px)",animation:`tmFloat 6s ease-in-out ${delay}s infinite`,opacity:0.75}}>
      <div style={{height:8,width:"70%",background:"rgba(16,185,129,0.25)",borderRadius:4,marginBottom:8}}/>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(16,185,129,0.4)"}}/>
        <div style={{height:6,width:"50%",background:"rgba(16,185,129,0.15)",borderRadius:4}}/>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { setUser, setScreen, setCanvasId } = useContext(AppCtx);
  const bgRef=useRef(null);
  const onBgMove=useAnimatedBg(bgRef);
  const [loading,setLoading]=useState(false);
  const [errorMsg,setErrorMsg]=useState(null);

  // Verifica se já tem sessão ativa
  useEffect(()=>{
    const token=TokenStore.get();
    if(!token) return;
    apiFetch("/api/auth/me").then(async(user)=>{
      const canvases=await apiFetch("/api/canvases");
      setUser(user);
      setCanvasId(canvases[0]?.id||null);
      setScreen("app");
    }).catch(()=>TokenStore.clear());
  },[]);

  // Login Google com @react-oauth/google
  const googleLogin = useGoogleLogin({
    onSuccess: async(response)=>{
      // @react-oauth/google retorna access_token; para ID token use flow:"auth-code"
      // Aqui usamos o credential diretamente do prompt One Tap — ajuste conforme seu setup
      setLoading(true); setErrorMsg(null);
      try{
        // Se você usar GoogleLogin (botão), o credential vem direto.
        // Se usar useGoogleLogin com flow:"auth-code", troque por code do backend.
        const {token,user}=await apiFetch("/api/auth/google",{method:"POST",body:{credential:response.credential||response.access_token}});
        TokenStore.set(token);
        const canvases=await apiFetch("/api/canvases");
        setUser(user);
        setCanvasId(canvases[0]?.id||null);
        setScreen("app");
      }catch(e){setErrorMsg(e.message);}
      finally{setLoading(false);}
    },
    onError:()=>setErrorMsg("Login Google falhou. Tente novamente."),
  });

  const handleSkip=()=>{
    setUser({id:"anonymous",name:"Visitante",email:null,photo:null});
    setCanvasId(null);
    setScreen("app");
  };

  const floaters=[{x:4,y:18,size:140,delay:0},{x:88,y:10,size:120,delay:1.2},
    {x:2,y:62,size:130,delay:2.1},{x:85,y:58,size:145,delay:.7},{x:78,y:32,size:110,delay:1.8},{x:10,y:40,size:120,delay:3}];

  return(
    <div ref={bgRef} onMouseMove={onBgMove}
      style={{width:"100%",minHeight:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:"radial-gradient(circle,rgba(16,185,129,0.18) 1px,transparent 1px)",backgroundSize:"24px 24px"}}/>
      {floaters.map((f,i)=><FloatingNode key={i} {...f}/>)}
      <main style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px 40px",position:"relative",zIndex:10,gap:40}}>
        <div style={{textAlign:"center"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(16,185,129,0.12)",
            border:"1px solid rgba(16,185,129,0.3)",borderRadius:100,padding:"5px 14px",marginBottom:20,
            fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:"#059669",letterSpacing:1.5,textTransform:"uppercase"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#10b981",display:"inline-block",
              boxShadow:"0 0 6px #10b981",animation:"tmBlink 2s ease infinite"}}/>
            Gratuito e Open Source
          </div>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:"clamp(58px,10vw,110px)",color:"#064e3b",
            letterSpacing:-3,lineHeight:1,marginBottom:18,textShadow:"0 2px 40px rgba(16,185,129,0.12)",
            animation:"tmFadeUp .7s ease both"}}>
            TaskMaster
          </div>
          <div style={{animation:"tmFadeUp .7s ease .15s both"}}><TypewriterSubtitle/></div>
        </div>

        <div style={{background:"rgba(255,255,255,0.82)",backdropFilter:"blur(24px) saturate(160%)",
          border:"1.5px solid rgba(16,185,129,0.2)",borderRadius:24,padding:"36px 40px",width:"100%",maxWidth:400,
          boxShadow:"0 8px 48px rgba(16,185,129,0.12),0 2px 8px rgba(0,0,0,0.04)",
          display:"flex",flexDirection:"column",gap:14,animation:"tmScaleIn .5s cubic-bezier(.34,1.1,.64,1) .2s both"}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,color:"#064e3b",marginBottom:4,textAlign:"center"}}>Comece agora</div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"#6b7280",textAlign:"center",marginBottom:6}}>Entre com sua conta para salvar seu progresso</div>

          {errorMsg&&(
            <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,
              padding:"10px 14px",fontSize:13,color:"#b91c1c",fontFamily:"'DM Sans',sans-serif",textAlign:"center"}}>
              {errorMsg}
            </div>
          )}

          <button onClick={()=>googleLogin()} disabled={loading} className="tm-hbtn" style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:12,
            background:"linear-gradient(135deg,#10b981 0%,#059669 100%)",color:"white",border:"none",
            cursor:loading?"wait":"pointer",borderRadius:14,padding:"14px 20px",
            fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:15,
            boxShadow:"0 4px 16px rgba(16,185,129,0.3)",width:"100%",opacity:loading?0.8:1}}>
            {loading
              ?<span style={{animation:"tmSpin 1s linear infinite",display:"inline-block"}}>⟳</span>
              :<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#fff" d="M44.5 20H24v8h11.7C34.1 33.1 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.2-2.7-.5-4z"/></svg>
            }
            {loading?"Entrando…":"Entrar com Google"}
          </button>

          <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
            <div style={{flex:1,height:1,background:"rgba(16,185,129,0.15)"}}/>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#9ca3af",fontWeight:500}}>ou</span>
            <div style={{flex:1,height:1,background:"rgba(16,185,129,0.15)"}}/>
          </div>

          <button onClick={handleSkip} className="tm-hbtn" style={{
            background:"rgba(16,185,129,0.06)",color:"#059669",border:"1.5px dashed rgba(16,185,129,0.35)",
            cursor:"pointer",borderRadius:14,padding:"13px 20px",
            fontFamily:"'DM Sans',sans-serif",fontWeight:500,fontSize:14,width:"100%"}}>
            Usar sem fazer login →
          </button>

          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:11.5,color:"#9ca3af",textAlign:"center",lineHeight:1.6}}>
            Sem login, seu workspace não será salvo entre sessões.
          </p>
        </div>
      </main>

      <footer style={{position:"relative",zIndex:10,borderTop:"1px solid rgba(16,185,129,0.15)",
        background:"rgba(255,255,255,0.5)",backdropFilter:"blur(12px)",padding:"20px 40px",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#064e3b",letterSpacing:-0.5}}>
          TaskMaster<span style={{fontFamily:"'DM Sans',sans-serif",fontWeight:400,fontSize:12,color:"#6ee7b7",marginLeft:8,letterSpacing:2,textTransform:"uppercase",verticalAlign:"middle"}}>TM</span>
        </div>
        <div style={{fontSize:12.5,color:"#9ca3af"}}>Organize. Priorize. Conquiste.</div>
        <div style={{fontSize:12,color:"#9ca3af",display:"flex",gap:16,alignItems:"center"}}>
          <span>© {new Date().getFullYear()} TaskMaster</span>
          <span style={{color:"#d1fae5"}}>·</span><span>Gratuito para sempre</span>
          <span style={{color:"#d1fae5"}}>·</span><span>Feito com 💚</span>
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  GLOBAL STYLES
// ═══════════════════════════════════════════════════════
const GlobalStyles=()=>(
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800;900&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    @keyframes tmBlink{0%,100%{opacity:1}50%{opacity:0}}
    @keyframes tmFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-14px) rotate(1deg)}}
    @keyframes tmFadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes tmScaleIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
    @keyframes tmNodeIn{0%{opacity:0;transform:scale(.7)}100%{opacity:1;transform:scale(1)}}
    @keyframes tmPulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes tmSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    .tm-node:hover{box-shadow:0 8px 32px rgba(16,185,129,0.28),0 2px 8px rgba(0,0,0,0.07)!important;transform:translateY(-2px);}
    .tm-node:active{cursor:grabbing!important;}
    .tm-hbtn{transition:all .18s cubic-bezier(.4,0,.2,1);}
    .tm-hbtn:hover{transform:translateY(-2px);filter:brightness(1.06);}
    .tm-hbtn:active{transform:translateY(0);}
    ::-webkit-scrollbar{display:none;}
  `}</style>
);

// ═══════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════
export default function TaskMasterApp(){
  const [screen,setScreen]=useState("login");
  const [user,setUser]=useState(null);
  const [canvasId,setCanvasId]=useState(null);
  return(
    <AppCtx.Provider value={{user,setUser,screen,setScreen,canvasId,setCanvasId}}>
      <GlobalStyles/>
      {screen==="login"?<LoginScreen/>:<AppScreen/>}
    </AppCtx.Provider>
  );
}
