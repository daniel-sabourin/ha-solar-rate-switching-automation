export interface DailyStat {
  date: string; // YYYY-MM-DD
  net: number;  // kWh, positive = net exporter, negative = net importer
}

export interface AdvisorOptions {
  currentPlan: "high" | "low";
  days: number;
  hiRate: number;
  loRate: number;
  billDate?: string; // YYYY-MM-DD — earliest date eligible for backdating
}

export interface BackdateRecommendation {
  date: string;
  savings: number; // $ saved vs switching today
}

export interface AdvisorResult {
  windowStart: string;
  windowEnd: string;
  days: DailyStat[];
  totalNet: number; // positive = net exporter over window
  recommendation: "SWITCH" | "STAY";
  switchTo: "high" | "low" | null;
  costOfWrongPlan: number;
  trend: {
    priorNet: number;  // net kWh for first half of window
    recentNet: number; // net kWh for second half of window
  } | null;
  backdate: BackdateRecommendation | null;
}
