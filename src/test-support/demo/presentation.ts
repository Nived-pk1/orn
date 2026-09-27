/** Presentation layer of the demo dataset: hub anchors, a Grignard scheme, a view preset and water's display. */
import type { EntityDisplay, NavigatorAnchor, ReactionScheme, ViewPreset } from '@/core/schema';
import { HUB_CLASSES } from './classes';
import { ident, presentationMeta, rec } from './kit';
import { partId, pdtId, rxnId } from './reaction-kit';

const anchorId = (body: string) => ident<NavigatorAnchor['id']>('anc', body);

export function demoAnchors(): NavigatorAnchor[] {
  return HUB_CLASSES.map((body, i) => ({
    id: anchorId(body),
    kind: 'navigator_anchor',
    target: rec('class', body, 'cls'),
    order: i + 1,
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
