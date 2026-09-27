/** The projections shipped with the app. Each later view adds one line here and one definition file. */
import type { ProjectionDefinition } from './contracts';
import { mechanismsProjection } from './mechanisms';
import { namedReactionsProjection } from './named-reactions';
import { navigatorProjection } from './navigator';
import { precursorExplorerProjection } from './precursor';
import { reactionExplorerProjection } from './reaction-explorer';
import { reagentExplorerProjection } from './reagent-explorer';
import { createProjectionRegistry, type ProjectionRegistry } from './registry';
import { syllabusProjection } from './syllabus';

export const defaultProjectionDefinitions = (): readonly ProjectionDefinition[] => [
  navigatorProjection,
  reactionExplorerProjection,
  precursorExplorerProjection,
  reagentExplorerProjection,
  namedReactionsProjection,
  mechanismsProjection,
  syllabusProjection,
];

export const createDefaultProjectionRegistry = (): ProjectionRegistry => createProjectionRegistry(defaultProjectionDefinitions());
