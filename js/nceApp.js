/**
 * nceApp.js
 * Main controller for the Daily NCE Datacom Report page.
 */

'use strict';

/* ============================================================
   Link name presets (matching the reference PDF TOC)
   ============================================================ */
const NCE_LINK_PRESETS = [
  'R2-ISP-RT-A → R12-ISP-RT-B',
  'R2-ISP-RT-A → R2-ISP-FW-A',
  'R2-ISP-FW-A → R12-ISP-FW-B',
  'R2-ISP-FW-A → R4-S9312-A',
  'R2-ISP-FW-A → R12-S9312-A',
  'R2-ISP-FW-A → DCGW_01',
  'R12-ISP-FW-B → R4-S9312-B',
  'R12-ISP-FW-B → R12-S9312-B',
  'R12-ISP-FW-B → DCGW_02',
  'R4-S9312-A → R4-S9312-B',
  'R4-S9312-A → R4-UGW1',
  'R4-S9312-B → R4-UGW1',
  'R12-S9312-A → R12-S9312-B',
  'R12-S9312-A → R12-UGW2',
  'R12-S9312-B → R12-UGW2',
];

/* ============================================================
   Application State
   ============================================================ */
const NceAppState = {
  reportDate:    '',
  reportTitle:   'Daily NCE Datacom report',
  preparedBy:    '',
  networkRegion: '',
  pdfBlob:       null,
  pdfFileName:   '',
};

/* ============================================================
   DOM References
   ============================================================ */
const NceDom = {
  reportDate:       () => document.getElementById('nceReportDate'),
  reportTitle:      () => document.getElementById('nceReportTitle'),
  preparedBy:       () => document.getElementById('ncePreparedBy'),
  networkRegion:    () => document.getElementById('nceNetworkRegion'),

  // Topology
  topoDropZone:     () => document.getElementById('nceTopoDropZone'),
  topoFileInput:    () => document.getElementById('nceTopoFileInput'),
  topoStatus:       () => document.getElementById('nceTopoStatus'),
  topoName:         () => document.getElementById('nceTopoName'),
  topoClear:        () => document.getElementById('nceTopoClear'),

  // Link graphs
  graphDropZone:    () => document.getElementById('nceGraphDropZone'),
  graphFileInput:   () => document.getElementById('nceGraphFileInput'),
  graphList:        () => document.getElementById('nceGraphList'),

  // Alarm CSV
  alarmDropZone:    () => document.getElementById('nceAlarmDropZone'),
  alarmFileInput:   () => document.getElementById('nceAlarmFileInput'),
  alarmStatus:      () => document.getElementById('nceAlarmStatus'),
  alarmFileName:    () => document.getElementById('nceAlarmFileName'),
  alarmRowCount:    () => document.getElementById('nceAlarmRowCount'),
  alarmClear:       () => document.getElementById('nceAlarmClear'),

  // Buttons
  btnPreview:       () => document.getElementById('nceBtnPreview'),
  btnGenerate:      () => document.getElementById('nceBtnGenerate'),
  btnDownload:      () => document.getElementById('nceBtnDownload'),

  // Loading / toast
  loadingOverlay:   () => document.getElementById('nceLoadingOverlay'),
  loadingMsg:       () => document.getElementById('nceLoadingMsg'),
  loadingSub:       () => document.getElementById('nceLoadingSub'),
  toastContainer:   () => document.getElementById('nceToastContainer'),
  headerDate:       () => document.getElementById('nceHeaderDate'),
};

/* ============================================================
   Initialisation
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  _initHeaderDate();
  _initReportDate();
  _initFormListeners();
  _initTopoUpload();
  _initGraphUpload();
  _initAlarmUpload();
  _initActionButtons();
});

function _initHeaderDate() {
  const now = new Date();
  NceDom.headerDate().textContent = now.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

function _initReportDate() {
  const today = new Date().toISOString().split('T')[0];
  NceDom.reportDate().value = today;
  NceAppState.reportDate    = today;
}

/* ============================================================
   Form listeners
   ============================================================ */
function _initFormListeners() {
  NceDom.reportDate().addEventListener('change',
    e => { NceAppState.reportDate = e.target.value; });
  NceDom.reportTitle().addEventListener('input',
    e => { NceAppState.reportTitle = e.target.value.trim() || 'Daily NCE Datacom report'; });
  NceDom.preparedBy().addEventListener('input',
    e => { NceAppState.preparedBy = e.target.value.trim(); });
  NceDom.networkRegion().addEventListener('input',
    e => { NceAppState.networkRegion = e.target.value.trim(); });
}

/* ============================================================
   Topology image upload
   ============================================================ */
function _initTopoUpload() {
  const zone  = NceDom.topoDropZone();
  const input = NceDom.topoFileInput();

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) _handleTopoFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) _handleTopoFile(input.files[0]);
  });
  NceDom.topoClear().addEventListener('click', () => {
    NceKpiManager.clearTopoImage();
    NceDom.topoStatus().hidden   = true;
    NceDom.topoDropZone().hidden = false;
    NceDom.topoFileInput().value = '';
    nceShowToast('Topology image removed.', 'warning');
  });
}

