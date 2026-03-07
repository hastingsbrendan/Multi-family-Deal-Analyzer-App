// ─── CSV export helpers ──────────────────────────────────────────────────────
import { calcDeal } from './calc';
import { FMT_USD, FMT_PCT, STATUS_OPTIONS } from './constants';

function exportPortfolioCSV(deals){const hdr=["Address","Status","Purchase Price","Cash In","NOI (Yr1)","CoC (Yr1)","Cap Rate","IRR (10yr)","Equity Multiple","DSCR (Yr1)"];const rows=deals.map(d=>{const r=calcDeal(d);return[d.address,d.status,d.assumptions.purchasePrice,Math.round(r.totalCash),Math.round(r.noi),(r.cocReturn*100).toFixed(2)+"%",(r.capRate*100).toFixed(2)+"%",(r.irr*100).toFixed(2)+"%",r.equityMultiple.toFixed(2)+"x",r.dscr.toFixed(2)];});dlFile([hdr,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),"portfolio_summary.csv","text/csv");}
function exportDealCSV(deal){const r=calcDeal(deal);const rows=[["DEAL: "+deal.address],[],["Metric","Value"],["Purchase Price",FMT_USD(+deal.assumptions.purchasePrice)],["Total Cash",FMT_USD(r.totalCash)],["NOI (Yr1)",FMT_USD(r.noi)],["CoC (Yr1)",FMT_PCT(r.cocReturn)],["IRR",FMT_PCT(r.irr)],["DSCR",r.dscr.toFixed(2)],[],["Year","Gross Rent","Vacancy","EGI","Expenses","NOI","Debt Svc","Cash Flow","Tax Effect","After-Tax CF","Equity"],...r.years.map(y=>[y.yr,Math.round(y.grossRent),Math.round(y.vacancyLoss),Math.round(y.egi),Math.round(y.expenses),Math.round(y.noi),Math.round(y.debtService),Math.round(y.cashFlow),Math.round(y.taxEffect),Math.round(y.afterTaxCashFlow),Math.round(y.equity)])];dlFile(rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n"),`deal_${(deal.address||deal.id).toString().replace(/\s/g,"_")}.csv`,"text/csv");}
function dlFile(content,filename,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

export { exportPortfolioCSV, exportDealCSV, dlFile };
