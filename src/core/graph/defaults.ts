/** The projections shipped with the app. Each later view adds one line here and one definition file. */
import type { ProjectionDefinition } from './contracts';
import { navigatorProjection } from './navigator';
import { createProjectionRegistry, type ProjectionRegistry } from './registry';

export const defaultProjectionDefinitions = (): readonly ProjectionDefinition[] => [navigatorProjection];

export const createDefaultProjectionRegistry = (): ProjectionRegistry => createProjectionRegistry(defaultProjectionDefinitions());
