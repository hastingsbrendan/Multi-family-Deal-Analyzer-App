import * as XLSX from 'xlsx-js-style';
import { calcDeal } from '../calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from '../constants';
import { COLORS } from './colors';

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

export { exportPortfolioXLSX, exportPortfolioCSV };
