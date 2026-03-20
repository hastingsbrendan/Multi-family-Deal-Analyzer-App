// ─── CSV export helpers ──────────────────────────────────────────────────────
import { calcDeal } from './calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';

function exportPortfolioCSV(deals){const hdr=["Address","Status","Purchase Price","Cash In","NOI (Yr1)","CoC (Yr1)","Cap Rate","IRR (10yr)","Equity Multiple","DSCR (Yr1)"];const rows=deals.map(d=>{const r=calcDeal(d);return[d.address,d.status,d.assumptions.purchasePrice,Math.round(r.totalCash),Math.round(r.noi),(r.cocReturn*100).toFixed(2)+"%",(r.capRate*100).toFixed(2)+"%",(r.irr*100).toFixed(2)+"%",r.equityMultiple.toFixed(2)+"x",r.dscr.toFixed(2)];});dlFile([hdr,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),"portfolio_summary.csv","text/csv");}
// ─── Excel export (deal level) ───────────────────────────────────────────────

function exportDealXLSX(deal, user) {
  const r  = calcDeal(deal);
  const a  = deal.assumptions;
  const wb = XLSX.utils.book_new();

  // ── Palette (xlsx-js-style requires patternType:'solid' for fills) ────────
  const NAVY    = '0F172A';
  const TEAL    = '0D9488';
  const TEAL_DK = '0A7A6E';
  const WHITE   = 'FFFFFF';
  const CREAM   = 'FAF8F4';
  const SLATE   = '475569';
  const SLATE_LT= '94A3B8';
  const LT_TEAL = 'F0FDFB';
  const LT_GRAY = 'F8FAFF';
  const ALT_ROW = 'F1F5F9';
  const GREEN   = '166534';
  const LT_GREEN= 'DCFCE7';
  const RED_C   = 'DC2626';
  const LT_RED  = 'FEF2F2';

  const USD   = '$#,##0;($#,##0);"-"';
  const PCT1  = '0.0%;(0.0%);"-"';
  const X2    = '0.00"x"';
  const NUM2  = '0.00';

  // ── Cell factory helpers ──────────────────────────────────────────────────
  const fill = (rgb) => ({ patternType: 'solid', fgColor: { rgb } });
  const border = (color = 'CBD5E1') => ({
    top:    { style: 'thin', color: { rgb: color } },
    bottom: { style: 'thin', color: { rgb: color } },
    left:   { style: 'thin', color: { rgb: color } },
    right:  { style: 'thin', color: { rgb: color } },
  });
  const borderBottom = (color = TEAL) => ({
    bottom: { style: 'medium', color: { rgb: color } },
  });

  // Navy banner header (e.g. sheet title, section bars)
  const mkNavy = (v, sz = 11, align = 'left') => ({
    v: v ?? '', t: typeof v === 'number' ? 'n' : 's',
    s: {
      font:      { bold: true, color: { rgb: WHITE }, sz, name: 'Arial' },
      fill:      fill(NAVY),
      alignment: { horizontal: align, vertical: 'center', wrapText: false },
      border:    borderBottom(TEAL),
    },
  });

  // Teal section sub-header
  const mkTeal = (v, align = 'left') => ({
    v: v ?? '', t: 's',
    s: {
      font:      { bold: true, color: { rgb: WHITE }, sz: 9, name: 'Arial' },
      fill:      fill(TEAL),
      alignment: { horizontal: align, vertical: 'center' },
    },
  });

  // Row label (left column, cream bg)
  const mkLabel = (v, indent = false) => ({
    v: v ?? '', t: 's',
    s: {
      font:      { bold: false, color: { rgb: SLATE }, sz: 10, name: 'Arial' },
      fill:      fill(CREAM),
      alignment: { horizontal: 'left', vertical: 'center', indent: indent ? 1 : 0 },
      border:    { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
    },
  });

  // Standard value cell (white bg, navy text)
  const mkVal = (v, fmt, alt = false) => ({
    v: v ?? (typeof v === 'number' ? 0 : ''), t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: {
      font:      { bold: false, color: { rgb: NAVY }, sz: 10, name: 'Arial' },
      fill:      fill(alt ? ALT_ROW : WHITE),
      alignment: { horizontal: 'right', vertical: 'center' },
      border:    { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
    },
  });

  // Bold value cell
  const mkBold = (v, fmt, alt = false) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: {
      font:      { bold: true, color: { rgb: NAVY }, sz: 10, name: 'Arial' },
      fill:      fill(alt ? ALT_ROW : WHITE),
      alignment: { horizontal: 'right', vertical: 'center' },
      border:    { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } },
    },
  });

  // Teal accent (highlighted key metric)
  const mkAccent = (v, fmt) => ({
    v: v ?? 0, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: {
      font:      { bold: true, color: { rgb: TEAL }, sz: 10, name: 'Arial' },
      fill:      fill(LT_TEAL),
      alignment: { horizontal: 'right', vertical: 'center' },
      border:    { bottom: { style: 'thin', color: { rgb: TEAL } } },
    },
  });

  // Green pass / red fail
  const mkPass = (passes, label) => ({
    v: label, t: 's',
    s: {
      font:      { bold: true, color: { rgb: passes ? GREEN : RED_C }, sz: 11, name: 'Arial' },
      fill:      fill(passes ? LT_GREEN : LT_RED),
      alignment: { horizontal: 'center', vertical: 'center' },
    },
  });

  // Empty filler cell (for merged area padding)
  const mkBlank = (bg = WHITE) => ({ v: '', t: 's', s: { fill: fill(bg) } });

  // Helper: set a cell in a worksheet object
  const set = (ws, col, row, cell) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: col })] = cell;
  };

  const safeName = (deal.address || deal.id || 'deal').toString()
    .replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const dateStr = new Date().toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
  const preparer = user?.user_metadata?.display_name || user?.email || '';
  const org = user?.user_metadata?.organization || '';

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 1 — Deal Summary
  // ──────────────────────────────────────────────────────────────────────────
  const ws1 = {};
  ws1['!merges'] = [];
  const m1 = (rs, re, cs, ce) => ws1['!merges'].push({ s: { r: rs-1, c: cs }, e: { r: re-1, c: ce } });

  // ── Logo banner ────────────────────────────────────────────────────────
  // Row 1: full-width navy banner  "RENT" [white] + "HACK" [teal-ish on navy]
  set(ws1, 0, 1, {
    v: 'RENT', t: 's',
    s: {
      font:      { bold: true, color: { rgb: WHITE }, sz: 18, name: 'Arial' },
      fill:      fill(NAVY),
      alignment: { horizontal: 'right', vertical: 'center' },
    },
  });
  set(ws1, 1, 1, {
    v: 'HACK', t: 's',
    s: {
      font:      { bold: true, color: { rgb: '2DD4BF' }, sz: 18, name: 'Arial' },  // teal-300 on navy
      fill:      fill(NAVY),
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  });
  // Fill remaining banner cols
  for (let c = 2; c <= 5; c++) set(ws1, c, 1, mkBlank(NAVY));
  // Right-align date and preparer in banner
  set(ws1, 4, 1, {
    v: dateStr + (preparer ? `  ·  ${preparer}${org ? ' · ' + org : ''}` : ''),
    t: 's',
    s: {
      font:      { italic: true, color: { rgb: SLATE_LT }, sz: 8, name: 'Arial' },
      fill:      fill(NAVY),
      alignment: { horizontal: 'right', vertical: 'center' },
    },
  });
  m1(1,1, 4,5);  // merge the date cell across last two cols

  // Row 2: address sub-banner
  const addr = deal.address || 'Untitled Property';
  set(ws1, 0, 2, {
    v: addr, t: 's',
    s: {
      font:      { bold: true, color: { rgb: WHITE }, sz: 13, name: 'Arial' },
      fill:      fill(TEAL),
      alignment: { horizontal: 'left', vertical: 'center' },
      border:    { bottom: { style: 'medium', color: { rgb: NAVY } } },
    },
  });
  for (let c = 1; c <= 5; c++) set(ws1, c, 2, {
    v: '', t: 's',
    s: { fill: fill(TEAL), border: { bottom: { style: 'medium', color: { rgb: NAVY } } } },
  });
  m1(2,2, 0,5);

  // Row 3: property detail badges as a text row
  const yr1 = r.years[0] || {};
  const expBrk = r.baseExpBreakdown || {};
  const pp = +a.purchasePrice || 0;
  const details = [
    a.numUnits ? `${a.numUnits} Units` : null,
    a.beds  ? `${a.beds} BD` : null,
    a.baths ? `${a.baths} BA` : null,
    a.sqftTotal ? `${Number(a.sqftTotal).toLocaleString()} SF` : null,
    a.yearBuilt ? `Built ${a.yearBuilt}` : null,
    deal.status || null,
  ].filter(Boolean).join('   ·   ');
  set(ws1, 0, 3, {
    v: details, t: 's',
    s: {
      font:      { bold: false, color: { rgb: SLATE }, sz: 9, name: 'Arial' },
      fill:      fill('EFF6FF'),
      alignment: { horizontal: 'left', vertical: 'center' },
    },
  });
  for (let c = 1; c <= 5; c++) set(ws1, c, 3, mkBlank('EFF6FF'));
  m1(3,3, 0,5);

  // Row 4: blank spacer
  set(ws1, 0, 4, mkBlank(WHITE));

  // ── SECTION: Key Returns ────────────────────────────────────────────────
  let row = 5;
  // Section header
  set(ws1, 0, row, mkTeal('KEY RETURNS'));
  for (let c = 1; c <= 5; c++) set(ws1, c, row, { v: '', t: 's', s: { fill: fill(TEAL) } });
  m1(row,row, 0,5);
  row++;

  // Column headers for the 3-metric-across layout
  const kpiHeaders = ['Metric', 'Value', '', 'Metric', 'Value'];
  kpiHeaders.forEach((h, c) => set(ws1, c, row, {
    v: h, t: 's',
    s: {
      font:      { bold: true, color: { rgb: WHITE }, sz: 9, name: 'Arial' },
      fill:      fill('1E293B'),
      alignment: { horizontal: c % 3 === 1 ? 'right' : 'left', vertical: 'center' },
    },
  }));
  row++;

  // Two-column KPI grid
  const leftKpis = [
    ['IRR (10-Year)',      r.irr,              PCT1,  true],
    ['Cash-on-Cash Yr 1', r.cocReturn,         PCT1,  true],
    ['Cap Rate (Yr 1)',   r.capRate,           PCT1,  false],
    ['DSCR (Yr 1)',       r.dscr,              NUM2,  false],
    ['Break-Even Occ.',   r.breakEvenOccupancy,PCT1,  false],
  ];
  const rightKpis = [
    ['Equity Multiple',   r.equityMultiple,    X2,    true],
    ['Monthly Cash Flow', yr1.monthlyCashFlow, USD,   true],
    ['Annual NOI',        r.noi,               USD,   false],
    ['Exit Value (Yr10)', r.exitValue,         USD,   false],
    ['Net Proceeds',      r.netProceeds,       USD,   true],
  ];
  const maxKpi = Math.max(leftKpis.length, rightKpis.length);
  for (let i = 0; i < maxKpi; i++) {
    const alt = i % 2 === 1;
    const [lL, vL, fL, aL] = leftKpis[i]  || ['', null, null, false];
    const [lR, vR, fR, aR] = rightKpis[i] || ['', null, null, false];
    set(ws1, 0, row, mkLabel(lL));
    set(ws1, 1, row, lL ? (aL ? mkAccent(vL, fL) : mkBold(vL, fL, alt)) : mkBlank(alt ? ALT_ROW : WHITE));
    set(ws1, 2, row, mkBlank(alt ? ALT_ROW : WHITE));  // spacer col
    set(ws1, 3, row, mkLabel(lR));
    set(ws1, 4, row, lR ? (aR ? mkAccent(vR, fR) : mkBold(vR, fR, alt)) : mkBlank(alt ? ALT_ROW : WHITE));
    set(ws1, 5, row, mkBlank(alt ? ALT_ROW : WHITE));
    row++;
  }
  row++; // spacer

  // ── SECTION: Financing ──────────────────────────────────────────────────
  set(ws1, 0, row, mkTeal('FINANCING'));
  for (let c = 1; c <= 5; c++) set(ws1, c, row, { v: '', t: 's', s: { fill: fill(TEAL) } });
  m1(row,row, 0,5);
  row++;

  const finRows = [
    ['Purchase Price',      pp,                                       USD,   false],
    ['Down Payment ($)',    pp - r.loanAmt,                           USD,   false],
    ['Down Payment (%)',    pp > 0 ? (pp - r.loanAmt) / pp : 0,      PCT1,  false],
    ['Loan Amount',         r.loanAmt,                                USD,   false],
    ['Interest Rate',       (+a.interestRate || 0) / 100,             PCT1,  false],
    ['Loan Term',           (+a.amortYears || 30),                    null,  false],
    ['LTV',                 pp > 0 ? r.loanAmt / pp : 0,             PCT1,  false],
    ['Monthly P&I',         r.monthlyPayment,                        USD,   false],
    ['Annual Debt Service', r.annualDebtService,                     USD,   false],
    ['Closing Costs',       r.closingCostsTotal,                     USD,   false],
    ['Seller Concessions',  +a.sellerConcessions || 0,               USD,   false],
    ['PMI (Monthly)',       +a.pmi || 0,                              USD,   false],
    ['Total Cash In',       r.totalCash,                              USD,   true],
  ];
  finRows.forEach(([lbl, val, fmt, accent], i) => {
    const alt = i % 2 === 1;
    set(ws1, 0, row, mkLabel(lbl));
    set(ws1, 1, row, accent ? mkAccent(val, fmt) : mkVal(val, fmt, alt));
    for (let c = 2; c <= 5; c++) set(ws1, c, row, mkBlank(alt ? ALT_ROW : WHITE));
    m1(row,row, 1,5);
    row++;
  });
  row++;

  // ── SECTION: Income & Expenses ──────────────────────────────────────────
  set(ws1, 0, row, mkTeal('INCOME & EXPENSES  (YEAR 1)'));
  for (let c = 1; c <= 5; c++) set(ws1, c, row, { v: '', t: 's', s: { fill: fill(TEAL) } });
  m1(row,row, 0,5);
  row++;

  const incRows = [
    ['Gross Rent (Annual)',       r.grossRentYear0,                              USD,  false],
    ['Vacancy Rate',              (+a.vacancyRate || 5) / 100,                   PCT1, false],
    ['Vacancy Loss',              yr1.vacancyLoss,                               USD,  false],
    ['Effective Gross Income',    yr1.egi,                                       USD,  false],
    ['  Property Tax',            expBrk.propertyTax || 0,                      USD,  false, true],
    ['  Insurance',               expBrk.insurance   || 0,                      USD,  false, true],
    ['  Maintenance',             expBrk.maintenance || 0,                      USD,  false, true],
    ['  CapEx Reserve',           expBrk.capex        || 0,                     USD,  false, true],
    ['  Property Management',     expBrk.propertyMgmt || 0,                     USD,  false, true],
    ['  Utilities',               expBrk.utilities    || 0,                     USD,  false, true],
    ['Total Operating Expenses',  r.baseExpenses,                                USD,  false],
    ['Expense Ratio',             yr1.egi > 0 ? r.baseExpenses / yr1.egi : 0,  PCT1, false],
    ['Net Operating Income',      r.noi,                                         USD,  true],
    ['Annual Debt Service',       r.annualDebtService,                           USD,  false],
    ['Annual Cash Flow',          yr1.cashFlow,                                  USD,  true],
    ['Monthly Cash Flow',         yr1.monthlyCashFlow,                           USD,  true],
    ['After-Tax Cash Flow (Yr1)', yr1.afterTaxCashFlow,                          USD,  false],
  ];
  incRows.forEach(([lbl, val, fmt, accent, indent], i) => {
    const alt = i % 2 === 1;
    const l = lbl.startsWith('  ') ? mkLabel(lbl.trim(), true) : mkLabel(lbl);
    set(ws1, 0, row, l);
    set(ws1, 1, row, accent ? mkAccent(val, fmt) : mkVal(val, fmt, alt));
    for (let c = 2; c <= 5; c++) set(ws1, c, row, mkBlank(alt ? ALT_ROW : WHITE));
    m1(row,row, 1,5);
    row++;
  });
  row++;

  // ── SECTION: Exit Analysis ──────────────────────────────────────────────
  set(ws1, 0, row, mkTeal('EXIT ANALYSIS  (YEAR 10)'));
  for (let c = 1; c <= 5; c++) set(ws1, c, row, { v: '', t: 's', s: { fill: fill(TEAL) } });
  m1(row,row, 0,5);
  row++;

  const cumCF = r.years.reduce((s, y) => s + (y.cashFlow || 0), 0);
  const exitRows = [
    ['Projected Exit Value',     r.exitValue,        USD,  false],
    ['Remaining Loan Balance',   r.exitLoanBalance,  USD,  false],
    ['Total Gain on Sale',       r.totalGainOnSale,  USD,  false],
    ['Capital Gains Tax',        r.capitalGainsTax,  USD,  false],
    ['Net Sale Proceeds',        r.netProceeds,      USD,  true],
    ['Cumulative Cash Flows',    cumCF,              USD,  false],
    ['Total Return',             r.netProceeds + cumCF, USD, true],
  ];
  exitRows.forEach(([lbl, val, fmt, accent], i) => {
    const alt = i % 2 === 1;
    set(ws1, 0, row, mkLabel(lbl));
    set(ws1, 1, row, accent ? mkAccent(val, fmt) : mkVal(val, fmt, alt));
    for (let c = 2; c <= 5; c++) set(ws1, c, row, mkBlank(alt ? ALT_ROW : WHITE));
    m1(row,row, 1,5);
    row++;
  });

  // ── FHA Self-Sufficiency (conditional) ─────────────────────────────────
  if (r.fhaSelfSufficiency?.applies) {
    row++;
    set(ws1, 0, row, mkTeal('FHA SELF-SUFFICIENCY TEST'));
    for (let c = 1; c <= 5; c++) set(ws1, c, row, { v: '', t: 's', s: { fill: fill(TEAL) } });
    m1(row,row, 0,5);
    row++;
    const fha = r.fhaSelfSufficiency;
    const fhaRows = [
      ['Gross Rents (All Units)', fha.grossRentAllUnits, USD],
      ['75% Threshold',           fha.threshold75Pct,    USD],
      ['PITI (Annual)',            fha.pitiAnnual,        USD],
      ['Surplus / (Shortfall)',    fha.delta,             USD],
    ];
    fhaRows.forEach(([lbl, val, fmt], i) => {
      set(ws1, 0, row, mkLabel(lbl));
      set(ws1, 1, row, mkVal(val, fmt, i % 2 === 1));
      for (let c = 2; c <= 5; c++) set(ws1, c, row, mkBlank(i % 2 === 1 ? ALT_ROW : WHITE));
      m1(row,row, 1,5);
      row++;
    });
    set(ws1, 0, row, mkLabel('Result'));
    set(ws1, 1, row, mkPass(fha.passes, fha.passes ? 'PASS  ✓' : 'FAIL  ✗'));
    for (let c = 2; c <= 5; c++) set(ws1, c, row, mkBlank(fha.passes ? LT_GREEN : LT_RED));
    m1(row,row, 1,5);
    row++;
  }

  // Disclaimer footer
  row++;
  set(ws1, 0, row, {
    v: 'For informational purposes only. Not financial, legal, or tax advice. Consult qualified professionals before making investment decisions.  ·  renthack.io/legal/tos',
    t: 's',
    s: {
      font:      { italic: true, color: { rgb: SLATE_LT }, sz: 8, name: 'Arial' },
      fill:      fill(CREAM),
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    },
  });
  for (let c = 1; c <= 5; c++) set(ws1, c, row, mkBlank(CREAM));
  m1(row,row, 0,5);

  ws1['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 5 } });
  ws1['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 3 }, { wch: 28 }, { wch: 16 }, { wch: 3 }];
  ws1['!rows'] = [{ hpt: 36 }, { hpt: 22 }, { hpt: 16 }]; // logo, address, badge rows
  XLSX.utils.book_append_sheet(wb, ws1, 'Deal Summary');

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 2 — 10-Year Projection
  // ──────────────────────────────────────────────────────────────────────────
  const ws2 = {};
  ws2['!merges'] = [];
  const m2 = (rs, re, cs, ce) => ws2['!merges'].push({ s: { r: rs-1, c: cs }, e: { r: re-1, c: ce } });
  const YRS = r.years.length;

  // Logo banner
  set(ws2, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 14, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'right', vertical: 'center' } } });
  set(ws2, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: '2DD4BF' }, sz: 14, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'left', vertical: 'center' } } });
  for (let c = 2; c <= YRS; c++) set(ws2, c, 1, mkBlank(NAVY));
  set(ws2, YRS, 1, { v: `10-Year Cash Flow Projection  ·  ${deal.address || ''}`, t: 's', s: { font: { italic: true, color: { rgb: SLATE_LT }, sz: 9, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'right', vertical: 'center' } } });

  // Year header row
  set(ws2, 0, 2, mkNavy('', 10, 'left'));
  r.years.forEach((y, i) => {
    set(ws2, i + 1, 2, {
      v: `Year ${y.yr}`, t: 's',
      s: {
        font:      { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Arial' },
        fill:      fill(NAVY),
        alignment: { horizontal: 'right', vertical: 'center' },
        border:    borderBottom(TEAL),
      },
    });
  });

  // Row definitions
  const cfSections = [
    { section: 'INCOME' },
    { label: 'Gross Rent',          field: 'grossRent',        fmt: USD,  teal: false, bold: false },
    { label: 'Vacancy Loss',        field: 'vacancyLoss',      fmt: USD,  teal: false, bold: false },
    { label: 'Eff. Gross Income',   field: 'egi',              fmt: USD,  teal: false, bold: true  },
    { section: 'EXPENSES & NOI' },
    { label: 'Operating Expenses',  field: 'expenses',         fmt: USD,  teal: false, bold: false },
    { label: 'Net Op. Income',      field: 'noi',              fmt: USD,  teal: true,  bold: true  },
    { section: 'CASH FLOW' },
    { label: 'Debt Service',        field: 'debtService',      fmt: USD,  teal: false, bold: false },
    { label: 'Cash Flow',           field: 'cashFlow',         fmt: USD,  teal: true,  bold: true  },
    { label: 'After-Tax Cash Flow', field: 'afterTaxCashFlow', fmt: USD,  teal: false, bold: false },
    { section: 'RETURNS' },
    { label: 'Cash-on-Cash',        field: 'cocReturn',        fmt: PCT1, teal: false, bold: false },
    { label: 'Cap Rate',            field: 'capRate',          fmt: PCT1, teal: false, bold: false },
    { label: 'DSCR',                field: 'dscr',             fmt: NUM2, teal: false, bold: false },
    { section: 'EQUITY & VALUE' },
    { label: 'Property Value',      field: 'propertyValue',    fmt: USD,  teal: false, bold: false },
    { label: 'Loan Balance',        field: 'balance',          fmt: USD,  teal: false, bold: false },
    { label: 'Equity',              field: 'equity',           fmt: USD,  teal: true,  bold: true  },
    { section: 'TAX & DEPRECIATION' },
    { label: 'Depreciation',        field: 'depreciation',     fmt: USD,  teal: false, bold: false },
    { label: 'Tax Effect',          field: 'taxEffect',        fmt: USD,  teal: false, bold: false },
    { label: 'Principal Paydown',   field: 'principalPaydown', fmt: USD,  teal: false, bold: false },
  ];

  let cfRow = 3;
  let cfAlt  = false;
  cfSections.forEach(def => {
    if (def.section) {
      set(ws2, 0, cfRow, mkTeal(def.section));
      for (let c = 1; c <= YRS; c++) {
        set(ws2, c, cfRow, { v: '', t: 's', s: { fill: fill(TEAL) } });
      }
      cfRow++;
      cfAlt = false;
      return;
    }
    // Row label
    set(ws2, 0, cfRow, mkLabel(def.label));
    // Year values
    r.years.forEach((y, i) => {
      const v = y[def.field] ?? 0;
      const cell = def.teal ? mkAccent(v, def.fmt) :
                   def.bold ? mkBold(v, def.fmt, cfAlt) :
                              mkVal(v, def.fmt, cfAlt);
      set(ws2, i + 1, cfRow, cell);
    });
    cfAlt = !cfAlt;
    cfRow++;
  });

  ws2['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cfRow, c: YRS } });
  ws2['!cols'] = [{ wch: 22 }, ...Array(YRS).fill({ wch: 12 })];
  ws2['!rows'] = [{ hpt: 30 }, { hpt: 20 }];
  ws2['!freeze'] = { xSplit: 1, ySplit: 2 };
  XLSX.utils.book_append_sheet(wb, ws2, '10-Year Projection');

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 3 — Assumptions
  // ──────────────────────────────────────────────────────────────────────────
  const ws3 = {};
  ws3['!merges'] = [];
  const m3 = (rs, re, cs, ce) => ws3['!merges'].push({ s: { r: rs-1, c: cs }, e: { r: re-1, c: ce } });
  let ar = 1;

  // Logo banner
  set(ws3, 0, 1, { v: 'RENT', t: 's', s: { font: { bold: true, color: { rgb: WHITE }, sz: 14, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'right', vertical: 'center' } } });
  set(ws3, 1, 1, { v: 'HACK', t: 's', s: { font: { bold: true, color: { rgb: '2DD4BF' }, sz: 14, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'left', vertical: 'center' } } });
  set(ws3, 2, 1, { v: `Assumptions  ·  ${deal.address || ''}`, t: 's', s: { font: { italic: true, color: { rgb: SLATE_LT }, sz: 9, name: 'Arial' }, fill: fill(NAVY), alignment: { horizontal: 'right', vertical: 'center' } } });
  ar = 2;

  const aHdr = (label) => {
    set(ws3, 0, ar, mkTeal(label));
    set(ws3, 1, ar, { v: '', t: 's', s: { fill: fill(TEAL) } });
    set(ws3, 2, ar, { v: '', t: 's', s: { fill: fill(TEAL) } });
    ar++;
  };
  const aRow = (lbl, val, fmt, alt = false) => {
    set(ws3, 0, ar, mkLabel(lbl));
    set(ws3, 1, ar, typeof val === 'number' ? mkVal(val, fmt, alt) : { v: val ?? '', t: 's', s: { font: { color: { rgb: NAVY }, sz: 10, name: 'Arial' }, fill: fill(alt ? ALT_ROW : WHITE), alignment: { horizontal: 'right', vertical: 'center' }, border: { bottom: { style: 'hair', color: { rgb: 'E2E8F0' } } } } });
    set(ws3, 2, ar, mkBlank(alt ? ALT_ROW : WHITE));
    ar++;
  };

  ar++;
  aHdr('PROPERTY');
  aRow('Address',          deal.address || '');
  aRow('Status',           deal.status  || '');
  aRow('Number of Units',  +a.numUnits || 2);
  aRow('Beds (total)',     +a.beds  || 0);
  aRow('Baths (total)',    +a.baths || 0);
  aRow('Square Footage',   +a.sqftTotal || 0, '#,##0', true);
  aRow('Year Built',       +a.yearBuilt || 0);
  aRow('Owner Occupied',   a.ownerOccupied ? 'Yes' : 'No');
  if (a.ownerOccupied) {
    aRow('Owner Unit',           +a.ownerUnit + 1, null, true);
    aRow('OO Duration (yrs)',    +a.ownerOccupancyYears || 0);
    aRow('Alternative Rent/mo', +a.alternativeRent || 0, USD, true);
  }

  ar++;
  aHdr('FINANCING');
  let alt3 = false;
  [
    ['Purchase Price',     pp,                                       USD],
    ['Down Payment %',     (+a.downPaymentPct || 25) / 100,          PCT1],
    ['Down Payment $',     pp - r.loanAmt,                           USD],
    ['Interest Rate',      (+a.interestRate || 7) / 100,             PCT1],
    ['Loan Term (years)',  +a.amortYears || 30,                      null],
    ['Loan Amount',        r.loanAmt,                                USD],
    ['LTV',                pp > 0 ? r.loanAmt / pp : 0,             PCT1],
    ['Monthly P&I',        r.monthlyPayment,                        USD],
    ['Closing Costs',      r.closingCostsTotal,                     USD],
    ['Seller Concessions', +a.sellerConcessions || 0,               USD],
    ['PMI (monthly)',      +a.pmi || 0,                              USD],
    ['Total Cash In',      r.totalCash,                              USD],
  ].forEach(([l, v, f]) => { aRow(l, v, f, alt3 = !alt3); });

  ar++;
  aHdr('UNIT RENTS');
  const units = (a.units || []).slice(0, +a.numUnits || 2);
  alt3 = false;
  units.forEach((u, i) => {
    const isOwner = a.ownerOccupied && +a.ownerUnit === i;
    aRow(`Unit ${i + 1} Rent${isOwner ? ' (Owner-Occupied)' : ''}`, +(u.rent || u.listedRent) || 0, USD, alt3 = !alt3);
  });
  aRow('Total Annual Rent', r.grossRentYear0, USD);

  ar++;
  aHdr('GROWTH & ANALYSIS RATES');
  alt3 = false;
  [
    ['Vacancy Rate',         (+a.vacancyRate    || 5) / 100, PCT1],
    ['Rent Growth / yr',     (+a.rentGrowth     || 3) / 100, PCT1],
    ['Expense Growth / yr',  (+a.expenseGrowth  || 3) / 100, PCT1],
    ['Appreciation / yr',    (+a.appreciationRate || 4) / 100, PCT1],
    ['Tax Bracket',          (+a.taxBracket     || 24) / 100, PCT1],
  ].forEach(([l, v, f]) => { aRow(l, v, f, alt3 = !alt3); });

  ar++;
  aHdr('ANNUAL EXPENSES');
  alt3 = false;
  [
    ['Property Tax',        expBrk.propertyTax || 0, USD],
    ['Insurance',           expBrk.insurance   || 0, USD],
    ['Maintenance',         expBrk.maintenance || 0, USD],
    ['CapEx Reserve',       expBrk.capex        || 0, USD],
    ['Property Management', expBrk.propertyMgmt || 0, USD],
    ['Utilities',           expBrk.utilities    || 0, USD],
    ['Total Expenses',      r.baseExpenses,           USD],
  ].forEach(([l, v, f]) => { aRow(l, v, f, alt3 = !alt3); });

  if (a.refi?.enabled) {
    ar++;
    aHdr('REFINANCE SCENARIO');
    alt3 = false;
    [
      ['Refi Year',       +a.refi.year   || 5,           null],
      ['New Rate',        (+a.refi.newRate || 6) / 100,  PCT1],
      ['New LTV',         (+a.refi.newLTV || 75) / 100,  PCT1],
    ].forEach(([l, v, f]) => { aRow(l, v, f, alt3 = !alt3); });
  }

  if (a.valueAdd?.enabled) {
    ar++;
    aHdr('VALUE-ADD SCENARIO');
    alt3 = false;
    [
      ['Renovation Cost',    +a.valueAdd.reModelCost    || 0, USD],
      ['Rent Bump / Unit',   +a.valueAdd.rentBumpPerUnit || 0, USD],
      ['Units Renovated',    +a.valueAdd.unitsRenovated || 0,  null],
      ['Completion Year',    +a.valueAdd.completionYear || 1,  null],
      ['IRR without VA',     r.irrWithoutVA,                  PCT1],
      ['IRR with VA',        r.irrWithVA,                     PCT1],
    ].forEach(([l, v, f]) => { aRow(l, v, f, alt3 = !alt3); });
  }

  ws3['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ar + 1, c: 2 } });
  ws3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 3 }];
  ws3['!rows'] = [{ hpt: 30 }];
  ws3['!freeze'] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(wb, ws3, 'Assumptions');

  // ── Write & download ──────────────────────────────────────────────────────
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
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  // ── Palette ──────────────────────────────────────────────────────────────
  const NAVY    = [15,  23,  42];   // #0F172A — deep navy for sidebar + headers
  const TEAL    = [13,  148, 136];  // #0D9488 — brand accent
  const TEAL_DK = [10,  110, 100];  // darker teal for contrast
  const CREAM   = [250, 248, 244];  // #FAF8F4 — warm body background
  const SLATE   = [71,  85,  105];  // #475569 — secondary text
  const RULE    = [203, 213, 225];  // #CBD5E1 — hairline rules
  const WHITE   = [255, 255, 255];
  const INK     = [30,  30,  40];   // near-black for primary text
  const TEAL_BG = [240, 253, 250];  // very light teal tint for highlight rows
  const AMBER   = [217, 119,   6];  // #D97706 — accent2 for warnings/flags

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
    { label: 'IRR (10-Year)',     value: fmtPct(r.irr) },
    { label: 'Equity Multiple',  value: fmtX(r.equityMultiple) },
    { label: 'Loan Amount',      value: fmt$(r.loanAmt) },
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
    const expColW = BODY_W / expRows2.length;
    expRows2.forEach(([lbl, val], i) => {
      const ex = BODY_L + i * expColW;
      const pct = r.years[0]?.egi > 0 ? ((val / r.years[0].egi) * 100).toFixed(0) + '%' : '—';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      doc.text(lbl, ex, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(fmt$(val), ex, y + 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEAL);
      doc.text(pct + ' of EGI', ex, y + 24);
    });
    y += 40;
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
  doc.text('10-YEAR PROJECTION', MARGIN, 50);

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 58, SIDEBAR - MARGIN, 58);

  // Sidebar: exit assumptions
  let sy2 = 76;
  const exitKpis = [
    { label: 'Hold Period',      value: '10 Years' },
    { label: 'Appreciation',     value: a.appreciationRate ? a.appreciationRate + '%/yr' : '—' },
    { label: 'Rent Growth',      value: a.rentGrowth ? a.rentGrowth + '%/yr' : '—' },
    { label: 'Expense Growth',   value: a.expenseGrowth ? a.expenseGrowth + '%/yr' : '—' },
    { label: 'Exit Value',       value: fmt$(r.exitValue) },
    { label: 'Loan Payoff',      value: fmt$(r.years[9]?.loanBalance) },
    { label: 'Net Proceeds',     value: fmt$(r.netProceeds) },
    { label: 'Total Cash Flow',  value: fmt$(r.years.reduce((s, y) => s + (y.cashFlow || 0), 0)) },
    { label: 'IRR (10-Year)',     value: fmtPct(r.irr) },
    { label: 'Equity Multiple',  value: fmtX(r.equityMultiple) },
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
  doc.text('10-Year Cash Flow Projection', BODY_L, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  const addrShort = addr.length > 50 ? addr.slice(0, 48) + '…' : addr;
  doc.text(addrShort, BODY_R, 36, { align: 'right' });
  rule(48, BODY_L, BODY_R, RULE);

  // ── 10-Year Table ─────────────────────────────────────────────────────────
  const cfHead = [['', 'Yr 1','Yr 2','Yr 3','Yr 4','Yr 5','Yr 6','Yr 7','Yr 8','Yr 9','Yr 10']];
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

export { exportPortfolioCSV, exportDealCSV, exportDealXLSX, exportDealPDF, dlFile };
