# Repository Guidelines

## Project Structure & Module Organization
Core TypeScript source lives in `src/`. Entry points are `src/index.ts` and `src/cli.ts`; transport setup is in `src/servers/`; Tailscale integrations are in `src/tailscale/`; MCP tool definitions are in `src/tools/`. Tests live under `src/__test__/` with `utils/` for unit tests and `tailscale/` for OAuth and integration coverage. Helper scripts are in `scripts/`, and longer-form docs are in `docs/`.

## Build, Test, and Development Commands
Use Bun by default.

- `bun install` - install dependencies
- `bun run build` - bundle the server into `dist/`
- `bun run dev:direct` - run `src/index.ts` directly with `tsx`
- `bun run dev:watch` - rebuild on file changes
- `bun run typecheck` - run TypeScript checks without emitting files
- `bun run test` - run the full Bun test suite
- `bun run qa` - run typecheck, unit tests, and Biome checks together
- `bun run inspector` - start the MCP inspector against the built server

## Coding Style & Naming Conventions
This repo uses TypeScript with ESM. Formatting and linting are enforced by Biome (`biome.json`): 2-space indentation, double quotes, semicolons, trailing commas, and 80-column line width. Use `bun run format` or `bun run check:fix` before opening a PR. Prefer small modules, `camelCase` for functions and variables, `PascalCase` for types/classes, and descriptive filenames such as `network-tools.ts` or `oauth.test.ts`.

## Testing Guidelines
Tests run with `bun test`. Put fast unit tests in `src/__test__/**/*.test.ts`; put CLI or environment-dependent coverage in `*.integration.test.ts`. Keep test names behavior-focused, for example `should reject malformed IPv6 CIDR`. Run `bun run test:unit` during iteration and `bun run test:integration` only when Tailscale CLI access is available. Add or update tests for any behavior change on a public tool, validation path, or auth flow.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit prefixes such as `feat:`, `fix:`, `refactor:`, `test:`, and `chore:`. Keep commits scoped and imperative, for example `fix: make routes parameter optional`. PRs should explain the user-visible change, note config or auth impacts, link related issues, and include command results for validation. Add screenshots only when docs or UI-like output changes.

## Security & Configuration Tips
Never commit real Tailscale credentials. Start from `.env.example`, and use the least-privilege auth option needed: API key for simple admin access, OAuth client for scoped automation. When changing CLI execution or request validation, keep the existing input sanitization and error handling intact.
