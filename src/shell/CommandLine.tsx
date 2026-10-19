import { useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { suggest } from './command';
import { isBuilt } from './registry';

const HISTORY_KEY = 'meridian.cmdHistory';

function loadHistory(): string[] {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown;
    return Array.isArray(h) ? h.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

function pushHistory(cmd: string): string[] {
  const next = [cmd, ...loadHistory().filter((c) => c !== cmd)].slice(0, 50);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

interface Props {
  onRun: (command: string, opts: { newFrame: boolean }) => string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  onDone?: () => void;
}

// Always-visible command line (9.4). Returns an error string from onRun to show inline.
export function CommandLine({ onRun, inputRef, autoFocus, onDone }: Props) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const [histIdx, setHistIdx] = useState(-1);
  const [error, setError] = useState('');
  const items = useMemo(() => (value.trim() ? suggest(value) : []), [value]);

  function run(cmd: string, newFrame: boolean) {
    const c = cmd.trim();
    if (!c) return;
    const err = onRun(c, { newFrame });
    if (err) {
      setError(err);
      return;
    }
    pushHistory(c.toUpperCase());
    setValue('');
    setOpen(false);
    setSel(-1);
    setHistIdx(-1);
    setError('');
    onDone?.();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open && items.length) setSel((s) => (s + 1) % items.length);
      else {
        // History moves toward newer entries.
        const i = Math.max(-1, histIdx - 1);
        setHistIdx(i);
        setValue(i < 0 ? '' : (loadHistory()[i] ?? ''));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open && items.length && sel >= 0) setSel((s) => (s <= 0 ? items.length - 1 : s - 1));
      else {
        const h = loadHistory();
        const i = Math.min(h.length - 1, histIdx + 1);
        if (i >= 0) {
          setHistIdx(i);
          setValue(h[i] ?? '');
          setOpen(false);
        }
      }
    } else if (e.key === 'Tab' && open && items.length) {
      e.preventDefault();
      setValue(items[Math.max(0, sel)]!.command + ' ');
      setSel(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = open && sel >= 0 ? items[sel]?.command : undefined;
      run(chosen ?? value, e.altKey || e.shiftKey);
    } else if (e.key === 'Escape') {
      if (open) setOpen(false);
      else {
        setValue('');
        e.currentTarget.blur();
        onDone?.();
      }
    }
  }

  const listId = 'cmd-suggestions';
  return (
    <div className="cmd">
      <span className="cmd__prompt" aria-hidden>
        &gt;
      </span>
      <input
        ref={inputRef}
        className="cmd__input"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={sel >= 0 ? `cmd-opt-${sel}` : undefined}
        aria-label="Command line. Type a ticker and a function, like AAPL GP"
        placeholder="AAPL GP  |  ECO  |  HELP"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setSel(-1);
          setError('');
        }}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => value && setOpen(true)}
      />
      <button className="cmd__go" onClick={() => run(value, false)} aria-label="Run command">
        GO
      </button>
      {error && (
        <div className="cmd__error" role="alert">
          {error}
        </div>
      )}
      {open && items.length > 0 && (
        <ul className="cmd__list" id={listId} role="listbox">
          {items.map((s, i) => (
            <li
              key={s.fn.code}
              id={`cmd-opt-${i}`}
              role="option"
              aria-selected={i === sel}
              className={i === sel ? 'cmd__opt cmd__opt--sel' : 'cmd__opt'}
              onMouseDown={(e) => {
                e.preventDefault();
                run(s.command, e.altKey || e.shiftKey);
              }}
            >
              <span className="cmd__code">{s.fn.code}</span>
              <span className="cmd__title">{s.fn.title}</span>
              <span className={isBuilt(s.fn) ? 'up' : 'muted'}>{isBuilt(s.fn) ? '' : s.fn.milestone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
