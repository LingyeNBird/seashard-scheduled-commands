import type { ServerRuntimeService } from "@seashard/contracts";
import type { JsonValue, PluginStorage } from "@seashard/plugin-sdk";
import type {
  CreateTaskInput,
  ListTasksInput,
  ScheduledCommandTask,
  SchedulerInstance,
  SchedulerSnapshot,
  SetTaskEnabledInput,
  TaskExecution,
  TaskIdentityInput,
  UpdateTaskInput,
} from "../shared/contract";
import { calculateFollowingRunAt, calculateInitialRunAt } from "../shared/schedule";
import { parseSchedule, requireRecord, schedulerLimits } from "../shared/validation";

const storageKey = "scheduler-state";
const maximumTimerDelayMs = 2_147_000_000;

type ServerInstanceCatalogService = {
  listForClient(): Promise<readonly SchedulerInstance[]>;
};

type SchedulerDependencies = {
  readonly storage: PluginStorage;
  readonly instances: ServerInstanceCatalogService;
  readonly runtime: Pick<ServerRuntimeService, "get" | "sendCommand">;
  readonly now?: () => Date;
  readonly createId?: () => string;
};

type PersistedState = {
  version: 1;
  tasks: ScheduledCommandTask[];
};

export class ScheduledCommandEngine {
  private tasks: ScheduledCommandTask[] = [];
  private storageRevision: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private disposed = false;
  private started = false;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly dependencies: SchedulerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
  }

  async initialize(): Promise<void> {
    const document = await this.dependencies.storage.get(storageKey);
    if (!document) return;

    const state = parsePersistedState(document.value);
    this.tasks = [...state.tasks];
    this.storageRevision = document.revision;

    let changed = false;
    this.tasks = this.tasks.map((task) => {
      if (task.lastExecution?.status !== "running") return task;
      changed = true;
      return {
        ...task,
        lastExecution: {
          status: "failed",
          startedAt: task.lastExecution.startedAt,
          finishedAt: this.now().toISOString(),
          error: "插件上次停止前未完成该次执行",
        },
      };
    });
    if (changed) await this.persist();
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.scheduleNextTimer();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.operationQueue;
  }

  listTasks(input: ListTasksInput): Promise<SchedulerSnapshot> {
    return this.enqueue(async () => {
      const instance = await this.requireInstance(input.instanceId);
      return {
        instance,
        tasks: this.sortedTasks(input.instanceId),
        hostTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
        generatedAt: this.now().toISOString(),
      };
    });
  }

  createTask(input: CreateTaskInput): Promise<ScheduledCommandTask> {
    return this.enqueue(async () => {
      await this.requireInstance(input.instanceId);
      if (this.tasks.length >= schedulerLimits.maximumTasks) {
        throw new RangeError(`定时任务总数不能超过 ${schedulerLimits.maximumTasks}`);
      }
      const now = this.now();
      const timestamp = now.toISOString();
      const task: ScheduledCommandTask = {
        id: this.createId(),
        instanceId: input.instanceId,
        name: input.name,
        command: input.command,
        schedule: input.schedule,
        enabled: true,
        nextRunAt: calculateInitialRunAt(input.schedule, now),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.tasks.push(task);
      await this.persistAndReschedule();
      return task;
    });
  }

  updateTask(input: UpdateTaskInput): Promise<ScheduledCommandTask> {
    return this.enqueue(async () => {
      await this.requireInstance(input.instanceId);
      const { index, task } = this.requireTask(input);
      const now = this.now();
      const updated: ScheduledCommandTask = {
        ...task,
        name: input.name,
        command: input.command,
        schedule: input.schedule,
        nextRunAt: task.enabled ? calculateInitialRunAt(input.schedule, now) : undefined,
        updatedAt: now.toISOString(),
      };
      this.tasks[index] = removeUndefinedNextRun(updated);
      await this.persistAndReschedule();
      return this.tasks[index];
    });
  }

  deleteTask(input: TaskIdentityInput): Promise<void> {
    return this.enqueue(async () => {
      await this.requireInstance(input.instanceId);
      const { index } = this.requireTask(input);
      this.tasks.splice(index, 1);
      await this.persistAndReschedule();
    });
  }

  setTaskEnabled(input: SetTaskEnabledInput): Promise<ScheduledCommandTask> {
    return this.enqueue(async () => {
      await this.requireInstance(input.instanceId);
      const { index, task } = this.requireTask(input);
      if (task.enabled === input.enabled) return task;

      const now = this.now();
      const updated: ScheduledCommandTask = input.enabled
        ? {
            ...task,
            enabled: true,
            nextRunAt: calculateInitialRunAt(task.schedule, now),
            updatedAt: now.toISOString(),
          }
        : removeNextRun({ ...task, enabled: false, updatedAt: now.toISOString() });
      this.tasks[index] = updated;
      await this.persistAndReschedule();
      return updated;
    });
  }

  runTaskNow(input: TaskIdentityInput): Promise<TaskExecution> {
    return this.enqueue(async () => {
      this.requireTask(input);
      const execution = await this.executeTask(input.taskId, false);
      this.scheduleNextTimer();
      return execution;
    });
  }

  processDueTasks(): Promise<void> {
    return this.enqueue(async () => {
      const dueIds = this.tasks
        .filter((task) => task.enabled && isDue(task, this.now()))
        .sort((left, right) => String(left.nextRunAt).localeCompare(String(right.nextRunAt)))
        .map((task) => task.id);

      for (const taskId of dueIds) {
        if (this.disposed) break;
        await this.executeTask(taskId, true);
      }
      this.scheduleNextTimer();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("定时任务插件正在停止"));
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async executeTask(taskId: string, scheduled: boolean): Promise<TaskExecution> {
    const index = this.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) throw new Error(`定时任务不存在: ${taskId}`);
    const task = this.tasks[index];
    const startedAt = this.now();
    const runningExecution: TaskExecution = {
      status: "running",
      startedAt: startedAt.toISOString(),
    };

    const prepared = scheduled ? advanceScheduledTask(task, startedAt) : task;
    this.tasks[index] = { ...prepared, lastExecution: runningExecution, updatedAt: startedAt.toISOString() };
    await this.persist();

    let completed: TaskExecution;
    try {
      await this.requireInstance(task.instanceId);
      const runtime = await this.dependencies.runtime.get(task.instanceId);
      if (runtime.state !== "running") {
        throw new Error(`服务器当前状态为 ${runtime.state}，只有 running 状态可以发送命令`);
      }
      await this.dependencies.runtime.sendCommand(task.instanceId, task.command);
      completed = {
        status: "succeeded",
        startedAt: runningExecution.startedAt,
        finishedAt: this.now().toISOString(),
      };
      console.log(`[scheduled-commands] sent task=${task.id} instance=${task.instanceId}`);
    } catch (error) {
      completed = {
        status: "failed",
        startedAt: runningExecution.startedAt,
        finishedAt: this.now().toISOString(),
        error: errorMessage(error),
      };
      console.error(
        `[scheduled-commands] failed task=${task.id} instance=${task.instanceId}: ${completed.error}`,
      );
    }

    const currentIndex = this.tasks.findIndex((candidate) => candidate.id === task.id);
    if (currentIndex >= 0) {
      this.tasks[currentIndex] = {
        ...this.tasks[currentIndex],
        lastExecution: completed,
        updatedAt: completed.finishedAt ?? this.now().toISOString(),
      };
      await this.persist();
    }
    return completed;
  }

  private requireTask(input: TaskIdentityInput): { index: number; task: ScheduledCommandTask } {
    const index = this.tasks.findIndex(
      (task) => task.id === input.taskId && task.instanceId === input.instanceId,
    );
    if (index < 0) throw new Error(`当前服务器中不存在定时任务: ${input.taskId}`);
    return { index, task: this.tasks[index] };
  }

  private async requireInstance(instanceId: string): Promise<SchedulerInstance> {
    const instances = await this.dependencies.instances.listForClient();
    const instance = instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error(`服务器实例不存在或已被删除: ${instanceId}`);
    return { id: instance.id, name: instance.name };
  }

  private sortedTasks(instanceId: string): ScheduledCommandTask[] {
    return this.tasks
      .filter((task) => task.instanceId === instanceId)
      .sort((left, right) => {
        if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
        const leftTime = left.nextRunAt ?? "9999";
        const rightTime = right.nextRunAt ?? "9999";
        return leftTime.localeCompare(rightTime) || left.createdAt.localeCompare(right.createdAt);
      });
  }

  private async persistAndReschedule(): Promise<void> {
    await this.persist();
    this.scheduleNextTimer();
  }

  private async persist(): Promise<void> {
    const state: PersistedState = { version: 1, tasks: this.tasks };
    const saved = await this.dependencies.storage.put(storageKey, state, {
      expectedRevision: this.storageRevision,
    });
    this.storageRevision = saved.revision;
  }

  private scheduleNextTimer(): void {
    if (!this.started || this.disposed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;

    const nextTimestamp = this.tasks
      .filter((task) => task.enabled && task.nextRunAt)
      .map((task) => new Date(task.nextRunAt as string).getTime())
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (nextTimestamp === undefined) return;

    const delay = Math.min(maximumTimerDelayMs, Math.max(0, nextTimestamp - this.now().getTime()));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.processDueTasks().catch((error) => {
        console.error(`[scheduled-commands] scheduler tick failed: ${errorMessage(error)}`);
        this.scheduleNextTimer();
      });
    }, delay);
  }
}

