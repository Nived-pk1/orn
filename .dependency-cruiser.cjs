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
