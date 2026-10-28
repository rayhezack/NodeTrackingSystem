import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@client/src/components/ui/input';

interface SeekSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  placeholder: string;
  disabled?: boolean;
  suggestions?: Array<{ id: string; label: string; meta?: string }>;
  onSelectSuggestion?: (suggestion: { id: string; label: string; meta?: string }) => void;
}

/** Bencho Search: one object whose width changes from an icon button to a field. */
export function SeekSearch({
  value, onChange, onSubmit, onClear, placeholder, disabled,
  suggestions = [], onSelectSuggestion,
}: SeekSearchProps) {
  const [open, setOpen] = useState(Boolean(value));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const visibleSuggestions = suggestions.slice(0, 5);
  const menuOpen = open && showSuggestions && Boolean(value) && visibleSuggestions.length > 0;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const selectSuggestion = (suggestion: typeof suggestions[number]) => {
    onSelectSuggestion?.(suggestion);
    setShowSuggestions(false);
    setActiveIndex(-1);
  };

  return (
    <div
      className={`seek-search ${open ? 'is-open' : ''}`}
      data-state={open ? 'open' : 'closed'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setShowSuggestions(false);
          if (!value) setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="seek-search-trigger"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        aria-label={open ? '搜索输入框' : placeholder}
        aria-expanded={open}
        disabled={disabled}
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      <Input
        ref={inputRef}
        className="seek-search-input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-label={placeholder}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={menuOpen && activeIndex >= 0 && activeIndex < visibleSuggestions.length ? `${menuId}-${activeIndex}` : undefined}
        onFocus={() => setShowSuggestions(true)}
        onChange={(event) => { onChange(event.target.value); setShowSuggestions(true); setActiveIndex(-1); }}
        onKeyDown={(event) => {
          if (menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setActiveIndex((index) => event.key === 'ArrowDown'
              ? (index + 1) % visibleSuggestions.length
              : (index <= 0 ? visibleSuggestions.length - 1 : index - 1));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (menuOpen && visibleSuggestions[activeIndex]) selectSuggestion(visibleSuggestions[activeIndex]);
            else { onSubmit(); setShowSuggestions(false); }
          }
          if (event.key === 'Escape') {
            setShowSuggestions(false);
            if (!value) { setOpen(false); triggerRef.current?.focus(); }
          }
        }}
        disabled={disabled || !open}
        tabIndex={open ? 0 : -1}
        autoComplete="off"
        spellCheck={false}
      />
      {open && value && (
        <button type="button" className="seek-search-clear" aria-label="清空搜索"
          onClick={() => { onClear(); setOpen(false); setShowSuggestions(false); triggerRef.current?.focus(); }}>
          <X className="h-3 w-3" />
        </button>
      )}
      {menuOpen && (
        <div id={menuId} className="seek-search-menu" role="listbox" aria-label="搜索建议">
          {visibleSuggestions.map((suggestion, index) => (
            <button key={suggestion.id} id={`${menuId}-${index}`} type="button" role="option"
              aria-selected={index === activeIndex} className="seek-search-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}>
              <span className="min-w-0 truncate">{suggestion.label}</span>
              {suggestion.meta && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{suggestion.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
