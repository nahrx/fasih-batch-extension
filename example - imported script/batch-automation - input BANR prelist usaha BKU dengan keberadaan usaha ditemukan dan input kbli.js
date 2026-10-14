/* ============================================================================
 * batch-automation - usaha banr.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: bangunan usaha "0. Tidak Ditemukan"  ->  "1. Ditemukan" + BANR (+ geotag)
 *        + roster usaha "0. Tidak Ditemukan" -> "1. Ditemukan" (identitas dari prelist)
 *        + KBLI (opsional) dari master KBLI
 *   Pola dari diff record b9bb5591 (MITRA INDAH LESTARI, template 7.1.2, v2 -> v3):
 *     bku tidak ditemukan.json -> bku ditemukan dengan banr.json
 *   Pola lama record 88e441e1 (BENGKEL, keberadaan usaha tetap 0) masih bisa dipakai
 *   dengan mematikan opsi "Usaha → 1. Ditemukan".
 *
 * Nilai per record (no_banr, latitude, longitude, kbli) diambil dari sheet, sisanya adalah
 * nilai turunan yang dibentuk FormGear di UI. Per baris usaha #n yang keberadaannya
 * "0. Tidak Ditemukan" atau kosong:
 *   keberadaan_usaha#n = 1. Ditemukan, ec_usaha_respons#n = true,
 *   nama_komersial / no_telp / email / website / kbli_prelist #n dari pre_defined_data
 *   (hanya bila belum terisi), kategori#n = '', cek6#n = '0.00', list_error_csv#n = [].
 *   Baris usaha berkode lain (3. Tutup, 9. Non Respon, 4. Ganda) DIBIARKAN.
 * Ringkasan: jumlah_usaha_ditemukan, ec_ada_usaha, nib_all, email_all.
 *
 * KBLI (kolom kbli diisi): berlaku untuk usaha yang diubah ke "Ditemukan" di baris ini,
 * atau — kalau tidak ada — satu-satunya usaha yang sudah "Ditemukan". Lebih dari 1 usaha -> GAGAL.
 *   kbli_genai#n = "Pilih dari Master KBLI", kbli#n = opsi master (label [Kat][Kode]Judul + deskripsi),
 *   kbli_akhir#n = kode, kategori#n = huruf kategori,
 *   daftar_anomali["8"] = usaha yang 2 digit KBLI-nya beda dengan KBLI SBR (kbli_prelist).
 *   Master diambil dari API lookup FASIH (tabel m_kbli2025_se_v3A) sekali per sesi, lalu dicari lokal.
 *   Respons lookup (contoh kbli.json): { data: [{ Kategori, Kode, Judul, Deskripsi, BukancakupanSE, kat_kbli }] }.
 *   Kode tidak ada di master -> GAGAL, record tidak dikirim.
 *   Kode dengan BukancakupanSE = 1 tetap diisi; keterangan ditandai "⚠ KBLI bukan cakupan SE".
 *
 * Tidak dikirim (dibangun ulang FormGear): pilih_umkm_options#n, var_hiden_pml#n,
 *   var_narasi#n, is_from_cawi, templateVersion/validationVersion.
 *
 * Kolom sheet:
 *   A assignment_id | B no_banr | C latitude (opsional) | D longitude (opsional)
 *   | E accuracy (opsional) | F no_bangunan_terbesar (opsional) | G kbli (opsional)
 *   | H catatan (opsional)
 *   Koordinat desimal, koma atau titik (-0,49051 / -0.49051).
 *   latitude & longitude diisi berdua atau dikosongkan berdua; kosong -> geotag
 *   tidak dikirim (isi geotag yang sudah ada di record dibiarkan).
 *   accuracy kosong -> opsi "Akurasi geotag default" (contoh UI: 50 m).
 *   no_bangunan_terbesar kosong -> opsi default di toolbar; keduanya kosong -> tidak dikirim.
 *   kbli: kode 5 digit (08999). 4 digit dianggap nol depannya hilang di Excel (1111 -> 01111).
 *   kbli kosong -> KBLI tidak diubah.
 *   catatan diisi -> field catatan (blok CATATAN) diganti dengan isi sel; kosong -> tidak diubah.
 * ==========================================================================*/

