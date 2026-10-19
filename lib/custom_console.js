/* ============================================================================
 * FASIH Custom — library submit untuk menu "Custom automation" (FASIH Sheet).
 * ----------------------------------------------------------------------------
 * Dimuat di halaman https://fasih-sm.bps.go.id (MAIN world) setelah general_console.js.
 * FASIH Sheet (iframe di panel, origin sama) memanggilnya lewat window.parent.FASIH_CUSTOM;
 * bisa juga dipakai langsung dari DevTools Console.
 *
 * Yang dikirim adalah dokumen HASIL dari sheet: data asli + perubahan kolom UPDATE DATA +
 * remark baru, sudah dihitung engine kuesioner (skip/validasi) — sama dengan isi Export JSON.
 * Jadi library ini TIDAK mengubah jawaban satu per satu; ia mengganti data.json & comment.json
 * record dengan dokumen hasil itu, lewat jalur yang sama dengan FASIH.submitEdit
 * (zip -> presign -> PUT S3 -> commit s3/edit, sourceFrom SCM-EDIT).
 *
 *   await FASIH_CUSTOM.submit(item)                       // dry run: lihat perubahan
 *   await FASIH_CUSTOM.submit(item, { dryRun: false })    // kirim
 *   await FASIH_CUSTOM.submitBatch(items, { dryRun: false, delayMs: 1500 })
 *   await FASIH_CUSTOM.backup([id1, id2])                 // unduh kondisi server (format backup FASIH)
 *   await FASIH_CUSTOM.myInfo(surveyPeriodId)             // user login (username = pengirim remark baru)
 *   const api = await FASIH_CUSTOM.engine(idKuesioner)    // engine kuesioner (sheet tersembunyi) untuk script Automation
 *   await api.compute({ response, keys, values, remarks, rosterNo })  // -> { envelope, galat, errors, ignored }
 *
 *   item = respons get-by-assignment-id hasil Export JSON  { success, data: { _id, data, comment, ... } }
 *        | { assignmentId, data: <string|objek response>, comment?: <string|objek|null>, expectVersion? }
 *
 * PENGAMAN
 *   - expectVersion (submit_version_code saat data dimuat ke sheet): kalau versi di server sudah
 *     berbeda, record ditolak — ada perubahan lain sejak dimuat yang akan tertimpa. Muat ulang
 *     baris di sheet lalu ulangi, atau pakai { force: true } bila memang disengaja.
 *   - Record dengan survey period / assignment berbeda ditolak.
 *   - Tidak ada perubahan (jawaban & catatan sama) -> tidak dikirim (versi record tidak naik).
 *   - Server tidak memvalidasi isi dokumen; validasi sudah dijalankan engine di sheet.
 * ==========================================================================*/

