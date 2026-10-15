/* ============================================================================
 * batch-automation - keluarga tunggal banr meninggal.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: keluarga TUNGGAL (1 anggota keluarga) berstatus "1. Ditemukan" + BANR  ->  "3. Meninggal"
 *   Kebalikan dari "input BANR prelist keluarga ...". Pola dari diff record ASPIAH (v3 -> v4):
 *     keluarga tunggal ditemukan dengan banr - ASPIAH.json -> keluarga tunggal meninggal - ASPIAH.json
 *
 * Yang berubah di contoh:
 *   ada_keluarga          1. Ditemukan -> 3. Meninggal
 *   ec_keluarga           true -> false
 *   ec_keluarga_respons   true -> false
 *   pilihan_kode_bang     [2,3,9] -> [1,4,5,6,7,8,9]   (daftar kode bangunan untuk non-keluarga)
 *   nib_all + kolom data4 ''  -> '-'                   (hanya kalau masih kosong)
 *   isForceSubmit         true -> false
 *   77 baris dihapus: BANR (banr, no_banr, kode_bang, no_bangunan_terbesar), ringkasan keluarga
 *     (jum_*, jumlah_*, gabung_dtsen*, ak_info, ...), seluruh roster AK `<dataKey>#n`,
 *     identitas Blok III, aset & total pendapatan/pengeluaran  -> lihat HAPUS
 * Tidak dikirim (dibangun ulang FormGear saat record dibuka):
 *   tanggal_anomali, tanggal_mulai_anomali, cek_anomali_button, custom_script_table,
 *   keluarga_match, geotag_match. catatan tidak berubah di contoh -> pakai kolom catatan bila perlu.
 *
 * Syarat diproses (selain itu -> LEWATI, record tidak dikirim, versi tidak naik):
 *   1. ada_keluarga saat ini = 1. Ditemukan, banr = true, no_banr terisi
 *   2. keluarga tunggal: list_individu_dtsen_prelist berisi tepat 1 anggota, jumlah_ak_kk = 1
 *      (kalau ada), dan roster nama_dtsen#n berisi paling banyak 1 AK
 *
 * Field yang tersisa setelah dihapus tetapi tidak ada di record "meninggal" contoh (KEEP) TIDAK
 * dihapus, hanya ditandai "⚠ CEK UI" di keterangan — buka record itu di UI.
 *
 * Kolom sheet:
 *   A assignment_id | B no_banr (opsional) | C catatan (opsional)
 *   no_banr terisi -> record hanya diubah kalau no_banr di record SAMA (pengaman salah tempel baris).
 *   catatan diisi -> field catatan (blok CATATAN) diganti dengan isi sel; kosong -> tidak diubah.
 * ==========================================================================*/

const KODE_ASAL = '1';        // 1. Ditemukan
const KODE_TUJUAN = '3';      // 3. Meninggal

/* Diisi sama seperti record "meninggal" contoh */
const NILAI = {
  ec_keluarga: false,
  ec_keluarga_respons: false,
  pilihan_kode_bang: FASIH.raw([
    { label: '1. Bangunan Khusus Usaha', value: '1' },
    { label: '4. Tempat ibadah, kantor organisasi (profesi, kemasyarakatan, sosial, politik)', value: '4' },
    { label: '5. Kantor pemerintah,  kedutaan/konsulat', value: '5' },
    { label: '6. Bangunan Lainnya yang Tidak Tercakup (Tempat Judi, Tempat Layanan Kencan, Bangunan Kosong/ Rusak)', value: '6' },
    { label: '7. Virtual Office (VO)', value: '7' },
    { label: '8. Panti asuhan, panti jompo(yang tidak berbayar), lapas (lembaga pemasyarakatan), barak militer', value: '8' },
    { label: '9. Non Respon', value: '9' },
  ]),
};
const DOC_META = { isForceSubmit: false };

