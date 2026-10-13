/* ============================================================================
 * batch-automation - keuangan usaha.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: koreksi nilai keuangan usaha (pengeluaran & pendapatan) di record keluarga
 *   Pola dari diff record 9f5f702e (YUHANAH, usaha "YUHANA BUTIK", v13 -> v14):
 *     keluarga ntb salah.json -> keluarga ntb benar.json
 *   sama dengan "update keuangan usaha - batch.js".
 *
 * Usaha dicari BERDASARKAN NAMANYA, bukan nomor baris: kolom nama_usaha dicocokkan
 * dengan nama_usaha#n / nama_usaha_edit#n / nama_komersial#n (tanpa beda huruf
 * besar-kecil & spasi). Tidak ada usaha yang namanya cocok -> baris LEWATI.
 *
 * Yang berubah di contoh (baris usaha #1001):
 *   biaya_produksi#n       24.000.000 -> 2.961.702
 *   biaya_pembelian#n      36.000.000 -> 25.000.000
 *   operasional#n           4.200.000 -> 36.000.000
 *   nilai_pendapatan#n     48.000.000 -> 50.500.000
 *   total_pengeluaran#n    69.200.000 -> 68.961.702   = gaji + biaya_produksi + biaya_pembelian
 *                                                       + operasional + non_operasional
 *   total_pendapatan#n    108.000.000 -> 110.500.000  = nilai_pendapatan + pendapatan_lain
 * Tidak dikirim (dibangun ulang FormGear saat record dibuka):
 *   pilih_umkm_options#n, var_hiden_pml#n, tanggal_anomali, tanggal_mulai_anomali,
 *   anomali_*_resolved_at, cek_anomali_button, no_bangunan_terbesar,
 *   templateVersion/validationVersion, createdAt/updatedAt per jawaban.
 *
 * Kolom sheet:
 *   A assignment_id | B nama_usaha | C biaya_produksi | D biaya_pembelian | E operasional
 *   | F nilai_pendapatan | G gaji | H non_operasional | I pendapatan_lain
 *   Semua kolom angka (C..I) opsional. Sel KOSONG = nilai lama dipertahankan.
 *   Total dihitung ulang otomatis, tapi HANYA kalau ada kolom angka yang nilainya berbeda
 *   dari record. Kolom angka kosong semua / sama semua -> data tidak disentuh:
 *   ada remark -> hanya remark yang ditulis; tanpa remark -> LEWATI.
 *   Angka tanpa pemisah ribuan (2961702, bukan 2.961.702).
 *   Satu baris = satu usaha; keluarga dengan 2 usaha -> 2 baris dengan assignment_id sama.
 *
 * Remark (toggle "Remark" di toolbar): kolom remark_nama_usaha, remark_biaya_produksi,
 *   remark_biaya_pembelian, remark_operasional, remark_nilai_pendapatan, remark_gaji,
 *   remark_non_operasional, remark_pendapatan_lain — ditambahkan panel setelah kolom I.
 *   Sel terisi ditulis sebagai catatan di pertanyaan <field>#n baris usaha yang cocok
 *   (mis. remark_operasional -> operasional#1001), satu submit per remark.
 *   Tidak ada data yang diubah tapi ada remark -> hanya remark yang ditulis.
 *   Usaha tidak ditemukan (LEWATI) -> remark juga tidak ditulis.
 * ==========================================================================*/

/* Komponen total per baris usaha (nama dasar, tanpa #n) — urutan = kolom C.. di sheet */
const KOMPONEN_PENGELUARAN = ['gaji', 'biaya_produksi', 'biaya_pembelian', 'operasional', 'non_operasional'];
const KOMPONEN_PENDAPATAN  = ['nilai_pendapatan', 'pendapatan_lain'];
const KOLOM_NILAI = ['biaya_produksi', 'biaya_pembelian', 'operasional', 'nilai_pendapatan',
                     'gaji', 'non_operasional', 'pendapatan_lain'];

/* Field nama yang dicocokkan dengan kolom nama_usaha */
const FIELD_NAMA = ['nama_usaha', 'nama_usaha_edit', 'nama_komersial'];

/* Field yang punya kolom remark (catatan per-pertanyaan di baris usaha #n) */
const FIELD_REMARK = ['nama_usaha', ...KOLOM_NILAI];

const norm = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const rp = (v) => (v == null ? '-' : Number(v).toLocaleString('id-ID'));
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

