// ESLint flat config. Module boundaries are enforced separately by dependency-cruiser (npm run lint:deps).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const htmlInjection = 'Never write HTML strings into the DOM — docs/SECURITY.md §2.';
const bannedSyntax = [
  { selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]", message: htmlInjection },
  { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: htmlInjection },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: htmlInjection },
  { selector: "CallExpression[callee.object.name='document'][callee.property.name='write']", message: htmlInjection },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is forbidden (CSP).' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is forbidden (CSP).' },
];
const noWebStorage = [
  { name: 'localStorage', message: 'Canonical and UI state live in IndexedDB — docs/PERSISTENCE.md.' },
  { name: 'sessionStorage', message: 'Canonical and UI state live in IndexedDB — docs/PERSISTENCE.md.' },
];

// Browser capabilities only src/app, src/persistence (injected), src/workers, src/test-support and tests may touch (step 5.0, ADR-017).
const confinedMsg = 'Create and touch this browser object only in src/app, src/persistence, src/workers, src/test-support or tests; inject it elsewhere.';
const confinedGlobals = ['Worker', 'SharedWorker', 'indexedDB', 'IDBKeyRange', 'BroadcastChannel'].map((name) => ({ name, message: confinedMsg }));
const confinedSyntax = [
  { selector: "MemberExpression[object.name=/^(window|self|globalThis)$/][property.name=/^(Worker|SharedWorker|indexedDB|IDBKeyRange|BroadcastChannel)$/]", message: confinedMsg },
];
const confinedProperties = [{ object: 'navigator', property: 'locks', message: confinedMsg }];

export default tseslint.config(
  { ignores: ['dist/**', 'dist-studio/**', 'build-report/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...bannedSyntax, ...confinedSyntax],
      'no-restricted-globals': ['error', ...noWebStorage, ...confinedGlobals],
      'no-restricted-properties': ['error', ...confinedProperties],
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The domain core is pure: no DOM, no storage, no network, no nondeterminism (docs/ARCHITECTURE.md §2).
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...noWebStorage,
        ...confinedGlobals,
        ...['window', 'document', 'navigator', 'fetch', 'XMLHttpRequest', 'location', 'performance'].map(
          (name) => ({ name, message: 'src/core is environment-free; inject capabilities instead.' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        ...confinedProperties,
        { object: 'Math', property: 'random', message: 'Use the injected RNG (determinism).' },
        { object: 'Date', property: 'now', message: 'Use the injected clock (determinism).' },
      ],
    },
  },
  {
    // Persistence gets IndexedDB injected (docs/PERSISTENCE.md, step 3.1): tests use fake-indexeddb, the app passes the browser's.
    files: ['src/persistence/**/*.ts'],
    ignores: ['src/persistence/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...noWebStorage,
        ...confinedGlobals.filter((g) => g.name !== 'indexedDB' && g.name !== 'IDBKeyRange'),
        ...['indexedDB', 'IDBKeyRange', 'window', 'document'].map((name) => ({
          name,
          message: 'src/persistence receives indexedDB and IDBKeyRange through createOrnDb options; never read the global.',
        })),
      ],
    },
  },
  {
    // The composition root, the worker side, test support and tests may create and use these objects.
    files: ['src/app/**/*.{ts,tsx}', 'src/workers/**/*.ts', 'src/test-support/**/*.ts', 'tests/**/*.ts', '**/*.{test,bench}.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...bannedSyntax],
      'no-restricted-globals': ['error', ...noWebStorage],
      'no-restricted-properties': 'off',
    },
  },
  {
    // Tests feed hostile "javascript:" strings to the code under test on purpose (ADV-033, SafeUrl, the SVG sanitiser).
    files: ['**/*.{test,bench}.{ts,tsx}', 'tests/**/*.ts'],
    rules: { 'no-script-url': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // CommonJS tool configs (e.g. .dependency-cruiser.cjs).
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
);
