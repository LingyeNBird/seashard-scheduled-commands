import assert from "node:assert/strict";
import test from "node:test";
import type {
  JsonValue,
  PluginStorage,
  PluginStorageDeleteOptions,
  PluginStoragePutOptions,
  PluginStoredDocument,
} from "@seashard/plugin-sdk";
import { ScheduledCommandEngine } from "../src/controller/scheduler";

class MemoryStorage implements PluginStorage {
  private document: PluginStoredDocument | undefined;

  async get(_key: string): Promise<PluginStoredDocument | undefined> {
    return this.document ? structuredClone(this.document) : undefined;
  }

  async put(
    _key: string,
    value: JsonValue,
    options?: PluginStoragePutOptions,
  ): Promise<PluginStoredDocument> {
    const currentRevision = this.document?.revision;
    if (options?.expectedRevision === null && this.document) throw new Error("revision conflict");
    if (
      typeof options?.expectedRevision === "number" &&
      options.expectedRevision !== currentRevision
    ) {
      throw new Error("revision conflict");
    }
    this.document = {
      value: structuredClone(value),
      revision: (currentRevision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    return structuredClone(this.document);
  }

  async delete(_key: string, _options?: PluginStorageDeleteOptions): Promise<boolean> {
    const existed = this.document !== undefined;
    this.document = undefined;
    return existed;
  }
}

test("due one-time tasks validate the instance and send exactly one command", async () => {
  let now = new Date("2026-08-26T10:00:00.000Z");
  const sent: Array<{ instanceId: string; command: string }> = [];
  let instanceChecks = 0;
  const engine = new ScheduledCommandEngine({
    storage: new MemoryStorage(),
    now: () => new Date(now),
    createId: () => "task-1",
    instances: {
      async listForClient() {
        instanceChecks += 1;
        return [{ id: "server-a", name: "测试服" }];
      },
    },
    runtime: {
      async get(instanceId) {
        return { instanceId, state: "running" };
      },
      async sendCommand(instanceId, command) {
        sent.push({ instanceId, command });
      },
    },
  });
  await engine.initialize();
  await engine.createTask({
    instanceId: "server-a",
    name: "延时广播",
    command: "say hello",
    schedule: { kind: "once", runAt: "2026-08-26T10:01:00.000Z" },
  });

  now = new Date("2026-08-26T10:01:01.000Z");
  await engine.processDueTasks();
  await engine.processDueTasks();

  assert.deepEqual(sent, [{ instanceId: "server-a", command: "say hello" }]);
  assert.ok(instanceChecks >= 2);
  const snapshot = await engine.listTasks({ instanceId: "server-a" });
  assert.equal(snapshot.tasks[0]?.enabled, false);
  assert.equal(snapshot.tasks[0]?.lastExecution?.status, "succeeded");
  await engine.dispose();
});

test("manual execution reports a stopped server without sending", async () => {
  const sent: string[] = [];
  const engine = new ScheduledCommandEngine({
    storage: new MemoryStorage(),
    now: () => new Date("2026-08-26T10:00:00.000Z"),
    createId: () => "task-2",
    instances: {
      async listForClient() {
        return [{ id: "server-a", name: "测试服" }];
      },
    },
    runtime: {
      async get(instanceId) {
        return { instanceId, state: "stopped" };
      },
      async sendCommand(_instanceId, command) {
        sent.push(command);
      },
    },
  });
  await engine.initialize();
  const task = await engine.createTask({
    instanceId: "server-a",
    name: "每日保存",
    command: "save-all",
    schedule: { kind: "daily", time: "23:00" },
  });
  const result = await engine.runTaskNow({ instanceId: "server-a", taskId: task.id });

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /stopped/u);
  assert.deepEqual(sent, []);
  await engine.dispose();
});

test("task creation rejects unknown server instances", async () => {
  const engine = new ScheduledCommandEngine({
    storage: new MemoryStorage(),
    instances: { async listForClient() { return []; } },
    runtime: {
      async get(instanceId) { return { instanceId, state: "running" }; },
      async sendCommand() {},
    },
  });
  await engine.initialize();
  await assert.rejects(
    engine.createTask({
      instanceId: "missing",
      name: "无效任务",
      command: "say no",
      schedule: { kind: "daily", time: "12:00" },
    }),
    /不存在或已被删除/u,
  );
  await engine.dispose();
});
