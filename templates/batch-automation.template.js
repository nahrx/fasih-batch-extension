/* ============================================================================
 * batch-automation.js — TEMPLATE untuk extension FASIH Batch
 * ----------------------------------------------------------------------------
 * Cara pakai:
 *   1. Ubah bagian bertanda  TODO  (id, name, columns, process).
 *   2. Di panel FASIH Batch: Import script -> pilih file ini.
 *   3. Tempel data dari Excel ke sheet, Dry run, periksa, uji 1 baris LIVE, lalu LIVE.
 *
 * Contoh bawaan template ini sudah bisa dipakai: MENGUBAH SATU FIELD per baris.
 *   kolom A assignment_id | B data_key (mis. kode_bang, catatan, hubungan#2) | C nilai
 *   Nilai pilihan cukup kodenya ('1', '4') — diterjemahkan ke opsi template oleh FASIH.
 *   Cari data_key dengan:  await FASIH.init(); FASIH.find('nama usaha')  di Console.
 *
 * ⚠️  SERVER TIDAK MEMVALIDASI ISI DOKUMEN. Aturan FormGear (enable condition,
 *     kalkulasi turunan, konsistensi antar-blok) TIDAK dijalankan. Selalu dry run,
 *     uji 1 record, lalu buka hasilnya di UI sebelum menjalankan semuanya.
 *
 * ---------------------------------------------------------------------------
 * KONTRAK  FASIH_BATCH.register({...})
 *   id          : string unik. Data sheet & pengaturan disimpan per id — GANTI untuk tiap kasus.
 *   name        : judul panel
 *   description : subjudul panel
 *   columns     : kolom sheet, urut A, B, C, ... (yang ditempel dari Excel)
 *                 { key, title?, type?, required?, unique?, width?, mono?, trim? }
 *                 type: 'text' (default) | 'uuid' | 'number' | 'integer'
 *                 key tidak boleh diawali "_" (dipakai panel untuk status/keterangan)
 *   idColumn    : kolom assignment id — dipakai FASIH.init() dan backup sebelum LIVE.
 *                 Default: kolom uuid pertama. null = tanpa init/backup otomatis.
 *   options     : pengaturan tambahan di toolbar (nilai masuk ke ctx.options)
 *                 { key, label, type: 'checkbox'|'number'|'text'|'select', default, choices?, hint? }
 *   remarks     : kolom remark (opsional) — muncul setelah kolom di atas saat toggle "Remark"
 *                 di toolbar aktif (default nonaktif).
 *                 { dataKey, key?, title?, width? }  atau cukup 'dataKey'; key default "remark_<dataKey>"
 *                 Sel yang terisi ditulis sebagai catatan per-pertanyaan dengan
 *                 FASIH.setComment(id, dataKey, teks) setelah process() berhasil (bukan LEWATI/GAGAL).
 *                 Teks yang sama persis di dataKey itu tidak ditulis dua kali. Butuh idColumn.
 *   validateRow : (row) => null | 'pesan' | { kolom: 'pesan' }     — sel merah, proses ditahan
 *   before      : async (rows, ctx)    — menggantikan FASIH.init() bawaan       (opsional)
 *   after       : async (results, ctx) — setelah semua baris                     (opsional)
 *   process     : async (row, ctx) => { skip?, status?, code?, ket? }
 *                   return { skip: true }  -> status LEWATI
 *                   return { ... }         -> status DRY RUN / OK
 *                   throw new Error('...') -> status GAGAL, pesan ke kolom keterangan
 *
 *   row : { [key kolom]: nilai }  — type number/integer sudah Number (kosong = null)
 *   ctx : { dryRun, options, FASIH, index, total, rowNumber, sleep }
 *         options berisi jeda, backup, remark, + options di atas
 *
 * FASIH (general_console.js) yang sering dipakai:
 *   FASIH.getAssignment(id)                         -> record mentah (data = JSON string)
 *   FASIH.update(id, { dataKey: nilai }, { dryRun, log:false })
 *   FASIH.patch(id, (doc, { get, set }) => {...}, { dryRun, log:false })
 *       hasil: { code, status, version, versionAfter, nChanges, changes, ok }
 *   FASIH.raw(nilai)                 -> pasang apa adanya, tanpa terjemahan opsi
 *   FASIH.geotag(lat, lon, akurasi)  -> nilai field geotag
 *   FASIH.schema('kode_bang')        -> tipe + daftar opsi valid
 *   FASIH.setComment(id, dataKey, teks, { dryRun })  -> catatan per-pertanyaan (dipakai kolom remark)
 *
 * File ini dijalankan sebagai badan fungsi async: boleh pakai await di tingkat atas,
 * const/function di sini tidak bocor ke halaman, dan aman di-import ulang.
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * Helper (boleh dihapus / ditambah sesuai kebutuhan)
 * ------------------------------------------------------------------------- */
const tampil = (v) => v == null ? '(kosong)'
  : Array.isArray(v) ? v.map((x) => (x && x.label != null ? x.label : JSON.stringify(x))).join(' / ')
  : typeof v === 'object' ? JSON.stringify(v) : String(v);

/* ---------------------------------------------------------------------------
 * Registrasi
 * ------------------------------------------------------------------------- */
