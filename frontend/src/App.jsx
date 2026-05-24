import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import initialTemplateData from "./data/awpb_dropdown_tree.json";

import { getTemplateHierarchy } from "./services/templateService";

import Login from "./pages/Login";

import {
  authService,
  usersService,
  entriesService,
  submissionService,
  realtimeService,
} from "./services/supabaseService";

const INITIAL_ACCOUNTS = [];
const ADMIN_VIEW_STORAGE_KEY = "awpb_admin_active_view";
const ADMIN_PLANNING_YEAR_STORAGE_KEY = "awpb_admin_planning_year";
const SESSION_EXPIRES_AT_STORAGE_KEY = "awpb_session_expires_at";
const TEMPLATE_DEFAULT_STORAGE_KEY = "awpb_template_default_snapshot_2026_05_18_v3";
const LEGACY_TEMPLATE_DEFAULT_STORAGE_KEYS = [
  "awpb_template_default_snapshot_2026_05_18",
  "awpb_template_default_snapshot_2026_05_18_v2",
];
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_ACTIVITY_REFRESH_THROTTLE_MS = 15 * 1000;
const SESSION_ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "pointerdown",
  "pointermove",
  "scroll",
  "touchstart",
  "wheel",
];
const SESSION_TIMEOUT_NOTICE =
  "Your session expired after 10 minutes of inactivity. Please sign in again.";