function advanceScheduledTask(task: ScheduledCommandTask, startedAt: Date): ScheduledCommandTask {
  const nextRunAt = calculateFollowingRunAt(task.schedule, startedAt);
  if (!nextRunAt) {
    return removeNextRun({ ...task, enabled: false, updatedAt: startedAt.toISOString() });
  }
  return { ...task, nextRunAt, updatedAt: startedAt.toISOString() };
}

function removeNextRun(task: ScheduledCommandTask): ScheduledCommandTask {
  const { nextRunAt: _nextRunAt, ...withoutNextRun } = task;
  return withoutNextRun;
}

function removeUndefinedNextRun(task: ScheduledCommandTask): ScheduledCommandTask {
  return task.nextRunAt === undefined ? removeNextRun(task) : task;
}

function isDue(task: ScheduledCommandTask, now: Date): boolean {
  return Boolean(task.nextRunAt && new Date(task.nextRunAt).getTime() <= now.getTime());
}

function parsePersistedState(value: JsonValue): PersistedState {
  const state = requireRecord(value, "scheduler-state");
  if (state.version !== 1 || !Array.isArray(state.tasks)) {
    throw new TypeError("scheduler-state 版本或任务列表无效");
  }
  return { version: 1, tasks: state.tasks.map((task) => parsePersistedTask(task)) };
}

