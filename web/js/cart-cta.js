// web/js/cart-cta.js
function readCartItems() {
  // よくあるキー名を順に探す
  const keys = ['cart', 'lf_cart', 'basket'];
  for (const k of keys) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      if (Array.isArray(arr)) return arr;
    } catch {}
  }
  return [];
}

function calcCart(items) {
  let count = 0;
  let total = 0;
  for (const it of items) {
    const qty = Number(it.qty ?? it.quantity ?? 1) || 0;
    const price = Number(it.price ?? it.unit_price ?? it.amount ?? 0) || 0;
    count += qty;
    total += price * qty;
  }
  return { count, total };
}

export function initHomeCartCTA({
  buttonSelector = '#home-cart-cta',
  countSelector  = '#home-cart-count',
  totalSelector  = '#home-cart-total',
  cartHref       = './cart.html'
} = {}) {
  const btn   = document.querySelector(buttonSelector);
  const badge = document.querySelector(countSelector);
  const total = document.querySelector(totalSelector);
  if (!btn || !badge || !total) return;

  const update = () => {
    const items = readCartItems();
    const { count, total: sum } = calcCart(items);
    if (count > 0) {
      badge.textContent = String(count);
      badge.hidden = false;
      total.textContent = '¥' + Math.round(sum).toLocaleString('ja-JP');
    } else {
      badge.hidden = true;
      total.textContent = 'カートは空です';
    }
  };

  // クリックでカートへ
  btn.addEventListener('click', () => {
    // もしアプリ内遷移があるならここで差し替え
    location.href = cartHref;
  });

  // 変更を拾う（アプリ側が発火できるよう custom event も待機）
  window.addEventListener('storage', (e) => {
    if (e.key === 'cart' || e.key === 'lf_cart' || e.key === 'basket') update();
  });
  document.addEventListener('cart:updated', update);

  update();
}
