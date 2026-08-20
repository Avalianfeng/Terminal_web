# ADR 0020: Terminal Target Resolution

- **Status**: Accepted
- **Date**: 2026-08-20
- **Related**: [0002](0002-command-registry.md)（命令发现 / help / Tab）；[0012](0012-cli-output-contract.md)（排放）；[0019](0019-capability-zone-permission.md)（Action / zone）；[0013](0013-document-ref-multi-segment.md)
- **Code**: `lib/archive/target-resolver.ts`

## Context

- 写命令（`edit` / `mkdir` / `rmdir`）各自解析 cwd、`~/`、绝对路径与 zone，导致语义漂移（例如 cwd=`/resources` 时 `edit ~/private/…` 被拼成 `/resources/private/…`）。
- [0002](0002-command-registry.md) 已统一命令**发现**；缺一层统一的**目标解析**。
- [0019](0019-capability-zone-permission.md) 已有 `ArchiveActionId`；终端 Intent 应映射到 Action，而不是在各 handler 里理解 `private`。

## Decision

1. **四层**：Command（registry）→ Target Resolution（本 ADR）→ VFS / DocumentRef → Action / Permission。
2. **`target-resolver.ts` 为写路径权威**：绝对 / 相对 / `~` 先分流成绝对 VFS path，再 `classify` / `resolveCreatable*` / `resolveExisting*`。命令 handler **不**认识 zone。
3. **写边界**（creatable / existing document|directory）：仅 `/{group}/…` 或 `/private/{group}/…`（组下至少一段）。`/`、`/private`、组根、`person`/`timeline` 不可作为写目标；报错按节点种类区分。
4. **本刀迁移**：`edit` / `mkdir` / `rmdir` / 新 `rm`。`open` / `cat` / `find` 后迁；`permission.can()` 硬接后置。
5. **0002 职责不变**：注册表只管 name / alias / help / owner / argComplete。

## Consequences

- 加写命令 = registry + handler 调 resolver +（可选）UI fs 侧效。
- Intent ↔ `ArchiveActionId` 对齐，便于接线 0019。
- 单测：`target-resolver.test.ts` + 写命令用例。

## Rejected

- 每命令各自 `resolveXxxTarget` 长期并存。
- 命令 handler 内特殊处理 `private` 字符串。
- 本刀一次性迁完所有读命令 / 硬接 `can()`。
