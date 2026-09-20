/**
 * constants.js
 * Shared constants for the Daily KPI Check PDF Generator.
 */

'use strict';

// ── Column indices (0-based after PapaParse parses CSV rows as arrays) ──────
// The CSV uses lettered columns A–J.  PapaParse index 0 = col A.
const COL = {
  A:         0,
  SEVERITY:  1,   // B
  ALARM_ID:  2,   // C
  NAME:      3,   // D
  NE_TYPE:   4,   // E
  OCCURRED:  5,   // F  Occurred On (NT)
  CLEARED:   6,   // G  Cleared On (NT)
  SOURCE:    7,   // H  Alarm Source
  LOCATION:  8,   // I  Location Information
  MO_NAME:   9,   // J  MO Name
};

// ── Alarm names to exclude (case-insensitive match) ──────────────────────────
const EXCLUDED_ALARM_NAMES = [
  'Data path disconnected--2607',
  'GTPC Tunnel Path Broken',
  'GTPU Tunnel Path Broken',
  'IPPM session fault',
  'S1ap Link Down',
  'Signalling path disconnected',
  'The IPPM Loss Packet Ratio exceeded threshold',
];

// Pre-compute lower-case set for fast lookup
const EXCLUDED_ALARM_NAMES_LC = new Set(
  EXCLUDED_ALARM_NAMES.map(n => n.trim().toLowerCase())
);

// ── Standard Sequence for KPI Graphs in PDF (exact order) ─────────────────────
const KPI_GRAPH_SEQUENCE = [
  '4G attach users - USN02',
  '4G attach users - USN01',
  '4G vUSN Attach Users',
  '2.5G attach users - USN02',
  '2.5G attach users - USN01',
  '3G attach users - USN02',
  '3G attach users - USN01',
  '2G 3G UGW1 PDP',
  '2G 3G UGW2 PDP',
  '2G PDP USN1',
  '2G PDP USN2',
  '3G PDP - USN1',
  '3G PDP - USN2',
  '4G PDP - USN1',
  '4G PDP - USN2',
  'IP CAN sessions PCRF - UPCC',
  'IP CAN sessions PCRF - UPCC02',
  'CGW SPGW average bearers - CloudCGW01',
  'vUSN_S1_mode - CloudUSN01',
];

// ── Severity colour map (used in PDF cells) ──────────────────────────────────
const SEVERITY_COLORS = {
  critical: { fill: [253, 232, 232], text: [192,  57,  43] },
  major:    { fill: [254, 240, 224], text: [230, 126,  34] },
  minor:    { fill: [254, 250, 224], text: [160, 128,   0] },
  warning:  { fill: [254, 240, 224], text: [230, 126,  34] },
  cleared:  { fill: [234, 247, 239], text: [ 39, 174,  96] },
  default:  { fill: [240, 240, 240], text: [ 80,  80,  80] },
};

// ── Brand colours ─────────────────────────────────────────────────────────────
const BRAND = {
  dark:      [  0,  51, 102],   // #003366
  mid:       [  0,  85, 165],   // #0055a5
  light:     [232, 240, 251],   // #e8f0fb
  white:     [255, 255, 255],
  black:     [  0,   0,   0],
  text:      [ 26,  35,  54],
  muted:     [107, 122, 153],
  border:    [208, 217, 232],
  accent:    [232,  76,  61],
  success:   [ 39, 174,  96],
  warning:   [243, 156,  18],
};

// ── PDF page settings ─────────────────────────────────────────────────────────
const PDF_CONFIG = {
  // Alarm tables use landscape A4 for more column room
  alarmOrientation: 'landscape',
  // KPI / cover pages use portrait
  coverOrientation:  'portrait',
  margin: { top: 20, right: 14, bottom: 22, left: 14 },
  headerHeight: 14,
  footerHeight: 10,
  fontSizeNormal: 9,
  fontSizeSmall:  8,
  fontSizeHeader: 10,
};
