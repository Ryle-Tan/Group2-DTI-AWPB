import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  History,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  UserPlus,
  UserX,
} from "lucide-react";

import AdminDeactivateUserModal from "@/components/admin/AdminDeactivateUserModal";
import AdminEditUserModal from "@/components/admin/AdminEditUserModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getPasswordPolicyError } from "@/lib/passwordPolicy";
import { usersService } from "@/services/supabaseService";

function mapProfileToAccount(profile) {
  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    status: profile.status,
  };
}

function mapUpdatesToProfile(updates) {
  const payload = {};
  if (updates.username !== undefined) payload.username = updates.username;
  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.status !== undefined) payload.status = updates.status;
  return payload;
}

const EMPTY_EDIT_FORM = {
  username: "",
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "encoder",
};

const ACCOUNT_LOG_META = {
  account_created: {
    label: "Created",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  account_updated: {
    label: "Updated",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  account_deactivated: {
    label: "Deactivated",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  account_activated: {
    label: "Activated",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  password_changed: {
    label: "Password Changed",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const ACCOUNT_CHANGE_LABELS = {
  username: "username",
  full_name: "full name",
  email: "email",
  role: "role",
  status: "status",
  password: "password",
};

const BLUE_MODAL_BUTTON_CLASS =
  "border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] hover:from-[#19265f] hover:to-[#213a80] hover:text-white";

function getStatusBadgeVariant(status) {
  return status === "active" ? "statusApproved" : "statusRejected";
}

function getRoleBadgeClass(role) {
  return role === "admin"
    ? "border-transparent bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_4px_10px_rgba(31,47,116,0.22)]"
    : "border-slate-200 bg-white text-slate-900";
}

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

function getAccountLogMeta(action) {
  return (
    ACCOUNT_LOG_META[action] || {
      label: "Account Activity",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    }
  );
}

function formatAccountLogValue(field, value) {
  if (value === null || value === undefined || value === "") return "Blank";

  if (field === "role") {
    return value === "admin" ? "Admin" : "Account Officer";
  }

  if (field === "status") {
    return value === "active" ? "Active" : "Deactivated";
  }

  return String(value);
}

function renderAccountLogDetails(log) {
  const details = log.details || {};

  if (details.backfilled) {
    return "Existing account before logs were enabled.";
  }

  const changes = details.changes || {};
  const changedFields = Object.keys(changes);

  if (changedFields.length > 0) {
    return (
      <div className="space-y-1">
        {changedFields.map((field) => {
          const change = changes[field] || {};
          const label = ACCOUNT_CHANGE_LABELS[field] || field.replaceAll("_", " ");

          if (field === "password") {
            return (
              <p key={field}>
                <span className="font-medium text-slate-700">Password:</span>{" "}
                Changed
              </p>
            );
          }

          return (
            <p key={field}>
              <span className="font-medium text-slate-700">{label}:</span>{" "}
              <span className="text-slate-500">
                {formatAccountLogValue(field, change.from)}
              </span>{" "}
              <span className="text-slate-400">-&gt;</span>{" "}
              <span className="font-medium text-slate-900">
                {formatAccountLogValue(field, change.to)}
              </span>
            </p>
          );
        })}
      </div>
    );
  }

  if (details.created_account) {
    const role =
      details.created_account.role === "admin" ? "Admin" : "Account Officer";
    const status = formatAccountLogValue("status", details.created_account.status);
    return `Created ${role} account with ${status} status.`;
  }

  return "Account record was updated.";
}

function AccountActivityLogsButton({
  accountLogs,
  accountLogsError,
  logsLoaded,
  loadingLogs,
  onLoad,
  onRefresh,
}) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen && !logsLoaded && !loadingLogs) {
      onLoad();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className={BLUE_MODAL_BUTTON_CLASS}>
          <History size={16} />
          Account Activity Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Account Activity Logs</DialogTitle>
          <DialogDescription>
            Review account creation, edits, deactivation, reactivation, and password changes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loadingLogs}>
            <RefreshCw size={16} />
            {loadingLogs ? "Refreshing..." : "Refresh Logs"}
          </Button>
        </div>

        {loadingLogs ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Loading account activity logs...
          </div>
        ) : accountLogsError ? (
          <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {accountLogsError}
          </div>
        ) : !logsLoaded ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Account activity logs will load when this modal opens.
          </div>
        ) : accountLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            No account activity has been recorded yet.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-[1000px] w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[25%]" />
                <col className="w-[26%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead className="bg-slate-50 text-left">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-semibold text-slate-700">
                    Date
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">
                    Activity
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">
                    Account
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">
                    Details
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">
                    Done By
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountLogs.map((log) => {
                  const meta = getAccountLogMeta(log.action);

                  return (
                    <tr key={log.id} className="border-b last:border-b-0">
                      <td className="px-4 py-4 align-top text-slate-600">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p
                          className="truncate font-medium text-slate-900"
                          title={log.target_full_name || ""}
                        >
                          {log.target_full_name || "Unknown account"}
                        </p>
                        <p
                          className="mt-1 truncate text-slate-500"
                          title={`${log.target_username || "No username"} - ${
                            log.target_email || "No email"
                          }`}
                        >
                          {log.target_username || "No username"} -{" "}
                          {log.target_email || "No email"}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top text-slate-600">
                        {renderAccountLogDetails(log)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p
                          className="truncate font-medium text-slate-900"
                          title={log.actor_name || ""}
                        >
                          {log.actor_name || "Unknown admin"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ManageAccounts({
  accounts: accountsProp = [],
  onUpdateAccount,
  onShowToast,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editErrors, setEditErrors] = useState({});
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const [accounts, setAccounts] = useState(accountsProp);
  const [accountLogs, setAccountLogs] = useState([]);
  const [accountLogsError, setAccountLogsError] = useState("");
  const [accountLogsLoaded, setAccountLogsLoaded] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    setAccounts(accountsProp);
  }, [accountsProp]);

  const loadAccountLogs = useCallback(async ({ showErrorToast = true } = {}) => {
    setLoadingLogs(true);
    setAccountLogsError("");
    try {
      const logs = await usersService.getAccountLogs();
      setAccountLogs(logs);
      setAccountLogsLoaded(true);
    } catch (error) {
      console.error("Failed to load account activity logs:", error);
      const message =
        error.message ||
        "Could not load account logs. Make sure the account activity migration has been applied.";
      setAccountLogsError(message);
      if (showErrorToast) {
        onShowToast?.({
          title: "Account activity logs unavailable",
          description: message,
          type: "error",
        });
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [onShowToast]);

  const persistAccountUpdate = async (accountId, updates) => {
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === accountId ? { ...account, ...updates } : account,
      ),
    );

    try {
      await usersService.update(accountId, mapUpdatesToProfile(updates));
      onUpdateAccount?.(accountId, updates);
      if (accountLogsLoaded) {
        await loadAccountLogs({ showErrorToast: false });
      }
      return true;
    } catch (err) {
      console.error("Failed to update account in Supabase:", err);
      onShowToast?.({
        title: "Could not save changes",
        description: err.message || "Please try again.",
        type: "error",
      });
      return false;
    }
  };

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return accounts.filter((account) => {
      const matchesSearch =
        normalizedSearch === "" ||
        account.username.toLowerCase().includes(normalizedSearch) ||
        account.fullName.toLowerCase().includes(normalizedSearch) ||
        account.email.toLowerCase().includes(normalizedSearch) ||
        account.role.toLowerCase().includes(normalizedSearch) ||
        account.status.toLowerCase().includes(normalizedSearch);

      const matchesRole = roleFilter === "all" || account.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || account.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [accounts, roleFilter, searchTerm, statusFilter]);

  const openEditModal = (account) => {
    setEditTarget(account);
    setEditForm({
      username: account.username,
      fullName: account.fullName,
      email: account.email,
      password: "",
      confirmPassword: "",
      role: account.role,
    });
    setEditErrors({});
  };

  const closeEditModal = () => {
    setEditTarget(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditErrors({});
  };

  const handleEditFieldChange = (event) => {
    const { name, value } = event.target;

    if (name === "role") {
      setEditForm((prev) => ({
        ...prev,
        role: value,
        username: updateUsernamePrefix(prev.username, value),
      }));
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveChanges = () => {
    const nextErrors = {};
    const normalizedUsername = editForm.username.trim().toLowerCase();
    const normalizedEmail = editForm.email.trim().toLowerCase();

    if (!normalizedUsername) {
      nextErrors.username = "Username is required.";
    } else if (!/^(enc|adm)_[a-z0-9_]+$/.test(normalizedUsername)) {
      nextErrors.username =
        "Use a username like enc_jdelacruz or adm_jdelacruz.";
    } else if (
      (editForm.role === "encoder" && !normalizedUsername.startsWith("enc_")) ||
      (editForm.role === "admin" && !normalizedUsername.startsWith("adm_"))
    ) {
      nextErrors.username =
        editForm.role === "encoder"
          ? "Account Officer accounts must use the enc_ prefix."
          : "Admin accounts must use the adm_ prefix.";
    } else if (
      accounts.some(
        (account) =>
          account.id !== editTarget?.id &&
          account.username?.trim().toLowerCase() === normalizedUsername,
      )
    ) {
      nextErrors.username = "This username is already assigned to another account.";
    }

    if (!editForm.fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!normalizedEmail) {
      nextErrors.email = "Email is required.";
    } else if (
      accounts.some(
        (account) =>
          account.id !== editTarget?.id &&
          account.email?.trim().toLowerCase() === normalizedEmail,
      )
    ) {
      nextErrors.email = "This email is already assigned to another account.";
    }

    if (editForm.password || editForm.confirmPassword) {
      const passwordError = getPasswordPolicyError(editForm.password, {
        required: true,
      });

      if (passwordError) {
        nextErrors.password = passwordError;
      }

      if (editForm.password !== editForm.confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setEditErrors(nextErrors);
      return;
    }

    (async () => {
      const updates = {
        username: normalizedUsername,
        fullName: editForm.fullName.trim(),
        email: normalizedEmail,
        role: editForm.role,
        status: editTarget.status,
      };

      try {
        const savedProfile = await usersService.updateAccount(editTarget.id, {
          ...updates,
          password: editForm.password,
        });

        const savedAccount = mapProfileToAccount(savedProfile);

        setAccounts((prev) =>
          prev.map((account) =>
            account.id === editTarget.id ? savedAccount : account,
          ),
        );
        onUpdateAccount?.(editTarget.id, savedAccount);
        if (accountLogsLoaded) {
          await loadAccountLogs({ showErrorToast: false });
        }

        onShowToast?.({
          title: "Account updated",
          description: `${editForm.fullName.trim()} was updated successfully.`,
          type: "success",
        });
        closeEditModal();
      } catch (err) {
        console.error("Failed to update account in Supabase Auth:", err);
        onShowToast?.({
          title: "Could not save changes",
          description: err.message || "Please try again.",
          type: "error",
        });
      }
    })();
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;

    const ok = await persistAccountUpdate(deactivateTarget.id, {
      status: "deactivated",
    });

    if (ok) {
      onShowToast?.({
        title: "Account deactivated",
        description: `${deactivateTarget.fullName} can no longer sign in.`,
        type: "success",
      });
      setDeactivateTarget(null);
    }
  };

  const handleActivate = async (accountId) => {
    const target = accounts.find((account) => account.id === accountId);

    const ok = await persistAccountUpdate(accountId, {
      status: "active",
    });

    if (ok && target) {
      onShowToast?.({
        title: "Account activated",
        description: `${target.fullName} can sign in again.`,
        type: "success",
      });
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Manage Accounts
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review, edit, and deactivate user accounts for the AWPB system.
        </p>
      </div>

      <Card className="overflow-hidden border-0 shadow-[0_10px_24px_rgba(15,23,42,0.08)] gap-0 py-0">
        <CardHeader className="border-b bg-white px-6 pt-5 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="text-2xl">List of All Created Users</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Manage account access, roles, and active status.
              </p>
              <p className="mt-6 text-sm text-slate-500">
                Showing {filteredAccounts.length} of {accounts.length} accounts
              </p>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <div className="relative min-w-[300px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search username, user, email, role, or status"
                  className="pl-9"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="encoder">Account Officer</option>
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>

              <Button variant="outline" onClick={resetFilters}>
                Reset
              </Button>

              <AccountActivityLogsButton
                accountLogs={accountLogs}
                accountLogsError={accountLogsError}
                logsLoaded={accountLogsLoaded}
                loadingLogs={loadingLogs}
                onLoad={loadAccountLogs}
                onRefresh={loadAccountLogs}
              />

              <Button
                asChild
                className="border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
              >
                <Link to="/admin/manage-accounts/new">
                  <UserPlus size={16} />
                  Add User
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredAccounts.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No accounts match the current search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[17%]" />
                  <col className="w-[24%]" />
                  <col className="w-[27%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                </colgroup>

                <thead className="bg-slate-50 text-left">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 font-semibold text-slate-700">
                      Username
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">
                      Full Name
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-700">
                      Role
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-700">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr key={account.id} className="border-b last:border-b-0">
                      <td className="px-4 py-4 text-slate-700">
                        <p className="truncate" title={account.username}>
                          {account.username}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="truncate font-medium text-slate-900" title={account.fullName}>
                          {account.fullName}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-slate-700">
                        <p className="truncate" title={account.email}>
                          {account.email}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <Badge variant="outline" className={getRoleBadgeClass(account.role)}>
                          {account.role === "admin" ? "Admin" : "Account Officer"}
                        </Badge>
                      </td>

                      <td className="px-4 py-4 text-center">
                        <Badge variant={getStatusBadgeVariant(account.status)}>
                          {account.status === "active" ? "Active" : "Deactivated"}
                        </Badge>
                      </td>

                      <td className="px-4 py-4 align-middle">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditModal(account)}
                            title="Edit account"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Pencil />
                          </Button>

                          {account.status === "active" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeactivateTarget(account)}
                              title="Deactivate account"
                              className="text-red-600 hover:text-red-700"
                            >
                              <UserX />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleActivate(account.id)}
                              title="Activate account"
                              className="text-green-600 hover:text-green-700"
                            >
                              <RotateCcw />
                            </Button>
                          )}
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

      <AdminEditUserModal
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && closeEditModal()}
        form={editForm}
        errors={editErrors}
        onFieldChange={handleEditFieldChange}
        onSave={handleSaveChanges}
      />

      <AdminDeactivateUserModal
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        user={deactivateTarget}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

function updateUsernamePrefix(username, role) {
  const normalized = String(username || "").trim().toLowerCase();
  const nextPrefix = role === "admin" ? "adm_" : "enc_";

  if (!normalized) {
    return nextPrefix;
  }

  if (normalized.startsWith("enc_") || normalized.startsWith("adm_")) {
    return `${nextPrefix}${normalized.split("_").slice(1).join("_")}`;
  }

  return `${nextPrefix}${normalized.replace(/[^a-z0-9_]/g, "")}`;
}
