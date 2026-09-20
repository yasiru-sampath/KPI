/**
 * app.js
 * Main application controller — wires all modules together.
 */

'use strict';

/* ============================================================
   Graph Name Presets  (shown in datalist dropdown)
   ============================================================ */
const GRAPH_NAME_PRESETS = [
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

/* ============================================================
   Application State
   ============================================================ */
const AppState = {
  // Report metadata
  reportDate:    '',
  reportTitle:   'Daily KPI Check Report',
  preparedBy:    '',
  networkRegion: '',

  // CSV data
  csvLoaded:  false,
  csvRows:    [],         // raw AlarmRow[]
  total:      0,
  excluded:   0,
  included:   0,
  groups:     new Map(),  // Map<source, AlarmRow[]>

  // KPI
  kpiEntries: [],
  kpiImages:  [],

  // Issues
  issues: [],

  // Generated PDF
  pdfBlob: null,
  pdfFileName: '',
};

/* ============================================================
   DOM References
   ============================================================ */
const DOM = {
  // Report info
  reportDate:    () => document.getElementById('reportDate'),
  reportTitle:   () => document.getElementById('reportTitle'),
  preparedBy:    () => document.getElementById('preparedBy'),
  networkRegion: () => document.getElementById('networkRegion'),

  // CSV
  csvDropZone:  () => document.getElementById('csvDropZone'),
  csvFileInput: () => document.getElementById('csvFileInput'),
  csvStatus:    () => document.getElementById('csvStatus'),
  csvFileName:  () => document.getElementById('csvFileName'),
  csvRowCount:  () => document.getElementById('csvRowCount'),
  csvClear:     () => document.getElementById('csvClear'),
  filterSummary:() => document.getElementById('filterSummary'),
  statTotal:    () => document.getElementById('statTotal'),
  statExcluded: () => document.getElementById('statExcluded'),
  statIncluded: () => document.getElementById('statIncluded'),
  statSources:  () => document.getElementById('statSources'),

  // KPI Images
  imgDropZone:  () => document.getElementById('imgDropZone'),
  imgFileInput: () => document.getElementById('imgFileInput'),
  kpiImageList: () => document.getElementById('kpiImageList'),

  // KPI Entries
  kpiEntries:   () => document.getElementById('kpiEntries'),
  addKpiEntry:  () => document.getElementById('addKpiEntry'),

  // Issues
  issueEntries: () => document.getElementById('issueEntries'),
  addIssue:     () => document.getElementById('addIssue'),

  // Buttons
  btnPreview:   () => document.getElementById('btnPreview'),
  btnGenerate:  () => document.getElementById('btnGenerate'),
  btnDownload:  () => document.getElementById('btnDownload'),
  btnDownloadWord: () => document.getElementById('btnDownloadWord'),

  // Loading
  loadingOverlay: () => document.getElementById('loadingOverlay'),
  loadingMsg:     () => document.getElementById('loadingMsg'),
  loadingSub:     () => document.getElementById('loadingSub'),

  // Toast
  toastContainer: () => document.getElementById('toastContainer'),

  // Header date
  headerDate:   () => document.getElementById('headerDate'),
};

/* ============================================================
   Initialisation
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  _initHeaderDate();
  _initReportDate();
  _initCsvUpload();
  _initImageUpload();
  _initKpiEntries();
  _initIssues();
  _initActionButtons();
  _initFormListeners();
});

function _initHeaderDate() {
  const now = new Date();
  DOM.headerDate().textContent = now.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

function _initReportDate() {
  const today = new Date().toISOString().split('T')[0];
  DOM.reportDate().value = today;
  AppState.reportDate    = today;
}

/* ============================================================
   Form field listeners
   ============================================================ */
function _initFormListeners() {
  DOM.reportDate().addEventListener('change', e => { AppState.reportDate = e.target.value; });
  DOM.reportTitle().addEventListener('input', e => { AppState.reportTitle = e.target.value.trim() || 'Daily KPI Check Report'; });
  DOM.preparedBy().addEventListener('input', e => { AppState.preparedBy = e.target.value.trim(); });
  DOM.networkRegion().addEventListener('input', e => { AppState.networkRegion = e.target.value.trim(); });
}

/* ============================================================
   CSV Upload
   ============================================================ */
function _initCsvUpload() {
  const zone  = DOM.csvDropZone();
  const input = DOM.csvFileInput();

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) _handleCsvFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) _handleCsvFile(input.files[0]);
  });
  DOM.csvClear().addEventListener('click', _clearCsv);
}

