/**
 * alarmFilter.js
 * Filters alarm rows and groups them by Alarm Source.
 */

'use strict';

const AlarmFilter = (() => {

  /**
   * Process raw alarm rows:
   *  1. Separate excluded vs included rows.
   *  2. Deduplicate identical alarms (if options.deduplicate is true).
   *  3. Group included rows by source.
   *
   * Returns:
   * {
   *   total:      number,
   *   excluded:   number,
   *   duplicates: number,
   *   included:   number,
   *   groups:     Map<string, AlarmRow[]>  — key = source name (trimmed)
   * }
   */
  function process(rows, options = {}) {
    const deduplicate = options.deduplicate !== false;
    const includedRows = [];
    const seenSignatures = new Set();
    let excludedCount = 0;
    let duplicateCount = 0;

    for (const row of rows) {
      if (isExcluded(row.name)) {
        excludedCount++;
        continue;
      }

      if (deduplicate) {
        // Unique signature for an alarm occurrence
        const sig = [
          (row.source || '').trim().toLowerCase(),
          (row.alarmId || '').trim().toLowerCase(),
          (row.name || '').trim().toLowerCase(),
          (row.occurred || '').trim(),
          (row.location || '').trim().toLowerCase(),
        ].join('|');

        if (seenSignatures.has(sig)) {
          duplicateCount++;
          continue;
        }
        seenSignatures.add(sig);
      }

      includedRows.push(row);
    }

    // Group by source, preserving insertion order
    const groups = new Map();
    for (const row of includedRows) {
      const src = row.source.trim() || '(Unknown Source)';
      if (!groups.has(src)) {
        groups.set(src, []);
      }
      groups.get(src).push(row);
    }

    // Sort each group: Critical → Major → Minor → Warning → rest
    const severityOrder = ['critical','major','minor','warning','cleared'];
    for (const [, list] of groups) {
      list.sort((a, b) => {
        const ai = severityOrder.indexOf(a.severity.toLowerCase());
        const bi = severityOrder.indexOf(b.severity.toLowerCase());
        const aRank = ai === -1 ? severityOrder.length : ai;
        const bRank = bi === -1 ? severityOrder.length : bi;
        return aRank - bRank;
      });
    }

    return {
      total:      rows.length,
      excluded:   excludedCount,
      duplicates: duplicateCount,
      included:   includedRows.length,
      groups,
    };
  }

  /** Return true if this alarm name should be excluded. */
  function isExcluded(name) {
    return EXCLUDED_ALARM_NAMES_LC.has(name.trim().toLowerCase());
  }

  /**
   * Build the flat table rows for a single source (for preview / PDF).
   * @param {AlarmRow[]} alarmRows
   * @param {boolean} includeSourceCol - whether to include the redundant source column
   */
  function toTableRows(alarmRows, includeSourceCol = false) {
    return alarmRows.map(r => {
      const row = {
        severity: r.severity || 'N/A',
        name:     r.name     || 'N/A',
        location: r.location || 'N/A',
        occurred: r.occurred || '',
        cleared:  r.cleared  || '',
      };
      if (includeSourceCol) {
        row.source = r.source || 'N/A';
      }
      return row;
    });
  }

  return { process, toTableRows };
})();
