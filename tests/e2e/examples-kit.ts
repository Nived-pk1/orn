/**
 * Test-only data for step 7.3a: a changed COPY of the demo (imported as the visitor's own data; the demo's chemistry file is never edited)
 * with two more examples of the demo's general PCC oxidation and one reaction with THREE stages. Used by examples-fold.spec.ts,
 * stages-arrow.spec.ts and phone-7-3a.spec.ts.
 */
import { changedDemo, recordsOf } from './own-data-kit';
import type { UploadFile } from './kit';

export const GENERAL = '1° alcohol → aldehyde (PCC)';
export const EXAMPLE_DEMO = 'Ethanol → ethanal (PCC)';
export const EXAMPLE_ONE = 'Zz propan-1-ol → propanal (PCC)';
export const EXAMPLE_TWO = 'Zz butan-1-ol → butanal (PCC)';
export const THREE_STAGE = 'Zz three-stage Grignard';

type Loose = {
  id: string;
  name: string;
  instanceOfId?: string;
  stages: { id: string; kind: string; label?: string; participantIds: string[]; parameters: object }[];
  participants: { id: string; ref: { kind: string; id: string }; role: string }[];
};

/** A copy of a reaction under a new slug and name: every id inside it carries the slug, so nothing clashes. */
function cloneReaction(source: Loose, from: string, slug: string, name: string): Loose {
  const copy = JSON.parse(JSON.stringify(source).split(from).join(slug)) as Loose;
  copy.id = `rxn_${slug}`;
  copy.name = name;
  return copy;
}

export function demoWithExamplesAndStages(): UploadFile {
  return changedDemo((records) => {
    const reactions = records['reaction'] as Loose[];
    const all = recordsOf<Loose>(records, 'reaction');
    const example = all.find((one) => one.id === 'rxn_ethanol-to-ethanal-pcc');
    const grignard = all.find((one) => one.id === 'rxn_methylmgbr-ethanal');
    if (example === undefined || grignard === undefined) throw new Error('the demo lacks the PCC example or the Grignard reaction');
    reactions.push(cloneReaction(example, 'ethanol-to-ethanal-pcc', 'zz-propanol-pcc', EXAMPLE_ONE));
    reactions.push(cloneReaction(example, 'ethanol-to-ethanal-pcc', 'zz-butanol-pcc', EXAMPLE_TWO));
    const three = cloneReaction(grignard, 'methylmgbr-ethanal', 'zz-three-stage', THREE_STAGE);
    const quench = { id: 'prt_zz-three-stage-5', ref: { kind: 'reagent', id: 'rgt_hydronium' }, role: 'workup_reagent' };
    three.participants.push(quench);
    three.stages.push({
      id: 'stg_zz-three-stage-3',
      kind: 'workup',
      label: '3. Zz quench',
      participantIds: [quench.id],
      parameters: { medium: 'basic', solventCharacter: [], activation: [], other: [], parsedFields: [] },
    });
    reactions.push(three);
  });
}
