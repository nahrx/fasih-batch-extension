# Fasih Batch Extension

Extension Chrome/Edge untuk **mengubah data Fasih-SM BPS secara massal** — banyak assignment sekaligus, dari data yang ditempel dari Excel.

## Pemasangan

1. Buka `chrome://extensions` (atau `edge://extensions`), nyalakan **Developer mode**.
2. Klik **Load unpacked**, pilih folder ini. (Kalau versi lama sudah terpasang, cukup klik ⟳ Reload.)
3. Buka/reload tab `https://fasih-sm.bps.go.id` yang sudah login. Tombol hijau **⊞ Fasih Batch Extension** muncul di kanan bawah — panel juga bisa dibuka lewat ikon extension.

## Tiga menu

| Menu | Untuk apa | Butuh script? |
|---|---|---|
| **Automation** | Update massal lewat script `batch-automation.js`. | Ya |
| **Custom automation** | Pilih sendiri variabel yang mau diubah, langsung di sheet. | Tidak |
| **Restore** | Kembalikan assignment ke isi file backup `.json`. | Tidak |

Cara termudah adalah **Custom automation** (tanpa coding). Pakai **Automation** kalau kasusnya berulang dan sudah ada script-nya.

---

## Automation

Update massal dengan menjalankan sebuah script.

1. **Import script** → pilih `batch-automation.js`. Judul, kolom sheet, dan opsi toolbar otomatis mengikuti isi script. (Script terakhir tersimpan dan dimuat ulang otomatis; kalau file diubah, import lagi.)
2. **Tempel data dari Excel** ke kolom sheet. Error yang muncul bisa diperbaiki dulu.
3. **Dry run** untuk uji coba — periksa kolom status, code_identity, dan keterangan.
4. **Jalankan LIVE** untuk mengirim perubahan ke Fasih-SM.
   - Baris yang sudah **OK** tidak dikirim ulang.
   - Centang **Backup sebelum LIVE** (default mati) untuk mengunduh `fasih-backup-<id>-*.json` lebih dulu — bisa dipulihkan lewat menu **Restore**.
5. Opsional — **Remark** (default mati, hanya muncul kalau script punya `remarks`): isi cell remark ditulis sebagai catatan per-pertanyaan setelah baris berhasil (bukan LEWATI/GAGAL). Remark yang sama persis di pertanyaan yang sama tidak ditulis dua kali.

> Data sheet dan pengaturan disimpan per `id` script (di localStorage). Ganti script lalu kembali lagi — datanya masih ada.

---

## Custom automation (tanpa script)

Pilih sendiri variabel yang mau diubah, isi nilai barunya, lalu kirim.

Menu ini menjalankan **FASIH Sheet** (`custom/sheet.html`) sebagai iframe di dalam panel, pada origin `fasih-sm.bps.go.id` dengan login yang sama — jadi data diambil langsung dari API, tanpa paste ke Console.

> ⚠ **Butuh file HTML kuesioner.** Menu ini tidak bisa dipakai tanpa file kuesioner HTML (mis. `SE2026.html` dari FASIH) — dari situlah template, validasi, alur skip, dan tampilan form diambil. Pilih file-nya saat pertama kali membuka menu (langkah 1); kuesioner lalu tersimpan di browser untuk seterusnya. Export script **mode engine** juga mensyaratkan kuesioner ini sudah di-import.

### Langkah

1. **Pilih kuesioner HTML** (mis. `SE2026.html`) saat pertama kali. Template, validasi, alur skip, dan tampilan form diambil dari situ. Kuesioner tersimpan di browser; pakai **Ganti kuesioner** untuk menggantinya.
2. **Isi assignment_id** di kolom pertama, lalu Enter — datanya dimuat ke baris itu. Mau banyak sekaligus? Tempel satu kolom ID dari Excel di baris kosong terakhir (ID yang sudah ada dilewati).
3. Status muat per baris: *memuat…* atau *gagal muat* (arahkan kursor untuk alasannya; Enter di sel assignment_id untuk coba lagi).
4. **Pilih variabel yang mau diubah** lewat **✎ Pilih variabel**.

   ![Pilih variabel yang mau diubah](images/Pilih%20variable%20yang%20mau%20diubah.jpeg)
   *Pilih variabel yang mau diubah lewat dialog **✎ Pilih variabel**.*

   - Kolomnya: **Lama / Baru / Remark**.
   - Toggle **Tampilkan data lama** (default aktif) dan **Tampilkan remark** (default mati) mengatur kolom Lama & Remark. Remark yang sudah diisi tetap ikut terkirim walau kolomnya disembunyikan.
