# Sisyphus — Product Requirements Document

> 本地 AI Agent Orchestrator，Spotlight式交互，OpenClaw灵魂，Apple生态优先。

## 1. 产品愿景

一个轻量的本地AI Agent编排服务。用户通过极简的输入界面（类似macOS Spotlight）与一个"管家"Agent对话，管家负责理解意图、拆解任务、派发给专项Worker Agent执行，并汇报结果。

**核心体验：** 简单吩咐 → 后台干活 → 结果送达。

## 2. 产品形态

### 2.1 交互模式

**模式1：Fire & Forget（搜完即走）**
- 唤起输入框 → 输入需求 → 关闭
- 后台执行，完成后通过通知推送结果
- 适合简单、明确的任务

**模式2：Persistent Chat（管家对话）**
- 与Orchestrator Agent持续对话
- 管家会追问细节、汇报进度、展示结果
- 适合复杂任务、需要决策的场景
- 关闭后再打开，对话仍在，可继续

两种模式共存，用户自由选择。

### 2.2 平台限定

**Apple生态优先：**
- macOS为主要平台
- 通知走macOS Notification Center
- 未来可扩展到iOS Shortcuts、Widgets

### 2.3 产品迭代路径

| 阶段 | 交互层 | 通信渠道 | 运维面板 |
|------|--------|----------|----------|
| **MVP (v0.1)** | CLI模拟Spotlight | — | — |
| **vNext** | macOS native UI (SwiftUI, 全局快捷键唤起) | iMessage接入 | Web Dashboard (localhost) |

## 3. 系统架构

```
┌─────────────────────────────────────┐
│           Frontend Layer            │
│  CLI (MVP) → Spotlight UI (vNext)   │
│  只负责：输入、展示结果、通知         │
└──────────────┬──────────────────────┘
               │ HTTP over Unix Socket
┌──────────────▼──────────────────────┐
│         Daemon Service              │
│  常驻后台进程                        │
│  - 接收请求（HTTP API）              │
│  - 维护 orchestrator agent 实例     │
│  - 管理所有 worker 生命周期          │
│  - 任务队列 & 结果缓存              │
│  - 数据持久化                       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Orchestrator Agent            │
│  "管家"角色                          │
│  - 理解用户意图，拆解任务            │
│  - 选择合适的worker，派发任务        │
│  - 汇总结果，格式化回传给用户        │
│  - 有完整 soul / memory             │
│  - 可主动推送（通知用户）            │
└──────────────┬──────────────────────┘
               │ spawn & IPC
┌──────────────▼──────────────────────┐
│        Worker Agents (N个)          │
│  coding / research / file-ops / ... │
│  - 精简soul + 专项skill             │
│  - 子进程运行，完成后结果推回        │
│  - 状态：spawning → running → done  │
└─────────────────────────────────────┘
```

### 3.1 通信协议

- **Frontend ↔ Daemon：** HTTP over Unix Socket（CLI和未来Swift UI都能对接）
- **实时推送：** SSE（Server-Sent Events）— CLI stream输出，未来UI实时更新
- **Daemon ↔ Workers：** stdin/stdout pipe（子进程模型）

### 3.2 为什么是Daemon

Spotlight形态的核心前提 — 前端可插拔，后端常驻：
- CLI和Spotlight UI都只是连接daemon的client
- 关掉前端不影响任务执行
- 重新打开前端，状态和历史都在

## 4. Agent Identity系统

参考OpenClaw的文件驱动设计。**每个Agent = 一个目录：**

```
agent-name/
  soul.md          # 人格定义（角色、性格、行为准则）
  agents.md        # 行为规范（类似OpenClaw AGENTS.md）
  skills/          # 能力定义（工具调用规范）
  memory/          # 会话记忆（按日期）
    YYYY-MM-DD.md
  context.md       # 当前任务上下文（动态注入）
```

**Orchestrator** — 完整人格，有长期记忆，认识所有worker（agent registry）
**Worker** — 精简soul，重点是skill和task context，不浪费token在personality上

## 5. 任务系统

### 5.1 Task对象

```typescript
interface Task {
  id: string;
  description: string;          // 自然语言描述
  context?: string;             // 补充上下文
  status: 'pending' | 'assigned' | 'running' | 'done' | 'failed';
  assignedTo?: string;          // worker agent name
  result?: TaskResult;
  createdAt: number;
  updatedAt: number;
  sessionId: string;            // 关联的对话session
  dependsOn?: string[];         // 预留：任务依赖（MVP不实现）
}
```

### 5.2 结果回传

- Worker完成后推送result给Orchestrator
- Orchestrator决定：直接展示 / 后处理 / 合并多个worker结果
- 支持流式汇报（长任务进度）和最终汇报两种

### 5.3 生命周期

```
用户输入 → Orchestrator理解 → 拆任务 → 选Worker → Spawn
→ Worker执行（可流式汇报进度）→ 完成/失败
→ Orchestrator汇总 → 回传用户（对话 / 通知）
```

## 6. 数据持久化

### 6.1 MVP方案：JSON文件

```
~/.sisyphus/data/
  sessions/
    <session_id>.json     # 包含完整message流、tool_calls
  tasks/
    <task_id>.json         # 任务状态和结果
  agents/
    <agent_name>/
      state.json           # agent运行时状态
```

- 滚动覆盖：按文件数量或日期，超过阈值自动清理旧文件
- 未来如需迁移到SQLite，JSON→SQLite迁移成本很低

