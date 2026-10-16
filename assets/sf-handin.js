/* Sydney Foundation Course Portal · hand-in helper.
   Sends a finished practice set to the course service and waits for its receipt. There is no second
   destination: if the service cannot be reached, send() rejects, the page keeps the draft and the
   request ID, and nothing is marked as submitted. The learner page shows only a receipt or a retry
   message — never an answer, a mark or a key. */
(function (global) {
  'use strict';
  // Written by backend/tools/write_site_config.mjs after the student deployment exists. While it is
  // empty every send() fails closed rather than pretending the work was received.
  var SERVICE_URL = 'https://script.google.com/macros/s/AKfycbzpIlJzwZvcr6Xp2ImgFFEHFUdWgxHsgAFSDerzEnQc0ZWh0eKtabn8GbuYzKdagXxI/exec';
  var REQUEST_PREFIX = 'sf02-handin-request:';
  var PREVIEW_KEY = 'sf02-tp';
  var TIMEOUT_MS = 25000;

  function previewToken() {
    var m = /[?&]tp=(\d{10}\.[a-f0-9]{40})(?:&|$)/.exec(global.location.search || '');
    try {
      if (m) global.sessionStorage.setItem(PREVIEW_KEY, m[1]);
      return m ? m[1] : (global.sessionStorage.getItem(PREVIEW_KEY) || '');
    } catch (e) { return m ? m[1] : ''; }
  }

  function randomId() {
    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // One request ID per unfinished hand-in, kept until it is confirmed, so a retry is never stored twice.
  function requestId(key) {
    try {
      var saved = global.localStorage.getItem(REQUEST_PREFIX + key);
      if (/^[a-f0-9]{32}$/.test(saved || '')) return saved;
      var id = randomId();
      global.localStorage.setItem(REQUEST_PREFIX + key, id);
      return id;
    } catch (e) { return randomId(); }
  }
  function forget(key) { try { global.localStorage.removeItem(REQUEST_PREFIX + key); } catch (e) { /* nothing kept */ } }

  function timedFetch(url, options) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    return global.fetch(url, Object.assign({ credentials: 'omit', signal: ctrl ? ctrl.signal : undefined }, options))
      .then(function (r) { clearTimeout(timer); return r.text(); }, function (e) { clearTimeout(timer); throw e; })
      .then(function (text) { try { return JSON.parse(text); } catch (e) { return null; } });
  }

  // If the POST answer could not be read, the hand-in may still have been stored. Ask for the receipt
  // under the same request ID before reporting a failure.
  function confirmReceipt(id) {
    return timedFetch(SERVICE_URL + '?action=getReceipt&requestId=' + encodeURIComponent(id), { method: 'GET' })
      .then(function (j) { return j && j.ok && j.found && j.result && j.result.receiptId ? j.result : null; })
      .catch(function () { return null; });
  }

  function configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(SERVICE_URL);
  }

  // opts: key, assignmentId, answers {itemId: value}, notes {itemId: value}.
  // Resolves only with a server receipt: { ok, via: 'service', receiptId, duplicate }.
  function send(opts) {
    if (!configured()) return Promise.reject(new Error('The hand-in service is not configured yet.'));
    var id = requestId(opts.key);
    var body = {
      action: 'submit', requestId: id, assignmentId: opts.assignmentId,
      answers: opts.answers || {}, notes: opts.notes || {}, clientTime: new Date().toISOString(),
      page: global.location.pathname + global.location.hash, previewToken: previewToken()
    };
    return timedFetch(SERVICE_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .catch(function () { return null; })
      .then(function (j) { return j && j.ok && j.receiptId ? j : confirmReceipt(id); })
      .then(function (receipt) {
        if (!receipt || !receipt.receiptId) throw new Error('The service did not confirm this hand-in.');
        forget(opts.key);
        return { ok: true, via: 'service', receiptId: receipt.receiptId, duplicate: Boolean(receipt.duplicate) };
      });
  }

  function showPreviewNote() {
    if (!previewToken() || global.document.getElementById('sfPreviewNote')) return;
    var note = global.document.createElement('div');
    note.id = 'sfPreviewNote';
    note.setAttribute('role', 'note');
    note.textContent = 'Teacher preview: hand-ins from this page are saved as tests.';
    note.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;max-width:calc(100% - 24px);padding:8px 12px;border-radius:10px;background:#faf0d9;color:#84570f;font:700 13px/1.4 Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.15)';
    global.document.body.appendChild(note);
  }

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', showPreviewNote);
    else showPreviewNote();
  }
  global.SFPortalHandin = { send: send, isPreview: function () { return Boolean(previewToken()); }, isConfigured: configured };
})(window);