const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ConfirmPassword = lazy(() => import("./pages/ConfirmPassword"));
const ChooseView = lazy(() => import("./pages/ChooseView"));
const Home = lazy(() => import("./pages/Home"));
const MyEntries = lazy(() => import("./pages/MyEntries"));
const SubmitEntry = lazy(() => import("./pages/SubmitEntry"));
const AdminReview = lazy(() => import("./pages/AdminReview"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ArchiveCleanup = lazy(() => import("./pages/ArchiveCleanup"));
const ManageAccounts = lazy(() => import("./pages/ManageAccounts"));
const AddNewAccount = lazy(() => import("./pages/AddNewAccount"));
const ManageTemplate = lazy(() => import("./pages/ManageTemplate"));

function getStoredAdminView() {
  const storedView = window.localStorage.getItem(ADMIN_VIEW_STORAGE_KEY);
  return storedView === "admin" || storedView === "encoder" ? storedView : null;
}

function getCurrentPlanningYear() {
  return String(new Date().getFullYear());
}

function getStoredAdminPlanningYear() {
  const storedYear = window.localStorage.getItem(ADMIN_PLANNING_YEAR_STORAGE_KEY);
  return storedYear ? String(storedYear) : getCurrentPlanningYear();
}

function getDefaultAuthenticatedPath(role, activeView) {
  if (role !== "admin") return "/";
  if (activeView === "admin") return "/admin/dashboard";
  if (activeView === "encoder") return "/";
  return "/choose-view";
}

function createInitialTemplateState() {
  return JSON.parse(JSON.stringify(initialTemplateData));
}

function cloneTemplateState(templateData) {
  return JSON.parse(JSON.stringify(templateData || { hierarchy: {} }));
}

function normalizeIndicatorNo(value) {
  return String(value ?? "").trim();
}

function getIndicatorPlacementKey(component, subComponent, indicatorNo) {
  return `${component}||${subComponent}||${normalizeIndicatorNo(indicatorNo)}`;
}

function buildDefaultIndicatorPlacements() {
  const placements = new Map();
  const defaultHierarchy = initialTemplateData?.hierarchy || {};

  Object.entries(defaultHierarchy).forEach(([component, subComponents]) => {
    Object.entries(subComponents || {}).forEach(([subComponent, keyActivities]) => {
      Object.entries(keyActivities || {}).forEach(([keyActivity, indicators]) => {
        (indicators || []).forEach((indicator) => {
          const indicatorNo = normalizeIndicatorNo(indicator?.no);
          if (!indicatorNo) return;

          const placementKey = getIndicatorPlacementKey(component, subComponent, indicatorNo);
          const keyActivitySet = placements.get(placementKey) || new Set();
          keyActivitySet.add(keyActivity);
          placements.set(placementKey, keyActivitySet);
        });
      });
    });
  });

  return placements;
}

const DEFAULT_INDICATOR_PLACEMENTS = buildDefaultIndicatorPlacements();

function templateHasIndicatorAtKeyActivity(hierarchy, component, subComponent, keyActivity, indicatorNo) {
  const indicators = hierarchy?.[component]?.[subComponent]?.[keyActivity] || [];
  return indicators.some((indicator) => normalizeIndicatorNo(indicator?.no) === indicatorNo);
}

function normalizeTemplateSnapshot(templateData) {
  const nextTemplate = cloneTemplateState(templateData);
  const hierarchy = nextTemplate.hierarchy || {};

  Object.entries(hierarchy).forEach(([component, subComponents]) => {
    Object.entries(subComponents || {}).forEach(([subComponent, keyActivities]) => {
      Object.entries(keyActivities || {}).forEach(([keyActivity, indicators]) => {
        const seenIndicatorNos = new Set();

        hierarchy[component][subComponent][keyActivity] = (indicators || []).filter((indicator) => {
          const indicatorNo = normalizeIndicatorNo(indicator?.no);
          if (!indicatorNo) return true;

          const duplicateKey = `${keyActivity}||${indicatorNo}`;
          if (seenIndicatorNos.has(duplicateKey)) return false;
          seenIndicatorNos.add(duplicateKey);

          const expectedKeyActivities = DEFAULT_INDICATOR_PLACEMENTS.get(
            getIndicatorPlacementKey(component, subComponent, indicatorNo),
          );

          if (!expectedKeyActivities || expectedKeyActivities.has(keyActivity)) return true;

          return ![...expectedKeyActivities].some((expectedKeyActivity) =>
            templateHasIndicatorAtKeyActivity(
              hierarchy,
              component,
              subComponent,
              expectedKeyActivity,
              indicatorNo,
            ),
          );
        });
      });
    });
  });

  return nextTemplate;
}

function buildTemplateStateFromRows(data = []) {
  const hierarchy = {};

  data.forEach((row) => {
    const c = row.component;
    const s = row.sub_component;
    const k = row.key_activity;
    const actNo = row.activity_no ?? row.no;
    const piText = row.performance_indicator || row.label || "";

    if (!c) return;
    if (!hierarchy[c]) hierarchy[c] = {};
    if (!s) return;
    if (!hierarchy[c][s]) hierarchy[c][s] = {};
    if (!k) return;
    if (!hierarchy[c][s][k]) hierarchy[c][s][k] = [];

    // Skip rows without an activity number (placeholder key-activity rows)
    if (actNo === null || actNo === undefined || actNo === "") return;

    // Find or create the entry grouped by activity_no
    const bucket = hierarchy[c][s][k];
    let entry = bucket.find((item) => String(item.no) === String(actNo));
    if (!entry) {
      entry = { no: actNo, performanceIndicator: piText, subActivities: [] };
      bucket.push(entry);
    }

    // Add sub-activity if present and not already tracked
    if (row.sub_activity && !entry.subActivities.includes(row.sub_activity)) {
      entry.subActivities.push(row.sub_activity);
    }
  });

  return normalizeTemplateSnapshot({
    ...createInitialTemplateState(),
    hierarchy,
  });
}

async function fetchTemplateState() {
  const { data, error } = await getTemplateHierarchy();

  if (error) throw error;
  return buildTemplateStateFromRows(data || []);
}

function getStoredTemplateDefaultState() {
  try {
    LEGACY_TEMPLATE_DEFAULT_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });

    const storedValue = window.localStorage.getItem(TEMPLATE_DEFAULT_STORAGE_KEY);
    if (!storedValue) return null;

    const parsedValue = JSON.parse(storedValue);
    return parsedValue?.hierarchy && typeof parsedValue.hierarchy === "object"
      ? normalizeTemplateSnapshot(parsedValue)
      : null;
  } catch {
    return null;
  }
}

