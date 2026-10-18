/* ============================================================================
 * Grid ala Google Sheets (tanpa library).
 *   klik / drag / Shift+klik  pilih sel atau rentang; klik nomor baris / judul kolom
 *   Ctrl+V                    tempel dari Excel/Sheets (TSV) mulai dari sel aktif
 *   Ctrl+C / Ctrl+X           salin / potong rentang sebagai TSV
 *   ketik / Enter / F2 / dblklik  edit sel; Enter/Tab simpan, Esc batal
 *   kolom pilihan (choices)   dropdown: ketik untuk mencari / kode, panah + Enter pilih; multiple: Spasi centang, Enter simpan
 *   kolom tanggal (input)     pemilih tanggal / waktu bawaan browser
 *   panah, Ctrl+panah, Tab    navigasi; Delete/Backspace kosongkan rentang; Ctrl+A semua
 * ==========================================================================*/

/* Dimuat di MAIN world halaman — nama global dibuat unik supaya tidak bentrok dengan skrip FASIH */
const FasihSheet = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* TSV dari Excel: sel berisi tab/enter/kutip dibungkus "..." dengan "" sebagai kutip */
  function parseTSV(text) {
    text = String(text).replace(/\r\n?/g, '\n');
    if (text.endsWith('\n')) text = text.slice(0, -1);
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }
  /* pilihan: cocok dengan kode, label, atau label tanpa kode ("1. Ya" -> "Ya") */
  const norm = (x) => String(x ?? '').trim().toLowerCase();
  const noCode = (x) => String(x ?? '').replace(/^\s*[\w.]+[.)]\s+/, '');
  function matchChoice(choices, text) {
    const w = norm(text);
    if (!w) return null;
    return choices.find((o) => norm(o.value) === w) || choices.find((o) => norm(o.label) === w) || choices.find((o) => norm(noCode(o.label)) === w) || null;
  }
  const splitMulti = (s) => String(s ?? '').split(/\s*[;|]\s*/).map((x) => x.trim()).filter(Boolean);
  const toTSV = (rows) => rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join('\t')).join('\n');

  class Sheet {
    /** columns: [{ key, title, width, editable, mono, trim, choices?: [{value,label}], multiple?, input?: 'date'|'datetime-local'|'time'|'month'|'week' }] */
    constructor(container, { columns, minRows = 40, spareRows = 20, cellClass = () => '', cellTitle = () => '', onChange = () => {} }) {
      Object.assign(this, { cols: columns, minRows, spareRows, cellClass, cellTitle, onChange });
      this.rows = []; this.locked = false; this.edit = null; this.drag = false;
      this.a = { r: 0, c: 0 }; this.b = { r: 0, c: 0 };     // a = sel aktif (anchor), b = ujung rentang

      this.el = document.createElement('div');
      this.el.className = 'sheet';
      this.el.innerHTML =
        `<table><colgroup><col style="width:46px">${columns.map((c) => `<col style="width:${c.width}px">`).join('')}</colgroup>` +
        `<thead><tr><th class="corner"></th>${columns.map((c, i) =>
          `<th class="ch" data-c="${i}"><span class="letter">${String.fromCharCode(65 + i)}</span>${esc(c.title)}</th>`).join('')}</tr></thead>` +
        `<tbody></tbody></table>`;
      /* fokus keyboard & clipboard lewat textarea tersembunyi — event paste paling andal di elemen editable */
      this.kb = document.createElement('textarea');
      this.kb.className = 'kb'; this.kb.setAttribute('aria-label', 'grid');
      this.el.appendChild(this.kb);
      container.appendChild(this.el);
      this.tbody = this.el.querySelector('tbody');
      this.bind();
      this.setRows([]);
    }

    /* ---------------- data ---------------- */
    blank() { return Object.fromEntries(this.cols.map((c) => [c.key, ''])); }
    isEmpty(row) { return this.cols.every((c) => !c.editable || !String(row[c.key] ?? '').trim()); }
    lastFilled() { for (let r = this.rows.length - 1; r >= 0; r--) if (!this.isEmpty(this.rows[r])) return r; return -1; }
    pad() {
      const want = Math.max(this.minRows, this.lastFilled() + 1 + this.spareRows);
      while (this.rows.length < want) this.rows.push(this.blank());
      if (this.rows.length > want) this.rows.length = want;
      const clamp = (p) => ({ r: Math.min(p.r, want - 1), c: p.c });
      this.a = clamp(this.a); this.b = clamp(this.b);
    }
    setRows(rows) { this.rows = rows.map((r) => ({ ...this.blank(), ...r })); this.pad(); this.render(); }
    /** baris terisi: [{ r, row }] */
    filled() { return this.rows.map((row, r) => ({ r, row })).filter((x) => !this.isEmpty(x.row)); }
    setCell(r, c, v, changed) {
      const col = this.cols[c];
      if (!col || !col.editable) return;
      while (this.rows.length <= r) this.rows.push(this.blank());
      let s = String(v ?? '').replace(/\r/g, '');
      if (col.trim) s = s.trim();
      if (this.rows[r][col.key] === s) return;
      this.rows[r][col.key] = s;
      changed.push(r);
    }
    commit(changed) {
      if (!changed.length) return;
      this.onChange([...new Set(changed)]);
      this.pad(); this.render();
    }

    /* ---------------- tampilan ---------------- */
    rowHTML(r) {
      const row = this.rows[r];
      return `<tr><th class="rn" data-r="${r}">${r + 1}</th>${this.cols.map((c, i) => {
        const cls = [c.editable ? '' : 'ro', c.mono ? 'mono' : '', c.editable && c.choices ? 'dd' : '', this.cellClass(row, c.key, r)].filter(Boolean).join(' ');
        const v = row[c.key], tip = this.cellTitle(row, c.key, r) || v;
        return `<td data-r="${r}" data-c="${i}" class="${cls}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(v)}</td>`;
      }).join('')}</tr>`;
    }
    render() {
      if (this.edit) this.cancelEdit();
      if (this.pick) this.closePick();
      const h = [];
      for (let r = 0; r < this.rows.length; r++) h.push(this.rowHTML(r));
      this.tbody.innerHTML = h.join('');
      this.paintSel();
    }
    renderRow(r) {
      const tr = this.tbody.rows[r];
      if (!tr || (this.edit && this.edit.r === r)) return;
      tr.outerHTML = this.rowHTML(r);
      this.paintSel();
    }
    td(r, c) { const tr = this.tbody.rows[r]; return tr ? tr.cells[c + 1] : null; }
    range() {
      return { r0: Math.min(this.a.r, this.b.r), r1: Math.max(this.a.r, this.b.r),
               c0: Math.min(this.a.c, this.b.c), c1: Math.max(this.a.c, this.b.c) };
    }
    paintSel() {
      this.el.querySelectorAll('.sel,.active,.hl').forEach((e) => e.classList.remove('sel', 'active', 'hl'));
      const { r0, r1, c0, c1 } = this.range();
      for (let r = r0; r <= r1; r++) {
        const tr = this.tbody.rows[r];
        if (!tr) continue;
        tr.cells[0].classList.add('hl');
        for (let c = c0; c <= c1; c++) tr.cells[c + 1].classList.add('sel');
      }
      for (let c = c0; c <= c1; c++) this.el.querySelector(`th.ch[data-c="${c}"]`).classList.add('hl');
      const t = this.td(this.a.r, this.a.c);
      if (t) t.classList.add('active');
    }
    select(r, c, extend = false) {
      r = Math.max(0, Math.min(r, this.rows.length - 1));
      c = Math.max(0, Math.min(c, this.cols.length - 1));
      if (extend) this.b = { r, c }; else { this.a = { r, c }; this.b = { r, c }; }
      this.paintSel();
      const t = this.td(r, c);
      if (t) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    focus() { this.kb.focus({ preventScroll: true }); }

    /* ---------------- edit ---------------- */
    startEdit(initial) {
      const { r, c } = this.a, col = this.cols[c], t = this.td(r, c);
      if (this.locked || !col.editable || !t) return;
      if (col.choices) return this.openPick(initial);
      const inp = document.createElement('input');
      if (col.input) { inp.type = col.input; if (col.input === 'datetime-local') inp.step = '60'; initial = null; } // pemilih tanggal / waktu
      inp.value = initial != null ? initial : this.rows[r][col.key];
      t.textContent = ''; t.classList.add('editing'); t.appendChild(inp);
      this.edit = { r, c, inp, quick: initial != null };
      inp.focus();
      if (initial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const mv = { Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key]
          || (this.edit && this.edit.quick && { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]);
        if (e.key === 'Enter' && e.shiftKey) mv[0] = -1;
        if (mv) { e.preventDefault(); this.commitEdit(); this.select(r + mv[0], c + mv[1]); this.focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); this.focus(); }
      });
      inp.addEventListener('blur', () => { if (this.edit && this.edit.inp === inp) this.commitEdit(); });
      ['keyup', 'keypress', 'paste', 'copy', 'cut'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation()));
    }
    commitEdit() {
      const e = this.edit; if (!e) return;
      this.edit = null;
      const changed = [];
      this.setCell(e.r, e.c, e.inp.value, changed);
      if (changed.length) this.commit(changed); else this.render();
    }
    cancelEdit() {
      const e = this.edit; if (!e) return;
      this.edit = null;
      const t = this.td(e.r, e.c);
      if (t) { t.classList.remove('editing'); t.textContent = this.rows[e.r][this.cols[e.c].key]; }
    }

    /* ---------------- dropdown pilihan ---------------- */
    openPick(initial) {
      const { r, c } = this.a, col = this.cols[c], t = this.td(r, c);
      if (!t) return;
      this.closePick();
      const multi = !!col.multiple;
      const cur = this.rows[r][col.key];
      const picked = new Set((multi ? splitMulti(cur) : [cur]).map((x) => matchChoice(col.choices, x)).filter(Boolean).map((o) => o.value));
      const pop = document.createElement('div');
      pop.className = 'dd-pop';
      pop.innerHTML = `<input class="dd-q" placeholder="Cari kode / label…"><div class="dd-list"></div>`
        + `<div class="dd-foot">${multi ? '<button data-dd="ok">Simpan</button>' : ''}<button data-dd="clear">Kosongkan</button><span>${multi ? 'Spasi: centang · Enter: simpan' : 'Enter: pilih'} · Esc: batal</span></div>`;
      this.el.appendChild(pop);
      const rect = t.getBoundingClientRect();
      pop.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 300))}px`;
      pop.style.minWidth = `${Math.max(220, rect.width)}px`;
      const below = window.innerHeight - rect.bottom;
      if (below < 260 && rect.top > below) pop.style.bottom = `${window.innerHeight - rect.top + 2}px`;
      else pop.style.top = `${rect.bottom + 2}px`;
      const q = pop.querySelector('.dd-q'), list = pop.querySelector('.dd-list');
      let items = [], hi = 0;
      const draw = () => {
        const w = norm(q.value);
        items = col.choices.filter((o) => !w || norm(o.value).startsWith(w) || norm(o.label).includes(w));
        items.sort((a, b) => (norm(b.value) === w) - (norm(a.value) === w));   // kode persis di urutan pertama
        hi = Math.min(hi, Math.max(0, items.length - 1));
        list.innerHTML = items.map((o, i) => `<div class="dd-it${i === hi ? ' hi' : ''}${picked.has(o.value) ? ' on' : ''}" data-i="${i}">`
          + `${multi ? `<span class="dd-box">${picked.has(o.value) ? '☑' : '☐'}</span>` : ''}${esc(o.label)}</div>`).join('') || '<div class="dd-none">Tidak ada pilihan yang cocok</div>';
        const h = list.querySelector('.hi'); if (h) h.scrollIntoView({ block: 'nearest' });
      };
      const save = (val) => { this.closePick(); const changed = []; this.setCell(r, c, val, changed); this.commit(changed); this.select(r + 1, c); this.focus(); };
      const saveMulti = () => save(col.choices.filter((o) => picked.has(o.value)).map((o) => o.label).join('; '));
      const choose = (i) => {
        const o = items[i]; if (!o) return;
        if (!multi) return save(o.label);
        if (picked.has(o.value)) picked.delete(o.value); else picked.add(o.value);
        hi = i; draw();
      };
      q.addEventListener('input', () => { hi = 0; draw(); });
      q.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, items.length - 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); draw(); }
        else if (e.key === ' ' && multi) { e.preventDefault(); choose(hi); }
        else if (e.key === 'Enter') { e.preventDefault(); if (multi) saveMulti(); else choose(hi); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          if (multi) saveMulti();
          else { this.closePick(); this.select(r, c + (e.shiftKey ? -1 : 1)); this.focus(); }
        } else if (e.key === 'Escape') { e.preventDefault(); this.closePick(); this.focus(); }
      });
      ['keyup', 'keypress', 'paste', 'copy', 'cut'].forEach((ev) => q.addEventListener(ev, (e) => e.stopPropagation()));
      pop.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target !== q) e.preventDefault(); });
      pop.addEventListener('click', (e) => {
        const it = e.target.closest('.dd-it'); if (it) return choose(+it.dataset.i);
        const b = e.target.closest('[data-dd]'); if (!b) return;
        if (b.dataset.dd === 'ok') saveMulti(); else save('');
      });
      this.pick = { r, c, pop };
      if (initial != null) q.value = initial;
      draw();
      q.focus();
    }
    closePick() { if (this.pick) { this.pick.pop.remove(); this.pick = null; } }

    /* ---------------- clipboard ---------------- */
    rangeTSV() {
      const { r0, r1, c0, c1 } = this.range(), out = [];
      for (let r = r0; r <= r1; r++) out.push(this.cols.slice(c0, c1 + 1).map((c) => this.rows[r][c.key]));
      return toTSV(out);
    }
    clearRange() {
      if (this.locked) return;
      const { r0, r1, c0, c1 } = this.range(), changed = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.setCell(r, c, '', changed);
      this.commit(changed);
    }
    paste(text) {
      if (this.locked) return;
      let data = parseTSV(text);
      if (!data.length || (data.length === 1 && data[0].length === 1 && data[0][0] === '')) return;
      const { r0, r1, c0, c1 } = this.range();
      /* baris judul (assignment_id, match_id, ...) dilewati */
      const head = data[0].map((s) => s.trim().toLowerCase());
      if (head.some((s, j) => { const col = this.cols[c0 + j]; return col && s && (s === col.key || s === col.title.toLowerCase()); }))
        data = data.slice(1);
      if (!data.length) return;
      const changed = [];
      if (data.length === 1 && data[0].length === 1 && (r1 > r0 || c1 > c0)) {      // satu nilai -> isi rentang
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.setCell(r, c, data[0][0], changed);
      } else {
        data.forEach((cells, i) => cells.forEach((v, j) => { if (c0 + j < this.cols.length) this.setCell(r0 + i, c0 + j, v, changed); }));
        this.a = { r: r0, c: c0 };
        this.b = { r: r0 + data.length - 1, c: Math.min(this.cols.length - 1, c0 + Math.max(...data.map((x) => x.length)) - 1) };
      }
      this.commit(changed);
      if (!changed.length) this.paintSel();
    }

    destroy() {
      this.closePick();
      window.removeEventListener('mouseup', this.onUp);
      this.el.remove();
    }

    /* ---------------- event ---------------- */
    bind() {
      const cellOf = (t) => { const td = t.closest && t.closest('td[data-r]'); return td ? { r: +td.dataset.r, c: +td.dataset.c } : null; };

      this.el.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || (this.edit && e.target === this.edit.inp)) return;
        if (this.pick && !this.pick.pop.contains(e.target)) this.closePick();   // klik di luar dropdown = batal
        if (this.edit) this.commitEdit();
        const rn = e.target.closest('th.rn'), ch = e.target.closest('th.ch'), corner = e.target.closest('th.corner');
        const p = cellOf(e.target);
        if (!rn && !ch && !corner && !p) return;
        e.preventDefault();
        const last = this.cols.length - 1, lastR = this.rows.length - 1;
        if (corner) { this.a = { r: 0, c: 0 }; this.b = { r: lastR, c: last }; this.paintSel(); }
        else if (rn) {
          const r = +rn.dataset.r;
          if (e.shiftKey) { this.b = { r, c: last }; this.a = { r: this.a.r, c: 0 }; } else { this.a = { r, c: 0 }; this.b = { r, c: last }; }
          this.paintSel(); this.drag = 'row';
        } else if (ch) {
          const c = +ch.dataset.c;
          if (e.shiftKey) { this.b = { r: lastR, c }; this.a = { r: 0, c: this.a.c }; } else { this.a = { r: 0, c }; this.b = { r: lastR, c }; }
          this.paintSel();
        } else { this.select(p.r, p.c, e.shiftKey); this.drag = 'cell'; }
        this.focus();
      });
      this.el.addEventListener('mouseover', (e) => {
        if (!this.drag) return;
        if (this.drag === 'row') { const rn = e.target.closest('th.rn,td[data-r]'); if (rn) { this.b = { r: +rn.dataset.r, c: this.cols.length - 1 }; this.paintSel(); } return; }
        const p = cellOf(e.target);
        if (p && (p.r !== this.b.r || p.c !== this.b.c)) { this.b = p; this.paintSel(); }
      });
      this.onUp = () => { this.drag = false; };
      window.addEventListener('mouseup', this.onUp);
      this.el.addEventListener('dblclick', (e) => { const p = cellOf(e.target); if (p) { this.select(p.r, p.c); this.startEdit(null); } });

      this.kb.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const k = e.key, mod = e.ctrlKey || e.metaKey;
        const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        if (mv) {
          e.preventDefault();
          const base = e.shiftKey ? this.b : this.a;
          let r = base.r + mv[0], c = base.c + mv[1];
          if (mod && mv[0]) r = mv[0] > 0 ? Math.max(this.lastFilled(), 0) : 0;
          if (mod && mv[1]) c = mv[1] > 0 ? this.cols.length - 1 : 0;
          return this.select(r, c, e.shiftKey);
        }
        if (k === 'Tab') { e.preventDefault(); return this.select(this.a.r, this.a.c + (e.shiftKey ? -1 : 1)); }
        if (k === 'Enter' || k === 'F2') { e.preventDefault(); return this.startEdit(null); }
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return this.clearRange(); }
        if (mod && k.toLowerCase() === 'a') { e.preventDefault(); this.a = { r: 0, c: 0 }; this.b = { r: this.rows.length - 1, c: this.cols.length - 1 }; return this.paintSel(); }
        if (mod && (k.toLowerCase() === 'c' || k.toLowerCase() === 'x')) {     // biarkan copy bawaan menyalin isi textarea
          this.kb.value = this.rangeTSV(); this.kb.select();
          if (k.toLowerCase() === 'x') setTimeout(() => this.clearRange(), 0);
          return;
        }
        if (mod && k.toLowerCase() === 'v') { this.kb.value = ''; return; }     // ditangani event paste
        if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); return this.startEdit(k); }
      });
      ['keyup', 'keypress'].forEach((ev) => this.kb.addEventListener(ev, (e) => e.stopPropagation()));
      this.kb.addEventListener('copy', (e) => { e.stopPropagation(); e.clipboardData.setData('text/plain', this.rangeTSV()); e.preventDefault(); });
      this.kb.addEventListener('cut', (e) => e.stopPropagation());
      this.kb.addEventListener('paste', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.paste(e.clipboardData.getData('text/plain'));
        this.kb.value = '';
      });
    }
  }

  Sheet.matchChoice = matchChoice;   // dipakai panel.js untuk validasi kolom pilihan
  Sheet.splitMulti = splitMulti;
  return Sheet;
})();
