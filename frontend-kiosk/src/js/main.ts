import { GLOBAL_EVENTS, IdleTimer, StateManager, customLog, initializeGlobalContext } from "@app/frontend-core";

import { CONFIG, type TConfig } from "../../conf/conf";
import { DATA, type TData } from "../../conf/data";
import "../style/main.scss";
import { Contents } from "./contents";
import { resetKioskAuth } from "../lib/firebase";

class Core {
  version = __APP_VERSION__;
  projectName = __PROJECT_NAME__;
  stateManager = new StateManager({ config: CONFIG });
  contents: Contents | null = null;
  idleTimer: IdleTimer | null = null;
  data: TData = DATA;
  config: TConfig = CONFIG;

  constructor() {
    (window as unknown as Record<string, unknown>)[this.projectName] = this;
    initializeGlobalContext<TConfig, TData>({
      stateManager: this.stateManager,
      config: this.config,
      data: this.data,
      globalEvents: GLOBAL_EVENTS,
    });
    this.init();
  }

  init() {
    customLog({ message: `INIT v${this.version}`, component: "CORE" });
    this.contents = new Contents();

    if (this.stateManager.browserInfo.os === "iOS") {
      document.addEventListener("touchstart", () => {}, true);
    }

    this.idleTimer = new IdleTimer({
      timeoutMs: 180_000,
      shouldIdle: () => this.contents?.currentStep !== "idle",
      onIdle: async () => {
        customLog({ message: "Idle timeout reached, resetting kiosk session.", component: "CORE" });
        this.contents?.dispose();
        await resetKioskAuth();
        window.location.reload();
      },
    });
    this.idleTimer.start();
  }
}

new Core();
