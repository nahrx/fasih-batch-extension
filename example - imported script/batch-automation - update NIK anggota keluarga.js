/* ============================================================================
 * batch-automation - update NIK anggota keluarga.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: koreksi NIK anggota keluarga (AK) di record keluarga
 *   Pola dari diff record 9079414f (DIONISIUS JOLE, v3 -> v4):
 *     nik salah.json -> nik benar.json
 *
 * AK dicari BERDASARKAN NAMA + NOMOR URUT, bukan indeks baris roster:
 *   nama     dicocokkan dengan nama_dtsen#n / nama_dtsen_edit#n (tanpa beda huruf besar-kecil & spasi)
 *   no_urut  dicocokkan dengan no_urut_kk#n (cadangan: no_urut_kk_var#n, lalu no_urut di gabung_dtsen)
 *   Keduanya harus cocok. Tidak ada AK yang cocok -> baris LEWATI (remark juga tidak ditulis).
 *   Indeks n: AK prelist #1, #2, ...; AK baru #101, #102, ...
 *
 * Yang berubah di contoh:
 *   nik_dtsen#101  8888 -> 6403020910940001   (Diana, no urut 2)
 *   nik_dtsen#103  8888 -> 6402020910940002   (Adelin natalia tapun, no urut 4)
 *   + catatan "#DC_0" di pertanyaan nik_dtsen#101  -> pakai kolom remark_nik (toggle Remark)
 * Tidak dikirim (dibangun ulang FormGear saat record dibuka):
 *   pilih_umkm_options#n, var_hiden_pml#n, tanggal_anomali, tanggal_mulai_anomali,
 *   anomali_*_resolved_at, cek_anomali_button, custom_script_table,
 *   templateVersion/validationVersion, createdAt/updatedAt per jawaban.
 *   nik_dtsen_prelist#n tidak disentuh.
 *
 * Kolom sheet:
 *   A assignment_id | B no_urut | C nama | D nik (benar, 16 atau 4 digit, opsional)
 *   Satu baris = satu AK; keluarga dengan 2 AK yang dikoreksi -> 2 baris dengan assignment_id sama.
 *   Data hanya dikirim kalau nik terisi dan BERBEDA dari record. nik kosong / sudah sama ->
 *   data tidak disentuh: ada remark -> hanya remark yang ditulis; tanpa remark -> LEWATI.
 *   Format sel nik di Excel sebagai Text, supaya tidak jadi 6,40302E+15.
 *
 * Remark (toggle "Remark" di toolbar): kolom remark_nik (opsional), ditambahkan panel setelah
 *   kolom D. Sel terisi ditulis sebagai catatan di pertanyaan nik_dtsen#n AK yang cocok
 *   (mis. Diana -> nik_dtsen#101), walaupun NIK-nya tidak berubah.
 *
 * ⚠ CEK UI di keterangan: NIK lama juga tercatat di nik / nik_kk / nik_pengusaha_var#n
 *   (tidak ikut diganti script ini), atau NIK baru sudah dipakai AK lain di keluarga itu.
 * ==========================================================================*/

const POLA_NIK = /^(\d{16}|\d{4})$/;    // NIK lengkap 16 digit, atau 4 digit (mis. 8888/9999)
const NIK_LENGKAP = /^\d{16}$/;
const teks = (v) => (v == null ? '' : String(v).trim());
const norm = (s) => teks(s).toUpperCase().replace(/\s+/g, ' ');
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

