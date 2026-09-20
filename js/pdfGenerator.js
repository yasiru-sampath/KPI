/**
 * pdfGenerator.js
 * Generates the Daily KPI Check PDF matching the reference template exactly.
 *
 * Template style (from reference PDF):
 *  - Cover: dark blue background, "Daily KPI Check" large white bold, date in white below
 *    with rotated blue diamond shapes on the right side
 *  - All inner pages: white background, date top-left in small black text (YYYY/MM/DD)
 *  - KPI image pages: date top-left, then graph name as plain black H1 heading, image below
 *  - TOC: "Contents" heading, dotted leader lines to page numbers
 *  - Alarm tables: "Alarm Source: XXX" plain black heading, then table with bold headers
 *    (Alarm Source | Severity | Name | Location Information | Occurred On (NT) | Cleared On (NT))
 */

'use strict';

const PdfGenerator = (() => {

  // ── Layout constants ──────────────────────────────────────────────────────────
  const MARGIN = 20;   // mm left/right margin
  const TOP_Y = 14;   // mm — where body content starts (below date line)
  const FOOTER_Y_FROM_BOTTOM = 12;

  // ── Public entry point ────────────────────────────────────────────────────────
  async function generate(state, onProgress = () => { }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Guarantee KPI images are strictly sorted by the official sequence
    if (state.kpiImages && state.kpiImages.length > 0) {
      state.kpiImages = _sortImagesBySequence(state.kpiImages);
    }

    // ── Cover page (portrait) ──
    onProgress('Building cover page…', '');
    _addCoverPage(doc, state);

    // ── Table of contents (portrait) ──
    onProgress('Adding table of contents…', '');
    doc.addPage('a4', 'portrait');
    _addTocPage(doc, state);

    // ── KPI manual data table (portrait, optional) ──
    if (state.kpiEntries.length > 0) {
      onProgress('Adding KPI data…', '');
      doc.addPage('a4', 'portrait');
      _addKpiDataSection(doc, state);
    }

    // ── One page per KPI image (portrait) ──
    if (state.kpiImages.length > 0) {
      onProgress('Adding KPI images…', '');
      for (const img of state.kpiImages) {
        doc.addPage('a4', 'portrait');
        _addKpiImagePage(doc, img, state);
      }
    }

    // ── Issues (portrait, optional) ──
    if (state.issues.length > 0) {
      onProgress('Adding issues…', '');
      doc.addPage('a4', 'portrait');
      _addIssuesPage(doc, state);
    }

    // ── Alarm source tables (portrait — matching reference) ──
    if (state.csvLoaded) {
      let srcIdx = 0;
      const sources = [...state.groups.entries()];

      for (const [source, rows] of sources) {
        srcIdx++;
        onProgress('Adding alarm tables…', `Source ${srcIdx}/${state.groups.size}: ${source}`);
        doc.addPage('a4', 'portrait');
        _addAlarmSourceTable(doc, source, rows, state);
      }
    }

    // ── Stamp date header + page numbers on every inner page ──
    _stampAllPages(doc, state);

    return doc;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // Matches: dark navy gradient background, white "Daily KPI Check" large bold,
  //          date centred below, blue diamond shapes on right side
  // ══════════════════════════════════════════════════════════════════════════════
  function _addCoverPage(doc, state) {
    const W = 210, H = 297;

    // ── Background gradient (two rectangles) ──
    doc.setFillColor(15, 40, 100);       // top — mid-navy
    doc.rect(0, 0, W, H * 0.55, 'F');
    doc.setFillColor(10, 25, 70);        // bottom — dark navy
    doc.rect(0, H * 0.55, W, H * 0.45, 'F');

    // ── Diamond shapes on right (matching reference) ──
    // Each diamond is a rotated square drawn as a polygon
    const diamonds = [
      { cx: 175, cy: 60, size: 55, color: [30, 120, 220], alpha: 0.85 },
      { cx: 195, cy: 130, size: 65, color: [50, 170, 240], alpha: 0.6 },
      { cx: 170, cy: 200, size: 50, color: [20, 90, 180], alpha: 0.75 },
      { cx: 195, cy: 255, size: 30, color: [80, 200, 255], alpha: 0.5 },
      { cx: 165, cy: 265, size: 22, color: [15, 70, 160], alpha: 0.9 },
    ];
    diamonds.forEach(d => {
      const s = d.size / 2;
      // Draw rotated square (diamond) as polygon: top, right, bottom, left
      doc.setFillColor(d.color[0], d.color[1], d.color[2]);
      doc.setDrawColor(d.color[0], d.color[1], d.color[2]);
      // jsPDF triangle trick: draw two triangles to make a diamond
      const pts = [
        { x: d.cx, y: d.cy - s },   // top
        { x: d.cx + s, y: d.cy },  // right
        { x: d.cx, y: d.cy + s },  // bottom
        { x: d.cx - s, y: d.cy },  // left
      ];
      // Use lines to draw filled diamond
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

    // ── Main title ──
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(42);
    const titleText = state.reportTitle || 'Daily KPI Check';
    const titleLines = doc.splitTextToSize(titleText, 140);
    let ty = 110;
    titleLines.forEach(line => {
      doc.text(line, MARGIN, ty);
      ty += 18;
    });

    // ── Date below title ──
    const dateStr = _formatCoverDate(state.reportDate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(dateStr, MARGIN, ty + 8);

    // ── Optional prepared-by line ──
    if (state.preparedBy || state.networkRegion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(180, 210, 255);
      const byLine = [state.networkRegion, state.preparedBy].filter(Boolean).join('  ·  ');
      doc.text(byLine, MARGIN, ty + 22);
    }
  }

  // Format date as "07 / 09 / 2026" for the cover
  function _formatCoverDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d + 'T00:00:00');
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd} / ${mm} / ${yyyy}`;
    } catch { return d; }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TABLE OF CONTENTS
  // Exact match to reference: "Contents" heading, entries with full dotted
  // leaders across the page, page numbers right-aligned at page edge
  // ══════════════════════════════════════════════════════════════════════════════
  function _addTocPage(doc, state) {
    const W = 210;
    const xLeft = MARGIN;          // 20mm — left edge of labels
    const xRight = W - MARGIN;     // 190mm — right edge for page numbers
    const fontSize = 9;
    const lineH = 6.8;            // mm between lines

    let y = TOP_Y + 6;

    // ── "Contents" heading ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text('Contents', xLeft, y);
    y += 11;

    // ── Build entry list ──
    const entries = [];
    let pg = 3; // page 1=cover, 2=toc, content from 3

    if (state.kpiEntries.length > 0) {
      entries.push({ label: 'KPI Data Summary', pg: pg++ });
    }
    for (const img of state.kpiImages) {
      entries.push({ label: img.label || img.name, pg: pg++ });
    }
    if (state.issues.length > 0) {
      entries.push({ label: 'Issues', pg: pg++ });
    }
    if (state.csvLoaded) {
      for (const [src] of state.groups) {
        entries.push({ label: `Alarm Source: ${src}`, pg: pg++ });
      }
    }

    // ── Render each row ──
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');

    // Pre-measure dot width once
    const dotW = doc.getTextWidth('.');

    entries.forEach(entry => {
      const label = entry.label;
      const pgStr = String(entry.pg);

      const labelW = doc.getTextWidth(label);
      const pgW = doc.getTextWidth(pgStr);

      // Gap between label end and page number start (filled with dots)
      // Leave 1mm gap after label and 1mm before page number
      const gapStart = xLeft + labelW + 1;
      const gapEnd = xRight - pgW - 1;
      const gapWidth = gapEnd - gapStart;
      const dotCount = gapWidth > dotW ? Math.floor(gapWidth / dotW) : 0;
      const dotsStr = '.'.repeat(dotCount);

      // Adjust dots start so they fill right to the page number
      const dotsX = xRight - pgW - 1 - (dotCount * dotW);

      // Label — plain black
      doc.setTextColor(0, 0, 0);
      doc.text(label, xLeft, y);

      // Dots — slightly grey to match reference
      if (dotCount > 0) {
        doc.setTextColor(80, 80, 80);
        doc.text(dotsStr, dotsX, y);
      }

      // Page number — right aligned, plain black
      doc.setTextColor(0, 0, 0);
      doc.text(pgStr, xRight, y, { align: 'right' });

      y += lineH;
      if (y > 278) {
        doc.addPage('a4', 'portrait');
        y = TOP_Y + 6;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // KPI MANUAL DATA TABLE
  // ══════════════════════════════════════════════════════════════════════════════
  function _addKpiDataSection(doc, state) {
    const byCategory = KpiManager.getEntriesByCategory();
    let y = TOP_Y + 4;

    for (const [cat, entries] of byCategory) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text(cat, MARGIN, y);
      y += 7;

      const body = entries.map(e => [
        e.metric || '—', e.value || '—', e.unit || '—', e.target || '—', e.status || '—',
      ]);

      doc.autoTable({
        startY: y,
        head: [['Metric', 'Value', 'Unit', 'Target', 'Status']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9, lineColor: [0, 0, 0], lineWidth: 0.3 },
        bodyStyles: { fontSize: 9, textColor: [0, 0, 0] },
        styles: { overflow: 'linebreak', cellPadding: 3, lineColor: [180, 180, 180], lineWidth: 0.2 },
        margin: { left: MARGIN, right: MARGIN },
        showHead: 'everyPage',
        didDrawPage(data) {
          if (data.pageNumber > 1) { doc.addPage('a4', 'portrait'); }
        },
      });

      y = doc.lastAutoTable.finalY + 10;
      if (y > 270) {
        doc.addPage('a4', 'portrait');
        y = TOP_Y + 4;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // KPI IMAGE PAGE
  // Matches reference exactly:
  //   - date top-left (added by _stampAllPages)
  //   - graph name as plain black heading (font ~16pt)
  //   - image centred below, no coloured bars
  // ══════════════════════════════════════════════════════════════════════════════
  function _addKpiImagePage(doc, img, state) {
    const pageW = 210, pageH = 297;
    const graphName = (img.label || img.name || 'KPI Graph').trim();

    // Graph name heading — plain black, matches reference style
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text(graphName, MARGIN, TOP_Y + 6);

    // Image — centred, maximised
    const imgStartY = TOP_Y + 14;
    const maxW = pageW - MARGIN * 2;
    const maxH = pageH - imgStartY - FOOTER_Y_FROM_BOTTOM - 2;

    try {
      const imgProps = doc.getImageProperties(img.dataUrl);
      const ratio = imgProps.width / imgProps.height;
      let drawW = maxW, drawH = maxW / ratio;
      if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
      const x = (pageW - drawW) / 2;
      const fmt = img.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(img.dataUrl, fmt, x, imgStartY, drawW, drawH, '', 'FAST');
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`[Image could not be rendered: ${img.name}]`, pageW / 2, imgStartY + 20, { align: 'center' });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ISSUES PAGE
  // ══════════════════════════════════════════════════════════════════════════════
  function _addIssuesPage(doc, state) {
    let y = TOP_Y + 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text('Issues', MARGIN, y);
    y += 8;

    state.issues.forEach((issue, i) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(`${i + 1}.  ${issue}`, 210 - MARGIN * 2);
      lines.forEach(line => {
        doc.text(line, MARGIN, y);
        y += 6;
        if (y > 278) {
          doc.addPage('a4', 'portrait');
          y = TOP_Y + 4;
        }
      });
      y += 2;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ALARM SOURCE TABLE
  // Matches reference exactly:
  //   - "Alarm Source: USN02" as plain black heading
  //   - Table columns: Alarm Source | Severity | Name | Location Information |
  //                    Occurred On (NT) | Cleared On (NT)
  //   - White background, black text, bold headers, borders
  //   - Portrait orientation (same as reference)
  // ══════════════════════════════════════════════════════════════════════════════
  function _addAlarmSourceTable(doc, source, rows, state) {
    const pageW = 210;
    let y = TOP_Y + 4;

    // "Alarm Source: USN02" heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Alarm Source: ${source}`, MARGIN, y);
    y += 10;   // ← gap between heading and table

    // Prevent duplicate 'Alarm Source' column inside the source section
    const preventDupCol = state.preventDuplicateSourceCol !== false;
    const displayRows = AlarmFilter.toTableRows(rows, !preventDupCol);

    let head, body, columnStyles;

    if (preventDupCol) {
      // 5 non-redundant columns: perfectly fills the 162mm printable width in portrait A4
      head = [[
        { content: 'Severity', styles: { halign: 'center' } },
        { content: 'Name', styles: { halign: 'center' } },
        { content: 'Location Information', styles: { halign: 'center' } },
        { content: 'Occurred On (NT)', styles: { halign: 'center' } },
        { content: 'Cleared On (NT)', styles: { halign: 'center' } },
      ]];
      body = displayRows.map(r => [
        r.severity,
        r.name,
        r.location,
        r.occurred || '-',
        r.cleared || '-',
      ]);
      columnStyles = {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 50, halign: 'left' },
        2: { cellWidth: 50, halign: 'left' },
        3: { cellWidth: 21, halign: 'center' },
        4: { cellWidth: 21, halign: 'center' },
      };
    } else {
      // 6 columns including redundant Alarm Source
      head = [[
        { content: 'Alarm Source', styles: { halign: 'center' } },
        { content: 'Severity', styles: { halign: 'center' } },
        { content: 'Name', styles: { halign: 'center' } },
        { content: 'Location Information', styles: { halign: 'center' } },
        { content: 'Occurred On (NT)', styles: { halign: 'center' } },
        { content: 'Cleared On (NT)', styles: { halign: 'center' } },
      ]];
      body = displayRows.map(r => [
        r.source || source,
        r.severity,
        r.name,
        r.location,
        r.occurred || '-',
        r.cleared || '-',
      ]);
      columnStyles = {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 46, halign: 'left' },
        3: { cellWidth: 46, halign: 'left' },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 26, halign: 'center' },
      };
    }

    doc.autoTable({
      startY: y,
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 7.5,
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
        valign: 'middle',
        halign: 'center',
        minCellHeight: 8,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [0, 0, 0],
        valign: 'top',
        overflow: 'linebreak',
      },
      columnStyles,
      styles: {
        overflow: 'linebreak',
        cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      margin: { left: MARGIN + 4, right: MARGIN + 4, top: TOP_Y + 14, bottom: 18 },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',

      didDrawPage(data) {
        if (data.pageNumber > 1) {
          // Draw continuation heading ABOVE the table — table top margin reserves space
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          doc.text(`Alarm Source: ${source} (cont.)`, MARGIN, TOP_Y + 4);
        }
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // STAMP ALL INNER PAGES
  // Adds date top-left + page number bottom-right on every page except cover
  // ══════════════════════════════════════════════════════════════════════════════
  function _stampAllPages(doc, state) {
    const total = doc.internal.getNumberOfPages();
    const dateStr = _formatInnerDate(state.reportDate);

    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      // Skip cover page (page 1)
      if (i > 1) {
        // ── Date — top left ──
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(dateStr, MARGIN, 8);

        // ── Page number — bottom right ──
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(String(i - 1), W - MARGIN, H - 6, { align: 'right' });
      }
    }
  }

  // Format date as "2026/09/07" for inner page headers
  function _formatInnerDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d + 'T00:00:00');
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${yyyy}/${mm}/${dd}`;
    } catch { return d; }
  }

  // Sort images strictly by KPI_GRAPH_SEQUENCE
  function _sortImagesBySequence(images) {
    const seqList = (typeof KPI_GRAPH_SEQUENCE !== 'undefined' ? KPI_GRAPH_SEQUENCE : []).map(s => s.trim().toLowerCase());
    return [...images].sort((a, b) => {
      const aLabel = (a.label || a.name || '').trim().toLowerCase();
      const bLabel = (b.label || b.name || '').trim().toLowerCase();

      let aIdx = seqList.indexOf(aLabel);
      let bIdx = seqList.indexOf(bLabel);

      if (aIdx === -1) aIdx = seqList.findIndex(s => aLabel.includes(s) || s.includes(aLabel));
      if (bIdx === -1) bIdx = seqList.findIndex(s => bLabel.includes(s) || s.includes(bLabel));

      const aRank = aIdx === -1 ? 999 : aIdx;
      const bRank = bIdx === -1 ? 999 : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return (a.id || 0) - (b.id || 0);
    });
  }

  return { generate };
})();
