# FASIH Batch (Chrome extension)

Ini panel sheet ala Google Sheets untuk update massal assignment FASIH. Extension ini sendiri tidak berisi logika update apa pun. Kolom sheet dan proses per baris diambil dari file **`batch-automation.js`** yang di-import lewat panel. Contoh siap pakai ada di folder [`example - imported script/`](#contoh-script) dan di `../batch-automation.js` (kasus usaha OSS: Tidak Ditemukan → Ditemukan).

## Pasang
1. Buka `chrome://extensions` (atau `edge://extensions`), lalu nyalakan **Developer mode**.
2. Klik **Load unpacked**, lalu pilih folder ini. Kalau versi sebelumnya sudah terpasang, klik ⟳ Reload.
3. Reload tab `https://fasih-sm.bps.go.id` yang sudah login. Tombol hijau **⊞ FASIH Batch** akan muncul di kanan bawah. Panel juga bisa dibuka lewat ikon extension.

## Menu
Header panel berisi judul **FASIH Batch** dan dua menu di sampingnya:
- **Automation**: update massal lewat script `batch-automation.js` (bagian [Pakai](#pakai)).
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
