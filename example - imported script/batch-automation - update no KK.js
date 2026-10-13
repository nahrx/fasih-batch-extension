/* ============================================================================
 * batch-automation - no kk.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: koreksi nomor Kartu Keluarga (No. KK) di record keluarga
 *   Pola dari diff record 09e65007 (SUMADI / SITI AMIFA, v5 -> v6):
 *     kk salah.json -> kk benar.json
 *
 * Yang berubah di contoh:
 *   no_kk         6472051110100009 -> 6472051110100001   (Blok identitas keluarga)
 *   dtsen_no_kk   6472051110100009 -> 6472051110100001   (Blok III, salinan no_kk)
 *   + catatan "#DC_03" di pertanyaan no_kk  -> pakai kolom remark (toggle Remark)
 * Tidak dikirim (dibangun ulang FormGear saat record dibuka, nilainya sama):
 *   jum_krt, jk_krt, umur_krt, jum_*, no_urut_kk_var#n, nama_dtsen_var#n, index_ak#n,
 *   ec_art_*#n, total_/selisih_pendapatan_*, daftar_anomali_dtsen, tanggal_anomali,
 *   tanggal_mulai_anomali, anomali_*_resolved_at, cek_anomali_button, custom_script_table,
 *   createdAt/updatedAt per jawaban. isForceSubmit tidak berubah.
 *
 * Kolom sheet:
 *   A assignment_id | B no_kk (benar, 16 digit, opsional) | C no_kk_lama (opsional)
 *   no_kk_lama terisi -> record hanya diubah kalau no_kk di record SAMA dengan no_kk_lama
 *   (pengaman salah tempel baris). Kosong -> tidak dicek.
 *   Data hanya dikirim kalau no_kk terisi dan BERBEDA dari record. no_kk kosong / sudah
 *   sama -> data tidak disentuh: ada remark -> hanya remark yang ditulis; tanpa remark -> LEWATI.
 *   Format sel no_kk di Excel sebagai Text, supaya tidak jadi 6,47205E+15.
 * ==========================================================================*/

/* Field yang menyimpan No. KK — keduanya diisi nilai yang sama di UI */
const FIELD_KK = ['no_kk', 'dtsen_no_kk'];

const POLA_KK = /^\d{16}$/;
const teks = (v) => (v == null ? '' : String(v).trim());
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

async function prosesSatu(row, { dryRun, remarks = [] }) {
  const kkBaru = teks(row.no_kk);
  const kkLama = teks(row.no_kk_lama);

  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers;
  const ada = (k) => answers.some((a) => a.dataKey === k);
  const cari = (k) => teks((answers.find((a) => a.dataKey === k) || {}).answer);

  if (!ada('no_kk')) throw new Error('tidak ada no_kk — bukan record keluarga?');
  const sebelum = cari('no_kk');

  /* dtsen_no_kk hanya diisi kalau barisnya memang ada (Blok III sudah terbentuk) */
  const field = FIELD_KK.filter((k) => k === 'no_kk' || ada(k));
  const berubah = kkBaru ? field.filter((k) => cari(k) !== kkBaru) : [];

  /* Tidak ada data yang diubah: ada remark -> diteruskan supaya panel menulis remark-nya saja */
  if (!berubah.length) {
    const ket = (kkBaru ? `no_kk sudah ${kkBaru}` : `kolom no_kk kosong (record: ${sebelum || '(kosong)'})`) +
                (remarks.length ? ' — data tidak diubah, hanya remark' : '');
    if (remarks.length && kkLama && sebelum !== kkLama && sebelum !== kkBaru)
      return { skip: true, code: asg.code_identity, ket: `no_kk di record ${sebelum || '(kosong)'} ≠ no_kk_lama ${kkLama}` };
    return remarks.length ? { code: asg.code_identity, ket } : { skip: true, code: asg.code_identity, ket };
  }

  if (kkLama && sebelum !== kkLama)
    return { skip: true, code: asg.code_identity, ket: `no_kk di record ${sebelum || '(kosong)'} ≠ no_kk_lama ${kkLama}` };

  const ubah = berubah.map((k) => `${k} ${cari(k) || '(kosong)'} → ${kkBaru}`);
  const r = await FASIH.patch(row.assignment_id, (doc, { set }) => {
    for (const k of berubah) set(k, kkBaru);
  }, { dryRun, log: false });

  return { code: r.code, ket: [...ubah, `${r.nChanges} perubahan`, versi(r, dryRun)].join(' · ') };
}

FASIH_BATCH.register({
  id: 'koreksi-no-kk-keluarga',
  name: 'Koreksi No. KK',
  description: 'Ganti no_kk & dtsen_no_kk dengan nomor KK yang benar',
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
    { key: 'no_kk',         title: 'no_kk (benar, opsional)', width: 180, mono: true },
    { key: 'no_kk_lama',    title: 'no_kk_lama (opsional)', width: 180, mono: true },
  ],
  idColumn: 'assignment_id',
  /* Catatan per-pertanyaan (mis. "#DC_03") — muncul saat toggle Remark aktif */
  remarks: [
    { dataKey: 'no_kk', title: 'remark no_kk' },
  ],
  validateRow: (row) => {
    const e = {};
    if (teks(row.no_kk) && !POLA_KK.test(teks(row.no_kk))) e.no_kk = 'harus 16 digit angka (format sel Excel sebagai Text)';
    if (teks(row.no_kk_lama) && !POLA_KK.test(teks(row.no_kk_lama))) e.no_kk_lama = 'harus 16 digit angka';
    if (!e.no_kk && teks(row.no_kk) && teks(row.no_kk) === teks(row.no_kk_lama)) e.no_kk = 'sama dengan no_kk_lama';
    return Object.keys(e).length ? e : null;
  },

  async process(row, { dryRun, remarks }) {
    return prosesSatu(row, { dryRun, remarks });
  },
});
