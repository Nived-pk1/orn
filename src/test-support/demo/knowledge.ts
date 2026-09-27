/** Concepts, transformations and named reactions of the demo dataset. */
import type { Concept, NamedReaction, Transformation } from './types';
import { clsId, concept, cptId, ident, meta } from './kit';

export function demoConcepts(): Concept[] {
  return [
    // Reaction types
    concept('oxidation', 'Oxidation', 'reaction_type'),
    concept('reduction', 'Reduction', 'reaction_type'),
    concept('addition', 'Addition', 'reaction_type'),
    concept('elimination', 'Elimination', 'reaction_type'),
    concept('substitution', 'Substitution', 'reaction_type'),
    concept('condensation', 'Condensation', 'reaction_type'),
    concept('disproportionation', 'Disproportionation', 'reaction_type'),
    concept('rearrangement', 'Rearrangement', 'reaction_type'),
    concept('hydrolysis', 'Hydrolysis', 'reaction_type'),
    concept('esterification', 'Esterification', 'reaction_type', { parents: ['condensation'] }),
    concept('hydration', 'Hydration', 'reaction_type', { parents: ['addition'] }),
    concept('dehydration', 'Dehydration', 'reaction_type', { parents: ['elimination'] }),
    concept('electrophilic-addition', 'Electrophilic addition', 'reaction_type', { parents: ['addition'] }),
    concept('nucleophilic-substitution', 'Nucleophilic substitution', 'reaction_type', { parents: ['substitution'] }),
    concept('nucleophilic-addition', 'Nucleophilic addition', 'reaction_type', { parents: ['addition'] }),
    concept('electrophilic-aromatic-substitution', 'Electrophilic aromatic substitution', 'reaction_type', { parents: ['substitution'], aliases: ['SEAr'] }),
    concept('diazotisation', 'Diazotisation', 'reaction_type'),
    concept('hydroxylation', 'Hydroxylation', 'reaction_type', { parents: ['oxidation'] }),
    // Mechanism classes
    concept('sn2', 'SN2', 'mechanism_class', { parents: ['nucleophilic-substitution'], summary: 'Bimolecular nucleophilic substitution: one concerted step with backside attack.' }),
    concept('e2', 'E2', 'mechanism_class', { parents: ['elimination'], summary: 'Bimolecular elimination: base removes a β-hydrogen as the leaving group departs.' }),
    concept('ade', 'Electrophilic addition (AdE)', 'mechanism_class', { parents: ['electrophilic-addition'] }),
    concept('adn', 'Nucleophilic addition (AdN)', 'mechanism_class', { parents: ['nucleophilic-addition'] }),
    concept('radical-addition', 'Free-radical addition', 'mechanism_class', { parents: ['addition'] }),
    concept('sear-mechanism', 'Electrophilic aromatic substitution mechanism', 'mechanism_class', { parents: ['electrophilic-aromatic-substitution'] }),
    concept('hydride-transfer', 'Intermolecular hydride transfer', 'mechanism_class'),
    // Rules, stereochemistry, tests and background concepts
    concept('markovnikov', "Markovnikov's rule", 'rule', { aliases: ['Markownikoff rule'], summary: 'In the addition of HX to an unsymmetrical alkene, H adds to the carbon with more hydrogens.' }),
    concept('anti-markovnikov', 'Peroxide effect (anti-Markovnikov addition)', 'rule', { aliases: ['Kharasch effect'] }),
    concept('saytzeff', "Saytzeff's rule", 'rule', { aliases: ['Zaitsev rule'], summary: 'The more substituted alkene is the major elimination product.' }),
    concept('inversion', 'Inversion of configuration', 'stereochemistry'),
    concept('syn-addition', 'Syn addition', 'stereochemistry'),
    concept('qualitative-tests', 'Qualitative tests for functional groups', 'qualitative_test'),
    concept('carbocation-stability', 'Carbocation stability', 'stability', { difficulty: 2 }),
    concept('inductive-effect', 'Inductive effect', 'electronic_effect'),
    concept('hyperconjugation', 'Hyperconjugation', 'electronic_effect', { difficulty: 3 }),
    concept('alpha-hydrogen-acidity', 'Acidity of α-hydrogens', 'acidity_basicity', { aliases: ['α-H acidity'] }),
    concept('equilibrium', 'Chemical equilibrium and Le Chatelier', 'general'),
  ];
}

