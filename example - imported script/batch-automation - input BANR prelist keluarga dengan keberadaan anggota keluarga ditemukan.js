/* ============================================================================
 * batch-automation - keluarga banr.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: keluarga "tidak dapat ditemui sampai akhir pendataan" (kode 5)  ->  "1. Ditemukan" + BANR
 *        + roster anggota keluarga dari prelist (seperti yang dibentuk FormGear di UI)
 *   Pola dari diff record 3efd51ee (v9 -> v8):
 *     data tidak dapat ditemui sampai akhir pendataan - NON RESPON.json -> data ditemukan - NON RESPON.json
 *   sama dengan "update keluarga banr - batch.js".
 *
 * Semua isi roster (nama, NIK, JK, hubungan, tgl lahir, aset, kepemilikan, dinding)
 * DITURUNKAN dari pre_defined_data record masing-masing — bukan disalin dari 3efd51ee.
 * Foto bangunan saat status kode 5 (foto_depan_p) dipindah ke foto_depan (Blok IV),
 * lalu baris foto_depan_p dihapus.
 *
 * Kolom sheet:
 *   A assignment_id | B no_banr | C no_bangunan_terbesar (opsional) | D catatan (opsional)
 *   no_bangunan_terbesar kosong -> pakai opsi "No. bangunan terbesar default" di toolbar;
 *   keduanya kosong -> field tidak dikirim (hanya tampilan, turunan FormGear, beda per SLS).
 *   catatan diisi -> field catatan (blok CATATAN) diganti dengan isi sel; kosong -> tidak diubah.
 * ==========================================================================*/

/* Kode penggunaan bangunan yang dipilih di UI untuk kasus ini */
const KODE_BANG = [{ label: '3. Bangunan Tempat Tinggal', value: '3', open: false }];

/* foto_depan_p (blok keterangan keluarga) -> foto_depan (Blok IV); tipe photo yang sama */
const PINDAH = [['foto_depan_p', 'foto_depan']];
const HAPUS = PINDAH.map(([dari]) => dari);

/* Non-respon disimpan UI dengan force submit */
const DOC_META = { isForceSubmit: true };

/* ---------------------------------------------------------------------------
 * Turunan dari prelist — meniru inisialisasi FormGear saat keluarga "ditemukan"
 * ------------------------------------------------------------------------- */
const opt = (o) => (Array.isArray(o) && o[0] ? [{ label: o[0].label, value: o[0].value }] : o);   // [{value,label}] -> [{label,value}]
const umur = (tgl, bln, thn, ref = new Date()) => {                                                 // umur penuh pada tanggal ref
  const t = Number(tgl) || 1, b = Number(bln) || 1, y = Number(thn);
  let u = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < b || (ref.getMonth() + 1 === b && ref.getDate() < t)) u--;
  return u;
};

