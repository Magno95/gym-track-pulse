import { customLog, eventCatcher, getGlobalContext, type Debug, type GlobalEvents, type StateManager } from "@app/frontend-core";

import type { TConfig } from "../../conf/conf";
import type { TData } from "../../conf/data";
import { getInitialLang, kioskCopy, resolveCopy, type LocalizedText, type SupportedLang } from "../copy/kiosk";
import { CameraCapture } from "./components/CameraCapture";
import { Instruction } from "./components/Instruction";

type KioskStep = "idle" | "privacy-policy" | "instructions" | "camera-capture";
const kioskSteps = ["idle", "privacy-policy", "instructions", "camera-capture"] as const;

export class Contents {
  componentName = "Contents";

  stateManager: StateManager;
  globalEvents: GlobalEvents;
  debugger: Debug;
  data: TData;
  config: TConfig;
  container = document.querySelector("main") as HTMLElement;

  currentStep: KioskStep = "idle";
  initialStep: KioskStep = "idle";
  lang: SupportedLang = "en";
  cameraCapture: CameraCapture | null = null;
  instruction: Instruction | null = null;
  screens = new Map<KioskStep, HTMLElement>();

  constructor() {
    const context = getGlobalContext<TConfig, TData>();
    this.stateManager = context.stateManager;
    this.debugger = this.stateManager.debug;
    this.data = context.data;
    this.config = context.config;
    this.globalEvents = context.globalEvents;
    this.init();
  }

  init() {
    this.checkParams();
    this.setElements();
    this.fillCopy();
    this.setEvents();
    this.setStep(this.initialStep);

    if (this.debugger.active) {
      this.debug();
    }

    this.container.dataset.loading = "false";
  }

  setElements() {
    this.screens = new Map<KioskStep, HTMLElement>(
      ["idle", "privacy-policy", "instructions", "camera-capture"].map((step) => {
        const screen = this.container.querySelector<HTMLElement>(`#${step}`);

        if (!screen) {
          throw new Error(`Missing #${step} section.`);
        }

        return [step as KioskStep, screen];
      })
    );

    const instructions = this.screens.get("instructions");

    if (!instructions) {
      throw new Error("Missing instructions section.");
    }

    this.instruction = new Instruction({ container: instructions });
  }

  setEvents() {
    eventCatcher(this.globalEvents.TEST_EVENT, () => customLog({ message: "Received TEST_EVENT", component: this.componentName }));
    eventCatcher(this.globalEvents.KIOSK_BACK_TO_INSTRUCTIONS, this.handleBackToInstructions);
    eventCatcher(this.globalEvents.KIOSK_RESET_TO_IDLE, this.handleResetToIdle);
    this.container.addEventListener("click", this.handleNavigationClick);
  }

  dispose() {
    this.destroyCameraCapture();
  }

  checkParams() {
    this.lang = getInitialLang();
    this.initialStep = this.getInitialStep();
    document.documentElement.lang = this.lang;
    this.container.dataset.lang = this.lang;
  }

  debug() {
    const fold = this.debugger.GUI?.addFolder(this.componentName);

    if (fold) {
      fold.add(this, "currentStep").name("Current Step").listen().disable();
      fold.add(this, "lang").name("Language").listen().disable();
    }
  }

  private handleNavigationClick = (event: MouseEvent) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const step = target.closest<HTMLElement>("[data-next-step]")?.dataset.nextStep;

    if (!this.isKioskStep(step)) {
      return;
    }

    this.setStep(step);
  };

  private handleBackToInstructions = () => {
    this.destroyCameraCapture();
    this.currentStep = "instructions";
    this.container.dataset.step = "instructions";
    this.instruction?.showComplete();
  };

  private handleResetToIdle = () => {
    this.setStep("idle");
  };

  private setStep(step: KioskStep) {
    const previousStep = this.currentStep;
    this.destroyCameraCapture();
    this.currentStep = step;

    if (step === "instructions") {
      this.instruction?.prepareEnter();
      CameraCapture.preloadFaceDetection();
    }

    this.container.dataset.step = step;

    if (step === "instructions") {
      this.instruction?.enter();
    } else if (previousStep === "instructions") {
      this.instruction?.leave();
    }

    if (step === "camera-capture") {
      const cameraScreen = this.screens.get("camera-capture");

      if (!cameraScreen) {
        throw new Error("Missing camera capture section.");
      }

      this.cameraCapture = new CameraCapture({ container: cameraScreen, lang: this.lang });
      this.cameraCapture.requestCapture();
    }
  }

  private destroyCameraCapture() {
    this.cameraCapture?.destroy();
    this.cameraCapture = null;
  }

  private fillCopy() {
    for (const element of this.container.querySelectorAll<HTMLElement>("[data-copy]")) {
      const key = element.dataset.copy;

      if (!key) {
        continue;
      }

      element.innerHTML = this.copyByPath(key);
    }

    for (const element of this.container.querySelectorAll<HTMLElement>("[data-copy-attr]")) {
      const copyAttr = element.dataset.copyAttr;

      if (!copyAttr) {
        continue;
      }

      const [attribute, key] = copyAttr.split(":");

      if (!attribute || !key) {
        continue;
      }

      element.setAttribute(attribute, this.copyByPath(key));
    }
  }

  private copyByPath(path: string) {
    const entry = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      return (current as Record<string, unknown>)[key];
    }, kioskCopy);

    if (!this.isLocalizedText(entry)) {
      throw new Error(`Invalid copy key: ${path}`);
    }

    return this.copy(entry);
  }

  private isLocalizedText(value: unknown): value is LocalizedText {
    return Boolean(value && typeof value === "object" && "en" in value);
  }

  private copy(entry: LocalizedText) {
    return resolveCopy(entry, this.lang);
  }

  private isKioskStep(step: string | undefined): step is KioskStep {
    return kioskSteps.includes(step as KioskStep);
  }

  private getInitialStep(): KioskStep {
    const requestedStep = new URLSearchParams(window.location.search).get("step");

    if (requestedStep && this.isKioskStep(requestedStep)) {
      return requestedStep;
    }

    return "idle";
  }
}