async function _handleCsvFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please upload a .csv file.', 'error');
    return;
  }

  try {
    showLoading('Parsing CSV…', file.name);
    const rows = await CsvParser.parseFile(file);
    const result = AlarmFilter.process(rows);

    // Update state
    AppState.csvLoaded  = true;
    AppState.csvRows    = rows;
    AppState.total      = result.total;
    AppState.excluded   = result.excluded;
    AppState.included   = result.included;
    AppState.groups     = result.groups;

    // UI update
    DOM.csvStatus().hidden    = false;
    DOM.csvDropZone().hidden  = true;
    DOM.csvFileName().textContent = file.name;
    DOM.csvRowCount().textContent = `${rows.length} rows · ${result.groups.size} alarm sources`;
    DOM.filterSummary().hidden = false;
    DOM.statTotal().textContent    = result.total;
    DOM.statExcluded().textContent = result.excluded;
    DOM.statIncluded().textContent = result.included;
    DOM.statSources().textContent  = result.groups.size;

    DOM.btnGenerate().disabled = false;
    hideLoading();
    showToast(`CSV loaded: ${result.included} alarms across ${result.groups.size} sources.`, 'success');
  } catch (err) {
    hideLoading();
    showToast('Failed to parse CSV: ' + err.message, 'error');
  }
}

function _clearCsv() {
  AppState.csvLoaded  = false;
  AppState.csvRows    = [];
  AppState.total = AppState.excluded = AppState.included = 0;
  AppState.groups = new Map();

  DOM.csvStatus().hidden   = true;
  DOM.csvDropZone().hidden = false;
  DOM.filterSummary().hidden = true;
  DOM.csvFileInput().value = '';
  DOM.btnGenerate().disabled = true;
  DOM.btnDownload().disabled = true;
  AppState.pdfBlob = null;
  showToast('CSV removed.', 'warning');
}

/* ============================================================
   KPI Image Upload
   ============================================================ */
function _initImageUpload() {
  const zone  = DOM.imgDropZone();
  const input = DOM.imgFileInput();

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(_handleImageFile);
  });
  input.addEventListener('change', () => {
    Array.from(input.files).forEach(_handleImageFile);
    input.value = '';
  });
}

async function _handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast(`${file.name} is not an image.`, 'error');
    return;
  }
  try {
    const img = await KpiManager.addImage(file);
    _renderKpiImageCard(img);
    showToast(`Image added: ${img.label}`, 'success');
  } catch (err) {
    showToast('Failed to load image: ' + err.message, 'error');
  }
}

function _renderKpiImageCard(img) {
  const list = DOM.kpiImageList();
  const card = document.createElement('div');
  card.className = 'kpi-image-item';
  card.id = `kpi-img-${img.id}`;
  card.draggable = true;
  card.dataset.imgId = img.id;

  // Build datalist id unique per card
  const dlId = `gn-presets-${img.id}`;

  card.innerHTML = `
    <div class="kpi-img-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <img class="kpi-img-thumb" src="${img.dataUrl}" alt="${_esc(img.name)}" />
      <span class="kpi-img-name" title="${_esc(img.name)}">${_esc(img.name)}</span>
      <button class="btn-clear" data-img-id="${img.id}" title="Remove">✕</button>
    </div>
    <div class="kpi-img-body">
      <label class="field-label">Graph Name</label>
      <div style="position:relative">
        <input type="text" class="field-input" list="${dlId}"
               placeholder="Type or pick a preset…"
               value="${_esc(img.label)}"
               data-img-field="label" data-img-id="${img.id}" />
        <datalist id="${dlId}">
          ${GRAPH_NAME_PRESETS.map(p => `<option value="${_esc(p)}">`).join('')}
        </datalist>
      </div>
      <label class="field-label" style="margin-top:4px">Section Heading</label>
      <input type="text" class="field-input" value="${_esc(img.sectionTitle)}" data-img-field="sectionTitle" data-img-id="${img.id}" />
      <label class="kpi-img-include">
        <input type="checkbox" checked data-img-field="include" data-img-id="${img.id}" />
        Include in PDF
      </label>
    </div>`;

  // Remove button
  card.querySelector('.btn-clear').addEventListener('click', () => {
    KpiManager.removeImage(img.id);
    card.remove();
    showToast('Image removed.', 'warning');
  });

  // Field changes
  card.querySelectorAll('[data-img-field]').forEach(el => {
    const event = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(event, () => {
      const val = el.type === 'checkbox' ? el.checked : el.value.trim();
      KpiManager.updateImage(img.id, { [el.dataset.imgField]: val });
    });
  });

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  card.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', img.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    // Remove all drop indicators
    list.querySelectorAll('.kpi-image-item').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
    // Sync KpiManager order to match DOM order
    _syncImageOrder();
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    card.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  card.addEventListener('drop', e => {
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (draggedId === img.id) return;
    const draggedCard = list.querySelector(`[data-img-id="${draggedId}"]`);
    if (!draggedCard) return;
    const rect = card.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    if (insertBefore) {
      list.insertBefore(draggedCard, card);
    } else {
      list.insertBefore(draggedCard, card.nextSibling);
    }
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    _syncImageOrder();
    showToast('Image order updated.', 'success');
  });

  list.appendChild(card);
}

