import type { ContractId, MonotonicityViolation } from './types';

const CONTRACT_15M_1PCT: ContractId = 'dump-simple-15m-1pct';
const CONTRACT_15M_3PCT: ContractId = 'dump-simple-15m-3pct';
const CONTRACT_15M_5PCT: ContractId = 'dump-simple-15m-5pct';
const CONTRACT_1H_05PCT: ContractId = 'dump-simple-1h-0.5pct';
const CONTRACT_1H_1PCT: ContractId = 'dump-simple-1h-1pct';
const CONTRACT_VOL_ADJ_15M: ContractId = 'dump-vol-adjusted-15m-z2';
const CONTRACT_VOL_ADJ_1H: ContractId = 'dump-vol-adjusted-1h-z2';

/**
 * Threshold constraints: for each horizon, P(5%) >= P(3%) >= P(1%)
 * Larger movements are less likely than smaller movements
 */
const THRESHOLD_CONSTRAINTS: {
  larger: ContractId;
  smaller: ContractId;
}[] = [
  // 15m horizon: 5% >= 3% >= 1%
  { larger: CONTRACT_15M_5PCT, smaller: CONTRACT_15M_3PCT },
  { larger: CONTRACT_15M_3PCT, smaller: CONTRACT_15M_1PCT },
  // 1h horizon: 1% >= 0.5%
  { larger: CONTRACT_1H_1PCT, smaller: CONTRACT_1H_05PCT },
  // Drawdown: 3% >= 1%
  { larger: 'dump-drawdown-3pct', smaller: 'dump-drawdown-1pct' },
];

/**
 * Horizon constraints: for each threshold, P(15m) <= P(1h)
 * Shorter timeframes are less likely than longer timeframes for same magnitude
 */
const HORIZON_CONSTRAINTS: {
  shorter: ContractId;
  longer: ContractId;
}[] = [
  // 1% threshold: 15m <= 1h
  { shorter: CONTRACT_15M_1PCT, longer: CONTRACT_1H_1PCT },
  // Vol-adjusted z2: 15m <= 1h
  { shorter: CONTRACT_VOL_ADJ_15M, longer: CONTRACT_VOL_ADJ_1H },
];

/**
 * Check monotonicity constraints and return violations
 *
 * @param predictions - Predictions for all contracts
 * @returns Array of violations (empty if all constraints satisfied)
 */
export function checkMonotonicity(predictions: Record<ContractId, number>): MonotonicityViolation[] {
  const violations: MonotonicityViolation[] = [];

  // Check threshold constraints: larger threshold should have >= probability
  for (const { larger, smaller } of THRESHOLD_CONSTRAINTS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a typed union
    const probability1 = predictions[larger];
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a typed union
    const probability2 = predictions[smaller];

    if (probability1 < probability2) {
      violations.push({
        type: 'threshold',
        contract1: larger,
        contract2: smaller,
        p1: probability1,
        p2: probability2,
        expected: 'p1 >= p2',
      });
    }
  }

  // Check horizon constraints: longer horizon should have >= probability
  for (const { shorter, longer } of HORIZON_CONSTRAINTS) {
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a typed union
    const probability1 = predictions[shorter];
    // eslint-disable-next-line security/detect-object-injection -- ContractId is a typed union
    const probability2 = predictions[longer];

    if (probability1 > probability2) {
      violations.push({
        type: 'horizon',
        contract1: shorter,
        contract2: longer,
        p1: probability1,
        p2: probability2,
        expected: 'p1 <= p2',
      });
    }
  }

  return violations;
}

/**
 * Count the number of monotonicity violations
 *
 * @param predictions - Predictions for all contracts
 * @returns Number of violations
 */
export function countViolations(predictions: Record<ContractId, number>): number {
  return checkMonotonicity(predictions).length;
}
