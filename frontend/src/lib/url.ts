// Same rules the backend uses, so people get feedback before sending anything.

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

import { config } from "@/config";

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // let people paste "example.com/page" without the https://
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function checkUrl(input: string, maxLength = config.defaultMaxUrlLength): UrlCheck {
  const value = normalizeUrl(input);
  if (!value) return { ok: false, message: "Please enter a URL." };
  if (value.length > maxLength) return { ok: false, message: "That URL is too long." };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: "That doesn't look like a valid URL. Example: https://example.com/article" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Only http:// and https:// links are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, message: "URLs with a username or password are not allowed." };
  }
  const host = url.hostname;
  if (!host.includes(".") && !host.startsWith("[")) {
    return { ok: false, message: "That doesn't look like a website address. Example: https://example.com" };
  }
  if (/\s/.test(value)) {
    return { ok: false, message: "URLs can't contain spaces." };
  }
  return { ok: true, url: url.toString() };
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
