/* ============================================================================
 * batch-automation - keberadaan AK.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: isi keberadaan anggota keluarga (keberadaan_dtsen#i) yang MASIH KOSONG
 *        dengan kode 1 "Tinggal di rumah/tempat tinggal ini"
 *   Pola: Hutja-Keberadaan AK Kosong.json -> Hutja-Keberadaan AK Terisi.json
 *   sama dengan "update keberadaan AK - batch.js".
 *
 *   - AK yang keberadaannya SUDAH terisi (kode 1, 2, 3, ... apa pun) DIBIARKAN.
 *   - AK yang keberadaannya belum terisi -> keberadaan_dtsen#i = 1, plus field
 *     pendamping yang dibentuk FormGear saat kode 1 dipilih di UI
 *     (ec_anggota_keluarga, no_urut_kk_var, nama_dtsen_var, index_ak,
 *      ec_art_dtsen, ec_art_pendapatan) dan jk/tgl/bln/thn lahir/umur dari prelist.
 *   - Ringkasan (art_keberadaan15, cek1, jum_*, jml_kk_update, jumlah_ak_pendataan,
 *     gabung_dtsen*, ak_info) dihitung ulang HANYA jika semua AK akhirnya berkode 1/5.
 *     Kalau ada AK berkode lain (meninggal, pindah, ...) ringkasan tidak disentuh dan
 *     keterangan diawali ⚠ CEK UI supaya record dibuka di UI.
 *   - kode_bang yang belum kode 3 -> "3. Bangunan Tempat Tinggal".
 *   - Saat kode_bang menjadi 3 (atau roster masih kosong), roster AK dibentuk dari
 *     prelist seperti "batch-automation - keluarga banr.js". Baris/field yang sudah
 *     ada TIDAK ditimpa.
 *   - Record yang ada_keluarga-nya bukan "1. Ditemukan" -> LEWATI.
 *   - Record yang tidak perlu diubah tidak dikirim (versi record tidak naik) -> LEWATI.
 *
 * Kolom sheet:
 *   A assignment_id
 * ==========================================================================*/

const KODE_ISI = '1';                     // 1. Tinggal di rumah/tempat tinggal ini
const KODE_AKTIF = ['1', '5'];            // tinggal / AK baru -> dihitung di ringkasan
const KODE_1345 = ['1', '3', '4', '5'];   // dasar jum_art_1345

/* Kode Penggunaan Bangunan: jika belum kode 3, isi kode 3. kode_bang tidak punya opsi
   statis di template, jadi bentuknya ditiru persis dari jawaban UI. */
const KODE_BANG = [{ label: '3. Bangunan Tempat Tinggal', value: '3', open: false }];
const PILIHAN_KODE_BANG = [{ label: '2. Bangunan Campuran', value: '2' }, { label: '3. Bangunan Tempat Tinggal', value: '3' }, { label: '9. Non Respon', value: '9' }];

/* ---------------------------------------------------------------------------
 * Helper
 * ------------------------------------------------------------------------- */
const value0 = (v) => (Array.isArray(v) && v[0] && v[0].value != null ? String(v[0].value) : null);
const label0 = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : JSON.stringify(v));
const kosong = (v) => v == null || v === '' || (Array.isArray(v) && (!v.length || value0(v) == null || value0(v) === ''));
const opt = (o) => (Array.isArray(o) && o[0] ? [{ label: o[0].label, value: o[0].value }] : o);   // [{value,label}] -> [{label,value}]
const umur = (tgl, bln, thn, ref = new Date()) => {                                                 // umur penuh pada tanggal ref
  const t = Number(tgl) || 1, b = Number(bln) || 1, y = Number(thn);
  if (!y) return undefined;
  let u = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < b || (ref.getMonth() + 1 === b && ref.getDate() < t)) u--;
  return u;
};
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);

