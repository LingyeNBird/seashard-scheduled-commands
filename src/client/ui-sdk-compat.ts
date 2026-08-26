import type { Disposable } from "@seashard/plugin-sdk";
import type { Component } from "vue";

export interface ClientServerSelection {
  getCurrentInstanceId(): string | undefined;
  subscribe(listener: (instanceId: string | undefined) => void): Disposable;
}

interface ServerNavigationPageRegistration {
  readonly name: "navigation.page";
  readonly id: string;
  readonly path: `/${string}`;
  readonly label: string;
  readonly description?: string;
  readonly placement: "server";
  readonly order?: number;
}

interface CurrentClientUiSlots {
  register(options: ServerNavigationPageRegistration, component: Component): Disposable;
}

// The public 0.1.0 package predates these additive types; current SeaShard exposes both at runtime.
declare module "@seashard/ui-sdk" {
  interface ClientUiContext {
    readonly slots: CurrentClientUiSlots;
    readonly serverSelection: ClientServerSelection;
  }
}
