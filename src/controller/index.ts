import {
  serverInstanceManagerContract,
  serverRuntimeContract,
  type ServerRuntimeService,
} from "@seashard/contracts";
import type { JsonValue, PluginContext } from "@seashard/plugin-sdk";
import { scheduledCommandsContract, scheduledCommandsContractName } from "../shared/contract";
import { registerAgentTools } from "./agent-tools";
import { ScheduledCommandEngine } from "./scheduler";
import { createScheduledCommandsProvider } from "./service";

export const inject = [serverInstanceManagerContract, serverRuntimeContract] as const;
export const provides = [scheduledCommandsContractName] as const;

export async function apply(context: PluginContext, _config: JsonValue): Promise<void> {
  const instances = context.service<{ listForClient(): Promise<readonly { id: string; name: string }[]> }>(
    serverInstanceManagerContract,
  );
  const runtime = context.service<ServerRuntimeService>(serverRuntimeContract);
  const engine = new ScheduledCommandEngine({ storage: context.storage, instances, runtime });
  await engine.initialize();

  context.effect(() => {
    engine.start();
    return () => engine.dispose();
  }, "scheduled command timer");

  context.provide(scheduledCommandsContract, createScheduledCommandsProvider(engine));
  registerAgentTools(context, engine);
  console.log(`[scheduled-commands] Controller active runtime=${context.runtimeId}`);
}
