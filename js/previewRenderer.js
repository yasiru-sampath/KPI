/**
 * previewRenderer.js
 * Renders the live HTML preview inside #previewBody.
 */

'use strict';

const PreviewRenderer = (() => {

  let _chartInstances = [];

  /**
   * Main render entry point.
   * @param {object} state  — full app state snapshot
   */
  function render(state) {
    // Destroy any previous Chart.js instances to avoid canvas reuse errors
    _chartInstances.forEach(c => c.destroy());
    _chartInstances = [];

    const body = document.getElementById('previewBody');
    if (!state.csvLoaded && KpiManager.getAllImages().length === 0 && KpiManager.getEntries().length === 0) {
      body.innerHTML = `
        <div class="preview-placeholder">
          <div class="placeholder-icon">📋</div>
          <p>Upload a CSV file and click <strong>Preview Report</strong> to see the report here.</p>
        </div>`;
      return;
    }

    const doc = document.createElement('div');
    doc.className = 'preview-doc';

    doc.appendChild(_buildCover(state));
    doc.appendChild(_buildToc(state));

    if (state.kpiImages && state.kpiImages.length > 0) {
      if (typeof KpiManager !== 'undefined' && KpiManager.sortByStandardSequence) {
        KpiManager.sortByStandardSequence();
        state.kpiImages = KpiManager.getImages();
      }
    }

    if (state.kpiEntries.length > 0) doc.appendChild(_buildKpiSection(state));
    if (state.kpiImages.length  > 0) doc.appendChild(_buildKpiImages(state));
    if (state.issues.length     > 0) doc.appendChild(_buildIssues(state));

    if (state.csvLoaded) {
      doc.appendChild(_buildAlarmSummary(state));
      for (const [source, rows] of state.groups) {
        doc.appendChild(_buildAlarmSourceSection(source, rows, state));
      }
    }

    body.innerHTML = '';
    body.appendChild(doc);

    // Render severity chart after DOM insert
    if (state.csvLoaded) {
      _renderSeverityChart(state);
    }

    // Update preview meta bar
    document.getElementById('previewMeta').textContent =
      state.csvLoaded
        ? `${state.included} alarms · ${state.groups.size} sources`
        : 'KPI data only';
  }

  // ── Cover Page ──────────────────────────────────────────────────────────────
  function _buildCover(state) {
    const sec = _section();
    const dateStr = state.reportDate
      ? (() => {
          const d = new Date(state.reportDate + 'T00:00:00');
          return `${String(d.getDate()).padStart(2,'0')} / ${String(d.getMonth()+1).padStart(2,'0')} / ${d.getFullYear()}`;
        })()
      : '';
    sec.innerHTML = `
      <div class="preview-cover">
        <div class="cover-diamonds">
          <div class="diamond d1"></div>
          <div class="diamond d2"></div>
          <div class="diamond d3"></div>
          <div class="diamond d4"></div>
          <div class="diamond d5"></div>
        </div>
        <div class="cover-content">
          <h1 class="cover-title">${esc(state.reportTitle || 'Daily KPI Check')}</h1>
          <p class="cover-date">${esc(dateStr)}</p>
          ${state.networkRegion || state.preparedBy
            ? `<p class="cover-by">${esc([state.networkRegion, state.preparedBy].filter(Boolean).join(' · '))}</p>`
            : ''}
        </div>
      </div>`;
    return sec;
  }

  // ── Table of Contents ────────────────────────────────────────────────────────
  function _buildToc(state) {
    const sec = _sectionEl('Contents');
    let pg = 3;
    const items = [];

    if (state.kpiEntries.length > 0) { items.push(['KPI Data Summary', pg++]); }
    state.kpiImages.forEach(img => {
      items.push([img.label || img.name, pg++]);
    });
    if (state.issues.length > 0) { items.push(['Issues', pg++]); }
    if (state.csvLoaded) {
      for (const [src] of state.groups) {
        items.push([`Alarm Source: ${src}`, pg++]);
      }
    }
    if (items.length === 0) { items.push(['Report Contents', 3]); }

    const list = document.createElement('div');
    list.className = 'toc-list';
    items.forEach(([label, p]) => {
      const row = document.createElement('div');
      row.className = 'toc-item';
      row.innerHTML = `
        <span class="toc-label">${esc(label)}</span>
        <span class="toc-dots"></span>
        <span class="toc-pg">${p}</span>`;
      list.appendChild(row);
    });
    sec.querySelector('.preview-section').appendChild(list);
    return sec;
  }

  // ── KPI Data Section ─────────────────────────────────────────────────────────
  function _buildKpiSection(state) {
    const sec = _sectionEl('KPI Data Summary');
    const container = sec.querySelector('.preview-section');

    const byCategory = KpiManager.getEntriesByCategory();
    for (const [cat, entries] of byCategory) {
      const block = document.createElement('div');
      block.className = 'kpi-section-block';
      block.innerHTML = `<h4 style="margin-bottom:8px;color:var(--brand-mid);font-size:.85rem">${esc(cat)}</h4>`;

      const tbl = document.createElement('table');
      tbl.className = 'kpi-table';
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Target</th>
            <th>Status</th>
          </tr>
        </thead>`;
      const tbody = document.createElement('tbody');
      entries.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${esc(e.metric  || '—')}</td>
          <td><strong>${esc(e.value  || '—')}</strong></td>
          <td>${esc(e.unit   || '—')}</td>
          <td>${esc(e.target || '—')}</td>
          <td>${_statusBadge(e.status)}</td>`;
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      block.appendChild(tbl);
      container.appendChild(block);
    }
    return sec;
  }

  // ── KPI Images ───────────────────────────────────────────────────────────────
  function _buildKpiImages(state) {
    const sec = _sectionEl('KPI Images & Graphs');
    const container = sec.querySelector('.preview-section');

    state.kpiImages.forEach(img => {
      const block = document.createElement('div');
      block.className = 'kpi-section-block';
      const graphName = (img.label || img.name || 'KPI Graph').trim();
      block.innerHTML = `
        <div class="graph-name-bar">${esc(graphName)}</div>
        <img class="kpi-img-preview" src="${img.dataUrl}" alt="${esc(graphName)}" />`;
      container.appendChild(block);
    });
    return sec;
  }

  // ── Issues ───────────────────────────────────────────────────────────────────
  function _buildIssues(state) {
    const sec = _sectionEl('Issues & Observations');
    const container = sec.querySelector('.preview-section');
    const list = document.createElement('div');
    list.className = 'issue-list';
    state.issues.forEach((issue, i) => {
      const item = document.createElement('div');
      item.className = 'issue-item';
      item.innerHTML = `
        <div class="issue-num-badge">${i + 1}</div>
        <span>${esc(issue)}</span>`;
      list.appendChild(item);
    });
    container.appendChild(list);
    return sec;
  }

  // ── Alarm Summary ────────────────────────────────────────────────────────────
  function _buildAlarmSummary(state) {
    const sec = _sectionEl('Alarm Overview');
    const container = sec.querySelector('.preview-section');

    // Stats bar
    const bar = document.createElement('div');
    bar.className = 'preview-summary-bar';
    bar.innerHTML = `
      <div class="summary-stat">
        <span class="val">${state.total}</span>
        <span class="lbl">Total Alarms</span>
      </div>
      <div class="summary-stat excluded">
        <span class="val">${state.excluded}</span>
        <span class="lbl">Excluded</span>
      </div>
      <div class="summary-stat included">
        <span class="val">${state.included}</span>
        <span class="lbl">Included</span>
      </div>
      <div class="summary-stat">
        <span class="val">${state.groups.size}</span>
        <span class="lbl">Alarm Sources</span>
      </div>`;
    container.appendChild(bar);

    // Severity breakdown chart — centred, 40% width
    const chartWrap = document.createElement('div');
    chartWrap.className = 'chart-wrap';
    chartWrap.style.cssText = 'width:40%;margin:14px auto 0;display:block;';
    const canvas = document.createElement('canvas');
    canvas.id = 'severityChart';
    canvas.style.cssText = 'display:block;width:100%;';
    chartWrap.appendChild(canvas);
    container.appendChild(chartWrap);

    // Source summary table
    const tbl = document.createElement('table');
    tbl.className = 'kpi-table';
    tbl.style.marginTop = '16px';
    tbl.innerHTML = `
      <thead><tr><th>Alarm Source</th><th>Alarm Count</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const [src, rows] of state.groups) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(src)}</td><td><strong>${rows.length}</strong></td>`;
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    container.appendChild(tbl);

    return sec;
  }

  function _renderSeverityChart(state) {
    const canvas = document.getElementById('severityChart');
    if (!canvas) return;

    // Count severities across all included alarms
    const counts = {};
    for (const [, rows] of state.groups) {
      rows.forEach(r => {
        const sev = (r.severity || 'Unknown').trim();
        counts[sev] = (counts[sev] || 0) + 1;
      });
    }

    const labels = Object.keys(counts);
    const data   = Object.values(counts);
    const colMap  = {
      Critical: 'rgba(192,57,43,.85)',
      Major:    'rgba(230,126,34,.85)',
      Minor:    'rgba(241,196,15,.85)',
      Warning:  'rgba(230,126,34,.6)',
      Cleared:  'rgba(39,174,96,.85)',
    };
    const colors = labels.map(l => colMap[l] || 'rgba(107,122,153,.7)');

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Alarms by Severity',
          data,
          backgroundColor: colors,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.8,          // wider than tall — suits 40% width nicely
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Alarm Severity Distribution',
            font: { size: 11, weight: 'bold' },
            padding: { bottom: 8 },
          },
        },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } } },
        },
      },
    });
    _chartInstances.push(chart);
  }

  // ── Alarm Source Section ─────────────────────────────────────────────────────
  function _buildAlarmSourceSection(source, rows) {
    const sec = _sectionEl(`Alarm Source: ${source}`);
    const container = sec.querySelector('.preview-section');

    const heading = document.createElement('div');
    heading.className = 'alarm-source-heading';
    heading.innerHTML = `
      <h3 style="font-size:.95rem;font-weight:700;color:#000;margin-bottom:8px">Alarm Source: ${esc(source)}</h3>
      <span class="alarm-count-badge">${rows.length} alarm${rows.length !== 1 ? 's' : ''}</span>`;
    container.appendChild(heading);

    const wrap = document.createElement('div');
    wrap.className = 'alarm-table-wrap';
    const tbl = document.createElement('table');
    tbl.className = 'alarm-table';
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Source</th>
          <th>Severity</th>
          <th>Name</th>
          <th>Location Information</th>
          <th>Occurred On (NT)</th>
          <th>Cleared On (NT)</th>
        </tr>
      </thead>`;
    const tbody = document.createElement('tbody');
    AlarmFilter.toTableRows(rows).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(r.source)}</td>
        <td>${_severityBadge(r.severity)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.location)}</td>
        <td style="white-space:nowrap">${esc(r.occurred)}</td>
        <td style="white-space:nowrap">${esc(r.cleared)}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    container.appendChild(wrap);
    return sec;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _section() {
    const div = document.createElement('div');
    return div;
  }

  function _sectionEl(heading) {
    const wrapper = document.createElement('div');
    const sec = document.createElement('div');
    sec.className = 'preview-section';
    const h = document.createElement('h2');
    h.className = 'section-heading';
    h.textContent = heading;
    sec.appendChild(h);
    wrapper.appendChild(sec);
    return wrapper;
  }

  function _severityBadge(sev) {
    const key = (sev || '').toLowerCase();
    const cls = ['critical','major','minor','warning','cleared'].includes(key)
      ? `sev-${key}` : 'sev-default';
    return `<span class="sev ${cls}">${esc(sev || 'N/A')}</span>`;
  }

  function _statusBadge(status) {
    if (!status) return '<span class="text-muted">—</span>';
    const key = status.toLowerCase();
    const cls = key.includes('ok') || key.includes('pass') ? 'sev-cleared'
               : key.includes('fail') || key.includes('crit') ? 'sev-critical'
               : key.includes('warn') ? 'sev-warning'
               : 'sev-default';
    return `<span class="sev ${cls}">${esc(status)}</span>`;
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(d) {
    if (!d) return '—';
    try {
      const parts = d.split('-');
      if (parts.length === 3) {
        const dt = new Date(d);
        return dt.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
      }
      return d;
    } catch {
      return d;
    }
  }

  return { render };
})();
