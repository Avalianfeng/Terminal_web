---
title: "Bilibili Embed 实验"
summary: "验证 B 站 player iframe 嵌入（流量走 bilibili CDN）。"
url: "https://www.bilibili.com/video/BV1GJ411x7h7"
resourceType: "video"
platform: "bilibili"
tags: "实验, video, bilibili"
---

## 核心点

- 使用官方 `player.bilibili.com` 嵌入；**请用完整 `/video/BV…` 链**，`b23.tv` 短链无法稳定解析 id。
- header 外链文案为 **观看原视频 →**（按 `resourceType` 映射，与文章样本区分）。
- 设 `embed: "false"` 可仅保留外链与笔记。
