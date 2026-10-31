/* Home page: scanner, manual serial entry, searchable device list. */
(function () {
  'use strict';

  var HerdIQ = window.HerdIQ;
  var cfg = HerdIQ.config;
  var Serial = HerdIQ.Serial;
  var UI = HerdIQ.UI;
  var h = UI.h;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    banner: $('test-banner'),
    scanBtn: $('scan-btn'),
    form: $('serial-form'),
    input: $('serial-input'),
    formError: $('serial-error'),
    filter: $('filter-input'),
    list: $('device-list'),
    count: $('device-count'),
    scanner: $('scanner'),
    video: $('scanner-video'),
    guide: $('scanner-guide'),
    close: $('scanner-close'),
    torch: $('scanner-torch'),
    hint: $('scanner-hint'),
    error: $('scanner-error'),
    errorText: $('scanner-error-text'),
    retry: $('scanner-retry'),
    typeInstead: $('scanner-type')
  };

  function deviceUrl(serial) {
    return new URL('device.html?id=' + encodeURIComponent(serial), cfg.siteRoot).href;
  }

  function openDevice(serial) {
    window.location.assign(deviceUrl(serial));
  }

  // ── Manual entry ──────────────────────────────────────────────────────────
  function showFormError(msg) {
    els.formError.textContent = msg || '';
    UI.show(els.formError, !!msg);
    els.input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var serial;
    try {
      serial = Serial.fromInput(els.input.value, cfg);
    } catch (err) {
      showFormError(err.message);
      return;
    }
    if (!serial) return showFormError('Enter a serial number, e.g. S1HCB0321.');
    if (!Serial.isValid(serial)) return showFormError('"' + serial + '" is not a valid HerdIQ serial (expected format S1HCB0321).');
    showFormError('');
    openDevice(serial);
  });
  els.input.addEventListener('input', function () { showFormError(''); });

  // ── Scanner ───────────────────────────────────────────────────────────────
  var scanner = new HerdIQ.Scanner({ video: els.video, guide: els.guide, onDetect: onDetect });
  var torchOn = false;

  function setScannerState(state, message) {
    els.scanner.dataset.state = state; // starting | scanning | error
    UI.show(els.error, state === 'error');
    UI.show(els.hint, state !== 'error');
    if (state === 'error') els.errorText.textContent = message;
    else els.hint.textContent = message || '';
  }

  async function startScanner() {
    setScannerState('starting', 'Starting camera…');
    UI.show(els.torch, false);
    torchOn = false;
    els.torch.setAttribute('aria-pressed', 'false');
    try {
      await scanner.start();
      setScannerState('scanning', 'Fit the barcode inside the box — about 10 cm (4 in) from the label.');
      UI.show(els.torch, scanner.hasTorch());
    } catch (err) {
      setScannerState('error', err.message || 'The camera could not be started.');
    }
  }

  function openScanner() {
    els.scanner.hidden = false;
    document.body.classList.add('no-scroll');
    els.close.focus();
    startScanner();
  }

  function closeScanner() {
    scanner.stop();
    els.scanner.hidden = true;
    document.body.classList.remove('no-scroll');
    // Drop the deep-link markers so a reload doesn't reopen the camera.
    var p = new URLSearchParams(window.location.search);
    if (window.location.hash === '#scan' || p.has('scan')) {
      p.delete('scan');
      var qs = p.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
  }

  function onDetect(text) {
    var serial = Serial.fromInput(text, cfg);
    if (Serial.isValid(serial)) {
      setScannerState('scanning', 'Found ' + serial + ' — opening…');
      openDevice(serial);
    } else {
      setScannerState('error', 'Scanned "' + text + '", which is not a HerdIQ barcode.');
    }
  }

  els.scanBtn.addEventListener('click', openScanner);
  els.close.addEventListener('click', closeScanner);
  els.retry.addEventListener('click', startScanner);
  els.typeInstead.addEventListener('click', function () {
    closeScanner();
    els.input.focus();
  });
  els.torch.addEventListener('click', async function () {
    var ok = await scanner.setTorch(!torchOn);
    if (ok) {
      torchOn = !torchOn;
      els.torch.setAttribute('aria-pressed', String(torchOn));
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !els.scanner.hidden) closeScanner();
  });
  // Release the camera when the app is backgrounded (saves battery, frees the camera).
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && !els.scanner.hidden) closeScanner();
  });
  // Coming back via the browser Back button from a device page: make sure the camera is off.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && !els.scanner.hidden) closeScanner();
  });

  // ── Device list ───────────────────────────────────────────────────────────
  var allDevices = [];

  function haystack(d) {
    var a = d.animal || {};
    return [d.serial, a.name, a.tagId, a.farm, a.breed, d.status].join(' ').toLowerCase();
  }

  function renderList() {
    var q = els.filter.value.trim().toLowerCase();
    var qSerial = Serial.normalize(q).toLowerCase();
    var shown = !q ? allDevices : allDevices.filter(function (d) {
      var text = haystack(d);
      return text.indexOf(q) !== -1 || (qSerial && text.indexOf(qSerial) !== -1);
    });

    els.count.textContent = q ? '(' + shown.length + ' of ' + allDevices.length + ')' : '(' + allDevices.length + ')';
    els.list.replaceChildren();

    if (!shown.length) {
      els.list.appendChild(h('p', { class: 'muted' }, q ? 'No devices match "' + els.filter.value.trim() + '".' : 'No devices registered yet.'));
      return;
    }

    var frag = document.createDocumentFragment();
    shown.forEach(function (d) {
      frag.appendChild(
        h('a', { class: 'device-row', href: deviceUrl(d.serial) },
          h('span', { class: 'device-row__serial mono' }, d.serial),
          h('span', { class: 'device-row__animal' }, d.animal && d.animal.name ? d.animal.name : 'Not assigned'),
          UI.statusPill(d.status)
        )
      );
    });
    els.list.appendChild(frag);
  }

  function renderListError(err) {
    els.count.textContent = '';
    els.list.replaceChildren(
      h('div', { class: 'state state--error' },
        h('p', null, err.message || 'Could not load devices.'),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: loadDevices }, 'Retry')
      )
    );
  }

  async function loadDevices() {
    els.list.replaceChildren(h('p', { class: 'muted' }, 'Loading devices…'));
    try {
      var res = await HerdIQ.Data.listDevices();
      allDevices = res.devices;
      UI.show(els.banner, res.meta.environment === 'test');
      renderList();
    } catch (err) {
      renderListError(err);
    }
  }

  var filterTimer = null;
  els.filter.addEventListener('input', function () {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(renderList, 80);
  });

  loadDevices();

  // Deep link: index.html#scan or ?scan=1 opens the camera straight away
  // (used by the "Add to Home screen" shortcut).
  var params = new URLSearchParams(window.location.search);
  if (window.location.hash === '#scan' || params.get('scan') === '1') openScanner();
  window.addEventListener('hashchange', function () {
    if (window.location.hash === '#scan' && els.scanner.hidden) openScanner();
  });
})();
