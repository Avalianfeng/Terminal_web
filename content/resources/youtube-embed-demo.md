---
title: "YouTube Embed 实验"
summary: "验证 resources 视频区 iframe 嵌入（流量走 YouTube CDN）。"
url: "https://www.youtube.com/watch?v=jNQXAC9IVRw"
resourceType: "video"
platform: "youtube"
tags: "实验, video"
---

## 核心点

- 首条 YouTube 视频（「Me at the zoo」）用于 smoke 嵌入。
- 播放器在 **media** 区；笔记仍走正文 markdown。
- 设 `embed: "false"` 可关掉 iframe，只保留 header 外链。
