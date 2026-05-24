import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getPersonName(entry, prefix) {
  return (
    entry?.[`${prefix}DisplayName`] ||
    entry?.[`${prefix}FullName`] ||
    entry?.[`${prefix}Username`] ||
    "N/A"
  );
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(targets, query) {
  if (!query) return true;
  return targets.some((target) => normalizeSearchValue(target).includes(query));
}

export default function AdminUnitRecordsModal({
  entries = [],
  onClose,
  planningYear,
  totalApproved = 0,
  unit,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    const query = normalizeSearchValue(searchTerm);
    return entries.filter((entry) =>
      matchesSearch(
        [
          entry.titleOfActivities,
          entry.no,
          entry.planningYear,
          formatDate(entry.submittedAt),
          getPersonName(entry, "owner"),
          getPersonName(entry, "reviewer"),
          Number(entry.grandTotal || 0).toLocaleString(),
        ],
        query,
      ),
    );
  }, [entries, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / Number(pageSize)));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = useMemo(() => {
    const size = Number(pageSize);
    const start = (currentPage - 1) * size;
    return filteredEntries.slice(start, start + size);
  }, [currentPage, filteredEntries, pageSize]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="flex max-h-[82vh] w-full max-w-[940px] flex-col overflow-hidden rounded-[1.75rem] bg-[#edf4f3] shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#1f2f74] via-[#243b86] to-[#2a4694] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/18 p-3">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">
                {unit} Approved Entries {planningYear ? `- ${planningYear}` : ""}
              </h3>
              <p className="mt-1 text-sm text-white/75">
                Entries currently included in this unit's approved AWPB plan for this year.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/85 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1 border-b border-slate-200/80 bg-white px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total Approved</p>
            <p className="text-2xl font-bold text-slate-900">₱{formatCurrency(totalApproved)}</p>
          </div>
          <p className="text-sm text-slate-500">{entries.length} approved entries</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search title, submitter, approver, date, number, or amount"
                className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-700">{pagedEntries.length}</span>{" "}
                of <span className="font-semibold text-slate-700">{filteredEntries.length}</span>{" "}
                approved entries
              </p>
              <Select
                value={pageSize}
                onValueChange={(value) => {
                  setPageSize(value);
                  setPage(1);
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
              <col className="w-[150px]" />
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[165px]" />
            </colgroup>
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="px-5 py-3 text-left font-semibold text-slate-700">Title</th>
                <th className="px-5 py-3 text-center font-semibold text-slate-700">No.</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-700">Submitted</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-700">Submitted By</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-700">Approved By</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">
                    <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
                    <p>{entries.length === 0 ? "No approved entries yet" : "No matching approved entries"}</p>
                    <p className="text-sm">
                      {entries.length === 0
                        ? `Approved entries for ${unit} will appear here.`
                        : "Try a broader search term or change the page size."}
                    </p>
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="truncate px-5 py-3 font-medium text-slate-800">
                      {entry.titleOfActivities || "-"}
                    </td>
                    <td className="px-5 py-3 text-center text-slate-600">
                      {entry.no || "-"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(entry.submittedAt)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {getPersonName(entry, "owner")}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {entry.reviewedAt ? getPersonName(entry, "reviewer") : "N/A"}
                    </td>
                    <td className="px-5 py-3 font-semibold text-red-600">
                      ₱{formatCurrency(entry.grandTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {filteredEntries.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Page <span className="font-semibold text-slate-700">{currentPage}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border-slate-200"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl border-slate-200"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-white p-4">
          <Button
            type="button"
            onClick={onClose}
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
