/**
 * ncePdfGenerator.js
 * Generates the Daily NCE Datacom Report PDF.
 *
 * Structure (matching the reference PDF exactly):
 *   Page 1  — Cover: dark blue gradient, cyan/white diamond squares top-right, bold white title + date
 *   Page 2  — Table of Contents (Contents heading, dotted leaders, page numbers)
 *   Page 3  — Network Topology Diagram (if uploaded)
 *   Page 4+ — One page per link KPI graph (bold black heading "A → B", image below)
 *   Page N  — Uncleared Alarms (bold heading per device, table: Severity|Name|Location|Occurred|Status)
 *   Page N+ — Cleared or Other Alarms (same layout)
 *
 * Every inner page: date top-left (YYYY/MM/DD), page number bottom-right.
 */

'use strict';

const NcePdfGenerator = (() => {

  const MARGIN = 20;
  const TOP_Y  = 14;   // body starts below date stamp
  const FOOTER_Y = 12; // mm from bottom

  // ── Public entry point ────────────────────────────────────────────────────
  async function generate(state, onProgress = () => {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    onProgress('Building cover page…', '');
    _addCoverPage(doc, state);

    onProgress('Adding table of contents…', '');
    doc.addPage('a4', 'portrait');
    _addTocPage(doc, state);

    if (state.topoImage) {
      onProgress('Adding topology diagram…', '');
      doc.addPage('a4', 'portrait');
      _addImagePage(doc, 'Network Topology Diagram', state.topoImage.dataUrl, state);
    }

    const graphs = state.linkGraphs || [];
    graphs.forEach((g, i) => {
      onProgress('Adding link graphs…', `${i + 1}/${graphs.length}: ${g.label}`);
      doc.addPage('a4', 'portrait');
      _addLinkGraphPage(doc, g, state);
    });

    const uncleared = state.unclearedAlarms || [];
    const cleared   = state.clearedAlarms   || [];

    if (uncleared.length > 0) {
      onProgress('Adding uncleared alarms…', '');
      doc.addPage('a4', 'portrait');
      _addAlarmSection(doc, 'Uncleared Alarms', uncleared, state);
    }

    if (cleared.length > 0) {
      onProgress('Adding cleared alarms…', '');
      doc.addPage('a4', 'portrait');
      _addAlarmSection(doc, 'Cleared or Other Alarms', cleared, state);
    }

    _stampAllPages(doc, state);
    return doc;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // Dark navy blue gradient background, cyan/light-blue diamond squares on
  // the top-right (matching the reference PDF exactly), bold white title.
  // ══════════════════════════════════════════════════════════════════════════
  function _addCoverPage(doc, state) {
    const W = 210, H = 297;

    // ── Background: two-tone navy gradient ──
    doc.setFillColor(15, 40, 110);
    doc.rect(0, 0, W, H * 0.6, 'F');
    doc.setFillColor(10, 25, 75);
    doc.rect(0, H * 0.6, W, H * 0.4, 'F');

    // ── Diamond squares top-right (cyan/light-blue, matching reference) ──
    // Each diamond is a rotated square (45°) — drawn as a rotated rectangle
    const diamonds = [
      { cx: 185, cy: 35,  s: 28, r: 255, g: 255, b: 255, a: 0.9  }, // white  top
      { cx: 170, cy: 70,  s: 36, r: 80,  g: 190, b: 255, a: 0.85 }, // cyan
      { cx: 190, cy: 105, s: 44, r: 40,  g: 140, b: 220, a: 0.75 }, // blue
      { cx: 168, cy: 150, s: 38, r: 60,  g: 170, b: 240, a: 0.7  }, // cyan
      { cx: 188, cy: 190, s: 26, r: 130, g: 220, b: 255, a: 0.6  }, // light cyan
      { cx: 172, cy: 225, s: 20, r: 80,  g: 160, b: 220, a: 0.65 }, // blue
    ];

    diamonds.forEach(d => {
      doc.setFillColor(d.r, d.g, d.b);
      doc.setDrawColor(d.r, d.g, d.b);
      const s = d.s / 2;
      const pts = [
        { x: d.cx,     y: d.cy - s },  // top
        { x: d.cx + s, y: d.cy     },  // right
        { x: d.cx,     y: d.cy + s },  // bottom
        { x: d.cx - s, y: d.cy     },  // left
      ];
      doc.setLineWidth(0);
      doc.lines(
        [
          [pts[1].x - pts[0].x, pts[1].y - pts[0].y],
          [pts[2].x - pts[1].x, pts[2].y - pts[1].y],
          [pts[3].x - pts[2].x, pts[3].y - pts[2].y],
          [pts[0].x - pts[3].x, pts[0].y - pts[3].y],
        ],
        pts[0].x, pts[0].y, [1, 1], 'F', true
      );
    });

    // ── Title ──
    const title = state.reportTitle || 'Daily NCE Datacom report';
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    const titleLines = doc.splitTextToSize(title, 130);
    let ty = 120;
    titleLines.forEach(line => {
      doc.text(line, MARGIN, ty);
      ty += 15;
    });

    // ── Date ──
    const dateStr = _fmtCoverDate(state.reportDate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(dateStr, MARGIN, ty + 8);

    // ── Prepared by / region ──
    if (state.preparedBy || state.networkRegion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(180, 210, 255);
      const byLine = [state.networkRegion, state.preparedBy].filter(Boolean).join('  ·  ');
      doc.text(byLine, MARGIN, ty + 22);
    }

    // ── Small date top-left (matching reference header style) ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 210, 255);
    doc.text(_fmtInnerDate(state.reportDate), MARGIN, 8);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TABLE OF CONTENTS
  // ══════════════════════════════════════════════════════════════════════════
  function _addTocPage(doc, state) {
    const W      = 210;
    const xLeft  = MARGIN;
    const xRight = W - MARGIN;
    const lineH  = 6.8;

    let y = TOP_Y + 6;

    // "Contents" heading in cyan/blue matching reference
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(0, 120, 200);
    doc.text('Contents', xLeft, y);
    y += 11;

    const entries = [];
    let pg = 3;

    if (state.topoImage) {
      entries.push({ label: 'Network Topology Diagram', pg: pg++ });
    }
    (state.linkGraphs || []).forEach(g => {
      entries.push({ label: g.label || g.name, pg: pg++ });
    });
    if ((state.unclearedAlarms || []).length > 0) {
      entries.push({ label: 'Uncleared Alarms', pg: pg++ });
    }
    if ((state.clearedAlarms || []).length > 0) {
      entries.push({ label: 'Cleared or Other Alarms', pg: pg++ });
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const dotW = doc.getTextWidth('.');

    entries.forEach(entry => {
      const pgStr  = String(entry.pg);
      const labelW = doc.getTextWidth(entry.label);
      const pgW    = doc.getTextWidth(pgStr);

      const gapStart = xLeft + labelW + 1;
      const gapEnd   = xRight - pgW - 1;
      const gapWidth = gapEnd - gapStart;
      const dotCount = gapWidth > dotW ? Math.floor(gapWidth / dotW) : 0;
      const dotsStr  = '.'.repeat(dotCount);
      const dotsX    = xRight - pgW - 1 - (dotCount * dotW);

      doc.setTextColor(0, 0, 0);
      doc.text(entry.label, xLeft, y);

      if (dotCount > 0) {
        doc.setTextColor(80, 80, 80);
        doc.text(dotsStr, dotsX, y);
      }

      doc.setTextColor(0, 0, 0);
      doc.text(pgStr, xRight, y, { align: 'right' });

      y += lineH;
      if (y > 278) {
        doc.addPage('a4', 'portrait');
        y = TOP_Y + 6;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOPOLOGY / GENERIC IMAGE PAGE
  // ══════════════════════════════════════════════════════════════════════════
  function _addImagePage(doc, title, dataUrl, state) {
    const W = 210, H = 297;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(title, MARGIN, TOP_Y + 6);

    const imgStartY = TOP_Y + 14;
    const maxW = W - MARGIN * 2;
    const maxH = H - imgStartY - FOOTER_Y - 2;

    try {
      const props = doc.getImageProperties(dataUrl);
      const ratio = props.width / props.height;
      let drawW = maxW, drawH = maxW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
      const x = (W - drawW) / 2;
      const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(dataUrl, fmt, x, imgStartY, drawW, drawH, '', 'FAST');
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('[Image could not be rendered]', W / 2, imgStartY + 20, { align: 'center' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LINK GRAPH PAGE
  // Bold black "A → B" heading, image below — exactly as in reference PDF
  // ══════════════════════════════════════════════════════════════════════════
  function _addLinkGraphPage(doc, graph, state) {
    const W = 210, H = 297;
    const label = graph.label || graph.name || 'KPI Graph';

    // Bold black heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(label, MARGIN, TOP_Y + 6);

    const imgStartY = TOP_Y + 14;
    const maxW = W - MARGIN * 2;
    const maxH = H - imgStartY - FOOTER_Y - 2;

    try {
      const props = doc.getImageProperties(graph.dataUrl);
      const ratio = props.width / props.height;
      let drawW = maxW, drawH = maxW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
      const x = (W - drawW) / 2;
      const fmt = graph.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(graph.dataUrl, fmt, x, imgStartY, drawW, drawH, '', 'FAST');
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`[Image could not be rendered: ${graph.name}]`, W / 2, imgStartY + 20, { align: 'center' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALARM SECTION
  // Heading in bold, then per-device: device name bold, table below.
  // Columns: Severity | Name | Location Info | Last Occurred (ST) | Clearance Status
  // ══════════════════════════════════════════════════════════════════════════
  function _addAlarmSection(doc, sectionTitle, rows, state) {
    let y = TOP_Y + 4;

    // Section heading (bold, black, large)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text(sectionTitle, MARGIN, y);
    y += 10;

    // Group by device
    const byDevice = new Map();
    rows.forEach(r => {
      const dev = r.device || '(Unknown)';
      if (!byDevice.has(dev)) byDevice.set(dev, []);
      byDevice.get(dev).push(r);
    });

    for (const [device, deviceRows] of byDevice) {
      const severity = deviceRows[0]?.severity || '';

      // Device heading
      if (y > 265) {
        doc.addPage('a4', 'portrait');
        y = TOP_Y + 4;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      const devHeading = severity
        ? `${device} (Severity: ${severity})`
        : device;
      doc.text(devHeading, MARGIN, y);
      y += 6;

      // Alarm table for this device
      const body = deviceRows.map(r => [
        r.severity || '—',
        r.name     || '—',
        r.location || '—',
        r.occurred || '—',
        r.status   || '—',
      ]);

      doc.autoTable({
        startY: y,
        head: [['Severity', 'Name', 'Location Info', 'Last Occurred (ST)', 'Clearance Status']],
        body,
        theme: 'grid',
        headStyles: {
          fillColor:  [255, 255, 255],
          textColor:  [0, 0, 0],
          fontStyle:  'bold',
          fontSize:   8,
          lineColor:  [0, 0, 0],
          lineWidth:  0.3,
          halign:     'left',
          valign:     'middle',
          minCellHeight: 7,
        },
        bodyStyles: {
          fontSize:   7.5,
          textColor:  [0, 0, 0],
          valign:     'top',
          overflow:   'linebreak',
        },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center' },
          1: { cellWidth: 45, halign: 'left'   },
          2: { cellWidth: 62, halign: 'left'   },
          3: { cellWidth: 28, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
        },
        styles: {
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
          lineColor:   [180, 180, 180],
          lineWidth:   0.2,
          overflow:    'linebreak',
        },
        margin: { left: MARGIN, right: MARGIN, top: TOP_Y + 14, bottom: 18 },
        rowPageBreak: 'avoid',
        showHead:     'everyPage',

        didParseCell(data) {
          // Colour-code Severity column
          if (data.section === 'body' && data.column.index === 0) {
            const sev = (data.cell.raw || '').toLowerCase();
            if (sev === 'critical') data.cell.styles.textColor = [192, 57, 43];
            else if (sev === 'major')    data.cell.styles.textColor = [230, 126, 34];
            else if (sev === 'minor')    data.cell.styles.textColor = [160, 128,  0];
            else if (sev === 'warning')  data.cell.styles.textColor = [230, 126, 34];
            data.cell.styles.fontStyle = 'bold';
          }
          // Colour-code Clearance Status column
          if (data.section === 'body' && data.column.index === 4) {
            const s = (data.cell.raw || '').toLowerCase();
            if (s.includes('uncleared')) data.cell.styles.textColor = [192, 57, 43];
            else if (s.includes('cleared')) data.cell.styles.textColor = [39, 174, 96];
          }
        },

        didDrawPage(data) {
          if (data.pageNumber > 1) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`${devHeading} (cont.)`, MARGIN, TOP_Y + 4);
          }
        },
      });

      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAMP ALL INNER PAGES
  // Date top-left (YYYY/MM/DD) and page number bottom-right on every page
  // after the cover.
  // ══════════════════════════════════════════════════════════════════════════
  function _stampAllPages(doc, state) {
    const total   = doc.internal.getNumberOfPages();
    const dateStr = _fmtInnerDate(state.reportDate);

    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(dateStr, MARGIN, 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(String(i - 1), W - MARGIN, H - 6, { align: 'right' });
    }
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
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

  function _fmtInnerDate(d) { return _fmtCoverDate(d); }

  return { generate };
})();
