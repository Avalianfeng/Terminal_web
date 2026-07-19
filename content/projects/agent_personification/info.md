---
title: "agent_personification"
summary: "构建「LLM 之下、语言之上」的拟人化内在状态引擎：状态由事件与时间驱动，LLM 只负责理解与表达。"
status: "概念 (Idea)"
tags: "agent, personification, state, identity"
---

# agent_personification

核心目的不是「更好管理的 AI 人格数据库」，而是让 Agent 拥有一段可持续存在、自然流露为语言的内在生活——认知、记忆、人格惯性与真实的等待感，比功能清单更重要。

当前认识清晰、目的明确，断裂点在「认识尚未编译为可运行的状态机」。

## 已完成

- 确立核心认识论：构建「LLM 之下、语言之上」的拟人化内在状态引擎（Inner State Engine），状态由事件与时间驱动，LLM 只负责理解与表达，不创造情绪
- 完成七维架构概念闭环：驱动力 → 连续内部状态 → 时间感受 → 事件评价 → 反思/梦境 → 人格沉积 → 工作区编译，并明确各层职责边界（如 SOUL 是沉积快照而非真相）
- 厘清与 OpenClaw 的关系：本项目是独立于任何 Agent 框架的内核，`agent_personification` 为主线，OpenClaw 降级为验证用 Adapter
- 确立「人格是惯性而非结论」：经历留下痕迹、反复强化形成习惯，自我认知永远滞后于当下感受
- 重排实现优先级：先攻克 State Model（状态本体论），Phase 1 锁定为 State Core

## 下一步

1. 创建 `state/` 模块，为 Connection / Trust / Stress / Security / Novelty / Hope / Fatigue 等变量编写正式 Schema（取值范围、默认值、衰减函数、变量间耦合规则）
2. 实现无 LLM 的最小可运行原型（`state/` + `time/` 骨架）：支持模拟事件注入、时间流逝 tick、状态持久化到 JSON
3. 将《设想总结》第七节「待研究问题」前 3 条落地为 `docs/02-state-model.md`，逐变量记录规格后再进入 Appraisal / Sedimentation

## 遗留问题

- 无 `package.json`、无可执行代码目录
- 状态变量数学形态（0–100 / [-1,1] / 贝叶斯信念等）尚未选型
- Appraisal 由规则引擎还是小模型驱动未决
- 无单元测试与 CI
