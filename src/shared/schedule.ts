import type { CommandSchedule } from "./contract";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export function isValidLocalTime(value: string): boolean {
  return timePattern.test(value);
}

export function calculateNextRunAt(schedule: CommandSchedule, after: Date): string | undefined {
  if (schedule.kind === "once") {
    const runAt = new Date(schedule.runAt);
    return Number.isFinite(runAt.getTime()) && runAt.getTime() > after.getTime()
      ? runAt.toISOString()
      : undefined;
  }

  const [hour, minute] = schedule.time.split(":").map(Number);
  if (schedule.kind === "daily") {
    const candidate = new Date(after);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= after.getTime()) candidate.setDate(candidate.getDate() + 1);
    return candidate.toISOString();
  }

  const weekdays = new Set(schedule.weekdays);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(after);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (weekdays.has(candidate.getDay()) && candidate.getTime() > after.getTime()) {
      return candidate.toISOString();
    }
  }
  return undefined;
}

export function calculateInitialRunAt(schedule: CommandSchedule, now: Date): string {
  if (schedule.kind === "once") {
    const runAt = new Date(schedule.runAt);
    if (!Number.isFinite(runAt.getTime()) || runAt.getTime() <= now.getTime()) {
      throw new RangeError("单次任务的执行时间必须晚于当前时间");
    }
    return runAt.toISOString();
  }

  const nextRunAt = calculateNextRunAt(schedule, now);
  if (!nextRunAt) throw new RangeError("无法计算任务的下次执行时间");
  return nextRunAt;
}

export function calculateFollowingRunAt(schedule: CommandSchedule, startedAt: Date): string | undefined {
  return schedule.kind === "once" ? undefined : calculateNextRunAt(schedule, startedAt);
}
