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
      '**/.terraform/**',
      'playwright-report/**',
      'test-results/**',
      'output/**',
      // packages/domain 的編譯產物，同步而來，不重複檢查。
      'apps/web/public/vendor/**',
      // Claude Code 的巢狀 worktree：同一個 repo 的另一個 checkout，剛好放在工作區
      // 內部。它有自己的 node_modules，安裝失敗時型別解析不到，型別感知規則會炸出
      // 幾百個與本工作區無關的錯誤（2026-08-02 實測 672 個，主工作區 0 個）。
      //
      // 注意上面那條 `apps/web/public/vendor/**` 錨定在根目錄，match 不到
      // `.claude/worktrees/<name>/apps/web/public/vendor/`——`.prettierignore` 有
      // 同一個洞，同日一起補。
      '.claude/worktrees/**',
      // Semgrep 規則的正反測試檔。它們**必須**含有 eval、shell 注入等真正
      // 危險的樣式，否則無法證明規則抓得到；那是測試資料，不是產品程式碼。
      // 讓 ESLint 檢查它們只會逼人加 disable 註解，反而弱化規則測試本身。
      'security/semgrep/**',
      'pnpm-lock.yaml'
    ]
  },

  js.configs.recommended,

  // --- 程式碼注入：SAST 的第一層，套用到所有檔案 ------------------------
  // Semgrep（`.github/workflows/sast-scan.yml`）做的是規則式的樣式比對；這裡擋的是
  // 那些「一眼就該擋」的動態求值 sink。放在最前面且不限定 files，任何新加的
  // 套件或腳本都自動受管，不會因為漏改設定而出現沒被檢查的角落。
  {
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error'
    }
  },

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

  // --- 瀏覽器模組：public 原生 ESM＋src 內的 CAL-PILOT bundle entry -------
  {
    files: ['apps/web/public/**/*.js', 'apps/web/src/**/*.js'],
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
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // TypeScript 那側由 recommendedTypeChecked 的型別感知版本負責，
      // 這裡是沒有型別資訊的原生 ESM。
      'no-implied-eval': 'error'
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
      'no-console': 'off',
      'no-implied-eval': 'error'
    }
  },

  // --- 在瀏覽器裡執行的建置腳本 ------------------------------------------
  {
    // 這兩支用 Playwright 的 chromium 做影像裁切與 WebP 編碼（這台機器沒有 sharp
    // 或 ImageMagick）。傳給 `page.evaluate()` 的函式在瀏覽器分頁裡執行，因此檔案
    // 同時需要 node 與 browser 兩組全域變數。
    files: [
      'scripts/build-brand-assets.mjs',
      'scripts/build-clinic-assets.mjs'
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  }
);
