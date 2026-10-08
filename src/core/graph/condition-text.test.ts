/**
 * Arrow-text conditions (step 5.5a part 3, item l; the 5.4b review, decision 5): one table row per field and wording rule, the order,
 * the free text rule, what is NOT on the arrow, the variant rule (413 K and 443 K), the range, the cap and the single `more` part.
 */
import { describe, expect, it } from 'vitest';
import { arrowTextOf, MAX_CONDITION_PARTS, type ArrowText, type ArrowTextContext } from '.';
import { conditionPartsOf, MAX_TEXT_CHARS, MINUS, overrideParameters } from './condition-text';
import { documentToState } from '@/core/dataset';
import type { ConditionParameters, ConditionVariantId, ParticipantId, Reaction, ReactionScheme, StageId } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';

const NONE: ConditionParameters = { solventCharacter: [], activation: [], other: [], parsedFields: [] };
const of = (over: Partial<ConditionParameters>): ConditionParameters => ({ ...NONE, ...over });
const shown = (parameters: ConditionParameters): string[] => conditionPartsOf(parameters).map((p) => `${p.kind}:${p.text}`);
const C = (value: number) => ({ kind: 'value', value, unit: 'C' }) as const;

describe('one row per field and wording rule', () => {
  const rows: readonly (readonly [string, ConditionParameters, readonly string[]])[] = [
    // temperature
    ['temperature value, kelvin', of({ temperature: { kind: 'value', value: 413, unit: 'K' } }), ['condition:413 K']],
    ['temperature value, celsius (the schema word C)', of({ temperature: C(25) }), ['condition:25 C']],
    ['temperature value, negative: U+2212', of({ temperature: C(-10) }), [`condition:${MINUS}10 C`]],
    ['temperature value, decimal', of({ temperature: C(37.5) }), ['condition:37.5 C']],
    ['temperature range: en dash', of({ temperature: { kind: 'range', min: 0, max: 5, unit: 'C' } }), ['condition:0–5 C']],
    ['temperature range with a negative bound: "a to b"', of({ temperature: { kind: 'range', min: -10, max: 5, unit: 'C' } }), [`condition:${MINUS}10 to 5 C`]],
    ['temperature range, both bounds negative', of({ temperature: { kind: 'range', min: -20, max: -5, unit: 'C' } }), [`condition:${MINUS}20 to ${MINUS}5 C`]],
    ['temperature qualitative: low temperature', of({ temperature: { kind: 'qualitative', value: 'low_temperature' } }), ['condition:low temperature']],
    ['temperature qualitative: cold', of({ temperature: { kind: 'qualitative', value: 'cold' } }), ['condition:cold']],
    ['temperature qualitative: room temperature', of({ temperature: { kind: 'qualitative', value: 'room_temperature' } }), ['condition:room temperature']],
    ['temperature qualitative: warm', of({ temperature: { kind: 'qualitative', value: 'warm' } }), ['condition:warm']],
    ['temperature qualitative: heat', of({ temperature: { kind: 'qualitative', value: 'heat' } }), ['condition:heat']],
    ['temperature qualitative: reflux', of({ temperature: { kind: 'qualitative', value: 'reflux' } }), ['condition:reflux']],
    ['temperature qualitative: strong heat', of({ temperature: { kind: 'qualitative', value: 'strong_heat' } }), ['condition:strong heat']],
    // pressure
    ['pressure value', of({ pressure: { kind: 'value', value: 1, unit: 'bar' } }), ['condition:1 bar']],
    ['pressure range', of({ pressure: { kind: 'range', min: 60, max: 70, unit: 'atm' } }), ['condition:60–70 atm']],
    ['pressure unit kPa', of({ pressure: { kind: 'value', value: 101.3, unit: 'kPa' } }), ['condition:101.3 kPa']],
    ['pressure unit mmHg', of({ pressure: { kind: 'value', value: 760, unit: 'mmHg' } }), ['condition:760 mmHg']],
    ['pressure qualitative: reduced', of({ pressure: { kind: 'qualitative', value: 'reduced' } }), ['condition:reduced']],
    ['pressure qualitative: atmospheric', of({ pressure: { kind: 'qualitative', value: 'atmospheric' } }), ['condition:atmospheric']],
    ['pressure qualitative: high', of({ pressure: { kind: 'qualitative', value: 'high' } }), ['condition:high']],
    // light
    ['light: hv', of({ light: 'hv' }), ['condition:hv']],
    ['light: uv', of({ light: 'uv' }), ['condition:uv']],
    ['light: visible', of({ light: 'visible' }), ['condition:visible']],
    ['light: sunlight', of({ light: 'sunlight' }), ['condition:sunlight']],
    ['light: diffuse', of({ light: 'diffuse' }), ['condition:diffuse']],
    ['light: dark', of({ light: 'dark' }), ['condition:dark']],
    // medium: written, the enum word and " medium"
    ['medium: acidic', of({ medium: 'acidic' }), ['condition:acidic medium']],
    ['medium: basic', of({ medium: 'basic' }), ['condition:basic medium']],
    ['medium: neutral', of({ medium: 'neutral' }), ['condition:neutral medium']],
    ['medium: buffered', of({ medium: 'buffered' }), ['condition:buffered medium']],
    // time
    ['time value in hours', of({ time: { kind: 'value', value: 2, unit: 'h' } }), ['condition:2 h']],
    ['time value in minutes', of({ time: { kind: 'value', value: 30, unit: 'min' } }), ['condition:30 min']],
    ['time value in seconds and days', of({ time: { kind: 'value', value: 1, unit: 'd' } }), ['condition:1 d']],
    ['time qualitative: brief', of({ time: { kind: 'qualitative', value: 'brief' } }), ['condition:brief']],
    ['time qualitative: prolonged', of({ time: { kind: 'qualitative', value: 'prolonged' } }), ['condition:prolonged']],
    // activation: a list, each word as it is
    ['activation: one word', of({ activation: ['microwave'] }), ['condition:microwave']],
    ['activation: a list, in record order', of({ activation: ['ultrasound', 'electrolysis', 'radiation'] }), ['condition:ultrasound', 'condition:electrolysis', 'condition:radiation']],
    // atmosphere: air is written; a gas is a formula part
    ['atmosphere: air is written', of({ atmosphere: 'air' }), ['condition:air']],
    ['atmosphere: inert is the schema word', of({ atmosphere: 'inert' }), ['condition:inert']],
    ['atmosphere: nitrogen is a formula part', of({ atmosphere: 'nitrogen' }), ['formula:N2']],
    ['atmosphere: argon is a formula part', of({ atmosphere: 'argon' }), ['formula:Ar']],
    ['atmosphere: oxygen is a formula part', of({ atmosphere: 'oxygen' }), ['formula:O2']],
    ['atmosphere: hydrogen is a formula part', of({ atmosphere: 'hydrogen' }), ['formula:H2']],
    // anhydrous
    ['anhydrous true is written', of({ anhydrous: true }), ['condition:anhydrous']],
    ['anhydrous false says nothing', of({ anhydrous: false }), []],
    // other: each qualifier as written
    ['other: each qualifier as written', of({ other: ['sealed tube', 'peroxide present'] }), ['condition:sealed tube', 'condition:peroxide present']],
    // not on the arrow
    ['solventCharacter is not on the arrow', of({ solventCharacter: ['aqueous', 'neat'] }), []],
    ['parsedFields is not on the arrow', of({ parsedFields: ['temperature'], temperature: C(25) }), ['condition:25 C']],
  ];
  it.each(rows)('%s', (_name, parameters, expected) => {
    expect(shown(parameters)).toEqual(expected);
  });

  it('nothing stated gives nothing', () => {
    expect(conditionPartsOf(NONE)).toEqual([]);
  });
});

