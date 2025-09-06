// web/js/fav.js
import { ensureIdToken, apiJSON } from "./http.js";

// 旧：btn.textContent = isFav ? '★ お気に入り' : '☆ お気に入り';
function setUI(btn, isFav) {
  btn.dataset.fav = isFav ? "1" : "0";
  btn.setAttribute("aria-pressed", String(!!isFav));
  // アイコン（SVG）はHTMLに置いてあるので触らない
}

async function fetchState(shopId) {
  const r = await apiJSON(
    `/api/favorites?shopId=${encodeURIComponent(shopId)}`
  );
  return !!r.isFav;
}

async function add(shopId) {
  return apiJSON("/api/favorite-add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shopId }),
  });
}

async function remove(shopId) {
  return apiJSON("/api/favorite-remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shopId }),
  });
}

// ボタン1個を初期化
export async function initFavButton(btn) {
  const shopId = btn.dataset.shopId;
  if (!shopId) return;

  btn.disabled = true;
  try {
    await ensureIdToken();
    const isFav = await fetchState(shopId);
    setUI(btn, isFav);
  } catch (e) {
    console.warn("[fav] init failed", e);
  } finally {
    btn.disabled = false;
  }

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;

    const current = btn.dataset.fav === "1";
    // 楽観更新（先に見た目を変える）
    setUI(btn, !current);

    try {
      await ensureIdToken();
      if (current) await remove(shopId);
      else await add(shopId);
    } catch (e) {
      // 失敗したら元に戻す
      console.warn("[fav] toggle failed", e.status, e.body || e);
      setUI(btn, current);
      // 401/期限切れは ensureIdToken が再ログイン誘導するので、戻って再クリックでOK
    } finally {
      btn.disabled = false;
    }
  });
}

// ページ内の全ボタンを一括初期化
export async function initAllFavButtons(selector = "[data-shop-id].fav-btn") {
  await ensureIdToken(); // 先にログイン/更新しておく
  const nodes = document.querySelectorAll(selector);
  for (const btn of nodes) initFavButton(btn);
}