function turunanPrelist(predata, row, noBang) {
  const P = Object.fromEntries(predata.map((p) => [p.dataKey, p.answer]));
  const daftarArt = P.list_individu_dtsen_prelist || [];
  if (!daftarArt.length) throw new Error('prelist tidak punya anggota keluarga (list_individu_dtsen_prelist kosong)');
  const art = daftarArt.map((x, idx) => {
    const i = x.value ?? idx + 1;
    const hub = P[`hubungan#${i}`], jk = P[`jk_dtsen#${i}`];
    return { i, nama: P[`nama_dtsen#${i}`] ?? x.nama_ak ?? x.label, nik: P[`nik_dtsen#${i}`],
             hub, hubV: Number(hub && hub[0] && hub[0].value), jk, jkV: Number(jk && jk[0] && jk[0].value),
             tgl: P[`tgl_lahir#${i}`], bln: P[`bln_lahir#${i}`], thn: P[`thn_lahir#${i}`],
             umur: umur(P[`tgl_lahir#${i}`], P[`bln_lahir#${i}`] && P[`bln_lahir#${i}`][0] && P[`bln_lahir#${i}`][0].value, P[`thn_lahir#${i}`]) };
  });
  const n = art.length, krt = art.find((a) => a.hubV === 1) || art[0];
  const hit = (f) => String(art.filter(f).length);
  const V = {
    /* ---- status keluarga ---- */
    ada_keluarga: [{ label: '1. Ditemukan', value: '1', open: false }],
    ec_keluarga: true,
    ec_keluarga_respons: true,
    pilihan_kode_bang: [{ label: '2. Bangunan Campuran', value: '2' }, { label: '3. Bangunan Tempat Tinggal', value: '3' }, { label: '9. Non Respon', value: '9' }],
    ...(noBang != null ? { no_bangunan_terbesar: noBang } : {}),
    kode_bang: KODE_BANG,
    banr: true,
    no_banr: String(row.no_banr).trim(),
    /* ---- ringkasan keluarga (Blok I) ---- */
    jumlah_ak_kk: P.jumlah_ak_kk,
    jumlah_usaha_ditemukan: String(P.jml_usaha_keluarga ?? 0),
    ec_ada_usaha: true,
    label_usaha: '',
    tambah_dtsen: [{ label: 'lastId#0', value: '0' }],
    gabung_dtsen: art.map((a) => ({ no_urut: a.i, label: a.nama, value: a.i, is_prelist: '1' })),
    art_keberadaan15: art.map((a) => ({ label: a.nama, value: String(a.i) })),
    cek1: n,
    jum_krt: hit((a) => a.hubV === 1),
    jk_krt: krt ? [{ gender: krt.jkV, label: krt.nama, value: String(krt.i) }] : [],
    umur_krt: krt ? String(krt.umur) : '',
    umur_ak_dr_keltunggal: '0',
    jum_anakmantucucu: hit((a) => [3, 4, 5].includes(a.hubV)),
    jum_pasangan: hit((a) => a.hubV === 2),
    jum_istri: hit((a) => a.hubV === 2 && a.jkV === 2),
    jum_art_semua: n,
    jum_art_1345: String(n),                 // keberadaan default 1 untuk semua ART prelist
    jum_ak_disabilitas: '0',
    jum_art_1345_umurkur10: hit((a) => a.umur < 10),
    jum_ak_15: String(n),
    jum_kk_lebihdr10th: hit((a) => a.hubV === 1 && a.umur > 10),
    jum_kk: hit((a) => a.hubV === 1),
  };
  /* ---- roster ART: identitas (Blok I) ---- */
  for (const a of art) Object.assign(V, {
    [`isprelistart#${a.i}`]: '1',
    [`no_urut_kk#${a.i}`]: a.i,
    [`nama_dtsen#${a.i}`]: a.nama,
    [`nama_dtsen_edit#${a.i}`]: a.nama,
    [`nik_dtsen#${a.i}`]: a.nik,
    [`nik_dtsen_prelist#${a.i}`]: a.nik,
    [`ec_anggota_keluarga#${a.i}`]: true,
    [`hubungan#${a.i}`]: opt(a.hub),
    [`keberadaan_dtsen#${a.i}`]: '1',        // 1. Tinggal di rumah/tempat tinggal ini (dari skema)
    [`jk_prelist#${a.i}`]: opt(a.jk),
    [`jk_dtsen#${a.i}`]: opt(a.jk),
    [`tgl_lahir#${a.i}`]: a.tgl,
    [`bln_lahir#${a.i}`]: opt(a.bln),
    [`thn_lahir#${a.i}`]: a.thn,
    [`umur_ak#${a.i}`]: a.umur,
    [`ec_ada_usaha_art#${a.i}`]: false,
  });
  Object.assign(V, {
    art_pengusaha: [],
    nama_usaha_tambahan: [{ label: 'lastId#0', value: '0' }],
    /* ---- identitas keluarga (Blok III) ---- */
    dtsen_nama_kk: P.dtsen_nama_kk ?? P.nama_kk,
    nik_kk: P.nik_kk ?? P.nik,
    dtsen_no_kk: P.dtsen_no_kk ?? P.no_kk,
    jml_kk: n,
    jml_kk_update: n,
    gabung_dtsen_var: art.map((a) => ({ label: a.nama, value: a.i, is_prelist: '1' })),
    gabung_dtsen_2: art.map((a) => ({ no_urut: a.i, label: a.nama, value: a.i, is_prelist: '1' })),
  });
  for (const a of art) Object.assign(V, {
    [`no_urut_kk_var#${a.i}`]: a.i,
    [`nama_dtsen_var#${a.i}`]: a.nama,
    [`index_ak#${a.i}`]: a.i,
    [`ec_art_dtsen#${a.i}`]: true,
    [`ec_art_pendapatan#${a.i}`]: true,
  });
  /* ---- perumahan & aset dari prelist (Blok IV), hanya yang terisi ---- */
  for (const k of ['status_kepemilikan', 'luas_lantai', 'jns_lantai', 'jns_dinding', 'jns_atap', 'air_minum'])
    if (P[k] != null) V[k] = opt(P[k]);
  Object.assign(V, {
    total_pendapatan_keluarga_sebulan: 0, total_pengeluaran_keluarga_sebulan: 0, selisih_pendapatan_pengeluaran: 0,
    total_pendapatan_keluarga_sebulan_tampil: 0, total_pengeluaran_keluarga_sebulan_tampil: 0, selisih_pendapatan_pengeluaran_tampil: 0,
  });
  for (const k of ['jumlah_kulkas', 'jumlah_ac', 'jumlah_emas', 'jumlah_laptop', 'jumlah_motor', 'jumlah_mobil'])
    if (P[k] != null) { V[k] = P[k]; V[`${k}_new`] = P[k]; }
  /* ---- ringkasan & pemberi jawaban ---- */
  Object.assign(V, {
    jumlah_usaha_pendataan: String(P.jml_usaha_keluarga ?? 0),
    jumlah_ak_pendataan: n,
    ak_info: [...art.map((a) => ({ no_urut: a.i, label: a.nama, value: a.i, is_prelist: '1' })),
              { label: 'Lainnya', value: '99' }, { label: 'Pemilik Usaha', value: '98' }],   // daftar ART + 2 opsi tetap
  });
  return { V, n };
}

