import { ref, uploadBytes } from "firebase/storage";
import { gsap } from "gsap";
import type { BoundingBox, FaceDetector as MediaPipeFaceDetector } from "@mediapipe/tasks-vision";

import { customLog, eventDispatch, getGlobalContext, readExperienceSourceFromUrl, type Debug, type GlobalEvents, type StateManager } from "@app/frontend-core";

import type { TConfig } from "../../../conf/conf";
import type { TData } from "../../../conf/data";
import { kioskCopy, resolveCopy, type LocalizedText, type SupportedLang } from "../../copy/kiosk";
import { createKioskSessionCallable, ensureAnonymousAuth, finalizeKioskUploadCallable, storage } from "../../lib/firebase";

type CameraCaptureOptions = {
  container: HTMLElement;
  lang: SupportedLang;
};

type CameraUiState = "ready" | "countdown" | "review" | "busy" | "qr" | "error";

type FaceDetectorOptions = {
  fastMode?: boolean;
  maxDetectedFaces?: number;
};

type NativeDetectedFace = {
  boundingBox: DOMRectReadOnly;
};

type NativeFaceDetectorInstance = {
  detect(source: CanvasImageSource): Promise<NativeDetectedFace[]>;
};

type NativeFaceDetectorConstructor = new (options?: FaceDetectorOptions) => NativeFaceDetectorInstance;

type FaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CameraDebugSettings = {
  quickFoto: boolean;
  stopFoto: boolean;
  cameraStep: CameraUiState;
};

const maxPhotoUploadBytes = 8 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const cameraJpegQuality = 0.8;
const maxPhotoLongSidePx = 1600;

declare global {
  interface Window {
    FaceDetector?: NativeFaceDetectorConstructor;
  }
}

export class CameraCapture {
  private static sharedMediaPipeFaceDetector: MediaPipeFaceDetector | null = null;
  private static sharedMediaPipeFaceDetectorPromise: Promise<MediaPipeFaceDetector> | null = null;
  private static readonly debugStorageKey = "kiosk-camera-debug-settings";

  componentName = "CameraCapture";

  stateManager: StateManager;
  globalEvents: GlobalEvents;
  debugger: Debug;
  data: TData;
  config: TConfig;
  container: HTMLElement;
  lang: SupportedLang;
  uiState: CameraUiState = "ready";
  selectedFile: File | null = null;
  video: HTMLVideoElement | null = null;
  cameraCanvas: HTMLCanvasElement | null = null;
  cameraContext: CanvasRenderingContext2D | null = null;
  cameraFrameRequest: number | null = null;
  mediaStream: MediaStream | null = null;
  statusOutput: HTMLOutputElement | null = null;
  errorMessage: HTMLElement | null = null;
  qrCodeRoot: HTMLElement | null = null;
  countdown: HTMLElement | null = null;
  captureCountdown: HTMLElement | null = null;
  mobileLink: HTMLAnchorElement | null = null;
  countdownInterval: number | null = null;
  faceDetectionRoot: HTMLElement | null = null;
  faceDetectionArea: HTMLElement | null = null;
  nativeFaceDetector: NativeFaceDetectorInstance | null = null;
  mediaPipeFaceDetector: MediaPipeFaceDetector | null = null;
  mediaPipeFaceDetectorPromise: Promise<void> | null = null;
  faceDetectionChecked = false;
  faceDetectionSupported = false;
  faceDetectionInFlight = false;
  lastFaceDetectionAt = 0;
  faceDetectionIntervalMs = 250;
  maxCameraCanvasPixelRatio = 1;
  captureCountdownIntroDelayMs = 800;
  faceDetectedSince: number | null = null;
  autoCaptureHoldMs = 750;
  autoCaptureInProgress = false;
  captureSequenceId = 0;
  quickPhotoTimeout: number | null = null;
  sanitizedPhotoFiles = new WeakSet<File>();
  showSessionCountdown = import.meta.env.VITE_KIOSK_SHOW_SESSION_COUNTDOWN === "true";
  activeSessionTtlSeconds: number | null = null;
  experienceSource = readExperienceSourceFromUrl();
  debugSettings: CameraDebugSettings = CameraCapture.loadDebugSettings();

