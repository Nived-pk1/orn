/**
 * The rich-text registry must list exactly the rich-text fields of the schema. Fields are found by
 * walking the maximal fixture (every optional key is present, see maximal-fixture.test.ts) alongside
 * the record schemas and picking the nodes typed `RichTextSchema`.
 */
import { describe, expect, it } from 'vitest';
import { walkValue } from '../../test-support/schema-walk';
import { SHARED_SCHEMAS } from '../../test-support/schema-shapes';
import { loadFixtureState } from '../../test-support/state-fixture';
import { parsePath } from '../references/paths';
import { RECORD_KINDS, RECORD_SCHEMAS, RICH_TEXT_PATHS, RichTextSchema } from './index';

function richPathsInFixture(): Record<string, string[]> {
  const state = loadFixtureState('maximal-valid');
  const found: Record<string, string[]> = {};
  for (const kind of RECORD_KINDS) {
    const paths = new Set<string>();
    for (const record of Object.values(state.records[kind])) {
      walkValue(RECORD_SCHEMAS[kind], record, kind, SHARED_SCHEMAS, (node) => {
        if (node.schema !== RichTextSchema || typeof node.value !== 'string') return;
        paths.add(node.path.reduce<string>((text, part) => (typeof part === 'number' ? `${text}[]` : text === '' ? part : `${text}.${part}`), ''));
      });
    }
    found[kind] = [...paths].sort();
  }
  return found;
}

describe('RICH_TEXT_PATHS', () => {
  it('lists exactly the rich-text fields the maximal fixture populates, for every kind', () => {
    const expected = richPathsInFixture();
    for (const kind of RECORD_KINDS) expect([...RICH_TEXT_PATHS[kind]].sort(), kind).toEqual(expected[kind]);
    expect(Object.values(expected).flat().length).toBeGreaterThan(50);
  });

  it('uses well-formed registry paths without a terminal array marker', () => {
    for (const kind of RECORD_KINDS) {
      for (const path of RICH_TEXT_PATHS[kind]) {
        expect(parsePath(path).at(-1)?.each, `${kind}.${path}`).toBe(false);
      }
    }
  });
});
