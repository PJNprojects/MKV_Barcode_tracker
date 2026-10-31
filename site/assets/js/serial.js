/*
 * Serial number rules for HerdIQ hardware.
 *
 *   S1 H CB 0321
 *   │  │ │  └── unit number (zero-padded, 4 digits)
 *   │  │ └───── product code   CB = CattleBand
 *   │  └─────── brand code     H  = HerdIQ
 *   └────────── sensor version S1 = sensor hardware v1
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  var BRANDS = { H: 'HerdIQ' };
  var PRODUCTS = { CB: 'CattleBand' };
  var PATTERN = /^S(\d{1,2})([A-Z])([A-Z]{2})(\d{4})$/;

  function normalize(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .toUpperCase()
      .replace(/[\s_-]+/g, '');
  }

  /** Returns the structured meaning of a serial, or null if it is not a HerdIQ serial. */
  function parse(raw) {
    var serial = normalize(raw);
    var m = PATTERN.exec(serial);
    if (!m) return null;
    return {
      serial: serial,
      sensorVersion: parseInt(m[1], 10),
      brandCode: m[2],
      brand: BRANDS[m[2]] || null,
      productCode: m[3],
      product: PRODUCTS[m[3]] || null,
      unitNumber: m[4]
    };
  }

  function isValid(raw) {
    return parse(raw) !== null;
  }

  function build(prefix, number, digits) {
    var n = String(Math.trunc(Number(number)));
    if (!/^\d+$/.test(n)) throw new Error('Serial number must be a non-negative integer');
    if (n.length > digits) throw new Error('Number ' + n + ' does not fit in ' + digits + ' digits');
    return normalize(prefix) + n.padStart(digits, '0');
  }

  /**
   * Turns whatever a worker typed or a scanner returned into a serial:
   *   "s1hcb0321"            → "S1HCB0321"
   *   "321" / "0321"          → "S1HCB0321"  (uses configured default prefix)
   *   ".../device.html?id=X"  → "X"          (future QR codes containing a URL)
   */
  function fromInput(raw, cfg) {
    var text = String(raw == null ? '' : raw).trim();
    if (!text) return '';

    if (/^https?:\/\//i.test(text)) {
      try {
        var url = new URL(text);
        var id = url.searchParams.get('id');
        if (id) return normalize(id);
        var last = url.pathname.split('/').filter(Boolean).pop();
        if (last) return normalize(last);
      } catch (e) {
        /* fall through and treat as plain text */
      }
    }

    var cleaned = normalize(text);
    if (cfg && /^\d{1,6}$/.test(cleaned) && cleaned.length <= cfg.serialDigits) {
      return build(cfg.defaultSerialPrefix, cleaned, cfg.serialDigits);
    }
    return cleaned;
  }

  HerdIQ.Serial = Object.freeze({
    normalize: normalize,
    parse: parse,
    isValid: isValid,
    build: build,
    fromInput: fromInput
  });
})(typeof window !== 'undefined' ? window : globalThis);
