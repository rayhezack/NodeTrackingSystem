import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, InputHTMLAttributes } from "react";

/* ══ Label input ══════════════════════════════════════════
   A field whose label is its placeholder until you are in it.
   The outline stays whole; focus changes its ink and opens the
   gap from the middle outward. The label is the event. */
const W = 280;
const H = 52;
/* the lifted label's size, against its resting one */
const S = 0.78;
/* half a stroke inside the SVG edge prevents clipping */
const IN = 0.75;

interface LabelInputProps extends Pick<InputHTMLAttributes<HTMLInputElement>, "onKeyDown" | "disabled"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function LabelInput({ label, value, onChange, onKeyDown, disabled }: LabelInputProps) {
  const id = `lbi-${useId().replace(/:/g, "")}`;
  const [focus, setFocus] = useState(false);
  const lab = useRef<HTMLLabelElement>(null);
  const [lw, setLw] = useState(40);
  /* The notch follows the measured label, including Chinese text. */
  useLayoutEffect(() => {
    if (lab.current) setLw(lab.current.offsetWidth);
  }, [label]);

  const r = 3;
  /* Never open the notch inside the corner's curve. */
  const lx = Math.max(14, r + 4);
  const x0 = Math.max(r * 0.6, lx - 5);
  const x1 = lx + lw * S + 5;
  const a = r - IN;
  const R = W - IN;
  const B = H - IN;
  const mid = W / 2;
  /* Two halves retract from the notch's middle outward. */
  const nm = (x0 + x1) / 2;
  const right = `M${x1},${IN} L${W - r},${IN} A${a},${a} 0 0 1 ${R},${r} L${R},${H - r} A${a},${a} 0 0 1 ${W - r},${B} L${mid},${B}`;
  const left = `M${x0},${IN} L${r},${IN} A${a},${a} 0 0 0 ${IN},${r} L${IN},${H - r} A${a},${a} 0 0 0 ${r},${B} L${mid},${B}`;
  const up = focus || value.length > 0;

  return (
    <div className="lbi" data-up={up} data-focus={focus} data-filled={value.length > 0}>
      <div className="lbi-box" style={{ width: W, height: H, borderRadius: r, "--lbi-x": `${lx}px` } as CSSProperties}>
        <svg className="lbi-ring" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <path d={right} />
          <path d={left} />
          <path className="lbi-gap" d={`M${nm},${IN} L${x0},${IN}`} pathLength={1} />
          <path className="lbi-gap" d={`M${nm},${IN} L${x1},${IN}`} pathLength={1} />
        </svg>
        <label className="lbi-label" htmlFor={id} ref={lab}>
          {[...label].map((ch, i) => <span key={i} style={{ "--i": i } as CSSProperties}>{ch}</span>)}
        </label>
        <input
          id={id}
          className="lbi-field"
          aria-label={label}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
