# SeaShard 定时命令插件

独立的 SeaShard 第三方插件。它只通过公开 SDK 和 Service Contract 工作，不修改或私有导入 SeaShard 源码。

## 功能

- 在服务器侧栏注册 `/server/scheduled-commands` 页面。
- 页面始终绑定 `context.serverSelection` 的当前服务器；切换实例后自动切换任务列表。
- 支持延时执行、指定时间单次执行、每日执行和每周执行。
- Host 在发送命令前重新验证实例存在，并要求服务器状态为 `running`。
- 任务按服务器实例隔离，持久化到插件自己的 `scheduler-state` 文档。
- 支持创建、编辑、启停、立即执行和删除。
- 向 SeaShard Agent 注册六个能力：
  - `scheduled-commands_list`
  - `scheduled-commands_create`
  - `scheduled-commands_update`
  - `scheduled-commands_set-enabled`
  - `scheduled-commands_delete`
  - `scheduled-commands_run-now`

每日和每周计划按 SeaShard Host 所在机器的本地时区计算。服务器命令不需要前导 `/`，且不能包含换行符。

## 架构

```text
scheduled-commands/
├─ src/
│  ├─ shared/
│  │  ├─ contract.ts       # JSON-safe Service Contract 与共享 DTO
│  │  ├─ schedule.ts       # 单次、每日、每周下次执行时间计算
│  │  └─ validation.ts     # Client、Agent、持久化输入的边界校验
│  ├─ host/
│  │  ├─ index.ts          # inject/provides/apply 与生命周期
│  │  ├─ scheduler.ts      # 持久化、串行调度、计时器与命令执行
│  │  ├─ service.ts        # Client → Host typed JSON Service
│  │  └─ agent-tools.ts    # SeaShard Agent 工具
│  └─ client/
│     ├─ index.ts          # Client Entry、公开页面 Slot、样式生命周期
│     ├─ page.ts           # 当前服务器任务页面
│     └─ styles.ts         # 与 SeaShard 明暗主题兼容的页面样式
├─ test/
│  ├─ agent-tools.test.ts
│  ├─ schedule.test.ts
│  └─ scheduler.test.ts
├─ bundle/
│  ├─ plugin.json
│  └─ dist/
│     ├─ host.js
│     └─ client.js
├─ build.mjs
├─ package.json
└─ tsconfig.json
```

`bundle/` 是唯一的分发根目录，只包含 `plugin.json` 和两个完整 ESM 入口。两个入口均已 bundle，不保留裸 npm import。

## 公开 Service 与权限

插件提供 JSON Service Contract：

```text
seashard-plugin.scheduled-commands
```

方法：

```text
listTasks
createTask
updateTask
deleteTask
setTaskEnabled
runTaskNow
```

Host Entry 的精确 `uses`：

```text
seashard.server-instance-manager: listForClient
seashard.server-runtime: get, sendCommand
```

Client Entry 仅调用本插件提供的上述六个方法。服务器选择来自公开的 `context.serverSelection.getCurrentInstanceId()` 与 `subscribe()`；没有导入 SeaShard 私有服务器选择状态，也没有使用 `workspace.sidebar` 旁路。

开发时已通过 CLI Service Catalog 确认依赖：

```powershell
node D:/projects/cowork/SeaShard/apps/cli/dist/index.js inspect services --json
node D:/projects/cowork/SeaShard/apps/cli/dist/index.js inspect service seashard.server-instance-manager --json
node D:/projects/cowork/SeaShard/apps/cli/dist/index.js inspect service seashard.server-runtime --json
```

## 生命周期与清理

- Host `apply()` 先恢复插件存储，再通过 `context.effect()` 启动唯一的最近任务计时器。
- 停止、重载、启动失败或应用退出时，Host disposer 清除计时器并等待已进入串行队列的操作结束。
- 发送前先持久化 `running` 状态和下一次计划，避免重启后重复发送已经到期的单次任务。
- 启动时若发现上次中断的 `running` 记录，会标记为失败，不会静默当作成功。
- Client 页面卸载时清除 15 秒刷新计时器和当前服务器订阅。
- Client Entry 停止时，SeaShard 自动撤销页面 Slot；插件自己的 `context.effect()` 同时删除注入的样式元素。
- Agent 工具、Service provider 和注入依赖均归属于 Host Runtime，随 Runtime 停止自动释放。

## 安装依赖

要求 Node.js 24.11 或更高版本、pnpm 10：

```powershell
pnpm install
```
SDK 依赖直接使用 npm Registry 上公开发布的 `@seashard/plugin-sdk`、`@seashard/contracts` 和 `@seashard/ui-sdk` 0.1.x，无需在仓库旁放置 SeaShard 源码。

## 构建与验证

```powershell
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run plugin:validate
```

本次实际结果：

- TypeScript `tsc --noEmit`：通过。
- Node 行为测试：7/7 通过。
- `bundle/dist/host.js`：27.1 KB。
- `bundle/dist/client.js`：125.7 KB。
- CLI 校验：2 个 Entry、3 个 bundle 文件。
- bundle SHA-256 摘要：`75661397016e8c4acbf6e7d05f382f60685968fe3b40c56976db4bb415534045`。

测试覆盖每日与每周时间推进、过期单次计划拒绝、未知实例拒绝、运行中服务器成功调用 `sendCommand` 且只调用一次、停止状态不发送、Agent 工具完整注册和取消信号。

## 开发热加载与日志

先构建，再启动真实 Desktop Host：

```powershell
pnpm run build
pnpm run plugin:dev
```

另一个终端可查看指定 Runtime 日志或请求重载：

```powershell
pnpm run plugin:logs -- dev:seashard-plugin.scheduled-commands:scheduler.host
pnpm run plugin:reload -- dev:seashard-plugin.scheduled-commands:scheduler.host
```

`pnpm run watch` 会持续重建 `bundle/dist/`；`plugin dev` 监测到 bundle 变化后校验新摘要，停止旧 Runtime，再激活新 Runtime。使用 `Ctrl+C` 退出时，开发 Host 和插件 Runtime 会完成清理。

本次实际开发验证已观察到：`preparing → starting → active`，手动重载时出现 `reload-requested → stopping → stopped → preparing → starting → active`，bundle 更新后自动刷新仍为 `active`，`Ctrl+C` 最终退出码为 0。

## 打包与安装

```powershell
pnpm run plugin:pack
pnpm run plugin:install
```

输出归档：

```text
seashard-plugin.scheduled-commands-0.1.0.seashard-plugin
```

本次归档已由 SeaShard CLI 安装并启用，安装摘要与校验摘要一致。实际 Desktop 页面验证包括：

- 插件设置显示 `2/2 运行中`；
- 服务器侧栏显示“定时任务”；
- 未选择服务器、加载、空列表和成功反馈状态可见；
- 延时任务创建成功；
- 同一任务可更新为每日和每周计划；
- 切换到另一服务器后任务计数变为 0，切回后原任务仍在；
- 对停止状态服务器立即执行 `list` 时，Host 明确拒绝且没有发送命令；
- 验证任务随后已删除，插件存储恢复为空。

没有为验证而启动或修改用户的 Minecraft 服务器。真实 `running` 状态的发送分支由行为测试确认会调用公开 `seashard.server-runtime.sendCommand(instanceId, command)`。

## 许可证

本项目仅按 [GNU Affero General Public License v3.0](LICENSE) 发布，SPDX 标识为 `AGPL-3.0-only`。
