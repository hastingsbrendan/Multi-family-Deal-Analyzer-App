#!/usr/bin/env python3
"""
buildLoanLimits.py — Annual loan limit data refresh for RentHack

Run every December after FHFA announces new conforming loan limits:
    python3 scripts/buildLoanLimits.py

Sources:
  FHFA conforming limits: https://www.fhfa.gov/data/conforming-loan-limit
    → Download "Full County Loan Limit List YYYY (xlsx)"
  FHA limits: Derived from FHFA 1-unit limits using statutory HUD multipliers.
    Verify baseline 1-unit value at: https://www.hud.gov/hud-partners/single-family-fha-info
  ZIP→County: Census Bureau ZCTA-to-County relationship file (update URL if Census changes vintage)
    https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
"""

import sys, json, urllib.request, openpyxl, math
from pathlib import Path

# ── Config ───────────────────────────────────────────────────────────────────
YEAR             = 2026
FHFA_XLSX_URL    = "https://www.fhfa.gov/document/data/fullcountyloanlimitlist2026_hera-based_final_flat.xlsx"
FHFA_XLSX_LOCAL  = f"/tmp/fhfa_{YEAR}.xlsx"
CENSUS_ZIP_URL   = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"
OUTPUT_FILE      = Path(__file__).parent.parent / "src" / "lib" / "loanLimits.js"

# 2026 FHA ceiling and floor (1-unit). Update these each year from HUD Mortgagee Letter.
FHA_FLOOR_1U     = 541287    # national floor 2026
FHA_CEIL_1U      = 1249125   # national ceiling 2026

# Statutory HUD multi-unit multipliers (constant — derived from ceiling values)
# 2u: 1,599,375/1,249,125  3u: 1,933,200/1,249,125  4u: 2,402,625/1,249,125
MULT_2U = 1599375 / 1249125
MULT_3U = 1933200 / 1249125
MULT_4U = 2402625 / 1249125

def download(url, dest):
    print(f"Downloading {url} ...")
    urllib.request.urlretrieve(url, dest)
    print(f"  → {dest}")

