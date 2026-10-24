/**
 * The palette's model (step 5.8): input text -> the step 4.5 grammar parser -> a debounced query -> rows. A plain React-free store
 * with injected timers, so the rules are tested with fake timers:
 *  - a newer input supersedes the older: the older answer is dropped when it arrives, even when it succeeded (a token per input), and
 *    the service cancels the call on the same channel;
 *  - `NOT_READY` (the index is still loading) is "Search is starting", asked again every 500 ms up to 20 times; it is never an empty list;
 *  - an answer from an index that is still catching up with a committed change is never shown as final (a rename would be missed): "Search is catching up", asked
 *    again like NOT_READY; after the same bound the answer is shown with a warning; an index that failed to follow is said in words next to the answer;
 *  - every other failure is said in words with its code; an empty answer says "No results";
 *  - "> text" lists commands (synchronously; unavailable ones with their reason); empty text lists the recent searches.
 * Nothing here knows chemistry: the engine ranked the hits; the model groups and words them.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { parsePalette, type PaletteQuery } from '@/search/palette/parse';
import { filterCommands } from './commands';
import {
  PALETTE_CHANNEL,
  PALETTE_DEBOUNCE_MS,
  PALETTE_LIMIT,
  SHOW_REACTIONS_KINDS,
  STARTING_RETRY_MAX,
  STARTING_RETRY_MS,
  type PaletteCommand,
  type SearchPorts,
} from './contracts';
import { groupRows, type PaletteRow } from './rows';

export type PaletteStatus = 'idle' | 'waiting' | 'searching' | 'results' | 'starting' | 'failed';

export interface PaletteState {
  readonly input: string;
  readonly parsed: PaletteQuery;
  readonly status: PaletteStatus;
  /** Rows of the latest answer that belongs to the CURRENT input (or the previous one, while the new one is on its way). */
  readonly rows: readonly PaletteRow[];
  readonly commands: readonly PaletteCommand[];
  /** Words for the status a person must be told (starting, failed, no results, a cut query); '' when there is nothing to say. */
  readonly message: string;
  /** Counts every list the palette shows, so a test (and the live region) can tell a new list from a repeat. */
  readonly serial: number;
}

export interface PaletteModel {
  readonly store: StoreApi<PaletteState>;
  setInput(text: string): void;
  /** Runs a command; answers its reason when it cannot run now (nothing ran). */
  runCommand(command: PaletteCommand): { readonly ran: boolean; readonly reason?: string };
  /** Opens a result (and keeps the typed text as a recent search). */
  openHit(index: number, how?: 'record' | 'reactions'): void;
  /** Shows the recent searches / the command list afresh (the palette was opened). */
  reset(): void;
  dispose(): void;
}

const EMPTY: PaletteQuery = { mode: 'search', text: '', truncated: false };

const initial = (): PaletteState => ({ input: '', parsed: EMPTY, status: 'idle', rows: [], commands: [], message: '', serial: 0 });

const cutNote = (parsed: PaletteQuery): string => (parsed.truncated ? 'Only the first 16 words (1,000 characters) of the text were used. ' : '');

