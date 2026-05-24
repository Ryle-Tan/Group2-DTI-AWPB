import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Database,
  Download,
  History,
  Info,
  Lock,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

function formatDateStamp(value = new Date()) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

function getDefaultDatabaseBackupReference(year) {
  return `AWPB Database Backup - ${year} - Confirmed ${formatDateStamp()}`;
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
    label: "Database Confirmed",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  cleanup_completed: {
    label: "Cleanup Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

const BLUE_MODAL_BUTTON_CLASS =
  "border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] hover:from-[#19265f] hover:to-[#213a80] hover:text-white";

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

function DatabaseBackupGuideButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className={BLUE_MODAL_BUTTON_CLASS}>
          <Info size={16} />
          Database Backup Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Database Backup Guide</DialogTitle>
          <DialogDescription>
            Use this check to confirm a full-system backup is available before
            permanently cleaning up a previous planning year.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">1. Download the CSV backup.</span>{" "}
            This is the readable copy for reports and checking entries.
          </li>
          <li>
            <span className="font-semibold text-slate-900">2. Confirm the database backup.</span>{" "}
            Check that the project has a platform backup available before cleanup.
          </li>
          <li>
            <span className="font-semibold text-slate-900">3. Save the backup reference.</span>{" "}
            The system suggests a default yearly name, but the admin can edit it.
          </li>
          <li>
            <span className="font-semibold text-slate-900">4. Clean up the old year.</span>{" "}
            Cleanup unlocks only after both backup records are complete.
          </li>
        </ol>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function BackupActivityHistoryButton({ backupHistoryRows }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className={BLUE_MODAL_BUTTON_CLASS}>
          <History size={16} />
          Backup Activity History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Backup Activity History</DialogTitle>
          <DialogDescription>
            Review CSV downloads, database backup confirmations, and cleanup activity.
          </DialogDescription>
        </DialogHeader>

        {backupHistoryRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            No backup activity yet.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
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
        )}
      </DialogContent>
    </Dialog>
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
  const [databaseFilenameDrafts, setDatabaseFilenameDrafts] = useState({});
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
          databaseDone: Boolean(backup?.sql_backup_marked_at),
          cleanupDone: Boolean(backup?.cleanup_completed_at),
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
      const result = csvExportService.exportYearlyEntriesBackupToCSV(entries, year);
      const { backup, event } = await archiveBackupService.recordCsvBackup({
        planningYear: year,
        filename: result.filename,
        recordCount: result.recordCount,
      });

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

  const handleConfirmDatabaseBackup = async (year) => {
    const filename = String(
      databaseFilenameDrafts[year] ?? getDefaultDatabaseBackupReference(year),
    ).trim();

    if (!filename) {
      onShowToast?.({
        title: "Database backup reference required",
        description: "Enter the database backup reference before confirming it.",
        type: "error",
      });
      return;
    }

    const key = `database-${year}`;
    setActionKey(key);

    try {
      const { backup, event } = await archiveBackupService.confirmDatabaseBackup({
        planningYear: year,
        filename,
      });

      upsertBackupRow(backup);
      prependBackupEvent(event);
      setDatabaseFilenameDrafts((prev) => ({ ...prev, [year]: "" }));
      onShowToast?.({
        title: "Database backup confirmed",
        description: `Database backup reference saved for ${year}.`,
        type: "success",
      });
    } catch (error) {
      console.error("Failed to mark database backup:", error);
      onShowToast?.({
        title: "Could not mark database backup",
        description: error.message || "Please try again.",
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
            Track yearly CSV backups and database backup confirmations before old AWPB records
            are cleared from the active database.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <BackupActivityHistoryButton backupHistoryRows={backupHistoryRows} />
          <DatabaseBackupGuideButton />
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
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div className="flex items-start gap-3">
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

          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/15 p-3 text-white ring-1 ring-white/20">
              <Database size={20} />
            </div>
            <div>
              <p className="font-semibold text-white">Database Backup Check</p>
              <p className="mt-1 text-sm text-emerald-50/90">
                Confirm a full database backup exists, then save its yearly reference.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/15 p-3 text-white ring-1 ring-white/20">
              <Lock size={20} />
            </div>
            <div>
              <p className="font-semibold text-white">Cleanup</p>
              <p className="mt-1 text-sm text-emerald-50/90">
                Locked until both backup records exist. Deletion comes next.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {yearRows.map((row) => {
          const defaultDatabaseReference = getDefaultDatabaseBackupReference(row.year);
          const databaseFilename = databaseFilenameDrafts[row.year] ?? defaultDatabaseReference;
          const cleanupConfirm = cleanupConfirmDrafts[row.year] || "";
          const cleanupUnlocked =
            row.isCleanupYearAllowed && row.csvDone && row.databaseDone && !row.cleanupDone;

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

              <CardContent className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr_220px]">
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

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">Database Backup Check</p>
                    {getBackupStatusBadge(row.databaseDone)}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-500">
                    <p>Reference: {row.backup?.sql_backup_filename || "Not yet"}</p>
                    <p>By: {row.backup?.sql_backup_marked_by_name || "Not yet"}</p>
                    <p>At: {formatDateTime(row.backup?.sql_backup_marked_at)}</p>
                  </div>
                  {!row.databaseDone ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={databaseFilename}
                        onChange={(event) =>
                          setDatabaseFilenameDrafts((prev) => ({
                            ...prev,
                            [row.year]: event.target.value,
                          }))
                        }
                        disabled={!row.csvDone || actionKey === `database-${row.year}`}
                        placeholder={defaultDatabaseReference}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleConfirmDatabaseBackup(row.year)}
                        disabled={
                          !row.csvDone ||
                          !databaseFilename.trim() ||
                          actionKey === `database-${row.year}`
                        }
                      >
                        {actionKey === `database-${row.year}` ? "Saving..." : "Confirm"}
                      </Button>
                    </div>
                  ) : null}
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
                    {!row.isCleanupYearAllowed
                      ? "Current and future-year data cannot be cleaned up."
                      : cleanupUnlocked
                        ? "Type the planning year to permanently clean this data."
                        : "CSV backup and database backup confirmation must both be done first."}
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
