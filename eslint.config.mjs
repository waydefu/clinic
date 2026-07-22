import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint 的職責是正確性，不是排版——排版由 Prettier 負責，因此這裡不啟用任何
 * 樣式規則，避免兩個工具互相打架。
 *
 * 型別感知規則（no-floating-promises、no-misused-promises 等）只套用在
 * TypeScript 套件；`apps/web/public` 是瀏覽器直接載入的原生 ES module，
 * 沒有 tsconfig 也沒有建置流程，因此只跑不需型別的規則。
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.firebase/**',
      'output/**',
      // packages/domain 的編譯產物，同步而來，不重複檢查。
      'apps/web/public/vendor/**',
      'pnpm-lock.yaml'
    ]
  },

  js.configs.recommended,

  // --- TypeScript：套用型別感知規則 -------------------------------------
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked
    ],
    languageOptions: {
      parserOptions: {
        // 各套件的 tsconfig 排除 *.test.ts，但 lint 需要測試的型別資訊，
        // 因此改用只給 lint 的 tsconfig.eslint.json。
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // 未處理的 Promise 是這個專案最容易出事的一類 bug：預約寫入、outbox
      // 重試與瀏覽器互動全是非同步，漏掉 await 會靜默失敗。
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // 領域規則不得靠 any 逃逸；測試放寬見下方。
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },

  // --- 測試：允許 any，因為瀏覽器模組沒有型別 ---------------------------
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },

  // --- 瀏覽器模組：原生 ESM，無建置流程 ---------------------------------
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },

  // --- Node 腳本與伺服器 ------------------------------------------------
  {
    files: ['scripts/**/*.mjs', 'apps/web/server.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      // 檢查腳本本來就要向終端機回報結果。
      'no-console': 'off'
    }
  }
);
