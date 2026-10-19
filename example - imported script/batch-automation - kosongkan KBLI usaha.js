/* ============================================================================
 * batch-automation - kosongkan KBLI usaha.js — di-import lewat tombol "Import script" di extension FASIH Batch
 * ----------------------------------------------------------------------------
 * KASUS: KBLI usaha yang sudah terisi  ->  dikosongkan (dipilih ulang nanti dari Master KBLI)
 *   Pola dari diff record 0e2647e3 (MAHALIA, template 7.1.2, v5 -> v6):
 *     kbli terisi.json -> kbli kosong.json
 *
 * Yang berubah di contoh, per baris usaha #n yang KBLI-nya dikosongkan:
 *   kbli#n            [{ [F][41011]Konstruksi ... }]  -> baris DIHAPUS
 *   kbli_akhir#n      "41011"                         -> baris DIHAPUS
 *   kategori#n        "F"                             -> ""
 *   kbli_genai#n, var_kbli#n, kategori_2025#n, kbli_prelist#n  TIDAK berubah
 * Ringkasan:
 *   daftar_anomali["8"] (2 digit KBLI pendataan ≠ KBLI SBR) dihitung ulang dari usaha yang
 *     masih punya kbli_akhir. Kosong -> daftar_anomali [] dan resolved_at diisi waktu sekarang
 *     (sama seperti UI); masih ada -> daftar diperbarui, resolved_at null.
 *   no_bangunan_terbesar  (baru 168 di contoh) -> kolom/opsi no_bangunan_terbesar, opsional
 *   isForceSubmit         true -> false
 * Tidak dikirim (dibangun ulang FormGear): pilih_umkm_options#n, var_hiden_pml#n,
 *   templateVersion/validationVersion, kolom data5/data7 (dihitung server).
 *
 * Syarat diproses (selain itu -> LEWATI, record tidak dikirim, versi tidak naik):
 *   ada baris usaha yang kbli#n / kbli_akhir#n-nya terisi (setelah disaring kolom
 *   nama_usaha & kbli_lama bila diisi).
 *
 * Kolom sheet:
 *   A assignment_id | B nama_usaha (opsional) | C kbli_lama (opsional, pengaman)
 *   | D no_bangunan_terbesar (opsional) | E catatan (opsional)
 *   nama_usaha kosong -> semua usaha ber-KBLI di record dikosongkan; diisi -> hanya usaha
 *     yang namanya sama (tidak peka huruf besar/kecil & spasi). Tidak ada yang cocok -> LEWATI.
 *   kbli_lama diisi -> hanya usaha dengan kbli_akhir = kode itu (pengaman salah tempel baris).
 *     4 digit dianggap nol depannya hilang di Excel (1111 -> 01111).
 *   no_bangunan_terbesar kosong -> opsi default di toolbar; keduanya kosong -> tidak dikirim.
 *   catatan diisi -> field catatan (blok CATATAN) diganti dengan isi sel; kosong -> tidak diubah.
 * Remark (toggle Remark): remark_kbli ditulis ke kbli#n usaha yang dikosongkan
 *   (hanya bila tepat 1 usaha; lebih dari 1 -> GAGAL supaya remark tidak salah tempat).
 * ==========================================================================*/

const ANOMALI_KBLI = {
  no: '8',
  column: { nama_usaha: 'Nama Usaha/Perusahaan', kbli_prelist: 'KBLI SBR', kbli_akhir: 'KBLI SE2026' },
  message: 'Perbedaan jumlah usaha menurut KBLI 2 digit hasil pendataan dan SBR',
};

/* Baris yang dihapus UI saat KBLI dikosongkan (nama dasar, tanpa #n) */
const HAPUS = ['kbli', 'kbli_akhir'];

/* Disimpan UI tanpa force submit */
const DOC_META = { isForceSubmit: false };

const teks = (v) => String(v ?? '').trim();
const normal = (s) => teks(s).toUpperCase().replace(/\s+/g, ' ');
const kosong = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const angkaOpsi = (v) => (v == null || String(v).trim() === '' ? null : Number(String(v).trim().replace(',', '.')));
const versi = (r, dryRun) => (dryRun ? `v${r.version}` : `v${r.version} → v${r.versionAfter}`);
const kodeKbli = (s) => { const t = teks(s); return /^\d{4}$/.test(t) ? `0${t}` : t; };
const labelKbli = (v) => (Array.isArray(v) && v[0] && v[0].label != null ? v[0].label : null);

