// js/auth.js
import { ENDPOINTS, STORAGE_KEYS } from "./config.js";

export const getToken = () => localStorage.getItem(STORAGE_KEYS.token);
export const setToken = (t) => localStorage.setItem(STORAGE_KEYS.token, t);
export const clearToken = () => localStorage.removeItem(STORAGE_KEYS.token);

function toBasic(identifier, password) {
  const raw = `${identifier}:${password}`;
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  return `Basic ${b64}`;
}

function extractJwtFromUnknownResponse(text) {
  if (!text) return "";

  let t = String(text).trim();

  // remove quotes:  "xxx.yyy.zzz"
  t = t.replace(/^"(.+)"$/, "$1").trim();

  // remove Bearer prefix
  if (t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }

  // if body is JSON but content-type wasn't json, parse it
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const obj = JSON.parse(t);
      t =
        obj.token ||
        obj.jwt ||
        obj.access_token ||
        obj.id_token ||
        obj.data?.token ||
        "";
      if (typeof t === "string") t = t.trim();
    } catch {
      // ignore JSON parse errors
    }
  }

  return t;
}

export async function signinBasic(identifier, password) {
  const res = await fetch(ENDPOINTS.signin, {
    method: "POST",
    headers: {
      Authorization: toBasic(identifier, password),
      // helps some backends respond cleanly
      Accept: "application/json, text/plain, */*",
    },
  });

  // If invalid credentials or server error
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Login failed (${res.status})`);
  }

  // Always read as text first (most robust)
  const raw = await res.text().catch(() => "");
  let token = extractJwtFromUnknownResponse(raw);

  // validate JWT
  if (token.split(".").length !== 3) {
    // show small hint to help debug
    const preview = raw.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      `Signin did not return a valid JWT token. Response starts with: ${preview}`
    );
  }

  return token;
}
