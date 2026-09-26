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

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...bannedSyntax],
      'no-restricted-globals': ['error', ...noWebStorage],
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
        ...['window', 'document', 'navigator', 'indexedDB', 'fetch', 'XMLHttpRequest', 'location', 'performance'].map(
          (name) => ({ name, message: 'src/core is environment-free; inject capabilities instead.' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected RNG (determinism).' },
        { object: 'Date', property: 'now', message: 'Use the injected clock (determinism).' },
      ],
    },
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
