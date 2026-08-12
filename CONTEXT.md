# Personal Archive

A personal, terminal-first archive: local documents under `content/`, presented through a shell surface and a discovery layer.

## Language

**DocumentRef**:
The canonical identity of a local archive document: `{ group, slug }`. Projects to discovery `localKey` and VFS path; does not own filesystem paths.
_Avoid_: path-as-identity, localKey-as-authority, VFS path as source of truth, embedding disk/`cwd` in the identity module

**content hash**:
SHA-256 hex of on-disk document bytes; used as the optimistic-concurrency token (`If-Match` / `expectedHash`) for human and Agent writers.
_Avoid_: ETag as a separate concept (same value)

**ContentGroup**:
One of the local document collections on disk (`projects` | `thoughts` | `resources`).
_Avoid_: folder, category (when meaning the on-disk group)

**localKey**:
Discovery-layer key for `source: local`; for local documents it is the projection `${group}/${slug}` (no leading slash).
_Avoid_: treating localKey as a second authority beside DocumentRef

**ArchiveDocument**:
A local markdown document as loaded into the archive snapshot (title, body, tags, etc.). Identity is nested as `ref: DocumentRef` (not flat `group`/`slug`/`path` on the document). `resources` group entries may include `url`, `resourceType`, optional `platform`/`embed` (ADR 0008).
_Avoid_: item (prefer discovery **Item** when meaning the HTTP/discovery shape); path-as-stored-identity; top-level group/slug as a second authority beside `ref`

**Item**:
A discovery-layer entry (`source` + `localKey` + kind); first shipped kind is `document`. Cross-source identity lives here, not inside DocumentRef. Future kinds (e.g. audio/video) and sources (e.g. github) extend Item; they do not widen DocumentRef.
_Avoid_: document (when meaning the discovery payload rather than ArchiveDocument)

**CommandSpec**:
A registered terminal command: primary `name`, optional `aliases`, optional help `section` + `usage`, and `argComplete` policy. The table in `command-registry.ts` is the authority; Tab completion, `help` listing, alias resolve, and known-command highlighting derive from it. Handlers bind by `name` in `commands.ts`.
_Avoid_: parallel PRIMARY_COMMANDS / PATH_ARG_COMMANDS / alias maps; help copy duplicated in i18n per command

**ReadingSession**:
Terminal reading UI session: `ReadingState` (main + rail) plus a `phase` (`idle` | `leaving` | `demoting`). Leave/demote transitions and `focusTerminal` effects live in `reading-session.ts`; React only applies results and plays CSS.
_Avoid_: leave/demote orchestration only in components; embedding animation durations in the pure layer

**discovery / api-http / read-adapter**:
Split of the former `api-read` bag: **discovery** owns Item model, index/filter/lookup, and document→Item projection (`href` via injectable `ItemHrefFor`); **api-http** owns JSON envelopes (`jsonOk`/`jsonError`); **read-adapter** owns filesystem → `ItemPayload` (hash). `api-read.ts` remains a thin deprecated barrel.
_Avoid_: mixing NextResponse or fs I/O into discovery; treating HTTP href strings as document identity

**DeploymentPosture**:
`local-dev` (owner `edit` / Server Actions allowed without Bearer) vs `public-production` (visitors read-only; UI write must be gated off or auth-equivalent to HTTP). Authority: `docs/adr/0007-security-deployment-posture.md`.
_Avoid_: treating ADR 0005 "no Bearer on Actions" as global; adding new unauthenticated write surfaces on the public web

**UiWriteGate**:
The env-controlled switch (planned: `ARCHIVE_UI_WRITE`) that disables terminal `edit`, command-registry registration, and Server Action mutations in `public-production`. HTTP Bearer write stays enabled when tokens are configured.
_Avoid_: hiding `edit` from help only while leaving Actions callable; direct `fs` writes outside `content-write.ts`
