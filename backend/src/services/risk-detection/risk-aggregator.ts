/**
 * Risk Aggregator
 * Combines individual risk factor weights into overall risk level
 */

import { RiskLevel, RiskWeight } from '../../types/risk-detection';
import logger from '../../config/logger';

export class RiskAggregator {
  /**
   * Aggregate risk weights into a single risk level
   * Uses max weight strategy: highest weight determines the risk level
   * 
   * Rules:
   * - HIGH: Any factor with weight >= 10
   * - MEDIUM: Any factor with weight >= 5 and < 10
   * - LOW: All factors with weight < 5
   * 
   * @param riskWeights Array of risk weights from evaluators
   * @returns Aggregated risk level
   */
  aggregate(riskWeights: RiskWeight[]): RiskLevel {
    try {
      // Handle empty array
      if (!riskWeights || riskWeights.length === 0) {
        logger.debug('No risk weights provided, defaulting to LOW');
        return 'LOW';
      }

      // Find maximum numeric weight
      const maxWeight = Math.max(...riskWeights.map(w => w.numericWeight), 0);

      logger.debug('Risk aggregation:', {
        weights: riskWeights.map(w => ({
          type: w.type,
          weight: w.weight,
          numeric: w.numericWeight,
        })),
        maxWeight,
      });

      // Determine risk level based on max weight
      if (maxWeight >= 10) {
        return 'HIGH';
      } else if (maxWeight >= 5) {
        return 'MEDIUM';
      } else {
        return 'LOW';
      }
    } catch (error) {
      logger.error('Error in risk aggregation:', error);
      // Default to LOW on error
      return 'LOW';
    }
  }

  /**
   * Validate that risk level is one of the allowed values
   */
  isValidRiskLevel(level: string): level is RiskLevel {
    return level === 'LOW' || level === 'MEDIUM' || level === 'HIGH';
  }
}
