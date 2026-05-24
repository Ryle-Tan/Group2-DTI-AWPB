import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Layers3,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UNIT_CODES, normalizeUnitCode } from "@/lib/units";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  { key: "Jan", label: "January" },
  { key: "Feb", label: "February" },
  { key: "Mar", label: "March" },
  { key: "Apr", label: "April" },
  { key: "May", label: "May" },
  { key: "Jun", label: "June" },
  { key: "Jul", label: "July" },
  { key: "Aug", label: "August" },
  { key: "Sep", label: "September" },
  { key: "Oct", label: "October" },
  { key: "Nov", label: "November" },
  { key: "Dec", label: "December" },
];

const DEFAULT_UNITS = UNIT_CODES;

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateOnly(value) {
  if (!value) return "N/A";

  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isSubmissionWindowOpen(submissionWindow) {
  const { startDate, endDate } = submissionWindow || {};

  if (!startDate || !endDate) return false;

  const today = new Date();
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  return today >= start && today <= end;
}

function isApprovedStatus(status) {
  return String(status || "").trim().toLowerCase() === "approved";
}

function normalizeMonthLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return MONTHS.find(
    (month) =>
      month.label.toLowerCase() === normalized ||
      month.key.toLowerCase() === normalized ||
      month.key.toLowerCase() === normalized.slice(0, 3),
  )?.label;
}

