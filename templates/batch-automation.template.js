/* batch-automation.js — FASIH Batch. Isi bagian TODO, lalu Import script. */

FASIH_BATCH.register({
  id: 'TODO-id-unik',
  name: 'TODO judul',
  description: '',

  columns: [
    { key: 'assignment_id', type: 'uuid', required: true, unique: true },
    // TODO: { key, title?, type?: 'text'|'uuid'|'number'|'integer', required?, unique?, width? }
  ],
  idColumn: 'assignment_id',

  options: [
    // TODO: { key, label, type: 'checkbox'|'number'|'text'|'select', default, choices?, hint? }
  ],

  remarks: [
    // TODO: { dataKey, title? }  — kolom remark, ditulis dengan FASIH.setComment saat toggle Remark aktif
  ],

  validateRow(row) {
    return null;                                   // atau 'pesan' / { kolom: 'pesan' }
  },

  async process(row, { dryRun, options, FASIH }) {
    const res = await FASIH.update(row.assignment_id, {
      // TODO: dataKey: nilai
    }, { dryRun, log: false });
    if (!res.nChanges) return { skip: true, code: res.code, ket: 'tidak ada perubahan' };
    return { code: res.code, ket: `${res.nChanges} perubahan · ${dryRun ? `v${res.version}` : `v${res.version} → v${res.versionAfter}`}` };
  },
});
