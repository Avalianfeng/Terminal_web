---
title: "my_web"
summary: "Personal Archive System 的公开界面层，部署于 cylf.me：以终端作为访客进入档案的第一表面。"
status: "活跃开发 (WIP)"
tags: "archive, website, terminal, cylf"
---

# my_web

`my_web` 是档案的公开界面层。

不以传统首页为入口。第一公开表面是终端：访客可检视项目、思考、时间线，以及后续更丰富的档案应用。

## 已完成

- 终端作为主访客界面：浏览、打开、搜索、阅读公开记录
- 档案数据以 Markdown 与 JSON 存放，构建时解析为快照
- Git 作为第一层内容管理
- 视觉实验（`/themes`）与稳定公开壳层分离
- Dual Phase Archive：黑色终端壳 + 浅色档案纸阅读面
- VFS 与类 Unix 命令层（`ls` / `cd` / `cat` / `tree` 等）

## 当前方向

- 继续强化终端作为档案入口的叙事与可用性
- 保持内容层可检视、可搜索、可版本化
- 所有者本机编辑（终端 `edit`）与 Agent 鉴权写（HTTP `PUT`/`DELETE`）已可用；完整登录 UI、AI 解读与多人权限仍后置

## 关系

`personal_archive` 是更深层的认识研究；本仓库是其公开展示面之一。
