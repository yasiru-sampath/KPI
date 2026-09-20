/**
 * nceKpiManager.js
 * Manages:
 *   - Topology diagram image (single fixed image)
 *   - Link KPI graph images (one per network link, e.g. "R2-ISP-RT-A → R12-ISP-RT-B")
 *   - Alarm rows parsed from CSV (Uncleared + Cleared/Other)
 */

'use strict';

const NceKpiManager = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let _topoImage    = null;   // { dataUrl, name }
  const _linkGraphs = [];     // [{ id, dataUrl, name, label, include }]
  let _graphIdSeq   = 0;

  // Alarm rows split into two buckets
  let _unclearedAlarms = [];  // [{ device, severity, name, location, occurred, status }]
  let _clearedAlarms   = [];

  // ── Topology image ────────────────────────────────────────────────────────
  function setTopoImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        _topoImage = { dataUrl: e.target.result, name: file.name };
        resolve(_topoImage);
      };
      reader.onerror = () => reject(new Error('Failed to read topology image'));
      reader.readAsDataURL(file);
    });
  }
  function clearTopoImage() { _topoImage = null; }
  function getTopoImage()   { return _topoImage; }

  // ── Link graphs ───────────────────────────────────────────────────────────
  function addLinkGraph(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const label = _labelFromFilename(file.name);
        const graph = {
          id:      ++_graphIdSeq,
          dataUrl: e.target.result,
          name:    file.name,
          label,
          include: true,
        };
        _linkGraphs.push(graph);
        resolve(graph);
      };
      reader.onerror = () => reject(new Error('Failed to read graph: ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  function updateLinkGraph(id, props) {
    const g = _linkGraphs.find(g => g.id === id);
    if (g) Object.assign(g, props);
  }

  function removeLinkGraph(id) {
    const idx = _linkGraphs.findIndex(g => g.id === id);
    if (idx !== -1) _linkGraphs.splice(idx, 1);
  }

  function getLinkGraphs()    { return _linkGraphs.filter(g => g.include); }
  function getAllLinkGraphs()  { return [..._linkGraphs]; }

  function reorderGraphs(orderedIds) {
    orderedIds.forEach((id, newIdx) => {
      const cur = _linkGraphs.findIndex(g => g.id === id);
      if (cur === -1 || cur === newIdx) return;
      const [item] = _linkGraphs.splice(cur, 1);
      _linkGraphs.splice(newIdx, 0, item);
    });
  }

  // Auto-label: try to detect link pattern from filename
  // e.g. "R2-ISP-RT-A_R12-ISP-RT-B.png" → "R2-ISP-RT-A → R12-ISP-RT-B"
  function _labelFromFilename(filename) {
    const base = filename.replace(/\.[^.]+$/, '').replace(/_+/g, ' ');
    // Check for patterns like "A to B" or "A-B"
    const arrowMatch = base.match(/^(.+?)\s*(?:to|-|_)\s*(.+)$/i);
    if (arrowMatch) {
      return arrowMatch[1].trim() + ' → ' + arrowMatch[2].trim();
    }
    return base;
  }

  // ── Alarm CSV parsing ─────────────────────────────────────────────────────
  /**
   * Parse the NCE alarm CSV/data.
   * Expected columns (flexible detection):
   *   Device/NE name | Severity | Alarm Name | Location Info | Last Occurred | Clearance Status
   *
   * If the file is the structured alarm report (not a CSV but from PDF extraction),
   * we accept a structured array directly via setAlarmData().
   */
  function parseAlarmCSV(text) {
    _unclearedAlarms = [];
    _clearedAlarms   = [];

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return;

    // Detect delimiter
    const delim = lines[0].includes('\t') ? '\t' : ',';

    // Find header row
    let headerIdx = 0;
    let colMap    = null;

    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const cols = _splitLine(lines[i], delim).map(c => c.toLowerCase().trim());
      const hasDevice   = cols.some(c => c.includes('device') || c.includes('ne') || c.includes('source'));
      const hasSeverity = cols.some(c => c.includes('severity'));
      const hasName     = cols.some(c => c.includes('name') || c.includes('alarm'));
      if (hasDevice && hasSeverity && hasName) {
        headerIdx = i;
        colMap = {};
        cols.forEach((c, idx) => {
          if (c.includes('device') || c.includes('ne') || c.includes('source'))  colMap.device   = idx;
          if (c.includes('severity'))                                              colMap.severity = idx;
          if (c.includes('name') || c.includes('alarm'))                          colMap.name     = idx;
          if (c.includes('location') || c.includes('info'))                       colMap.location = idx;
          if (c.includes('occur') || c.includes('time') || c.includes('date'))   colMap.occurred = idx;
          if (c.includes('clear') || c.includes('status'))                        colMap.status   = idx;
        });
        break;
      }
    }

    if (!colMap) {
      // Fallback: assume fixed columns: device, severity, name, location, occurred, status
      colMap = { device: 0, severity: 1, name: 2, location: 3, occurred: 4, status: 5 };
      headerIdx = 0;
    }

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = _splitLine(lines[i], delim);
      if (cols.length < 2) continue;

      const get  = idx => (idx !== undefined && cols[idx] !== undefined) ? cols[idx].trim() : '';
      const row  = {
        device:   get(colMap.device),
        severity: get(colMap.severity),
        name:     get(colMap.name),
        location: get(colMap.location),
        occurred: get(colMap.occurred),
        status:   get(colMap.status),
      };

      if (!row.severity && !row.name) continue;

      const statusLc = row.status.toLowerCase();
      if (statusLc.includes('uncleared') || statusLc === '') {
        _unclearedAlarms.push(row);
      } else {
        _clearedAlarms.push(row);
      }
    }
  }

  // Allow direct structured injection (for future use)
  function setAlarmData(uncleared, cleared) {
    _unclearedAlarms = uncleared || [];
    _clearedAlarms   = cleared   || [];
  }

  function getUnclearedAlarms() { return [..._unclearedAlarms]; }
  function getClearedAlarms()   { return [..._clearedAlarms]; }
  function getTotalAlarms()     { return _unclearedAlarms.length + _clearedAlarms.length; }
  function clearAlarms()        { _unclearedAlarms = []; _clearedAlarms = []; }

  function _splitLine(line, delim) {
    if (delim === ',') {
      // Handle quoted CSV fields
      const result = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
        cur += ch;
      }
      result.push(cur);
      return result;
    }
    return line.split(delim);
  }

  // ── Full reset ────────────────────────────────────────────────────────────
  function clearAll() {
    _topoImage   = null;
    _linkGraphs.length = 0;
    _graphIdSeq  = 0;
    clearAlarms();
  }

  return {
    // Topology
    setTopoImage, clearTopoImage, getTopoImage,
    // Link graphs
    addLinkGraph, updateLinkGraph, removeLinkGraph,
    getLinkGraphs, getAllLinkGraphs, reorderGraphs,
    // Alarms
    parseAlarmCSV, setAlarmData,
    getUnclearedAlarms, getClearedAlarms, getTotalAlarms, clearAlarms,
    // Util
    clearAll,
  };
})();
