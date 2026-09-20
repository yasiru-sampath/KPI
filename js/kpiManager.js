/**
 * kpiManager.js
 * Manages KPI image uploads and manual KPI data entries.
 *
 * Auto-naming logic uses upload ORDER within each type:
 *   1st "4G attach" upload → "4G attach users - USN02"
 *   2nd "4G attach" upload → "4G attach users - USN01"
 *   1st "3G attach" upload → "3G attach users - USN02"
 *   2nd "3G attach" upload → "3G attach users - USN01"
 *   1st "2.5G attach"      → "2.5G attach users - USN02"
 *   2nd "2.5G attach"      → "2.5G attach users - USN01"
 *   1st "2G PDP"           → "2G PDP USN1"
 *   2nd "2G PDP"           → "2G PDP USN2"
 *   1st "3G PDP"           → "3G PDP - USN1"
 *   2nd "3G PDP"           → "3G PDP - USN2"
 *   1st "4G PDP"           → "4G PDP - USN1"
 *   2nd "4G PDP"           → "4G PDP - USN2"
 *   1st "UGW PDP"          → "2G 3G UGW1 PDP"
 *   2nd "UGW PDP"          → "2G 3G UGW2 PDP"
 *   1st "IP CAN / PCRF"    → "IP CAN sessions PCRF - UPCC"
 *   2nd "IP CAN / PCRF"    → "IP CAN sessions PCRF - UPCC02"
 */

'use strict';

