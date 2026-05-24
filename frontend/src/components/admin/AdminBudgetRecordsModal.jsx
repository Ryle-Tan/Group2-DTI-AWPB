import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeUnitCode } from "@/lib/units";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"];

function formatRecordDateTime(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getEntryPersonName(entry, prefix) {
  return (
    entry?.[`${prefix}DisplayName`] ||
    entry?.[`${prefix}FullName`] ||
    entry?.[`${prefix}Username`] ||
    "N/A"
  );
}

function getTransactionActorName(tx) {
  return tx.actor?.full_name || tx.actor?.username || tx.actor_name || "N/A";
}

function getTransactionDisplay(tx) {
  if (tx.entry_id && tx.type === "DEDUCTED") {
    return {
      amountClassName: "text-blue-600",
      label: "APPROVED PLAN",
      labelClassName: "inline-flex w-36 justify-center bg-blue-100 text-blue-700",
      prefix: "",
    };
  }

  if (tx.entry_id && tx.type === "ADDED") {
    return {
      amountClassName: "text-amber-600",
      label: "PLAN REVERSAL",
      labelClassName: "inline-flex w-36 justify-center bg-amber-100 text-amber-700",
      prefix: "",
    };
  }

  if (tx.type === "ADDED") {
    return {
      amountClassName: "text-green-600",
      label: "ADDED",
      labelClassName: "inline-flex w-28 justify-center bg-green-100 text-green-700",
      prefix: "+",
    };
  }

  return {
    amountClassName: "text-red-600",
    label: "DEDUCTED",
    labelClassName: "inline-flex w-28 justify-center bg-red-100 text-red-700",
    prefix: "-",
  };
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(targets, query) {
  if (!query) return true;
  return targets.some((target) => normalizeSearchValue(target).includes(query));
}

export default function AdminBudgetRecordsModal({
  approvedEntries = [],
  onClose,
  planningYear,
  transactions = [],
}) {
  const [activeTab, setActiveTab] = useState("movements");
  const [movementSearch, setMovementSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [movementPageSize, setMovementPageSize] = useState("25");
  const [entryPageSize, setEntryPageSize] = useState("25");
  const [movementPage, setMovementPage] = useState(1);
  const [entryPage, setEntryPage] = useState(1);

  const handleClose = () => {
    onClose?.();
  };

  const filteredTransactions = useMemo(() => {
    const query = normalizeSearchValue(movementSearch);
    return transactions.filter((tx) =>
      matchesSearch(
        [
          tx.description,
          tx.type,
          getTransactionDisplay(tx).label,
          tx.unit,
          tx.planning_year,
          getTransactionActorName(tx),
          formatRecordDateTime(tx.created_at),
          Number(tx.amount).toLocaleString(),
        ],
        query,
      ),
    );
  }, [movementSearch, transactions]);

  const filteredApprovedEntries = useMemo(() => {
    const query = normalizeSearchValue(entrySearch);
    return approvedEntries.filter((entry) =>
      matchesSearch(
        [
          entry.titleOfActivities,
          entry.no,
          entry.planningYear,
          entry.unit,
          getEntryPersonName(entry, "owner"),
          getEntryPersonName(entry, "reviewer"),
          entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString() : "",
          Number(entry.grandTotal || 0).toLocaleString(),
        ],
        query,
      ),
    );
  }, [approvedEntries, entrySearch]);

  const movementTotalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / Number(movementPageSize)),
  );
  const entryTotalPages = Math.max(
    1,
    Math.ceil(filteredApprovedEntries.length / Number(entryPageSize)),
  );
  const currentMovementPage = Math.min(movementPage, movementTotalPages);
  const currentEntryPage = Math.min(entryPage, entryTotalPages);

  const pagedTransactions = useMemo(() => {
    const pageSize = Number(movementPageSize);
    const start = (currentMovementPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [currentMovementPage, filteredTransactions, movementPageSize]);

  const pagedApprovedEntries = useMemo(() => {
    const pageSize = Number(entryPageSize);
    const start = (currentEntryPage - 1) * pageSize;
    return filteredApprovedEntries.slice(start, start + pageSize);
  }, [currentEntryPage, entryPageSize, filteredApprovedEntries]);

  const transactionRows = useMemo(
    () =>
      pagedTransactions.map((tx) => {
        const display = getTransactionDisplay(tx);

        return (
          <tr
            key={tx.id}
            className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
          >
            <td className="whitespace-nowrap px-6 py-3 text-slate-600">
              {formatRecordDateTime(tx.created_at)}
            </td>
            <td className="px-6 py-3 text-center">
              <Badge className="inline-flex min-w-16 justify-center bg-slate-100 text-slate-700">
                {normalizeUnitCode(tx.unit)}
              </Badge>
            </td>
            <td className="px-6 py-3 text-center">
              <Badge className={display.labelClassName}>{display.label}</Badge>
            </td>
            <td className={`px-6 py-3 font-semibold ${display.amountClassName}`}>
              {display.prefix}₱{Number(tx.amount).toLocaleString()}
            </td>
            <td className="px-6 py-3 text-slate-600">{getTransactionActorName(tx)}</td>
            <td className="px-6 py-3 text-slate-600">{tx.description}</td>
          </tr>
        );
      }),
    [pagedTransactions],
  );

  const approvedEntryRows = useMemo(
    () =>
      pagedApprovedEntries.map((entry) => (
        <tr
          key={entry.id}
          className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
        >
          <td className="truncate px-5 py-3 font-medium text-slate-800">
            {entry.titleOfActivities || "-"}
          </td>
          <td className="px-5 py-3 text-center text-slate-600">{entry.no || "-"}</td>
          <td className="px-5 py-3 text-center">
            <Badge className="inline-flex min-w-16 justify-center bg-slate-100 text-slate-700">
              {normalizeUnitCode(entry.unit)}
            </Badge>
          </td>
          <td className="px-5 py-3 text-center text-slate-600">
            {entry.planningYear || "-"}
          </td>
          <td className="px-5 py-3 text-slate-600">
            {entry.submittedAt ? new Date(entry.submittedAt).toLocaleDateString() : "-"}
          </td>
          <td className="px-5 py-3 text-slate-600">
            {getEntryPersonName(entry, "owner")}
          </td>
          <td className="px-5 py-3 text-slate-600">
            {entry.reviewedAt ? getEntryPersonName(entry, "reviewer") : "N/A"}
          </td>
          <td className="px-5 py-3 font-semibold text-red-600">
            ₱{formatCurrency(entry.grandTotal)}
          </td>
        </tr>
      )),
    [pagedApprovedEntries],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[1.75rem] bg-[#edf4f3] shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#6ea3a6] via-[#4f8f93] to-[#2f7f86] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/18 p-3">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">
                Planning Budget Records {planningYear ? `- ${planningYear}` : ""}
              </h3>
              <p className="mt-1 text-sm text-white/80">
                Track estimate edits, approvals, and current approved AWPB entries for this year.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-2 text-white/85 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200/80 bg-white px-6 py-4">
          <div className="flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("movements")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "movements"
                  ? "bg-[#233f8f] text-white shadow-sm"
                  : "text-slate-500 hover:bg-white hover:text-slate-700"
              }`}
            >
              Budget Activity
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("deductions")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab === "deductions"
                  ? "bg-[#233f8f] text-white shadow-sm"
                  : "text-slate-500 hover:bg-white hover:text-slate-700"
              }`}
            >
              Approved Entries
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className={activeTab === "movements" ? "block" : "hidden"}>
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={movementSearch}
                  onChange={(event) => {
                    setMovementSearch(event.target.value);
                    setMovementPage(1);
                  }}
                  placeholder="Search description, editor, unit, type, or amount"
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{pagedTransactions.length}</span>{" "}
                  of <span className="font-semibold text-slate-700">{filteredTransactions.length}</span>{" "}
                  records
                </p>
                <Select
                  value={movementPageSize}
                  onValueChange={(value) => {
                    setMovementPageSize(value);
                    setMovementPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 min-w-[140px] rounded-xl border-slate-200 bg-slate-50 px-3">
                    <SelectValue placeholder="Rows per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size} per page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <table className="w-full table-fixed overflow-hidden rounded-2xl bg-white text-sm shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <colgroup>
                <col className="w-[190px]" />
                <col className="w-[120px]" />
                <col className="w-[200px]" />
                <col className="w-[170px]" />
                <col className="w-[180px]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-700">Unit</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-700">Type</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Amount</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Recorded By</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-400">
                      <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
                      <p>{transactions.length === 0 ? "No budget activity yet" : "No matching activity"}</p>
                      <p className="text-sm">
                        {transactions.length === 0
                          ? "Estimate edits and approval activity will appear here."
                          : "Try a broader search term or change the page size."}
                      </p>
                    </td>
                  </tr>
                ) : transactionRows}
              </tbody>
            </table>

            {filteredTransactions.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Page <span className="font-semibold text-slate-700">{movementPage}</span> of{" "}
                  <span className="font-semibold text-slate-700">{movementTotalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMovementPage(Math.max(1, currentMovementPage - 1))}
                    disabled={currentMovementPage === 1}
                    className="rounded-xl border-slate-200"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMovementPage(Math.min(movementTotalPages, currentMovementPage + 1))}
                    disabled={currentMovementPage === movementTotalPages}
                    className="rounded-xl border-slate-200"
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className={activeTab === "deductions" ? "block" : "hidden"}>
            <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={entrySearch}
                  onChange={(event) => {
                    setEntrySearch(event.target.value);
                    setEntryPage(1);
                  }}
                  placeholder="Search title, unit, submitter, approver, year, or total"
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-500">
                  Showing <span className="font-semibold text-slate-700">{pagedApprovedEntries.length}</span>{" "}
                  of <span className="font-semibold text-slate-700">{filteredApprovedEntries.length}</span>{" "}
                  approved entries
                </p>
                <Select
                  value={entryPageSize}
                  onValueChange={(value) => {
                    setEntryPageSize(value);
                    setEntryPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 min-w-[140px] rounded-xl border-slate-200 bg-slate-50 px-3">
                    <SelectValue placeholder="Rows per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size} per page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <table className="w-full table-fixed overflow-hidden rounded-2xl bg-white text-sm shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <colgroup>
                <col />
                <col className="w-[110px]" />
                <col className="w-[130px]" />
                <col className="w-[110px]" />
                <col className="w-[170px]" />
                <col className="w-[180px]" />
                <col className="w-[180px]" />
                <col className="w-[150px]" />
              </colgroup>
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">
                    Title
                  </th>
                  <th className="px-5 py-3 text-center font-semibold text-slate-700">No.</th>
                  <th className="px-5 py-3 text-center font-semibold text-slate-700">Unit</th>
                  <th className="px-5 py-3 text-center font-semibold text-slate-700">Year</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">
                    Date Submitted
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">
                    Submitted By
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">
                    Approved By
                  </th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredApprovedEntries.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-12 text-center text-slate-400">
                      <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
                      <p>{approvedEntries.length === 0 ? "No approved entries yet" : "No matching approved entries"}</p>
                    </td>
                  </tr>
                ) : approvedEntryRows}
              </tbody>
            </table>

            {filteredApprovedEntries.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Page <span className="font-semibold text-slate-700">{currentEntryPage}</span> of{" "}
                  <span className="font-semibold text-slate-700">{entryTotalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEntryPage(Math.max(1, currentEntryPage - 1))}
                    disabled={currentEntryPage === 1}
                    className="rounded-xl border-slate-200"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEntryPage(Math.min(entryTotalPages, currentEntryPage + 1))}
                    disabled={currentEntryPage === entryTotalPages}
                    className="rounded-xl border-slate-200"
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200/80 bg-white p-4">
          <Button
            type="button"
            onClick={handleClose}
            variant="outline"
            className="w-full rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
