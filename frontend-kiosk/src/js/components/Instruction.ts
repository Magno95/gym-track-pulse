import { gsap } from "gsap";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light";

type InstructionOptions = {
  container: HTMLElement;
  stopDelayMs?: number;
};

type InstructionPlayer = {
  animation: AnimationItem;
};

export class Instruction {
  componentName = "Instruction";

  container: HTMLElement;
  step1: HTMLElement | null = null;
  step2: HTMLElement | null = null;
  actions: HTMLElement | null = null;
  actionButtons: HTMLElement[] = [];
  players: InstructionPlayer[] = [];
  stopDelayMs: number;
  stopTimeout: number | null = null;
  secondLottieStartTimeout: number | null = null;
  timeline: gsap.core.Timeline | null = null;
  entryDelaySeconds = 1;
  step1FinalY = -345;
  step2FinalY = -48;
  actionsFinalY = 150;
  step1RevealDurationSeconds = 0.8;
  step1HoldDurationSeconds = 0.34;
  step2EnterOffsetSeconds = 0.6;

  constructor({ container, stopDelayMs = 800 }: InstructionOptions) {
    this.container = container;
    this.stopDelayMs = stopDelayMs;
    this.init();
  }

  init() {
    this.setElements();
    this.setAnimationState("initial");
    this.players = [...this.container.querySelectorAll<HTMLElement>("[data-instruction-lottie]")].map((element) => {
      const path = element.dataset.lottiePath;

      if (!path) {
        throw new Error("Missing data-lottie-path on instruction lottie.");
      }

      return {
        animation: lottie.loadAnimation({
          container: element,
          path,
          renderer: "svg",
          loop: true,
          autoplay: false,
          rendererSettings: {
            preserveAspectRatio: "xMidYMid meet",
          },
        }),
      };
    });
  }

  enter() {
    this.clearStopTimeout();
    this.clearSecondLottieStartTimeout();
    this.setAnimationState("initial");
    this.playEnterLotties();

    if (this.prefersReducedMotion()) {
      this.playAllLotties();
      this.setAnimationState("complete");
      return;
    }

    this.timeline?.kill();
    this.timeline = this.createTimeline();
    this.timeline.restart();
  }

  showComplete() {
    this.clearStopTimeout();
    this.clearSecondLottieStartTimeout();
    this.timeline?.kill();
    this.timeline = null;
    this.playAllLotties();
    this.setAnimationState("complete");
  }

  leave() {
    this.timeline?.kill();
    this.timeline = null;
    this.clearSecondLottieStartTimeout();
    this.setAnimationState("initial");
    this.stopWithDelay();
  }

  prepareEnter() {
    this.clearStopTimeout();
    this.clearSecondLottieStartTimeout();
    this.setAnimationState("initial");
  }

  stop() {
    for (const { animation } of this.players) {
      animation.stop();
    }
  }

  destroy() {
    this.clearStopTimeout();
    this.timeline?.kill();
    this.timeline = null;

    for (const { animation } of this.players) {
      animation.destroy();
    }

    this.players = [];
  }

  private setElements() {
    this.step1 = this.container.querySelector(".instruction-card--step1");
    this.step2 = this.container.querySelector(".instruction-card--step2");
    this.actions = this.container.querySelector(".instruction-actions");
    this.actionButtons = this.actions ? [...this.actions.querySelectorAll<HTMLElement>("button")] : [];

    if (!this.step1 || !this.step2 || !this.actions) {
      throw new Error("Missing instruction animation elements.");
    }
  }

  private getSecondLottieStartDelayMs() {
    const delaySeconds =
      this.entryDelaySeconds + this.step1RevealDurationSeconds + this.step1HoldDurationSeconds + this.step2EnterOffsetSeconds;

    return Math.round(delaySeconds * 1000);
  }

