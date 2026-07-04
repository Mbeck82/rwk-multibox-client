import { ALLOWED_RWK_GAME_HOSTS } from "./types";

export function isAllowedRwkUrl(rawUrl: string): boolean {
  if (rawUrl === "about:blank") {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_RWK_GAME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Resolve a navigation or window.open URL against the active document (handles relative
 * paths and `//host`). Returns null when the URL cannot be parsed (caller should block).
 */
export function resolveNavigationHref(rawUrl: string, baseUrl: string): string | null {
  try {
    const base = baseUrl.trim();
    return base ? new URL(rawUrl, base).href : new URL(rawUrl).href;
  } catch {
    return null;
  }
}

export function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