describe('order and free text', () => {
  it('temperature, pressure, light, medium, time, activation, atmosphere, anhydrous, other', () => {
    const all = of({
      temperature: C(25),
      pressure: { kind: 'value', value: 1, unit: 'atm' },
      time: { kind: 'value', value: 2, unit: 'h' },
      medium: 'acidic',
      light: 'uv',
      atmosphere: 'argon',
      activation: ['microwave'],
      anhydrous: true,
      other: ['sealed tube'],
      text: 'restated',
    });
    expect(shown(all)).toEqual(['condition:25 C', 'condition:1 atm', 'condition:uv', 'condition:acidic medium', 'condition:2 h', 'condition:microwave', 'formula:Ar', 'condition:anhydrous', 'condition:sealed tube']);
  });

  it('free text only when the stage gave no structured part (it restates them)', () => {
    expect(shown(of({ text: 'room temperature, overnight' }))).toEqual(['condition:room temperature, overnight']);
    expect(shown(of({ text: 'restated', temperature: C(25) }))).toEqual(['condition:25 C']);
    expect(shown(of({ text: 'restated', anhydrous: false }))).toEqual(['condition:restated']);
  });

  it('free text: the first line only', () => {
    expect(shown(of({ text: 'first line\nsecond line' }))).toEqual(['condition:first line']);
    expect(shown(of({ text: 'first line\r\nsecond line' }))).toEqual(['condition:first line']);
  });

  it(`free text: at most ${MAX_TEXT_CHARS} characters, a visible ellipsis when cut`, () => {
    const exact = 'x'.repeat(MAX_TEXT_CHARS);
    expect(shown(of({ text: exact }))).toEqual([`condition:${exact}`]);
    const cut = conditionPartsOf(of({ text: 'y'.repeat(MAX_TEXT_CHARS + 1) }))[0]?.text ?? '';
    expect([...cut]).toHaveLength(MAX_TEXT_CHARS);
    expect(cut.endsWith('…')).toBe(true);
    expect(conditionPartsOf(of({ text: '   ' }))).toEqual([]);
  });
});

