// web/js/app.js
import { CONFIG } from './config.js';
import { ensureIdToken, apiJSON } from './http.js';

const out = document.getElementById('out');
const log = (...a)=>{ out.textContent += a.join(' ') + "\n"; console.log(...a); };

// LIFF 初期化（外部ブラウザでもログイン誘導）
liff.init({ liffId: CONFIG.LIFF_ID, withLoginOnExternalBrowser: true })
    .then(()=>log('liff.init ok'))
    .catch(e=>log('liff.init error', e));

document.getElementById('btnWho').onclick = async () => {
  try {
    await ensureIdToken();
    const me = await apiJSON('/api/whoami');
    log('whoami:', JSON.stringify(me));
  } catch (e) {
    log('whoami failed:', e.status || '', e.message || e);
  }
};
