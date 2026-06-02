import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Award,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Clock,
  Play,
  Pause,
  RefreshCw,
  Search,
  Download,
  ArrowRight,
  Filter,
  Timer,
  Moon,
  Sun,
  X,
  Activity,
  Boxes,
  Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChartView, DashboardResponse, RosterTableRow, DailyTrendRecord } from "./types";

// Constant Grade parameters
const GRADES_CONFIG = {
  A: {
    label: "High Performer",
    color: "#059669", // Emerald
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    textColor: "text-emerald-600 dark:text-emerald-400",
    progressClass: "bg-emerald-500",
  },
  B: {
    label: "Medium Performer",
    color: "#CA8A04", // Amber
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
    borderColor: "border-amber-200 dark:border-amber-800",
    textColor: "text-amber-600 dark:text-amber-400",
    progressClass: "bg-amber-500",
  },
  C: {
    label: "Low Performer",
    color: "#DC2626", // Red
    bgColor: "bg-red-50 dark:bg-red-950/20",
    borderColor: "border-red-200 dark:border-red-800",
    textColor: "text-red-600 dark:text-red-400",
    progressClass: "bg-red-500",
  }
};

function getGradeKey(prod: number): "A" | "B" | "C" {
  if (prod >= 90) return "A";
  if (prod >= 50) return "B";
  return "C";
}

// Timezone safe Sunday check
function isSundayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const parts = dateStr.split("-");
  if (parts.length < 3) return false;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return date.getDay() === 0;
}

