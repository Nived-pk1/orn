/**
 * The command palette (step 5.8; SEARCH §4; Ctrl/Cmd K and the top bar's Search): cmdk's `Command` inside our native `Dialog` (CSP spike:
 * zero violations in the three engines). cmdk gives the roles, `aria-activedescendant` on the input and the mouse selection; the search
 * worker ranks (cmdk filters nothing: `shouldFilter={false}`) and this component windows the rows (fixed heights, spacers), so a hundred
 * hits render a dozen items. Because cmdk only knows the rows in the DOM, the arrows, Page keys and Enter are handled here over the
 * whole list. A press on Enter is the same as a click: a result opens in the inspector and is placed; a command runs; a recent search
 * is typed again.
 */
import { Command } from 'cmdk';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { useLayoutMode } from '@/ui/hooks';
import { Dialog } from '@/ui/primitives';
import { kindName, kindTitle, type PaletteCommand, type SearchPorts } from './contracts';
import { createPaletteModel } from './palette-model';
import { HEADER_ROW_HEIGHT, LIST_HEIGHT, nextHit, scrollToShow, windowOf, type PaletteRow } from './rows';
import { matchWords } from './words';
import styles from './palette.module.css';

type Entry = { readonly key: string; readonly row?: number };

const PAGE = 6;
const HINT = 'Type to search. r: s: c: g: n: m: t: narrow to one kind. > lists commands.';

function useEntries(rows: readonly PaletteRow[], commands: readonly PaletteCommand[], recent: readonly string[], mode: 'search' | 'command', hasText: boolean): readonly Entry[] {
  return useMemo(() => {
    if (mode === 'command') return commands.map((c) => ({ key: `command:${c.id}` }));
    if (hasText || rows.length > 0) return rows.flatMap((row, index) => (row.type === 'hit' ? [{ key: row.key, row: index }] : []));
    return recent.map((text) => ({ key: `recent:${text}` }));
  }, [rows, commands, recent, mode, hasText]);
}

