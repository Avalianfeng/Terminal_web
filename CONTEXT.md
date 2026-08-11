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
One of the local document collections on disk (`projects` | `thoughts`).
_Avoid_: folder, category (when meaning the on-disk group)

**localKey**:
Discovery-layer key for `source: local`; for local documents it is the projection `${group}/${slug}` (no leading slash).
_Avoid_: treating localKey as a second authority beside DocumentRef

**ArchiveDocument**:
A local markdown document as loaded into the archive snapshot (title, body, tags, etc.). Identity is nested as `ref: DocumentRef` (not flat `group`/`slug`/`path` on the document).
_Avoid_: item (prefer discovery **Item** when meaning the HTTP/discovery shape); path-as-stored-identity; top-level group/slug as a second authority beside `ref`

**Item**:
A discovery-layer entry (`source` + `localKey` + kind); first shipped kind is `document`. Cross-source identity lives here, not inside DocumentRef. Future kinds (e.g. audio/video) and sources (e.g. github) extend Item; they do not widen DocumentRef.
_Avoid_: document (when meaning the discovery payload rather than ArchiveDocument)
