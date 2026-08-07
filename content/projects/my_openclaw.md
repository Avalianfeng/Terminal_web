---
title: "my_openclaw"
summary: "为「人格能否像人一样沉积」提供可验证实验台：设计的是易形成人格惯性的过程，而非易管理的数据结构。"
status: "活跃开发 (WIP)"
tags: "openclaw, sedimentation, identity, experiment"
---

# my_openclaw

本仓库不是 Companion 产品，而是为「人格能否像人一样沉积」这一认识论问题提供可验证的实验台。

当前认识与目的已高度清晰（Phase 1 Gate ✅），最大断裂点是：哲学已闭合，但 live 验证与状态机规格尚未落地。

## 已完成

- 确立 Identity Sedimentation（人格沉积）研究北极星：SOUL 是滞后导出的自我描述，不是实时人格 API
- 完成 Phase 1 全链路设计闭环（`design/00`–`07`）：官方 Workspace 文件归因、惯性过程 vs 工程能力缺口矩阵、S1–S9 够用性场景预判、OpenClaw 桥接路径评估
- 通过审计与源码交叉验证：OpenClaw 是优秀的事实/能力沉积平台，但不支持人格惯性沉积
- 搭建可回滚实验基础设施：双基线 workspace、实验模板 + exp01（身份连续性）、ResearchAgent 规则注入，以及软桥接骨架
- 明确终局架构：Experience → Identity Model → Workspace Compiler → SOUL/IDENTITY 等导出物；Phase 1 不建 Compiler

## 下一步

1. 在本机 Gateway 补跑 exp01 live 实验，将 `result.md` 的 `live_status` 从 `audit_only` 更新为 `completed`
2. 落地 Phase 1.5 组合 A 桥接：引用 sedimentation-bridge、创建 sediment-log 模板，再跑 S1 对比
3. Phase 2 kickoff：撰写沉积状态机规格，定义六级进入/退出条件、修改权限、Heartbeat、Reflection 与审计回滚规则

## 遗留问题

- 无可执行应用代码；exp01 仍为 audit_only
- sedimentation-bridge 仅为骨架，尚未写入 AGENTS.md
- workspace_custom 除 ResearchAgent 段外仍为官方模板
- 无单元测试与 CI
