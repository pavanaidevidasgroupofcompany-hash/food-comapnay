export interface KPIState {
  totalEmployees: number;
  presentEmployees: number;
  absentEmployees: number;
  avgProductivity: number;
  totalTargetOutput: number;
  totalActualOutput: number;
  bestEmployee: string;
  bestEmployeeProductivity: number;
  lowestEmployee: string;
  lowestEmployeeProductivity: number;
  productivityChange: number;
}

export interface DailyTrendRecord {
  date: string;
  worker: string;
  prod: number;
  target: number;
  actual: number;
  att: string;
  shift: string;
}

export interface EmployeeBrief {
  id: string;
  name: string;
  team: string;
}

export interface TeamPerformanceData {
  team: string;
  avgProd: number;
}

export interface PerformerInfo {
  name: string;
  prod: number;
  team: string;
  grade: string;
}

export interface RosterTableRow {
  id: string;
  date: string;
  worker: string;
  team: string;
  shift: string;
  product: string;
  target: number;
  actual: number;
  prod: number;
  att: string;
  grade: string;
}

export interface DashboardResponse {
  kpis: KPIState;
  dailyTrend: DailyTrendRecord[];
  employees: EmployeeBrief[];
  teamComparison: TeamPerformanceData[];
  bestTeam: TeamPerformanceData | null;
  attendanceSummary: {
    present: number;
    absent: number;
    halfDay: number;
  };
  topPerformers: PerformerInfo[];
  bottomPerformers: PerformerInfo[];
  tableData: RosterTableRow[];
  insights: string[];
  availableMonths: string[];
  availableTeams: string[];
  availableShifts: string[];
  availableWeeks: string[];
}

export enum ChartView {
  MONTH = "MONTH",
  WEEK = "WEEK",
  TARGET = "TARGET"
}

export interface GradeSchema {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  progressClass: string;
}