const trf = (
  body: string,
  name: string,
  from: readonly string[],
  to: readonly string[],
  o: { equationText?: string; chain?: Transformation['carbonChainChange']; concepts?: readonly string[] } = {},
): Transformation => ({
  id: ident<Transformation['id']>('trf', body),
  kind: 'transformation',
  name,
  aliases: [],
  fromClassIds: from.map(clsId),
  toClassIds: to.map(clsId),
  ...(o.equationText === undefined ? {} : { equationText: o.equationText }),
  ...(o.chain === undefined ? {} : { carbonChainChange: o.chain }),
  conceptIds: (o.concepts ?? []).map(cptId),
  ...meta(),
});

export function demoTransformations(): Transformation[] {
  return [
    trf('alcohol1-to-aldehyde', '1° alcohol → aldehyde', ['alcohols-primary'], ['aldehydes'], { equationText: 'R–CH2OH → R–CHO', chain: 'none', concepts: ['oxidation'] }),
    trf('aldehyde-to-acid', 'Aldehyde → carboxylic acid', ['aldehydes'], ['carboxylic-acids'], { equationText: 'R–CHO → R–COOH', chain: 'none', concepts: ['oxidation'] }),
    trf('alcohol1-to-acid', '1° alcohol → carboxylic acid', ['alcohols-primary'], ['carboxylic-acids'], { chain: 'none', concepts: ['oxidation'] }),
    trf('acid-alcohol-to-ester', 'Carboxylic acid + alcohol → ester', ['carboxylic-acids', 'alcohols'], ['esters'], { equationText: 'R–COOH + R′–OH ⇌ R–COOR′ + H2O', concepts: ['esterification'] }),
    trf('ester-to-acid-alcohol', 'Ester → carboxylic acid + alcohol', ['esters'], ['carboxylic-acids', 'alcohols'], { equationText: 'R–COOR′ + H2O ⇌ R–COOH + R′–OH', concepts: ['hydrolysis'] }),
    trf('alcohol-to-alkene', 'Alcohol → alkene', ['alcohols'], ['alkenes'], { concepts: ['dehydration'] }),
    trf('alcohol-to-ether', 'Alcohol → ether', ['alcohols'], ['ethers'], { chain: 'none' }),
    trf('alkene-to-alcohol', 'Alkene → alcohol', ['alkenes'], ['alcohols'], { concepts: ['hydration'] }),
    trf('alkene-to-haloalkane', 'Alkene → haloalkane', ['alkenes'], ['haloalkanes'], { concepts: ['electrophilic-addition'] }),
    trf('haloalkane-to-alcohol', 'Haloalkane → alcohol', ['haloalkanes'], ['alcohols'], { concepts: ['nucleophilic-substitution'] }),
    trf('haloalkane-to-alkene', 'Haloalkane → alkene', ['haloalkanes'], ['alkenes'], { concepts: ['elimination'] }),
    trf('carbonyl-to-alcohol3', 'Ketone → tertiary alcohol (Grignard)', ['ketones'], ['alcohols-tertiary'], { chain: 'ascent' }),
    trf('aldehyde-to-alcohol2', 'Aldehyde → secondary alcohol (Grignard)', ['aldehydes'], ['alcohols-secondary'], { chain: 'ascent' }),
    trf('alkyne-to-alkene', 'Alkyne → alkene', ['alkynes'], ['alkenes'], { chain: 'none', concepts: ['reduction'] }),
    trf('alkene-to-diol', 'Alkene → diol', ['alkenes'], ['alcohols'], { chain: 'none', concepts: ['hydroxylation'] }),
    trf('arene-to-ketone', 'Arene → aryl ketone', ['arenes'], ['ketones'], { chain: 'ascent' }),
    trf('amine-to-diazonium', 'Aromatic amine → diazonium salt', ['amines'], ['diazonium-salts'], { chain: 'none', concepts: ['diazotisation'] }),
    trf('diazonium-to-haloarene', 'Diazonium salt → haloarene', ['diazonium-salts'], ['haloarenes'], { chain: 'none' }),
    trf('diazonium-to-phenol', 'Diazonium salt → phenol', ['diazonium-salts'], ['phenols'], { chain: 'none' }),
    trf('aldehyde-self-addition', 'Aldehyde → β-hydroxy aldehyde', ['aldehydes'], ['aldehydes'], { chain: 'ascent', concepts: ['alpha-hydrogen-acidity'] }),
    trf('aldehyde-disproportionation', 'Aldehyde → alcohol + carboxylate', ['aldehydes'], ['alcohols-primary', 'carboxylic-acids'], { chain: 'none', concepts: ['disproportionation'] }),
    trf('methyl-carbonyl-to-haloform', 'Methyl carbonyl → haloform', ['ketones'], ['haloalkanes'], { chain: 'descent' }),
  ];
}

