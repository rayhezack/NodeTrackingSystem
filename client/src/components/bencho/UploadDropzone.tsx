import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Check, Upload as UpIcon, X } from 'lucide-react';
import { CONTEXT_MAX_CHARS, CONTEXT_MAX_FILES, validateContextFile, type UploadDocument } from './upload-context';
export type { UploadDocument } from './upload-context';

/* ══ Upload dropzone — Bencho, MIT ════════════════════════
   ── THE BOX INHALES, AND SWALLOWS ────────────────────────
   A plain filled box, no edge. A file carried over it is
   answered before it is let go: the box grows with a small
   bounce and the arrow lifts toward the hand. The box gives
   a little gulp before the upload appears in it.

   Application adaptation of the original NO REAL FILES / pretend-wire
   demonstration: this box accepts actual desktop files. FileReader
   supplies real byte progress; the tray contains the selected documents.
   Nothing is sent to AI until the existing Generate action is invoked.
   The product's 2MB / 5-file limits replace the demo's 5MB limit. */
const fmt = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/* ── the file icon ─────────────────────────────────────────
   A rounded page on a 40 grid with a thin grey outline and a
   folded corner, and the extension on a coloured label. */
function Page({ name, size = 36 }: { name: string; size?: number }) {
  return <svg className="upl-page" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path className="upl-page-line" d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z" />
    <path className="upl-page-line" d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
    <rect width="29" height="16" x="1" y="18" rx="8" className="upl-page-label" />
    {/* 9 units on the 40 grid: the mark is part of the drawing and
        scales with it, so its size lives here, not in the stylesheet. */}
    <text x="15.5" y="29.1" textAnchor="middle" fontSize="9" className="upl-page-ext">{name.split('.').pop()?.slice(0, 4).toUpperCase()}</text>
  </svg>;
}
function Roll({ value }: { value: number }) {
  const s = String(Math.round(value));
  return <span className="upl-roll" aria-hidden="true">{s.split('').map((d, i) => <span key={s.length - i} className="upl-roll-col"><span className="upl-roll-strip" style={{ transform: `translateY(${-Number(d)}em)` }}>{'0123456789'.split('').map(n => <span key={n}>{n}</span>)}</span></span>)}%</span>;
}
type Phase = { kind: 'idle' } | { kind: 'reading'; name: string; size: number; progress: number } | { kind: 'done'; name: string; size: number };

