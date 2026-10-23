/**
 * The authoring comparator (step 6.9, Part 2). An authored reaction equals the demo reaction when everything is the same but ids, nested ids,
 * provenance, review and the fields no editor can set. A reference to a record is compared by that record's NAME, looked up in its own world
 * (the demo's records for the demo reaction, the app's records for the authored one), because a record made "from scratch" has another id.
 * Every difference is said as "<field path in words>: demo <value>, authored <value>". Test-side only: no chemistry.
 */

/** The name of a record by its id, or undefined when the id is not a record of that world. */
export type NameOf = (id: string) => string | undefined;

export interface Difference {
  readonly path: string;
  readonly demo: string;
  readonly authored: string;
  readonly text: string;
}

/** Fields of the reaction that no editor sets (read-only by design or a later phase); the plan (PROGRESS, Step 6.9 part 1) says why. */
export const EXCLUDED_FIELDS: readonly string[] = ['id', 'kind', 'provenance', 'review', 'mappedReaction', 'intermediates'];

type Bag = Readonly<Record<string, unknown>>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

const SINGULAR: Readonly<Record<string, string>> = {
  participants: 'participant',
  stages: 'stage',
  conditionVariants: 'variant',
  outcomes: 'outcome',
  products: 'product',
  descriptors: 'descriptor',
  purposes: 'purpose',
  namedReactionIds: 'named reaction',
  transformationIds: 'transformation',
  reactionTypes: 'reaction type',
  mechanismClasses: 'mechanism class',
  mechanismIds: 'mechanism',
  conceptIds: 'concept',
  prerequisiteConceptIds: 'prerequisite concept',
  participantIds: 'participant',
  conditionVariantIds: 'variant',
  solventCharacter: 'solvent character',
  other: 'other qualifier',
  aliases: 'alias',
  tags: 'tag',
  citations: 'citation',
};
const words = (key: string): string => key.replace(/([A-Z])/g, ' $1').toLowerCase().trim();

/** Nested ids of one reaction to the words that stand for them ("participant 2", "stage 1", "variant 2", "outcome 1", "product 2 of outcome 1"). */
function nestedLabels(reaction: Bag): Map<string, string> {
  const labels = new Map<string, string>();
  const each = (key: string, noun: string, then?: (item: Bag, n: number) => void): void => {
    const list = reaction[key];
    if (!Array.isArray(list)) return;
    list.forEach((item, at) => {
      if (!isBag(item)) return;
      if (typeof item['id'] === 'string') labels.set(item['id'], `${noun} ${at + 1}`);
      then?.(item, at + 1);
    });
  };
  each('participants', 'participant');
  each('stages', 'stage');
  each('conditionVariants', 'variant');
  each('outcomes', 'outcome', (outcome, n) => {
    const products = outcome['products'];
    if (Array.isArray(products)) products.forEach((product, at) => isBag(product) && typeof product['id'] === 'string' && labels.set(product['id'], `product ${at + 1} of outcome ${n}`));
  });
  return labels;
}

/** The reaction as `path in words -> value in words`; ids, empties and the excluded fields are gone. */
function flatten(reaction: Bag, nameOf: NameOf): Map<string, string> {
  const labels = nestedLabels(reaction);
  const out = new Map<string, string>();
  const say = (value: unknown): string | undefined => {
    if (typeof value === 'string') return labels.get(value) ?? nameOf(value) ?? value;
    return JSON.stringify(value);
  };
  const walk = (value: unknown, path: string, noun: string): void => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item, at) => walk(item, path === '' ? `${noun} ${at + 1}` : `${path} ${noun} ${at + 1}`, noun));
      return;
    }
    if (isBag(value)) {
      if (typeof value['kind'] === 'string' && typeof value['id'] === 'string' && Object.keys(value).length === 2) {
        out.set(path, `${value['kind']} ${say(value['id'])}`);
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        if (key === 'id' || (path === '' && EXCLUDED_FIELDS.includes(key))) continue;
        const sub = path === '' ? words(key) : `${path} ${words(key)}`;
        if (Array.isArray(item)) item.forEach((one, at) => walk(one, `${path === '' ? '' : `${path} `}${SINGULAR[key] ?? words(key)} ${at + 1}`, SINGULAR[key] ?? words(key)));
        else walk(item, sub, words(key));
      }
      return;
    }
    out.set(path, say(value) ?? '');
  };
  walk(reaction, '', '');
  return out;
}

/** A variant that names no stage overrides the first stage of kind "reaction"; the two spellings are the SAME record (Gate D round 1, G2). */
function withDefaultStages(reaction: Bag): Bag {
  const stages = Array.isArray(reaction['stages']) ? reaction['stages'] : [];
  const first = stages.find((stage) => isBag(stage) && stage['kind'] === 'reaction');
  const variants = reaction['conditionVariants'];
  if (!isBag(first) || !Array.isArray(variants)) return reaction;
  return { ...reaction, conditionVariants: variants.map((variant) => (isBag(variant) && variant['stageId'] === undefined ? { ...variant, stageId: first['id'] } : variant)) };
}

export function compareReaction(demo: Bag, authored: Bag, demoNameOf: NameOf, authoredNameOf: NameOf): Difference[] {
  const [a, b] = [flatten(withDefaultStages(demo), demoNameOf), flatten(withDefaultStages(authored), authoredNameOf)];
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: Difference[] = [];
  for (const path of paths) {
    const [d, u] = [a.get(path) ?? '(nothing)', b.get(path) ?? '(nothing)'];
    if (d !== u) out.push({ path, demo: d, authored: u, text: `${path}: demo ${d}, authored ${u}` });
  }
  return out;
}
