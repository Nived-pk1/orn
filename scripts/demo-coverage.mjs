#!/usr/bin/env node
// Step 6.9 coverage plan: which features of the reaction schema each demo reaction uses, and the smallest set of reactions that together
// use every feature present. Reads data/seed/demo.orn.json only (never edits it). Usage:
//   node scripts/demo-coverage.mjs table   -> markdown table of reactions against features
//   node scripts/demo-coverage.mjs set     -> the minimal coverage set (exact search) and the feature -> reaction list
//   node scripts/demo-coverage.mjs json    -> { reactions, features, set } as JSON (the authoring tests read the same module)
import { readFileSync } from 'node:fs';

/** Paths whose VALUE is part of the feature (a closed vocabulary), not free text or an id. */
const ENUM_PATHS = new Set([
  'scope', 'purposes[]', 'participants[].role', 'participants[].ref.kind', 'stages[].kind', 'outcomes[].selectivity',
  'outcomes[].products[].role', 'outcomes[].products[].ref.kind', 'outcomes[].stereochemistry.outcome', 'reversibility.kind',
  'stages[].parameters.temperature.kind', 'stages[].parameters.pressure.kind', 'stages[].parameters.medium',
  'conditionVariants[].parameters.temperature.kind', 'conditionVariants[].parameters.medium',
]);
/** Leaf details of a value (number, unit, range ends) are one feature with their parent: the editors set them together. */
const DETAIL = /\.(value|unit|min|max|certainty|conceptId)$/;
/** Paths that are identity, bookkeeping or bare ids: not features. */
const SKIP = /(^|\.)(id|kind|provenance|review|createdAt|updatedAt)(\[\]|$|\.)|participantIds|conditionVariantIds|\.stageId$/;

export function pathsOf(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    if (value.length === 0) return out;
    out.add(`${prefix}[]`);
    for (const item of value) {
      if (item !== null && typeof item === 'object') pathsOf(item, `${prefix}[]`, out);
      else if (ENUM_PATHS.has(`${prefix}[]`)) out.add(`${prefix}[]=${item}`);
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix === '' ? key : `${prefix}.${key}`;
      if (key === 'provenance' || key === 'review' || key === 'id' || (key === 'kind' && prefix === '')) continue;
      pathsOf(item, path, out);
    }
    return out;
  }
  if (value === undefined || value === false && !ENUM_PATHS.has(prefix)) {
    if (value === false) out.add(prefix);
    return out;
  }
  if (!DETAIL.test(prefix)) out.add(prefix);
  if (ENUM_PATHS.has(prefix)) out.add(`${prefix}=${value}`);
  return out;
}

/** Features that the reaction record itself does not hold: records that point at it. */
function pointersTo(records, id) {
  const found = new Set();
  const walk = (value, kind, path) => {
    if (typeof value === 'string') {
      if (value === id) found.add(`pointed at by ${kind}.${path.replace(/\[\d+\]/g, '[]')}`);
    } else if (Array.isArray(value)) value.forEach((item, i) => walk(item, kind, `${path}[${i}]`));
    else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, kind, path === '' ? k : `${path}.${k}`);
  };
  for (const [kind, set] of Object.entries(records)) {
    if (kind === 'reaction') continue;
    for (const record of Object.values(set)) walk(record, kind, '');
  }
  return found;
}

/** The feature FAMILIES (the coverage set's granularity): a value of an enum stays a feature only where the person chooses between kinds of the thing. */
const KEEP_VALUES = new Set(['scope', 'participants[].role', 'stages[].kind', 'outcomes[].selectivity', 'outcomes[].products[].role', 'reversibility.kind', 'purposes[]']);
export function familyOf(feature) {
  const eq = feature.indexOf('=');
  let path = eq < 0 ? feature : feature.slice(0, eq);
  if (eq >= 0 && KEEP_VALUES.has(path)) return feature;
  path = path.replace(/\.(temperature|pressure|time)\.kind$/, '.$1');
  return path;
}

export function load(path = 'data/seed/demo.orn.json') {
  const demo = JSON.parse(readFileSync(path, 'utf8'));
  const reactions = Object.values(demo.records.reaction).sort((a, b) => (a.id < b.id ? -1 : 1));
  const features = new Map();
  for (const reaction of reactions) {
    const own = pathsOf(reaction);
    // derived features worth naming
    if (reaction.stages.length > 1) own.add('several stages');
    if (reaction.participants.some((p) => p.ref.kind === 'class')) own.add('class participant');
    if (reaction.outcomes.some((o) => o.products.some((p) => p.ref.kind === 'class'))) own.add('class product');
    if (reaction.outcomes.length > 1) own.add('several outcomes');
    if (reaction.outcomes.some((o) => o.conditionVariantIds.length > 0)) own.add('outcome tied to a variant');
    if (reaction.outcomes.some((o) => o.isomerGroup !== undefined)) own.add('outcome group (isomerGroup)');
    for (const pointer of pointersTo(demo.records, reaction.id)) own.add(pointer);
    features.set(reaction.id, own);
  }
  const families = new Map([...features].map(([id, set]) => [id, new Set([...set].map(familyOf))]));
  return { demo, reactions, features, families };
}

