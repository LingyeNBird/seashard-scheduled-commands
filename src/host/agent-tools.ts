import type { JsonValue, PluginContext } from "@seashard/plugin-sdk";
import {
  parseCreateTaskInput,
  parseListTasksInput,
  parseSetTaskEnabledInput,
  parseTaskIdentityInput,
  parseUpdateTaskInput,
} from "../shared/validation";
import type { ScheduledCommandEngine } from "./scheduler";

export function registerAgentTools(context: PluginContext, engine: ScheduledCommandEngine): void {
  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "list",
      title: "列出服务器定时命令",
      description: "列出指定 SeaShard 服务器实例的全部定时命令、启用状态、下次执行时间和最近结果。",
      inputSchema: objectSchema({ instanceId: stringSchema("SeaShard 服务器实例 ID") }, ["instanceId"]),
      outputDescription: "服务器信息、Host 时区和定时命令列表。",
      examples: [{ instanceId: "server-instance-id" }],
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      return engine.listTasks(parseListTasksInput(input));
    },
  );

  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "create",
      title: "创建服务器定时命令",
      description:
        "为指定服务器创建定时命令。schedule 支持 once(runAt ISO 时间)、daily(time HH:mm) 或 weekly(time HH:mm, weekdays 0=周日到6=周六)。时间按 SeaShard Host 本地时区解释。",
      inputSchema: objectSchema(
        {
          instanceId: stringSchema("SeaShard 服务器实例 ID"),
          name: stringSchema("任务名称", 1, 80),
          command: stringSchema("不含换行符的服务器控制台命令", 1, 512),
          schedule: scheduleSchema(),
        },
        ["instanceId", "name", "command", "schedule"],
      ),
      outputDescription: "已经持久化的定时任务。",
      examples: [
        {
          instanceId: "server-instance-id",
          name: "每日保存",
          command: "save-all",
          schedule: { kind: "daily", time: "04:00" },
        },
      ],
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      return engine.createTask(parseCreateTaskInput(input));
    },
  );

  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "update",
      title: "修改服务器定时命令",
      description: "修改指定服务器中的任务名称、控制台命令和执行计划，保留任务当前启用状态。",
      inputSchema: objectSchema(
        {
          instanceId: stringSchema("SeaShard 服务器实例 ID"),
          taskId: stringSchema("定时任务 ID"),
          name: stringSchema("任务名称", 1, 80),
          command: stringSchema("不含换行符的服务器控制台命令", 1, 512),
          schedule: scheduleSchema(),
        },
        ["instanceId", "taskId", "name", "command", "schedule"],
      ),
      outputDescription: "修改后的定时任务。",
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      return engine.updateTask(parseUpdateTaskInput(input));
    },
  );

  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "set-enabled",
      title: "启停服务器定时命令",
      description: "启用或停用指定服务器中的一个定时任务。重新启用时会从 Host 当前时间计算下次执行时间。",
      inputSchema: objectSchema(
        {
          instanceId: stringSchema("SeaShard 服务器实例 ID"),
          taskId: stringSchema("定时任务 ID"),
          enabled: { type: "boolean", description: "true 启用，false 停用" },
        },
        ["instanceId", "taskId", "enabled"],
      ),
      outputDescription: "更新后的定时任务。",
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      return engine.setTaskEnabled(parseSetTaskEnabledInput(input));
    },
  );

  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "delete",
      title: "删除服务器定时命令",
      description: "永久删除指定服务器中的一个定时任务。",
      inputSchema: identitySchema(),
      outputDescription: "包含 deleted=true、服务器 ID 和任务 ID。",
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      const identity = parseTaskIdentityInput(input);
      await engine.deleteTask(identity);
      return { deleted: true, ...identity };
    },
  );

  context.agentTool(
    {
      namespace: "scheduled-commands",
      name: "run-now",
      title: "立即执行服务器定时命令",
      description:
        "立即执行指定任务但不改变其后续计划。插件会先验证服务器实例仍存在且进程状态为 running。",
      inputSchema: identitySchema(),
      outputDescription: "本次命令执行的成功或失败结果。",
    },
    async (input, execution) => {
      throwIfCancelled(execution.signal);
      return engine.runTaskNow(parseTaskIdentityInput(input));
    },
  );
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Agent tool call was cancelled");
}

function objectSchema(
  properties: Record<string, JsonValue>,
  required: readonly string[],
): Record<string, JsonValue> {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

function stringSchema(description: string, minimum = 1, maximum = 256): Record<string, JsonValue> {
  return { type: "string", description, minLength: minimum, maxLength: maximum };
}

function identitySchema(): Record<string, JsonValue> {
  return objectSchema(
    {
      instanceId: stringSchema("SeaShard 服务器实例 ID"),
      taskId: stringSchema("定时任务 ID"),
    },
    ["instanceId", "taskId"],
  );
}

function scheduleSchema(): Record<string, JsonValue> {
  const alternatives: JsonValue[] = [
    objectSchema(
      {
        kind: { const: "once" },
        runAt: { type: "string", description: "晚于当前时间的 ISO 8601 时间" },
      },
      ["kind", "runAt"],
    ),
    objectSchema(
      {
        kind: { const: "daily" },
        time: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
      },
      ["kind", "time"],
    ),
    objectSchema(
      {
        kind: { const: "weekly" },
        time: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" },
        weekdays: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "integer", minimum: 0, maximum: 6 },
        },
      },
      ["kind", "time", "weekdays"],
    ),
  ];
  return { oneOf: alternatives };
}

