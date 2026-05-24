import { supabase } from "../lib/supabase";

function getTemplatePrefix(value) {
  return String(value || "").match(/\b\d+(?:\.\d+)+/)?.[0] || "";
}

function isOtherOperatingCostKeyActivity(value) {
  return /other\s+operating\s+cost\s+attributed\s+to\s+component/i.test(
    String(value || ""),
  );
}

function keyActivityBelongsToSubComponent(keyActivityName, subComponentName) {
  if (isOtherOperatingCostKeyActivity(keyActivityName)) return true;

  const keyPrefix = getTemplatePrefix(keyActivityName);
  const subPrefix = getTemplatePrefix(subComponentName);

  return !keyPrefix || !subPrefix || keyPrefix.startsWith(`${subPrefix}.`);
}

function subActivityBelongsToKeyActivity(subActivityName, keyActivityName) {
  if (isOtherOperatingCostKeyActivity(keyActivityName)) return true;

  const subActivityPrefix = getTemplatePrefix(subActivityName);
  const keyPrefix = getTemplatePrefix(keyActivityName);

  return (
    !subActivityPrefix ||
    !keyPrefix ||
    subActivityPrefix === keyPrefix ||
    subActivityPrefix.startsWith(`${keyPrefix}.`)
  );
}

function buildHierarchyRows({ components = [], subComponents = [], keyActivities = [], indicators = [], subActivities = [] }) {
  const componentById = Object.fromEntries(components.map((component) => [component.id, component]));
  const subComponentById = Object.fromEntries(subComponents.map((subComponent) => [subComponent.id, subComponent]));

  const subComponentsByComponent = subComponents.reduce((acc, subComponent) => {
    acc[subComponent.component_id] = acc[subComponent.component_id] || [];
    acc[subComponent.component_id].push(subComponent);
    return acc;
  }, {});

  const keyActivitiesBySubComponent = keyActivities.reduce((acc, keyActivity) => {
    acc[keyActivity.sub_component_id] = acc[keyActivity.sub_component_id] || [];
    acc[keyActivity.sub_component_id].push(keyActivity);
    return acc;
  }, {});

  const indicatorsByKeyActivity = indicators.reduce((acc, indicator) => {
    acc[indicator.key_activity_id] = acc[indicator.key_activity_id] || [];
    acc[indicator.key_activity_id].push(indicator);
    return acc;
  }, {});

  const subActivitiesByIndicator = subActivities.reduce((acc, subActivity) => {
    if (!subActivity.performance_indicator_id) return acc;
    acc[subActivity.performance_indicator_id] = acc[subActivity.performance_indicator_id] || [];
    acc[subActivity.performance_indicator_id].push(subActivity);
    return acc;
  }, {});

  const subActivitiesByKeyActivity = subActivities.reduce((acc, subActivity) => {
    if (!subActivity.key_activity_id) return acc;
    acc[subActivity.key_activity_id] = acc[subActivity.key_activity_id] || [];
    acc[subActivity.key_activity_id].push(subActivity);
    return acc;
  }, {});

  const rows = [];

  components.forEach((component) => {
    const children = subComponentsByComponent[component.id] || [];
    if (children.length > 0) return;

    rows.push({
      component_id: component.id,
      component: component.name,
      component_code: component.code,
      component_sort_order: component.sort_order,
      sub_component_id: null,
      sub_component: null,
      sub_component_code: null,
      sub_component_sort_order: null,
      key_activity_id: null,
      key_activity: null,
      key_activity_code: null,
      key_activity_sort_order: null,
      activity_no: null,
      label: null,
      performance_indicator: null,
      performance_indicator_id: null,
      performance_indicator_sort_order: null,
      sub_activity_id: null,
      sub_activity: null,
      sub_activity_code: null,
      sub_activity_sort_order: null,
      sort_order: component.sort_order,
    });
  });

  subComponents.forEach((subComponent) => {
    const component = componentById[subComponent.component_id];
    if (!component) return;
    const children = keyActivitiesBySubComponent[subComponent.id] || [];
    if (children.length > 0) return;

    rows.push({
      component_id: component.id,
      component: component.name,
      component_code: component.code,
      component_sort_order: component.sort_order,
      sub_component_id: subComponent.id,
      sub_component: subComponent.name,
      sub_component_code: subComponent.code,
      sub_component_sort_order: subComponent.sort_order,
      key_activity_id: null,
      key_activity: null,
      key_activity_code: null,
      key_activity_sort_order: null,
      activity_no: null,
      label: null,
      performance_indicator: null,
      performance_indicator_id: null,
      performance_indicator_sort_order: null,
      sub_activity_id: null,
      sub_activity: null,
      sub_activity_code: null,
      sub_activity_sort_order: null,
      sort_order: subComponent.sort_order,
    });
  });

  keyActivities.forEach((keyActivity) => {
    const subComponent = subComponentById[keyActivity.sub_component_id];
    const component = componentById[subComponent?.component_id];
    if (!component || !subComponent) return;
    if (!keyActivityBelongsToSubComponent(keyActivity.name, subComponent.name)) return;

    const indicatorRows = indicatorsByKeyActivity[keyActivity.id] || [];
    if (indicatorRows.length === 0) {
      const legacyActivityNo = keyActivity.activity_no;
      const legacyPerformanceIndicator = keyActivity.performance_indicator;
      const hasLegacyIndicator =
        legacyActivityNo !== null &&
        legacyActivityNo !== undefined &&
        legacyActivityNo !== "";

      if (hasLegacyIndicator) {
        const childSubActivities = (subActivitiesByKeyActivity[keyActivity.id] || []).filter(
          (subActivity) => subActivityBelongsToKeyActivity(subActivity.name, keyActivity.name),
        );
        const rowsToAdd = childSubActivities.length > 0 ? childSubActivities : [null];

        rowsToAdd.forEach((subActivity) => {
          rows.push({
            component_id: component.id,
            component: component.name,
            component_code: component.code,
            component_sort_order: component.sort_order,
            sub_component_id: subComponent.id,
            sub_component: subComponent.name,
            sub_component_code: subComponent.code,
            sub_component_sort_order: subComponent.sort_order,
            key_activity_id: keyActivity.id,
            key_activity: keyActivity.name,
            key_activity_code: keyActivity.code,
            key_activity_sort_order: keyActivity.sort_order,
            activity_no: legacyActivityNo,
            label: legacyPerformanceIndicator || "",
            performance_indicator: legacyPerformanceIndicator || "",
            performance_indicator_id: null,
            performance_indicator_sort_order: keyActivity.sort_order,
            sub_activity_id: subActivity?.id || null,
            sub_activity: subActivity?.name || null,
            sub_activity_code: subActivity?.code || null,
            sub_activity_sort_order: subActivity?.sort_order || null,
            sort_order: keyActivity.sort_order,
          });
        });
        return;
      }

      rows.push({
        component_id: component.id,
        component: component.name,
        component_code: component.code,
        component_sort_order: component.sort_order,
        sub_component_id: subComponent.id,
        sub_component: subComponent.name,
        sub_component_code: subComponent.code,
        sub_component_sort_order: subComponent.sort_order,
        key_activity_id: keyActivity.id,
        key_activity: keyActivity.name,
        key_activity_code: keyActivity.code,
        key_activity_sort_order: keyActivity.sort_order,
        activity_no: null,
        label: null,
        performance_indicator: null,
        performance_indicator_id: null,
        performance_indicator_sort_order: null,
        sub_activity_id: null,
        sub_activity: null,
        sub_activity_code: null,
        sub_activity_sort_order: null,
        sort_order: keyActivity.sort_order,
      });
      return;
    }

    indicatorRows.forEach((indicator) => {
      const indicatorSubActivities = subActivitiesByIndicator[indicator.id] || [];
      const legacySubActivities =
        indicatorRows.length === 1 ? subActivitiesByKeyActivity[keyActivity.id] || [] : [];
      const childSubActivities = (
        indicatorSubActivities.length > 0 ? indicatorSubActivities : legacySubActivities
      ).filter((subActivity) =>
        subActivityBelongsToKeyActivity(subActivity.name, keyActivity.name),
      );
      const rowsToAdd = childSubActivities.length > 0 ? childSubActivities : [null];

      rowsToAdd.forEach((subActivity) => {
        rows.push({
          component_id: component.id,
          component: component.name,
          component_code: component.code,
          component_sort_order: component.sort_order,
          sub_component_id: subComponent.id,
          sub_component: subComponent.name,
          sub_component_code: subComponent.code,
          sub_component_sort_order: subComponent.sort_order,
          key_activity_id: keyActivity.id,
          key_activity: keyActivity.name,
          key_activity_code: keyActivity.code,
          key_activity_sort_order: keyActivity.sort_order,
          activity_no: indicator.activity_no,
          label: indicator.label,
          performance_indicator: indicator.label,
          performance_indicator_id: indicator.id,
          performance_indicator_sort_order: indicator.sort_order,
          sub_activity_id: subActivity?.id || null,
          sub_activity: subActivity?.name || null,
          sub_activity_code: subActivity?.code || null,
          sub_activity_sort_order: subActivity?.sort_order || null,
          sort_order: keyActivity.sort_order,
        });
      });
    });
  });

  return rows;
}

