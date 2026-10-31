/*
 * Label renderer → 1-bit bitmap at the printer's native resolution.
 *
 * Why 1-bit at native resolution: a 203-dpi thermal head prints dots, not
 * greys. If we hand it a smooth/anti-aliased image, the driver dithers the
 * edges of every bar and the barcode widths become irregular → poor scans.
 * Rendering each bar as an exact whole number of dots avoids that entirely.
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
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif'
  });

  var MAX_MODULE_DOTS = 4;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

  /** Draws text, shrinking the font until it fits maxWidth. Returns the font size used. */
  function fitText(ctx, text, weight, size, family, maxWidth, minSize) {
    var s = size;
    for (; s > minSize; s--) {
      ctx.font = weight + ' ' + s + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) return s;
    }
    ctx.font = weight + ' ' + minSize + 'px ' + family;
    return minSize;
  }

  /**
   * @param {string} text  data to encode (and print underneath)
   * @param {object} options  see DEFAULTS
   * @returns {{ width:number, height:number, data:Uint8Array, info:object }}
   *          data: one byte per dot, 1 = black
   */
  function renderLabel(text, options) {
    var o = withDefaults(options);
    var dpm = Number(o.dotsPerMm);
    var W = Math.round(Number(o.widthMm) * dpm);
    var H = Math.round(Number(o.heightMm) * dpm);
    if (!(W >= 80 && H >= 64)) throw new Error('Label is too small (minimum 10 × 8 mm).');
    var warnings = [];

    var edge = Math.round(Number(o.edgeMarginMm) * dpm);
    var side = Math.round(Number(o.sideMarginMm) * dpm);
    var contentW = W - 2 * side;

    // ── Barcode geometry ────────────────────────────────────────────────────
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

    // ── Vertical layout: [header] · barcode · serial, spare space shared evenly ──
    var headerSize = o.showHeader && String(o.headerText || '').trim() ? clamp(Math.round(H * 0.2), 14, 64) : 0;
    var serialSize = clamp(Math.round(H * 0.14), 16, 44);
    var minGap = Math.max(4, Math.round(H * 0.025));
    var blocks = headerSize ? 3 : 2;
    var inner = H - 2 * edge;
    var barMax = inner - headerSize - serialSize - (blocks - 1) * minGap;
    var barH = o.barcodeHeightMm === 'auto' ? barMax : Math.min(barMax, Math.round(Number(o.barcodeHeightMm) * dpm));
    if (barH < 4 * dpm) throw new Error('Not enough height for the barcode (needs at least 4 mm). Turn off the header or use a taller label.');
    if (barH < 8 * dpm) warnings.push('Barcode is only ' + (barH / dpm).toFixed(1) + ' mm tall; 8 mm or more scans more easily.');
    var gap = Math.floor((inner - headerSize - barH - serialSize) / (blocks - 1));

    var headerTop = edge;
    var barTop = edge + (headerSize ? headerSize + gap : 0);
    var serialTop = barTop + barH + gap;

    // ── Text (canvas), then threshold to pure black/white ───────────────────
    var canvas = makeCanvas(W, H);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    // Baseline at ~0.86 of the font size puts capital letters inside their block.
    if (headerSize) {
      var headerText = String(o.headerText).trim();
      try { ctx.letterSpacing = Math.round(headerSize * 0.03) + 'px'; } catch (e) { /* older browsers */ }
      var usedHeader = fitText(ctx, headerText, '700', headerSize, o.fontFamily, contentW, 12);
      ctx.fillText(headerText, W / 2, headerTop + Math.round(headerSize * 0.86) - Math.round((headerSize - usedHeader) / 2));
    }

    try { ctx.letterSpacing = Math.round(serialSize * 0.06) + 'px'; } catch (e) { /* older browsers */ }
    var usedSerial = fitText(ctx, text, '700', serialSize, o.fontFamily, contentW, 12);
    ctx.fillText(text, W / 2, serialTop + Math.round(serialSize * 0.86) - Math.round((serialSize - usedSerial) / 2));
    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }

    var img = ctx.getImageData(0, 0, W, H).data;
    var data = new Uint8Array(W * H);
    for (var p = 0, q = 0; p < data.length; p++, q += 4) {
      // Luma threshold at 50 %.
      data[p] = img[q] * 0.299 + img[q + 1] * 0.587 + img[q + 2] * 0.114 < 128 ? 1 : 0;
    }

    // ── Bars, drawn as exact whole dots ─────────────────────────────────────
    var barW = nMod * X;
    var x0 = Math.round((W - barW) / 2);
    for (var y = barTop; y < barTop + barH; y++) {
      var row = y * W;
      for (var x = 0; x < W; x++) data[row + x] = 0; // keep the barcode band clean
      for (var m = 0; m < nMod; m++) {
        if (!symbol.modules[m]) continue;
        var start = row + x0 + m * X;
        for (var d = 0; d < X; d++) data[start + d] = 1;
      }
    }

    // ── Calibration: offset and rotation ────────────────────────────────────
    var dx = Math.round(Number(o.offsetXmm) * dpm);
    var dy = Math.round(Number(o.offsetYmm) * dpm);
    if (dx || dy || o.rotate180) data = transform(data, W, H, dx, dy, !!o.rotate180);

    return {
      width: W,
      height: H,
      data: data,
      info: {
        text: text,
        moduleDots: X,
        moduleMm: X / dpm,
        barcodeWidthMm: barW / dpm,
        barcodeHeightMm: barH / dpm,
        dpi: dpm * 25.4,
        warnings: warnings
      }
    };
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

  HerdIQ.LabelRenderer = Object.freeze({ DEFAULTS: DEFAULTS, render: renderLabel, toCanvas: toCanvas });
})(window);