/**
 * After a drag-drop reorder, read the DOM order and update KpiManager's
 * internal array to match, so getImages() returns them in the right order.
 */
function _syncImageOrder() {
  const list = DOM.kpiImageList();
  const orderedIds = Array.from(list.querySelectorAll('.kpi-image-item'))
    .map(el => parseInt(el.dataset.imgId, 10));
  KpiManager.reorder(orderedIds);
  // Update order badges
  list.querySelectorAll('.kpi-image-item').forEach((el, i) => {
    const badge = el.querySelector('.order-badge');
    if (badge) badge.textContent = i + 1;
  });
}

/* ============================================================
   KPI Manual Entries
   ============================================================ */
function _initKpiEntries() {
  DOM.addKpiEntry().addEventListener('click', () => {
    const entry = KpiManager.addEntry();
    _renderKpiEntryCard(entry);
  });
}

function _renderKpiEntryCard(entry) {
  const container = DOM.kpiEntries();
  const card = document.createElement('div');
  card.className = 'kpi-entry';
  card.id = `kpi-entry-${entry.id}`;
  card.innerHTML = `
    <div class="kpi-entry-header">
      <span class="kpi-entry-title">KPI Entry #${entry.id}</span>
      <button class="btn-clear" data-entry-id="${entry.id}" title="Remove">✕</button>
    </div>
    <div class="kpi-entry-grid">
      <div>
        <label class="field-label">Category</label>
        <input type="text" class="field-input" placeholder="e.g. Availability" data-ef="category" data-eid="${entry.id}" />
      </div>
      <div>
        <label class="field-label">Metric</label>
        <input type="text" class="field-input" placeholder="e.g. UPT Rate" data-ef="metric" data-eid="${entry.id}" />
      </div>
      <div>
        <label class="field-label">Value</label>
        <input type="text" class="field-input" placeholder="e.g. 99.95" data-ef="value" data-eid="${entry.id}" />
      </div>
      <div>
        <label class="field-label">Unit</label>
        <input type="text" class="field-input" placeholder="e.g. %" data-ef="unit" data-eid="${entry.id}" />
      </div>
      <div>
        <label class="field-label">Target</label>
        <input type="text" class="field-input" placeholder="e.g. ≥ 99.9%" data-ef="target" data-eid="${entry.id}" />
      </div>
      <div>
        <label class="field-label">Status</label>
        <select class="field-input" data-ef="status" data-eid="${entry.id}">
          <option value="">— Select —</option>
          <option value="OK">OK</option>
          <option value="Warning">Warning</option>
          <option value="Critical">Critical</option>
          <option value="N/A">N/A</option>
        </select>
      </div>
    </div>`;

  card.querySelector('.btn-clear').addEventListener('click', () => {
    KpiManager.removeEntry(entry.id);
    card.remove();
  });
  card.querySelectorAll('[data-ef]').forEach(el => {
    el.addEventListener('input', () => KpiManager.updateEntry(entry.id, { [el.dataset.ef]: el.value.trim() }));
    el.addEventListener('change', () => KpiManager.updateEntry(entry.id, { [el.dataset.ef]: el.value.trim() }));
  });

  container.appendChild(card);
}

/* ============================================================
   Issues
   ============================================================ */
function _initIssues() {
  DOM.addIssue().addEventListener('click', () => {
    const idx = AppState.issues.length;
    AppState.issues.push('');
    _renderIssueCard(idx);
  });
}

