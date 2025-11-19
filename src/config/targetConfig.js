// Target packing configuration
export const TARGET_CONFIG = {
  UNITS_PER_CASE: 7,
  SIZE_SCALE: {
    S: 1,
    M: 1,
    L: 2,
    XL: 2,
    '2X': 1,
  },
};
export function getExpectedTotalForSize(size, numberOfCartons) {
  return TARGET_CONFIG.SIZE_SCALE[size] * numberOfCartons;
}
export function getExpectedTotalUnits(numberOfCartons) {
  return TARGET_CONFIG.UNITS_PER_CASE * numberOfCartons;
}