const label0 = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : JSON.stringify(v));
const value0 = (v) => (Array.isArray(v) && v[0] ? String(v[0].value) : null);
const angkaOpsi = (v) => (v == null || String(v).trim() === '' ? null : Number(String(v).trim()));
const teksCatatan = (row) => String(row.catatan ?? '').trim();
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

async function prosesSatu(row, { dryRun, options }) {
  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg) throw new Error('assignment tidak ditemukan');
  const answers = asg.data ? JSON.parse(asg.data).answers || [] : [];
  const adaKel = (answers.find((a) => a.dataKey === 'ada_keluarga') || {}).answer;
  if (options.lewatiJikaSudah && value0(adaKel) === '1')
    return { skip: true, code: asg.code_identity, ket: `ada_keluarga sudah: ${label0(adaKel)}` };

  if (!asg.pre_defined_data) throw new Error('record tidak punya pre_defined_data (prelist)');
  const predata = JSON.parse(asg.pre_defined_data).predata || [];
  const noBang = row.no_bangunan_terbesar ?? angkaOpsi(options.noBangDefault);
  const { V, n } = turunanPrelist(predata, row, noBang);
  const catatan = teksCatatan(row);
  if (catatan) V.catatan = catatan;

  let sebelum = null;
  const dipindah = [];
  const r = await FASIH.patch(row.assignment_id, (doc, { set, get }) => {
    sebelum = label0(get('ada_keluarga'));
    for (const [dari, ke] of PINDAH) {                  // pindahkan nilai sebelum baris asalnya dihapus
      const nilai = get(dari);
      if (nilai != null && get(ke) == null) { set(ke, nilai); dipindah.push(`${dari} → ${ke}`); }
    }
    for (const [k, v] of Object.entries(V)) set(k, v);
    for (const k of HAPUS) {
      const i = doc.answers.findIndex((a) => a.dataKey === k);
      if (i >= 0) doc.answers.splice(i, 1);
    }
    Object.assign(doc, DOC_META);
  }, { dryRun, log: false });

  return { code: r.code, ket: [
    `sebelum: ${sebelum}`,
    `BANR ${V.no_banr}`,
    `${n} ART`,
    ...(noBang != null ? [`no_bangunan_terbesar ${noBang}`] : []),
    ...(catatan ? ['catatan diubah'] : []),
    ...dipindah,
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · ') };
}

FASIH_BATCH.register({
  id: 'keluarga-non-respon-ke-ditemukan-banr',
  name: 'Update Keluarga BANR',
  description: 'Tidak dapat ditemui (kode 5) → 1. Ditemukan + BANR + roster AK dari prelist',
  columns: [
    { key: 'assignment_id',        type: 'uuid', required: true, unique: true },
    { key: 'no_banr',              required: true, width: 160, trim: true },
    { key: 'no_bangunan_terbesar', title: 'no_bangunan_terbesar (opsional)', type: 'integer', width: 200 },
    { key: 'catatan',              title: 'catatan (opsional)', type: 'text', width: 260 },
  ],
  idColumn: 'assignment_id',
  options: [
    { key: 'lewatiJikaSudah', label: 'Lewati yang sudah ditemukan', type: 'checkbox', default: true,
      hint: 'Record yang ada_keluarga-nya sudah "1. Ditemukan" tidak diubah' },
    { key: 'noBangDefault', label: 'No. bangunan terbesar default', type: 'number', default: '',
      hint: 'Dipakai bila kolom no_bangunan_terbesar kosong. Kosongkan = tidak dikirim. Nilainya beda per SLS.' },
  ],
  validateRow: (row) => (/\s/.test(row.no_banr) ? { no_banr: 'tidak boleh ada spasi' } : null),

  async process(row, { dryRun, options }) {
    return prosesSatu(row, { dryRun, options });
  },
});
