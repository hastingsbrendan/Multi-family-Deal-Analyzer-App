import React, { useState, useEffect, useCallback } from 'react';
import { RENTCAST_KEY, FMT_USD } from '../lib/constants';
import { useIsMobile } from '../lib/hooks';
import MetricCard from './ui/MetricCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ─── Census ACS variables we want ────────────────────────────────────────────
// B19013_001E = Median household income
// B25003_001E = Total occupied units
// B25003_002E = Owner occupied
// B25003_003E = Renter occupied
// B25002_001E = Total housing units
// B25002_003E = Vacant units
// B01002_001E = Median age
// B01003_001E = Total population
const CENSUS_VARS = 'B19013_001E,B25003_001E,B25003_002E,B25003_003E,B25002_001E,B25002_003E,B01002_001E,B01003_001E';

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px', fontFamily: "'Fraunces', serif" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function StatRow({ label, value, sub, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Section({ children, style }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 20px', ...style
    }}>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12 }}>{sub}</div>
    </div>
  );
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Extract zip code from address ───────────────────────────────────────────
function extractZip(address) {
  if (!address) return null;
  const m = address.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

// ─── Main component ───────────────────────────────────────────────────────────
function MarketTab({ deal }) {
  const isMobile = useIsMobile();
  const [marketData, setMarketData]   = useState(null);
  const [censusData, setCensusData]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [lastZip, setLastZip]         = useState(null);

  const zip = extractZip(deal?.address);

  const fetchAll = useCallback(async (zipCode) => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'X-Api-Key': RENTCAST_KEY, 'Accept': 'application/json' };

      // ── Rentcast /markets ──────────────────────────────────────────────────
      const mktRes = await fetch(
        `https://api.rentcast.io/v1/markets?zipCode=${zipCode}&dataType=All&historyMonths=12`,
        { headers }
      );
      if (!mktRes.ok) throw new Error(`Rentcast ${mktRes.status}: ${await mktRes.text()}`);
      const mkt = await mktRes.json();
      setMarketData(mkt);

      // ── Census ACS 5-year ─────────────────────────────────────────────────
      // No API key needed for Census
      const censusRes = await fetch(
        `https://api.census.gov/data/2023/acs/acs5?get=${CENSUS_VARS}&for=zip%20code%20tabulation%20area:${zipCode}`
      );
      if (censusRes.ok) {
        const raw = await censusRes.json();
        // raw[0] = headers, raw[1] = values
        if (raw.length >= 2) {
          const headers_ = raw[0];
          const vals = raw[1];
          const obj = {};
          headers_.forEach((h, i) => { obj[h] = vals[i]; });
          setCensusData(obj);
        }
      }
      setLastZip(zipCode);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch when zip changes
  useEffect(() => {
    if (zip && zip !== lastZip && !loading) {
      fetchAll(zip);
    }
  }, [zip, lastZip, loading, fetchAll]);

  // ── Derived census values ──────────────────────────────────────────────────
  const income       = censusData ? +censusData['B19013_001E'] : null;
  const totalOcc     = censusData ? +censusData['B25003_001E'] : null;
  const renterOcc    = censusData ? +censusData['B25003_003E'] : null;
  const totalUnits   = censusData ? +censusData['B25002_001E'] : null;
  const vacantUnits  = censusData ? +censusData['B25002_003E'] : null;
  const medianAge    = censusData ? +censusData['B01002_001E'] : null;
  const population   = censusData ? +censusData['B01003_001E'] : null;
  const renterPct    = totalOcc && renterOcc ? (renterOcc / totalOcc) * 100 : null;
  const vacancyPct   = totalUnits && vacantUnits ? (vacantUnits / totalUnits) * 100 : null;

  // ── Derived Rentcast rental values ────────────────────────────────────────
  const rd = marketData?.rentalData;
  const sd = marketData?.saleData;

  // Build trend chart data from history (most recent 12 months)
  const rentTrend = rd?.history
    ? Object.entries(rd.history)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, d]) => ({
          month: month.slice(0, 7), // YYYY-MM
          avg: Math.round(d.averageRent || 0),
          median: Math.round(d.medianRent || 0),
        }))
        .filter(d => d.avg > 0)
    : [];

  const saleTrend = sd?.history
    ? Object.entries(sd.history)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, d]) => ({
          month: month.slice(0, 7),
          avg: Math.round(d.averagePrice || 0),
          median: Math.round(d.medianPrice || 0),
        }))
        .filter(d => d.avg > 0)
    : [];

  // Bedroom breakdown for rental market
  const bedroomRents = rd?.dataByBedrooms
    ? Object.entries(rd.dataByBedrooms)
        .sort(([a], [b]) => +a - +b)
        .map(([beds, d]) => ({
          beds: beds === '0' ? 'Studio' : `${beds} BR`,
          avg: d.averageRent,
          median: d.medianRent,
          count: d.totalListings,
        }))
    : [];

  const fmtK = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : FMT_USD(v);

  // ── No address yet ─────────────────────────────────────────────────────────
  if (!zip) {
    return (
      <div style={{ padding: '16px 0' }}>
        <EmptyState icon="🗺️" title="Enter a property address" sub="Market data will load automatically once an address with a zip code is set." />
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Loading market data…</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Fetching Rentcast + Census data for ZIP {zip}</div>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: '16px 0' }}>
        <EmptyState icon="⚠️" title="Could not load market data" sub={error} />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => fetchAll(zip)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── No data loaded yet ─────────────────────────────────────────────────────
  if (!marketData && !censusData) {
    return (
      <div style={{ padding: '16px 0' }}>
        <EmptyState icon="📊" title="Market data not loaded" sub={`ZIP ${zip} detected. Click below to fetch market data.`} />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => fetchAll(zip)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 100, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Load Market Data
          </button>
        </div>
      </div>
    );
  }

  const gridStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', gap: 14 }
    : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

  return (
    <div style={{ padding: '16px 0' }}>

      {/* Header + refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}>
            Market Overview · ZIP {zip}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Rentcast market data · US Census ACS 2023
          </div>
        </div>
        <button
          onClick={() => fetchAll(zip)}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── TOP KPI STRIP ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {rd?.averageRent > 0 && (
          <MetricCard label="Avg Market Rent" value={FMT_USD(rd.averageRent)} sub={`Median ${FMT_USD(rd.medianRent)}`} highlight />
        )}
        {sd?.averagePrice > 0 && (
          <MetricCard label="Avg Sale Price" value={fmtK(sd.averagePrice)} sub={`Median ${fmtK(sd.medianPrice)}`} />
        )}
        {income > 0 && (
          <MetricCard label="Median HH Income" value={FMT_USD(income)} sub="Census ACS 2023" />
        )}
        {renterPct !== null && (
          <MetricCard label="Renter Occupied" value={`${renterPct.toFixed(0)}%`} sub="of occupied units" />
        )}
      </div>

      <div style={gridStyle}>

        {/* ── RENTAL MARKET ────────────────────────────────────────────────── */}
        {rd && (
          <Section>
            <SectionHeader title="🏘️ Rental Market" subtitle="Active rental listings · Rentcast" />

            {bedroomRents.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Avg Rent by Bedrooms</div>
                {bedroomRents.map(b => (
                  <div key={b.beds} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{b.beds}</div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      {b.count > 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{b.count} listings</div>}
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{b.avg ? FMT_USD(b.avg) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rd.averageRent > 0 && <StatRow label="Average Rent" value={FMT_USD(rd.averageRent)} />}
            {rd.medianRent > 0 && <StatRow label="Median Rent" value={FMT_USD(rd.medianRent)} />}
            {rd.averageRentPerSqFt > 0 && <StatRow label="Avg Rent / Sq Ft" value={`$${rd.averageRentPerSqFt.toFixed(2)}`} />}
            {rd.averageDaysOnMarket > 0 && <StatRow label="Avg Days on Market" value={`${Math.round(rd.averageDaysOnMarket)} days`} />}
            {rd.totalListings > 0 && <StatRow label="Active Listings" value={rd.totalListings.toLocaleString()} />}
          </Section>
        )}

        {/* ── SALE MARKET ──────────────────────────────────────────────────── */}
        {sd && (
          <Section>
            <SectionHeader title="🏷️ Sale Market" subtitle="Active sale listings · Rentcast" />
            {sd.averagePrice > 0 && <StatRow label="Average Price" value={fmtK(sd.averagePrice)} />}
            {sd.medianPrice > 0 && <StatRow label="Median Price" value={fmtK(sd.medianPrice)} />}
            {sd.averagePricePerSqFt > 0 && <StatRow label="Avg Price / Sq Ft" value={`$${Math.round(sd.averagePricePerSqFt)}`} />}
            {sd.averageDaysOnMarket > 0 && <StatRow label="Avg Days on Market" value={`${Math.round(sd.averageDaysOnMarket)} days`} />}
            {sd.totalListings > 0 && <StatRow label="Active Listings" value={sd.totalListings.toLocaleString()} />}
            {sd.newListings > 0 && <StatRow label="New This Month" value={sd.newListings.toLocaleString()} />}
          </Section>
        )}

        {/* ── NEIGHBORHOOD DEMOGRAPHICS ─────────────────────────────────────── */}
        {censusData && (
          <Section>
            <SectionHeader title="👥 Neighborhood Demographics" subtitle="US Census ACS 5-Year 2023" />
            {population > 0 && <StatRow label="Population" value={population.toLocaleString()} />}
            {medianAge > 0 && <StatRow label="Median Age" value={`${medianAge} yrs`} />}
            {income > 0 && <StatRow label="Median Household Income" value={FMT_USD(income)} accent />}
            {renterPct !== null && <StatRow label="Renter Occupied" value={`${renterPct.toFixed(1)}%`} sub="of occupied units" />}
            {vacancyPct !== null && <StatRow label="Vacancy Rate" value={`${vacancyPct.toFixed(1)}%`} sub="all housing units" />}
            {totalUnits > 0 && <StatRow label="Total Housing Units" value={totalUnits.toLocaleString()} />}
          </Section>
        )}

        {/* ── GROSS RENT MULTIPLIER INSIGHT ────────────────────────────────── */}
        {rd?.averageRent > 0 && sd?.medianPrice > 0 && (
          <Section>
            <SectionHeader title="📐 Market Ratios" subtitle="Calculated from Rentcast data" />
            <StatRow
              label="Market GRM"
              value={`${(sd.medianPrice / (rd.averageRent * 12)).toFixed(1)}x`}
              sub="Median Price ÷ Annual Avg Rent"
              accent
            />
            <StatRow
              label="Market Gross Yield"
              value={`${((rd.averageRent * 12) / sd.medianPrice * 100).toFixed(1)}%`}
              sub="Annual Rent ÷ Median Price"
            />
            {deal?.assumptions?.purchasePrice > 0 && rd?.averageRent > 0 && (() => {
              const pp = deal.assumptions.purchasePrice;
              const numUnits = deal.assumptions.numUnits || 2;
              const annualRent = rd.averageRent * 12 * numUnits;
              const grm = pp / annualRent;
              const yield_ = (annualRent / pp * 100);
              return (<>
                <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Your Deal vs. Market</div>
                <StatRow label="Your GRM" value={`${grm.toFixed(1)}x`} sub={`vs ${(sd.medianPrice / (rd.averageRent * 12)).toFixed(1)}x market`} accent={grm < sd.medianPrice / (rd.averageRent * 12)} />
                <StatRow label="Your Gross Yield" value={`${yield_.toFixed(1)}%`} sub={`vs ${((rd.averageRent * 12) / sd.medianPrice * 100).toFixed(1)}% market`} />
              </>);
            })()}
          </Section>
        )}
      </div>

      {/* ── RENT TREND CHART ──────────────────────────────────────────────────── */}
      {rentTrend.length > 2 && (
        <Section style={{ marginTop: 16 }}>
          <SectionHeader title="📈 Rental Price Trend (12 months)" subtitle={`ZIP ${zip} · Average and median monthly rent · Rentcast`} />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rentTrend} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} width={48} />
              <Tooltip content={<ChartTooltip formatter={FMT_USD} />} />
              <Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2} dot={false} name="Avg Rent" />
              <Line type="monotone" dataKey="median" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Median Rent" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ width: 24, height: 2, background: 'var(--accent)', borderRadius: 2 }} /> Avg Rent
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ width: 24, height: 2, background: 'var(--accent2)', borderRadius: 2, borderTop: '2px dashed var(--accent2)' }} /> Median Rent
            </div>
          </div>
        </Section>
      )}

      {/* ── SALE TREND CHART ──────────────────────────────────────────────────── */}
      {saleTrend.length > 2 && (
        <Section style={{ marginTop: 16 }}>
          <SectionHeader title="📈 Sale Price Trend (12 months)" subtitle={`ZIP ${zip} · Average and median sale price · Rentcast`} />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={saleTrend} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={52} />
              <Tooltip content={<ChartTooltip formatter={v => `$${(v/1000).toFixed(0)}k`} />} />
              <Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2} dot={false} name="Avg Price" />
              <Line type="monotone" dataKey="median" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Median Price" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ width: 24, height: 2, background: 'var(--accent)', borderRadius: 2 }} /> Avg Price
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ width: 24, height: 2, background: 'var(--accent2)', borderRadius: 2 }} /> Median Price
            </div>
          </div>
        </Section>
      )}

    </div>
  );
}

export default MarketTab;
