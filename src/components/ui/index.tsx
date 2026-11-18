import { useEffect, useId, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { X, Check, AlertTriangle, Info, LoaderCircle } from 'lucide-react';
import type { QuestDifficulty, Rank } from '../../types';
import './ui.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = 'primary', size = 'md', loading = false, icon, children, disabled, className = '', ...props }: ButtonProps) {
  return <button {...props} className={`scds-button scds-button-${variant} scds-button-${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <LoaderCircle className="scds-spin" size={16} aria-hidden="true" /> : icon}
    <span>{children}</span>
  </button>;
}

export interface PanelProps extends HTMLAttributes<HTMLElement> { variant?: 'standard' | 'elevated' | 'interactive'; as?: 'section' | 'article' | 'div'; }
export function Panel({ variant = 'standard', as = 'section', className = '', children, ...props }: PanelProps) {
  const Tag = as;
  return <Tag {...props} className={`scds-panel scds-panel-${variant} ${className}`}>{children}</Tag>;
}

export interface StatCardProps { label: string; value: ReactNode; icon?: ReactNode; description?: string; className?: string; }
export function StatCard({ label, value, icon, description, className = '' }: StatCardProps) {
  return <Panel className={`scds-stat-card ${className}`}><div className="scds-stat-top"><span>{label}</span>{icon && <span className="scds-stat-icon">{icon}</span>}</div><strong className="scds-stat-value">{value}</strong>{description && <span className="scds-stat-description">{description}</span>}</Panel>;
}

const rankClass: Record<Rank, string> = { 'E-Rank':'e', 'D-Rank':'d', 'C-Rank':'c', 'B-Rank':'b', 'A-Rank':'a', 'S-Rank':'s', 'National Level':'national', Monarch:'monarch' };
export function RankBadge({ rank, className = '' }: { rank: Rank; className?: string }) { return <span className={`scds-badge scds-rank-${rankClass[rank]} ${className}`}>{rank}</span>; }

export function ProgressBar({ value, max = 100, variant = 'purple', label, className = '' }: { value: number; max?: number; variant?: 'purple' | 'cyan' | 'gold' | 'success' | 'danger'; label?: string; className?: string }) {
  const id = useId(); const percent = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return <div className={`scds-progress ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, Math.min(max, value))} aria-labelledby={label ? undefined : id}>
    {!label && <span id={id} className="scds-sr-only">Progress</span>}<span className={`scds-progress-fill scds-progress-${variant}`} style={{ width: `${percent}%` }} />
  </div>;
}
export function XPProgress({ current, required, className = '' }: { current: number; required: number; className?: string }) {
  return <div className={`scds-xp ${className}`}><div className="scds-xp-label"><span>Experience</span><strong>{Math.max(0,current).toLocaleString()} / {Math.max(0,required).toLocaleString()} XP</strong></div><ProgressBar value={current} max={required} label="Experience progress" /></div>;
}

export function StatusBadge({ status, children }: { status: 'loading' | 'active' | 'completed' | 'failed' | 'pending'; children?: ReactNode }) {
  return <span className={`scds-badge scds-status-${status}`}>{children ?? status}</span>;
}
const difficultyClass: Record<QuestDifficulty, string> = { E:'e', D:'d', C:'c', B:'b', A:'a', S:'s' };
export function DifficultyBadge({ difficulty }: { difficulty: QuestDifficulty }) { return <span className={`scds-badge scds-difficulty-${difficultyClass[difficulty]}`}>{difficulty}-Rank</span>; }

export function EmptyState({ icon, title, description, action, className = '' }: { icon?: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return <div className={`scds-state scds-empty ${className}`}>{icon && <div className="scds-state-icon">{icon}</div>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return <div className="scds-state scds-error" role="alert"><AlertTriangle aria-hidden="true"/><p>{message}</p>{onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{retryLabel}</Button>}</div>;
}
export function LoadingState({ label = 'Loading', lines = 3 }: { label?: string; lines?: number }) {
  return <div className="scds-loading" role="status" aria-label={label} aria-busy="true">{Array.from({length: Math.max(1, lines)}, (_, i) => <span key={i} />)}<span className="scds-sr-only">{label}</span></div>;
}

export interface ModalProps { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; className?: string; }
export function Modal({ open, title, description, onClose, children, className = '' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null); const titleId = useId(); const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable(); if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <div className="scds-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className={`scds-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}><header><h2 id={titleId}>{title}</h2><button type="button" className="scds-icon-button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></header>{description && <p id={descriptionId} className="scds-modal-description">{description}</p>}<div className="scds-modal-content">{children}</div></div></div>;
}

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export function Toast({ variant = 'info', title, message, onClose }: { variant?: ToastVariant; title: string; message?: string; onClose?: () => void }) {
  const Icon = variant === 'success' ? Check : variant === 'warning' ? AlertTriangle : variant === 'error' ? X : Info;
  return <div className={`scds-toast scds-toast-${variant}`} role={variant === 'error' ? 'alert' : 'status'}><Icon size={18} aria-hidden="true"/><div><strong>{title}</strong>{message && <p>{message}</p>}</div>{onClose && <button type="button" className="scds-icon-button" aria-label="Dismiss notification" onClick={onClose}><X size={16}/></button>}</div>;
}
