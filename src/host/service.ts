import type { JsonValue, ServiceProvider } from "@seashard/plugin-sdk";
import {
  parseCreateTaskInput,
  parseListTasksInput,
  parseSetTaskEnabledInput,
  parseTaskIdentityInput,
  parseUpdateTaskInput,
} from "../shared/validation";
import type { ScheduledCommandEngine } from "./scheduler";

export function createScheduledCommandsProvider(engine: ScheduledCommandEngine): ServiceProvider {
  return {
    listTasks(input: JsonValue) {
      return engine.listTasks(parseListTasksInput(input));
    },
    createTask(input: JsonValue) {
      return engine.createTask(parseCreateTaskInput(input));
    },
    updateTask(input: JsonValue) {
      return engine.updateTask(parseUpdateTaskInput(input));
    },
    deleteTask(input: JsonValue) {
      return engine.deleteTask(parseTaskIdentityInput(input));
    },
    setTaskEnabled(input: JsonValue) {
      return engine.setTaskEnabled(parseSetTaskEnabledInput(input));
    },
    runTaskNow(input: JsonValue) {
      return engine.runTaskNow(parseTaskIdentityInput(input));
    },
  };
}
