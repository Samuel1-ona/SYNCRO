export interface ProjectedRenewal {
  subscriptionId: string;
  subscriptionName: string;
  provider: string;
  amount: number;
  projectedDate: string; // ISO 8601 format
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  category: string | null;
}

export interface SimulationSummary {
  totalProjectedSpend: number;
  projectionPeriodDays: number;
  startDate: string;
  endDate: string;
  subscriptionCount: number;
  renewalCount: number;
}

export interface RiskAssessment {
  insufficientBalance: boolean;
  currentBalance?: number;
  shortfall?: number;
}

export interface SimulationResult {
  projections: ProjectedRenewal[];
  summary: SimulationSummary;
  risk?: RiskAssessment;
}
