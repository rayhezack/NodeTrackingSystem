import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';

/* ══ Toast stack — Bencho, MIT ════════════════════════════
   Three toasts, always: the newest in front, the two before it
   tucked behind with a sliver of each showing above it, a step
   smaller each and a barely-there grey (the reference's tones).
   Point at the stack and it fans out into a list; move away and
   it gathers back up.

   ── ONE SPRING, THREE PLACES ────────────────────────────
   A toast's place is worked out from how far back it is and
   whether the stack is open, and Framer springs it there. Opening,
   closing, a toast leaving and the next arriving are all the same
   move — every toast heading for its new place on the same spring,
   a touch under critical so it settles with a hint of give.

   ── HOVER IS THE WHOLE FRAME ────────────────────────────
   Hovering the toasts themselves would let the list slide out
   from under the pointer and close again; the frame is the list's
   own size, so hovering it is hovering the list.

   Application adaptation: at most three real notifications are
   visible. Dismissal promotes the next actual request, never a
   demonstration pool. Reading/dismissing is owned by the caller. */
export type ToastKind = 'success' | 'info' | 'error' | 'warning';
export interface ToastStackItem { id: string; kind: ToastKind; title: string; body: string; }
const ICON: Record<ToastKind, LucideIcon> = { success: CircleCheck, info: Info, error: CircleX, warning: TriangleAlert };
const H = 80, SHOWN = 3;
/* a touch under critical: it settles with a hint of give, no wobble */
const SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 1 } as const;

export function ToastStack({ items, onActivate, onDismiss, peek = 14, gap = 10, corner = 20 }: {
  items: ToastStackItem[]; onActivate: (id: string) => void; onDismiss: (id: string) => void;
  peek?: number; gap?: number; corner?: number;
}) {
  const [leaving, setLeaving] = useState<string | null>(null), [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const still = Boolean(useReducedMotion()), stack = items.slice(0, SHOWN), count = stack.length;
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!count) return null;
  /* The frame is the open list's size. Keeping it stable means
     the list cannot slide out from under a hovering pointer. */
  const listH = count * H + (count - 1) * gap;
  const place = (k: number) => open
    ? { y: (count - 1 - k) * (H + gap), scale: 1 }
    : { y: (count - 1 - k) * peek, scale: 1 - k * 0.05 };
  const dismiss = (id: string) => {
    if (leaving) return;
    setLeaving(id);
    timer.current = setTimeout(() => { onDismiss(id); setLeaving(null); }, still ? 0 : 220);
  };
  return <div ref={root} className="tst" role="region" aria-label="新需求提醒" data-open={open || undefined}
    style={{ height: listH, '--tst-r': `${corner}px` } as CSSProperties}
    onPointerOver={() => setOpen(true)} onPointerOut={e => {
      if (!(e.relatedTarget instanceof Node) || !root.current?.contains(e.relatedTarget)) setOpen(false);
    }} onFocus={() => setOpen(true)} onBlur={e => { if (!root.current?.contains(e.relatedTarget)) setOpen(false); }}>
    <span role="status" className="sr-only">{items.length} 条新需求等待你处理</span>
    {stack.map((t, k) => {
      const Icon = ICON[t.kind], p = place(k), front = k === 0, out = leaving === t.id;
      return <motion.div key={t.id} className="tst-toast" data-kind={t.kind} data-front={front || undefined}
        style={{ height: H, zIndex: SHOWN - k }}
        /* a new one rises in from below the front */
        initial={still ? false : { y: place(0).y + 24, scale: 1, opacity: 0, x: 0 }}
        animate={out ? { ...p, opacity: 0, x: 60 } : { ...p, opacity: 1, x: 0 }}
        transition={still ? { duration: 0 } : out ? { duration: 0.22, ease: [0.4, 0, 1, 1] } : SPRING}
        aria-hidden={!open && !front ? true : undefined}>
        <button type="button" className="tst-main" tabIndex={open || front ? 0 : -1} disabled={Boolean(leaving)} onClick={() => onActivate(t.id)}>
          <span className="tst-icon"><Icon size={18} strokeWidth={2} aria-hidden="true" /></span>
          <span className="tst-text"><b>{t.title}</b><span>{t.body}</span></span>
        </button>
        <button type="button" className="tst-x" aria-label={`关闭提醒：${t.title}`} tabIndex={open || front ? 0 : -1}
          disabled={Boolean(leaving)} onClick={() => dismiss(t.id)}><X size={16} aria-hidden="true" /></button>
      </motion.div>;
    })}
  </div>;
}
