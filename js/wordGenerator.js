/**
 * wordGenerator.js
 * Generates a Daily KPI Check Word (.docx) document using JSZip + raw OOXML.
 *
 * Document structure (mirrors the PDF):
 *   1. Cover section  — title, date, region/prepared-by
 *   2. KPI Data Summary table (if manual entries exist)
 *   3. Issues list (if any)
 *   4. Alarm Overview stats + per-source alarm tables (if CSV loaded)
 *
 * Requires JSZip to be loaded on the page (libs/jszip.min.js or CDN).
 */

'use strict';

const WordGenerator = (() => {

  /* ── namespace helpers ── */
  const W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XML_ESCAPE = s =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  /* ── public entry point ── */
  async function generate(state) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip is not loaded. Add libs/jszip.min.js to the page.');
    }

    const docXml = _buildDocumentXml(state);
    const zip    = new JSZip();

    zip.file('[Content_Types].xml',              _contentTypes());
    zip.file('_rels/.rels',                      _rootRels());
    zip.file('word/document.xml',                docXml);
    zip.file('word/styles.xml',                  _stylesXml());
    zip.file('word/_rels/document.xml.rels',     _wordRels());

    return zip.generateAsync({
      type:     'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  /* ════════════════════════════════════════════════════════════
     DOCUMENT BODY
     ════════════════════════════════════════════════════════════ */
  function _buildDocumentXml(state) {
    const parts = [];

    /* ── Cover ── */
    parts.push(_coverSection(state));

    /* ── KPI Data tables ── */
    if (state.kpiEntries && state.kpiEntries.length > 0) {
      parts.push(_sectionHeading('KPI Data Summary'));
      const byCategory = _groupBy(state.kpiEntries, e => e.category || 'KPI');
      for (const [cat, entries] of byCategory) {
        parts.push(_subHeading(cat));
        parts.push(_kpiTable(entries));
        parts.push(_spacer());
      }
    }

    /* ── Issues ── */
    if (state.issues && state.issues.length > 0) {
      parts.push(_sectionHeading('Issues & Observations'));
      state.issues.forEach((issue, i) => {
        parts.push(_para(`${i + 1}.  ${issue}`, { size: 20 }));
      });
      parts.push(_spacer());
    }

    /* ── Alarm sections ── */
    if (state.csvLoaded) {
      parts.push(_sectionHeading('Alarm Overview'));
      parts.push(_alarmSummaryTable(state));
      parts.push(_spacer());

      for (const [source, rows] of state.groups) {
        parts.push(_subHeading(`Alarm Source: ${source}`));
        parts.push(_alarmCountLine(rows.length));
        parts.push(_alarmTable(source, rows));
        parts.push(_spacer());
      }
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  mc:Ignorable="w14">
  <w:body>
    ${parts.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"
               w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  /* ════════════════════════════════════════════════════════════
     COVER
     ════════════════════════════════════════════════════════════ */
  function _coverSection(state) {
    const dateStr = _formatDate(state.reportDate);
    const byLine  = [state.networkRegion, state.preparedBy].filter(Boolean).join('  ·  ');

    return [
      _para(state.reportTitle || 'Daily KPI Check Report', { bold: true, size: 44, color: '003366', spaceBefore: 480, spaceAfter: 200 }),
      _para(dateStr,  { bold: true, size: 26, color: '003366', spaceAfter: 120 }),
      byLine ? _para(byLine, { size: 20, color: '6b7a99', spaceAfter: 480 }) : '',
      `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="003366"/></w:pBdr></w:pPr></w:p>`,
      _spacer(),
    ].join('\n');
  }

  /* ════════════════════════════════════════════════════════════
     KPI TABLE
     columns: Metric | Value | Unit | Target | Status
     ════════════════════════════════════════════════════════════ */
  function _kpiTable(entries) {
    const COL_W = [3000, 1400, 1000, 1400, 1200]; // twips
    const headers = ['Metric', 'Value', 'Unit', 'Target', 'Status'];

    const rows = [_tableHeaderRow(headers, COL_W)];
    entries.forEach(e => {
      rows.push(_tableDataRow(
        [e.metric || '—', e.value || '—', e.unit || '—', e.target || '—', e.status || '—'],
        COL_W
      ));
    });

    return _table(rows);
  }

  /* ════════════════════════════════════════════════════════════
     ALARM SUMMARY TABLE
     columns: Alarm Source | Count
     ════════════════════════════════════════════════════════════ */
  function _alarmSummaryTable(state) {
    const COL_W = [5000, 2000];
    const rows  = [_tableHeaderRow(['Alarm Source', 'Alarm Count'], COL_W)];
    for (const [src, srcRows] of state.groups) {
      rows.push(_tableDataRow([src, String(srcRows.length)], COL_W));
    }
    return _table(rows);
  }

  /* ════════════════════════════════════════════════════════════
     ALARM SOURCE TABLE
     columns: Severity | Name | Location Information | Occurred On | Cleared On
     ════════════════════════════════════════════════════════════ */
  function _alarmTable(source, rows) {
    const COL_W = [1400, 3200, 2800, 1500, 1500];
    const headers = ['Severity', 'Name', 'Location Information', 'Occurred On (NT)', 'Cleared On (NT)'];
    const tableRows = [_tableHeaderRow(headers, COL_W)];

    const processed = typeof AlarmFilter !== 'undefined'
      ? AlarmFilter.toTableRows(rows)
      : rows.map(r => ({
          severity: r.severity || '',
          name:     r.name     || '',
          location: r.location || '',
          occurred: r.occurred || '',
          cleared:  r.cleared  || '',
        }));

    processed.forEach(r => {
      tableRows.push(_tableDataRow(
        [r.severity || '—', r.name || '—', r.location || '—', r.occurred || '—', r.cleared || '—'],
        COL_W
      ));
    });

    return _table(tableRows);
  }

  /* ════════════════════════════════════════════════════════════
     XML BUILDING BLOCKS
     ════════════════════════════════════════════════════════════ */

  function _para(text, opts = {}) {
    const {
      bold        = false,
      size        = 20,
      color       = '000000',
      spaceBefore = 0,
      spaceAfter  = 100,
      indent      = 0,
    } = opts;

    const spacing = (spaceBefore || spaceAfter)
      ? `<w:spacing ${spaceBefore ? `w:before="${spaceBefore}"` : ''} ${spaceAfter ? `w:after="${spaceAfter}"` : ''}/>` : '';
    const indentXml = indent ? `<w:ind w:left="${indent}"/>` : '';

    return `<w:p>
      <w:pPr>${spacing}${indentXml}</w:pPr>
      <w:r>
        <w:rPr>
          ${bold ? '<w:b/><w:bCs/>' : ''}
          <w:sz w:val="${size}"/><w:szCs w:val="${size}"/>
          <w:color w:val="${color}"/>
        </w:rPr>
        <w:t xml:space="preserve">${XML_ESCAPE(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  function _spacer() {
    return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
  }

  function _sectionHeading(text) {
    return `<w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:spacing w:before="280" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="003366"/></w:rPr>
        <w:t xml:space="preserve">${XML_ESCAPE(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  function _subHeading(text) {
    return `<w:p>
      <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="0055a5"/></w:rPr>
        <w:t xml:space="preserve">${XML_ESCAPE(text)}</w:t>
      </w:r>
    </w:p>`;
  }

  function _alarmCountLine(count) {
    return `<w:p>
      <w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="6b7a99"/></w:rPr>
        <w:t xml:space="preserve">${count} alarm${count !== 1 ? 's' : ''}</w:t>
      </w:r>
    </w:p>`;
  }

  /* ── Table helpers ── */
  const BORDER = `w:val="single" w:sz="6" w:space="0" w:color="d0d9e8"`;
  const HEADER_BORDER = `w:val="single" w:sz="6" w:space="0" w:color="003366"`;

  function _table(rows) {
    const totalW = rows[0]?._widths?.reduce((a, b) => a + b, 0) || 9000;
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${totalW}" w:type="dxa"/>
        <w:tblBorders>
          <w:top    ${BORDER}/><w:left   ${BORDER}/>
          <w:bottom ${BORDER}/><w:right  ${BORDER}/>
          <w:insideH ${BORDER}/><w:insideV ${BORDER}/>
        </w:tblBorders>
        <w:tblLook w:val="04A0"/>
      </w:tblPr>
      <w:tblGrid>
        ${(rows[0]?._widths || []).map(w => `<w:gridCol w:w="${w}"/>`).join('')}
      </w:tblGrid>
      ${rows.map(r => r._xml).join('\n      ')}
    </w:tbl>`;
  }

  function _tableHeaderRow(headers, widths) {
    const cells = headers.map((h, i) =>
      `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${widths[i]}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="003366"/>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
          <w:r>
            <w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/>
              <w:color w:val="FFFFFF"/>
            </w:rPr>
            <w:t xml:space="preserve">${XML_ESCAPE(h)}</w:t>
          </w:r>
        </w:p>
      </w:tc>`
    ).join('');

    const row = { _xml: `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cells}</w:tr>`, _widths: widths };
    return row;
  }

  function _tableDataRow(values, widths) {
    const cells = values.map((v, i) =>
      `<w:tc>
        <w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/></w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>
          <w:r>
            <w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>
            <w:t xml:space="preserve">${XML_ESCAPE(v)}</w:t>
          </w:r>
        </w:p>
      </w:tc>`
    ).join('');

    const row = { _xml: `<w:tr>${cells}</w:tr>`, _widths: widths };
    return row;
  }

  /* ════════════════════════════════════════════════════════════
     STATIC .DOCX SUPPORT FILES
     ════════════════════════════════════════════════════════════ */
  function _contentTypes() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  }

  function _rootRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;
  }

  function _wordRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
</Relationships>`;
  }

  function _stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="20"/><w:szCs w:val="20"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
    <w:rPr>
      <w:b/><w:bCs/>
      <w:sz w:val="28"/><w:szCs w:val="28"/>
      <w:color w:val="003366"/>
    </w:rPr>
  </w:style>
</w:styles>`;
  }

  /* ── Util ── */
  function _formatDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d + 'T00:00:00');
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      return `${dd} / ${mm} / ${dt.getFullYear()}`;
    } catch { return d; }
  }

  function _groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  }

  return { generate };
})();
