// The AI model the user picked. "auto" lets the server choose (its fallback order).
// Saved like the theme, it's a setting the user picked themselves.

export const AUTO = "auto";
const KEY = "ai-model";

export function loadModelChoice(): string {
  try {
    return localStorage.getItem(KEY) || AUTO;
  } catch {
    return AUTO;
  }
}

export function saveModelChoice(model: string) {
  try {
    if (model === AUTO) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, model);
  } catch {
    // not saved, fine
  }
}
