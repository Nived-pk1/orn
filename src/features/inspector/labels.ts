/**
 * The UI labels of the inspector that are ordinary words and may also be dataset names. This is the ONLY file the hardcode check
 * exempts from the name comparison (docs/SONNET_HANDOFF.md §19); a dataset ID is still caught here, since IDs are never labels.
 * Labels are words for people: nothing branches on them.
 */
export const LABELS = {
  stereochemistry: 'Stereochemistry',
} as const;