async function _handleTopoFile(file) {
  if (!file.type.startsWith('image/')) {
    nceShowToast('Please upload an image file for the topology.', 'error');
    return;
  }
  try {
    await NceKpiManager.setTopoImage(file);
    NceDom.topoDropZone().hidden = true;
    NceDom.topoStatus().hidden   = false;
    NceDom.topoName().textContent = file.name;
    nceShowToast('Topology diagram uploaded.', 'success');
  } catch (err) {
    nceShowToast('Failed to load topology image: ' + err.message, 'error');
  }
}

/* ============================================================
   Link KPI graph upload
   ============================================================ */
function _initGraphUpload() {
  const zone  = NceDom.graphDropZone();
  const input = NceDom.graphFileInput();

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(_handleGraphFile);
  });
  input.addEventListener('change', () => {
    Array.from(input.files).forEach(_handleGraphFile);
    input.value = '';
  });
}

async function _handleGraphFile(file) {
  if (!file.type.startsWith('image/')) {
    nceShowToast(`${file.name} is not an image.`, 'error');
    return;
  }
  try {
    const graph = await NceKpiManager.addLinkGraph(file);
    _renderGraphCard(graph);
    nceShowToast(`Graph added: ${graph.label}`, 'success');
  } catch (err) {
    nceShowToast('Failed to load graph: ' + err.message, 'error');
  }
}

function _renderGraphCard(graph) {
  const list = NceDom.graphList();
  const card = document.createElement('div');
  card.className = 'kpi-image-item';
  card.id = `nce-graph-${graph.id}`;
  card.draggable = true;
  card.dataset.gid = graph.id;

  const dlId = `nce-presets-${graph.id}`;

  card.innerHTML = `
    <div class="kpi-img-header">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <img class="kpi-img-thumb" src="${graph.dataUrl}" alt="${_esc(graph.name)}" />
      <span class="kpi-img-name" title="${_esc(graph.name)}">${_esc(graph.name)}</span>
      <button class="btn-clear nce-graph-del" data-gid="${graph.id}" title="Remove">✕</button>
    </div>
    <div class="kpi-img-body">
      <label class="field-label">Link Name (Graph Title)</label>
      <div style="position:relative">
        <input type="text" class="field-input" list="${dlId}"
               placeholder="e.g. R2-ISP-RT-A → R12-ISP-RT-B"
               value="${_esc(graph.label)}"
               data-gfield="label" data-gid="${graph.id}" />
        <datalist id="${dlId}">
          ${NCE_LINK_PRESETS.map(p => `<option value="${_esc(p)}">`).join('')}
        </datalist>
      </div>
      <label class="kpi-img-include" style="margin-top:6px">
        <input type="checkbox" checked data-gfield="include" data-gid="${graph.id}" />
        Include in PDF
      </label>
    </div>`;

  // Remove
  card.querySelector('.nce-graph-del').addEventListener('click', () => {
    NceKpiManager.removeLinkGraph(graph.id);
    card.remove();
    nceShowToast('Graph removed.', 'warning');
  });

  // Field changes
  card.querySelectorAll('[data-gfield]').forEach(el => {
    const evt = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const val = el.type === 'checkbox' ? el.checked : el.value.trim();
      NceKpiManager.updateLinkGraph(graph.id, { [el.dataset.gfield]: val });
    });
  });

  // Drag-to-reorder
  _attachDragReorder(card, graph.id, list);

  list.appendChild(card);
}

function _attachDragReorder(card, id, list) {
  card.addEventListener('dragstart', e => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    list.querySelectorAll('.kpi-image-item').forEach(c =>
      c.classList.remove('drag-over-top', 'drag-over-bottom'));
    const orderedIds = Array.from(list.querySelectorAll('.kpi-image-item'))
      .map(el => parseInt(el.dataset.gid, 10));
    NceKpiManager.reorderGraphs(orderedIds);
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    card.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
  });
  card.addEventListener('dragleave', () =>
    card.classList.remove('drag-over-top', 'drag-over-bottom'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (draggedId === id) return;
    const draggedCard = list.querySelector(`[data-gid="${draggedId}"]`);
    if (!draggedCard) return;
    const rect = card.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      list.insertBefore(draggedCard, card);
    } else {
      list.insertBefore(draggedCard, card.nextSibling);
    }
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    nceShowToast('Order updated.', 'success');
  });
}

/* ============================================================
   Alarm CSV upload
   ============================================================ */
