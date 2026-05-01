// Shared color palette for export functions.
// XLSX functions use 6-char hex strings (no #); PDF functions use RGB arrays.
// Keep both formats here so each function just references COLORS.* instead of
// repeating literal values.

export const COLORS = {
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
