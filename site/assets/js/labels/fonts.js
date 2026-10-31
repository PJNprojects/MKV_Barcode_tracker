/*
 * Label fonts. Only the PDF "standard 14" families are offered, because every
 * PDF viewer and printer app can draw them without the font being embedded:
 *
 *   sans  → Helvetica   (screen: Arial / Liberation Sans)
 *   serif → Times       (screen: Times New Roman / Liberation Serif)
 *   mono  → Courier     (screen: Courier New / Liberation Mono)
 *
 * The width tables (Adobe AFM, 1/1000 em, ASCII 32–126) let us centre text
 * exactly the same way in the PDF and on the preview canvas.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

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

  var FAMILIES = {
    sans: {
      label: 'Sans (Arial / Helvetica)',
      css: 'Arial, Helvetica, "Liberation Sans", "Nimbus Sans", sans-serif',
      pdf: { regular: 'Helvetica', bold: 'Helvetica-Bold' }
    },
    serif: {
      label: 'Serif (Times)',
      css: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
      pdf: { regular: 'Times-Roman', bold: 'Times-Bold' }
    },
    mono: {
      label: 'Monospace (Courier)',
      css: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
      pdf: { regular: 'Courier', bold: 'Courier-Bold' }
    }
  };

  function family(key) {
    return FAMILIES[key] || FAMILIES.sans;
  }

  function pdfName(key, bold) {
    var f = family(key).pdf;
    return bold ? f.bold : f.regular;
  }

  function advance(pdfFont, ch) {
    if (pdfFont.indexOf('Courier') === 0) return 600;
    var c = ch.charCodeAt(0);
    var table = W[pdfFont] || W.Helvetica;
    return c >= 32 && c <= 126 ? table[c - 32] : 556;
  }

  /** Width of `str` in the same unit as `size`, with extra `spacing` between characters. */
  function measure(pdfFont, str, size, spacing) {
    var w = 0;
    for (var i = 0; i < str.length; i++) w += advance(pdfFont, str[i]);
    return (w / 1000) * size + (spacing || 0) * Math.max(0, str.length - 1);
  }

  /** Label text is limited to printable ASCII so every printer/PDF app renders it identically. */
  function unsupportedChars(str) {
    var bad = String(str).replace(/[\x20-\x7e]/g, '');
    return bad ? Array.from(new Set(bad.split(''))).join(' ') : '';
  }

  HerdIQ.LabelFonts = Object.freeze({
    FAMILIES: FAMILIES,
    family: family,
    pdfName: pdfName,
    advance: advance,
    measure: measure,
    unsupportedChars: unsupportedChars
  });
})(typeof window !== 'undefined' ? window : globalThis);
