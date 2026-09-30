/** A synthetic v6 export of `size` reactions for scale tests and benchmarks (step 3.11c): shared labels and reagents, dangling references, workups, concepts, chapters, named reactions, traps, related pairs, relevance. Deterministic. */
export function syntheticLegacy(size: number): { schemaVersion: 5; compounds: unknown[]; reactions: unknown[] } {
  const compounds = Array.from({ length: size }, (_, i) => ({
    tags: [], image: '', smiles: i % 2 === 0 ? 'CCO' : '', formula: '', properties: '', node: true, functionalGroups: i % 5 === 2 ? ['alkene'] : [], compoundClass: '', acidBase: '', aromaticity: '', stereo: '',
    nodeType: i < 2 ? 'major' : 'auto', genericFormula: '', fgId: i === 0 ? 'alkene' : i === 1 ? 'alcohol' : '', jee: { level: '', notes: '' }, id: `c${i}`, name: `Compound ${i}`,
  }));
  const part = (role: string, ref: string, label = '') => ({ ref, label, role, major: role === 'product', note: '', image: '' });
  const groups = [['alkene'], ['alcohol'], ['alkene', 'alcohol']];
  const reactions = Array.from({ length: size }, (_, i) => ({
    id: `r${i}`,
    name: `Reaction ${i}`,
    participants: [
      part('substrate', `c${i}`),
      part('reagent', '', `aq. KOH ${i % 40}`),
      part('reagent', '', `${400 + (i % 3)} K`),
      part('workup', '', 'H3O+'),
      part('product', i % 7 === 0 ? `missing${i % 10}` : `c${(i * 7) % size}`),
      part('byproduct', `c${(i * 3) % size}`),
    ],
    conditions: { text: 'heat, dry', temperature: '', medium: '', phase: '', strength: '', heat: true, light: false, pressure: '', atmosphere: '', anhydrous: true },
    transformation: { from: `from ${i}`, to: `to ${i}`, fgFrom: groups[i % 3], fgTo: groups[(i + 1) % 3], bondChanges: `bond ${i % 4}` },
    mechanism: { type: `mech ${i % 10}`, summary: `summary ${i}` },
    reactionType: `type ${i % 20}`,
    reactionFamily: `family ${i % 15}`,
    reagentFamily: `rf ${i % 8}`,
    namedReaction: `NR ${i % 30}`,
    chapter: i % 50 === 0 ? 'Uncategorised' : `Chapter ${i % 12}`,
    tags: ['t'],
    jee: { relevance: i % 3 === 0 ? 'both' : 'main', difficulty: 1 + (i % 5), traps: [`trap a ${i}`, `trap b ${i}`], prerequisites: [`pre ${i % 25}`], concepts: [`con ${i % 25}`, `type ${i % 20}`] },
    relatedReactions: [`r${(i + 1) % size}`, `r${(i * 13 + 5) % size}`, `nothing ${i % 3}`],
    collapseIntermediates: true,
  }));
  return { schemaVersion: 5, compounds, reactions };
}
