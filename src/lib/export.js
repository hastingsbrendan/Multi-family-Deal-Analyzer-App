// ─── CSV export helpers ──────────────────────────────────────────────────────
import { calcDeal } from './calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function exportPortfolioCSV(deals){const hdr=["Address","Status","Purchase Price","Cash In","NOI (Yr1)","CoC (Yr1)","Cap Rate","IRR (10yr)","Equity Multiple","DSCR (Yr1)"];const rows=deals.map(d=>{const r=calcDeal(d);return[d.address,d.status,d.assumptions.purchasePrice,Math.round(r.totalCash),Math.round(r.noi),(r.cocReturn*100).toFixed(2)+"%",(r.capRate*100).toFixed(2)+"%",(r.irr*100).toFixed(2)+"%",r.equityMultiple.toFixed(2)+"x",r.dscr.toFixed(2)];});dlFile([hdr,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),"portfolio_summary.csv","text/csv");}
// ─── Excel export (deal level) ───────────────────────────────────────────────

function exportDealXLSX(deal, user) {
  const r  = calcDeal(deal);
  const a  = deal.assumptions;
  const wb = XLSX.utils.book_new();

  // ── Shared style helpers (SheetJS cell objects) ───────────────────────────
  const NAVY  = '0F172A';
  const TEAL  = '0D9488';
  const WHITE = 'FFFFFF';
  const CREAM = 'FAF8F4';
  const SLATE = '475569';
  const LIGHT_TEAL = 'F0FDFB';
  const LIGHT_GRAY = 'F8FAFF';

  const hdrCell = (v, w = 14) => ({
    v, t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 11 },
         fill: { fgColor: { rgb: NAVY } },
         alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
         border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }
  });
  const subHdrCell = (v) => ({
    v, t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 10 },
         fill: { fgColor: { rgb: TEAL } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  });
  const labelCell = (v) => ({
    v, t: 's',
    s: { font: { bold: false, color: { rgb: SLATE }, sz: 10 },
         fill: { fgColor: { rgb: CREAM } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  });
  const valCell = (v, fmt) => ({
    v, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold: true, color: { rgb: NAVY }, sz: 10 },
         fill: { fgColor: { rgb: WHITE } },
         alignment: { horizontal: 'right', vertical: 'center' } }
  });
  const accentCell = (v, fmt) => ({
    v, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold: true, color: { rgb: TEAL }, sz: 10 },
         fill: { fgColor: { rgb: LIGHT_TEAL } },
         alignment: { horizontal: 'right', vertical: 'center' } }
  });
  const numHdrCell = (v) => ({
    v, t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 10 },
         fill: { fgColor: { rgb: NAVY } },
         alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
         border: { bottom: { style: 'thin', color: { rgb: TEAL } } } }
  });
  const rowHdrCell = (v, isTeal = false) => ({
    v, t: 's',
    s: { font: { bold: isTeal, color: { rgb: isTeal ? TEAL : SLATE }, sz: 10 },
         fill: { fgColor: { rgb: isTeal ? LIGHT_TEAL : CREAM } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  });
  const cfNumCell = (v, fmt, isTeal = false) => ({
    v, t: typeof v === 'number' ? 'n' : 's',
    z: fmt || undefined,
    s: { font: { bold: isTeal, color: { rgb: isTeal ? TEAL : NAVY }, sz: 10 },
         fill: { fgColor: { rgb: isTeal ? LIGHT_TEAL : WHITE } },
         alignment: { horizontal: 'right', vertical: 'center' } }
  });
  const blankCell = (bg = WHITE) => ({
    v: '', t: 's',
    s: { fill: { fgColor: { rgb: bg } } }
  });

  const USD   = '$#,##0';
  const USD0  = '$#,##0;($#,##0);"-"';
  const PCT1  = '0.0%';
  const X2    = '0.00"x"';
  const NUM2  = '0.00';
  const safeName = (deal.address || deal.id || 'deal').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 1: Deal Summary
  // ──────────────────────────────────────────────────────────────────────────
  const expBrk = r.baseExpBreakdown || {};
  const yr1 = r.years[0] || {};

  const ws1 = {};
  let row = 1;

  // Title banner
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = {
    v: `RentHack Deal Analysis — ${deal.address || 'Untitled'}`,
    t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 14 },
         fill: { fgColor: { rgb: NAVY } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  };
  // Merge title across A:E (cols 0-4)
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  // Sub-title row
  row = 2;
  const preparer = user?.user_metadata?.display_name || user?.email || '';
  const orgLine = user?.user_metadata?.organization ? ` · ${user.user_metadata.organization}` : '';
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = {
    v: `Generated ${dateStr}${preparer ? ' · Prepared by ' + preparer + orgLine : ''}  |  For informational purposes only. Not financial advice.`,
    t: 's',
    s: { font: { italic: true, color: { rgb: SLATE }, sz: 9 },
         fill: { fgColor: { rgb: CREAM } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  };
  ws1['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });
  row = 3; // blank separator

  // ── Section: Key Returns ─────────────────────────────────────────────────
  row = 4;
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = subHdrCell('KEY RETURNS');
  ws1['!merges'].push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: 4 } });
  row++;

  const returnRows = [
    ['IRR (10-Year)',      r.irr,                  PCT1,  true],
    ['Equity Multiple',   r.equityMultiple,        X2,    true],
    ['Cash-on-Cash Yr 1', r.cocReturn,             PCT1,  true],
    ['Cap Rate (Yr 1)',   r.capRate,               PCT1,  false],
    ['DSCR (Yr 1)',       r.dscr,                  NUM2,  false],
    ['Break-Even Occ.',   r.breakEvenOccupancy,    PCT1,  false],
  ];
  returnRows.forEach(([lbl, val, fmt, accent]) => {
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = labelCell(lbl);
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 1 })] = accent ? accentCell(val, fmt) : valCell(val, fmt);
    ws1['!merges'].push({ s: { r: row-1, c: 1 }, e: { r: row-1, c: 2 } });
    row++;
  });

  row++; // gap

  // ── Section: Financing ───────────────────────────────────────────────────
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = subHdrCell('FINANCING');
  ws1['!merges'].push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: 4 } });
  row++;

  const pp = +a.purchasePrice || 0;
  const finRows = [
    ['Purchase Price',     pp,                                            USD],
    ['Down Payment ($)',   pp - r.loanAmt,                               USD],
    ['Down Payment (%)',   pp > 0 ? (pp - r.loanAmt) / pp : 0,          PCT1],
    ['Loan Amount',        r.loanAmt,                                    USD],
    ['Interest Rate',      (+a.interestRate || 0) / 100,                 PCT1],
    ['Amortization',       (+a.amortYears || 30) + ' years',             null],
    ['LTV',               pp > 0 ? r.loanAmt / pp : 0,                  PCT1],
    ['Monthly P&I',       r.monthlyPayment,                             USD],
    ['Annual Debt Service', r.annualDebtService,                        USD],
    ['Closing Costs',     r.closingCostsTotal,                          USD],
    ['Seller Concessions', +a.sellerConcessions || 0,                   USD],
    ['PMI (Monthly)',     +a.pmi || 0,                                   USD],
    ['Total Cash In',     r.totalCash,                                   USD],
  ];
  finRows.forEach(([lbl, val, fmt]) => {
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = labelCell(lbl);
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 1 })] = valCell(typeof val === 'number' ? val : val, fmt || undefined);
    ws1['!merges'].push({ s: { r: row-1, c: 1 }, e: { r: row-1, c: 2 } });
    row++;
  });

  row++; // gap

  // ── Section: Income & Expenses ───────────────────────────────────────────
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = subHdrCell('INCOME & EXPENSES (YEAR 1)');
  ws1['!merges'].push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: 4 } });
  row++;

  const incRows = [
    ['Gross Rent (Annual)',       r.grossRentYear0,              USD,  false],
    ['Vacancy Rate',              +a.vacancyRate / 100 || 0.05, PCT1, false],
    ['Vacancy Loss',              yr1.vacancyLoss,               USD,  false],
    ['Effective Gross Income',    yr1.egi,                       USD,  false],
    ['Property Tax',              expBrk.propertyTax || 0,       USD,  false],
    ['Insurance',                 expBrk.insurance || 0,         USD,  false],
    ['Maintenance',               expBrk.maintenance || 0,       USD,  false],
    ['CapEx Reserve',             expBrk.capex || 0,             USD,  false],
    ['Property Management',       expBrk.propertyMgmt || 0,      USD,  false],
    ['Utilities',                 expBrk.utilities || 0,         USD,  false],
    ['Total Operating Expenses',  r.baseExpenses,                USD,  false],
    ['Expense Ratio',             yr1.egi > 0 ? r.baseExpenses / yr1.egi : 0, PCT1, false],
    ['Net Operating Income',      r.noi,                         USD,  true],
    ['Debt Service',              r.annualDebtService,           USD,  false],
    ['Annual Cash Flow',          yr1.cashFlow,                  USD,  true],
    ['Monthly Cash Flow',         yr1.monthlyCashFlow,           USD,  true],
  ];
  incRows.forEach(([lbl, val, fmt, accent]) => {
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = labelCell(lbl);
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 1 })] = accent ? accentCell(val, fmt) : valCell(val, fmt);
    ws1['!merges'].push({ s: { r: row-1, c: 1 }, e: { r: row-1, c: 2 } });
    row++;
  });

  row++; // gap

  // ── Section: Exit Analysis ───────────────────────────────────────────────
  ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = subHdrCell('EXIT ANALYSIS (YEAR 10)');
  ws1['!merges'].push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: 4 } });
  row++;

  const exitRows = [
    ['Projected Exit Value',      r.exitValue,           USD,  false],
    ['Remaining Loan Balance',    r.exitLoanBalance,     USD,  false],
    ['Total Gain on Sale',        r.totalGainOnSale,     USD,  false],
    ['Capital Gains Tax',         r.capitalGainsTax,     USD,  false],
    ['Net Proceeds',              r.netProceeds,         USD,  true],
    ['Cumulative Cash Flows',     r.years.reduce((s,y) => s + (y.cashFlow||0), 0), USD, false],
    ['Total Return',              r.netProceeds + r.years.reduce((s,y) => s + (y.cashFlow||0), 0), USD, true],
  ];
  exitRows.forEach(([lbl, val, fmt, accent]) => {
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = labelCell(lbl);
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 1 })] = accent ? accentCell(val, fmt) : valCell(val, fmt);
    ws1['!merges'].push({ s: { r: row-1, c: 1 }, e: { r: row-1, c: 2 } });
    row++;
  });

  // FHA Self-Sufficiency if applicable
  if (r.fhaSelfSufficiency?.applies) {
    row++;
    ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = subHdrCell('FHA SELF-SUFFICIENCY TEST');
    ws1['!merges'].push({ s: { r: row-1, c: 0 }, e: { r: row-1, c: 4 } });
    row++;
    const fha = r.fhaSelfSufficiency;
    const fhaRows = [
      ['Gross Rents (All Units)', fha.grossRentAllUnits, USD],
      ['75% Threshold',           fha.threshold75Pct,    USD],
      ['PITI (Annual)',            fha.pitiAnnual,        USD],
      ['Surplus / (Shortfall)',    fha.delta,             USD],
      ['Result',                  fha.passes ? 'PASS ✓' : 'FAIL ✗', null],
    ];
    fhaRows.forEach(([lbl, val, fmt]) => {
      ws1[XLSX.utils.encode_cell({ r: row-1, c: 0 })] = labelCell(lbl);
      const cell = fmt ? (fha.passes ? accentCell(val, fmt) : valCell(val, fmt)) : {
        v: val, t: 's',
        s: { font: { bold: true, color: { rgb: fha.passes ? TEAL : 'DC2626' }, sz: 11 },
             fill: { fgColor: { rgb: fha.passes ? LIGHT_TEAL : 'FEF2F2' } },
             alignment: { horizontal: 'right' } }
      };
      ws1[XLSX.utils.encode_cell({ r: row-1, c: 1 })] = cell;
      ws1['!merges'].push({ s: { r: row-1, c: 1 }, e: { r: row-1, c: 2 } });
      row++;
    });
  }

  // Set sheet range and column widths
  ws1['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 4 } });
  ws1['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 4 }, { wch: 4 }, { wch: 4 }];
  ws1['!rows'] = [{ hpt: 28 }, { hpt: 18 }];  // title rows taller
  ws1['!freeze'] = { xSplit: 0, ySplit: 3 };
  XLSX.utils.book_append_sheet(wb, ws1, 'Deal Summary');

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 2: 10-Year Projection
  // ──────────────────────────────────────────────────────────────────────────
  const ws2 = {};
  const YRS = r.years.length; // 10
  const COL_OFFSET = 1;       // col 0 = row label, cols 1-10 = years

  // Sheet title
  ws2[XLSX.utils.encode_cell({ r: 0, c: 0 })] = {
    v: `10-Year Cash Flow Projection — ${deal.address || ''}`,
    t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 13 },
         fill: { fgColor: { rgb: NAVY } },
         alignment: { horizontal: 'left', vertical: 'center' } }
  };
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: YRS } }];

  // Year headers
  ws2[XLSX.utils.encode_cell({ r: 1, c: 0 })] = hdrCell('');
  r.years.forEach((y, i) => {
    ws2[XLSX.utils.encode_cell({ r: 1, c: i + COL_OFFSET })] = numHdrCell(`Yr ${y.yr}`);
  });

  // Row definitions: [label, field, format, isAccent, isSection]
  const cfRowDefs = [
    { section: 'INCOME' },
    { label: 'Gross Rent',         field: 'grossRent',       fmt: USD },
    { label: 'Vacancy Loss',       field: 'vacancyLoss',     fmt: USD },
    { label: 'Eff. Gross Income',  field: 'egi',             fmt: USD,  accent: false, bold: true },
    { section: 'EXPENSES & NOI' },
    { label: 'Operating Expenses', field: 'expenses',        fmt: USD },
    { label: 'Net Op. Income',     field: 'noi',             fmt: USD,  accent: true },
    { section: 'CASH FLOW' },
    { label: 'Debt Service',       field: 'debtService',     fmt: USD },
    { label: 'Cash Flow',          field: 'cashFlow',        fmt: USD,  accent: true },
    { label: 'After-Tax CF',       field: 'afterTaxCashFlow',fmt: USD },
    { section: 'RETURNS' },
    { label: 'Cash-on-Cash',       field: 'cocReturn',       fmt: PCT1 },
    { label: 'Cap Rate',           field: 'capRate',         fmt: PCT1 },
    { label: 'DSCR',               field: 'dscr',            fmt: '0.00x' },
    { section: 'EQUITY & VALUE' },
    { label: 'Property Value',     field: 'propertyValue',   fmt: USD },
    { label: 'Loan Balance',       field: 'balance',         fmt: USD },
    { label: 'Equity',             field: 'equity',          fmt: USD,  accent: true },
    { section: 'TAX' },
    { label: 'Depreciation',       field: 'depreciation',    fmt: USD },
    { label: 'Tax Effect',         field: 'taxEffect',       fmt: USD },
    { label: 'Principal Paydown',  field: 'principalPaydown',fmt: USD },
  ];

  let cfRow = 2;
  const ws2merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: YRS } }];

  cfRowDefs.forEach(def => {
    if (def.section) {
      // Section header row spans all columns
      ws2[XLSX.utils.encode_cell({ r: cfRow, c: 0 })] = subHdrCell(def.section);
      for (let ci = 1; ci <= YRS; ci++) {
        ws2[XLSX.utils.encode_cell({ r: cfRow, c: ci })] = {
          v: '', t: 's',
          s: { fill: { fgColor: { rgb: TEAL } } }
        };
      }
      ws2merges.push({ s: { r: cfRow, c: 0 }, e: { r: cfRow, c: 0 } });
      cfRow++;
      return;
    }
    // Row label
    ws2[XLSX.utils.encode_cell({ r: cfRow, c: 0 })] = rowHdrCell(def.label, def.accent);
    // Year values
    r.years.forEach((y, i) => {
      const v = y[def.field];
      const cell = def.accent
        ? accentCell(v ?? 0, def.fmt)
        : cfNumCell(v ?? 0, def.fmt, def.bold);
      ws2[XLSX.utils.encode_cell({ r: cfRow, c: i + COL_OFFSET })] = cell;
    });
    cfRow++;
  });

  ws2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cfRow, c: YRS } });
  ws2['!merges'] = ws2merges;
  ws2['!cols'] = [{ wch: 22 }, ...Array(YRS).fill({ wch: 12 })];
  ws2['!rows'] = [{ hpt: 24 }];
  ws2['!freeze'] = { xSplit: 1, ySplit: 2 };  // freeze row labels + year headers
  XLSX.utils.book_append_sheet(wb, ws2, '10-Year Projection');

  // ──────────────────────────────────────────────────────────────────────────
  // SHEET 3: Assumptions
  // ──────────────────────────────────────────────────────────────────────────
  const ws3 = {};
  let ar = 1;
  const ws3merges = [];

  const aHdr = (label) => {
    ws3[XLSX.utils.encode_cell({ r: ar-1, c: 0 })] = subHdrCell(label);
    ws3merges.push({ s: { r: ar-1, c: 0 }, e: { r: ar-1, c: 2 } });
    ar++;
  };
  const aRow = (lbl, val, fmt) => {
    ws3[XLSX.utils.encode_cell({ r: ar-1, c: 0 })] = labelCell(lbl);
    ws3[XLSX.utils.encode_cell({ r: ar-1, c: 1 })] = valCell(val, fmt);
    ar++;
  };

  // Title
  ws3[XLSX.utils.encode_cell({ r: 0, c: 0 })] = {
    v: `Assumptions — ${deal.address || ''}`,
    t: 's',
    s: { font: { bold: true, color: { rgb: WHITE }, sz: 13 },
         fill: { fgColor: { rgb: NAVY } },
         alignment: { horizontal: 'left' } }
  };
  ws3merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });
  ar = 2;

  ar++; // gap
  aHdr('PROPERTY');
  aRow('Address',       deal.address || '');
  aRow('Status',        deal.status || '');
  aRow('Num. Units',    +a.numUnits || 2);
  aRow('Beds (total)',  +a.beds || 0);
  aRow('Baths (total)', +a.baths || 0);
  aRow('Sq Footage',   +a.sqftTotal || 0);
  aRow('Year Built',   +a.yearBuilt || 0);
  aRow('Owner Occupied', a.ownerOccupied ? 'Yes' : 'No');
  if (a.ownerOccupied) {
    aRow('Owner Unit',       +a.ownerUnit + 1);
    aRow('OO Duration (yrs)',+a.ownerOccupancyYears || 0);
    aRow('Alt. Rent (mo)',   +a.alternativeRent || 0, USD);
  }

  ar++;
  aHdr('FINANCING');
  aRow('Purchase Price',    +a.purchasePrice || 0,         USD);
  aRow('Down Payment %',    (+a.downPaymentPct || 25) / 100, PCT1);
  aRow('Interest Rate',     (+a.interestRate || 7) / 100,   PCT1);
  aRow('Amortization (yrs)',+a.amortYears || 30);
  aRow('Seller Concessions',+a.sellerConcessions || 0,      USD);
  aRow('Closing Costs',     r.closingCostsTotal,            USD);
  aRow('PMI (monthly)',     +a.pmi || 0,                    USD);

  ar++;
  aHdr('UNIT RENTS');
  const units = (a.units || []).slice(0, +a.numUnits || 2);
  units.forEach((u, i) => {
    const isOwner = a.ownerOccupied && +a.ownerUnit === i;
    aRow(`Unit ${i+1} Rent${isOwner ? ' (Owner)' : ''}`, +(u.rent || u.listedRent) || 0, USD);
  });
  aRow('Total Annual Rent', r.grossRentYear0, USD);

  ar++;
  aHdr('GROWTH & ANALYSIS');
  aRow('Vacancy Rate',       (+a.vacancyRate || 5) / 100,     PCT1);
  aRow('Rent Growth / yr',   (+a.rentGrowth || 3) / 100,      PCT1);
  aRow('Expense Growth / yr',(+a.expenseGrowth || 3) / 100,   PCT1);
  aRow('Appreciation / yr',  (+a.appreciationRate || 4) / 100, PCT1);
  aRow('Tax Bracket',        (+a.taxBracket || 24) / 100,      PCT1);

  ar++;
  aHdr('EXPENSES (ANNUAL)');
  aRow('Property Tax',       expBrk.propertyTax || 0,  USD);
  aRow('Insurance',          expBrk.insurance || 0,    USD);
  aRow('Maintenance',        expBrk.maintenance || 0,  USD);
  aRow('CapEx Reserve',      expBrk.capex || 0,        USD);
  aRow('Property Management',expBrk.propertyMgmt || 0, USD);
  aRow('Utilities',          expBrk.utilities || 0,    USD);
  aRow('Total Expenses',     r.baseExpenses,            USD);

  if (a.refi?.enabled) {
    ar++;
    aHdr('REFINANCE SCENARIO');
    aRow('Refi Year',     +a.refi.year || 5);
    aRow('New Rate',      (+a.refi.newRate || 6) / 100, PCT1);
    aRow('New LTV',       (+a.refi.newLTV || 75) / 100, PCT1);
  }

  if (a.valueAdd?.enabled) {
    ar++;
    aHdr('VALUE-ADD SCENARIO');
    aRow('Reno Cost',         +a.valueAdd.reModelCost || 0,    USD);
    aRow('Rent Bump / Unit',  +a.valueAdd.rentBumpPerUnit || 0, USD);
    aRow('Units Renovated',   +a.valueAdd.unitsRenovated || 0);
    aRow('Completion Year',   +a.valueAdd.completionYear || 1);
    aRow('IRR w/o VA',        r.irrWithoutVA,                   PCT1);
    aRow('IRR with VA',       r.irrWithVA,                      PCT1);
  }

  ws3['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ar+1, c: 2 } });
  ws3['!merges'] = ws3merges;
  ws3['!cols'] = [{ wch: 26 }, { wch: 18 }, { wch: 4 }];
  ws3['!rows'] = [{ hpt: 24 }];
  ws3['!freeze'] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(wb, ws3, 'Assumptions');

  // ──────────────────────────────────────────────────────────────────────────
  // Write & download
  // ──────────────────────────────────────────────────────────────────────────
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob  = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url   = URL.createObjectURL(blob);
  const a2    = document.createElement('a');
  a2.href     = url;
  a2.download = `renthack_${safeName}.xlsx`;
  document.body.appendChild(a2);
  a2.click();
  document.body.removeChild(a2);
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
