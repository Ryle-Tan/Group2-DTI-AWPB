import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  History,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { archiveBackupService } from "@/services/supabaseService";
import { csvExportService } from "@/services/csvService";

function formatDateTime(value) {
  if (!value) return "Not yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBackupStatusBadge(done) {
  return done ? (
    <Badge variant="statusApproved">
      <CheckCircle2 size={14} />
      Done
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Not done
    </Badge>
  );
}

const BACKUP_EVENT_META = {
  csv_backup_downloaded: {
    label: "CSV Downloaded",
    className: "border-teal-200 bg-teal-50 text-teal-700",
  },
  database_backup_confirmed: {
    label: "Legacy Confirmation",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  cleanup_completed: {
    label: "Cleanup Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

function getBackupEventMeta(eventType) {
  return (
    BACKUP_EVENT_META[eventType] || {
      label: "Backup Activity",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    }
  );
}

function getYearStatusCounts(entries) {
  return entries.reduce(
    (acc, entry) => {
      const status = String(entry.status || "").trim().toLowerCase();
      if (status === "approved") acc.approved += 1;
      else if (status === "pending review" || status === "pending") acc.pending += 1;
      else if (status === "returned" || status === "return") acc.returned += 1;
      else if (status === "rejected") acc.rejected += 1;
      else acc.other += 1;
      return acc;
    },
    { approved: 0, pending: 0, returned: 0, rejected: 0, other: 0 },
  );
}

function getYearBadgeLabel(row) {
  if (Number(row.year) > Number(row.currentYear)) return "Future year";
  if (row.isCurrentYear) return "Current year";
  return "Previous year";
}

function getYearBadgeClass(row) {
  if (Number(row.year) > Number(row.currentYear)) {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  if (row.isCurrentYear) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getCleanupStatusMessage(row, cleanupUnlocked) {
  if (row.cleanupMarked && row.entryCount > 0) {
    return "Cleanup was previously marked complete, but entries still exist. Run cleanup again.";
  }
  if (row.cleanupDone) return "This planning year has already been cleaned up.";
  if (!row.isCleanupYearAllowed) {
    return `Only years before ${row.currentYear} can be cleaned up.`;
  }
  if (!row.csvDone) {
    return "CSV backup must be recorded in Supabase first.";
  }
  if (cleanupUnlocked) return "Type the planning year to permanently clean this data.";
  return "Cleanup is not available for this planning year.";
}

function BackupActivityHistoryModal({ backupHistoryRows, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[1.75rem] bg-[#edf4f3] shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#6ea3a6] via-[#4f8f93] to-[#2f7f86] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/18 p-3">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Backup Activity History</h3>
              <p className="mt-1 text-sm text-white/80">
                CSV downloads and archive cleanup records.
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

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {backupHistoryRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              No backup activity yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <div className="max-h-[64vh] overflow-auto">
                <div className="hidden grid-cols-[100px_190px_1.5fr_1fr] gap-4 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500 xl:grid">
                  <span>Year</span>
                  <span>Activity</span>
                  <span>Reference</span>
                  <span>Recorded By</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {backupHistoryRows.map((event) => {
                    const meta = getBackupEventMeta(event.event_type);

                    return (
                      <div
                        key={event.id}
                        className="grid gap-4 px-4 py-4 text-sm xl:grid-cols-[100px_190px_1.5fr_1fr]"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {event.planning_year}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-400 xl:hidden">
                            Activity
                          </p>
                          <Badge variant="outline" className={meta.className}>
                            {meta.label}
                          </Badge>
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-slate-400 xl:hidden">
                            Reference
                          </p>
                          <p className="break-words font-medium text-slate-900">
                            {event.reference || "No reference"}
                          </p>
                          {event.record_count !== null && event.record_count !== undefined ? (
                            <p className="mt-1 text-slate-500">
                              {event.record_count} record
                              {Number(event.record_count) === 1 ? "" : "s"}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase text-slate-400 xl:hidden">
                            Recorded By
                          </p>
                          <p className="font-medium text-slate-900">
                            {event.actor_name || "Unknown admin"}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {formatDateTime(event.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArchiveCleanup({
  entries = [],
  onCleanupYear,
  onShowToast,
}) {
  const currentYear = String(new Date().getFullYear());
  const [backups, setBackups] = useState([]);
  const [backupEvents, setBackupEvents] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [actionKey, setActionKey] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [cleanupConfirmDrafts, setCleanupConfirmDrafts] = useState({});

  const backupsByYear = useMemo(() => {
    return backups.reduce((acc, backup) => {
      acc[String(backup.planning_year)] = backup;
      return acc;
    }, {});
  }, [backups]);

  const yearRows = useMemo(() => {
    const years = [
      ...new Set([
        ...entries.map((entry) => String(entry.planningYear)).filter(Boolean),
        ...backups.map((backup) => String(backup.planning_year)).filter(Boolean),
      ]),
    ].sort((a, b) => Number(b) - Number(a));

    if (years.length === 0) years.push(currentYear);

    return years
      .map((year) => {
        const yearEntries = entries.filter(
          (entry) => String(entry.planningYear || "") === String(year),
        );
        const backup = backupsByYear[year] || null;

        return {
          year,
          currentYear,
          entries: yearEntries,
          entryCount: yearEntries.length,
          statusCounts: getYearStatusCounts(yearEntries),
          backup,
          csvDone: Boolean(backup?.csv_generated_at),
          cleanupMarked: Boolean(backup?.cleanup_completed_at),
          cleanupDone: Boolean(backup?.cleanup_completed_at) && yearEntries.length === 0,
          isCurrentYear: year === currentYear,
          isCleanupYearAllowed: Number(year) < Number(currentYear),
        };
      })
      .filter((row) => row.entryCount > 0 || !row.cleanupDone);
  }, [backups, backupsByYear, currentYear, entries]);

  const backupHistoryRows = useMemo(() => {
    return [...backupEvents].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [backupEvents]);

  useEffect(() => {
    let cancelled = false;

    const loadBackups = async () => {
      setLoadingBackups(true);
      try {
        const [backupRows, eventRows] = await Promise.all([
          archiveBackupService.getAll(),
          archiveBackupService.getEvents(),
        ]);
        if (!cancelled) {
          setBackups(backupRows);
          setBackupEvents(eventRows);
        }
      } catch (error) {
        console.error("Failed to load archive backup history:", error);
        onShowToast?.({
          title: "Backup history unavailable",
          description:
            error.message ||
            "Could not load backup history. Make sure the archive backup migration has been applied.",
          type: "error",
        });
      } finally {
        if (!cancelled) setLoadingBackups(false);
      }
    };

    loadBackups();

    return () => {
      cancelled = true;
    };
  }, [onShowToast]);

  const upsertBackupRow = (backup) => {
    setBackups((prev) => {
      const key = String(backup.planning_year);
      const exists = prev.some((row) => String(row.planning_year) === key);
      if (!exists) return [backup, ...prev].sort((a, b) => b.planning_year - a.planning_year);
      return prev.map((row) => (String(row.planning_year) === key ? backup : row));
    });
  };

  const prependBackupEvent = (event) => {
    if (!event) return;
    setBackupEvents((prev) => [event, ...prev]);
  };

  const handleDownloadCsvBackup = async (year) => {
    const key = `csv-${year}`;
    setActionKey(key);

    try {
      const result = csvExportService.createYearlyEntriesBackup(entries, year);
      const { backup, event } = await archiveBackupService.recordCsvBackup({
        planningYear: year,
        filename: result.filename,
        recordCount: result.recordCount,
      });

      csvExportService.downloadCSV(result.csvContent, result.filename);
      upsertBackupRow(backup);
      prependBackupEvent(event);
      onShowToast?.({
        title: "CSV backup recorded",
        description: `${result.recordCount} entr${result.recordCount === 1 ? "y" : "ies"} exported and logged for ${year}.`,
        type: "success",
      });
    } catch (error) {
      console.error("Failed to create CSV backup:", error);
      onShowToast?.({
        title: "CSV backup failed",
        description: error.message || "Could not create or record the CSV backup.",
        type: "error",
      });
    } finally {
      setActionKey("");
    }
  };

  const handleCleanupYear = async (year) => {
    const confirmValue = String(cleanupConfirmDrafts[year] || "").trim();
    if (confirmValue !== String(year)) {
      onShowToast?.({
        title: "Confirmation required",
        description: `Type ${year} before cleaning up this year's data.`,
        type: "error",
      });
      return;
    }

    const key = `cleanup-${year}`;
    setActionKey(key);

    try {
      const result = await archiveBackupService.cleanupYear(year);
      if (result?.backup) upsertBackupRow(result.backup);
      prependBackupEvent(result?.event);
      setCleanupConfirmDrafts((prev) => ({ ...prev, [year]: "" }));
      onCleanupYear?.(year);

      onShowToast?.({
        title: "Year data cleaned up",
        description: `${result?.deleted_entries ?? 0} entr${Number(result?.deleted_entries) === 1 ? "y" : "ies"} removed for ${year}.`,
        type: "success",
      });
    } catch (error) {
      console.error("Failed to clean up year data:", error);
      onShowToast?.({
        title: "Cleanup failed",
        description: error.message || "Could not clean up this year.",
        type: "error",
      });
    } finally {
      setActionKey("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Archive & Cleanup
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Track yearly CSV backups before old AWPB records are cleared from the active
            database.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
            disabled={loadingBackups}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-0 bg-gradient-to-r from-[#0b4f52] via-[#11666b] to-[#16747a] text-white shadow-[0_12px_28px_rgba(11,79,82,0.26)]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-2xl font-bold tracking-tight text-white">
                  Archive Summary
                </p>
                <p className="mt-0.5 max-w-3xl text-sm text-emerald-50/90">
                  Yearly CSV archives and cleanup readiness.
                </p>
              </div>

              <Button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                disabled={loadingBackups}
                variant="outline"
                className="w-fit rounded-xl border-white/35 bg-white/10 text-white shadow-sm hover:bg-white/20 hover:text-white disabled:cursor-wait disabled:opacity-75"
              >
                <History className="mr-2 h-4 w-4" />
                View Records
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-2xl bg-white/16 px-4 py-3 shadow-inner shadow-white/5">
                <div className="rounded-2xl bg-white/15 p-3 text-white ring-1 ring-white/20">
                  <Archive size={20} />
                </div>
                <div>
                  <p className="font-semibold text-white">CSV Backup</p>
                  <p className="mt-1 text-sm text-emerald-50/90">
                    Download a readable yearly archive from the system.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-white/18 px-4 py-3 shadow-inner shadow-white/5">
                <div className="rounded-2xl bg-white/15 p-3 text-white ring-1 ring-white/20">
                  <Lock size={20} />
                </div>
                <div>
                  <p className="font-semibold text-white">Cleanup</p>
                  <p className="mt-1 text-sm text-emerald-50/90">
                    Locked until a CSV backup is recorded. Deletion comes next.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showHistoryModal ? (
        <BackupActivityHistoryModal
          backupHistoryRows={backupHistoryRows}
          onClose={() => setShowHistoryModal(false)}
        />
      ) : null}

      <div className="grid gap-4">
        {yearRows.map((row) => {
          const cleanupConfirm = cleanupConfirmDrafts[row.year] || "";
          const cleanupUnlocked =
            row.isCleanupYearAllowed && row.csvDone && !row.cleanupDone;
          const cleanupStatusMessage = getCleanupStatusMessage(row, cleanupUnlocked);

          return (
            <Card
              key={row.year}
              className="gap-0 overflow-hidden border-0 bg-white py-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            >
              <CardHeader className="border-b border-[#1f2f74]/20 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] px-5 py-4 text-white">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl text-white">Planning Year {row.year}</CardTitle>
                      <Badge variant="outline" className={getYearBadgeClass(row)}>
                        {getYearBadgeLabel(row)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-blue-100">
                      {row.entryCount} entr{row.entryCount === 1 ? "y" : "ies"} recorded
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="statusApproved">Approved {row.statusCounts.approved}</Badge>
                    <Badge variant="statusPending">Pending {row.statusCounts.pending}</Badge>
                    <Badge variant="statusReturned">Returned {row.statusCounts.returned}</Badge>
                    <Badge variant="statusRejected">Rejected {row.statusCounts.rejected}</Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">CSV Backup</p>
                    {getBackupStatusBadge(row.csvDone)}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-500">
                    <p>File: {row.backup?.csv_filename || "Not yet"}</p>
                    <p>Records: {row.backup?.csv_record_count ?? 0}</p>
                    <p>By: {row.backup?.csv_generated_by_name || "Not yet"}</p>
                    <p>At: {formatDateTime(row.backup?.csv_generated_at)}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleDownloadCsvBackup(row.year)}
                    disabled={actionKey === `csv-${row.year}` || row.entryCount === 0}
                    className="mt-4 border-0 bg-gradient-to-r from-[#0b4f52] to-[#16747a] text-white shadow-[0_6px_16px_rgba(11,79,82,0.24)] hover:from-[#083f42] hover:to-[#115f64]"
                  >
                    <Download size={16} />
                    {actionKey === `csv-${row.year}` ? "Recording..." : "Download CSV Backup"}
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">Cleanup</p>
                    {row.cleanupDone ? (
                      <Badge variant="statusApproved">Completed</Badge>
                    ) : cleanupUnlocked ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Ready
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                        Locked
                      </Badge>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {cleanupStatusMessage}
                  </p>
                  {cleanupUnlocked ? (
                    <div className="mt-4 space-y-2">
                      <Input
                        value={cleanupConfirm}
                        onChange={(event) =>
                          setCleanupConfirmDrafts((prev) => ({
                            ...prev,
                            [row.year]: event.target.value,
                          }))
                        }
                        disabled={actionKey === `cleanup-${row.year}`}
                        placeholder={`Type ${row.year} to confirm`}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                        onClick={() => handleCleanupYear(row.year)}
                        disabled={
                          cleanupConfirm.trim() !== String(row.year) ||
                          actionKey === `cleanup-${row.year}`
                        }
                      >
                        {actionKey === `cleanup-${row.year}`
                          ? "Cleaning up..."
                          : `Clean Up ${row.year}`}
                      </Button>
                    </div>
                  ) : row.cleanupDone ? (
                    <Button type="button" variant="outline" className="mt-4 w-full" disabled>
                      <CheckCircle2 size={16} />
                      Cleanup Completed
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="mt-4 w-full" disabled>
                      <Lock size={16} />
                      Cleanup Locked
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