### 6.2 必须持久化的数据

- 所有message（user input、agent response）
- 所有tool calls（入参、出参、耗时、成功/失败）
- 任务状态变更历史
- Token usage（按session、agent、task维度）

## 7. API设计

Daemon对外暴露的HTTP API（Unix Socket）：

```
POST   /api/chat              # 发送消息（对话模式）
GET    /api/chat/stream       # SSE实时推送

GET    /api/tasks             # 任务列表
GET    /api/tasks/:id         # 任务详情
POST   /api/tasks             # 直接创建任务（fire&forget模式）

GET    /api/sessions          # Session列表
GET    /api/sessions/:id      # Session详情（含messages、tool_calls）

GET    /api/agents            # Agent列表
GET    /api/agents/:name      # Agent详情

GET    /api/system            # 系统状态（daemon uptime、活跃worker数等）
```

**设计原则：** API先行。CLI、Spotlight UI、Dashboard都是API的消费者。

## 8. 通知机制

不管用户选择哪种交互模式，关键事件都要推送：

| 事件 | 通知内容 |
|------|----------|
| ✅ 任务完成 | 结果摘要，点击查看详情 |
| ❓ 需要决策 | "管家有问题问你" |
| ❌ 任务失败 | 错误摘要 |

- MVP：CLI内直接输出
- vNext：macOS Notification Center，点击打开Spotlight UI

## 9. 目录结构

```
~/.sisyphus/
  config.yaml                  # 全局配置（LLM provider、model、端口等）
  sisyphus.sock                # Unix Socket文件
  orchestrator/                # Orchestrator Agent定义
    soul.md
    agents.md
    memory/
    skills/
  workers/                     # Worker Agent定义
    coder/
      soul.md
      skills/
    researcher/
      soul.md
      skills/
  data/                        # 运行时数据
    sessions/
    tasks/
    agents/
  logs/                        # 日志
```

## 10. 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| Daemon + Orchestrator + Worker | TypeScript (Node.js) | 与OpenClaw同栈，方便参考和复用 |
| LLM调用 | OpenAI SDK / LiteLLM | 统一接口，支持多provider |
| 数据持久化 | JSON文件（MVP）→ SQLite（未来） | MVP足够，迁移成本低 |
| CLI | Commander.js 或类似 | 标准Node CLI框架 |
| macOS UI (vNext) | SwiftUI | Apple native，通过HTTP Socket与daemon通信 |
| Dashboard (vNext) | React (Web UI, localhost) | 迭代快，运维视角 |
| iMessage (vNext) | 参考OpenClaw实现 | Apple生态内的messaging channel |

## 11. MVP (v0.1) 范围

### 包含

- [x] Daemon服务（启动/停止/状态）
- [x] Orchestrator Agent（对话、意图理解、任务拆解）
- [x] 1个Worker Agent类型（Coding Agent）
- [x] CLI交互（对话模式 + fire&forget模式）
- [x] JSON文件持久化（sessions、tasks、messages、tool_calls）
- [x] 基本任务生命周期（创建→派发→执行→完成/失败）
- [x] 结果回传和展示

### 不包含（但设计上预留）

- [ ] macOS native UI
- [ ] iMessage接入
- [ ] Web Dashboard
- [ ] 任务依赖DAG（task对象预留`dependsOn`字段）
- [ ] 多LLM provider切换（调用层抽象好）
- [ ] 持久化长期记忆跨session（文件结构先定好）
- [ ] 滚动清理策略（手动清理即可）

### MVP验收标准

```bash
# 启动daemon
sisyphus daemon start

# Fire & Forget模式
sisyphus "用python写个计算器"
# → daemon接收 → orchestrator拆解 → 派给coder worker → 代码生成 → 结果展示

# 对话模式
sisyphus chat
> 帮我写个todo app，要用React
🤖 收到。我来帮你拆一下...需要后端吗？
> 不用，纯前端就行
🤖 好的，派给coder了。预计3分钟...
🤖 完成了。代码在 ./todo-app/，运行 npm start 启动。

# 查看状态
sisyphus status
sisyphus result <task_id>
```

## 12. CLI命令设计

```bash
# 核心交互
sisyphus "<prompt>"                  # Fire & Forget，提交任务
sisyphus chat                        # 进入交互式对话模式

# 任务管理
sisyphus status                      # 查看进行中的任务
sisyphus result <task_id>            # 查看任务结果
sisyphus tasks                       # 任务列表

# Daemon管理
sisyphus daemon start                # 启动daemon
sisyphus daemon stop                 # 停止daemon
sisyphus daemon status               # 查看daemon状态

# Agent管理
sisyphus agents list                 # 查看已注册的worker
sisyphus agents create <name>        # 创建新worker定义（交互式）
```

## 13. 与OpenClaw的关系

**借鉴：**
- Agent Identity系统（soul/agents/user/memory文件驱动）
- Daemon + Gateway架构模式
- Session和Message数据模型
- iMessage接入方式（vNext）

**区别：**
- 更轻量 — 砍掉多渠道适配层、复杂gateway
- 更强编排 — Orchestrator有更强的任务拆解和派发逻辑
- Apple生态专注 — 不做跨平台
- Spotlight交互范式 — 不是聊天工具，是效率工具

---

*文档版本: v0.1-draft*
*最后更新: 2026-03-14*
*作者: SuperBoss*
