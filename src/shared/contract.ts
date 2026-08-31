import { defineServiceContract } from "@seashard/plugin-sdk";

export const scheduledCommandsContractName = "seashard-plugin.scheduled-commands";

export type OnceSchedule = {
  kind: "once";
  runAt: string;
};

export type DailySchedule = {
  kind: "daily";
  time: string;
};

export type WeeklySchedule = {
  kind: "weekly";
  weekdays: number[];
  time: string;
};

export type CommandSchedule = OnceSchedule | DailySchedule | WeeklySchedule;
export type TaskExecutionStatus = "running" | "succeeded" | "failed";

export type TaskExecution = {
  status: TaskExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export type ScheduledCommandTask = {
  id: string;
  instanceId: string;
  name: string;
  command: string;
  schedule: CommandSchedule;
  enabled: boolean;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
  lastExecution?: TaskExecution;
};

export type SchedulerInstance = {
  id: string;
  name: string;
};

export type SchedulerSnapshot = {
  instance: SchedulerInstance;
  tasks: ScheduledCommandTask[];
  scheduleTimeZone: string;
  generatedAt: string;
};

export type ListTasksInput = {
  instanceId: string;
};

export type CreateTaskInput = {
  instanceId: string;
  name: string;
  command: string;
  schedule: CommandSchedule;
};

export type UpdateTaskInput = CreateTaskInput & {
  taskId: string;
};

export type TaskIdentityInput = {
  instanceId: string;
  taskId: string;
};

export type SetTaskEnabledInput = TaskIdentityInput & {
  enabled: boolean;
};

export interface ScheduledCommandsService {
  listTasks(input: ListTasksInput): Promise<SchedulerSnapshot>;
  createTask(input: CreateTaskInput): Promise<ScheduledCommandTask>;
  updateTask(input: UpdateTaskInput): Promise<ScheduledCommandTask>;
  deleteTask(input: TaskIdentityInput): Promise<void>;
  setTaskEnabled(input: SetTaskEnabledInput): Promise<ScheduledCommandTask>;
  runTaskNow(input: TaskIdentityInput): Promise<TaskExecution>;
}

export const scheduledCommandsContract = defineServiceContract<ScheduledCommandsService>(
  scheduledCommandsContractName,
);
