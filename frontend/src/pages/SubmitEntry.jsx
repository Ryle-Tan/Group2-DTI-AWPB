import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { budgetPlanningService, templateService } from "../services/supabaseService";
import { normalizeUnitCode } from "../lib/units";

const FALLBACK_VALUE = "N/A";

function compareTemplateValues(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareSortOrderThenName(a, b, nameKey) {
  const aSort = a?.sort_order;
  const bSort = b?.sort_order;
  if (aSort != null && bSort != null && aSort !== bSort) return aSort - bSort;
  if (aSort != null && bSort == null) return -1;
  if (aSort == null && bSort != null) return 1;
  return compareTemplateValues(a?.[nameKey], b?.[nameKey]);
}

function sortTemplateKeys(keys) {
  return [...(keys || [])].sort(compareTemplateValues);
}

function sortIndicatorItems(items) {
  return [...(items || [])]
    .map((item) => ({
      ...item,
      subActivities: sortTemplateKeys(item?.subActivities || []),
    }))
    .sort((a, b) => compareTemplateValues(a?.no, b?.no));
}

function hasOwnKey(node, key) {
  return Object.prototype.hasOwnProperty.call(node || {}, key);
}

// ---------------------------------------------------------------------------
// Reshape the flat `template_hierarchy` rows from Supabase into the nested
// object the form already knows how to render:
//   {
//     "Component name": {
//       "Sub component name": {
//         "Key activity name": [
//           { no, performanceIndicator, subActivities: [...] }
//         ]
//       }
//     }
//   }
// ---------------------------------------------------------------------------
function buildTemplateDataFromSupabase(hierarchyRows, unitRows) {
  const hierarchy = {};
  const idMap = {
    units: {},
    components: {},
    subComponents: {},
    keyActivities: {},
    subActivities: {},
  };

  const sortedRows = [...(hierarchyRows || [])].sort((a, b) => {
    const componentSort = compareSortOrderThenName(
      { ...a, sort_order: a.component_sort_order },
      { ...b, sort_order: b.component_sort_order },
      "component",
    );
    if (componentSort !== 0) return componentSort;
    const subComponentSort = compareSortOrderThenName(
      { ...a, sort_order: a.sub_component_sort_order },
      { ...b, sort_order: b.sub_component_sort_order },
      "sub_component",
    );
    if (subComponentSort !== 0) return subComponentSort;
    const keyActivitySort = compareSortOrderThenName(
      { ...a, sort_order: a.key_activity_sort_order },
      { ...b, sort_order: b.key_activity_sort_order },
      "key_activity",
    );
    if (keyActivitySort !== 0) return keyActivitySort;
    const indicatorSort = compareSortOrderThenName(
      { ...a, sort_order: a.performance_indicator_sort_order, activity_no: a.activity_no },
      { ...b, sort_order: b.performance_indicator_sort_order, activity_no: b.activity_no },
      "activity_no",
    );
    if (indicatorSort !== 0) return indicatorSort;
    return compareSortOrderThenName(
      { ...a, sort_order: a.sub_activity_sort_order },
      { ...b, sort_order: b.sub_activity_sort_order },
      "sub_activity",
    );
  });

  for (const row of sortedRows) {
    const { 
      component, component_id,
      sub_component, sub_component_id,
      key_activity, key_activity_id,
      activity_no, label, 
      sub_activity, sub_activity_id 
    } = row;

    if (!component) continue;

    if (component) idMap.components[component] = component_id;
    if (sub_component) idMap.subComponents[sub_component] = sub_component_id;
    if (key_activity) idMap.keyActivities[key_activity] = key_activity_id;
    if (sub_activity) idMap.subActivities[sub_activity] = sub_activity_id;

    // Ensure every level that exists in Supabase has a safe container. Empty
    // lower levels are intentional admin states and should become N/A fields.
    if (!hierarchy[component]) hierarchy[component] = {};
    if (!sub_component) continue;
    if (!hierarchy[component][sub_component]) hierarchy[component][sub_component] = {};
    if (!key_activity) continue;
    if (!hierarchy[component][sub_component][key_activity]) {
      hierarchy[component][sub_component][key_activity] = [];
    }
    if (activity_no === null || activity_no === undefined || activity_no === "") continue;

    // Find or create the activity-number entry (grouped by `no`)
    const bucket = hierarchy[component][sub_component][key_activity];
    let entry = bucket.find((item) => String(item.no) === String(activity_no));
    if (!entry) {
      entry = {
        no: activity_no,
        performanceIndicator: label || "",
        subActivities: [],
      };
      bucket.push(entry);
    }

    // Add sub-activity if present and not already tracked
    if (sub_activity && !entry.subActivities.includes(sub_activity)) {
      entry.subActivities.push(sub_activity);
    }
  }

  const unitOptions = (unitRows || []).map((u) => ({
    id: u.id,
    value: normalizeUnitCode(u.code || u.name),
    aliases: [u.name, u.code].filter(Boolean),
  }));
  unitRows?.forEach((u) => {
    idMap.units[normalizeUnitCode(u.code || u.name)] = u.id;
    idMap.units[u.code || u.name] = u.id;
    if (u.name) idMap.units[u.name] = u.id;
  });

  Object.values(hierarchy).forEach((componentNode) => {
    Object.values(componentNode || {}).forEach((subComponentNode) => {
      Object.keys(subComponentNode || {}).forEach((keyActivityName) => {
        subComponentNode[keyActivityName] = sortIndicatorItems(
          subComponentNode[keyActivityName],
        );
      });
    });
  });

  return { hierarchy, unitOptions, idMap };
}

const MONTHS = [
  { key: "jan", label: "Jan" },
  { key: "feb", label: "Feb" },
  { key: "mar", label: "Mar" },
  { key: "apr", label: "Apr" },
  { key: "may", label: "May" },
  { key: "jun", label: "Jun" },
  { key: "jul", label: "Jul" },
  { key: "aug", label: "Aug" },
  { key: "sep", label: "Sep" },
  { key: "oct", label: "Oct" },
  { key: "nov", label: "Nov" },
  { key: "dec", label: "Dec" },
];

const MONTH_NAME_BY_KEY = {
  jan: "january",
  feb: "february",
  mar: "march",
  apr: "april",
  may: "may",
  jun: "june",
  jul: "july",
  aug: "august",
  sep: "september",
  oct: "october",
  nov: "november",
  dec: "december",
};

const CURRENT_YEAR = new Date().getFullYear();

const defaultFormValues = {
  planningYear: String(CURRENT_YEAR),
  unit: "",
  component: "",
  subComponent: "",
  keyActivity: "",
  no: "",
  performanceIndicator: "",
  subActivity: "",
  titleOfActivities: "",
  unitCost: "",
  targets: {
    jan: "",
    feb: "",
    mar: "",
    apr: "",
    may: "",
    jun: "",
    jul: "",
    aug: "",
    sep: "",
    oct: "",
    nov: "",
    dec: "",
  },
};

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeNumberInput(value) {
  const digitsAndDots = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  const dotIndex = digitsAndDots.indexOf(".");

  if (dotIndex === -1) return digitsAndDots;

  return `${digitsAndDots.slice(0, dotIndex)}.${digitsAndDots
    .slice(dotIndex + 1)
    .replace(/\./g, "")}`;
}

function formatNumberInput(value) {
  const normalized = normalizeNumberInput(value);
  if (!normalized) return "";

  const hasDecimal = normalized.includes(".");
  const [rawWhole = "", fraction = ""] = normalized.split(".");
  const whole = (rawWhole || "0").replace(/^0+(?=\d)/, "");
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${formattedWhole}${hasDecimal ? `.${fraction}` : ""}`;
}

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

  return `+${formatCurrency(Math.abs(numericValue))} over estimate`;
}

function formatTarget(value) {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 0,
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

function normalizeMonthKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const found = MONTHS.find(
    (month) =>
      month.key === normalized ||
      month.label.toLowerCase() === normalized ||
      MONTH_NAME_BY_KEY[month.key] === normalized,
  );

  return found?.key || "";
}

function getTemplateValueById(idMap = {}, id, preferredValues = []) {
  if (!id) return "";

  const preferred = preferredValues.find((value) => idMap[value] === id);
  if (preferred) return preferred;

  return Object.entries(idMap).find(([, value]) => value === id)?.[0] || "";
}

function buildFormValuesFromEntry(entry, templateData = {}) {
  const targets = MONTHS.reduce((acc, month) => {
    const found = entry.monthlyBreakdown?.find(
      (row) => normalizeMonthKey(row.month) === month.key,
    );
    acc[month.key] = found ? found.target : "";
    return acc;
  }, {});
  const idMap = templateData?.idMap || {};
  const unitOptions = (templateData?.unitOptions || []).map((item) => item.value);
  const unitFromId = getTemplateValueById(
    idMap.units,
    entry.unitId || entry.unit_id,
    unitOptions,
  );

  return {
    planningYear: entry.planningYear || entry.planning_year || String(CURRENT_YEAR),
    unit: normalizeUnitCode(
      entry.unit || entry.units?.code || entry.units?.name || unitFromId || "",
    ),
    component:
      entry.component ||
      entry.components?.name ||
      getTemplateValueById(idMap.components, entry.componentId || entry.component_id),
    subComponent:
      entry.subComponent ||
      entry.sub_components?.name ||
      getTemplateValueById(idMap.subComponents, entry.subComponentId || entry.sub_component_id),
    keyActivity:
      entry.keyActivity ||
      entry.key_activities?.name ||
      getTemplateValueById(idMap.keyActivities, entry.keyActivityId || entry.key_activity_id),
    no: entry.no ? String(entry.no) : String(entry.activity_no || ""),
    performanceIndicator:
      entry.performanceIndicator ||
      entry.performance_indicator ||
      entry.key_activities?.performance_indicator ||
      "",
    subActivity:
      entry.subActivity ||
      entry.sub_activities?.name ||
      getTemplateValueById(idMap.subActivities, entry.subActivityId || entry.sub_activity_id),
    titleOfActivities: entry.titleOfActivities || entry.title_of_activities || "",
    unitCost: entry.unitCost ?? entry.unit_cost ?? "",
    targets,
  };
}

function normalizeComparableText(value) {
  return String(value ?? "").trim();
}

function includeSelectedOption(options, selectedValue) {
  const selected = normalizeComparableText(selectedValue);
  if (!selected || selected === FALLBACK_VALUE) return options;
  if (options.some((option) => String(option) === selected)) return options;
  return sortTemplateKeys([...options, selected]);
}

function buildComparableSubmission(entry) {
  const monthlyBreakdown = entry?.monthlyBreakdown || [];
  const targets = MONTHS.reduce((acc, month) => {
    const found = monthlyBreakdown.find((row) => {
      return normalizeMonthKey(row.month) === month.key;
    });

    acc[month.key] = toNumber(found?.target);
    return acc;
  }, {});

  return {
    planningYear: normalizeComparableText(entry?.planningYear),
    unit: normalizeUnitCode(entry?.unit || ""),
    component: normalizeComparableText(entry?.component),
    subComponent: normalizeComparableText(entry?.subComponent),
    keyActivity: normalizeComparableText(entry?.keyActivity),
    no: normalizeComparableText(entry?.no),
    performanceIndicator: normalizeComparableText(entry?.performanceIndicator),
    subActivity: normalizeComparableText(entry?.subActivity),
    titleOfActivities: normalizeComparableText(entry?.titleOfActivities),
    unitCost: toNumber(entry?.unitCost),
    targets,
  };
}

function hasSubmissionChanges(previousEntry, nextEntry) {
  return (
    JSON.stringify(buildComparableSubmission(previousEntry)) !==
    JSON.stringify(buildComparableSubmission(nextEntry))
  );
}

function isSubmissionWindowOpen(submissionWindow) {
  const { startDate, endDate } = submissionWindow || {};

  if (!startDate || !endDate) return false;

  const today = new Date();
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  return today >= start && today <= end;
}

export default function SubmitEntry({
  onAddEntry,
  entryToEdit,
  onSaveEditedEntry,
  clearEditingEntry,
  onStartNewEntry,
  submissionWindow,
  draftState,
  onDraftChange,
  onClearDraft,
  currentUser,
  onShowToast,
  templateData: templateDataProp,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [targetValidationMessage, setTargetValidationMessage] = useState("");
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [unchangedResubmitEntry, setUnchangedResubmitEntry] = useState(null);

  // -------------------------------------------------------------------------
  // Load dropdown data from Supabase. Uses the JSON prop as an initial
  // fallback so the form is never blank while the network request is in
  // flight. Once Supabase responds, we replace the data with the live one.
  // -------------------------------------------------------------------------
  const [supabaseTemplateData, setSupabaseTemplateData] = useState(null);
  const [unitPlanningStats, setUnitPlanningStats] = useState({});
  const [unitPlanningStatsStatus, setUnitPlanningStatsStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hierarchyRows, unitRows] = await Promise.all([
          templateService.getHierarchy(),
          templateService.getUnits(),
        ]);
        if (!cancelled) {
          setSupabaseTemplateData(
            buildTemplateDataFromSupabase(hierarchyRows, unitRows),
          );
        }
      } catch (err) {
        console.error("Failed to load template data from Supabase:", err);
        // Fall back to the JSON prop silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefer Supabase data when available; otherwise use the JSON prop.
  const templateData = supabaseTemplateData || templateDataProp;

  const {
    control,
    register,
    handleSubmit,
    trigger,
    reset,
    resetField,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: defaultFormValues,
  });

  const planningYears = Array.from({ length: 6 }, (_, index) =>
    String(CURRENT_YEAR - 1 + index),
  );
  const isEditingReturnedEntry =
    entryToEdit && entryToEdit.status === "Returned";

  const windowOpen = isSubmissionWindowOpen(submissionWindow);
  const formLocked = !windowOpen;

  const [
    planningYear,
    unit,
    component,
    subComponent,
    keyActivity,
    selectedNo,
    watchedPerformanceIndicator,
    watchedSubActivity,
    titleOfActivities,
  ] = useWatch({
    control,
    name: [
      "planningYear",
      "unit",
      "component",
      "subComponent",
      "keyActivity",
      "no",
      "performanceIndicator",
      "subActivity",
      "titleOfActivities",
    ],
  });

  const unitCost = useWatch({
    control,
    name: "unitCost",
  });

  const watchedTargets = useWatch({
    control,
    name: "targets",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUnitPlanningStatsStatus("loading");
      try {
        const rows = await budgetPlanningService.getUnitStats(planningYear);
        if (!cancelled) {
          setUnitPlanningStats(
            Object.fromEntries(
              rows.map((row) => [row.unit, { ...row, hasLiveStats: true }]),
            ),
          );
          setUnitPlanningStatsStatus("ready");
        }
      } catch (err) {
        console.error("Failed to load unit planning stats:", err);
        if (!cancelled) {
          setUnitPlanningStats({});
          setUnitPlanningStatsStatus("unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planningYear]);

  const draftValues = useWatch({
    control,
  });
  const hydratedFormKeyRef = useRef("");
  const hydratingFormRef = useRef(false);
  const scheduleStepUpdate = useCallback((nextStep) => {
    window.setTimeout(() => setStep(nextStep), 0);
  }, []);
  const resetHydratedForm = useCallback((values, nextStep = 1) => {
    hydratingFormRef.current = true;
    reset(values);
    scheduleStepUpdate(nextStep);
    window.setTimeout(() => {
      hydratingFormRef.current = false;
    }, 0);
  }, [reset, scheduleStepUpdate]);

  const clearNoSelection = useCallback(() => {
    resetField("no");
    resetField("performanceIndicator");
    resetField("subActivity");
  }, [resetField]);

  const clearKeyActivitySelection = useCallback(() => {
    resetField("keyActivity");
    clearNoSelection();
  }, [clearNoSelection, resetField]);

  const clearSubComponentSelection = useCallback(() => {
    resetField("subComponent");
    clearKeyActivitySelection();
  }, [clearKeyActivitySelection, resetField]);

  const clearComponentSelection = useCallback(() => {
    resetField("component");
    clearSubComponentSelection();
  }, [clearSubComponentSelection, resetField]);

  const handleCreateNewEntry = useCallback(() => {
    onStartNewEntry?.();
    clearEditingEntry?.();
    onClearDraft?.();
    hydratedFormKeyRef.current = "";
    reset(defaultFormValues);
    setTargetValidationMessage("");
    scheduleStepUpdate(1);
  }, [clearEditingEntry, onClearDraft, onStartNewEntry, reset, scheduleStepUpdate]);

  const unitOptions = useMemo(() => {
    const options = sortTemplateKeys([...new Set((templateData?.unitOptions || []).map((item) => item.value))]);
    return includeSelectedOption(options, unit);
  }, [templateData, unit]);

  const componentOptions = useMemo(() => {
    const options = sortTemplateKeys(Object.keys(templateData?.hierarchy || {}));
    return includeSelectedOption(options, component);
  }, [component, templateData]);

  const currentComponentNode = useMemo(() => {
    return templateData?.hierarchy?.[component] || null;
  }, [component, templateData]);

  const rawSubComponentKeys = useMemo(() => {
    if (!component) return [];
    return sortTemplateKeys(Object.keys(currentComponentNode || {}));
  }, [component, currentComponentNode]);

  const visibleSubComponentOptions = useMemo(() => {
    const options = sortTemplateKeys(rawSubComponentKeys.filter((key) => key !== ""));
    return includeSelectedOption(options, subComponent);
  }, [rawSubComponentKeys, subComponent]);

  const hasNoSubComponent =
    Boolean(component) &&
    visibleSubComponentOptions.length === 0 &&
    (rawSubComponentKeys.length === 0 ||
      (rawSubComponentKeys.length === 1 && rawSubComponentKeys[0] === ""));

  const subComponentKey = useMemo(() => {
    if (!component || !subComponent) return "";

    // "N/A" can be an actual sub-component name from Manage Template. Prefer
    // the real hierarchy key before falling back to the legacy empty-string key.
    if (hasOwnKey(currentComponentNode, subComponent)) return subComponent;
    if (subComponent === FALLBACK_VALUE && hasOwnKey(currentComponentNode, "")) {
      return "";
    }
    return subComponent;
  }, [component, currentComponentNode, subComponent]);

  const hasSubComponentSelection = hasNoSubComponent || Boolean(subComponentKey);

  const keyActivityOptions = useMemo(() => {
    if (!component || !hasSubComponentSelection) return [];
    const options = sortTemplateKeys(Object.keys(
      templateData?.hierarchy?.[component]?.[subComponentKey] || {},
    ));
    return includeSelectedOption(options, keyActivity);
  }, [component, hasSubComponentSelection, keyActivity, subComponentKey, templateData]);

  const hasNoKeyActivity =
    Boolean(component) && hasSubComponentSelection && keyActivityOptions.length === 0;

  const currentSubComponentNode = useMemo(() => {
    return templateData?.hierarchy?.[component]?.[subComponentKey] || {};
  }, [component, subComponentKey, templateData]);

  const selectedKeyActivity = useMemo(() => {
    if (!keyActivity) return "";

    // Same rule as sub components: only treat N/A as fallback when it is not a
    // real key activity under the selected sub-component branch.
    if (hasOwnKey(currentSubComponentNode, keyActivity)) return keyActivity;
    return keyActivity === FALLBACK_VALUE ? "" : keyActivity;
  }, [currentSubComponentNode, keyActivity]);

  const hasKeyActivitySelection = hasNoKeyActivity || Boolean(selectedKeyActivity);

  const noOptions = useMemo(() => {
    if (!component || !hasSubComponentSelection || !selectedKeyActivity) return [];
    const options = sortIndicatorItems(
      templateData?.hierarchy?.[component]?.[subComponentKey]?.[selectedKeyActivity] || []
    );
    if (
      !selectedNo ||
      selectedNo === FALLBACK_VALUE ||
      options.some((item) => String(item.no) === String(selectedNo))
    ) {
      return options;
    }
    return sortIndicatorItems([
      ...options,
      {
        no: selectedNo,
        performanceIndicator: watchedPerformanceIndicator || entryToEdit?.performanceIndicator || "",
        subActivities:
          watchedSubActivity && watchedSubActivity !== FALLBACK_VALUE
            ? [watchedSubActivity]
            : [],
      },
    ]);
  }, [
    component,
    entryToEdit?.performanceIndicator,
    hasSubComponentSelection,
    selectedKeyActivity,
    selectedNo,
    subComponentKey,
    templateData,
    watchedPerformanceIndicator,
    watchedSubActivity,
  ]);

  const selectedNoEntry = useMemo(() => {
    return noOptions.find((item) => String(item.no) === String(selectedNo));
  }, [noOptions, selectedNo]);

  const hasNoPerformanceIndicator =
    Boolean(component) && hasKeyActivitySelection && noOptions.length === 0;

  const subActivityOptions = useMemo(() => {
    const options = sortTemplateKeys(selectedNoEntry?.subActivities || []);
    return includeSelectedOption(options, watchedSubActivity);
  }, [selectedNoEntry, watchedSubActivity]);

  const hasNoSubActivity =
    (hasNoPerformanceIndicator || Boolean(selectedNo)) &&
    subActivityOptions.length === 0;

  const monthlyRows = useMemo(() => {
    const parsedUnitCost = toNumber(unitCost);
    const targets = watchedTargets || {};

    return MONTHS.map((month) => {
      const target = toNumber(targets[month.key]);
      const amount = parsedUnitCost * target;

      return {
        ...month,
        target,
        amount,
      };
    });
  }, [unitCost, watchedTargets]);

  const activeMonthlyRows = useMemo(() => {
    return monthlyRows.filter((row) => row.target > 0);
  }, [monthlyRows]);

  const hasMonthlyTarget = activeMonthlyRows.length > 0;

  const grandTotal = useMemo(() => {
    return monthlyRows.reduce((sum, row) => sum + row.amount, 0);
  }, [monthlyRows]);

  const totalTarget = useMemo(() => {
    return monthlyRows.reduce((sum, row) => sum + row.target, 0);
  }, [monthlyRows]);

  const selectedUnitPlanningStats = useMemo(() => {
    if (!unit) return null;
    const normalizedUnit = normalizeUnitCode(unit);
    return (
      unitPlanningStats[normalizedUnit] || {
        unit: normalizedUnit,
        planningEstimate: 0,
        approvedTotal: 0,
        variance: 0,
        approvedCount: 0,
        hasLiveStats: false,
      }
    );
  }, [unit, unitPlanningStats]);

  const planningEstimate = selectedUnitPlanningStats?.planningEstimate || 0;
  const approvedPlanTotal = selectedUnitPlanningStats?.approvedTotal || 0;
  const proposedApprovedTotal = approvedPlanTotal + grandTotal;
  const estimateGapAfterEntry = planningEstimate - proposedApprovedTotal;
  const hasPlanningEstimate = planningEstimate > 0;
  const isPlanningStatsLoading = unitPlanningStatsStatus === "loading";
  const isPlanningStatsUnavailable = unitPlanningStatsStatus === "unavailable";
  const planningEstimateLabel = isPlanningStatsLoading
    ? "Loading..."
    : formatCurrency(planningEstimate);
  const approvedPlanTotalLabel = isPlanningStatsLoading
    ? "Loading..."
    : isPlanningStatsUnavailable
      ? "Unavailable"
      : formatCurrency(approvedPlanTotal);
  const planningBalanceAfterEntryLabel = isPlanningStatsLoading
    ? "Loading..."
    : isPlanningStatsUnavailable
      ? "Waiting for admin estimate"
      : hasPlanningEstimate
        ? formatPlanningBalance(estimateGapAfterEntry)
        : "No estimate set yet";
  const planningStatusLabel = isPlanningStatsLoading
    ? "Loading Estimate"
    : isPlanningStatsUnavailable
      ? "Estimate Unavailable"
      : !hasPlanningEstimate
        ? "No Estimate Set"
        : estimateGapAfterEntry < 0
          ? "Over Estimate"
          : "Within Estimate";

  useEffect(() => {
    const isReturnedEdit = entryToEdit && entryToEdit.status === "Returned";
    const hasDraftValues = Boolean(draftState?.values);
    const hasLiveTemplateIds = Boolean(templateData?.idMap);
    const hydrationKey = isReturnedEdit
      ? `edit:${entryToEdit.id}:${entryToEdit.updatedAt || entryToEdit.submittedAt || "saved"}:${hasLiveTemplateIds}`
      : `new:${draftState?.mode || "none"}:${hasDraftValues}`;

    if (hydratedFormKeyRef.current === hydrationKey) return;
    hydratedFormKeyRef.current = hydrationKey;

    if (isReturnedEdit) {
      resetHydratedForm(buildFormValuesFromEntry(entryToEdit, templateData), 1);
      return;
    }

    if (draftState?.mode === "new" && draftState?.values) {
      resetHydratedForm(mergeWithDefaultFormValues(draftState.values), draftState?.step || 1);
      return;
    }

    resetHydratedForm(defaultFormValues, 1);
  }, [
    draftState?.entryId,
    draftState?.mode,
    draftState?.step,
    draftState?.values,
    entryToEdit,
    resetHydratedForm,
    templateData,
  ]);

  useEffect(() => {
    if (!draftValues) return;

    onDraftChange?.({
      mode:
        entryToEdit && entryToEdit.status === "Returned" ? "edit" : "new",
      entryId: entryToEdit?.id || null,
      step,
      values: mergeWithDefaultFormValues(draftValues),
    });
  }, [draftValues, entryToEdit, onDraftChange, step]);

  useEffect(() => {
    if (component && hasNoSubComponent) {
      setValue("subComponent", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [component, hasNoSubComponent, setValue]);

  useEffect(() => {
    if (hasNoKeyActivity) {
      // Missing KA/PI/Sub Activity rows are valid template states. Store N/A so
      // required validation can pass while the UI clearly shows no data exists.
      setValue("keyActivity", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
      setValue("no", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
      setValue("performanceIndicator", FALLBACK_VALUE, {
        shouldValidate: false,
        shouldDirty: false,
      });
      setValue("subActivity", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [hasNoKeyActivity, setValue]);

  useEffect(() => {
    if (hasNoPerformanceIndicator) {
      // A key activity can exist before indicators are encoded. Treat the lower
      // hierarchy as intentionally N/A instead of blocking Step 2.
      setValue("no", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
      setValue("performanceIndicator", FALLBACK_VALUE, {
        shouldValidate: false,
        shouldDirty: false,
      });
      setValue("subActivity", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [hasNoPerformanceIndicator, setValue]);

  useEffect(() => {
    if (hydratingFormRef.current) return;

    if (hasNoPerformanceIndicator) {
      setValue("performanceIndicator", FALLBACK_VALUE, {
        shouldValidate: false,
        shouldDirty: false,
      });
      setValue("subActivity", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
      return;
    }

    setValue(
      "performanceIndicator",
      selectedNoEntry?.performanceIndicator || "",
      {
        shouldValidate: false,
        shouldDirty: false,
      },
    );

    if (!selectedNo || selectedNo === FALLBACK_VALUE) {
      resetField("subActivity");
      return;
    }

    if (hasNoSubActivity && subActivityOptions.length === 0) {
      setValue("subActivity", FALLBACK_VALUE, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
  }, [
    selectedNo,
    selectedNoEntry,
    hasNoPerformanceIndicator,
    hasNoSubActivity,
    subActivityOptions.length,
    watchedSubActivity,
    setValue,
    resetField,
  ]);

  const validateStep1 = async () => {
    return await trigger([
      "planningYear",
      "unit",
      "component",
      "subComponent",
      "keyActivity",
      "no",
      "subActivity",
      "titleOfActivities",
    ]);
  };

  const validateStep2 = async () => {
    const targetFieldNames = MONTHS.map((month) => `targets.${month.key}`);

    const isValid = await trigger(["unitCost", ...targetFieldNames]);

    if (!hasMonthlyTarget) {
      const message = "Please enter at least one monthly target before continuing.";
      setTargetValidationMessage(message);
      onShowToast?.({
        title: "Monthly target required",
        description: message,
        type: "error",
      });
      return false;
    }

    setTargetValidationMessage("");
    return isValid;
  };

  const handleStepClick = async (targetStep) => {
    if (formLocked || isSubmittingEntry) return;
    if (targetStep === step) return;

    if (targetStep === 1) {
      setStep(1);
      return;
    }

    if (targetStep === 2) {
      const step1Valid = await validateStep1();
      if (step1Valid) {
        setStep(2);
      }
      return;
    }

    if (targetStep === 3) {
      const step1Valid = await validateStep1();

      if (!step1Valid) {
        setStep(1);
        return;
      }

      const step2Valid = await validateStep2();

      if (step2Valid) {
        setStep(3);
      } else {
        setStep(2);
      }
    }
  };

  const goToStep1 = async () => {
    setStep(1);
  };

  const goToStep2 = async () => {
    if (formLocked || isSubmittingEntry) return;
    const isValid = await validateStep1();

    if (isValid) {
      setStep(2);
    }
  };

  const goToStep3 = async () => {
    if (formLocked || isSubmittingEntry) return;
    const isValid = await validateStep2();

    if (isValid) {
      setStep(3);
    }
  };

  const saveReturnedEntry = async (updatedEntry) => {
    setIsSubmittingEntry(true);
    try {
      await onSaveEditedEntry(entryToEdit.id, updatedEntry);
      reset(defaultFormValues);
      setStep(1);
      onClearDraft?.();
      clearEditingEntry?.();
      navigate("/entries");
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const confirmUnchangedResubmit = async () => {
    if (!unchangedResubmitEntry) return;

    const pendingEntry = unchangedResubmitEntry;
    setUnchangedResubmitEntry(null);
    await saveReturnedEntry(pendingEntry);
  };

  const onSubmit = async (data) => {
    if (isSubmittingEntry) return;

    if (!windowOpen) {
      onShowToast?.({
        title: "Encoding period closed",
        description:
          "You cannot submit or resubmit entries while the encoding period is closed.",
        type: "error",
      });
      return;
    }

    if (!hasMonthlyTarget) {
      const message = "Please enter at least one monthly target before submitting.";
      setTargetValidationMessage(message);
      onShowToast?.({
        title: "Monthly target required",
        description: message,
        type: "error",
      });
      setStep(2);
      return;
    }
    
    const idMap = templateData?.idMap;

    const finalSubActivity =
  watchedSubActivity &&
  watchedSubActivity !== FALLBACK_VALUE
    ? watchedSubActivity
    : selectedNoEntry?.subActivities?.[0] || FALLBACK_VALUE;

    if (isEditingReturnedEntry) {
      const updatedEntry = {
        ...entryToEdit,
        ownerId: entryToEdit.ownerId || currentUser?.id || "",
        unitId: idMap?.units?.[data.unit],
        componentId: idMap?.components?.[data.component],
        subComponentId: idMap?.subComponents?.[data.subComponent],
        keyActivityId: idMap?.keyActivities?.[data.keyActivity],
        subActivityId: idMap?.subActivities?.[finalSubActivity],
        ownerUsername: entryToEdit.ownerUsername || currentUser?.username || "",
        ownerFullName:
          entryToEdit.ownerFullName || currentUser?.fullName || "",
        planningYear: data.planningYear,
        unit: data.unit,
        component: data.component,
        subComponent: data.subComponent,
        keyActivity: data.keyActivity,
        no: data.no,
        performanceIndicator: data.performanceIndicator,
        subActivity: finalSubActivity,
        titleOfActivities: data.titleOfActivities,
        unitCost: toNumber(data.unitCost),
        monthlyBreakdown: monthlyRows.map((row) => ({
          month: row.label,
          target: row.target,
          amount: row.amount,
        })),
        grandTotal,
        status: "Pending Review",
        adminComment: "",
        reviewerId: null,
        reviewedAt: null,
        submittedAt: new Date().toISOString(),
      };

      if (!hasSubmissionChanges(entryToEdit, updatedEntry)) {
        setUnchangedResubmitEntry(updatedEntry);
        return;
      }

      await saveReturnedEntry(updatedEntry);
      return;
    }

    const newEntry = {
      ownerId: currentUser?.id || "",
      ownerUsername: currentUser?.username || "",
      ownerFullName: currentUser?.fullName || "",
      unitId: idMap?.units?.[data.unit],
      componentId: idMap?.components?.[data.component],
      subComponentId: idMap?.subComponents?.[data.subComponent],
      keyActivityId: idMap?.keyActivities?.[data.keyActivity],
      subActivityId: idMap?.subActivities?.[finalSubActivity],
      planningYear: data.planningYear,
      unit: data.unit,
      component: data.component,
      subComponent: data.subComponent,
      keyActivity: data.keyActivity,
      no: data.no,
      performanceIndicator: data.performanceIndicator,
      subActivity: finalSubActivity,
      titleOfActivities: data.titleOfActivities,
      unitCost: toNumber(data.unitCost),
      monthlyBreakdown: monthlyRows.map((row) => ({
        month: row.label,
        target: row.target,
        amount: row.amount,
      })),
      grandTotal,
      status: "Pending Review",
      adminComment: "",
      submittedAt: new Date().toISOString(),
    };

    setIsSubmittingEntry(true);
    try {
      await onAddEntry(newEntry);
      reset(defaultFormValues);
      setStep(1);
      onClearDraft?.();
      clearEditingEntry?.();
      navigate("/entries");
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const steps = [
    { number: 1, label: "Classification" },
    { number: 2, label: "Budget Computation" },
    { number: 3, label: "Review & Submit" },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {isEditingReturnedEntry ? "Edit Returned Entry" : "Submit Entry"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Complete the AWPB entry in three guided steps.
          </p>
        </div>

        {isEditingReturnedEntry && (
          <Button
            type="button"
            onClick={handleCreateNewEntry}
            className="w-fit border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
          >
            Create New Entry
          </Button>
        )}
      </div>

      {!windowOpen && (
        <Card className="border-0 bg-gradient-to-br from-[#f9d1d1] via-[#f5bcbc] to-[#ef9f9f] shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-semibold text-rose-900">
                  Encoding period is closed
                </p>
                <p className="text-sm text-rose-800">
                  New submissions and returned-entry edits are currently locked.
                </p>
                <p className="mt-1 text-xs text-rose-700">
                  {formatDateOnly(submissionWindow?.startDate)} to{" "}
                  {formatDateOnly(submissionWindow?.endDate)}
                </p>
              </div>

              <Badge
                variant="outline"
                className="self-start border-rose-300 bg-white/40 text-rose-800 md:self-center"
              >
                Closed
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {isEditingReturnedEntry && entryToEdit?.adminComment && (
        <Card className="border-0 bg-amber-50 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
          <CardContent className="p-4">
            <h2 className="mb-2 font-medium text-amber-900">Revision Note</h2>
            <p className="text-sm text-amber-900">{entryToEdit.adminComment}</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
        <CardContent className="p-6">
          <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-3">
            {steps.map((item) => {
              const isActive = step === item.number;
              const isDone = step > item.number;

              return (
                <button
                  key={item.number}
                  type="button"
                  onClick={() => handleStepClick(item.number)}
                  disabled={formLocked || isSubmittingEntry}
                  className={`w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-none ${
                    isActive
                      ? "border border-transparent bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white"
                      : isDone
                        ? "border border-slate-300 bg-slate-100 text-slate-800"
                        : "border border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  Step {item.number}: {item.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <fieldset
              disabled={formLocked || isSubmittingEntry}
              className={formLocked || isSubmittingEntry ? "space-y-8 opacity-70" : "space-y-8"}
            >
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Classification</h2>
                <p className="text-sm text-gray-500">
                  Select the hierarchy that matches the official AWPB structure.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Planning Year
                  </label>
                  <select
                    {...register("planningYear", {
                      required: "Planning Year is required",
                    })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    {planningYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  {errors.planningYear && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.planningYear.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Unit</label>
                  <select
                    {...register("unit", {
                      required: "Unit is required",
                      onChange: clearComponentSelection,
                    })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    <option value="">Select unit</option>
                    {unitOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {errors.unit && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.unit.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Component
                  </label>
                  <select
                    {...register("component", {
                      required: "Component is required",
                      onChange: clearSubComponentSelection,
                    })}
                    disabled={!unit}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-gray-300"
                  >
                    <option value="">Select component</option>
                    {componentOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {errors.component && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.component.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Sub component
                  </label>

                  {component && hasNoSubComponent ? (
                    <>
                      <input
                        type="hidden"
                        {...register("subComponent", {
                          required: "Sub component is required",
                        })}
                      />
                      <input
                        type="text"
                        readOnly
                        value={FALLBACK_VALUE}
                        className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                      />
                    </>
                  ) : (
                    <select
                      {...register("subComponent", {
                        required: "Sub component is required",
                        onChange: clearKeyActivitySelection,
                      })}
                      disabled={!component}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="">Select sub component</option>
                      {visibleSubComponentOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  )}

                  {errors.subComponent && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.subComponent.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Key Activity
                  </label>
                  {hasNoKeyActivity ? (
                    <>
                      <input
                        type="hidden"
                        {...register("keyActivity", {
                          required: "Key Activity is required",
                        })}
                      />
                      <input
                        type="text"
                        readOnly
                        value={FALLBACK_VALUE}
                        className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                      />
                    </>
                  ) : (
                    <select
                      {...register("keyActivity", {
                        required: "Key Activity is required",
                        onChange: clearNoSelection,
                      })}
                      disabled={
                        !component || (!hasNoSubComponent && !subComponent)
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="">Select key activity</option>
                      {keyActivityOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  )}

                  {errors.keyActivity && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.keyActivity.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">No.</label>
                  {hasNoPerformanceIndicator ? (
                    <>
                      <input
                        type="hidden"
                        {...register("no", {
                          required: "No. is required",
                        })}
                      />
                      <input
                        type="text"
                        readOnly
                        value={FALLBACK_VALUE}
                        className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                      />
                    </>
                  ) : (
                    <select
                      {...register("no", {
                        required: "No. is required",
                        onChange: () => resetField("subActivity"),
                      })}
                      disabled={!selectedKeyActivity}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="">Select no.</option>
                      {noOptions.map((item) => (
                        <option key={item.no} value={String(item.no)}>
                          {item.no} - {item.performanceIndicator}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.no && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.no.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Performance Indicator
                  </label>
                  <input
                    type="text"
                    placeholder="Will auto-fill after selecting No."
                    disabled={!selectedNo && !hasNoPerformanceIndicator}
                    readOnly
                    {...register("performanceIndicator")}
                    className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Sub Activity
                  </label>

                  {hasNoSubActivity ? (
                    <>
                      <input
                        type="hidden"
                        {...register("subActivity", {
                          required: "Sub Activity is required",
                        })}
                      />
                      <input
                        type="text"
                        readOnly
                        value={FALLBACK_VALUE}
                        className="w-full rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none"
                      />
                    </>
                  ) : (
                    <select
                      {...register("subActivity", {
                        required: "Sub Activity is required",
                      })}
                      disabled={!selectedNo}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-gray-100 disabled:text-gray-400 focus:ring-2 focus:ring-gray-300"
                    >
                      <option value="">Select sub activity</option>
                      {subActivityOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  )}

                  {errors.subActivity && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.subActivity.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Title of Activities
                  </label>
                  <input
                    type="text"
                    placeholder="Enter title of activities"
                    {...register("titleOfActivities", {
                      required: "Title of Activities is required",
                    })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  {errors.titleOfActivities && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.titleOfActivities.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                {isEditingReturnedEntry ? (
                  <Button
                    type="button"
                    onClick={() => {
                      onClearDraft?.();
                      clearEditingEntry?.();
                      navigate("/entries");
                    }}
                    variant="outline"
                    className="px-4 text-[15px]"
                  >
                    Cancel Edit
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      onClearDraft?.();
                      reset(defaultFormValues);
                      setStep(1);
                    }}
                    variant="outline"
                    className="px-4 text-[15px]"
                  >
                    Clear Form
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={goToStep2}
                  className="px-4 text-[15px] border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Budget Computation</h2>
                <p className="text-sm text-gray-500">
                  Monthly amount is automatically computed as Unit Cost ×
                  Monthly Target.
                </p>
              </div>

              <div className="max-w-sm">
                <label className="mb-2 block text-sm font-medium">
                  Unit Cost
                </label>
                <Controller
                  name="unitCost"
                  control={control}
                  rules={{
                    validate: (value) => {
                      if (value === "" || value === null || value === undefined) {
                        return "Unit Cost is required";
                      }

                      return toNumber(value) >= 0 || "Unit Cost cannot be negative";
                    },
                  }}
                  render={({ field }) => (
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Enter unit cost"
                      name={field.name}
                      ref={field.ref}
                      value={formatNumberInput(field.value)}
                      onBlur={field.onBlur}
                      onChange={(event) =>
                        field.onChange(normalizeNumberInput(event.target.value))
                      }
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  )}
                />
                {errors.unitCost && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.unitCost.message}
                  </p>
                )}
              </div>

              {selectedUnitPlanningStats && (
                <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#6ea3a6] via-[#4f8f93] to-[#2f7f86] p-5 text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {normalizeUnitCode(unit)} Planning Snapshot ({planningYear})
                      </h3>
                      <p className="mt-1 text-sm text-white/85">
                        Estimates guide the AWPB plan; submissions may exceed them.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`w-fit ${
                        isPlanningStatsLoading || isPlanningStatsUnavailable || !hasPlanningEstimate
                          ? "border-white/35 bg-white/15 text-white"
                          : estimateGapAfterEntry < 0
                          ? "border-rose-300 bg-rose-50 text-rose-800"
                          : "border-white/40 bg-white/20 text-white"
                      }`}
                    >
                      {planningStatusLabel}
                    </Badge>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white/18 px-4 py-3 shadow-inner shadow-white/5">
                    <p className="text-xs font-semibold uppercase text-white/70">
                      {planningYear} Unit Planning Estimate
                    </p>
                    <p className="mt-1 text-3xl font-bold leading-tight text-white">
                      {planningEstimateLabel}
                    </p>
                    {isPlanningStatsUnavailable && (
                      <p className="mt-1 text-xs text-white/75">
                        Admin planning estimates are not connected yet.
                      </p>
                    )}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-white/14 px-3 py-2.5">
                      <p className="text-xs font-medium text-white/70">Approved Plan</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {approvedPlanTotalLabel}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/14 px-3 py-2.5">
                      <p className="text-xs font-medium text-white/70">This Entry</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatCurrency(grandTotal)}
                      </p>
                    </div>
                    <div
                      className={`rounded-xl px-3 py-2.5 ${
                        hasPlanningEstimate && estimateGapAfterEntry < 0
                          ? "bg-white/95"
                          : "bg-white/14"
                      }`}
                    >
                      <p
                        className={`text-xs font-medium ${
                          hasPlanningEstimate && estimateGapAfterEntry < 0
                            ? "text-red-700"
                            : "text-white/70"
                        }`}
                      >
                        Planning Balance After Entry
                      </p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          hasPlanningEstimate && estimateGapAfterEntry < 0
                            ? "text-red-700"
                            : "text-white"
                        }`}
                      >
                        {planningBalanceAfterEntryLabel}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {targetValidationMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <p className="font-medium">Monthly target required</p>
                  <p className="mt-1">{targetValidationMessage}</p>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Month</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Target
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Computed Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((row, index) => (
                      <tr
                        key={row.key}
                        className={index !== 0 ? "border-t" : ""}
                      >
                        <td className="px-4 py-3 font-medium">{row.label}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            {...register(`targets.${row.key}`, {
                              setValueAs: (value) =>
                                value === "" ? "" : Number(value),
                              onChange: () => {
                                if (targetValidationMessage) {
                                  setTargetValidationMessage("");
                                }
                              },
                              min: {
                                value: 0,
                                message: "Target cannot be negative",
                              },
                            })}
                            className={`w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                              errors.targets?.[row.key]
                                ? "border-red-400 focus:ring-red-200"
                                : "focus:ring-gray-300"
                            }`}
                          />
                          {errors.targets?.[row.key] && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors.targets[row.key].message}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 font-semibold">
                        Total
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatTarget(totalTarget)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatCurrency(grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  onClick={goToStep1}
                  variant="outline"
                  className="px-4 text-[15px]"
                >
                  Back
                </Button>

                <Button
                  type="button"
                  onClick={goToStep3}
                  className="px-4 text-[15px] border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Review & Submit</h2>
                <p className="text-sm text-gray-500">
                  Review the entry before submitting it to My Entries.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-gray-50 p-4">
                  <h3 className="mb-3 font-medium">Entry Details</h3>

                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Planning Year:</span>{" "}
                      {planningYear || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Unit:</span> {unit || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Component:</span>{" "}
                      {component || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Sub component:</span>{" "}
                      {subComponent || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Key Activity:</span>{" "}
                      {keyActivity || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">No.:</span>{" "}
                      {selectedNo || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">
                        Performance Indicator:
                      </span>{" "}
                      {watchedPerformanceIndicator ||
                        selectedNoEntry?.performanceIndicator ||
                        "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Sub Activity:</span>{" "}
                      {watchedSubActivity || "N/A"}
                    </p>
                    <p>
                      <span className="font-medium">Title of Activities:</span>{" "}
                      {titleOfActivities || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-gray-50 p-4">
                  <h3 className="mb-3 font-medium">Budget Summary</h3>

                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Unit Cost:</span>{" "}
                      {formatCurrency(toNumber(unitCost))}
                    </p>
                    <p>
                      <span className="font-medium">Active Months:</span>{" "}
                      {activeMonthlyRows.length > 0
                        ? activeMonthlyRows.map((row) => row.label).join(", ")
                        : "None"}
                    </p>
                    <p>
                      <span className="font-medium">Total Target:</span>{" "}
                      {formatTarget(totalTarget)}
                    </p>
                    <p>
                      <span className="font-medium">Grand Total:</span>{" "}
                      {formatCurrency(grandTotal)}
                    </p>
                    {selectedUnitPlanningStats && (
                      <p>
                        <span className="font-medium">Planning Balance After Entry:</span>{" "}
                        {planningBalanceAfterEntryLabel}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {activeMonthlyRows.length > 0 && (
                <div className="rounded-xl border bg-white p-4">
                  <h3 className="mb-3 font-medium">
                    Monthly Breakdown Preview
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Month</th>
                          <th className="px-3 py-2 text-left">Target</th>
                          <th className="px-3 py-2 text-left">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMonthlyRows.map((row, index) => (
                          <tr
                            key={row.key}
                            className={index !== 0 ? "border-t" : ""}
                          >
                            <td className="px-3 py-2">{row.label}</td>
                            <td className="px-3 py-2">{row.target}</td>
                            <td className="px-3 py-2">
                              {formatCurrency(row.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td className="px-3 py-2 font-semibold">
                            Total
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatTarget(totalTarget)}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatCurrency(grandTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  variant="outline"
                  className="px-4 text-[15px]"
                >
                  Back
                </Button>

                <Button
                  type="submit"
                  disabled={!windowOpen || isSubmittingEntry}
                  className={`px-4 text-[15px] border-0 ${
                    windowOpen && !isSubmittingEntry
                      ? "bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] transition-all duration-200 hover:from-[#19265f] hover:to-[#213a80] hover:shadow-[0_10px_24px_rgba(31,47,116,0.38)]"
                      : isSubmittingEntry
                        ? "cursor-wait bg-[#233f8f] text-white opacity-75"
                        : "cursor-not-allowed bg-gray-300 text-gray-600"
                  }`}
                >
                  {isSubmittingEntry
                    ? isEditingReturnedEntry
                      ? "Resubmitting..."
                      : "Submitting..."
                    : isEditingReturnedEntry
                      ? "Resubmit Entry"
                      : "Submit to My Entries"}
                </Button>
              </div>
            </div>
          )}
            </fieldset>
          </form>
        </CardContent>
      </Card>

      {unchangedResubmitEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-4"
          onClick={() => !isSubmittingEntry && setUnchangedResubmitEntry(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[1.5rem] bg-white shadow-[0_22px_70px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b bg-white px-6 py-5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                No Changes Detected
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                This returned entry looks the same as before. Do you still want to resubmit it for review?
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 rounded-b-[1.5rem] border-t bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnchangedResubmitEntry(null)}
                disabled={isSubmittingEntry}
              >
                Keep Editing
              </Button>
              <Button
                type="button"
                onClick={confirmUnchangedResubmit}
                disabled={isSubmittingEntry}
                className="border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white shadow-[0_6px_16px_rgba(31,47,116,0.28)] hover:from-[#19265f] hover:to-[#213a80] disabled:cursor-wait disabled:opacity-75"
              >
                {isSubmittingEntry ? "Resubmitting..." : "Resubmit Anyway"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mergeWithDefaultFormValues(values = {}) {
  return {
    ...defaultFormValues,
    ...values,
    targets: {
      ...defaultFormValues.targets,
      ...(values.targets || {}),
    },
  };
}