const nrx = (
  body: string,
  name: string,
  o: { aliases?: readonly string[]; parents?: readonly string[]; summary?: string; conceptIds?: readonly string[]; difficulty?: number } = {},
): NamedReaction => ({
  id: ident<NamedReaction['id']>('nrx', body),
  kind: 'named_reaction',
  name,
  aliases: [...(o.aliases ?? [])],
  parentIds: (o.parents ?? []).map((p) => ident<NamedReaction['id']>('nrx', p)),
  ...(o.summary === undefined ? {} : { summary: o.summary }),
  conceptIds: (o.conceptIds ?? []).map(cptId),
  prerequisiteConceptIds: [],
  ...(o.difficulty === undefined ? {} : { difficulty: o.difficulty }),
  ...meta(),
});

export function demoNamedReactions(): NamedReaction[] {
  return [
    nrx('cannizzaro', 'Cannizzaro reaction', { aliases: ['Cannizzaro'], summary: 'Aldehydes with no α-hydrogen disproportionate in concentrated alkali to an alcohol and a carboxylate.', conceptIds: ['disproportionation', 'hydride-transfer'], difficulty: 3 }),
    nrx('aldol', 'Aldol reaction', { aliases: ['Aldol addition', 'Aldol'], summary: 'An enolisable carbonyl compound adds to another carbonyl compound to give a β-hydroxy carbonyl compound.', conceptIds: ['alpha-hydrogen-acidity', 'nucleophilic-addition'], difficulty: 3 }),
    nrx('haloform', 'Haloform reaction', { aliases: ['Iodoform reaction', 'Iodoform test'], summary: 'Methyl ketones and compounds oxidised to them give a haloform with a halogen and alkali.', conceptIds: ['qualitative-tests'] }),
    nrx('fischer-esterification', 'Fischer esterification', { aliases: ['Fischer–Speier esterification'], summary: 'Acid-catalysed equilibrium between a carboxylic acid plus an alcohol and an ester plus water.', conceptIds: ['esterification', 'equilibrium'] }),
    nrx('friedel-crafts', 'Friedel–Crafts reaction', { aliases: ['Friedel Crafts'] }),
    nrx('friedel-crafts-acylation', 'Friedel–Crafts acylation', { parents: ['friedel-crafts'], aliases: ['Friedel-Crafts acylation'], conceptIds: ['electrophilic-aromatic-substitution'] }),
    nrx('sandmeyer', 'Sandmeyer reaction', { aliases: ['Sandmeyer'], summary: 'Diazonium group replaced by Cl, Br or CN using the copper(I) salt.' }),
    nrx('diazotisation', 'Diazotisation', { summary: 'Primary aromatic amine to diazonium salt with nitrous acid at 0–5 °C.', conceptIds: ['diazotisation'] }),
    nrx('lindlar', 'Lindlar reduction', { aliases: ['Lindlar hydrogenation'], summary: 'Partial hydrogenation of an alkyne to a cis-alkene.', conceptIds: ['syn-addition'] }),
    nrx('kharasch', 'Kharasch effect', { aliases: ['Peroxide effect'], conceptIds: ['anti-markovnikov'] }),
    nrx('baeyers-test', "Baeyer's test", { aliases: ["Baeyer's reagent test"], conceptIds: ['qualitative-tests'] }),
    nrx('grignard', 'Grignard reaction', { aliases: ['Grignard addition'], summary: 'An organomagnesium halide adds to a carbonyl group; work-up gives an alcohol.' }),
    nrx('beckmann', 'Beckmann rearrangement', { aliases: ['Beckmann'], summary: 'An oxime rearranges to an amide (a lactam from a cyclic oxime) in acid.', conceptIds: ['rearrangement'], difficulty: 4 }),
  ];
}
