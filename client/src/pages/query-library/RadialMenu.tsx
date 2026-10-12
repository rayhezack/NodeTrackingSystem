import { useEffect, useRef, useState } from "react";
import type { ComponentType, PointerEvent } from "react";
import { Plus } from "lucide-react";

export interface RadialAction {
  key: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  onSelect: () => void;
  disabled?: boolean;
}

/* Pointer capture is best effort. Gesture state is armed first
   so capture failure cannot skip the rest of the handler. */
function grab(event: PointerEvent) {
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* bubbling still works */ }
}

/* ══ Radial menu · one gesture ═════════════════════════════
   Press, drag toward an action, release to commit. A plain tap
   leaves the fan open for discoverability and keyboard use. */
export function RadialMenu({ actions }: { actions: RadialAction[] }) {
  const [open, setOpen] = useState(false);
  const [aim, setAim] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /* A press always opens the fan; remember its prior state to
     distinguish an opening tap from a closing one. */
  const wasOpen = useRef(false);
  const aimRef = useRef<number | null>(null);
  const angleOf = (i: number) => -180 + (90 / Math.max(actions.length - 1, 1)) * i;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | globalThis.PointerEvent) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    down.current = { x: event.clientX, y: event.clientY, moved: false };
    wasOpen.current = open;
    setOpen(true);
    grab(event);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = down.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    /* Travel below 14px still counts as a tap. */
    if (Math.hypot(dx, dy) < 14) { aimRef.current = null; setAim(null); return; }
    gesture.moved = true;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    let nearest = 0;
    let gap = Infinity;
    actions.forEach((_, i) => {
      /* The shortest way around the circle handles -170 and 170. */
      const distance = 180 - Math.abs(Math.abs(angle - angleOf(i)) % 360 - 180);
      if (!actions[i].disabled && distance < gap) { gap = distance; nearest = i; }
    });
    aimRef.current = nearest;
    setAim(nearest);
  };
  const end = () => {
    const gesture = down.current;
    down.current = null;
    if (gesture?.moved && aimRef.current !== null && !actions[aimRef.current]?.disabled) {
      actions[aimRef.current]?.onSelect();
      setOpen(false);
    } else if (wasOpen.current) {
      setOpen(false);
    }
    aimRef.current = null;
    setAim(null);
  };
  const cancel = () => {
    down.current = null;
    aimRef.current = null;
    setAim(null);
    setOpen(false);
  };

  return (
    <div className="fan-well" ref={root}>
      <div className="fan-arc" data-open={open}>
        {actions.map((action, i) => {
          const angle = angleOf(i) * Math.PI / 180;
          return (
            <button
              key={action.key}
              type="button"
              className="fan-opt"
              data-live={aim === i}
              style={{ transform: open ? `translate(${Math.cos(angle) * 58}px, ${Math.sin(angle) * 58}px)` : "translate(0, 0) scale(0.4)", transitionDelay: `${open ? i * 28 : 0}ms` }}
              onClick={() => { action.onSelect(); setOpen(false); }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={action.label}
              title={action.label}
              tabIndex={open ? 0 : -1}
              disabled={action.disabled}
            >
              <action.Icon size={16} strokeWidth={2} />
              <span className="fan-label">{action.label}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="fan-core"
        data-open={open}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        onClick={(event) => { if (event.detail === 0) setOpen((current) => !current); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}
        aria-label={open ? "关闭快捷操作" : "打开快捷操作"}
        aria-expanded={open}
        title="快捷操作"
      >
        <Plus size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