/* Baris yang dihapus UI saat status diganti dari Ditemukan; ditambah semua baris roster `#n` */
const HAPUS = new Set([
  'ec_ada_usaha',
  /* BANR & kode bangunan */
  'no_bangunan_terbesar', 'kode_bang', 'banr', 'no_banr',
  /* ringkasan keluarga (Blok I) */
  'jumlah_ak_kk', 'jumlah_usaha_ditemukan', 'label_usaha', 'tambah_dtsen', 'gabung_dtsen', 'art_keberadaan15', 'cek1',
  'jum_krt', 'jk_krt', 'umur_krt', 'umur_ak_dr_keltunggal', 'jum_anakmantucucu', 'jum_pasangan', 'jum_istri',
  'jum_art_semua', 'jum_art_1345', 'jum_ak_disabilitas', 'jum_art_1345_umurkur10', 'jum_ak_15', 'jum_kk_lebihdr10th', 'jum_kk',
  'art_pengusaha', 'nama_usaha_tambahan',
  /* identitas keluarga (Blok III) */
  'dtsen_nama_kk', 'nik_kk', 'dtsen_no_kk', 'jml_kk', 'jml_kk_update', 'gabung_dtsen_var', 'gabung_dtsen_2',
  /* perumahan, aset & keuangan (Blok IV) */
  'total_pendapatan_keluarga_sebulan', 'total_pengeluaran_keluarga_sebulan', 'selisih_pendapatan_pengeluaran',
  'total_pendapatan_keluarga_sebulan_tampil', 'total_pengeluaran_keluarga_sebulan_tampil', 'selisih_pendapatan_pengeluaran_tampil',
  ...['kulkas', 'ac', 'emas', 'laptop', 'motor', 'mobil'].flatMap((x) => [`jumlah_${x}`, `jumlah_${x}_new`]),
  /* ringkasan & pemberi jawaban */
  'jumlah_usaha_pendataan', 'jumlah_ak_pendataan', 'ak_info',
]);
const hapus = (k) => HAPUS.has(k) || /#\d+$/.test(k);

/* Seluruh dataKey record "meninggal" contoh — sisa di luar daftar ini ditandai ⚠ CEK UI */
const KEEP = new Set(`mulai is_from_cawi is_cawi_keluarga kunjungan_1 ec_mulai mode nama_principal prov kab kec desa
  ubah_wilayah kode_prov prov_kab klas_desa kode_sls tahun_lalu nama_sls sudah tahun_survei var_desa has_kodepos
  has_ubah_sls is_keluarga is_prelist ec_non_keluarga ket_editable ub jenis_prelist flag_pbi nik_prelist no_kk nik
  nama_kk alamat_klrg jumlah_usaha_prelist kode_keberedaan_keluarga kode_keluarga_new kode_bangunan_new ada_keluarga
  alamat_prelist ec_keluarga ec_keluarga_respons no_keluarga_terbesar pilihan_kode_bang usaha_gabung
  list_individu_dtsen_prelist idsbr_all nib_all email_all skala_usaha_all idunik_MSSD jumlah_usaha ya_pertanian
  ya_nonpertanian ya_gabung skala_usaha_prelist tanggal_mulai_anomali catatan idsbr_keluarga keluarga_match
  geotag_match idsbr_match id_keluarga waktu_selesai cek_anomali_button custom_script_table tanggal_anomali`.split(/\s+/));

const label0 = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : JSON.stringify(v ?? null));
const value0 = (v) => (Array.isArray(v) && v[0] ? String(v[0].value) : null);
const teks = (v) => (v == null ? '' : String(v).trim());
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

