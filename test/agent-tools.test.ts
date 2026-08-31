import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentToolDefinition,
  AgentToolHandler,
  PluginContext,
} from "@seashard/plugin-sdk";
import { registerAgentTools } from "../src/controller/agent-tools";
import type { ScheduledCommandEngine } from "../src/controller/scheduler";

interface RegisteredTool {
  definition: AgentToolDefinition;
  execute: AgentToolHandler;
}

test("registers the complete scheduled-command Agent surface", async () => {
  const registered: RegisteredTool[] = [];
  const context = {
    agentTool(definition: AgentToolDefinition, execute: AgentToolHandler) {
      registered.push({ definition, execute });
      return `${definition.namespace}_${definition.name}`;
    },
  } as unknown as PluginContext;
  let listedInstanceId = "";
  const engine = {
    async listTasks(input: { instanceId: string }) {
      listedInstanceId = input.instanceId;
      return {
        instance: { id: input.instanceId, name: "Test Server" },
        tasks: [],
        scheduleTimeZone: "UTC",
        generatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
  } as unknown as ScheduledCommandEngine;

  registerAgentTools(context, engine);

  assert.deepEqual(
    registered.map(({ definition }) => `${definition.namespace}_${definition.name}`),
    [
      "scheduled-commands_list",
      "scheduled-commands_create",
      "scheduled-commands_update",
      "scheduled-commands_set-enabled",
      "scheduled-commands_delete",
      "scheduled-commands_run-now",
    ],
  );
  assert.deepEqual(
    registered.map(({ definition }) => definition.confirmationLevel ?? 0),
    [0, 2, 2, 2, 1, 2],
  );
  for (const { definition } of registered) {
    assert.equal(definition.inputSchema.additionalProperties, false);
  }

  const listTool = registered[0];
  const output = await listTool.execute({ instanceId: "server-a" }, {});
  assert.equal(listedInstanceId, "server-a");
  assert.deepEqual(output, {
    instance: { id: "server-a", name: "Test Server" },
    tasks: [],
    scheduleTimeZone: "UTC",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    async () => {
      await listTool.execute({ instanceId: "server-a" }, { signal: controller.signal });
    },
    /cancelled/,
  );
});
