/*
 * Label renderer.
 *
 * One layout engine, two outputs:
 *   • vector  — PDF drawing commands: bars as exact rectangles on the printer's
 *               dot grid, text as real (Helvetica-Bold) font glyphs. Razor sharp
 *               at any zoom; the printer driver rasterises it at its native dpi.
 *               → used for PDFs (the recommended print path).
 *   • bitmap  — 1-bit image at the printer's native 203 dpi (one pixel = one dot).
 *               → used for PNGs (phone app) and the on-screen preview.
 *
 * Bars are always a whole number of printer dots wide. A 203-dpi head cannot
 * print fractions of a dot; uneven bar widths are what make thermal barcodes
 * fail to scan.
 *
 * 203 dpi = 8 dots per mm exactly, so a 50 × 30 mm label = 400 × 240 dots.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  var DEFAULTS = Object.freeze({
    widthMm: 50,
    heightMm: 30,
    dotsPerMm: 8,           // 203 dpi
    edgeMarginMm: 1.5,      // top / bottom safety margin (label feed tolerance)
    sideMarginMm: 2.5,      // 2-inch heads print 48 mm wide → keep content away from the sides
    showHeader: true,
    headerText: 'HerdIQ',   // printed large and centred above the barcode
    moduleDots: 'auto',     // bar width unit in dots ('auto' = widest that fits with quiet zones)
    barcodeHeightMm: 11,    // number, or 'auto' to fill all spare height
    offsetXmm: 0,           // printer calibration nudges
    offsetYmm: 0,
    rotate180: false,
    // Arial and Helvetica share identical glyph widths, so the bitmap (Arial) and the
    // PDF (Helvetica-Bold) come out the same size and position.
    fontFamily: 'Arial, Helvetica, "Liberation Sans", "Helvetica Neue", sans-serif'
  });

  var MAX_MODULE_DOTS = 4;
  var BASELINE = 0.86;      // baseline position within a text block, as a fraction of font size

  // Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126 — standard Adobe AFM metrics.
  var HELV_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
  ];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function charWidth(ch) {
    var c = ch.charCodeAt(0);
    return c >= 32 && c <= 126 ? HELV_BOLD[c - 32] : 556;
  }

  /** Width of a string in dots for a font size (dots) and extra letter spacing (dots). */
  function textWidth(str, size, spacing) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += charWidth(str[i]);
    return (w / 1000) * size + spacing * Math.max(0, str.length - 1);
  }

  /** Largest font size ≤ size whose text fits maxWidth. */
  function fitSize(str, size, spacingRatio, maxWidth, minSize) {
    for (var s = size; s > minSize; s -= 0.5) {
      if (textWidth(str, s, s * spacingRatio) <= maxWidth) return s;
    }
    return minSize;
  }

  function withDefaults(opts) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      o[k] = opts && opts[k] !== undefined && opts[k] !== '' ? opts[k] : DEFAULTS[k];
    });
    return o;
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ── Layout (all units: printer dots, origin top-left) ──────────────────────
  function layout(text, options) {
    var o = withDefaults(options);
    var dpm = Number(o.dotsPerMm);
    var W = Math.round(Number(o.widthMm) * dpm);
    var H = Math.round(Number(o.heightMm) * dpm);
    if (!(W >= 80 && H >= 64)) throw new Error('Label is too small (minimum 10 × 8 mm).');
    var warnings = [];

    var edge = Math.round(Number(o.edgeMarginMm) * dpm);
    var side = Math.round(Number(o.sideMarginMm) * dpm);
    var contentW = W - 2 * side;

    // Barcode geometry
    var symbol = HerdIQ.Code128.encode(text);
    var quiet = HerdIQ.Code128.QUIET_ZONE_MODULES;
    var nMod = symbol.modules.length;
    var maxX = Math.floor(contentW / (nMod + 2 * quiet));
    var X = o.moduleDots === 'auto' ? clamp(maxX, 1, MAX_MODULE_DOTS) : parseInt(o.moduleDots, 10);
    if (!(X >= 1)) throw new Error('Invalid bar width.');
    if (nMod * X > contentW) {
      throw new Error('Barcode for "' + text + '" is ' + ((nMod * X) / dpm).toFixed(1) + ' mm wide and does not fit on a ' + o.widthMm + ' mm label. Use a smaller bar width or a wider label.');
    }
    if ((nMod + 2 * quiet) * X > W) warnings.push('Quiet zone (blank margin beside the bars) is smaller than the standard 10 bar-widths; scanning may be less reliable.');
    if (X < 2) warnings.push('Bars are only 1 dot (0.125 mm) wide — too fine for reliable phone scanning. Use a shorter serial or a wider label.');

    // Vertical layout: [header] · barcode · serial, spare space shared evenly
    var headerText = o.showHeader ? String(o.headerText || '').trim() : '';
    var headerBox = headerText ? clamp(Math.round(H * 0.2), 14, 64) : 0;
    var serialBox = clamp(Math.round(H * 0.14), 16, 44);
    var minGap = Math.max(4, Math.round(H * 0.025));
    var blocks = headerBox ? 3 : 2;
    var inner = H - 2 * edge;
    var barMax = inner - headerBox - serialBox - (blocks - 1) * minGap;
    var barH = o.barcodeHeightMm === 'auto' ? barMax : Math.min(barMax, Math.round(Number(o.barcodeHeightMm) * dpm));
    if (barH < 4 * dpm) throw new Error('Not enough height for the barcode (needs at least 4 mm). Turn off the header or use a taller label.');
    if (barH < 8 * dpm) warnings.push('Barcode is only ' + (barH / dpm).toFixed(1) + ' mm tall; 8 mm or more scans more easily.');
    var gap = Math.floor((inner - headerBox - barH - serialBox) / (blocks - 1));

    var barTop = edge + (headerBox ? headerBox + gap : 0);
    var serialTop = barTop + barH + gap;

    function textLine(str, box, top, spacingRatio) {
      var size = fitSize(str, box, spacingRatio, contentW, 8);
      var spacing = size * spacingRatio;
      var width = textWidth(str, size, spacing);
      return {
        text: str,
        size: size,
        spacing: spacing,
        x: (W - width) / 2,
        // keep a shrunken line vertically centred in its block
        baseline: top + box * BASELINE - (box - size) * BASELINE / 2
      };
    }

    // Bars as runs of adjacent bar modules → [startDot, widthDots]
    var x0 = Math.round((W - nMod * X) / 2);
    var runs = [];
    for (var m = 0; m < nMod; m++) {
      if (!symbol.modules[m]) continue;
      var s = m;
      while (m + 1 < nMod && symbol.modules[m + 1]) m++;
      runs.push([x0 + s * X, (m - s + 1) * X]);
    }

    return {
      W: W,
      H: H,
      dpm: dpm,
      fontFamily: o.fontFamily,
      header: headerText ? textLine(headerText, headerBox, edge, 0.03) : null,
      serial: textLine(text, serialBox, serialTop, 0.06),
      bars: { runs: runs, top: barTop, height: barH },
      dx: Math.round(Number(o.offsetXmm) * dpm),
      dy: Math.round(Number(o.offsetYmm) * dpm),
      rotate180: !!o.rotate180,
      info: {
        text: text,
        moduleDots: X,
        moduleMm: X / dpm,
        barcodeWidthMm: (nMod * X) / dpm,
        barcodeHeightMm: barH / dpm,
        dpi: dpm * 25.4,
        warnings: warnings
      }
    };
  }

  // ── Bitmap output ──────────────────────────────────────────────────────────
  function drawTextChars(ctx, line) {
    ctx.font = '700 ' + line.size + 'px ' + ctx.__family;
    var x = line.x;
    for (var i = 0; i < line.text.length; i++) {
      var ch = line.text[i];
      ctx.fillText(ch, x, line.baseline);
      x += (charWidth(ch) / 1000) * line.size + line.spacing;
    }
  }

  function toBitmap(L) {
    var W = L.W, H = L.H;
    var canvas = makeCanvas(W, H);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.__family = L.fontFamily;
    if (L.header) drawTextChars(ctx, L.header);
    drawTextChars(ctx, L.serial);

    var img = ctx.getImageData(0, 0, W, H).data;
    var data = new Uint8Array(W * H);
    for (var p = 0, q = 0; p < data.length; p++, q += 4) {
      data[p] = img[q] * 0.299 + img[q + 1] * 0.587 + img[q + 2] * 0.114 < 128 ? 1 : 0; // 50 % threshold
    }

    for (var y = L.bars.top; y < L.bars.top + L.bars.height; y++) {
      var row = y * W;
      for (var x = 0; x < W; x++) data[row + x] = 0; // keep the barcode band clean
      L.bars.runs.forEach(function (r) {
        for (var d = 0; d < r[1]; d++) data[row + r[0] + d] = 1;
      });
    }

    if (L.dx || L.dy || L.rotate180) data = transform(data, W, H, L.dx, L.dy, L.rotate180);
    return { width: W, height: H, data: data, info: L.info };
  }

  function transform(src, W, H, dx, dy, rot) {
    var out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        var nx = x + dx;
        var ny = y + dy;
        if (rot) { nx = W - 1 - nx; ny = H - 1 - ny; }
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) out[ny * W + nx] = 1;
      }
    }
    return out;
  }

  // ── Vector (PDF content stream) output ─────────────────────────────────────
  function n(v) { return (Math.round(v * 10000) / 10000).toString(); }

  function pdfText(str) {
    return '(' + str.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1') + ')';
  }

  /**
   * PDF page content in points. Requires font resource /F1 = Helvetica-Bold.
   * Bars land exactly on the 203-dpi dot grid (1 dot = 0.125 mm).
   */
  function toVector(L) {
    var k = 72 / 25.4 / L.dpm; // points per dot
    var Wpt = L.W * k, Hpt = L.H * k;
    var out = ['q'];
    if (L.rotate180) out.push('-1 0 0 -1 ' + n(Wpt) + ' ' + n(Hpt) + ' cm');
    if (L.dx || L.dy) out.push('1 0 0 1 ' + n(L.dx * k) + ' ' + n(-L.dy * k) + ' cm');
    out.push('0 g');

    var yBottom = (L.H - L.bars.top - L.bars.height) * k;
    var hPt = L.bars.height * k;
    L.bars.runs.forEach(function (r) {
      out.push(n(r[0] * k) + ' ' + n(yBottom) + ' ' + n(r[1] * k) + ' ' + n(hPt) + ' re');
    });
    out.push('f');

    [L.header, L.serial].forEach(function (t) {
      if (!t) return;
      out.push('BT /F1 ' + n(t.size * k) + ' Tf ' + n(t.spacing * k) + ' Tc 1 0 0 1 ' +
        n(t.x * k) + ' ' + n((L.H - t.baseline) * k) + ' Tm ' + pdfText(t.text) + ' Tj ET');
    });
    out.push('Q');
    return out.join('\n');
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  /** 1-bit bitmap: { width, height, data (1 byte per dot, 1 = black), info } */
  function render(text, options) {
    return toBitmap(layout(text, options));
  }

  /** Vector page: { widthMm, heightMm, content (PDF operators), info } */
  function renderVector(text, options) {
    var L = layout(text, options);
    return { widthMm: L.W / L.dpm, heightMm: L.H / L.dpm, content: toVector(L), info: L.info };
  }

  /** Paints a bitmap onto a canvas (scale ≥ 1, nearest-neighbour). */
  function toCanvas(bitmap, scale, canvas) {
    scale = Math.max(1, Math.round(scale || 1));
    var c = canvas || makeCanvas(1, 1);
    c.width = bitmap.width * scale;
    c.height = bitmap.height * scale;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(c.width, c.height);
    var px = img.data;
    var cw = c.width;
    for (var y = 0; y < c.height; y++) {
      var sy = Math.floor(y / scale) * bitmap.width;
      for (var x = 0; x < cw; x++) {
        var v = bitmap.data[sy + Math.floor(x / scale)] ? 0 : 255;
        var i = (y * cw + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  HerdIQ.LabelRenderer = Object.freeze({
    DEFAULTS: DEFAULTS,
    render: render,
    renderVector: renderVector,
    toCanvas: toCanvas
  });
})(window);
