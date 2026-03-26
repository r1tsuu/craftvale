# ESLint, Prettier, And VSCode Formatting

## Summary

Add repo-wide linting and formatting so Craftvale has one consistent editing
workflow instead of relying on manual style decisions. The chosen setup is:

- Prettier for formatting
- flat-config ESLint
- `typescript-eslint` recommended rules
- `eslint-plugin-perfectionist` for import ordering
- workspace VSCode settings for format-on-save and ESLint fixes

The goal is to make routine code edits automatically converge on the same style
without introducing style-only ambiguity into gameplay or tooling work.

## Key Changes

### Add repo-wide Prettier config

- Add a checked-in Prettier config with:
  - `singleQuote: true`
  - `trailingComma: 'all'`
  - `printWidth: 100`
  - `semi: false`
- Add a Prettier ignore file so generated outputs, install artifacts, and local
  runtime data do not get formatted accidentally.

### Add flat ESLint config

- Add a root `eslint.config.mjs`.
- Use `typescript-eslint` recommended config for TypeScript files.
- Add `eslint-plugin-perfectionist` and enforce sorted imports.
- Keep the first pass intentionally focused on high-signal rules rather than
  turning on a large custom style ruleset.

### Add scripts for routine use

- Add root scripts for:
  - `lint`
  - `lint:fix`
  - `format`
  - `format:check`
- Keep the commands workspace-root oriented so contributors do not need to
  remember package-specific entry points for style checks.

### Add workspace VSCode defaults

- Add `.vscode/settings.json` so the repo enables:
  - format on save
  - Prettier as the default formatter for supported files
  - ESLint fix-on-save
- Optionally recommend the ESLint and Prettier VSCode extensions in
  `.vscode/extensions.json`.

### Document the workflow

- Update repo docs so the standard workflow mentions lint/format commands.
- Update `.agents/skills/craftvale/SKILL.md` so Codex uses the same repo style
  workflow when making edits.

## Important Files

- `plans/0035-eslint-prettier-and-vscode-formatting.md`
- `package.json`
- `bun.lockb`
- `.prettierrc.json`
- `.prettierignore`
- `eslint.config.mjs`
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `.agents/skills/craftvale/SKILL.md`
- `README.md`

## Suggested Implementation Order

1. Add the Prettier and ESLint configs.
2. Add root scripts and install the required dependencies.
3. Add workspace VSCode settings.
4. Update the README and Craftvale skill instructions.
5. Run `bun run format`, `bun run lint`, `bun run typecheck`, and `bun test`.

## Decision Notes

### Why Prettier plus ESLint

- Prettier should own formatting.
- ESLint should own correctness-oriented rules plus import ordering.
- `eslint-config-prettier` should disable overlapping ESLint formatting rules so
  the tools do not fight each other.

### Why use Perfectionist

- Craftvale has many files with dense import blocks across apps, packages, and
  tests.
- Keeping import ordering automatic reduces churn and makes file headers easier
  to scan.

### Why commit VSCode settings

- The repo benefits from one default editing experience.
- Contributors can still override locally, but the workspace should communicate
  the intended default behavior clearly.

## Test Plan

- `bun run format:check`
- `bun run lint`
- `bun run typecheck`
- `bun test`

## Assumptions And Defaults

- This style setup applies at the workspace root.
- The first pass should avoid an aggressive custom lint ruleset beyond
  `typescript-eslint` recommended plus `perfectionist`.
- Generated and local runtime directories should stay out of routine formatting
  and linting where possible.
