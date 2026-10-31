/*
 * File exporters for the label tool — no third-party libraries.
 *   PDF  : one label per page, page size = label size, 1-bit image at native dpi,
 *          /PrintScaling /None so PDF viewers default to "Actual size".
 *   PNG  : 1-bit black/white, with a pHYs chunk declaring 203.2 dpi.
 *   ZIP  : "stored" (uncompressed) archive — PDFs/PNGs are already compressed.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});
  var enc = new TextEncoder();

  // ── CRC-32 ────────────────────────────────────────────────────────────────
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, seed) {
    var c = seed === undefined ? 0xffffffff : seed;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return c;
  }
  function crc32Final(bytes) { return (crc32(bytes) ^ 0xffffffff) >>> 0; }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function concat(parts) {
    var len = 0;
    parts.forEach(function (p) { len += p.length; });
    var out = new Uint8Array(len);
    var o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Packs a 1-byte-per-dot bitmap (1 = black) into PDF DeviceGray 1-bit rows (bit 1 = white). */
  function packBits(bitmap) {
    var W = bitmap.width, H = bitmap.height;
    var rowBytes = Math.ceil(W / 8);
    var out = new Uint8Array(rowBytes * H).fill(0xff);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (bitmap.data[y * W + x]) out[y * rowBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
      }
    }
    return out;
  }

  function pdfString(s) {
    return '(' + String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1') + ')';
  }

  function pdfDate(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return 'D:' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  /**
   * @param {Array<{width,height,data}>} bitmaps
   * @param {{widthMm:number, heightMm:number, title?:string}} page
   * @returns {Promise<Blob>}
   */
  async function buildPdf(bitmaps, page) {
    if (!bitmaps.length) throw new Error('Nothing to export.');
    var wPt = (page.widthMm * 72) / 25.4;
    var hPt = (page.heightMm * 72) / 25.4;
    var fmt = function (n) { return n.toFixed(4).replace(/\.?0+$/, ''); };

    // Object numbers: 1 catalog, 2 pages, 3 info, then (page, contents, image) per label.
    var objs = [];
    var kids = [];
    var nPages = bitmaps.length;
    for (var i = 0; i < nPages; i++) kids.push(4 + i * 3 + ' 0 R');

    objs[1] = enc.encode('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>');
    objs[2] = enc.encode('<< /Type /Pages /Count ' + nPages + ' /Kids [' + kids.join(' ') + '] >>');
    objs[3] = enc.encode('<< /Title ' + pdfString(page.title || 'Labels') + ' /Producer (HerdIQ label tool) /CreationDate ' + pdfString(pdfDate(new Date())) + ' >>');

    var contentStream = enc.encode('q ' + fmt(wPt) + ' 0 0 ' + fmt(hPt) + ' 0 0 cm /Im0 Do Q');

    for (i = 0; i < nPages; i++) {
      var b = bitmaps[i];
      var pageNo = 4 + i * 3, contentNo = pageNo + 1, imageNo = pageNo + 2;
      objs[pageNo] = enc.encode(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + fmt(wPt) + ' ' + fmt(hPt) + ']' +
        ' /Resources << /XObject << /Im0 ' + imageNo + ' 0 R >> >> /Contents ' + contentNo + ' 0 R >>'
      );
      objs[contentNo] = concat([
        enc.encode('<< /Length ' + contentStream.length + ' >>\nstream\n'),
        contentStream,
        enc.encode('\nendstream')
      ]);
      var raw = packBits(b);
      var packed = await deflate(raw);
      var filter = packed ? ' /Filter /FlateDecode' : '';
      var body = packed || raw;
      objs[imageNo] = concat([
        enc.encode('<< /Type /XObject /Subtype /Image /Width ' + b.width + ' /Height ' + b.height +
          ' /ColorSpace /DeviceGray /BitsPerComponent 1 /Interpolate false' + filter +
          ' /Length ' + body.length + ' >>\nstream\n'),
        body,
        enc.encode('\nendstream')
      ]);
    }

    var parts = [enc.encode('%PDF-1.4\n'), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
    var offset = parts[0].length + parts[1].length;
    var offsets = [];
    for (var n = 1; n < objs.length; n++) {
      offsets[n] = offset;
      var head = enc.encode(n + ' 0 obj\n');
      var tail = enc.encode('\nendobj\n');
      parts.push(head, objs[n], tail);
      offset += head.length + objs[n].length + tail.length;
    }

    var xref = 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (n = 1; n < objs.length; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';
    parts.push(enc.encode(xref));

    return new Blob([concat(parts)], { type: 'application/pdf' });
  }

  // ── PNG ───────────────────────────────────────────────────────────────────
  /** Returns PNG bytes with a pHYs chunk (dots per metre) inserted after IHDR. */
  async function buildPng(canvas, dotsPerMm) {
    var blob = await new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG encoding failed')); }, 'image/png');
    });
    var png = new Uint8Array(await blob.arrayBuffer());
    var ppm = Math.round(dotsPerMm * 1000);
    var chunk = new Uint8Array(21);
    var dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set(enc.encode('pHYs'), 4);
    dv.setUint32(8, ppm);
    dv.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    dv.setUint32(17, crc32Final(chunk.subarray(4, 17)));
    var ihdrEnd = 8 + 8 + 13 + 4; // signature + IHDR(len,type) + data + crc
    return concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
  }

  // ── ZIP (stored) ──────────────────────────────────────────────────────────
  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  /** @param {Array<{name:string, data:Uint8Array}>} files */
  function buildZip(files) {
    var dt = dosDateTime(new Date());
    var locals = [];
    var centrals = [];
    var offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var crc = crc32Final(f.data);
      var size = f.data.length;

      var lh = new Uint8Array(30);
      var l = new DataView(lh.buffer);
      l.setUint32(0, 0x04034b50, true);
      l.setUint16(4, 20, true);
      l.setUint16(6, 0x0800, true); // UTF-8 names
      l.setUint16(8, 0, true);      // stored
      l.setUint16(10, dt.time, true);
      l.setUint16(12, dt.date, true);
      l.setUint32(14, crc, true);
      l.setUint32(18, size, true);
      l.setUint32(22, size, true);
      l.setUint16(26, name.length, true);
      l.setUint16(28, 0, true);
      locals.push(lh, name, f.data);

      var ch = new Uint8Array(46);
      var c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, dt.time, true);
      c.setUint16(14, dt.date, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, size, true);
      c.setUint32(24, size, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      centrals.push(ch, name);

      offset += 30 + name.length + size;
    });

    var cdSize = centrals.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array(22);
    var e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, offset, true);

    return new Blob([concat(locals.concat(centrals, [end]))], { type: 'application/zip' });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  HerdIQ.Export = Object.freeze({
    buildPdf: buildPdf,
    buildPng: buildPng,
    buildZip: buildZip,
    download: download,
    crc32: crc32Final
  });
})(window);