FASIH_BATCH.register({
  id: 'template-ubah-field',                       // TODO: ganti, unik per kasus
  name: 'Ubah Satu Field',                         // TODO
  description: 'assignment_id + data_key + nilai',  // TODO

  /* TODO: kolom yang ditempel dari Excel */
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true },
    { key: 'data_key', required: true, width: 200, trim: true },
    { key: 'nilai', width: 280 },
    // { key: 'latitude', type: 'number' },
    // { key: 'no_banr', title: 'nomor BANR', required: true },
  ],
  idColumn: 'assignment_id',

  /* TODO: pengaturan tambahan (boleh dikosongkan: options: []) */
  options: [
    { key: 'hanyaJikaAda', label: 'Hanya field yang sudah ada', type: 'checkbox', default: true,
      hint: 'Tolak (GAGAL) kalau data_key belum ada di record — mencegah salah ketik dataKey' },
    { key: 'nilaiJson', label: 'Nilai berupa JSON mentah', type: 'checkbox', default: false,
      hint: 'Nilai di-JSON.parse lalu dipasang apa adanya lewat FASIH.raw (tanpa terjemahan opsi)' },
  ],

  /* TODO: kolom remark (opsional). Muncul saat toggle "Remark" di toolbar dicentang. */
  remarks: [
    // { dataKey: 'kode_bang', title: 'remark kode bangunan' },
    // 'catatan',                                   // singkatan -> kolom remark_catatan
  ],

  /* Validasi tambahan per baris (opsional). Kembalikan null kalau valid. */
  validateRow(row) {
    if (/\s/.test(row.data_key)) return { data_key: 'tidak boleh ada spasi' };
    return null;
  },

  /* Default panel: await FASIH.init({ assignmentId: baris pertama }).
     Aktifkan kalau perlu persiapan lain (mis. memuat referensi sekali saja). */
  // async before(rows, { FASIH }) {
  //   await FASIH.init({ assignmentId: rows[0].assignment_id });
  // },

  /* TODO: inti proses satu baris */
  async process(row, { dryRun, options, FASIH }) {
    const nilai = options.nilaiJson ? FASIH.raw(JSON.parse(row.nilai)) : row.nilai;
    let sebelum;
    const ubah = (doc, { get, set }) => {
      sebelum = get(row.data_key);
      if (sebelum === undefined && options.hanyaJikaAda) throw new Error(`field ${row.data_key} belum ada di record`);
      set(row.data_key, nilai);
      // doc.isForceSubmit = true;              // bila kasusnya disimpan UI dengan force submit
    };

    /* Cek dulu tanpa mengirim: kalau tidak ada yang berubah, jangan bump versi record */
    const cek = await FASIH.patch(row.assignment_id, ubah, { dryRun: true, log: false });
    if (!cek.nChanges) return { skip: true, code: cek.code, ket: `${row.data_key} sudah: ${tampil(sebelum)}` };

    const res = dryRun ? cek : await FASIH.patch(row.assignment_id, ubah, { dryRun: false, log: false });
    const sesudah = cek.changes.find((c) => c.dataKey === row.data_key);
    return {
      code: res.code,
      ket: `${row.data_key}: ${tampil(sebelum)} → ${sesudah ? sesudah.ke : row.nilai}` +
           ` · ${res.nChanges} perubahan · ${dryRun ? `v${res.version}` : `v${res.version} → v${res.versionAfter}`}`,
    };
  },

  /* Ringkasan setelah semua baris (opsional) */
  // async after(results, { dryRun }) {
  //   console.table(results.map((r) => ({ baris: r.row, status: r.status, ...r.item })));
  // },
});

/* ---------------------------------------------------------------------------
 * POLA LAIN untuk process() — salin ke atas bila perlu
 * ---------------------------------------------------------------------------
 * 1) Beberapa field sekaligus
 *    const r = await FASIH.update(row.assignment_id,
 *      { kode_bang: '1', no_banr: row.no_banr, banr: true }, { dryRun, log: false });
 *    return { code: r.code, ket: `${r.nChanges} perubahan` };
 *
 * 2) Lewati berdasarkan kondisi record
 *    const asg = await FASIH.getAssignment(row.assignment_id);
 *    const ans = JSON.parse(asg.data).answers;
 *    const cari = (k) => (ans.find((a) => a.dataKey === k) || {}).answer;
 *    if (cari('ada_bang_usaha')?.[0]?.value === '1') return { skip: true, code: asg.code_identity, ket: 'sudah ditemukan' };
 *
 * 3) Geotag dari kolom latitude/longitude (type: 'number')
 *    set('geotag', FASIH.geotag(row.latitude, row.longitude, 50));
 *
 * 4) Semua baris roster usaha (keberadaan_usaha#1, #2, ...)
 *    for (const a of doc.answers) {
 *      const m = a.dataKey.match(/^keberadaan_usaha#(\d+)$/);
 *      if (m) set(a.dataKey, FASIH.raw([{ label: '1. Ditemukan', value: '1', open: false }]));
 *    }
 *
 * 5) Menghapus baris jawaban
 *    const i = doc.answers.findIndex((a) => a.dataKey === 'foto_depan_p');
 *    if (i >= 0) doc.answers.splice(i, 1);
 * ------------------------------------------------------------------------- */
