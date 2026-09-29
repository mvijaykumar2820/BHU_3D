/**
 * 18-character 3D-ULPIN = PNIU14 (14 digits) + V_type (1) + Z_encoded (2) + Unit (1)
 *
 *   PNIU14     14-digit base plot ID (demo: derived from the ROI centre)
 *   V_type     A = above-ground, B = basement, U = utility
 *   Z_encoded  2 Base-32 chars = floor level + 512  (range -512..511, negatives = basements)
 *   Unit       1 Base-32 char, sequential unit index (0..31) - assigned, not hashed,
 *              so two units on the same floor can never collide
 *
 * Example (18 chars):  12345678901234 A G1 1   ->  displayed as 12345678901234-A-G1-1
 */

export const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base-32 (no I, L, O, U)
export const LEVEL_OFFSET = 512;

export const V_TYPES = {
  A: 'Above-ground',
  B: 'Subterranean basement',
  U: 'Underground utility',
};

const ULPIN_RE = /^\d{14}[ABU][0-9A-HJKMNP-TV-Z]{3}$/;

export function toBase32(n, len) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Cannot encode ${n}`);
  let out = '';
  let v = n;
  for (let i = 0; i < len; i++) {
    out = B32[v % 32] + out;
    v = Math.floor(v / 32);
  }
  if (v > 0) throw new RangeError(`${n} does not fit in ${len} Base-32 chars`);
  return out;
}

export const fromBase32 = (s) => [...s].reduce((acc, ch) => acc * 32 + B32.indexOf(ch), 0);

export const encodeLevel = (level) => toBase32(level + LEVEL_OFFSET, 2);
export const decodeLevel = (code) => fromBase32(code) - LEVEL_OFFSET;

/** 14-digit demo base ID from lon/lat (about 11 m grid). Replace with the real Bhu-Aadhaar PNIU. */
export function makePniu14(lonDeg, latDeg) {
  const a = Math.round((latDeg + 90) * 1e4);
  const b = Math.round((lonDeg + 180) * 1e4);
  return String(a).padStart(7, '0') + String(b).padStart(7, '0');
}

/** Returns the raw 18-character code (no hyphens). */
export function generateUlpin({ pniu, vType, level, unit }) {
  if (!/^\d{14}$/.test(pniu)) throw new Error('PNIU must be 14 digits');
  if (!V_TYPES[vType]) throw new Error(`Unknown V_type: ${vType}`);
  if (!Number.isInteger(unit) || unit < 0 || unit > 31) throw new RangeError('Unit index must be 0..31');
  return pniu + vType + encodeLevel(level) + B32[unit];
}

/** 12345678901234-A-G1-1 (for display only). */
export const formatUlpin = (u) => `${u.slice(0, 14)}-${u[14]}-${u.slice(15, 17)}-${u[17]}`;

/** Strips hyphens/spaces and upper-cases, so users can paste either form. */
export const normalizeUlpin = (input) => input.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

export const isValidUlpin = (u) => ULPIN_RE.test(u);

export function parseUlpin(u) {
  if (!isValidUlpin(u)) return null;
  return {
    pniu: u.slice(0, 14),
    vType: u[14],
    level: decodeLevel(u.slice(15, 17)),
    unit: fromBase32(u[17]),
  };
}