/* Baris usaha (n) yang namanya cocok */
function cariBarisUsaha(answers, namaUsaha) {
  const target = norm(namaUsaha);
  const baris = new Set();
  for (const a of answers) {
    const m = a.dataKey.match(/^([a-z_]+)#(\d+)$/);
    if (m && FIELD_NAMA.includes(m[1]) && norm(a.answer) === target) baris.add(m[2]);
  }
  return [...baris];
}

const daftarNamaUsaha = (answers) => answers
  .filter((a) => /^nama_usaha#\d+$/.test(a.dataKey))
  .map((a) => `#${a.dataKey.split('#')[1]} ${a.answer}`).join(' | ') || '(tidak ada usaha)';

/* Nilai yang dikirim — meniru isi dokumen setelah blok keuangan diedit di UI */
function nilaiBaru(nilai, n, cari) {
  const ambil = (k) => (k in nilai ? nilai[k] : Number(cari(`${k}#${n}`)) || 0);
  const V = {};
  for (const [k, v] of Object.entries(nilai)) V[`${k}#${n}`] = v;
  V[`total_pengeluaran#${n}`] = KOMPONEN_PENGELUARAN.reduce((s, k) => s + ambil(k), 0);
  V[`total_pendapatan#${n}`]  = KOMPONEN_PENDAPATAN.reduce((s, k) => s + ambil(k), 0);
  return V;
}

async function prosesSatu(row, { dryRun, remarks = [] }) {
  const nilai = Object.fromEntries(KOLOM_NILAI.filter((k) => row[k] != null).map((k) => [k, row[k]]));

  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers;
  const cari = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;

  const cocok = cariBarisUsaha(answers, row.nama_usaha);
  if (!cocok.length)
    return { skip: true, code: asg.code_identity, ket: `usaha "${row.nama_usaha}" tidak ditemukan — ada: ${daftarNamaUsaha(answers)}` };
  if (cocok.length > 1)
    return { skip: true, code: asg.code_identity, ket: `nama "${row.nama_usaha}" cocok dengan >1 baris usaha (#${cocok.join(', #')})` };
  const n = cocok[0];

  /* remark ditulis panel ke field baris usaha ini: nama_usaha -> nama_usaha#1001 */
  const remarkKeys = Object.fromEntries(FIELD_REMARK.map((k) => [k, `${k}#${n}`]));

  /* Data hanya dikirim kalau ada kolom nilai terisi yang BERBEDA dari record.
     Kolom nilai kosong semua / sama semua -> data tidak disentuh (total tidak dihitung ulang);
     ada remark -> tetap diteruskan supaya panel menulis remark-nya saja. */
  const berubah = Object.keys(nilai).filter((k) => Number(cari(`${k}#${n}`)) !== nilai[k] || cari(`${k}#${n}`) == null);
  if (!berubah.length) {
    const ket = `#${n} ${cari(`nama_usaha#${n}`)}: ` +
      (Object.keys(nilai).length ? 'nilai sudah sesuai' : 'kolom nilai kosong') + (remarks.length ? ' — data tidak diubah, hanya remark' : '');
    return remarks.length ? { code: asg.code_identity, ket, remarkKeys } : { skip: true, code: asg.code_identity, ket };
  }

  const V = nilaiBaru(nilai, n, cari);
  const ubah = berubah.map((k) => `${k} ${rp(cari(`${k}#${n}`))} → ${rp(nilai[k])}`);
  const r = await FASIH.patch(row.assignment_id, (doc, { set }) => {
    for (const [k, v] of Object.entries(V)) set(k, v);
  }, { dryRun, log: false });

  return { code: r.code, ket: [
    `#${n} ${cari(`nama_usaha#${n}`)}`,
    ...ubah,
    `pengeluaran ${rp(cari(`total_pengeluaran#${n}`))} → ${rp(V[`total_pengeluaran#${n}`])}`,
    `pendapatan ${rp(cari(`total_pendapatan#${n}`))} → ${rp(V[`total_pendapatan#${n}`])}`,
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · '), remarkKeys };
}

FASIH_BATCH.register({
  id: 'keuangan-usaha-keluarga',
  name: 'Koreksi Keuangan Usaha',
  description: 'Cari usaha berdasarkan nama → ubah biaya/pendapatan, hitung ulang total pengeluaran & pendapatan',
  columns: [
    { key: 'assignment_id',    type: 'uuid', required: true },
    { key: 'nama_usaha',       required: true, width: 220 },
    { key: 'biaya_produksi',   title: 'biaya_produksi (opsional)', type: 'integer' },
    { key: 'biaya_pembelian',  title: 'biaya_pembelian (opsional)', type: 'integer' },
    { key: 'operasional',      title: 'operasional (opsional)', type: 'integer' },
    { key: 'nilai_pendapatan', title: 'nilai_pendapatan (opsional)', type: 'integer' },
    { key: 'gaji',             title: 'gaji (opsional)', type: 'integer' },
    { key: 'non_operasional',  title: 'non_operasional (opsional)', type: 'integer' },
    { key: 'pendapatan_lain',  title: 'pendapatan_lain (opsional)', type: 'integer' },
  ],
  idColumn: 'assignment_id',
  /* Catatan per-pertanyaan — muncul saat toggle Remark aktif; ditulis ke <dataKey>#n
     baris usaha yang cocok (lewat remarkKeys dari process) */
  remarks: FIELD_REMARK.map((k) => ({ dataKey: k, title: `remark ${k}` })),
  validateRow: (row) => {
    const e = {};
    for (const k of KOLOM_NILAI) if (row[k] != null && row[k] < 0) e[k] = 'tidak boleh negatif';
    return Object.keys(e).length ? e : null;
  },

  async process(row, { dryRun, remarks }) {
    return prosesSatu(row, { dryRun, remarks });
  },
});
