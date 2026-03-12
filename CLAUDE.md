# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
# 安装依赖（推荐使用 bun）
bun install

# 构建
bun run build        # 生产构建
bun run build:dev    # 开发构建

# 运行
bun start            # 运行已构建的服务器（stdio 模式）
bun run dev:direct   # 直接通过 tsx 运行源码，不需要构建

# 类型检查
bun run typecheck

# 代码格式与 lint（使用 Biome）
bun run lint         # 仅 lint
bun run check        # lint + format 检查
bun run check:fix    # 自动修复

# 测试
bun test                  # 所有测试
bun run test:unit         # 仅单元测试（快，无外部依赖）
bun run test:integration  # 集成测试（需要安装 Tailscale CLI）

# 综合质检
bun run qa                # typecheck + 单元测试 + lint
bun run qa:full           # typecheck + 所有测试 + lint

# 调试：使用 MCP Inspector
bun run inspector
```

单元测试覆盖 `src/__test__/utils/` 和 `src/__test__/tailscale/oauth.test.ts`；集成测试文件名以 `.integration.test.ts` 结尾，需要本地安装 `tailscale` CLI。

## 架构概览

这是一个 **Tailscale MCP Server**，通过 [Model Context Protocol](https://modelcontextprotocol.io) 暴露 Tailscale 网络管理能力。支持两种传输模式：`stdio`（默认，供 Claude Desktop 等 MCP 客户端使用）和 `http`。

### 核心分层

```
src/
├── index.ts / cli.ts          # 入口：解析 CLI 参数，启动服务器
├── server.ts                  # TailscaleMCPServer：初始化并组装所有模块
├── servers/
│   ├── stdio-server.ts        # stdio 传输实现
│   └── http-server.ts         # HTTP/SSE 传输实现（Express）
├── tailscale/
│   ├── tailscale-api.ts       # Tailscale REST API 客户端（axios）
│   ├── tailscale-cli.ts       # Tailscale CLI 封装（子进程）
│   ├── unified-client.ts      # 统一客户端：自动选择 API 或 CLI
│   └── oauth.ts               # OAuth token 管理
├── tools/
│   ├── index.ts               # ToolRegistry + ToolDefinition 接口
│   ├── device-tools.ts        # 设备管理工具（列表、授权、路由）
│   ├── network-tools.ts       # 网络操作工具（状态、连接、ping、版本）
│   ├── acl-tools.ts           # ACL/DNS/Key 管理 + Split DNS + 策略文件
│   └── admin-tools.ts         # 管理工具（tailnet 设置、用户、联系人、webhook、标签、日志流、设备属性）
├── types.ts                   # 共享类型定义
├── logger.ts                  # 日志工具
└── utils.ts                   # 通用工具函数
```

### 关键设计

**UnifiedTailscaleClient**（`src/tailscale/unified-client.ts`）：核心适配层，在初始化时并发检查 API 和 CLI 可用性，按如下规则决策：
- HTTP 模式默认优先 API，stdio 模式默认优先 CLI
- 某一方不可用时自动回退到另一方
- `getStatus()` 始终优先 CLI（网络状态是本地 daemon 操作），CLI 不可用时以设备列表降级
- 部分操作只有 API 支持（设备管理、ACL、DNS、用户、webhook、联系人、日志流、设备属性），部分只有 CLI 支持（ping、exit node、shields up）

**Tailscale API 对齐**：所有 REST API 方法对齐 [Tailscale API v2](https://tailscale.com/api)，不使用已废弃或不存在的端点。

**ToolRegistry**（`src/tools/index.ts`）：工具注册中心，每个工具以 `ToolDefinition` 形式定义，包含名称、描述、Zod 输入 schema 和 handler。注册时使用 `z.toJSONSchema()` 将 Zod schema 转换为 MCP 要求的 JSON Schema。

**添加新工具**：在 `src/tools/` 创建新文件，导出符合 `ToolModule` 接口的对象，然后在 `src/tools/index.ts` 的 `loadTools()` 中调用 `this.registerModule()`。

### 认证方式

- **API Key**：`TAILSCALE_API_KEY` 环境变量
- **OAuth**：`TAILSCALE_OAUTH_CLIENT_ID` + `TAILSCALE_OAUTH_CLIENT_SECRET`（推荐用于自动化，不过期）
- CLI 操作无需 API 凭证

日志级别通过 `LOG_LEVEL` 控制（0=DEBUG，1=INFO，2=WARN，3=ERROR），文件日志通过 `MCP_SERVER_LOG_FILE` 指定路径（支持 `{timestamp}` 占位符）。
