/* ============================================================================
 * batch-automation - keluarga tunggal meninggal.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: keluarga TUNGGAL (1 anggota keluarga di prelist) berstatus "0. Tidak Ditemukan (STOP)"
 *        ->  "3. Meninggal"
 *   Pola dari diff record aeab28ed (SUWARJI S., v2 -> v3):
 *     keluarga tunggal tidak ditemukan.json -> keluarga tunggal meninggal.json
 *
 * Yang berubah di contoh:
 *   ada_keluarga  0. Tidak Ditemukan (STOP) -> 3. Meninggal
 *   ec_ada_usaha  (false) -> baris dihapus  (enable-condition usaha; tidak ada di record "meninggal")
 * Tidak dikirim (dibangun ulang FormGear saat record dibuka):
 *   tanggal_anomali, tanggal_mulai_anomali, cek_anomali_button, custom_script_table,
 *   createdAt/updatedAt per jawaban. isForceSubmit tidak berubah.
 *   catatan di contoh sudah "SUDAH MENINGGAL" sebelum diubah -> pakai kolom catatan bila perlu.
 *
 * Syarat diproses (selain itu -> LEWATI, record tidak dikirim, versi tidak naik):
 *   1. ada_keluarga saat ini = 0. Tidak Ditemukan
 *   2. keluarga tunggal: list_individu_dtsen_prelist berisi tepat 1 anggota dan
 *      jumlah_ak_kk prelist (kalau ada) = 1
 *
 * Kolom sheet:
 *   A assignment_id | B catatan (opsional)
 *   catatan diisi -> field catatan (blok CATATAN) diganti dengan isi sel; kosong -> tidak diubah.
 * ==========================================================================*/

/* Status keluarga tujuan — kode opsi ada_keluarga di template */
const KODE_ASAL = '0';        // 0. Tidak Ditemukan (STOP)
const KODE_TUJUAN = '3';      // 3. Meninggal

/* Baris yang hilang di record "meninggal" (dihapus UI saat status diganti) */
const HAPUS = ['ec_ada_usaha'];

const label0 = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : JSON.stringify(v ?? null));
const value0 = (v) => (Array.isArray(v) && v[0] ? String(v[0].value) : null);
const teks = (v) => (v == null ? '' : String(v).trim());
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

/* Jumlah anggota keluarga prelist: dari jawaban, cadangan dari pre_defined_data */
function jumlahAK(answers, predata) {
  const A = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;
  const P = (k) => (predata.find((p) => p.dataKey === k) || {}).answer;
  const daftar = A('list_individu_dtsen_prelist') ?? P('list_individu_dtsen_prelist');
  const jml = P('jumlah_ak_kk');
  return { n: Array.isArray(daftar) ? daftar.length : null, jml: jml == null ? null : Number(jml),
           nama: Array.isArray(daftar) ? daftar.map((x) => x.nama_ak ?? x.label).join(', ') : '' };
}

async function prosesSatu(row, { dryRun }) {
  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers || [];
  const predata = asg.pre_defined_data ? JSON.parse(asg.pre_defined_data).predata || [] : [];
  const code = asg.code_identity;

  const adaKel = (answers.find((a) => a.dataKey === 'ada_keluarga') || {}).answer;
  if (adaKel === undefined) throw new Error('tidak ada ada_keluarga — bukan record keluarga?');
  if (value0(adaKel) === KODE_TUJUAN) return { skip: true, code, ket: `ada_keluarga sudah: ${label0(adaKel)}` };
  if (value0(adaKel) !== KODE_ASAL)   return { skip: true, code, ket: `bukan Tidak Ditemukan (ada_keluarga: ${label0(adaKel)})` };

  const { n, jml, nama } = jumlahAK(answers, predata);
  if (n == null) return { skip: true, code, ket: 'list_individu_dtsen_prelist tidak ada — jumlah AK tidak diketahui' };
  if (n !== 1 || (jml != null && jml !== 1))
    return { skip: true, code, ket: `bukan keluarga tunggal (${n} AK di prelist${jml != null ? `, jumlah_ak_kk ${jml}` : ''})` };

  const catatan = teks(row.catatan);
  const dihapus = [];
  const r = await FASIH.patch(row.assignment_id, (doc, { set }) => {
    set('ada_keluarga', KODE_TUJUAN);                   // coerce: label & value dari template, kunci jawaban lama dipertahankan
    if (catatan) set('catatan', catatan);
    for (const k of HAPUS) {
      const i = doc.answers.findIndex((a) => a.dataKey === k);
      if (i >= 0) { doc.answers.splice(i, 1); dihapus.push(k); }
    }
  }, { dryRun, log: false });

  return { code: r.code, ket: [
    `${nama || '1 AK'}`,
    `${label0(adaKel)} → ${FASIH.schema('ada_keluarga')?.options.find((o) => String(o.value) === KODE_TUJUAN)?.label || KODE_TUJUAN}`,
    ...(catatan ? ['catatan diubah'] : []),
    ...(dihapus.length ? [`hapus ${dihapus.join(', ')}`] : []),
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · ') };
}

FASIH_BATCH.register({
  id: 'keluarga-tunggal-tidak-ditemukan-ke-meninggal',
  name: 'Keluarga Tunggal Meninggal',
  description: 'Keluarga tunggal 0. Tidak Ditemukan → 3. Meninggal',
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
    { key: 'catatan',       title: 'catatan (opsional)', type: 'text', width: 260 },
  ],
  idColumn: 'assignment_id',
  /* Catatan per-pertanyaan — muncul saat toggle Remark aktif */
  remarks: [
    { dataKey: 'ada_keluarga', title: 'remark ada_keluarga' },
  ],

  async process(row, { dryRun }) {
    return prosesSatu(row, { dryRun });
  },
});
