/*
 * Camera barcode scanner.
 *
 * Engine selection (automatic):
 *   1. Native BarcodeDetector (Chrome/Edge on Android, Samsung Internet) — fast, battery friendly.
 *   2. ZXing (bundled locally in assets/vendor, loaded only when needed) — iPhone Safari,
 *      Firefox and any browser without BarcodeDetector.
 *
 * Reads Code 128 (the printed labels) and QR (future-proofing: a QR containing
 * a device URL is resolved to its serial by HerdIQ.Serial.fromInput).
 *
 * Camera access requires HTTPS (Netlify provides it) or http://localhost.
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});
  var cfg = HerdIQ.config;

  var ZXING_PATH = 'assets/vendor/zxing/zxing-0.21.3.min.js';
  var NATIVE_FORMATS = ['code_128', 'qr_code'];
  var CONFIRM_HITS = 2;            // identical reads required before accepting (guards against partial reads)
  var CONFIRM_WINDOW_MS = 1500;
  var NATIVE_INTERVAL_MS = 60;
  var ZXING_INTERVAL_MS = 120;
  var ZXING_MAX_WIDTH = 1280;      // downscale large frames: faster, and thin bars still resolve

  function ScanError(code, message, cause) {
    this.name = 'ScanError';
    this.code = code;
    this.message = message;
    this.cause = cause;
  }
  ScanError.prototype = Object.create(Error.prototype);
  ScanError.prototype.constructor = ScanError;

  function toScanError(err) {
    if (err instanceof ScanError) return err;
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return new ScanError('denied', 'Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.', err);
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return new ScanError('no-camera', 'No usable camera was found on this device.', err);
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      return new ScanError('busy', 'The camera is being used by another app. Close it and try again.', err);
    }
    return new ScanError('unknown', 'The camera could not be started' + (err && err.message ? ': ' + err.message : '.'), err);
  }

  // ── ZXing lazy loader ─────────────────────────────────────────────────────
  var zxingPromise = null;
  function loadZxing() {
    if (root.ZXing) return Promise.resolve(root.ZXing);
    if (!zxingPromise) {
      zxingPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = new URL(ZXING_PATH, cfg.siteRoot).href;
        s.async = true;
        s.onload = function () {
          root.ZXing ? resolve(root.ZXing) : reject(new ScanError('engine', 'Barcode engine failed to initialise.'));
        };
        s.onerror = function () {
          zxingPromise = null;
          reject(new ScanError('engine', 'Barcode engine could not be downloaded. Check your connection.'));
        };
        document.head.appendChild(s);
      });
    }
    return zxingPromise;
  }

  // ── Engines ───────────────────────────────────────────────────────────────
  async function createNativeEngine() {
    if (!('BarcodeDetector' in root)) return null;
    try {
      var supported = await root.BarcodeDetector.getSupportedFormats();
      var formats = NATIVE_FORMATS.filter(function (f) { return supported.indexOf(f) !== -1; });
      if (formats.indexOf('code_128') === -1) return null;
      var detector = new root.BarcodeDetector({ formats: formats });
      return {
        name: 'native',
        interval: NATIVE_INTERVAL_MS,
        detect: async function (video) {
          var found = await detector.detect(video);
          return found && found.length ? found[0].rawValue : null;
        }
      };
    } catch (e) {
      return null; // fall back to ZXing
    }
  }

  async function createZxingEngine() {
    var Z = await loadZxing();
    var hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.QR_CODE]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    var reader = new Z.MultiFormatReader();
    reader.setHints(hints);

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    return {
      name: 'zxing',
      interval: ZXING_INTERVAL_MS,
      detect: async function (video, crop) {
        var scale = Math.min(1, ZXING_MAX_WIDTH / crop.w);
        var w = Math.max(1, Math.round(crop.w * scale));
        var hgt = Math.max(1, Math.round(crop.h * scale));
        if (canvas.width !== w || canvas.height !== hgt) {
          canvas.width = w;
          canvas.height = hgt;
        }
        ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, w, hgt);
        try {
          var source = new Z.HTMLCanvasElementLuminanceSource(canvas);
          var bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(source));
          return reader.decodeWithState(bitmap).getText();
        } catch (e) {
          return null; // NotFound / Checksum / Format → simply no barcode in this frame
        }
      }
    };
  }

  // ── Scanner ───────────────────────────────────────────────────────────────
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {HTMLElement} [opts.guide]  the on-screen target box; ZXing only looks inside it
   * @param {(text:string, engine:string)=>void} opts.onDetect
   */
  function Scanner(opts) {
    this.video = opts.video;
    this.guide = opts.guide || null;
    this.onDetect = opts.onDetect;
    this.stream = null;
    this.track = null;
    this.engine = null;
    this.running = false;
    this._timer = null;
    this._last = null;
    this._hits = 0;
    this._lastAt = 0;
  }

  Scanner.isSupported = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  Scanner.prototype.start = async function () {
    if (this.running) return;
    if (!root.isSecureContext) {
      throw new ScanError('insecure', 'The camera only works on a secure (https://) page. Open the live website instead of a local file.');
    }
    if (!Scanner.isSupported()) {
      throw new ScanError('unsupported', 'This browser cannot access the camera. Use Chrome or Safari, or type the serial number instead.');
    }

    var video = this.video;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;

    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
      } catch (err) {
        if (err && err.name === 'OverconstrainedError') {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else {
          throw err;
        }
      }
      video.srcObject = this.stream;
      await video.play();
    } catch (err) {
      this._releaseCamera();
      throw toScanError(err);
    }

    this.track = this.stream.getVideoTracks()[0] || null;
    this._tuneCamera();

    try {
      this.engine = (await createNativeEngine()) || (await createZxingEngine());
    } catch (err) {
      this._releaseCamera();
      throw toScanError(err);
    }

    this.running = true;
    this._schedule(0);
  };

  /**
   * Best-effort camera tuning (silently ignored where unsupported):
   *  - continuous autofocus
   *  - a mild 1.5x zoom, so the phone can be held far enough away to focus
   *    while the thin bars still cover enough camera pixels.
   */
  Scanner.prototype._tuneCamera = function () {
    var track = this.track;
    if (!track || !track.applyConstraints) return;
    var caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) { caps = {}; }
    var advanced = [];
    if (caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) advanced.push({ focusMode: 'continuous' });
    if (caps.zoom && caps.zoom.max >= 1.5) advanced.push({ zoom: Math.max(caps.zoom.min || 1, 1.5) });
    advanced.forEach(function (c) { track.applyConstraints({ advanced: [c] }).catch(function () {}); });
  };

  Scanner.prototype.stop = function () {
    this.running = false;
    clearTimeout(this._timer);
    this._timer = null;
    this._releaseCamera();
  };

  Scanner.prototype._releaseCamera = function () {
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    this.track = null;
    if (this.video) this.video.srcObject = null;
  };

  Scanner.prototype.hasTorch = function () {
    try {
      var caps = this.track && this.track.getCapabilities ? this.track.getCapabilities() : null;
      return !!(caps && caps.torch);
    } catch (e) {
      return false;
    }
  };

  Scanner.prototype.setTorch = function (on) {
    if (!this.track) return Promise.resolve(false);
    return this.track.applyConstraints({ advanced: [{ torch: !!on }] }).then(
      function () { return true; },
      function () { return false; }
    );
  };

  Scanner.prototype._schedule = function (delay) {
    var self = this;
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { self._tick(); }, delay);
  };

  Scanner.prototype._tick = async function () {
    if (!this.running) return;
    var video = this.video;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      var text = null;
      try {
        text = await this.engine.detect(video, this._cropRect());
      } catch (e) {
        text = null;
      }
      if (!this.running) return;
      if (text && this._confirm(text)) {
        var engineName = this.engine.name;
        this.stop();
        if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(80);
        this.onDetect(text, engineName);
        return;
      }
    }
    this._schedule(this.engine.interval);
  };

  Scanner.prototype._confirm = function (text) {
    var now = Date.now();
    if (text === this._last && now - this._lastAt < CONFIRM_WINDOW_MS) {
      this._hits += 1;
    } else {
      this._last = text;
      this._hits = 1;
    }
    this._lastAt = now;
    return this._hits >= CONFIRM_HITS;
  };

  /** Maps the on-screen guide box to source-video pixels (video uses object-fit: cover). */
  Scanner.prototype._cropRect = function () {
    var video = this.video;
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    var full = { x: 0, y: 0, w: vw, h: vh };
    if (!this.guide) return full;

    var vr = video.getBoundingClientRect();
    var gr = this.guide.getBoundingClientRect();
    if (!vr.width || !vr.height || !gr.width || !gr.height) return full;

    var scale = Math.max(vr.width / vw, vr.height / vh);
    var offX = (vw - vr.width / scale) / 2;
    var offY = (vh - vr.height / scale) / 2;
    // Pad the guide by 15% so a slightly misaligned label is still read.
    var padX = gr.width * 0.15;
    var padY = gr.height * 0.15;
    var x = offX + (gr.left - vr.left - padX) / scale;
    var y = offY + (gr.top - vr.top - padY) / scale;
    var w = (gr.width + 2 * padX) / scale;
    var h = (gr.height + 2 * padY) / scale;

    x = Math.max(0, Math.floor(x));
    y = Math.max(0, Math.floor(y));
    w = Math.min(vw - x, Math.ceil(w));
    h = Math.min(vh - y, Math.ceil(h));
    return w > 16 && h > 16 ? { x: x, y: y, w: w, h: h } : full;
  };

  HerdIQ.Scanner = Scanner;
  HerdIQ.ScanError = ScanError;
})(window);