// Full hierarchy read used after refresh. Reading the base tables avoids stale
// `template_hierarchy` views that omit partial branches or the PI table.
export const getTemplateHierarchy = async () => {
  const [componentRes, subComponentRes, keyActivityRes, initialIndicatorRes, initialSubActivityRes] = await Promise.all([
    supabase.from("components").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("sub_components").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("key_activities").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("performance_indicators").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("sub_activities").select("*").eq("is_active", true).order("sort_order"),
  ]);
  let indicatorRes = initialIndicatorRes;
  let subActivityRes = initialSubActivityRes;

  if (
    indicatorRes.error?.message?.includes("performance_indicators") ||
    indicatorRes.error?.code === "42P01" ||
    indicatorRes.error?.code === "PGRST205"
  ) {
    indicatorRes = { data: [], error: null };
  }

  if (subActivityRes.error?.message?.includes("performance_indicator_id")) {
    subActivityRes = await supabase
      .from("sub_activities")
      .select("id, key_activity_id, name, code, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order");
  }

  const error =
    componentRes.error ||
    subComponentRes.error ||
    keyActivityRes.error ||
    indicatorRes.error ||
    subActivityRes.error;

  if (error) {
    console.error("[templateService.getTemplateHierarchy] Failed to load hierarchy", error);
    return { data: null, error };
  }

  return {
    data: buildHierarchyRows({
      components: componentRes.data || [],
      subComponents: subComponentRes.data || [],
      keyActivities: keyActivityRes.data || [],
      indicators: indicatorRes.data || [],
      subActivities: subActivityRes.data || [],
    }),
    error: null,
  };
};
