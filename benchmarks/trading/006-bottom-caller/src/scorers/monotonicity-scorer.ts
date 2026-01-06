import { FILL_MONOTONICITY_RULES } from './types';

import type { ContractId, MonotonicityViolation, FillContractId } from './types';

/**
 * Horizon constraints for fill predictions:
 * - Longer horizons should have >= fill probability than shorter horizons
 * - bid-fill-15m >= bid-fill-5m >= bid-fill-1m
 * - ask-fill-15m >= ask-fill-5m >= ask-fill-1m
 *
 * This is because more time = more chances for price to cross the limit order
 */
const FILL_HORIZON_CONSTRAINTS: {
  shorter: FillContractId;
  longer: FillContractId;
}[] = FILL_MONOTONICITY_RULES.map(([shorter, longer]) => ({ shorter, longer }));

/**
 * Check monotonicity constraints for fill predictions and return violations
 *
 * For fill predictions, longer horizons should have higher or equal probability:
 * - P(bid-fill-15m) >= P(bid-fill-5m) >= P(bid-fill-1m)
 * - P(ask-fill-15m) >= P(ask-fill-5m) >= P(ask-fill-1m)
 *
 * @param predictions - Predictions for all fill contracts
 * @returns Array of violations (empty if all constraints satisfied)
 */
export function checkMonotonicity(predictions: Record<ContractId, number>): MonotonicityViolation[] {
  const violations: MonotonicityViolation[] = [];

  // Check horizon constraints: longer horizon should have >= probability
  for (const { shorter, longer } of FILL_HORIZON_CONSTRAINTS) {
    // eslint-disable-next-line security/detect-object-injection -- FillContractId is a typed union
    const probabilityShorter = predictions[shorter];
    // eslint-disable-next-line security/detect-object-injection -- FillContractId is a typed union
    const probabilityLonger = predictions[longer];

    // Violation if shorter horizon has higher probability than longer
    if (probabilityShorter > probabilityLonger) {
      violations.push({
        type: 'horizon',
        contract1: shorter,
        contract2: longer,
        p1: probabilityShorter,
        p2: probabilityLonger,
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
