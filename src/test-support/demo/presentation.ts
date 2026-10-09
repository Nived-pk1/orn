/** Presentation layer of the demo dataset: hub anchors, a Grignard scheme, a view preset and water's display. */
import type { EntityDisplay, NavigatorAnchor, ReactionScheme, ViewPreset } from '@/core/schema';
import { HUB_CLASSES } from './classes';
import { ident, presentationMeta, rec } from './kit';
import { partId, pdtId, rxnId } from './reaction-kit';

const anchorId = (body: string) => ident<NavigatorAnchor['id']>('anc', body);

/**
 * The curated arrangement of the demo overview (step 5.5c; presentation records only): a grid cell (column, row), the family group and
 * its tone for each of the 15 hubs. Reviewed by the user.
 */
const ARRANGEMENT: Readonly<Record<(typeof HUB_CLASSES)[number], Pick<NavigatorAnchor, 'cell' | 'group' | 'tone'>>> = {
  alkanes: { cell: { column: 0, row: 0 }, group: 'Hydrocarbons', tone: 'blue' },
  alkenes: { cell: { column: 1, row: 0 }, group: 'Hydrocarbons', tone: 'blue' },
  alkynes: { cell: { column: 2, row: 0 }, group: 'Hydrocarbons', tone: 'blue' },
  arenes: { cell: { column: 4, row: 0 }, group: 'Hydrocarbons', tone: 'blue' },
  haloalkanes: { cell: { column: 0, row: 1 }, group: 'Halogen compounds', tone: 'amber' },
  haloarenes: { cell: { column: 3, row: 2 }, group: 'Halogen compounds', tone: 'amber' },
  alcohols: { cell: { column: 1, row: 1 }, group: 'Oxygen compounds', tone: 'green' },
  ethers: { cell: { column: 2, row: 1 }, group: 'Oxygen compounds', tone: 'green' },
  aldehydes: { cell: { column: 1, row: 2 }, group: 'Oxygen compounds', tone: 'green' },
  ketones: { cell: { column: 2, row: 2 }, group: 'Oxygen compounds', tone: 'green' },
  phenols: { cell: { column: 4, row: 2 }, group: 'Oxygen compounds', tone: 'green' },
  'carboxylic-acids': { cell: { column: 1, row: 3 }, group: 'Oxygen compounds', tone: 'green' },
  esters: { cell: { column: 2, row: 3 }, group: 'Oxygen compounds', tone: 'green' },
  amines: { cell: { column: 3, row: 3 }, group: 'Nitrogen compounds', tone: 'violet' },
  'diazonium-salts': { cell: { column: 4, row: 3 }, group: 'Nitrogen compounds', tone: 'violet' },
};

export function demoAnchors(): NavigatorAnchor[] {
  return HUB_CLASSES.map((body, i) => ({
    id: anchorId(body),
    kind: 'navigator_anchor',
    target: rec('class', body, 'cls'),
    order: i + 1,
    ...ARRANGEMENT[body],
    ...presentationMeta,
  }));
}

const SCHEME_SLUG = 'methylmgbr-propanone';

export function demoSchemes(): ReactionScheme[] {
  return [
    {
      id: ident<ReactionScheme['id']>('rsc', 'grignard-propanone'),
      kind: 'reaction_scheme',
      reactionId: rxnId(SCHEME_SLUG),
      placements: [
        { participantId: partId(SCHEME_SLUG, 0), position: 'reactant_side' },
        { participantId: partId(SCHEME_SLUG, 1), position: 'reactant_side' },
        { participantId: partId(SCHEME_SLUG, 2), position: 'above_arrow' },
        { participantId: partId(SCHEME_SLUG, 3), position: 'below_arrow' },
      ],
      productPlacements: [{ productId: pdtId(SCHEME_SLUG, 0, 0), position: 'product_side' }],
      showStageNumbers: true,
      ...presentationMeta,
    },
  ];
}

export function demoViewPresets(): ViewPreset[] {
  return [
    {
      id: ident<ViewPreset['id']>('vpr', 'carbonyl-chemistry'),
      kind: 'view_preset',
      name: 'Carbonyl chemistry',
      view: 'navigator',
      filters: {
        examId: ident<NonNullable<ViewPreset['filters']['examId']>>('exm', 'jee-main'),
        examVersionId: ident<NonNullable<ViewPreset['filters']['examVersionId']>>('exv', 'jee-main-2026'),
        scopes: ['official'],
        topicIds: [ident<ViewPreset['filters']['topicIds'][number]>('top', 'carbonyl-acids')],
        reagentFamilies: [],
      },
      anchorIds: ['aldehydes', 'ketones', 'carboxylic-acids', 'esters'].map(anchorId),
      ...presentationMeta,
    },
  ];
}

export function demoEntityDisplays(): EntityDisplay[] {
  return [
    {
      id: ident<EntityDisplay['id']>('edp', 'water'),
      kind: 'entity_display',
      target: rec('species', 'water', 'spc') as EntityDisplay['target'],
      showAsNode: 'never',
      ...presentationMeta,
    },
  ];
}