/* Field lain yang bisa menyimpan salinan NIK seorang AK — hanya diperiksa, tidak diubah */
const FIELD_NIK_LAIN = /^(nik|nik_kk|nik_pengusaha_var#\d+)$/;

/* Roster AK: [{ n, nama, noUrut }] dari nama_dtsen#n */
function daftarAK(answers) {
  const cari = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;
  const gabung = Array.isArray(cari('gabung_dtsen')) ? cari('gabung_dtsen') : [];
  return answers
    .map((a) => a.dataKey.match(/^nama_dtsen#(\d+)$/))
    .filter(Boolean)
    .map(([, n]) => {
      const g = gabung.find((x) => x && String(x.value) === n) || {};
      const noUrut = [cari(`no_urut_kk#${n}`), cari(`no_urut_kk_var#${n}`), g.no_urut]
        .find((v) => v != null && v !== '');
      return { n, nama: teks(cari(`nama_dtsen_edit#${n}`) || cari(`nama_dtsen#${n}`)),
               namaSemua: [cari(`nama_dtsen#${n}`), cari(`nama_dtsen_edit#${n}`)].map(norm).filter(Boolean),
               noUrut: noUrut == null ? null : Number(noUrut) };
    });
}

const ringkasAK = (ak) => ak.map((x) => `${x.noUrut ?? '?'}. ${x.nama}`).join(' | ') || '(roster AK kosong)';

async function prosesSatu(row, { dryRun, remarks = [] }) {
  const nikBaru = teks(row.nik);

  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers;
  const cari = (k) => teks((answers.find((a) => a.dataKey === k) || {}).answer);

  const ak = daftarAK(answers);
  const cocok = ak.filter((x) => x.noUrut === row.no_urut && x.namaSemua.includes(norm(row.nama)));
  if (!cocok.length)
    return { skip: true, code: asg.code_identity, ket: `AK no. ${row.no_urut} "${teks(row.nama)}" tidak ditemukan — ada: ${ringkasAK(ak)}` };
  if (cocok.length > 1)
    return { skip: true, code: asg.code_identity, ket: `AK no. ${row.no_urut} "${teks(row.nama)}" cocok dengan >1 baris (#${cocok.map((x) => x.n).join(', #')})` };
  const { n, nama } = cocok[0];
  const key = `nik_dtsen#${n}`;
  const sebelum = cari(key);
  const label = `#${n} no.${row.no_urut} ${nama}`;

  /* remark ditulis panel ke NIK AK ini: nik_dtsen -> nik_dtsen#101 */
  const remarkKeys = { nik_dtsen: key };

  /* Data tidak diubah: ada remark -> diteruskan supaya panel menulis remark-nya saja */
  if (!nikBaru || sebelum === nikBaru) {
    const ket = `${label}: ` + (nikBaru ? `nik sudah ${nikBaru}` : `kolom nik kosong (record: ${sebelum || '(kosong)'})`) +
                (remarks.length ? ' — data tidak diubah, hanya remark' : '');
    return remarks.length ? { code: asg.code_identity, ket, remarkKeys } : { skip: true, code: asg.code_identity, ket };
  }

  const cek = [];
  if (NIK_LENGKAP.test(sebelum)) {        // NIK 4 digit hanya kode isian, tidak dicari salinannya
    const lain = answers.filter((a) => FIELD_NIK_LAIN.test(a.dataKey) && teks(a.answer) === sebelum).map((a) => a.dataKey);
    if (lain.length) cek.push(`⚠ CEK UI: NIK lama juga di ${lain.join(', ')}`);
  }
  const kembar = ak.filter((x) => x.n !== n && cari(`nik_dtsen#${x.n}`) === nikBaru);
  if (kembar.length) cek.push(`⚠ CEK UI: NIK baru sama dengan ${kembar.map((x) => `no.${x.noUrut} ${x.nama}`).join(', ')}`);

  /* FASIH.raw: NIK disimpan sebagai string apa adanya, bukan dikonversi ke angka */
  const r = await FASIH.patch(row.assignment_id, (doc, { set }) => {
    set(key, FASIH.raw(nikBaru));
  }, { dryRun, log: false });

  return { code: r.code, ket: [
    label, `${key} ${sebelum || '(kosong)'} → ${nikBaru}`, ...cek, `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · '), remarkKeys };
}

FASIH_BATCH.register({
  id: 'koreksi-nik-anggota-keluarga',
  name: 'Koreksi NIK Anggota Keluarga',
  description: 'Cari AK berdasarkan nama + nomor urut → ganti nik_dtsen dengan NIK yang benar',
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true },
    { key: 'no_urut',       title: 'no_urut AK', type: 'integer', required: true, width: 90 },
    { key: 'nama',          title: 'nama AK', required: true, width: 220 },
    { key: 'nik',           title: 'nik (benar, opsional)', width: 180, mono: true },
  ],
  idColumn: 'assignment_id',
  /* Catatan per-pertanyaan (mis. "#DC_0") — muncul saat toggle Remark aktif; ditulis ke
     nik_dtsen#n AK yang cocok (lewat remarkKeys dari process) */
  remarks: [
    { dataKey: 'nik_dtsen', key: 'remark_nik', title: 'remark_nik (opsional)' },
  ],
  validateRow: (row) => {
    const e = {};
    if (row.no_urut != null && row.no_urut < 1) e.no_urut = 'minimal 1';
    if (teks(row.nik) && !POLA_NIK.test(teks(row.nik))) e.nik = 'harus 16 atau 4 digit angka (format sel Excel sebagai Text)';
    return Object.keys(e).length ? e : null;
  },

  async process(row, { dryRun, remarks }) {
    return prosesSatu(row, { dryRun, remarks });
  },
});