/* Nomor baris usaha (#n) yang ada di record */
const barisUsahaDari = (answers) => [...new Set(answers
  .map((a) => (a.dataKey.match(/^(?:nama_usaha|keberadaan_usaha|kode_keberadaan_usaha|kbli|kbli_akhir)#(\d+)$/) || [])[1])
  .filter(Boolean))].sort((p, q) => p - q);

/* ---------------------------------------------------------------------------
 * Mutator — meniru isi dokumen setelah KBLI dikosongkan di UI
 * ------------------------------------------------------------------------- */
function buatMutator(row, target, barisUsaha, P, { noBang }, info) {
  return (doc, { set, get }) => {
    /* ---- KBLI per usaha ---- */
    const kunciHapus = new Set(target.flatMap((n) => HAPUS.map((f) => `${f}#${n}`)));
    info.dihapus = doc.answers.filter((a) => kunciHapus.has(a.dataKey)).map((a) => a.dataKey);
    for (let i = doc.answers.length - 1; i >= 0; i--) if (kunciHapus.has(doc.answers[i].dataKey)) doc.answers.splice(i, 1);
    for (const n of target) if (get(`kategori#${n}`) !== undefined) set(`kategori#${n}`, '');

    /* ---- anomali 8: dihitung ulang dari usaha yang masih punya KBLI ---- */
    const beda = barisUsaha
      .map((n) => ({ nama_usaha: get(`nama_usaha#${n}`), kbli_prelist: get(`kbli_prelist#${n}`) ?? P[`kbli_prelist#${n}`], kbli_akhir: get(`kbli_akhir#${n}`) }))
      .filter((u) => u.kbli_akhir && u.kbli_prelist && String(u.kbli_akhir).slice(0, 2) !== String(u.kbli_prelist).slice(0, 2));
    const lama = get('daftar_anomali');
    if (lama && typeof lama === 'object' && !Array.isArray(lama)) {
      const anomali = JSON.parse(JSON.stringify(lama));
      const a8 = anomali['8'];
      if (beda.length) anomali['8'] = { no: ANOMALI_KBLI.no, resolved_at: null, column: ANOMALI_KBLI.column, message: ANOMALI_KBLI.message, daftar_anomali: beda };
      else if (a8) anomali['8'] = { ...a8, resolved_at: a8.resolved_at || new Date().toISOString(), daftar_anomali: [] };
      set('daftar_anomali', FASIH.raw(anomali));
      info.anomali8 = a8 ? `${(a8.daftar_anomali || []).length} → ${beda.length}` : null;
    }

    /* ---- no bangunan terbesar & catatan (opsional) ---- */
    if (noBang != null) set('no_bangunan_terbesar', noBang);
    const catatan = teks(row.catatan);
    if (catatan) set('catatan', catatan);

    Object.assign(doc, DOC_META);
  };
}

async function prosesSatu(row, { dryRun, options, remarks }) {
  const asg = await FASIH.getAssignment(row.assignment_id);
  if (!asg || !asg.data) throw new Error('assignment tidak ditemukan / belum ada isian');
  const answers = JSON.parse(asg.data).answers || [];
  const code = asg.code_identity;
  const cari = (k) => (answers.find((a) => a.dataKey === k) || {}).answer;

  const barisUsaha = barisUsahaDari(answers);
  if (!barisUsaha.length) return { skip: true, code, ket: 'tidak ada baris usaha' };

  /* ---- usaha yang KBLI-nya dikosongkan ---- */
  const berKbli = barisUsaha.filter((n) => !kosong(cari(`kbli#${n}`)) || !kosong(cari(`kbli_akhir#${n}`)));
  if (!berKbli.length) return { skip: true, code, ket: `KBLI sudah kosong (${barisUsaha.length} usaha)` };
  const nama = normal(row.nama_usaha), kodeLama = kodeKbli(row.kbli_lama);
  const target = berKbli
    .filter((n) => !nama || normal(cari(`nama_usaha#${n}`)) === nama)
    .filter((n) => !kodeLama || teks(cari(`kbli_akhir#${n}`)) === kodeLama);
  if (!target.length) {
    const ada = berKbli.map((n) => `#${n} ${cari(`nama_usaha#${n}`) ?? '?'} (${cari(`kbli_akhir#${n}`) ?? '?'})`).join(', ');
    return { skip: true, code, ket: `tidak ada usaha ber-KBLI yang cocok${nama ? ` nama "${teks(row.nama_usaha)}"` : ''}` +
                                    `${kodeLama ? ` kbli ${kodeLama}` : ''} — ada: ${ada}` };
  }

  /* remark ditulis panel ke kbli#n usaha ini */
  if ((remarks || []).length && target.length > 1)
    throw new Error(`remark kbli berlaku untuk 1 usaha, yang dikosongkan ${target.length} usaha (#${target.join(', #')}) — isi kolom nama_usaha`);
  const remarkKeys = { kbli: `kbli#${target[0]}` };

  const P = Object.fromEntries((JSON.parse(asg.pre_defined_data || '{"predata":[]}').predata || []).map((p) => [p.dataKey, p.answer]));
  const noBang = row.no_bangunan_terbesar ?? angkaOpsi(options.noBangDefault);
  const info = {};
  const mutasi = buatMutator(row, target, barisUsaha, P, { noBang }, info);

  /* Rencana (dry run). LIVE hanya dikirim bila memang ada perubahan.
     nChanges FASIH tidak menghitung baris yang dihapus, jadi dijumlah sendiri. */
  const cek = await FASIH.patch(row.assignment_id, mutasi, { dryRun: true, log: false });
  if (!cek.nChanges && !info.dihapus.length) return { skip: true, code: cek.code, ket: 'tidak ada perubahan' };
  const r = dryRun ? cek : await FASIH.patch(row.assignment_id, mutasi, { dryRun: false, log: false });

  return { code: r.code, ket: [
    ...target.map((n) => `#${n} ${cari(`nama_usaha#${n}`) ?? '?'}: ${labelKbli(cari(`kbli#${n}`)) ?? cari(`kbli_akhir#${n}`)} → (kosong)`),
    ...(info.anomali8 ? [`anomali 8: ${info.anomali8} usaha`] : []),
    ...(noBang != null ? [`no_bangunan_terbesar ${noBang}`] : []),
    ...(teks(row.catatan) ? ['catatan diubah'] : []),
    `hapus ${info.dihapus.length} baris`,
    `${r.nChanges} perubahan`, versi(r, dryRun),
  ].join(' · '), remarkKeys };
}

FASIH_BATCH.register({
  id: 'kosongkan-kbli-usaha',
  name: 'Kosongkan KBLI Usaha',
  description: 'KBLI usaha terisi → kosong (kbli & kbli_akhir dihapus, kategori dikosongkan, anomali 8 dihitung ulang)',
  columns: [
    { key: 'assignment_id',        type: 'uuid', required: true, unique: true },
    { key: 'nama_usaha',           title: 'nama_usaha (opsional)', type: 'text', width: 220 },
    { key: 'kbli_lama',            title: 'kbli_lama (opsional, pengaman)', width: 200, trim: true, mono: true },
    { key: 'no_bangunan_terbesar', title: 'no_bangunan_terbesar (opsional)', type: 'integer', width: 200 },
    { key: 'catatan',              title: 'catatan (opsional)', type: 'text', width: 260 },
  ],
  idColumn: 'assignment_id',
  options: [
    { key: 'noBangDefault', label: 'No. bangunan terbesar default', type: 'number', default: '',
      hint: 'Dipakai bila kolom no_bangunan_terbesar kosong. Kosongkan = tidak dikirim. Nilainya beda per SLS.' },
  ],
  /* Catatan per-pertanyaan — muncul saat toggle Remark aktif; ditulis ke kbli#n
     usaha yang dikosongkan (lewat remarkKeys dari process) */
  remarks: [
    { dataKey: 'kbli', title: 'remark_kbli (opsional)' },
  ],
  validateRow: (row) => {
    const kode = kodeKbli(row.kbli_lama);
    if (kode && !/^\d{5}$/.test(kode)) return { kbli_lama: 'harus kode 5 digit, mis. 41011' };
    return null;
  },

  async process(row, { dryRun, options, remarks }) {
    return prosesSatu(row, { dryRun, options, remarks });
  },
});
