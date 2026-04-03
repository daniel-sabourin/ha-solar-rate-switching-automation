export interface DailyStat {
  date: string; // YYYY-MM-DD
  import: number; // kWh
  export: number; // kWh
}

export interface AdvisorOptions {
  currentPlan: "high" | "low";
  days: number;
  hiRate: number;
  loRate: number;
}

export interface AdvisorResult {
  windowStart: string;
  windowEnd: string;
  days: DailyStat[];
  totalImport: number;
  totalExport: number;
  net: number; // import - export
  recommendation: "SWITCH" | "STAY";
  switchTo: "high" | "low" | null;
  costOfWrongPlan: number;
  trend: {
    recentRatio: number; // last 7d export/import
    priorRatio: number;  // prior 7d export/import
  } | null;
}
