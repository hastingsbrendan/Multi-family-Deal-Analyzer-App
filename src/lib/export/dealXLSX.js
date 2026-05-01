import * as XLSX from 'xlsx-js-style';
import { calcDeal } from '../calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from '../constants';
import { COLORS } from './colors';

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

export { exportDealXLSX, exportDealCSV };
