/*
 * Label fonts.
 *
 * Four kinds, all usable for the title AND the serial number:
 *
 *   standard  'sans' | 'serif' | 'mono'
 *             PDF "standard 14" fonts (Helvetica / Times / Courier). Every PDF app
 *             can draw them without embedding. Template 1 uses these.
 *   bundled   'g:<id>'  popular open-licence fonts shipped with the site
 *             (assets/fonts, SIL OFL / Apache / Ubuntu licence — see licenses/).
 *   shared    's:<id>'  fonts listed in data/label-fonts.json (e.g. a purchased
 *             font the team added to the website) — available on every device.
 *   uploaded  'u:<id>'  a .ttf/.otf/.woff file added in the browser — this device only.
 *
 * Non-standard fonts are drawn as vector OUTLINES (via opentype.js) in both the
 * preview and the PDF, so the printer app never needs the font installed and the
 * PDF looks exactly like the preview.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  // ── Standard PDF fonts: Adobe AFM advance widths (1/1000 em), ASCII 32–126 ──
  var W = {
    'Helvetica': [
      278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
      556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
    ],
    'Helvetica-Bold': [
      278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
      556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
      975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
      333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
      611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
    ],
    'Times-Roman': [
      250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
      500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
      921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
      556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
      333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
      500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541
    ],
    'Times-Bold': [
      250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
      500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
      930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 722,
      611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
      333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
      556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520
    ]
  };

  var STANDARD = {
    sans: { label: 'Arial / Helvetica', css: 'Arial, Helvetica, "Liberation Sans", "Nimbus Sans", sans-serif', pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold' } },
    serif: { label: 'Times', css: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif', pdf: { regular: 'Times-Roman', bold: 'Times-Bold' } },
    mono: { label: 'Courier', css: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace', pdf: { regular: 'Courier', bold: 'Courier-Bold' } }
  };

  // ── Bundled fonts: [id, label, group, hasBoldFile] ─────────────────────────
  var BUNDLED = [
    ['roboto', 'Roboto', 'Sans-serif', true],
    ['open-sans', 'Open Sans', 'Sans-serif', true],
    ['montserrat', 'Montserrat', 'Sans-serif', true],
    ['poppins', 'Poppins', 'Sans-serif', true],
    ['lato', 'Lato', 'Sans-serif', true],
    ['inter', 'Inter', 'Sans-serif', true],
    ['raleway', 'Raleway', 'Sans-serif', true],
    ['nunito', 'Nunito', 'Sans-serif', true],
    ['ubuntu', 'Ubuntu', 'Sans-serif', true],
    ['bebas-neue', 'Bebas Neue', 'Display', false],
    ['anton', 'Anton', 'Display', false],
    ['oswald', 'Oswald', 'Display', true],
    ['archivo-black', 'Archivo Black', 'Display', false],
    ['orbitron', 'Orbitron', 'Display', true],
    ['playfair-display', 'Playfair Display', 'Serif', true],
    ['merriweather', 'Merriweather', 'Serif', true],
    ['roboto-slab', 'Roboto Slab', 'Serif', true],
    ['roboto-mono', 'Roboto Mono', 'Monospace', true],
    ['source-code-pro', 'Source Code Pro', 'Monospace', true],
    ['pacifico', 'Pacifico', 'Script / handwriting', false],
    ['dancing-script', 'Dancing Script', 'Script / handwriting', true],
    ['lobster', 'Lobster', 'Script / handwriting', false],
    ['great-vibes', 'Great Vibes', 'Script / handwriting', false]
  ];

  var OPENTYPE_PATH = 'assets/vendor/opentype/opentype-1.3.4.min.js';
  var SHARED_PATH = 'data/label-fonts.json';
  var STORE = 'herdiq.labels.fonts.v1';
  var MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

  function siteUrl(path) { return new URL(path, HerdIQ.config.siteRoot).href; }

  // ── Registry ──────────────────────────────────────────────────────────────
  var registry = new Map(); // key → descriptor

  Object.keys(STANDARD).forEach(function (k) {
    registry.set(k, { key: k, label: STANDARD[k].label, group: 'Standard (fastest, built into every PDF app)', kind: 'standard' });
  });
  BUNDLED.forEach(function (b) {
    registry.set('g:' + b[0], {
      key: 'g:' + b[0], label: b[1], group: b[2], kind: 'outline',
      regular: siteUrl('assets/fonts/' + b[0] + '-400.woff'),
      bold: b[3] ? siteUrl('assets/fonts/' + b[0] + '-700.woff') : null
    });
  });

  var GROUP_ORDER = ['Standard (fastest, built into every PDF app)', 'Sans-serif', 'Display', 'Serif', 'Monospace',
    'Script / handwriting', 'Shared (website)', 'My fonts (this device)'];

  function describe(key) { return registry.get(key) || null; }

  /** [{ group, fonts: [descriptor] }] in display order. */
  function groups() {
    var by = {};
    registry.forEach(function (d) { (by[d.group] = by[d.group] || []).push(d); });
    return GROUP_ORDER.filter(function (g) { return by[g] && by[g].length; }).map(function (g) { return { group: g, fonts: by[g] }; });
  }

  function isValidKey(key) {
    return typeof key === 'string' && /^(sans|serif|mono|[gsu]:[a-z0-9-]{1,60})$/.test(key);
  }

  // ── Uploaded fonts (this device) ──────────────────────────────────────────
  function readUploads() {
    try {
      var list = JSON.parse(root.localStorage.getItem(STORE) || '[]');
      return Array.isArray(list) ? list.filter(function (f) { return f && f.id && f.data; }) : [];
    } catch (e) {
      return [];
    }
  }

  function writeUploads(list) {
    try {
      root.localStorage.setItem(STORE, JSON.stringify(list));
    } catch (e) {
      throw new Error('Not enough space on this device to keep the font. Remove a font or logo you no longer use.');
    }
  }

  function registerUpload(f) {
    registry.set('u:' + f.id, { key: 'u:' + f.id, label: f.name, group: 'My fonts (this device)', kind: 'outline', data: f.data, bold: null, uploadId: f.id });
  }

  readUploads().forEach(registerUpload);

  function b64FromBuffer(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function bufferFromB64(b64) {
    var s = atob(b64);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'font'; }

  /**
   * Adds a font file for this device. Returns the new font key ('u:…').
   * @param {string} fileName
   * @param {ArrayBuffer} buffer
   */
  async function addUpload(fileName, buffer) {
    if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error('That font file is larger than 2 MB. Use the .ttf, .otf or .woff version of just the weight you need.');
    var ot = await loadLib();
    var font;
    try {
      font = ot.parse(buffer);
    } catch (e) {
      throw new Error('That file is not a font this tool can read. Use a .ttf, .otf or .woff file (.woff2 is not supported).');
    }
    if (!font || !font.supported) throw new Error('That font format is not supported. Use a .ttf, .otf or .woff file.');
    var name = (font.names && font.names.fullName && (font.names.fullName.en || Object.values(font.names.fullName)[0])) ||
      String(fileName).replace(/\.[^.]+$/, '');
    var data = b64FromBuffer(buffer);
    var list = readUploads();
    var existing = list.filter(function (f) { return f.data.length === data.length && f.data === data; })[0];
    if (existing) return 'u:' + existing.id;
    var id = slug(name) + '-' + Date.now().toString(36);
    var entry = { id: id, name: name, data: data };
    writeUploads(list.concat([entry]));
    registerUpload(entry);
    return 'u:' + id;
  }

  function removeUpload(id) {
    writeUploads(readUploads().filter(function (f) { return f.id !== id; }));
    registry.delete('u:' + id);
    loaded.delete('u:' + id + '|0');
    loaded.delete('u:' + id + '|1');
  }

  function uploads() { return readUploads().map(function (f) { return { id: f.id, key: 'u:' + f.id, name: f.name, data: f.data }; }); }

  // ── Shared fonts (website) ────────────────────────────────────────────────
  async function loadShared() {
    try {
      var res = await fetch(siteUrl(SHARED_PATH), { cache: 'no-cache' });
      if (!res.ok) return 0;
      var json = await res.json();
      var list = json && Array.isArray(json.fonts) ? json.fonts : [];
      var n = 0;
      list.forEach(function (f) {
        if (!f || !f.id || !f.name || !f.regular || !/^[a-z0-9-]{1,60}$/.test(f.id)) return;
        registry.set('s:' + f.id, {
          key: 's:' + f.id, label: String(f.name), group: 'Shared (website)', kind: 'outline',
          regular: siteUrl(f.regular), bold: f.bold ? siteUrl(f.bold) : null
        });
        n++;
      });
      return n;
    } catch (e) {
      return 0;
    }
  }

  // ── Loading outline fonts ─────────────────────────────────────────────────
  var libPromise = null;
  function loadLib() {
    if (root.opentype) return Promise.resolve(root.opentype);
    if (!libPromise) {
      libPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = siteUrl(OPENTYPE_PATH);
        s.onload = function () { root.opentype ? resolve(root.opentype) : reject(new Error('Font engine failed to start.')); };
        s.onerror = function () { libPromise = null; reject(new Error('Font engine could not be downloaded. Check your connection.')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }

  var loaded = new Map();   // 'key|bold' → { font, fakeBold }
  var pending = new Map();  // 'key|bold' → Promise

  /** Resolves when the font (and weight) is ready for layout. Standard fonts resolve immediately. */
  function ensure(key, bold) {
    var d = describe(key);
    if (!d || d.kind === 'standard') return Promise.resolve(null);
    var id = key + '|' + (bold ? 1 : 0);
    if (loaded.has(id)) return Promise.resolve(loaded.get(id));
    if (pending.has(id)) return pending.get(id);
    var useBoldFile = !!(bold && d.bold);
    var p = loadLib().then(async function (ot) {
      var buffer;
      if (d.data) {
        buffer = bufferFromB64(d.data);
      } else {
        var res = await fetch(useBoldFile ? d.bold : d.regular);
        if (!res.ok) throw new Error('Font "' + d.label + '" could not be downloaded.');
        buffer = await res.arrayBuffer();
      }
      var entry = { font: ot.parse(buffer), fakeBold: !!(bold && !useBoldFile) };
      loaded.set(id, entry);
      pending.delete(id);
      return entry;
    }, function (err) {
      pending.delete(id);
      throw err;
    });
    pending.set(id, p);
    return p;
  }

  /** The loaded font for synchronous layout, or null if it is not ready (call ensure first). */
  function getLoaded(key, bold) {
    return loaded.get(key + '|' + (bold ? 1 : 0)) || null;
  }

  // ── Measuring ─────────────────────────────────────────────────────────────
  function pdfName(key, bold) {
    var f = (STANDARD[key] || STANDARD.sans).pdf;
    return bold ? f.bold : f.regular;
  }

  function cssFamily(key) { return (STANDARD[key] || STANDARD.sans).css; }

  function advance(pdfFont, ch) {
    if (pdfFont.indexOf('Courier') === 0) return 600;
    var c = ch.charCodeAt(0);
    var table = W[pdfFont] || W.Helvetica;
    return c >= 32 && c <= 126 ? table[c - 32] : 556;
  }

  /** Standard font: width of `str` in the unit of `size`, with extra `spacing` between characters. */
  function measure(pdfFont, str, size, spacing) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += advance(pdfFont, str[i]);
    return (w / 1000) * size + (spacing || 0) * Math.max(0, str.length - 1);
  }

  /** Outline font: glyph positions (with kerning) and total width. */
  function shape(font, str, size, spacing) {
    var glyphs = font.stringToGlyphs(str);
    var scale = size / font.unitsPerEm;
    var x = 0;
    var pos = [];
    for (var i = 0; i < glyphs.length; i++) {
      pos.push(x);
      x += glyphs[i].advanceWidth * scale;
      if (i < glyphs.length - 1) {
        var kern = 0;
        try { kern = font.getKerningValue(glyphs[i], glyphs[i + 1]) || 0; } catch (e) { kern = 0; }
        x += kern * scale + spacing;
      }
    }
    return { glyphs: glyphs, pos: pos, width: x };
  }

  /** Characters the font has no drawing for. */
  function missingChars(font, str) {
    var miss = [];
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch !== ' ' && font.charToGlyphIndex(ch) === 0 && miss.indexOf(ch) === -1) miss.push(ch);
    }
    return miss;
  }

  /** Cap height as a fraction of the em (used to centre capitals in their row). */
  function capHeight(font) {
    var os2 = font.tables && font.tables.os2;
    var cap = os2 && os2.sCapHeight ? os2.sCapHeight : font.ascender * 0.7;
    return Math.max(0.3, Math.min(1, cap / font.unitsPerEm));
  }

  /** Label text is limited to printable ASCII so every printer/PDF app renders it identically. */
  function unsupportedChars(str) {
    var bad = String(str).replace(/[\x20-\x7e]/g, '');
    return bad ? Array.from(new Set(bad.split(''))).join(' ') : '';
  }

  HerdIQ.LabelFonts = Object.freeze({
    describe: describe,
    groups: groups,
    isValidKey: isValidKey,
    ensure: ensure,
    getLoaded: getLoaded,
    loadShared: loadShared,
    addUpload: addUpload,
    removeUpload: removeUpload,
    uploads: uploads,
    pdfName: pdfName,
    cssFamily: cssFamily,
    advance: advance,
    measure: measure,
    shape: shape,
    missingChars: missingChars,
    capHeight: capHeight,
    unsupportedChars: unsupportedChars,
    b64FromBuffer: b64FromBuffer
  });
})(typeof window !== 'undefined' ? window : globalThis);
