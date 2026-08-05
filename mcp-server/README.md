# SanOmni MCP Server

这个目录包含 SanOmni 的独立 Model Context Protocol (MCP) 服务器实现。

它允许外部的 AI Agent 终端（例如 Antigravity、Cursor、CodeX 等）通过统一的协议访问和操作 SanOmni 的本地 SQLite 数据库。

## 特性

- **独立进程**：不嵌入到 Tauri 客户端，可作为一个独立的 Node.js 进程运行。
- **并发读写**：数据库使用 SQLite WAL 模式，支持与 SanOmni Tauri 桌面端同时读写而不会相互阻塞。
- **同步范围明确**：当前 Tauri 同步触发器覆盖 sanIP 与标签表；作品、角色、章节、提示词组和知识库的 MCP 写入仅保存在本地 SQLite，直到同步引擎支持这些域。
- **全领域覆盖**：暴露了 33 个 MCP Tool，涵盖 SanOmni 的 5 大核心功能域（IP 角色、作品、提示词模板、知识库等）。
- **领域约束一致**：章节工具仅操作未删除的叙事型（`narrative`）作品，作品结构仅允许 `single`、`collection`、`narrative`。
- **受限列表**：动态列表使用 `limit`（1-100，默认 50）与 `offset` 分页；章节列表仅返回内容摘要，详情请使用 `san_chapters_get`。

## 可用工具 (Tools)

服务器一共注册了 33 个工具：
- **sanIP (5 个)**：`san_ip_list`, `san_ip_get`, `san_ip_create`, `san_ip_update`, `san_ip_delete`
- **sanPrompt (5 个)**：`san_prompt_list`, `san_prompt_get`, `san_prompt_create`, `san_prompt_update`, `san_prompt_delete`
- **sanWorks (5 个)**：`san_works_list`, `san_works_get`, `san_works_create`, `san_works_update`, `san_works_delete`
- **Characters (5 个)**：`san_characters_list`, `san_characters_get`, `san_characters_create`, `san_characters_update`, `san_characters_delete`
- **Chapters (5 个)**：`san_chapters_list`, `san_chapters_get`, `san_chapters_create`, `san_chapters_update`, `san_chapters_delete`
- **sanKnow (3 个)**：`san_know_list_projects`, `san_know_search`, `san_know_create_entry`
- **Tags (2 个)**：`san_tags_list`, `san_tags_create`
- **Vendors (1 个)**：`san_vendors_list`
- **Images (2 个)**：`san_images_list`, `san_images_get`

## 如何在 Agent 中配置

要在你的 Agent 中使用 SanOmni MCP Server，请在 Agent 的 MCP 配置中添加以下内容（注意根据你的实际路径调整）：

### 针对 Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "sanomni": {
      "command": "node",
      "args": ["d:/dev/san/sanOmni/mcp-server/build/index.js"],
      "env": {
        "SANOMNI_DB_PATH": "D:/sanomnidata/data/database.sqlite"
      }
    }
  }
}
```

### 针对 Antigravity

```json
{
  "sanomni": {
    "command": "node",
    "args": ["d:/dev/san/sanOmni/mcp-server/build/index.js"],
    "env": {
      "SANOMNI_DB_PATH": "D:/sanomnidata/data/database.sqlite"
    }
  }
}
```

## 构建和测试

请使用与 MCP 客户端相同的平台 Node.js 运行。`better-sqlite3` 含原生模块：Windows MCP 配置必须在 Windows Node.js 下构建和测试，不能用 WSL 中的 Windows `node_modules` 作为运行验证。

```bash
# 安装依赖
npm install

# 构建 TypeScript 代码
npm run build

# 运行真实 stdio MCP 回归测试（使用临时 SQLite 夹具）
npm test

# 启动服务器 (标准输入输出，供 Agent 连接)
npm start

# 本地使用 MCP Inspector 调试
npx @modelcontextprotocol/inspector node build/index.js
```
