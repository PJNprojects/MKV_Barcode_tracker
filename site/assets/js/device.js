/* Device detail page: device.html?id=S1HCB0321 */
(function () {
  'use strict';

  var HerdIQ = window.HerdIQ;
  var cfg = HerdIQ.config;
  var Serial = HerdIQ.Serial;
  var UI = HerdIQ.UI;
  var h = UI.h;
  var dash = UI.dash;

  var content = document.getElementById('content');
  var params = new URLSearchParams(window.location.search);
  var requested = Serial.fromInput(params.get('id') || '', cfg);

  if (!requested) {
    window.location.replace(new URL('./', cfg.siteRoot).href);
    return;
  }

  function homeUrl(hash) {
    return new URL('./' + (hash || ''), cfg.siteRoot).href;
  }

  function field(label, value, opts) {
    return h('div', { class: 'field' + (opts && opts.wide ? ' field--wide' : '') },
      h('dt', null, label),
      h('dd', { class: opts && opts.mono ? 'mono' : null }, dash(value))
    );
  }

  function section(title, body, extraClass) {
    return h('section', { class: 'card' + (extraClass ? ' ' + extraClass : '') },
      h('h2', { class: 'section-title' }, title),
      body
    );
  }

  // ── States ────────────────────────────────────────────────────────────────
  function renderError(err) {
    document.title = 'Error · HerdIQ';
    content.replaceChildren(
      h('div', { class: 'card state state--error' },
        h('h1', { class: 'state__title' }, 'Could not load this device'),
        h('p', null, err.message || 'Something went wrong.'),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn btn--primary', onclick: load }, 'Try again'),
          h('a', { class: 'btn btn--ghost', href: homeUrl() }, 'All devices')
        )
      )
    );
  }

  function renderNotFound(serial) {
    document.title = serial + ' not found · HerdIQ';
    var parsed = Serial.parse(serial);
    content.replaceChildren(
      h('div', { class: 'card state' },
        h('p', { class: 'eyebrow' }, 'Not registered'),
        h('h1', { class: 'serial-title mono' }, serial),
        parsed
          ? h('p', null, 'This is a valid ' + (parsed.brand || 'HerdIQ') + ' ' + (parsed.product || '') +
              ' serial (sensor v' + parsed.sensorVersion + ', unit ' + parsed.unitNumber + '), but it has not been added to the registry yet.')
          : h('p', null, 'This is not a recognised HerdIQ serial number. Check the label and scan again.'),
        h('div', { class: 'actions' },
          h('a', { class: 'btn btn--primary', href: homeUrl('#scan') }, 'Scan again'),
          h('a', { class: 'btn btn--ghost', href: homeUrl() }, 'All devices')
        )
      )
    );
  }

  // ── Device ────────────────────────────────────────────────────────────────
  function renderDevice(device, meta) {
    var animal = device.animal;
    var parsed = Serial.parse(device.serial);
    document.title = device.serial + (animal && animal.name ? ' · ' + animal.name : '') + ' · HerdIQ';

    var nodes = [];

    if (meta && meta.environment === 'test') {
      nodes.push(h('div', { class: 'banner' },
        h('strong', null, 'Test data. '),
        'Animal details are placeholders until the band is deployed.'));
    }

    nodes.push(
      h('section', { class: 'card card--hero device-hero' },
        h('div', { class: 'device-hero__top' },
          h('p', { class: 'eyebrow' }, [cfg.appName, device.product, device.sensorVersion != null ? 'Sensor v' + device.sensorVersion : null].filter(Boolean).join(' · ')),
          UI.statusPill(device.status)
        ),
        h('h1', { class: 'serial-title mono' }, device.serial),
        animal && animal.name
          ? h('p', { class: 'device-hero__animal' }, 'Fitted to ', h('strong', null, animal.name))
          : h('p', { class: 'device-hero__animal muted' }, 'Not fitted to an animal yet')
      )
    );

    // Live health (placeholder until the PCB data pipeline is connected)
    var healthBody = h('div', { id: 'health' }, h('p', { class: 'muted' }, 'Checking for sensor data…'));
    nodes.push(section('Live health', healthBody));

    if (animal) {
      nodes.push(section('Animal', h('dl', { class: 'fields' },
        field('Name', animal.name),
        field('Tag ID', animal.tagId, { mono: true }),
        field('Species', animal.species),
        field('Breed', animal.breed),
        field('Sex', animal.sex),
        field('Age', animal.ageYears != null ? animal.ageYears + (animal.ageYears === 1 ? ' year' : ' years') : null),
        field('Farm', animal.farm, { wide: true })
      )));
    }

    nodes.push(section('Module', h('dl', { class: 'fields' },
      field('Serial number', device.serial, { mono: true }),
      field('Product', [cfg.appName, device.product].filter(Boolean).join(' ')),
      field('Sensor version', device.sensorVersion != null ? 'v' + device.sensorVersion : null),
      field('Manufactured', UI.formatDate(device.manufacturedOn)),
      field('Batch', device.batch, { mono: true }),
      field('Firmware', device.firmware, { mono: true }),
      parsed ? field('Unit number', parsed.unitNumber, { mono: true }) : null
    )));

    if (device.notes) {
      nodes.push(section('Notes', h('p', { class: 'notes' }, device.notes)));
    }

    nodes.push(h('div', { class: 'actions actions--page' },
      h('a', { class: 'btn btn--primary', href: homeUrl('#scan') }, 'Scan another band'),
      h('a', { class: 'btn btn--ghost', href: homeUrl() }, 'All devices')
    ));

    content.replaceChildren.apply(content, nodes);
    loadHealth(device.serial, healthBody);
  }

  function metric(label, value, unit, hint) {
    return h('div', { class: 'metric' },
      h('span', { class: 'metric__label' }, label),
      h('span', { class: 'metric__value' }, value == null ? '—' : value, value != null && unit ? h('small', null, unit) : null),
      hint ? h('span', { class: 'metric__hint' }, hint) : null
    );
  }

  async function loadHealth(serial, container) {
    var t = null;
    try {
      t = await HerdIQ.Data.getLatestTelemetry(serial);
    } catch (err) {
      container.replaceChildren(h('p', { class: 'muted' }, 'Sensor data is unavailable right now (' + err.message + ').'));
      return;
    }
    if (!t) {
      container.replaceChildren(
        h('div', { class: 'metrics' },
          metric('Body temperature', null),
          metric('Activity', null),
          metric('Battery', null)
        ),
        h('p', { class: 'muted small' }, 'No sensor readings yet. Live temperature and movement data will appear here once the band is connected.')
      );
      return;
    }
    container.replaceChildren(
      h('div', { class: 'metrics' },
        metric('Body temperature', t.bodyTempC != null ? t.bodyTempC.toFixed(1) : null, '°C'),
        metric('Activity', t.activityLabel || (t.activityIndex != null ? Math.round(t.activityIndex) : null), t.activityLabel ? '' : '/100'),
        metric('Battery', t.batteryPct != null ? Math.round(t.batteryPct) : null, '%')
      ),
      t.recordedAt ? h('p', { class: 'muted small' }, 'Last reading: ' + UI.formatDateTime(t.recordedAt)) : null
    );
  }

  async function load() {
    try {
      var res = await HerdIQ.Data.getDevice(requested);
      if (!res.device) renderNotFound(requested);
      else renderDevice(res.device, res.meta);
    } catch (err) {
      renderError(err);
    }
  }

  load();
})();
