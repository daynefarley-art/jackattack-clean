import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Plus, Minus, RefreshCw, Settings, Trophy, Timer, Undo2, Send } from "lucide-react";

// Minimal UI helpers (unstyled, but functional)
function Button({ children, className = "", ...props }) {
  return <button style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12, marginRight:8}} {...props}>{children}</button>;
}
function Input(props) { return <input style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12}} {...props}/> }
function Card({ children }) { return <div style={{border:'1px solid #eee', borderRadius:16, padding:16, marginBottom:12}}>{children}</div> }
function Label({ children }) { return <div style={{fontSize:12, opacity:.8, marginBottom:4}}>{children}</div> }

// Defaults
const DEFAULTS = { ends: 10, scoring: { toucher: 3, crossoverShot: 3, rankPoints: { first: 10, second: 5, third: 3 } } };

// Local storage hook
function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

// CSV helpers
function csvEscape(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function rowsToCSV(rows){return rows.map(r=>r.map(csvEscape).join(",")).join("\n")}
function downloadCSV(filename, rows){const csv=rowsToCSV(rows);const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}

// Scoring for a single end
function scoreEnd(end, cfg){
  const S = cfg.scoring;
  let a = 0, b = 0; const detail = [];
  if (end.aTouchers>0) { a += end.aTouchers * S.toucher; detail.push(`A touchers ${end.aTouchers}×${S.toucher}`); }
  if (end.bTouchers>0) { b += end.bTouchers * S.toucher; detail.push(`B touchers ${end.bTouchers}×${S.toucher}`); }
  if (end.crossoverShot === 'A') { a += S.crossoverShot; detail.push(`Crossover shot A +${S.crossoverShot}`); }
  else if (end.crossoverShot === 'B') { b += S.crossoverShot; detail.push(`Crossover shot B +${S.crossoverShot}`); }
  else if (end.crossoverShot === 'Both') { a += S.crossoverShot; b += S.crossoverShot; detail.push(`Crossover shot undecided +${S.crossoverShot} each`); }

  const { first, second, third } = S.rankPoints;
  if (end.first === 'A') { a += first; } else if (end.first === 'B') { b += first; }
  if (end.second === 'A') { a += second; } else if (end.second === 'B') { b += second; }
  if (end.third === 'A') { a += third; } else if (end.third === 'B') { b += third; }

  const ultimate = (end.first && end.second && end.third) && (end.first === end.second && end.second === end.third);
  if (ultimate) detail.push(`Ultimate End (${first+second+third} pts sweep)`);

  const adjA = Number(end.adjA||0); const adjB = Number(end.adjB||0);
  if (adjA) { a += adjA; detail.push(`Adj A ${adjA>0?'+':''}${adjA}`); }
  if (adjB) { b += adjB; detail.push(`Adj B ${adjB>0?'+':''}${adjB}`); }

  return { a, b, detail: detail.join('; '), ultimate };
}

function buildCSVRows(teams, ends, cfg){
  const header=["End","A touchers","B touchers","Crossover shot","1st","2nd","3rd","Adj A","Adj B","Notes",`${teams.A} pts`,`${teams.B} pts`,`Detail`];
  const rows=[header];
  const totals = ends.reduce((acc,e)=>{const r=scoreEnd(e,cfg);acc.a+=r.a;acc.b+=r.b;return acc},{a:0,b:0});
  ends.forEach(e=>{const r=scoreEnd(e,cfg);rows.push([e.number,e.aTouchers,e.bTouchers,e.crossoverShot||'',e.first||'',e.second||'',e.third||'',e.adjA||0,e.adjB||0,e.notes||'',r.a,r.b,r.detail])});
  rows.push(["Totals","","","","","","","","","",String(totals.a),String(totals.b),""]);
  return rows;
}

export default function App(){
  const [teams, setTeams] = useLocalStorage('jackattack.teams', { A: 'Team A', B: 'Team B' });
  const [cfg, setCfg] = useLocalStorage('jackattack.cfg', DEFAULTS);
  const [meta, setMeta] = useLocalStorage('jackattack.meta', { ends: DEFAULTS.ends, timerSec: 0 });
  const [ends, setEnds] = useLocalStorage('jackattack.ends', []);
  const [history, setHistory] = useState([]);

  useEffect(()=>{const id=setInterval(()=>setMeta(m=>({...m,timerSec:m.timerSec+1})),1000);return()=>clearInterval(id)},[]);
  const timeStr = useMemo(()=>{const s=meta.timerSec;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;const pad=x=>String(x).padStart(2,'0');return `${pad(h)}:${pad(m)}:${pad(sec)}`},[meta.timerSec]);

  const totals = useMemo(()=>ends.reduce((acc,e)=>{const r=scoreEnd(e,cfg);acc.a+=r.a;acc.b+=r.b;return acc},{a:0,b:0}),[ends,cfg]);

  async function sendDirect(){
    const to = "jackattackfarley@gmail.com";
    const rows = buildCSVRows(teams, ends, cfg);
    const csv = rowsToCSV(rows);
    const subject = `Final score: ${teams.A} vs ${teams.B}`;
    const filename = `jackattack_${teams.A}_vs_${teams.B}.csv`.replace(/\s+/g,'_');
    try {
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, csv, filename })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Send failed');
      alert('Email sent! Check the inbox.');
    } catch (e) {
      alert('Send failed: ' + (e?.message || 'Unknown error'));
    }
  }

  function pushHistory(){setHistory(h=>[...h,{teams:JSON.stringify(teams),cfg:JSON.stringify(cfg),meta:JSON.stringify(meta),ends:JSON.stringify(ends)}].slice(-50))}
  function undo(){const last=history[history.length-1];if(!last)return;setHistory(history.slice(0,-1));setTeams(JSON.parse(last.teams));setCfg(JSON.parse(last.cfg));setMeta(JSON.parse(last.meta));setEnds(JSON.parse(last.ends));}
  function reset(){if(!confirm('Reset match?'))return;pushHistory();setTeams({A:'Team A',B:'Team B'});setCfg(DEFAULTS);setMeta({ends:DEFAULTS.ends,timerSec:0});setEnds([])}

  function addEnd(){pushHistory();setEnds([...ends,{number: ends.length+1,aTouchers:0,bTouchers:0,crossoverShot:'None',first:'',second:'',third:'',notes:'',adjA:0, adjB:0}])}
  function updateEnd(i,patch){pushHistory();setEnds(prev=>prev.map((e,idx)=>idx===i?{...e,...patch}:e))}
  function removeLast(){if(!ends.length)return;pushHistory();setEnds(ends.slice(0,-1))}

  function exportCSV(){const rows=buildCSVRows(teams,ends,cfg);downloadCSV(`jackattack_${teams.A}_vs_${teams.B}.csv`,rows)}

  return (
    <div style={{padding:24, maxWidth:980, margin:'0 auto', fontFamily:'system-ui, sans-serif'}}>
      <motion.h1 layout style={{fontSize:28, fontWeight:600, marginBottom:12, display:'flex', alignItems:'center', gap:8}}>
        <Trophy size={24}/> Jack Attack Scorer
      </motion.h1>

      <div style={{display:'grid', gridTemplateColumns:'repeat(3, minmax(0,1fr))', gap:12, marginBottom:16}}>
        <Card>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <Label>Teams</Label>
            <Button onClick={()=>{pushHistory();setTeams({A:'Team A',B:'Team B'})}}>Reset</Button>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div><Label>A</Label><Input value={teams.A} onChange={e=>{pushHistory();setTeams({...teams,A:e.target.value})}}/></div>
            <div><Label>B</Label><Input value={teams.B} onChange={e=>{pushHistory();setTeams({...teams,B:e.target.value})}}/></div>
          </div>
          <div style={{marginTop:12}}>
            <Button onClick={exportCSV}><Download size={16} style={{marginRight:6}}/>Export CSV</Button>
            <Button onClick={sendDirect}><Send size={16} style={{marginRight:6}}/>Complete &amp; Send</Button>
          </div>
        </Card>

        <Card>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
            <Label>Match</Label>
            <div style={{fontSize:12, opacity:.7, display:'flex', gap:6, alignItems:'center'}}><Timer size={14}/>{timeStr}</div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, alignItems:'end'}}>
            <div><Label>Total Ends</Label><Input type="number" value={meta.ends} min={1} onChange={e=>{pushHistory();setMeta({...meta,ends:Number(e.target.value)})}}/></div>
            <div><Label>Total {teams.A}</Label><div>{totals.a}</div></div>
            <div><Label>Total {teams.B}</Label><div>{totals.b}</div></div>
          </div>
          <div style={{marginTop:12}}>
            <Button onClick={addEnd}><Plus size={16} style={{marginRight:6}}/>Add End</Button>
            <Button onClick={removeLast}><Minus size={16} style={{marginRight:6}}/>Remove Last</Button>
            <Button onClick={undo}><Undo2 size={16} style={{marginRight:6}}/>Undo</Button>
            <Button onClick={reset} style={{float:'right'}}><RefreshCw size={16} style={{marginRight:6}}/>Reset Match</Button>
          </div>
        </Card>

        <Card>
          <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}><Label>Scoring Settings</Label><Settings size={16}/></div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
            <div><Label>Toucher (each)</Label><Input type="number" value={cfg.scoring.toucher} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,toucher:Number(e.target.value)}})}}/></div>
            <div><Label>Crossover Shot</Label><Input type="number" value={cfg.scoring.crossoverShot} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,crossoverShot:Number(e.target.value)}})}}/></div>
            <div><Label>1st Shot</Label><Input type="number" value={cfg.scoring.rankPoints.first} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,first:Number(e.target.value)}}})}}/></div>
            <div><Label>2nd Shot</Label><Input type="number" value={cfg.scoring.rankPoints.second} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,second:Number(e.target.value)}}})}}/></div>
            <div><Label>3rd Shot</Label><Input type="number" value={cfg.scoring.rankPoints.third} onChange={e=>{pushHistory();setCfg({...cfg,scoring:{...cfg.scoring,rankPoints:{...cfg.scoring.rankPoints,third:Number(e.target.value)}}})}}/></div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <div style={{fontSize:18, fontWeight:600}}>Scoreboard: {teams.A} {totals.a} — {totals.b} {teams.B}</div>
          <div style={{fontSize:12, opacity:.7}}>Ends: {ends.length}/{meta.ends}</div>
        </div>
      </Card>

      <div>
        {ends.map((e, idx)=>{
          const r = scoreEnd(e,cfg);
          return (
            <Card key={idx}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:600, display:'flex', gap:8, alignItems:'center'}}>End {e.number} {r.ultimate && (<span style={{fontSize:12, border:'1px solid #ddd', borderRadius:12, padding:'2px 8px'}}>Ultimate End</span>)}</div>
                <div style={{fontSize:12, opacity:.7}}>{teams.A}: +{r.a} | {teams.B}: +{r.b}</div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8}}>
                <div><Label>{teams.A} Touchers</Label><Input type="number" value={e.aTouchers} min={0} onChange={ev=>updateEnd(idx,{aTouchers:Number(ev.target.value)})}/></div>
                <div><Label>{teams.B} Touchers</Label><Input type="number" value={e.bTouchers} min={0} onChange={ev=>updateEnd(idx,{bTouchers:Number(ev.target.value)})}/></div>
                <div>
                  <Label>Crossover Shot</Label>
                  <select style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12, width:'100%'}} value={e.crossoverShot} onChange={ev=>updateEnd(idx,{crossoverShot:ev.target.value})}>
                    <option value="None">None</option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                    <option value="Both">Undecided / Both +3</option>
                  </select>
                </div>
                <div>
                  <Label>1st Shot (final)</Label>
                  <select style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12, width:'100%'}} value={e.first} onChange={ev=>updateEnd(idx,{first:ev.target.value})}>
                    <option value=""></option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                  </select>
                </div>
                <div>
                  <Label>2nd Shot (final)</Label>
                  <select style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12, width:'100%'}} value={e.second} onChange={ev=>updateEnd(idx,{second:ev.target.value})}>
                    <option value=""></option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                  </select>
                </div>
                <div>
                  <Label>3rd Shot (final)</Label>
                  <select style={{padding:'8px 12px', border:'1px solid #ddd', borderRadius:12, width:'100%'}} value={e.third} onChange={ev=>updateEnd(idx,{third:ev.target.value})}>
                    <option value=""></option>
                    <option value="A">{teams.A}</option>
                    <option value="B">{teams.B}</option>
                  </select>
                </div>
                <div><Label>Adj {teams.A}</Label><Input type="number" value={e.adjA} onChange={ev=>updateEnd(idx,{adjA:Number(ev.target.value)})}/></div>
                <div><Label>Adj {teams.B}</Label><Input type="number" value={e.adjB} onChange={ev=>updateEnd(idx,{adjB:Number(ev.target.value)})}/></div>
                <div style={{gridColumn:'span 2'}}><Label>Notes</Label><Input value={e.notes} onChange={ev=>updateEnd(idx,{notes:ev.target.value})}/></div>
              </div>
              <div style={{marginTop:8, fontSize:12, opacity:.7}}>{r.detail}</div>
            </Card>
          )
        })}
      </div>
    </div>
  );
}