(() => {
  if (window.FASIH_CUSTOM) return;
  const API = 'https://fasih-sm.bps.go.id/app/api';
  const enc = new TextEncoder();
  const EMPTY_COMMENT = '{"dataKey":"","notes":[]}';
  const G = () => (typeof FASIH !== 'undefined' ? FASIH : window.FASIH);   // general_console.js

  /* ---------------- http ---------------- */
  const xsrf = () => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
  const jh = () => ({ 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() });

  async function getAssignment(id) {
    const r = await fetch(`${API}/assignment-general/api/assignment/get-by-assignment-id?assignmentId=${encodeURIComponent(id)}`,
      { credentials: 'include' });
    if (!r.ok) throw new Error(`GET assignment ${r.status}`);
    const j = await r.json();
    return j.data || j;
  }

  /* zip & md5 dipakai bersama dengan general_console.js (FASIH._internal) */
  function zipTools() {
    const g = G();
    const t = g && g._internal;
    if (!t || typeof t.makeZip !== 'function' || typeof t.md5hex !== 'function')
      throw new Error('general_console.js (FASIH._internal.makeZip/md5hex) belum dimuat — reload halaman FASIH.');
    return t;
  }

  /* ---------------- normalisasi item ---------------- */
  const parse = (v, what) => {
    if (v == null || v === '') return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { throw new Error(`${what} bukan JSON yang valid`); }
  };
  /** Terima envelope Export JSON / respons API, atau { assignmentId, data, comment }. */
  function normalize(item) {
    if (!item || typeof item !== 'object') throw new Error('item kosong');
    const d = item.data && typeof item.data === 'object' && !Array.isArray(item.data) && ('_id' in item.data || 'pre_defined_data' in item.data)
      ? item.data : null;
    const assignmentId = item.assignmentId || (d && d._id);
    if (!assignmentId) throw new Error('assignmentId tidak ada');
    const doc = parse(d ? d.data : item.data, 'data');
    if (!doc || !Array.isArray(doc.answers)) throw new Error(`${assignmentId}: data tidak berisi answers`);
    const rawComment = d ? d.comment : item.comment;
    const comment = rawComment == null ? null : (typeof rawComment === 'string' ? rawComment : JSON.stringify(rawComment));
    if (comment != null) parse(comment, 'comment');
    const expectVersion = item.expectVersion ?? (d ? d.submit_version_code : undefined);
    return { assignmentId, doc, comment, expectVersion, surveyPeriodId: d ? d.survey_period_id : item.surveyPeriodId };
  }

  /* ---------------- diff jawaban & catatan ---------------- */
  const show = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => (x && x.label != null ? x.label : JSON.stringify(x))).join(' / ').slice(0, 60);
    return (typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 60);
  };
  // JSON dengan urutan field objek diurutkan: hitungan ulang engine bisa menghasilkan isi sama dengan urutan berbeda
  const canon = (v) => JSON.stringify(v ?? null, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
  /** Perubahan jawaban dari dokumen lama ke baru: ditambah, diubah, dihapus (mis. karena ter-skip). */
  function diff(oldDoc, newDoc) {
    const before = new Map((oldDoc.answers || []).map((a) => [a.dataKey, a.answer]));
    const after = new Map((newDoc.answers || []).map((a) => [a.dataKey, a.answer]));
    const out = [];
    for (const [k, v] of after) {
      if (!before.has(k)) out.push({ dataKey: k, jenis: 'baru', dari: '', ke: show(v) });
      else if (canon(before.get(k)) !== canon(v)) out.push({ dataKey: k, jenis: 'ubah', dari: show(before.get(k)), ke: show(v) });
    }
    for (const [k, v] of before) if (!after.has(k)) out.push({ dataKey: k, jenis: 'hapus', dari: show(v), ke: '' });
    return out;
  }
  const commentCount = (c) => {
    try { return (JSON.parse(c || EMPTY_COMMENT).notes || []).reduce((n, x) => n + (x.comments || []).length, 0); } catch (e) { return 0; }
  };
  const sameComment = (a, b) => {
    try { return JSON.stringify(JSON.parse(a || EMPTY_COMMENT)) === JSON.stringify(JSON.parse(b || EMPTY_COMMENT)); } catch (e) { return a === b; }
  };

  /* ---------------- inti: submit satu record ---------------- */
  async function submit(item, { dryRun = true, force = false, log = true } = {}) {
    const it = normalize(item);
    const id = it.assignmentId;
    const asg = await getAssignment(id);
    if (asg._id && asg._id !== id) throw new Error(`${id}: respons server untuk assignment lain (${asg._id})`);
    const sp = asg.survey_period_id;
    if (it.surveyPeriodId && sp && it.surveyPeriodId !== sp) throw new Error(`${id}: survey period berbeda (${it.surveyPeriodId} vs server ${sp})`);

    const serverDoc = JSON.parse(asg.data || '{"answers":[]}');
    const changes = diff(serverDoc, it.doc);
    const comment = it.comment != null ? it.comment : (asg.comment || EMPTY_COMMENT);
    const commentChanged = !sameComment(asg.comment, comment);
    const plan = {
      assignmentId: id, code: asg.code_identity, status: asg.assignment_status_alias,
      version: asg.submit_version_code, expectVersion: it.expectVersion ?? null,
      nChanges: changes.length, commentChanged,
      remarks: { sebelum: commentCount(asg.comment), sesudah: commentCount(comment) },
    };

    // record berubah di server sejak dimuat ke sheet -> perubahan orang lain akan tertimpa
    if (!force && it.expectVersion != null && asg.submit_version_code != null && String(asg.submit_version_code) !== String(it.expectVersion)) {
      const err = new Error(`${id}: versi di server ${asg.submit_version_code}, sedangkan sheet memuat versi ${it.expectVersion}. ` +
        'Record sudah berubah sejak dimuat — muat ulang baris di sheet lalu ulangi (atau force: true).');
      err.plan = { ...plan, changes };
      throw err;
    }
    if (!changes.length && !commentChanged) {
      const res = { ...plan, ok: true, skipped: true, dryRun, changes, ket: 'tidak ada perubahan — tidak dikirim' };
      if (log) console.log('[FASIH_CUSTOM] LEWATI', res);
      return res;
    }
    if (dryRun) {
      const res = { ...plan, dryRun: true, changes };
      if (log) { console.log('[FASIH_CUSTOM] DRY RUN', res); if (changes.length) console.table(changes); }
      return res;
    }

    const { makeZip, md5hex } = zipTools();
    const zip = await makeZip([
      { name: 'data.json', bytes: enc.encode(JSON.stringify(it.doc)) },
      { name: 'comment.json', bytes: enc.encode(comment) },
      { name: 'media.json', bytes: enc.encode('{}') },
    ]);
    const filename = `${id}_${Date.now()}.zip`;
    const md5 = md5hex(zip);

    const pr = await fetch(`${API}/assignment-submit/api/assignment/s3/edit/presign-url?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(), body: JSON.stringify({ assignmentId: id, fileNames: [filename] }) });
    if (!pr.ok) throw new Error(`presign ${pr.status}: ${(await pr.text()).slice(0, 180)}`);
    const pj = await pr.json();
    const urls = [];
    (function walk(v) {
      if (typeof v === 'string' && /^https?:/.test(v)) urls.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(pj);
    if (!urls.length) throw new Error('presigned URL tidak ditemukan');

    const up = await fetch(urls[0], { method: 'PUT', credentials: 'omit',
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"` },
      body: new Blob([zip], { type: 'application/zip' }) });
    if (!up.ok) throw new Error(`upload ${up.status}`);

    const body = { filename, start: '0', end: String(zip.length - 1), length: String(zip.length), md5,
      surveyPeriodeId: sp, assignmentId: id, createStatus: 'false', draftStatus: 'false',
      regionId: asg.region && asg.region._id, sourceFrom: 'SCM-EDIT' };
    for (let i = 1; i <= 10; i++) { const k = `data${i}`; body[k] = asg[k] == null ? '' : String(asg[k]); }   // kolom data1-10 tidak diubah
    const cm = await fetch(`${API}/assignment-submit/api/assignment/s3/edit?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(), body: JSON.stringify(body) });
    const cmTxt = await cm.text();
    if (!cm.ok) throw new Error(`commit ${cm.status}: ${cmTxt.slice(0, 250)}`);

    const after = await getAssignment(id);
    const res = { ...plan, ok: true, versionAfter: after.submit_version_code, statusAfter: after.assignment_status_alias,
      dataSizeAfter: after.data_size, changes };
    if (log) console.log('[FASIH_CUSTOM] OK', res);
    return res;
  }

  /* ---------------- banyak record ---------------- */
  async function submitBatch(items, { dryRun = true, force = false, delayMs = 1500, stopOnError = false, onProgress = null, shouldStop = null } = {}) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      if (shouldStop && shouldStop()) break;
      let res;
      try {
        res = await submit(items[i], { dryRun, force, log: false });
      } catch (e) {
        let id = null;
        try { id = normalize(items[i]).assignmentId; } catch (x) { /* item tidak valid */ }
        res = { assignmentId: id, ok: false, error: String((e && e.message) || e), ...(e && e.plan ? { plan: e.plan } : {}) };
      }
      out.push(res);
      if (onProgress) { try { onProgress(res, i, items.length); } catch (e) { /* abaikan error UI */ } }
      console.log(`[FASIH_CUSTOM] ${i + 1}/${items.length} ${res.ok === false ? 'GAGAL' : res.skipped ? 'LEWATI' : dryRun ? 'DRY RUN' : 'OK'} ${res.assignmentId || ''} ${res.error || `${res.nChanges ?? 0} perubahan`}`);
      if (res.ok === false && stopOnError) break;
      if (!dryRun && !res.skipped && i < items.length - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return out;
  }

  /* ---------------- backup (format sama dengan FASIH.backup / menu Restore) ---------------- */
  // onProgress(n, total, id) sebelum record ke-n diambil; shouldStop() -> true: berhenti, file tidak diunduh, hasil null
  async function backup(ids, filename = `fasih-backup-custom-${Date.now()}.json`, { delayMs = 3000, onProgress = null, shouldStop = null } = {}) {
    const g = G();
    if (g && typeof g.backup === 'function') return g.backup(ids, filename, { delayMs, onProgress, shouldStop });
    const arr = Array.isArray(ids) ? ids : [ids];
    const items = [];
    const stopped = () => !!(shouldStop && shouldStop());
    for (const [i, id] of arr.entries()) {
      if (i && delayMs > 0) {                                          // jeda antar-request (default 3 detik), bisa dihentikan
        const end = Date.now() + delayMs;
        while (!stopped() && Date.now() < end) await new Promise((x) => setTimeout(x, Math.min(200, end - Date.now())));
      }
      if (stopped()) return null;
      if (onProgress) onProgress(i + 1, arr.length, id);
      const a = await getAssignment(id);
      items.push({ assignmentId: id, code: a.code_identity, survey_period_id: a.survey_period_id, submit_version_code: a.submit_version_code,
        data: a.data, comment: a.comment, columns: Object.fromEntries([...Array(10)].map((_, i) => [`data${i + 1}`, a[`data${i + 1}`]])) });
    }
    const u = URL.createObjectURL(new Blob([JSON.stringify({ createdAt: new Date().toISOString(), items }, null, 1)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = u; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    return items;
  }

  /* ---------------- engine kuesioner (headless) untuk script Automation hasil Export ---------------- */
  // Sheet Custom automation (custom/sheet.html) dimuat di iframe tersembunyi dengan kuesioner yang sudah di-import
  // (IndexedDB origin FASIH); window.SHEET_API.compute() menghitung hasil update dengan engine kuesioner.
  let bridgeN = 0;
  function askBridge(type, payload = {}, timeoutMs = 5000) {      // bridge.js (chrome.runtime) — sama seperti panel.js
    return new Promise((resolve, reject) => {
      const id = `cc-${++bridgeN}`;
      const t = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('extension tidak merespons (reload extension & halaman)')); }, timeoutMs);
      function on(e) {
        if (e.source !== window || !e.data || e.data.__fasihBatch !== `${type}-result` || e.data.id !== id) return;
        clearTimeout(t); window.removeEventListener('message', on);
        e.data.ok ? resolve(e.data) : reject(new Error(e.data.error || `${type} gagal`));
      }
      window.addEventListener('message', on);
      window.postMessage({ __fasihBatch: type, id, ...payload }, '*');
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const engines = new Map();
  /** await FASIH_CUSTOM.engine('<id kuesioner>') -> { template, compute(...) } (dimuat sekali, dipakai ulang). */
  function engine(questionnaireId, { timeoutMs = 90000 } = {}) {
    if (!questionnaireId) return Promise.reject(new Error('id kuesioner wajib'));
    if (!engines.has(questionnaireId)) {
      let frame = null;
      const p = (async () => {
        const { url } = await askBridge('custom-sheet-url');
        const r = await fetch(url);
        if (!r.ok) throw new Error(`custom/sheet.html ${r.status}`);
        const html = await r.text();
        frame = document.createElement('iframe');
        frame.name = `fasih-sheet-headless:${questionnaireId}`;   // dibaca loader & sheet (mode headless)
        frame.title = 'FASIH Sheet (engine kuesioner, tersembunyi)';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;opacity:0;pointer-events:none;';
        frame.srcdoc = html;
        document.documentElement.appendChild(frame);
        const t0 = Date.now();
        while (Date.now() - t0 < timeoutMs) {
          await sleep(300);
          let api = null;
          try { api = frame.contentWindow && frame.contentWindow.SHEET_API; } catch (e) { /* belum siap */ }
          if (api && api.error) throw new Error(api.error);
          if (api && api.ready) return api;
        }
        throw new Error('engine kuesioner tidak siap (waktu habis) — buka menu Custom automation sekali, lalu ulangi');
      })();
      p.catch(() => { engines.delete(questionnaireId); if (frame) frame.remove(); });
      engines.set(questionnaireId, p);
    }
    return engines.get(questionnaireId);
  }

  /** User yang login (username = pengirim remark baru) — memakai FASIH.myInfo (general_console.js, ber-cache). */
  async function myInfo(surveyPeriodId) {
    const F = G();
    if (F && typeof F.myInfo === 'function') return F.myInfo(surveyPeriodId);
    const r = await fetch(`${API}/survey/api/v1/users/myinfo?surveyPeriodId=${encodeURIComponent(surveyPeriodId)}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`GET myinfo ${r.status}`);
    const j = await r.json();
    return j.data || j;
  }

  window.FASIH_CUSTOM = Object.freeze({ version: '1.2.0', submit, submitBatch, backup, diff, getAssignment, normalize, myInfo, engine });
})();
