# Daily KPI Check PDF Generator

A professional, browser-based tool for generating **Daily KPI Check** PDF reports from CSV alarm data and KPI images — no installation required.

---

## Quick Start

1. Open `index.html` in any modern browser (Chrome / Edge recommended).
2. Fill in **Report Information** (date, title, team name, region).
3. Upload your `data.csv` alarm export (use `sample_data.csv` to test).
4. Optionally upload KPI screenshots and add manual KPI metrics.
5. Add any Issues / Observations.
6. Click **Preview Report** to review the report in the browser.
7. Click **Generate PDF** → **Download PDF**.

---

## CSV Format

The tool reads the CSV using these column positions (1-based letter):

| Column | Field               |
|--------|---------------------|
| B      | Severity            |
| C      | Alarm ID            |
| D      | Name                |
| E      | NE Type             |
| F      | Occurred On (NT)    |
| G      | Cleared On (NT)     |
| H      | Alarm Source        |
| I      | Location Information|
| J      | MO Name             |

The first row may be a header row — it is detected and skipped automatically.

---

## Alarm Filtering

The following alarm names are **automatically excluded** (case-insensitive):

- Data path disconnected--2607
- GTPC Tunnel Path Broken
- GTPU Tunnel Path Broken
- IPPM session fault
- S1ap Link Down
- Signalling path disconnected
- The IPPM Loss Packet Ratio exceeded threshold

---

## PDF Structure

1. Cover Page
2. Table of Contents
3. KPI Data Summary *(if entries added)*
4. KPI Images *(if uploaded)*
5. Issues & Observations *(if any)*
6. Alarm Overview (stats + source table)
7. Alarm Source sections — one per unique source in the CSV

---

## Files

```
daily-kpi-generator/
├── index.html          ← Main application
├── styles.css          ← All UI styles
├── sample_data.csv     ← Sample CSV for testing
├── js/
│   ├── constants.js    ← Column mappings, filter list, colour constants
│   ├── csvParser.js    ← PapaParse-based CSV reader
│   ├── alarmFilter.js  ← Filter + group alarms by source
│   ├── kpiManager.js   ← KPI image + manual entry state manager
│   ├── previewRenderer.js  ← HTML preview renderer
│   ├── pdfGenerator.js ← jsPDF + autoTable PDF builder
│   └── app.js          ← Main controller, UI wiring
```

---

## Dependencies (loaded from CDN — no install needed)

| Library | Version | Purpose |
|---------|---------|---------|
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | PDF creation |
| [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 3.8.2 | Professional tables in PDF |
| [PapaParse](https://www.papaparse.com/) | 5.4.1 | Fast CSV parsing |
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Severity distribution chart |
"# KPI" 
"# KPI" 
"# KPI" 
