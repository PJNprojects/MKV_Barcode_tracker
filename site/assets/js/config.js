/*
 * HerdIQ site configuration — the ONLY file you should need to edit when the
 * backend changes. Everything else reads from here.
 *
 * Today:   dataSource = 'static'  → devices are read from data/devices.json
 * Future:  dataSource = 'api'     → devices + live sensor data come from your
 *                                   backend at apiBaseUrl (see data.js for the
 *                                   exact endpoints and response shape).
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  // Resolve the site root from this script's own URL so the site works at a
  // domain root (herdiq.netlify.app/) AND inside a sub-folder of another
  // website (example.com/herdiq/) without changing any paths.
  var thisScript = document.currentScript;
  var siteRoot = thisScript
    ? new URL('../../', thisScript.src).href
    : new URL('./', root.location.href).href;

  HerdIQ.config = Object.freeze({
    appName: 'HerdIQ',
    productName: 'CattleBand',

    /** 'static' | 'api' */
    dataSource: 'static',

    /** Used when dataSource === 'static'. Relative to the site root. */
    staticDataPath: 'data/devices.json',

    /**
     * Used when dataSource === 'api'. No trailing slash.
     * e.g. 'https://api.vayamdesigners.com/herdiq/v1'
     */
    apiBaseUrl: '',

    /** Lets workers type just "321" instead of "S1HCB0321". */
    defaultSerialPrefix: 'S1HCB',
    serialDigits: 4,

    /** Network timeout (ms) for every data request. */
    requestTimeoutMs: 10000,

    siteRoot: siteRoot
  });
})(window);