5. **Isi kolom Baru** (dan **Remark** bila perlu) pada variabel terpilih.

   ![Isi kolom variabel perubahan beserta remark catatannya](images/Isi%20kolom%20variable%20perubahan%20beserta%20remark%20catatannya.jpeg)
   *Isi kolom **Baru** (dan **Remark** bila perlu) pada variabel yang dipilih.*

   - Lihat data terload: ikon **mata** (abu-biru).
   - Lihat hasil update: ikon **mata+pensil** (biru berlatar biru muda; abu-abu bila belum ada perubahan).
   - Ambil hasil: **Export ▾ → JSON** (format sama dengan respons `get-by-assignment-id`).
6. **Kirim perubahan**: **Dry run** untuk uji coba (keterangan menampilkan jumlah jawaban baru/diubah/dihapus dan catatan sebelum → sesudah), **Kirim ke FASIH** (LIVE) untuk langsung update data ke Fasih SM secara otomatis.
   - **Jeda kirim** antar-record default 5000 ms (berlaku untuk dry run dan LIVE).
   - Pilihan dialog: lewati baris yang hasil update-nya masih error validasi (default aktif), dan **Backup kondisi server sebelum LIVE** (default aktif, bisa dipulihkan lewat **Restore**).
   - Baris yang berhasil dimuat ulang dari FASIH, sehingga perubahannya jadi data dasar baru.
   - Kalau masih ada assignment_id yang antri/sedang dimuat, muncul dialog menunggu lalu mulai otomatis setelah semua selesai. Esc membatalkan; baris yang gagal dimuat tidak ikut dikirim.

### Variabel roster

- Hanya bisa dipilih bersama variabel dari roster yang sama (tidak bisa dicampur dengan variabel utama atau roster lain; yang tak bisa dipilih tampil pudar).
- Memilih variabel roster menambah kolom **No roster** setelah assignment_id — nomor urut item roster yang diubah di baris itu (roster bertingkat: `1.2`). Info bar menampilkan daftar item yang ada.
- Satu assignment boleh diisi di beberapa baris dengan No roster berbeda (data disalin dari baris yang sudah dimuat, tanpa permintaan ulang). Perubahannya digabung jadi satu dokumen saat View hasil update, Export JSON, dan Kirim ke FASIH. Mengganti No roster memindahkan perubahan baris itu ke item baru.
- Sub-sheet roster (tombol ▦) sekarang hanya untuk melihat data.

### Export ke script Automation

**Export ▾ → Script** membuat `batch-automation - <nama>.js` dari variabel terpilih, untuk di-import ke menu **Automation**.

Kolom script: `assignment_id` (+ `no_roster` di mode roster), satu kolom per variabel, dan `remark_<variabel>` untuk variabel yang boleh diberi remark. Sel kosong = tidak diubah.

Di sheet Automation, tiap variabel tampil sesuai tipenya:
- pilihan tetap (radio/select/rating) → **dropdown**
- checkbox / multi → **dropdown multi**
- centang tunggal / toggle → **dropdown Ya/Tidak**
- tanggal/waktu/bulan → **pemilih tanggal**
- pilihan beropsi dari isian lain tapi berupa daftar tetap (mis. `ada_keluarga` dari `kode_keluarga_new`, `ada_bang_usaha`, `kode_bang`, roster `keberadaan_usaha`) → dropdown berisi **gabungan semua opsi yang mungkin**; yang berlaku untuk assignment tertentu dicek engine saat diproses (tidak berlaku → GAGAL "tidak ada di pilihan")
- pilihan beropsi dari data (nama anggota, principal — mis. `nama_info_list`, `pilih_umkm_sls`) atau dari lookup → tetap **diketik** (kode atau label)

**Salin data** / **Download data (.tsv)** berisi perubahan yang sudah diisi di sheet beserta baris judul, siap ditempel di sel A1 sheet Automation.