function getEntryBudgetTotal(entry) {
  const monthlyTotal = (entry.monthlyBreakdown || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  return monthlyTotal || Number(entry.grandTotal || 0);
}

function StatCard({
  title,
  value,
  icon,
  caption,
  highlight = false,
}) {
  const IconComponent = icon;

  return (
    <Card
      className={
        highlight
          ? "border-0 bg-gradient-to-br from-[#1f2f74] via-[#243b86] to-[#2a4694] text-white shadow-[0_12px_28px_rgba(31,47,116,0.24)]"
          : "border-0 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      }
    >
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p
            className={`text-sm ${
              highlight ? "text-white/75" : "text-slate-500"
            }`}
          >
            {title}
          </p>
          <h2 className="mt-3 text-4xl font-bold">{value}</h2>
          <p
            className={`mt-2 text-xs ${
              highlight ? "text-white/75" : "text-slate-500"
            }`}
          >
            {caption}
          </p>
        </div>

        <div
          className={`rounded-2xl p-3 ${
            highlight ? "bg-white/18 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          <IconComponent size={20} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard({
  entries = [],
  selectedYear,
  onSelectedYearChange,
  submissionWindow,
  onUpdateSubmissionWindow,
}) {
  const windowOpen = isSubmissionWindowOpen(submissionWindow);
  const currentYear = String(new Date().getFullYear());
  const activeYear = String(selectedYear || currentYear);

  const availableYears = useMemo(() => {
    const years = [
      ...new Set([
        currentYear,
        activeYear,
        ...entries.map((entry) => String(entry.planningYear)).filter(Boolean),
      ]),
    ].sort((a, b) => String(b).localeCompare(String(a)));

    return years;
  }, [activeYear, currentYear, entries]);

  const yearEntries = useMemo(() => {
    return entries.filter(
      (entry) => String(entry.planningYear || "") === String(activeYear),
    );
  }, [activeYear, entries]);

  const stats = useMemo(() => {
    return {
      total: yearEntries.length,
      pending: yearEntries.filter((entry) => entry.status === "Pending Review")
        .length,
      returned: yearEntries.filter((entry) => entry.status === "Returned")
        .length,
      rejected: yearEntries.filter((entry) => entry.status === "Rejected")
        .length,
      approved: yearEntries.filter((entry) => isApprovedStatus(entry.status))
        .length,
    };
  }, [yearEntries]);

  const approvedEntries = useMemo(() => {
    return yearEntries.filter((entry) => isApprovedStatus(entry.status));
  }, [yearEntries]);

  const approvedMonthlyBudget = useMemo(() => {
    const totals = MONTHS.map((month) => ({
      ...month,
      amount: 0,
    }));

    approvedEntries.forEach((entry) => {
      entry.monthlyBreakdown?.forEach((item) => {
        const monthLabel = normalizeMonthLabel(item.month);
        const monthIndex = MONTHS.findIndex((month) => month.label === monthLabel);
        if (monthIndex >= 0) {
          totals[monthIndex].amount += Number(item.amount || 0);
        }
      });
    });

    return totals;
  }, [approvedEntries]);

  const approvedBudget = useMemo(() => {
    return approvedMonthlyBudget.reduce(
      (sum, month) => sum + Number(month.amount || 0),
      0,
    );
  }, [approvedMonthlyBudget]);

  const unitBudget = useMemo(() => {
    const totalsByUnit = DEFAULT_UNITS.reduce((acc, unit) => {
      acc[unit] = {
        unit,
        amount: 0,
        entries: 0,
      };
      return acc;
    }, {});

    approvedEntries.forEach((entry) => {
      const unitKey = normalizeUnitCode(entry.unit);

      if (!totalsByUnit[unitKey]) {
        totalsByUnit[unitKey] = {
          unit: unitKey,
          amount: 0,
          entries: 0,
        };
      }

      totalsByUnit[unitKey].amount += getEntryBudgetTotal(entry);
      totalsByUnit[unitKey].entries += 1;
    });

    return Object.values(totalsByUnit).sort(
      (a, b) => b.amount - a.amount || a.unit.localeCompare(b.unit),
    );
  }, [approvedEntries]);

  const pendingEntries = useMemo(() => {
    return yearEntries
      .filter((entry) => entry.status === "Pending Review")
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 5);
  }, [yearEntries]);

  const pendingEntryCount = useMemo(() => {
    return yearEntries.filter((entry) => entry.status === "Pending Review").length;
  }, [yearEntries]);

  const maxUnitAmount = Math.max(...unitBudget.map((item) => item.amount), 1);
  const isCurrentYear = String(activeYear) === currentYear;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review workflow volume and approved budget plans across submitted AWPB
            entries.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={activeYear} onValueChange={onSelectedYearChange}>
            <SelectTrigger
              aria-label="Select planning year"
              className="w-[140px] border-0 bg-white shadow-[0_3px_10px_rgba(15,23,42,0.08)]"
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            asChild
            className="border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
          >
            <Link to="/admin/review">
              Go to Admin Review
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>

      <Card
        className={`border-0 shadow-[0_12px_28px_rgba(15,23,42,0.12)] ${
          windowOpen
            ? "bg-gradient-to-br from-[#6ea3a6] via-[#4f8f93] to-[#2f7f86]"
            : "bg-gradient-to-br from-[#f9d1d1] via-[#f5bcbc] to-[#ef9f9f]"
        }`}
      >
        <CardContent className="p-4 md:p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_520px] xl:items-center">
            <div className="flex h-full flex-col justify-between gap-8">
              <div className="flex items-start gap-4">
                <div
                  className={`rounded-2xl p-3 ${
                    windowOpen ? "bg-white/20 text-white" : "bg-white/50 text-rose-900"
                  }`}
                >
                  <CalendarRange size={20} />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`text-xl font-semibold ${
                        windowOpen ? "text-white" : "text-rose-900"
                      }`}
                    >
                      Submission Period {windowOpen ? "Open" : "Closed"}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        windowOpen
                          ? "border-white/30 bg-white/20 text-white"
                          : "border-rose-200 bg-white/50 text-rose-800"
                      }
                    >
                      {windowOpen ? "Open" : "Closed"}
                    </Badge>
                  </div>
                  <p
                    className={`mt-1 text-base ${
                      windowOpen ? "text-white/90" : "text-rose-800"
                    }`}
                  >
                    {formatDateOnly(submissionWindow?.startDate)} to{" "}
                    {formatDateOnly(submissionWindow?.endDate)}
                  </p>
                </div>
              </div>

              <p
                className={`max-w-2xl text-sm ${
                  windowOpen ? "text-white/85" : "text-rose-800"
                }`}
              >
                Control when Account Officers can submit new entries or revise returned
                submissions.
              </p>
            </div>

            <div
              className={`rounded-2xl p-4 shadow-[0_16px_36px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md ${
                windowOpen
                  ? "bg-white/18 text-white ring-1 ring-white/25"
                  : "bg-white/52 text-rose-900 ring-1 ring-white/50"
              }`}
            >
              <p className="text-sm font-semibold">Submission Period Settings</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="submission-window-start-date"
                    className="mb-2 block text-sm font-medium"
                  >
                    Start Date
                  </label>
                  <input
                    id="submission-window-start-date"
                    type="date"
                    value={submissionWindow?.startDate || ""}
                    onChange={(e) =>
                      onUpdateSubmissionWindow((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                      windowOpen
                        ? "border border-white/30 bg-white/90 text-slate-900 focus:ring-white/35"
                        : "border border-white/60 bg-white/85 text-slate-900 focus:ring-rose-200"
                    }`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="submission-window-end-date"
                    className="mb-2 block text-sm font-medium"
                  >
                    End Date
                  </label>
                  <input
                    id="submission-window-end-date"
                    type="date"
                    value={submissionWindow?.endDate || ""}
                    onChange={(e) =>
                      onUpdateSubmissionWindow((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                    className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                      windowOpen
                        ? "border border-white/30 bg-white/90 text-slate-900 focus:ring-white/35"
                        : "border border-white/60 bg-white/85 text-slate-900 focus:ring-rose-200"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#e7f2f0] p-3 text-[#0b4f52]">
              <Archive size={20} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  Yearly CSV Backup
                </h2>
                <Badge
                  variant="outline"
                  className={
                    isCurrentYear
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }
                >
                  {isCurrentYear ? "Current year" : "Archive-ready"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Download all {activeYear} entries as a CSV archive before future
                cleanup or deletion.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{yearEntries.length}</span>{" "}
              entr{yearEntries.length === 1 ? "y" : "ies"}
            </div>
            <Button
              asChild
              className="border-0 bg-gradient-to-r from-[#0b4f52] to-[#16747a] text-white shadow-[0_6px_16px_rgba(11,79,82,0.24)] transition-all duration-200 hover:from-[#083f42] hover:to-[#115f64] disabled:cursor-wait disabled:opacity-75"
            >
              <Link to="/admin/archive-cleanup">
                Open Archive & Cleanup
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Entries"
          value={stats.total}
          icon={Layers3}
          caption={`All submissions recorded for ${activeYear}`}
          highlight
        />
        <StatCard
          title="Pending Review"
          value={stats.pending}
          icon={Clock3}
          caption="Entries waiting for admin action"
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          caption="Locked entries cleared for final use"
        />
        <StatCard
          title="Returned / Rejected"
          value={stats.returned + stats.rejected}
          icon={XCircle}
          caption="Entries that still need correction or disposition"
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="flex h-full flex-col border-0 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-lg">Budget by Unit</CardTitle>
            <p className="text-sm text-slate-500">
              Compare approved budget totals across implementing units for{" "}
              {activeYear}.
            </p>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col">
            {unitBudget.length === 0 ? (
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No approved unit budget data available for this year yet.
              </div>
            ) : (
              <div className="grid flex-1 auto-rows-fr gap-4">
                {unitBudget.map((item) => (
                  <div
                    key={item.unit}
                    className="flex flex-col justify-center rounded-2xl border border-slate-200/90 bg-slate-50 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{item.unit}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.entries} entr{item.entries === 1 ? "y" : "ies"}
                        </p>
                      </div>

                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>

                    <div className="mt-3 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-[#1f2f74] to-[#2a4694]"
                        style={{
                          width: `${Math.max(
                            (item.amount / maxUnitAmount) * 100,
                            item.amount > 0 ? 8 : 0,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col border-0 bg-gradient-to-br from-[#1f2f74] via-[#243b86] to-[#2a4694] text-white shadow-[0_14px_34px_rgba(31,47,116,0.24)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Budget Overview</CardTitle>
            <p className="text-sm text-white/75">
              Approved budget totals for planning year {activeYear}.
            </p>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col space-y-5">
            <div className="rounded-2xl bg-white/12 p-4">
              <p className="text-sm text-white/75">Approved Yearly Budget</p>
              <h2 className="mt-2 text-3xl font-bold">{formatCurrency(approvedBudget)}</h2>
            </div>

            <div className="flex-1 rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="mb-4">
                <p className="font-medium text-white">Approved Monthly Budget</p>
                <p className="text-xs text-white/70">
                  Month-by-month totals from approved entries only.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {approvedMonthlyBudget.map((month) => (
                  <div
                    key={month.key}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/8 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <p className="font-medium text-white">{month.key}</p>
                    </div>
                    <p className="text-sm text-white/75">
                      {formatCompactCurrency(month.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-0 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-lg">Pending Queue</CardTitle>
            <p className="text-sm text-slate-500">
              Entries awaiting review for {activeYear}.
            </p>
          </CardHeader>

          <CardContent>
            {pendingEntries.length === 0 ? (
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No pending entries for this year right now.
              </div>
            ) : (
              <div className="space-y-4">
                {pendingEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-slate-200/90 bg-slate-50 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {entry.titleOfActivities}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.unit} • {entry.planningYear || "N/A"}
                        </p>
                      </div>

                      <Badge variant="statusPending">Pending Review</Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{formatDateOnly(entry.submittedAt)}</span>
                      <span>{formatCompactCurrency(entry.grandTotal)}</span>
                    </div>
                  </div>
                ))}
                {pendingEntryCount >= 5 && (
                  <Button
                    asChild
                    variant="link"
                    className="h-auto px-0 text-[#1f2f74] hover:text-[#2a4694]"
                  >
                    <Link to="/admin/review">See more in Admin Review</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
