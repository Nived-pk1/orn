/** The projections shipped with the app. Each later view adds one line here and one definition file. */
import type { ProjectionDefinition } from './contracts';
import { navigatorProjection } from './navigator';
import { precursorExplorerProjection } from './precursor';
import { reactionExplorerProjection } from './reaction-explorer';
import { createProjectionRegistry, type ProjectionRegistry } from './registry';

export const defaultProjectionDefinitions = (): readonly ProjectionDefinition[] => [navigatorProjection, reactionExplorerProjection, precursorExplorerProjection];

export const createDefaultProjectionRegistry = (): ProjectionRegistry => createProjectionRegistry(defaultProjectionDefinitions());
