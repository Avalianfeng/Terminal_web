# ADR 0004: 阅读会话 leave/demote 状态机

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: `74c317e`
- **Code**: `lib/archive/reading-session.ts`（结构操作仍在 `reading-state.ts`）
- **Glossary**: `CONTEXT.md` → ReadingSession

## Context

`ReadingState`（main/rail）已可测，但 leave / demote / intent / focus 编排曾埋在 `archive-terminal.tsx` 的 ref 与动效时长里，难单测、难导航。

## Decision

1. **ReadingSession** = `ReadingState` + `phase`：`idle` | `leaving{intent}` | `demoting{ghost}`。  
2. 事件返回 `{ session, effects }`；至少 effect：`focusTerminal`。  
3. 动效：事件入参 `animateLeave` / `animateDemote`（UI 用 motionLevel 计算）；`false` 则一步完成，不经中间 phase。  
4. React 只应用结果并播放 CSS；**时长不进入**纯层。  
5. 单测覆盖 close/clear/swap/done/打断；不测 React/CSS。

## Consequences

- 终端组件变薄；leave/demote 语义以 `reading-session` 为准。  
- 单测：`npm run test:reading-session`。

## Rejected

- 仅下沉 willPromote/willDemote 判定、编排仍全在组件。  
- 纯层内嵌 animation timer / motionSpec。  
- 本刀整页 `useReducer` 重写动效管线。
