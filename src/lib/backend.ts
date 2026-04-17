const normalizeBaseUrl = (url: string) => url.replace(/\/$/, "");

export const apiBaseUrl = (() => {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return normalizeBaseUrl(configured);

  if (typeof window === "undefined") return "http://localhost:8000";

  const { hostname, origin } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:8000";
  }

  if (hostname === "migration.shivaami.in") {
    return normalizeBaseUrl(origin);
  }

  return "";
})();

export const buildApiUrl = (path: string) => `${apiBaseUrl}${path}`;