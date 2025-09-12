// web/js/http.js
// LIFF がなくても動く安全版。LIFF があれば ID トークンを付与します。

const API_BASE = ""; // 同一オリジン。別ドメインにしたいならここを設定

const isFormData = (b) =>
  typeof FormData !== "undefined" && b instanceof FormData;

const hasLIFF = () =>
  typeof window !== "undefined" && typeof window.liff !== "undefined";

/** LIFF があれば ID トークンを返す。なければ null */
export async function ensureIdToken() {
  if (!hasLIFF()) return null;
  try {
    // liff.ready を待つ（失敗しても無視）
    await window.liff.ready.catch(() => {});
    // アプリ内 or ログイン済みなら ID トークン取得を試す
    if (window.liff.isInClient?.() || window.liff.isLoggedIn?.()) {
      return window.liff.getIDToken?.() || null;
    }
  } catch {}
  return null;
}

/** 共通 fetch（必要なら Authorization を付与） */
export async function apiFetch(path, opts = {}) {
  const { headers = {}, body, ...rest } = opts;
  const h = new Headers(headers);

  // 既定ヘッダ
  if (!h.has("Accept")) h.set("Accept", "application/json");
  // JSON 送信時のみ Content-Type を自動付与（FormData には付けない）
  if (body && !isFormData(body) && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }

  // LIFF があれば ID トークンを付与（なければ付けない＝公開API想定）
  const idToken = await ensureIdToken();
  if (idToken) h.set("Authorization", `Bearer ${idToken}`);

  const res = await fetch(API_BASE + path, { ...rest, headers: h, body });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res;
}

/** JSON ヘルパー */
export async function apiJSON(path, opts) {
  const res = await apiFetch(path, opts);
  const text = await res.text(); // 空ボディ対策
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("Invalid JSON");
    err.body = text;
    throw err;
  }
}

/** テキストヘルパー */
export async function apiText(path, opts) {
  const res = await apiFetch(path, opts);
  return res.text();
}
