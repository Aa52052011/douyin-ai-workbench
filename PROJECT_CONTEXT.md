# AI Content Factory V1.0

## 项目定位

AI Content Factory 是一个 **AI 抖音智能体工作台**。

目标：帮助自媒体用户完成：

- 账号定位
- 行业分析
- 内容规划
- AI 脚本生成
- AI 视频生产
- 数据复盘

未来升级：

- AI 影视剪辑智能体
- 多平台内容智能体
- SaaS 多用户系统

---

## 当前版本

**V1.0 MVP**

目标：个人开发者可使用的 AI 内容生产助手。

---

## 技术架构

| 层 | 技术栈 |
| --- | --- |
| Desktop | Tauri + Next.js + TypeScript |
| Backend | Node.js + NestJS |
| AI Service | Python + FastAPI |
| Database | PostgreSQL + Prisma |
| Queue | Redis + BullMQ |
| AI Framework | LangGraph |

---

## 架构原则

1. 模块化设计
2. 支持未来多用户
3. 所有业务预留 `tenant_id`
4. AI 能力统一由 Agent 管理
5. 所有耗时任务异步执行

---

## V1.0 功能范围

包含：

1. 用户系统
2. 工作空间
3. 项目管理
4. AI 账号定位
5. 内容规划 Agent
6. AI 脚本 Agent
7. 视频生成流程
8. 数据分析 Agent

---

## 暂不开发

1. 自动发布
2. 私信机器人
3. 影视剪辑 Agent
4. 本地大模型部署

---

## 开发原则

- 不要一次生成整个项目。
- 每次只开发一个模块。
- 开发前先设计。
- 开发后必须测试。
