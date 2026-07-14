# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 web app
("Personal Archive System" — a terminal-emulator style personal site). There is no
backend, database, or external service; content is read from local files under `content/`.

Standard commands are defined in `package.json` (`dev`, `build`, `start`, `lint`):

- Dev server: `npm run dev` (Next.js + Turbopack, serves on http://localhost:3000).
- Lint: `npm run lint` (ESLint flat config).
- Type-check: `npx tsc --noEmit` (there is no dedicated `typecheck` script; `next build` also runs TS).
- Build: `npm run build`.

Notes / non-obvious caveats:

- No automated test suite exists (no Jest/Vitest/Playwright). Verify changes via `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual browser testing of the terminal UI.
- The UI is a fake shell: interact by typing commands (`help`, `ls`, `about`, `projects`, `thoughts`, `timeline`, `search`, `open`, `themes`, `cd`, `cat`, `tree`, etc.). A basic smoke test is loading `/` and running `help`.
- UI language is Chinese (`lang="zh-CN"`).
