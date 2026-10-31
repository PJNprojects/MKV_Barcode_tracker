/* Label printing tool — UI controller. */
(function () {
  'use strict';

  var HerdIQ = window.HerdIQ;
  var Serial = HerdIQ.Serial;
  var Fonts = HerdIQ.LabelFonts;
  var T = HerdIQ.LabelTemplates;
  var L = HerdIQ.LabelLayout;
  var Export = HerdIQ.Export;

  var MAX_LABELS = 500;
  var MAX_THUMBS = 60;
  var LOGO_MAX_PX = 600;
  var FONT_ACCEPT = '.ttf,.otf,.woff,font/ttf,font/otf,font/woff,application/font-woff,application/x-font-ttf,application/x-font-otf';

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    lp: $('lp'),
    tplSelect: $('tpl-select'), tplHint: $('tpl-hint'), customize: $('customize-btn'),
    from: $('from'), to: $('to'), rangeSummary: $('range-summary'), rangeError: $('range-error'),
    editor: $('editor'), editorTitle: $('editor-title'), editorNote: $('editor-note'), fields: $('editor-fields'),
    dirty: $('dirty-badge'), save: $('save-btn'), saveAs: $('save-as-btn'), revert: $('revert-btn'),
    saveAsForm: $('save-as-form'), saveAsName: $('save-as-name'), saveAsCancel: $('save-as-cancel'),
    exportBtn: $('export-btn'), importBtn: $('import-btn'), importFile: $('import-file'), del: $('delete-btn'),
    editorError: $('editor-error'),
    calDx: $('cal-dx'), calDxOut: $('cal-dx-out'), calDy: $('cal-dy'), calDyOut: $('cal-dy-out'),
    calRot: $('cal-rot'), calTest: $('cal-test-btn'), calReset: $('cal-reset-btn'),
    canvas: $('preview-canvas'), dots: $('dots-toggle'), meta: $('preview-meta'),
    warnings: $('warnings'), layoutError: $('layout-error'),
    allLabels: $('all-labels'), allCount: $('all-count'), thumbs: $('thumbs'),
    pdf: $('pdf-btn'), png: $('png-btn'), csv: $('csv-btn'), registry: $('registry-btn')
  };

  var state = {
    shared: [],
    custom: T.loadCustom(),
    prefs: T.loadPrefs(),
    current: null,   // selected template as saved
    working: null,   // the copy being edited / used for output
    dirty: false,
    logoImage: null,
    logoSrc: '',
    range: null,     // { serials, ... } or null when invalid
    lastLayout: null
  };

  // ── Small helpers ─────────────────────────────────────────────────────────
  function show(el, on) { el.hidden = !on; }
  function setError(el, msg) { el.textContent = msg || ''; show(el, !!msg); }
  function fmtMm(v) { return (Math.round(v * 100) / 100).toString(); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template'; }

  function allTemplates() {
    return T.BUILT_IN.concat(state.shared, state.custom);
  }
  function findTemplate(id) {
    return allTemplates().filter(function (t) { return t.id === id; })[0] || null;
  }
  function isLocked(t) { return !!(t && (t.builtIn || t.shared)); }

  function savePrefs() { T.savePrefs(state.prefs); }

  // ── Template list ─────────────────────────────────────────────────────────
  function renderTemplateOptions() {
    var groups = [
      ['Built-in', T.BUILT_IN],
      ['Shared (website)', state.shared],
      ['My templates (this device)', state.custom]
    ];
    els.tplSelect.replaceChildren();
    groups.forEach(function (g) {
      if (!g[1].length) return;
      var og = document.createElement('optgroup');
      og.label = g[0];
      g[1].forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        og.appendChild(o);
      });
      els.tplSelect.appendChild(og);
    });
    if (state.current) els.tplSelect.value = state.current.id;
  }

  function selectTemplate(id, opts) {
    var t = findTemplate(id) || T.BUILT_IN[0];
    state.current = t;
    state.working = T.normalize(T.clone(t));
    state.working.id = t.id;
    state.working.name = t.name;
    setDirty(false);
    state.prefs.templateId = t.id;
    savePrefs();
    els.tplSelect.value = t.id;
    els.tplHint.textContent = describeTemplate(t);
    refreshEditorChrome();
    fillFields();
    syncLogo();
    syncFonts();
    if (!opts || !opts.silent) scheduleRender();
  }

  function describeTemplate(t) {
    var c = t.code.type;
    var code = c === 'barcode' ? 'barcode' : c === 'qr' ? 'QR code' : c === 'both' ? 'barcode + QR code' : 'no code';
    var parts = [];
    if (t.title.show && t.title.text) {
      var fd = Fonts.describe(t.title.font);
      parts.push('"' + t.title.text + '" title' + (fd && t.title.font !== 'sans' ? ' in ' + fd.label : ''));
    }
    if (t.logo.show && t.logo.image) parts.push('logo');
    parts.push(code);
    if (t.serial.show) parts.push('serial number');
    return '50 × 30 mm · ' + parts.join(' · ');
  }

  function setDirty(d) {
    state.dirty = d;
    show(els.dirty, d);
    els.save.disabled = !d || isLocked(state.current);
    els.revert.disabled = !d;
  }

  function refreshEditorChrome() {
    var locked = isLocked(state.current);
    els.editorTitle.textContent = 'Customize · ' + state.current.name;
    els.editorNote.textContent = locked
      ? (state.current.builtIn ? 'Built-in' : 'Shared') + ' templates stay as they are. Change anything below, then use “Save as new template” to keep it.'
      : 'Saved on this device only. Use Export to copy it to another phone or computer.';
    show(els.del, !locked);
    els.save.hidden = locked;
    setDirty(state.dirty);
  }

  // ── Editor fields (declarative) ───────────────────────────────────────────
  var ALIGN = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];

  var SPEC = [
    { legend: 'Title', fields: [
      { path: 'title.show', type: 'toggle', label: 'Show title' },
      { path: 'title.text', type: 'text', label: 'Text', when: 'title.show' },
      { path: 'title.font', type: 'font', label: 'Font', when: 'title.show' },
      { path: 'title.bold', type: 'toggle', label: 'Bold', when: 'title.show' },
      { path: 'title.sizeMm', type: 'range', label: 'Text size', step: 0.25, unit: 'mm', when: 'title.show' },
      { path: 'title.spacing', type: 'range', label: 'Letter spacing', step: 1, unit: '%', when: 'title.show' },
      { path: 'title.align', type: 'select', label: 'Position', options: ALIGN, when: 'title.show|logo.show' },
      { path: 'title.dxMm', type: 'range', label: 'Move left ↔ right', step: 0.25, unit: 'mm', min: -15, max: 15, when: 'title.show|logo.show' },
      { path: 'title.dyMm', type: 'range', label: 'Move up ↕ down', step: 0.25, unit: 'mm', min: -8, max: 8, when: 'title.show|logo.show' }
    ] },
    { legend: 'Logo', fields: [
      { path: 'logo.show', type: 'toggle', label: 'Show logo' },
      { path: 'logo.image', type: 'image', label: 'Logo image', when: 'logo.show' },
      { path: 'logo.heightMm', type: 'range', label: 'Logo height', step: 0.25, unit: 'mm', when: 'logo.show' },
      { path: 'logo.position', type: 'select', label: 'Side of the title', options: [['left', 'Left of title'], ['right', 'Right of title']], when: 'logo.show' },
      { path: 'logo.gapMm', type: 'range', label: 'Gap to title', step: 0.25, unit: 'mm', when: 'logo.show' },
      { path: 'logo.threshold', type: 'range', label: 'Darkness cut-off', step: 1, unit: '%', when: 'logo.show',
        help: 'Thermal printers only print black or white. Raise this if parts of the logo disappear; lower it if it prints as a blob.' }
    ] },
    { legend: 'Barcode / QR code', fields: [
      { path: 'code.type', type: 'select', label: 'Show', options: [['barcode', 'Barcode'], ['qr', 'QR code'], ['both', 'Barcode + QR code'], ['none', 'Nothing']] },
      { path: 'code.barcodeHeightMm', type: 'range', label: 'Barcode height', step: 0.25, unit: 'mm', when: 'code.type=barcode,both' },
      { path: 'code.barWidth', type: 'select', label: 'Bar thickness', when: 'code.type=barcode,both',
        options: [['auto', 'Auto (thickest that fits)'], ['2', '0.25 mm (2 dots)'], ['3', '0.375 mm (3 dots)'], ['4', '0.5 mm (4 dots)'], ['1', '0.125 mm (1 dot) — not recommended']],
        help: 'Thicker bars scan more easily but make the barcode wider. A 50 mm label fits 0.25 mm bars for this serial.' },
      { path: 'code.qrContent', type: 'select', label: 'QR contains', when: 'code.type=qr,both',
        options: [['serial', 'Serial number only'], ['link', 'Link to the device page']],
        help: '“Link” lets any phone camera open the device page directly, but the stickers then depend on this website address never changing.' },
      { path: 'code.qrSizeMm', type: 'range', label: 'QR size', step: 0.25, unit: 'mm', when: 'code.type=qr,both' },
      { path: 'code.qrPosition', type: 'select', label: 'QR side', options: [['left', 'Left of barcode'], ['right', 'Right of barcode']], when: 'code.type=both' },
      { path: 'code.gapMm', type: 'range', label: 'Gap between QR and barcode', step: 0.25, unit: 'mm', when: 'code.type=both' },
      { path: 'code.dxMm', type: 'range', label: 'Move left ↔ right', step: 0.25, unit: 'mm', min: -15, max: 15, when: 'code.type=barcode,qr,both' },
      { path: 'code.dyMm', type: 'range', label: 'Move up ↕ down', step: 0.25, unit: 'mm', min: -8, max: 8, when: 'code.type=barcode,qr,both' }
    ] },
    { legend: 'Serial number text', fields: [
      { path: 'serial.show', type: 'toggle', label: 'Show serial number' },
      { path: 'serial.font', type: 'font', label: 'Font', sameAsTitle: true, when: 'serial.show' },
      { path: 'serial.bold', type: 'toggle', label: 'Bold', when: 'serial.show' },
      { path: 'serial.sizeMm', type: 'range', label: 'Text size', step: 0.25, unit: 'mm', when: 'serial.show' },
      { path: 'serial.spacing', type: 'range', label: 'Letter spacing', step: 1, unit: '%', when: 'serial.show' },
      { path: 'serial.align', type: 'select', label: 'Position', options: ALIGN, when: 'serial.show' },
      { path: 'serial.dxMm', type: 'range', label: 'Move left ↔ right', step: 0.25, unit: 'mm', min: -15, max: 15, when: 'serial.show' },
      { path: 'serial.dyMm', type: 'range', label: 'Move up ↕ down', step: 0.25, unit: 'mm', min: -8, max: 8, when: 'serial.show' }
    ] },
    { legend: 'My fonts', fields: [
      { path: '_fonts', type: 'fontlist', label: 'Fonts added on this device' }
    ] },
    { legend: 'Margins', fields: [
      { path: 'layout.edgeMm', type: 'range', label: 'Top & bottom margin', step: 0.25, unit: 'mm' },
      { path: 'layout.sideMm', type: 'range', label: 'Left & right margin', step: 0.25, unit: 'mm' }
    ] }
  ];

  var fieldEls = {}; // path → { input, out, wrap, spec }

  function buildEditor() {
    var frag = document.createDocumentFragment();
    SPEC.forEach(function (group, gi) {
      var fs = document.createElement('details');
      fs.className = 'ed-group';
      if (gi < 3) fs.open = gi === 0 || gi === 2;
      var sm = document.createElement('summary');
      sm.textContent = group.legend;
      fs.appendChild(sm);
      group.fields.forEach(function (f) { fs.appendChild(buildField(f)); });
      frag.appendChild(fs);
    });
    els.fields.replaceChildren(frag);
  }

  function buildField(f) {
    var rule = T.RULES[f.path] || {};
    var wrap = document.createElement('div');
    wrap.className = 'ed-field ed-field--' + f.type;
    var id = 'f-' + f.path.replace('.', '-');
    var input, out = null;

    if (f.type === 'toggle') {
      var lab = document.createElement('label');
      lab.className = 'check';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      lab.append(input, ' ' + f.label);
      wrap.appendChild(lab);
    } else {
      var head = document.createElement('label');
      head.className = 'ed-field__label';
      head.htmlFor = id;
      head.textContent = f.label + ' ';
      wrap.appendChild(head);

      if (f.type === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'input';
        input.maxLength = rule.max || 40;
      } else if (f.type === 'font') {
        input = document.createElement('select');
        input.className = 'input';
        input.dataset.sameAsTitle = f.sameAsTitle ? '1' : '';
        fillFontOptions(input);
        wrap.appendChild(input);
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn--small btn--ghost ed-addfont';
        add.textContent = '+ Add your own font (.ttf / .otf / .woff)';
        add.addEventListener('click', function () { pickFont(f.path); });
        wrap.appendChild(add);
        input.id = id;
        fieldEls[f.path] = { input: input, out: null, wrap: wrap, spec: f };
        input.addEventListener('change', function () { onFieldInput(f); });
        return wrap;
      } else if (f.type === 'fontlist') {
        var list = document.createElement('div');
        list.className = 'ed-fontlist';
        wrap.appendChild(list);
        wrap.appendChild(helpText('Fonts you add are kept on this device. To give everyone a font, add it to the website (see README → “Adding a font for everyone”). Only use fonts you have the licence for.'));
        fieldEls[f.path] = { input: null, wrap: wrap, spec: f, list: list };
        return wrap;
      } else if (f.type === 'select') {
        input = document.createElement('select');
        input.className = 'input';
        f.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0];
          op.textContent = o[1];
          input.appendChild(op);
        });
      } else if (f.type === 'range') {
        out = document.createElement('output');
        out.htmlFor = id;
        head.appendChild(out);
        input = document.createElement('input');
        input.type = 'range';
        input.min = f.min != null ? f.min : rule.min;
        input.max = f.max != null ? f.max : rule.max;
        input.step = f.step;
      } else if (f.type === 'image') {
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';
        input.className = 'ed-file';
        var row = document.createElement('div');
        row.className = 'ed-logo';
        var thumb = document.createElement('img');
        thumb.className = 'ed-logo__thumb';
        thumb.alt = 'Current logo';
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn--small btn--ghost';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          state.working.logo.image = '';
          onEdited();
        });
        row.append(thumb, input, remove);
        wrap.appendChild(row);
        fieldEls[f.path] = { input: input, wrap: wrap, spec: f, thumb: thumb, remove: remove };
        input.id = id;
        input.addEventListener('change', onLogoFile);
        if (f.help) wrap.appendChild(helpText(f.help));
        return wrap;
      }
      wrap.appendChild(input);
    }
    input.id = id;
    if (f.help) wrap.appendChild(helpText(f.help));
    fieldEls[f.path] = { input: input, out: out, wrap: wrap, spec: f };
    input.addEventListener(f.type === 'select' || f.type === 'toggle' ? 'change' : 'input', function () { onFieldInput(f); });
    return wrap;
  }

  // ── Fonts ─────────────────────────────────────────────────────────────────
  function fillFontOptions(select) {
    var current = select.value;
    select.replaceChildren();
    if (select.dataset.sameAsTitle) {
      var same = document.createElement('option');
      same.value = 'same';
      same.textContent = 'Same as title';
      select.appendChild(same);
    }
    Fonts.groups().forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g.group;
      g.fonts.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.key;
        o.textContent = d.label;
        og.appendChild(o);
      });
      select.appendChild(og);
    });
    if (current) select.value = current;
  }

  /** A template can name a font this device doesn't have (e.g. imported, or uploaded elsewhere). */
  function addMissingFontOption(select, key) {
    var o = document.createElement('option');
    o.value = key;
    o.textContent = 'Missing font (' + key.replace(/^[gsu]:/, '') + ')';
    select.insertBefore(o, select.firstChild);
  }

  function refreshFontSelects() {
    Object.keys(fieldEls).forEach(function (path) {
      var fe = fieldEls[path];
      if (fe.spec.type === 'font') fillFontOptions(fe.input);
    });
    fillFields();
  }

  var fontPicker = document.createElement('input');
  fontPicker.type = 'file';
  fontPicker.accept = FONT_ACCEPT;
  fontPicker.hidden = true;
  document.body.appendChild(fontPicker);
  var fontTarget = null;

  function pickFont(path) {
    fontTarget = path;
    fontPicker.value = '';
    fontPicker.click();
  }

  fontPicker.addEventListener('change', async function () {
    var file = fontPicker.files && fontPicker.files[0];
    if (!file) return;
    setError(els.editorError, '');
    try {
      var key = await Fonts.addUpload(file.name, await file.arrayBuffer());
      refreshFontSelects();
      if (fontTarget) {
        T.setPath(state.working, fontTarget, key);
        onEdited();
      }
    } catch (err) {
      setError(els.editorError, err.message);
    }
  });

  function renderFontList(container) {
    var list = Fonts.uploads();
    container.replaceChildren();
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = 'None yet. Use “+ Add your own font” under Title → Font.';
      container.appendChild(p);
      return;
    }
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'ed-fontlist__row';
      var name = document.createElement('span');
      name.textContent = f.name;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'btn btn--small btn--danger';
      rm.textContent = 'Remove';
      rm.addEventListener('click', function () {
        if (!window.confirm('Remove the font “' + f.name + '” from this device? Templates using it will fall back to Arial/Helvetica.')) return;
        Fonts.removeUpload(f.id);
        refreshFontSelects();
        scheduleRender();
      });
      row.append(name, rm);
      container.appendChild(row);
    });
  }

  /** Fonts the working template needs right now. */
  function neededFonts(t) {
    var out = [];
    if (t.title.show && t.title.text) out.push([t.title.font, t.title.bold]);
    if (t.serial.show) out.push([t.serial.font === 'same' ? t.title.font : t.serial.font, t.serial.bold]);
    return out;
  }

  function ensureFonts() {
    return Promise.all(neededFonts(state.working).map(function (f) { return Fonts.ensure(f[0], f[1]); }));
  }

  function syncFonts() {
    ensureFonts().then(function (entries) {
      if (entries.some(Boolean)) scheduleRender();
    }, function (err) {
      setError(els.editorError, err.message);
    });
  }

  function helpText(t) {
    var p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t;
    return p;
  }

  function fillFields() {
    Object.keys(fieldEls).forEach(function (path) {
      var fe = fieldEls[path];
      var v = T.getPath(state.working, path);
      if (fe.spec.type === 'fontlist') { renderFontList(fe.list); return; }
      if (fe.spec.type === 'toggle') fe.input.checked = !!v;
      else if (fe.spec.type === 'font') {
        if (!fe.input.querySelector('option[value="' + CSS.escape(v) + '"]')) addMissingFontOption(fe.input, v);
        fe.input.value = v;
      } else if (fe.spec.type === 'image') {
        fe.input.value = '';
        fe.thumb.src = v || '';
        show(fe.thumb, !!v);
        show(fe.remove, !!v);
      } else fe.input.value = v;
      if (fe.out) fe.out.textContent = fmtMm(v) + ' ' + fe.spec.unit;
    });
    syncVisibility();
  }

  function onFieldInput(f) {
    var fe = fieldEls[f.path];
    var v;
    if (f.type === 'toggle') v = fe.input.checked;
    else if (f.type === 'range') v = Number(fe.input.value);
    else v = fe.input.value;
    T.setPath(state.working, f.path, v);
    if (fe.out) fe.out.textContent = fmtMm(v) + ' ' + f.unit;
    onEdited({ keepFields: true });
  }

  function onEdited(opts) {
    // Re-validate through the schema so the working copy is always a legal template.
    var keep = { id: state.working.id, name: state.working.name };
    state.working = T.normalize(state.working);
    state.working.id = keep.id;
    state.working.name = keep.name;
    setDirty(true);
    if (!opts || !opts.keepFields) fillFields();
    else syncVisibility();
    syncLogo();
    syncFonts();
    scheduleRender();
  }

  /** when: 'title.show' | 'a|b' (either true) | 'code.type=qr,both' */
  function isVisible(when) {
    if (!when) return true;
    return when.split('|').some(function (cond) {
      var eq = cond.split('=');
      var v = T.getPath(state.working, eq[0]);
      return eq.length === 2 ? eq[1].split(',').indexOf(String(v)) !== -1 : !!v;
    });
  }

  function syncVisibility() {
    Object.keys(fieldEls).forEach(function (path) {
      var fe = fieldEls[path];
      show(fe.wrap, isVisible(fe.spec.when));
    });
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  function onLogoFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(els.editorError, '');
    var reader = new FileReader();
    reader.onerror = function () { setError(els.editorError, 'Could not read that file.'); };
    reader.onload = async function () {
      try {
        var img = await L.loadImage(reader.result);
        // Downscale big photos so templates stay small enough to save on the device.
        var scale = Math.min(1, LOGO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        state.working.logo.image = c.toDataURL('image/png');
        state.working.logo.show = true;
        onEdited();
      } catch (err) {
        setError(els.editorError, err.message || 'That image could not be used.');
      }
    };
    reader.readAsDataURL(file);
  }

  var logoToken = 0;
  function syncLogo() {
    var src = state.working.logo.show ? state.working.logo.image : '';
    if (src === state.logoSrc) return;
    state.logoSrc = src;
    state.logoImage = null;
    if (!src) return;
    var token = ++logoToken;
    L.loadImage(src).then(function (img) {
      if (token !== logoToken) return;
      state.logoImage = img;
      scheduleRender();
    }, function (err) {
      if (token === logoToken) setError(els.editorError, err.message);
    });
  }

  // ── Save / save as / delete / import / export ─────────────────────────────
  function persistCustom() {
    try {
      T.saveCustom(state.custom);
      return true;
    } catch (err) {
      setError(els.editorError, err.message);
      return false;
    }
  }

  els.save.addEventListener('click', function () {
    if (isLocked(state.current)) return;
    var saved = T.normalize(state.working);
    saved.id = state.current.id;
    saved.name = state.current.name;
    var idx = state.custom.findIndex(function (t) { return t.id === saved.id; });
    var before = state.custom.slice();
    if (idx === -1) state.custom.push(saved); else state.custom[idx] = saved;
    if (!persistCustom()) { state.custom = before; return; }
    state.current = saved;
    setDirty(false);
    els.tplHint.textContent = describeTemplate(saved);
  });

  function nextTemplateName() {
    var n = allTemplates().length + 1;
    var names = allTemplates().map(function (t) { return t.name.toLowerCase(); });
    while (names.indexOf(('Template ' + n).toLowerCase()) !== -1) n++;
    return 'Template ' + n;
  }

  els.saveAs.addEventListener('click', function () {
    show(els.saveAsForm, true);
    els.saveAsName.value = nextTemplateName();
    els.saveAsName.focus();
    els.saveAsName.select();
  });
  els.saveAsCancel.addEventListener('click', function () { show(els.saveAsForm, false); });
  els.saveAsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = els.saveAsName.value.trim();
    if (!name) return;
    var t = T.normalize(state.working);
    t.id = T.newId();
    t.name = name;
    state.custom.push(t);
    if (!persistCustom()) { state.custom.pop(); return; }
    show(els.saveAsForm, false);
    renderTemplateOptions();
    selectTemplate(t.id);
  });

  els.revert.addEventListener('click', function () { selectTemplate(state.current.id); });

  els.del.addEventListener('click', function () {
    if (isLocked(state.current)) return;
    if (!window.confirm('Delete “' + state.current.name + '” from this device?')) return;
    var id = state.current.id;
    var before = state.custom.slice();
    state.custom = state.custom.filter(function (t) { return t.id !== id; });
    if (!persistCustom()) { state.custom = before; return; }
    renderTemplateOptions();
    selectTemplate('t1');
  });

  els.exportBtn.addEventListener('click', function () {
    var t = T.normalize(state.working);
    t.id = state.current.id;
    t.name = state.current.name + (state.dirty ? ' (edited)' : '');
    var used = neededFonts(t).map(function (f) { return f[0]; }).concat([t.title.font, t.serial.font]);
    var fonts = Fonts.uploads().filter(function (f) { return used.indexOf(f.key) !== -1; })
      .map(function (f) { return { id: f.id, name: f.name, data: f.data }; });
    Export.download(new Blob([T.exportJson(t, fonts)], { type: 'application/json' }), slug(t.name) + '.herdiq-template.json');
  });

  els.importBtn.addEventListener('click', function () { els.importFile.click(); });
  els.importFile.addEventListener('change', function () {
    var file = els.importFile.files && els.importFile.files[0];
    els.importFile.value = '';
    if (!file) return;
    file.text().then(async function (text) {
      var list = T.parseImport(text);
      // Fonts packed into the file: add them on this device and point the template at them.
      var remap = {};
      var packed = T.parseImportFonts(text);
      for (var i = 0; i < packed.length; i++) {
        var bytes = Uint8Array.from(atob(packed[i].data), function (c) { return c.charCodeAt(0); });
        remap['u:' + packed[i].id] = await Fonts.addUpload(packed[i].name, bytes.buffer);
      }
      if (packed.length) refreshFontSelects();
      list.forEach(function (t) {
        if (remap[t.title.font]) t.title.font = remap[t.title.font];
        if (remap[t.serial.font]) t.serial.font = remap[t.serial.font];
      });
      var names = allTemplates().map(function (t) { return t.name; });
      list.forEach(function (t) {
        t.id = T.newId();
        if (!t.name) t.name = nextTemplateName();
        while (names.indexOf(t.name) !== -1) t.name += ' (imported)';
        names.push(t.name);
        state.custom.push(t);
      });
      if (!persistCustom()) { state.custom.splice(state.custom.length - list.length, list.length); return; }
      renderTemplateOptions();
      selectTemplate(list[0].id);
      setError(els.editorError, '');
    }).catch(function (err) { setError(els.editorError, err.message); });
  });

  // ── Template select + customize toggle ────────────────────────────────────
  els.tplSelect.addEventListener('change', function () {
    var id = els.tplSelect.value;
    if (state.dirty && !window.confirm('Discard your unsaved changes to “' + state.current.name + '”?')) {
      els.tplSelect.value = state.current.id;
      return;
    }
    show(els.saveAsForm, false);
    selectTemplate(id);
  });

  els.customize.addEventListener('click', function () {
    var open = els.editor.hidden;
    show(els.editor, open);
    els.customize.setAttribute('aria-expanded', String(open));
    els.customize.textContent = open ? 'Close editor' : 'Customize';
    els.lp.classList.toggle('lp--editing', open);
    if (open) els.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scheduleRender();
  });

  // ── Serial range ──────────────────────────────────────────────────────────
  function parseRange(fromRaw, toRaw) {
    var from = Serial.normalize(fromRaw);
    var to = Serial.normalize(toRaw) || from;
    if (!from) throw new Error('Enter the first serial number, e.g. S1HCB0381.');
    var bad = Fonts.unsupportedChars(from + to);
    if (bad) throw new Error('Serial numbers can only use English letters and numbers.');
    var a = /^(.*?)(\d+)$/.exec(from);
    var b = /^(.*?)(\d+)$/.exec(to);
    if (!a) throw new Error('“' + from + '” must end with a number, e.g. S1HCB0381.');
    if (!b) throw new Error('“' + to + '” must end with a number, e.g. S1HCB0400.');
    if (a[1] !== b[1]) throw new Error('From and To must start the same way (' + (a[1] || '—') + ' vs ' + (b[1] || '—') + ').');
    if (a[2].length !== b[2].length) throw new Error('Use the same number of digits in From and To (e.g. 0381 and 0400).');
    var start = parseInt(a[2], 10);
    var end = parseInt(b[2], 10);
    if (end < start) throw new Error('“To” must be the same as or after “From”.');
    var count = end - start + 1;
    if (count > MAX_LABELS) throw new Error('That is ' + count + ' labels. Make at most ' + MAX_LABELS + ' per PDF.');
    var serials = [];
    for (var n = start; n <= end; n++) serials.push(a[1] + String(n).padStart(a[2].length, '0'));
    return { serials: serials, from: serials[0], to: serials[serials.length - 1] };
  }

  function onRangeInput() {
    state.prefs.from = els.from.value;
    state.prefs.to = els.to.value;
    savePrefs();
    scheduleRender();
  }
  els.from.addEventListener('input', onRangeInput);
  els.to.addEventListener('input', onRangeInput);

  function updateRange() {
    try {
      state.range = parseRange(els.from.value, els.to.value);
      setError(els.rangeError, '');
      var n = state.range.serials.length;
      var txt = n + ' label' + (n === 1 ? '' : 's') + (n > 1 ? ' · ' + state.range.from + ' → ' + state.range.to : ' · ' + state.range.from);
      if (!Serial.isValid(state.range.from)) txt += ' · not the HerdIQ format (e.g. S1HCB0381) — the website won’t recognise it';
      els.rangeSummary.textContent = txt;
      els.pdf.textContent = 'Download PDF · ' + n + ' label' + (n === 1 ? '' : 's');
    } catch (err) {
      state.range = null;
      els.rangeSummary.textContent = '';
      setError(els.rangeError, err.message);
      els.pdf.textContent = 'Download PDF';
    }
    var ok = !!state.range;
    [els.pdf, els.png, els.csv, els.registry].forEach(function (b) { b.disabled = !ok; });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  var renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render();
    });
  }

  function layoutFor(serial) {
    return L.layout(state.working, serial, { logoImage: state.logoImage, siteRoot: HerdIQ.config.siteRoot });
  }

  function render() {
    updateRange();
    var sample = state.range ? state.range.serials[0] : 'S1HCB0000';
    var label;
    try {
      label = layoutFor(sample);
      setError(els.layoutError, '');
    } catch (err) {
      state.lastLayout = null;
      setError(els.layoutError, err.message);
      els.pdf.disabled = els.png.disabled = true;
      clearCanvas();
      showWarnings([]);
      return;
    }
    state.lastLayout = label;
    drawPreview(label);
    showWarnings(label.warnings);
    describeLayout(label);
    if (els.allLabels.open) renderThumbs();
    els.allCount.textContent = state.range ? '(' + state.range.serials.length + ')' : '';
  }

  function previewScale(label) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = els.canvas.clientWidth || 360;
    return { css: cssW / label.W, px: (cssW * dpr) / label.W };
  }

  function drawPreview(label) {
    var s = previewScale(label);
    els.canvas.width = Math.round(label.W * s.px);
    els.canvas.height = Math.round(label.H * s.px);
    els.canvas.style.height = Math.round(label.H * s.css) + 'px';
    var g = els.canvas.getContext('2d');
    if (els.dots.checked) {
      var bm = L.bitmapToCanvas(L.toBitmap(label));
      g.imageSmoothingEnabled = false;
      g.drawImage(bm, 0, 0, els.canvas.width, els.canvas.height);
    } else {
      L.drawCanvas(g, label, s.px);
    }
  }

  function clearCanvas() {
    var g = els.canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, els.canvas.width, els.canvas.height);
  }

  function showWarnings(list) {
    els.warnings.replaceChildren();
    list.forEach(function (w) {
      var p = document.createElement('p');
      p.textContent = w;
      els.warnings.appendChild(p);
    });
    show(els.warnings, list.length > 0);
  }

  function describeLayout(label) {
    var i = label.info;
    var bits = ['50 × 30 mm'];
    if (i.barcodeMm) bits.push('barcode ' + i.barcodeMm[0].toFixed(1) + ' × ' + i.barcodeMm[1].toFixed(1) + ' mm, bars ' + (i.barWidthDots / 8).toFixed(3).replace(/0+$/, '') + ' mm');
    if (i.qrMm) bits.push('QR ' + i.qrMm.toFixed(1) + ' mm');
    var c = state.prefs.calibration;
    if (c.dxMm || c.dyMm || c.rotate180) {
      var cal = [];
      if (c.dxMm) cal.push(Math.abs(c.dxMm) + ' mm ' + (c.dxMm > 0 ? 'right' : 'left'));
      if (c.dyMm) cal.push(Math.abs(c.dyMm) + ' mm ' + (c.dyMm > 0 ? 'down' : 'up'));
      if (c.rotate180) cal.push('rotated 180°');
      bits.push('PDF shifted ' + cal.join(', ') + ' for printer alignment');
    }
    els.meta.textContent = bits.join(' · ');
  }

  function renderThumbs() {
    els.thumbs.replaceChildren();
    if (!state.range) return;
    var list = state.range.serials;
    var frag = document.createDocumentFragment();
    var dpr = window.devicePixelRatio || 1;
    list.slice(0, MAX_THUMBS).forEach(function (serial) {
      var fig = document.createElement('figure');
      fig.className = 'lp__thumb';
      var c = document.createElement('canvas');
      try {
        var label = layoutFor(serial);
        var px = (150 * dpr) / label.W;
        c.width = Math.round(label.W * px);
        c.height = Math.round(label.H * px);
        L.drawCanvas(c.getContext('2d'), label, px);
      } catch (err) {
        c.width = c.height = 1;
      }
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Label ' + serial);
      var cap = document.createElement('figcaption');
      cap.textContent = serial;
      fig.append(c, cap);
      frag.appendChild(fig);
    });
    if (list.length > MAX_THUMBS) {
      var more = document.createElement('p');
      more.className = 'muted small';
      more.textContent = '…and ' + (list.length - MAX_THUMBS) + ' more (all are in the PDF).';
      frag.appendChild(more);
    }
    els.thumbs.appendChild(frag);
  }

  els.allLabels.addEventListener('toggle', function () { if (els.allLabels.open) renderThumbs(); });
  els.dots.addEventListener('change', scheduleRender);
  if ('ResizeObserver' in window) new ResizeObserver(function () { scheduleRender(); }).observe(els.canvas);

  // ── Printer alignment ─────────────────────────────────────────────────────
  function fillCalibration() {
    var c = state.prefs.calibration;
    els.calDx.value = c.dxMm;
    els.calDy.value = c.dyMm;
    els.calRot.checked = c.rotate180;
    els.calDxOut.textContent = fmtMm(c.dxMm) + ' mm';
    els.calDyOut.textContent = fmtMm(c.dyMm) + ' mm';
  }
  function onCalibration() {
    state.prefs.calibration = { dxMm: Number(els.calDx.value), dyMm: Number(els.calDy.value), rotate180: els.calRot.checked };
    savePrefs();
    fillCalibration();
    scheduleRender();
  }
  els.calDx.addEventListener('input', onCalibration);
  els.calDy.addEventListener('input', onCalibration);
  els.calRot.addEventListener('change', onCalibration);
  els.calReset.addEventListener('click', function () {
    state.prefs.calibration = T.clone(T.DEFAULT_PREFS.calibration);
    savePrefs();
    fillCalibration();
    scheduleRender();
  });

  // ── Exports ───────────────────────────────────────────────────────────────
  function allLabels() {
    if (!state.range) throw new Error('Fix the serial numbers first.');
    return state.range.serials.map(layoutFor);
  }

  async function pdfBlob() {
    await ensureFonts();
    var cal = state.prefs.calibration;
    var pages = allLabels().map(function (label) { return L.toPdfPage(label, cal); });
    return Export.buildPdf(pages, { widthMm: T.LABEL.widthMm, heightMm: T.LABEL.heightMm, title: 'HerdIQ labels ' + state.range.from + '–' + state.range.to });
  }

  async function pngFiles() {
    await ensureFonts();
    var cal = state.prefs.calibration;
    var files = [];
    var labels = allLabels();
    for (var i = 0; i < labels.length; i++) {
      var canvas = L.bitmapToCanvas(L.toBitmap(labels[i], cal));
      files.push({ name: state.range.serials[i] + '.png', data: await Export.buildPng(canvas, T.LABEL.dotsPerMm) });
    }
    return files;
  }

  function alignmentPdf() {
    var page = L.toPdfPage(L.alignmentTestLabel(), state.prefs.calibration);
    return Export.buildPdf([page], { widthMm: T.LABEL.widthMm, heightMm: T.LABEL.heightMm, title: 'HerdIQ alignment test' });
  }

  function registryJson() {
    var today = new Date();
    var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var devices = state.range.serials.map(function (serial) {
      var p = Serial.parse(serial);
      return {
        serial: serial,
        product: p && p.product ? p.product : '',
        sensorVersion: p ? p.sensorVersion : null,
        manufacturedOn: iso,
        batch: '',
        status: 'in-stock',
        firmware: null,
        animal: null,
        notes: ''
      };
    });
    return JSON.stringify(devices, null, 2) + '\n';
  }

  function rangeName() { return state.range.from + (state.range.serials.length > 1 ? '-' + state.range.to : ''); }

  async function runExport(btn, fn) {
    var label = btn.textContent;
    var buttons = [els.pdf, els.png, els.csv, els.registry, els.calTest];
    buttons.forEach(function (b) { b.disabled = true; });
    btn.textContent = 'Preparing…';
    try {
      await fn();
    } catch (err) {
      setError(els.layoutError, 'Download failed: ' + err.message);
    } finally {
      btn.textContent = label;
      buttons.forEach(function (b) { b.disabled = false; });
      updateRange();
    }
  }

  els.pdf.addEventListener('click', function () {
    runExport(els.pdf, async function () {
      Export.download(await pdfBlob(), 'HerdIQ_labels_' + rangeName() + '.pdf');
    });
  });
  els.png.addEventListener('click', function () {
    runExport(els.png, async function () {
      Export.download(Export.buildZip(await pngFiles()), 'HerdIQ_labels_' + rangeName() + '_png.zip');
    });
  });
  els.csv.addEventListener('click', function () {
    runExport(els.csv, async function () {
      var csv = 'Serial\r\n' + state.range.serials.join('\r\n') + '\r\n';
      Export.download(new Blob([csv], { type: 'text/csv' }), 'HerdIQ_serials_' + rangeName() + '.csv');
    });
  });
  els.registry.addEventListener('click', function () {
    runExport(els.registry, async function () {
      Export.download(new Blob([registryJson()], { type: 'application/json' }), 'devices_' + rangeName() + '.json');
    });
  });
  els.calTest.addEventListener('click', function () {
    runExport(els.calTest, async function () {
      Export.download(await alignmentPdf(), 'HerdIQ_alignment_test.pdf');
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  var ready = (async function init() {
    buildEditor();
    els.from.value = state.prefs.from;
    els.to.value = state.prefs.to;
    fillCalibration();
    renderTemplateOptions();
    selectTemplate(state.prefs.templateId, { silent: true });
    render();
    if (await Fonts.loadShared()) refreshFontSelects();
    state.shared = await T.loadShared();
    if (state.shared.length) {
      renderTemplateOptions();
      if (findTemplate(state.prefs.templateId) && state.prefs.templateId !== state.current.id) selectTemplate(state.prefs.templateId);
    }
  })();

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // Hooks for automated checks (headless browser).
  HerdIQ.LabelTool = Object.freeze({
    ready: ready,
    state: function () { return state; },
    setRange: function (from, to) { els.from.value = from; els.to.value = to; onRangeInput(); render(); },
    selectTemplate: function (id) { selectTemplate(id); render(); },
    edit: function (path, value) { T.setPath(state.working, path, value); onEdited(); render(); },
    pdfBlob: pdfBlob,
    pngFiles: pngFiles,
    alignmentPdf: alignmentPdf,
    registryJson: registryJson
  });
})();
