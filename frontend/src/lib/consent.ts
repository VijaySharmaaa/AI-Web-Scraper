// The visitor's answer to "can we save your history on this device?".
// Only this one small answer is stored without asking, it's needed to
// remember the choice itself.

export type Consent = "granted" | "denied";

const KEY = "storage-consent";

export function loadConsent(): Consent | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent | null) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked, the banner will just show again next time
  }
}
