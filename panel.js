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
 *     validateRow(row)  -> null | 'pesan' | { kolom: 'pesan' },
 *     before(rows, ctx), after(results, ctx),            // opsional
 *     async process(row, ctx) -> { skip?, status?, code?, ket? },
 *   })
 *   ctx = { dryRun, options, FASIH, index, total, rowNumber, sleep }
 *
 * Kode script dijalankan dengan AsyncFunction (butuh 'unsafe-eval' di CSP halaman);
 * kalau CSP menolak, dijalankan lewat chrome.userScripts (bridge.js + background.js).
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
  const K = { code: 'fasih-batch:code', rows: (id) => `fasih-batch:rows:${id}`, settings: (id) => `fasih-batch:settings:${id}` };

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BASE = { jeda: 5000, backup: true };
  const RESULT_COLS = [
    { key: '_status', title: 'status', width: 90 },
    { key: '_code', title: 'code_identity', width: 210, mono: true },
    { key: '_ket', title: 'keterangan', width: 520 },
  ];
  const STATUS_CLASS = { 'OK': 'st-ok', 'DRY RUN': 'st-dry', 'LEWATI': 'st-skip', 'GAGAL': 'st-fail', 'PROSES…': 'st-run', 'ANTRI': 'st-queue' };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let mod = null, sheet = null, S = { ...BASE }, running = false, abort = false, invalid = new Map(), regCount = 0;

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
  header .sub { color: #5f6368; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    <span class="logo">⊞</span><span class="title">FASIH Batch</span><span class="sub"></span>
    <span class="spacer"></span>
    <span class="script" hidden></span>
    <button class="b" data-act="template" title="Unduh template batch-automation.js untuk dikembangkan">Download template</button>
    <button class="b" data-act="import" title="Pilih file batch-automation.js">Import script</button>
    <button class="b" data-act="unload" hidden title="Lepas script (data sheet tetap tersimpan)">Lepas</button>
    <button class="x" data-act="close" title="Tutup (data tetap tersimpan)">✕</button>
    <input type="file" accept=".js,text/javascript" hidden>
  </header>
  <div class="toolbar" hidden>
    <button class="b dry" data-act="dry">Dry run</button>
    <button class="b live" data-act="live">Jalankan LIVE</button>
    <button class="b" data-act="stop" disabled>Stop</button>
    <span class="sep"></span>
    <label>Jeda <input type="number" data-set="jeda" min="0" step="500"> ms</label>
    <label class="backup-opt"><input type="checkbox" data-set="backup"> Backup sebelum LIVE</label>
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
  <footer><span class="summary"></span><div class="progress"><div></div></div><span class="msg"></span></footer>
</div>`;

  const $ = (s) => root.querySelector(s);
  const panel = $('.panel'), fab = $('.fab'), fileInput = $('input[type=file]'), empty = $('.empty');

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
      if (!o || !o.key || o.key in BASE) throw new Error(`opsi tidak valid: ${JSON.stringify(o)} (key wajib, bukan "jeda"/"backup")`);
      return { type: 'checkbox', ...o, label: o.label || o.key };
    });
    return { ...def, name: def.name || def.id, description: def.description || '', columns, idColumn, options };
  }

  function register(def) {
    if (running) throw new Error('FASIH_BATCH sedang berjalan — tunggu selesai atau Stop dulu');
    const m = normalize(def);
    if (sheet) { saveNow(); sheet.destroy(); sheet = null; }
    mod = m; regCount++;
    const defaults = Object.fromEntries(m.options.map((o) => [o.key, o.default ?? (o.type === 'checkbox' ? false : '')]));
    S = { ...BASE, ...defaults, ...LS.get(K.settings(m.id), {}) };
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
  function buildUI() {
    if (sheet) { saveNow(); sheet.destroy(); sheet = null; }
    const has = !!mod;
    $('.title').textContent = has ? mod.name : 'FASIH Batch';
    $('.sub').textContent = has ? mod.description : '';
    $('.toolbar').hidden = !has; $('.hint').hidden = !has; empty.hidden = has;
    $('[data-act="unload"]').hidden = !has;
    const saved = LS.get(K.code, null), chip = $('.script');
    chip.hidden = !(has && saved);
    if (has && saved) {
      chip.textContent = `📄 ${saved.name}`;
      chip.title = `${saved.name} — di-import ${new Date(saved.importedAt).toLocaleString()}`;
    }
    progress(0, 0);
    if (!has) { $('.summary').textContent = ''; return; }

    $('.backup-opt').hidden = !mod.idColumn;
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
    $('.hint').innerHTML = `Klik sel <b>A1</b> lalu <kbd>Ctrl</kbd>+<kbd>V</kbd> dari Excel — ${mod.columns.length} kolom: ` +
      mod.columns.map((c) => `<b>${esc(c.title)}</b>${c.required ? '' : ' <i>(opsional)</i>'}`).join(', ') +
      `. Baris judul otomatis dilewati. Sel merah = tidak valid (arahkan kursor untuk alasannya). <kbd>Ctrl</kbd>+<kbd>C</kbd> menyalin hasil kembali ke Excel.`;

    sheet = new FasihSheet($('.grid'), {
      columns: [...mod.columns, ...RESULT_COLS],
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
    if (!panel.hidden) sheet.focus();
  }

  /* ---------------- simpan data sheet per script ---------------- */
  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    if (!mod || !sheet) return;
    const keys = [...mod.columns, ...RESULT_COLS].map((c) => c.key);
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
    $('.summary').textContent = parts.join(' · ') + (st.length ? '  |  ' + st.join(' · ') : '');
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
    running = on; if (sheet) sheet.locked = on;
    root.querySelectorAll('[data-act="dry"],[data-act="live"],[data-act="clear"],[data-act="resetStatus"],[data-act="import"],[data-act="unload"],[data-set]')
      .forEach((b) => { b.disabled = on; });
    $('[data-act="stop"]').disabled = !on;
  }
  const sleep = async (ms) => { const end = Date.now() + ms; while (!abort && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now()))); };
  const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const errText = (e) => String((e && e.message) || e);

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
    if (!dry) {
      const belumDry = targets.filter((x) => sheet.rows[x.r]._status !== 'DRY RUN').length;
      if (!confirm(`[${mod.name}]\nKirim perubahan LIVE untuk ${targets.length} baris?` +
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
      if (!dry && S.backup && m.idColumn) {
        msg(`Membuat backup ${rows.length} record…`);
        await F().backup(rows.map((x) => x[m.idColumn]), `fasih-backup-${m.id}-${stamp()}.json`);
      }
      for (let i = 0; i < targets.length && !abort; i++) {
        const { r, item } = targets[i];
        setStatus(r, 'PROSES…');
        msg(`${dry ? 'Dry run' : 'LIVE'} ${i + 1}/${targets.length}${m.idColumn ? ` — ${item[m.idColumn]}` : ''}`);
        try {
          const res = (await m.process(item, { ...ctx, index: i, rowNumber: r + 1 })) || {};
          const status = res.status || (res.skip ? 'LEWATI' : dry ? 'DRY RUN' : 'OK');
          setStatus(r, status, res.code, res.ket);
          results.push({ row: r + 1, item, status, result: res });
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
    if (show && sheet) { sheet.render(); summary(); sheet.focus(); }
  };
  fab.addEventListener('click', () => toggle(true));
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    const a = act.dataset.act;
    if (a === 'close') toggle(false);
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
    const inp = e.target.closest && e.target.closest('[data-set]');
    if (!inp) return;
    const k = inp.dataset.set;
    S[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? Math.max(0, Number(inp.value) || 0) : inp.value;
    save();
  });
  ['keydown', 'keyup', 'keypress'].forEach((ev) => root.addEventListener(ev, (e) => {      // jangan bocor ke shortcut halaman
    if (e.target.matches && e.target.matches('[data-set]')) e.stopPropagation();
  }));
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__fasihBatch === 'toggle') toggle();                 // klik ikon extension
    if (e.data.__fasihBatch === 'load-error') lastLoadError = e.data.error;
  });
  window.addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });

  window.FASIH_BATCH = Object.freeze({ register, get current() { return mod; }, version: '1.0.0' });

  /* ---------------- muat ulang script terakhir ---------------- */
  buildUI();
  const saved = LS.get(K.code, null);
  if (saved && saved.code) {
    runCode(saved.code, saved.name).catch((e) => {
      msg(`Script tersimpan (${saved.name}) gagal dimuat: ${errText(e)} — import ulang.`, 'err');
      console.error('[FASIH_BATCH]', e);
    });
  }
})();
