/**
 * csvParser.js
 * Parses the uploaded CSV file and returns structured alarm rows.
 * Relies on PapaParse (loaded via CDN).
 */

'use strict';

const CsvParser = (() => {

  /**
   * Parse a File object as CSV.
   * Returns a Promise<AlarmRow[]>.
   *
   * AlarmRow shape:
   * {
   *   severity:    string,
   *   alarmId:     string,
   *   name:        string,
   *   neType:      string,
   *   occurred:    string,
   *   cleared:     string,
   *   source:      string,
   *   location:    string,
   *   moName:      string,
   * }
   */
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete(results) {
          try {
            const rows = buildRows(results.data);
            resolve(rows);
          } catch (err) {
            reject(err);
          }
        },
        error(err) {
          reject(new Error('CSV parse error: ' + err.message));
        },
      });
    });
  }

  /**
   * Convert raw 2-D array from PapaParse into AlarmRow objects.
   *
   * Header detection strategy:
   *  1. Inspect the first several rows for recognized column header names
   *     (e.g., 'occurred', 'cleared', 'severity', 'name', 'source').
   *  2. If found, dynamically map each column by name so files with or without
   *     a leading blank column (or in any column order) parse correctly.
   *  3. If no matching header row is found, fall back to default COL indices
   *     and scan for the first severity keyword.
   *  4. Safely extract occurred and cleared fields as empty strings when blank.
   */
  function buildRows(rawData) {
    if (!rawData || rawData.length === 0) return [];

    const severityWords = new Set(['critical','major','minor','warning','cleared','indeterminate']);

    // Default column mapping from constants
    const colMap = Object.assign({}, COL);
    let headerRowIdx = -1;

    // Scan first 10 rows for a header row containing known column names
    for (let i = 0; i < Math.min(rawData.length, 10); i++) {
      const row = rawData[i];
      if (!row || !row.length) continue;

      let matched = 0;
      const detected = {};

      row.forEach((cellVal, colIdx) => {
        const str = String(cellVal || '').trim().toLowerCase();
        if (!str) return;

        if (/occurred/i.test(str)) {
          detected.OCCURRED = colIdx;
          matched++;
        } else if (/cleared/i.test(str)) {
          detected.CLEARED = colIdx;
          matched++;
        } else if (/severity/i.test(str)) {
          detected.SEVERITY = colIdx;
          matched++;
        } else if (/alarm\s*id|^id$/i.test(str)) {
          detected.ALARM_ID = colIdx;
          matched++;
        } else if (/alarm\s*source|^source$/i.test(str)) {
          detected.SOURCE = colIdx;
          matched++;
        } else if (/location/i.test(str)) {
          detected.LOCATION = colIdx;
          matched++;
        } else if (/ne\s*type/i.test(str)) {
          detected.NE_TYPE = colIdx;
          matched++;
        } else if (/mo\s*name/i.test(str)) {
          detected.MO_NAME = colIdx;
          matched++;
        } else if (/^(alarm\s*)?name$/i.test(str)) {
          detected.NAME = colIdx;
          matched++;
        }
      });

      if (matched >= 2) {
        headerRowIdx = i;
        Object.assign(colMap, detected);
        break;
      }
    }

    let startIndex = 0;
    if (headerRowIdx !== -1) {
      startIndex = headerRowIdx + 1;
    } else {
      // No header identified: find first row with a real severity word
      for (let i = 0; i < Math.min(rawData.length, 5); i++) {
        const bVal = (rawData[i][colMap.SEVERITY] || '').trim().toLowerCase();
        if (severityWords.has(bVal)) {
          startIndex = i;
          break;
        }
        startIndex = i + 1 < rawData.length ? i + 1 : 0;
      }
    }

    const rows = [];
    for (let i = startIndex; i < rawData.length; i++) {
      const r = rawData[i];
      // Skip completely blank rows
      if (!r || r.every(c => !String(c || '').trim())) continue;

      // Skip repeat header rows if present in data
      const sevCell = (r[colMap.SEVERITY] || '').trim().toLowerCase();
      if (/severity/i.test(sevCell)) continue;

      rows.push({
        severity: cell(r, colMap.SEVERITY),
        alarmId:  cell(r, colMap.ALARM_ID),
        name:     cell(r, colMap.NAME),
        neType:   cell(r, colMap.NE_TYPE),
        occurred: cell(r, colMap.OCCURRED),
        cleared:  cell(r, colMap.CLEARED),
        source:   cell(r, colMap.SOURCE),
        location: cell(r, colMap.LOCATION),
        moName:   cell(r, colMap.MO_NAME),
      });
    }
    return rows;
  }

  /** Safely get a cell value; return empty string if missing. */
  function cell(row, idx) {
    const v = row[idx];
    if (v === undefined || v === null) return '';
    return String(v).trim();
  }

  return { parseFile };
})();