**Dua mode export:**

- **Dengan engine kuesioner** (default, disarankan) — tiap baris dihitung dengan engine yang sama dengan Custom automation: skip/enableCondition (isian yang jadi ter-skip ikut dihapus), validasi (galat seperti Ringkasan kuesioner), variabel hitungan, dan roster — lalu dikirim lewat `FASIH_CUSTOM.submit`. Isi sel sama seperti kolom **Baru**. Opsi *Lewati jika hasil update masih galat* (default aktif) menahan baris yang melanggar validasi; baris yang semua perubahannya jatuh di isian ter-skip → LEWATI; item roster yang tak ada → GAGAL.
  *Syarat:* kuesioner yang sama sudah di-import di Custom automation pada browser itu, dan `lib/custom_console.js` versi 1.2.0+. Kalau versi kuesioner beda dengan saat script dibuat, keterangan baris diberi peringatan.
- **Langsung (`FASIH.patch`)** — nilai ditulis apa adanya tanpa engine (tidak butuh kuesioner HTML). Opsi berupa kode atau label (`1`, `1. Ya`, `Ya`; multi dipisah `;`), angka, Ya/Tidak, geotag `lat, lon` / `lat, lon, accuracy` (desimal titik, lewat `FASIH.geotag`), atau teks. **Tidak** membersihkan isian ter-skip dan **tidak** menjalankan validasi — pakai untuk perubahan sederhana, dan selalu Dry run dulu. Kolom remark memakai toggle Remark di menu Automation (`FASIH.setComment`).

<details>
<summary><b>Variabel yang tidak bisa diekspor ke script</b> (contoh dari template SE2026 v7.1.2)</summary>

Mode engine hanya terkena kelompok 1; mode langsung terkena keduanya.

**1. Tidak bisa dipilih di Custom automation** (tidak pernah masuk script):
- Foto, file, CSV, tanda tangan, daftar pilihan, satuan — mis. `foto_depan`, `foto_ruang_tamu`, `file_input` (Import CSV Kantor Cabang).
- Isian yang dikunci / dihitung otomatis form (`disableInput`) — mis. `prov`, `kab`, `kec`, `desa`, `klas_desa`, `alamat_prelist`, `jumlah_ak_kk`, roster `umur_ak`, `total_tk_jk`. Di UI FASIH pun tak bisa diubah.

**2. Hanya mode langsung: bisa dipilih, tapi tidak ikut script mode langsung** (tercantum di bagian "Tidak ikut" pada dialog Export):
- Pilihan beropsi dari isian lain — mis. `ada_keluarga`, `ada_bang_usaha`, `kode_bang`, `nama_info_list`, roster `keberadaan_usaha`, `pengusaha_var`, `kbli_genai`, `pilih_umkm_sls`, `alamat_sesuai`, `pilih_keluarga_sls`.
- Pilihan beropsi dari tabel lookup FASIH — mis. `kec_baru`, `desa_baru`, `pilih_umkm`, `daftar_kp`, roster `prov_dn`, `kab_dn`, `kbli`, `profesi`, `prov_kp`, `kab_kp`.
- Daftar teks (tiap item membentuk baris roster) — `tambah_dtsen`, `nama_usaha_tambahan`, `list_ak_tinggal`.

Kelompok 2 tetap ikut di **mode engine**, dan tetap bisa diubah langsung di Custom automation (kolom **Baru** → **Kirim ke FASIH**).
</details>

### Toolbar & sheet

Urutan toolbar kanan: **Dry run**, **Kirim ke FASIH**, Jeda kirim (default 5000 ms), Jeda muat (default 2000 ms, jeda antar-pemuatan assignment_id), **Export ▾** (Script / JSON / CSV), **Import JSON**, lalu **Hapus semua** & **Ganti kuesioner** (kekuningan karena mengubah seluruh sheet).

Sheet menampilkan minimal 40 baris dan selalu menyisakan 20 baris kosong untuk assignment_id baru. Butuh lebih? Di bawah tabel ada **Tambah [20] baris lagi di bagian bawah** (jumlah bisa diubah). Jumlah baris diingat browser, kembali ke 40 setelah **Hapus semua**.

