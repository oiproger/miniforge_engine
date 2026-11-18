import tseslint from 'typescript-eslint'
export default [
  {
    ignores: ['**/dist/**', '**/public/**', '**/target/**', '**/test-results/**', '**/playwright-report/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-debugger': 'error',
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
    },
  },
]
