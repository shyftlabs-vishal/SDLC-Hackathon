export const REFRESH_PROJECT_EVENT = "sdlc:refresh-project";

export function dispatchProjectRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REFRESH_PROJECT_EVENT));
  }
}

export function onProjectRefresh(handler: () => void) {
  window.addEventListener(REFRESH_PROJECT_EVENT, handler);
  return () => window.removeEventListener(REFRESH_PROJECT_EVENT, handler);
}