  constructor({ container, lang }: CameraCaptureOptions) {
    const context = getGlobalContext<TConfig, TData>();
    this.container = container;
    this.lang = lang;
    this.stateManager = context.stateManager;
    this.globalEvents = context.globalEvents;
    this.debugger = this.stateManager.debug;
    this.data = context.data;
    this.config = context.config;
    this.init();
  }

  static preloadFaceDetection() {
    const FaceDetector = window.FaceDetector;

    if (typeof FaceDetector === "function") {
      return;
    }

    void CameraCapture.loadMediaPipeFaceDetector().catch((error: unknown) => {
      customLog({
        message: `Face detection preload unavailable: ${error instanceof Error ? error.message : "Errore sconosciuto"}`,
        component: "CameraCapture",
      });
    });
  }

  private static loadMediaPipeFaceDetector() {
    if (CameraCapture.sharedMediaPipeFaceDetector) {
      return Promise.resolve(CameraCapture.sharedMediaPipeFaceDetector);
    }

    if (CameraCapture.sharedMediaPipeFaceDetectorPromise) {
      return CameraCapture.sharedMediaPipeFaceDetectorPromise;
    }

    CameraCapture.sharedMediaPipeFaceDetectorPromise = (async () => {
      const { FaceDetector: MediaPipeFaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("/assets/mediapipe/wasm");
      const faceDetector = await MediaPipeFaceDetector.createFromOptions(vision, {
        baseOptions: {
          delegate: "CPU",
          modelAssetPath: "/assets/models/blaze_face_short_range.tflite",
        },
        minDetectionConfidence: 0.55,
        runningMode: "VIDEO",
      });

      CameraCapture.sharedMediaPipeFaceDetector = faceDetector;
      return faceDetector;
    })().catch((error: unknown) => {
      CameraCapture.sharedMediaPipeFaceDetectorPromise = null;
      throw error;
    });

    return CameraCapture.sharedMediaPipeFaceDetectorPromise;
  }

  private static loadDebugSettings(): CameraDebugSettings {
    const fallback: CameraDebugSettings = {
      quickFoto: false,
      stopFoto: false,
      cameraStep: "ready",
    };

    try {
      const rawSettings = localStorage.getItem(CameraCapture.debugStorageKey);
      const settings = rawSettings ? (JSON.parse(rawSettings) as Partial<CameraDebugSettings>) : {};

      return {
        quickFoto: typeof settings.quickFoto === "boolean" ? settings.quickFoto : fallback.quickFoto,
        stopFoto: typeof settings.stopFoto === "boolean" ? settings.stopFoto : fallback.stopFoto,
        cameraStep: CameraCapture.isCameraUiState(settings.cameraStep) ? settings.cameraStep : fallback.cameraStep,
      };
    } catch {
      return fallback;
    }
  }

  private static isCameraUiState(value: unknown): value is CameraUiState {
    return typeof value === "string" && ["ready", "countdown", "review", "busy", "qr", "error"].includes(value);
  }

  init() {
    customLog({ message: `Init ${this.componentName}`, component: this.componentName });
    this.setElements();
    this.setEvents();
    this.setUiState("ready");

    this.stateManager.applyStatePatch({ global: "idle", flow: "idle" });
    void ensureAnonymousAuth()
      .then(() => this.renderOutput(this.data.labels.ready))
      .catch((error: unknown) => this.renderOutput(`${this.copy(kioskCopy.status.authFailed)}: ${this.getErrorMessage(error)}`));

    this.debug();
  }

  destroy() {
    this.container.removeEventListener("click", this.handleClick);
    this.stopCamera();

    if (this.countdownInterval !== null) {
      window.clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    this.clearQuickPhotoTimeout();
    this.nativeFaceDetector = null;
    this.mediaPipeFaceDetector = null;
    this.mediaPipeFaceDetectorPromise = null;
    this.setUiState("ready");
  }

  requestCapture = () => {
    void this.startCamera();
  };

  private startCamera = async () => {
    this.selectedFile = null;
    this.activeSessionTtlSeconds = null;
    this.clearQuickPhotoTimeout();
    this.stopSessionCountdown();
    this.setSessionCountdownVisibility(false);
    this.setUiState("ready");

    try {
      await ensureAnonymousAuth();

      if (!window.isSecureContext && !this.isLocalhostOrigin()) {
        throw new Error("Camera requires HTTPS or localhost.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available.");
      }

      this.stopCamera();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (this.video) {
        this.video.srcObject = this.mediaStream;
        await this.video.play();
      }

      this.startCanvasRenderer();
      this.renderOutput(this.data.labels.ready);
      this.maybeScheduleQuickPhoto();
    } catch (error) {
      this.stateManager.applyStatePatch({ global: "error" });
      this.setUiState("error");
      this.renderOutput(`${this.copy(kioskCopy.status.kioskError)}: ${this.getErrorMessage(error)}`);
    }
  };

  private setElements() {
    this.video = this.container.querySelector("[data-camera-video]");
    this.cameraCanvas = this.container.querySelector("[data-camera-canvas]");
    this.cameraContext = this.cameraCanvas?.getContext("2d") ?? null;
    this.statusOutput = this.container.querySelector("[data-status]");
    this.errorMessage = this.container.querySelector("[data-error-message]");
    this.qrCodeRoot = this.container.querySelector("[data-qr-code]");
    this.countdown = this.container.querySelector("[data-countdown]");
    this.captureCountdown = this.container.querySelector("[data-capture-countdown]");
    this.mobileLink = this.container.querySelector("[data-mobile-link]");
    this.faceDetectionRoot = this.container.querySelector(".face-area--detection");
    this.faceDetectionArea = this.container.querySelector(".detection-area");
  }

  private setEvents() {
    this.container.addEventListener("click", this.handleClick);
  }

  private debug() {
    const fold = this.debugger.GUI?.addFolder(this.componentName);

    if (fold) {
      fold.add(this, "uiState").name("Camera State").listen().disable();
      fold
        .add(this.debugSettings, "quickFoto")
        .name("quickFoto")
        .onChange(() => this.persistDebugSettings());
      fold
        .add(this.debugSettings, "stopFoto")
        .name("stopFoto")
        .onChange(() => {
          this.persistDebugSettings();
          if (this.debugSettings.stopFoto) {
            this.cancelAutoCapture();
            this.clearQuickPhotoTimeout();
            this.setUiState("ready");
            this.renderOutput(this.data.labels.ready);
          } else {
            this.maybeScheduleQuickPhoto();
          }
        });
      fold
        .add(this.debugSettings, "cameraStep", ["ready", "countdown", "review", "busy", "qr", "error"])
        .name("cameraStep")
        .onChange((step: CameraUiState) => {
          this.persistDebugSettings();
          void this.goToDebugCameraStep(step);
        });
    }
  }

  private handleClick = (event: MouseEvent) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("[data-generate-button]")) {
      void this.handleGenerateClick();
      return;
    }

    if (target.closest("[data-retake-button]")) {
      this.requestCapture();
      return;
    }

    if (target.closest("[data-back-button]")) {
      eventDispatch(this.globalEvents.KIOSK_RESET_TO_IDLE, undefined);
    }
  };

