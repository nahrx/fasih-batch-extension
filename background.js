/* Klik ikon extension -> buka/tutup panel (hanya ada di tab fasih-sm.bps.go.id) */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
});

/* Cadangan bila CSP halaman menolak eval: jalankan kode batch-automation.js di MAIN world
   lewat chrome.userScripts (Chrome 135+, perlu "Allow User Scripts" di detail extension). */
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || m.type !== 'exec-user-code' || !sender.tab) return;
  let api = null;
  try { api = chrome.userScripts; } catch {}
  if (!api || !api.execute) {
    reply({ ok: false, error: 'CSP halaman menolak eval dan chrome.userScripts tidak aktif — buka chrome://extensions, ' +
                              'Details pada extension ini, nyalakan "Allow User Scripts" (Chrome 135+), lalu reload halaman.' });
    return;
  }
  api.execute({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, world: 'MAIN', js: [{ code: m.code }] })
    .then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
