import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/* Adapted from the user-provided Bencho Checklist (MIT).
   ONE SPRING PER ROW, AND EVERYTHING IS READ OFF IT. The box
   filling, the tick drawing, the rule crossing the words and
   the words giving up their ink are four readings of a single
   number, not four things animated toward the same moment.

   Application adaptation: selection stays controlled by the caller.
   Reuse selections never cross out, collapse, reset, or add demo tasks.
   A removal preview may opt into the rule; only a successful API result
   removes an actual parameter. */

/* Frames, not milliseconds. `dt` is expressed in sixtieths of
   a second and the damping is RAISED to it rather than
   multiplied by it, so a dropped frame decays the same amount
   of energy as the two frames it replaced.
   The loop parks itself the moment the value has settled. */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const springOf = (tune: number) => ({
  /* stiffness: how hard it is pulled toward the target */
  k: 0.08 + (tune / 100) * 0.16,
  /* decay, per frame: how much of the velocity survives */
  d: 0.62 + (tune / 100) * 0.2,
});

/* Units matter. The snap threshold is absolute, so a caller
   works in pixels or in 0..100 — a spring driven over 0..1
   would be "settled" before it had visibly moved. */
function useChecklistSpring(target: number, instant: boolean, tune = 50) {
  const [at, setAt] = useState(target);
  const cur = useRef(target);
  const vel = useRef(0);
  useEffect(() => {
    if (instant) { cur.current = target; vel.current = 0; setAt(target); return; }
    const { k, d } = springOf(clamp(tune, 0, 100));
    let raf = 0, prev = 0;
    const tick = (time: number) => {
      const dt = prev ? clamp((time - prev) / 16.67, 0, 2.5) : 1;
      prev = time;
      vel.current += (target - cur.current) * k * dt;
      vel.current *= Math.pow(d, dt);
      cur.current += vel.current * dt;
      if (Math.abs(target - cur.current) < 0.02 && Math.abs(vel.current) < 0.02) {
        cur.current = target; vel.current = 0; setAt(target); return;
      }
      setAt(cur.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, instant, tune]);
  return at / 100;
}

export function ChecklistCheckbox({ checked, onChange, label, disabled, mixed = false }: {
  checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean; mixed?: boolean;
}) {
  const still = Boolean(useReducedMotion());
  const t = useChecklistSpring(checked || mixed ? 100 : 0, still);
  const held = clamp(t, 0, 1);
  return <button type="button" className="chk-toggle" role="checkbox"
    aria-label={label} aria-checked={mixed ? 'mixed' : checked} disabled={disabled}
    onClick={() => onChange(!checked)}>
    {/* Two layers and neither is a border being recoloured:
        the ring is always there and the FILL grows inside it. */}
    <span className="chk-box">
      <span className="chk-fill" style={{ transform: `scale(${Math.max(0, t).toFixed(4)})` }} />
      {/* RAW fill may overshoot. The tick is clamped: a tick that
          overshoots draws past its own end and pulls back. */}
      <svg className="chk-tick" viewBox="0 0 24 24" aria-hidden="true">
        <path d={mixed ? 'M6 12 H18' : 'M6 12.4 L10.3 16.7 L18 7.6'} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - held} />
      </svg>
    </span>
  </button>;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description?: ReactNode;
  meta?: ReactNode;
  checked: boolean;
  disabled?: boolean;
}

export function Checklist({ items, onToggle, onPreview, activeId, label, strikeSelected = false, className = '' }: {
  items: ChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
  onPreview?: (id: string) => void;
  activeId?: string;
  label: string;
  strikeSelected?: boolean;
  className?: string;
}) {
  return <div className={`chk ${className}`} role="group" aria-label={label}>
    {items.map((item) => <ChecklistRow key={item.id} item={item} active={activeId === item.id}
      strike={strikeSelected && item.checked} onToggle={onToggle} onPreview={onPreview} />)}
  </div>;
}

function ChecklistRow({ item, active, strike, onToggle, onPreview }: {
  item: ChecklistItem; active: boolean; strike: boolean;
  onToggle: (id: string, checked: boolean) => void; onPreview?: (id: string) => void;
}) {
  const still = Boolean(useReducedMotion());
  const t = useChecklistSpring(strike ? 100 : 0, still);
  const held = clamp(t, 0, 1);
  /* The rule follows the tick, it does not race it. It is a window
     on the same number rather than a second timer. */
  const cut = clamp((held - 0.12) / 0.72, 0, 1);
  return <motion.div className="chk-row" data-active={active || undefined} data-checked={item.checked || undefined}
    initial={false} layout={!still} transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}>
    <ChecklistCheckbox checked={item.checked} disabled={item.disabled} label={`选择 ${item.label}`} onChange={(checked) => onToggle(item.id, checked)} />
    <button type="button" className="chk-content" disabled={item.disabled}
      aria-label={onPreview ? `预览 ${item.label}` : `选择 ${item.label}`}
      onClick={() => onPreview ? onPreview(item.id) : onToggle(item.id, !item.checked)}>
      <span className="chk-say"><span className="chk-word" style={{ opacity: 1 - 0.35 * held }}>{item.label}</span>
        {/* The rule is scaled, not grown. Its span is sized to the
            word rather than the row, so it stops where the text does. */}
        {strike && <span className="chk-rule" aria-hidden="true" style={{ transform: `scaleX(${cut.toFixed(4)})` } as CSSProperties} />}
      </span>
      {item.description && <span className="chk-description">{item.description}</span>}
    </button>
    {item.meta && <span className="chk-meta">{item.meta}</span>}
  </motion.div>;
}
