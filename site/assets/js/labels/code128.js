/*
 * Code 128 encoder (ISO/IEC 15417) — code sets B and C, with optimal
 * set switching (dynamic programming → shortest possible barcode).
 *
 *   HerdIQ.Code128.encode('S1HCB0321')
 *   → { text, codes: [104, ...], modules: Uint8Array(1 = bar, 0 = space) }
 *
 * Works in browsers and Node (for tests).
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  // Bar/space widths for symbol values 0..105, then STOP (106). Standard table.
  var PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  var CODE_C = 99, CODE_B = 100, START_B = 104, START_C = 105, STOP = 106;
  var B = 0, C = 1;

  function isDigit(ch) { return ch >= 48 && ch <= 57; }

  /** Symbol values (start … data, without checksum/stop) using the fewest symbols. */
  function optimalCodes(text) {
    var n = text.length;
    var chars = new Array(n);
    for (var i = 0; i < n; i++) {
      var c = text.charCodeAt(i);
      if (c < 32 || c > 126) {
        throw new Error('Code 128 label text supports printable ASCII only; found character code ' + c + ' at position ' + (i + 1));
      }
      chars[i] = c;
    }
    function pairAt(i) { return i + 1 < n && isDigit(chars[i]) && isDigit(chars[i + 1]); }

    // cost[i][set] = min symbols to encode chars[i..] when currently in `set`.
    var INF = 1e9;
    var cost = [];
    for (i = 0; i <= n; i++) cost.push([INF, INF]);
    cost[n][B] = 0;
    cost[n][C] = 0;
    for (i = n - 1; i >= 0; i--) {
      var stayB = 1 + cost[i + 1][B];
      var stayC = pairAt(i) ? 1 + cost[i + 2][C] : INF;
      cost[i][B] = Math.min(stayB, 1 + stayC); // optionally switch B→C
      cost[i][C] = Math.min(stayC, 1 + stayB); // optionally switch C→B
    }

    var codes = [];
    var set;
    var startC = pairAt(0) ? 1 + cost[2][C] : INF;
    if (n > 0 && startC < 1 + cost[1][B]) { set = C; codes.push(START_C); }
    else { set = B; codes.push(START_B); }

    i = 0;
    while (i < n) {
      var bCost = 1 + cost[i + 1][B];
      var cCost = pairAt(i) ? 1 + cost[i + 2][C] : INF;
      if (set === B) {
        if (cCost + 1 < bCost) { codes.push(CODE_C); set = C; continue; }
        codes.push(chars[i] - 32);
        i += 1;
      } else {
        if (cCost <= bCost + 1) {
          codes.push((chars[i] - 48) * 10 + (chars[i + 1] - 48));
          i += 2;
        } else {
          codes.push(CODE_B); set = B;
        }
      }
    }
    return codes;
  }

  function checksum(codes) {
    var sum = codes[0];
    for (var i = 1; i < codes.length; i++) sum += codes[i] * i;
    return sum % 103;
  }

  function encode(text) {
    text = String(text);
    if (!text.length) throw new Error('Barcode text is empty');
    var codes = optimalCodes(text);
    codes.push(checksum(codes));
    codes.push(STOP);

    var bits = [];
    codes.forEach(function (v) {
      var widths = PATTERNS[v];
      for (var k = 0; k < widths.length; k++) {
        var bar = k % 2 === 0 ? 1 : 0;
        for (var w = 0; w < +widths[k]; w++) bits.push(bar);
      }
    });
    return { text: text, codes: codes, modules: Uint8Array.from(bits) };
  }

  HerdIQ.Code128 = Object.freeze({ encode: encode, QUIET_ZONE_MODULES: 10 });
})(typeof window !== 'undefined' ? window : globalThis);
