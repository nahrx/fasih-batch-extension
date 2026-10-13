# FASIH Batch (Chrome extension)

Ini panel sheet ala Google Sheets untuk update massal assignment FASIH. Extension ini sendiri tidak berisi logika update apa pun. Kolom sheet dan proses per baris diambil dari file **`batch-automation.js`** yang di-import lewat panel. Contohnya ada di `../batch-automation.js` (kasus usaha OSS: Tidak Ditemukan → Ditemukan).

## Pasang
1. Buka `chrome://extensions` (atau `edge://extensions`), lalu nyalakan **Developer mode**.
2. Klik **Load unpacked**, lalu pilih folder ini. Kalau versi sebelumnya sudah terpasang, klik ⟳ Reload.
3. Reload tab `https://fasih-sm.bps.go.id` yang sudah login. Tombol hijau **⊞ FASIH Batch** akan muncul di kanan bawah. Panel juga bisa dibuka lewat ikon extension.

## Pakai
1. Klik **Import script**, lalu pilih `batch-automation.js`. Judul, kolom sheet, dan opsi di toolbar langsung mengikuti isi script.
   Script terakhir disimpan dan dimuat ulang otomatis setiap kali halaman dibuka. Kalau file-nya diubah, import ulang.
2. Klik sel **A1**, lalu tekan Ctrl+V dari Excel. Baris judul otomatis dilewati.
   Sel merah artinya tidak valid. Arahkan kursor ke sel itu untuk melihat alasannya.
3. Klik **Dry run**, lalu periksa kolom status, code_identity, dan keterangan.
4. Uji 1 baris LIVE dulu dan buka hasilnya di UI. Setelah itu klik **Jalankan LIVE**.
   Baris yang sudah **OK** tidak dikirim ulang. *Backup sebelum LIVE* mengunduh `fasih-backup-<id>-*.json`, yang bisa dipulihkan dengan `FASIH.restore`.

Data sheet dan pengaturan disimpan per `id` script di localStorage FASIH. Kalau berganti script lalu kembali ke script sebelumnya, datanya masih ada.

## Membuat batch-automation.js baru
Di panel, klik **Download template**. File `batch-automation.js` akan diunduh dari `templates/batch-automation.template.js`.
Template ini langsung bisa dipakai untuk **mengubah satu field per baris**, dengan kolom `assignment_id | data_key | nilai`. Isinya juga mencakup kontrak lengkap dan contoh pola lain: banyak field sekaligus, lewati berdasarkan kondisi, geotag, roster, dan hapus jawaban.
Ubah bagian bertanda `TODO` (minimal `id` dan `name`), lalu **Import script**.
Template juga bisa dibuat dari salinan `../batch-automation.js` (kasus OSS). Bagian yang perlu diubah adalah `FASIH_BATCH.register({...})`:

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
  validateRow: (row) => null,             // atau 'pesan' / { kolom: 'pesan' }
  async process(row, { dryRun, options, FASIH }) {
    const r = await FASIH.update(row.assignment_id, { /* ... */ }, { dryRun, log: false });
    return { code: r.code, ket: `${r.nChanges} perubahan` };   // { skip: true } -> LEWATI, throw -> GAGAL
  },
});
```

- `type`: `text` (default), `uuid`, `number`, `integer`. Nilai `number`/`integer` sampai ke `process` sudah dalam bentuk Number.
- Opsional: `before(rows, ctx)` untuk menggantikan `FASIH.init` bawaan, dan `after(results, ctx)`.
- `ctx` = `{ dryRun, options, FASIH, index, total, rowNumber, sleep }`. `options` sudah berisi `jeda` dan `backup`.
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
| `panel.js` | panel generik, `window.FASIH_BATCH.register`, import, validasi, proses berurutan |
| `bridge.js` / `background.js` | toggle lewat ikon, URL template, cadangan `chrome.userScripts` |
| `templates/batch-automation.template.js` | template yang diunduh lewat tombol **Download template** |
