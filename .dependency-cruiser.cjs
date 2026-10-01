/**
 * Module boundary rules. Direction (docs/ARCHITECTURE.md §2.3):
 *   app → features → ui | render → layout | chem | search | io | persistence | workers → core
 * core imports only core, zod and immer. Features never import each other.
 */
const TEST_FILE = '\\.(test|bench)\\.tsx?$';
const SERVICES = '^src/(chem|search|layout|io|persistence|workers)/';

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'core-is-pure',
      comment: 'src/core may import only src/core, zod and immer.',
      severity: 'error',
      from: { path: '^src/core/', pathNot: TEST_FILE },
      to: { pathNot: ['^src/core/', 'node_modules/(zod|immer)/'] },
    },
    {
      name: 'services-below-ui',
      severity: 'error',
      from: { path: SERVICES, pathNot: TEST_FILE },
      to: { path: '^src/(ui|render|features|app)/' },
    },
    {
      name: 'services-isolated',
      comment: 'chem, search and layout are independent services; share code through core.',
      severity: 'error',
      from: { path: '^src/(chem|search|layout)/', pathNot: TEST_FILE },
      to: { path: '^src/(chem|search|layout)/', pathNot: '^src/$1/' },
    },
    {
      name: 'io-and-persistence-separate',
      comment: 'Import/export and storage are composed by src/app, never by each other.',
      severity: 'error',
      from: { path: '^src/(io|persistence)/', pathNot: TEST_FILE },
      to: { path: '^src/(io|persistence)/', pathNot: '^src/$1/' },
    },
    {
      name: 'workers-not-persistence',
      comment: 'ADR-034 D1: persistence stays on the main thread (one write queue); a worker never imports it.',
      severity: 'error',
      from: { path: '^src/workers/', pathNot: TEST_FILE },
      to: { path: '^src/persistence/' },
    },
    {
      name: 'services-not-workers',
      comment: 'io, persistence and the engines never import src/workers (that is why TaskOptions exists); workers import them, not the reverse.',
      severity: 'error',
      from: { path: '^src/(chem|search|layout|io|persistence)/', pathNot: TEST_FILE },
      to: { path: '^src/workers/' },
    },
    {
      name: 'rdkit-only-in-adapter',
      comment: 'ADR-009: only the RDKit adapter files (src/chem/rdkit/) import @rdkit/rdkit; everything else goes through StructureToolkit.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/chem/rdkit/' },
      to: { path: 'node_modules/@rdkit/' },
    },
    {
      name: 'elk-only-in-adapter',
      comment: 'ADR-007: only the ELK adapter folder (src/layout/elk/) imports elkjs; everything else goes through LayoutEngine.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/layout/elk/' },
      to: { path: 'node_modules/elkjs/' },
    },
    {
      name: 'minisearch-only-in-adapter',
      comment: 'ADR-011: only the MiniSearch adapter folder (src/search/engine/) imports minisearch; everything else goes through SearchEngine.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/search/engine/' },
      to: { path: 'node_modules/minisearch/' },
    },
    {
      name: 'worker-entry-chem',
      comment: 'ADR-034 D1: a worker entry imports only its own service and core (compute also io).',
      severity: 'error',
      from: { path: '^src/workers/chem/', pathNot: TEST_FILE },
      to: { path: '^src/(io|layout|search|persistence)/|^src/workers/(layout|search|compute)/' },
    },
    {
      name: 'worker-entry-layout',
      comment: 'ADR-034 D1: a worker entry imports only its own service and core (compute also io).',
      severity: 'error',
      from: { path: '^src/workers/layout/', pathNot: TEST_FILE },
      to: { path: '^src/(io|chem|search|persistence)/|^src/workers/(chem|search|compute)/' },
    },
    {
      name: 'worker-entry-search',
      comment: 'ADR-034 D1: a worker entry imports only its own service and core (compute also io).',
      severity: 'error',
      from: { path: '^src/workers/search/', pathNot: TEST_FILE },
      to: { path: '^src/(io|chem|layout|persistence)/|^src/workers/(chem|layout|compute)/' },
    },
    {
      name: 'worker-entry-compute',
      comment: 'ADR-034 D1: the compute entry imports core and io only.',
      severity: 'error',
      from: { path: '^src/workers/compute/', pathNot: TEST_FILE },
      to: { path: '^src/(chem|layout|search|persistence)/|^src/workers/(chem|layout|search)/' },
    },
    {
      name: 'ui-render-below-features',
      severity: 'error',
      from: { path: '^src/(ui|render)/', pathNot: TEST_FILE },
      to: { path: '^src/(features|app)/' },
    },
    {
      name: 'features-below-app',
      severity: 'error',
      from: { path: '^src/features/', pathNot: TEST_FILE },
      to: { path: '^src/app/' },
    },
    {
      name: 'feature-isolation',
      comment: 'Features communicate through app-level services and ui/ primitives only.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/', pathNot: TEST_FILE },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'no-test-code-in-production',
      severity: 'error',
      from: { path: '^src/', pathNot: [TEST_FILE, '^src/test-support/'] },
      to: { path: ['^src/test-support/', '^tests/'] },
    },
    {
      name: 'no-dev-dependencies-in-production',
      severity: 'error',
      from: { path: '^src/', pathNot: [TEST_FILE, '^src/test-support/'] },
      to: { dependencyTypes: ['npm-dev'], pathNot: 'node_modules/@types/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
