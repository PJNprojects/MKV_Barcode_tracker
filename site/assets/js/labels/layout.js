/*
 * Label layout engine.
 *
 *   layout(template, serial, ctx) → a "display list" in printer dots
 *   (origin top-left, 1 dot = 0.125 mm), plus warnings.
 *
 * The same display list feeds three outputs, so they can never disagree:
 *   drawCanvas()  – on-screen preview (any zoom)
 *   toBitmap()    – 1-bit image at exactly 203 dpi (PNG export, "printer dots" preview)
 *   toPdfPage()   – vector PDF page: real fonts + rectangles snapped to the dot grid
 *
 * Bars and QR modules are always whole dots wide; a 203-dpi head cannot print
 * fractions of a dot, and uneven bars are what make thermal barcodes unreadable.
 *
 * Arrangement (top → bottom, spare height shared evenly between rows):
 *   [logo + title]
 *   [barcode | QR | QR + barcode]
 *   [serial number]
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});
  var Fonts = HerdIQ.LabelFonts;
  var T = HerdIQ.LabelTemplates;

  var BASELINE = 0.86;       // text baseline within its row, as a fraction of font size
  var QR_QUIET = 2;          // QR quiet zone in modules (label edges / gap provide the rest)
  var MAX_BAR_DOTS = 4;

  function LayoutError(message) { this.name = 'LayoutError'; this.message = message; }
  LayoutError.prototype = Object.create(Error.prototype);

  function mm(v, dpm) { return Math.round(v * dpm); }

  // ── Logo rasterising (cached) ─────────────────────────────────────────────
  var logoCache = new Map();

  /** Loads a data-URL image. Resolves to an HTMLImageElement. */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('The logo image could not be read.')); };
      img.src = src;
    });
  }

  function rasterizeLogo(img, w, h, threshold) {
    var key = img.src.length + ':' + img.src.slice(-64) + ':' + w + 'x' + h + ':' + threshold;
    if (logoCache.has(key)) return logoCache.get(key);
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data;
    var data = new Uint8Array(w * h);
    var cut = (threshold / 100) * 255;
    for (var i = 0, j = 0; i < data.length; i++, j += 4) {
      // transparent pixels count as white
      var a = px[j + 3] / 255;
      var lum = (px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114) * a + 255 * (1 - a);
      data[i] = lum < cut ? 1 : 0;
    }
    if (logoCache.size > 50) logoCache.clear();
    logoCache.set(key, data);
    return data;
  }

  // ── Text helpers ──────────────────────────────────────────────────────────
  /**
   * Prepares a line of text. Standard fonts become PDF text; any other font is
   * turned into vector outlines (identical in preview and PDF).
   * @param {string} fontKey resolved font key ('sans', 'g:roboto', 'u:…')
   */
  function makeText(str, cfg, fontKey, maxWidth, dpm, warnings, what) {
    var ratio = cfg.spacing / 100;
    var size = cfg.sizeMm * dpm;
    var desc = Fonts.describe(fontKey);
    var entry = null;

    if (!desc) {
      warnings.push(what + ': the chosen font is not on this device, so Arial/Helvetica is used. Add the font (Customize → font → “Add your own font”) or pick another.');
      fontKey = 'sans';
    } else if (desc.kind === 'outline') {
      entry = Fonts.getLoaded(fontKey, cfg.bold);
      if (!entry) {
        warnings.push(what + ': loading the “' + desc.label + '” font…');
        fontKey = 'sans';
      }
    }

    if (entry) {
      var font = entry.font;
      var miss = Fonts.missingChars(font, str);
      if (miss.length) warnings.push(what + ': the “' + desc.label + '” font has no drawing for ' + miss.join(' ') + ' — those characters will be blank. Pick another font.');
      var stroke = entry.fakeBold ? size * 0.035 : 0; // fonts without a bold file get a thin outline stroke
      var shaped = Fonts.shape(font, str, size, size * ratio);
      if (shaped.width + stroke > maxWidth) {
        size *= maxWidth / (shaped.width + stroke);
        stroke = entry.fakeBold ? size * 0.035 : 0;
        shaped = Fonts.shape(font, str, size, size * ratio);
        warnings.push(what + ' was too wide and has been shrunk to ' + (size / dpm).toFixed(1) + ' mm to fit.');
      }
      return {
        kind: 'outline', str: str, font: font, shaped: shaped, size: size, stroke: stroke,
        width: shaped.width + stroke, baselineRatio: 0.5 + Fonts.capHeight(font) / 2
      };
    }

    var pdfFont = Fonts.pdfName(fontKey, cfg.bold);
    var width = Fonts.measure(pdfFont, str, size, size * ratio);
    if (width > maxWidth) {
      size *= maxWidth / width;
      width = maxWidth;
      warnings.push(what + ' was too wide and has been shrunk to ' + (size / dpm).toFixed(1) + ' mm to fit.');
    }
    return { kind: 'standard', str: str, pdfFont: pdfFont, family: fontKey, bold: cfg.bold, size: size, spacing: size * ratio, width: width, baselineRatio: BASELINE };
  }

  function alignX(align, width, side, W) {
    if (align === 'left') return side;
    if (align === 'right') return W - side - width;
    return (W - width) / 2;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  /**
   * @param {object} tpl     normalized template
   * @param {string} serial  e.g. "S1HCB0381"
   * @param {object} [ctx]   { logoImage: HTMLImageElement|null, siteRoot: string }
   */
  function layout(tpl, serial, ctx) {
    ctx = ctx || {};
    var dpm = T.LABEL.dotsPerMm;
    var W = Math.round(T.LABEL.widthMm * dpm);
    var H = Math.round(T.LABEL.heightMm * dpm);
    var edge = mm(tpl.layout.edgeMm, dpm);
    var side = mm(tpl.layout.sideMm, dpm);
    var contentW = W - 2 * side;
    var warnings = [];
    var rows = [];
    var info = { serial: serial };

    // ── Title row (optional logo + optional text) ──
    var titleText = tpl.title.show ? String(tpl.title.text || '').trim() : '';
    var logoImg = tpl.logo.show && tpl.logo.image ? ctx.logoImage || null : null;
    if (tpl.logo.show && tpl.logo.image && !logoImg) warnings.push('Logo image is still loading or could not be read.');
    if (titleText || logoImg) {
      var bad = Fonts.unsupportedChars(titleText);
      if (bad) throw new LayoutError('Title contains characters the printer fonts cannot show: ' + bad + '. Use English letters, numbers and basic symbols.');
      var logo = null;
      if (logoImg) {
        var lh = Math.max(1, mm(tpl.logo.heightMm, dpm));
        var lw = Math.max(1, Math.round(lh * (logoImg.naturalWidth / logoImg.naturalHeight)));
        if (lw > contentW) {
          lh = Math.max(1, Math.round(lh * (contentW / lw)));
          lw = contentW;
          warnings.push('Logo was too wide and has been scaled down.');
        }
        logo = { w: lw, h: lh, data: rasterizeLogo(logoImg, lw, lh, tpl.logo.threshold) };
      }
      var lgap = logo && titleText ? mm(tpl.logo.gapMm, dpm) : 0;
      var text = titleText ? makeText(titleText, tpl.title, tpl.title.font, contentW - (logo ? logo.w + lgap : 0), dpm, warnings, 'Title') : null;
      rows.push({
        kind: 'title',
        h: Math.max(text ? Math.round(text.size) : 0, logo ? logo.h : 0),
        logo: logo,
        text: text,
        gap: lgap
      });
    }

    // ── Subtitle row (second line of text, sits close under the title) ──
    var subText = tpl.subtitle.show ? String(tpl.subtitle.text || '').trim() : '';
    if (subText) {
      var badSub = Fonts.unsupportedChars(subText);
      if (badSub) throw new LayoutError('Subtitle contains characters the printer fonts cannot show: ' + badSub + '. Use English letters, numbers and basic symbols.');
      var subFont = tpl.subtitle.font === 'same' ? tpl.title.font : tpl.subtitle.font;
      var subt = makeText(subText, tpl.subtitle, subFont, contentW, dpm, warnings, 'Subtitle');
      rows.push({ kind: 'subtitle', h: Math.round(subt.size), text: subt, fixedGapAbove: rows.length ? mm(tpl.subtitle.gapMm, dpm) : null });
    }

    // ── Code row ──
    var type = tpl.code.type;
    if (type !== 'none') {
      var hasBar = type === 'barcode' || type === 'both';
      var hasQr = type === 'qr' || type === 'both';
      var sym = hasBar ? HerdIQ.Code128.encode(serial) : null;
      var nMod = sym ? sym.modules.length : 0;

      var qr = null;
      if (hasQr) {
        if (typeof root.qrcode !== 'function') throw new LayoutError('QR engine failed to load. Reload the page.');
        var content = tpl.code.qrContent === 'link'
          ? new URL('device.html?id=' + encodeURIComponent(serial), ctx.siteRoot || HerdIQ.config.siteRoot).href
          : serial;
        var isAlnum = /^[0-9A-Z $%*+\-./:]*$/.test(content);
        var q = root.qrcode(0, tpl.code.qrContent === 'link' ? 'M' : 'Q');
        q.addData(content, isAlnum ? 'Alphanumeric' : 'Byte');
        q.make();
        var count = q.getModuleCount();
        qr = { q: q, count: count, content: content, m: Math.max(1, Math.floor(mm(tpl.code.qrSizeMm, dpm) / count)) };
        info.qrContent = content;
      }

      var userGap = mm(tpl.code.gapMm, dpm);
      var forcedX = tpl.code.barWidth === 'auto' ? 0 : parseInt(tpl.code.barWidth, 10);

      // Width of the whole code group for a bar width X and QR module m.
      var groupWidth = function (X, m) {
        var bw = hasBar ? nMod * X : 0;
        var qw = hasQr ? qr.count * m : 0;
        var gap = hasBar && hasQr ? Math.max(userGap, 10 * X) : 0; // barcode needs a 10-bar quiet zone beside the QR
        return { total: bw + qw + gap, bw: bw, qw: qw, gap: gap };
      };
      // Fits inside the content area, with the barcode's outer quiet zone (10 bars) inside the label.
      var fits = function (X, m) {
        var g = groupWidth(X, m);
        return g.total <= contentW && (!hasBar || (W - g.total) / 2 >= 10 * X);
      };

      var X = 0;
      var m = qr ? qr.m : 0;
      if (hasBar) {
        for (;;) {
          if (forcedX) X = fits(forcedX, m) ? forcedX : 0;
          else for (X = MAX_BAR_DOTS; X >= 1 && !fits(X, m); X--) { /* find widest */ }
          var tooThin = !forcedX && X < 2;
          if (X >= 1 && !tooThin) break;
          if (hasQr && m > 2) { m--; continue; } // shrink QR to make room for proper bars
          if (X < 1) {
            throw new LayoutError(forcedX
              ? 'Bars ' + forcedX + ' dots thick do not fit on a 50 mm label. Choose "Auto" or a thinner bar width.'
              : 'Barcode does not fit. Reduce the QR size or the gap.');
          }
          break;
        }
        if (X < 2) warnings.push('Bars are only 1 dot (0.125 mm) thick — phones may struggle to scan them.');
      } else if (hasQr) {
        while (m > 1 && qr.count * m > contentW) m--;
      }
      if (qr) {
        if (m < qr.m) warnings.push('QR code reduced to ' + ((qr.count * m) / dpm).toFixed(1) + ' mm so everything fits.');
        if (m < 2) warnings.push('QR squares are only 1 dot — too small to scan reliably. Make the QR bigger.');
        qr.m = m;
      }

      var g = groupWidth(X, m);
      var barH = hasBar ? mm(tpl.code.barcodeHeightMm, dpm) : 0;
      var qrSize = qr ? qr.count * m : 0;
      rows.push({
        kind: 'code',
        h: Math.max(barH, qrSize),
        X: X, barH: barH, sym: sym, nMod: nMod, qr: qr, qrSize: qrSize, g: g, hasBar: hasBar, hasQr: hasQr
      });
      info.barWidthDots = X;
      info.barcodeMm = hasBar ? [(nMod * X) / dpm, barH / dpm] : null;
      info.qrMm = qr ? qrSize / dpm : null;
    }

    // ── Serial row ──
    if (tpl.serial.show) {
      var serialFont = tpl.serial.font === 'same' ? tpl.title.font : tpl.serial.font;
      var stext = makeText(serial, tpl.serial, serialFont, contentW, dpm, warnings, 'Serial number');
      rows.push({ kind: 'serial', h: Math.round(stext.size), text: stext });
    }

    // ── Vertical distribution ──
    var inner = H - 2 * edge;
    var used = rows.reduce(function (s, r) { return s + r.h; }, 0);
    var fixedGaps = rows.reduce(function (s, r, i) { return s + (i > 0 && r.fixedGapAbove != null ? r.fixedGapAbove : 0); }, 0);
    var flexGaps = rows.filter(function (r, i) { return i > 0 && r.fixedGapAbove == null; }).length;
    var free = inner - used - fixedGaps;
    if (free < 0) {
      throw new LayoutError('Everything together is ' + ((used / dpm) + 2 * tpl.layout.edgeMm).toFixed(1) +
        ' mm tall, but the label is only 30 mm. Make the title, subtitle, barcode/QR or serial number smaller.');
    }
    if (!rows.length) warnings.push('The label is empty — turn on at least one element.');
    var between = flexGaps > 0 ? free / flexGaps : 0;
    var y = edge + (flexGaps === 0 ? free / 2 : 0);
    rows.forEach(function (r, i) {
      if (i > 0) y += r.fixedGapAbove != null ? r.fixedGapAbove : between;
      r.top = Math.round(y);
      y += r.h;
    });

    // ── Emit display list ──
    var items = [];
    rows.forEach(function (r) {
      if (r.kind === 'title') {
        var dx = mm(tpl.title.dxMm, dpm), dy = mm(tpl.title.dyMm, dpm);
        var tw = (r.logo ? r.logo.w : 0) + r.gap + (r.text ? r.text.width : 0);
        var x = Math.round(alignX(tpl.title.align, tw, side, W)) + dx;
        var logoFirst = tpl.logo.position !== 'right';
        var parts = logoFirst ? ['logo', 'text'] : ['text', 'logo'];
        parts.forEach(function (p) {
          if (p === 'logo' && r.logo) {
            items.push({ type: 'bits', x: x, y: r.top + dy + Math.round((r.h - r.logo.h) / 2), w: r.logo.w, h: r.logo.h, data: r.logo.data });
            x += r.logo.w + r.gap;
          } else if (p === 'text' && r.text) {
            var tt = r.text;
            items.push(textItem(tt, x, r.top + dy + (r.h - tt.size) / 2 + tt.size * tt.baselineRatio));
            x += tt.width + r.gap;
          }
        });
      } else if (r.kind === 'code') {
        var cdx = mm(tpl.code.dxMm, dpm), cdy = mm(tpl.code.dyMm, dpm);
        var gx = Math.round((W - r.g.total) / 2) + cdx;
        var qrFirst = tpl.code.qrPosition !== 'right';
        var qrX, barX;
        if (r.hasBar && r.hasQr) {
          qrX = qrFirst ? gx : gx + r.g.bw + r.g.gap;
          barX = qrFirst ? gx + r.g.qw + r.g.gap : gx;
        } else {
          qrX = gx;
          barX = gx;
        }
        if (r.hasBar) {
          var by = r.top + cdy + Math.round((r.h - r.barH) / 2);
          var mods = r.sym.modules;
          for (var i = 0; i < r.nMod; i++) {
            if (!mods[i]) continue;
            var s = i;
            while (i + 1 < r.nMod && mods[i + 1]) i++;
            items.push({ type: 'rect', x: barX + s * r.X, y: by, w: (i - s + 1) * r.X, h: r.barH });
          }
        }
        if (r.hasQr) {
          var qy = r.top + cdy + Math.round((r.h - r.qrSize) / 2);
          var qm = r.qr.m, qn = r.qr.count, qq = r.qr.q;
          for (var row = 0; row < qn; row++) {
            for (var col = 0; col < qn; col++) {
              if (!qq.isDark(row, col)) continue;
              var c0 = col;
              while (col + 1 < qn && qq.isDark(row, col + 1)) col++;
              items.push({ type: 'rect', x: qrX + c0 * qm, y: qy + row * qm, w: (col - c0 + 1) * qm, h: qm });
            }
          }
        }
      } else if (r.kind === 'subtitle') {
        var su = r.text;
        var sux = alignX(tpl.subtitle.align, su.width, side, W) + mm(tpl.subtitle.dxMm, dpm);
        items.push(textItem(su, sux, r.top + mm(tpl.subtitle.dyMm, dpm) + su.size * su.baselineRatio));
      } else if (r.kind === 'serial') {
        var st = r.text;
        var sx = alignX(tpl.serial.align, st.width, side, W) + mm(tpl.serial.dxMm, dpm);
        items.push(textItem(st, sx, r.top + mm(tpl.serial.dyMm, dpm) + st.size * st.baselineRatio));
      }
    });

    // Anything pushed off the label by the "move" sliders?
    var off = items.some(function (it) {
      var b = bounds(it);
      return b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > W + 0.5 || b.y1 > H + 0.5;
    });
    if (off) warnings.push('Part of the design is outside the label edge and will be cut off.');

    return { W: W, H: H, dpm: dpm, items: items, warnings: warnings, info: info };
  }

  function textItem(t, x, baseline) {
    if (t.kind === 'outline') {
      // Glyph outlines in printer dots (y down). Stroke = synthetic bold width.
      var cmds = [];
      var off = t.stroke / 2;
      t.shaped.glyphs.forEach(function (g, i) {
        var p = g.getPath(x + off + t.shaped.pos[i], baseline, t.size);
        for (var j = 0; j < p.commands.length; j++) cmds.push(p.commands[j]);
      });
      return { type: 'path', cmds: cmds, stroke: t.stroke, x: x, width: t.width, baseline: baseline, size: t.size };
    }
    return { type: 'text', str: t.str, pdfFont: t.pdfFont, family: t.family, bold: t.bold, size: t.size, spacing: t.spacing, width: t.width, x: x, baseline: baseline };
  }

  function bounds(it) {
    if (it.type === 'text') return { x0: it.x, y0: it.baseline - it.size * 0.75, x1: it.x + it.width, y1: it.baseline + it.size * 0.21 };
    if (it.type === 'path') {
      var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      it.cmds.forEach(function (c) {
        ['', '1', '2'].forEach(function (s) {
          var px = c['x' + s], py = c['y' + s];
          if (px == null) return;
          if (px < b.x0) b.x0 = px; if (px > b.x1) b.x1 = px;
          if (py < b.y0) b.y0 = py; if (py > b.y1) b.y1 = py;
        });
      });
      if (b.x0 === Infinity) return { x0: it.x, y0: it.baseline, x1: it.x, y1: it.baseline };
      var h = it.stroke / 2;
      return { x0: b.x0 - h, y0: b.y0 - h, x1: b.x1 + h, y1: b.y1 + h };
    }
    return { x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h };
  }

  // ── Output 1: canvas (preview) ────────────────────────────────────────────
  /**
   * Draws a label onto a 2D context at `scale` canvas pixels per printer dot.
   * opts.calibration applies the printer alignment shift (used for exports).
   */
  function drawCanvas(g, label, scale, opts) {
    opts = opts || {};
    g.save();
    g.fillStyle = '#fff';
    g.fillRect(0, 0, label.W * scale, label.H * scale);
    applyCalibration(g, label, scale, opts.calibration);
    g.fillStyle = '#000';

    var path = new Path2D(); // one path for all bars/modules → no hairline seams between them
    label.items.forEach(function (it) {
      if (it.type === 'rect') path.rect(it.x * scale, it.y * scale, it.w * scale, it.h * scale);
    });
    g.fill(path);

    label.items.forEach(function (it) {
      if (it.type === 'path') {
        var p = new Path2D();
        it.cmds.forEach(function (c) {
          if (c.type === 'M') p.moveTo(c.x * scale, c.y * scale);
          else if (c.type === 'L') p.lineTo(c.x * scale, c.y * scale);
          else if (c.type === 'Q') p.quadraticCurveTo(c.x1 * scale, c.y1 * scale, c.x * scale, c.y * scale);
          else if (c.type === 'C') p.bezierCurveTo(c.x1 * scale, c.y1 * scale, c.x2 * scale, c.y2 * scale, c.x * scale, c.y * scale);
          else if (c.type === 'Z') p.closePath();
        });
        g.fill(p, 'nonzero');
        if (it.stroke) {
          g.lineWidth = it.stroke * scale;
          g.lineJoin = 'round';
          g.strokeStyle = '#000';
          g.stroke(p);
        }
      } else if (it.type === 'text') {
        g.font = (it.bold ? '700 ' : '400 ') + it.size * scale + 'px ' + Fonts.cssFamily(it.family);
        g.textBaseline = 'alphabetic';
        g.textAlign = 'left';
        var x = it.x;
        for (var i = 0; i < it.str.length; i++) {
          var ch = it.str[i];
          g.fillText(ch, x * scale, it.baseline * scale);
          x += (Fonts.advance(it.pdfFont, ch) / 1000) * it.size + it.spacing;
        }
      } else if (it.type === 'bits') {
        g.drawImage(bitsCanvas(it), it.x * scale, it.y * scale, it.w * scale, it.h * scale);
      }
    });
    g.restore();
  }

  var bitsCanvasCache = new WeakMap();
  function bitsCanvas(it) {
    var c = bitsCanvasCache.get(it.data);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = it.w;
    c.height = it.h;
    var g = c.getContext('2d');
    var img = g.createImageData(it.w, it.h);
    for (var i = 0; i < it.data.length; i++) {
      img.data[i * 4 + 3] = it.data[i] ? 255 : 0; // black where set, transparent elsewhere
    }
    g.putImageData(img, 0, 0);
    bitsCanvasCache.set(it.data, c);
    return c;
  }

  function applyCalibration(g, label, scale, cal) {
    if (!cal) return;
    if (cal.rotate180) {
      g.translate(label.W * scale, label.H * scale);
      g.rotate(Math.PI);
    }
    g.translate(Math.round(cal.dxMm * label.dpm) * scale, Math.round(cal.dyMm * label.dpm) * scale);
  }

  // ── Output 2: 1-bit bitmap at 203 dpi ─────────────────────────────────────
  function toBitmap(label, calibration) {
    var c = document.createElement('canvas');
    c.width = label.W;
    c.height = label.H;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    drawCanvas(g, label, 1, { calibration: calibration });
    var px = g.getImageData(0, 0, label.W, label.H).data;
    var data = new Uint8Array(label.W * label.H);
    for (var i = 0, j = 0; i < data.length; i++, j += 4) {
      data[i] = px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114 < 128 ? 1 : 0;
    }
    return { width: label.W, height: label.H, data: data };
  }

  /** Paints a 1-bit bitmap onto a canvas (nearest-neighbour). */
  function bitmapToCanvas(bm, canvas) {
    var c = canvas || document.createElement('canvas');
    c.width = bm.width;
    c.height = bm.height;
    var g = c.getContext('2d');
    var img = g.createImageData(bm.width, bm.height);
    for (var i = 0; i < bm.data.length; i++) {
      var v = bm.data[i] ? 0 : 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ── Output 3: vector PDF page ─────────────────────────────────────────────
  function num(v) { return String(Math.round(v * 10000) / 10000); }
  function pdfStr(s) { return '(' + s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1') + ')'; }

  /** Outline commands (dots, y down) → PDF path operators (points, y up). Quadratics become cubics. */
  function pdfPath(cmds, k, Hpt) {
    var out = [];
    var cx = 0, cy = 0, sx = 0, sy = 0;
    function P(x, y) { return num(x * k) + ' ' + num(Hpt - y * k); }
    cmds.forEach(function (c) {
      if (c.type === 'M') { out.push(P(c.x, c.y) + ' m'); cx = sx = c.x; cy = sy = c.y; }
      else if (c.type === 'L') { out.push(P(c.x, c.y) + ' l'); cx = c.x; cy = c.y; }
      else if (c.type === 'C') { out.push(P(c.x1, c.y1) + ' ' + P(c.x2, c.y2) + ' ' + P(c.x, c.y) + ' c'); cx = c.x; cy = c.y; }
      else if (c.type === 'Q') {
        var c1x = cx + (2 / 3) * (c.x1 - cx), c1y = cy + (2 / 3) * (c.y1 - cy);
        var c2x = c.x + (2 / 3) * (c.x1 - c.x), c2y = c.y + (2 / 3) * (c.y1 - c.y);
        out.push(P(c1x, c1y) + ' ' + P(c2x, c2y) + ' ' + P(c.x, c.y) + ' c');
        cx = c.x; cy = c.y;
      } else if (c.type === 'Z') { out.push('h'); cx = sx; cy = sy; }
    });
    return out.join('\n');
  }

  /**
   * @returns {{ content: string, fonts: string[], images: Array<{width,height,data}> }}
   *   Fonts are referenced as /<PDF font name>, images as /Im0, /Im1 …
   */
  function toPdfPage(label, calibration) {
    var k = 72 / 25.4 / label.dpm; // points per dot
    var Hpt = label.H * k;
    var out = ['q'];
    if (calibration) {
      if (calibration.rotate180) out.push('-1 0 0 -1 ' + num(label.W * k) + ' ' + num(Hpt) + ' cm');
      var dx = Math.round(calibration.dxMm * label.dpm), dy = Math.round(calibration.dyMm * label.dpm);
      if (dx || dy) out.push('1 0 0 1 ' + num(dx * k) + ' ' + num(-dy * k) + ' cm');
    }
    out.push('0 g');

    var rects = label.items.filter(function (it) { return it.type === 'rect'; });
    if (rects.length) {
      rects.forEach(function (it) {
        out.push(num(it.x * k) + ' ' + num(Hpt - (it.y + it.h) * k) + ' ' + num(it.w * k) + ' ' + num(it.h * k) + ' re');
      });
      out.push('f');
    }

    var fonts = [];
    var images = [];
    label.items.forEach(function (it) {
      if (it.type === 'text') {
        if (fonts.indexOf(it.pdfFont) === -1) fonts.push(it.pdfFont);
        out.push('BT /' + it.pdfFont + ' ' + num(it.size * k) + ' Tf ' + num(it.spacing * k) + ' Tc 1 0 0 1 ' +
          num(it.x * k) + ' ' + num(Hpt - it.baseline * k) + ' Tm ' + pdfStr(it.str) + ' Tj ET');
      } else if (it.type === 'path') {
        // Graphics-state operators must come before the path is built, never inside it.
        if (it.stroke) out.push('q ' + num(it.stroke * k) + ' w 1 j 1 J 0 G');
        out.push(pdfPath(it.cmds, k, Hpt));
        out.push(it.stroke ? 'B Q' : 'f');
      } else if (it.type === 'bits') {
        var name = 'Im' + images.length;
        images.push({ width: it.w, height: it.h, data: it.data });
        out.push('q ' + num(it.w * k) + ' 0 0 ' + num(it.h * k) + ' ' + num(it.x * k) + ' ' + num(Hpt - (it.y + it.h) * k) + ' cm /' + name + ' Do Q');
      }
    });
    out.push('Q');
    return { content: out.join('\n'), fonts: fonts, images: images };
  }

  // ── Alignment test page ───────────────────────────────────────────────────
  /**
   * A border 4 mm inside the label edge (stays on the page for any shift up to ±4 mm),
   * a centre cross and 1 mm ruler ticks.
   */
  function alignmentTestLabel() {
    var dpm = T.LABEL.dotsPerMm;
    var W = T.LABEL.widthMm * dpm, H = T.LABEL.heightMm * dpm;
    var t = 2; // line thickness (dots)
    var inset = 4 * dpm; // 4 mm
    var items = [
      { type: 'rect', x: inset, y: inset, w: W - 2 * inset, h: t },
      { type: 'rect', x: inset, y: H - inset - t, w: W - 2 * inset, h: t },
      { type: 'rect', x: inset, y: inset, w: t, h: H - 2 * inset },
      { type: 'rect', x: W - inset - t, y: inset, w: t, h: H - 2 * inset },
      { type: 'rect', x: W / 2 - 1, y: H / 2 - 4 * dpm, w: t, h: 8 * dpm },
      { type: 'rect', x: W / 2 - 4 * dpm, y: H / 2 - 1, w: 8 * dpm, h: t }
    ];
    for (var mmx = -18; mmx <= 18; mmx++) {
      var len = mmx % 5 === 0 ? 3 * dpm : 1.5 * dpm;
      items.push({ type: 'rect', x: W / 2 + mmx * dpm - 1, y: inset + t, w: t, h: len });
    }
    var font = Fonts.pdfName('sans', true);
    var size = 2.4 * dpm;
    var str = 'ALIGNMENT TEST';
    var wdt = Fonts.measure(font, str, size, 0);
    items.push({ type: 'text', str: str, pdfFont: font, family: 'sans', bold: true, size: size, spacing: 0, width: wdt, x: (W - wdt) / 2, baseline: H - inset - 2 * dpm });
    return { W: W, H: H, dpm: dpm, items: items, warnings: [], info: {} };
  }

  HerdIQ.LabelLayout = Object.freeze({
    layout: layout,
    loadImage: loadImage,
    drawCanvas: drawCanvas,
    toBitmap: toBitmap,
    bitmapToCanvas: bitmapToCanvas,
    toPdfPage: toPdfPage,
    alignmentTestLabel: alignmentTestLabel,
    LayoutError: LayoutError
  });
})(window);
