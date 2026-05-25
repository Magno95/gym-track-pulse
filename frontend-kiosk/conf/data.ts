export type TData = {
  labels: {
    authPending: string;
    ready: string;
    missingPhoto: string;
    createSession: string;
    uploadPhoto: string;
    finalizeUpload: string;
    qrReady: string;
  };
};

export const DATA: TData = {
  labels: {
    authPending: "Auth anonima in corso...",
    ready: "Kiosk pronto.",
    missingPhoto: "Foto mancante.",
    createSession: "Creo sessione kiosk...",
    uploadPhoto: "Carico foto...",
    finalizeUpload: "Finalizzo upload...",
    qrReady: "QR pronto.",
  },
};
