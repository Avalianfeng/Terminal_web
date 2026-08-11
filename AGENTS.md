# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 web app
("Personal Archive System" — a terminal-emulator style personal site). There is no
database or external service; content lives under `content/` and is served via
Next.js (read snapshot + optional authenticated write API).

Docs map (what to read first): `docs/00-文档入口.md`. Contract authority: `docs/08`.
Backlog / debt tiers: `docs/09`. WIP status lives in the owner's local hub, not a second board in-repo.

Standard commands are defined in `package.json` (`dev`, `build`, `start`, `lint`, `token:generate`, `smoke:write-api`, `test:document-ref`, `test:command-registry`):

- Dev server: `npm run dev` (Next.js + Turbopack, serves on http://localhost:3000).
- Lint: `npm run lint` (ESLint flat config).
- Type-check: `npx tsc --noEmit` (there is no dedicated `typecheck` script; `next build` also runs TS).
- Build: `npm run build`.
- Write token: `npm run token:generate [--scope <scope>]` (prints plaintext once; stores SHA-256 in `.env.local`).
- Write API smoke: `ARCHIVE_WRITE_TOKEN=<token> npm run smoke:write-api` (needs `thoughts/*` scope + restarted dev; see `docs/10-agent-写API验收.md`).

Notes / non-obvious caveats:

- No full test suite (no Jest/Vitest/Playwright). Contract regression for the write API: `npm run smoke:write-api`. DocumentRef unit tests: `npm run test:document-ref`. Command registry unit tests: `npm run test:command-registry`. Also use `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual terminal UI checks.
- The UI is a fake shell: interact by typing commands (`help`, `ls`, `about`, `projects`, `thoughts`, `timeline`, `search`, `find`, `open`, `edit`, `themes`, `cd`, `cat`, `tree`, etc.). A basic smoke test is loading `/` and running `help`.
- Owner editing: terminal `edit <path|slug>` opens a full-screen editor (server actions → `content-write.ts`). Manual regression checklist: `docs/11-终端edit手测清单.md`. Agent writing: `PUT`/`PATCH`/`DELETE /api/v1/items?source=local&localKey=…` with `Authorization: Bearer <token>` and optional `If-Match` (see `docs/08` §5.7 / §5.8). Playbook: `docs/10-agent-写API验收.md`.
- UI language is Chinese (`lang="zh-CN"`).
