// ─── CSV export helpers ──────────────────────────────────────────────────────
import { calcDeal } from './calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';

// ─── Shared color palette ────────────────────────────────────────────────────
// XLSX functions use 6-char hex strings (no #); PDF functions use RGB arrays.
// Keep both formats here so each function just references COLORS.* instead of
// repeating literal values.
const COLORS = {
  // Hex strings for XLSX (xlsx-js-style format)
  xlsx: {
    NAVY:      '0F172A',
    TEAL:      '0D9488',
    TEAL_300:  '2DD4BF',
    INK:       '1E293B',
    WHITE:     'FFFFFF',
    SLATE:     '475569',
    SLATE_LT:  '94A3B8',
    OFF_WHITE: 'F8FAFC',
    TEAL_BG:   'F0FDFB',
    GREEN:     '166534',
    GREEN_BG:  'DCFCE7',
    AMBER:     'D97706',
    AMBER_BG:  'FFFBEB',
    RED_C:     'DC2626',
    RED_BG:    'FEF2F2',
    BLUE_C:    '1D4ED8',
    BLUE_BG:   'EFF6FF',
  },
  // RGB arrays for jsPDF
  pdf: {
    NAVY:    [15,  23,  42],
    TEAL:    [13,  148, 136],
    TEAL_DK: [10,  110, 100],
    CREAM:   [250, 248, 244],
    SLATE:   [71,  85,  105],
    RULE:    [203, 213, 225],
    WHITE:   [255, 255, 255],
    INK:     [30,  30,  40],
    TEAL_BG: [240, 253, 250],
    AMBER:   [217, 119,   6],
  },
};