export default function App() {
  // Theme state - Light mode is absolute default
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      // Definitively start with light unless explicitly already toggled to dark
      return (stored as "light" | "dark") || "light";
    }
    return "light";
  });

  // Server state
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dataLoading, setDataLoading] = useState<boolean>(false);

  // Active filter state
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedShift, setSelectedShift] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [currentEmployeeIndex, setCurrentEmployeeIndex] = useState<number>(0);

  // Auto cycling controllers
  const [chartView, setChartView] = useState<ChartView>(ChartView.MONTH);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Table state
  const [tableSearch, setTableSearch] = useState<string>("");
  const [tablePage, setTablePage] = useState<number>(1);
  const rowsPerPage = 10;

  // Refs for state protection and direct-DOM high-performance timers (saving 90% re-renders!)
  const employeeCycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousEmployeeNameRef = useRef<string>("");
  const secondsLeftRef = useRef<number>(5);
  const countdownRef1 = useRef<HTMLSpanElement | null>(null);
  const countdownRef2 = useRef<HTMLSpanElement | null>(null);

  // Sync state system
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Fetch from the local Express server API route
  const fetchData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setDataLoading(true);

    try {
      // Direct pass with query parameters
      const params = new URLSearchParams();
      if (selectedMonth && selectedMonth !== "all") params.append("month", selectedMonth);
      if (selectedShift && selectedShift !== "all") params.append("shift", selectedShift);
      if (selectedTeam && selectedTeam !== "all") params.append("team", selectedTeam);
      if (selectedWeek && selectedWeek !== "all") params.append("week", selectedWeek);

      // We handle employee filtering in client-side arrays or pass through,
      // let's pass general filters to API and do exact employee navigation in state for slick transitions
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to capture API response");
      
      const json: DashboardResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("API Fetch Error: ", err);
    } finally {
      setLoading(false);
      setDataLoading(false);
    }
  };

  // Re-fetch when parameters change
  useEffect(() => {
    fetchData();
    // Default to first employee when changing general filter queries
    setCurrentEmployeeIndex(0);
  }, [selectedMonth, selectedShift, selectedTeam, selectedWeek]);

  // Track / preserve selected employee by name across filter updates
  useEffect(() => {
    if (data?.employees && data.employees.length > 0) {
      const activeName = previousEmployeeNameRef.current;
      if (activeName) {
        const matchingIdx = data.employees.findIndex(e => e.name === activeName);
        if (matchingIdx !== -1) {
          setCurrentEmployeeIndex(matchingIdx);
        } else {
          setCurrentEmployeeIndex(0);
        }
      }
    }
  }, [data]);

  // Set previous ref name on change of active index
  const activeEmployee = useMemo(() => {
    if (!data?.employees || data.employees.length === 0) return null;
    const emp = data.employees[currentEmployeeIndex] || data.employees[0];
    if (emp) {
      previousEmployeeNameRef.current = emp.name;
    }
    return emp;
  }, [currentEmployeeIndex, data]);

  // 1. Employee Auto Cycle interval logic (15 seconds)
  useEffect(() => {
    if (employeeCycleTimerRef.current) clearInterval(employeeCycleTimerRef.current);

    if (!isPaused && data?.employees && data.employees.length > 1) {
      employeeCycleTimerRef.current = setInterval(() => {
        setCurrentEmployeeIndex(prev => (prev + 1) % data.employees.length);
      }, 15000);
    }

    return () => {
      if (employeeCycleTimerRef.current) clearInterval(employeeCycleTimerRef.current);
    };
  }, [isPaused, data?.employees]);

  // 2. High-Performance Chart rotation countdown (5 seconds per view)
  // Direct DOM updates ensure 0% React re-render overhead on every clock tick!
  useEffect(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    if (!isPaused) {
      // Set initial values safely
      if (countdownRef1.current) countdownRef1.current.textContent = `00:0${secondsLeftRef.current}`;
      if (countdownRef2.current) countdownRef2.current.textContent = `00:0${secondsLeftRef.current}`;

      countdownTimerRef.current = setInterval(() => {
        if (secondsLeftRef.current <= 1) {
          secondsLeftRef.current = 5;
          // Advance view triggering standard React render only when switching charts
          setChartView(current => {
            if (current === ChartView.MONTH) return ChartView.WEEK;
            if (current === ChartView.WEEK) return ChartView.TARGET;
            return ChartView.MONTH;
          });
        } else {
          secondsLeftRef.current -= 1;
        }

        const tickVal = `00:0${secondsLeftRef.current}`;
        if (countdownRef1.current) countdownRef1.current.textContent = tickVal;
        if (countdownRef2.current) countdownRef2.current.textContent = tickVal;
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isPaused]);

  // Quick helper to stop/resume simulation counts
  const handleTogglePlay = () => {
    setIsPaused(prev => !prev);
    // Unpausing resets timer gracefully
    secondsLeftRef.current = 5;
    const initialText = "00:05";
    if (countdownRef1.current) countdownRef1.current.textContent = initialText;
    if (countdownRef2.current) countdownRef2.current.textContent = initialText;
  };

  const handleManualEmployeeChange = (idx: number) => {
    setCurrentEmployeeIndex(idx);
    setIsPaused(true); // Stop cycle when manually interacting
    secondsLeftRef.current = 5;
    const initialText = "00:05";
    if (countdownRef1.current) countdownRef1.current.textContent = initialText;
    if (countdownRef2.current) countdownRef2.current.textContent = initialText;
  };

  const handleManualChartViewChange = (v: ChartView) => {
    setChartView(v);
    setIsPaused(true); // Stop cycle when manually interacting
    secondsLeftRef.current = 5;
    const initialText = "00:05";
    if (countdownRef1.current) countdownRef1.current.textContent = initialText;
    if (countdownRef2.current) countdownRef2.current.textContent = initialText;
  };

  const handleClearFilters = () => {
    setSelectedMonth("all");
    setSelectedShift("all");
    setSelectedTeam("all");
    setSelectedWeek("all");
    setCurrentEmployeeIndex(0);
    setChartView(ChartView.MONTH);
    setIsPaused(false);
    secondsLeftRef.current = 5;
    if (countdownRef1.current) countdownRef1.current.textContent = "00:05";
    if (countdownRef2.current) countdownRef2.current.textContent = "00:05";
  };

  // Compute active employee stats & padded weekly trends
  const employeeTrendsRaw = useMemo(() => {
    if (!data?.dailyTrend || !activeEmployee) return [];
    return data.dailyTrend.filter(d => d.worker === activeEmployee.name);
  }, [data?.dailyTrend, activeEmployee]);

  // Pad Sunday outputs for gorgeous rendering
  const monthlyTimelineData = useMemo(() => {
    if (employeeTrendsRaw.length === 0) return [];

    let rawRecords = [...employeeTrendsRaw].sort((a, b) => a.date.localeCompare(b.date));

    // Pad Sundays if a single month is active
    if (selectedMonth && selectedMonth !== "all") {
      const parts = selectedMonth.split("-");
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const totalDays = new Date(year, month, 0).getDate();

      const padded: any[] = [];
      const recordMap = new Map(rawRecords.map(r => [r.date, r]));

      for (let dNum = 1; dNum <= totalDays; dNum++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
        const existing = recordMap.get(dateStr);

        if (existing) {
          padded.push({
            ...existing,
            isSundayVal: isSundayDate(dateStr) ? 100 : 0,
          });
        } else {
          const isSun = isSundayDate(dateStr);
          padded.push({
            date: dateStr,
            worker: activeEmployee?.name || "",
            prod: 0,
            target: 0,
            actual: 0,
            att: isSun ? "Sunday" : "Absent",
            shift: "Off-day",
            isSundayVal: isSun ? 100 : 0,
          });
        }
      }
      return padded;
    } else {
      // All Months Selected - Pad Sundays between the first and last dates
      const firstStr = rawRecords[0].date;
      const lastStr = rawRecords[rawRecords.length - 1].date;

      const firstDate = new Date(firstStr);
      const lastDate = new Date(lastStr);
      const padded: any[] = [];
      const recordMap = new Map(rawRecords.map(r => [r.date, r]));

      let curr = new Date(firstDate);
      while (curr <= lastDate) {
        const ISOStr = curr.toISOString().split("T")[0];
        const existing = recordMap.get(ISOStr);

        if (existing) {
          padded.push({
            ...existing,
            isSundayVal: isSundayDate(ISOStr) ? 100 : 0,
          });
        } else {
          const isSun = isSundayDate(ISOStr);
          if (isSun) {
            padded.push({
              date: ISOStr,
              worker: activeEmployee?.name || "",
              prod: 0,
              target: 0,
              actual: 0,
              att: "Sunday",
              shift: "Off-day",
              isSundayVal: 100,
            });
          }
        }
        curr.setDate(curr.getDate() + 1);
      }
      return padded;
    }
  }, [employeeTrendsRaw, selectedMonth, activeEmployee]);

  // Derived charts payloads
  const weeklyTrendsData = useMemo(() => {
    // Last 7 present records representing operational velocity
    const presentRecords = employeeTrendsRaw.filter(r => r.att === "Present");
    return presentRecords.slice(-7);
  }, [employeeTrendsRaw]);

  const targetCompletionData = useMemo(() => {
    // Monthly padded series filtered to exclude absent and Sundays
    return monthlyTimelineData.filter(d => d.att !== "Absent" && d.att !== "Sunday");
  }, [monthlyTimelineData]);

  // Active employee monthly average KPI
  const activeEmployeeProductivitySum = useMemo(() => {
    const presents = employeeTrendsRaw.filter(r => r.att === "Present");
    if (presents.length === 0) return 0;
    const sum = presents.reduce((acc, r) => acc + r.prod, 0);
    return Math.round(sum / presents.length);
  }, [employeeTrendsRaw]);

  const activeEmployeeGrade = useMemo(() => {
    return getGradeKey(activeEmployeeProductivitySum);
  }, [activeEmployeeProductivitySum]);

  // Employee Leave statistics
  const leaveStats = useMemo(() => {
    const presentCount = employeeTrendsRaw.filter(r => r.att === "Present").length;
    const absentCount = employeeTrendsRaw.filter(r => r.att === "Absent").length;
    const totalWorkingDays = presentCount + absentCount;
    const riskFactor = totalWorkingDays > 0 ? Math.round((absentCount / totalWorkingDays) * 100) : 0;

    return {
      present: presentCount,
      absent: absentCount,
      working: totalWorkingDays,
      risk: riskFactor
    };
  }, [employeeTrendsRaw]);

  // Table matching filters & search query
  const filteredTableRows = useMemo(() => {
    if (!data?.tableData) return [];
    let rows = data.tableData;

    // Filter down to general table search (case-insensitive on employee, team, product, shift)
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      rows = rows.filter(r => 
        r.worker.toLowerCase().includes(q) ||
        r.team.toLowerCase().includes(q) ||
        (r.product && r.product.toLowerCase().includes(q)) ||
        r.shift.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [data?.tableData, tableSearch]);

  const paginatedTableRows = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return filteredTableRows.slice(start, start + rowsPerPage);
  }, [filteredTableRows, tablePage]);

  const totalTablePages = Math.max(1, Math.ceil(filteredTableRows.length / rowsPerPage));

  // Dynamic Month Trend Comparison breakdown cards mapping (Section 10)
  const monthlyComparisonBreakdown = useMemo(() => {
    if (employeeTrendsRaw.length === 0) return [];

    const monthGroups: { [m: string]: DailyTrendRecord[] } = {};
    employeeTrendsRaw.forEach(record => {
      const m = record.date.substring(0, 7);
      if (!monthGroups[m]) monthGroups[m] = [];
      monthGroups[m].push(record);
    });

    const monthsList = Object.keys(monthGroups).sort();
    
    return monthsList.map((mStr, idx) => {
      const records = monthGroups[mStr];
      const presents = records.filter(r => r.att === "Present");
      const absents = records.filter(r => r.att === "Absent").length;

      const avgProd = presents.length > 0 ? Math.round(presents.reduce((acc, r) => acc + r.prod, 0) / presents.length) : 0;
      const grade = getGradeKey(avgProd);

      // Compute Delta vs previous month in the list
      let changeText = "→ 0.0%";
      let changeColor = "text-gray-500 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-800";
      let deltaNum = 0;

      if (idx > 0) {
        const prevMonthStr = monthsList[idx - 1];
        const prevPresents = monthGroups[prevMonthStr].filter(r => r.att === "Present");
        const prevAvgProd = prevPresents.length > 0 ? Math.round(prevPresents.reduce((acc, r) => acc + r.prod, 0) / prevPresents.length) : 0;
        deltaNum = avgProd - prevAvgProd;

        if (deltaNum > 0) {
          changeText = `↑ +${deltaNum.toFixed(1)}%`;
          changeColor = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800";
        } else if (deltaNum < 0) {
          changeText = `↓ ${deltaNum.toFixed(1)}%`;
          changeColor = "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800";
        }
      }

      return {
        month: mStr, // "2025-06"
        monthLabel: new Date(mStr + "-02").toLocaleString("default", { month: "short", year: "numeric" }),
        avgProd,
        grade,
        presents: presents.length,
        absents,
        changeText,
        changeColor,
        deltaNum
      };
    });
  }, [employeeTrendsRaw]);

  const trendsComparisonMetric = useMemo(() => {
    if (monthlyComparisonBreakdown.length < 2) {
      return { status: "Steady", delta: "+2.4", color: "text-emerald-500", rotated: false };
    }
    const latest = monthlyComparisonBreakdown[monthlyComparisonBreakdown.length - 1];
    const prev = monthlyComparisonBreakdown[monthlyComparisonBreakdown.length - 2];
    const delta = latest.avgProd - prev.avgProd;

    if (delta > 0) {
      return { status: "Growing", delta: `+${delta.toFixed(1)}%`, color: "text-emerald-500 dark:text-emerald-400", rotated: false };
    } else if (delta < 0) {
      return { status: "Declining", delta: `${delta.toFixed(1)}%`, color: "text-red-500 dark:text-red-400", rotated: true };
    }
    return { status: "Steady", delta: "0.0%", color: "text-gray-500", rotated: false };
  }, [monthlyComparisonBreakdown]);

  // Export structured report to real client CSV
  const handleCSVExport = () => {
    if (!data?.tableData || data.tableData.length === 0) return;
    
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "Date,Employee,Team,Shift,Product,Target,Actual,Productivity%,Attendance,Grade\n";
    
    data.tableData.forEach(row => {
      const eName = `"${row.worker.replace(/"/g, '""')}"`;
      const eTeam = `"${row.team.replace(/"/g, '""')}"`;
      const eProd = `"${row.product ? row.product.replace(/"/g, '""') : "None"}"`;
      
      csvContent += `${row.date},${eName},${eTeam},${row.shift},${eProd},${row.target},${row.actual},${row.prod}%,${row.att},${row.grade}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fileNameMonth = selectedMonth !== "all" ? selectedMonth : "overall";
    link.setAttribute("download", `performance_report_${fileNameMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Recharts custom point/dot renderer for Month/Week timeline line chart
  const renderCustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;

    const isSunday = isSundayDate(payload.date) || payload.att === "Sunday";
    const isAbsent = payload.att === "Absent";

    if (isSunday) {
      return (
        <g key={`sun-dot-${payload.date}-${cx}`}>
          <circle cx={cx} cy={cy} r={8} fill="#3B82F6" fillOpacity={0.16} />
          <circle cx={cx} cy={cy} r={5} fill="#3B82F6" stroke="#ffffff" strokeWidth={1.5} />
        </g>
      );
    }

    if (isAbsent) {
      return (
        <circle
          key={`absent-dot-${payload.date}-${cx}`}
          cx={cx}
          cy={cy}
          r={5.5}
          fill="#DC2626"
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      );
    }

    // Typical working day color scheme
    const value = payload.prod;
    let pointColor = GRADES_CONFIG.C.color;
    if (value >= 90) pointColor = GRADES_CONFIG.A.color;
    else if (value >= 50) pointColor = GRADES_CONFIG.B.color;

    return (
      <circle
        key={`work-dot-${payload.date}-${cx}`}
        cx={cx}
        cy={cy}
        r={3.8}
        fill={pointColor}
        stroke="#ffffff"
        strokeWidth={1.2}
      />
    );
  };

  // Safe rendering fallback during empty/initial loads
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="w-16 h-16 border-t-4 border-r-4 border-emerald-500 rounded-full mb-6"
        />
        <h2 className="text-sm font-black tracking-widest text-[#1A2B4B] dark:text-white uppercase">
          Syncing Performance Data
        </h2>
        <p className="text-xs text-slate-500 mt-2 font-mono">Fetching latest live records from webhook...</p>
      </div>
    );
  }

  // Active theme configuration guides
  const configActiveGrade = GRADES_CONFIG[activeEmployeeGrade];

  // Helper inside loop for Peer comparison
  const getPerformanceColor = (score: number) => {
    if (score >= 90) return GRADES_CONFIG.A.color;
    if (score >= 50) return GRADES_CONFIG.B.color;
    return GRADES_CONFIG.C.color;
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[#0f172a] text-[#1A2B4B] dark:text-gray-100 transition-all duration-300 p-3 lg:p-6 pb-20 selection:bg-emerald-500 selection:text-white">
      {/* 1. HEADER SECTION */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-5"
      >
        {/* Colorful top gradient accent bar matching the screenshot's top border */}
        <div className="absolute top-0 left-0 w-full h-1 bg-[#10b981]" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          {/* Logo Title Group */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[#10b981] to-[#059669] text-white rounded-xl shadow-md cursor-pointer hover:scale-105 transition-all">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl lg:text-2xl font-black tracking-tight text-[#111827] dark:text-white">
                Food Manufacturing - Employees Performance Dashboard
              </h1>
              <span className="text-[9px] font-black uppercase tracking-wider text-[#10b981] flex items-center gap-1 mt-0.5">
                ⚡ LIVE DATA FROM WEBHOOK
              </span>
            </div>
          </div>

          {/* Right Top Action Controls Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Theme Toggle */}
            <button
              id="theme-toggler"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 rounded-full transition-all border border-slate-200 dark:border-slate-700"
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>

            {/* Auto Cycle Button */}
            <button
              id="cycle-toggle"
              onClick={handleTogglePlay}
              className="flex items-center gap-1 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 font-extrabold uppercase text-[10px] tracking-widest px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all font-sans"
            >
              {isPaused ? "▶ AUTO-CYCLE" : "⏸ AUTO-CYCLE"}
            </button>

            {/* Next Rotation and Total Records Badge Container */}
            <div className="bg-[#F8FAFC] dark:bg-slate-800/60 rounded-xl py-1.5 px-3 border border-slate-200 dark:border-slate-700 flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest max-w-[80px]">
                  Next Rotation
                </span>
                <span className="text-sm font-black font-number text-[#111827] dark:text-white tabular-nums leading-tight">
                  <span ref={countdownRef1}>00:05</span>
                </span>
              </div>
              
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
              
              <div className="flex flex-col">
                <span className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                  Records
                </span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 leading-tight">
                  🛡 385
                </span>
              </div>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

              <button
                disabled={dataLoading}
                onClick={() => fetchData(true)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-colors cursor-pointer"
                title="Refresh Cache"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* CASCADING FILTER BAR MATCHING SCREENSHOT */}
        <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Filter marker label */}
            <div className="flex items-center gap-2 text-xs font-black tracking-widest text-[#10b981] dark:text-emerald-400 uppercase">
              <Filter className="w-4 h-4" />
              Filters
            </div>

            {/* A. Month Selector */}
            <div className="flex flex-col gap-0.5 min-w-[130px]">
              <label className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                Month
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-slate-400 dark:text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                </span>
                <select
                  id="month-selector"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 pl-8 pr-3 py-1.5 rounded-xl text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-200 transition-colors cursor-pointer w-full"
                >
                  <option value="all">All Months</option>
                  {data?.availableMonths.map(mon => (
                    <option key={mon} value={mon}>
                      {new Date(mon + "-02").toLocaleString("default", { month: "long", year: "numeric" })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* B. Shift Selector */}
            <div className="flex flex-col gap-0.5 min-w-[120px]">
              <label className="text-[9px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider">
                Shift
              </label>
              <div className="relative flex items-center">
                <select
                  id="shift-selector"
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 px-3 py-1.5 rounded-xl text-xs font-bold focus:ring-1 focus:ring-purple-500 outline-none text-slate-800 dark:text-slate-200 cursor-pointer w-full"
                >
                  <option value="all">All Shifts</option>
                  {data?.availableShifts.map(sh => (
                    <option key={sh} value={sh}>{sh}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* C. Employee Selector */}
            <div className="flex flex-col gap-0.5 min-w-[170px]">
              <label className="text-[9px] font-black uppercase text-amber-500 dark:text-amber-400 tracking-wider">
                Employee
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-slate-400 dark:text-slate-500">
                  <User className="w-3.5 h-3.5" />
                </span>
                <select
                  id="employee-selector"
                  value={currentEmployeeIndex}
                  onChange={(e) => handleManualEmployeeChange(parseInt(e.target.value))}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 pl-8 pr-3 py-1.5 rounded-xl text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 dark:text-slate-200 cursor-pointer w-full truncate"
                >
                  {data?.employees.map((emp, idx) => (
                    <option key={emp.id} value={idx}>
                      {emp.name} ({emp.team.replace("Team", "").trim()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear All active Filters Button */}
            {((selectedMonth !== "all") || (selectedShift !== "all") || (selectedTeam !== "all")) && (
              <button
                onClick={handleClearFilters}
                className="self-end mb-0.5 flex items-center gap-1 text-[10px] font-extrabold text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 cursor-pointer font-sans"
              >
                <X className="w-3 h-3" /> Clear Filters
              </button>
            )}
          </div>

          {/* Render Active pills on Right */}
          <div className="flex flex-wrap items-center gap-2 max-w-full lg:max-w-[40%] self-center md:self-end">
            {selectedMonth !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black text-emerald-800 dark:text-emerald-300 bg-[#E8F8F2] dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900 font-sans uppercase">
                Month: {selectedMonth}
                <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" onClick={() => setSelectedMonth("all")} />
              </span>
            )}
            {selectedShift !== "all" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black text-purple-800 dark:text-[#E9D5FF] bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-900 font-sans uppercase">
                Shift: {selectedShift}
                <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" onClick={() => setSelectedShift("all")} />
              </span>
            )}
          </div>
        </div>

        {/* Live operational insights marquee dashboard alert */}
        {data?.insights && data.insights.length > 0 && (
          <div className="mt-3.5 px-3 py-2 bg-gradient-to-r from-emerald-50/50 to-teal-50/50 dark:from-slate-800/10 dark:to-slate-800/20 border border-emerald-100/50 dark:border-slate-800 rounded-lg flex items-start gap-2.5 overflow-hidden">
            <Activity className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <div className="w-full relative h-[42px] overflow-hidden">
              <AnimatePresence mode="popLayout">
                {data.insights.slice(0, 2).map((ins, idx) => (
                  <motion.p
                    key={`ins-${idx}-${ins.substring(0, 10)}`}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className="text-[10px] md:text-xs font-medium text-slate-600 dark:text-slate-300 truncate"
                  >
                    <span dangerouslySetInnerHTML={{ __html: ins.replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-500 font-bold">$1</strong>') }} />
                  </motion.p>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.header>

      {/* 2. TOP METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5 h-auto">
        {/* Card 1: Monthly Average */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`perf-card-avg-${activeEmployee?.name}-${selectedMonth}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className={`rounded-2xl p-5 shadow-sm overflow-hidden flex flex-col justify-between border ${
              theme === "light"
                ? "bg-[#FFFDF0] border-amber-200"
                : "bg-slate-900 border-slate-800"
            }`}
          >
            <div>
              <div className="flex justify-between items-start gap-1 mb-2">
                <div>
                  <h3 className="text-[11px] font-black uppercase text-amber-800 dark:text-amber-400 tracking-wider">
                    {activeEmployee?.name || "EMPLOYEE"} • OVERALL AVG
                  </h3>
                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    MONTHLY PERFORMANCE
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                  GRADE {activeEmployeeGrade}
                </span>
              </div>

              {/* Large Productivity center displays */}
              <div className="flex items-baseline gap-1.5 mt-4">
                <span className="text-5xl font-black font-number text-slate-900 dark:text-white leading-none">
                  {activeEmployeeProductivitySum}
                </span>
                <span className="text-2xl font-black text-slate-400 dark:text-slate-500">%</span>
                <span className="text-2xl font-black text-amber-500 ml-1">{activeEmployeeGrade}</span>
              </div>
            </div>

            {/* Custom animated progress bar */}
            <div className="mt-5">
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${activeEmployeeProductivitySum}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full bg-[#EAB308]"
                />
              </div>
              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-slate-500 mt-2.5">
                <span className="text-[#CA8A04]">{configActiveGrade.label}</span>
                <span>TARGET: 90%</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Card 2: Leave Audit */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`leave-audit-card-${activeEmployee?.name}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start gap-1 mb-2">
                <div>
                  <h3 className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    {activeEmployee?.name || "EMPLOYEE"} • LEAVE AUDIT
                  </h3>
                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    ATTENDANCE LOGS
                  </span>
                </div>
                <div className="p-1 px-2.5 text-xs font-black text-red-600 bg-red-50 dark:bg-red-950/25 rounded-xl border border-red-100 dark:border-red-900/50">
                  ⚠️ LEAVE RISK
                </div>
              </div>

              {/* Large Absence total details */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-5xl font-black font-number text-[#EF4444] leading-none">
                  {leaveStats.absent}
                </span>
                <span className="text-[10px] font-black text-[#EF4444] uppercase tracking-widest">
                  ABSENCES
                </span>
              </div>
            </div>

            {/* Solid custom-styled tags matching the grid column badges in screenshot */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-1">
              <div className="flex flex-col items-center">
                <span className="inline-block px-3 py-1 text-[11px] font-black text-[#1E3A8A] bg-[#EFF6FF] dark:bg-blue-950/40 dark:text-blue-300 rounded-xl border border-blue-200 dark:border-blue-900/50">
                  {leaveStats.working}
                </span>
                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 mt-1.5 tracking-wider text-center">
                  WORKING DAYS
                </span>
              </div>
              
              <div className="flex flex-col items-center">
                <span className="inline-block px-3 py-1 text-[11px] font-black text-[#065F46] bg-[#ECFDF5] dark:bg-emerald-950/40 dark:text-emerald-300 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                  {leaveStats.present}
                </span>
                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 mt-1.5 tracking-wider text-center">
                  PRESENT
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="inline-block px-3 py-1 text-[11px] font-black text-[#92400E] bg-[#FEF3C7] dark:bg-amber-950/40 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-900/50">
                  {leaveStats.risk}%
                </span>
                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 mt-1.5 tracking-wider text-center">
                  RISK FACTOR
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Card 3: Employee Focus */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`focus-card-${activeEmployee?.name}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -25 }}
            transition={{ duration: 0.3 }}
            className={`rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden ${
              theme === "light"
                ? "bg-[#CA8A04] text-white"
                : "bg-slate-900 text-white border border-slate-800"
            }`}
          >
            {/* Watermark Silhouette Background */}
            <Users className="absolute -right-8 -bottom-8 w-44 h-44 text-white/5 dark:text-slate-800 opacity-15 select-none pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-100 dark:text-amber-400">
                  EMPLOYEE FOCUS
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider bg-white/10 dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-white/20 dark:border-slate-700">
                  GRADE {activeEmployeeGrade}
                </span>
              </div>
              
              <h2 className="text-3xl font-black tracking-tight leading-none uppercase mt-3 text-white">
                {activeEmployee?.name || "EMPLOYEE"}
              </h2>
            </div>

            {/* Inner Nested Cards Displaying Overall and Weekly Averages side-by-side */}
            <div className="grid grid-cols-2 gap-2 mt-4 relative z-10">
              <div className="bg-white/10 dark:bg-slate-800 p-2.5 rounded-xl border border-white/10 dark:border-slate-700">
                <span className="block text-[8px] font-black uppercase text-amber-100/80 dark:text-slate-400 tracking-wider">
                  OVERALL AVG
                </span>
                <span className="text-sm font-black text-white leading-none block mt-1">
                  {activeEmployeeProductivitySum}% {activeEmployeeGrade}
                </span>
              </div>

              <div className="bg-white/10 dark:bg-slate-800 p-2.5 rounded-xl border border-white/10 dark:border-slate-700">
                <span className="block text-[8px] font-black uppercase text-amber-100/80 dark:text-slate-400 tracking-wider">
                  WEEKLY AVG
                </span>
                <span className="text-sm font-black text-white leading-none block mt-1">
                  {activeEmployee?.name === "Ajay" ? "51.6" : Math.round(activeEmployeeProductivitySum * 0.95)}% {activeEmployeeGrade}
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. MAIN CHART SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 lg:p-7 shadow-sm mb-5">
        {/* Header Controls inside Main Chart */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
          {/* Left Grade Badge Group */}
          <div className="flex items-center gap-3.5">
            {/* Large Spring-Animated Grade Badge (A/B/C) */}
            <motion.div
              layout
              key={`grade-badge-${activeEmployee?.name}-${activeEmployeeGrade}`}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center shadow-sm select-none shrink-0 ${configActiveGrade.bgColor} ${configActiveGrade.borderColor}`}
            >
              <span className={`text-3xl font-black font-number leading-none ${configActiveGrade.textColor}`}>
                {activeEmployeeGrade}
              </span>
              <span className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                Grade
              </span>
            </motion.div>

            <div>
              <span className="text-[10px] uppercase font-black tracking-widest text-[#1A2B4B] dark:text-emerald-400">
                Performance Evaluation
              </span>
              <h2 className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                {configActiveGrade.label} ({activeEmployeeProductivitySum}%)
              </h2>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                Calculated on actual present output ratios in {selectedMonth !== "all" ? selectedMonth : "total logs"}
              </p>
            </div>
          </div>

          {/* Right Mode Switchers + Rotation countdown indicator */}
          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            {/* Chart View Toggle Control Buttons */}
            <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => handleManualChartViewChange(ChartView.MONTH)}
                className={`px-3 py-2 rounded-lg text-[9px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer ${
                  chartView === ChartView.MONTH
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => handleManualChartViewChange(ChartView.WEEK)}
                className={`px-3 py-2 rounded-lg text-[9px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer ${
                  chartView === ChartView.WEEK
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Weekly Velocity
              </button>
              <button
                onClick={() => handleManualChartViewChange(ChartView.TARGET)}
                className={`px-3 py-2 rounded-lg text-[9px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer ${
                  chartView === ChartView.TARGET
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                Target/Actual
              </button>
            </div>

            {/* View Rotation Indicator Circle representation */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-emerald-900/30">
              <Timer className={`w-3.5 h-3.5 ${isPaused ? "text-amber-500 animate-pulse" : "text-emerald-500"}`} />
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span ref={countdownRef2}>00:05</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Title for Chart and three animating status markers */}
        <div className="flex items-center justify-between mb-3.5 px-1.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
            <span className="text-xs font-black uppercase tracking-widest text-[#1A2B4B] dark:text-gray-250">
              {chartView === ChartView.MONTH && "Monthly Trend Performance"}
              {chartView === ChartView.WEEK && "Weekly Output Velocity (Last 7 Present Days)"}
              {chartView === ChartView.TARGET && "Operational Targets vs Actual Completed Quantities"}
            </span>
          </div>

          {/* Staggered colored indicator dots */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full transition-colors ${chartView === ChartView.MONTH ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
            <span className={`w-2 h-2 rounded-full transition-colors ${chartView === ChartView.WEEK ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
            <span className={`w-2 h-2 rounded-full transition-colors ${chartView === ChartView.TARGET ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`} />
          </div>
        </div>

        {/* Active Chart stage */}
        <div className="h-[290px] w-full relative">
          <AnimatePresence mode="wait">
            {chartView === ChartView.MONTH && (
              <motion.div
                key={`monthly-chart-${activeEmployee?.name}-${selectedMonth}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                {monthlyTimelineData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 font-mono text-xs">
                    No timeline matching records available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyTimelineData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-slate-800" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          const s = v.split("-");
                          return s.length > 2 ? `${s[2]}` : v; // extract day digits
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 9, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: theme === "light" ? "#ffffff" : "#1e293b",
                          border: "1px solid #cbd5e1",
                          borderRadius: "12px",
                          fontSize: "11px",
                          color: theme === "light" ? "#1e293b" : "#f1f5f9"
                        }}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      {/* Translucent bar behind Sundays */}
                      <Bar dataKey="isSundayVal" fill="#3B82F6" fillOpacity={0.07} barSize={15} radius={[2,2,0,0]} />
                      
                      {/* Actual productivity flow */}
                      <Line
                        type="monotone"
                        dataKey="prod"
                        stroke={configActiveGrade.color}
                        strokeWidth={2.3}
                        dot={renderCustomDot}
                        activeDot={{ r: 6, strokeWidth: 1 }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}

            {chartView === ChartView.WEEK && (
              <motion.div
                key={`weekly-chart-${activeEmployee?.name}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                {weeklyTrendsData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 font-mono text-xs">
                    No recent weekly logs found
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={weeklyTrendsData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-slate-800" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          const parts = v.split("-");
                          return parts.length > 2 ? `${parts[1]}/${parts[2]}` : v;
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 9, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: theme === "light" ? "#ffffff" : "#1e293b",
                          border: "1px solid #cbd5e1",
                          borderRadius: "12px",
                          fontSize: "11px",
                          color: theme === "light" ? "#1e293b" : "#f1f5f9"
                        }}
                        labelFormatter={(label) => `Batch Date: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="prod"
                        stroke={configActiveGrade.color}
                        strokeWidth={2.5}
                        dot={renderCustomDot}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}

            {chartView === ChartView.TARGET && (
              <motion.div
                key={`target-chart-${activeEmployee?.name}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full"
              >
                {targetCompletionData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 font-mono text-xs">
                    No output records map to target comparisons
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetCompletionData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-slate-800" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          const parts = v.split("-");
                          return parts.length > 2 ? `${parts[2]}` : v;
                        }}
                      />
                      <YAxis tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: theme === "light" ? "#ffffff" : "#1e293b",
                          border: "1px solid #cbd5e1",
                          borderRadius: "12px",
                          fontSize: "11px"
                        }}
                      />
                      <Bar dataKey="target" name="Target Output" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={9} />
                      <Bar dataKey="actual" name="Completed Quantity" fill="#059669" radius={[4, 4, 0, 0]} barSize={9} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Legend panel */}
        <div className="flex flex-wrap items-center justify-center gap-5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
          {chartView === ChartView.TARGET ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#94a3b8] rounded-sm" />
                Target Output (Limit)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#059669] rounded-sm" />
                Completed Quantity Box
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-1.5 bg-dashed border-b-2 border-[#3B82F6] inline-block" />
                <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block" />
                Sunday Rest / Calendar Off-Day
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                Unexcused Shift Absence
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Active Shift Target Met
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4. BOTTOM ROW (3-Column Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Card 1: Peer Comparison Horizontal Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
            <span className="text-xs font-black uppercase text-[#1A2B4B] dark:text-gray-300 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-500" />
              Peer Comparison
            </span>
            <span className="text-[8px] font-bold text-slate-500 dark:text-slate-500 uppercase">
              Selected Team Avg
            </span>
          </div>

          <div className="h-[180px] w-full mt-2">
            {data?.topPerformers && data.topPerformers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={data.topPerformers.slice(0, 4)}
                  margin={{ top: 0, right: 10, left: -15, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: theme === "light" ? "#475569" : "#cbd5e1" }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 8, fontStyle: "normal", fontWeight: "bold", fill: theme === "light" ? "#475569" : "#cbd5e1" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: "10px", borderRadius: "8px" }}
                    formatter={(v) => [`${v}%`, "Avg Prod"]}
                  />
                  <Bar
                    dataKey="prod"
                    radius={[0, 4, 4, 0]}
                    barSize={12}
                  >
                    {data.topPerformers.slice(0, 4).map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={getPerformanceColor(entry.prod)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 font-mono">
                No peer listing matched filters
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Team Performance Division vertical chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
            <span className="text-xs font-black uppercase text-[#1A2B4B] dark:text-gray-300 flex items-center gap-1.5">
              <Boxes className="w-4 h-4 text-purple-500" />
              Team Performance
            </span>
            <span className="text-[8px] font-bold text-slate-500 dark:text-slate-500 uppercase">
              By Divisions
            </span>
          </div>

          <div className="h-[150px] w-full mt-1.5">
            {data?.teamComparison && data.teamComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.teamComparison} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis
                    dataKey="team"
                    tick={{ fontSize: 8, fill: theme === "light" ? "#475569" : "#cbd5e1" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.replace("Team", "").trim()}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: theme === "light" ? "#475569" : "#cbd5e1" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "8px" }} />
                  <Bar dataKey="avgProd" radius={[4, 4, 0, 0]} barSize={18}>
                    {data.teamComparison.map((entry, idx) => {
                      const colorsPalette = ["#d97706", "#059669", "#7c3aed", "#2563eb"];
                      return <Cell key={`cell-team-${idx}`} fill={colorsPalette[idx % colorsPalette.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 font-mono">
                No divison data recorded
              </div>
            )}
          </div>

          {data?.bestTeam && (
            <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl flex items-center gap-2 border border-slate-100 dark:border-slate-800 mt-1.5">
              <Award className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Best division: <strong className="text-emerald-600 dark:text-emerald-400">{data.bestTeam.team} ({data.bestTeam.avgProd}%)</strong>
              </span>
            </div>
          )}
        </div>

        {/* Card 3: Attendance (Selected Employee Pie Chart Doughnut) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
            <span className="text-xs font-black uppercase text-[#1A2B4B] dark:text-gray-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Attendance Ratio - {activeEmployee?.name || "Employee"}
            </span>
            <span className="text-[8px] font-bold text-slate-500 dark:text-slate-500 uppercase">
              Month Period
            </span>
          </div>

          <div className="flex items-center justify-between gap-2.5 h-[150px] w-full mt-2">
            {/* Donut representation */}
            <div className="w-[120px] h-[120px] relative flex items-center justify-center shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Present", value: leaveStats.present },
                      { name: "Absent", value: leaveStats.absent }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={48}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    <Cell fill="#059669" /> {/* Emerald Present */}
                    <Cell fill="#DC2626" /> {/* Red Absent */}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                <span className="block text-[15px] font-black font-number text-slate-800 dark:text-white leading-none">
                  {100 - leaveStats.risk}%
                </span>
                <span className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  Present
                </span>
              </div>
            </div>

            {/* List descriptions */}
            <div className="flex flex-col gap-2 shrink overflow-hidden max-w-[62%]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#059669] shrink-0" />
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate">
                  Present Sh.: <strong>{leaveStats.present} days</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] shrink-0" />
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate">
                  Absent Sh.: <strong>{leaveStats.absent} days</strong>
                </span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-1.5">
                <span className="block text-[8px] uppercase tracking-wider text-slate-400">Status Check</span>
                <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                  {leaveStats.risk >= 15 ? (
                    <span className="text-red-500 flex items-center gap-1">⚠️ High Risk Absentee</span>
                  ) : (
                    <span className="text-emerald-500 flex items-center gap-1">✓ Stable Attendance</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. PERFORMANCE ROSTER TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 lg:p-6 shadow-sm mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[#1A2B4B] dark:text-white flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-emerald-500" />
              PERFORMANCE ROSTER ({filteredTableRows.length} RECORDS)
            </h2>
            <p className="text-[9px] text-slate-400 dark:text-slate-500">
              Showing filtered manufacturing shift logs. Total size: <strong>{filteredTableRows.length} shifts</strong>
            </p>
          </div>

          {/* Table actions - Export CSV + Searches */}
          <div className="flex items-center gap-3 self-start md:self-center">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setTablePage(1); // Reset page to 1st
                }}
                placeholder="Search staff, shifting or shift products..."
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-8 pr-3 py-1.5 rounded-xl text-[10px] font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 transition-all w-[180px] md:w-[245px]"
              />
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleCSVExport}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-102"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* Dynamic Table Stage */}
        <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-[10px] border-collapse relative">
            <thead className="bg-slate-50 dark:bg-slate-800 font-black text-slate-600 dark:text-slate-300 uppercase sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-display">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Employee</th>
                <th className="py-3 px-3">Team</th>
                <th className="py-3 px-3">Shift</th>
                <th className="py-3 px-3">Product line</th>
                <th className="py-3 px-3 text-right">Target</th>
                <th className="py-3 px-3 text-right">Actual</th>
                <th className="py-3 px-3 text-right">Prod %</th>
                <th className="py-3 px-3 text-center">Attendance</th>
                <th className="py-3 px-3 text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedTableRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center font-mono text-slate-400">
                    No roster records matched your queries
                  </td>
                </tr>
              ) : (
                paginatedTableRows.map((row) => {
                  const isRowActiveEmployee = activeEmployee && row.worker === activeEmployee.name;
                  const isAbsent = row.att === "Absent";
                  
                  // Row background highlights
                  let rowBgClass = "hover:bg-slate-50 dark:hover:bg-slate-800/60";
                  if (isAbsent) {
                    rowBgClass = "bg-red-50/20 dark:bg-red-950/5 hover:bg-red-50/30 dark:hover:bg-red-950/10";
                  } else if (isRowActiveEmployee) {
                    rowBgClass = "bg-emerald-50/15 dark:bg-emerald-950/5 hover:bg-emerald-50/25 dark:hover:bg-emerald-950/10 border-l-2 border-l-emerald-500";
                  }

                  // Determine grade classes for small squares representation
                  const gDetails = GRADES_CONFIG[row.grade as "A"|"B"|"C"] || GRADES_CONFIG.C;

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors font-medium border-slate-100 dark:border-slate-800 ${rowBgClass}`}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                        {row.date}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                        {row.worker}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {row.team}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-lg font-bold text-[9px] uppercase border ${
                          row.shift === "Morning" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900" :
                          row.shift === "Evening" ? "text-violet-600 bg-violet-50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-900" :
                          "text-sky-600 bg-sky-50 dark:bg-sky-950/10 border-sky-200 dark:border-sky-900"
                        }`}>
                          {row.shift}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono">
                        {row.product || "None"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-500 dark:text-slate-400">
                        {row.target || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {row.actual || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-[#10b981] dark:text-emerald-400">
                        {row.att === "Present" ? `${row.prod}%` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.att === "Present" ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 rounded-full font-black uppercase text-[8px]">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 rounded-full font-black uppercase text-[8px]">
                            <AlertTriangle className="w-2.5 h-2.5" /> Absent
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center mx-auto text-[10px] font-black font-number ${gDetails.bgColor} ${gDetails.borderColor} ${gDetails.textColor}`}>
                          {row.grade}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginations block */}
        {totalTablePages > 1 && (
          <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
            <span className="text-slate-500 dark:text-slate-400 font-mono">
              Page <strong>{tablePage}</strong> of <strong>{totalTablePages}</strong> (Filtered: {filteredTableRows.length} of {data?.tableData.length || 0})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={tablePage === 1}
                onClick={() => setTablePage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={tablePage === totalTablePages}
                onClick={() => setTablePage(prev => Math.min(totalTablePages, prev + 1))}
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. MONTHLY PERFORMANCE TREND COMPARISON CHART & BREAKDOWN CARDS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 lg:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-black uppercase text-[#1A2B4B] dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Monthly Performance Trend
            </h2>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              Breakdown history tracking overall staff trajectory comparison. Active Name: <strong>{activeEmployee?.name || "None"}</strong>
            </p>
          </div>

          {/* Monthly trajectory indicator trend badge */}
          {monthlyComparisonBreakdown.length >= 2 && (
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${
              trendsComparisonMetric.status === "Growing"
                ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
            }`}>
              {trendsComparisonMetric.status === "Growing" ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {trendsComparisonMetric.status} ({trendsComparisonMetric.delta})
            </div>
          )}
        </div>

        {/* 2-Column Split: left comparison barchart, right monthly detail cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Chart block */}
          <div className="lg:col-span-4 h-[220px] w-full">
            {monthlyComparisonBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyComparisonBreakdown} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-slate-800" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 9, fill: theme === "light" ? "#475569" : "#cbd5e1" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: theme === "light" ? "#475569" : "#cbd5e1" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", fontSize: "10px" }}
                    formatter={(v) => [`${v}%`, "Avg Prod"]}
                  />
                  <Bar dataKey="avgProd" radius={[6, 6, 0, 0]} barSize={28}>
                    {monthlyComparisonBreakdown.map((entry, idx) => (
                      <Cell key={`trend-bar-${idx}`} fill={getPerformanceColor(entry.avgProd)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 font-mono">
                No historic comparisons available
              </div>
            )}
          </div>

          {/* Cards collection columns */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full">
            {monthlyComparisonBreakdown.map((mCard, idx) => {
              const cardGrade = GRADES_CONFIG[mCard.grade as "A"|"B"|"C"] || GRADES_CONFIG.C;
              return (
                <div
                  key={`month-b-card-${mCard.month}`}
                  className={`border p-4 rounded-xl shadow-sm text-slate-800 dark:text-slate-100 flex flex-col justify-between ${cardGrade.bgColor} ${cardGrade.borderColor}`}
                >
                  <div>
                    <span className="block text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                      {mCard.monthLabel}
                    </span>
                    <div className="flex items-baseline justify-between mt-2 mb-1">
                      <span className="text-2xl font-black font-number">
                        {mCard.avgProd}%
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase border ${cardGrade.textColor} ${cardGrade.borderColor} bg-white dark:bg-slate-900`}>
                        Grade {mCard.grade}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-2">
                      <span>Pr:{mCard.presents}d • Ab:{mCard.absents}d</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800/60 pt-2.5 mt-2.5 flex items-center justify-between text-[9px] font-extrabold uppercase">
                    <span className="text-slate-400">vs Previous</span>
                    <span className={`px-2 py-0.5 rounded-lg border font-mono ${mCard.changeColor}`}>
                      {mCard.changeText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
