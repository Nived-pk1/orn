/**
 * Static structure of the schema: layering (INV-05, INV-13, INV-29, INV-30), selectivity only on
 * outcomes (INV-08), no stored derived relations (INV-11), typed references (INV-02, ADV-023).
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { constraintsOf, forEachSchemaNode } from '../../test-support/schema-walk';
import { SHARED_SCHEMAS } from '../../test-support/schema-shapes';
import {
  DERIVED_RELATIONS,
  LAYER_OF_KIND,
  NESTED_ID_PREFIX,
  OPERATIONAL_ID_PREFIX,
  RECORD_ID_PREFIX,
  RECORD_KINDS,
  RECORD_SCHEMAS,
  RecordRefSchema,
  RELATIONSHIP_TYPE_SPECS,
  RELATIONSHIP_TYPES,
  RelationshipSchema,
  SpeciesOrClassRefSchema,
  SubstanceRefSchema,
  type RecordKind,
} from './index';

const KIND_OF_PREFIX = new Map(RECORD_KINDS.map((kind) => [RECORD_ID_PREFIX[kind] as string, kind]));
const NESTED_PREFIXES = new Set<string>(Object.values(NESTED_ID_PREFIX));

function nodesOf(kind: RecordKind) {
  const nodes: { shape: string; fieldShape: string; pattern?: RegExp; type: string }[] = [];
  forEachSchemaNode(RECORD_SCHEMAS[kind] as z.ZodType, kind, SHARED_SCHEMAS, (node) => {
    const pattern = node.type === 'string' ? constraintsOf(node.schema).pattern : undefined;
    nodes.push({ shape: node.shape, fieldShape: node.fieldShape, pattern, type: node.type });
  });
  return nodes;
}

const CURRICULUM_WORDS = new Set(['exam', 'exams', 'syllabus', 'topic', 'topics', 'chapter', 'curriculum', 'jee']);
const camelWords = (key: string) => key.replace(/\[\]$/, '').split(/(?=[A-Z])/).map((word) => word.toLowerCase());

function idPrefixOf(pattern: RegExp | undefined): string | undefined {
  return pattern ? /^\^([a-z]{3})_/.exec(pattern.source)?.[1] : undefined;
}

describe('layering of typed ID fields (INV-05, INV-29)', () => {
  it.each(RECORD_KINDS)('%s references only same- or lower-layer kinds by typed ID', (kind) => {
    const violations: string[] = [];
    for (const node of nodesOf(kind)) {
      const prefix = idPrefixOf(node.pattern);
      if (prefix === undefined) continue;
      const target = KIND_OF_PREFIX.get(prefix);
      if (target !== undefined) {
        if (LAYER_OF_KIND[target] > LAYER_OF_KIND[kind]) violations.push(`${node.fieldShape} → ${target}`);
      } else if (prefix === OPERATIONAL_ID_PREFIX.importBatch) {
        if (node.fieldShape !== 'Provenance.importBatchId') violations.push(`${node.fieldShape}: operational ID`);
      } else if (!NESTED_PREFIXES.has(prefix)) {
        violations.push(`${node.fieldShape}: unknown prefix ${prefix}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('foundation and chemistry schemas have no curriculum fields (INV-13, INV-30)', () => {
    const lower = RECORD_KINDS.filter((kind) => LAYER_OF_KIND[kind] <= 2);
    const offending = lower.flatMap((kind) =>
      nodesOf(kind)
        .map((node) => node.fieldShape)
        .filter((shape) => camelWords(shape.split('.').pop() ?? '').some((word) => CURRICULUM_WORDS.has(word))),
    );
    expect(offending).toEqual([]);
  });
});

describe('selectivity lives only on outcomes (INV-08)', () => {
  it('no other field is named selectivity', () => {
    const shapes = RECORD_KINDS.flatMap((kind) => nodesOf(kind).map((node) => node.fieldShape)).filter((shape) =>
      /\.(selectivity|isMajor|major|minor)$/.test(shape),
    );
    expect(shapes).toEqual(['reaction.outcomes[].selectivity']);
  });
});

describe('relationships (INV-11, INV-15)', () => {
  it('derived relations are not storable relationship types', () => {
    for (const derived of DERIVED_RELATIONS) {
      expect(RELATIONSHIP_TYPES as readonly string[]).not.toContain(derived);
    }
  });

  it('every type has a spec whose endpoints are foundation or chemistry kinds', () => {
    expect(Object.keys(RELATIONSHIP_TYPE_SPECS).sort()).toEqual([...RELATIONSHIP_TYPES].sort());
    for (const spec of Object.values(RELATIONSHIP_TYPE_SPECS)) {
      for (const kind of spec.endpointKinds) expect(LAYER_OF_KIND[kind]).toBeLessThanOrEqual(2);
      if (spec.symmetric) expect(spec.label).toBe(spec.inverseLabel);
    }
  });

  it('rejects a stored derived relation at L1', () => {
    const relationship = {
      id: 'rel_ab',
      kind: 'relationship',
      type: DERIVED_RELATIONS[0],
      from: { kind: 'reaction', id: 'rxn_ab' },
      to: { kind: 'reaction', id: 'rxn_cd' },
      tags: [],
      citations: [],
      provenance: { origin: 'user', createdAt: '2026-09-26T00:00:00Z', updatedAt: '2026-09-26T00:00:00Z' },
      review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
    };
    expect(RelationshipSchema.safeParse(relationship).success).toBe(false);
    expect(RelationshipSchema.safeParse({ ...relationship, type: 'follows' }).success).toBe(true);
  });
});

describe('typed references', () => {
  it('RecordRef accepts exactly the kind matching the ID prefix (INV-02)', () => {
    for (const kind of RECORD_KINDS) {
      for (const other of RECORD_KINDS) {
        const result = RecordRefSchema.safeParse({ kind, id: `${RECORD_ID_PREFIX[other]}_ab` });
        expect(result.success, `${kind} ← ${other}`).toBe(kind === other);
      }
      expect(RecordRefSchema.safeParse({ kind, id: 'prt_ab' }).success).toBe(false);
    }
  });

  it('SubstanceRef allows species, class and reagent only; the role is per participation (ADV-023)', () => {
    expect(SubstanceRefSchema.safeParse({ kind: 'species', id: 'spc_ab' }).success).toBe(true);
    expect(SubstanceRefSchema.safeParse({ kind: 'class', id: 'cls_ab' }).success).toBe(true);
    expect(SubstanceRefSchema.safeParse({ kind: 'reagent', id: 'rgt_ab' }).success).toBe(true);
    expect(SubstanceRefSchema.safeParse({ kind: 'reaction', id: 'rxn_ab' }).success).toBe(false);
    expect(SubstanceRefSchema.safeParse({ kind: 'species', id: 'rgt_ab' }).success).toBe(false);
  });

  it('products and intermediates cannot be reagents', () => {
    expect(SpeciesOrClassRefSchema.safeParse({ kind: 'reagent', id: 'rgt_ab' }).success).toBe(false);
    expect(SpeciesOrClassRefSchema.safeParse({ kind: 'class', id: 'cls_ab' }).success).toBe(true);
  });
});

describe('presentation records (INV-14)', () => {
  it('carry provenance only: no tags, citations or review state', () => {
    for (const kind of RECORD_KINDS.filter((k) => LAYER_OF_KIND[k] === 5)) {
      const keys = Object.keys((RECORD_SCHEMAS[kind] as unknown as { shape: object }).shape);
      expect(keys).toContain('provenance');
      for (const key of ['tags', 'citations', 'review']) expect(keys, kind).not.toContain(key);
    }
  });
});