function exportPortfolioXLSX(deals, user) {
  const { NAVY, TEAL, TEAL_300, INK, WHITE, SLATE, SLATE_LT, OFF_WHITE,
          TEAL_BG, GREEN, GREEN_BG, AMBER, AMBER_BG, RED_C, RED_BG, BLUE_C, BLUE_BG } = COLORS.xlsx;

  const USD  = '"$"#,##0;("$"#,##0)';
  const PCT1 = '0.0%;(0.0%)';
  const X2   = '0.00"x"';
  const N2   = '0.00';

  const fl  = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });
  const wb  = XLSX.utils.book_new();

  const preparer = user?.user_metadata?.display_name || user?.email || '';
  const orgStr   = user?.user_metadata?.organization ? '  ·  ' + user.user_metadata.organization : '';
  const dateStr  = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Cell factories (same language as deal export) ──────────────────────
  const Banner = (v, sz = 13, align = 'left', italic = false) => ({
    v: v ?? '', t: 's',
    s: { font: { bold: !italic, italic, color: { rgb: WHITE }, sz, name: 'Calibri' },
         fill: fl(NAVY), alignment: { horizontal: align, vertical: 'center' } }
  });
  const SecHdr = (v) => ({
    v: v ?? '', t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
         fill: fl(TEAL), alignment: { horizontal: 'left', vertical: 'center' },
         border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }
  });
  const TblHdr = (v, align = 'right') => ({
    v: v ?? '', t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 9, name: 'Calibri' },
         fill: fl(INK), alignment: { horizontal: align, vertical: 'center', wrapText: true },
         border: { bottom: { style: 'thin', color: { rgb: TEAL } },
                   left:   { style: 'thin', color: { rgb: '374151' } } } }
  });
  const Cell = (v, fmt, bold = false, bg = WHITE, color = INK, align = 'right') => ({
    v: v ?? (typeof v === 'number' ? 0 : ''),
    t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold, color: { rgb: color }, sz: 10, name: 'Calibri' },
         fill: fl(bg), alignment: { horizontal: align, vertical: 'center' },
         border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
                   left:   { style: 'thin', color: { rgb: 'E2E8F0' } } } }
  });
  const KpiCell = (v, fmt) => ({
    v: v ?? 0, t: 'n', z: fmt,
    s: { font: { bold: true, color: { rgb: TEAL }, sz: 10, name: 'Calibri' },
         fill: fl(TEAL_BG), alignment: { horizontal: 'right', vertical: 'center' },
         border: { bottom: { style: 'thin', color: { rgb: TEAL } },
                   left:   { style: 'thin', color: { rgb: 'E2E8F0' } } } }
  });
  const StatusCell = (status) => {
    const s = (status || '').toLowerCase();
    const [bg, color] = s.includes('analyzing')       ? [AMBER_BG, AMBER]
                      : s.includes('under contract')   ? [BLUE_BG,  BLUE_C]
                      : s.includes('owned')            ? [GREEN_BG, GREEN]
                      : s.includes('pass')             ? [RED_BG,   RED_C]
                      : [OFF_WHITE, SLATE];
    return { v: status || '—', t: 's',
             s: { font: { bold: true, color: { rgb: color }, sz: 9, name: 'Calibri' },
                  fill: fl(bg), alignment: { horizontal: 'center', vertical: 'center' },
                  border: { bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } } } };
  };
  const Blank = (bg = WHITE) => ({ v: '', t: 's', s: { fill: fl(bg) } });

  const W  = (ws, c, r, cell) => { ws[XLSX.utils.encode_cell({ r: r - 1, c })] = cell; };

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Portfolio Summary
  // ══════════════════════════════════════════════════════════════════════════
  const ws1   = {};
  const mg1   = [];
  const NCOLS = 12; // cols 0-12 (address + 12 metric cols)

  const fillBanner = (ws, row, bg) => {
    for (let c = 0; c <= NCOLS; c++) {
      if (!ws[XLSX.utils.encode_cell({ r: row-1, c })]) W(ws, c, row, Blank(bg));
    }
  };

  // ── Row 1: Logo banner ───────────────────────────────────────────────────
  W(ws1, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 20, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'right', vertical: 'center' } }});
  W(ws1, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: TEAL_300 }, sz: 20, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' } }});
  W(ws1, 2, 1, { v: '', t: 's', s: { fill: fl(TEAL) }}); // teal accent stripe
  W(ws1, 3, 1, Banner(
    'Portfolio Summary' + (preparer ? '   ·   ' + preparer + orgStr : ''),
    11, 'left'
  ));
  W(ws1, NCOLS, 1, Banner(dateStr, 9, 'right', true));
  mg1.push({ s: { r: 0, c: 3 }, e: { r: 0, c: NCOLS - 1 } });
  fillBanner(ws1, 1, NAVY);

  // ── Row 2: Subtitle strip ────────────────────────────────────────────────
  const totalDeals = deals.length;
  const activeDeals = deals.filter(d => (d.status || '') !== 'Pass').length;
  W(ws1, 0, 2, {
    v: `${totalDeals} ${totalDeals === 1 ? 'deal' : 'deals'}   ·   ${activeDeals} active   ·   Generated ${dateStr}`,
    t: 's',
    s: { font: { color: { rgb: SLATE }, sz: 9, name: 'Calibri' },
         fill: fl('EFF6FF'), alignment: { horizontal: 'left', vertical: 'center' } }
  });
  for (let c = 1; c <= NCOLS; c++) W(ws1, c, 2, Blank('EFF6FF'));
  mg1.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS } });

  // ── Row 3: Static report note ─────────────────────────────────────────────
  W(ws1, 0, 3, {
    v: '⚠  Static report — values calculated at time of export. Changes to assumptions in RentHack will not update this file automatically.',
    t: 's',
    s: { font: { italic: true, color: { rgb: AMBER }, sz: 8, name: 'Calibri' },
         fill: fl(AMBER_BG), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } }
  });
  for (let c = 1; c <= NCOLS; c++) W(ws1, c, 3, Blank(AMBER_BG));
  mg1.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NCOLS } });

  // ── Row 4: Spacer ────────────────────────────────────────────────────────
  for (let c = 0; c <= NCOLS; c++) W(ws1, c, 4, Blank(WHITE));

  // ── Row 5: Section header ────────────────────────────────────────────────
  W(ws1, 0, 5, SecHdr('DEAL COMPARISON'));
  for (let c = 1; c <= NCOLS; c++) W(ws1, c, 5, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }});
  mg1.push({ s: { r: 4, c: 0 }, e: { r: 4, c: NCOLS } });

  // ── Row 6: Column headers ────────────────────────────────────────────────
  const headers = [
    { v: 'Address / Property',      align: 'left'  },
    { v: 'Status',                  align: 'center'},
    { v: 'Units',                   align: 'right' },
    { v: 'Purchase Price',          align: 'right' },
    { v: 'Total Cash In',           align: 'right' },
    { v: 'Gross Rent (Yr1)',        align: 'right' },
    { v: 'NOI (Yr1)',               align: 'right' },
    { v: 'Cash Flow (Yr1)',         align: 'right' },
    { v: 'Cap Rate',                align: 'right' },
    { v: 'Cash-on-Cash',            align: 'right' },
    { v: 'DSCR',                    align: 'right' },
    { v: 'IRR',                     align: 'right' },
    { v: 'Equity Multiple',         align: 'right' },
  ];
  headers.forEach(({ v, align }, i) => W(ws1, i, 6, TblHdr(v, align)));

  // ── Rows 7+: One row per deal ────────────────────────────────────────────
  let dataRow = 7;
  deals.forEach((deal, idx) => {
    const res  = calcDeal(deal);
    const alt  = idx % 2 === 1;
    const bg   = alt ? 'F1F5F9' : WHITE;
    const yr1  = res.years[0] || {};

    // Thresholds for KPI coloring
    const cocGood  = res.cocReturn >= 0.06;
    const dscrGood = res.dscr >= 1.25;
    const irrGood  = res.irr >= 0.08;
    const cfGood   = (yr1.cashFlow || 0) >= 0;

    W(ws1, 0,  dataRow, Cell(deal.address || '—',                null,  false, bg, INK,   'left'));
    W(ws1, 1,  dataRow, StatusCell(deal.status));
    W(ws1, 2,  dataRow, Cell(+deal.assumptions.numUnits || 2,    null,  false, bg, SLATE, 'center'));
    W(ws1, 3,  dataRow, Cell(+deal.assumptions.purchasePrice||0, USD,   false, bg, INK));
    W(ws1, 4,  dataRow, Cell(res.totalCash,                      USD,   false, bg, INK));
    W(ws1, 5,  dataRow, Cell(res.grossRentYear0,                 USD,   false, bg, INK));
    W(ws1, 6,  dataRow, Cell(res.noi,                            USD,   true,  bg, INK));
    W(ws1, 7,  dataRow, cfGood  ? KpiCell(yr1.cashFlow, USD)   : Cell(yr1.cashFlow||0, USD, false, RED_BG, RED_C));
    W(ws1, 8,  dataRow, Cell(res.capRate,                        PCT1,  false, bg, INK));
    W(ws1, 9,  dataRow, cocGood ? KpiCell(res.cocReturn, PCT1)  : Cell(res.cocReturn, PCT1, false, bg, SLATE));
    W(ws1, 10, dataRow, dscrGood? KpiCell(res.dscr, N2)         : Cell(res.dscr, N2, false, bg, SLATE));
    W(ws1, 11, dataRow, irrGood ? KpiCell(res.irr, PCT1)        : Cell(res.irr, PCT1, false, bg, SLATE));
    W(ws1, 12, dataRow, Cell(res.equityMultiple,                 X2,    false, bg, INK));
    dataRow++;
  });

  // ── Totals / averages footer row ─────────────────────────────────────────
  if (deals.length > 0) {
    const allRes = deals.map(d => ({ d, r: calcDeal(d) }));
    const sum   = (fn) => allRes.reduce((s, { r }) => s + (fn(r) || 0), 0);
    const avg   = (fn) => sum(fn) / deals.length;
    const yr1avg = (fn) => allRes.reduce((s, { r }) => s + (fn(r.years[0] || {}) || 0), 0) / deals.length;

    const FootCell = (v, fmt, isKpi = false) => isKpi
      ? KpiCell(v, fmt)
      : { v: v ?? 0, t: 'n', z: fmt,
          s: { font: { bold: true, color: { rgb: INK }, sz: 10, name: 'Calibri' },
               fill: fl('EFF6FF'),
               alignment: { horizontal: 'right', vertical: 'center' },
               border: { top: { style: 'medium', color: { rgb: TEAL } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } } } }};

    W(ws1, 0, dataRow, { v: `Portfolio Totals / Averages (${deals.length} deals)`, t: 's',
      s: { font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
           fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' },
           border: { top: { style: 'medium', color: { rgb: TEAL } } } }});
    W(ws1, 1,  dataRow, { v: '', t: 's', s: { fill: fl(NAVY), border: { top: { style: 'medium', color: { rgb: TEAL } } } }});
    W(ws1, 2,  dataRow, FootCell(sum(r => +r.years[0]?.egi > 0 ? 1 : 0), null)); // placeholder
    W(ws1, 3,  dataRow, FootCell(allRes.reduce((s, {d}) => s + (+d.assumptions?.purchasePrice || 0), 0), USD));
    W(ws1, 4,  dataRow, FootCell(sum(r => r.totalCash), USD));
    W(ws1, 5,  dataRow, FootCell(sum(r => r.grossRentYear0), USD));
    W(ws1, 6,  dataRow, FootCell(sum(r => r.noi), USD));
    W(ws1, 7,  dataRow, FootCell(sum(r => (r.years[0] || {}).cashFlow || 0), USD));
    W(ws1, 8,  dataRow, FootCell(avg(r => r.capRate), PCT1));
    W(ws1, 9,  dataRow, FootCell(avg(r => r.cocReturn), PCT1, true));
    W(ws1, 10, dataRow, FootCell(avg(r => r.dscr), N2));
    W(ws1, 11, dataRow, FootCell(avg(r => r.irr), PCT1, true));
    W(ws1, 12, dataRow, FootCell(avg(r => r.equityMultiple), X2));
    dataRow++;
  }

  // ── Notes column: deal-level notes ───────────────────────────────────────
  // (blank — future use)

  ws1['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dataRow, c: NCOLS } });
  ws1['!merges'] = mg1;
  ws1['!cols']   = [
    { wch: 38 }, // address
    { wch: 12 }, // status
    { wch: 6  }, // units
    { wch: 14 }, // purchase price
    { wch: 13 }, // total cash
    { wch: 14 }, // gross rent
    { wch: 13 }, // noi
    { wch: 13 }, // cash flow
    { wch: 10 }, // cap rate
    { wch: 12 }, // coc
    { wch: 8  }, // dscr
    { wch: 11 }, // irr
    { wch: 13 }, // equity multiple
  ];
  ws1['!rows']   = [
    { hpt: 38, customHeight: 1 },  // logo
    { hpt: 18, customHeight: 1 },  // subtitle
    { hpt: 22, customHeight: 1 },  // static report note
    { hpt: 8,  customHeight: 1 },  // spacer
    { hpt: 22, customHeight: 1 },  // section header
    { hpt: 34, customHeight: 1 },  // column headers (wrapped text)
  ];
  ws1['!freeze'] = { xSplit: 1, ySplit: 6 }; // freeze address col + header rows
  XLSX.utils.book_append_sheet(wb, ws1, 'Portfolio Summary');

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Deal Scorecard (ranked by IRR)
  // ══════════════════════════════════════════════════════════════════════════
  if (deals.length > 1) {
    const ws2   = {};
    const mg2   = [];
    const ranked = [...deals].map(d => ({ d, r: calcDeal(d) }))
      .sort((a, b) => (b.r.irr || 0) - (a.r.irr || 0));

    // Logo banner
    W(ws2, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'right', vertical: 'center' } }});
    W(ws2, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: TEAL_300 }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' } }});
    W(ws2, 2, 1, { v: '', t: 's', s: { fill: fl(TEAL) }});
    W(ws2, 3, 1, Banner('Deal Scorecard  —  Ranked by IRR', 10, 'left'));
    for (let c = 4; c <= 7; c++) W(ws2, c, 1, Blank(NAVY));
    mg2.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 7 } });

    // Section header
    W(ws2, 0, 2, SecHdr('DEALS RANKED BEST → WORST  (by 10-Year IRR)'));
    for (let c = 1; c <= 7; c++) W(ws2, c, 2, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }});
    mg2.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });

    // Column headers
    ['Rank', 'Address', 'IRR', 'CoC Return', 'Cash Flow/mo', 'Cap Rate', 'DSCR', 'Equity Multiple']
      .forEach((h, i) => W(ws2, i, 3, TblHdr(h, i <= 1 ? 'left' : 'right')));

    ranked.forEach(({ d, r }, i) => {
      const alt = i % 2 === 1;
      const bg  = alt ? 'F1F5F9' : WHITE;
      const yr1 = r.years[0] || {};
      W(ws2, 0, i + 4, Cell(`#${i + 1}`, null, true, i === 0 ? TEAL_BG : bg, i === 0 ? TEAL : SLATE, 'center'));
      W(ws2, 1, i + 4, Cell(d.address || '—', null, i === 0, i === 0 ? TEAL_BG : bg, i === 0 ? TEAL : INK, 'left'));
      W(ws2, 2, i + 4, i === 0 ? KpiCell(r.irr, PCT1)          : Cell(r.irr,             PCT1, false, bg, INK));
      W(ws2, 3, i + 4, i === 0 ? KpiCell(r.cocReturn, PCT1)     : Cell(r.cocReturn,       PCT1, false, bg, INK));
      W(ws2, 4, i + 4, i === 0 ? KpiCell(yr1.monthlyCashFlow, USD): Cell(yr1.monthlyCashFlow||0, USD, false, bg, INK));
      W(ws2, 5, i + 4, Cell(r.capRate,          PCT1, false, bg, INK));
      W(ws2, 6, i + 4, Cell(r.dscr,             N2,   false, bg, INK));
      W(ws2, 7, i + 4, Cell(r.equityMultiple,   X2,   false, bg, INK));
    });

    ws2['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ranked.length + 4, c: 7 } });
    ws2['!merges'] = mg2;
    ws2['!cols']   = [{ wch: 6 }, { wch: 38 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 14 }];
    ws2['!rows']   = [{ hpt: 32, customHeight: 1 }, { hpt: 22, customHeight: 1 }, { hpt: 8, customHeight: 1 }, { hpt: 32, customHeight: 1 }];
    ws2['!freeze'] = { xSplit: 2, ySplit: 3 };
    XLSX.utils.book_append_sheet(wb, ws2, 'Deal Scorecard');
  }

  // ── Write & download ──────────────────────────────────────────────────────
  const wbout  = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob   = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `renthack_portfolio_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// Keep CSV alias for backward compat
function exportPortfolioCSV(deals) { exportPortfolioXLSX(deals, null); }
// ─── Excel export (deal level) ───────────────────────────────────────────────

function exportDealXLSX(deal, user) {
  const r  = calcDeal(deal);
  const a  = deal.assumptions;
  const wb = XLSX.utils.book_new();

  const { NAVY, TEAL, TEAL_300, INK, SLATE, SLATE_LT, WHITE, OFF_WHITE,
          TEAL_BG, AMBER, AMBER_BG, GREEN, GREEN_BG, RED_C } = COLORS.xlsx;
  const RED_BG   = 'FEF2F2';

  // ─── Number formats ───────────────────────────────────────────────────────
  const USD  = '"$"#,##0;("$"#,##0)';
  const PCT1 = '0.0%;(0.0%)';
  const X2   = '0.00"x"';
  const N2   = '0.00';
  const INT  = '#,##0';

  // ─── Cell factory ─────────────────────────────────────────────────────────
  const fl = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });
  const bdr = (sides, style = 'thin', color = 'CBD5E1') => {
    const b = {};
    const s = { style, color: { rgb: color } };
    if (sides.includes('t')) b.top    = s;
    if (sides.includes('b')) b.bottom = s;
    if (sides.includes('l')) b.left   = s;
    if (sides.includes('r')) b.right  = s;
    return b;
  };

  // Banner cell — navy bg, white bold text
  const Banner = (v, sz = 13, align = 'left', italic = false) => ({
    v: v ?? '', t: 's',
    s: { font: { bold: !italic, italic, color: { rgb: WHITE }, sz, name: 'Calibri' },
         fill: fl(NAVY), alignment: { horizontal: align, vertical: 'center' } }
  });

  // Section header — teal bg, white bold 10pt, upper case
  const SecHdr = (v) => ({
    v: v ?? '', t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
         fill: fl(TEAL), alignment: { horizontal: 'left', vertical: 'center' },
         border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }
  });

  // Column header inside a table
  const ColHdr = (v, align = 'right') => ({
    v: v ?? '', t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 9, name: 'Calibri' },
         fill: fl(INK), alignment: { horizontal: align, vertical: 'center' },
         border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }
  });

  // Row label — slate text, off-white bg
  const Lbl = (v, indent = false) => ({
    v: v ?? '', t: 's',
    s: { font: { color: { rgb: SLATE }, sz: 10, name: 'Calibri' },
         fill: fl(OFF_WHITE),
         alignment: { horizontal: 'left', vertical: 'center', indent: indent ? 1 : 0 },
         border: { ...bdr('r', 'thin', 'E2E8F0') } }
  });

  // Standard value — ink text, white bg
  const Val = (v, fmt, alt = false) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { color: { rgb: INK }, sz: 10, name: 'Calibri' },
         fill: fl(alt ? 'F1F5F9' : WHITE),
         alignment: { horizontal: 'right', vertical: 'center' },
         border: bdr('b', 'thin', 'E2E8F0') }
  });

  // Bold subtotal row — dark ink, slightly tinted bg
  const Sub = (v, fmt) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold: true, color: { rgb: INK }, sz: 10, name: 'Calibri' },
         fill: fl('EFF6FF'),
         alignment: { horizontal: 'right', vertical: 'center' },
         border: { top: { style: 'thin', color: { rgb: 'BFDBFE' } },
                   bottom: { style: 'thin', color: { rgb: 'BFDBFE' } } } }
  });

  // Key metric accent — teal text, teal-tinted bg, left teal border stripe
  const Kpi = (v, fmt) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold: true, color: { rgb: TEAL }, sz: 11, name: 'Calibri' },
         fill: fl(TEAL_BG),
         alignment: { horizontal: 'right', vertical: 'center' },
         border: { top: { style: 'thin', color: { rgb: TEAL } },
                   bottom: { style: 'thin', color: { rgb: TEAL } } } }
  });

  // KPI label — matches Kpi row bg
  const KpiLbl = (v, indent = false) => ({
    v: v ?? '', t: 's',
    s: { font: { bold: true, color: { rgb: TEAL }, sz: 10, name: 'Calibri' },
         fill: fl(TEAL_BG),
         alignment: { horizontal: 'left', vertical: 'center', indent: indent ? 1 : 0 },
         border: { top: { style: 'thin', color: { rgb: TEAL } },
                   bottom: { style: 'thin', color: { rgb: TEAL } },
                   left: { style: 'medium', color: { rgb: TEAL } } } }
  });

  // Pass / Fail
  const PassFail = (passes) => ({
    v: passes ? 'PASS  ✓' : 'FAIL  ✗', t: 's',
    s: { font: { bold: true, color: { rgb: passes ? GREEN : RED_C }, sz: 11, name: 'Calibri' },
         fill: fl(passes ? GREEN_BG : RED_BG),
         alignment: { horizontal: 'center', vertical: 'center' } }
  });

  const Blank = (bg = WHITE) => ({ v: '', t: 's', s: { fill: fl(bg) } });

  // Helper to write to a ws object
  const W = (ws, c, r, cell) => { ws[XLSX.utils.encode_cell({ r: r - 1, c })] = cell; };

  const safeName = (deal.address || deal.id || 'deal').toString()
    .replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const dateStr = new Date().toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
  const preparer = user?.user_metadata?.display_name || user?.email || '';
  const orgStr   = user?.user_metadata?.organization
    ? '  ·  ' + user.user_metadata.organization : '';

  const yr1    = r.years[0] || {};
  const holdYrs = +deal.assumptions?.holdPeriod || 10;
  const expBrk = r.baseExpBreakdown || {};
  const pp     = +a.purchasePrice || 0;
  const cumCF  = r.years.reduce((s, y) => s + (y.cashFlow || 0), 0);

  // ─── Column layout (used across all sheets) ───────────────────────────────
  // Col 0: label (col A) — 32ch
  // Col 1: value (col B) — 18ch  ← main data column
  // Col 2-4: empty (cols C-E) — spacers for visual width, 6ch each
  const COLS = 5; // keep same count for banner/merge compatibility

  const mkRef = (rows) => XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows - 1, c: COLS } });
  const colWidths = [{ wch: 34 }, { wch: 18 }, { wch: 28 }, { wch: 4 }, { wch: 4 }, { wch: 4 }];

  // Fill an entire row with a background color from col 0 to COLS
  const fillRow = (ws, row, bg, overCol0 = null) => {
    for (let c = 0; c <= COLS; c++) {
      if (c === 0 && overCol0) { W(ws, c, row, overCol0); continue; }
      if (ws[XLSX.utils.encode_cell({ r: row - 1, c })] === undefined) {
        W(ws, c, row, Blank(bg));
      }
    }
  };

  // Write a full-width section header row
  const secRow = (ws, row, label, merges) => {
    W(ws, 0, row, SecHdr(label));
    for (let c = 1; c <= COLS; c++) W(ws, c, row, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } } });
    merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: COLS } });
  };

  // Note cell — italic slate, matches row bg
  const NoteCell = (v, bg = WHITE) => ({
    v: v ?? '', t: 's',
    s: { font: { italic: true, color: { rgb: SLATE_LT }, sz: 8, name: 'Calibri' },
         fill: fl(bg),
         alignment: { horizontal: 'left', vertical: 'center', wrapText: true } }
  });

  // Write a data row: label in col 0, value in col 1, note in col 2, fill rest
  const dataRow = (ws, row, label, value, fmt, isKpi = false, alt = false, indent = false, isSub = false, note = '') => {
    W(ws, 0, row, isKpi ? KpiLbl(label, indent) : Lbl(label, indent));
    W(ws, 1, row, isKpi ? Kpi(value, fmt) : isSub ? Sub(value, fmt) : Val(value, fmt, alt));
    const bg = isKpi ? TEAL_BG : isSub ? 'EFF6FF' : alt ? 'F1F5F9' : WHITE;
    W(ws, 2, row, note ? NoteCell(note, bg) : Blank(bg));
    for (let c = 3; c <= COLS; c++) W(ws, c, row, Blank(bg));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Deal Summary
  // ══════════════════════════════════════════════════════════════════════════
  const ws1 = {};
  const mg1 = [];
  let row = 1;

  // ── Logo banner (rows 1-2) ────────────────────────────────────────────────
  // Row 1: RENT | HACK | spacers | date+preparer
  W(ws1, 0, row, { v: 'RENT', t: 's', s: {
    font: { bold: true, color: { rgb: WHITE }, sz: 20, name: 'Calibri' },
    fill: fl(NAVY), alignment: { horizontal: 'right', vertical: 'center' }
  }});
  W(ws1, 1, row, { v: 'HACK', t: 's', s: {
    font: { bold: true, color: { rgb: TEAL_300 }, sz: 20, name: 'Calibri' },
    fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' }
  }});
  // Teal accent stripe in col 2
  W(ws1, 2, row, { v: '', t: 's', s: { fill: fl(TEAL), border: { right: { style: 'medium', color: { rgb: TEAL } } } }});
  // Date / preparer spans remaining cols
  W(ws1, 3, row, Banner(
    dateStr + (preparer ? '   ·   ' + preparer + orgStr : ''),
    8, 'right', true
  ));
  for (let c = 4; c <= COLS; c++) W(ws1, c, row, Blank(NAVY));
  mg1.push({ s: { r: 0, c: 3 }, e: { r: 0, c: COLS } });
  row++;

  // Row 2: address sub-banner
  const addr = deal.address || 'Untitled Property';
  W(ws1, 0, row, { v: addr, t: 's', s: {
    font: { bold: true, color: { rgb: WHITE }, sz: 14, name: 'Calibri' },
    fill: fl(TEAL), alignment: { horizontal: 'left', vertical: 'center' }
  }});
  for (let c = 1; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl(TEAL) }});
  mg1.push({ s: { r: 1, c: 0 }, e: { r: 1, c: COLS } });
  row++;

  // Row 3: property details strip
  const details = [
    a.numUnits ? `${a.numUnits} Units` : null,
    a.beds     ? `${a.beds} BD / ${a.baths || '—'} BA` : null,
    a.sqftTotal ? `${Number(a.sqftTotal).toLocaleString()} SF` : null,
    a.yearBuilt ? `Built ${a.yearBuilt}` : null,
    deal.status  ? `Status: ${deal.status}` : null,
    a.ownerOccupied ? 'Owner-Occupied' : null,
  ].filter(Boolean).join('   ·   ');
  W(ws1, 0, row, { v: details || ' ', t: 's', s: {
    font: { color: { rgb: SLATE }, sz: 9, name: 'Calibri' },
    fill: fl('EFF6FF'), alignment: { horizontal: 'left', vertical: 'center' }
  }});
  for (let c = 1; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl('EFF6FF') }});
  mg1.push({ s: { r: 2, c: 0 }, e: { r: 2, c: COLS } });
  row++;

  // Row 4: static report note
  W(ws1, 0, row, {
    v: '⚠  Static report — values calculated at time of export. To update, re-export from RentHack after changing assumptions.',
    t: 's',
    s: { font: { italic: true, color: { rgb: AMBER }, sz: 8, name: 'Calibri' },
         fill: fl(AMBER_BG), alignment: { horizontal: 'left', vertical: 'center', wrapText: true } }
  });
  for (let c = 1; c <= COLS; c++) W(ws1, c, row, Blank(AMBER_BG));
  mg1.push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: COLS } });
  row++;
  row++; // Row 5: blank spacer

  // ── SECTION: Key Performance Metrics ─────────────────────────────────────
  secRow(ws1, row, 'KEY PERFORMANCE METRICS', mg1); row++;

  // Column sub-headers
  W(ws1, 0, row, ColHdr('Metric', 'left'));
  W(ws1, 1, row, ColHdr('Value'));
  W(ws1, 2, row, ColHdr('Benchmark / Notes', 'left'));
  for (let c = 3; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl(INK), border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }});
  mg1.push({ s: { r: row-1, c: 2 }, e: { r: row-1, c: COLS } });
  row++;

  const kpiRows = [
    [`IRR (${holdYrs}-Year)`,             r.irr,                 PCT1,  true,  `Benchmark: ≥8% annually over ${holdYrs}-year hold`],
    ['Equity Multiple',                    r.equityMultiple,      X2,    true,  'Benchmark: ≥1.5x over hold period'],
    ['Cash-on-Cash Return (Yr 1)',         r.cocReturn,           PCT1,  true,  'Benchmark: ≥6–8% annually'],
    ['Monthly Cash Flow (Yr 1)',           yr1.monthlyCashFlow,   USD,   true,  'Target: positive (> $0)'],
    ['Cap Rate (Yr 1)',                    r.capRate,             PCT1,  false, 'Benchmark: ≥4–5% (market dependent)'],
    ['DSCR (Yr 1)',                        r.dscr,                N2,    false, 'Lender minimum: 1.25x'],
    ['Break-Even Occupancy',               r.breakEvenOccupancy,  PCT1,  false, 'Lower is better; ideal < vacancy rate'],
    ['Annual NOI (Yr 1)',                  r.noi,                 USD,   false, 'Before debt service'],
    [`Net Proceeds (Exit Yr ${holdYrs})`,  r.netProceeds,         USD,   true,  'After capital gains tax at sale'],
  ];
  kpiRows.forEach(([lbl, val, fmt, isKpi, note], i) => {
    dataRow(ws1, row, lbl, val, fmt, isKpi, i % 2 === 1, false, false, note);
    row++;
  });
  row++; // gap

  // ── SECTION: Financing ────────────────────────────────────────────────────
  secRow(ws1, row, 'FINANCING', mg1); row++;
  W(ws1, 0, row, ColHdr('Item', 'left'));
  W(ws1, 1, row, ColHdr('Amount'));
  for (let c = 2; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl(INK), border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }});
  row++;

  const finRows = [
    ['Purchase Price',      pp,                                      USD,  false, false],
    ['Down Payment',        pp - r.loanAmt,                          USD,  false, false],
    ['Down Payment %',      pp > 0 ? (pp - r.loanAmt) / pp : 0,     PCT1, false, false],
    ['Loan Amount',         r.loanAmt,                               USD,  false, false],
    ['Interest Rate',       (+a.interestRate || 0) / 100,            PCT1, false, false],
    ['Loan Term',           `${+a.amortYears || 30} years`,          null, false, false],
    ['LTV',                 pp > 0 ? r.loanAmt / pp : 0,            PCT1, false, false],
    ['Monthly P&I',         r.monthlyPayment,                       USD,  false, false],
    ['Annual Debt Service', r.annualDebtService,                    USD,  false, false],
    ['Closing Costs',       r.closingCostsTotal,                    USD,  false, false],
    ['Seller Concessions',  +a.sellerConcessions || 0,              USD,  false, false],
    ['PMI (Monthly)',       +a.pmi || 0,                             USD,  false, false],
    ['Total Cash In',       r.totalCash,                             USD,  true,  true],
  ];
  finRows.forEach(([lbl, val, fmt, isKpi, isSub], i) => {
    dataRow(ws1, row, lbl, val, fmt, isKpi, i % 2 === 1, false, isSub);
    row++;
  });
  row++;

  // ── SECTION: Income & Expenses Year 1 ────────────────────────────────────
  secRow(ws1, row, 'INCOME & EXPENSES  (YEAR 1)', mg1); row++;
  W(ws1, 0, row, ColHdr('Line Item', 'left'));
  W(ws1, 1, row, ColHdr('Annual Amount'));
  for (let c = 2; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl(INK), border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }});
  row++;

  const incomeRows = [
    ['Gross Scheduled Rent',    r.grossRentYear0,                          USD,  false, false, false],
    ['Vacancy Loss',            yr1.vacancyLoss,                           USD,  false, false, false],
    ['Effective Gross Income',  yr1.egi,                                   USD,  false, false, true],
    ['  Property Tax',          expBrk.propertyTax || 0,                   USD,  false, false, false, true],
    ['  Insurance',             expBrk.insurance   || 0,                   USD,  false, false, false, true],
    ['  Maintenance',           expBrk.maintenance || 0,                   USD,  false, false, false, true],
    ['  CapEx Reserve',         expBrk.capex        || 0,                  USD,  false, false, false, true],
    ['  Property Management',   expBrk.propertyMgmt || 0,                  USD,  false, false, false, true],
    ['  Utilities',             expBrk.utilities    || 0,                  USD,  false, false, false, true],
    ['Total Operating Expenses',r.baseExpenses,                            USD,  false, false, true],
    ['Expense Ratio (% of EGI)',yr1.egi > 0 ? r.baseExpenses / yr1.egi : 0, PCT1, false, false, false],
    ['Net Operating Income',    r.noi,                                     USD,  true,  false, false],
    ['Annual Debt Service',     r.annualDebtService,                       USD,  false, false, false],
    ['Annual Cash Flow',        yr1.cashFlow,                              USD,  true,  false, false],
    ['Monthly Cash Flow',       yr1.monthlyCashFlow,                       USD,  true,  false, false],
    ['After-Tax Cash Flow',     yr1.afterTaxCashFlow,                      USD,  false, false, false],
  ];
  incomeRows.forEach(([lbl, val, fmt, isKpi, _skip, isSub, indent], i) => {
    const cleanLbl = lbl.startsWith('  ') ? lbl.trim() : lbl;
    dataRow(ws1, row, cleanLbl, val, fmt, isKpi, i % 2 === 1, !!indent, isSub);
    row++;
  });
  row++;

  // ── SECTION: Exit Analysis ─────────────────────────────────────────────────
  secRow(ws1, row, `EXIT ANALYSIS  (YEAR ${holdYrs})`, mg1); row++;
  W(ws1, 0, row, ColHdr('Item', 'left'));
  W(ws1, 1, row, ColHdr('Amount'));
  for (let c = 2; c <= COLS; c++) W(ws1, c, row, { v: '', t: 's', s: { fill: fl(INK), border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }});
  row++;

  const exitRows = [
    ['Projected Exit Value',    r.exitValue,            USD,  false, false],
    ['Remaining Loan Balance',  r.exitLoanBalance,      USD,  false, false],
    ['Total Gain on Sale',      r.totalGainOnSale,      USD,  false, false],
    ['Capital Gains Tax',       r.capitalGainsTax,      USD,  false, false],
    ['Net Sale Proceeds',       r.netProceeds,          USD,  true,  false],
    ['Cumulative Cash Flows',   cumCF,                  USD,  false, false],
    ['Total Return',            r.netProceeds + cumCF,  USD,  true,  true],
  ];
  exitRows.forEach(([lbl, val, fmt, isKpi, isSub], i) => {
    dataRow(ws1, row, lbl, val, fmt, isKpi, i % 2 === 1, false, isSub);
    row++;
  });

  // ── FHA Self-Sufficiency (conditional) ────────────────────────────────────
  if (r.fhaSelfSufficiency?.applies) {
    row++;
    secRow(ws1, row, 'FHA SELF-SUFFICIENCY TEST', mg1); row++;
    const fha = r.fhaSelfSufficiency;
    [
      ['Gross Rents (All Units)', fha.grossRentAllUnits, USD],
      ['75% Threshold',           fha.threshold75Pct,    USD],
      ['PITI (Annual)',            fha.pitiAnnual,        USD],
      ['Surplus / (Shortfall)',    fha.delta,             USD],
    ].forEach(([lbl, val, fmt], i) => {
      dataRow(ws1, row, lbl, val, fmt, false, i % 2 === 1);
      row++;
    });
    W(ws1, 0, row, Lbl('Result'));
    W(ws1, 1, row, PassFail(fha.passes));
    for (let c = 2; c <= COLS; c++) W(ws1, c, row, Blank(fha.passes ? GREEN_BG : RED_BG));
    row++;
  }

  // ── Disclaimer footer ──────────────────────────────────────────────────────
  row++;
  W(ws1, 0, row, { v: 'For informational purposes only. Not financial, legal, or tax advice. Projections are estimates only. Consult qualified professionals.  ·  renthack.io/legal/tos', t: 's', s: {
    font: { italic: true, color: { rgb: SLATE_LT }, sz: 8, name: 'Calibri' },
    fill: fl(OFF_WHITE), alignment: { horizontal: 'left', vertical: 'center', wrapText: true }
  }});
  for (let c = 1; c <= COLS; c++) W(ws1, c, row, Blank(OFF_WHITE));
  mg1.push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: COLS } });

  ws1['!ref']   = mkRef(row + 1);
  ws1['!merges']= mg1;
  ws1['!cols']  = colWidths;
  ws1['!rows']  = [{ hpt: 38, customHeight: 1 }, { hpt: 26, customHeight: 1 }, { hpt: 18, customHeight: 1 }, { hpt: 22, customHeight: 1 }, { hpt: 8, customHeight: 1 }]; // logo, address, details, note, spacer
  XLSX.utils.book_append_sheet(wb, ws1, 'Deal Summary');

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — {holdYrs}-Year Projection (with live Excel formulas)
  // ══════════════════════════════════════════════════════════════════════════
  const ws2 = {};
  const mg2 = [];
  const YRS = r.years.length; // = holdYrs

  // Blue input cell style (industry convention: blue = user-editable)
  const InputCell = (v, fmt) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's', z: fmt || undefined,
    s: { font: { bold: true, color: { rgb: '0000FF' }, sz: 10, name: 'Calibri' },
         fill: fl(OFF_WHITE),
         alignment: { horizontal: 'right', vertical: 'center' },
         border: { bottom: { style: 'thin', color: { rgb: 'BFDBFE' } },
                   top:    { style: 'thin', color: { rgb: 'BFDBFE' } } } }
  });

  // Cell reference helper (row=1-indexed Excel row, yi=0-based year index, col 0 = label)
  const cr = (row, yi) => XLSX.utils.encode_cell({ r: row - 1, c: yi + 1 });

  // Row 1: Logo banner
  W(ws2, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'right', vertical: 'center' } }});
  W(ws2, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: TEAL_300 }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' } }});
  W(ws2, 2, 1, { v: '', t: 's', s: { fill: fl(TEAL) }});
  W(ws2, 3, 1, { v: `${holdYrs}-Year Cash Flow Projection   ·   ${addr}`, t: 's', s: {
    font: { italic: true, color: { rgb: SLATE_LT }, sz: 9, name: 'Calibri' },
    fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' }
  }});
  for (let c = 4; c <= YRS; c++) W(ws2, c, 1, Blank(NAVY));
  mg2.push({ s: { r: 0, c: 3 }, e: { r: 0, c: YRS } });

  // Row 2: Growth assumptions header
  W(ws2, 0, 2, SecHdr('GROWTH ASSUMPTIONS  —  Edit blue cells to update projected values'));
  for (let c = 1; c <= YRS; c++) W(ws2, c, 2, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }});

  // Rows 3-8: Editable growth assumption inputs
  const asmInputs2 = [
    ['Rent Growth / Year',       (+deal.assumptions.rentGrowth      || 3)  / 100, PCT1, true ],
    ['Expense Growth / Year',    (+deal.assumptions.expenseGrowth   || 3)  / 100, PCT1, true ],
    ['Appreciation / Year',      (+deal.assumptions.appreciationRate || 4) / 100, PCT1, true ],
    ['Vacancy Rate',             (+deal.assumptions.vacancyRate     || 5)  / 100, PCT1, true ],
    ['Annual Debt Service',      r.annualDebtService,                              USD,  false],
    ['Total Cash Invested',      r.totalCash,                                      USD,  false],
  ];
  asmInputs2.forEach(([lbl, val, fmt, isInput], i) => {
    const rowNum = i + 3;
    const alt = i % 2 === 1;
    W(ws2, 0, rowNum, Lbl(lbl));
    W(ws2, 1, rowNum, isInput ? InputCell(val, fmt) : Val(val, fmt, alt));
    for (let c = 2; c <= YRS; c++) W(ws2, c, rowNum, Blank(alt ? 'F1F5F9' : OFF_WHITE));
    mg2.push({ s: { r: rowNum - 1, c: 1 }, e: { r: rowNum - 1, c: YRS } });
  });

  // Row 9: spacer
  for (let c = 0; c <= YRS; c++) W(ws2, c, 9, Blank(WHITE));

  // Row 10: Year column headers
  W(ws2, 0, 10, { v: '', t: 's', s: { fill: fl(INK), border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }});
  r.years.forEach((y, i) => {
    W(ws2, i + 1, 10, { v: `Year ${y.yr}`, t: 's', s: {
      font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Calibri' },
      fill: fl(INK), alignment: { horizontal: 'right', vertical: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: TEAL } } }
    }});
  });

  // ── Fixed row numbers for data rows (1-indexed Excel rows) ─────────────
  // INCOME
  const GR_ROW   = 12;  // Gross Rent
  const VL_ROW   = 13;  // Vacancy Loss
  const EGI_ROW  = 14;  // Eff. Gross Income
  // OPERATING EXPENSES
  const EXP_ROW  = 16;  // Operating Expenses
  const NOI_ROW  = 17;  // Net Op. Income
  // CASH FLOW
  const DS_ROW   = 19;  // Debt Service
  const CF_ROW   = 20;  // Cash Flow
  const ATCF_ROW = 21;  // After-Tax Cash Flow
  // RETURNS
  const COC_ROW  = 23;  // Cash-on-Cash
  const CAP_ROW  = 24;  // Cap Rate
  const DSCR_ROW = 25;  // DSCR
  // EQUITY & VALUE
  const PV_ROW   = 27;  // Property Value
  const LB_ROW   = 28;  // Loan Balance
  const EQ_ROW   = 29;  // Equity
  // TAX & DEPRECIATION
  const DEPR_ROW = 31;  // Depreciation
  const TE_ROW   = 32;  // Tax Effect
  const PP_ROW   = 33;  // Principal Paydown

  // Section headers
  [[11, 'INCOME'], [15, 'OPERATING EXPENSES'], [18, 'CASH FLOW'],
   [22, 'RETURNS'], [26, 'EQUITY & VALUE'], [30, 'TAX & DEPRECIATION']
  ].forEach(([rowNum, label]) => {
    W(ws2, 0, rowNum, SecHdr(label));
    for (let c = 1; c <= YRS; c++) W(ws2, c, rowNum, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } }}});
  });

  // ── Projection row writer ─────────────────────────────────────────────────
  // cells: array of { v?, f?, z } — one per year
  const projRow2 = (rowNum, label, cells, isKpi = false, isSub = false) => {
    const alt = rowNum % 2 === 0;
    const lStyle = isKpi
      ? { font: { bold: true, color: { rgb: TEAL }, sz: 10, name: 'Calibri' },
          fill: fl(TEAL_BG), alignment: { horizontal: 'left', vertical: 'center' },
          border: { left: { style: 'medium', color: { rgb: TEAL } }, top: { style: 'thin', color: { rgb: TEAL } }, bottom: { style: 'thin', color: { rgb: TEAL } } } }
      : isSub
      ? { font: { bold: true, color: { rgb: INK }, sz: 10, name: 'Calibri' },
          fill: fl('EFF6FF'), alignment: { horizontal: 'left', vertical: 'center' },
          border: { top: { style: 'thin', color: { rgb: 'BFDBFE' } }, bottom: { style: 'thin', color: { rgb: 'BFDBFE' } } } }
      : { font: { color: { rgb: SLATE }, sz: 10, name: 'Calibri' },
          fill: fl(alt ? 'F1F5F9' : OFF_WHITE), alignment: { horizontal: 'left', vertical: 'center' } };
    W(ws2, 0, rowNum, { v: label, t: 's', s: lStyle });

    cells.forEach((cell, i) => {
      const vStyle = isKpi
        ? { font: { bold: true, color: { rgb: TEAL }, sz: 10, name: 'Calibri' },
            fill: fl(TEAL_BG), alignment: { horizontal: 'right', vertical: 'center' },
            border: { top: { style: 'thin', color: { rgb: TEAL } }, bottom: { style: 'thin', color: { rgb: TEAL } } } }
        : isSub
        ? { font: { bold: true, color: { rgb: INK }, sz: 10, name: 'Calibri' },
            fill: fl('EFF6FF'), alignment: { horizontal: 'right', vertical: 'center' },
            border: { top: { style: 'thin', color: { rgb: 'BFDBFE' } }, bottom: { style: 'thin', color: { rgb: 'BFDBFE' } } } }
        : { font: { color: { rgb: INK }, sz: 10, name: 'Calibri' },
            fill: fl(alt ? 'F1F5F9' : OFF_WHITE), alignment: { horizontal: 'right', vertical: 'center' } };
      W(ws2, i + 1, rowNum, cell.f
        ? { f: cell.f, t: 'n', z: cell.z, s: vStyle }
        : { v: cell.v ?? 0, t: 'n', z: cell.z, s: vStyle });
    });
  };

  // ── Write each projection row ─────────────────────────────────────────

  // GROSS RENT: Year 1 = hardcoded (captures OO/value-add); Year 2+ = growth formula
  projRow2(GR_ROW, 'Gross Rent', r.years.map((y, i) =>
    i === 0 ? { v: y.grossRent, z: USD }
            : { f: `${cr(GR_ROW, i - 1)}*(1+$B$3)`, z: USD }
  ));

  // VACANCY LOSS: Year 1 hardcoded; Year 2+ = grossRent × vacancyRate
  projRow2(VL_ROW, 'Vacancy Loss', r.years.map((y, i) =>
    i === 0 ? { v: y.vacancyLoss, z: USD }
            : { f: `${cr(GR_ROW, i)}*$B$6`, z: USD }
  ));

  // EGI: formula all years = GrossRent - VacancyLoss
  projRow2(EGI_ROW, 'Eff. Gross Income', r.years.map((y, i) => ({
    f: `${cr(GR_ROW, i)}-${cr(VL_ROW, i)}`, z: USD
  })), false, true);

  // OPERATING EXPENSES: Year 1 hardcoded; Year 2+ = growth formula
  projRow2(EXP_ROW, 'Operating Expenses', r.years.map((y, i) =>
    i === 0 ? { v: y.expenses, z: USD }
            : { f: `${cr(EXP_ROW, i - 1)}*(1+$B$4)`, z: USD }
  ));

  // NOI: formula all years = EGI - Expenses
  projRow2(NOI_ROW, 'Net Op. Income', r.years.map((y, i) => ({
    f: `${cr(EGI_ROW, i)}-${cr(EXP_ROW, i)}`, z: USD
  })), true);

  // DEBT SERVICE: hardcoded all years (varies with refi)
  projRow2(DS_ROW, 'Debt Service', r.years.map(y => ({ v: y.debtService, z: USD })));

  // CASH FLOW: formula all years = NOI - DebtService
  projRow2(CF_ROW, 'Cash Flow', r.years.map((y, i) => ({
    f: `${cr(NOI_ROW, i)}-${cr(DS_ROW, i)}`, z: USD
  })), true);

  // AFTER-TAX CASH FLOW: hardcoded (tax engine is complex)
  projRow2(ATCF_ROW, 'After-Tax Cash Flow', r.years.map(y => ({ v: y.afterTaxCashFlow ?? 0, z: USD })));

  // CoC RETURN: formula = CashFlow / TotalCash
  projRow2(COC_ROW, 'Cash-on-Cash', r.years.map((y, i) => ({
    f: `IF($B$8=0,0,${cr(CF_ROW, i)}/$B$8)`, z: PCT1
  })));

  // CAP RATE: formula = NOI / PropertyValue
  projRow2(CAP_ROW, 'Cap Rate', r.years.map((y, i) => ({
    f: `IF(${cr(PV_ROW, i)}=0,0,${cr(NOI_ROW, i)}/${cr(PV_ROW, i)})`, z: PCT1
  })));

  // DSCR: formula = NOI / DebtService
  projRow2(DSCR_ROW, 'DSCR', r.years.map((y, i) => ({
    f: `IF(${cr(DS_ROW, i)}=0,0,${cr(NOI_ROW, i)}/${cr(DS_ROW, i)})`, z: N2
  })));

  // PROPERTY VALUE: Year 1 hardcoded; Year 2+ = appreciation formula
  projRow2(PV_ROW, 'Property Value', r.years.map((y, i) =>
    i === 0 ? { v: y.propertyValue, z: USD }
            : { f: `${cr(PV_ROW, i - 1)}*(1+$B$5)`, z: USD }
  ));

  // LOAN BALANCE: hardcoded (amortization schedule)
  projRow2(LB_ROW, 'Loan Balance', r.years.map(y => ({ v: y.balance ?? 0, z: USD })));

  // EQUITY: formula = PropertyValue - LoanBalance
  projRow2(EQ_ROW, 'Equity', r.years.map((y, i) => ({
    f: `${cr(PV_ROW, i)}-${cr(LB_ROW, i)}`, z: USD
  })), true);

  // DEPRECIATION: hardcoded
  projRow2(DEPR_ROW, 'Depreciation', r.years.map(y => ({ v: y.depreciation ?? 0, z: USD })));

  // TAX EFFECT: hardcoded
  projRow2(TE_ROW, 'Tax Effect', r.years.map(y => ({ v: y.taxEffect ?? 0, z: USD })));

  // PRINCIPAL PAYDOWN: Year 1 hardcoded; Year 2+ = loan balance diff formula
  projRow2(PP_ROW, 'Principal Paydown', r.years.map((y, i) =>
    i === 0 ? { v: y.principalPaydown ?? 0, z: USD }
            : { f: `${cr(LB_ROW, i - 1)}-${cr(LB_ROW, i)}`, z: USD }
  ));

  ws2['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: PP_ROW, c: YRS } });
  ws2['!merges'] = mg2;
  ws2['!cols']   = [{ wch: 26 }, ...Array(YRS).fill({ wch: 13 })];
  ws2['!rows']   = [
    { hpt: 32, customHeight: 1 }, // row 1: logo
    { hpt: 22, customHeight: 1 }, // row 2: assumptions header
    ...Array(6).fill({ hpt: 20, customHeight: 1 }), // rows 3-8: inputs
    { hpt: 8,  customHeight: 1 }, // row 9: spacer
    { hpt: 22, customHeight: 1 }, // row 10: year headers
  ];
  ws2['!freeze'] = { xSplit: 1, ySplit: 10 };
  XLSX.utils.book_append_sheet(wb, ws2, `${holdYrs}-Year Projection`);

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3 — Assumptions
  // ══════════════════════════════════════════════════════════════════════════
  const ws3 = {};
  const mg3 = [];
  let ar = 1;

  // Logo banner
  W(ws3, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'right', vertical: 'center' } }});
  W(ws3, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: TEAL_300 }, sz: 16, name: 'Calibri' }, fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' } }});
  W(ws3, 2, 1, { v: '', t: 's', s: { fill: fl(TEAL) }});
  W(ws3, 3, 1, { v: `Assumptions   ·   ${addr}`, t: 's', s: { font: { italic: true, color: { rgb: SLATE_LT }, sz: 9 }, fill: fl(NAVY), alignment: { horizontal: 'left', vertical: 'center' } }});
  for (let c = 4; c <= COLS; c++) W(ws3, c, 1, Blank(NAVY));
  mg3.push({ s: { r: 0, c: 3 }, e: { r: 0, c: COLS } });
  ar = 2;

  const aHdr = (label) => {
    W(ws3, 0, ar, SecHdr(label));
    for (let c = 1; c <= COLS; c++) W(ws3, c, ar, { v: '', t: 's', s: { fill: fl(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } }});
    mg3.push({ s: { r: ar-1, c: 0 }, e: { r: ar-1, c: COLS } });
    ar++;
  };

  let aAlt = false;
  const aRow = (lbl, val, fmt) => {
    W(ws3, 0, ar, Lbl(lbl));
    const cell = typeof val === 'number'
      ? Val(val, fmt, aAlt)
      : { v: val ?? '', t: 's', s: { font: { color: { rgb: INK }, sz: 10, name: 'Calibri' }, fill: fl(aAlt ? 'F1F5F9' : WHITE), alignment: { horizontal: 'right', vertical: 'center' }, border: bdr('b', 'thin', 'E2E8F0') }};
    W(ws3, 1, ar, cell);
    for (let c = 2; c <= COLS; c++) W(ws3, c, ar, Blank(aAlt ? 'F1F5F9' : WHITE));
    mg3.push({ s: { r: ar-1, c: 1 }, e: { r: ar-1, c: COLS } });
    aAlt = !aAlt;
    ar++;
  };

  ar++; // spacer after banner
  aHdr('PROPERTY');
  aRow('Address',          deal.address || '—');
  aRow('Status',           deal.status  || '—');
  aRow('Number of Units',  +a.numUnits  || 2);
  aRow('Beds / Baths',     a.beds ? `${a.beds} / ${a.baths || 0}` : '—');
  aRow('Square Footage',   +a.sqftTotal || 0, INT);
  aRow('Year Built',       a.yearBuilt  ? +a.yearBuilt : '—');
  aRow('Owner-Occupied',   a.ownerOccupied ? 'Yes' : 'No');
  if (a.ownerOccupied) {
    aRow('Owner Unit',           +a.ownerUnit + 1);
    aRow('OO Duration (yrs)',    +a.ownerOccupancyYears || 0);
    aRow('Alternative Rent/mo', +a.alternativeRent || 0, USD);
  }

  aHdr('FINANCING');
  aRow('Purchase Price',      pp,                                          USD);
  aRow('Down Payment %',      (+a.downPaymentPct || 25) / 100,             PCT1);
  aRow('Down Payment $',      pp - r.loanAmt,                              USD);
  aRow('Loan Amount',         r.loanAmt,                                   USD);
  aRow('Interest Rate',       (+a.interestRate || 7) / 100,                PCT1);
  aRow('Loan Term',           `${+a.amortYears || 30} years`);
  aRow('LTV',                 pp > 0 ? r.loanAmt / pp : 0,                PCT1);
  aRow('Monthly P&I',         r.monthlyPayment,                           USD);
  aRow('Closing Costs',       r.closingCostsTotal,                        USD);
  aRow('Seller Concessions',  +a.sellerConcessions || 0,                  USD);
  aRow('PMI (monthly)',       +a.pmi || 0,                                 USD);
  aRow('Total Cash In',       r.totalCash,                                 USD);

  aHdr('UNIT RENTS');
  const units = (a.units || []).slice(0, +a.numUnits || 2);
  units.forEach((u, i) => {
    const isOwner = a.ownerOccupied && +a.ownerUnit === i;
    aRow(`Unit ${i + 1}${isOwner ? ' (Owner-Occupied)' : ''}`, +(u.rent || u.listedRent) || 0, USD);
  });
  aRow('Total Annual Rent', r.grossRentYear0, USD);

  aHdr('GROWTH & ANALYSIS');
  aRow('Vacancy Rate',          (+a.vacancyRate     || 5) / 100,  PCT1);
  aRow('Rent Growth / yr',      (+a.rentGrowth      || 3) / 100,  PCT1);
  aRow('Expense Growth / yr',   (+a.expenseGrowth   || 3) / 100,  PCT1);
  aRow('Appreciation / yr',     (+a.appreciationRate || 4) / 100, PCT1);
  aRow('Income Tax Bracket',    (+a.taxBracket      || 24) / 100, PCT1);

  aHdr('ANNUAL EXPENSES');
  aRow('Property Tax',          expBrk.propertyTax  || 0, USD);
  aRow('Insurance',             expBrk.insurance    || 0, USD);
  aRow('Maintenance',           expBrk.maintenance  || 0, USD);
  aRow('CapEx Reserve',         expBrk.capex         || 0, USD);
  aRow('Property Management',   expBrk.propertyMgmt  || 0, USD);
  aRow('Utilities',             expBrk.utilities     || 0, USD);
  aRow('Total Expenses',        r.baseExpenses,            USD);

  if (a.refi?.enabled) {
    aHdr('REFINANCE SCENARIO');
    aRow('Refi Year',  +a.refi.year   || 5);
    aRow('New Rate',   (+a.refi.newRate || 6) / 100,  PCT1);
    aRow('New LTV',    (+a.refi.newLTV  || 75) / 100, PCT1);
  }

  if (a.valueAdd?.enabled) {
    aHdr('VALUE-ADD SCENARIO');
    aRow('Renovation Cost',       +a.valueAdd.reModelCost     || 0, USD);
    aRow('Rent Bump / Unit',      +a.valueAdd.rentBumpPerUnit  || 0, USD);
    aRow('Units Renovated',       +a.valueAdd.unitsRenovated  || 0);
    aRow('Completion Year',       +a.valueAdd.completionYear  || 1);
    aRow('IRR without Value-Add', r.irrWithoutVA,                  PCT1);
    aRow('IRR with Value-Add',    r.irrWithVA,                     PCT1);
  }

  ws3['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ar + 1, c: COLS } });
  ws3['!merges'] = mg3;
  ws3['!cols']   = colWidths;
  ws3['!rows']   = [{ hpt: 32, customHeight: 1 }];
  ws3['!freeze'] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(wb, ws3, 'Assumptions');

  // ─── Write & download ─────────────────────────────────────────────────────
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url   = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `renthack_${safeName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// Keep exportDealCSV as alias for backward compat
function exportDealCSV(deal) { exportDealXLSX(deal, null); }
function dlFile(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

// ─── PDF export — redesigned editorial investment brief ───────────────────────

function exportDealPDF(deal, user) {
  const r = calcDeal(deal);
  const a = deal.assumptions;
  const holdYrs = +a?.holdPeriod || 10;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const { NAVY, TEAL, TEAL_DK, CREAM, SLATE, RULE, WHITE, INK, TEAL_BG, AMBER } = COLORS.pdf;

  const W = doc.internal.pageSize.getWidth();   // 612
  const H = doc.internal.pageSize.getHeight();  // 792
  const SIDEBAR = 148;  // width of left navy sidebar
  const MARGIN  = 24;   // padding inside sidebar
  const BODY_L  = SIDEBAR + 28;  // left edge of body content
  const BODY_R  = W - 32;        // right edge of body content
  const BODY_W  = BODY_R - BODY_L;

  const fmt$   = v => v == null ? '—' : FMT_USD(Math.round(v));
  const fmtK   = v => v == null ? '—' : (v >= 0 ? '' : '-') + '$' + Math.round(Math.abs(v) / 1000).toLocaleString() + 'k';
  const fmtPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
  const fmtX   = v => v == null ? '—' : v.toFixed(2) + 'x';
  const fmtNum = v => v == null ? '—' : Number(v).toLocaleString();
  const fmtRate = v => v == null ? '—' : (v * 100).toFixed(2) + '%';

  const preparerName = user?.user_metadata?.display_name || user?.email || '';
  const preparerOrg  = user?.user_metadata?.organization || '';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Helper: hairline rule ─────────────────────────────────────────────────
  const rule = (y, x1 = BODY_L, x2 = BODY_R, color = RULE) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(x1, y, x2, y);
  };

  // ── Helper: section heading in body area ─────────────────────────────────
  const sectionHead = (label, y, x1 = BODY_L, x2 = BODY_R) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...TEAL);
    doc.text(label.toUpperCase(), x1, y);
    rule(y + 4, x1, x2, [203, 213, 225]);
    return y + 14;
  };

  // ── Helper: sidebar label+value pair ─────────────────────────────────────
  const sidebarRow = (label, value, y, valueColor = WHITE) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...valueColor);
    doc.text(value, MARGIN, y + 12);
    return y + 28;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 1
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Left navy sidebar — full page height ─────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, SIDEBAR, H, 'F');

  // Teal top accent on sidebar
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, SIDEBAR, 5, 'F');

  // Wordmark in sidebar
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text('Rent', MARGIN, 36);
  const rentW = doc.getTextWidth('Rent');
  doc.setTextColor(...TEAL);
  doc.text('Hack', MARGIN + rentW, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('DEAL ANALYSIS', MARGIN, 50);

  // Sidebar rule
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 58, SIDEBAR - MARGIN, 58);

  // Sidebar: key metrics block
  let sy = 78;
  const TEAL_VAL = [45, 212, 191]; // teal-300 — readable on navy

  // Status badge if present
  if (deal.status) {
    doc.setFillColor(...TEAL);
    doc.roundedRect(MARGIN, sy - 10, SIDEBAR - MARGIN * 2, 16, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    doc.text(deal.status.toUpperCase(), (SIDEBAR) / 2, sy, { align: 'center' });
    sy += 20;
  }

  // Big KPIs in sidebar
  const sideKpis = [
    { label: 'Purchase Price',   value: fmt$(+a.purchasePrice) },
    { label: 'Total Cash In',    value: fmt$(r.totalCash) },
    { label: 'NOI  (Year 1)',    value: fmt$(r.noi) },
    { label: 'Cap Rate',         value: fmtPct(r.capRate) },
    { label: 'Cash-on-Cash',     value: fmtPct(r.cocReturn) },
    { label: 'DSCR',             value: r.dscr > 0 ? r.dscr.toFixed(2) + 'x' : '—' },
    { label: `IRR (${holdYrs}-Year)`,  value: fmtPct(r.irr) },
    { label: 'Equity Multiple',        value: fmtX(r.equityMultiple) },
    { label: 'Loan Amount',            value: fmt$(r.loanAmt) },
    { label: 'Interest Rate',    value: a.interestRate ? a.interestRate + '%' : '—' },
    { label: 'Loan Term',        value: a.amortYears ? a.amortYears + ' yrs' : '—' },
  ];

  sideKpis.forEach(({ label, value }, i) => {
    // Alternate subtle dividers
    if (i > 0 && i % 3 === 0) {
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, sy - 4, SIDEBAR - MARGIN, sy - 4);
    }
    sy = sidebarRow(label, value, sy, TEAL_VAL);
  });

  // Sidebar: preparer block at bottom
  const SIDEBAR_FOOTER_Y = H - 80;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, SIDEBAR_FOOTER_Y, SIDEBAR - MARGIN, SIDEBAR_FOOTER_Y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(dateStr, MARGIN, SIDEBAR_FOOTER_Y + 12);
  if (preparerName) {
    doc.text(preparerName, MARGIN, SIDEBAR_FOOTER_Y + 22);
    if (preparerOrg) doc.text(preparerOrg, MARGIN, SIDEBAR_FOOTER_Y + 32);
  }
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Page 1 of 2', MARGIN, H - 18);

  // ── Body background (cream) ───────────────────────────────────────────────
  doc.setFillColor(...CREAM);
  doc.rect(SIDEBAR, 0, W - SIDEBAR, H, 'F');

  // Teal top accent on body
  doc.setFillColor(...TEAL);
  doc.rect(SIDEBAR, 0, W - SIDEBAR, 5, 'F');

  // ── Property address header ───────────────────────────────────────────────
  let y = 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  // Truncate long addresses
  const addr = deal.address || 'Untitled Property';
  const addrTrunc = addr.length > 46 ? addr.slice(0, 44) + '…' : addr;
  doc.text(addrTrunc, BODY_L, y);

  // Property badges row
  y += 14;
  const badges = [
    a.numUnits ? `${a.numUnits}-Unit` : null,
    a.beds ? `${a.beds} BD` : null,
    a.baths ? `${a.baths} BA` : null,
    a.sqftTotal ? `${fmtNum(a.sqftTotal)} SF` : null,
    a.yearBuilt ? `Built ${a.yearBuilt}` : null,
    a.ownerOccupied ? 'Owner Occ.' : null,
  ].filter(Boolean);

  let bx = BODY_L;
  badges.forEach(badge => {
    const bw = doc.getTextWidth(badge);
    doc.setFillColor(226, 232, 240); // slate-200
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y - 9, bw + 10, 13, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(badge, bx + 5, y);
    bx += bw + 16;
  });

  y += 18;
  rule(y, BODY_L, BODY_R, RULE);
  y += 18;

  // ── Headline KPI bar — 4 big numbers across ───────────────────────────────
  // These are the "at a glance" numbers — large, prominent
  const heroKpis = [
    { label: 'Monthly Cash Flow',  value: fmt$(r.years[0]?.cashFlow != null ? r.years[0].cashFlow / 12 : null), accent: (r.years[0]?.cashFlow || 0) >= 0 },
    { label: 'Cap Rate',           value: fmtPct(r.capRate),    accent: (r.capRate || 0) >= 0.05 },
    { label: 'Cash-on-Cash Yr 1',  value: fmtPct(r.cocReturn),  accent: (r.cocReturn || 0) >= 0.06 },
    { label: 'DSCR Yr 1',          value: r.dscr > 0 ? r.dscr.toFixed(2) + 'x' : '—', accent: (r.dscr || 0) >= 1.25 },
  ];

  const heroW = BODY_W / 4;
  heroKpis.forEach(({ label, value, accent }, i) => {
    const hx = BODY_L + i * heroW;
    // Left border accent line
    doc.setFillColor(...(accent ? TEAL : RULE));
    doc.rect(hx, y - 2, 2.5, 38, 'F');
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(label, hx + 10, y + 8);
    // Value — large
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...(accent ? TEAL : NAVY));
    doc.text(value, hx + 10, y + 26);
  });

  y += 52;
  rule(y, BODY_L, BODY_R, RULE);
  y += 18;

  // ── Two-column: Financing | Income & Expenses ─────────────────────────────
  const halfW = (BODY_W - 16) / 2;
  const col2x = BODY_L + halfW + 16;

  // Both column headers must start at the same y — capture it before calling sectionHead
  const two_col_head_y = y;

  // Left: Financing
  y = sectionHead('Financing', two_col_head_y, BODY_L, BODY_L + halfW - 2);

  const finRows = [
    ['Loan Amount',      fmt$(r.loanAmt)],
    ['Monthly P&I',      fmt$(r.monthlyPayment)],
    ['Monthly PITI',     fmt$(r.monthlyPayment + (a.expenses?.propertyTax || 0)/12 + (a.expenses?.insurance || 0)/12 + (+a.pmi || 0))],
    ['Down Payment',     fmt$(+a.purchasePrice - r.loanAmt)],
    ['LTV',              a.purchasePrice > 0 ? fmtPct(r.loanAmt / +a.purchasePrice) : '—'],
    ['Closing Costs',    fmt$(r.closingCostsTotal)],
    ['Seller Credits',   a.sellerConcessions > 0 ? fmt$(+a.sellerConcessions) : '—'],
  ].filter(([, v]) => v !== '—');

  const fy_start = y;
  finRows.forEach(([lbl, val], i) => {
    const ry = y + i * 17;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    doc.text(lbl, BODY_L, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(val, BODY_L + halfW - 2, ry, { align: 'right' });
    if (i < finRows.length - 1) rule(ry + 4, BODY_L, BODY_L + halfW - 2, [226, 232, 240]);
  });

  const finHeight = finRows.length * 17;

  // Right: Income & Expenses — start at same y as left column header
  let ry2 = sectionHead('Income & Expenses (Year 1)', two_col_head_y, col2x, BODY_R);

  const expBrk = r.baseExpBreakdown || {};
  const incRows = [
    ['Gross Rent',      fmt$(r.grossRentYear0)],
    ['Vacancy Loss',    fmt$(r.years[0]?.vacancyLoss)],
    ['Eff. Gross Income', fmt$(r.years[0]?.egi)],
    ['Operating Expenses', fmt$(r.baseExpenses)],
    ['Net Op. Income',  fmt$(r.noi)],
    ['Debt Service',    fmt$(r.annualDebtService)],
    ['Net Cash Flow',   fmt$(r.years[0]?.cashFlow)],
  ];

  incRows.forEach(([lbl, val], i) => {
    const iry = ry2 + i * 17;
    const isTotal = lbl === 'Net Op. Income' || lbl === 'Net Cash Flow';
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(isTotal ? NAVY[0] : SLATE[0], isTotal ? NAVY[1] : SLATE[1], isTotal ? NAVY[2] : SLATE[2]);
    doc.text(lbl, col2x, iry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(isTotal ? TEAL : NAVY));
    doc.text(val, BODY_R, iry, { align: 'right' });
    if (i < incRows.length - 1) rule(iry + 4, col2x, BODY_R, [226, 232, 240]);
  });

  y = fy_start + Math.max(finHeight, incRows.length * 17) + 20;
  rule(y, BODY_L, BODY_R, RULE);
  y += 18;

  // ── Unit Rent Schedule ────────────────────────────────────────────────────
  if (a.units && a.numUnits > 0) {
    y = sectionHead('Unit Rent Schedule', y);

    const unitHead = [['Unit', 'Beds', 'Baths', 'Monthly Rent', 'Annual Rent', 'Vacancy']];
    const unitRows = a.units.slice(0, a.numUnits).map((u, i) => {
      const rent = +(u.rent || u.listedRent) || 0;
      const isOwner = a.ownerOccupied && a.ownerUnit === i;
      return [
        `Unit ${i + 1}` + (isOwner ? '  (Owner)' : ''),
        u.beds || '—',
        u.baths || '—',
        fmt$(rent),
        fmt$(rent * 12),
        fmtPct(+a.vacancyRate / 100 || 0.05),
      ];
    });

    autoTable(doc, {
      startY: y, head: unitHead, body: unitRows,
      margin: { left: BODY_L, right: W - BODY_R },
      headStyles: {
        fillColor: NAVY, textColor: WHITE,
        fontStyle: 'bold', fontSize: 8, halign: 'right',
      },
      columnStyles: { 0: { halign: 'left' } },
      bodyStyles: { fontSize: 8.5, textColor: INK, halign: 'right' },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      styles: { cellPadding: { top: 5, bottom: 5, left: 6, right: 6 } },
      theme: 'plain',
      didDrawCell: (data) => {
        // Bottom border on each body row
        if (data.section === 'body') {
          doc.setDrawColor(...RULE);
          doc.setLineWidth(0.3);
          doc.line(data.cell.x, data.cell.y + data.cell.height,
                   data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ── Expense Breakdown ─────────────────────────────────────────────────────
  const expRows2 = [
    ['Property Tax', expBrk.propertyTax],
    ['Insurance',    expBrk.insurance],
    ['Maintenance',  expBrk.maintenance],
    ['CapEx Reserve',expBrk.capex],
    ['Property Mgmt',expBrk.propertyMgmt],
    ['Utilities',    expBrk.utilities],
  ].filter(([, v]) => v > 0);

  if (expRows2.length > 0 && y < H - 130) {
    y = sectionHead('Expense Breakdown (Year 1)', y);
    const perRow = expRows2.length > 3 ? 3 : expRows2.length;
    const expColW = BODY_W / perRow;

    expRows2.forEach(([lbl, val], i) => {
      const rowOffset = Math.floor(i / perRow);
      const colOffset = i % perRow;
      const ex = BODY_L + colOffset * expColW;
      const ey = y + rowOffset * 46;
      const pct = r.years[0]?.egi > 0 ? ((val / r.years[0].egi) * 100).toFixed(0) + '%' : '—';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      doc.text(lbl, ex, ey);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(fmt$(val), ex, ey + 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEAL);
      doc.text(pct + ' of EGI', ex, ey + 24);
    });

    const rows2 = Math.ceil(expRows2.length / perRow);
    y += rows2 * 46;
  }

  // ── Page 1 footer ─────────────────────────────────────────────────────────
  doc.setFillColor(226, 232, 240);
  doc.rect(SIDEBAR, H - 28, W - SIDEBAR, 28, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(
    'RentHack provides financial projections for informational purposes only. Not financial, legal, or tax advice. Consult qualified professionals before investing. renthack.io/legal/tos',
    BODY_L, H - 12,
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 2 — 10-Year Cash Flow Projection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  doc.addPage();

  // Sidebar — full height navy
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, SIDEBAR, H, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, SIDEBAR, 5, 'F');

  // Sidebar wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text('Rent', MARGIN, 36);
  doc.setTextColor(...TEAL);
  doc.text('Hack', MARGIN + doc.getTextWidth('Rent'), 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`${holdYrs}-YEAR PROJECTION`, MARGIN, 50);

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 58, SIDEBAR - MARGIN, 58);

  // Sidebar: exit assumptions
  let sy2 = 76;
  const exitKpis = [
    { label: 'Hold Period',          value: `${holdYrs} Year${holdYrs === 1 ? '' : 's'}` },
    { label: 'Appreciation',         value: a.appreciationRate ? a.appreciationRate + '%/yr' : '—' },
    { label: 'Rent Growth',          value: a.rentGrowth ? a.rentGrowth + '%/yr' : '—' },
    { label: 'Expense Growth',       value: a.expenseGrowth ? a.expenseGrowth + '%/yr' : '—' },
    { label: 'Exit Value',           value: fmt$(r.exitValue) },
    { label: 'Loan Payoff',          value: fmt$(r.years[(holdYrs - 1)]?.loanBalance) },
    { label: 'Net Proceeds',         value: fmt$(r.netProceeds) },
    { label: 'Total Cash Flow',      value: fmt$(r.years.slice(0, holdYrs).reduce((s, y) => s + (y.cashFlow || 0), 0)) },
    { label: `IRR (${holdYrs}-Year)`, value: fmtPct(r.irr) },
    { label: 'Equity Multiple',      value: fmtX(r.equityMultiple) },
  ];

  exitKpis.forEach(({ label, value }, i) => {
    if (i > 0 && i % 4 === 0) {
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, sy2 - 4, SIDEBAR - MARGIN, sy2 - 4);
    }
    sy2 = sidebarRow(label, value, sy2, TEAL_VAL);
  });

  // Value-add note if enabled
  if (a.valueAdd?.enabled) {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, sy2, SIDEBAR - MARGIN, sy2);
    sy2 += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...TEAL);
    doc.text('VALUE-ADD', MARGIN, sy2);
    sy2 += 12;
    const vaItems = [
      ['Reno Cost', fmt$(+a.valueAdd.reModelCost)],
      ['Rent Bump', fmt$(+a.valueAdd.rentBumpPerUnit) + '/unit'],
      ['Units',     String(a.valueAdd.unitsRenovated)],
      ['Completion', 'Yr ' + a.valueAdd.completionYear],
    ];
    vaItems.forEach(([lbl, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(lbl, MARGIN, sy2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEAL_VAL);
      doc.text(val, SIDEBAR - MARGIN, sy2, { align: 'right' });
      sy2 += 13;
    });
  }

  // Sidebar footer
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, H - 56, SIDEBAR - MARGIN, H - 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(dateStr, MARGIN, H - 44);
  if (preparerName) doc.text(preparerName, MARGIN, H - 34);
  doc.text('Page 2 of 2', MARGIN, H - 18);

  // Body background
  doc.setFillColor(...CREAM);
  doc.rect(SIDEBAR, 0, W - SIDEBAR, H, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(SIDEBAR, 0, W - SIDEBAR, 5, 'F');

  // Page 2 heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  doc.text(`${holdYrs}-Year Cash Flow Projection`, BODY_L, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  const addrShort = addr.length > 50 ? addr.slice(0, 48) + '…' : addr;
  doc.text(addrShort, BODY_R, 36, { align: 'right' });
  rule(48, BODY_L, BODY_R, RULE);

  // ── 10-Year Table ─────────────────────────────────────────────────────────
  const cfHead = [['', ...r.years.map(y => `Yr ${y.yr}`)]];
  const cfRows = [
    { label: 'Gross Rent',    data: r.years.map(y => fmtK(y.grossRent)),    bold: false, teal: false },
    { label: 'Vacancy Loss',  data: r.years.map(y => fmtK(y.vacancyLoss)),  bold: false, teal: false },
    { label: 'EGI',           data: r.years.map(y => fmtK(y.egi)),          bold: true,  teal: false, top: true },
    { label: 'Expenses',      data: r.years.map(y => fmtK(y.expenses)),     bold: false, teal: false },
    { label: 'NOI',           data: r.years.map(y => fmtK(y.noi)),          bold: true,  teal: true,  top: true },
    { label: 'Debt Service',  data: r.years.map(y => fmtK(y.debtService)),  bold: false, teal: false },
    { label: 'Cash Flow',     data: r.years.map(y => fmtK(y.cashFlow)),     bold: true,  teal: true,  top: true },
    { label: 'CoC Return',    data: r.years.map(y => fmtRate(y.cocReturn)), bold: false, teal: false },
    { label: 'DSCR',          data: r.years.map(y => y.dscr.toFixed(2)),   bold: false, teal: false },
    { label: 'Prop. Value',   data: r.years.map(y => fmtK(y.propertyValue)),bold: false, teal: false, top: true },
    { label: 'Loan Balance',  data: r.years.map(y => fmtK(y.loanBalance)),  bold: false, teal: false },
    { label: 'Equity',        data: r.years.map(y => fmtK(y.equity)),       bold: true,  teal: true },
  ];

  const tableBody = cfRows.map(row => [row.label, ...row.data]);

  autoTable(doc, {
    startY: 60,
    head: cfHead,
    body: tableBody,
    margin: { left: BODY_L, right: W - BODY_R },
    headStyles: {
      fillColor: NAVY, textColor: WHITE,
      fontStyle: 'bold', fontSize: 7.5, halign: 'right',
      cellPadding: { top: 6, bottom: 6, left: 4, right: 4 },
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold', textColor: SLATE, cellWidth: 62 },
    },
    bodyStyles: {
      fontSize: 7.5, textColor: INK, halign: 'right',
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    theme: 'plain',
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = cfRows[data.row.index];
      if (!row) return;
      if (row.teal) {
        data.cell.styles.textColor = TEAL;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = TEAL_BG;
      } else if (row.bold) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = NAVY;
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const row = cfRows[data.row.index];
      if (row?.top) {
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.5);
        doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
      }
    },
  });

  // Page 2 footer
  const fp2y = H - 28;
  doc.setFillColor(226, 232, 240);
  doc.rect(SIDEBAR, fp2y, W - SIDEBAR, 28, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...SLATE);
  doc.text(
    'Results are projections based on user-entered assumptions and are not guaranteed.  ·  renthack.io/legal/tos',
    BODY_L, H - 15,
  );

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = (deal.address || deal.id || 'deal').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`renthack_${safeName}.pdf`);
}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

export { exportPortfolioCSV, exportPortfolioXLSX, exportDealCSV, exportDealXLSX, exportDealPDF, dlFile };
