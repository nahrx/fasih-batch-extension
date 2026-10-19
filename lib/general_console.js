/* ============================================================================
 * FASIH SE2026 — editor assignment lewat API (full document, bukan hanya catatan)
 * ----------------------------------------------------------------------------
 * Jalankan di DevTools Console pada tab https://fasih-sm.bps.go.id yang sudah login.
 await FASIH.audit()
 *
 *   await FASIH.init()                         // muat skema template (sekali saja)
 *   await FASIH.dump(ID)                       // lihat semua field terisi
 *   FASIH.find('nama usaha')                   // cari dataKey dari label
 *   FASIH.schema('kode_bang')                  // tipe + daftar opsi valid
 *
 *   await FASIH.backup([ID1, ID2])             // SIMPAN DULU — unduh .json cadangan
 *   await FASIH.update(ID, { catatan:'rumah kosong', anomali_admin:true })   // dry run
 *   await FASIH.update(ID, {...}, { dryRun:false })                          // live
 *   await FASIH.patch(ID, doc => {...}, { dryRun:false })                    // bebas
 *   await FASIH.updateBatch(rows, { dryRun:false })                          // massal
 *   await FASIH.restore(backupObject)                                        // rollback
 *
 * ⚠️  SERVER TIDAK MEMVALIDASI ISI DOKUMEN.
 *     Semua aturan FormGear (enable condition, range, konsistensi antar-blok,
 *     kalkulasi turunan) dijalankan di sisi klien. Update lewat API MELEWATI
 *     seluruh aturan itu — record bisa tersimpan dalam keadaan tidak konsisten
 *     dan baru ketahuan saat dibuka di UI. Selalu backup, uji 1 record, lalu
 *     buka hasilnya di UI untuk memastikan tidak muncul error validasi.
 * ==========================================================================*/
/*
await FASIH.init()
const ID = 'e110fb00-ea62-4034-a693-4d2555a002f4'

await FASIH.backup([ID])                      // cadangkan kondisi rusak dulu

// pilih salah satu:
await FASIH.update(ID, { 'hubungan#2': '3' })                      // dry run -> kembali "3. Anak"
await FASIH.update(ID, { 'hubungan#2': '4' })                      // dry run -> jadi "4. Menantu"

// periksa tabel perubahannya, baru:
await FASIH.update(ID, { 'hubungan#2': '3' }, { dryRun: false })

await FASIH.update(ID, { 'hubungan#2': FASIH.raw([{ label:'3. Anak', value:3 }]) }, { dryRun:false })

await FASIH.update(ID, { geotag: FASIH.geotag(-0.49051, 117.140465, 5) }, { dryRun:false })
*/