**Salin & tempel** (sama seperti menu Automation):
- Pilih sel/rentang: klik, drag, Shift+klik, Shift+panah; klik judul kolom = satu kolom; nomor baris = satu baris; Ctrl+A = semua.
- Klik hanya memilih. Untuk mengisi/mengubah: klik ganda, Enter, F2, atau langsung ketik.
- Ctrl+C/Ctrl+X menyalin rentang sebagai TSV; Ctrl+V menempel dari Excel/Sheets mulai sel aktif (satu nilai ke rentang = isi seluruh rentang; baris judul dilewati).
- **Banyak seleksi**: Ctrl+klik / Ctrl+drag (juga pada judul kolom & nomor baris) menambah sel/rentang lain. Esc atau panah kembali ke satu sel.
- **Klik kanan** pada sel: Salin, Potong, Tempel, Kosongkan Baru/Remark. (Tempel lewat menu butuh izin baca clipboard; kalau ditolak, pakai Ctrl+V.)

Catatan kolom:
- **assignment_id** — ID di baris kosong → dimuat dari FASIH; ID berbeda di baris berisi → mengganti assignment-nya (dengan konfirmasi). Menempel blok ID + kolom Baru/Remark sekaligus: assignment dimuat dulu, lalu nilai diterapkan.
- **Baru** — kode (`1`), label (`1. Ditemukan`), atau label tanpa kode (`Ditemukan`); checkbox dipisah `;`; Ya/Tidak untuk centang. Nilai tak cocok ditolak dan disebutkan.
- **Remark** — teks baru diketik di sel. Author diambil otomatis dari user FASIH yang login (`myinfo`) saat Export JSON, View, dan Kirim. Kalau myinfo gagal: Kirim menolak baris (GAGAL), Export JSON tetap jalan dengan peringatan.
- Kolom data/Lama read-only: ikut disalin, tapi dilewati saat ditempel.

### lib/custom_console.js

Library submit khusus Custom automation, tersedia sebagai `window.FASIH_CUSTOM` di halaman FASIH (bisa juga dari DevTools Console). Yang dikirim adalah dokumen hasil sheet (data asli + perubahan + remark baru, sudah dihitung engine kuesioner), lewat jalur sama dengan `FASIH.submitEdit`: zip `data.json`/`comment.json`/`media.json` → presign → upload → commit `s3/edit` (`sourceFrom: SCM-EDIT`). Kolom `data1`–`data10` tidak diubah.

```js
await FASIH_CUSTOM.submit(item)                          // dry run: { nChanges, changes[], commentChanged, version, ... }
await FASIH_CUSTOM.submit(item, { dryRun: false })       // kirim
await FASIH_CUSTOM.submitBatch(items, { dryRun: false, delayMs: 1500 })
await FASIH_CUSTOM.backup([id1, id2])                    // format backup FASIH / menu Restore
await FASIH_CUSTOM.myInfo(surveyPeriodId)                // user login (username = pengirim remark baru)
const api = await FASIH_CUSTOM.engine(idKuesioner)       // engine kuesioner (sheet tersembunyi), dipakai script mode engine
await api.compute({ response, keys, values, remarks, rosterNo })   // -> { envelope, galat, errors, ignored }
// item = hasil Export JSON ({ success, data: { _id, data, comment, submit_version_code, ... } })
//      atau { assignmentId, data, comment?, expectVersion? }
```

**Pengaman:**
- Kalau `submit_version_code` di server sudah beda dari versi saat data dimuat → record ditolak (**GAGAL**), supaya perubahan orang lain tak tertimpa. Muat ulang baris (Enter di sel assignment_id), lalu ulangi. `{ force: true }` melewati pengaman ini.
- Jawaban & catatan yang sudah sama dengan server tidak dikirim (**LEWATI**), jadi versi record tidak naik.
- Server tidak memvalidasi isi dokumen; validasi berasal dari engine kuesioner di sheet. **Uji 1 record dulu** dan buka hasilnya di UI FASIH.

> Sumber halaman ini ada di `../HTML kuesioner SE2026/sheet-src/`. Setelah diubah, jalankan `node build-sheet.js` di folder itu (sekaligus memperbarui `custom/sheet.html`), lalu Reload extension.