/** Features no editor can set (read-only by design or a later phase): left out of the coverage need and said in the plan. */
export const NOT_AUTHORABLE = /^pointed at by (route\.|reaction_scheme\.)|^mappedReaction|^intermediates/;

/** The smallest set of reactions whose features together cover every feature present (exact: iterative deepening, then the lexicographically first). */
export function minimalSet(features, ids) {
  const all = new Set([...features.values()].flatMap((s) => [...s]).filter((f) => !NOT_AUTHORABLE.test(f)));
  const need = [...all].sort();
  const owners = new Map(need.map((f) => [f, ids.filter((id) => features.get(id).has(f))]));
  let best = null;
  const search = (chosen, covered, limit) => {
    if (best !== null && chosen.length >= best.length) return;
    const missing = need.filter((f) => !covered.has(f)).sort((a, b) => owners.get(a).length - owners.get(b).length)[0];
    if (missing === undefined) { best = [...chosen]; return; }
    if (chosen.length >= limit) return;
    for (const id of owners.get(missing)) {
      const next = new Set(covered);
      for (const f of features.get(id)) next.add(f);
      search([...chosen, id], next, limit);
    }
  };
  for (let limit = 1; limit <= 27 && best === null; limit++) search([], new Set(), limit);
  return { set: best, all: need, owners };
}

if (process.argv[1]?.endsWith('demo-coverage.mjs')) {
  const mode = process.argv[2] ?? 'set';
  const { reactions, features: fine, families } = load();
  const features = process.argv[3] === 'fine' || mode === 'plan' ? fine : families;
  const ids = reactions.map((r) => r.id);
  const { set, all, owners } = minimalSet(features, ids);
  if (mode === 'json') console.log(JSON.stringify({ reactions: ids, features: all, set }, null, 1));
  else if (mode === 'table') {
    console.log(`| Feature | Reactions using it (${ids.length} total) |\n|---|---|`);
    for (const f of all) console.log(`| ${f} | ${owners.get(f).length} | ${owners.get(f).map((i) => i.replace(/^rxn_/, '')).join(', ')} |`);
  } else if (mode === 'plan') {
    const cols = [
      ['generic', (r) => r.scope === 'generic'], ['instanceOf', (r) => r.instanceOfId !== undefined],
      ['class part.', (r) => r.participants.some((p) => p.ref.kind === 'class')], ['>1 stage', (r) => r.stages.length > 1],
      ['workup', (r) => r.stages.some((s) => s.kind === 'workup')], ['variants', (r) => r.conditionVariants.length > 0],
      ['parsed', (r) => r.stages.some((s) => s.parameters.parsedFields?.length > 0)], ['group', (r) => r.outcomes.some((o) => o.isomerGroup !== undefined)],
      ['excl', (r) => r.outcomes.some((o) => o.selectivity === 'exclusive')], ['major', (r) => r.outcomes.some((o) => o.selectivity === 'major')],
      ['minor', (r) => r.outcomes.some((o) => o.selectivity === 'minor')], ['byprod', (r) => r.outcomes.some((o) => o.products.some((p) => p.role === 'byproduct'))],
      ['coprod', (r) => r.outcomes.some((o) => o.products.some((p) => p.role === 'coproduct'))], ['interm.', (r) => r.intermediates.length > 0],
      ['mech', (r) => r.mechanismIds.length > 0], ['out.mech', (r) => r.outcomes.some((o) => o.mechanism !== undefined)],
      ['class.', (r) => r.reactionTypes.length + r.mechanismClasses.length > 0], ['named', (r) => r.namedReactionIds.length > 0],
      ['transf.', (r) => r.transformationIds.length > 0], ['caveat', (r) => features.get(r.id).has('pointed at by caveat.targets[].ref.id')],
      ['relat.', (r) => [...features.get(r.id)].some((f) => f.startsWith('pointed at by relationship'))], ['topic', (r) => features.get(r.id).has('pointed at by topic_mapping.target.id')],
      ['notes', (r) => r.notes !== undefined || r.studyNotes !== undefined || r.limitations !== undefined], ['tags/cit.', (r) => r.tags.length + r.citations.length > 0],
    ];
    console.log(`| Reaction | ${cols.map((c) => c[0]).join(' | ')} |
|---|${cols.map(() => '---').join('|')}|`);
    for (const r of reactions) console.log(`| ${r.id.replace(/^rxn_/, '')} | ${cols.map((c) => (c[1](r) ? 'x' : '')).join(' | ')} |`);
    console.log(`| **count** | ${cols.map((c) => reactions.filter(c[1]).length).join(' | ')} |`);
  } else {
    console.log(`${all.length} features, minimal set of ${set.length}:`);
    for (const id of set) console.log(`  ${id}: ${[...features.get(id)].filter((f) => (owners.get(f)?.length ?? 99) < 3).join('; ')}`);
  }
}
