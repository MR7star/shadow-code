import { useState } from 'react';
import { Activity, Award, CircleHelp } from 'lucide-react';
import { Button, DifficultyBadge, EmptyState, ErrorState, LoadingState, Modal, Panel, ProgressBar, RankBadge, StatCard, StatusBadge, Toast, XPProgress } from '../components/ui';
import './ComponentShowcase.css';

export default function ComponentShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<'success'|'error'|'warning'|'info'|null>(null);
  if (!import.meta.env.DEV) return null;
  return <main className="scds-showcase"><header><span>SHADOW CODE DESIGN SYSTEM</span><h1>Component foundation</h1><p>Development preview of reusable interface primitives.</p></header>
    <section><h2>Buttons</h2><div className="scds-showcase-row">{(['primary','secondary','ghost','danger'] as const).map(v=><Button key={v} variant={v}>{v}</Button>)}<Button loading>Loading</Button><Button disabled>Disabled</Button></div></section>
    <section><h2>Panels and stats</h2><div className="scds-showcase-grid"><Panel>Standard panel</Panel><Panel variant="elevated">Elevated panel</Panel><Panel variant="interactive">Interactive panel</Panel><StatCard label="Challenges" value="24" icon={<Activity size={18}/>} description="4 completed this week"/></div></section>
    <section><h2>Ranks and status</h2><div className="scds-showcase-row">{(['E-Rank','D-Rank','C-Rank','B-Rank','A-Rank','S-Rank','National Level','Monarch'] as const).map(rank=><RankBadge key={rank} rank={rank}/>)}</div><div className="scds-showcase-row">{(['loading','active','completed','failed','pending'] as const).map(s=><StatusBadge key={s} status={s}/>)}{(['E','D','C','B','A','S'] as const).map(d=><DifficultyBadge key={d} difficulty={d}/>)}</div></section>
    <section><h2>Progress</h2><div className="scds-showcase-progress"><XPProgress current={740} required={1200}/>{(['purple','cyan','gold','success','danger'] as const).map(v=><ProgressBar key={v} value={65} variant={v} label={`${v} progress`}/>)}</div></section>
    <section><h2>Request states</h2><div className="scds-showcase-grid"><EmptyState icon={<CircleHelp/>} title="No missions yet" description="New missions will appear here when available."/><ErrorState message="Could not load the latest data." onRetry={()=>setToast('info')}/><Panel><LoadingState label="Loading showcase data"/></Panel></div></section>
    <section><h2>Overlays and notifications</h2><div className="scds-showcase-row"><Button onClick={()=>setModalOpen(true)} icon={<Award size={16}/>}>Open modal</Button>{(['success','error','warning','info'] as const).map(v=><Button key={v} variant="secondary" onClick={()=>setToast(v)}>{v} toast</Button>)}</div></section>
    {toast && <div className="scds-showcase-toast"><Toast variant={toast} title={`${toast[0].toUpperCase()}${toast.slice(1)} notification`} message="This is a development-only component example." onClose={()=>setToast(null)}/></div>}
    <Modal open={modalOpen} title="Accessible dialog" onClose={()=>setModalOpen(false)}><p>Escape, the close button, and clicking outside close this dialog. Keyboard focus is returned to the opener.</p><div className="scds-showcase-row"><Button onClick={()=>setModalOpen(false)}>Done</Button><Button variant="ghost" onClick={()=>setToast('success')}>Show toast</Button></div></Modal>
  </main>;
}
