# ADR 0005: 统一写入口与 expectedHash

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: `d678064`
- **Code**: `lib/archive/content-write.ts`；`lib/archive/actions.ts`；`components/editor-panel.tsx`；`app/api/v1/items/route.ts`
- **Contract**: `docs/08` §5.7 / §5.8；手测 `docs/11`
- **See also**: [0007 安全与部署姿态](0007-security-deployment-posture.md) — Decision 第 3 条「Actions 无 Bearer」**仅 local-dev**；公网 UI 写闸门见 0007

## Context

HTTP 写与终端 Server Actions 曾分叉；终端 `edit` 未接乐观并发，易与 Agent/`PUT` 静默互盖。

## Decision

1. 写内核四操作（save / saveRaw / patch / delete）统一吃 **DocumentRef** + options（含 `expectedHash`）。  
2. **终端 edit 接 expectedHash**：冲突提示 + 重载；本刀含最小可用 UI。  
3. Actions **无 Bearer**（本机主人面）；HTTP 仍 Bearer + scope；盘路径只在写内核。  
4. 读回 raw 时带上 hash，供编辑器 `baseHash` / `If-Match`。

## Consequences

- 人（edit）与 Agent（HTTP）共享同一并发语义。  
- 正确性债「edit↔expectedHash」关闭（见 `docs/09` / `docs/11` §7b）。

## Rejected

- 本刀只改内核、UI 完全不动。  
- 合并为单一「超级 write」API、去掉 patch/save 分工。  
- Actions 模仿 HTTP 引入 Bearer（个人本机面无必要）。
