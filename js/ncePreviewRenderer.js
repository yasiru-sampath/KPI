/**
 * ncePreviewRenderer.js
 * Renders the live HTML preview for the Daily NCE Datacom Report.
 *
 * Page order matching the reference PDF:
 *   1. Cover
 *   2. Table of Contents
 *   3. Network Topology Diagram (if uploaded)
 *   4+. One page per link KPI graph
 *   N. Uncleared Alarms section (grouped by device)
 *   N+1. Cleared or Other Alarms section (grouped by device)
 */

'use strict';

const NcePreviewRenderer = (() => {

  function render(state) {
    const body = document.getElementById('ncePreviewBody');

    const graphs        = state.linkGraphs   || [];
    const unclearedRows = state.unclearedAlarms || [];
    const clearedRows   = state.clearedAlarms   || [];
    const hasContent    = graphs.length > 0 || unclearedRows.length > 0
                          || clearedRows.length > 0 || state.topoImage;

    if (!hasContent) {
      body.innerHTML = `
        <div class="preview-placeholder">
          <div class="placeholder-icon">📡</div>
          <p>Upload a topology diagram, link graphs, or alarm CSV then click
             <strong>Preview Report</strong>.</p>
        </div>`;
      document.getElementById('ncePreviewMeta').textContent = '';
      return;
    }

    const doc = document.createElement('div');
    doc.className = 'preview-doc';

    doc.appendChild(_buildCover(state));
    doc.appendChild(_buildToc(state));

    if (state.topoImage) {
      doc.appendChild(_buildTopoPage(state));
    }

    graphs.forEach(g => doc.appendChild(_buildGraphPage(g, state)));

    if (unclearedRows.length > 0) {
      doc.appendChild(_buildAlarmSection('Uncleared Alarms', unclearedRows));
    }
    if (clearedRows.length > 0) {
      doc.appendChild(_buildAlarmSection('Cleared or Other Alarms', clearedRows));
    }

    body.innerHTML = '';
    body.appendChild(doc);

    const parts = [`${graphs.length} graphs`];
    if (unclearedRows.length) parts.push(`${unclearedRows.length} uncleared`);
    if (clearedRows.length)   parts.push(`${clearedRows.length} cleared`);
    document.getElementById('ncePreviewMeta').textContent = parts.join(' · ');
  }

  // ── Cover ─────────────────────────────────────────────────────────────────
  function _buildCover(state) {
    const div = document.createElement('div');
    const dateStr = _fmtCoverDate(state.reportDate);
    div.innerHTML = `
      <div class="preview-cover nce-datacom-cover">
        <div class="nce-cover-diamonds">
          <div class="nce-diam nd1"></div>
          <div class="nce-diam nd2"></div>
          <div class="nce-diam nd3"></div>
          <div class="nce-diam nd4"></div>
          <div class="nce-diam nd5"></div>
          <div class="nce-diam nd6"></div>
        </div>
        <div class="cover-content" style="padding:60px 40px;">
          <h1 class="cover-title" style="font-size:2.6rem;font-weight:700;color:#fff;line-height:1.2;max-width:280px">
            ${esc(state.reportTitle || 'Daily NCE Datacom report')}
          </h1>
          <p class="cover-date" style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:14px">
            ${esc(dateStr)}
          </p>
          ${state.preparedBy || state.networkRegion
            ? `<p class="cover-by">${esc([state.networkRegion, state.preparedBy].filter(Boolean).join(' · '))}</p>`
            : ''}
        </div>
      </div>`;
    return div;
  }

  // ── Table of Contents ─────────────────────────────────────────────────────
  function _buildToc(state) {
    const wrap = _sectionEl('Contents');
    const sec  = wrap.querySelector('.preview-section');
    const list = document.createElement('div');
    list.className = 'toc-list';

    let pg = 3;

    if (state.topoImage) {
      _tocRow(list, 'Network Topology Diagram', pg++);
    }

    (state.linkGraphs || []).forEach(g => {
      _tocRow(list, g.label || g.name, pg++);
    });

    if ((state.unclearedAlarms || []).length > 0) {
      _tocRow(list, 'Uncleared Alarms', pg++);
    }
    if ((state.clearedAlarms || []).length > 0) {
      _tocRow(list, 'Cleared or Other Alarms', pg++);
    }

    sec.appendChild(list);
    return wrap;
  }

  function _tocRow(list, label, pg) {
    const row = document.createElement('div');
    row.className = 'toc-item';
    row.innerHTML = `
      <span class="toc-label">${esc(label)}</span>
      <span class="toc-dots"></span>
      <span class="toc-pg">${pg}</span>`;
    list.appendChild(row);
  }

  // ── Topology diagram page ─────────────────────────────────────────────────
  function _buildTopoPage(state) {
    const wrap = _sectionEl('Network Topology Diagram');
    const sec  = wrap.querySelector('.preview-section');
    const img  = document.createElement('img');
    img.src   = state.topoImage.dataUrl;
    img.alt   = 'Network Topology';
    img.style.cssText = 'max-width:100%;display:block;margin:0 auto;';
    sec.appendChild(img);
    return wrap;
  }

  // ── Per-link graph page ───────────────────────────────────────────────────
  function _buildGraphPage(graph, state) {
    const wrap = document.createElement('div');
    const sec  = document.createElement('div');
    sec.className = 'preview-section';

    // Bold black heading matching reference PDF style
    const h = document.createElement('h2');
    h.className = 'nce-link-heading';
    h.innerHTML = esc(graph.label || graph.name);
    sec.appendChild(h);

    const img = document.createElement('img');
    img.src   = graph.dataUrl;
    img.alt   = graph.label || graph.name;
    img.style.cssText = 'max-width:100%;display:block;margin:10px auto 0;border:1px solid #eee;';
    sec.appendChild(img);

    wrap.appendChild(sec);
    return wrap;
  }

  // ── Alarm section (Uncleared / Cleared) ───────────────────────────────────
  function _buildAlarmSection(title, rows) {
    const wrap = _sectionEl(title);
    const sec  = wrap.querySelector('.preview-section');

    // Group by device
    const byDevice = new Map();
    rows.forEach(r => {
      const dev = r.device || '(Unknown)';
      if (!byDevice.has(dev)) byDevice.set(dev, []);
      byDevice.get(dev).push(r);
    });

    for (const [device, deviceRows] of byDevice) {
      // Device heading + severity badge
      const severity = deviceRows[0]?.severity || '';
      const devHead  = document.createElement('div');
      devHead.className = 'alarm-source-heading';
      devHead.style.marginTop = '18px';
      devHead.innerHTML = `
        <h3 style="font-size:.9rem;font-weight:700;color:#000;margin:0">
          ${esc(device)}
          <span class="sev ${_sevCls(severity)}" style="margin-left:8px;font-size:.7rem">
            ${esc(severity ? 'Severity: ' + severity : '')}
          </span>
        </h3>`;
      sec.appendChild(devHead);

      const wrap2 = document.createElement('div');
      wrap2.className = 'alarm-table-wrap';

      const tbl = document.createElement('table');
      tbl.className = 'alarm-table';
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Severity</th>
            <th>Name</th>
            <th>Location Info</th>
            <th style="white-space:nowrap">Last Occurred (ST)</th>
            <th>Clearance Status</th>
          </tr>
        </thead>`;

      const tbody = document.createElement('tbody');
      deviceRows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${_sevBadge(r.severity)}</td>
          <td>${esc(r.name)}</td>
          <td style="font-size:.72rem">${esc(r.location)}</td>
          <td style="white-space:nowrap;font-size:.75rem">${esc(r.occurred)}</td>
          <td>${_clearBadge(r.status)}</td>`;
        tbody.appendChild(tr);
      });

      tbl.appendChild(tbody);
      wrap2.appendChild(tbl);
      sec.appendChild(wrap2);
    }

    return wrap;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _sectionEl(heading) {
    const wrapper = document.createElement('div');
    const sec     = document.createElement('div');
    sec.className = 'preview-section';
    const h = document.createElement('h2');
    h.className = 'section-heading';
    h.textContent = heading;
    sec.appendChild(h);
    wrapper.appendChild(sec);
    return wrapper;
  }

  function _sevCls(sev) {
    const k = (sev || '').toLowerCase();
    if (k === 'critical')          return 'sev-critical';
    if (k === 'major')             return 'sev-major';
    if (k === 'minor')             return 'sev-minor';
    if (k === 'warning')           return 'sev-warning';
    if (k === 'cleared')           return 'sev-cleared';
    return 'sev-default';
  }

  function _sevBadge(sev) {
    return `<span class="sev ${_sevCls(sev)}">${esc(sev || 'N/A')}</span>`;
  }

  function _clearBadge(status) {
    const lc = (status || '').toLowerCase();
    const cls = lc.includes('uncleared') ? 'sev-critical'
              : lc.includes('cleared')   ? 'sev-cleared'
              : 'sev-default';
    return `<span class="sev ${cls}">${esc(status || '—')}</span>`;
  }

  function _fmtCoverDate(d) {
    if (!d) return '';
    try {
      const dt   = new Date(d + 'T00:00:00');
      const yyyy = dt.getFullYear();
      const mm   = String(dt.getMonth() + 1).padStart(2, '0');
      const dd   = String(dt.getDate()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}`;
    } catch { return d; }
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { render };
})();
