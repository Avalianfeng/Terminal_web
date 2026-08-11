# ADR 0001: DocumentRef 为本地文档权威身份

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: `8aaa852`
- **Code**: `lib/archive/document-ref.ts`；`ArchiveDocument.ref`
- **Glossary**: `CONTEXT.md` → DocumentRef / localKey / ContentGroup

## Context

本地档案文档曾用 path、VFS 路径、`group`+`slug`、discovery `localKey` 等多套坐标并行，改命名/加组/接 edit 时易漏缝。

## Decision

1. **权威身份** = `{ group, slug }`，类型名 **DocumentRef**。  
2. 模块只做构造/校验与投影：`toLocalKey`、`toVfsPath`、`fromLocalKey`、`fromVfsPath`。  
3. `ArchiveDocument` 嵌套 `ref: DocumentRef`；**不再存** `path` / 顶层 `slug` 作第二权威。  
4. **盘路径**只留在 content 读/写内核；DocumentRef 不嵌入 cwd/磁盘。  
5. DocumentRef **仅**服务 `source: local` 的 document；跨源身份在发现层 **Item**；新媒体用新 `kind`，不拓宽 DocumentRef。

## Consequences

- 终端、API、阅读面、写路径统一经 DocumentRef / 投影函数。  
- 单测：`npm run test:document-ref`。  
- 外源（如 github）与音频/视频不回退本 ADR；另开 Item.source / kind。

## Rejected

- path / localKey 作权威。  
- DocumentRef 携带 filesystem path 或编辑会话态。  
- 用 DocumentRef 吞掉跨源身份。
