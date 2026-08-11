# ADR 0006: 写后阅读面即时刷新

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: `3d88447`
- **Code**: `reading-state` 的 `replaceDocumentSurface` / `reconcileReadingWithSnapshot`；`parse-document.ts`；`archive-terminal` / `editor-panel`

## Context

保存后若只 `router.refresh()`，已打开的阅读面板可能短暂或持续显示旧正文；删除后表面也可能残留。

## Decision

1. **保存**：保持文档打开，用保存返回的 **raw 即时** `parseDocument` → `replaceDocumentSurface`，再 `router.refresh()`。  
2. **删除**：`dismissDocumentByKey` 关掉 main/rail 中该文。  
3. snapshot 变更后用 `reconcileReadingWithSnapshot` 重绑打开面。  
4. **本刀不做** Agent/他页写入后的同页实时推送（仍依赖下次打开或后续刷新）。

## Consequences

- 主人 edit 保存后主槽立即为新正文。  
- `parseDocument` 可在客户端使用（与快照解析同源）。

## Rejected

- 保存后关闭面板、强迫重新 `open`。  
- 只等 RSC refresh、不做 raw 即时替换。  
- 本刀上 WebSocket/轮询做跨客户端同步。