function _renderIssueCard(idx) {
  const container = DOM.issueEntries();
  const card = document.createElement('div');
  card.className = 'issue-entry';
  card.id = `issue-${idx}`;
  card.innerHTML = `
    <div class="issue-entry-header">
      <span class="issue-entry-num">Issue #${idx + 1}</span>
      <button class="btn-clear" title="Remove">✕</button>
    </div>
    <textarea class="issue-textarea" placeholder="Describe the issue or observation…"></textarea>`;

  card.querySelector('textarea').addEventListener('input', e => {
    AppState.issues[idx] = e.target.value.trim();
  });
  card.querySelector('.btn-clear').addEventListener('click', () => {
    AppState.issues[idx] = '';
    card.remove();
  });

  container.appendChild(card);
}

/* ============================================================
   Action Buttons
   ============================================================ */
function _initActionButtons() {
  DOM.btnPreview().addEventListener('click', _doPreview);
  DOM.btnGenerate().addEventListener('click', _doGenerate);
  DOM.btnDownload().addEventListener('click', _doDownload);
  DOM.btnDownloadWord().addEventListener('click', _doDownloadWord);
}

function _buildStateSnapshot() {
  return {
    reportDate:    DOM.reportDate().value    || new Date().toISOString().split('T')[0],
    reportTitle:   DOM.reportTitle().value   || 'Daily KPI Check Report',
    preparedBy:    DOM.preparedBy().value    || '',
    networkRegion: DOM.networkRegion().value || '',
    csvLoaded:     AppState.csvLoaded,
    total:         AppState.total,
    excluded:      AppState.excluded,
    included:      AppState.included,
    groups:        AppState.groups,
    kpiEntries:    KpiManager.getEntries(),
    kpiImages:     KpiManager.getImages(),
    issues:        AppState.issues.filter(i => i.trim()),
  };
}

function _doPreview() {
  const state = _buildStateSnapshot();
  if (!state.csvLoaded && state.kpiEntries.length === 0 && state.kpiImages.length === 0) {
    showToast('Please upload a CSV file or add KPI data first.', 'warning');
    return;
  }
  PreviewRenderer.render(state);
  showToast('Preview updated.', 'success');
}

async function _doGenerate() {
  const state = _buildStateSnapshot();
  if (!state.csvLoaded && state.kpiEntries.length === 0 && state.kpiImages.length === 0) {
    showToast('Nothing to generate. Upload CSV or add KPI data first.', 'warning');
    return;
  }

  showLoading('Generating PDF…', 'Preparing document…');

  try {
    const doc = await PdfGenerator.generate(state, (msg, sub) => {
      DOM.loadingMsg().textContent = msg;
      DOM.loadingSub().textContent = sub;
    });

    const dateStr = state.reportDate.replace(/-/g, '-');
    const fileName = `Daily_KPI_Check_${dateStr}.pdf`;

    AppState.pdfBlob     = doc.output('blob');
    AppState.pdfFileName = fileName;

    hideLoading();
    DOM.btnDownload().disabled = false;
    DOM.btnDownloadWord().disabled = false;
    showToast(`PDF ready: ${fileName}`, 'success');

    // Auto-render preview if not done yet
    PreviewRenderer.render(state);
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('PDF generation failed: ' + err.message, 'error');
  }
}

function _doDownload() {
  if (!AppState.pdfBlob) {
    showToast('Generate the PDF first.', 'warning');
    return;
  }
  const url  = URL.createObjectURL(AppState.pdfBlob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = AppState.pdfFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast(`Downloading ${AppState.pdfFileName}…`, 'success');
}

async function _doDownloadWord() {
  const state = _buildStateSnapshot();
  if (!state.csvLoaded && state.kpiEntries.length === 0 && state.kpiImages.length === 0) {
    showToast('Nothing to export. Generate the report first.', 'warning');
    return;
  }

  if (typeof JSZip === 'undefined') {
    showToast('JSZip library not loaded. Ensure libs/jszip.min.js is present.', 'error');
    return;
  }

  showLoading('Generating Word document…', 'Building .docx…');

  try {
    const blob = await WordGenerator.generate(state);

    const dateStr  = state.reportDate.replace(/-/g, '-');
    const fileName = `Daily_KPI_Check_${dateStr}.docx`;

    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    hideLoading();
    showToast(`Word document downloaded: ${fileName}`, 'success');
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('Word generation failed: ' + err.message, 'error');
  }
}

/* ============================================================
   UI Helpers
   ============================================================ */
function showLoading(msg, sub) {
  DOM.loadingMsg().textContent = msg;
  DOM.loadingSub().textContent = sub || '';
  DOM.loadingOverlay().hidden  = false;
}
function hideLoading() {
  DOM.loadingOverlay().hidden = true;
}

let _toastTimer = null;
function showToast(message, type = 'info') {
  const container = DOM.toastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${_esc(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
