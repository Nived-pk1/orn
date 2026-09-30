export { createReplica, recordCountsOf } from './replica';
export type { Replica, ReplicaOptions } from './replica';
export { createComputeHandlers } from './handlers';
export type { ComputeHandlers } from './handlers';
export { startComputeHost } from './host';
export { COMPUTE_SPECS } from './specs';
export { DEFAULT_MAX_BACKLOG, DEFAULT_MAX_BACKLOG_RECORDS, createReplicaSync } from './sync';
export type { ReplicaStatus, ReplicaSync, ReplicaSyncOptions, ReplicaSyncState } from './sync';
