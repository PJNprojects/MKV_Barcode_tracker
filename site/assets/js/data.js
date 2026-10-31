/*
 * Data access layer. Pages never fetch directly — they call HerdIQ.Data.*.
 * Switching from the static JSON file to a real backend is a config change
 * (config.js → dataSource: 'api'), not a rewrite.
 *
 * ── Device shape (same for static JSON and API) ─────────────────────────────
 * {
 *   serial:          "S1HCB0321",
 *   product:         "CattleBand",
 *   sensorVersion:   1,
 *   manufacturedOn:  "2026-10-17",           // ISO date
 *   batch:           "2026-10-A",
 *   status:          "testing" | "in-stock" | "deployed" | "maintenance" | "retired",
 *   firmware:        "1.0.0" | null,
 *   animal: {                                 // null when not attached to an animal
 *     name, tagId, species, breed, sex, ageYears, farm
 *   } | null,
 *   notes:           string,
 *   telemetry:       Telemetry | null         // optional in static mode (for demos)
 * }
 *
 * ── Telemetry shape ─────────────────────────────────────────────────────────
 * { recordedAt: ISO datetime, bodyTempC: number, activityIndex: number (0-100),
 *   activityLabel: "Resting" | "Normal" | "High", batteryPct: number }
 *
 * ── API contract (dataSource: 'api') ────────────────────────────────────────
 *   GET {apiBaseUrl}/devices                          → { devices: Device[] }
 *   GET {apiBaseUrl}/devices/{serial}                 → Device        (404 if unknown)
 *   GET {apiBaseUrl}/devices/{serial}/telemetry/latest → Telemetry    (404 if none yet)
 */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});
  var cfg = HerdIQ.config;

  function DataError(message, kind, cause) {
    this.name = 'DataError';
    this.message = message;
    this.kind = kind; // 'network' | 'format' | 'config'
    this.cause = cause;
  }
  DataError.prototype = Object.create(Error.prototype);
  DataError.prototype.constructor = DataError;

  async function fetchJson(url, opts) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, cfg.requestTimeoutMs);
    var res;
    try {
      res = await fetch(url, {
        cache: 'no-cache', // always revalidate, so edits to devices.json show up immediately
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } catch (err) {
      throw new DataError(
        err && err.name === 'AbortError'
          ? 'The server took too long to respond. Check your internet connection.'
          : 'Could not reach the server. Check your internet connection.',
        'network',
        err
      );
    } finally {
      clearTimeout(timer);
    }
    if (opts && opts.allow404 && res.status === 404) return null;
    if (!res.ok) throw new DataError('Server responded with HTTP ' + res.status + '.', 'network');
    try {
      return await res.json();
    } catch (err) {
      throw new DataError('The server sent data in an unexpected format.', 'format', err);
    }
  }

  // ── Normalisation: never let a malformed record crash a page ──────────────
  function str(v) { return v == null ? '' : String(v); }
  function numOrNull(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }

  function normalizeAnimal(a) {
    if (!a || typeof a !== 'object') return null;
    return {
      name: str(a.name),
      tagId: str(a.tagId),
      species: str(a.species),
      breed: str(a.breed),
      sex: str(a.sex),
      ageYears: numOrNull(a.ageYears),
      farm: str(a.farm)
    };
  }

  function normalizeTelemetry(t) {
    if (!t || typeof t !== 'object') return null;
    return {
      recordedAt: str(t.recordedAt),
      bodyTempC: numOrNull(t.bodyTempC),
      activityIndex: numOrNull(t.activityIndex),
      activityLabel: str(t.activityLabel),
      batteryPct: numOrNull(t.batteryPct)
    };
  }

  function normalizeDevice(d) {
    if (!d || typeof d !== 'object' || !d.serial) return null;
    var parsed = HerdIQ.Serial.parse(d.serial);
    return {
      serial: HerdIQ.Serial.normalize(d.serial),
      product: str(d.product) || (parsed && parsed.product) || '',
      sensorVersion: numOrNull(d.sensorVersion) != null ? numOrNull(d.sensorVersion) : parsed ? parsed.sensorVersion : null,
      manufacturedOn: str(d.manufacturedOn),
      batch: str(d.batch),
      status: str(d.status) || 'in-stock',
      firmware: d.firmware == null ? null : str(d.firmware),
      animal: normalizeAnimal(d.animal),
      notes: str(d.notes),
      telemetry: normalizeTelemetry(d.telemetry)
    };
  }

  // ── Static source (data/devices.json) ─────────────────────────────────────
  var staticCache = null;

  function loadStatic() {
    if (!staticCache) {
      var url = new URL(cfg.staticDataPath, cfg.siteRoot).href;
      staticCache = fetchJson(url).then(function (json) {
        if (!json || !Array.isArray(json.devices)) {
          throw new DataError('devices.json is missing its "devices" list.', 'format');
        }
        var byId = new Map();
        var list = [];
        json.devices.forEach(function (raw) {
          var d = normalizeDevice(raw);
          if (d && !byId.has(d.serial)) {
            byId.set(d.serial, d);
            list.push(d);
          }
        });
        return { meta: { environment: str(json.environment), updatedAt: str(json.updatedAt) }, list: list, byId: byId };
      });
      // Allow a retry after a failed load instead of caching the failure.
      staticCache.catch(function () { staticCache = null; });
    }
    return staticCache;
  }

  // ── API source ────────────────────────────────────────────────────────────
  function api(path) {
    if (!cfg.apiBaseUrl) throw new DataError('config.js: apiBaseUrl is empty but dataSource is "api".', 'config');
    return cfg.apiBaseUrl.replace(/\/+$/, '') + path;
  }

  // ── Public interface ──────────────────────────────────────────────────────
  async function listDevices() {
    if (cfg.dataSource === 'api') {
      var json = await fetchJson(api('/devices'));
      var list = (json && Array.isArray(json.devices) ? json.devices : []).map(normalizeDevice).filter(Boolean);
      return { meta: { environment: str(json && json.environment), updatedAt: '' }, devices: list };
    }
    var data = await loadStatic();
    return { meta: data.meta, devices: data.list.slice() };
  }

  async function getDevice(serial) {
    var id = HerdIQ.Serial.normalize(serial);
    if (!id) return { meta: {}, device: null };
    if (cfg.dataSource === 'api') {
      var raw = await fetchJson(api('/devices/' + encodeURIComponent(id)), { allow404: true });
      return { meta: {}, device: normalizeDevice(raw) };
    }
    var data = await loadStatic();
    return { meta: data.meta, device: data.byId.get(id) || null };
  }

  /** Latest sensor reading for a device, or null if none is available yet. */
  async function getLatestTelemetry(serial) {
    var id = HerdIQ.Serial.normalize(serial);
    if (cfg.dataSource === 'api') {
      var raw = await fetchJson(api('/devices/' + encodeURIComponent(id) + '/telemetry/latest'), { allow404: true });
      return normalizeTelemetry(raw);
    }
    var res = await getDevice(id);
    return res.device ? res.device.telemetry : null;
  }

  HerdIQ.Data = Object.freeze({
    listDevices: listDevices,
    getDevice: getDevice,
    getLatestTelemetry: getLatestTelemetry,
    DataError: DataError
  });
})(window);