  private createTimeline() {
    if (!this.step1 || !this.step2 || !this.actions) {
      throw new Error("Missing instruction animation elements.");
    }

    return gsap
      .timeline({
        paused: true,
        defaults: {
          ease: "power2.inOut",
        },
      })
      .to({}, { duration: this.entryDelaySeconds })
      .addLabel("intro")
      .set(this.step1, { autoAlpha: 0, xPercent: -50, yPercent: -50, y: 80, scale: 1.2, filter: "blur(18px)" }, "intro")
      .set(this.step2, { autoAlpha: 0, xPercent: -50, yPercent: -50, y: 80, scale: 1, filter: "blur(18px)" }, "intro")
      .set(this.actions, { autoAlpha: 1, xPercent: -50, y: this.actionsFinalY }, "intro")
      .set(this.actionButtons, { autoAlpha: 0, y: 60 }, "intro")
      .to(this.step1, { autoAlpha: 1, y: 0, scale: 1.2, filter: "blur(0px)", duration: 0.8, ease: "power2.out" }, "intro")
      .to({}, { duration: 0.34 })
      .addLabel("step1Compact")
      .to(this.step1, { scale: 1, y: this.step1FinalY, duration: 0.8 }, "step1Compact")
      .to(this.step2, { autoAlpha: 1, y: 0, scale: 1.2, filter: "blur(0px)", duration: 0.8, ease: "power2.out" }, "step1Compact+=0.6")
      .to({}, { duration: 0.6 })
      .addLabel("actionsIn")
      .to(this.step2, { scale: 1, y: this.step2FinalY, duration: 0.8 }, "actionsIn")
      .to({}, { duration: 0.8 })
      .to(this.actionButtons, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.inOut", stagger: 0.2 }, "actionsIn");
  }

  private setAnimationState(state: "initial" | "complete") {
    if (!this.step1 || !this.step2 || !this.actions) {
      return;
    }

    this.timeline?.kill();
    this.timeline = null;

    if (state === "initial") {
      gsap.set(this.step1, { autoAlpha: 0, xPercent: -50, yPercent: -50, y: 80, scale: 1.2, filter: "blur(18px)" });
      gsap.set(this.step2, { autoAlpha: 0, xPercent: -50, yPercent: -50, y: 80, scale: 1, filter: "blur(18px)" });
      gsap.set(this.actions, { autoAlpha: 0, xPercent: -50, y: this.actionsFinalY });
      gsap.set(this.actionButtons, { autoAlpha: 0, y: 20 });
      return;
    }

    gsap.set(this.step1, { autoAlpha: 1, xPercent: -50, yPercent: -50, y: this.step1FinalY, scale: 1, filter: "blur(0px)" });
    gsap.set(this.step2, { autoAlpha: 1, xPercent: -50, yPercent: -50, y: this.step2FinalY, scale: 1, filter: "blur(0px)" });
    gsap.set(this.actions, { autoAlpha: 1, xPercent: -50, y: this.actionsFinalY });
    gsap.set(this.actionButtons, { autoAlpha: 1, y: 0 });
  }

  private playAllLotties() {
    this.clearStopTimeout();
    this.clearSecondLottieStartTimeout();

    for (const { animation } of this.players) {
      animation.goToAndPlay(0, true);
    }
  }

  private playEnterLotties() {
    this.clearStopTimeout();
    this.clearSecondLottieStartTimeout();

    const [firstPlayer, secondPlayer] = this.players;
    firstPlayer?.animation.goToAndPlay(0, true);

    if (!secondPlayer) {
      return;
    }

    secondPlayer.animation.stop();
    secondPlayer.animation.goToAndStop(0, true);
    this.secondLottieStartTimeout = window.setTimeout(() => {
      this.secondLottieStartTimeout = null;
      secondPlayer.animation.goToAndPlay(0, true);
    }, this.getSecondLottieStartDelayMs());
  }

  private stopWithDelay() {
    this.clearStopTimeout();
    this.stopTimeout = window.setTimeout(() => {
      this.stopTimeout = null;
      this.stop();
    }, this.stopDelayMs);
  }

  private clearStopTimeout() {
    if (this.stopTimeout === null) {
      return;
    }

    window.clearTimeout(this.stopTimeout);
    this.stopTimeout = null;
  }

  private clearSecondLottieStartTimeout() {
    if (this.secondLottieStartTimeout === null) {
      return;
    }

    window.clearTimeout(this.secondLottieStartTimeout);
    this.secondLottieStartTimeout = null;
  }

  private prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
}
