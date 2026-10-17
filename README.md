# Fasih Batch Extension (Chrome extension)

Ini panel sheet ala Google Sheets untuk update massal assignment FASIH. Extension ini sendiri tidak berisi logika update apa pun. Kolom sheet dan proses per baris diambil dari file **`batch-automation.js`** yang di-import lewat panel. Contoh siap pakai ada di folder [`example - imported script/`](#contoh-script) dan di `../batch-automation.js` (kasus usaha OSS: Tidak Ditemukan → Ditemukan).

## Pasang
1. Buka `chrome://extensions` (atau `edge://extensions`), lalu nyalakan **Developer mode**.
2. Klik **Load unpacked**, lalu pilih folder ini. Kalau versi sebelumnya sudah terpasang, klik ⟳ Reload.
3. Reload tab `https://fasih-sm.bps.go.id` yang sudah login. Tombol hijau **⊞ Fasih Batch Extension** akan muncul di kanan bawah. Panel juga bisa dibuka lewat ikon extension.

## Menu
Header panel berisi judul **Fasih Batch Extension** dan tiga menu di sampingnya:
- **Automation**: update massal lewat script `batch-automation.js` (bagian [Pakai](#pakai)).
- **Custom automation**: FASIH Sheet, sheet berbasis kuesioner HTML (bagian [Custom automation](#custom-automation)).
- **Restore**: kembalikan assignment ke isi file backup `.json` (bagian [Restore](#restore)).

Menu terakhir yang dibuka diingat. Selama proses berjalan, menu tidak bisa dipindah.

## Pakai
Bagian ini untuk menu **Automation**.
1. Klik **Import script**, lalu pilih `batch-automation.js`. Judul, kolom sheet, dan opsi di toolbar langsung mengikuti isi script.
   Script terakhir disimpan dan dimuat ulang otomatis setiap kali halaman dibuka. Kalau file-nya diubah, import ulang.
2. Klik sel **A1**, lalu tekan Ctrl+V dari Excel. Baris judul otomatis dilewati.
   Sel merah artinya tidak valid. Arahkan kursor ke sel itu untuk melihat alasannya.
3. Klik **Dry run**, lalu periksa kolom status, code_identity, dan keterangan.
4. Uji 1 baris LIVE dulu dan buka hasilnya di UI. Setelah itu klik **Jalankan LIVE**.
   Baris yang sudah **OK** tidak dikirim ulang. *Backup sebelum LIVE* (default tidak dicentang) mengunduh `fasih-backup-<id>-*.json`, yang bisa dipulihkan lewat menu **Restore** (atau `FASIH.restore`).
5. Opsional: centang **Remark** (default nonaktif, hanya muncul kalau script punya `remarks`). Kolom remark ditambahkan setelah kolom script. Sel remark yang terisi ditulis sebagai catatan per-pertanyaan dengan `FASIH.setComment` setelah baris berhasil diproses (bukan LEWATI/GAGAL). Satu remark = satu submit, jadi versi record naik per remark. Teks yang sama persis di pertanyaan yang sama tidak ditulis dua kali. Saat dry run, remark hanya dicek, tidak dikirim.

Data sheet dan pengaturan disimpan per `id` script di localStorage FASIH. Kalau berganti script lalu kembali ke script sebelumnya, datanya masih ada.

## Restore
Menu **Restore** mengembalikan assignment ke isi file backup (`fasih-backup-*.json` dari *Backup sebelum LIVE* atau `FASIH.backup`). Yang dikembalikan adalah seluruh jawaban, catatan (comment), dan kolom `data1`–`data10`. Perubahan apa pun setelah backup dibuat akan tertimpa.
1. Klik **Pilih file backup**. Semua assignment di file tampil di sheet bersama code_identity, versi, dan jumlah jawaban saat backup dibuat.
2. Kalau hanya sebagian yang perlu direstore, hapus `assignment_id` yang tidak perlu (pilih sel, lalu Delete). Cara lain: Ctrl+A, Delete, lalu tempel daftar `assignment_id` dari Excel. Id yang tidak ada di file ditandai merah.
3. Klik **Dry run**. Kolom keterangan menunjukkan apa yang akan dikembalikan, misalnya `2 jawaban berubah, 1 jawaban dihapus, kolom data3, catatan`. Record yang sudah sama dengan backup berstatus **LEWATI** dan tidak dikirim, jadi versinya tidak naik.
4. Klik **Restore LIVE**. *Backup kondisi sekarang sebelum LIVE* (default dicentang) lebih dulu mengunduh `fasih-backup-sebelum-restore-*.json`, supaya restore bisa dibatalkan dengan me-restore file itu.

Catatan:
- Record dengan survey period yang berbeda dari backup ditolak (**GAGAL**).
- File backup tidak disimpan di browser karena ukurannya bisa beberapa MB. Kalau halaman di-reload, pilih file lagi. Pengaturan jeda dan backup tetap tersimpan.

## Custom automation
Menu **Custom automation** menjalankan FASIH Sheet (`custom/sheet.html`) di dalam panel. Halaman itu dimuat sebagai iframe `srcdoc`, sehingga berjalan di origin `fasih-sm.bps.go.id` dan memakai login yang sama: data assignment diambil langsung dari API tanpa skrip konsol.
1. Pertama kali dibuka, pilih file kuesioner HTML (mis. `index.html` form FASIH). Template, validasi, alur skip, dan tampilan form diambil dari file itu. Kuesioner disimpan di browser dan langsung terbuka lagi berikutnya; **Ganti kuesioner** untuk memakai kuesioner lain.
2. Isi kolom pertama, **assignment_id**, lalu Enter. Data dimuat dari `/app/api/assignment-general/api/assignment/get-by-assignment-id?assignmentId=…` ke baris itu. Tempel satu kolom ID dari Excel di baris kosong terakhir untuk memuat banyak assignment sekaligus (ID yang sudah ada dilewati).
3. Status per baris: *memuat…*, atau *gagal muat* (arahkan kursor untuk alasannya; Enter di sel assignment_id untuk mencoba lagi).
4. Data sheet read-only. Ubah lewat **✎ Pilih variabel** (kolom Lama/Baru/Remark; toggle **Tampilkan data lama** default aktif dan **Tampilkan remark** default mati mengatur kolom Lama & Remark — remark yang sudah diisi tetap ikut walau kolomnya disembunyikan), lihat data terload lewat ikon mata (abu-biru) dan hasil update lewat ikon mata+pensil (biru berlatar biru muda; abu-abu bila belum ada perubahan) dalam tampilan kuesioner, dan ambil hasil lewat **Export ▾ → JSON** (format sama dengan respons `get-by-assignment-id`).
   - **Variabel roster**: hanya bisa dipilih bersama variabel dari roster yang sama (tidak bisa dicampur dengan variabel utama atau roster lain; yang tidak bisa dipilih tampil pudar). Memilih variabel roster menambah kolom **No roster** setelah assignment_id: nomor urut item roster yang variabelnya diubah di baris itu (roster bertingkat: `1.2`). Info bar menampilkan daftar item yang ada. Satu assignment boleh diisi di beberapa baris dengan No roster berbeda (data disalin dari baris yang sudah dimuat, tanpa permintaan ulang); perubahan baris-baris itu digabung menjadi satu dokumen saat View hasil update, Export JSON, dan Kirim ke FASIH. Mengganti No roster memindahkan perubahan baris itu ke item yang baru. Sub-sheet roster (tombol ▦) sekarang hanya untuk melihat data.
5. Kirim baris yang punya perubahan/remark baru lewat `lib/custom_console.js`, dengan tombol di toolbar sheet (gaya sama dengan menu Automation). Klik **Dry run** dulu: kolom keterangan menunjukkan jumlah jawaban baru/diubah/dihapus dan catatan sebelum → sesudah. Lalu **Kirim ke FASIH** (LIVE). **Jeda kirim** antar-record default 5000 ms, berlaku untuk dry run dan LIVE seperti di menu Automation. Pilihan di dialog: lewati baris yang hasil update-nya masih error validasi (default dicentang) dan *Backup kondisi server sebelum LIVE* (default dicentang, file bisa dipulihkan lewat menu **Restore**). Baris yang berhasil dimuat ulang dari FASIH, sehingga perubahannya menjadi data dasar baru. Kalau masih ada assignment_id yang antri atau sedang dimuat (termasuk nilai Baru/Remark yang ditempel bersama ID baru), Dry run / Kirim menampilkan dialog menunggu, lalu mulai otomatis setelah semua selesai dimuat. Batal (Esc) membatalkan pengiriman. Baris yang gagal dimuat tidak ikut dikirim.
6. **Export ▾ → Script** (toolbar): membuat `batch-automation - <nama>.js` dari variabel terpilih untuk di-import ke menu **Automation**. Kolomnya `assignment_id` (+ `no_roster` di mode roster), satu kolom per variabel, dan kolom remark untuk variabel yang boleh diberi remark. Isi sel: opsi berupa kode atau label (`1`, `1. Ya`, `Ya`; multi-pilihan dipisah `;`), angka, Ya/Tidak, atau teks; sel kosong = tidak diubah. Variabel dengan opsi dinamis (lookup / dari isian lain) dan daftar teks/lokasi tidak ikut (alasannya tampil di dialog). **Salin data** / **Download data (.tsv)** berisi perubahan yang sudah diisi di sheet beserta baris judul, siap ditempel di sel A1 sheet Automation (nyalakan toggle Remark di Automation bila ada kolom remark). Script Automation menulis nilai langsung lewat `FASIH.patch`, *tanpa* engine kuesioner: isian yang seharusnya ter-skip karena perubahan tidak ikut dibersihkan dan validasi kuesioner tidak dijalankan, jadi gunakan untuk perubahan sederhana dan selalu Dry run dulu.
7. Urutan toolbar kanan: **Dry run**, **Kirim ke FASIH**, Jeda kirim, Jeda muat, **Export ▾** (Script / JSON / CSV), **Import JSON**, lalu **Hapus semua** dan **Ganti kuesioner** (berwarna kekuningan karena mengubah seluruh sheet).

Seperti sheet menu Automation, sheet menampilkan minimal 40 baris dan selalu menyisakan 20 baris kosong untuk assignment_id baru. Butuh lebih banyak? Seperti Google Sheets, di bawah tabel ada **Tambah [20] baris lagi di bagian bawah** (jumlah bisa diubah, Enter juga bisa). Jumlah baris diingat browser dan kembali ke 40 setelah **Hapus semua**.

Salin & tempel juga sama dengan menu Automation: pilih sel/rentang dengan klik, drag, Shift+klik, atau Shift+panah; klik judul kolom untuk satu kolom, nomor baris untuk satu baris, Ctrl+A untuk semua. Klik hanya memilih sel (seperti spreadsheet); untuk mengisi/mengubah sel gunakan klik ganda, Enter, F2, atau langsung mengetik. Ctrl+C/Ctrl+X menyalin rentang sebagai TSV, Ctrl+V menempel dari Excel/Sheets mulai dari sel aktif (satu nilai ke rentang = isi seluruh rentang; baris judul dilewati).
- **Banyak seleksi sekaligus**: Ctrl+klik / Ctrl+drag (juga pada judul kolom & nomor baris) menambah sel atau rentang lain. Saat disalin, hasilnya berisi baris & kolom yang terpilih saja (sel di persilangan yang tidak terpilih dikosongkan), mis. kolom A dan D terpilih → 2 kolom. Satu nilai yang ditempel mengisi semua sel terpilih; Delete mengosongkan semuanya. Esc atau panah biasa kembali ke satu sel.
- **Klik kanan** pada sel: Salin, Potong, Tempel, Kosongkan Baru/Remark. *Tempel* lewat menu perlu izin baca clipboard dari browser; bila ditolak, gunakan Ctrl+V.
- **assignment_id**: ID yang ditempel di baris kosong dimuat dari FASIH; ID berbeda di baris data mengganti assignment-nya (dengan konfirmasi).
- **Baru**: nilai diterjemahkan sesuai tipe field. Pilihan boleh ditempel sebagai kode (`1`), label (`1. Ditemukan`), atau label tanpa kode (`Ditemukan`); checkbox dipisah `;`; Ya/Tidak untuk centang. Nilai yang tidak cocok ditolak dan disebutkan.
- **Remark**: teks remark baru, diketik langsung di dalam sel. Pengirim (author) tidak diisi di sheet: diambil otomatis dari user FASIH yang login lewat `myinfo?surveyPeriodId=…` (sama dengan `FASIH.myInfo` di general_console.js) saat Export JSON, View hasil update, dan Kirim ke FASIH. Kalau myinfo gagal, Kirim ke FASIH menolak baris itu (GAGAL), sedangkan Export JSON tetap jalan dengan peringatan.
- Kolom data/Lama read-only: ikut disalin, tetapi dilewati saat ditempel.
- Menempel blok assignment_id + kolom Baru/Remark sekaligus: assignment dimuat dulu, lalu nilai Baru/Remark diterapkan ke barisnya.

### lib/custom_console.js
Library submit khusus Custom automation, tersedia sebagai `window.FASIH_CUSTOM` di halaman FASIH (juga bisa dipakai dari DevTools Console). Yang dikirim adalah dokumen hasil sheet (data asli + perubahan + remark baru, sudah dihitung engine kuesioner), lewat jalur yang sama dengan `FASIH.submitEdit`: zip `data.json`/`comment.json`/`media.json` → presign → upload → commit `s3/edit` (`sourceFrom: SCM-EDIT`). Kolom `data1`–`data10` tidak diubah.

```js
await FASIH_CUSTOM.submit(item)                          // dry run: { nChanges, changes[], commentChanged, version, ... }
await FASIH_CUSTOM.submit(item, { dryRun: false })       // kirim
await FASIH_CUSTOM.submitBatch(items, { dryRun: false, delayMs: 1500 })
await FASIH_CUSTOM.backup([id1, id2])                    // format backup FASIH / menu Restore
await FASIH_CUSTOM.myInfo(surveyPeriodId)                // user login (username = pengirim remark baru)
// item = hasil Export JSON ({ success, data: { _id, data, comment, submit_version_code, ... } })
//      atau { assignmentId, data, comment?, expectVersion? }
```
Pengaman:
- Kalau `submit_version_code` di server sudah berbeda dari versi saat data dimuat ke sheet, record ditolak (**GAGAL**), supaya perubahan orang lain tidak tertimpa. Muat ulang baris di sheet (Enter di sel assignment_id), lalu ulangi. `{ force: true }` melewati pengaman ini.
- Jawaban & catatan yang sudah sama dengan server tidak dikirim (**LEWATI**), jadi versi record tidak naik.
- Server tidak memvalidasi isi dokumen; validasi berasal dari engine kuesioner di sheet. Uji 1 record dulu dan buka hasilnya di UI FASIH.

Sumber halaman ini ada di `../HTML kuesioner SE2026/sheet-src/`. Setelah mengubahnya, jalankan `node build-sheet.js` di folder itu (sekaligus memperbarui `custom/sheet.html`), lalu Reload extension.

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

## Membuat batch-automation.js baru
Di panel, klik **Download template**. File `batch-automation.js` akan diunduh dari `templates/batch-automation.template.js`.
Template ini kerangka kosong yang siap di-import: kolom `assignment_id`, serta `options`, `remarks`, dan `process` yang masih kosong.
Isi bagian bertanda `TODO` (minimal `id`, `name`, dan field yang diubah di `process`), lalu **Import script**. Penjelasan lengkap setiap bagian ada di bawah.
Template juga bisa dibuat dari salinan salah satu [contoh script](#contoh-script) atau `../batch-automation.js` (kasus OSS). Ganti `id`-nya supaya data sheet tidak tercampur dengan script asal. Bagian yang perlu diubah adalah `FASIH_BATCH.register({...})`:

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

- Kolom: `{ key, title?, type?, required?, unique?, width?, mono?, trim? }`. `key` tidak boleh diawali `_` (dipakai panel untuk status/keterangan). `title` mengganti judul kolom, `width` lebar dalam px, `mono` font monospace, `trim` buang spasi di awal/akhir (default aktif kecuali `text`).
- `type`: `text` (default), `uuid`, `number`, `integer`. Nilai `number`/`integer` sampai ke `process` sudah dalam bentuk Number (sel kosong = `null`).
- Opsi toolbar: `{ key, label, type: 'checkbox'|'number'|'text'|'select', default, choices?, hint? }`. `hint` tampil sebagai tooltip. Key `jeda`, `backup`, `remark` dipakai panel.
- Remark: `{ dataKey, key?, title?, width? }` atau cukup `'dataKey'`. `key` default `remark_<dataKey>`, `title` default `remark <dataKey>`. Butuh `idColumn`. Sebelum proses, panel memastikan semua `dataKey` remark yang terisi ada di template; kalau ada yang salah ketik, proses dihentikan sebelum ada yang dikirim. Isi kolom remark tetap tersimpan walau toggle dimatikan. Untuk field roster (`dataKey#n`) yang barisnya baru diketahui saat proses, `process` mengembalikan `remarkKeys`, mis. `{ nama_usaha: 'nama_usaha#1001' }`, supaya catatan ditulis ke baris itu.
- `idColumn` default ke kolom `uuid` pertama. Isi `null` kalau tidak perlu `FASIH.init()`/backup otomatis.
- Opsional: `before(rows, ctx)` untuk menggantikan `FASIH.init` bawaan, dan `after(results, ctx)`.
- `ctx` = `{ dryRun, options, FASIH, index, total, rowNumber, sleep, remarks }`. `remarks` = remark terisi di baris itu `[{ dataKey, text }]` (kosong kalau toggle Remark mati). `options` sudah berisi `jeda`, `backup`, dan `remark`.
- File dijalankan sebagai badan fungsi async. Artinya `await` boleh dipakai, `const`/`function` di dalamnya tidak bocor ke halaman, dan import ulang tidak akan bentrok.

## Catatan teknis
- `lib/general_console.js`, `sheet.js`, dan `panel.js` berjalan di MAIN world halaman, sama seperti kode yang di-paste ke DevTools Console. Karena itu, kalau `general_console.js` di-paste manual ke Console di tab yang sama, akan muncul *"Identifier 'FASIH' has already been declared"*. Itu tidak perlu, karena `FASIH` sudah tersedia.
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
