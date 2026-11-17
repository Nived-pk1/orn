import { describe, expect, it } from 'vitest';
import { createInspectorStore, createNavigatorUiStores, parseAddress } from '@/ui/state';
import { applyAddress, currentAddress, type AddressHost } from './address-state';
import { openChapter } from './chapters-entry';
import { openReagent } from './reagents-entry';
import { openMechanism, openNamed } from './page-entries';

const KNOWN: Record<string, readonly string[]> = { topic: ['top_a'], reagent: ['rg_1'], named_reaction: ['nr_1'], mechanism: ['mc_1'], class: ['cls_1'], reaction: ['rxn_1'], species: ['sp_1'] };

function host() {
  const ui = createNavigatorUiStores();
  const inspector = createInspectorStore();
  const log: string[] = [];
  let mode = 'navigator';
  const setMode = (next: string): void => {
    mode = next;
  };
  const h: AddressHost = {
    ui,
    inspector,
    has: (kind, id) => KNOWN[kind]?.includes(id) === true || (kind === 'topic' && id === 'none'),
    views: ['navigator', 'chapters', 'reactions', 'precursors', 'reagents', 'named', 'mechanisms', 'syllabus', 'settings'],
    setMode,
    open: {
      chapters: (id) => openChapter(ui, setMode, id),
      reagents: (id) => openReagent(ui, setMode, id),
      named: (id) => openNamed(ui, setMode, id),
      mechanisms: (id) => openMechanism(ui, setMode, id),
    },
    show: (ref) => {
      log.push(`show ${ref.kind}:${ref.id}`);
      setMode('navigator');
      inspector.getState().open(ref);
    },
  };
  return { h, ui, inspector, log, mode: () => mode };
}

const apply = (h: AddressHost, hash: string) => applyAddress(h, parseAddress(hash));

describe('address and state (step 8.4g, G1)', () => {
  it('writes the view, the page, the family page and the selection', () => {
    const { h, ui, inspector } = host();
    expect(currentAddress('settings', h)).toEqual({ t: 'view', view: 'settings' });
    ui.chapters.getState().open('top_a');
    expect(currentAddress('chapters', h)).toEqual({ t: 'page', view: 'chapters', id: 'top_a' });
    ui.reagents.getState().open('rg_1');
    expect(currentAddress('reagents', h)).toEqual({ t: 'page', view: 'reagents', id: 'rg_1' });
    expect(currentAddress('named', h)).toEqual({ t: 'view', view: 'named' });
    inspector.getState().open({ kind: 'reaction', id: 'rxn_1' });
    expect(currentAddress('reactions', h)).toEqual({ t: 'record', view: 'reactions', kind: 'reaction', id: 'rxn_1' });
    expect(currentAddress('navigator', h)).toEqual({ t: 'record', view: 'navigator', kind: 'reaction', id: 'rxn_1' });
    expect(currentAddress('settings', h)).toEqual({ t: 'view', view: 'settings' });
    ui.family.getState().openFamily('cls_1');
    expect(currentAddress('navigator', h)).toEqual({ t: 'family', id: 'cls_1' });
  });

  it('does not take the bucket or an arrow for a record', () => {
    const { h, inspector } = host();
    inspector.getState().select({ kind: 'bucket' });
    expect(currentAddress('navigator', h)).toEqual({ t: 'view', view: 'navigator' });
  });

  it('opens a view, and closes the family page when it leaves the map', () => {
    const { h, ui, mode } = host();
    ui.family.getState().openFamily('cls_1');
    expect(apply(h, '#/reactions')).toBe('ok');
    expect(mode()).toBe('reactions');
    expect(ui.family.getState().open).toBeNull();
    expect(ui.overview.getState().phoneTab).toBe('explore');
  });

  it('a plain view address shows no record: Back to #/map clears the selection', () => {
    const { h, ui, inspector } = host();
    inspector.getState().open({ kind: 'class', id: 'cls_1' });
    ui.selection.getState().select({ kind: 'node', id: 'cls_1' });
    expect(apply(h, '#/map')).toBe('ok');
    expect(currentAddress('navigator', h)).toEqual({ t: 'view', view: 'navigator' });
    expect(ui.selection.getState().selected).toBeNull();
  });

  it('opens a page of each page view', () => {
    const { h, ui, mode } = host();
    expect(apply(h, '#/chapters/top_a')).toBe('ok');
    expect(ui.chapters.getState().chapterId).toBe('top_a');
    expect(apply(h, '#/chapters/none')).toBe('ok');
    expect(apply(h, '#/reagents/rg_1')).toBe('ok');
    expect(ui.reagents.getState().reagentId).toBe('rg_1');
    expect(apply(h, '#/named/nr_1')).toBe('ok');
    expect(apply(h, '#/mechanisms/mc_1')).toBe('ok');
    expect(ui.mechanisms.getState().openId).toBe('mc_1');
    expect(mode()).toBe('mechanisms');
  });

  it('a page that is already open keeps its filters (a reload restores the saved page, then the address)', () => {
    const { h, ui } = host();
    ui.chapters.getState().open('top_a');
    ui.chapters.getState().setText('oxid');
    expect(apply(h, '#/chapters/top_a')).toBe('ok');
    expect(ui.chapters.getState().text).toBe('oxid');
    ui.reagents.getState().open('rg_1');
    ui.reagents.getState().setText('na');
    expect(apply(h, '#/reagents/rg_1')).toBe('ok');
    expect(ui.reagents.getState().text).toBe('na');
    expect(apply(h, '#/chapters/none')).toBe('ok');
    expect(ui.chapters.getState().text).toBe('');
  });

  it('opens the family page, a reaction in Reactions and a record on the map', () => {
    const { h, ui, inspector, log, mode } = host();
    expect(apply(h, '#/family/cls_1')).toBe('ok');
    expect(ui.family.getState().open).toBe('cls_1');
    expect(mode()).toBe('navigator');
    expect(apply(h, '#/reactions/rxn_1')).toBe('ok');
    expect(mode()).toBe('reactions');
    expect(ui.family.getState().open).toBeNull();
    expect(inspector.getState().history.at(-1)).toMatchObject({ kind: 'reaction', id: 'rxn_1' });
    expect(apply(h, '#/map/family/cls_1')).toBe('ok');
    expect(apply(h, '#/map/species/sp_1')).toBe('ok');
    expect(log).toEqual(['show class:cls_1', 'show species:sp_1']);
  });

  it('says missing for a record this version does not have, and bad for a broken address', () => {
    const { h, mode } = host();
    expect(apply(h, '#/reactions/rxn_9')).toBe('missing');
    expect(apply(h, '#/chapters/top_zz')).toBe('missing');
    expect(apply(h, '#/family/cls_9')).toBe('missing');
    expect(apply(h, '#/nowhere')).toBe('bad');
    expect(apply(h, '#/review')).toBe('bad');
    expect(apply(h, '')).toBe('none');
    expect(mode()).toBe('navigator');
  });
});