  private handleCaptureClick = async () => {
    try {
      const sequenceId = this.captureSequenceId;
      if (!this.isDebugOverrideActive() || !this.debugSettings.quickFoto) {
        await this.runCaptureCountdown(sequenceId);
      }

      if (sequenceId !== this.captureSequenceId) {
        return;
      }

      const file = await this.capturePhoto();

      this.selectedFile = file;
      this.freezeCamera();
      this.setUiState("review");
      this.renderOutput(`${this.copy(kioskCopy.status.photoReady)}: ${file.name}`);
    } catch (error) {
      this.setUiState("error");
      this.renderOutput(`${this.copy(kioskCopy.status.kioskError)}: ${this.getErrorMessage(error)}`);
    } finally {
      this.autoCaptureInProgress = false;
      this.faceDetectedSince = null;
    }
  };

  private runCaptureCountdown = async (sequenceId: number) => {
    this.setUiState("countdown");
    await this.wait(this.captureCountdownIntroDelayMs);

    for (const value of [3, 2, 1]) {
      if (sequenceId !== this.captureSequenceId) {
        return;
      }

      if (this.captureCountdown) {
        this.captureCountdown.textContent = value.toString();
        gsap.killTweensOf(this.captureCountdown);
        gsap.set(this.captureCountdown, { scale: 1, autoAlpha: 1, transformOrigin: "50% 50%" });
        await this.animateCountdownValue();
      }
    }
  };

