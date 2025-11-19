// Target-specific packing logic
import { TARGET_CONFIG, getExpectedTotalForSize, getExpectedTotalUnits } from '../config/targetConfig.js';
export function detectTargetMode(specInst, customerName, custPO) {
  if (!specInst && !customerName && !custPO) return false;
  const text = [specInst, customerName, custPO].filter(Boolean).join(' ').toUpperCase();
  return (
    text.includes('TARGET') ||
    text.includes('PCSI') ||
    text.includes('PACK PER CASEPACK') ||
    text.includes('CASEPACK AND SIZE SCALE') ||
    text.includes('UNITS PER CASE = 7')
  );
}
export function validateTargetPacking(totalBySize, numberOfCartons) {
  if (numberOfCartons <= 0) return { valid: false, error: 'Number of cartons must be greater than 0' };
  const expectedTotalUnits = getExpectedTotalUnits(numberOfCartons);
  const actualTotalUnits = Object.values(totalBySize).reduce((sum, count) => sum + count, 0);
  if (actualTotalUnits !== expectedTotalUnits) {
    return { valid: false, error: `Total units mismatch: Expected ${expectedTotalUnits} units (${numberOfCartons} cartons  ${TARGET_CONFIG.UNITS_PER_CASE} units/carton), but got ${actualTotalUnits} units.` };
  }
  const sizeKeys = ['S', 'M', 'L', 'XL', '2X'];
  for (const size of sizeKeys) {
    const expected = getExpectedTotalForSize(size, numberOfCartons);
    const actual = totalBySize[size] || 0;
    if (actual !== expected) {
      return { valid: false, error: `Size ${size} mismatch: Expected ${expected} units (${TARGET_CONFIG.SIZE_SCALE[size]}  ${numberOfCartons} cartons), but got ${actual} units.` };
    }
  }
  return { valid: true };
}
export function splitTarget(sizes, numberOfCartons) {
  const validation = validateTargetPacking(sizes, numberOfCartons);
  if (!validation.valid) throw new Error(validation.error || 'Invalid Target packing parameters');
  const boxes = [];
  const scale = TARGET_CONFIG.SIZE_SCALE;
  for (let i = 1; i <= numberOfCartons; i++) {
    boxes.push({ boxType: 'TARGET', sizes: { S: scale.S, M: scale.M, L: scale.L, XL: scale.XL, '2X': scale['2X'], '3X': 0, '4X': 0, '5X': 0 } });
  }
  return { boxes };
}
export function extractTargetCartonCount(sizes) {
  const totalUnits = Object.values(sizes).reduce((sum, count) => sum + count, 0);
  if (totalUnits % TARGET_CONFIG.UNITS_PER_CASE !== 0) return null;
  return totalUnits / TARGET_CONFIG.UNITS_PER_CASE;
}