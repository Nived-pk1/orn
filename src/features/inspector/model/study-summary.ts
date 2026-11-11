/**
 * The ONE summary line under a pane's title (step 8.4e, B1; design reference section 9): a reaction says its ends ("Ethanol → Ethanal"), a compound its
 * formula, anything else the first sentence of its lead. Pure over a snapshot; nothing here is chemistry beyond names the records hold.
 */
import type { Reaction, RecordRef, Species } from '@/core/schema';
import { nameOf } from './describe';
import type { Snapshot } from './study-connected';
import { plain } from './study-words';

const MAX_LINE = 110;
const MAX_NAMES = 2;

const cut = (text: string): string => (text.length <= MAX_LINE ? text : `${text.slice(0, MAX_LINE - 1).trimEnd()}…`);

function ends(snapshot: Snapshot, reaction: Reaction): string | undefined {
  const nameList = (refs: readonly { readonly ref: unknown }[]): string => {
    const names = refs.map((one) => nameOf(snapshot.state, one.ref as RecordRef));
    return names.slice(0, MAX_NAMES).join(' + ') + (names.length > MAX_NAMES ? ' + …' : '');
  };
  const from = nameList(reaction.participants.filter((p) => p.role === 'reactant'));
  // the products of the first outcome, the main ones first
  const products = (reaction.outcomes[0]?.products ?? []).filter((p) => p.role === 'main');
  const to = nameList(products.length > 0 ? products : (reaction.outcomes[0]?.products ?? []));
  return from === '' || to === '' ? undefined : `${from} → ${to}`;
}

export function summaryOf(snapshot: Snapshot, ref: RecordRef, record: unknown, lead: string | undefined): string | undefined {
  if (ref.kind === 'reaction') return ends(snapshot, record as Reaction);
  if (ref.kind === 'species') {
    const formula = (record as Species).formula;
    if (formula !== undefined && formula !== '') return plain(formula);
  }
  if (lead === undefined) return undefined;
  const text = plain(lead).replace(/\s+/g, ' ').trim();
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  return text === '' ? undefined : cut(sentence);
}
