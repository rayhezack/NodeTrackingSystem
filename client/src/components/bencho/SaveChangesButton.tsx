import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import './save-changes.css';

/** Video adaptation: text → travelling slats → compact receipt.
 * Only a successful save produces the receipt; motion never delays the write. */
export function SaveChangesButton({ onSave, disabled, label, contextKey }: {
  onSave: () => Promise<boolean>;
  disabled: boolean;
  label: string;
  contextKey: string;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const busy = useRef(false);
  const generation = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const still = Boolean(useReducedMotion());
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setState('idle');
    return () => { generation.current += 1; clearTimeout(resetTimer.current); };
  }, [contextKey]);

  const save = async () => {
    if (disabled || busy.current) return;
    busy.current = true;
    clearTimeout(resetTimer.current);
    const request = generation.current;
    setState('saving');
    try {
      const saved = await onSave();
      if (request !== generation.current) return;
      setState(saved ? 'saved' : 'idle');
      if (saved) resetTimer.current = setTimeout(() => setState('idle'), 1800);
    } catch {
      // The caller owns error reporting and retains unsaved drafts.
      if (request === generation.current) setState('idle');
    } finally {
      if (request === generation.current) busy.current = false;
    }
  };

  const text = state === 'saving' ? '正在保存修改' : state === 'saved' ? '已保存' : label;
  return <span className="save-changes-slot">
    <motion.button type="button" className="save-changes-button" data-state={state}
      aria-label={text} aria-busy={state === 'saving'} disabled={disabled || state === 'saving'}
      onClick={() => void save()} animate={{ width: state === 'saved' ? 104 : 168 }}
      transition={{ duration: still ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={state} className="save-changes-content" aria-hidden="true"
          initial={{ opacity: 0, filter: still ? 'none' : 'blur(3px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: still ? 'none' : 'blur(3px)' }}
          transition={{ duration: still ? 0 : 0.12 }}>
          {state === 'saving' ? <span className="save-changes-slats">{Array.from({ length: 11 }, (_, i) =>
            <span key={i} style={{ animationDelay: `${i * 75}ms` }} />)}</span>
            : state === 'saved' ? <><Check className="h-4 w-4" />已保存</> : label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
    <span className="sr-only" role="status">{state === 'idle' ? '' : text}</span>
  </span>;
}
