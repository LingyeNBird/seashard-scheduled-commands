import { defineClientUiModule } from "@seashard/ui-sdk";
import {
  scheduledCommandsContract,
  type ScheduledCommandsService,
} from "../shared/contract";
import { createScheduledCommandsPage } from "./page";
import { scheduledCommandsStyles } from "./styles";

const clientModule = defineClientUiModule({
  apply(context) {
    const service = context.service<ScheduledCommandsService>(scheduledCommandsContract);
    const page = createScheduledCommandsPage(service, context.serverSelection);

    context.effect(() => {
      const style = document.createElement("style");
      style.dataset.seashardScheduledCommands = context.entry.runtimeId;
      style.textContent = scheduledCommandsStyles;
      document.head.append(style);
      return () => style.remove();
    }, "scheduled commands styles");

    context.slots.register(
      {
        name: "navigation.page",
        id: "seashard-plugin.scheduled-commands",
        path: "/server/scheduled-commands",
        label: "定时任务",
        description: "为当前服务器安排延时、每日和每周命令",
        placement: "server",
        order: 100,
      },
      page,
    );
  },
});

export const apply = clientModule.apply;