function storeTemplateDefaultState(templateData) {
  try {
    window.localStorage.setItem(
      TEMPLATE_DEFAULT_STORAGE_KEY,
      JSON.stringify(normalizeTemplateSnapshot(templateData)),
    );
  } catch {
    // Local storage can be unavailable in private or locked-down browser modes.
  }
}

function getStoredSessionExpiresAt() {
  const storedValue = Number(window.localStorage.getItem(SESSION_EXPIRES_AT_STORAGE_KEY));
  return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : null;
}

function startSessionExpiration(timestamp = Date.now()) {
  const expiresAt = timestamp + SESSION_TIMEOUT_MS;
  window.localStorage.setItem(SESSION_EXPIRES_AT_STORAGE_KEY, String(expiresAt));
  return expiresAt;
}

function clearSessionExpiration() {
  window.localStorage.removeItem(SESSION_EXPIRES_AT_STORAGE_KEY);
}

function hasSessionExpired(timestamp = Date.now()) {
  const expiresAt = getStoredSessionExpiresAt();
  return Boolean(expiresAt && timestamp >= expiresAt);
}

function PageLoadingFallback() {
  return (
    <div className="flex min-h-[220px] items-center justify-center">
      <p className="text-sm text-slate-500">Loading page...</p>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [entryBeingEdited, setEntryBeingEdited] = useState(null);
  const [submitEntryDraft, setSubmitEntryDraft] = useState(null);
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [templateData, setTemplateData] = useState({ hierarchy: {} });
  const [templateDefaultData, setTemplateDefaultData] = useState(
    () => getStoredTemplateDefaultState() || createInitialTemplateState(),
  );
  const [dataLoading, setDataLoading] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [activeView, setActiveView] = useState(getStoredAdminView);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminPlanningYear, setAdminPlanningYear] = useState(getStoredAdminPlanningYear);
  const [isRecoveryMode, setIsRecoveryMode] = useState(
    () => window.location.pathname === '/confirm-password'
  );
  const [loginNotice, setLoginNotice] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const toastDismissRef = useRef(null);
  const sessionExpiredRef = useRef(false);
  const authUserId = authUser?.id;
  const authUserRole = authUser?.role;

  const handleAdminPlanningYearChange = useCallback((year) => {
    const nextYear = String(year || getCurrentPlanningYear());
    setAdminPlanningYear(nextYear);
    window.localStorage.setItem(ADMIN_PLANNING_YEAR_STORAGE_KEY, nextYear);
  }, []);

  const [submissionWindow, setSubmissionWindow] = useState({
    startDate: "2026-04-01",
    endDate: "2026-04-30",
  });

  const dismissToast = useCallback((toastId) => {
    setToast((current) => {
      if (!current || current.id !== toastId || current.exiting) return current;
      return { ...current, exiting: true };
    });
    window.clearTimeout(toastDismissRef.current);
    toastDismissRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === toastId ? null : current));
    }, 220);
  }, []);

  const showToast = useCallback(({
    title,
    description = "",
    type = "info",
  }) => {
    const id = Date.now();
    setToast({ id, title, description, type, exiting: false });
    window.clearTimeout(toastTimeoutRef.current);
    window.clearTimeout(toastDismissRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      dismissToast(id);
    }, 2600);
  }, [dismissToast]);

  const handleSetTemplateDefault = useCallback(async (nextTemplateData) => {
    let sourceTemplateData = nextTemplateData || templateData;

    try {
      sourceTemplateData = await fetchTemplateState();
      setTemplateData(sourceTemplateData);
    } catch (error) {
      console.error("Failed to refresh template before saving default:", error);
    }

    const nextDefault = normalizeTemplateSnapshot(sourceTemplateData);
    setTemplateDefaultData(nextDefault);
    storeTemplateDefaultState(nextDefault);
    return nextDefault;
  }, [templateData]);

  const handleLogout = useCallback(async () => {
    try {
      await authService.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    setAuthUser(null);
    setActiveView(null);
    window.localStorage.removeItem(ADMIN_VIEW_STORAGE_KEY);
    clearSessionExpiration();
    setEntryBeingEdited(null);
    setSubmitEntryDraft(null);
  }, []);

  const expireSession = useCallback(async () => {
    if (sessionExpiredRef.current) return;

    sessionExpiredRef.current = true;
    setLoginNotice(SESSION_TIMEOUT_NOTICE);
    await handleLogout();
    navigate("/login", { replace: true });
  }, [handleLogout, navigate]);

  useEffect(() => {
    if (authLoading || !authUserId || isRecoveryMode) return;
    loadTemplate();
  }, [authLoading, authUserId, isRecoveryMode]);

async function loadTemplate() {
  try {
    const nextTemplateData = await fetchTemplateState();
    setTemplateData(nextTemplateData);

    const storedDefaultData = getStoredTemplateDefaultState();
    if (storedDefaultData) {
      setTemplateDefaultData(cloneTemplateState(storedDefaultData));
      return;
    }

    const defaultSnapshot = normalizeTemplateSnapshot(nextTemplateData);
    setTemplateDefaultData(defaultSnapshot);
    storeTemplateDefaultState(defaultSnapshot);
  } catch (error) {
    console.error(error);
  }
}

  // Restore session on page load / listen for auth changes
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      // Skip auto-login when arriving via a password-reset link
      if (isRecoveryMode) {
        if (!cancelled) setAuthLoading(false);
        return;
      }
      try {
        const user = await authService.getCurrentUser();
        if (user && !cancelled) {
          if (hasSessionExpired()) {
            clearSessionExpiration();
            await authService.signOut();
            navigate("/login", { replace: true });
            return;
          }

          const profile = await authService.getProfile(user.id);
          if (profile.status !== "active") {
            await authService.signOut();
            return;
          }
          if (!getStoredSessionExpiresAt()) {
            startSessionExpiration();
          }
          sessionExpiredRef.current = false;
          setAuthUser({
            id: user.id,
            username: profile.username,
            email: profile.email,
            fullName: profile.full_name,
            role: profile.role,
            status: profile.status,
          });
        }
      } catch {
        // No active session — stay on login
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    restoreSession();

    const { data: { subscription } } = authService.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        setActiveView(null);
        setIsRecoveryMode(false);
        window.localStorage.removeItem(ADMIN_VIEW_STORAGE_KEY);
        clearSessionExpiration();
      }
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isRecoveryMode, navigate]);

  useEffect(() => {
    if (!authUserId || isRecoveryMode) return;

    let timeoutId;
    let lastActivityRefresh = 0;

    const scheduleExpirationCheck = () => {
      window.clearTimeout(timeoutId);

      let expiresAt = getStoredSessionExpiresAt();
      if (!expiresAt) {
        expiresAt = startSessionExpiration();
      }

      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        void expireSession();
        return;
      }

      timeoutId = window.setTimeout(() => {
        void expireSession();
      }, remainingMs);
    };

    const refreshSessionActivity = () => {
      if (sessionExpiredRef.current || document.visibilityState === "hidden") return;

      const now = Date.now();
      if (hasSessionExpired(now)) {
        void expireSession();
        return;
      }

      if (now - lastActivityRefresh < SESSION_ACTIVITY_REFRESH_THROTTLE_MS) return;

      lastActivityRefresh = now;
      startSessionExpiration(now);
      scheduleExpirationCheck();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (hasSessionExpired()) {
        void expireSession();
        return;
      }

      refreshSessionActivity();
    };

    const handleExpirationStorageChange = (event) => {
      if (event.key !== SESSION_EXPIRES_AT_STORAGE_KEY || !event.newValue) return;

      if (hasSessionExpired()) {
        void expireSession();
        return;
      }

      scheduleExpirationCheck();
    };

    sessionExpiredRef.current = false;
    if (!getStoredSessionExpiresAt()) {
      startSessionExpiration();
    }

    scheduleExpirationCheck();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshSessionActivity);
    SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, refreshSessionActivity, { passive: true });
    });
    window.addEventListener("storage", handleExpirationStorageChange);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshSessionActivity);
      SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, refreshSessionActivity);
      });
      window.removeEventListener("storage", handleExpirationStorageChange);
    };
  }, [authUserId, expireSession, isRecoveryMode]);

  useEffect(() => {
    if (!authUserId) return;

    const subscription = realtimeService.subscribeToProfiles(async (payload) => {
      if (payload.new?.id !== authUserId) return;

      if (payload.new.status !== "active") {
        await handleLogout();
        showToast({
          title: "Account deactivated",
          description: "Your session has been signed out.",
          type: "error",
        });
        return;
      }

      setAuthUser((current) =>
        current?.id === payload.new.id
          ? {
              ...current,
              username: payload.new.username,
              email: payload.new.email,
              fullName: payload.new.full_name,
              role: payload.new.role,
              status: payload.new.status,
            }
          : current,
      );
    });

    return () => subscription.unsubscribe();
  }, [authUserId, handleLogout, showToast]);

  useEffect(() => {
    if (!authUserId) return;

    if (authUserRole !== "admin") {
      setActiveView("encoder");
      window.localStorage.removeItem(ADMIN_VIEW_STORAGE_KEY);
      return;
    }

    setActiveView(getStoredAdminView());
  }, [authUserId, authUserRole]);

  useEffect(() => {
    if (authLoading || !authUserId || isRecoveryMode) return;

    let cancelled = false;

    const loadSubmissionWindow = async () => {
      try {
        const windowData = await submissionService.getActiveWindow();
        if (!cancelled) {
          setSubmissionWindow({
            id: windowData.id,
            startDate: windowData.start_date,
            endDate: windowData.end_date,
            title: windowData.title,
            is_active: windowData.is_active,
          });
        }
      } catch (error) {
        console.error("Failed to load submission window:", error);
      }
    };

    loadSubmissionWindow();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUserId, isRecoveryMode]);

  useEffect(() => {
    if (authLoading || !authUserId || isRecoveryMode) return;

    let cancelled = false;

    const loadAuthenticatedData = async () => {
      setDataLoading(true);
      try {
        const entriesPromise = entriesService.getAll();
        const accountsPromise =
          authUserRole === "admin" ? usersService.getAll() : Promise.resolve([]);

        const [entriesData, profiles] = await Promise.all([
          entriesPromise,
          accountsPromise,
        ]);

        if (cancelled) return;

        setEntries(entriesData);
        setAccounts(
          profiles.map((profile) => ({
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            email: profile.email,
            role: profile.role,
            status: profile.status,
          })),
        );
      } catch (error) {
        console.error("Failed to load authenticated data from Supabase:", error);
        if (!cancelled) {
          showToast({
            title: "Data load error",
            description: error.message || "Could not load data. Please refresh.",
            type: "error",
          });
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };

    loadAuthenticatedData();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUserId, authUserRole, isRecoveryMode, showToast]);

  useEffect(() => {
    if (!authUserId) return;

    const subscription = realtimeService.subscribeToEntries((payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      if (eventType === "INSERT") {
        setEntries((prev) =>
          prev.some((entry) => entry.id === newRecord.id)
            ? prev.map((entry) => (entry.id === newRecord.id ? newRecord : entry))
            : [newRecord, ...prev],
        );
      } else if (eventType === "UPDATE") {
        setEntries((prev) => prev.map((entry) => (entry.id === newRecord.id ? newRecord : entry)));
      } else if (eventType === "DELETE") {
        setEntries((prev) => prev.filter((entry) => entry.id !== oldRecord.id));
      }
    });
    return () => subscription.unsubscribe();
  }, [authUserId]);

  const isAuthenticated = Boolean(authUser);
  const currentRole = authUser?.role || null;
  const currentView = currentRole === "admin" ? activeView : currentRole;
  const defaultAuthenticatedPath = getDefaultAuthenticatedPath(currentRole, activeView);
  const canUseAdminView = currentRole === "admin" && currentView === "admin";
  const canUseEncoderView = currentRole === "encoder" || currentView === "encoder";

  const encoderEntries = useMemo(() => {
    if (!authUser?.id) return [];
    return entries.filter((entry) => entry.ownerId === authUser.id);
  }, [authUser?.id, entries]);

  const handleAddEntry = async (newEntry) => {
    try {
      const created = await entriesService.create(newEntry);
      setEntries((prev) => [created, ...prev]);
      showToast({
        title: "Entry submitted",
        description: `${created.titleOfActivities} was submitted.`,
        type: "success",
      });
      return created;
    } catch (error) {
      console.error("Failed to create entry:", error);
      showToast({
        title: "Submission failed",
        description: error.message,
        type: "error",
      });
      throw error;
    }
  };

  const handleUpdateEntry = async (entryId, updates) => {
    try {
      const updated = await entriesService.update(entryId, updates);
      setEntries((prev) => prev.map((entry) => (entry.id === entryId ? updated : entry)));
      showToast({
        title: "Entry updated",
        description: `Status changed to ${updated.status}.`,
        type: "success",
      });
      return updated;
    } catch (error) {
      console.error("Failed to update entry:", error);
      showToast({
        title: "Update failed",
        description: error.message,
        type: "error",
      });
      throw error;
    }
  };

  const handleReplaceEntry = (entryId, updatedEntry) => {
    setEntries((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
    return updatedEntry;
  };

  const handleDeleteEntry = async (entryId) => {
    try {
      await entriesService.delete(entryId);
      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      showToast({
        title: "Entry deleted",
        description: "The entry was removed.",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to delete entry:", error);
      showToast({
        title: "Delete failed",
        description: error.message,
        type: "error",
      });
      throw error;
    }
  };

  const handleRemoveEntry = (entryId) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  };

  const handleImportEntries = (importedEntries = []) => {
    setEntries((prev) => {
      const existingIds = new Set(prev.map((entry) => entry.id));
      const nextEntries = importedEntries.filter((entry) => entry?.id && !existingIds.has(entry.id));

      return [...nextEntries, ...prev];
    });
  };

  const handleCleanupYear = (planningYear) => {
    setEntries((prev) =>
      prev.filter((entry) => String(entry.planningYear || "") !== String(planningYear)),
    );
  };

  const handleUpdateSubmissionWindow = async (updater) => {
    if (!submissionWindow) return;
    const newWindow = updater(submissionWindow);
    try {
      const updated = await submissionService.updateWindow(submissionWindow.id, {
        start_date: newWindow.startDate,
        end_date: newWindow.endDate,
        is_active: newWindow.is_active,
      });
      setSubmissionWindow({
        id: updated.id,
        startDate: updated.start_date,
        endDate: updated.end_date,
        title: updated.title,
        is_active: updated.is_active,
      });
      showToast({
        title: "Submission window updated",
        description: "New dates have been saved.",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to update submission window:", error);
      showToast({
        title: "Update failed",
        description: error.message,
        type: "error",
      });
    }
  };

  const handleAddAccount = async (newAccount) => {
    // Reload all accounts from Supabase to get the full list with proper IDs
    try {
      const profiles = await usersService.getAll();
      const formattedAccounts = profiles.map((profile) => ({
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,
        status: profile.status,
      }));
      setAccounts(formattedAccounts);
    } catch {
      // Fallback: just add to local state
      setAccounts((prev) => [newAccount, ...prev]);
    }
  };

  const handleUpdateAccount = (accountId, updates, fullList = null) => {
    if (fullList) {
      setAccounts(fullList);
      return;
    }
    setAccounts((prev) =>
      prev.map((account) => (account.id === accountId ? { ...account, ...updates } : account))
    );
  };

  const handleDeleteAccount = (accountId) => {
    setAccounts((prev) => prev.filter((account) => account.id !== accountId));
  };

  const handleLogin = (user) => {
    setLoginNotice("");
    startSessionExpiration();
    sessionExpiredRef.current = false;

    if (user.role === "admin") {
      setActiveView(null);
      window.localStorage.removeItem(ADMIN_VIEW_STORAGE_KEY);
    } else {
      setActiveView("encoder");
    }
    setAuthUser(user);
  };

  const handleChooseView = (view) => {
    if (currentRole !== "admin") return;
    setActiveView(view);
    window.localStorage.setItem(ADMIN_VIEW_STORAGE_KEY, view);
    setEntryBeingEdited(null);
    setSubmitEntryDraft(null);
    navigate(getDefaultAuthenticatedPath("admin", view), { replace: true });
  };

  const handleSwitchView = () => {
    const nextView = currentView === "admin" ? "encoder" : "admin";
    handleChooseView(nextView);
    showToast({
      title: `${nextView === "admin" ? "Admin" : "Account Officer"} view`,
      description: "Your workspace view has been switched.",
      type: "success",
    });
  };

  const handleStartEdit = async (entry) => {
    const fullEntry = await entriesService.getById(entry.id);
    setEntries((prev) =>
      prev.map((currentEntry) => (currentEntry.id === entry.id ? fullEntry : currentEntry)),
    );
    setSubmitEntryDraft(null);
    setEntryBeingEdited(fullEntry);
    return fullEntry;
  };

  const handleSaveEditedEntry = async (entryId, updatedEntry) => {
    await handleUpdateEntry(entryId, updatedEntry);
    setEntryBeingEdited(null);
  };

  const clearEditingEntry = () => {
    setEntryBeingEdited(null);
  };

  const clearSubmitEntryDraft = () => {
    setSubmitEntryDraft(null);
  };

  const handleStartNewEntry = useCallback(() => {
    setEntryBeingEdited(null);
    setSubmitEntryDraft(null);
  }, []);

  const handleOpenSubmitEntry = useCallback(() => {
    if (!entryBeingEdited) return;
    handleStartNewEntry();
  }, [entryBeingEdited, handleStartNewEntry]);

  const navItems = useMemo(() => {
    if (currentView === "admin") {
      return [
        { to: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
        { to: "/admin/review", label: "Admin Review", icon: "review" },
        { to: "/admin/archive-cleanup", label: "Archive & Cleanup", icon: "archive" },
        { to: "/admin/manage-template", label: "Manage Template", icon: "template" },
        {
          label: "Manage Accounts",
          icon: "accounts",
          subItems: [
            { to: "/admin/manage-accounts", label: "All Accounts" },
            { to: "/admin/manage-accounts/new", label: "Add New Account" },
          ],
        },
      ];
    }
    return [
      { to: "/", label: "Home", icon: "dashboard" },
      { to: "/entries", label: "My Entries", icon: "entries" },
      { to: "/submit", label: "Submit Entry", icon: "submit", onClick: handleOpenSubmitEntry },
    ];
  }, [currentView, handleOpenSubmitEntry]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} accounts={accounts} notice={loginNotice} />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/confirm-password" element={<ConfirmPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (currentRole === "admin" && !activeView) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route
            path="/choose-view"
            element={
              <main>
                <ChooseView
                  currentUser={authUser}
                  onChooseView={handleChooseView}
                  onLogout={handleLogout}
                />
              </main>
            }
          />
          <Route path="*" element={<Navigate to="/choose-view" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (
    dataLoading &&
    entries.length === 0 &&
    (currentRole !== "admin" || accounts.length === 0)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading your workspace...</p>
      </div>
    );
  }

  return (
    <AppLayout
      navItems={navItems}
      currentRole={currentRole}
      currentView={currentView}
      currentUser={authUser}
      canSwitchView={currentRole === "admin" && Boolean(currentView)}
      onSwitchView={handleSwitchView}
      onLogout={handleLogout}
      toast={toast}
      onDismissToast={() => { if (toast?.id) dismissToast(toast.id); }}
    >
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/forgot-password" element={<Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/confirm-password" element={<Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/choose-view" element={currentRole === "admin" ? <ChooseView currentUser={authUser} onChooseView={handleChooseView} /> : <Navigate to="/" replace />} />
          <Route path="/" element={canUseEncoderView ? <Home entries={encoderEntries} submissionWindow={submissionWindow} onStartNewEntry={handleStartNewEntry} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/entries" element={canUseEncoderView ? <MyEntries entries={encoderEntries} onEditEntry={handleStartEdit} onDeleteEntry={handleDeleteEntry} onShowToast={showToast} submissionWindow={submissionWindow} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/submit" element={canUseEncoderView ? <SubmitEntry onAddEntry={handleAddEntry} entryToEdit={entryBeingEdited} onSaveEditedEntry={handleSaveEditedEntry} clearEditingEntry={clearEditingEntry} onStartNewEntry={handleStartNewEntry} submissionWindow={submissionWindow} draftState={submitEntryDraft} onDraftChange={setSubmitEntryDraft} onClearDraft={clearSubmitEntryDraft} currentUser={authUser} onShowToast={showToast} templateData={templateData} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/manage-template" element={canUseAdminView ? <ManageTemplate templateData={templateData} defaultTemplateData={templateDefaultData} onUpdateTemplateData={(nextTemplateData) => setTemplateData(normalizeTemplateSnapshot(nextTemplateData))} onResetTemplate={(nextTemplateData) => setTemplateData(normalizeTemplateSnapshot(nextTemplateData || templateDefaultData))} onSetDefaultTemplate={handleSetTemplateDefault} onShowToast={showToast} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/dashboard" element={canUseAdminView ? <AdminDashboard entries={entries} selectedYear={adminPlanningYear} onSelectedYearChange={handleAdminPlanningYearChange} submissionWindow={submissionWindow} onUpdateSubmissionWindow={handleUpdateSubmissionWindow} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/archive-cleanup" element={canUseAdminView ? <ArchiveCleanup entries={entries} onCleanupYear={handleCleanupYear} onShowToast={showToast} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/review" element={canUseAdminView ? <AdminReview entries={entries} currentUser={authUser} selectedYear={adminPlanningYear} onSelectedYearChange={handleAdminPlanningYearChange} onReplaceEntry={handleReplaceEntry} onRemoveEntry={handleRemoveEntry} onImportEntries={handleImportEntries} onUpdateEntry={handleUpdateEntry} onDeleteEntry={handleDeleteEntry} onShowToast={showToast} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/manage-accounts" element={canUseAdminView ? <ManageAccounts accounts={accounts} entries={entries} onUpdateAccount={handleUpdateAccount} onDeleteAccount={handleDeleteAccount} onShowToast={showToast} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="/admin/manage-accounts/new" element={canUseAdminView ? <AddNewAccount accounts={accounts} onAddAccount={handleAddAccount} onShowToast={showToast} /> : <Navigate to={defaultAuthenticatedPath} replace />} />
          <Route path="*" element={<Navigate to={defaultAuthenticatedPath} replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

export default App;