/* Kode penggunaan bangunan yang dipilih di UI untuk kasus ini */
const KODE_BANG = [{ label: '1. Bangunan Khusus Usaha', value: '1' }];

/* Daftar opsi keberadaan usaha yang dibangun FormGear per baris usaha */
const OPSI_KEBERADAAN_USAHA = [
  { label: '0. Tidak Ditemukan', value: '00' }, { label: '1. Ditemukan', value: '1' },
  { label: '3. Tutup', value: '3' }, { label: '9. Non Respon', value: '9' }, { label: '4. Ganda', value: '4' },
];
const USAHA_DITEMUKAN = [{ label: '1. Ditemukan', value: '1', open: false }];
const KODE_TIDAK_DITEMUKAN = ['0', '00'];

/* Identitas usaha yang diisi dari prelist saat baris usaha "ditemukan" (nama dasar, tanpa #n) */
const DARI_PRELIST = ['nama_komersial', 'no_telp', 'email', 'website', 'kbli_prelist'];

/* ---- KBLI ---- */
const KBLI_LOOKUP_URL = 'https://fasih-sm.bps.go.id/app/api/lookup/api/v1/collections/14c6a849-faac-4777-987e-b483bc64a820/filter?version=1';
const KBLI_GENAI_MASTER = [{ description: '', label: 'Pilih dari Master KBLI', value: '999999', open: false }];
const ANOMALI_KBLI = {
  no: '8',
  column: { nama_usaha: 'Nama Usaha/Perusahaan', kbli_prelist: 'KBLI SBR', kbli_akhir: 'KBLI SE2026' },
  message: 'Perbedaan jumlah usaha menurut KBLI 2 digit hasil pendataan dan SBR',
};

/* Disimpan UI dengan force submit */
const DOC_META = { isForceSubmit: true };

const adaKoordinat = (row) => row.latitude != null && row.longitude != null;
const label0 = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : JSON.stringify(v));
const value0 = (v) => (Array.isArray(v) && v[0] ? String(v[0].value) : null);
const kosong = (v) => v == null || v === '' || (Array.isArray(v) && (!v.length || value0(v) == null || value0(v) === ''));
const perluDitemukan = (v) => kosong(v) || KODE_TIDAK_DITEMUKAN.includes(value0(v));
const angkaOpsi = (v) => (v == null || String(v).trim() === '' ? null : Number(String(v).trim().replace(',', '.')));
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);
const teksCatatan = (row) => String(row.catatan ?? '').trim();
const kodeKbli = (s) => { const t = String(s ?? '').trim(); return /^\d{4}$/.test(t) ? `0${t}` : t; };

