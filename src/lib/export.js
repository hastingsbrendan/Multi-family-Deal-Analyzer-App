// ─── CSV export helpers ──────────────────────────────────────────────────────
import { calcDeal } from './calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from './constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function exportPortfolioCSV(deals){const hdr=["Address","Status","Purchase Price","Cash In","NOI (Yr1)","CoC (Yr1)","Cap Rate","IRR (10yr)","Equity Multiple","DSCR (Yr1)"];const rows=deals.map(d=>{const r=calcDeal(d);return[d.address,d.status,d.assumptions.purchasePrice,Math.round(r.totalCash),Math.round(r.noi),(r.cocReturn*100).toFixed(2)+"%",(r.capRate*100).toFixed(2)+"%",(r.irr*100).toFixed(2)+"%",r.equityMultiple.toFixed(2)+"x",r.dscr.toFixed(2)];});dlFile([hdr,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),"portfolio_summary.csv","text/csv");}
function exportDealCSV(deal){const r=calcDeal(deal);const rows=[["DEAL: "+deal.address],[],["Metric","Value"],["Purchase Price",FMT_USD(+deal.assumptions.purchasePrice)],["Total Cash",FMT_USD(r.totalCash)],["NOI (Yr1)",FMT_USD(r.noi)],["CoC (Yr1)",FMT_PCT(r.cocReturn)],["IRR",FMT_PCT(r.irr)],["DSCR",r.dscr.toFixed(2)],[],["Year","Gross Rent","Vacancy","EGI","Expenses","NOI","Debt Svc","Cash Flow","Tax Effect","After-Tax CF","Equity"],...r.years.map(y=>[y.yr,Math.round(y.grossRent),Math.round(y.vacancyLoss),Math.round(y.egi),Math.round(y.expenses),Math.round(y.noi),Math.round(y.debtService),Math.round(y.cashFlow),Math.round(y.taxEffect),Math.round(y.afterTaxCashFlow),Math.round(y.equity)])];dlFile(rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),`deal_${(deal.address||deal.id).toString().replace(/\s/g,"_")}.csv`,"text/csv");}
function dlFile(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportDealPDF(deal, user) {
  const r = calcDeal(deal);
  const a = deal.assumptions;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  // ── Palette ──
  const TEAL   = [13, 148, 136];
  const DARK   = [15, 23, 42];
  const MUTED  = [100, 116, 139];
  const BORDER = [226, 232, 240];
  const WHITE  = [255, 255, 255];
  const CARD   = [248, 250, 252];

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = 40, R = W - 40;

  const fmt$ = v => v == null ? '—' : FMT_USD(Math.round(v));
  const fmtPct = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
  const fmtX = v => v == null ? '—' : v.toFixed(2) + 'x';
  const fmtNum = v => v == null ? '—' : Number(v).toLocaleString();

  // ── Preparer info from user profile ──
  const preparerName = user?.user_metadata?.display_name || user?.email || '';
  const preparerOrg  = user?.user_metadata?.organization || '';

  // ── PAGE 1 ── Header ─────────────────────────────────────────────────────
  // Thin teal top accent bar
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 4, 'F');

  // White background header area
  doc.setFillColor(...WHITE);
  doc.rect(0, 4, W, 68, 'F');

  // RentHack split-color wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text('Rent', L, 38);
  const rentW = doc.getTextWidth('Rent');
  doc.setTextColor(...TEAL);
  doc.text('Hack', L + rentW, 38);

  // Report label below wordmark
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('DEAL ANALYSIS REPORT', L, 54);

  // Date + preparer top-right
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(dateStr, R, 34, { align: 'right' });
  if (preparerName) {
    const preparerLine = preparerOrg ? `${preparerName}  ·  ${preparerOrg}` : preparerName;
    doc.text(`Prepared by: ${preparerLine}`, R, 48, { align: 'right' });
  }
  if (deal.status) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEAL);
    doc.text(deal.status.toUpperCase(), R, 62, { align: 'right' });
  }

  // Divider line under header
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(L, 72, R, 72);

  // ── Address ──
  let y = 96;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text(deal.address || 'Untitled Property', L, y);

  // Property sub-details line
  y += 18;
  const detailParts = [
    a.numUnits ? `${a.numUnits} Units` : null,
    a.beds ? `${a.beds} BD` : null,
    a.baths ? `${a.baths} BA` : null,
    a.sqftTotal ? `${fmtNum(a.sqftTotal)} SF` : null,
    a.yearBuilt ? `Built ${a.yearBuilt}` : null,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(detailParts.join('  ·  '), L, y);

  // ── Divider ──
  y += 14;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(L, y, R, y);

  // ── Key Metrics — 3 across top row ──
  y += 20;
  const metrics1 = [
    { label: 'Purchase Price',   value: fmt$(+a.purchasePrice) },
    { label: 'Total Cash In',    value: fmt$(r.totalCash) },
    { label: 'NOI (Year 1)',     value: fmt$(r.noi) },
  ];
  const metrics2 = [
    { label: 'Cap Rate',         value: fmtPct(r.capRate) },
    { label: 'CoC Return (Yr1)', value: fmtPct(r.cocReturn) },
    { label: 'DSCR (Yr1)',       value: r.dscr > 0 ? r.dscr.toFixed(2) + 'x' : '—' },
  ];
  const metrics3 = [
    { label: 'IRR (10-Year)',    value: fmtPct(r.irr) },
    { label: 'Equity Multiple',  value: fmtX(r.equityMultiple) },
    { label: 'Break-Even Occ.', value: r.breakEvenOccupancy > 0 ? fmtPct(r.breakEvenOccupancy) : '—' },
  ];

  const colW = (R - L) / 3;
  const drawMetricCard = (metrics, col) => {
    const cx = L + col * colW;
    doc.setFillColor(...CARD);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(cx, y, colW - 8, 80, 4, 4, 'FD');
    metrics.forEach((m, i) => {
      const my = y + 18 + i * 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(m.label.toUpperCase(), cx + 10, my);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...DARK);
      doc.text(m.value, cx + 10, my + 12);
    });
  };
  drawMetricCard(metrics1, 0);
  drawMetricCard(metrics2, 1);
  drawMetricCard(metrics3, 2);

  y += 94;

  // ── Financing & Income Summary ──
  const col2W = (R - L - 12) / 2;

  // Left: Financing
  doc.setFillColor(...CARD);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.roundedRect(L, y, col2W, 130, 4, 4, 'FD');
  doc.setFillColor(...TEAL);
  doc.rect(L, y, col2W, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('FINANCING', L + 10, y + 15);

  const finRows = [
    ['Loan Amount',    fmt$(r.loanAmt)],
    ['Monthly P&I',   fmt$(r.monthlyPayment)],
    ['Annual Debt Svc', fmt$(r.annualDebtService)],
    ['Down Payment',   fmt$(+a.purchasePrice - r.loanAmt)],
    ['LTV',           a.purchasePrice > 0 ? fmtPct(r.loanAmt / +a.purchasePrice) : '—'],
  ];
  finRows.forEach(([lbl, val], i) => {
    const fy = y + 36 + i * 19;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(lbl, L + 10, fy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(val, L + col2W - 10, fy, { align: 'right' });
    if (i < finRows.length - 1) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(L + 10, fy + 6, L + col2W - 10, fy + 6);
    }
  });

  // Right: Income & Expenses
  const rx = L + col2W + 12;
  doc.setFillColor(...CARD);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.roundedRect(rx, y, col2W, 130, 4, 4, 'FD');
  doc.setFillColor(...TEAL);
  doc.rect(rx, y, col2W, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('INCOME & EXPENSES (YR 1)', rx + 10, y + 15);

  const expBrk = r.baseExpBreakdown || {};
  const incRows = [
    ['Gross Rent',     fmt$(r.grossRentYear0)],
    ['Vacancy Loss',   fmt$(r.years[0]?.vacancyLoss)],
    ['EGI',           fmt$(r.years[0]?.egi)],
    ['Total Expenses', fmt$(r.baseExpenses)],
    ['NOI',           fmt$(r.noi)],
  ];
  incRows.forEach(([lbl, val], i) => {
    const fy = y + 36 + i * 19;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(lbl, rx + 10, fy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(lbl === 'NOI' ? TEAL[0] : DARK[0], lbl === 'NOI' ? TEAL[1] : DARK[1], lbl === 'NOI' ? TEAL[2] : DARK[2]);
    doc.text(val, rx + col2W - 10, fy, { align: 'right' });
    if (i < incRows.length - 1) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(rx + 10, fy + 6, rx + col2W - 10, fy + 6);
    }
  });

  y += 144;

  // ── Unit Rent Schedule ──
  if (a.units && a.numUnits > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text('UNIT RENT SCHEDULE', L, y);
    y += 8;
    const unitHead = [['Unit', 'Beds', 'Baths', 'Monthly Rent', 'Annual Rent']];
    const unitRows = a.units.slice(0, a.numUnits).map((u, i) => [
      `Unit ${i + 1}`,
      u.beds || '—',
      u.baths || '—',
      fmt$(+(u.rent || u.listedRent) || 0),
      fmt$((+(u.rent || u.listedRent) || 0) * 12),
    ]);
    autoTable(doc, {
      startY: y, head: unitHead, body: unitRows,
      margin: { left: L, right: 40 },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: DARK },
      alternateRowStyles: { fillColor: CARD },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ── Expense Breakdown ──
  const expRows2 = [
    ['Property Tax', expBrk.propertyTax],
    ['Insurance', expBrk.insurance],
    ['Maintenance', expBrk.maintenance],
    ['CapEx', expBrk.capex],
    ['Property Mgmt', expBrk.propertyMgmt],
    ['Utilities', expBrk.utilities],
  ].filter(([, v]) => v > 0);

  if (expRows2.length > 0 && y < H - 120) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text('EXPENSE BREAKDOWN (YR 1)', L, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Expense', 'Annual', '% of EGI']],
      body: expRows2.map(([lbl, val]) => [
        lbl,
        fmt$(val),
        r.years[0]?.egi > 0 ? fmtPct(val / r.years[0].egi) : '—',
      ]),
      margin: { left: L, right: 40 },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: DARK },
      alternateRowStyles: { fillColor: CARD },
      theme: 'grid',
    });
  }

  // ── Footer p1 ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Generated by RentHack · renthack.io · For informational purposes only. Not financial advice.', W / 2, H - 18, { align: 'center' });
  doc.text('1', R, H - 18, { align: 'right' });

  // ── PAGE 2 — 10-Year Cash Flow Table ─────────────────────────────────────
  doc.addPage();

  // Header strip — matches page 1 style
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 4, 'F');
  doc.setFillColor(...WHITE);
  doc.rect(0, 4, W, 36, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text('10-Year Cash Flow Projection', L, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(deal.address || '', R, 28, { align: 'right' });
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(L, 40, R, 40);

  const cfHead = [['', 'Yr 1','Yr 2','Yr 3','Yr 4','Yr 5','Yr 6','Yr 7','Yr 8','Yr 9','Yr 10']];
  const cfRows = [
    ['Gross Rent',   ...r.years.map(y => fmt$(y.grossRent))],
    ['Vacancy Loss', ...r.years.map(y => fmt$(y.vacancyLoss))],
    ['EGI',         ...r.years.map(y => fmt$(y.egi))],
    ['Expenses',    ...r.years.map(y => fmt$(y.expenses))],
    ['NOI',         ...r.years.map(y => fmt$(y.noi))],
    ['Debt Service',...r.years.map(y => fmt$(y.debtService))],
    ['Cash Flow',   ...r.years.map(y => fmt$(y.cashFlow))],
    ['CoC Return',  ...r.years.map(y => fmtPct(y.cocReturn))],
    ['Cap Rate',    ...r.years.map(y => fmtPct(y.capRate))],
    ['DSCR',        ...r.years.map(y => y.dscr.toFixed(2))],
    ['Equity',      ...r.years.map(y => fmt$(y.equity))],
    ['Prop. Value', ...r.years.map(y => fmt$(y.propertyValue))],
  ];

  autoTable(doc, {
    startY: 54,
    head: cfHead,
    body: cfRows,
    margin: { left: L, right: 40 },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5, halign: 'right' },
    bodyStyles: { fontSize: 7.5, textColor: DARK, halign: 'right' },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', textColor: MUTED, cellWidth: 68 } },
    alternateRowStyles: { fillColor: CARD },
    // Highlight key rows
    didParseCell: (data) => {
      if (data.section === 'body') {
        const label = cfRows[data.row.index]?.[0];
        if (label === 'NOI' || label === 'Cash Flow') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = TEAL;
        }
      }
    },
    theme: 'grid',
  });

  // Footer p2
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Generated by RentHack · renthack.io · For informational purposes only. Not financial advice.', W / 2, H - 18, { align: 'center' });
  doc.text('2', R, H - 18, { align: 'right' });

  // ── Save ──
  const safeName = (deal.address || deal.id || 'deal').toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`renthack_${safeName}.pdf`);
}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

export { exportPortfolioCSV, exportDealCSV, exportDealPDF, dlFile };
