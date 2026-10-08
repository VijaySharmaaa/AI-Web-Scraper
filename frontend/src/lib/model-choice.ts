
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
  } catch {}
}