def build():
    # ── 1. Download FHFA xlsx ──────────────────────────────────────────────
    download(FHFA_XLSX_URL, FHFA_XLSX_LOCAL)

    wb = openpyxl.load_workbook(FHFA_XLSX_LOCAL)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    data = [r for r in rows[2:] if r[0]]

    baseline_2u = int(data[0][6])  # first row = baseline county
    print(f"Baseline 2-unit conforming limit: ${baseline_2u:,}")

    county_limits = {}
    high_cost_fips = set()

    for r in data:
        sf = str(r[0]).zfill(2); cf = str(r[1]).zfill(3); fips = sf + cf
        fhfa_1u, fhfa_2u, fhfa_3u, fhfa_4u = int(r[5]), int(r[6]), int(r[7]), int(r[8])
        if fhfa_2u != baseline_2u:
            high_cost_fips.add(fips)
            fha_1u = max(min(fhfa_1u, FHA_CEIL_1U), FHA_FLOOR_1U)
            fha_2u = int(round(fha_1u * MULT_2U / 25) * 25)
            fha_3u = int(round(fha_1u * MULT_3U / 25) * 25)
            fha_4u = int(round(fha_1u * MULT_4U / 25) * 25)
            cn = str(r[2])
            for s in [' COUNTY',' BOROUGH',' MUNICIPALITY',' CENSUS AREA',' PARISH',' UNIFIED GOVERNMENT']:
                cn = cn.replace(s, '')
            county_limits[fips] = [cn.strip(), str(r[3]), fhfa_2u, fhfa_3u, fhfa_4u, fha_2u, fha_3u, fha_4u]

    print(f"High-cost counties: {len(high_cost_fips)}")

    # ── 2. Build ZIP→FIPS (high-cost ZIPs only) ────────────────────────────
    print(f"Downloading Census ZIP→County file ...")
    resp = urllib.request.urlopen(CENSUS_ZIP_URL, timeout=30).read().decode('utf-8-sig')
    lines = resp.strip().split('\n')

    zca = {}
    for line in lines[1:]:
        p = line.split('|')
        if len(p) < 17: continue
        z = p[1].strip().zfill(5); cf2 = p[9].strip().zfill(5)
        try: area = int(p[16] or 0)
        except: area = 0
        if z not in zca: zca[z] = {}
        if area > zca[z].get(cf2, 0): zca[z][cf2] = area

    zip_fips = {}
    for z, counties in zca.items():
        primary = max(counties, key=lambda f: counties[f])
        if primary in high_cost_fips:
            zip_fips[z] = primary

    print(f"High-cost ZIPs: {len(zip_fips)}")

    # ── 3. Derive baseline limits from FHFA data ───────────────────────────
    # Find first baseline row for deriving FHA baseline
    baseline_fhfa_1u = int([r[5] for r in data if int(r[6]) == baseline_2u][0])
    baseline_fha_1u  = max(min(baseline_fhfa_1u, FHA_CEIL_1U), FHA_FLOOR_1U)
    baseline_fha_2u  = int(round(baseline_fha_1u * MULT_2U / 25) * 25)
    # Use confirmed HUD value for baseline FHA (HUD rounds slightly differently)
    # Verify against HUD Mortgagee Letter each year
    CONFIRMED_FHA_BASELINE = { '2unit': 693050, '3unit': 837700, '4unit': 1041125 }
    print(f"Derived FHA baseline 2u: ${baseline_fha_2u:,} (confirmed: ${CONFIRMED_FHA_BASELINE['2unit']:,})")

    # ── 4. Generate loanLimits.js ──────────────────────────────────────────
    cl_json = json.dumps(county_limits, separators=(',', ':'))
    zf_json = json.dumps(zip_fips,      separators=(',', ':'))

    baseline_conforming_2u = baseline_2u
    baseline_conforming_3u = int([r[7] for r in data if int(r[6]) == baseline_2u][0])
    baseline_conforming_4u = int([r[8] for r in data if int(r[6]) == baseline_2u][0])

    high_cost_states = sorted(set(v[1] for v in county_limits.values()))

    output = f'''/**
 * loanLimits.js — {YEAR} FHFA Conforming & FHA Loan Limits
 * AUTO-GENERATED by scripts/buildLoanLimits.py — do not edit by hand.
 *
 * CONFORMING SOURCE: FHFA "Conforming Loan Limit Values for Calendar Year {YEAR}"
 *   https://www.fhfa.gov/document/data/fullcountyloanlimitlist{YEAR}_hera-based_final_flat.xlsx
 *
 * FHA SOURCE: Derived from FHFA 1-unit limits using HUD statutory multipliers
 *   (2u×{MULT_2U:.4f}, 3u×{MULT_3U:.4f}, 4u×{MULT_4U:.4f})
 *   Floored at {YEAR} national FHA floor (${FHA_FLOOR_1U:,}) and capped at ceiling (${FHA_CEIL_1U:,}).
 *   Baseline values verified against HUD Mortgagee Letter 2025-23.
 *
 * ZIP→COUNTY SOURCE: Census Bureau ZCTA-to-County relationship file (2020 vintage)
 *   https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
 *
 * ── BASELINE LIMITS (applies to ~95% of US counties) ──────────────────────
 *   Conforming: 2u ${baseline_conforming_2u:,} | 3u ${baseline_conforming_3u:,} | 4u ${baseline_conforming_4u:,}
 *   FHA:        2u ${CONFIRMED_FHA_BASELINE["2unit"]:,}   | 3u ${CONFIRMED_FHA_BASELINE["3unit"]:,}    | 4u ${CONFIRMED_FHA_BASELINE["4unit"]:,}
 *
 * ── HIGH-COST COUNTIES STORED: {len(county_limits)} counties, {len(zip_fips)} ZIPs ─────────
 *   States: {", ".join(high_cost_states)}
 *
 * ── HOW TO UPDATE ANNUALLY (every December after FHFA announcement) ───────
 *   1. Update FHFA_XLSX_URL and YEAR at top of scripts/buildLoanLimits.py
 *   2. Update FHA_FLOOR_1U, FHA_CEIL_1U from HUD Mortgagee Letter
 *   3. Update CONFIRMED_FHA_BASELINE from HUD announcement
 *   4. Run: python3 scripts/buildLoanLimits.py
 *   5. Commit and push loanLimits.js
 */

// COUNTY_LIMITS: {{ fips5: [countyName, stateAbbrev, conf2u, conf3u, conf4u, fha2u, fha3u, fha4u] }}
// Only the {len(county_limits)} high-cost counties are stored. Baseline counties return null → use BASELINE_*.
export const COUNTY_LIMITS = {cl_json};

// ZIP_TO_FIPS: {{ zip5: fips5 }}
// Only the {len(zip_fips)} ZIP codes that fall primarily within a high-cost county.
export const ZIP_TO_FIPS = {zf_json};

// ── Baseline limits ({YEAR}) ───────────────────────────────────────────────
export const BASELINE_CONFORMING = {{ '2unit': {baseline_conforming_2u}, '3unit': {baseline_conforming_3u}, '4unit': {baseline_conforming_4u} }};
export const BASELINE_FHA        = {{ '2unit': {CONFIRMED_FHA_BASELINE["2unit"]},  '3unit': {CONFIRMED_FHA_BASELINE["3unit"]},  '4unit': {CONFIRMED_FHA_BASELINE["4unit"]} }};

/**
 * getLimitsForZip(zip5, numUnits)
 * Returns {{ conforming, fha, county, state, isHighCost }} for a given ZIP and unit count.
 */
export function getLimitsForZip(zip5, numUnits) {{
  const unitKey = `${{numUnits}}unit`;
  const fips = zip5 ? ZIP_TO_FIPS[zip5] : undefined;
  if (!fips) {{
    return {{
      conforming: BASELINE_CONFORMING[unitKey],
      fha:        BASELINE_FHA[unitKey],
      county:     null,
      state:      null,
      isHighCost: false,
    }};
  }}
  const c = COUNTY_LIMITS[fips];
  if (!c) {{
    return {{
      conforming: BASELINE_CONFORMING[unitKey],
      fha:        BASELINE_FHA[unitKey],
      county:     null,
      state:      null,
      isHighCost: false,
    }};
  }}
  // c = [name, state, c2, c3, c4, f2, f3, f4]
  const idx = numUnits - 2; // 2→0, 3→1, 4→2
  return {{
    conforming: c[2 + idx],
    fha:        c[5 + idx],
    county:     c[0],
    state:      c[1],
    isHighCost: true,
  }};
}}

/**
 * extractZip(address)
 * Extracts a 5-digit ZIP from a deal address string. Returns null if not found.
 */
export function extractZip(address) {{
  if (!address) return null;
  const m = address.match(/\\b(\\d{{5}})\\b/);
  return m ? m[1] : null;
}}
'''

    OUTPUT_FILE.write_text(output)
    size_kb = OUTPUT_FILE.stat().st_size // 1024
    print(f"\n✅  Written: {OUTPUT_FILE} ({size_kb}KB)")
    print("   Next step: commit and push loanLimits.js")

if __name__ == '__main__':
    build()