const KpiManager = (() => {

  const _images  = [];
  const _entries = [];
  let _imgIdSeq   = 0;
  let _entryIdSeq = 0;

  // Upload counters per graph type — reset when clearAll() is called
  const _typeCount = {};

  // ── Images ───────────────────────────────────────────────────────────────────

  function addImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const cleaned = _stripTimestamps(file.name);
        const label   = _autoLabel(cleaned, file.name);
        const img = {
          id:           ++_imgIdSeq,
          file,
          name:         file.name,
          dataUrl:      e.target.result,
          label,
          sectionTitle: 'KPI Section',
          include:      true,
        };
        _images.push(img);
        resolve(img);
      };
      reader.onerror = () => reject(new Error('Failed to read image: ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  function updateImage(id, props) {
    const img = _images.find(i => i.id === id);
    if (img) Object.assign(img, props);
  }

  function removeImage(id) {
    const idx = _images.findIndex(i => i.id === id);
    if (idx !== -1) _images.splice(idx, 1);
  }

  function getImages()   { return _images.filter(i => i.include); }
  function getAllImages() { return [..._images]; }

  function reorder(orderedIds) {
    orderedIds.forEach((id, newIndex) => {
      const cur = _images.findIndex(i => i.id === id);
      if (cur === -1 || cur === newIndex) return;
      const [item] = _images.splice(cur, 1);
      _images.splice(newIndex, 0, item);
    });
  }

  // ── Manual Entries ────────────────────────────────────────────────────────────

  function addEntry(data = {}) {
    const entry = {
      id:       ++_entryIdSeq,
      category: data.category || 'KPI',
      metric:   data.metric   || '',
      value:    data.value    || '',
      unit:     data.unit     || '',
      target:   data.target   || '',
      status:   data.status   || '',
    };
    _entries.push(entry);
    return entry;
  }

  function updateEntry(id, props) {
    const entry = _entries.find(e => e.id === id);
    if (entry) Object.assign(entry, props);
  }

  function removeEntry(id) {
    const idx = _entries.findIndex(e => e.id === id);
    if (idx !== -1) _entries.splice(idx, 1);
  }

  function getEntries() { return [..._entries]; }

  function getEntriesByCategory() {
    const map = new Map();
    for (const e of _entries) {
      const cat = e.category.trim() || 'KPI';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(e);
    }
    return map;
  }

  function clearAll() {
    _images.length  = 0;
    _entries.length = 0;
    // Reset all counters
    Object.keys(_typeCount).forEach(k => delete _typeCount[k]);
  }

  // ── Private: auto-label by type + upload order ────────────────────────────────

  /**
   * Sort images in place according to the official KPI_GRAPH_SEQUENCE.
   */
  function sortByStandardSequence() {
    const seqList = (typeof KPI_GRAPH_SEQUENCE !== 'undefined' ? KPI_GRAPH_SEQUENCE : []).map(s => s.trim().toLowerCase());
    _images.sort((a, b) => {
      const aLabel = (a.label || a.name || '').trim().toLowerCase();
      const bLabel = (b.label || b.name || '').trim().toLowerCase();

      let aIdx = seqList.indexOf(aLabel);
      let bIdx = seqList.indexOf(bLabel);

      // Partial match fallback if exact match not found
      if (aIdx === -1) aIdx = seqList.findIndex(s => aLabel.includes(s) || s.includes(aLabel));
      if (bIdx === -1) bIdx = seqList.findIndex(s => bLabel.includes(s) || s.includes(bLabel));

      const aRank = aIdx === -1 ? 999 : aIdx;
      const bRank = bIdx === -1 ? 999 : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return a.id - b.id;
    });
  }

  /**
   * Detect the graph type from the filename, increment its counter,
   * and return the correct ordered label matching the standard sequence.
   */
  function _autoLabel(cleaned, originalFilename) {
    const lc  = (cleaned + ' ' + originalFilename).toLowerCase();
    const has = (...w) => w.every(x => lc.includes(x));

    // Helper: check if filename explicitly has node indicators
    const isNode1 = has('01') || has('usn1') || has('ugw1') || has('node1');
    const isNode2 = has('02') || has('usn2') || has('ugw2') || has('node2');

    // Helper: increment counter for a key and return the current count (1-based)
    const count = key => {
      _typeCount[key] = (_typeCount[key] || 0) + 1;
      return _typeCount[key];
    };

    // ── 19. vUSN S1 mode ──
    if (has('vusn') && has('s1')) return 'vUSN_S1_mode - CloudUSN01';

    // ── 3. 4G vUSN Attach ──
    if (has('vusn') && (has('4g') || has('attach'))) return '4G vUSN Attach Users';

    // ── 16 & 17. IP CAN / PCRF (UPCC vs UPCC02) ──
    if (has('upcc') || has('ipcan') || (has('ip') && has('can')) || has('pcrf')) {
      if (has('02') || has('upcc02')) return 'IP CAN sessions PCRF - UPCC02';
      if (has('upcc') && !has('02')) return 'IP CAN sessions PCRF - UPCC';
      const n = count('ipcan');
      return n === 1 ? 'IP CAN sessions PCRF - UPCC' : 'IP CAN sessions PCRF - UPCC02';
    }

    // ── 18. CGW / SPGW ──
    if (has('cgw') || has('spgw')) return 'CGW SPGW average bearers - CloudCGW01';

    // ── 8 & 9. UGW PDP (UGW1 vs UGW2) ──
    if (has('ugw')) {
      if (isNode2) return '2G 3G UGW2 PDP';
      if (isNode1) return '2G 3G UGW1 PDP';
      const n = count('ugw');
      return n === 1 ? '2G 3G UGW1 PDP' : '2G 3G UGW2 PDP';
    }

    // ── 1 & 2. 4G Attach (USN02 vs USN01) ──
    if (has('4g') && has('attach')) {
      if (isNode1) return '4G attach users - USN01';
      if (isNode2) return '4G attach users - USN02';
      const n = count('4g_attach');
      return n === 1 ? '4G attach users - USN02' : '4G attach users - USN01';
    }

    // ── 4 & 5. 2.5G Attach (USN02 vs USN01) ──
    if ((has('2.5') || has('2.5g') || has('gb')) && has('attach')) {
      if (isNode1) return '2.5G attach users - USN01';
      if (isNode2) return '2.5G attach users - USN02';
      const n = count('25g_attach');
      return n === 1 ? '2.5G attach users - USN02' : '2.5G attach users - USN01';
    }

    // ── 6 & 7. 3G Attach (USN02 vs USN01) ──
    if (has('3g') && has('attach')) {
      if (isNode1) return '3G attach users - USN01';
      if (isNode2) return '3G attach users - USN02';
      const n = count('3g_attach');
      return n === 1 ? '3G attach users - USN02' : '3G attach users - USN01';
    }

    // ── 10 & 11. 2G PDP (USN1 vs USN2) ──
    if (has('2g') && has('pdp')) {
      if (isNode2) return '2G PDP USN2';
      if (isNode1) return '2G PDP USN1';
      const n = count('2g_pdp');
      return n === 1 ? '2G PDP USN1' : '2G PDP USN2';
    }

    // ── 12 & 13. 3G PDP (USN1 vs USN2) ──
    if (has('3g') && has('pdp')) {
      if (isNode2) return '3G PDP - USN2';
      if (isNode1) return '3G PDP - USN1';
      const n = count('3g_pdp');
      return n === 1 ? '3G PDP - USN1' : '3G PDP - USN2';
    }

    // ── 14 & 15. 4G PDP (USN1 vs USN2) ──
    if (has('4g') && has('pdp')) {
      if (isNode2) return '4G PDP - USN2';
      if (isNode1) return '4G PDP - USN1';
      const n = count('4g_pdp');
      return n === 1 ? '4G PDP - USN1' : '4G PDP - USN2';
    }

    // ── Fallback — check if cleaned matches any in sequence ──
    if (typeof KPI_GRAPH_SEQUENCE !== 'undefined') {
      const match = KPI_GRAPH_SEQUENCE.find(s => s.toLowerCase() === cleaned.toLowerCase());
      if (match) return match;
    }

    return cleaned;
  }

  /**
   * Strip timestamps and clean a filename for display.
   * e.g. "4G attach user(2026 09 18 09 06 10) 20260918 090625.png" → "4G attach user"
   */
  function _stripTimestamps(name) {
    let s = name;
    s = s.replace(/\.[^/.]+$/, '');              // remove extension
    s = s.replace(/\(\s*\d[\d\s]+\)/g, '');      // remove (2026 09 18 ...)
    s = s.replace(/\s*\d{8}\s*\d{0,6}\s*$/, ''); // remove 20260918 090625
    s = s.replace(/\s*\d{4}(\s+\d{2}){2,5}\s*$/, ''); // remove 2026 09 18 09 06
    s = s.replace(/[-_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return s || name.replace(/\.[^/.]+$/, '');
  }

  return {
    addImage, updateImage, removeImage, getImages, getAllImages, reorder,
    sortByStandardSequence,
    addEntry, updateEntry, removeEntry, getEntries, getEntriesByCategory,
    clearAll,
  };
})();