---

## Restore

Mengembalikan assignment ke isi file backup (`fasih-backup-*.json` dari *Backup sebelum LIVE* atau `FASIH.backup`). Yang dikembalikan: seluruh jawaban, catatan (comment), dan kolom `data1`–`data10`. **Perubahan apa pun setelah backup dibuat akan tertimpa.**

1. **Pilih file backup**. Semua assignment di file tampil di sheet beserta code_identity, versi, dan jumlah jawaban saat backup dibuat.
2. Mau sebagian saja? Hapus `assignment_id` yang tak perlu (pilih sel, lalu Delete).
3. **Dry run** — kolom keterangan menunjukkan apa yang akan dikembalikan, mis. `2 jawaban berubah, 1 jawaban dihapus, kolom data3, catatan`. Record yang sudah sama dengan backup → **LEWATI**.
4. **Restore LIVE**. **Backup kondisi sekarang sebelum LIVE** (default aktif) lebih dulu mengunduh `fasih-backup-sebelum-restore-*.json`, supaya restore bisa dibatalkan.

Catatan:
- Record dengan survey period berbeda dari backup ditolak (**GAGAL**).
- File backup tidak disimpan di browser (ukurannya bisa beberapa MB). Kalau halaman di-reload, pilih file lagi. Pengaturan jeda dan backup tetap tersimpan.

---

## Contoh script

Folder `example - imported script/` berisi script yang sudah dipakai di lapangan. Langsung **Import script**, atau salin sebagai titik awal kasus baru. Penjelasan lengkap (pola diff record, field yang diubah/tidak dikirim) ada di komentar bagian atas tiap file.

| file | panel (`id`) | kasus | kolom sheet | opsi toolbar |
|---|---|---|---|---|
| `batch-automation - input BANR prelist keluarga dengan keberadaan anggota keluarga ditemukan.js` | Update Keluarga BANR (`keluarga-non-respon-ke-ditemukan-banr`) | Keluarga "tidak dapat ditemui" (kode 5) → 1. Ditemukan + BANR + roster anggota keluarga dari prelist. Foto `foto_depan_p` dipindah ke `foto_depan`. | `assignment_id`, `no_banr`, `no_bangunan_terbesar` (opsional) | Lewati yang sudah ditemukan, No. bangunan terbesar default |
| `batch-automation - input BANR prelist usaha BKU dengan keberadaan usaha ditemukan dan input kbli.js` | Update Usaha BANR (`usaha-tidak-ditemukan-ke-ditemukan-banr`) | Bangunan & usaha 0. Tidak Ditemukan → 1. Ditemukan + BANR (+ geotag), identitas usaha dari prelist, KBLI dari master KBLI (API lookup FASIH). | `assignment_id`, `no_banr`, `latitude`, `longitude`, `accuracy`, `no_bangunan_terbesar`, `kbli` (semua kecuali dua pertama opsional) | Lewati yang sudah ditemukan, Usaha → 1. Ditemukan, Akurasi geotag default, No. bangunan terbesar default, URL lookup KBLI |
| `batch-automation - update keberadaan anggota keluarga ditemukan.js` | Update Keberadaan AK (`keberadaan-ak-kosong-isi-kode-1`) | Keberadaan AK yang masih kosong → 1. Tinggal di rumah ini; `kode_bang` → 3; roster dari prelist bila kosong. AK yang sudah terisi dibiarkan. | `assignment_id` | Hitung ulang ringkasan |
| `batch-automation - update keuangan usaha prelist keluarga.js` | Koreksi Keuangan Usaha (`keuangan-usaha-keluarga`) | Koreksi biaya & pendapatan usaha di record keluarga. Usaha dicari berdasarkan nama; total pengeluaran & pendapatan dihitung ulang. | `assignment_id`, `nama_usaha`, `biaya_produksi`, `biaya_pembelian`, `operasional`, `nilai_pendapatan`, `gaji`, `non_operasional`, `pendapatan_lain` | – |
| `batch-automation - update NIK anggota keluarga.js` | Koreksi NIK Anggota Keluarga (`koreksi-nik-anggota-keluarga`) | Koreksi `nik_dtsen#n` anggota keluarga. AK dicari berdasarkan nama + nomor urut; tidak ada yang cocok → LEWATI. Remark `remark_nik` (opsional) tetap ditulis walau NIK tidak berubah. | `assignment_id`, `no_urut`, `nama`, `nik` (16 atau 4 digit, opsional) | –
| `batch-automation - update keluarga tunggal tidak ditemukan menjadi meninggal.js` | Keluarga Tunggal Meninggal (`keluarga-tunggal-tidak-ditemukan-ke-meninggal`) | Keluarga **tunggal** (tepat 1 AK di prelist) berstatus 0. Tidak Ditemukan → `ada_keluarga` 3. Meninggal; baris `ec_ada_usaha` dihapus. Bukan tunggal / bukan Tidak Ditemukan → LEWATI. Remark `remark_ada_keluarga` (opsional). | `assignment_id`, `catatan` (opsional) | – |
| `batch-automation - update keluarga tunggal ditemukan BANR menjadi meninggal.js` | Keluarga Tunggal BANR Meninggal (`keluarga-tunggal-banr-ke-meninggal`) | Keluarga **tunggal** (1 AK di prelist & roster) berstatus 1. Ditemukan + BANR → `ada_keluarga` 3. Meninggal; `ec_keluarga*` false, `pilihan_kode_bang` non-keluarga, `isForceSubmit` false; BANR, roster AK `#n`, ringkasan & aset dihapus. Field sisa di luar pola contoh ditandai **⚠ CEK UI**. Bukan tunggal / tanpa BANR → LEWATI. | `assignment_id`, `no_banr` (opsional, pengaman), `catatan` (opsional) | – |