export function createPaletteModel(ports: SearchPorts): PaletteModel {
  const store = createStore<PaletteState>(initial);
  let token = 0;
  let cancel: (() => void) | undefined;
  const patch = (next: Partial<PaletteState>): void => store.setState((s) => ({ ...s, ...next, serial: s.serial + 1 }));
  const stopTimer = (): void => {
    cancel?.();
    cancel = undefined;
  };

  function ask(mine: number, attempt: number): void {
    const parsed = store.getState().parsed;
    if (parsed.mode !== 'search') return;
    const examVersionId = ports.examVersionId();
    patch({ status: 'searching' });
    void ports
      .search(PALETTE_CHANNEL, { text: parsed.text, ...(parsed.kinds === undefined ? {} : { kinds: parsed.kinds }), ...(examVersionId === undefined ? {} : { examVersionId }), limit: PALETTE_LIMIT })
      .then((answer) => {
        if (mine !== token) return; // a newer input replaced this one: its answer is never shown
        if (answer.ok) {
          const index = ports.indexState?.() ?? { state: 'current' };
          if (index.state === 'catching_up' && attempt < STARTING_RETRY_MAX) {
            patch({ status: 'starting', rows: [], message: 'Search is catching up with your latest change' });
            cancel = ports.timers.after(STARTING_RETRY_MS, () => {
              cancel = undefined;
              if (mine === token) ask(mine, attempt + 1);
            });
            return;
          }
          const rows = groupRows(answer.value);
          let warning = '';
          if (index.state === 'catching_up') {
            warning = 'The results may not include your latest change.';
            ports.log('search_index_behind', 'the search index had not followed the latest change after the palette waited for it');
          } else if (index.state === 'failed') warning = `Search could not follow your latest change (${index.reason}); the results may be out of date.`;
          const note = cutNote(parsed);
          patch({ status: 'results', rows, message: answer.value.length === 0 ? `${note}No results for “${parsed.text}”.${warning === '' ? '' : ` ${warning}`}` : `${note}${warning}`.trim() });
          return;
        }
        if (answer.code === 'CANCELLED') return;
        if (answer.code === 'NOT_READY') {
          if (attempt >= STARTING_RETRY_MAX) {
            patch({ status: 'failed', rows: [], message: 'Search did not start. Reload the page to try again.' });
            ports.log('search_not_started', 'the search index was not ready after the palette waited for it');
            return;
          }
          patch({ status: 'starting', rows: [], message: 'Search is starting' });
          cancel = ports.timers.after(STARTING_RETRY_MS, () => {
            cancel = undefined;
            if (mine === token) ask(mine, attempt + 1);
          });
          return;
        }
        patch({ status: 'failed', rows: [], message: `Search could not answer (${answer.code}): ${answer.message}` });
        ports.log('search_failed', `${answer.code}: ${answer.message}`);
      });
  }

  function setInput(text: string): void {
    token += 1;
    stopTimer();
    const mine = token;
    const parsed = parsePalette(text);
    if (parsed.mode === 'command') {
      const all = ports.commands();
      const commands = filterCommands(all, parsed.text);
      patch({ input: text, parsed, status: 'idle', rows: [], commands, message: commands.length === 0 ? `No command matches “${parsed.text}”.` : cutNote(parsed).trim() });
      return;
    }
    if (parsed.text === '' && parsed.kinds === undefined) {
      patch({ input: text, parsed, status: 'idle', rows: [], commands: [], message: '' });
      return;
    }
    patch({ input: text, parsed, status: 'waiting', commands: [], message: '' });
    cancel = ports.timers.after(PALETTE_DEBOUNCE_MS, () => {
      cancel = undefined;
      if (mine === token) ask(mine, 0);
    });
  }

  return {
    store,
    setInput,
    runCommand(command) {
      if (command.unavailable !== undefined) return { ran: false, reason: command.unavailable };
      command.run();
      return { ran: true };
    },
    openHit(index, how = 'record') {
      const row = store.getState().rows[index];
      if (row === undefined || row.type !== 'hit') return;
      const { parsed } = store.getState();
      if (parsed.mode === 'search' && parsed.text !== '') ports.recent.getState().add(store.getState().input.trim());
      if (how === 'reactions' && ports.showReactions !== undefined && SHOW_REACTIONS_KINDS.includes(row.hit.ref.kind)) ports.showReactions(row.hit.ref, row.hit.title);
      else ports.open(row.hit.ref, row.hit.title);
    },
    reset() {
      token += 1;
      stopTimer();
      store.setState({ ...initial(), serial: store.getState().serial + 1 });
    },
    dispose() {
      token += 1;
      stopTimer();
    },
  };
}
