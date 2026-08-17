# Personal Archive System

个人数字档案公开站点，部署目标为 [cylf.me](https://cylf.me)。网站不以传统首页为入口，而是以**终端界面**作为访客浏览档案的主要方式。

当前版本：**V0 已结束 → 最小 v1.0 的 A/B/C/E 已完成**（C 为 2026-08-07 重开的最小闭环：鉴权写 API）；发现层对象模型 + HTTP 契约已落地见 [`docs/08-发现层对象模型.md`](docs/08-发现层对象模型.md)。路线见 [`docs/06-v1.0-路线纲要.md`](docs/06-v1.0-路线纲要.md)。文档迷路先看 [`docs/00-文档入口.md`](docs/00-文档入口.md)。

## 项目定位

传统个人网站按页面组织：首页、关于、博客、项目、联系。本系统以 **Person（人物）** 为核心对象，项目、思考、文档、时间线等记录都附着于人物之上，网站只是档案的一种展示面。

更深层的知识研究见 `personal_archive` 项目；`my_web` 是其公开界面层。

## 技术栈


| 类别  | 技术                                 |
| --- | ---------------------------------- |
| 框架  | Next.js 16（App Router + Turbopack） |
| UI  | React 19、Tailwind CSS 4            |
| 语言  | TypeScript（ESM）                    |
| 内容  | Markdown + JSON，构建时读取              |
| 工具  | ESLint（flat config）                |


## 路由


| 路径        | 说明                |
| --------- | ----------------- |
| `/`       | 主终端界面，档案浏览入口      |
| `/themes` | 视觉主题试验台，与稳定公开壳层隔离 |
| `/api/v1` | Agent API 发现入口（读 + 写能力表；见 [`docs/08`](docs/08-发现层对象模型.md)） |
| `/api/v1/items` | 统一条目索引 / 详情（`?kind=` / `?source=` 过滤，`source=local&localKey=…` 详情） |


## Agent / 公开 API

服务器在线即可拉档案或经鉴权写回，不依赖 Cursor CLI、不爬 HTML。

推荐读流程：`GET /api/v1` → `/api/v1/items` → 跟随条目 `href`（`source=local&localKey=…`）。

写流程（需 token）：`npm run token:generate [--scope <scope>]` 生成 token（默认 `*` 全权，可限 `thoughts/*` 等）；`PUT /api/v1/items?source=local&localKey=…` upsert、`DELETE` 删除，Bearer 鉴权，`If-Match` 头做乐观并发（409 冲突）。

契约回归（本机）：`ARCHIVE_WRITE_TOKEN=<token> npm run smoke:write-api`（推荐 scope `thoughts/*`，改 `.env.local` 后需重启 `dev`）。短 playbook：[`docs/10-agent-写API验收.md`](docs/10-agent-写API验收.md)。

完整契约见 [`docs/08-发现层对象模型.md`](docs/08-发现层对象模型.md) §5（§5.7 为写契约）。旧版 [`docs/07-公开读API.md`](docs/07-公开读API.md) 已被替代，保留作为历史记录。终端内 `edit` 命令供所有者编辑内容文件（server actions；local-dev 隐式主人，公网须 `login`，见 [`docs/adr/0010-site-principal.md`](docs/adr/0010-site-principal.md)）。

## 终端功能

首页渲染 `ArchiveTerminal` 组件，支持命令行交互：

### 档案命令


| 命令              | 说明        |
| --------------- | --------- |
| `help` / `?`    | 查看可用命令    |
| `about`         | 查看人物档案    |
| `projects`      | 列出公开项目    |
| `thoughts`      | 列出公开思考    |
| `timeline`      | 查看时间线     |
| `search <关键词>`  | 全文搜索档案    |
| `find [关键词]`    | 按路径 / 名称检索（空则列出可打开节点） |
| `status`         | 档案计数与索引状态 |
| `open <slug>`   | 打开项目或文章   |
| `edit <路径>`     | 编辑/新建/删除文档（owner；本机可不 login） |
| `whoami`            | 档案人物名与站点角色 |
| `themes`        | 提示主题试验台路径 |
| `clear` / `cls` | 清空终端会话    |




### Linux 风格命令


| 命令                  | 说明       |
| ------------------- | -------- |
| `pwd`               | 显示当前目录   |
| `ls` / `dir` / `ll` | 列出目录内容   |
| `cd <路径>`           | 切换工作目录   |
| `tree`              | 显示目录树    |
| `cat <文件>`          | 读取节点内容   |
| `mkdir <路径>`        | 创建目录（owner；递归） |
| `rmdir <路径>`        | 删除空目录（owner） |
| `whoami`            | 档案人物名与站点角色 |
| `history`           | 显示会话命令历史 |


打开的记录以**浅色档案纸卡片**呈现，与深色终端壳层形成对比（Dual Phase Archive 视觉方向）。

## 内容结构

```
content/
├── person.json          # 人物元数据
├── timeline.md          # 时间线（## 日期 标题 格式）
├── projects/            # 项目文档；扁平 <slug>.md 或簇文件夹 <cluster>/<leaf>.md（ADR 0013）
│   ├── personal_archive.md
│   ├── my_web.md        # 入口篇（可选；与 my_web/ 文件夹可共存）
│   ├── my_web/
│   │   └── log.md       # 延伸篇：localKey = projects/my_web/log
│   └── …（其余项目按 <slug>.md 平铺）
└── thoughts/            # 思考文档，每篇一个 <slug>.md
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



## 版本边界

**已实现：**

- 终端浏览、打开、搜索、阅读公开记录
- 嵌套文档（方案 A / ADR 0013）：多段 localKey、VFS 真目录、入口篇+簇文件夹共存、mkdir/rmdir
- 终端内编辑：`edit`（owner；本机 implicit，公网 `login`）打开编辑器面板，可改 frontmatter + 正文、新建、删除（`content-write.ts` 原子写）
- Markdown/JSON 内容层
- 命令历史（上下箭头）
- 基础动效与 `prefers-reduced-motion` 适配

**刻意留待后续：**

- 完整权限体系（多人、RBAC、审计；当前为 token + scope 最小闭环）
- AI 解读
- 多人档案权限
- 终端完整 shell 行为（`cd -`、`~` 展开、文件监听等）——**明确不做**，边界与使用策略见 [`docs/18`](docs/18-终端真实性评估.md) §6
- （已做）终端 fullscreen：放大壳高；`open`/`cat` 仍走阅读面板



## 本地开发

```bash
npm install
npm run dev            # 默认 http://localhost:3000
npm run build          # 生产构建
npm run start          # 启动生产服务
npm run lint           # ESLint 检查
npm run token:generate # 生成写 API token（--scope 可限范围；仅存 SHA-256 哈希到 .env.local）
npm run smoke:write-api # 写 API 契约 smoke（需 ARCHIVE_WRITE_TOKEN；见 docs/10）
```

开发服务器已配置 `allowedDevOrigins: ["172.19.0.1"]`，支持 WSL/容器网络访问。

## 目录概览

```
app/                    # Next.js 页面、全局样式与 API 路由
components/             # ArchiveTerminal 终端组件、阅读面板、编辑器
lib/archive/            # 命令系统、VFS、内容加载/写入、token、读 API、i18n
content/                # 档案数据源
```

