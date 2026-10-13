/* ============================================================================
 * FASIH Batch — panel generik di halaman fasih-sm.bps.go.id (MAIN world).
 * ----------------------------------------------------------------------------
 * Panel tidak tahu apa pun tentang jenis update. Logika & kolom sheet datang dari
 * file batch-automation.js yang di-import lewat tombol "Import script". File itu
 * mendaftarkan diri dengan:
 *
 *   FASIH_BATCH.register({
 *     id, name, description,
 *     columns:  [{ key, title?, type?: 'text'|'uuid'|'number'|'integer', required?, unique?, width?, mono?, trim? }],
 *     idColumn: 'assignment_id',          // dipakai FASIH.init() & backup; default kolom uuid pertama
 *     options:  [{ key, label, type: 'checkbox'|'number'|'text'|'select', default, choices? }],
 *     remarks:  [{ dataKey, key?, title?, width? }],   // opsional; kolom remark muncul saat toggle Remark aktif
 *     validateRow(row)  -> null | 'pesan' | { kolom: 'pesan' },
 *     before(rows, ctx), after(results, ctx),            // opsional
 *     async process(row, ctx) -> { skip?, status?, code?, ket?, remarkKeys? },
 *   })
 *   ctx = { dryRun, options, FASIH, index, total, rowNumber, sleep, remarks }
 *
 * Remark: kalau toggle Remark aktif, tiap sel remark yang terisi ditulis sebagai catatan
 * per-pertanyaan lewat FASIH.setComment(id, dataKey, teks) setelah process() berhasil
 * (bukan LEWATI/GAGAL). Teks yang sama persis di dataKey itu tidak ditulis dua kali.
 * ctx.remarks = remark terisi di baris itu [{ dataKey, text }] ([] kalau toggle mati).
 * Field roster (dataKey#n): process() mengembalikan remarkKeys { dataKey: 'dataKey#n' }
 * supaya catatan ditulis ke baris yang benar, mis. { nama_usaha: 'nama_usaha#1001' }.
 *
 * Kode script dijalankan dengan AsyncFunction (butuh 'unsafe-eval' di CSP halaman);
 * kalau CSP menolak, dijalankan lewat chrome.userScripts (bridge.js + background.js).
 *
 * Menu di header: "Automation" (sheet + script di atas) dan "Restore" (kembalikan
 * assignment ke isi file backup .json dari FASIH.backup / "Backup sebelum LIVE").
 * ==========================================================================*/

