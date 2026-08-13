import antfu from '@antfu/eslint-config'
import pluginQuery from '@tanstack/eslint-plugin-query'

export default antfu({
  type: 'app',
  vue: true,
  typescript: true,
  formatters: {
    css: true,
    html: true,
    markdown: 'prettier',
  },

  ignores: [
    '**/build/**',
    '**/components/ui/**',
    // Planning and generated discovery reports contain illustrative code fragments rather than
    // executable project source. Formatting/linting their fenced snippets produced parse errors.
    'docs/superpowers/**',
    'scripts/**/*REPORT*.md',
  ],
  settings: {
    'import/core-modules': ['vue-router/auto-routes'],
  },
  globals: {
    definePage: 'readonly',
  },

  rules: {
    'perfectionist/sort-imports': ['error', {
      tsconfig: { rootDir: '.' },
    }],
    'yaml/indent': ['error', 2],
    'jsonc/indent': ['error', 2],
    // The capture/runtime modules intentionally serialize compact self-contained functions for
    // injection into OEM pages. These style rules conflict with that executable-artifact format.
    'style/max-statements-per-line': 'off',
    // Vue templates consume these established events in kebab-case; changing their public names
    // would break every section renderer consumer.
    'vue/custom-event-name-casing': 'off',
    // Composition API declarations are grouped by responsibility, and callbacks can safely close
    // over declarations initialized before they are invoked.
    'ts/no-use-before-define': 'off',
    // Admin-only destructive workflows deliberately use native confirmation dialogs.
    'no-alert': 'off',
    'vue/block-lang': ['warn', {
      script: { lang: ['ts', 'tsx'] },
    }],
  },
  ...pluginQuery.configs['flat/recommended'],
}, {
  files: [
    'src/composables/capture-tailwind-rules.ts',
    'src/pages/dashboard/components/page-builder/clone-region-converter.ts',
    'src/pages/dashboard/components/page-builder/clone-studio-html.ts',
    'src/pages/dashboard/components/page-builder/clone-studio-html.test.ts',
  ],
  rules: {
    // These files generate isolated browser programs as strings. `var` is intentional for broad
    // injected-runtime compatibility and dynamic constructors are the feature under test.
    'vars-on-top': 'off',
    'no-var': 'off',
    'no-new-func': 'off',
    'no-cond-assign': 'off',
    'no-control-regex': 'off',
    'unicorn/prefer-number-properties': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'regexp/no-contradiction-with-assertion': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
}, {
  files: [
    'src/composables/capture-tailwind-rules.test.ts',
    'src/composables/use-capture-injection.test.ts',
    'src/pages/dashboard/components/style-guide/style-guide-copy-affordances.test.ts',
  ],
  rules: {
    // These assertions intentionally verify literal template-token text.
    'no-template-curly-in-string': 'off',
  },
}, {
  files: [
    'src/pages/dashboard/components/sections/SectionMedia.vue',
    'src/pages/dashboard/components/sections/SectionVariantColorExplorer.vue',
    'src/pages/dashboard/components/sections/SectionVideo.vue',
    'src/pages/dashboard/page-builder/page-modes.ts',
  ],
  rules: {
    // Capture/parser expressions preserve groups for readability and cross-runtime parity.
    'regexp/no-contradiction-with-assertion': 'off',
    'regexp/no-unused-capturing-group': 'off',
  },
})
