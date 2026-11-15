import tseslint from "typescript-eslint";

// Only the mechanical rules from CODING_STANDARDS.md live here. Judgement
// calls stay in CODING_STANDARDS.md for the reviewer.
export default tseslint.config(
  {
    ignores: ["build/", ".react-router/", "node_modules/", "drizzle/", ".claude/"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      // `any` and `!` switch the type checker off where you are least sure.
      // Narrow with a check, or fix the shape.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > CallExpression.expression[callee.property.name='get']",
          message:
            "Parse form data and search params with a zod schema. `.get(...) as T` is a cast the type checker believes.",
        },
      ],
    },
  }
);
