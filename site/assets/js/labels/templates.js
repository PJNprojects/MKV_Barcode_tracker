/*
 * Label templates.
 *
 * A template describes WHAT goes on a 50 × 30 mm label and how it looks —
 * never the serial numbers. Three sources, merged in this order:
 *   1. Built-in   — defined below (Template 1 is the production design).
 *   2. Shared     — data/label-templates.json on the website (edit in GitHub
 *                   to give every phone the same extra templates).
 *   3. My templates — created in the browser with "Save as new"; stored on
 *                   this device only (export/import to move them).
 *
 * All sizes are millimetres. The label size is fixed.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  var LABEL = Object.freeze({ widthMm: 50, heightMm: 30, dotsPerMm: 8 }); // 8 dots/mm = 203 dpi
  var SCHEMA = 1;
  var STORE_TEMPLATES = 'herdiq.labels.templates.v1';
  var STORE_PREFS = 'herdiq.labels.prefs.v1';
  var SHARED_PATH = 'data/label-templates.json';

  // Every field, with its default. Template 1 == these defaults.
  var DEFAULTS = Object.freeze({
    schema: SCHEMA,
    id: '',
    name: '',
    title: { show: true, text: 'HerdIQ', font: 'sans', bold: true, sizeMm: 6, heightPct: 100, spacing: 3, align: 'center', dxMm: 0, dyMm: 0 },
    subtitle: { show: false, text: 'Cattle Node', font: 'sans', bold: false, sizeMm: 3, heightPct: 100, spacing: 3, align: 'center', gapMm: 0.75, dxMm: 0, dyMm: 0 },
    logo: { show: false, image: '', heightMm: 6, position: 'left', gapMm: 1.5, threshold: 50 },
    code: { type: 'barcode', barcodeHeightMm: 11, barWidth: 'auto', qrContent: 'serial', qrSizeMm: 11, qrPosition: 'left', gapMm: 3, dxMm: 0, dyMm: 0 },
    serial: { show: true, font: 'sans', bold: true, sizeMm: 4.25, heightPct: 100, spacing: 6, align: 'center', dxMm: 0, dyMm: 0 },
    layout: { edgeMm: 1.5, sideMm: 2.5 }
  });

  // Allowed values / ranges (also used to build the editor's limits).
  var RULES = {
    'title.text': { max: 24 },
    'title.font': { validate: function (v) { return HerdIQ.LabelFonts.isValidKey(v); } },
    'title.sizeMm': { min: 1.5, max: 12 },
    'title.spacing': { min: 0, max: 40 },
    'title.align': { oneOf: ['left', 'center', 'right'] },
    'title.dxMm': { min: -25, max: 25 },
    'title.dyMm': { min: -15, max: 15 },
    'logo.heightMm': { min: 2, max: 20 },
    'logo.position': { oneOf: ['left', 'right'] },
    'logo.gapMm': { min: 0, max: 8 },
    'logo.threshold': { min: 5, max: 95 },
    'code.type': { oneOf: ['barcode', 'qr', 'both', 'none'] },
    'code.barcodeHeightMm': { min: 4, max: 24 },
    'code.barWidth': { oneOf: ['auto', '1', '2', '3', '4'] },
    'code.qrContent': { oneOf: ['serial', 'link'] },
    'code.qrSizeMm': { min: 5, max: 24 },
    'code.qrPosition': { oneOf: ['left', 'right'] },
    'code.gapMm': { min: 0, max: 15 },
    'code.dxMm': { min: -25, max: 25 },
    'code.dyMm': { min: -15, max: 15 },
    'subtitle.text': { max: 30 },
    'title.heightPct': { min: 30, max: 300 },
    'subtitle.heightPct': { min: 30, max: 300 },
    'serial.heightPct': { min: 30, max: 300 },
    'subtitle.font': { validate: function (v) { return v === 'same' || HerdIQ.LabelFonts.isValidKey(v); } },
    'subtitle.sizeMm': { min: 1.5, max: 10 },
    'subtitle.spacing': { min: 0, max: 40 },
    'subtitle.align': { oneOf: ['left', 'center', 'right'] },
    'subtitle.gapMm': { min: 0, max: 8 },
    'subtitle.dxMm': { min: -25, max: 25 },
    'subtitle.dyMm': { min: -15, max: 15 },
    'serial.font': { validate: function (v) { return v === 'same' || HerdIQ.LabelFonts.isValidKey(v); } },
    'serial.sizeMm': { min: 1.5, max: 10 },
    'serial.spacing': { min: 0, max: 40 },
    'serial.align': { oneOf: ['left', 'center', 'right'] },
    'serial.dxMm': { min: -25, max: 25 },
    'serial.dyMm': { min: -15, max: 15 },
    'layout.edgeMm': { min: 0, max: 6 },
    'layout.sideMm': { min: 0, max: 8 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) { return (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}); }, obj);
    target[last] = value;
  }

  /** Returns a complete, valid template built from anything (missing/invalid fields → defaults). */
  function normalize(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var t = clone(DEFAULTS);
    t.id = String(src.id || '');
    t.name = String(src.name || '').slice(0, 60);

    ['title', 'subtitle', 'logo', 'code', 'serial', 'layout'].forEach(function (group) {
      Object.keys(DEFAULTS[group]).forEach(function (key) {
        var path = group + '.' + key;
        var def = DEFAULTS[group][key];
        var v = getPath(src, path);
        if (v === undefined || v === null) return;
        var rule = RULES[path] || {};
        if (typeof def === 'boolean') {
          t[group][key] = v === true || v === 'true';
        } else if (typeof def === 'number') {
          var n = Number(v);
          if (isFinite(n)) t[group][key] = Math.min(rule.max != null ? rule.max : n, Math.max(rule.min != null ? rule.min : n, n));
        } else if (rule.oneOf) {
          if (rule.oneOf.indexOf(String(v)) !== -1) t[group][key] = String(v);
        } else if (rule.validate) {
          if (rule.validate(String(v))) t[group][key] = String(v);
        } else {
          t[group][key] = String(v).slice(0, rule.max || 2000000);
        }
      });
    });
    return t;
  }

  // ── Built-in templates ────────────────────────────────────────────────────
  var BUILT_IN = [
    normalize({ id: 't1', name: 'Template 1 · HerdIQ standard' }),
    normalize({
      id: 't2',
      name: 'Template 2 · Barcode + QR',
      title: { sizeMm: 5 },
      code: { type: 'both', barcodeHeightMm: 11, qrSizeMm: 11, qrContent: 'serial', qrPosition: 'left', gapMm: 3 },
      serial: { sizeMm: 4 }
    }),
    normalize({
      id: 't3',
      name: 'Template 3 · HerdIQ + subtitle',
      title: { sizeMm: 5.5 },
      subtitle: { show: true, text: 'Cattle Node', sizeMm: 3, gapMm: 0.75 },
      code: { barcodeHeightMm: 10 },
      serial: { sizeMm: 4 }
    }),
    // Default template (designed in the tool and exported by the team, Nov 2026).
    normalize({
      id: 't4',
      name: 'Template 4 · HerdIQ Cattle Node (default)',
      title: { show: true, text: 'HerdIQ', font: 'g:roboto-mono', bold: true, sizeMm: 5.5, heightPct: 100, spacing: 7, align: 'center', dxMm: 0, dyMm: 0 },
      subtitle: { show: true, text: 'Cattle Node', font: 'sans', bold: false, sizeMm: 3.5, heightPct: 105, spacing: 9, align: 'center', gapMm: 0, dxMm: 0, dyMm: 0 },
      logo: { show: false },
      code: { type: 'barcode', barcodeHeightMm: 10, barWidth: 'auto', qrContent: 'serial', qrSizeMm: 11, qrPosition: 'left', gapMm: 3, dxMm: 0, dyMm: 0 },
      serial: { show: true, font: 'g:roboto-mono', bold: false, sizeMm: 4.5, heightPct: 70, spacing: 21, align: 'center', dxMm: 0, dyMm: -2.25 },
      layout: { edgeMm: 1.5, sideMm: 2.5 }
    })
  ].map(function (t) { t.builtIn = true; return Object.freeze(t); });

  // ── Storage (all wrapped: private mode / blocked storage must not break the tool) ──
  function readStore(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadCustom() {
    var list = readStore(STORE_TEMPLATES, []);
    return Array.isArray(list) ? list.map(normalize).filter(function (t) { return t.id; }) : [];
  }

  function saveCustom(list) {
    if (!writeStore(STORE_TEMPLATES, list)) {
      throw new Error('Could not save on this device (storage is full or blocked). Try a smaller logo image, or use Export.');
    }
  }

  async function loadShared() {
    try {
      var url = new URL(SHARED_PATH, HerdIQ.config.siteRoot).href;
      var res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return [];
      var json = await res.json();
      var list = Array.isArray(json) ? json : json && Array.isArray(json.templates) ? json.templates : [];
      return list.map(function (t) {
        var n = normalize(t);
        n.shared = true;
        return n;
      }).filter(function (t) { return t.id && t.name; });
    } catch (e) {
      return []; // offline or file:// — built-ins still work
    }
  }

  function newId() {
    return 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ── Import / export ───────────────────────────────────────────────────────
  /** fonts: uploaded fonts the template uses ([{id, name, data}]) so it works on another device. */
  function exportJson(template, fonts) {
    var t = clone(template);
    delete t.builtIn;
    delete t.shared;
    var doc = { herdiqLabelTemplate: SCHEMA, template: t };
    if (fonts && fonts.length) doc.fonts = fonts;
    return JSON.stringify(doc, null, 2) + '\n';
  }

  /** Fonts bundled inside an exported template file (may be empty). */
  function parseImportFonts(text) {
    try {
      var json = JSON.parse(text);
      return json && Array.isArray(json.fonts)
        ? json.fonts.filter(function (f) { return f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.data === 'string'; })
        : [];
    } catch (e) {
      return [];
    }
  }

  /** Accepts an exported file, a bare template, or { templates: [...] }. */
  function parseImport(text) {
    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a valid template (.json) file.');
    }
    var list = json && json.template ? [json.template] : json && Array.isArray(json.templates) ? json.templates : Array.isArray(json) ? json : [json];
    var out = list.filter(function (t) { return t && typeof t === 'object' && (t.title || t.code || t.serial); }).map(normalize);
    if (!out.length) throw new Error('No label template found in that file.');
    return out;
  }

  // ── Preferences (last template, last range, printer alignment) ───────────
  var DEFAULT_TEMPLATE_ID = 't4';

  var DEFAULT_PREFS = Object.freeze({
    templateId: 't4', // default template for new devices
    from: 'S1HCB0381',
    to: 'S1HCB0386',
    // First phone-app test print came out left of centre → default nudge to the right.
    calibration: { dxMm: 1.5, dyMm: 0, rotate180: false }
  });

  function loadPrefs() {
    var p = readStore(STORE_PREFS, {}) || {};
    var c = p.calibration || {};
    var num = function (v, d, lo, hi) { var n = Number(v); return isFinite(n) && v !== '' && v != null ? Math.max(lo, Math.min(hi, n)) : d; };
    return {
      templateId: typeof p.templateId === 'string' ? p.templateId : DEFAULT_PREFS.templateId,
      from: typeof p.from === 'string' ? p.from : DEFAULT_PREFS.from,
      to: typeof p.to === 'string' ? p.to : DEFAULT_PREFS.to,
      calibration: {
        dxMm: num(c.dxMm, DEFAULT_PREFS.calibration.dxMm, -10, 10),
        dyMm: num(c.dyMm, DEFAULT_PREFS.calibration.dyMm, -10, 10),
        rotate180: c.rotate180 === true
      }
    };
  }

  function savePrefs(p) { writeStore(STORE_PREFS, p); }

  HerdIQ.LabelTemplates = Object.freeze({
    LABEL: LABEL,
    DEFAULTS: DEFAULTS,
    RULES: RULES,
    BUILT_IN: BUILT_IN,
    DEFAULT_PREFS: DEFAULT_PREFS,
    DEFAULT_TEMPLATE_ID: DEFAULT_TEMPLATE_ID,
    normalize: normalize,
    clone: clone,
    getPath: getPath,
    setPath: setPath,
    loadCustom: loadCustom,
    saveCustom: saveCustom,
    loadShared: loadShared,
    newId: newId,
    exportJson: exportJson,
    parseImport: parseImport,
    parseImportFonts: parseImportFonts,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs
  });
})(typeof window !== 'undefined' ? window : globalThis);