describe('the variant overrides field by field', () => {
  const base = of({ temperature: C(25), medium: 'acidic', other: ['stirred'], activation: ['microwave'] });
  it('a present field replaces the stage field; an absent one (or an empty list) leaves it', () => {
    const merged = overrideParameters(base, of({ temperature: { kind: 'value', value: 443, unit: 'K' } }));
    expect(shown(merged)).toEqual(['condition:443 K', 'condition:acidic medium', 'condition:microwave', 'condition:stirred']);
    expect(overrideParameters(base, NONE)).toEqual(base);
    expect(shown(overrideParameters(base, of({ other: ['sealed tube'] })))).toContain('condition:sealed tube');
    expect(shown(overrideParameters(base, of({ other: ['sealed tube'] })))).not.toContain('condition:stirred');
    expect(shown(overrideParameters(base, of({ anhydrous: true })))).toContain('condition:anhydrous');
  });
});

describe('on the arrow: the demo, the variant rule, the cap and the single `more`', () => {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('duplicate IDs');
  const DEMO = parsed.state;
  const parts = (side: ArrowText['below']): string[] => side.map((p) => `${p.kind}:${p.text}`);
  const context = (reaction: Reaction, variants: readonly string[]): ArrowTextContext => ({
    schemes: [],
    conditionVariantIds: variants as ConditionVariantId[],
    carriedParticipantId: reaction.participants.find((p) => p.isPrimarySubstrate === true)?.id as ParticipantId,
    describe: (ref) => ({ name: ref.id }),
    shownAsNode: () => true,
  });

  it('413 K and 443 K: an arrow with exactly ONE variant writes that variant\'s temperature', () => {
    const reaction = DEMO.records.reaction['rxn_ethanol-conc-h2so4' as keyof typeof DEMO.records.reaction] as Reaction;
    expect(reaction.conditionVariants).toHaveLength(2);
    const [first, second] = reaction.conditionVariants as [Reaction['conditionVariants'][number], Reaction['conditionVariants'][number]];
    expect(parts(arrowTextOf(reaction, context(reaction, [first.id])).below)).toContain('condition:413 K');
    expect(parts(arrowTextOf(reaction, context(reaction, [second.id])).below)).toContain('condition:443 K');
  });

  it('an arrow with no variant or with several writes the stage\'s own fields only (no temperature here)', () => {
    const reaction = DEMO.records.reaction['rxn_ethanol-conc-h2so4' as keyof typeof DEMO.records.reaction] as Reaction;
    const ids = reaction.conditionVariants.map((v) => v.id);
    for (const variants of [[], ids]) expect(parts(arrowTextOf(reaction, context(reaction, variants)).below).filter((p) => p.endsWith(' K'))).toEqual([]);
  });

  it('a variant that names a stage overrides that stage only; one that names none overrides the first stage of kind reaction', () => {
    const base = DEMO.records.reaction['rxn_methylmgbr-ethanal' as keyof typeof DEMO.records.reaction] as Reaction;
    expect(base.stages).toHaveLength(2);
    const [s1, s2] = base.stages as [Reaction['stages'][number], Reaction['stages'][number]];
    const variant = (stageId: StageId | undefined): Reaction['conditionVariants'][number] => ({
      id: 'cvr_test' as ConditionVariantId,
      label: 'test',
      ...(stageId === undefined ? {} : { stageId }),
      parameters: of({ temperature: C(-78) }),
      participantIds: [],
    });
    const run = (stageId: StageId | undefined) => {
      const reaction: Reaction = { ...base, stages: [s1, s2].map((s) => ({ ...s, parameters: NONE })), conditionVariants: [variant(stageId)] };
      return parts(arrowTextOf(reaction, context(reaction, ['cvr_test'])).below).filter((p) => p.includes('78'));
    };
    expect(run(undefined)).toEqual([`condition:${MINUS}78 C`]);
    expect(run(s2.id)).toEqual([`condition:${MINUS}78 C`]);
    expect(run('stg_nobody' as StageId)).toEqual([]);
  });

  describe('a synthetic reaction', () => {
    const base = DEMO.records.reaction['rxn_ethanol-to-ethanal-pcc' as keyof typeof DEMO.records.reaction] as Reaction;
    const participant = (n: number, role: Reaction['participants'][number]['role']): Reaction['participants'][number] => ({
      id: `prt_x-${n}` as ParticipantId,
      ref: { kind: 'reagent', id: `rgt_x${n}` } as Reaction['participants'][number]['ref'],
      role,
    });
    const stage = (n: number, ids: number[], parameters: ConditionParameters, kind: Reaction['stages'][number]['kind'] = 'reaction'): Reaction['stages'][number] => ({
      id: `stg_x${n}` as StageId,
      kind,
      participantIds: ids.map((i) => `prt_x-${i}` as ParticipantId),
      parameters,
    });
    const ctx: ArrowTextContext = { schemes: [], conditionVariantIds: [], describe: (ref) => ({ name: `name-${ref.id}` }), shownAsNode: () => true };
    const reactionOf = (participants: Reaction['participants'], stages: Reaction['stages']): Reaction => ({ ...base, id: 'rxn_x' as Reaction['id'], participants, stages, conditionVariants: [] });
    const many = of({ temperature: C(25), pressure: { kind: 'value', value: 1, unit: 'bar' }, light: 'uv', medium: 'basic', time: { kind: 'value', value: 2, unit: 'h' } });

    it('conditions are on the below side only, after the participants of the same stage, on the same line', () => {
      const text = arrowTextOf(reactionOf([participant(1, 'reagent'), participant(2, 'solvent')], [stage(1, [1, 2], of({ temperature: C(25), anhydrous: true }))]), ctx);
      expect(parts(text.above)).toEqual(['name:name-rgt_x1']);
      expect(parts(text.below)).toEqual(['name:name-rgt_x2', 'condition:25 C', 'condition:anhydrous']);
    });

    it(`at most ${MAX_CONDITION_PARTS} condition parts a side, and the rest is ONE \`more\` part`, () => {
      const text = arrowTextOf(reactionOf([participant(1, 'solvent')], [stage(1, [1], many)]), ctx);
      expect(parts(text.below)).toEqual(['name:name-rgt_x1', 'condition:25 C', 'condition:1 bar', 'condition:uv', 'more:+2 more']);
      expect(text.below.filter((p) => p.kind === 'more')).toHaveLength(1);
    });

    it('exactly the cap says no more', () => {
      const three = of({ temperature: C(25), pressure: { kind: 'value', value: 1, unit: 'bar' }, light: 'uv' });
      expect(parts(arrowTextOf(reactionOf([participant(1, 'solvent')], [stage(1, [1], three)]), ctx).below).filter((p) => p.startsWith('more'))).toEqual([]);
    });

    it('the single `more` of a side counts EVERYTHING not shown: participants and conditions', () => {
      const solvents = [1, 2, 3, 4, 5].map((i) => participant(i, 'solvent'));
      const text = arrowTextOf(reactionOf(solvents, [stage(1, [1, 2, 3, 4, 5], many)]), ctx);
      // 5 participants: 3 shown, 2 hidden; 5 conditions: 3 shown, 2 hidden: ONE part, "+4 more"
      expect(text.below.filter((p) => p.kind === 'more').map((p) => p.text)).toEqual(['+4 more']);
      expect(text.below.at(-1)?.kind).toBe('more');
      expect(text.below.filter((p) => p.kind === 'condition')).toHaveLength(MAX_CONDITION_PARTS);
      expect(text.above).toEqual([]);
    });

    it('a stage number goes before the first part of its stage on the below side, conditions included', () => {
      const scheme: ReactionScheme = { ...(Object.values(DEMO.records.reaction_scheme)[0] as ReactionScheme), id: 'rsc_x' as ReactionScheme['id'], reactionId: 'rxn_x' as Reaction['id'], placements: [], showStageNumbers: true };
      const reaction = reactionOf([participant(1, 'reagent'), participant(2, 'reagent')], [stage(1, [1], of({ anhydrous: true })), stage(2, [2], of({ medium: 'acidic' }), 'workup')]);
      const text = arrowTextOf(reaction, { ...ctx, schemes: [scheme] });
      expect(parts(text.above)).toEqual(['separator:1.', 'name:name-rgt_x1', 'separator:2.', 'name:name-rgt_x2']);
      expect(parts(text.below)).toEqual(['separator:1.', 'condition:anhydrous', 'separator:2.', 'condition:acidic medium']);
    });

    it('a reaction without stages writes no condition (a stage carries the parameters)', () => {
      const text = arrowTextOf(reactionOf([participant(1, 'solvent')], []), ctx);
      expect(text.below.some((p) => p.kind === 'condition')).toBe(false);
    });

    it('the text is plain text: a hostile qualifier stays text', () => {
      const hostile = '<script>alert(1)</script>';
      const text = arrowTextOf(reactionOf([participant(1, 'solvent')], [stage(1, [1], of({ other: [hostile] }))]), ctx);
      expect(parts(text.below)).toContain(`condition:${hostile}`);
    });

    it('is deterministic', () => {
      const reaction = reactionOf([participant(1, 'solvent')], [stage(1, [1], many)]);
      expect(arrowTextOf(reaction, ctx)).toEqual(arrowTextOf(reaction, ctx));
    });
  });
});