export function UploadDropzone({ files, onChange, onBusyChange, disabled = false }: {
  files: UploadDocument[]; onChange: (files: UploadDocument[]) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' }), [over, setOver] = useState(false);
  const [refuse, setRefuse] = useState(''), [gulp, setGulp] = useState(false);
  const input = useRef<HTMLInputElement>(null), reader = useRef<FileReader | null>(null);
  const mounted = useRef(true), busy = useRef(false), dragDepth = useRef(0);
  const latest = useRef(files); latest.current = files;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const still = Boolean(useReducedMotion()), shake = useAnimationControls();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reader.current?.abort(); timers.current.forEach(clearTimeout); if (busy.current) onBusyChange?.(false); };
  }, [onBusyChange]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const read = (file: File) => new Promise<string>((resolve, reject) => {
    const current = new FileReader(); reader.current = current;
    current.onprogress = event => {
      if (mounted.current && event.lengthComputable) setPhase({ kind: 'reading', name: file.name, size: file.size, progress: event.loaded / event.total });
    };
    current.onload = () => resolve(String(current.result ?? ''));
    current.onerror = () => reject(new Error(`${file.name} 读取失败，请重试`));
    current.onabort = () => reject(new Error('读取已取消'));
    current.readAsText(file);
  });
  const accept = async (incoming: File[]) => {
    if (disabled || busy.current || !incoming.length) return;
    busy.current = true; onBusyChange?.(true); timers.current.forEach(clearTimeout); timers.current = [];
    setRefuse(''); setOver(false); setGulp(!still);
    later(() => setGulp(false), 460);
    const errors: string[] = []; let next = [...latest.current]; let last: File | undefined;
    for (const file of incoming) {
      const reason = validateContextFile(file, next.map(item => item.name), next.length);
      if (reason) { errors.push(reason); continue; }
      setPhase({ kind: 'reading', name: file.name, size: file.size, progress: 0 });
      try {
        const content = (await read(file)).trim();
        if (!mounted.current) return;
        if (!content) { errors.push(`${file.name} 没有可读取的文本`); continue; }
        next = [...next, { id: crypto.randomUUID(), name: file.name, size: file.size, content: content.slice(0, CONTEXT_MAX_CHARS), truncated: content.length > CONTEXT_MAX_CHARS }];
        latest.current = next; onChange(next); last = file;
      } catch (error) {
        if (!mounted.current) return;
        errors.push(error instanceof Error ? error.message : `${file.name} 读取失败`);
      }
    }
    if (!mounted.current) return;
    busy.current = false; onBusyChange?.(false);
    if (last) { setPhase({ kind: 'done', name: last.name, size: last.size }); later(() => setPhase({ kind: 'idle' }), 1500); }
    else setPhase({ kind: 'idle' });
    if (errors.length) {
      setRefuse(errors.join('；'));
      if (!still) void shake.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.42 } });
    }
  };
  const canPick = !disabled && phase.kind !== 'reading' && files.length < CONTEXT_MAX_FILES;
  const onDrag = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); };
  return <div className="upl" data-disabled={disabled || undefined}>
    <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="添加补充上下文文件"
      accept=".txt,.md,.markdown,.json,.csv" multiple disabled={!canPick}
      onChange={(event: ChangeEvent<HTMLInputElement>) => { void accept(Array.from(event.target.files || [])); event.target.value = ''; }} />
    {/* A slot of fixed size, so the box closes around the reading row
        without moving anything below it. Width changes, never a scale,
        so the rounded corner stays the same corner. */}
    <motion.div animate={shake} className="upl-zone-wrap"
      onDragEnter={event => { onDrag(event); if (canPick && event.dataTransfer.types.includes('Files')) { dragDepth.current++; setOver(true); } }}
      onDragOver={event => { onDrag(event); event.dataTransfer.dropEffect = canPick ? 'copy' : 'none'; }}
      onDragLeave={event => { onDrag(event); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setOver(false); }}
      onDrop={event => { onDrag(event); dragDepth.current = 0; setOver(false); if (canPick) void accept(Array.from(event.dataTransfer.files)); }}>
      <button type="button" className="upl-zone" data-over={over || undefined} data-refuse={Boolean(refuse) || undefined}
        data-busy={phase.kind !== 'idle' || undefined} data-gulp={gulp || undefined} disabled={!canPick}
        onClick={() => input.current?.click()} aria-label="添加补充上下文文件，支持拖入或点击选择">
        {phase.kind === 'idle' ? <>
          <span className="upl-icon"><UpIcon size={18} strokeWidth={2} /></span>
          <span className="upl-say"><b>{over ? '松开以添加文件' : files.length >= CONTEXT_MAX_FILES ? '已添加 5 个文件' : '拖入上下文文件，或点击选择'}</b><span>txt、md、json、csv · 每个不超过 2MB · 最多 5 个</span></span>
        </> : <span className="upl-now">
          <Page name={phase.name} /><span className="upl-text"><span className="upl-name">{phase.name}</span>
            <span className="upl-meta">{fmt(phase.size)} · {phase.kind === 'done' ? '已添加' : <><span>读取中</span><Roll value={phase.progress * 100} /></>}</span>
            <span className="upl-track" role="progressbar" aria-label="文件读取进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.kind === 'done' ? 100 : Math.round(phase.progress * 100)}><span className="upl-bar" style={{ transform: `scaleX(${phase.kind === 'done' ? 1 : phase.progress})` }} /></span>
          </span>
          {/* The tick's room is kept from the start, so the box is its
              final size before the tick arrives. */}
          <span className="upl-end">{phase.kind === 'done' && <span className="upl-tick"><Check size={14} /></span>}</span>
        </span>}
      </button>
    </motion.div>
    {refuse && <p role="alert" className="upl-error">{refuse}</p>}
    <span className="sr-only" role="status">{phase.kind === 'done' ? `${phase.name} 已添加` : ''}</span>
    {files.length > 0 && <div className="upl-tray" aria-label="已添加上下文文件">{files.map(file => <div key={file.id} className="upl-file">
      <Page name={file.name} size={32} /><span className="upl-text"><span className="upl-name" title={file.name}>{file.name}</span><span className="upl-meta">{fmt(file.size)}{file.truncated ? ' · 已读取前 20,000 字' : ' · 已就绪'}</span></span>
      <button type="button" className="upl-remove" aria-label={`移除 ${file.name}`} disabled={disabled || phase.kind === 'reading'} onClick={() => onChange(files.filter(item => item.id !== file.id))}><X size={14} /></button>
    </div>)}</div>}
    <p className="upl-note">文件在本地读取，点击“生成初稿”时作为补充上下文发送。</p>
  </div>;
}
