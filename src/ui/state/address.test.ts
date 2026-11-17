import { describe, expect, it } from 'vitest';
import { formatAddress, parseAddress, recordAddress, slugOf, type Address } from './address';

const roundTrip = (address: Address): void => {
  expect(parseAddress(formatAddress(address))).toEqual(address);
};

describe('address: format and parse (step 8.4g, G1)', () => {
  it('round-trips every view', () => {
    for (const view of ['navigator', 'chapters', 'dataset', 'reactions', 'precursors', 'reagents', 'named', 'mechanisms', 'syllabus', 'settings', 'workbench', 'review']) {
      roundTrip({ t: 'view', view });
    }
  });

  it('writes the map as #/map and the family page as #/family/<id>', () => {
    expect(formatAddress({ t: 'view', view: 'navigator' })).toBe('#/map');
    expect(formatAddress({ t: 'family', id: 'cls_aldol' })).toBe('#/family/cls_aldol');
    roundTrip({ t: 'family', id: 'cls_aldol' });
  });

  it('round-trips a page of each page view', () => {
    for (const view of ['chapters', 'reagents', 'named', 'mechanisms']) roundTrip({ t: 'page', view, id: 'x_1' });
  });

  it('writes a reaction as #/reactions/<id> and a family on the map as #/map/family/<id>', () => {
    expect(formatAddress({ t: 'record', view: 'reactions', kind: 'reaction', id: 'rxn_1' })).toBe('#/reactions/rxn_1');
    expect(formatAddress({ t: 'record', view: 'navigator', kind: 'class', id: 'cls_1' })).toBe('#/map/family/cls_1');
    roundTrip({ t: 'record', view: 'reactions', kind: 'reaction', id: 'rxn_1' });
    roundTrip({ t: 'record', view: 'navigator', kind: 'class', id: 'cls_1' });
    roundTrip({ t: 'record', view: 'precursors', kind: 'species', id: 'spc_1' });
    roundTrip({ t: 'record', view: 'navigator', kind: 'named_reaction', id: 'nrx_1' });
  });

  it('keeps ids that need encoding (and never puts a name in the address)', () => {
    roundTrip({ t: 'page', view: 'chapters', id: 'a b?d#e%f→₂' });
    expect(parseAddress('#/chapters/a%2Fb')).toEqual({ t: 'bad' });
    expect(formatAddress({ t: 'page', view: 'chapters', id: 'a/b' })).toBe('#/chapters/a%2Fb');
  });

  it('reads the empty address as none', () => {
    expect(parseAddress('')).toEqual({ t: 'none' });
    expect(parseAddress('#')).toEqual({ t: 'none' });
    expect(parseAddress('#/')).toEqual({ t: 'none' });
  });

  it('takes anything unknown, long or malformed as bad', () => {
    const bad = [
      '#/nowhere',
      '#/map/extra/parts/here',
      '#/settings/x',
      '#/dataset/species/x',
      '#/map/notakind/x',
      '#/map/family/',
      '#/family',
      '#/family/a/b',
      '#/chapters/%E0%A4%A',
      '#/chapters/a%00b',
      '#/chapters/' + 'a'.repeat(201),
      '#/' + 'map/'.repeat(100),
      '#//map',
      '#/map//family/x',
      '#/MAP',
      'map',
    ];
    for (const hash of bad) expect(parseAddress(hash), hash).toEqual({ t: 'bad' });
  });

  it('is bounded: a huge hash is bad without being decoded', () => {
    expect(parseAddress('#/' + '%41'.repeat(5000))).toEqual({ t: 'bad' });
  });

  it('gives each record kind an address that opens it', () => {
    expect(formatAddress(recordAddress({ kind: 'reaction', id: 'rxn_1' }))).toBe('#/reactions/rxn_1');
    expect(formatAddress(recordAddress({ kind: 'class', id: 'cls_1' }))).toBe('#/map/family/cls_1');
    expect(formatAddress(recordAddress({ kind: 'species', id: 'spc_1' }))).toBe('#/map/species/spc_1');
  });

  it('names the view slug', () => {
    expect(slugOf('navigator')).toBe('map');
    expect(slugOf('chapters')).toBe('chapters');
  });
});