(() => {
  if (window.FASIH_BATCH) return;
  const F = () => (typeof FASIH !== 'undefined' ? FASIH : window.FASIH);

  /* ---------------- penyimpanan (localStorage origin FASIH) ---------------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[FASIH_BATCH] gagal menyimpan', k, e); } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const K = { code: 'fasih-batch:code', rows: (id) => `fasih-batch:rows:${id}`, settings: (id) => `fasih-batch:settings:${id}`,
              view: 'fasih-batch:view', restore: 'fasih-batch:restore-settings' };

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BASE = { jeda: 5000, backup: false, remark: false };
  const SETTINGS_V = 2;      // v2: default backup jadi tidak dicentang — pengaturan lama dibuang nilai backup-nya
  const RESULT_COLS = [
    { key: '_status', title: 'status', width: 90 },
    { key: '_code', title: 'code_identity', width: 210, mono: true },
    { key: '_ket', title: 'keterangan', width: 520 },
  ];
  const STATUS_CLASS = { 'OK': 'st-ok', 'DRY RUN': 'st-dry', 'LEWATI': 'st-skip', 'GAGAL': 'st-fail', 'PROSES…': 'st-run', 'ANTRI': 'st-queue' };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let mod = null, sheet = null, S = { ...BASE }, running = false, abort = false, invalid = new Map(), regCount = 0;
  let rsheet = null, rfile = null, rinvalid = new Map();     // menu Restore: sheet, file backup { name, createdAt, items: Map }, baris tidak valid

  /* ---------------- DOM (shadow root, terisolasi dari CSS halaman) ---------------- */
  const host = document.createElement('div');
  host.id = 'fasih-batch-host';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; height: 40px; padding: 0 16px;
         border: 0; border-radius: 20px; background: #188038; color: #fff; font: 600 13px Arial, sans-serif;
         box-shadow: 0 2px 8px rgba(0,0,0,.3); cursor: pointer; }
  .fab:hover { background: #137333; }
  .fab[hidden], .panel[hidden], [hidden] { display: none !important; }
  .panel { position: fixed; inset: 16px; z-index: 2147483001; display: flex; flex-direction: column; overflow: hidden;
           background: #fff; color: #202124; font: 13px/1.4 Arial, sans-serif; border-radius: 8px;
           box-shadow: 0 8px 40px rgba(0,0,0,.35); }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #dadce0; }
  header .logo { width: 22px; height: 22px; border-radius: 4px; background: #188038; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 12px; flex: none; }
  header .title { font-size: 15px; font-weight: 700; white-space: nowrap; }
  header .sub { color: #5f6368; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  header .sub b { color: #202124; }
  nav.menu { display: flex; gap: 2px; flex: none; }
  nav.menu button { height: 30px; padding: 0 12px; border: 0; border-radius: 4px; background: none; color: #3c4043;
                    font: 500 13px Arial, sans-serif; cursor: pointer; }
  nav.menu button:hover:not(:disabled) { background: #f1f3f4; }
  nav.menu button.on { background: #e6f4ea; color: #137333; font-weight: 700; }
  nav.menu button:disabled { opacity: .45; cursor: default; }
  .hdr-auto { display: contents; }
  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  header .script { color: #3c4043; background: #f1f3f4; border-radius: 12px; padding: 3px 10px; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
  .spacer { flex: 1; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 14px; background: #f8f9fa; border-bottom: 1px solid #dadce0; }
  .toolbar label { display: inline-flex; align-items: center; gap: 4px; color: #3c4043; white-space: nowrap; }
  .toolbar input[type=number], .toolbar input[type=text], .toolbar select { height: 26px; padding: 0 6px; border: 1px solid #dadce0; border-radius: 4px; font: inherit; background: #fff; }
  .toolbar input[type=number] { width: 80px; }
  .opts { display: contents; }
  .sep { width: 1px; height: 22px; background: #dadce0; }
  button.b { height: 30px; padding: 0 14px; border-radius: 4px; border: 1px solid #dadce0; background: #fff; color: #3c4043; font: 500 13px Arial, sans-serif; cursor: pointer; white-space: nowrap; }
  button.b:hover:not(:disabled) { background: #f1f3f4; }
  button.b:disabled { opacity: .45; cursor: default; }
  button.dry { border-color: #1a73e8; color: #1a73e8; }
  button.live { border-color: #d93025; background: #d93025; color: #fff; }
  button.live:hover:not(:disabled) { background: #b3261e; }
  button.x { border: 0; background: none; font-size: 18px; color: #5f6368; cursor: pointer; width: 32px; height: 32px; border-radius: 16px; flex: none; }
  button.x:hover { background: #f1f3f4; }
  .hint { padding: 6px 14px; color: #5f6368; border-bottom: 1px solid #dadce0; }
  kbd { font: 11px monospace; padding: 1px 4px; border: 1px solid #dadce0; border-radius: 3px; background: #f8f9fa; }
  code { font: 12px Consolas, monospace; background: #f1f3f4; padding: 1px 4px; border-radius: 3px; }
  .grid { flex: 1; min-height: 0; display: flex; }
  .empty { margin: auto; max-width: 520px; text-align: center; color: #3c4043; padding: 24px; }
  .empty .big { font-size: 40px; color: #188038; }
  .empty p { color: #5f6368; line-height: 1.6; }
  footer { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-top: 1px solid #dadce0; background: #f8f9fa; min-height: 38px; }
  .summary { color: #3c4043; white-space: nowrap; }
  .progress { width: 160px; height: 6px; border-radius: 3px; background: #e8eaed; overflow: hidden; flex: none; }
  .progress div { height: 100%; width: 0; background: #1a73e8; transition: width .2s; }
  .msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3c4043; }
  .msg.err { color: #d93025; font-weight: 600; }

  /* ---- grid ---- */
  .sheet { flex: 1; overflow: auto; position: relative; }
  .sheet table { border-collapse: separate; border-spacing: 0; table-layout: fixed; width: max-content; user-select: none; }
  .sheet th, .sheet td { height: 23px; padding: 0 6px; border-right: 1px solid #e2e3e3; border-bottom: 1px solid #e2e3e3;
                         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; cursor: cell; }
  .sheet thead th { position: sticky; top: 0; z-index: 2; background: #f8f9fa; color: #3c4043; font-weight: 400; text-align: left; border-bottom-color: #c0c0c0; cursor: default; }
  .sheet thead th .letter { color: #80868b; margin-right: 6px; font-size: 11px; }
  .sheet th.rn, .sheet th.corner { position: sticky; left: 0; z-index: 1; background: #f8f9fa; color: #5f6368; text-align: center; font-size: 11px; border-right-color: #c0c0c0; cursor: default; }
  .sheet th.corner { z-index: 3; }
  .sheet th.hl { background: #d3e3fd; color: #0b57d0; font-weight: 600; }
  .sheet td.mono { font-family: Consolas, 'Roboto Mono', monospace; font-size: 12px; }
  .sheet td.ro { background: #fafafa; color: #5f6368; }
  .sheet td.invalid { background: #fce8e6; }
  .sheet td.st-ok { color: #188038; font-weight: 600; }
  .sheet td.st-dry { color: #1a73e8; font-weight: 600; }
  .sheet td.st-skip { color: #80868b; font-weight: 600; }
  .sheet td.st-fail { color: #d93025; font-weight: 600; }
  .sheet td.st-run { color: #b06000; font-weight: 600; background: #fef7e0; }
  .sheet td.st-queue { color: #9aa0a6; }
  .sheet td.err-text { color: #d93025; }
  .sheet td.sel { background-color: #e8f0fe; }
  .sheet td.invalid.sel { background-color: #f6d6d3; }
  .sheet td.active { outline: 2px solid #1a73e8; outline-offset: -2px; }
  .sheet td.editing { padding: 0 4px; outline: 2px solid #1a73e8; outline-offset: -2px; background: #fff; }
  .sheet td input { width: 100%; height: 100%; border: 0; outline: 0; padding: 0; font: inherit; background: #fff; color: inherit; }
  .sheet .kb { position: fixed; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; resize: none; }
</style>
<button class="fab" title="FASIH Batch">⊞ FASIH Batch</button>
<div class="panel" hidden>
  <header>
    <span class="logo">⊞</span><span class="title">FASIH Batch</span>
    <nav class="menu">
      <button data-view="auto" title="Update massal lewat script batch-automation.js">Automation</button>
      <button data-view="restore" title="Kembalikan assignment ke isi file backup .json">Restore</button>
    </nav>
    <span class="sub"></span>
    <span class="spacer"></span>
    <span class="hdr-auto">
      <span class="script" hidden></span>
      <button class="b" data-act="template" title="Unduh template batch-automation.js untuk dikembangkan">Download template</button>
      <button class="b" data-act="import" title="Pilih file batch-automation.js">Import script</button>
      <button class="b" data-act="unload" hidden title="Lepas script (data sheet tetap tersimpan)">Lepas</button>
    </span>
    <button class="x" data-act="close" title="Tutup (data tetap tersimpan)">✕</button>
    <input type="file" class="f-script" accept=".js,text/javascript" hidden>
    <input type="file" class="f-backup" accept=".json,application/json" hidden>
  </header>
  <div class="view v-auto">
  <div class="toolbar" hidden>
    <button class="b dry" data-act="dry">Dry run</button>
    <button class="b live" data-act="live">Jalankan LIVE</button>
    <button class="b" data-act="stop" disabled>Stop</button>
    <span class="sep"></span>
    <label>Jeda <input type="number" data-set="jeda" min="0" step="500"> ms</label>
    <label class="backup-opt"><input type="checkbox" data-set="backup"> Backup sebelum LIVE</label>
    <label class="remark-opt"><input type="checkbox" data-set="remark"> Remark</label>
    <span class="opts"></span>
    <span class="spacer"></span>
    <button class="b" data-act="resetStatus" title="Kosongkan kolom status, code_identity, keterangan">Hapus status</button>
    <button class="b" data-act="clear">Kosongkan</button>
  </div>
  <div class="hint" hidden></div>
  <div class="grid">
    <div class="empty">
      <div class="big">⊞</div>
      <b>Belum ada script batch</b>
      <p>Klik <b>Import script</b> lalu pilih file <code>batch-automation.js</code>.<br>
         Kolom sheet dan proses per baris diambil dari <code>FASIH_BATCH.register({...})</code> di file itu.<br>
         Belum punya? Unduh template, ubah bagian bertanda <code>TODO</code>, lalu import.</p>
      <button class="b" data-act="template">Download template</button>
      <button class="b dry" data-act="import">Import script</button>
    </div>
  </div>
  </div>
  <div class="view v-restore" hidden>
    <div class="toolbar" hidden>
      <button class="b" data-act="rfile" title="Ganti file backup .json">Pilih file backup</button>
      <span class="sep"></span>
      <button class="b dry" data-act="rdry">Dry run</button>
      <button class="b live" data-act="rlive">Restore LIVE</button>
      <button class="b" data-act="rstop" disabled>Stop</button>
      <span class="sep"></span>
      <label>Jeda <input type="number" data-rset="jeda" min="0" step="500"> ms</label>
      <label title="Unduh fasih-backup-sebelum-restore-*.json berisi kondisi record saat ini, supaya restore bisa dibatalkan"><input type="checkbox" data-rset="backup"> Backup kondisi sekarang sebelum LIVE</label>
      <span class="spacer"></span>
      <button class="b" data-act="rresetStatus" title="Kosongkan kolom status, versi, keterangan">Hapus status</button>
      <button class="b" data-act="rclose" title="Tutup file backup">Tutup file</button>
    </div>
    <div class="hint" hidden></div>
    <div class="grid">
      <div class="empty">
        <div class="big">⟲</div>
        <b>Belum ada file backup</b>
        <p>Pilih file <code>fasih-backup-*.json</code> (dari <b>Backup sebelum LIVE</b> atau <code>FASIH.backup</code>).<br>
           Tiap assignment di file dikembalikan ke isi backup: jawaban, catatan, dan kolom data1–data10.</p>
        <button class="b dry" data-act="rfile">Pilih file backup</button>
      </div>
    </div>
  </div>
  <footer><span class="summary"></span><div class="progress"><div></div></div><span class="msg"></span></footer>
</div>`;

  const $ = (s) => root.querySelector(s);
  const A = (s) => root.querySelector(`.v-auto ${s}`), R = (s) => root.querySelector(`.v-restore ${s}`);
  const panel = $('.panel'), fab = $('.fab'), fileInput = $('.f-script'), empty = A('.empty');
  let view = 'auto';                                    // menu aktif: 'auto' | 'restore'

  /* ---------------- status bar ---------------- */
  function msg(text, kind = '') { const m = $('.msg'); m.textContent = text; m.className = 'msg ' + kind; m.title = text; }
  function progress(done, total) { $('.progress div').style.width = total ? `${(done / total) * 100}%` : '0'; }

  /* ---------------- definisi script ---------------- */
  function normalize(def) {
    if (!def || typeof def !== 'object') throw new Error('register() butuh objek definisi');
    if (!def.id) throw new Error('definisi butuh "id"');
    if (!Array.isArray(def.columns) || !def.columns.length) throw new Error('definisi butuh "columns" (minimal 1 kolom)');
    if (typeof def.process !== 'function') throw new Error('definisi butuh fungsi "process(row, ctx)"');
    const keys = new Set();
    const columns = def.columns.map((c) => {
      const col = typeof c === 'string' ? { key: c } : { ...c };
      if (!col.key || String(col.key).startsWith('_')) throw new Error(`kolom tidak valid: ${JSON.stringify(c)} (key wajib, tidak boleh diawali "_")`);
      if (keys.has(col.key)) throw new Error(`kolom ganda: ${col.key}`);
      keys.add(col.key);
      const type = col.type || 'text';
      if (!['text', 'uuid', 'number', 'integer'].includes(type)) throw new Error(`kolom ${col.key}: type "${type}" tidak dikenal`);
      return { key: col.key, title: col.title || col.key, type, required: !!col.required, unique: !!col.unique, editable: true,
               width: col.width || (type === 'uuid' ? 290 : type === 'text' ? 240 : 120),
               mono: col.mono ?? type === 'uuid', trim: col.trim ?? type !== 'text' };
    });
    const idColumn = def.idColumn === null ? null
      : def.idColumn || (columns.find((c) => c.type === 'uuid') || {}).key || null;
    if (idColumn && !keys.has(idColumn)) throw new Error(`idColumn "${idColumn}" tidak ada di columns`);
    const options = (def.options || []).map((o) => {
      if (!o || !o.key || o.key in BASE || o.key === '_v') throw new Error(`opsi tidak valid: ${JSON.stringify(o)} (key wajib, bukan "jeda"/"backup"/"remark")`);
      return { type: 'checkbox', ...o, label: o.label || o.key };
    });
    const remarks = (def.remarks || []).map((rm) => {
      const x = typeof rm === 'string' ? { dataKey: rm } : { ...rm };
      if (!x || !x.dataKey) throw new Error(`remark tidak valid: ${JSON.stringify(rm)} (dataKey wajib)`);
      x.key = x.key || `remark_${x.dataKey}`;
      if (String(x.key).startsWith('_')) throw new Error(`remark ${x.dataKey}: key tidak boleh diawali "_"`);
      if (keys.has(x.key)) throw new Error(`kolom ganda: ${x.key} (remark bentrok dengan kolom lain)`);
      keys.add(x.key);
      return { key: x.key, dataKey: String(x.dataKey), title: x.title || `remark ${x.dataKey}`, type: 'text', required: false,
               unique: false, editable: true, width: x.width || 260, mono: false, trim: true };
    });
    if (remarks.length && !idColumn) throw new Error('remarks butuh idColumn (assignment id) untuk FASIH.setComment');
    return { ...def, name: def.name || def.id, description: def.description || '', columns, idColumn, options, remarks };
  }

  function register(def) {
    if (running) throw new Error('FASIH_BATCH sedang berjalan — tunggu selesai atau Stop dulu');
    const m = normalize(def);
    if (sheet) { saveNow(); sheet.destroy(); sheet = null; }
    mod = m; regCount++;
    const defaults = Object.fromEntries(m.options.map((o) => [o.key, o.default ?? (o.type === 'checkbox' ? false : '')]));
    const saved = LS.get(K.settings(m.id), {});
    if (saved._v !== SETTINGS_V) delete saved.backup;      // pengaturan versi lama selalu menyimpan backup: true (default lama)
    S = { ...BASE, ...defaults, ...saved, _v: SETTINGS_V };
    buildUI();
    console.log(`[FASIH_BATCH] terdaftar: ${m.name} — kolom ${m.columns.map((c) => c.key).join(', ')}`);
    return m;
  }

  function unload() {
    if (running) return;
    if (sheet) { saveNow(); sheet.destroy(); sheet = null; }
    mod = null;
    LS.del(K.code);
    buildUI();
    msg('Script dilepas. Data sheet tetap tersimpan dan muncul lagi saat script yang sama di-import.');
  }

  /* ---------------- tampilan sesuai script ---------------- */
  const remarkOn = () => !!(mod && mod.remarks.length && S.remark);
  const inputCols = () => (remarkOn() ? [...mod.columns, ...mod.remarks] : mod.columns);

  function buildUI() {
    if (sheet) { saveNow(); sheet.destroy(); sheet = null; }
    const has = !!mod;
    headerSub();
    A('.toolbar').hidden = !has; A('.hint').hidden = !has; empty.hidden = has;
    $('[data-act="unload"]').hidden = !has;
    const saved = LS.get(K.code, null), chip = $('.script');
    chip.hidden = !(has && saved);
    if (has && saved) {
      chip.textContent = `📄 ${saved.name}`;
      chip.title = `${saved.name} — di-import ${new Date(saved.importedAt).toLocaleString()}`;
    }
    if (view === 'auto') progress(0, 0);
    if (!has) { if (view === 'auto') $('.summary').textContent = ''; return; }

    $('.backup-opt').hidden = !mod.idColumn;
    const ro = $('.remark-opt');
    ro.hidden = !mod.remarks.length;
    ro.title = mod.remarks.length
      ? `Tampilkan kolom remark; sel yang terisi ditulis sebagai catatan (FASIH.setComment) ke: ${mod.remarks.map((x) => x.dataKey).join(', ')}`
      : '';
    $('.opts').innerHTML = mod.options.map((o) => {
      const tip = o.hint ? ` title="${esc(o.hint)}"` : '';
      if (o.type === 'checkbox') return `<label${tip}><input type="checkbox" data-set="${esc(o.key)}"> ${esc(o.label)}</label>`;
      if (o.type === 'select') return `<label${tip}>${esc(o.label)} <select data-set="${esc(o.key)}">${(o.choices || []).map((c) => {
        const v = typeof c === 'object' ? c.value : c, l = typeof c === 'object' ? (c.label ?? c.value) : c;
        return `<option value="${esc(v)}">${esc(l)}</option>`;
      }).join('')}</select></label>`;
      return `<label${tip}>${esc(o.label)} <input type="${o.type === 'number' ? 'number' : 'text'}" data-set="${esc(o.key)}"></label>`;
    }).join('');
    root.querySelectorAll('[data-set]').forEach((inp) => {
      const v = S[inp.dataset.set];
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v ?? '';
    });
    const input = inputCols();
    A('.hint').innerHTML = `Klik sel <b>A1</b> lalu <kbd>Ctrl</kbd>+<kbd>V</kbd> dari Excel — ${input.length} kolom: ` +
      input.map((c) => `<b>${esc(c.title)}</b>${c.required ? '' : ' <i>(opsional)</i>'}`).join(', ') +
      `. Baris judul otomatis dilewati. Sel merah = tidak valid (arahkan kursor untuk alasannya). <kbd>Ctrl</kbd>+<kbd>C</kbd> menyalin hasil kembali ke Excel.` +
      (remarkOn() ? ` Remark yang terisi ditulis sebagai catatan per-pertanyaan setelah baris berhasil diproses.` : '');

    sheet = new FasihSheet(A('.grid'), {
      columns: [...input, ...RESULT_COLS],
      cellClass: (row, key, r) => {
        if (key === '_status') return STATUS_CLASS[row._status] || '';
        if (key === '_ket' && row._status === 'GAGAL') return 'err-text';
        return invalid.has(r) && invalid.get(r).has(key) ? 'invalid' : '';
      },
      cellTitle: (row, key, r) => (invalid.has(r) && invalid.get(r).has(key) ? `${key}: ${invalid.get(r).get(key)}` : ''),
      onChange: (changedRows) => {
        for (const r of changedRows) Object.assign(sheet.rows[r], { _status: '', _code: '', _ket: '' });   // isi berubah -> hasil lama basi
        summary(); save();
      },
    });
    sheet.setRows(LS.get(K.rows(mod.id), []).map((r) => ({ ...r, _status: ['ANTRI', 'PROSES…'].includes(r._status) ? '' : r._status })));
    summary(); sheet.render();
    if (!panel.hidden && view === 'auto') sheet.focus();
  }

  /* judul tetap "FASIH Batch"; di sampingnya nama script / file backup sesuai menu aktif */
  function headerSub() {
    const sub = $('.sub');
    if (view === 'auto') sub.innerHTML = mod ? `<b>${esc(mod.name)}</b>${mod.description ? ` — ${esc(mod.description)}` : ''}` : '';
    else sub.innerHTML = rfile ? `<b>📄 ${esc(rfile.name)}</b> — ${rfile.items.size} record` +
      (rfile.createdAt ? `, dibuat ${esc(new Date(rfile.createdAt).toLocaleString())}` : '') : '';
    sub.title = sub.textContent;
  }

  /* ---------------- simpan data sheet per script ---------------- */
  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    if (!mod || !sheet) return;
    const keys = [...mod.columns, ...mod.remarks, ...RESULT_COLS].map((c) => c.key);   // remark tetap disimpan walau toggle mati
    LS.set(K.rows(mod.id), sheet.filled().map(({ row }) => Object.fromEntries(keys.map((k) => [k, row[k] ?? '']))));
    LS.set(K.settings(mod.id), S);
  }
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); };

  /* ---------------- validasi ---------------- */
  function itemOf(row) {
    return Object.fromEntries(mod.columns.map((c) => {
      const s = String(row[c.key] ?? '');
      if (c.type === 'number' || c.type === 'integer') return [c.key, s.trim() === '' ? null : Number(s.trim().replace(',', '.'))];
      return [c.key, s];
    }));
  }
  function validate() {
    invalid = new Map();
    const mark = (r, k, why) => { if (!invalid.has(r)) invalid.set(r, new Map()); if (!invalid.get(r).has(k)) invalid.get(r).set(k, why); };
    const seen = Object.fromEntries(mod.columns.filter((c) => c.unique).map((c) => [c.key, new Map()]));
    const items = [];
    for (const { r, row } of sheet.filled()) {
      for (const c of mod.columns) {
        const s = String(row[c.key] ?? '').trim();
        if (!s) { if (c.required) mark(r, c.key, 'wajib diisi'); continue; }
        if (c.type === 'uuid' && !UUID.test(s)) mark(r, c.key, 'bukan UUID');
        if (c.type === 'number' && !Number.isFinite(Number(s.replace(',', '.')))) mark(r, c.key, 'bukan angka');
        if (c.type === 'integer' && !/^-?\d+$/.test(s)) mark(r, c.key, 'bukan bilangan bulat');
        if (c.unique) {
          const k = s.toLowerCase(), m = seen[c.key];
          if (m.has(k)) { mark(r, c.key, `ganda dengan baris ${m.get(k) + 1}`); mark(m.get(k), c.key, `ganda dengan baris ${r + 1}`); }
          else m.set(k, r);
        }
      }
      const item = itemOf(row);
      if (mod.validateRow && !invalid.has(r)) {
        try {
          const e = mod.validateRow(item);
          if (typeof e === 'string' && e) mark(r, mod.columns[0].key, e);
          else if (e && typeof e === 'object') for (const [k, why] of Object.entries(e)) if (why) mark(r, mod.columns.some((c) => c.key === k) ? k : mod.columns[0].key, String(why));
        } catch (e) { mark(r, mod.columns[0].key, `validateRow error: ${e.message}`); }
      }
      items.push({ r, item });
    }
    return { items: items.filter((x) => !invalid.has(x.r)), bad: invalid.size, total: items.length };
  }
  function summary() {
    if (!mod || !sheet) return;
    const v = validate(), cnt = {};
    for (const { row } of sheet.filled()) if (row._status) cnt[row._status] = (cnt[row._status] || 0) + 1;
    const parts = [`${v.total} baris`, `${v.items.length} valid`];
    if (v.bad) parts.push(`${v.bad} tidak valid`);
    const st = Object.keys(cnt).filter((k) => !['ANTRI', 'PROSES…'].includes(k)).map((k) => `${k} ${cnt[k]}`);
    if (view === 'auto') $('.summary').textContent = parts.join(' · ') + (st.length ? '  |  ' + st.join(' · ') : '');
    return v;
  }

  /* ---------------- proses ---------------- */
  function setStatus(r, status, code, ket) {
    const row = sheet.rows[r];
    row._status = status;
    if (code !== undefined) row._code = code == null ? '' : String(code);
    if (ket !== undefined) row._ket = ket == null ? '' : String(ket);
    sheet.renderRow(r);
  }
  function setRunning(on) {
    running = on; if (sheet) sheet.locked = on; if (rsheet) rsheet.locked = on;
    root.querySelectorAll('[data-act="dry"],[data-act="live"],[data-act="clear"],[data-act="resetStatus"],[data-act="import"],[data-act="unload"],[data-set],' +
      '[data-act="rfile"],[data-act="rdry"],[data-act="rlive"],[data-act="rresetStatus"],[data-act="rclose"],[data-rset],[data-view]')
      .forEach((b) => { b.disabled = on; });
    root.querySelectorAll('[data-act="stop"],[data-act="rstop"]').forEach((b) => { b.disabled = !on; });
  }
  const sleep = async (ms) => { const end = Date.now() + ms; while (!abort && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now()))); };
  const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const errText = (e) => String((e && e.message) || e);

  /* remark terisi di satu baris sheet: [{ dataKey, text }] */
  const remarksOf = (row) => mod.remarks
    .map((rm) => ({ dataKey: rm.dataKey, text: String(row[rm.key] ?? '').trim() }))
    .filter((x) => x.text);

  /* Tulis remark lewat FASIH.setComment (satu submit per remark). Teks yang sudah ada
     persis di dataKey yang sama dilewati supaya LIVE ulang tidak menggandakan catatan. */
  async function applyRemarks(id, list, dry, remarkKeys = null) {
    const out = [];
    for (const rm of list) {
      const text = rm.text;
      const dataKey = (remarkKeys && remarkKeys[rm.dataKey]) || rm.dataKey;   // mis. nama_usaha -> nama_usaha#1001
      const asg = await F().getAssignment(id);
      let notes = [];
      try { notes = JSON.parse(asg.comment || '{}').notes || []; } catch {}
      const ada = notes.some((n) => n && n.dataKey === dataKey && (n.comments || []).some((c) => c && c.comment === text));
      if (ada) { out.push(`${dataKey} (sudah ada)`); continue; }
      const r = await F().setComment(id, dataKey, text, { dryRun: dry });
      out.push(dry ? dataKey : `${dataKey} v${r.version} → v${r.versionAfter}`);
    }
    return out;
  }

  async function run(dry) {
    if (running || !mod) return;
    if (sheet.edit) sheet.commitEdit();
    const v = summary(); sheet.render();
    if (!v.total) return msg('Belum ada data — tempel dari Excel dulu.', 'err');
    if (v.bad) {
      const contoh = [...invalid.entries()].slice(0, 3)
        .map(([r, m]) => `baris ${r + 1}: ${[...m].map(([k, why]) => `${k} ${why}`).join(', ')}`).join('; ');
      return msg(`${v.bad} baris tidak valid — ${contoh}`, 'err');
    }
    const targets = dry ? v.items : v.items.filter((x) => sheet.rows[x.r]._status !== 'OK');
    if (!targets.length) return msg('Semua baris sudah OK.');
    const withRemark = remarkOn();
    for (const x of targets) x.remarks = withRemark ? remarksOf(sheet.rows[x.r]) : [];
    if (!dry) {
      const belumDry = targets.filter((x) => sheet.rows[x.r]._status !== 'DRY RUN').length;
      const nRemark = targets.reduce((n, x) => n + x.remarks.length, 0);
      if (!confirm(`[${mod.name}]\nKirim perubahan LIVE untuk ${targets.length} baris?` +
        (nRemark ? `\nRemark: ${nRemark} sel terisi — ditulis lewat FASIH.setComment untuk baris yang berhasil.` : '') +
        (belumDry ? `\n\n⚠️ ${belumDry} baris belum lolos dry run.` : '') +
        `\n\nServer tidak memvalidasi isi dokumen — pastikan hasil dry run sudah diperiksa.`)) return;
    }

    const m = mod, rows = targets.map((x) => x.item);
    const ctx = { dryRun: dry, options: { ...S }, FASIH: F(), sleep, total: targets.length };
    abort = false; setRunning(true);
    targets.forEach((x) => setStatus(x.r, 'ANTRI'));
    const results = [];
    let done = 0;
    try {
      msg('Menyiapkan…');
      if (m.before) await m.before(rows, ctx);
      else if (m.idColumn) await F().init({ assignmentId: rows[0][m.idColumn] });
      if (withRemark && F()._internal.SCHEMA) {        // dataKey remark salah ketik -> hentikan sebelum ada yang dikirim
        const dipakai = new Set(targets.flatMap((x) => x.remarks.map((y) => y.dataKey)));
        const salah = [...dipakai].filter((k) => !F().schema(k));
        if (salah.length) throw new Error(`dataKey remark tidak ada di template: ${salah.join(', ')} — periksa "remarks" di script`);
      }
      if (!dry && S.backup && m.idColumn) {
        msg(`Membuat backup ${rows.length} record…`);
        await F().backup(rows.map((x) => x[m.idColumn]), `fasih-backup-${m.id}-${stamp()}.json`);
      }
      for (let i = 0; i < targets.length && !abort; i++) {
        const { r, item, remarks } = targets[i];
        setStatus(r, 'PROSES…');
        msg(`${dry ? 'Dry run' : 'LIVE'} ${i + 1}/${targets.length}${m.idColumn ? ` — ${item[m.idColumn]}` : ''}`);
        try {
          const res = (await m.process(item, { ...ctx, index: i, rowNumber: r + 1, remarks })) || {};
          let status = res.status || (res.skip ? 'LEWATI' : dry ? 'DRY RUN' : 'OK'), ket = res.ket;
          if (remarks.length && !res.skip && status !== 'GAGAL') {
            try {
              const done = await applyRemarks(item[m.idColumn], remarks, dry, res.remarkKeys);
              ket = [ket, `remark: ${done.join(', ')}`].filter(Boolean).join(' · ');
            } catch (e) {
              status = 'GAGAL';
              ket = [ket, `${dry ? '' : 'data sudah diproses, '}remark GAGAL: ${errText(e)}`].filter(Boolean).join(' · ');
              console.warn(`[FASIH_BATCH] ${i + 1}/${targets.length} remark GAGAL`, item, e);
            }
          }
          setStatus(r, status, res.code, ket);
          results.push({ row: r + 1, item, remarks, status, result: res });
          console.log(`[FASIH_BATCH] ${i + 1}/${targets.length} ${status}`, item, res);
        } catch (e) {
          setStatus(r, 'GAGAL', undefined, errText(e));
          results.push({ row: r + 1, item, status: 'GAGAL', error: errText(e) });
          console.warn(`[FASIH_BATCH] ${i + 1}/${targets.length} GAGAL`, item, e);
        }
        done = i + 1; progress(done, targets.length); summary(); save();
        if (i < targets.length - 1) await sleep(S.jeda);
      }
      if (m.after) await m.after(results, ctx);
      msg(abort ? `Dihentikan setelah ${done}/${targets.length}.`
                : `${dry ? 'Dry run' : 'LIVE'} selesai — ${done} baris diproses.${dry ? ' Periksa hasilnya, lalu Jalankan LIVE.' : ''}`);
    } catch (e) {
      msg('Gagal: ' + errText(e), 'err');
      console.error('[FASIH_BATCH]', e);
    } finally {
      for (const { r } of targets) if (['ANTRI', 'PROSES…'].includes(sheet.rows[r]._status)) setStatus(r, '');
      setRunning(false); summary(); saveNow();
    }
  }

  /* ---------------- menu Restore: kembalikan assignment ke isi file backup ----------------
     File backup tidak disimpan di localStorage (bisa beberapa MB) — reload halaman = pilih file lagi.
     Sebelum restore, isi backup dibandingkan dengan kondisi sekarang; record yang sudah sama
     tidak dikirim (LEWATI) supaya versinya tidak naik percuma. */
  const RBASE = { jeda: 1500, backup: true };
  const RS = { ...RBASE, ...LS.get(K.restore, {}) };
  const RCOLS = [
    { key: 'assignment_id', title: 'assignment_id', width: 290, editable: true, mono: true, trim: true },
    { key: 'code', title: 'code_identity (backup)', width: 210, mono: true },
    { key: 'versi', title: 'versi backup', width: 95 },
    { key: 'jawaban', title: 'jawaban', width: 75 },
    { key: '_status', title: 'status', width: 90 },
    { key: '_ver', title: 'versi', width: 150, mono: true },
    { key: '_ket', title: 'keterangan', width: 520 },
  ];
  const rItem = (id) => (rfile && rfile.items.get(String(id ?? '').trim().toLowerCase())) || null;
  function rfill(row) {                                   // kolom read-only diambil dari file backup berdasarkan assignment_id
    const it = rItem(row.assignment_id);
    return Object.assign(row, { code: it ? it.code ?? '' : '', versi: it ? String(it.submit_version_code ?? '') : '', jawaban: it ? String(it.n) : '' });
  }

  function rbuild() {
    if (!rsheet) {
      rsheet = new FasihSheet(R('.grid'), {
        columns: RCOLS,
        cellClass: (row, key, r) => {
          if (key === '_status') return STATUS_CLASS[row._status] || '';
          if (key === '_ket' && row._status === 'GAGAL') return 'err-text';
          return key === 'assignment_id' && rinvalid.has(r) ? 'invalid' : '';
        },
        cellTitle: (row, key, r) => (key === 'assignment_id' && rinvalid.has(r) ? `assignment_id: ${rinvalid.get(r)}` : ''),
        onChange: (changedRows) => {
          for (const r of changedRows) Object.assign(rfill(rsheet.rows[r]), { _status: '', _ver: '', _ket: '' });
          rsummary();
        },
      });
    }
    const has = !!rfile;
    R('.toolbar').hidden = !has; R('.hint').hidden = !has; R('.empty').hidden = has; rsheet.el.hidden = !has;
    root.querySelectorAll('[data-rset]').forEach((inp) => {
      const v = RS[inp.dataset.rset];
      if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v ?? '';
    });
    R('.hint').innerHTML = `Semua assignment di file dimuat. Untuk restore sebagian: pilih sel <b>assignment_id</b> yang tidak perlu lalu <kbd>Delete</kbd>, ` +
      `atau <kbd>Ctrl</kbd>+<kbd>A</kbd> → <kbd>Delete</kbd> lalu tempel daftar assignment_id dari Excel. ` +
      `Restore menimpa <b>jawaban, catatan, dan kolom data1–data10</b> dengan isi backup — perubahan setelah backup dibuat akan hilang. ` +
      `Record yang sudah sama dengan backup dilewati.`;
    headerSub();
    if (view === 'restore') { rsummary(); rsheet.render(); if (!panel.hidden && has) rsheet.focus(); }
  }

  function rvalidate() {
    rinvalid = new Map();
    const seen = new Map(), items = [];
    for (const { r, row } of rsheet.filled()) {
      const id = String(row.assignment_id).trim(), k = id.toLowerCase();
      const why = !UUID.test(id) ? 'bukan UUID' : !rItem(id) ? 'tidak ada di file backup'
        : seen.has(k) ? `ganda dengan baris ${seen.get(k) + 1}` : '';
      if (why) rinvalid.set(r, why);
      else { seen.set(k, r); items.push({ r, it: rItem(id) }); }
    }
    return { items, bad: rinvalid.size, total: items.length + rinvalid.size };
  }
  function rsummary() {
    if (!rsheet || !rfile) { if (view === 'restore') $('.summary').textContent = ''; return null; }
    const v = rvalidate(), cnt = {};
    for (const { row } of rsheet.filled()) if (row._status) cnt[row._status] = (cnt[row._status] || 0) + 1;
    const parts = [`${v.total} baris`, `${v.items.length} valid`];
    if (v.bad) parts.push(`${v.bad} tidak valid`);
    const st = Object.keys(cnt).filter((k) => !['ANTRI', 'PROSES…'].includes(k)).map((k) => `${k} ${cnt[k]}`);
    if (view === 'restore') $('.summary').textContent = parts.join(' · ') + (st.length ? '  |  ' + st.join(' · ') : '');
    return v;
  }

  async function loadBackup(file) {
    if (!file || running) return;
    try {
      msg(`Membaca ${file.name}…`);
      let j;
      try { j = JSON.parse(await file.text()); } catch (e) { throw new Error(`bukan JSON yang valid (${e.message})`); }
      const list = Array.isArray(j) ? j : j && j.items;
      if (!Array.isArray(list) || !list.length) throw new Error('bukan file backup FASIH — tidak ada "items"');
      const items = new Map();
      let ganda = 0;
      list.forEach((it, i) => {
        const id = String((it && it.assignmentId) || '');
        if (!UUID.test(id)) throw new Error(`item ${i + 1}: assignmentId tidak valid`);
        let n;
        try { n = JSON.parse(it.data).answers.length; } catch { throw new Error(`item ${i + 1} (${id}): "data" bukan dokumen FASIH`); }
        if (items.has(id.toLowerCase())) { ganda++; return; }      // backup diambil sebelum diubah -> isi kembarannya sama
        items.set(id.toLowerCase(), { ...it, n });
      });
      rfile = { name: file.name, createdAt: Array.isArray(j) ? null : j.createdAt || null, items };
      rbuild();
      rsheet.setRows([...items.values()].map((it) => rfill({ assignment_id: it.assignmentId })));
      progress(0, 0); rsummary();
      msg(`${file.name} dimuat — ${items.size} assignment${ganda ? ` (${ganda} duplikat diabaikan)` : ''}. Klik Dry run untuk melihat apa yang akan dikembalikan.`);
    } catch (e) {
      msg(`Gagal membaca ${file.name}: ${errText(e)}`, 'err');
      console.error('[FASIH_BATCH] restore', e);
    }
  }
  const backupInput = $('.f-backup');
  backupInput.addEventListener('change', () => { loadBackup(backupInput.files[0]); backupInput.value = ''; });

  /* beda isi backup vs kondisi sekarang (dari sudut pandang restore) */
  const colVal = (v) => (v == null ? '' : String(v));
  function diffBackup(it, asg) {
    const map = (data) => new Map(JSON.parse(data).answers.map((a) => [a.dataKey, JSON.stringify(a.answer)]));
    const now = map(asg.data), old = map(it.data);
    let ubah = 0, kembali = 0, hapus = 0;
    for (const [k, v] of old) if (!now.has(k)) kembali++; else if (now.get(k) !== v) ubah++;
    for (const k of now.keys()) if (!old.has(k)) hapus++;
    const kolom = Object.keys(it.columns || {}).filter((k) => colVal(it.columns[k]) !== colVal(asg[k]));
    const catatan = it.comment != null && it.comment !== asg.comment;
    const text = [ubah && `${ubah} jawaban berubah`, kembali && `${kembali} jawaban dikembalikan`, hapus && `${hapus} jawaban dihapus`,
                  kolom.length && `kolom ${kolom.join(', ')}`, catatan && 'catatan'].filter(Boolean).join(', ');
    return { total: ubah + kembali + hapus + kolom.length + (catatan ? 1 : 0), text };
  }

  async function restoreOne(it, dry) {
    const asg = await F().getAssignment(it.assignmentId);
    if (it.survey_period_id && asg.survey_period_id && it.survey_period_id !== asg.survey_period_id)
      throw new Error(`survey period berbeda (backup ${it.survey_period_id}, sekarang ${asg.survey_period_id})`);
    const d = diffBackup(it, asg), ver = `v${asg.submit_version_code} (backup v${it.submit_version_code})`;
    if (!d.total) return { status: 'LEWATI', ver, ket: 'sudah sama dengan backup' };
    if (dry) return { status: 'DRY RUN', ver, ket: d.text };
    const [res] = await F().restore([it], { dryRun: false, delayMs: 0 });
    if (!res || res.ok === false) throw new Error((res && res.error) || 'restore gagal');
    return { status: 'OK', ver: `v${res.version} → v${res.versionAfter}`, ket: `dikembalikan: ${d.text}` };
  }

  function rsetStatus(r, status, ver, ket) {
    const row = rsheet.rows[r];
    row._status = status;
    if (ver !== undefined) row._ver = ver == null ? '' : String(ver);
    if (ket !== undefined) row._ket = ket == null ? '' : String(ket);
    rsheet.renderRow(r);
  }

  async function runRestore(dry) {
    if (running || !rfile) return;
    if (rsheet.edit) rsheet.commitEdit();
    const v = rsummary(); rsheet.render();
    if (!v.total) return msg('Tidak ada assignment_id untuk direstore.', 'err');
    if (v.bad) {
      const contoh = [...rinvalid].slice(0, 3).map(([r, why]) => `baris ${r + 1}: ${why}`).join('; ');
      return msg(`${v.bad} baris tidak valid — ${contoh}`, 'err');
    }
    const targets = dry ? v.items : v.items.filter((x) => rsheet.rows[x.r]._status !== 'OK');
    if (!targets.length) return msg('Semua baris sudah OK.');
    if (!dry) {
      const belumDry = targets.filter((x) => !['DRY RUN', 'LEWATI'].includes(rsheet.rows[x.r]._status)).length;
      if (!confirm(`[Restore] ${rfile.name}\nKembalikan ${targets.length} assignment ke isi backup (jawaban, catatan, kolom data1–data10)?` +
        `\n\nPerubahan apa pun setelah backup dibuat akan TERTIMPA.` +
        (belumDry ? `\n⚠️ ${belumDry} baris belum lolos dry run.` : '') +
        (RS.backup ? '' : `\n⚠️ "Backup kondisi sekarang" tidak dicentang — restore ini tidak bisa dibatalkan.`))) return;
    }

    abort = false; setRunning(true);
    targets.forEach((x) => rsetStatus(x.r, 'ANTRI'));
    let done = 0;
    try {
      if (!dry && RS.backup) {
        msg(`Membuat backup kondisi sekarang ${targets.length} record…`);
        await F().backup(targets.map((x) => x.it.assignmentId), `fasih-backup-sebelum-restore-${stamp()}.json`);
      }
      for (let i = 0; i < targets.length && !abort; i++) {
        const { r, it } = targets[i];
        rsetStatus(r, 'PROSES…');
        msg(`${dry ? 'Dry run' : 'Restore'} ${i + 1}/${targets.length} — ${it.assignmentId}`);
        try {
          const res = await restoreOne(it, dry);
          rsetStatus(r, res.status, res.ver, res.ket);
          console.log(`[FASIH_BATCH] restore ${i + 1}/${targets.length} ${res.status}`, it.assignmentId, res);
        } catch (e) {
          rsetStatus(r, 'GAGAL', undefined, errText(e));
          console.warn(`[FASIH_BATCH] restore ${i + 1}/${targets.length} GAGAL`, it.assignmentId, e);
        }
        done = i + 1; progress(done, targets.length); rsummary();
        if (i < targets.length - 1) await sleep(RS.jeda);
      }
      msg(abort ? `Dihentikan setelah ${done}/${targets.length}.`
                : `${dry ? 'Dry run' : 'Restore'} selesai — ${done} baris diproses.${dry ? ' Periksa hasilnya, lalu Restore LIVE.' : ''}`);
    } catch (e) {
      msg('Gagal: ' + errText(e), 'err');
      console.error('[FASIH_BATCH] restore', e);
    } finally {
      for (const { r } of targets) if (['ANTRI', 'PROSES…'].includes(rsheet.rows[r]._status)) rsetStatus(r, '');
      setRunning(false); rsummary();
    }
  }

  /* ---------------- pindah menu ---------------- */
  function setView(v) {
    if (running) return;
    if (sheet && sheet.edit) sheet.commitEdit();
    if (rsheet && rsheet.edit) rsheet.commitEdit();
    view = v === 'restore' ? 'restore' : 'auto';
    LS.set(K.view, view);
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    $('.v-auto').hidden = view !== 'auto'; $('.v-restore').hidden = view !== 'restore'; $('.hdr-auto').hidden = view !== 'auto';
    $('.summary').textContent = ''; progress(0, 0); msg('');
    if (view === 'restore') rbuild();
    else { headerSub(); if (sheet) { sheet.render(); summary(); if (!panel.hidden) sheet.focus(); } }
  }

  /* ---------------- import script ---------------- */
  let bridgeSeq = 0;
  function askBridge(type, payload = {}, timeoutMs = 8000) {      // minta bridge.js (punya akses chrome.runtime)
    return new Promise((resolve, reject) => {
      const id = ++bridgeSeq;
      const t = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('extension tidak merespons')); }, timeoutMs);
      function on(e) {
        if (e.source !== window || !e.data || e.data.__fasihBatch !== `${type}-result` || e.data.id !== id) return;
        clearTimeout(t); window.removeEventListener('message', on);
        e.data.ok ? resolve(e.data) : reject(new Error(e.data.error || `${type} gagal`));
      }
      window.addEventListener('message', on);
      window.postMessage({ __fasihBatch: type, id, ...payload }, '*');
    });
  }
  /* CSP menolak eval -> minta background menjalankan lewat chrome.userScripts */
  const viaExtension = (code) => askBridge('exec', { code });

  /* Template batch-automation.js ada di extension (web_accessible_resources) */
  async function downloadTemplate() {
    try {
      const { url } = await askBridge('template-url', {}, 3000);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`template ${r.status}`);
      const blob = new Blob([await r.text()], { type: 'text/javascript' });
      const u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = 'batch-automation.js';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      msg('Template diunduh sebagai batch-automation.js — ubah bagian TODO, lalu Import script.');
    } catch (e) {
      msg(`Gagal mengunduh template: ${errText(e)}`, 'err');
    }
  }
  let lastLoadError = null;
  async function runCode(code, name) {
    const before = regCount;
    const tag = `\n//# sourceURL=fasih-batch:///${String(name).replace(/[^\w.\- ]/g, '_')}`;
    let fn = null;
    try { fn = new AsyncFunction('FASIH', 'FASIH_BATCH', code + tag); }
    catch (e) {
      if (e instanceof SyntaxError) throw new Error(`syntax error di ${name}: ${e.message}`);
      console.warn('[FASIH_BATCH] eval ditolak CSP halaman, mencoba lewat chrome.userScripts:', e.message);
    }
    if (fn) await fn(F(), window.FASIH_BATCH);
    else {
      lastLoadError = null;
      await viaExtension(`(async function (FASIH_BATCH) {\n${code}\n}).call(window, window.FASIH_BATCH)` +
        `.catch((e) => window.postMessage({ __fasihBatch: 'load-error', error: String((e && e.message) || e) }, '*'));${tag}`);
      for (let i = 0; i < 40 && regCount === before && !lastLoadError; i++) await new Promise((r) => setTimeout(r, 100));
      if (lastLoadError) throw new Error(lastLoadError);
    }
    if (regCount === before) throw new Error(`${name} tidak memanggil FASIH_BATCH.register({...})`);
  }
  async function importFile(file) {
    if (!file || running) return;
    const prev = LS.get(K.code, null), modBefore = mod;
    try {
      const code = await file.text();
      msg(`Memuat ${file.name}…`);
      LS.set(K.code, { name: file.name, code, importedAt: new Date().toISOString() });   // disimpan dulu supaya chip nama file benar
      await runCode(code, file.name);
      msg(`${file.name} dimuat — ${mod.name}.`);
    } catch (e) {
      msg(`Gagal import ${file.name}: ${errText(e)}`, 'err');
      console.error('[FASIH_BATCH]', e);
      if (mod === modBefore) { if (prev) LS.set(K.code, prev); else LS.del(K.code); buildUI(); }   // script lama tetap aktif
    }
  }
  fileInput.addEventListener('change', () => { importFile(fileInput.files[0]); fileInput.value = ''; });

  /* ---------------- tombol & pengaturan ---------------- */
  const toggle = (show = panel.hidden) => {
    panel.hidden = !show; fab.hidden = show;
    if (!show) return;
    if (view === 'restore') { if (rsheet && rfile) { rsheet.render(); rsummary(); rsheet.focus(); } }
    else if (sheet) { sheet.render(); summary(); sheet.focus(); }
  };
  fab.addEventListener('click', () => toggle(true));
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav && !nav.disabled) return setView(nav.dataset.view);
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    const a = act.dataset.act;
    if (a === 'close') toggle(false);
    else if (a === 'rfile') backupInput.click();
    else if (a === 'rdry') runRestore(true);
    else if (a === 'rlive') runRestore(false);
    else if (a === 'rstop') { abort = true; msg('Menghentikan setelah baris yang sedang diproses…'); }
    else if (a === 'rresetStatus') {
      for (const { row } of rsheet.filled()) Object.assign(row, { _status: '', _ver: '', _ket: '' });
      rsheet.render(); rsummary(); progress(0, 0); msg('');
    } else if (a === 'rclose') {
      if (rsheet.filled().some(({ row }) => row._status) && !confirm('Tutup file backup? Kolom status hasil restore ikut hilang.')) return;
      rfile = null; rsheet.setRows([]); rbuild(); progress(0, 0); msg('');
    }
    else if (a === 'import') fileInput.click();
    else if (a === 'template') downloadTemplate();
    else if (a === 'unload') { if (confirm('Lepas script ini?')) unload(); }
    else if (a === 'dry') run(true);
    else if (a === 'live') run(false);
    else if (a === 'stop') { abort = true; msg('Menghentikan setelah baris yang sedang diproses…'); }
    else if (a === 'resetStatus') {
      for (const { row } of sheet.filled()) Object.assign(row, { _status: '', _code: '', _ket: '' });
      sheet.render(); summary(); save(); progress(0, 0); msg('');
    } else if (a === 'clear') {
      if (sheet.filled().length && !confirm('Kosongkan semua baris?')) return;
      sheet.setRows([]); summary(); save(); progress(0, 0); msg('');
    }
  });
  root.addEventListener('change', (e) => {
    const rinp = e.target.closest && e.target.closest('[data-rset]');
    if (rinp) {
      RS[rinp.dataset.rset] = rinp.type === 'checkbox' ? rinp.checked : Math.max(0, Number(rinp.value) || 0);
      return LS.set(K.restore, RS);
    }
    const inp = e.target.closest && e.target.closest('[data-set]');
    if (!inp) return;
    const k = inp.dataset.set;
    S[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Math.max(0, Number(inp.value) || 0) : inp.value;
    if (k === 'remark') {                                   // kolom remark muncul/hilang -> bangun ulang sheet
      if (sheet && sheet.edit) sheet.commitEdit();
      buildUI();
      msg(S.remark ? `Remark aktif — kolom ${mod.remarks.map((x) => x.title).join(', ')} ditambahkan.` : 'Remark nonaktif — isi kolom remark tetap tersimpan.');
    } else save();
  });
  ['keydown', 'keyup', 'keypress'].forEach((ev) => root.addEventListener(ev, (e) => {      // jangan bocor ke shortcut halaman
    if (e.target.matches && e.target.matches('[data-set],[data-rset]')) e.stopPropagation();
  }));
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__fasihBatch === 'toggle') toggle();                 // klik ikon extension
    if (e.data.__fasihBatch === 'load-error') lastLoadError = e.data.error;
  });
  window.addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });

  window.FASIH_BATCH = Object.freeze({ register, get current() { return mod; }, version: '1.2.0' });

  /* ---------------- muat ulang script terakhir ---------------- */
  buildUI();
  setView(LS.get(K.view, 'auto'));
  const saved = LS.get(K.code, null);
  if (saved && saved.code) {
    runCode(saved.code, saved.name).catch((e) => {
      msg(`Script tersimpan (${saved.name}) gagal dimuat: ${errText(e)} — import ulang.`, 'err');
      console.error('[FASIH_BATCH]', e);
    });
  }
})();
