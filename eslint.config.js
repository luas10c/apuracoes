import { defineConfig, globalIgnores } from 'eslint/config'

import globals from 'globals'

import js from '@eslint/js'
import ts from 'typescript-eslint'

import stylistic from '@stylistic/eslint-plugin'
import react from '@eslint-react/eslint-plugin'
import tailwindcss from 'eslint-plugin-tailwindcss'

import nextjs from '@next/eslint-plugin-next'

import jest from 'eslint-plugin-jest'
import tl from 'eslint-plugin-testing-library'

export default defineConfig([
  globalIgnores(['node_modules', '.next', 'coverage', 'next-env.d.ts']),
  js.configs.recommended,
  ts.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: false,
    commaDangle: 'never',
    braceStyle: '1tbs',
    blockSpacing: true,
    objectCurlySpacing: true,
    arrayBracketSpacing: false,
    arrowParens: 'always',
    quoteProps: 'consistent',
    jsx: true,
  }),
  {
    plugins: {
      react,
      '@next/next': nextjs
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 13,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.es2022,
        ...globals.browser,
        ...globals.node,
        React: true
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...nextjs.configs.recommended.rules
    }
  },
  {
    name: 'tailwindcss/recommended',
    plugins: {
      tailwindcss
    },
    settings: {
      tailwindcss: {
        cssConfigPath: './src/app/globals.css'
      }
    },
    rules: {
      ...tailwindcss.configs.recommended.rules,
    }
  },
  {
    files: ['**/*.{spec,test}.ts?(x)'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    },
    ...jest.configs['flat/recommended']
  },
  {
    files: ['**/*.{spec,test}.ts?(x)'],
    ...tl.configs['flat/react']
  }
])
