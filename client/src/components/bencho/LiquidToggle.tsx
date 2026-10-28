import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, useVelocity } from 'framer-motion';

/* ══ Liquid toggle — Bencho, MIT ══════════════════════════
   Adapted to a controlled Web/App source. The component reports a
   source change on release, so dragging across the middle does not
   repeatedly query the two real Base libraries.

   ── NO GOO. There is nothing left for it to merge. ──────
   The filter existed to fuse the thumb with the straggler
   running behind it: blur everything, then threshold the
   alpha, and two overlapping circles come out as one waisted
   capsule. With the straggler gone it had one circle to
   work on, and a blur-then-threshold pass over a single
   round shape cannot improve it — it can only soften the
   edge, which is exactly what it was doing.

   A plain DOM circle with a border-radius is drawn by the
   browser at device resolution and stays crisp at any zoom.
   The stretch is a CSS transform now, so nothing needs the pass. */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TRACK = 60, HEIGHT = 32, THUMB = 24;
/* 36 in a 46 track, so five pixels of track show all the way
   round. PAD is the same five: the inset at the ends and the
   inset above and below are the same gap seen twice. */
/* Compact toolbar adaptation: 24 in a 32 track leaves the same
   symmetric rule with 4px of air, instead of the demo's 36/46. */
const PAD = (HEIGHT - THUMB) / 2;
const SHUT_X = PAD, OPEN_X = TRACK - THUMB - PAD, MID_X = (SHUT_X + OPEN_X) / 2;

export function LiquidToggle({ checked, onCheckedChange, stretch = 36, speed = 50, disabled = false }: {
  checked: boolean; onCheckedChange: (value: boolean) => void; stretch?: number; speed?: number; disabled?: boolean;
}) {
  const [held, setHeld] = useState(false), [hot, setHot] = useState(false), [dragOn, setDragOn] = useState(checked);
  const rail = useRef<HTMLButtonElement>(null);
  const grip = useRef<{ id: number; grab: number | null; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const still = Boolean(useReducedMotion());
  /* ONE POSITION, WRITTEN TWO WAYS. A drag writes the motion value
     directly, a release animates it, and neither re-renders the thumb. */
  const x = useMotionValue(checked ? OPEN_X : SHUT_X);
  const vel = useVelocity(x);
  const eased = useSpring(vel, { stiffness: 380, damping: 34, mass: 0.6 });
  /* ONE BODY. STRETCH, NOT A TRAIL. Area is kept: scaleY is
     1/scaleX, so the thumb is the same amount of droplet. */
  const lengthen = (v: number) => still ? 1 : 1 + Math.min(0.4, Math.abs(v) / (600 * (OPEN_X - SHUT_X) / 46)) * clamp(stretch, 0, 100) / 100;
  /* The divisor is the whole tuning: 600 puts the peak at about
     1.09 at the default; the cap leaves the knob somewhere to go. */
  const swell = useSpring(!still && hot ? 1.035 : 1, { stiffness: 380, damping: 34, mass: 0.6 });
  /* The hover swell goes in the SAME transform. CSS scale would
     scale the coordinate system that translateX moves through,
     drifting the droplet toward the end. Multiplying here swells
     about its own centre and leaves the position untouched. */
  const wide = useTransform([eased, swell], ([v, s]: number[]) => lengthen(v) * s);
  const tall = useTransform([eased, swell], ([v, s]: number[]) => s / lengthen(v));
  /* Softer than the old 220/20: 170/21.5 is zeta 0.87, arriving
     with a hint of give, without a hard stop. Damping is constant. */
  const settle = useMemo(() => ({ type: 'spring' as const, stiffness: 170 - (50 - clamp(speed, 0, 100)) * 1.1, damping: 21.5, mass: 0.9 }), [speed]);
  useEffect(() => {
    if (held) return;
    if (still) { x.set(checked ? OPEN_X : SHUT_X); return; }
    const run = animate(x, checked ? OPEN_X : SHUT_X, settle);
    // Grabbing mid-flight stops the settle exactly where it has got to.
    return () => run.stop();
  }, [checked, held, x, settle, still]);
  const local = (clientX: number) => {
    const el = rail.current; if (!el) return 0;
    const b = el.getBoundingClientRect(), k = b.width / (el.offsetWidth || b.width) || 1;
    return (clientX - b.left) / k;
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    /* NO OFFSET YET. Taking it at the first MOVE produces no
       displacement there; every move after it tracks the delta.
       There is no off-thumb press that can make it teleport. */
    grip.current = { id: e.pointerId, grab: null, moved: false };
    suppressClick.current = false; setHeld(true); setDragOn(checked);
    try { rail.current?.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = grip.current; if (!g || g.id !== e.pointerId) return;
    const at = local(e.clientX);
    if (g.grab === null) g.grab = at - x.get();
    const next = clamp(at - g.grab, SHUT_X, OPEN_X);
    if (Math.abs(next - x.get()) > 0.4) g.moved = true;
    x.set(next); setDragOn(next > MID_X);
  };
  const release = (e: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const g = grip.current; if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    /* Release is guarded too: if capture failed, throwing before
       setHeld(false) would leave the switch permanently held. */
    try { rail.current?.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
    suppressClick.current = g.moved && !cancelled;
    if (g.moved && !cancelled) onCheckedChange(x.get() > MID_X);
    setHeld(false);
  };
  const on = held ? dragOn : checked;
  return <div className="liq-well" style={{ '--liq-thumb': `${THUMB}px`, '--liq-track': `${TRACK}px`, '--liq-height': `${HEIGHT}px` } as CSSProperties} role="group" aria-label="正式库来源">
    <span className="liq-label" data-active={!on || undefined}>Web</span>
    <button ref={rail} type="button" className="liq-sw" data-on={on} role="switch" aria-checked={checked}
      aria-label={`切换到 ${checked ? 'Web' : 'App'}`} title={`当前 ${checked ? 'App' : 'Web'}，点击或拖动切换`} disabled={disabled}
      onPointerDown={down} onPointerMove={move} onPointerUp={e => release(e)} onPointerCancel={e => release(e, true)}
      onLostPointerCapture={() => { if (grip.current) { grip.current = null; suppressClick.current = false; setHeld(false); } }}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}
      /* Native button click also handles Enter, Space and assistive
         activation. A completed drag consumes only its following click. */
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onCheckedChange(!checked); }}>
      <span className="liq-sw-blobs" aria-hidden="true"><motion.span className="liq-thumb" style={{ x, scaleX: wide, scaleY: tall }} /></span>
    </button>
    <span className="liq-label" data-active={on || undefined}>App</span>
  </div>;
}
