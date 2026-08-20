# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 web app
("Personal Archive System" — a terminal-emulator style personal site). There is no
database or external service; content lives under `content/` and is served via
Next.js (read snapshot + optional authenticated write API). Archive **body**
(`.md` / `person.json` / `timeline.md`) is **not** in the public Git remote
([ADR 0018](docs/adr/0018-content-visibility-and-sync.md)); private zone + read
gating: [ADR 0019](docs/adr/0019-capability-zone-permission.md)
(`content/private/…`, `getArchiveSnapshotFor`). Playlist curation
yaml under `content/music/playlists/` stays tracked. Fresh clones need a local
`content/` (owner machine or publish); CI uses fixtures.

### Cloud Agent bootstrap

- Environment is repo-managed: `.cursor/environment.json` (`npm ci` + `terminals.dev` → `npm run dev` on port 3000).
- **Do not** look for the owner's local hub status files (Windows paths). They are intentionally absent in cloud. After cloud PRs merge, the owner syncs hub on their machine.
- Open with: `docs/00-文档入口.md` + light Git fingerprint (`rev-parse HEAD` / `log -1 --format=%ci`). Authority: `docs/08` (contract), `docs/adr/` (structure), `docs/09` (backlog). Do not create a second in-repo WIP board.

Docs map (what to read first): `docs/00-文档入口.md`. Contract authority: `docs/08`. Structural decisions: `docs/adr/` (security / deploy: `0007`; site identity: `0010`; local music cache: `0011`). Backlog / debt tiers: `docs/09`.

Standard commands are defined in `package.json` (`dev`, `build`, `start`, `lint`, `verify`, `token:generate`, `owner:password`, `smoke:write-api`, `smoke:terminal`, `test:document-ref`, `test:command-registry`, `test:reading-session`, `test:discovery`, `test:query`, `test:site-principal`, `test:owner-session`, `test:owner-password`):

- Dev server: `npm run dev` (Next.js + Turbopack, serves on http://localhost:3000). Cloud environments usually start this via `terminals`.
- Lint: `npm run lint` (ESLint flat config).
- **Verify gate: `npm run verify`**（lint + `tsc --noEmit` + `tsx --test lib`——一条命令跑全部套件）。PR / push 上由 [`.github/workflows/verify.yml`](.github/workflows/verify.yml) 自动跑同一命令。相关单测：`test:permission`、`test:publish-paths`、`test:token`、`test:document-ref`、`test:content`。
- **UI 冒烟：`npm run smoke:ui`**（Playwright，5 条主路径；CI 暂不强制）。
- Type-check: `npx tsc --noEmit` (there is no dedicated `typecheck` script; `next build` also runs TS).
- Build: `npm run build`.
- Write token: `npm run token:generate [--scope <scope>]` (prints plaintext once; stores SHA-256 in `.env.local`). Prefer Cursor environment Secrets for cloud; never commit tokens.
- Owner password: `npm run owner:password` (TTY 下掩码输入；scrypt hash → `ARCHIVE_OWNER_PASSWORD_HASH`; also ensures `ARCHIVE_SESSION_SECRET`). Non-TTY: `npm run owner:password -- --password <明文>`. See `docs/adr/0010-site-principal.md`.
- Write API smoke: `ARCHIVE_WRITE_TOKEN=<token> npm run smoke:write-api` (needs `thoughts/*` scope + restarted dev; see `docs/10-agent-写API验收.md`).
- Terminal smoke: `npm run smoke:terminal` —— 盘→快照→VFS→命令**全链路 fixture 测试**（`lib/archive/pipeline.test.ts`），覆盖 docs/17 核心语义；主人手动会话只聚焦 UI 渲染层。
- **内容层测试策略**：内容相关测试一律用**临时 fixture**（tmp 目录，如 `pipeline.test.ts`），不读/不写真实 `content/`；手动实测留在 `content/` 的文件（`my_web/`、`test_dir.md` 之类）**一律删除、不入库**。

### Cloud verification (when touching API / env / write path)

Preferred order: `npm run lint` → `npx tsc --noEmit` → `npm run test:document-ref` → `npm run test:command-registry` → `npm run test:reading-session` → `npm run test:discovery` → `npm run test:query` → (optional) `npm run smoke:write-api` if a write token Secret is available → load `/` and run terminal `help`.

Notes / non-obvious caveats:

- No full test suite (no Jest/Vitest/Playwright). Contract regression for the write API: `npm run smoke:write-api`. Unit tests: `test:document-ref`, `test:command-registry`, `test:reading-session`, `test:discovery`, `test:playback-session`, `test:cli-emit`, `test:local-audio`, `test:playlist-project`（及 music 其它 `test:*`）。方案 A（ADR 0013）相关：`test:vfs`、`test:commands`、`test:content`、`test:content-write`、`test:complete`。 Also use `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual terminal UI checks.
- The UI is a fake shell: interact by typing commands (`help`, `ls`, `about`, `projects`, `thoughts`, `timeline`, `search`, `find`, `open`, `edit`, `mkdir`, `rmdir`, `themes`, `cd`, `cat`, `tree`, etc.). A basic smoke test is loading `/` and running `help`. The terminal is archive-semantics, not a filesystem emulation: shell-fidelity extras (`cd -`, `~`, file watching, POSIX-message sweep) are deliberately out of scope — boundary and usage-policy substitutes: `docs/18-终端真实性评估.md` §6.
- Owner editing: terminal `edit <path|slug>` opens a full-screen editor (server actions → `content-write.ts`); `mkdir`/`rmdir` manage directories (server actions, empty-only rmdir). **local-dev** is implicit owner; **public** requires terminal `login` (hidden from help) per `docs/adr/0010-site-principal.md`. Manual lists: `docs/11-终端edit手测清单.md`, `docs/12-站点身份手测.md`, `docs/17-嵌套DocumentRef手测.md` (方案 A). Agent writing: `PUT`/`PATCH`/`DELETE /api/v1/items?source=local&localKey=…` with `Authorization: Bearer <token>` and optional `If-Match` (see `docs/08` §5.7 / §5.8). Playbook: `docs/10-agent-写API验收.md`.
- UI language is Chinese (`lang="zh-CN"`).