function _initAlarmUpload() {
  const zone  = NceDom.alarmDropZone();
  const input = NceDom.alarmFileInput();

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) _handleAlarmFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) _handleAlarmFile(input.files[0]);
    input.value = '';
  });
  NceDom.alarmClear().addEventListener('click', () => {
    NceKpiManager.clearAlarms();
    NceDom.alarmStatus().hidden    = true;
    NceDom.alarmDropZone().hidden  = false;
    NceDom.alarmFileInput().value  = '';
    nceShowToast('Alarm data cleared.', 'warning');
  });
}

async function _handleAlarmFile(file) {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith('.csv') && !ext.endsWith('.txt') && !ext.endsWith('.tsv')) {
    nceShowToast('Please upload a CSV or TSV alarm file.', 'error');
    return;
  }
  try {
    nceShowLoading('Parsing alarms…', file.name);
    const text = await file.text();
    NceKpiManager.parseAlarmCSV(text);
    const total = NceKpiManager.getTotalAlarms();
    const unc   = NceKpiManager.getUnclearedAlarms().length;
    const clr   = NceKpiManager.getClearedAlarms().length;

    NceDom.alarmDropZone().hidden  = false; // keep zone visible (allow re-upload)
    NceDom.alarmStatus().hidden    = false;
    NceDom.alarmFileName().textContent = file.name;
    NceDom.alarmRowCount().textContent =
      `${total} alarms · ${unc} uncleared · ${clr} cleared`;

    nceHideLoading();
    nceShowToast(`Alarms loaded: ${unc} uncleared, ${clr} cleared.`, 'success');
  } catch (err) {
    nceHideLoading();
    nceShowToast('Failed to parse alarm file: ' + err.message, 'error');
  }
}

/* ============================================================
   Action Buttons
   ============================================================ */
function _initActionButtons() {
  NceDom.btnPreview().addEventListener('click',  _doPreview);
  NceDom.btnGenerate().addEventListener('click', _doGenerate);
  NceDom.btnDownload().addEventListener('click', _doDownload);
}

function _buildStateSnapshot() {
  return {
    reportDate:      NceDom.reportDate().value    || new Date().toISOString().split('T')[0],
    reportTitle:     NceDom.reportTitle().value   || 'Daily NCE Datacom report',
    preparedBy:      NceDom.preparedBy().value    || '',
    networkRegion:   NceDom.networkRegion().value || '',
    topoImage:       NceKpiManager.getTopoImage(),
    linkGraphs:      NceKpiManager.getLinkGraphs(),
    unclearedAlarms: NceKpiManager.getUnclearedAlarms(),
    clearedAlarms:   NceKpiManager.getClearedAlarms(),
  };
}

function _doPreview() {
  const state = _buildStateSnapshot();
  const hasAny = state.topoImage || state.linkGraphs.length > 0 ||
                 state.unclearedAlarms.length > 0 || state.clearedAlarms.length > 0;
  if (!hasAny) {
    nceShowToast('Upload a topology image, link graphs, or alarm CSV first.', 'warning');
    return;
  }
  NcePreviewRenderer.render(state);
  nceShowToast('Preview updated.', 'success');
}

async function _doGenerate() {
  const state = _buildStateSnapshot();
  const hasAny = state.topoImage || state.linkGraphs.length > 0 ||
                 state.unclearedAlarms.length > 0 || state.clearedAlarms.length > 0;
  if (!hasAny) {
    nceShowToast('Nothing to generate. Upload data first.', 'warning');
    return;
  }

  nceShowLoading('Generating PDF…', 'Preparing document…');

  try {
    const doc = await NcePdfGenerator.generate(state, (msg, sub) => {
      NceDom.loadingMsg().textContent = msg;
      NceDom.loadingSub().textContent = sub;
    });

    const dateStr  = state.reportDate.replace(/-/g, '');
    const fileName = `Daily_NCE_Datacom_${dateStr}.pdf`;

    NceAppState.pdfBlob     = doc.output('blob');
    NceAppState.pdfFileName = fileName;

    nceHideLoading();
    NceDom.btnDownload().disabled = false;
    nceShowToast(`PDF ready: ${fileName}`, 'success');

    // Refresh preview
    NcePreviewRenderer.render(state);
  } catch (err) {
    nceHideLoading();
    console.error(err);
    nceShowToast('PDF generation failed: ' + err.message, 'error');
  }
}

function _doDownload() {
  if (!NceAppState.pdfBlob) {
    nceShowToast('Generate the PDF first.', 'warning');
    return;
  }
  const url  = URL.createObjectURL(NceAppState.pdfBlob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = NceAppState.pdfFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  nceShowToast(`Downloading ${NceAppState.pdfFileName}…`, 'success');
}

/* ============================================================
   UI Helpers
   ============================================================ */
function nceShowLoading(msg, sub) {
  NceDom.loadingMsg().textContent = msg;
  NceDom.loadingSub().textContent = sub || '';
  NceDom.loadingOverlay().hidden  = false;
}
function nceHideLoading() {
  NceDom.loadingOverlay().hidden = true;
}

function nceShowToast(message, type = 'info') {
  const container = NceDom.toastContainer();
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