function parsePersistedTask(value: JsonValue): ScheduledCommandTask {
  const task = requireRecord(value, "stored task");
  if (
    typeof task.id !== "string" ||
    typeof task.instanceId !== "string" ||
    typeof task.name !== "string" ||
    typeof task.command !== "string" ||
    typeof task.enabled !== "boolean" ||
    typeof task.createdAt !== "string" ||
    typeof task.updatedAt !== "string"
  ) {
    throw new TypeError("stored task 字段无效");
  }
  const parsed: ScheduledCommandTask = {
    id: task.id,
    instanceId: task.instanceId,
    name: task.name,
    command: task.command,
    schedule: parseSchedule(task.schedule),
    enabled: task.enabled,
    createdAt: requireIsoTimestamp(task.createdAt, "createdAt"),
    updatedAt: requireIsoTimestamp(task.updatedAt, "updatedAt"),
  };
  if (typeof task.nextRunAt === "string") {
    parsed.nextRunAt = requireIsoTimestamp(task.nextRunAt, "nextRunAt");
  }
  if (task.lastExecution !== undefined) {
    parsed.lastExecution = parseExecution(task.lastExecution);
  }
  return parsed;
}

function parseExecution(value: JsonValue): TaskExecution {
  const execution = requireRecord(value, "lastExecution");
  if (
    execution.status !== "running" &&
    execution.status !== "succeeded" &&
    execution.status !== "failed"
  ) {
    throw new TypeError("lastExecution.status 无效");
  }
  const parsed: TaskExecution = {
    status: execution.status,
    startedAt: requireIsoTimestamp(execution.startedAt, "lastExecution.startedAt"),
  };
  if (typeof execution.finishedAt === "string") {
    parsed.finishedAt = requireIsoTimestamp(execution.finishedAt, "lastExecution.finishedAt");
  }
  if (typeof execution.error === "string") parsed.error = execution.error;
  return parsed;
}

function requireIsoTimestamp(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) {
    throw new TypeError(`${label} 不是有效 ISO 时间`);
  }
  return new Date(value).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
