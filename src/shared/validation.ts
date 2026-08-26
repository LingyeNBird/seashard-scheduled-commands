import type { JsonValue } from "@seashard/plugin-sdk";
import type {
  CommandSchedule,
  CreateTaskInput,
  ListTasksInput,
  SetTaskEnabledInput,
  TaskIdentityInput,
  UpdateTaskInput,
} from "./contract";
import { isValidLocalTime } from "./schedule";

export const schedulerLimits = {
  taskNameLength: 80,
  commandLength: 512,
  instanceIdLength: 256,
  taskIdLength: 128,
  maximumTasks: 500,
} as const;

type JsonRecord = Record<string, JsonValue>;

export function parseListTasksInput(value: JsonValue): ListTasksInput {
  const input = requireRecord(value, "input");
  return { instanceId: requireIdentifier(input.instanceId, "instanceId", schedulerLimits.instanceIdLength) };
}

export function parseCreateTaskInput(value: JsonValue): CreateTaskInput {
  const input = requireRecord(value, "input");
  return {
    instanceId: requireIdentifier(input.instanceId, "instanceId", schedulerLimits.instanceIdLength),
    name: requireTrimmedString(input.name, "name", schedulerLimits.taskNameLength),
    command: requireCommand(input.command),
    schedule: parseSchedule(input.schedule),
  };
}

export function parseUpdateTaskInput(value: JsonValue): UpdateTaskInput {
  const input = requireRecord(value, "input");
  return {
    ...parseCreateTaskInput(value),
    taskId: requireIdentifier(input.taskId, "taskId", schedulerLimits.taskIdLength),
  };
}

export function parseTaskIdentityInput(value: JsonValue): TaskIdentityInput {
  const input = requireRecord(value, "input");
  return {
    instanceId: requireIdentifier(input.instanceId, "instanceId", schedulerLimits.instanceIdLength),
    taskId: requireIdentifier(input.taskId, "taskId", schedulerLimits.taskIdLength),
  };
}

export function parseSetTaskEnabledInput(value: JsonValue): SetTaskEnabledInput {
  const input = requireRecord(value, "input");
  if (typeof input.enabled !== "boolean") throw new TypeError("enabled 必须是布尔值");
  return { ...parseTaskIdentityInput(value), enabled: input.enabled };
}

export function parseSchedule(value: JsonValue | undefined): CommandSchedule {
  const schedule = requireRecord(value, "schedule");
  if (schedule.kind === "once") {
    if (typeof schedule.runAt !== "string") throw new TypeError("schedule.runAt 必须是 ISO 时间字符串");
    const timestamp = new Date(schedule.runAt);
    if (!Number.isFinite(timestamp.getTime())) throw new TypeError("schedule.runAt 不是有效时间");
    return { kind: "once", runAt: timestamp.toISOString() };
  }
  if (schedule.kind === "daily") {
    const time = requireLocalTime(schedule.time, "schedule.time");
    return { kind: "daily", time };
  }
  if (schedule.kind === "weekly") {
    const time = requireLocalTime(schedule.time, "schedule.time");
    if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0) {
      throw new TypeError("schedule.weekdays 必须包含至少一个星期值");
    }
    const weekdays = [...new Set(schedule.weekdays.map((day) => requireWeekday(day)))].sort(
      (left, right) => left - right,
    );
    return { kind: "weekly", time, weekdays };
  }
  throw new TypeError("schedule.kind 必须是 once、daily 或 weekly");
}

export function requireRecord(value: JsonValue | undefined, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} 必须是对象`);
  }
  return value;
}

export function requireIdentifier(value: JsonValue | undefined, label: string, maximum: number): string {
  return requireTrimmedString(value, label, maximum);
}

export function requireTrimmedString(
  value: JsonValue | undefined,
  label: string,
  maximum: number,
): string {
  if (typeof value !== "string") throw new TypeError(`${label} 必须是字符串`);
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${label} 不能为空`);
  if (normalized.length > maximum) throw new RangeError(`${label} 最长为 ${maximum} 个字符`);
  return normalized;
}

function requireCommand(value: JsonValue | undefined): string {
  const command = requireTrimmedString(value, "command", schedulerLimits.commandLength);
  if (/[\r\n\0]/u.test(command)) throw new TypeError("command 不能包含换行符或空字符");
  return command;
}

function requireLocalTime(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || !isValidLocalTime(value)) {
    throw new TypeError(`${label} 必须使用 HH:mm 格式`);
  }
  return value;
}

function requireWeekday(value: JsonValue): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0 || value > 6) {
    throw new TypeError("星期值必须是 0 到 6 的整数");
  }
  return value;
}
