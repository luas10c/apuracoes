import { defineConfig, globalIgnores } from "eslint/config";

import js from "@eslint/js";

import ts from "typescript-eslint";

import prettier from "eslint-plugin-prettier";

export default defineConfig([
  globalIgnores(["node_modules", ".next"]),
  js.configs.recommended,
  ts.configs.recommended,
  {
    plugins: {
      prettier,
    },
    rules: {
      ...prettier.configs.recommended.rules,
    },
  },
]);
