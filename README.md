# Personal Archive System

Feng 的个人数字档案公开站点，部署目标为 [cylf.me](https://cylf.me)。网站不以传统首页为入口，而是以**终端界面**作为访客浏览档案的主要方式。

当前版本：**v0.1**（`active development`）

## 项目定位

传统个人网站按页面组织：首页、关于、博客、项目、联系。本系统以 **Person（人物）** 为核心对象，项目、思考、文档、时间线等记录都附着于人物之上，网站只是档案的一种展示面。

更深层的知识研究见 `personal_archive` 项目；`my_web` 是其公开界面层。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router + Turbopack） |
| UI | React 19、Tailwind CSS 4 |
| 语言 | TypeScript（ESM） |
| 内容 | Markdown + JSON，构建时读取 |
| 工具 | ESLint（flat config） |

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 主终端界面，档案浏览入口 |
| `/themes` | 视觉主题试验台，与稳定公开壳层隔离 |

## 终端功能

首页渲染 `ArchiveTerminal` 组件，支持命令行交互：

### 档案命令

| 命令 | 说明 |
|------|------|
| `help` / `?` | 查看可用命令 |
| `about` | 查看人物档案 |
| `projects` | 列出公开项目 |
| `thoughts` | 列出公开思考 |
| `timeline` | 查看时间线 |
| `search <关键词>` | 全文搜索档案 |
| `open <slug>` | 打开项目或文章 |
| `themes` | 提示主题试验台路径 |
| `clear` / `cls` | 清空终端会话 |

### Linux 风格命令

| 命令 | 说明 |
|------|------|
| `pwd` | 显示当前目录 |
| `ls` / `dir` / `ll` | 列出目录内容 |
| `cd <路径>` | 切换工作目录 |
| `tree` | 显示目录树 |
| `cat <文件>` | 读取节点内容 |
| `whoami` | 显示人物姓名 |
| `history` | 显示会话命令历史 |

打开的记录以**浅色档案纸卡片**呈现，与深色终端壳层形成对比（Dual Phase Archive 视觉方向）。

## 内容结构

```
content/
├── person.json          # 人物元数据
├── timeline.md          # 时间线（## 日期 标题 格式）
├── projects/
│   ├── personal_archive/info.md
│   └── my_web/info.md
└── thoughts/
    └── archive-system.md
```

Markdown 文件支持 YAML frontmatter（`title`、`summary`、`status`、`tags`），由 `lib/archive/content.ts` 在服务端构建时解析为 `ArchiveSnapshot`。

虚拟文件系统（VFS）将档案映射为类 Unix 路径：

```
/
├── projects/
├── thoughts/
├── timeline
└── person
```

## 视觉方向

生产环境采用 **Dual Phase Archive**：黑色精确终端壳 + 浅色安静纸面卡片。

`/themes` 页面展示四个候选方向，供视觉实验，不影响主站稳定壳层：

- Dual Phase Archive（当前生产方向）
- Deep Console
- White Archive
- Reversal Chamber

## v0.1 边界

**已实现：**

- 终端浏览、打开、搜索、阅读公开记录
- Markdown/JSON 内容层
- 命令历史（上下箭头）
- 基础动效与 `prefers-reduced-motion` 适配

**刻意留待后续：**

- 所有者编辑
- 登录与权限
- AI 解读
- 多人档案权限
- 全屏模式（按钮已占位，暂未启用）

## 本地开发

```bash
npm install
npm run dev      # 默认 http://localhost:3000
npm run build    # 生产构建
npm run start    # 启动生产服务
npm run lint     # ESLint 检查
```

开发服务器已配置 `allowedDevOrigins: ["172.19.0.1"]`，支持 WSL/容器网络访问。

## 目录概览

```
app/                    # Next.js 页面与全局样式
components/             # ArchiveTerminal 终端组件
lib/archive/            # 命令系统、VFS、内容加载、i18n
content/                # 档案数据源
.learnings/             # 开发过程记录
```
