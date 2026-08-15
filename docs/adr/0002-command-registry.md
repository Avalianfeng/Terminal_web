# ADR 0002: 终端命令注册表同源

- **Status**: Accepted
- **Date**: 2026-08-11
- **Commit**: `6055363`
- **Code**: `lib/archive/command-registry.ts`
- **Glossary**: `CONTEXT.md` → CommandSpec

## Context

命令名、alias、help 文案、参数补全策略曾分散在 `complete.ts`、`aliases.ts`、`commands.ts` switch、`i18n.help.*`，加命令易漏改。

## Decision

1. **CommandSpec 表**为权威：`name`、`aliases?`、`section?`+`usage`、`argComplete`、可选 `secret`（help/Tab 均不列出）、可选 `requiresOwner`（visitor 的 help/Tab 省略）。  
2. Tab 补全、`help` 分段、alias 解析、已知命令高亮均 **派生** 自该表。  
3. `argComplete` 为策略枚举：`none | dirs | all | cat | open | music`；算法仍在 `complete.ts`（`music` 的候选词表同源自 `lib/music/music-command.ts`）。  
4. 落点：`command-registry.ts`；删除平行 `aliases.ts`；`i18n.help` 只留 title / 段标题 / shortcuts。  
5. **handlers** 仍按 `name` 绑在 `commands.ts`（避免 registry↔commands 循环依赖）；`run` 不挂在 Spec 对象上。

## Consequences

- 加命令 = registry 登记 + commands 写 handler。  
- 单测：`npm run test:command-registry`（不测完整 `runCommand`）。  
- 后续若要把 `run` 挂上 Spec，需另 ADR 解决模块边界。

## Rejected

- 仅元数据表、handler 完全游离且无派生补全/help。  
- 一命令一文件（对本仓规模过碎）。  
- help usage 继续按命令散落在 i18n。
