const CLIENT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/orch-api";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function getApiBaseUrl(): string {
  const clientBase = trimTrailingSlash(CLIENT_API_BASE_URL);

  if (typeof window !== "undefined") {
    return clientBase;
  }

  if (isAbsoluteUrl(clientBase)) {
    return clientBase;
  }

  const internalBase = process.env.INTERNAL_API_BASE_URL;
  if (internalBase) {
    return trimTrailingSlash(internalBase);
  }

  const publicOrigin = trimTrailingSlash(process.env.PUBLIC_APP_ORIGIN || "https://yaja168.online");
  return `${publicOrigin}${clientBase.startsWith("/") ? "" : "/"}${clientBase}`;
}

export async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

const API_BASE_URL = trimTrailingSlash(CLIENT_API_BASE_URL);

export { API_BASE_URL };
