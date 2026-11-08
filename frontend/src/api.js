const configured = import.meta.env.VITE_API_URL || "";
export const getServer = () =>
  localStorage.getItem("brandon-server") || configured;
export function setServer(value) {
  const clean = value.trim().replace(/\/$/, "");
  const url = new URL(clean);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("Use an HTTPS server URL (HTTP is allowed on localhost).");
  localStorage.setItem("brandon-server", clean);
  localStorage.removeItem("brandon-token");
}
export const getToken = () => localStorage.getItem("brandon-token");
export function forgetToken() {
  localStorage.removeItem("brandon-token");
}
export async function api(path, { body, method = "GET", signal } = {}) {
  const server = getServer();
  if (!server) throw new Error("Connect your server in Settings first.");
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${server}/api${path}`, {
      method,
      headers,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new Error(
      "Cannot reach your server. Check its address, HTTPS certificate and allowed origin.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) forgetToken();
    // FastAPI's bare "Not Found" means the route itself is missing: the
    // server is running older code than this page expects.
    const outdated = response.status === 404 && data.detail === "Not Found";
    const detail = outdated
      ? "Your server is running an older version of Brandon. Update it (git pull, then restart the API) and try again."
      : typeof data.detail === "string"
        ? data.detail
        : response.status === 422
          ? "Check your input. Username: 3–40 letters, numbers, dots or underscores. Password: at least 10 characters."
          : `Server returned ${response.status}.`;
    throw new Error(detail);
  }
  if (data.token) localStorage.setItem("brandon-token", data.token);
  return data;
}
