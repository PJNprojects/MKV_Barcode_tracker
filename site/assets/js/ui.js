/* Small, dependency-free UI helpers shared by all pages. */
(function (root) {
  'use strict';

  var HerdIQ = (root.HerdIQ = root.HerdIQ || {});

  /**
   * Safe DOM builder — text is always inserted as text, never as HTML.
   *   h('a', { href: '#', class: 'btn' }, 'Go', h('span', null, '!'))
   */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(parent, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** "2026-10-17" → "17 Oct 2026". Parsed manually so time zones can never shift the day. */
  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return iso || '';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  var STATUS = {
    testing: { label: 'Testing', tone: 'info' },
    'in-stock': { label: 'In stock', tone: 'neutral' },
    deployed: { label: 'Deployed', tone: 'ok' },
    maintenance: { label: 'Maintenance', tone: 'warn' },
    retired: { label: 'Retired', tone: 'muted' }
  };

  function statusPill(status) {
    var s = STATUS[status] || { label: status || 'Unknown', tone: 'neutral' };
    return h('span', { class: 'pill pill--' + s.tone }, s.label);
  }

  function dash(v) {
    return v == null || v === '' ? '—' : v;
  }

  function show(el, visible) {
    el.hidden = !visible;
  }

  HerdIQ.UI = Object.freeze({
    h: h,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    statusPill: statusPill,
    dash: dash,
    show: show
  });
})(window);