/* Nomor baris usaha (#n) yang ada di record */
const barisUsahaDari = (answers) => [...new Set(answers
  .map((a) => (a.dataKey.match(/^(?:nama_usaha|keberadaan_usaha|kode_keberadaan_usaha)#(\d+)$/) || [])[1])
  .filter(Boolean))].sort((p, q) => p - q);

/* ---------------------------------------------------------------------------
 * Master KBLI dari API lookup FASIH — dimuat sekali, dicari lokal per kode
 * ------------------------------------------------------------------------- */
const xsrf = () => decodeURIComponent((document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) || [])[1] || '');
const kunci = (o, ...nama) => {
  for (const n of nama) { const k = Object.keys(o).find((x) => x.toLowerCase() === n.toLowerCase()); if (k !== undefined) return o[k]; }
  return undefined;
};

/* Cari array baris tabel di dalam respons (bentuk respons belum pasti: data, data.data, content, ...) */
function cariBaris(x, d = 0) {
  if (!x || typeof x !== 'object' || d > 6) return null;
  if (Array.isArray(x)) {
    if (x.length && x.every((o) => o && typeof o === 'object' && !Array.isArray(o)) && x.some((o) => kunci(o, 'Kode', 'kode_kbli') !== undefined)) return x;
    for (const v of x.slice(0, 5)) { const r = cariBaris(v, d + 1); if (r) return r; }
    return null;
  }
  const kol = x.columns || x.headers || x.header || x.fields;                       // { columns:[..], rows:[[..]] }
  const isi = x.rows || x.data || x.values;
  if (Array.isArray(kol) && Array.isArray(isi) && Array.isArray(isi[0])) {
    const nama = kol.map((c) => (typeof c === 'string' ? c : c.name || c.key || c.field || c.column));
    return isi.map((r) => Object.fromEntries(nama.map((n, i) => [n, r[i]])));
  }
  for (const v of Object.values(x)) { const r = cariBaris(v, d + 1); if (r) return r; }
  return null;
}

let MASTER_KBLI = null;   // { url, janji: Promise<Map kode -> baris> }
function muatMasterKbli(url) {
  if (MASTER_KBLI && MASTER_KBLI.url === url) return MASTER_KBLI.janji;
  const janji = (async () => {
    const h = { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf() };
    const cara = [{ method: 'POST', body: '{}' }, { method: 'POST', body: '[]' }, { method: 'GET' }];
    const catatan = [];
    for (const c of cara) {
      const r = await fetch(url, { method: c.method, credentials: 'include', headers: h, ...(c.body ? { body: c.body } : {}) });
      const teks = await r.text();
      const nama = `${c.method}${c.body ? ' ' + c.body : ''}`;
      if (!r.ok) { catatan.push(`${nama} → HTTP ${r.status} ${teks.slice(0, 150)}`); continue; }
      let j; try { j = JSON.parse(teks); } catch { catatan.push(`${nama} → bukan JSON: ${teks.slice(0, 150)}`); continue; }
      const baris = cariBaris(j);
      if (!baris || !baris.length) { catatan.push(`${nama} → tidak ada baris berkolom Kode: ${teks.slice(0, 300)}`); continue; }
      const peta = new Map(baris.map((o) => [String(kunci(o, 'Kode', 'kode_kbli')).trim(), o]));
      console.log(`[KBLI] master dimuat lewat ${nama}: ${peta.size} kode. Contoh baris:`, baris[0]);
      return peta;
    }
    throw new Error(`lookup KBLI gagal — ${catatan.join(' | ')}`);
  })();
  MASTER_KBLI = { url, janji };
  janji.catch(() => { if (MASTER_KBLI && MASTER_KBLI.janji === janji) MASTER_KBLI = null; });   // gagal -> coba lagi di baris berikutnya
  return janji;
}

/* Kode -> { opsi kbli#n, kategori } meniru jawaban UI */
async function opsiKbli(kode, url) {
  const peta = await muatMasterKbli(url);
  const o = peta.get(kode);
  if (!o) throw new Error(`KBLI ${kode} tidak ada di master (${peta.size} kode dimuat)`);
  const bukanCakupan = String(kunci(o, 'BukancakupanSE') ?? '0') === '1';            // tetap dipakai, hanya ditandai
  const judul = kunci(o, 'judul', 'judul_kbli', 'nama', 'uraian_kbli');
  let kat = kunci(o, 'kategori', 'kat');
  let label = kunci(o, 'kat_kbli', 'label');                        // template: desc = kat_kbli -> "[B][08999]Judul"
  if (label == null) label = `[${kat ?? ''}][${kode}]${judul ?? ''}`;
  kat = (String(label).match(/^\[([A-Z])\]/) || [])[1] ?? kat ?? '';
  const description = kunci(o, 'description', 'deskripsi', 'desc', 'uraian', 'keterangan') ?? '';
  return { opsi: [{ description: String(description), label: String(label), value: kode }], kategori: String(kat), bukanCakupan };
}

/* ---------------------------------------------------------------------------
 * Mutator — meniru isi dokumen setelah bangunan & usaha "ditemukan" di UI
 * ------------------------------------------------------------------------- */
function buatMutator(row, barisUsaha, P, { akurasi, noBang, usahaDitemukan, kbli }, info) {
  return (doc, { set, get }) => {
    const isi = (k, v) => { if (v != null && kosong(get(k))) set(k, v); };       // isi hanya yang belum ada
    const awal = (k, v) => { if (get(k) === undefined) set(k, v); };              // buat baris yang belum ada

    /* ---- status bangunan ---- */
    set('ec_non_keluarga', true);
    set('ada_bang_usaha', [{ label: '1. Ditemukan', value: '1', open: false }]);
    if (noBang != null) set('no_bangunan_terbesar', noBang);
    set('kode_bang', KODE_BANG);
    set('banr', true);
    set('no_banr', String(row.no_banr).trim());
    if (adaKoordinat(row)) set('geotag', FASIH.geotag(row.latitude, row.longitude, akurasi));   // validasi lat/lon di sini

    /* ---- roster usaha ---- */
    const diubah = [], dibiarkan = [];
    for (const n of barisUsaha) {
      set(`kode_keberadaan_usaha#${n}`, OPSI_KEBERADAAN_USAHA);
      const k = get(`keberadaan_usaha#${n}`);
      if (!usahaDitemukan || !perluDitemukan(k)) { dibiarkan.push(`#${n}:${kosong(k) ? '(kosong)' : label0(k)}`); continue; }
      set(`keberadaan_usaha#${n}`, USAHA_DITEMUKAN);
      set(`ec_usaha_respons#${n}`, true);
      for (const f of DARI_PRELIST) isi(`${f}#${n}`, P[`${f}#${n}`]);
      awal(`kategori#${n}`, '');
      awal(`cek6#${n}`, '0.00');
      awal(`list_error_csv#${n}`, FASIH.raw([]));
      diubah.push(n);
    }
    const ditemukan = barisUsaha.filter((n) => value0(get(`keberadaan_usaha#${n}`)) === '1');

    /* ---- KBLI ---- */
    let kbliKe = [];
    if (kbli) {
      kbliKe = diubah.length ? diubah : ditemukan;
      if (!kbliKe.length) throw new Error('kolom kbli diisi, tapi tidak ada usaha berstatus "1. Ditemukan"');
      if (kbliKe.length > 1) throw new Error(`kolom kbli berlaku untuk 1 usaha, record ini punya ${kbliKe.length} usaha (#${kbliKe.join(', #')})`);
      for (const n of kbliKe) {
        info.kbliSebelum = get(`kbli_akhir#${n}`) ?? null;
        isi(`kbli_prelist#${n}`, P[`kbli_prelist#${n}`]);
        set(`kbli_genai#${n}`, FASIH.raw(KBLI_GENAI_MASTER));
        set(`kbli#${n}`, FASIH.raw(kbli.opsi));
        set(`kbli_akhir#${n}`, kbli.opsi[0].value);
        set(`kategori#${n}`, kbli.kategori);
      }
      /* anomali 8: 2 digit KBLI pendataan beda dengan SBR */
      const beda = ditemukan
        .map((n) => ({ nama_usaha: get(`nama_usaha#${n}`), kbli_prelist: get(`kbli_prelist#${n}`) ?? P[`kbli_prelist#${n}`], kbli_akhir: get(`kbli_akhir#${n}`) }))
        .filter((u) => u.kbli_akhir && u.kbli_prelist && String(u.kbli_akhir).slice(0, 2) !== String(u.kbli_prelist).slice(0, 2));
      const lama = get('daftar_anomali');
      const anomali = lama && typeof lama === 'object' && !Array.isArray(lama) ? JSON.parse(JSON.stringify(lama)) : {};
      if (beda.length) anomali['8'] = { no: ANOMALI_KBLI.no, resolved_at: null, column: ANOMALI_KBLI.column, message: ANOMALI_KBLI.message, daftar_anomali: beda };
      else delete anomali['8'];
      if (beda.length || lama !== undefined) set('daftar_anomali', FASIH.raw(anomali));
      info.anomali8 = beda.length;
    }

    /* ---- ringkasan usaha (dari baris yang berkode 1 setelah perubahan) ---- */
    if (usahaDitemukan && diubah.length) {
      set('jumlah_usaha_ditemukan', String(ditemukan.length));
      set('ec_ada_usaha', ditemukan.length > 0);
      set('nib_all', ditemukan.map((n) => get(`nib#${n}`) || P[`nib#${n}`] || '-').join(' / '));
      set('email_all', ditemukan.map((n) => get(`email#${n}`) || P[`email#${n}`]).filter(Boolean).join(' / '));
    }

    /* ---- catatan (opsional) ---- */
    const catatan = teksCatatan(row);
    if (catatan) set('catatan', catatan);

    /* ---- pemberi jawaban & pencocokan ---- */
    set('ak_info', [{ label: 'Lainnya', value: '99' }, { label: 'Pemilik Usaha', value: '98' }]);
    awal('keluarga_match', FASIH.raw(null));
    awal('geotag_match', FASIH.raw(null));
    Object.assign(doc, DOC_META);
    Object.assign(info, { diubah, dibiarkan, kbliKe, jumlahDitemukan: ditemukan.length });
  };
}

async function prosesSatu(row, { dryRun, options }) {
  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers;
  const cari = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;

  const adaBang = cari('ada_bang_usaha');
  if (adaBang === undefined) throw new Error('tidak ada ada_bang_usaha — bukan record usaha/bangunan lainnya?');
  const sebelum = label0(adaBang);
  const barisUsaha = barisUsahaDari(answers);
  const kode = kodeKbli(row.kbli);
  const usahaTertinggal = options.usahaDitemukan && barisUsaha.some((n) => perluDitemukan(cari(`keberadaan_usaha#${n}`)));
  if (options.lewatiJikaSudah && value0(adaBang) === '1' && !usahaTertinggal && !kode && !teksCatatan(row))
    return { skip: true, code: asg.code_identity, ket: `ada_bang_usaha sudah: ${sebelum}` +
             (options.usahaDitemukan && barisUsaha.length ? ' & semua usaha sudah berkode' : '') };

  const P = Object.fromEntries((JSON.parse(asg.pre_defined_data || '{"predata":[]}').predata || []).map((p) => [p.dataKey, p.answer]));
  const akurasi = row.accuracy ?? angkaOpsi(options.akurasiDefault) ?? 50;
  const noBang = row.no_bangunan_terbesar ?? angkaOpsi(options.noBangDefault);
  const kbli = kode ? await opsiKbli(kode, String(options.kbliLookupUrl || KBLI_LOOKUP_URL).trim()) : null;
  const info = {};
  const mutasi = buatMutator(row, barisUsaha, P, { akurasi, noBang, usahaDitemukan: options.usahaDitemukan, kbli }, info);

  /* Rencana (dry run). LIVE hanya dikirim bila memang ada perubahan. */
  const cek = await FASIH.patch(row.assignment_id, mutasi, { dryRun: true, log: false });
  if (!cek.nChanges) return { skip: true, code: cek.code, ket: 'tidak ada perubahan' };
  const r = dryRun ? cek : await FASIH.patch(row.assignment_id, mutasi, { dryRun: false, log: false });

  return { code: r.code, ket: [
    `sebelum: ${sebelum}`,
    `BANR ${String(row.no_banr).trim()}`,
    adaKoordinat(row) ? `${row.latitude}, ${row.longitude} (±${akurasi} m)` : 'geotag tidak diubah',
    ...(noBang != null ? [`no_bangunan_terbesar ${noBang}`] : []),
    !barisUsaha.length ? 'tidak ada baris usaha'
      : info.diubah.length ? `usaha → 1. Ditemukan: #${info.diubah.join(', #')}` : 'keberadaan usaha tidak diubah',
    ...(info.dibiarkan.length ? [`dibiarkan ${info.dibiarkan.join(' ')}`] : []),
    ...(kbli ? [`KBLI #${info.kbliKe[0]} ${info.kbliSebelum ?? '(kosong)'} → ${kbli.opsi[0].label}`,
                ...(kbli.bukanCakupan ? ['⚠ KBLI bukan cakupan SE'] : []),
                ...(info.anomali8 ? ['⚠ anomali 8: 2 digit KBLI ≠ SBR'] : [])] : []),
    ...(teksCatatan(row) ? ['catatan diubah'] : []),
    `${info.jumlahDitemukan}/${barisUsaha.length} usaha ditemukan`,
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · ') };
}

FASIH_BATCH.register({
  id: 'usaha-tidak-ditemukan-ke-ditemukan-banr',
  name: 'Update Usaha BANR',
  description: 'Bangunan & usaha 0. Tidak Ditemukan → 1. Ditemukan + BANR (+ geotag, KBLI)',
  columns: [
    { key: 'assignment_id',        type: 'uuid', required: true, unique: true },
    { key: 'no_banr',              required: true, width: 160, trim: true },
    { key: 'latitude',             title: 'latitude (opsional)', type: 'number', width: 140 },
    { key: 'longitude',            title: 'longitude (opsional)', type: 'number', width: 140 },
    { key: 'accuracy',             title: 'accuracy (opsional)', type: 'number', width: 140 },
    { key: 'no_bangunan_terbesar', title: 'no_bangunan_terbesar (opsional)', type: 'integer', width: 200 },
    { key: 'kbli',                 title: 'kbli (opsional)', width: 120, trim: true, mono: true },
    { key: 'catatan',              title: 'catatan (opsional)', type: 'text', width: 260 },
  ],
  idColumn: 'assignment_id',
  options: [
    { key: 'lewatiJikaSudah', label: 'Lewati yang sudah ditemukan', type: 'checkbox', default: true,
      hint: 'Record yang ada_bang_usaha-nya sudah "1. Ditemukan" (tidak ada usaha yang masih tidak ditemukan, kolom kbli & catatan kosong) tidak diubah' },
    { key: 'usahaDitemukan', label: 'Usaha → 1. Ditemukan', type: 'checkbox', default: true,
      hint: 'Baris usaha "0. Tidak Ditemukan"/kosong diubah ke "1. Ditemukan" + identitas dari prelist. Tutup/Non Respon/Ganda dibiarkan. Matikan = pola lama (keberadaan usaha tetap).' },
    { key: 'akurasiDefault', label: 'Akurasi geotag default (m)', type: 'number', default: 50,
      hint: 'Dipakai bila kolom accuracy kosong (dan koordinat diisi)' },
    { key: 'noBangDefault', label: 'No. bangunan terbesar default', type: 'number', default: '',
      hint: 'Dipakai bila kolom no_bangunan_terbesar kosong. Kosongkan = tidak dikirim. Nilainya beda per SLS.' },
    { key: 'kbliLookupUrl', label: 'URL lookup KBLI', type: 'text', default: KBLI_LOOKUP_URL,
      hint: 'API lookup master KBLI (m_kbli2025_se_v3A). Ganti bila koleksi/versi berubah.' },
  ],
  validateRow: (row) => {
    const e = {};
    if (/\s/.test(row.no_banr)) e.no_banr = 'tidak boleh ada spasi';
    if (row.latitude != null && (row.latitude < -90 || row.latitude > 90)) e.latitude = 'harus -90 s.d. 90';
    if (row.longitude != null && (row.longitude < -180 || row.longitude > 180)) e.longitude = 'harus -180 s.d. 180';
    if ((row.latitude == null) !== (row.longitude == null))
      e[row.latitude == null ? 'latitude' : 'longitude'] = 'isi latitude & longitude berdua, atau kosongkan berdua';
    if (row.latitude === 0 && row.longitude === 0) e.latitude = 'koordinat 0,0';
    if (row.accuracy != null && row.accuracy <= 0) e.accuracy = 'harus > 0';
    const kode = kodeKbli(row.kbli);
    if (kode && !/^\d{5}$/.test(kode)) e.kbli = 'harus kode 5 digit, mis. 08999';
    return Object.keys(e).length ? e : null;
  },

  async process(row, { dryRun, options }) {
    return prosesSatu(row, { dryRun, options });
  },
});