/* Nomor baris roster yang sudah ada di answers (nama_dtsen#i) */
const barisRoster = (answers) => [...new Set(answers.map((a) => (a.dataKey.match(/^nama_dtsen#(\d+)$/) || [])[1])
  .filter(Boolean).map(Number))].sort((p, q) => p - q);

/* AK dari prelist (pre_defined_data) — sumber roster */
function artPrelist(predata) {
  const P = Object.fromEntries(predata.map((p) => [p.dataKey, p.answer]));
  const art = (P.list_individu_dtsen_prelist || []).map((x, idx) => {
    const i = Number(x.value ?? idx + 1);
    const bln = P[`bln_lahir#${i}`];
    return { i, nama: P[`nama_dtsen#${i}`] ?? x.nama_ak ?? x.label, nik: P[`nik_dtsen#${i}`],
             hub: P[`hubungan#${i}`], jk: P[`jk_dtsen#${i}`],
             tgl: P[`tgl_lahir#${i}`], bln, thn: P[`thn_lahir#${i}`],
             umur: umur(P[`tgl_lahir#${i}`], bln && bln[0] && bln[0].value, P[`thn_lahir#${i}`]) };
  });
  return { P, art, byI: new Map(art.map((a) => [a.i, a])) };
}

/* Mutator untuk FASIH.patch — hasil rencana ditulis ke info */
function buatMutator(pre, perluRoster, hitungRingkasan, info) {
  return (doc, { set, get }) => {
    const isi = (k, v) => { if (v !== undefined && kosong(get(k))) set(k, v); };   // isi hanya yang belum ada

    /* 1. Kode Penggunaan Bangunan -> 3 jika belum 3 (kosong, 1, 2, 9, ...) */
    const bang = get('kode_bang');
    let kodeBang = '';
    if (value0(bang) !== '3') {
      set('kode_bang', FASIH.raw(KODE_BANG));
      const pilihan = get('pilihan_kode_bang');               // daftar opsi kode_bang di UI harus memuat kode 3
      if (!(Array.isArray(pilihan) && pilihan.some((o) => String(o.value) === '3'))) set('pilihan_kode_bang', FASIH.raw(PILIHAN_KODE_BANG));
      kodeBang = `${kosong(bang) ? '(kosong)' : label0(bang)} → 3`;
    }

    /* 2. Roster AK muncul saat kode_bang = 3 -> bentuk baris yang belum ada dari prelist.
          Baris yang sudah ada (mungkin sudah diedit petugas) tidak ditimpa. */
    const dibentuk = [];
    if (perluRoster) {
      const ada = barisRoster(doc.answers);
      for (const a of pre.art) {
        if (ada.includes(a.i)) continue;
        isi(`isprelistart#${a.i}`, '1');
        isi(`no_urut_kk#${a.i}`, a.i);
        isi(`nama_dtsen#${a.i}`, a.nama);
        isi(`nama_dtsen_edit#${a.i}`, a.nama);
        isi(`nik_dtsen#${a.i}`, a.nik);
        isi(`nik_dtsen_prelist#${a.i}`, a.nik);
        if (get(`ec_anggota_keluarga#${a.i}`) === undefined) set(`ec_anggota_keluarga#${a.i}`, false);
        isi(`hubungan#${a.i}`, opt(a.hub));
        isi(`jk_prelist#${a.i}`, opt(a.jk));
        if (get(`ec_ada_usaha_art#${a.i}`) === undefined) set(`ec_ada_usaha_art#${a.i}`, false);
        dibentuk.push(a.i);
      }
      /* Blok I/III/IV tingkat keluarga dari prelist — hanya yang belum terisi */
      const P = pre.P;
      if (get('ec_keluarga') === undefined) set('ec_keluarga', true);
      if (get('ec_keluarga_respons') === undefined) set('ec_keluarga_respons', true);
      isi('jumlah_ak_kk', P.jumlah_ak_kk);
      isi('jumlah_usaha_ditemukan', String(P.jml_usaha_keluarga ?? 0));
      if (get('ec_ada_usaha') === undefined) set('ec_ada_usaha', true);
      if (get('label_usaha') === undefined) set('label_usaha', '');
      isi('tambah_dtsen', FASIH.raw([{ label: 'lastId#0', value: '0' }]));
      if (get('art_pengusaha') === undefined) set('art_pengusaha', FASIH.raw([]));
      isi('nama_usaha_tambahan', FASIH.raw([{ label: 'lastId#0', value: '0' }]));
      isi('dtsen_nama_kk', P.dtsen_nama_kk ?? P.nama_kk);
      isi('nik_kk', P.nik_kk ?? P.nik);
      isi('dtsen_no_kk', P.dtsen_no_kk ?? P.no_kk);
      for (const k of ['status_kepemilikan', 'luas_lantai', 'jns_lantai', 'jns_dinding', 'jns_atap', 'air_minum'])
        if (P[k] != null) isi(k, opt(P[k]));
      for (const k of ['total_pendapatan_keluarga_sebulan', 'total_pengeluaran_keluarga_sebulan', 'selisih_pendapatan_pengeluaran',
                       'total_pendapatan_keluarga_sebulan_tampil', 'total_pengeluaran_keluarga_sebulan_tampil', 'selisih_pendapatan_pengeluaran_tampil'])
        if (get(k) === undefined) set(k, 0);
      for (const k of ['jumlah_kulkas', 'jumlah_ac', 'jumlah_emas', 'jumlah_laptop', 'jumlah_motor', 'jumlah_mobil'])
        if (P[k] != null) { if (get(k) === undefined) set(k, P[k]); if (get(`${k}_new`) === undefined) set(`${k}_new`, P[k]); }
      isi('jumlah_usaha_pendataan', String(P.jml_usaha_keluarga ?? 0));
      isi('umur_ak_dr_keltunggal', '0');
      isi('jum_ak_disabilitas', '0');
    }

    /* 3. Keberadaan AK yang masih kosong -> kode 1 (yang sudah terisi kode apa pun dibiarkan),
          lalu field yang muncul di UI setelah kode 1 dipilih: identitas dari prelist + penanda */
    const roster = barisRoster(doc.answers);
    const diisi = [], sudah = [];
    for (const i of roster) {
      const k = get(`keberadaan_dtsen#${i}`);
      if (!kosong(k)) { sudah.push(`${i}:${value0(k) ?? k}`); continue; }
      const a = pre.byI.get(i) || {};
      set(`keberadaan_dtsen#${i}`, KODE_ISI);
      set(`ec_anggota_keluarga#${i}`, true);
      isi(`jk_dtsen#${i}`, opt(a.jk) ?? opt(get(`jk_prelist#${i}`)));
      isi(`tgl_lahir#${i}`, a.tgl);
      isi(`bln_lahir#${i}`, opt(a.bln));
      isi(`thn_lahir#${i}`, a.thn);
      isi(`umur_ak#${i}`, a.umur);
      set(`no_urut_kk_var#${i}`, get(`no_urut_kk#${i}`) ?? i);
      set(`nama_dtsen_var#${i}`, get(`nama_dtsen_edit#${i}`) || get(`nama_dtsen#${i}`));
      set(`index_ak#${i}`, i);
      set(`ec_art_dtsen#${i}`, true);
      set(`ec_art_pendapatan#${i}`, true);
      diisi.push(i);
    }

    /* 4. Ringkasan — dihitung dari roster akhir, hanya jika semua AK berkode aktif (1/5)
          seperti pola UI; selain itu tidak disentuh dan record ditandai cekUI */
    const art = roster.map((i) => ({
      i, nama: get(`nama_dtsen_edit#${i}`) || get(`nama_dtsen#${i}`), noUrut: get(`no_urut_kk#${i}`) ?? i,
      prelist: String(get(`isprelistart#${i}`) ?? '1'), kode: value0(get(`keberadaan_dtsen#${i}`)) ?? String(get(`keberadaan_dtsen#${i}`)),
      hubV: Number(value0(get(`hubungan#${i}`))), jkV: Number(value0(get(`jk_dtsen#${i}`)) ?? value0(get(`jk_prelist#${i}`))),
      umur: get(`umur_ak#${i}`) }));
    const semuaAktif = art.length > 0 && art.every((a) => KODE_AKTIF.includes(a.kode));
    let ringkasan = false;
    if ((diisi.length || dibentuk.length) && hitungRingkasan && semuaAktif) {
      const n = art.length, krt = art.find((a) => a.hubV === 1) || art[0];
      const hit = (f) => String(art.filter(f).length);
      const baris = art.map((a) => ({ no_urut: a.noUrut, label: a.nama, value: a.i, is_prelist: a.prelist }));
      set('gabung_dtsen', FASIH.raw(baris));
      set('art_keberadaan15', FASIH.raw(art.map((a) => ({ label: a.nama, value: String(a.i) }))));
      set('cek1', n);
      set('jum_krt', hit((a) => a.hubV === 1));
      set('jk_krt', FASIH.raw(krt ? [{ gender: krt.jkV, label: krt.nama, value: String(krt.i) }] : []));
      set('umur_krt', krt && krt.umur != null ? String(krt.umur) : '');
      set('jum_anakmantucucu', hit((a) => [3, 4, 5].includes(a.hubV)));
      set('jum_pasangan', hit((a) => a.hubV === 2));
      set('jum_istri', hit((a) => a.hubV === 2 && a.jkV === 2));
      set('jum_art_semua', n);
      set('jum_art_1345', hit((a) => KODE_1345.includes(a.kode)));
      set('jum_art_1345_umurkur10', hit((a) => KODE_1345.includes(a.kode) && a.umur != null && a.umur < 10));
      set('jum_ak_15', String(n));
      set('jum_kk_lebihdr10th', hit((a) => a.hubV === 1 && a.umur != null && a.umur > 10));
      set('jum_kk', hit((a) => a.hubV === 1));
      set('jml_kk', n);
      set('jml_kk_update', n);
      set('gabung_dtsen_var', FASIH.raw(art.map((a) => ({ label: a.nama, value: a.i, is_prelist: a.prelist }))));
      set('gabung_dtsen_2', FASIH.raw(baris));
      set('jumlah_ak_pendataan', n);
      set('ak_info', FASIH.raw([...baris, { label: 'Lainnya', value: '99' }, { label: 'Pemilik Usaha', value: '98' }]));
      ringkasan = true;
    }
    Object.assign(info, { jumlahAk: art.length, diisi, dibentuk, sudah, ringkasan, kodeBang,
                          cekUI: (diisi.length > 0 || dibentuk.length > 0) && !semuaAktif });
  };
}

async function prosesSatu(row, { dryRun, options }) {
  const id = row.assignment_id;

  /* Cek dulu tanpa menulis — record yang tidak perlu diubah tidak dikirim sama sekali */
  const asg = await FASIH.getAssignment(id);
  if (!asg) throw new Error('assignment tidak ditemukan');
  const answers = asg.data ? JSON.parse(asg.data).answers || [] : [];
  const getA = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;
  const adaKel = getA('ada_keluarga');
  if (value0(adaKel) !== '1')
    return { skip: true, code: asg.code_identity, ket: `ada_keluarga = ${kosong(adaKel) ? '(kosong)' : label0(adaKel)}` };

  const pre = artPrelist(JSON.parse(asg.pre_defined_data || '{"predata":[]}').predata || []);
  const rosterAwal = barisRoster(answers);
  const perluBang = value0(getA('kode_bang')) !== '3';
  const perluRoster = (perluBang || !rosterAwal.length) && pre.art.some((a) => !rosterAwal.includes(a.i));
  const perluAk = rosterAwal.some((i) => kosong(getA(`keberadaan_dtsen#${i}`)));
  const sudahAwal = rosterAwal.map((i) => `${i}:${value0(getA(`keberadaan_dtsen#${i}`))}`);
  if (!perluBang && !perluRoster && !perluAk)
    return { skip: true, code: asg.code_identity, ket: `${rosterAwal.length} AK sudah terisi (${sudahAwal.join(' ')}) & kode_bang sudah 3` };

  /* Rencana (dry run). LIVE hanya dikirim bila memang ada perubahan. */
  const info = {};
  const mutasi = buatMutator(pre, perluRoster, options.hitungRingkasan, info);
  const cek = await FASIH.patch(id, mutasi, { dryRun: true, log: false });
  if (!cek.nChanges) return { skip: true, code: cek.code, ket: 'tidak ada perubahan' };
  const r = dryRun ? cek : await FASIH.patch(id, mutasi, { dryRun: false, log: false });

  return { code: r.code, ket: [
    ...(info.cekUI ? ['⚠ CEK UI: ada AK berkode lain, ringkasan TIDAK dihitung'] : []),
    ...(info.kodeBang ? [`kode_bang ${info.kodeBang}`] : []),
    ...(info.dibentuk.length ? [`roster dari prelist #${info.dibentuk.join(', #')}`] : []),
    info.diisi.length ? `AK diisi kode ${KODE_ISI}: #${info.diisi.join(', #')}` : 'keberadaan AK sudah terisi semua',
    ...(info.sudah.length ? [`dibiarkan ${info.sudah.join(' ')}`] : []),
    `${info.jumlahAk} AK`,
    ...(info.ringkasan ? ['ringkasan dihitung ulang'] : []),
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · ') };
}

FASIH_BATCH.register({
  id: 'keberadaan-ak-kosong-isi-kode-1',
  name: 'Update Keberadaan AK',
  description: 'Keberadaan AK yang kosong → 1. Tinggal di rumah ini; kode_bang → 3; roster dari prelist',
  columns: [
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
  ],
  idColumn: 'assignment_id',
  options: [
    { key: 'hitungRingkasan', label: 'Hitung ulang ringkasan', type: 'checkbox', default: true,
      hint: 'Hitung ulang cek1, jum_*, gabung_dtsen, ak_info, ... bila semua AK berkode 1/5' },
  ],

  async process(row, { dryRun, options }) {
    return prosesSatu(row, { dryRun, options });
  },
});
