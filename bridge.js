/* ============================================================================
 * Jembatan ISOLATED world <-> panel.js (MAIN world).
 * Halaman (MAIN world) tidak punya akses chrome.runtime, jadi pesan diteruskan
 * lewat window.postMessage. Permintaan { __fasihBatch: <type>, id, ... } dijawab
 * dengan { __fasihBatch: '<type>-result', id, ok, error?, ... }.
 *   - 'exec'         : jalankan kode batch-automation.js lewat chrome.userScripts
 *                      (cadangan bila CSP halaman menolak eval)
 *   - 'template-url' : URL template batch-automation.js di dalam extension
 *   - 'custom-sheet-url' : URL halaman FASIH Sheet (menu Custom automation)
 *   - klik ikon extension -> { __fasihBatch: 'toggle' }
 * ==========================================================================*/

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || typeof e.data.__fasihBatch !== 'string') return;
  const { __fasihBatch: type, id } = e.data;
  const reply = (ok, extra = {}) => window.postMessage({ __fasihBatch: `${type}-result`, id, ok, ...extra }, '*');

  if (type === 'template-url') {
    reply(true, { url: chrome.runtime.getURL('templates/batch-automation.template.js') });
  } else if (type === 'custom-sheet-url') {
    reply(true, { url: chrome.runtime.getURL('custom/sheet.html') });
  } else if (type === 'exec') {
    try {
      chrome.runtime.sendMessage({ type: 'exec-user-code', code: e.data.code }, (res) => {
        if (chrome.runtime.lastError) reply(false, { error: chrome.runtime.lastError.message });
        else reply(!!(res && res.ok), { error: res && res.error });
      });
    } catch (err) { reply(false, { error: String((err && err.message) || err) }); }
  }
});

chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === 'toggle') window.postMessage({ __fasihBatch: 'toggle' }, '*');
});
