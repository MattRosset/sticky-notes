import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// Layer rules. src/ has five layers with one-way imports:
//   domain <- interaction <- components <- app
//   domain <- persistence <- app
// Every message says why the import is forbidden and where the code should go instead.
// tests/architecture/boundaries.test.ts proves each rule fires on a known violation.

const DOMAIN_PURITY_MESSAGE =
  'domain/ must run in Node tests. Read the browser in app/ or interaction/ and pass the value in.';
const DOMAIN_DETERMINISM_MESSAGE =
  'domain/ is deterministic. Generate ids/time in app/ and pass them in an action.';

export default defineConfig([
  globalIgnores(['dist', '**/__lint-fixtures__/**', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
  {
    // Fixtures are deliberately broken files outside every tsconfig; lint them without types.
    files: ['**/__lint-fixtures__/**'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom'],
              message:
                'domain/ is framework-free so its rules are unit-testable without a DOM. Put React code in components/ or interaction/ and pass plain data in.',
            },
            {
              group: ['**/interaction/**', '**/components/**', '**/persistence/**', '**/app/**'],
              message:
                'domain/ is the bottom layer and imports nothing above it. Move the shared type or function into domain/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: DOMAIN_PURITY_MESSAGE },
        { name: 'document', message: DOMAIN_PURITY_MESSAGE },
        { name: 'localStorage', message: DOMAIN_PURITY_MESSAGE },
        { name: 'navigator', message: DOMAIN_PURITY_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: DOMAIN_DETERMINISM_MESSAGE },
        { object: 'Date', property: 'now', message: DOMAIN_DETERMINISM_MESSAGE },
        { object: 'crypto', property: 'randomUUID', message: DOMAIN_DETERMINISM_MESSAGE },
      ],
    },
  },
  {
    files: ['src/interaction/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/**', '**/persistence/**', '**/app/**'],
              message:
                'interaction/ turns pointer input into domain actions; it must not know how notes render or persist. Return data/callbacks to the component instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/persistence/**', '**/app/**'],
              message:
                'components/ render state and dispatch actions. Persistence is wired once in app/; receive data via props.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/persistence/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '**/interaction/**', '**/components/**', '**/app/**'],
              message:
                'persistence/ adapts storage to the domain model only. It is called from app/.',
            },
          ],
        },
      ],
    },
  },
  // Branding a string as NoteId needs one assertion; it lives in asNoteId() and nowhere else.
  {
    files: ['src/domain/ids.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
]);
