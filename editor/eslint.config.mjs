import next from "eslint-config-next";

const eslintConfig = next.map((entry) => {
  if (entry?.plugins && "@typescript-eslint" in entry.plugins) {
    return {
      ...entry,
      rules: {
        ...entry.rules,
        // Server routes intentionally accept loosely-typed payloads from the
        // PDF engine service and from user-configured AI providers; strict
        // runtime validation happens in the AI operation registry instead.
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      },
    };
  }
  return entry;
});

export default [
  ...eslintConfig,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];
