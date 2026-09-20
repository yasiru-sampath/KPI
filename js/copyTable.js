/* ============================================================
   Copy Table
   Adds a "Copy table" button above every alarm table in the
   preview. The copy includes the header row (with
   Occurred On (NT) and Cleared On (NT)) and every data row.

   Clipboard gets two formats:
     - text/html   -> pastes as a formatted table in Word / Outlook / Excel
     - text/plain  -> tab-separated, pastes into Excel / Notepad / chat
   ============================================================ */
(function () {
  'use strict';

  // Columns the copied table is expected to contain (matched loosely).
  var EXPECTED_COLUMNS = [
    { label: 'Occurred On (NT)', test: /occurred/i },
    { label: 'Cleared On (NT)',  test: /cleared/i }
  ];

  /* ---------- helpers ---------- */
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tsvCell(s) { return /["\t\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toArray(list) { return Array.prototype.slice.call(list); }

  /* ---------- build clipboard payload from a <table> ---------- */
  function buildPayload(table) {
    var rows = toArray(table.rows);

    var matrix = rows.map(function (tr) {
      return toArray(tr.cells).map(function (c) { return norm(c.textContent); });
    });

    var tsv = matrix.map(function (r) { return r.map(tsvCell).join('\t'); }).join('\r\n');

    var htmlRows = rows.map(function (tr) {
      var cells = toArray(tr.cells).map(function (c) {
        var isHead = c.tagName.toLowerCase() === 'th';
        var style = isHead
          ? 'background:#003366;color:#ffffff;font-weight:bold;text-align:left;' +
            'padding:4px 8px;border:1px solid #003366;white-space:nowrap;'
          : 'border:1px solid #d0d9e8;padding:4px 8px;vertical-align:top;';

        // Carry the severity badge colours across to the pasted cell.
        var sev = !isHead && c.querySelector && c.querySelector('.sev');
        if (sev && window.getComputedStyle) {
          var cs = window.getComputedStyle(sev);
          style += 'color:' + cs.color + ';background-color:' + cs.backgroundColor + ';font-weight:bold;';
        }
        var tag = isHead ? 'th' : 'td';
        return '<' + tag + ' style="' + style + '">' + esc(norm(c.textContent)) + '</' + tag + '>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');

    var html = '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:10pt;">' +
               htmlRows + '</table>';

    return { html: html, tsv: tsv, headers: matrix[0] || [], rowCount: Math.max(0, matrix.length - 1) };
  }

  function missingColumns(headers) {
    return EXPECTED_COLUMNS.filter(function (col) {
      return !headers.some(function (h) { return col.test.test(h); });
    }).map(function (col) { return col.label; });
  }

  /* ---------- clipboard ---------- */
  function legacyCopy(table, html, tsv) {
    return new Promise(function (resolve, reject) {
      var sel = window.getSelection();
      var saved = [];
      for (var i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));

      var range = document.createRange();
      range.selectNodeContents(table);
      sel.removeAllRanges();
      sel.addRange(range);

      function onCopy(e) {
        e.preventDefault();
        e.clipboardData.setData('text/html', html);
        e.clipboardData.setData('text/plain', tsv);
      }
      document.addEventListener('copy', onCopy);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.removeEventListener('copy', onCopy);

      sel.removeAllRanges();
      saved.forEach(function (r) { sel.addRange(r); });

      ok ? resolve() : reject(new Error('Copy command was blocked'));
    });
  }

  function writeClipboard(table, payload) {
    if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      var item = new ClipboardItem({
        'text/html':  new Blob([payload.html], { type: 'text/html' }),
        'text/plain': new Blob([payload.tsv],  { type: 'text/plain' })
      });
      return navigator.clipboard.write([item]).catch(function () {
        return legacyCopy(table, payload.html, payload.tsv);
      });
    }
    return legacyCopy(table, payload.html, payload.tsv);
  }

  /* ---------- toast (reuses the app's toast styles) ---------- */
  function toast(msg, type) {
    var box = document.getElementById('toastContainer');
    if (!box) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('removing');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, 3200);
  }

  /* ---------- UI ---------- */
  function onCopyClick(table, btn) {
    var payload = buildPayload(table);
    var missing = missingColumns(payload.headers);

    writeClipboard(table, payload).then(function () {
      var original = btn.innerHTML;
      btn.innerHTML = '<span>✓</span> Copied';
      btn.disabled = true;
      setTimeout(function () { btn.innerHTML = original; btn.disabled = false; }, 1500);

      if (missing.length) {
        toast('Table copied, but it has no ' + missing.join(' / ') + ' column.', 'warning');
      } else {
        toast('Table copied (' + payload.rowCount + ' rows, with headers).', 'success');
      }
    }).catch(function () {
      toast('Copy was blocked by the browser. Select the table and press Ctrl+C instead.', 'error');
    });
  }

  function enhance(root) {
    toArray(root.querySelectorAll('.alarm-table')).forEach(function (table) {
      if (table.getAttribute('data-copy-ready')) return;
      table.setAttribute('data-copy-ready', '1');

      var bar = document.createElement('div');
      bar.className = 'table-copy-bar';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-copy-table';
      btn.title = 'Copy this table with headers (paste into Excel, Word or email)';
      btn.innerHTML = '<span>📋</span> Copy table';
      btn.addEventListener('click', function () { onCopyClick(table, btn); });
      bar.appendChild(btn);

      var anchor = table.closest('.alarm-table-wrap') || table;
      anchor.parentNode.insertBefore(bar, anchor);
    });
  }

  // Exposed so other modules (or tests) can reuse the same output.
  window.KpiCopyTable = { buildPayload: buildPayload, missingColumns: missingColumns };

  /* The preview is re-rendered on every "Preview Report" click,
     so watch it and re-attach buttons to the fresh tables. */
  var body = document.getElementById('previewBody');
  if (!body) return;
  new MutationObserver(function () { enhance(body); })
    .observe(body, { childList: true, subtree: true });
  enhance(body);
})();
