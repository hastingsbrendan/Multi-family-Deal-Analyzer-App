import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub Supabase client (calc.js imports it at module load)
vi.mock('../constants', async () => {
  const actual = await vi.importActual('../constants');
  return {
    ...actual,
    sbClient: { auth: { getUser: vi.fn() } },
    sbWriteDeal: vi.fn(),
  };
});

// Mock jsPDF to avoid filesystem writes during tests. We still want every
// export pipeline to run end-to-end, so we provide a minimal stub that
// supports the chained API surface jsPDF + autoTable use.
vi.mock('jspdf', () => {
  class JsPDFStub {
    constructor() {
      this.internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
      this.lastAutoTable = { finalY: 100 };
    }
  }
  // No-op every method that the export code calls
  const NOOPS = ['setFont','setFontSize','setTextColor','setFillColor','setDrawColor','setLineWidth','rect','roundedRect','circle','line','text','addPage','addImage','save','setProperties','splitTextToSize','getTextWidth','getStringUnitWidth'];
  for (const m of NOOPS) JsPDFStub.prototype[m] = function () { return m === 'splitTextToSize' ? [''] : (m === 'getTextWidth' || m === 'getStringUnitWidth' ? 50 : this); };
  return { default: JsPDFStub };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc) => { doc.lastAutoTable = { finalY: 100 }; }),
}));

// jsPDF / xlsx-js-style both touch the DOM. Stub the surface they actually use
// so node-environment Vitest doesn't crash. We don't ship jsdom — keeping
// dependencies lean — and these tests only assert the pipelines run without
// throwing, not that real files appear on disk.
beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  global.Blob = global.Blob || class Blob { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  global.document = {
    createElement: () => ({
      href: '', download: '', target: '', rel: '',
      style: {}, click: () => {}, setAttribute: () => {}, appendChild: () => {}, removeChild: () => {},
    }),
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  if (!global.window) global.window = { location: { href: '' } };
});

import { newDeal } from '../calc';
import {
  exportPortfolioXLSX,
  exportDealXLSX,
  exportDealPDF,
} from '../export';

function makeDeal() {
  const d = newDeal();
  d.address = '123 Test St, Chicago, IL 60601';
  d.status = 'Reviewing';
  d.assumptions.purchasePrice = 450000;
  d.assumptions.downPaymentPct = 25;
  d.assumptions.interestRate = 7;
  d.assumptions.numUnits = 2;
  d.assumptions.units[0].rent = 1500;
  d.assumptions.units[1].rent = 1500;
  return d;
}

const fakeUser = { email: 'test@example.com', user_metadata: { display_name: 'Test User' } };

describe('export pipeline (smoke tests)', () => {
  it('exportPortfolioXLSX runs to completion without throwing', () => {
    const deals = [makeDeal(), makeDeal()];
    expect(() => exportPortfolioXLSX(deals, fakeUser)).not.toThrow();
  });

  it('exportPortfolioXLSX handles empty portfolio', () => {
    expect(() => exportPortfolioXLSX([], fakeUser)).not.toThrow();
  });

  it('exportPortfolioXLSX handles null user (CSV fallback path)', () => {
    expect(() => exportPortfolioXLSX([makeDeal()], null)).not.toThrow();
  });

  it('exportDealXLSX runs to completion without throwing', () => {
    expect(() => exportDealXLSX(makeDeal(), fakeUser)).not.toThrow();
  });

  it('exportDealXLSX handles owner-occupied deal', () => {
    const d = makeDeal();
    d.assumptions.ownerOccupied = true;
    d.assumptions.ownerUnit = 0;
    d.assumptions.alternativeRent = 1800;
    expect(() => exportDealXLSX(d, fakeUser)).not.toThrow();
  });

  it('exportDealPDF runs to completion without throwing', () => {
    expect(() => exportDealPDF(makeDeal(), fakeUser)).not.toThrow();
  });

  it('exportDealPDF handles deal with no address', () => {
    const d = makeDeal();
    d.address = '';
    expect(() => exportDealPDF(d, fakeUser)).not.toThrow();
  });

  it('exportDealPDF handles refi-enabled deal', () => {
    const d = makeDeal();
    d.assumptions.refi = { enabled: true, year: 5, newRate: 6.5, newLTV: 75 };
    expect(() => exportDealPDF(d, fakeUser)).not.toThrow();
  });
});
