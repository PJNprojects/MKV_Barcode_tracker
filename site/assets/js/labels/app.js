/* Label printing tool — UI controller. */
(function () {
  'use strict';

  var HerdIQ = window.HerdIQ;
  var Serial = HerdIQ.Serial;
  var Renderer = HerdIQ.LabelRenderer;
  var Export = HerdIQ.Export;

  var STORAGE_KEY = 'herdiq.labelTool.v2';
  var MAX_LABELS = 2000;

  var form = document.getElementById('settings');
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    rangeSummary: $('range-summary'),
    preview: $('preview'),
    previewMeta: $('preview-meta'),
    stats: $('stats'),
    warnings: $('warnings'),
    error: $('error'),
    batchRows: $('batch-rows'),
    allLabels: $('all-labels'),
    allCount: $('all-count'),
    reset: $('reset-btn')
  };

  var defaults = snapshotForm();
  var state = null; // { settings, serials, bitmaps, batches }

  // ── Settings ──────────────────────────────────────────────────────────────
  function snapshotForm() {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function applyToForm(values) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || !(el.name in values)) return;
      if (el.type === 'checkbox') el.checked = !!values[el.name];
      else el.value = values[el.name];
    });
  }

  function save(values) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch (e) { /* private mode etc. */ }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyToForm(JSON.parse(raw));
    } catch (e) { /* ignore corrupt or blocked storage */ }
  }

  function int(v, name) {
    var n = Number(v);
    if (!Number.isInteger(n)) throw new Error(name + ' must be a whole number.');
    return n;
  }
  function num(v, name) {
    var n = Number(v);
    if (v === '' || !isFinite(n)) throw new Error(name + ' must be a number.');
    return n;
  }

  function readSettings() {
    var v = snapshotForm();
    var s = {
      prefix: Serial.normalize(v.prefix),
      digits: int(v.digits, 'Digits'),
      start: int(v.start, 'First number'),
      end: int(v.end, 'Last number'),
      batchSize: int(v.batchSize, 'Labels per batch'),
      render: {
        widthMm: num(v.widthMm, 'Width'),
        heightMm: num(v.heightMm, 'Height'),
        showHeader: !!v.showHeader,
        headerText: v.headerText,
        moduleDots: v.moduleDots || 'auto',
        barcodeHeightMm: v.barcodeHeightMm === '' ? 'auto' : num(v.barcodeHeightMm, 'Barcode height'),
        offsetXmm: v.offsetXmm === '' ? 0 : num(v.offsetXmm, 'Shift right'),
        offsetYmm: v.offsetYmm === '' ? 0 : num(v.offsetYmm, 'Shift down'),
        rotate180: !!v.rotate180
      },
      registry: {
        manufacturedOn: v.manufacturedOn,
        batchCode: String(v.batchCode || '').trim(),
        animalPattern: String(v.animalPattern || '').trim() || 'Animal {n}',
        status: v.status,
        testData: !!v.testData
      }
    };
    if (!s.prefix) throw new Error('Prefix is required.');
    if (s.digits < 1 || s.digits > 8) throw new Error('Digits must be between 1 and 8.');
    if (s.start < 0 || s.end < 0) throw new Error('Numbers cannot be negative.');
    if (s.end < s.start) throw new Error('Last number must be greater than or equal to the first number.');
    if (s.end - s.start + 1 > MAX_LABELS) throw new Error('At most ' + MAX_LABELS + ' labels at a time.');
    if (s.batchSize < 1) throw new Error('Labels per batch must be at least 1.');
    return { values: v, settings: s };
  }

  // ── Generation ────────────────────────────────────────────────────────────
  function buildSerials(s) {
    var out = [];
    for (var n = s.start; n <= s.end; n++) out.push(Serial.build(s.prefix, n, s.digits));
    return out;
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push({ index: out.length, start: i, items: list.slice(i, i + size) });
    return out;
  }

  function setError(msg) {
    els.error.textContent = msg || '';
    els.error.hidden = !msg;
  }

  function regenerate() {
    var parsed;
    try {
      parsed = readSettings();
    } catch (err) {
      setError(err.message);
      return;
    }
    var s = parsed.settings;
    try {
      var serials = buildSerials(s);
      var bitmaps = serials.map(function (serial) { return Renderer.render(serial, s.render); });
      state = { settings: s, serials: serials, bitmaps: bitmaps, batches: chunk(serials, s.batchSize) };
      save(parsed.values);
      setError('');
      renderOutput();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Output UI ─────────────────────────────────────────────────────────────
  function li(label, value) {
    var el = document.createElement('li');
    var a = document.createElement('span');
    a.textContent = label;
    var b = document.createElement('strong');
    b.textContent = value;
    el.append(a, b);
    return el;
  }

  function renderOutput() {
    var s = state.settings;
    var first = state.bitmaps[0];
    var info = first.info;
    var n = state.serials.length;

    els.rangeSummary.textContent = state.serials[0] + ' → ' + state.serials[n - 1] + '  =  ' + n + ' label' + (n === 1 ? '' : 's');

    Renderer.toCanvas(first, 2, els.preview);
    els.previewMeta.textContent = s.render.widthMm + ' × ' + s.render.heightMm + ' mm · ' + first.width + ' × ' + first.height + ' dots @ 203 dpi';

    els.stats.replaceChildren(
      li('Labels', String(n)),
      li('Batches of ' + s.batchSize, String(state.batches.length)),
      li('Bar width', info.moduleDots + ' dot' + (info.moduleDots > 1 ? 's' : '') + ' (' + info.moduleMm.toFixed(3) + ' mm)'),
      li('Barcode size', info.barcodeWidthMm.toFixed(1) + ' × ' + info.barcodeHeightMm.toFixed(1) + ' mm')
    );

    els.warnings.replaceChildren();
    info.warnings.forEach(function (w) {
      var p = document.createElement('p');
      p.textContent = w;
      els.warnings.appendChild(p);
    });
    els.warnings.hidden = !info.warnings.length;

    // Batch table
    var rows = document.createDocumentFragment();
    state.batches.forEach(function (b) {
      var tr = document.createElement('tr');
      var cells = [
        String(b.index + 1),
        b.items[0] + ' → ' + b.items[b.items.length - 1],
        String(b.items.length)
      ];
      cells.forEach(function (c, i) {
        var td = document.createElement('td');
        td.textContent = c;
        if (i === 1) td.className = 'mono';
        tr.appendChild(td);
      });
      var actions = document.createElement('td');
      actions.className = 'lt__row-actions';
      actions.append(
        button('PDF', 'batch-pdf', b.index, 'btn--small btn--primary'),
        button('PNGs', 'batch-png', b.index, 'btn--small btn--ghost')
      );
      tr.appendChild(actions);
      rows.appendChild(tr);
    });
    els.batchRows.replaceChildren(rows);

    // Thumbnails
    els.allCount.textContent = '(' + n + ')';
    var grid = document.createDocumentFragment();
    state.bitmaps.forEach(function (bm, i) {
      var fig = document.createElement('figure');
      fig.className = 'lt__thumb';
      var c = Renderer.toCanvas(bm, 1);
      c.setAttribute('aria-label', 'Label ' + state.serials[i]);
      var cap = document.createElement('figcaption');
      cap.textContent = (i + 1) + ' · batch ' + (Math.floor(i / s.batchSize) + 1);
      fig.append(c, cap);
      grid.appendChild(fig);
    });
    els.allLabels.replaceChildren(grid);
  }

  function button(text, action, batch, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + cls;
    b.textContent = text;
    b.dataset.action = action;
    b.dataset.batch = String(batch);
    return b;
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  function rangeName(items) {
    return items[0] + (items.length > 1 ? '-' + items[items.length - 1] : '');
  }

  function pdfForBatch(b) {
    var r = state.settings.render;
    // Vector pages: crisp text, bars snapped to the printer's dot grid.
    var pages = b.items.map(function (serial) { return Renderer.renderVector(serial, r); });
    return Export.buildPdf(pages, {
      widthMm: r.widthMm,
      heightMm: r.heightMm,
      title: 'HerdIQ labels ' + rangeName(b.items)
    });
  }

  function batchFileName(b, ext) {
    var nn = String(b.index + 1).padStart(2, '0');
    return 'batch' + nn + '_' + rangeName(b.items) + '.' + ext;
  }

  async function pngFiles(from, count, folder) {
    var dpm = state.bitmaps[0].width / state.settings.render.widthMm;
    var files = [];
    for (var i = from; i < from + count; i++) {
      var canvas = Renderer.toCanvas(state.bitmaps[i], 1);
      files.push({ name: (folder ? folder + '/' : '') + state.serials[i] + '.png', data: await Export.buildPng(canvas, dpm) });
    }
    return files;
  }

  function registryJson() {
    var s = state.settings;
    var reg = s.registry;
    var devices = state.serials.map(function (serial, i) {
      var p = Serial.parse(serial);
      var n = i + 1;
      return {
        serial: serial,
        product: p && p.product ? p.product : '',
        sensorVersion: p ? p.sensorVersion : null,
        manufacturedOn: reg.manufacturedOn || null,
        batch: reg.batchCode,
        status: reg.status,
        firmware: null,
        animal: reg.testData
          ? {
              name: reg.animalPattern.replace(/\{n\}/g, String(n)),
              tagId: 'HIQ-BUF-' + String(n).padStart(3, '0'),
              species: 'Buffalo',
              breed: 'Murrah',
              sex: 'Female',
              ageYears: 3 + (i % 6),
              farm: 'Pilot farm (test)'
            }
          : null,
        notes: reg.testData ? 'Placeholder animal details for testing. Replace when the band is fitted.' : ''
      };
    });
    var doc = {
      schemaVersion: 1,
      environment: reg.testData ? 'test' : 'production',
      updatedAt: new Date().toISOString().slice(0, 10),
      devices: devices
    };
    return JSON.stringify(doc, null, 2) + '\n';
  }

  var enc = new TextEncoder();

  var ACTIONS = {
    'zip-batches': async function () {
      var files = [];
      for (var i = 0; i < state.batches.length; i++) {
        var b = state.batches[i];
        files.push({ name: batchFileName(b, 'pdf'), data: new Uint8Array(await (await pdfForBatch(b)).arrayBuffer()) });
      }
      Export.download(Export.buildZip(files), 'HerdIQ_labels_' + rangeName(state.serials) + '_batch-pdfs.zip');
    },
    'pdf-all': async function () {
      var all = { index: 0, start: 0, items: state.serials };
      Export.download(await pdfForBatch(all), 'HerdIQ_labels_' + rangeName(state.serials) + '_all.pdf');
    },
    'png-all': async function () {
      var files = [];
      for (var i = 0; i < state.batches.length; i++) {
        var b = state.batches[i];
        files = files.concat(await pngFiles(b.start, b.items.length, 'batch' + String(b.index + 1).padStart(2, '0')));
      }
      Export.download(Export.buildZip(files), 'HerdIQ_labels_' + rangeName(state.serials) + '_png.zip');
    },
    csv: async function () {
      var csv = 'Serial\r\n' + state.serials.join('\r\n') + '\r\n';
      Export.download(new Blob([csv], { type: 'text/csv' }), 'HerdIQ_serials_' + rangeName(state.serials) + '.csv');
    },
    registry: async function () {
      Export.download(new Blob([registryJson()], { type: 'application/json' }), 'devices.json');
    },
    'batch-pdf': async function (batch) {
      var b = state.batches[batch];
      Export.download(await pdfForBatch(b), 'HerdIQ_' + batchFileName(b, 'pdf'));
    },
    'batch-png': async function (batch) {
      var b = state.batches[batch];
      var files = await pngFiles(b.start, b.items.length, '');
      Export.download(Export.buildZip(files), 'HerdIQ_' + batchFileName(b, 'zip'));
    }
  };

  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn || !state) return;
    var fn = ACTIONS[btn.dataset.action];
    if (!fn) return;
    var all = document.querySelectorAll('button[data-action]');
    all.forEach(function (b) { b.disabled = true; });
    var label = btn.textContent;
    btn.textContent = 'Preparing…';
    try {
      await fn(Number(btn.dataset.batch));
    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      btn.textContent = label;
      all.forEach(function (b) { b.disabled = false; });
    }
  });

  // ── Wiring ────────────────────────────────────────────────────────────────
  var timer = null;
  form.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(regenerate, 250);
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  els.reset.addEventListener('click', function () {
    applyToForm(defaults);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    regenerate();
  });

  // Expose for automated generation/testing (headless browser).
  HerdIQ.LabelTool = Object.freeze({
    regenerate: regenerate,
    getState: function () { return state; },
    exportBatchPdf: function (i) { return pdfForBatch(state.batches[i]); },
    exportAllPdf: function () { return pdfForBatch({ index: 0, start: 0, items: state.serials }); },
    exportPngs: function () { return pngFiles(0, state.serials.length, ''); },
    registryJson: registryJson
  });

  restore();
  regenerate();
})();