const FASIH = (() => {
  const API = 'https://fasih-sm.bps.go.id/app/api';
  const enc = new TextEncoder();

  /* ---------------- http ---------------- */
  const xsrf = () =>
    decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
  const jh = () => ({ 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() });

  async function getAssignment(id) {
    const r = await fetch(
      `${API}/assignment-general/api/assignment/get-by-assignment-id?assignmentId=${id}`,
      { credentials: 'include' });
    if (!r.ok) throw new Error(`GET assignment ${r.status}`);
    const j = await r.json();
    return j.data || j;
  }

  /* ---------------- crc32 / md5 / zip ---------------- */
  const CRC_T = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function md5hex(bytes) {
    const rl = (n, c) => (n << c) | (n >>> (32 - c)), add = (x, y) => (x + y) | 0;
    const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22, 5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
               4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23, 6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;
    const len = bytes.length, padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
    padded.set(bytes); padded[len] = 0x80;
    const dv = new DataView(padded.buffer), bits = len * 8;
    dv.setUint32(padded.length - 8, bits >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(bits / 4294967296), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Int32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) { let F, g;
        if (i < 16)      { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D;          g = (3 * i + 5) % 16; }
        else             { F = C ^ (B | ~D);       g = (7 * i) % 16; }
        F = add(add(add(F, A), K[i]), M[g]); A = D; D = C; C = B; B = add(B, rl(F, S[i])); }
      a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D); }
    const out = new Uint8Array(16), odv = new DataView(out.buffer);
    odv.setInt32(0, a0, true); odv.setInt32(4, b0, true); odv.setInt32(8, c0, true); odv.setInt32(12, d0, true);
    return [...out].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const deflateRaw = async (u8) => new Uint8Array(await new Response(
    new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

  async function makeZip(files) {
    const now = new Date();
    const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const locals = [], centrals = []; let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name), comp = await deflateRaw(f.bytes), crc = crc32(f.bytes);
      const lh = new Uint8Array(30 + nameB.length), ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true); ldv.setUint16(4, 20, true); ldv.setUint16(8, 8, true);
      ldv.setUint16(10, dt, true); ldv.setUint16(12, dd, true); ldv.setUint32(14, crc, true);
      ldv.setUint32(18, comp.length, true); ldv.setUint32(22, f.bytes.length, true);
      ldv.setUint16(26, nameB.length, true); lh.set(nameB, 30);
      const ch = new Uint8Array(46 + nameB.length), cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true); cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
      cdv.setUint16(10, 8, true); cdv.setUint16(12, dt, true); cdv.setUint16(14, dd, true);
      cdv.setUint32(16, crc, true); cdv.setUint32(20, comp.length, true);
      cdv.setUint32(24, f.bytes.length, true); cdv.setUint16(28, nameB.length, true);
      cdv.setUint32(42, offset, true); ch.set(nameB, 46);
      locals.push(lh, comp); centrals.push(ch); offset += lh.length + comp.length;
    }
    const cdSize = centrals.reduce((a, c) => a + c.length, 0);
    const eocd = new Uint8Array(22), edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true); edv.setUint32(12, cdSize, true); edv.setUint32(16, offset, true);
    const zip = new Uint8Array(offset + cdSize + 22); let p = 0;
    for (const c of [...locals, ...centrals, eocd]) { zip.set(c, p); p += c.length; }
    return zip;
  }

  /* ---------------- skema template ---------------- */
  let SCHEMA = null;   // Map dataKey -> {type,label,options,section}

  const TYPE_NAME = {
    1:'section', 2:'subsection', 3:'group', 4:'variable/hidden', 6:'note',
    16:'toggle', 17:'toggle', 20:'number', 21:'select', 24:'lookup', 25:'text',
    26:'radio/select', 27:'select', 28:'number', 29:'nested', 30:'textarea',
    32:'photo', 33:'select', 34:'signature', 35:'datetime', 38:'table',
  };
  const OPTION_TYPES = new Set([21, 26, 27, 33]);
  const BOOL_TYPES   = new Set([16, 17]);
  const NUM_TYPES    = new Set([20, 28]);

  async function init({ assignmentId = null, mode = null, force = false } = {}) {
    if (SCHEMA && !force) return SCHEMA;
    let id = assignmentId;
    if (!id) {
      const m = location.pathname.match(/assignment\/[0-9a-f-]{36}\/([0-9a-f-]{36})/);
      if (!m) throw new Error('Buka satu halaman assignment dulu, atau: FASIH.init({assignmentId:"..."})');
      id = m[1];
    }
    const asg = await getAssignment(id);
    const doc = JSON.parse(asg.data);
    const wantMode = mode || (Array.isArray(asg.mode) ? asg.mode[0] : asg.mode) || 'CAPI';

    // survey-periods -> surveyId -> survey-templates/search -> templateId + versi
    const per = await fetch(`${API}/survey/api/v1/survey-periods/${asg.survey_period_id}`,
      { credentials: 'include' }).then((r) => r.json());
    const surveyId = (per.data || per).surveyId;
    const list = await fetch(`${API}/survey/api/v1/survey-templates/search?surveyId=${surveyId}`,
      { credentials: 'include' }).then((r) => r.json());
    const tpls = list.data || list;
    const t = tpls.find((x) => x.mode === wantMode && x.templateVersion === doc.templateVersion)
           || tpls.find((x) => x.mode === wantMode)
           || tpls[0];
    if (!t) throw new Error('Template tidak ditemukan untuk mode ' + wantMode);

    const url = `${API}/designer/api/template/file/${t.templateId}` +
                `?templateVersion=${t.templateVersion}&validationVersion=${t.validationVersion}`;
    const T = await fetch(url, { credentials: 'include' }).then((r) => r.json());
    SCHEMA = new Map();
    (function walk(node, section) {
      if (Array.isArray(node)) return node.forEach((n) => walk(n, section));
      if (!node || typeof node !== 'object') return;
      const sec = node.type === 1 ? (node.label || section) : section;
      if (node.dataKey)
        SCHEMA.set(node.dataKey, {
          dataKey: node.dataKey, type: node.type, kind: TYPE_NAME[node.type] || String(node.type),
          label: node.label, section: sec,
          // simpan objek opsi UTUH (label, description, value, open) — FormGear
          // menyalin objek ini apa adanya ke dalam jawaban, jadi jangan dipangkas
          options: (node.options || []).map((o) => ({ ...o })),
          // opsi dari tabel lookup (MFD, prelist, ...) — bukan daftar statis di template
          source: Array.isArray(node.sourceSelect) && node.sourceSelect.length
            ? { table: node.sourceSelect[0].tableName, value: node.sourceSelect[0].value,
                desc: node.sourceSelect[0].desc,
                parent: (node.sourceSelect[0].parentCondition || []).map((p) => p.value).join(',') }
            : null,
        });
      if (Array.isArray(node.components)) walk(node.components, sec);
    })(T.components, null);
    console.log(`Skema dimuat: ${SCHEMA.size} komponen — ${t.surveyTemplateName} (${wantMode} v${t.templateVersion}).`);
    return SCHEMA;
  }

  /* Field di dalam roster/repeat disimpan sebagai `<dataKey>#<indeks>` di answers
     (mis. hubungan#1, keberadaan_dtsen#2, pilih_umkm_sls#1002), sedangkan template
     hanya memuat dataKey dasarnya. Selalu lepas sufiksnya saat mencari skema. */
  const baseKey = (k) => String(k).replace(/#\d+$/, '');
  const rowIndex = (k) => { const m = String(k).match(/#(\d+)$/); return m ? m[1] : null; };
  const schema = (dataKey) => (SCHEMA ? SCHEMA.get(baseKey(dataKey)) : null);

  function find(q) {
    if (!SCHEMA) { console.warn('Jalankan await FASIH.init() dulu.'); return []; }
    const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const hits = [...SCHEMA.values()]
      .filter((f) => re.test(f.dataKey) || re.test(f.label || ''))
      .map((f) => ({ dataKey: f.dataKey, kind: f.kind, label: (f.label || '').slice(0, 55),
                     section: f.section, opsi: f.options.length || '' }));
    console.table(hits.slice(0, 60));
    return hits;
  }

  /* ---------------- coercion nilai ---------------- */
  const RAW = Symbol('raw');
  const raw = (v) => ({ [RAW]: v });          // FASIH.raw(x) -> pasang apa adanya

  function coerce(dataKey, value, prevAnswer) {
    if (value && typeof value === 'object' && RAW in value) return value[RAW];
    const f = schema(dataKey);
    if (!f) return value;                      // tidak ada di template -> apa adanya
    if (value === null || value === undefined) return value;

    if (BOOL_TYPES.has(f.type)) return Boolean(value);
    if (NUM_TYPES.has(f.type))  return typeof value === 'number' ? value : Number(value);

    if (OPTION_TYPES.has(f.type)) {
      // Opsi dinamis (sourceSelect: lookup/API) atau komponen posisional seperti
      // `geotag` tidak punya daftar statis — tidak bisa divalidasi, lewatkan apa adanya.
      if (!f.options.length) {
        console.warn(`${dataKey}: tidak ada daftar opsi statis di template` +
          (f.source ? ` (opsi diambil dari tabel lookup "${f.source.table}"` +
                      (f.source.parent ? `, bergantung pada ${f.source.parent}` : '') + `)`
                    : ` (opsi dibangun oleh skrip form saat runtime)`) +
          ` — nilai TIDAK divalidasi, dipasang apa adanya. Tiru bentuk yang sudah ada.`);
        return value;
      }

      const prevObj = Array.isArray(prevAnswer) && prevAnswer[0] && typeof prevAnswer[0] === 'object'
        ? prevAnswer[0] : null;
      // Properti khusus baris yang harus ikut terbawa (is_prelist, nik, no_urut, jk, ...)
      const OPT_OWN = new Set(['label', 'value', 'description', 'open']);
      const extra = prevObj
        ? Object.fromEntries(Object.entries(prevObj).filter(([k]) => !OPT_OWN.has(k))) : {};

      const resolve = (v) => {
        const want = String(v).trim().toLowerCase();
        const o = f.options.find((x) => String(x.value).toLowerCase() === want)
               || f.options.find((x) => String(x.label).trim().toLowerCase() === want);
        if (!o) throw new Error(
          `Nilai "${v}" tidak ada di opsi ${dataKey}. Valid: ` +
          f.options.map((x) => `${x.value}=${x.label}`).join(' | '));
        return { ...o };
      };

      const build = (code, openOverride) => {
        const merged = { ...extra, ...resolve(code) };
        if (openOverride !== undefined) merged.open = openOverride;
        if (!prevObj) return merged;               // belum ada jawaban -> objek opsi utuh
        // Ikuti SET dan URUTAN kunci jawaban lama supaya diff-nya minimal:
        // sebagian field lama hanya punya {label,value}, sebagian {description,label,value,open}.
        const out = {};
        for (const k of Object.keys(prevObj)) out[k] = (k in merged) ? merged[k] : prevObj[k];
        if (openOverride !== undefined && !('open' in out)) out.open = openOverride;
        // Jawaban hasil impor prelist kadang memakai value numerik dan label berbeda
        // dari template. Template dianggap sumber kebenaran (sama seperti kalau
        // petugas menyentuh field itu di UI), tapi beri tahu supaya tidak diam-diam.
        if (prevObj.label !== out.label || typeof prevObj.value !== typeof out.value)
          console.warn(`${dataKey}: bentuk lama ${JSON.stringify({ label: prevObj.label, value: prevObj.value })}` +
                       ` dinormalkan ke template ${JSON.stringify({ label: out.label, value: out.value })}`);
        return out;
      };

      // {value:'3', open:'teks lainnya'} -> pilihan + isian "lainnya"
      const pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v)
        ? build(v.value, v.open) : build(v, undefined);

      // Sudah berbentuk array objek lengkap -> percaya apa adanya
      if (Array.isArray(value) && value.length && typeof value[0] === 'object' && 'label' in value[0])
        return value;
      // Array kode -> multi-pilihan (template ini single-choice, tapi tetap didukung)
      if (Array.isArray(value)) return value.map(pick);
      return [pick(value)];
    }
    return value;
  }

  const flatten = (v) => v == null ? ''
    : Array.isArray(v) ? v.map((x) => (x && x.label != null ? x.label : JSON.stringify(x))).join(' / ')
    : typeof v === 'object' ? JSON.stringify(v) : String(v);

  /* ---------------- inti: submit ---------------- */
  async function submitEdit(id, mutate, { dryRun = true, columns = null, comment = null, log = true } = {}) {
    // Skema WAJIB ada sebelum menulis: tanpa itu coerce() tidak bisa memvalidasi
    // opsi dan akan meneruskan nilai mentah. Muat otomatis, jangan andalkan ingatan.
    if (!SCHEMA) await init({ assignmentId: id });
    const asg = await getAssignment(id);
    const sp  = asg.survey_period_id;
    const doc = JSON.parse(asg.data);
    const snapshot = new Map(doc.answers.map((a) => [a.dataKey, JSON.stringify(a.answer)]));

    if (mutate) mutate(doc, { set: (k, v) => setAnswer(doc, k, v), get: (k) => getAnswer(doc, k) });

    const changes = [];
    const show = (s) => { try { return flatten(JSON.parse(s)).slice(0, 60); } catch { return String(s).slice(0, 60); } };
    for (const a of doc.answers) {
      const after = JSON.stringify(a.answer);
      // pakai has(): sejumlah field lama punya answer === undefined, jangan dianggap baru
      if (!snapshot.has(a.dataKey))
        changes.push({ dataKey: a.dataKey, dari: '(baru)', ke: flatten(a.answer).slice(0, 60) });
      else if (snapshot.get(a.dataKey) !== after)
        changes.push({ dataKey: a.dataKey, dari: show(snapshot.get(a.dataKey)), ke: flatten(a.answer).slice(0, 60) });
    }
    if (changes.length) doc.updatedAt = new Date().toISOString();

    const commentJson = comment != null ? comment : (asg.comment || '{"dataKey":"","notes":[]}');
    const zip = await makeZip([
      { name: 'data.json',    bytes: enc.encode(JSON.stringify(doc)) },
      { name: 'comment.json', bytes: enc.encode(commentJson) },
      { name: 'media.json',   bytes: enc.encode('{}') },
    ]);
    const filename = `${id}_${Date.now()}.zip`;
    const md5 = md5hex(zip);

    const plan = { assignmentId: id, code: asg.code_identity, status: asg.assignment_status_alias,
                   version: asg.submit_version_code, nChanges: changes.length, zipBytes: zip.length };

    if (dryRun) { if (log) { console.log('[DRY RUN]', plan); /*if (changes.length) console.table(changes);*/ }
                  return { ...plan, dryRun: true, changes }; }

    const pr = await fetch(`${API}/assignment-submit/api/assignment/s3/edit/presign-url?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(),
      body: JSON.stringify({ assignmentId: id, fileNames: [filename] }) });
    if (!pr.ok) throw new Error(`presign ${pr.status}: ${(await pr.text()).slice(0, 180)}`);
    const pj = await pr.json();
    const urls = []; (function w(v) { if (typeof v === 'string' && /^https?:/.test(v)) urls.push(v);
      else if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object') Object.values(v).forEach(w); })(pj);
    if (!urls.length) throw new Error('presigned URL tidak ditemukan');

    const up = await fetch(urls[0], { method: 'PUT', credentials: 'omit',
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"` },
      body: new Blob([zip], { type: 'application/zip' }) });
    if (!up.ok) throw new Error(`upload ${up.status}`);

    const body = { filename, start: '0', end: String(zip.length - 1), length: String(zip.length), md5,
      surveyPeriodeId: sp, assignmentId: id, createStatus: 'false', draftStatus: 'false',
      regionId: asg.region && asg.region._id, sourceFrom: 'SCM-EDIT' };
    for (let i = 1; i <= 10; i++) {
      const k = 'data' + i;
      const v = columns && k in columns ? columns[k] : asg[k];      // null di backup -> '' (bukan teks "null")
      body[k] = v == null ? '' : String(v);
    }
    const cm = await fetch(`${API}/assignment-submit/api/assignment/s3/edit?surveyPeriodId=${sp}`, {
      method: 'POST', credentials: 'include', headers: jh(), body: JSON.stringify(body) });
    const cmTxt = await cm.text();
    if (!cm.ok) throw new Error(`commit ${cm.status}: ${cmTxt.slice(0, 250)}`);

    const after = await getAssignment(id);
    const res = { ...plan, ok: true, versionAfter: after.submit_version_code,
                  statusAfter: after.assignment_status_alias, dataSizeAfter: after.data_size, changes };
    if (log) { 
		console.log('[OK]', res); 
		//if (changes.length) console.table(changes); 
	}
    return res;
  }

  /* ---------------- helper baca/tulis jawaban ---------------- */
  const getAnswer = (doc, k) => { const r = doc.answers.find((a) => a.dataKey === k); return r ? r.answer : undefined; };
  function setAnswer(doc, k, v) {
    const row = doc.answers.find((a) => a.dataKey === k);
    const val = coerce(k, v, row && row.answer);

    /* PENGAMAN BENTUK — pelajaran mahal.
       FormGear membaca jawaban pilihan sebagai answer[0].value lalu memanggil
       .toString() di atasnya. Kalau yang tersimpan string telanjang (mis. "4. Menantu"
       alih-alih [{label:"4. Menantu",value:4}]), answer[0] jadi karakter "4",
       .value jadi undefined, dan SELURUH section gagal dirender dengan
       "Cannot read properties of undefined (reading 'toString')".
       Server tidak menolaknya, jadi pengaman ini harus ada di sisi kita. */
    const f = schema(k);
    const wasArray = row && Array.isArray(row.answer);
    const isArray = Array.isArray(val);
    if (val !== null && val !== undefined && !isArray && (wasArray || (f && OPTION_TYPES.has(f.type)))) {
      throw new Error(
        `${k}: menolak menulis nilai non-array ke field pilihan` +
        (wasArray ? ` (jawaban lama berbentuk array)` : ` (tipe ${f.kind})`) + `. ` +
        (!SCHEMA
          ? `PENYEBAB: skema template belum dimuat, jadi nilai tidak bisa diterjemahkan ` +
            `ke bentuk opsi. Jalankan "await FASIH.init()" lebih dulu.`
          : !f
            ? `PENYEBAB: dataKey "${baseKey(k)}" tidak ada di template ini — periksa ejaannya ` +
              `dengan FASIH.find(). `
            : `Beri kode opsinya (mis. '4'), bukan teks label.`) +
        ` Kalau memang disengaja, bungkus dengan FASIH.raw(...).`);
    }

    if (row) row.answer = val; else doc.answers.push({ dataKey: k, answer: val });
    return val;
  }

  /* ---------------- API tingkat atas ---------------- */

  /** Update sekumpulan field: FASIH.update(id, {catatan:'...', kode_bang:'2'}) */
  const update = (id, values, opts = {}) =>
    submitEdit(id, (doc) => { for (const [k, v] of Object.entries(values)) setAnswer(doc, k, v); }, opts);

  /** Mutator bebas: FASIH.patch(id, (doc, {set,get}) => { set('x', 1) }) */
  const patch = (id, fn, opts = {}) => submitEdit(id, fn, opts);

  /** Kirim ulang tanpa perubahan — untuk menguji pipeline. */
  const roundTrip = (id, opts = {}) => submitEdit(id, null, { dryRun: false, ...opts });

  /** Lihat seluruh field terisi beserta tipe & section. */
  async function dump(id, filter = null) {
    if (!SCHEMA) await init({ assignmentId: id });
    const asg = await getAssignment(id);
    const doc = JSON.parse(asg.data);
    const re = filter ? new RegExp(filter, 'i') : null;
    const rows = doc.answers.map((a) => { const f = schema(a.dataKey) || {};
      return { dataKey: a.dataKey, baris: rowIndex(a.dataKey) || '', label: (f.label || '').slice(0, 40),
               kind: f.kind || '?', section: f.section || '', nilai: flatten(a.answer).slice(0, 55) }; })
      .filter((r) => !re || re.test(r.dataKey) || re.test(r.label) || re.test(r.section));
    console.table(rows);
    return rows;
  }

  /** Cadangkan dokumen asli ke file .json (WAJIB sebelum batch). Jeda delayMs antar-request (default 3 detik).
      onProgress(n, total, id) dipanggil sebelum record ke-n diambil. shouldStop() -> true menghentikan
      backup (juga di tengah jeda): file tidak diunduh dan hasilnya null. */
  async function backup(ids, filename = `fasih-backup-${Date.now()}.json`, { delayMs = 3000, onProgress = null, shouldStop = null } = {}) {
    const arr = Array.isArray(ids) ? ids : [ids];
    const items = [];
    const stopped = () => !!(shouldStop && shouldStop());
    for (const [i, id] of arr.entries()) {
      if (i && delayMs > 0) { const end = Date.now() + delayMs;
        while (!stopped() && Date.now() < end) await new Promise((x) => setTimeout(x, Math.min(200, end - Date.now()))); }
      if (stopped()) { console.log(`Backup dihentikan setelah ${items.length}/${arr.length} record — file tidak diunduh`); return null; }
      if (onProgress) onProgress(i + 1, arr.length, id);
      const a = await getAssignment(id);
      items.push({ assignmentId: id, code: a.code_identity, survey_period_id: a.survey_period_id,
                   submit_version_code: a.submit_version_code, data: a.data, comment: a.comment,
                   columns: Object.fromEntries([...Array(10)].map((_, i) => ['data' + (i + 1), a['data' + (i + 1)]])) }); }
    const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), items }, null, 1)],
                          { type: 'application/json' });
    const u = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = u; link.download = filename; link.click(); URL.revokeObjectURL(u);
    console.log(`Backup ${items.length} record -> ${filename}`);
    return items;
  }

  /** Kembalikan record ke isi backup. restore(backupItems, {dryRun:false}) */
  async function restore(backup, { dryRun = true, delayMs = 1200 } = {}) {
    const items = Array.isArray(backup) ? backup : backup.items;
    const out = [];
    for (const it of items) {
      try {
        const r = await submitEdit(it.assignmentId,
          (doc) => { const orig = JSON.parse(it.data);
                     doc.answers.length = 0; doc.answers.push(...orig.answers);
                     Object.assign(doc, { description: orig.description, isForceSubmit: orig.isForceSubmit,
                                          updatedAt: orig.updatedAt }); },
          { dryRun, columns: it.columns, comment: it.comment, log: false });
        out.push(r); console.log(`restore ok   ${it.assignmentId}`);
      } catch (e) { out.push({ assignmentId: it.assignmentId, ok: false, error: String(e) });
                    console.warn(`restore FAIL ${it.assignmentId} ${e}`); }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return out;
  }

  /**
   * Update massal.
   * rows: [{ assignmentId, values:{...}, columns?:{data1:'...'} }]
   *   atau  FASIH.updateBatch(ids, {values:{...}})  untuk nilai sama ke semua.
   */
  async function updateBatch(rows, { dryRun = true, delayMs = 1500, stopOnError = false, values = null } = {}) {
    const list = rows.map((r) => (typeof r === 'string' ? { assignmentId: r, values } : r));
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      try {
        const res = await update(r.assignmentId, r.values || {}, { dryRun, columns: r.columns || null, log: false });
        out.push(res);
        console.log(`${i + 1}/${list.length} ok   ${r.assignmentId}  ${res.nChanges} perubahan`);
      } catch (e) {
        out.push({ assignmentId: r.assignmentId, ok: false, error: String(e) });
        console.warn(`${i + 1}/${list.length} FAIL ${r.assignmentId}  ${e}`);
        if (stopOnError) break;
      }
      if (i < list.length - 1) await new Promise((x) => setTimeout(x, delayMs));
    }
    //console.table(out.map(({ assignmentId, code, ok, nChanges, versionAfter, error }) =>
    //  ({ assignmentId, code, ok: ok !== false, nChanges, versionAfter, error })));
    return out;
  }

  /** Info user yang login (data.username, ...) — di-cache per survey period. */
  const myInfoCache = new Map();
  async function myInfo(surveyPeriodId) {
    if (!myInfoCache.has(surveyPeriodId)) {
      const p = fetch(`${API}/survey/api/v1/users/myinfo?surveyPeriodId=${surveyPeriodId}`, { credentials: 'include' })
        .then(async (r) => { if (!r.ok) throw new Error(`GET myinfo ${r.status}`); const j = await r.json(); return j.data || j; });
      myInfoCache.set(surveyPeriodId, p);
      p.catch(() => myInfoCache.delete(surveyPeriodId));        // gagal -> boleh dicoba lagi
    }
    return myInfoCache.get(surveyPeriodId);
  }

  /** Tambah/ubah catatan per-pertanyaan (comment.json).
      Pengirim (sender) = username user yang login (myinfo), kecuali author diisi. */
  async function setComment(id, dataKey, text, { dryRun = true, author = null } = {}) {
    const asg = await getAssignment(id);
    const sender = author || (await myInfo(asg.survey_period_id)).username;
    if (!sender) throw new Error('username tidak ditemukan di myinfo — isi author secara manual');
    const c = JSON.parse(asg.comment || '{"dataKey":"","notes":[]}');
    c.notes = c.notes || [];
    let note = c.notes.find((n) => n.dataKey === dataKey);
    if (!note) { note = { dataKey, comments: [] }; c.notes.push(note); }
    note.comments = note.comments || [];
    note.comments.push({ datetime: new Date().toISOString(), sender, comment: text });   // urutan & nama field sama dengan UI FASIH
    return submitEdit(id, null, { dryRun, comment: JSON.stringify(c) });
  }

  /**
   * Audit template: tipe apa saja yang ada, dan mana yang TIDAK bisa divalidasi
   * otomatis. Jalankan sekali tiap survei/template baru sebelum menulis apa pun.
   *   await FASIH.audit()
   */
  async function audit(assignmentId = null) {
    if (!SCHEMA) await init(assignmentId ? { assignmentId } : {});
    const all = [...SCHEMA.values()];

    const perTipe = {};
    all.forEach((f) => {
      const b = perTipe[f.kind] = perTipe[f.kind] || { tipe: f.type, kind: f.kind, jumlah: 0, tanpaOpsi: 0 };
      b.jumlah++;
      if (OPTION_TYPES.has(f.type) && !f.options.length) b.tanpaOpsi++;
    });
    console.log('— Komponen per tipe —');
    console.table(Object.values(perTipe).sort((a, b) => a.tipe - b.tipe));

    const noOpt = all.filter((f) => OPTION_TYPES.has(f.type) && !f.options.length);
    console.log(`— ${noOpt.length} field pilihan TANPA daftar opsi statis (tidak divalidasi) —`);
    console.table(noOpt.map((f) => ({
      dataKey: f.dataKey, tipe: f.type,
      sumber: f.source ? `lookup: ${f.source.table}` : 'skrip form (runtime)',
      bergantung: f.source ? (f.source.parent || '') : '',
      section: (f.section || '').slice(0, 24),
    })));

    const catatan = {
      'variable/hidden (4)': 'Turunan — dihitung ulang FormGear dari field lain. JANGAN ditulis manual.',
      'nested (29) / table (38)': 'Container. Isinya muncul di answers sebagai <dataKey>#<indeks>, bukan sebagai satu nilai.',
      'photo (32)': 'Array [{filename, uri, url}] — file fisik ada di object storage, tidak bisa dibuat dari sini.',
      'signature (34)': 'Sama seperti photo: rujukan ke berkas, bukan nilai biasa.',
      'lookup (24)': 'Nilai berasal dari tabel referensi eksternal.',
      'datetime (35)': 'String ISO, mis. "2026-09-17T13:06:29.737Z".',
    };
    console.log('— Tipe yang butuh perlakuan khusus —');
    console.table(Object.entries(catatan).map(([k, v]) => ({ tipe: k, catatan: v })));

    return { perTipe: Object.values(perTipe), tanpaOpsi: noOpt.map((f) => f.dataKey) };
  }

  /* ---------------- geotag ----------------
     `geotag` bertipe 33 tapi TIDAK punya daftar opsi — ia array 5 slot tetap
     berbentuk {label, value}, dan slot ke-0 ganjil: label-nya justru URL peta,
     value-nya objek {latitude, accuracy, longitude}.

       [0] label: "<url peta>"   value: { latitude, accuracy, longitude }
       [1] label: "map"          value: "<url peta>"
       [2] label: "latitude"     value: <number>
       [3] label: "longitude"    value: <number>
       [4] label: "accuracy"     value: <number>

     Urutan dan kelima slotnya harus utuh — FormGear membaca per indeks.
     `latitude`/`longitude` di record assignment diturunkan server dari sini,
     jadi tidak perlu dikirim terpisah.                                        */

  /** Bangun nilai geotag siap pakai (sudah berbentuk raw, lolos pengaman bentuk). */
  function geotag(lat, lon, accuracy = 0) {
    const la = Number(lat), lo = Number(lon), ac = Number(accuracy);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error('geotag: lat/lon tidak valid');
    if (Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error(`geotag: koordinat di luar jangkauan (${la}, ${lo})`);
    const url = `https://maps.google.com/maps?q=${la},${lo}`;
    return raw([
      { label: url,         value: { latitude: la, accuracy: ac, longitude: lo } },
      { label: 'map',       value: url },
      { label: 'latitude',  value: la },
      { label: 'longitude', value: lo },
      { label: 'accuracy',  value: ac },
    ]);
  }

  /** Baca geotag jadi objek biasa: {lat, lon, accuracy, url} */
  async function getGeotag(id, dataKey = 'geotag') {
    const asg = await getAssignment(id);
    const v = (JSON.parse(asg.data).answers.find((a) => a.dataKey === dataKey) || {}).answer;
    if (!Array.isArray(v)) return null;
    const by = (l) => (v.find((e) => e && e.label === l) || {}).value;
    return { lat: by('latitude'), lon: by('longitude'), accuracy: by('accuracy'), url: by('map') };
  }

  /** Set geotag: FASIH.setGeotag(ID, -0.4905, 117.1404, {accuracy:5, dryRun:false}) */
  async function setGeotag(id, lat, lon, { accuracy = null, dataKey = 'geotag', ...opts } = {}) {
    const cur = await getGeotag(id, dataKey);
    const ac = accuracy != null ? accuracy : (cur && cur.accuracy != null ? cur.accuracy : 0);
    return submitEdit(id, (doc, { set }) => set(dataKey, geotag(lat, lon, ac)), opts);
  }

  /** Daftar baris roster untuk satu dataKey dasar: FASIH.rows(ID, 'hubungan') */
  async function rows(id, base) {
    const asg = await getAssignment(id);
    const doc = JSON.parse(asg.data);
    const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#(\\d+)$`);
    const out = doc.answers.filter((a) => re.test(a.dataKey))
      .map((a) => ({ dataKey: a.dataKey, baris: a.dataKey.match(re)[1], nilai: flatten(a.answer).slice(0, 55) }))
      .sort((p, q) => Number(p.baris) - Number(q.baris));
    //console.table(out);
    return out;
  }

  return { init, audit, schema, find, dump, rows, backup, restore, geotag, getGeotag, setGeotag,
           update, patch, updateBatch, roundTrip, setComment, myInfo,
           getAssignment, raw, _internal: { submitEdit, makeZip, md5hex, coerce, get SCHEMA() { return SCHEMA; } } };
})();

console.log('FASIH editor siap.  Mulai:  await FASIH.init()  lalu  await FASIH.dump("<assignmentId>")');