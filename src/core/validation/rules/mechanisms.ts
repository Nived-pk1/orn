/**
 * L3 rules for mechanisms (MEC-) and caveats (CAV-). Both are judged from the record itself plus the
 * kind of what it points at; neither needs chemistry parsing.
 */
import type { CAVEAT_TARGET_ROLES, RecordKind, StructureRep } from '../../schema';
import type { ValidationRule } from '../contracts';
import { at, rule } from './helpers';

/** A SMILES atom with a map number, e.g. `[CH3:1]`. Molfiles are opaque here (chem worker, CHEM-008). */
const ATOM_MAP = /\[[^\]]*:\d+\]/;

const carriesAtomMaps = (structure: StructureRep): boolean => structure.format !== 'molfile' && ATOM_MAP.test(structure.value);

/** What each caveat target role may point at; `context` may point at anything. */
const ROLE_KINDS: Readonly<Record<(typeof CAVEAT_TARGET_ROLES)[number], readonly RecordKind[] | undefined>> = {
  affected_reaction: ['reaction', 'named_reaction', 'transformation'],
  affected_substrate: ['species', 'class'],
  affected_product: ['species', 'class'],
  affected_reagent: ['reagent', 'class'],
  affected_mechanism: ['mechanism'],
  context: undefined,
};

export const MECHANISM_RULES: readonly ValidationRule[] = [
  rule({
    id: 'MEC-001',
    level: 3,
    kinds: ['mechanism'],
    defaultSeverity: 'info',
    scope: 'record',
    description: 'Mechanism with no variants, or a variant with no steps',
    *check(mechanism) {
      if (mechanism.variants.length === 0) {
        yield { path: 'variants', message: 'This mechanism has no variants yet, only what its summary says.' };
        return;
      }
      for (const [i, variant] of mechanism.variants.entries()) {
        if (variant.steps.length > 0) continue;
        yield { path: at('variants', i, 'steps'), message: `Variant "${variant.label}" has no steps.` };
      }
    },
  }),

  rule({
    id: 'MEC-002',
    level: 3,
    kinds: ['mechanism'],
    defaultSeverity: 'error',
    scope: 'record',
    description: 'Step species with none of ref, label, structure',
    *check(mechanism) {
      for (const [i, variant] of mechanism.variants.entries()) {
        for (const [j, step] of variant.steps.entries()) {
          for (const [k, species] of step.species.entries()) {
            if (species.ref !== undefined || species.label !== undefined || species.structure !== undefined) continue;
            yield {
              path: at('variants', i, 'steps', j, 'species', k),
              message: `Species ${k + 1} of step ${j + 1} in variant "${variant.label}" has no species, label or structure.`,
            };
          }
        }
      }
    },
  }),

  rule({
    id: 'MEC-003',
    level: 3,
    kinds: ['mechanism'],
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'Electron movements present but no step structure carries atom maps',
    *check(mechanism) {
      for (const [i, variant] of mechanism.variants.entries()) {
        for (const [j, step] of variant.steps.entries()) {
          if (step.electronMovements.length === 0) continue;
          const structures = step.species.flatMap((s) => (s.structure === undefined ? [] : [s.structure]));
          // A molfile may carry maps in its atom block; only the chem worker can read them.
          if (structures.some((s) => s.format === 'molfile' || carriesAtomMaps(s))) continue;
          yield {
            path: at('variants', i, 'steps', j, 'electronMovements'),
            message: `Step ${j + 1} of variant "${variant.label}" has curved arrows, but none of its structures has atom-map numbers to attach them to.`,
          };
        }
      }
    },
  }),

  rule({
    id: 'MEC-004',
    level: 3,
    kinds: ['mechanism'],
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'More than one rate-determining step in a variant',
    *check(mechanism) {
      for (const [i, variant] of mechanism.variants.entries()) {
        const slow = variant.steps.filter((s) => s.isRateDetermining === true).length;
        if (slow < 2) continue;
        yield { path: at('variants', i, 'steps'), message: `Variant "${variant.label}" marks ${slow} steps as rate-determining; a pathway has one.`, data: { count: slow } };
      }
    },
  }),

  rule({
    id: 'CAV-001',
    level: 3,
    kinds: ['caveat'],
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'Caveat with no targets',
    *check(caveat) {
      if (caveat.targets.length > 0) return;
      yield { path: 'targets', message: `"${caveat.title}" does not say what it applies to.` };
    },
  }),

  rule({
    id: 'CAV-002',
    level: 3,
    kinds: ['caveat'],
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'Target role inconsistent with target kind',
    *check(caveat) {
      for (const [i, target] of caveat.targets.entries()) {
        const allowed = ROLE_KINDS[target.as];
        if (allowed === undefined || allowed.includes(target.ref.kind)) continue;
        yield {
          path: at('targets', i, 'as'),
          message: `Target ${i + 1} is a ${target.ref.kind}, which does not fit the role "${target.as.replace(/_/g, ' ')}".`,
        };
      }
    },
  }),
];
