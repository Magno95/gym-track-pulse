import copySource from "./kiosk.json";

export type SupportedLang = "en" | "it" | "es" | "fr";

export type LocalizedText = Record<SupportedLang, string>;

export const supportedLangs: SupportedLang[] = ["en", "it", "es", "fr"];

export const kioskCopy = copySource;

export const getInitialLang = () => {
  const requestedLang = new URLSearchParams(window.location.search).get("lang");

  return isSupportedLang(requestedLang) ? requestedLang : "en";
};

export const resolveCopy = (entry: LocalizedText, lang: SupportedLang) => {
  return entry[lang] || entry.en;
};

const isSupportedLang = (lang: string | null): lang is SupportedLang => {
  return supportedLangs.includes(lang as SupportedLang);
};
