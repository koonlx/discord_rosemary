# Repository Guidelines

## Project Structure & Module Organization
The bot entry point lives in `index.js` at the repository root, alongside `package.json` and the ESLint-free Node toolchain. Group Discord slash or message commands under a `commands/` directory and reusable helpers under `lib/`; both folders can be created as needed. Secrets (tokens, webhook URLs) belong in `.env`, while shareable defaults should be mirrored in `.env.example`.

## Build, Test & Development Commands
Run `npm install` once to pull in `discord.js`. Use `node index.js` during development to boot the bot manually, and consider adding `npm run dev` (wrapping `nodemon index.js`) for live reloads. Before pushing, reinstall to verify lockfile sync with `npm ci` on CI or any clean environment.

## Coding Style & Naming Conventions
Stick to modern Node (>=18) CommonJS modules: `const client = require('discord.js');`. Use 2-space indentation, single quotes for strings, and trailing commas on multi-line literals. File names for commands should be lowercase-hyphenated (e.g., `ping-command.js`) and export a clearly named handler such as `executePing`. Keep bot intents, channel IDs, and magic numbers in a dedicated config module instead of scattering literals.

## Testing Guidelines
Testing is not yet wired up—the current `npm test` script is a placeholder that exits with failure. When adding coverage, configure `npm test` to run your chosen runner (Vitest, Jest, or Node's built-in test runner) and place specs under `tests/` mirroring the source tree (`tests/commands/ping.test.js`). Aim for assertions around Discord client events, rate-limit handling, and error logging, plus smoke tests for token misconfiguration.

## Commit & Pull Request Guidelines
Follow concise, present-tense commits (`feat: add ping command handler`). Reference issue numbers in the body when applicable and keep commits scoped to one logical change. Pull requests should explain the user-facing impact, list manual or automated test steps, and include screenshots or Discord transcript snippets whenever behavior is visible to end users. Ensure lint/test commands pass locally before requesting review.

## Security & Configuration Notes
Never commit `.env` or raw tokens. Disable privileged intents unless the feature requires them, and document the need in the PR. When rotating credentials, update the README and `.env.example` so new agents can bootstrap without guessing.
