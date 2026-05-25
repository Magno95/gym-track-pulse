import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import type {
  CreateKioskSessionRequest,
  CreateKioskSessionResponse,
  FinalizeKioskUploadRequest,
  FinalizeKioskUploadResponse,
} from "@app/types";

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
const region = import.meta.env.VITE_FIREBASE_REGION || "europe-west1";
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || window.location.hostname || "127.0.0.1";
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN;
const hasAppCheckDebugToken = Boolean(appCheckDebugToken && appCheckDebugToken !== "false");

if (useEmulators || hasAppCheckDebugToken) {
  window.FIREBASE_APPCHECK_DEBUG_TOKEN = hasAppCheckDebugToken
    ? appCheckDebugToken === "true"
      ? true
      : appCheckDebugToken
    : true;
}

if (!useEmulators && hasAppCheckDebugToken) {
  throw new Error("App Check debug token is not allowed outside emulator mode.");
}

export const app = initializeApp(firebaseConfig);

if (!useEmulators) {
  if (!appCheckSiteKey || appCheckSiteKey === "debug") {
    throw new Error("VITE_FIREBASE_APP_CHECK_SITE_KEY must be configured outside emulator mode.");
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const functions = getFunctions(app, region);
export const storage = getStorage(app);

if (useEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, emulatorHost, 5001);
  connectStorageEmulator(storage, emulatorHost, 9199);
}

export const ensureAnonymousAuth = async () => auth.currentUser ?? (await signInAnonymously(auth)).user;

export const resetKioskAuth = async () => {
  window.sessionStorage.clear();
  await signOut(auth);
};

export const createKioskSessionCallable = httpsCallable<CreateKioskSessionRequest, CreateKioskSessionResponse>(
  functions,
  "createKioskSession",
);

export const finalizeKioskUploadCallable = httpsCallable<FinalizeKioskUploadRequest, FinalizeKioskUploadResponse>(
  functions,
  "finalizeKioskUpload",
);