Catatan:
- Sel angka kosong di script keuangan usaha artinya nilai lama dipertahankan. Tulis angka tanpa pemisah ribuan (`2961702`, bukan `2.961.702`).
- Script keberadaan AK menandai keterangan dengan **⚠ CEK UI** kalau ada AK berkode selain 1/5. Ringkasan record itu tidak dihitung ulang, jadi buka record tersebut di UI.
- Record yang sudah sesuai atau tidak cocok dengan kasusnya tidak dikirim (versi record tidak naik) dan berstatus LEWATI. Alasannya tertulis di kolom keterangan.

---

## Membuat batch-automation.js baru

Di panel, klik **Download template** — file `batch-automation.js` diunduh dari `templates/batch-automation.template.js`. Template ini kerangka kosong siap di-import: kolom `assignment_id`, serta `options`, `remarks`, dan `process` yang masih kosong.

Isi bagian bertanda `TODO` (minimal `id`, `name`, dan field yang diubah di `process`), lalu **Import script**.

Template juga bisa dibuat dari salinan salah satu [contoh script](#contoh-script) atau `../batch-automation.js` (kasus OSS). Ganti `id`-nya supaya data sheet tidak tercampur dengan script asal. Bagian yang perlu diubah ada di `FASIH_BATCH.register({...})`:

```js
FASIH_BATCH.register({
  id: 'kasus-baru',                       // unik; data sheet disimpan per id
  name: 'Judul panel', description: 'subjudul',
  columns: [                              // kolom A, B, C, ... yang ditempel dari Excel
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
    { key: 'no_banr', required: true },
    { key: 'latitude', type: 'number' },
  ],
  idColumn: 'assignment_id',              // untuk FASIH.init() & backup
  options: [{ key: 'lewati', label: 'Lewati yang sudah', type: 'checkbox', default: true }],
  remarks: [                              // opsional; tampil saat toggle Remark dicentang
    { dataKey: 'kbli', title: 'remark KBLI' },
    'no_banr',                            // singkatan -> kolom remark_no_banr
  ],
  validateRow: (row) => null,             // atau 'pesan' / { kolom: 'pesan' }
  async process(row, { dryRun, options, FASIH }) {
    const r = await FASIH.update(row.assignment_id, { /* ... */ }, { dryRun, log: false });
    return { code: r.code, ket: `${r.nChanges} perubahan` };   // { skip: true } -> LEWATI, throw -> GAGAL
  },
});
```

Acuan field:
- **Kolom**: `{ key, title?, type?, required?, unique?, width?, mono?, trim? }`. `key` tidak boleh diawali `_` (dipakai panel untuk status/keterangan). `title` mengganti judul kolom, `width` lebar px, `mono` font monospace, `trim` buang spasi di ujung (default aktif kecuali `text`).
- **`type`**: `text` (default), `uuid`, `number`, `integer`, `select`, `date`. Nilai `number`/`integer` sampai ke `process` sudah berupa Number (sel kosong = `null`).
  - `select`: `choices: [{ value, label }]` (wajib), `multiple?: true` untuk banyak pilihan. Sel membuka dropdown (ketik untuk mencari / ketik kode, panah + Enter pilih; multiple: Spasi centang, Enter simpan). Isi sel = label, multiple dipisah `; `. Nilai tempelan dicocokkan dengan kode, label, atau label tanpa kode — yang tak cocok ditandai merah. `process` menerima teks sel apa adanya.
  - `date`: `input: 'date'` (default) | `'datetime-local'` | `'time'` | `'month'` | `'week'` — pemilih bawaan browser; format salah ditandai merah (mis. `YYYY-MM-DD`).
- **Opsi toolbar**: `{ key, label, type: 'checkbox'|'number'|'text'|'select', default, choices?, hint? }`. `hint` tampil sebagai tooltip. Key `jeda`, `backup`, `remark` dipakai panel.
- **Remark**: `{ dataKey, key?, title?, width? }` atau cukup `'dataKey'`. `key` default `remark_<dataKey>`, `title` default `remark <dataKey>`. Butuh `idColumn`. Sebelum proses, panel memastikan semua `dataKey` remark yang terisi ada di template; kalau ada salah ketik, proses dihentikan sebelum ada yang dikirim. Isi kolom remark tetap tersimpan walau toggle dimatikan. Untuk field roster (`dataKey#n`) yang barisnya baru diketahui saat proses, `process` mengembalikan `remarkKeys`, mis. `{ nama_usaha: 'nama_usaha#1001' }`.
- **`idColumn`** default ke kolom `uuid` pertama. Isi `null` kalau tidak perlu `FASIH.init()`/backup otomatis.
- **Opsional**: `before(rows, ctx)` untuk menggantikan `FASIH.init` bawaan, dan `after(results, ctx)`.
- **`ctx`** = `{ dryRun, options, FASIH, index, total, rowNumber, sleep, remarks }`. `remarks` = remark terisi di baris itu `[{ dataKey, text }]`. `options` sudah berisi `jeda`, `backup`, `remark`.
- File dijalankan sebagai badan fungsi async: `await` boleh dipakai, `const`/`function` di dalamnya tidak bocor ke halaman, dan import ulang tidak bentrok.

---

## Catatan teknis

- `lib/general_console.js`, `sheet.js`, dan `panel.js` berjalan di MAIN world halaman, sama seperti kode yang di-paste ke DevTools Console. Karena itu, kalau `general_console.js` di-paste manual ke Console di tab yang sama, muncul *"Identifier 'FASIH' has already been declared"* — tidak perlu, karena `FASIH` sudah tersedia.
- Script yang di-import dijalankan dengan `AsyncFunction`. Kalau CSP halaman menolak eval, panel memakai jalur cadangan: `bridge.js` → `background.js` → `chrome.userScripts.execute` (Chrome 135+). Jalur ini butuh **Allow User Scripts** dinyalakan di halaman Details extension.
- `lib/general_console.js` adalah salinan `../general_console.js` dengan `console.log(node)` di `init()` dihapus. Kalau file induknya berubah, salin ulang ke `lib/`.

| file | isi |
|---|---|
| `manifest.json` | MV3; content script MAIN world + bridge |
| `lib/general_console.js` | FASIH (getAssignment, patch, update, backup, restore, ...) |
| `sheet.js` | komponen grid (`FasihSheet`) |
| `panel.js` | panel generik (menu Automation & Restore), `window.FASIH_BATCH.register`, import, validasi, proses berurutan, restore dari file backup |
| `bridge.js` / `background.js` | toggle lewat ikon, URL template, cadangan `chrome.userScripts` |
| `templates/batch-automation.template.js` | template yang diunduh lewat tombol **Download template** |
| `example - imported script/` | contoh script siap import (lihat [Contoh script](#contoh-script)) |