/* Jumlah anggota keluarga: daftar prelist (jawaban, cadangan pre_defined_data) + roster terisi */
function jumlahAK(answers, predata) {
  const A = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;
  const P = (k) => (predata.find((p) => p.dataKey === k) || {}).answer;
  const daftar = A('list_individu_dtsen_prelist') ?? P('list_individu_dtsen_prelist');
  const jml = A('jumlah_ak_kk') ?? P('jumlah_ak_kk');
  const roster = answers.filter((a) => /^nama_dtsen#\d+$/.test(a.dataKey));
  return { n: Array.isArray(daftar) ? daftar.length : null, jml: jml == null ? null : Number(jml), nRoster: roster.length,
           nama: roster.map((a) => a.answer).join(', ') || (Array.isArray(daftar) ? daftar.map((x) => x.nama_ak ?? x.label).join(', ') : '') };
}

async function prosesSatu(row, { dryRun }) {
  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers || [];
  const predata = asg.pre_defined_data ? JSON.parse(asg.pre_defined_data).predata || [] : [];
  const code = asg.code_identity;
  const cari = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;

  /* ---- syarat 1: Ditemukan + BANR ---- */
  const adaKel = cari('ada_keluarga');
  if (adaKel === undefined) throw new Error('tidak ada ada_keluarga — bukan record keluarga?');
  if (value0(adaKel) === KODE_TUJUAN) return { skip: true, code, ket: `ada_keluarga sudah: ${label0(adaKel)}` };
  if (value0(adaKel) !== KODE_ASAL)   return { skip: true, code, ket: `bukan Ditemukan (ada_keluarga: ${label0(adaKel)})` };
  const noBanr = teks(cari('no_banr'));
  if (cari('banr') !== true || !noBanr) return { skip: true, code, ket: 'Ditemukan tanpa BANR' };
  if (teks(row.no_banr) && teks(row.no_banr) !== noBanr)
    return { skip: true, code, ket: `no_banr di record ${noBanr} ≠ ${teks(row.no_banr)}` };

  /* ---- syarat 2: keluarga tunggal ---- */
  const { n, jml, nRoster, nama } = jumlahAK(answers, predata);
  if (n == null) return { skip: true, code, ket: 'list_individu_dtsen_prelist tidak ada — jumlah AK tidak diketahui' };
  if (n !== 1 || (jml != null && jml !== 1) || nRoster > 1)
    return { skip: true, code, ket: `bukan keluarga tunggal (${n} AK di prelist, ${nRoster} AK di roster` +
                                    `${jml != null ? `, jumlah_ak_kk ${jml}` : ''})` };

  const catatan = teks(row.catatan);
  const nibKosong = !teks(cari('nib_all'));
  const columns = teks(asg.data4) ? null : { data4: '-' };
  let dihapus = [], sisa = [];
  const r = await FASIH.patch(row.assignment_id, (doc, { set }) => {
    set('ada_keluarga', KODE_TUJUAN);                   // coerce: label & value dari template, kunci jawaban lama dipertahankan
    for (const [k, v] of Object.entries(NILAI)) set(k, v);
    if (nibKosong) set('nib_all', '-');
    if (catatan) set('catatan', catatan);
    dihapus = doc.answers.filter((a) => hapus(a.dataKey)).map((a) => a.dataKey);
    for (let i = doc.answers.length - 1; i >= 0; i--) if (hapus(doc.answers[i].dataKey)) doc.answers.splice(i, 1);
    sisa = doc.answers.map((a) => a.dataKey).filter((k) => !KEEP.has(k));
    Object.assign(doc, DOC_META);
  }, { dryRun, columns, log: false });

  return { code: r.code, ket: [
    ...(sisa.length ? [`⚠ CEK UI: field sisa ${sisa.join(', ')}`] : []),
    nama || '1 AK',
    `BANR ${noBanr} dilepas`,
    `${label0(adaKel)} → ${FASIH.schema('ada_keluarga')?.options.find((o) => String(o.value) === KODE_TUJUAN)?.label || KODE_TUJUAN}`,
    ...(catatan ? ['catatan diubah'] : []),
    ...(columns ? ['data4 → -'] : []),
    `hapus ${dihapus.length} baris`,
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · ') };
}

FASIH_BATCH.register({
  id: 'keluarga-tunggal-banr-ke-meninggal',
  name: 'Keluarga Tunggal BANR Meninggal',
  description: 'Keluarga tunggal 1. Ditemukan + BANR → 3. Meninggal (BANR, roster & ringkasan dihapus)',
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
    { key: 'no_banr',       title: 'no_banr (opsional, pengaman)', width: 200, mono: true },
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