function PaletteBody(props: { readonly ports: SearchPorts; readonly onClose: () => void }) {
  const { ports, onClose } = props;
  const model = useMemo(() => createPaletteModel(ports), [ports]);
  useEffect(() => () => model.dispose(), [model]);
  const state = useStore(model.store);
  const recent = useStore(ports.recent, (s) => s.items);
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const mode = state.parsed.mode;
  const hasText = state.parsed.text !== '' || (state.parsed.mode === 'search' && state.parsed.kinds !== undefined);
  const entries = useEntries(state.rows, state.commands, recent, mode, hasText);
  const hitCount = state.rows.filter((row) => row.type === 'hit').length;

  // a new list selects its first entry and starts at the top
  useEffect(() => {
    setSelected(entries[0]?.key ?? '');
    setNotice('');
    setScrollTop(0);
    if (list.current !== null) list.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new list is a new serial
  }, [state.serial]);

  const activate = (key: string): void => {
    if (key.startsWith('command:')) {
      const command = state.commands.find((c) => `command:${c.id}` === key);
      if (command === undefined) return;
      const answer = model.runCommand(command);
      if (answer.ran) onClose();
      else setNotice(`${command.title} is not available: ${answer.reason ?? 'unknown reason'}.`);
    } else if (key.startsWith('recent:')) {
      model.setInput(key.slice('recent:'.length));
    } else {
      model.openHit(state.rows.findIndex((row) => row.key === key));
      onClose();
    }
  };

  const move = (to: number): void => {
    const entry = entries[to];
    if (entry === undefined) return;
    setSelected(entry.key);
    if (entry.row !== undefined && list.current !== null) {
      const top = scrollToShow(state.rows, entry.row, list.current.scrollTop, LIST_HEIGHT);
      list.current.scrollTop = top;
      setScrollTop(top);
    }
  };

  const onKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return;
    const at = entries.findIndex((entry) => entry.key === selected);
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'PageDown' || event.key === 'PageUp') {
      handled();
      const direction = event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1;
      const step = event.key.startsWith('Page') ? PAGE : 1;
      if (entries.length === 0) return;
      if (entries[0]?.row !== undefined) {
        const next = nextHit(state.rows, entries[at]?.row ?? -1, direction, step);
        const to = entries.findIndex((entry) => entry.row === next);
        if (to >= 0) move(to);
      } else move(Math.min(entries.length - 1, Math.max(0, at < 0 ? 0 : at + direction * step)));
    } else if (event.key === 'Enter' && selected !== '') {
      handled();
      activate(selected);
    }
  };

  const win = windowOf(state.rows, scrollTop, LIST_HEIGHT);
  const hitPosition = new Map<string, number>();
  for (const row of state.rows) if (row.type === 'hit') hitPosition.set(row.key, hitPosition.size + 1);
  const statusText =
    notice !== ''
      ? notice
      : state.status === 'results' && hitCount > 0
        ? `${hitCount} ${hitCount === 1 ? 'result' : 'results'}${state.message === '' ? '' : `. ${state.message}`}`
        : state.status === 'searching' || state.status === 'waiting'
          ? state.rows.length > 0
            ? 'Searching'
            : ''
          : state.message;

  return (
    <Command className={styles.body} label="Search records and commands" shouldFilter={false} loop={false} value={selected} onValueChange={setSelected} onKeyDownCapture={onKeys}>
      <Command.Input
        className={styles.input}
        value={state.input}
        onValueChange={model.setInput}
        placeholder="Search records, or type > for commands"
        aria-describedby="palette-hint"
        data-palette-input=""
      />
      <p id="palette-hint" className={styles.hint}>
        {HINT}
      </p>
      <p className={styles.status} role="status" aria-live="polite" data-palette-status="">
        {statusText}
      </p>
      <Command.List ref={list} className={styles.list} label="Results" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} aria-busy={state.status === 'searching'}>
        {mode === 'command' ? (
          state.commands.map((command, index) => (
            <Command.Item
              key={command.id}
              value={`command:${command.id}`}
              className={styles.item}
              disabled={command.unavailable !== undefined}
              onClick={command.unavailable === undefined ? undefined : () => activate(`command:${command.id}`)}
              aria-posinset={index + 1}
              aria-setsize={state.commands.length}
              onSelect={() => activate(`command:${command.id}`)}
            >
              <span className={styles.title}>{command.title}</span>
              {command.unavailable === undefined ? null : <span className={styles.why}>Not available: {command.unavailable}</span>}
            </Command.Item>
          ))
        ) : state.rows.length > 0 ? (
          <>
            <div role="presentation" style={{ height: win.before }} />
            {state.rows.slice(win.start, win.end).map((row) =>
              row.type === 'header' ? (
                <div key={row.key} role="presentation" className={styles.header} style={{ height: HEADER_ROW_HEIGHT }} aria-hidden="true">
                  {kindTitle(row.kind)} ({row.count})
                </div>
              ) : (
                <Command.Item
                  key={row.key}
                  value={row.key}
                  className={styles.item}
                  aria-posinset={hitPosition.get(row.key)}
                  aria-setsize={hitCount}
                  onSelect={() => activate(row.key)}
                  data-record-id={row.hit.ref.id}
                >
                  <span className={styles.title}>
                    {row.hit.title}
                    <span className={styles.why}> · {kindName(row.kind)}</span>
                  </span>
                  <span className={styles.why}>{matchWords(row.hit, ports.factsOf(row.hit.ref))}</span>
                </Command.Item>
              ),
            )}
            <div role="presentation" style={{ height: win.after }} />
          </>
        ) : !hasText && recent.length > 0 ? (
          <>
            <p className={styles.recent}>Recent searches</p>
            {recent.map((text, index) => (
              <Command.Item key={text} value={`recent:${text}`} className={styles.item} aria-posinset={index + 1} aria-setsize={recent.length} onSelect={() => activate(`recent:${text}`)}>
                <span className={styles.title}>{text}</span>
              </Command.Item>
            ))}
          </>
        ) : null}
      </Command.List>
    </Command>
  );
}

export function Palette(props: { readonly ports: SearchPorts; readonly open: boolean; readonly onClose: () => void }) {
  const phone = useLayoutMode() === 'phone'; // ADR-039: the whole screen on a phone
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Search" dismissOnBackdrop initialFocus="[data-palette-input]" size={phone ? 'screen' : 'default'}>
      {props.open ? <PaletteBody ports={props.ports} onClose={props.onClose} /> : null}
    </Dialog>
  );
}
