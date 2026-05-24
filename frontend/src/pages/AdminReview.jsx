import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Eye, Trash2, History, Pencil, Download, Upload } from "lucide-react";

import AdminEntryReviewModal from "../components/admin/AdminEntryReviewModal";
import AdminDeleteEntryModal from "../components/admin/AdminDeleteEntryModal";
import AdminBudgetRecordsModal from "../components/admin/AdminBudgetRecordsModal";
import AdminUnitAllocationModal from "../components/admin/AdminUnitAllocationModal";
import AdminUnitRecordsModal from "../components/admin/AdminUnitRecordsModal";

import { supabase } from "../lib/supabase";
import { budgetPlanningService, entriesService } from "../services/supabaseService";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UNIT_CODES, normalizeUnitCode } from "@/lib/units";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatPlanningBalance(value) {
  const numericValue = Number(value || 0);
  if (numericValue === 0) return "Balanced";
  if (numericValue > 0) return formatCurrency(numericValue);

  return `${formatCurrency(Math.abs(numericValue))} over estimate`;
}

function parseAmountInput(value) {
  return Number(String(value || "").replace(/,/g, ""));
}

function formatDate(value) {
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

function formatUnitCode(unit) {
  return normalizeUnitCode(unit);
}

function getStatusBadgeVariant(status) {
  switch (status) {
    case "Pending Review":
      return "statusPending";
    case "Returned":
      return "statusReturned";
    case "Approved":
      return "statusApproved";
    case "Rejected":
      return "statusRejected";
    default:
      return "outline";
  }
}

function getStatusLabel(status) {
  return status === "Pending Review" ? "Pending" : status;
}

function isApprovedStatus(status) {
  return String(status || "").trim().toLowerCase() === "approved";
}

const gradientButtonClass =
  "border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]";

const CURRENT_YEAR = String(new Date().getFullYear());

export default function AdminReview({
  currentUser,
  entries: entriesProp = [],
  onReplaceEntry,
  onRemoveEntry,
  onImportEntries,
  onUpdateEntry,
  onDeleteEntry,
  onShowToast,
}) {
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);
  const [totalBudget, setTotalBudget] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [budgetDataStatus, setBudgetDataStatus] = useState("loading");
  const [transactionsStatus, setTransactionsStatus] = useState("idle");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const budgetDataReadyRef = useRef(false);

  // Unit-specific budget state
  const UNITS = UNIT_CODES;
  const [unitBudgets, setUnitBudgets] = useState({});
  const [activeUnitBudgetModal, setActiveUnitBudgetModal] = useState(null);
  const [activeUnitHistoryModal, setActiveUnitHistoryModal] = useState(null);
  const [unitBudgetAmount, setUnitBudgetAmount] = useState("");
  const [unitBudgetDesc, setUnitBudgetDesc] = useState("");
  const [unitBudgetAdjustmentType, setUnitBudgetAdjustmentType] = useState("ADDED");
  const [reviewActionBusy, setReviewActionBusy] = useState(false);
  const [reviewBusyAction, setReviewBusyAction] = useState("");
  const [pdfExportingEntryId, setPdfExportingEntryId] = useState(null);
  const [csvExporting, setCsvExporting] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [deleteActionBusy, setDeleteActionBusy] = useState(false);
  const [unitAllocationSaving, setUnitAllocationSaving] = useState(false);
  const csvImportInputRef = useRef(null);

  const entries = entriesProp;
  const currentAdminId = currentUser?.id || null;

  const approvedEntries = useMemo(() => {
    return entries.filter(
      (e) => isApprovedStatus(e.status) && String(e.planningYear) === yearFilter,
    );
  }, [entries, yearFilter]);

  const approvedBudgetByUnit = useMemo(() => {
    const totals = Object.fromEntries(UNITS.map((unit) => [unit, 0]));
    approvedEntries.forEach((entry) => {
      const unit = normalizeUnitCode(entry.unit);
      totals[unit] = (totals[unit] || 0) + Number(entry.grandTotal || 0);
    });
    return totals;
  }, [UNITS, approvedEntries]);

  const totalApprovedBudget = useMemo(() => {
    return Object.values(approvedBudgetByUnit).reduce((sum, value) => sum + value, 0);
  }, [approvedBudgetByUnit]);

  const approvedCountByUnit = useMemo(() => {
    const totals = Object.fromEntries(UNITS.map((unit) => [unit, 0]));
    approvedEntries.forEach((entry) => {
      const unit = normalizeUnitCode(entry.unit);
      totals[unit] = (totals[unit] || 0) + 1;
    });
    return totals;
  }, [UNITS, approvedEntries]);

  const unitAllocationStats = useMemo(() => {
    return Object.fromEntries(
      UNITS.map((unit) => {
        const estimate = Number(unitBudgets[unit] || 0);
        const approved = Number(approvedBudgetByUnit[unit] || 0);
        return [
          unit,
          {
            estimate,
            approved,
            approvedCount: Number(approvedCountByUnit[unit] || 0),
            variance: estimate - approved,
          },
        ];
      }),
    );
  }, [UNITS, approvedBudgetByUnit, approvedCountByUnit, unitBudgets]);

  const totalPlanningEstimate = totalBudget;
  const totalVariance = totalPlanningEstimate - totalApprovedBudget;
  const isBudgetDataLoading = budgetDataStatus === "loading";
  const isBudgetDataUnavailable = budgetDataStatus === "unavailable";
  const planningEstimateLabel = isBudgetDataLoading
    ? "Syncing..."
    : isBudgetDataUnavailable
      ? "Unavailable"
      : formatCurrency(totalPlanningEstimate);
  const planningBalanceLabel = isBudgetDataLoading
    ? "Syncing..."
    : isBudgetDataUnavailable
      ? "Unavailable"
      : formatPlanningBalance(totalVariance);

  const approvedEntriesByUnit = useMemo(() => {
    return Object.fromEntries(
      UNITS.map((unit) => [
        unit,
        approvedEntries.filter((entry) => normalizeUnitCode(entry.unit) === unit),
      ]),
    );
  }, [UNITS, approvedEntries]);

  const availableYears = useMemo(() => {
    return [
      ...new Set([
        CURRENT_YEAR,
        ...entries.map((entry) => entry.planningYear).filter(Boolean).map(String),
      ]),
    ].sort((a, b) => Number(b) - Number(a) || String(b).localeCompare(String(a)));
  }, [entries]);

  const entriesForSelectedYear = useMemo(() => {
    return entries.filter((entry) => String(entry.planningYear) === yearFilter);
  }, [entries, yearFilter]);

  const availableUnits = useMemo(() => {
    return [
      ...new Set(entriesForSelectedYear.map((entry) => normalizeUnitCode(entry.unit)).filter(Boolean)),
    ].sort();
  }, [entriesForSelectedYear]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return entriesForSelectedYear.filter((entry) => {
      const matchesSearch =
        normalizedSearch === "" ||
        entry.titleOfActivities?.toLowerCase().includes(normalizedSearch) ||
        entry.performanceIndicator?.toLowerCase().includes(normalizedSearch) ||
        entry.subActivity?.toLowerCase().includes(normalizedSearch) ||
        normalizeUnitCode(entry.unit).toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" || entry.status === statusFilter;

      const matchesUnit = unitFilter === "all" || normalizeUnitCode(entry.unit) === unitFilter;

      return matchesSearch && matchesStatus && matchesUnit;
    });
  }, [entriesForSelectedYear, searchTerm, statusFilter, unitFilter]);

  useEffect(() => {
    if (unitFilter !== "all" && !availableUnits.includes(unitFilter)) {
      setUnitFilter("all");
    }
  }, [availableUnits, unitFilter]);

  const replaceEntryFromDatabase = async (entryId) => {
    const updatedEntry = await entriesService.getById(entryId);
    if (onReplaceEntry) {
      onReplaceEntry(entryId, updatedEntry);
    } else {
      onUpdateEntry?.(entryId, updatedEntry);
    }
    return updatedEntry;
  };

  const removeEntryFromState = (entryId) => {
    if (onRemoveEntry) {
      onRemoveEntry(entryId);
    } else {
      onDeleteEntry?.(entryId);
    }
  };

  const insertBudgetTransaction = async (transaction) => {
    const payload = {
      ...transaction,
      actor_id: currentAdminId,
      actor_name: currentUser?.fullName || currentUser?.username || "",
      planning_year: Number(yearFilter),
    };

    const { error } = await supabase.from("budget_transactions").insert(payload);
    if (error) throw error;
    setTransactionsStatus("idle");
  };

  const invalidateBudgetRecords = useCallback(() => {
    setTransactionsStatus("idle");
  }, []);

  const handleApprove = async (note) => {
    if (!selectedEntry || reviewActionBusy) return;
    if (isApprovedStatus(selectedEntry.status)) {
      onShowToast?.({
        title: "Already approved",
        description:
          "This entry has already been approved, so the approved plan total was not counted again.",
        type: "info",
      });
      return;
    }

    const entryAmount = selectedEntry.grandTotal || 0;
    const entryTitle = selectedEntry.titleOfActivities;
    const entryUnit = normalizeUnitCode(selectedEntry.unit);

    setReviewActionBusy(true);
    setReviewBusyAction("approve");

    try {
      const { error } = await supabase.rpc("admin_approve_entry", {
        p_entry_id: selectedEntry.id,
        p_note: note || "",
      });
      if (error) throw error;

      await replaceEntryFromDatabase(selectedEntry.id).catch((refreshError) => {
        console.error("Failed to refresh approved entry:", refreshError);
      });
      invalidateBudgetRecords();
      await loadPlanningData().catch((refreshError) => {
        console.error("Failed to refresh planning data after approval:", refreshError);
      });
      setSelectedEntry(null);
      onShowToast?.({
        title: "Entry approved",
        description: `${entryTitle} was approved successfully. ${entryUnit}'s approved plan total now includes ₱${entryAmount.toLocaleString()}.`,
        type: "success",
      });
    } catch (err) {
      console.error("Failed to approve entry:", err);
      const isDuplicateApproval =
        err.code === "23505" ||
        err.message?.toLowerCase?.().includes("already approved");
      if (isDuplicateApproval) {
        await replaceEntryFromDatabase(selectedEntry.id).catch(() => null);
        invalidateBudgetRecords();
        await loadPlanningData().catch(() => null);
        setSelectedEntry(null);
      }
      onShowToast?.({
        title: isDuplicateApproval ? "Already approved" : "Could not approve entry",
        description: isDuplicateApproval
          ? "This entry already has an approval record. The approved plan total was not counted again."
          : err.message || "Please try again.",
        type: isDuplicateApproval ? "info" : "error",
      });
    } finally {
      setReviewActionBusy(false);
      setReviewBusyAction("");
    }
  };

  const handleGenerateApprovedEntry = async (entry) => {
    if (!isApprovedStatus(entry.status) || pdfExportingEntryId) return;

    setPdfExportingEntryId(entry.id);
    try {
      const { generateApprovedEntryPdf } = await import("../services/pdfService");
      const { filename } = await generateApprovedEntryPdf(entry);
      onShowToast?.({
        title: "PDF generated",
        description: `${filename} is ready for printing.`,
        type: "success",
      });
    } catch {
      onShowToast?.({
        title: "PDF generation failed",
        description: "Could not generate the approved entry PDF.",
        type: "error",
      });
    } finally {
      setPdfExportingEntryId(null);
    }
  };

  const handleExportApprovedEntriesToCSV = async () => {
    if (csvExporting) return;

    setCsvExporting(true);
    try {
      const { csvExportService } = await import("../services/csvService");
      const result = await csvExportService.exportApprovedEntriesToCSV(yearFilter);
      onShowToast?.({
        title: "CSV export successful",
        description: `Exported ${result.recordCount} approved ${yearFilter} entries to ${result.filename}`,
        type: "success",
      });
    } catch (error) {
      onShowToast?.({
        title: "CSV export failed",
        description: error.message || "Could not export approved entries to CSV.",
        type: "error",
      });
    } finally {
      setCsvExporting(false);
    }
  };

  const handleImportCsvClick = () => {
    if (csvImporting) return;
    csvImportInputRef.current?.click();
  };

  const handleImportApprovedEntriesFromCSV = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || csvImporting) return;

    setCsvImporting(true);
    try {
      const { csvImportService } = await import("../services/csvService");
      const result = await csvImportService.importEntriesFromCSV(file);
      onImportEntries?.(result.createdEntries);

      const failedText =
        result.failedRows.length > 0
          ? ` ${result.failedRows.length} row${result.failedRows.length === 1 ? "" : "s"} could not be imported.`
          : "";

      onShowToast?.({
        title: "CSV import successful",
        description: `Imported ${result.importedCount} entr${result.importedCount === 1 ? "y" : "ies"} as Pending Review.${failedText}`,
        type: result.failedRows.length > 0 ? "info" : "success",
      });
    } catch (error) {
      onShowToast?.({
        title: "CSV import failed",
        description: error.message || "Could not import entries from the CSV file.",
        type: "error",
      });
    } finally {
      setCsvImporting(false);
    }
  };
  
  const handleReturn = async (note) => {
    if (!selectedEntry || reviewActionBusy) return;
    setReviewActionBusy(true);
    setReviewBusyAction("return");
    const entryTitle = selectedEntry.titleOfActivities;
    const oldStatus = selectedEntry.status;
    const newStatus = "Returned";
    const entryAmount = selectedEntry.grandTotal || 0;

    try {
      const { error } = await supabase.rpc("admin_set_entry_review_status", {
        p_entry_id: selectedEntry.id,
        p_status: newStatus,
        p_note: note || "",
      });
      if (error) throw error;

      await replaceEntryFromDatabase(selectedEntry.id).catch((refreshError) => {
        console.error("Failed to refresh returned entry:", refreshError);
      });
      invalidateBudgetRecords();
      await loadPlanningData().catch((refreshError) => {
        console.error("Failed to refresh planning data after return:", refreshError);
      });
      setSelectedEntry(null);
      onShowToast?.({
        title: "Entry returned",
        description: `${entryTitle} was returned for revision.${isApprovedStatus(oldStatus) ? ` ₱${entryAmount.toLocaleString()} was removed from the approved plan total.` : ""}`,
        type: "success",
      });
    } catch (err) {
      console.error("Failed to return entry:", err);
      onShowToast?.({
        title: "Could not return entry",
        description: err.message || "Please try again.",
        type: "error",
      });
    } finally {
      setReviewActionBusy(false);
      setReviewBusyAction("");
    }
  };

  const handleReject = async (note) => {
    if (!selectedEntry || reviewActionBusy) return;
    setReviewActionBusy(true);
    setReviewBusyAction("reject");
    const entryTitle = selectedEntry.titleOfActivities;
    const oldStatus = selectedEntry.status;
    const newStatus = "Rejected";
    const entryAmount = selectedEntry.grandTotal || 0;

    try {
      const { error } = await supabase.rpc("admin_set_entry_review_status", {
        p_entry_id: selectedEntry.id,
        p_status: newStatus,
        p_note: note || "",
      });
      if (error) throw error;

      await replaceEntryFromDatabase(selectedEntry.id).catch((refreshError) => {
        console.error("Failed to refresh rejected entry:", refreshError);
      });
      invalidateBudgetRecords();
      await loadPlanningData().catch((refreshError) => {
        console.error("Failed to refresh planning data after rejection:", refreshError);
      });
      setSelectedEntry(null);
      onShowToast?.({
        title: "Entry rejected",
        description: `${entryTitle} was rejected.${isApprovedStatus(oldStatus) ? ` ₱${entryAmount.toLocaleString()} was removed from the approved plan total.` : ""}`,
        type: "success",
      });
    } catch (err) {
      console.error("Failed to reject entry:", err);
      onShowToast?.({
        title: "Could not reject entry",
        description: err.message || "Please try again.",
        type: "error",
      });
    } finally {
      setReviewActionBusy(false);
      setReviewBusyAction("");
    }
  };
    

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setUnitFilter("all");
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteActionBusy) return;
    const entryTitle = deleteTarget.titleOfActivities;
    const entryAmount = Number(deleteTarget.grandTotal || 0);
    const entryStatus = deleteTarget.status;
    const entryUnit = normalizeUnitCode(deleteTarget.unit);
    const shouldAdjustApprovedTotal = isApprovedStatus(entryStatus) && entryAmount > 0;

    setDeleteActionBusy(true);
    try {
      const { error } = await supabase.rpc("admin_delete_review_entry", {
        p_entry_id: deleteTarget.id,
      });
      if (error) throw error;

      removeEntryFromState(deleteTarget.id);
      invalidateBudgetRecords();
      await loadPlanningData().catch((refreshError) => {
        console.error("Failed to refresh planning data after delete:", refreshError);
      });
      onShowToast?.({
        title: "Entry deleted",
        description: `${entryTitle} was removed successfully.${
          shouldAdjustApprovedTotal
            ? ` ₱${entryAmount.toLocaleString()} was removed from ${entryUnit}'s approved plan total.`
            : ""
        }`,
        type: "success",
      });
      if (selectedEntry?.id === deleteTarget.id) {
        setSelectedEntry(null);
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete entry from Supabase:", err);
      onShowToast?.({
        title: "Could not delete entry",
        description: err.message || "Please try again.",
        type: "error",
      });
    } finally {
      setDeleteActionBusy(false);
    }
  };
  const loadPlanningData = useCallback(async () => {
    setBudgetDataStatus(budgetDataReadyRef.current ? "refreshing" : "loading");
    try {
      const rows = await budgetPlanningService.getUnitStats(yearFilter);
      const budgets = Object.fromEntries(UNITS.map((unit) => [unit, 0]));

      rows.forEach((row) => {
        budgets[normalizeUnitCode(row.unit)] = Number(row.planningEstimate || 0);
      });

      setUnitBudgets(budgets);
      setTotalBudget(UNITS.reduce((sum, unit) => sum + Number(budgets[unit] || 0), 0));
      budgetDataReadyRef.current = true;
      setBudgetDataStatus("ready");
    } catch (err) {
      console.error("Failed to load planning stats:", err);
      setBudgetDataStatus(budgetDataReadyRef.current ? "ready" : "unavailable");
    }
  }, [UNITS, yearFilter]);

  const loadBudgetRecords = useCallback(async () => {
    if (transactionsStatus === "loading") return;

    setTransactionsStatus("loading");
    try {
      let {data: txData, error: txError} = await supabase
        .from("budget_transactions")
        .select("*, actor:profiles!actor_id(username, full_name)")
        .eq("planning_year", Number(yearFilter))
        .order("created_at", { ascending: false });

      if (txError?.message?.includes("actor_id") || txError?.message?.includes("relationship")) {
        const fallback = await supabase
          .from("budget_transactions")
          .select("*")
          .eq("planning_year", Number(yearFilter))
          .order("created_at", { ascending: false });
        txData = fallback.data;
        txError = fallback.error;
      }

      if (txError) throw txError;

      const actorIds = [
        ...new Set(
          (txData || [])
            .filter((tx) => tx.actor_id && !tx.actor)
            .map((tx) => tx.actor_id),
        ),
      ];

      if (actorIds.length > 0) {
        const { data: actorProfiles, error: actorError } = await supabase
          .from("profiles")
          .select("id, username, full_name")
          .in("id", actorIds);

        if (!actorError) {
          const actorsById = Object.fromEntries(
            (actorProfiles || []).map((profile) => [profile.id, profile]),
          );
          txData = (txData || []).map((tx) => ({
            ...tx,
            actor: tx.actor || actorsById[tx.actor_id] || null,
          }));
        }
      }

      setTransactions(
        (txData || [])
          .filter((tx) => tx.unit)
          .map((tx) => ({ ...tx, unit: normalizeUnitCode(tx.unit) })),
      );
      setTransactionsStatus("ready");
    } catch (err) {
      console.error("Failed to load planning budget records:", err);
      setTransactionsStatus("unavailable");
    }
  }, [transactionsStatus, yearFilter]);

  const handleOpenHistoryModal = useCallback(() => {
    setShowHistoryModal(true);
    if (transactionsStatus !== "ready") {
      void loadBudgetRecords();
    }
  }, [loadBudgetRecords, transactionsStatus]);

  useEffect(() => {
    setTransactions([]);
    setTransactionsStatus("idle");
  }, [yearFilter]);

  const closeUnitAllocationModal = () => {
    setActiveUnitBudgetModal(null);
    setUnitBudgetAmount("");
    setUnitBudgetDesc("");
    setUnitBudgetAdjustmentType("ADDED");
  };

  const handleSaveUnitAllocation = async () => {
    if (unitAllocationSaving) return;

    const amount = parseAmountInput(unitBudgetAmount);
    const unit = activeUnitBudgetModal;
    if (!amount || amount <= 0) {
      onShowToast?.({
        title: "Invalid amount",
        description: "Please enter a valid planning estimate amount.",
        type: "error",
      });
      return;
    }

    if (unitBudgetAdjustmentType === "DEDUCTED" && amount > Number(unitBudgets[unit] || 0)) {
      onShowToast?.({
        title: "Adjustment exceeds planning estimate",
        description: `${unit}'s current planning estimate is ₱${Number(unitBudgets[unit] || 0).toLocaleString()}.`,
        type: "error",
      });
      return;
    }

    setUnitAllocationSaving(true);
    try {
      await insertBudgetTransaction({
        amount: amount,
        type: unitBudgetAdjustmentType,
        description:
          unitBudgetDesc ||
          (unitBudgetAdjustmentType === "ADDED"
            ? `Additional ${yearFilter} planning estimate for ${unit}`
            : `${yearFilter} planning estimate reduction for ${unit}`),
        unit: normalizeUnitCode(unit),
      });
      invalidateBudgetRecords();
      await loadPlanningData();
      closeUnitAllocationModal();
      onShowToast({
        title: "Planning estimate updated",
        description: `${unit}'s estimate was ${unitBudgetAdjustmentType === "ADDED" ? "increased" : "reduced"} by ₱${amount.toLocaleString()}.`,
        type: "success",
      });
    } catch (err) {
      console.error("Failed to update unit planning estimate:", err);
      onShowToast({
        title: "Could not update planning estimate",
        description: err.message || "Please try again.",
        type: "error",
      });
    } finally {
      setUnitAllocationSaving(false);
    }
  };

      useEffect(() => {
        loadPlanningData();
      }, [loadPlanningData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Admin Review
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review submitted AWPB entries and update their status.
        </p>
      </div>
      
      <Card className="border-0 bg-gradient-to-br from-[#6ea3a6] via-[#4f8f93] to-[#2f7f86] text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
        <CardContent className="px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-bold tracking-tight text-white">
                    Planning Summary
                  </p>
                  <Badge className="border border-white/25 bg-white/18 px-2.5 py-1 text-sm font-semibold text-white">
                    {yearFilter}
                  </Badge>
                </div>
                <p className="mt-0.5 max-w-3xl text-sm text-white/85">
                  Planning year {yearFilter} across all units.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-full min-w-[150px] border-white/35 bg-white/10 text-white shadow-sm sm:w-[150px]">
                    <SelectValue placeholder="Planning Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleOpenHistoryModal}
                  disabled={isBudgetDataLoading}
                  variant="outline"
                  className="w-fit rounded-xl border-white/35 bg-white/10 text-white shadow-sm hover:bg-white/20 hover:text-white"
                >
                  <History className="mr-2 h-4 w-4" />
                  View Records
                </Button>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-3">
              <div className="rounded-2xl bg-white/16 px-4 py-3 shadow-inner shadow-white/5">
                <p className="text-sm font-medium text-white/70">Planning Estimate</p>
                <p className="mt-1 text-2xl font-bold leading-none text-white">
                  {planningEstimateLabel}
                </p>
              </div>
              <div className="rounded-2xl bg-white/18 px-4 py-3 shadow-inner shadow-white/5">
                <p className="text-sm font-medium text-white/75">Planning Balance</p>
                <p className={`mt-1 whitespace-normal break-words text-2xl font-bold leading-none ${!isBudgetDataLoading && !isBudgetDataUnavailable && totalVariance < 0 ? "text-red-200" : "text-white"}`}>
                  {planningBalanceLabel}
                </p>
              </div>
              <div className="rounded-2xl bg-white/22 px-4 py-3 shadow-inner shadow-white/5">
                <p className="text-sm font-medium text-white/70">Approved Plan</p>
                <p className="mt-1 text-2xl font-bold leading-none text-white">
                  {formatCurrency(totalApprovedBudget)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

{showHistoryModal && (
  <AdminBudgetRecordsModal
    approvedEntries={approvedEntries}
    onClose={() => setShowHistoryModal(false)}
    planningYear={yearFilter}
    transactions={transactions}
  />
)}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {UNITS.map((unit) => {
          const stats = unitAllocationStats[unit] || {};
          const unitEstimateLabel = isBudgetDataLoading
            ? "Loading..."
            : isBudgetDataUnavailable
              ? "Unavailable"
              : formatCurrency(stats.estimate);
          const unitBalanceLabel = isBudgetDataLoading
            ? "Loading..."
            : isBudgetDataUnavailable
              ? "Unavailable"
              : formatPlanningBalance(stats.variance);
          const isUnitOverEstimate =
            !isBudgetDataLoading &&
            !isBudgetDataUnavailable &&
            Number(stats.variance || 0) < 0;
          return (
            <Card
              key={unit}
              className="flex min-h-[360px] overflow-hidden border-0 bg-gradient-to-br from-[#1f2f74] via-[#243b86] to-[#2a4694] text-white shadow-[0_10px_22px_rgba(31,47,116,0.18)]"
            >
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex items-start justify-between gap-2 min-[1500px]:gap-3">
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-white/60 min-[1500px]:text-xs min-[1500px]:tracking-wide">
                        Unit Planning
                      </p>
                      <h2 className="mt-1 text-3xl font-bold tracking-tight">{unit}</h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white/70 min-[1500px]:text-sm">Approved Entries</p>
                      <p className="whitespace-nowrap text-3xl font-bold leading-tight">
                        {Number(stats.approvedCount || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/12 px-4 py-3 shadow-inner shadow-white/5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Approved Plan
                    </p>
                    <p className="mt-1 truncate text-2xl font-bold leading-tight text-white" title={formatCurrency(stats.approved)}>
                      {formatCurrency(stats.approved)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-white/15 pt-3">
                    <div className="min-w-0">
                      <p className="text-xs text-white/55">Planning Estimate</p>
                      <p className="mt-1 truncate text-sm font-semibold" title={unitEstimateLabel}>
                        {unitEstimateLabel}
                      </p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-xs text-white/55">Planning Balance</p>
                      <p
                        className={`mt-1 whitespace-normal break-words text-sm font-semibold leading-snug ${
                          isUnitOverEstimate ? "text-red-300" : ""
                        }`}
                        title={unitBalanceLabel}
                      >
                        {unitBalanceLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => setActiveUnitBudgetModal(unit)}
                      disabled={isBudgetDataLoading}
                      className="flex-1 rounded-xl bg-white text-slate-900 hover:bg-slate-100"
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit Estimate
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setActiveUnitHistoryModal(unit)}
                      disabled={isBudgetDataLoading}
                      variant="outline"
                      className="flex-1 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    >
                      <History className="mr-1.5 h-3.5 w-3.5" />
                      Records
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeUnitBudgetModal && (
        <AdminUnitAllocationModal
          adjustmentType={unitBudgetAdjustmentType}
          amount={unitBudgetAmount}
          description={unitBudgetDesc}
          onAmountChange={setUnitBudgetAmount}
          onClose={closeUnitAllocationModal}
          onDescriptionChange={setUnitBudgetDesc}
          onSave={handleSaveUnitAllocation}
          onTypeChange={setUnitBudgetAdjustmentType}
          estimate={unitAllocationStats[activeUnitBudgetModal]?.estimate || 0}
          planningYear={yearFilter}
          saving={unitAllocationSaving}
          unit={activeUnitBudgetModal}
        />
      )}

      {activeUnitHistoryModal && (
        <AdminUnitRecordsModal
          entries={approvedEntriesByUnit[activeUnitHistoryModal] || []}
          onClose={() => setActiveUnitHistoryModal(null)}
          planningYear={yearFilter}
          totalApproved={unitAllocationStats[activeUnitHistoryModal]?.approved || 0}
          unit={activeUnitHistoryModal}
        />
      )}

      <Card className="overflow-hidden border-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] gap-0 py-0">
        <CardHeader className="border-b bg-white px-6 pt-5 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-2xl">All Submitted Entries</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Search and filter {yearFilter} submissions for admin review.
              </p>
              <p className="mt-6 text-sm text-slate-500">
                Showing {filteredEntries.length} of {entriesForSelectedYear.length} {yearFilter} entries
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[280px_125px_115px_auto_auto_auto] xl:w-auto xl:justify-start">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search title, sub activity, or unit"
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                  <SelectItem value="Returned">Returned</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                </SelectContent>
              </Select>

              <Select value={unitFilter} onValueChange={setUnitFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Units</SelectItem>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {formatUnitCode(unit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={clearFilters} className={`whitespace-nowrap ${gradientButtonClass}`}>
                Reset Filters
              </Button>
              <Button
                onClick={handleExportApprovedEntriesToCSV}
                disabled={csvExporting}
                className={`whitespace-nowrap disabled:cursor-wait disabled:opacity-75 ${gradientButtonClass}`}
              >
                <Download size={16} />
                {csvExporting ? "Exporting CSV..." : `Export ${yearFilter} CSV`}
              </Button>
              <Button
                type="button"
                onClick={handleImportCsvClick}
                disabled={csvImporting}
                className={`whitespace-nowrap disabled:cursor-wait disabled:opacity-75 ${gradientButtonClass}`}
              >
                <Upload size={16} />
                {csvImporting ? "Importing CSV..." : "Import CSV"}
              </Button>
              <input
                ref={csvImportInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportApprovedEntriesFromCSV}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredEntries.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No entries match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[13%]" />
                  <col className="w-[8%]" />
                </colgroup>

                <thead className="bg-slate-50 text-left">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Title</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">No.</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Year</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Submitted</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-700">Total</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-b-0">
                      <td className="px-4 py-4">
                        <p className="truncate font-medium text-slate-900" title={entry.titleOfActivities}>
                          {entry.titleOfActivities}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{entry.no || 'N/A'}</td>
                      <td className="px-4 py-4 font-medium text-slate-700" title={entry.unit}>
                        {formatUnitCode(entry.unit)}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{entry.planningYear || "N/A"}</td>
                      <td className="px-4 py-4 text-slate-700">{formatDate(entry.submittedAt)}</td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <Badge variant={getStatusBadgeVariant(entry.status)}>
                          {getStatusLabel(entry.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-right font-medium whitespace-nowrap text-slate-900">
                        {formatCurrency(entry.grandTotal)}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => !reviewActionBusy && setSelectedEntry(entry)}
                            disabled={reviewActionBusy}
                            title="Review entry"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Eye />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => !deleteActionBusy && setDeleteTarget(entry)}
                            disabled={deleteActionBusy}
                            title="Delete entry"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AdminEntryReviewModal
        entry={selectedEntry}
        actionBusy={reviewActionBusy}
        busyAction={reviewBusyAction}
        onClose={() => setSelectedEntry(null)}
        onApprove={handleApprove}
        onReturn={handleReturn}
        onReject={handleReject}
        onGenerateApprovedEntry={handleGenerateApprovedEntry}
        pdfExporting={pdfExportingEntryId === selectedEntry?.id}
      />

      <AdminDeleteEntryModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        entry={deleteTarget}
        onConfirm={handleDelete}
        busy={deleteActionBusy}
        
      />
    </div>

  );
}