  private animateCountdownValue() {
    return new Promise<void>((resolve) => {
      if (!this.captureCountdown) {
        resolve();
        return;
      }

      gsap.to(this.captureCountdown, {
        scale: 0,
        autoAlpha: 0,
        duration: 0.82,
        ease: "power2.in",
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  }

  private wait(durationMs: number) {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }

  private capturePhoto = async () => {
    if (!this.cameraCanvas || !this.cameraContext || !this.cameraCanvas.width || !this.cameraCanvas.height) {
      throw new Error("Camera is not ready.");
    }

    return this.createJpegPhotoFile(this.cameraCanvas, this.cameraCanvas.width, this.cameraCanvas.height, "Photo capture failed.");
  };

  private handleGenerateClick = async () => {
    const file = this.selectedFile;

    if (!file) {
      this.renderOutput(this.copy(kioskCopy.status.missingPhoto));
      return;
    }

    this.setUiState("busy");

    try {
      this.validatePhotoFile(file);
      this.stateManager.applyStatePatch({ global: "busy", flow: "kiosk_created" });
      this.renderOutput(this.copy(kioskCopy.status.creatingSession));
      await ensureAnonymousAuth();
      const session = (await createKioskSessionCallable({ experienceSource: this.experienceSource })).data;

      this.renderOutput(this.copy(kioskCopy.status.uploadingPhoto));
      const sanitizedPhoto = this.sanitizedPhotoFiles.has(file) ? file : await this.createSanitizedPhoto(file);
      this.validatePhotoFile(sanitizedPhoto);

      await uploadBytes(ref(storage, session.uploadPath), sanitizedPhoto, {
        contentType: sanitizedPhoto.type || "image/jpeg",
      });

      this.renderOutput(this.copy(kioskCopy.status.finalizingUpload));
      await finalizeKioskUploadCallable({
        sessionId: session.sessionId,
        originalPath: session.uploadPath,
      });
      this.stateManager.applyStatePatch({ global: "busy", flow: "upload_finalized" });

      this.setUiState("qr");

      if (!this.qrCodeRoot) {
        throw new Error("Missing QR container.");
      }

      const localizedClaimUrl = this.withLangParam(session.claimUrl);
      await this.renderStyledQrCode(localizedClaimUrl);

      if (this.mobileLink) {
        this.mobileLink.href = localizedClaimUrl;
      }

      this.activeSessionTtlSeconds = session.claimTtlSeconds ?? session.ttlSeconds;
      this.setSessionCountdownVisibility(this.showSessionCountdown);

      if (this.showSessionCountdown) {
        this.runCountdown(new Date(session.claimExpiresAt ?? session.expiresAt));
      } else {
        this.stopSessionCountdown();
      }

      this.stateManager.applyStatePatch({ global: "ready", flow: "upload_finalized" });
      this.renderOutput(`${this.copy(kioskCopy.status.qrReady)} ${session.sessionId}`);
    } catch (error) {
      this.stateManager.applyStatePatch({ global: "error" });
      this.setUiState("error");
      this.renderError(this.getErrorMessage(error));
    }
  };

  private setUiState(state: CameraUiState) {
    this.uiState = state;
    this.container.dataset.cameraState = state;

    if (state !== "error" && this.errorMessage) {
      this.errorMessage.textContent = "";
    }

    if (this.debugger.active && this.debugSettings.cameraStep !== state) {
      this.debugSettings.cameraStep = state;
      this.persistDebugSettings();
    }
  }

  private renderOutput(message: string) {
    if (this.statusOutput) {
      this.statusOutput.textContent = message;
    }
  }

  private renderError(message: string) {
    const fullMessage = `${this.copy(kioskCopy.status.kioskError)}: ${message}`;
    this.renderOutput(fullMessage);

    if (this.errorMessage) {
      this.errorMessage.textContent = message;
    }
  }

  private async renderStyledQrCode(text: string) {
    if (!this.qrCodeRoot) {
      throw new Error("Missing QR container.");
    }

    const { default: QRCodeStyling } = await import("qr-code-styling");
    const size = Math.round(this.qrCodeRoot.clientWidth || 196);
    const qrCode = new QRCodeStyling({
      width: size,
      height: size,
      type: "canvas",
      data: text,
      margin: 2,
      qrOptions: {
        errorCorrectionLevel: "M",
      },
      dotsOptions: {
        color: "#252b3f",
        type: "rounded",
      },
      cornersSquareOptions: {
        color: "#252b3f",
        type: "rounded",
      },
      cornersDotOptions: {
        color: "#252b3f",
        type: "rounded",
      },
      backgroundOptions: {
        color: "#f8f6f5",
      },
    });

    this.qrCodeRoot.replaceChildren();
    qrCode.append(this.qrCodeRoot);
  }

  private withLangParam(url: string) {
    const claimUrl = new URL(url);
    claimUrl.searchParams.set("lang", this.lang);
    return claimUrl.toString();
  }

  private persistDebugSettings() {
    try {
      localStorage.setItem(CameraCapture.debugStorageKey, JSON.stringify(this.debugSettings));
    } catch {
      // Ignore storage quota and privacy-mode failures.
    }
  }

  private async goToDebugCameraStep(step: CameraUiState) {
    this.clearQuickPhotoTimeout();
    this.cancelAutoCapture();
    this.stopSessionCountdown();
    this.setSessionCountdownVisibility(false);

    if (step === "review") {
      await this.setMockPhoto();
      this.freezeCamera();
      this.setUiState("review");
      this.renderOutput(`${this.copy(kioskCopy.status.photoReady)}: ${this.selectedFile?.name ?? "mock_foto.jpg"}`);
      return;
    }

    if (step === "qr") {
      this.freezeCamera();
      await this.renderStyledQrCode("debug-mock-qr");

      if (this.mobileLink) {
        this.mobileLink.removeAttribute("href");
      }

      this.setUiState("qr");
      this.renderOutput("QR mock");
      return;
    }

    this.setUiState(step);

    if (step === "ready") {
      this.renderOutput(this.data.labels.ready);
    }
  }

  private async setMockPhoto() {
    this.selectedFile = await this.loadMockPhoto();
  }

  private async loadMockPhoto() {
    const response = await this.fetchFirstAvailable(["/img/mock_foto.jpg", "/assets/img/mock_foto.jpg"]);

    if (!response.ok) {
      throw new Error("Mock photo not available.");
    }

    const blob = await response.blob();
    return new File([blob], "mock_foto.jpg", { type: blob.type || "image/jpeg" });
  }

  private async fetchFirstAvailable(urls: string[]) {
    for (const url of urls) {
      const response = await fetch(url);

      if (response.ok) {
        return response;
      }
    }

    return new Response(null, { status: 404 });
  }

  private maybeScheduleQuickPhoto() {
    if (!this.isDebugOverrideActive() || !this.debugSettings.quickFoto || this.debugSettings.stopFoto) {
      return;
    }

    this.clearQuickPhotoTimeout();
    this.quickPhotoTimeout = window.setTimeout(() => {
      this.quickPhotoTimeout = null;
      this.autoCaptureInProgress = true;
      this.captureSequenceId += 1;
      void this.handleCaptureClick();
    }, 1000);
  }

  private clearQuickPhotoTimeout() {
    if (this.quickPhotoTimeout === null) {
      return;
    }

    window.clearTimeout(this.quickPhotoTimeout);
    this.quickPhotoTimeout = null;
  }

  private runCountdown(expiresAt: Date) {
    this.stopSessionCountdown();

    const tick = () => {
      if (this.countdown) {
        this.countdown.textContent = this.formatRemaining(expiresAt);
      }
    };

    tick();
    this.countdownInterval = window.setInterval(tick, 1000);
  }

  private stopSessionCountdown() {
    if (this.countdownInterval !== null) {
      window.clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    if (this.countdown) {
      this.countdown.textContent = "";
    }
  }

  private setSessionCountdownVisibility(isVisible: boolean) {
    if (this.countdown) {
      this.countdown.dataset.countdownVisible = isVisible ? "true" : "false";
    }
  }

  private formatRemaining(expiresAt: Date) {
    const remainingSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    const minutes = Math.floor(remainingSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (remainingSeconds % 60).toString().padStart(2, "0");

    return `${minutes}:${seconds}`;
  }

  private stopCamera() {
    this.stopCanvasRenderer();
    this.setFaceDetected(false, false);
    this.cancelAutoCapture();
    this.clearQuickPhotoTimeout();

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }

    this.mediaStream = null;
  }

  private freezeCamera() {
    this.stopCanvasRenderer();
    this.setFaceDetected(false, false);
    this.clearQuickPhotoTimeout();

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }

    this.mediaStream = null;
  }

  private startCanvasRenderer() {
    if (!this.video || !this.cameraCanvas || !this.cameraContext) {
      return;
    }

    this.stopCanvasRenderer();
    if (this.shouldUseFaceDetection()) {
      this.setupFaceDetector();
    }

    const render = () => {
      this.drawCameraFrame();
      this.cameraFrameRequest = window.requestAnimationFrame(render);
    };

    render();
  }

  private stopCanvasRenderer() {
    if (this.cameraFrameRequest !== null) {
      window.cancelAnimationFrame(this.cameraFrameRequest);
      this.cameraFrameRequest = null;
    }
  }

  private drawCameraFrame() {
    if (!this.video || !this.cameraCanvas || !this.cameraContext || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const bounds = this.cameraCanvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxCameraCanvasPixelRatio);
    const canvasWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(bounds.height * pixelRatio));

    if (this.cameraCanvas.width !== canvasWidth || this.cameraCanvas.height !== canvasHeight) {
      this.cameraCanvas.width = canvasWidth;
      this.cameraCanvas.height = canvasHeight;
    }

    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;

    if (!videoWidth || !videoHeight) {
      return;
    }

    const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = (canvasHeight - drawHeight) / 2;

    this.cameraContext.clearRect(0, 0, canvasWidth, canvasHeight);
    this.cameraContext.save();
    this.cameraContext.translate(canvasWidth, 0);
    this.cameraContext.scale(-1, 1);
    this.cameraContext.drawImage(this.video, drawX, drawY, drawWidth, drawHeight);
    this.cameraContext.restore();
    this.queueFaceDetection();
  }

  private setupFaceDetector() {
    if (this.nativeFaceDetector || this.mediaPipeFaceDetector || this.faceDetectionChecked) {
      return;
    }

    this.faceDetectionChecked = true;
    const FaceDetector = window.FaceDetector;
    this.faceDetectionSupported = typeof FaceDetector === "function";

    if (this.faceDetectionSupported && FaceDetector) {
      this.nativeFaceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      this.faceDetectionRoot?.setAttribute("data-face-detection", "native");
      return;
    }

    this.initMediaPipeFaceDetector();
  }

  private queueFaceDetection() {
    if (!this.shouldUseFaceDetection()) {
      return;
    }

    if (!this.cameraCanvas || this.faceDetectionInFlight || !["ready", "countdown"].includes(this.uiState) || (!this.nativeFaceDetector && !this.mediaPipeFaceDetector)) {
      return;
    }

    const now = performance.now();

    if (now - this.lastFaceDetectionAt < this.faceDetectionIntervalMs) {
      return;
    }

    this.lastFaceDetectionAt = now;
    this.faceDetectionInFlight = true;
    void this.detectFaceInDetectionArea();
  }

  private async detectFaceInDetectionArea() {
    try {
      if (!this.cameraCanvas || !this.faceDetectionArea) {
        this.setFaceDetected(false);
        return;
      }

      const faces = this.nativeFaceDetector ? await this.detectWithNativeFaceDetector() : this.detectWithMediaPipeFaceDetector();
      this.setFaceDetected(faces.some((face) => this.isFaceInsideDetectionArea(face)));
    } catch {
      this.setFaceDetected(false);
    } finally {
      this.faceDetectionInFlight = false;
    }
  }

  private async detectWithNativeFaceDetector() {
    if (!this.nativeFaceDetector || !this.cameraCanvas) {
      return [];
    }

    const faces = await this.nativeFaceDetector.detect(this.cameraCanvas);

    return faces.map(({ boundingBox }) => ({
      x: boundingBox.x,
      y: boundingBox.y,
      width: boundingBox.width,
      height: boundingBox.height,
    }));
  }

  private detectWithMediaPipeFaceDetector() {
    if (!this.mediaPipeFaceDetector || !this.cameraCanvas) {
      return [];
    }

    return this.mediaPipeFaceDetector
      .detectForVideo(this.cameraCanvas, performance.now())
      .detections.map(({ boundingBox }) => this.mapMediaPipeBoundingBox(boundingBox))
      .filter((bounds): bounds is FaceBounds => bounds !== null);
  }

  private mapMediaPipeBoundingBox(boundingBox: BoundingBox | undefined) {
    if (!boundingBox) {
      return null;
    }

    return {
      x: boundingBox.originX,
      y: boundingBox.originY,
      width: boundingBox.width,
      height: boundingBox.height,
    };
  }

  private isFaceInsideDetectionArea(faceBounds: FaceBounds) {
    if (!this.cameraCanvas || !this.faceDetectionArea) {
      return false;
    }

    const canvasRect = this.cameraCanvas.getBoundingClientRect();
    const areaRect = this.faceDetectionArea.getBoundingClientRect();

    if (!canvasRect.width || !canvasRect.height || !this.cameraCanvas.width || !this.cameraCanvas.height) {
      return false;
    }

    const scaleX = this.cameraCanvas.width / canvasRect.width;
    const scaleY = this.cameraCanvas.height / canvasRect.height;
    const detectionRect = {
      left: (areaRect.left - canvasRect.left) * scaleX,
      top: (areaRect.top - canvasRect.top) * scaleY,
      right: (areaRect.right - canvasRect.left) * scaleX,
      bottom: (areaRect.bottom - canvasRect.top) * scaleY,
    };
    const faceCenterX = faceBounds.x + faceBounds.width / 2;
    const faceCenterY = faceBounds.y + faceBounds.height / 2;

    return faceCenterX >= detectionRect.left && faceCenterX <= detectionRect.right && faceCenterY >= detectionRect.top && faceCenterY <= detectionRect.bottom;
  }

  private setFaceDetected(detected: boolean, shouldUpdateCaptureFlow = true) {
    if (this.faceDetectionRoot) {
      this.faceDetectionRoot.dataset.faceDetected = detected ? "true" : "false";
    }

    if (!shouldUpdateCaptureFlow) {
      return;
    }

    this.updateAutoCaptureFlow(detected);
  }

  private updateAutoCaptureFlow(detected: boolean) {
    if (this.isDebugOverrideActive() && (this.debugSettings.stopFoto || this.debugSettings.quickFoto)) {
      return;
    }

    const now = performance.now();

    if (!detected) {
      this.faceDetectedSince = null;

      if (this.autoCaptureInProgress && this.uiState === "countdown") {
        this.cancelAutoCapture();
      }

      return;
    }

    if (this.uiState !== "ready" || this.autoCaptureInProgress) {
      return;
    }

    this.faceDetectedSince ??= now;

    if (now - this.faceDetectedSince >= this.autoCaptureHoldMs) {
      this.startAutoCapture();
    }
  }

  private startAutoCapture() {
    if (this.autoCaptureInProgress || this.uiState !== "ready") {
      return;
    }

    this.autoCaptureInProgress = true;
    this.captureSequenceId += 1;
    void this.handleCaptureClick();
  }

  private shouldUseFaceDetection() {
    return !this.isDebugOverrideActive() || (!this.debugSettings.quickFoto && !this.debugSettings.stopFoto);
  }

  private isDebugOverrideActive() {
    return this.debugger.active;
  }

  private cancelAutoCapture() {
    this.captureSequenceId += 1;
    this.autoCaptureInProgress = false;
    this.faceDetectedSince = null;

    if (this.captureCountdown) {
      gsap.killTweensOf(this.captureCountdown);
      gsap.set(this.captureCountdown, { scale: 1, autoAlpha: 1 });
      this.captureCountdown.textContent = "3";
    }

    if (this.uiState === "countdown") {
      this.setUiState("ready");
      this.renderOutput(this.data.labels.ready);
    }
  }

  private initMediaPipeFaceDetector() {
    if (this.mediaPipeFaceDetectorPromise) {
      return;
    }

    this.faceDetectionRoot?.setAttribute("data-face-detection", "loading");
    this.mediaPipeFaceDetectorPromise = this.createMediaPipeFaceDetector();
  }

  private async createMediaPipeFaceDetector() {
    try {
      this.mediaPipeFaceDetector = await CameraCapture.loadMediaPipeFaceDetector();
      this.faceDetectionRoot?.setAttribute("data-face-detection", "mediapipe");
    } catch (error) {
      this.faceDetectionRoot?.setAttribute("data-face-detection", "unsupported");
      customLog({
        message: `Face detection unavailable: ${this.getErrorMessage(error)}`,
        component: this.componentName,
      });
    }
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Errore sconosciuto";
  }

  private isLocalhostOrigin() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  }

  private validatePhotoFile(file: File) {
    if (!allowedPhotoTypes.has(file.type)) {
      throw new Error("Invalid photo type.");
    }

    if (file.size > maxPhotoUploadBytes) {
      throw new Error("Photo is too large.");
    }
  }

  private copy(entry: LocalizedText) {
    return resolveCopy(entry, this.lang);
  }

  private async createJpegPhotoFile(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, failureMessage: string) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, maxPhotoLongSidePx / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas not available.");
    }

    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", cameraJpegQuality));

    if (!blob) {
      throw new Error(failureMessage);
    }

    const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
    this.sanitizedPhotoFiles.add(file);

    return file;
  }

  private async createSanitizedPhoto(file: File) {
    const bitmap = await createImageBitmap(file);

    try {
      return await this.createJpegPhotoFile(bitmap, bitmap.width, bitmap.height, "Photo sanitization failed.");
    } finally {
      bitmap.close();
    }
  }
}
