import { supabase } from '../lib/supabase';
import { getPasswordPolicyError } from '../lib/passwordPolicy';
import { getUnitLookupValues, normalizeUnitCode } from '../lib/units';

const ENTRY_SELECT_WITH_REVIEWER = `
        *,
        profiles!owner_id (username, full_name),
        reviewer:profiles!reviewer_id (username, full_name),
        units (name, code),
        components (name),
        sub_components (name),
        key_activities (name, activity_no, performance_indicator),
        sub_activities (name)
      `;

const ENTRY_SELECT = `
        *,
        profiles!owner_id (username, full_name),
        units (name, code),
        components (name),
        sub_components (name),
        key_activities (name, activity_no, performance_indicator),
        sub_activities (name)
      `;

const MONTH_NAMES = {
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December'
};

function getTemplatePrefix(value) {
  return String(value || '').match(/\b\d+(?:\.\d+)+/)?.[0] || '';
}

function isOtherOperatingCostKeyActivity(value) {
  return /other\s+operating\s+cost\s+attributed\s+to\s+component/i.test(
    String(value || ''),
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

function formatPersonName(profile) {
  if (!profile) return '';
  return profile.full_name || profile.username || '';
}

function buildMonthlyBreakdown(monthlyTargets = [], unitCost = 0) {
  return (monthlyTargets || [])
    .filter(mt => mt.target_quantity > 0)
    .map(mt => ({
      month: MONTH_NAMES[mt.month?.toLowerCase()] || mt.month,
      target: mt.target_quantity,
      amount: mt.target_quantity * (unitCost || 0)
    }));
}

function buildMonthlyTargetRows(entryId, monthlyBreakdown = []) {
  return (monthlyBreakdown || [])
    .filter(month => Number(month.target || 0) > 0)
    .map(month => ({
      entry_id: entryId,
      month: month.month.toLowerCase().slice(0, 3),
      target_quantity: month.target,
    }));
}

function isBlankClassification(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === 'n/a' ||
    normalized.startsWith('select ')
  );
}

function shouldSkipClassificationLookup(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '' || normalized.startsWith('select ');
}

function normalizeEntryClassificationText(value) {
  const text = String(value ?? '').trim();
  return isBlankClassification(text) ? 'N/A' : text;
}

function normalizeEntryClassificationValues(entryData = {}) {
  return {
    subComponent: normalizeEntryClassificationText(entryData.subComponent),
    keyActivity: normalizeEntryClassificationText(entryData.keyActivity),
    no: normalizeEntryClassificationText(entryData.no),
    performanceIndicator: normalizeEntryClassificationText(entryData.performanceIndicator),
    subActivity: normalizeEntryClassificationText(entryData.subActivity),
  };
}

function getEntryClassificationText(savedText, joinedText, fallback = 'N/A') {
  return String(savedText || joinedText || fallback).trim();
}

function findDisplayedFallbackTemplateRow(rows) {
  return (rows || []).find((row) => String(row?.name || '').trim() === '') || null;
}

function pickTemplateRowWithDisplayedFallback(rows, value) {
  const match = pickTemplateRow(rows, value);
  if (match) return match;
  return String(value || '').trim().toLowerCase() === 'n/a'
    ? findDisplayedFallbackTemplateRow(rows)
    : null;
}

function normalizeTemplateLookupValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function templateLookupValuesEqual(a, b) {
  return normalizeTemplateLookupValue(a) === normalizeTemplateLookupValue(b);
}

function templateRowMatchesInput(row, value) {
  const input = String(value ?? '').trim();
  const normalizedInput = normalizeTemplateLookupValue(input);
  if (!normalizedInput) return false;

  const rowName = row?.name || '';
  const normalizedName = normalizeTemplateLookupValue(rowName);
  const inputPrefix = getTemplatePrefix(input);
  const rowNamePrefix = getTemplatePrefix(rowName);
  const rowActivityNo = String(row?.activity_no ?? '').trim();

  if (normalizedName === normalizedInput) return true;
  if (rowActivityNo && templateLookupValuesEqual(rowActivityNo, input)) return true;
  if (inputPrefix && rowNamePrefix && inputPrefix === rowNamePrefix) return true;
  if (!inputPrefix && normalizedName.startsWith(`${normalizedInput} `)) return true;
  if (!inputPrefix && normalizedName.startsWith(`${normalizedInput} -`)) return true;

  return false;
}

function pickTemplateRow(rows, value) {
  const candidates = rows || [];
  const activeRows = candidates.filter((row) => row?.is_active !== false);
  const orderedRows = activeRows.length > 0 ? activeRows : candidates;

  return orderedRows.find((row) => templateRowMatchesInput(row, value)) || null;
}

function normalizeNullableTimestamp(value) {
  return value === '' ? null : value;
}

function normalizeNullableId(value) {
  return value === '' ? null : value;
}

// Authentication services
export const authService = {
  async signUp(email, password, metadata = {}) {
    const passwordError = getPasswordPolicyError(password, { required: true });
    if (passwordError) throw new Error(passwordError);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: metadata.username,
          full_name: metadata.fullName || metadata.username,
          role: metadata.role || 'encoder',
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async getLoginEmailByUsername(username) {
    const { data: authEmail, error: authEmailError } = await supabase
      .rpc('get_auth_email_by_username', { p_username: username });

    if (!authEmailError && authEmail) {
      return authEmail;
    }

    const { data: profileEmail, error: profileEmailError } = await supabase
      .rpc('get_email_by_username', { p_username: username });

    if (profileEmailError) throw authEmailError || profileEmailError;
    return profileEmail;
  },

  async requestPasswordReset(email, redirectTo) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
    return data;
  },

  async exchangeRecoveryCode(code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data;
  },

  async setRecoverySession(accessToken, refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data;
  },

  async updatePassword(newPassword) {
    const passwordError = getPasswordPolicyError(newPassword, { required: true });
    if (passwordError) throw new Error(passwordError);

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// User management services (admin only)
export const usersService = {
  async getAll() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getAccountLogs(limit = 100) {
    const { data, error } = await supabase
      .from('account_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async create(userData) {
    const passwordError = getPasswordPolicyError(userData.password, { required: true });
    if (passwordError) throw new Error(passwordError);

    const { data, error } = await supabase
      .rpc('admin_create_user_account', {
        p_username: userData.username,
        p_full_name: userData.fullName,
        p_email: userData.email,
        p_role: userData.role,
        p_password: userData.password,
      });
    if (error) {
      if (error.message?.includes('admin_create_user_account')) {
        throw new Error(
          'The database account-creation migration has not been applied yet. Please apply supabase/migrations/011_admin_create_user_account_and_unique_login.sql, then try again.',
        );
      }
      throw error;
    }
    return data;
  },

  async update(userId, updates) {
    const { data: currentProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('username, full_name, email, role, status')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    return this.updateAccount(userId, {
      username: updates.username ?? currentProfile.username,
      fullName: updates.full_name ?? currentProfile.full_name,
      email: updates.email ?? currentProfile.email,
      role: updates.role ?? currentProfile.role,
      status: updates.status ?? currentProfile.status,
    });
  },

  async updateAccount(userId, userData) {
    if (userData.password) {
      const passwordError = getPasswordPolicyError(userData.password, { required: true });
      if (passwordError) throw new Error(passwordError);
    }

    const { data, error } = await supabase
      .rpc('admin_update_user_account', {
        p_user_id: userId,
        p_username: userData.username,
        p_full_name: userData.fullName,
        p_email: userData.email,
        p_role: userData.role,
        p_status: userData.status || 'active',
        p_password: userData.password || null,
      });
    if (error) throw error;
    return data;
  },

  async delete(userId) {
    const { data, error } = await supabase
      .rpc('admin_delete_user_account', {
        p_user_id: userId,
      });

    if (error) {
      if (error.message?.includes('admin_delete_user_account')) {
        throw new Error(
          'The database account-deletion migration has not been applied yet. Please apply supabase/migrations/028_admin_delete_user_account.sql, then try again.',
        );
      }
      throw error;
    }

    return data;
  }
};

// Entry management services
export const entriesService = {
  getMonthName(monthCode) {
    return MONTH_NAMES[monthCode?.toLowerCase()] || monthCode;
  },

  transformEntryWithJoins(row, monthlyBreakdown = []) {
    if (!row) return row;
    
    // Calculate grand total from monthly breakdown
    const grandTotal = monthlyBreakdown.reduce((sum, m) => sum + (m.amount || 0), 0);
    
    return {
      id: row.id,
      ownerId: row.owner_id,
      unitId: row.unit_id,
      componentId: row.component_id,
      subComponentId: row.sub_component_id,
      keyActivityId: row.key_activity_id,
      subActivityId: row.sub_activity_id,
      ownerUsername: row.profiles?.username || '',
      ownerFullName: row.profiles?.full_name || '',
      ownerDisplayName: formatPersonName(row.profiles),
      reviewerId: row.reviewer_id || '',
      reviewerUsername: row.reviewer?.username || '',
      reviewerFullName: row.reviewer?.full_name || '',
      reviewerDisplayName: formatPersonName(row.reviewer),
      planningYear: row.planning_year,
      unit: normalizeUnitCode(row.units?.code || row.units?.name || ''),
      component: row.components?.name || '',
      subComponent: getEntryClassificationText(
        row.sub_component_text,
        row.sub_components?.name,
      ),
      keyActivity: getEntryClassificationText(
        row.key_activity_text,
        row.key_activities?.name,
      ),
      // Prefer entry-level values saved from Submit Entry. The template now
      // stores No./PI in performance_indicators, so key_activities may be blank.
      no: getEntryClassificationText(
        row.no || row.activity_no,
        row.key_activities?.activity_no,
      ),
      performanceIndicator: getEntryClassificationText(
        row.performance_indicator || row.performanceIndicator,
        row.key_activities?.performance_indicator,
      ),
      subActivity: getEntryClassificationText(
        row.sub_activity_text,
        row.sub_activities?.name,
      ),
      titleOfActivities: row.title_of_activities,
      unitCost: Number(row.unit_cost) || 0,
      monthlyBreakdown: monthlyBreakdown,
      grandTotal: grandTotal,
      status: row.status,
      adminComment: row.admin_comment || row.reviewer_notes || '',
      submittedAt: row.submission_date,
      reviewedAt: row.review_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async getAll() {
    const { data: { user } } = await supabase.auth.getUser();
    
    let query = supabase
      .from('entries')
      .select(ENTRY_SELECT_WITH_REVIEWER)
      .order('created_at', { ascending: false });

    const profile = await authService.getProfile(user.id);
    if (profile.role !== 'admin') {
      query = query.eq('owner_id', user.id);
    }

    let { data, error } = await query;
    if (error?.message?.includes('reviewer_id') || error?.message?.includes('relationship')) {
      let fallbackQuery = supabase
        .from('entries')
        .select(ENTRY_SELECT)
        .order('created_at', { ascending: false });
      if (profile.role !== 'admin') {
        fallbackQuery = fallbackQuery.eq('owner_id', user.id);
      }
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      console.error('Error getting entries:', error);
      throw error;
    }
    
    const entryIds = (data || []).map((row) => row.id);
    let monthlyTargets = [];

    if (entryIds.length > 0) {
      const { data: targetsData, error: targetsError } = await supabase
        .from('monthly_targets')
        .select('entry_id, month, target_quantity')
        .in('entry_id', entryIds);

      if (targetsError) throw targetsError;
      monthlyTargets = targetsData || [];
    }

    const targetsByEntryId = monthlyTargets.reduce((acc, target) => {
      if (!acc[target.entry_id]) acc[target.entry_id] = [];
      acc[target.entry_id].push(target);
      return acc;
    }, {});

    return (data || []).map((row) =>
      this.transformEntryWithJoins(
        row,
        buildMonthlyBreakdown(targetsByEntryId[row.id], row.unit_cost),
      ),
    );
  },

  async getById(id) {
    let { data, error } = await supabase
      .from('entries')
      .select(ENTRY_SELECT_WITH_REVIEWER)
      .eq('id', id)
      .single();
    if (error?.message?.includes('reviewer_id') || error?.message?.includes('relationship')) {
      const fallback = await supabase
        .from('entries')
        .select(ENTRY_SELECT)
        .eq('id', id)
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    
    // Fetch monthly targets for this entry
    const { data: monthlyTargets } = await supabase
      .from('monthly_targets')
      .select('month, target_quantity')
      .eq('entry_id', id);
    
    const monthlyBreakdown = buildMonthlyBreakdown(monthlyTargets, data.unit_cost);
    
    return this.transformEntryWithJoins(data, monthlyBreakdown);
  },

  async create(entryData, options = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be signed in to submit an entry.');
    const status = options.preserveStatus
      ? entryData.status || 'Pending Review'
      : 'Pending Review';
    
    const findUnitId = async (identifier) => {
      const lookupValues = getUnitLookupValues(identifier);
      const { data, error } = await supabase
        .from('units')
        .select('id')
        .or(lookupValues.flatMap((value) => [`code.eq.${value}`, `name.eq.${value}`]).join(','))
        .maybeSingle();
      if (error) throw error;
      return data?.id;
    };
    
    const findComponent = async (name) => {
      const { data, error } = await supabase
        .from('components')
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return pickTemplateRow(data, name);
    };
    
    const findSubComponent = async (name, componentId) => {
      if (shouldSkipClassificationLookup(name)) return null;
      let query = supabase
        .from('sub_components')
        .select('id, name, component_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (componentId) query = query.eq('component_id', componentId);
      const { data, error } = await query;
      if (error) throw error;
      const scopedMatch = pickTemplateRowWithDisplayedFallback(data, name);
      if (scopedMatch || !componentId) return scopedMatch;

      const fallback = await supabase
        .from('sub_components')
        .select('id, name, component_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (fallback.error) throw fallback.error;
      return pickTemplateRowWithDisplayedFallback(fallback.data, name);
    };
    
    const findKeyActivity = async (name, subComponentId) => {
      if (shouldSkipClassificationLookup(name)) return null;
      let query = supabase
        .from('key_activities')
        .select('id, name, activity_no, sub_component_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (subComponentId) query = query.eq('sub_component_id', subComponentId);
      const { data, error } = await query;
      if (error) throw error;
      const scopedMatch = pickTemplateRowWithDisplayedFallback(data, name);
      if (scopedMatch || !subComponentId) return scopedMatch;

      const fallback = await supabase
        .from('key_activities')
        .select('id, name, activity_no, sub_component_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (fallback.error) throw fallback.error;
      return pickTemplateRowWithDisplayedFallback(fallback.data, name);
    };
    
    const findSubActivity = async (name, keyActivityId) => {
      if (shouldSkipClassificationLookup(name)) return null;
      let query = supabase
        .from('sub_activities')
        .select('id, name, key_activity_id, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (keyActivityId) query = query.eq('key_activity_id', keyActivityId);
      let { data, error } = await query;

      if (error?.message?.includes('key_activity_id')) {
        const fallback = await supabase
          .from('sub_activities')
          .select('id, name, is_active, sort_order')
          .eq('is_active', true)
          .order('sort_order');
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      const scopedMatch = pickTemplateRowWithDisplayedFallback(data, name);
      if (scopedMatch || !keyActivityId) return scopedMatch;

      const fallback = await supabase
        .from('sub_activities')
        .select('id, name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (fallback.error) throw fallback.error;
      return pickTemplateRowWithDisplayedFallback(fallback.data, name);
    };
    
    const classification = normalizeEntryClassificationValues(entryData);
    const unitId = entryData.unitId || await findUnitId(entryData.unit);
    const componentRow = entryData.componentId
      ? { id: entryData.componentId, name: entryData.component }
      : await findComponent(entryData.component);
    const componentId = componentRow?.id;
    const subComponentRow =
      entryData.subComponentId
        ? { id: entryData.subComponentId, name: classification.subComponent }
        : await findSubComponent(classification.subComponent, componentId);
    const subComponentId = subComponentRow?.id;
    const keyActivityRow =
      entryData.keyActivityId
        ? { id: entryData.keyActivityId, name: classification.keyActivity }
        : await findKeyActivity(classification.keyActivity, subComponentId);
    const keyActivityId = keyActivityRow?.id;
    const subActivityRow =
      entryData.subActivityId
        ? { id: entryData.subActivityId, name: classification.subActivity }
        : await findSubActivity(classification.subActivity, keyActivityId);
    const subActivityId = subActivityRow?.id;
    
    if (!unitId) throw new Error(`Unit not found: ${entryData.unit}`);
    if (!componentId) throw new Error(`Component not found: ${entryData.component}`);
    if (!isBlankClassification(classification.subComponent) && !subComponentId) {
      throw new Error(`Sub-component not found: ${classification.subComponent}`);
    }
    if (!isBlankClassification(classification.keyActivity) && !keyActivityId) {
      throw new Error(`Key activity not found: ${classification.keyActivity}`);
    }
    if (!isBlankClassification(classification.subActivity) && !subActivityId) {
      throw new Error(`Sub-activity not found: ${classification.subActivity}`);
    }
    
    // Insert entry
    const insertData = {
      owner_id: user.id,
      unit_id: unitId,
      planning_year: parseInt(entryData.planningYear),
      component_id: componentId,
      sub_component_id: subComponentId || null,
      key_activity_id: keyActivityId || null,
      sub_activity_id: subActivityId || null,
      title_of_activities: entryData.titleOfActivities,
      unit_cost: entryData.unitCost || 0,
      status,
      submission_date: new Date().toISOString(),
    };

    const insertDataWithClassification = {
      ...insertData,
      sub_component_text: classification.subComponent,
      key_activity_text: classification.keyActivity,
      no: classification.no,
      performance_indicator: classification.performanceIndicator,
      sub_activity_text: classification.subActivity,
    };

    let insertResponse = await supabase
      .from('entries')
      .insert(insertDataWithClassification)
      .select()
      .single();

    if (
      insertResponse.error?.code === 'PGRST204' ||
      insertResponse.error?.message?.includes("'no'") ||
      insertResponse.error?.message?.includes('performance_indicator') ||
      insertResponse.error?.message?.includes('sub_component_text') ||
      insertResponse.error?.message?.includes('key_activity_text') ||
      insertResponse.error?.message?.includes('sub_activity_text')
    ) {
      insertResponse = await supabase
        .from('entries')
        .insert(insertData)
        .select()
        .single();
    }

    const { data, error } = insertResponse;
    
    if (error) {
      console.error('Error inserting entry:', error);
      if (
        error.message?.includes('violates not-null constraint') &&
        (
          error.message?.includes('sub_component_id') ||
          error.message?.includes('key_activity_id') ||
          error.message?.includes('sub_activity_id')
        )
      ) {
        throw new Error(
          'N/A entries need the optional hierarchy migration. Please run supabase/migrations/034_enforce_optional_na_entry_hierarchy.sql in Supabase, then try again.',
        );
      }
      throw new Error(`Failed to create entry: ${error.message}`);
    }

    // Insert monthly targets
    if (entryData.monthlyBreakdown && entryData.monthlyBreakdown.length > 0) {
      const monthlyTargetRows = buildMonthlyTargetRows(data.id, entryData.monthlyBreakdown);

      if (monthlyTargetRows.length > 0) {
        const { error: mtError } = await supabase
          .from('monthly_targets')
          .insert(monthlyTargetRows);

        if (mtError) throw mtError;
      }
    }

    const monthlyBreakdown = entryData.monthlyBreakdown || [];
    const grandTotal =
      entryData.grandTotal ??
      monthlyBreakdown.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return {
      ...entryData,
      id: data.id,
      ownerId: data.owner_id,
      planningYear: data.planning_year,
      unitCost: Number(data.unit_cost) || 0,
      status: data.status,
      submittedAt: data.submission_date,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      subComponent: classification.subComponent,
      keyActivity: classification.keyActivity,
      no: classification.no,
      performanceIndicator: classification.performanceIndicator,
      subActivity: classification.subActivity,
      monthlyBreakdown,
      grandTotal,
    };
  },

  async update(id, updates) {
    const dbUpdates = {};
    
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.submission_date !== undefined) dbUpdates.submission_date = normalizeNullableTimestamp(updates.submission_date);
    if (updates.submittedAt !== undefined) dbUpdates.submission_date = normalizeNullableTimestamp(updates.submittedAt);
    if (updates.review_date !== undefined) dbUpdates.review_date = normalizeNullableTimestamp(updates.review_date);
    if (updates.reviewedAt !== undefined) dbUpdates.review_date = normalizeNullableTimestamp(updates.reviewedAt);
    if (updates.reviewerId !== undefined) dbUpdates.reviewer_id = normalizeNullableId(updates.reviewerId);
    if (updates.reviewer_id !== undefined) dbUpdates.reviewer_id = normalizeNullableId(updates.reviewer_id);
    if (updates.planningYear !== undefined) dbUpdates.planning_year = parseInt(updates.planningYear, 10);
    if (updates.planning_year !== undefined) dbUpdates.planning_year = parseInt(updates.planning_year, 10);
    if (updates.unitId) dbUpdates.unit_id = updates.unitId;
    if (updates.unit_id) dbUpdates.unit_id = updates.unit_id;
    if (updates.componentId) dbUpdates.component_id = updates.componentId;
    if (updates.component_id) dbUpdates.component_id = updates.component_id;
    if (updates.subComponentId !== undefined) dbUpdates.sub_component_id = normalizeNullableId(updates.subComponentId);
    if (updates.sub_component_id !== undefined) dbUpdates.sub_component_id = normalizeNullableId(updates.sub_component_id);
    if (updates.keyActivityId !== undefined) dbUpdates.key_activity_id = normalizeNullableId(updates.keyActivityId);
    if (updates.key_activity_id !== undefined) dbUpdates.key_activity_id = normalizeNullableId(updates.key_activity_id);
    if (updates.subActivityId !== undefined) dbUpdates.sub_activity_id = normalizeNullableId(updates.subActivityId);
    if (updates.sub_activity_id !== undefined) dbUpdates.sub_activity_id = normalizeNullableId(updates.sub_activity_id);
    if (updates.titleOfActivities !== undefined) dbUpdates.title_of_activities = updates.titleOfActivities;
    if (updates.unitCost !== undefined) dbUpdates.unit_cost = updates.unitCost;
    if (updates.adminComment !== undefined) dbUpdates.admin_comment = updates.adminComment;
    if (updates.reviewer_notes !== undefined) dbUpdates.admin_comment = updates.reviewer_notes;
    if (updates.admin_comment !== undefined) dbUpdates.admin_comment = updates.admin_comment;
    if (updates.subComponent !== undefined) {
      const subComponentText = normalizeEntryClassificationText(updates.subComponent);
      dbUpdates.sub_component_text = subComponentText;

      if (isBlankClassification(subComponentText)) {
        dbUpdates.sub_component_id = null;
        dbUpdates.key_activity_id = null;
        dbUpdates.sub_activity_id = null;
        dbUpdates.key_activity_text = 'N/A';
        dbUpdates.no = 'N/A';
        dbUpdates.performance_indicator = 'N/A';
        dbUpdates.sub_activity_text = 'N/A';
      }
    }
    if (updates.keyActivity !== undefined) {
      const keyActivityText = normalizeEntryClassificationText(updates.keyActivity);
      dbUpdates.key_activity_text = keyActivityText;

      if (isBlankClassification(keyActivityText)) {
        dbUpdates.key_activity_id = null;
        dbUpdates.sub_activity_id = null;
        dbUpdates.no = 'N/A';
        dbUpdates.performance_indicator = 'N/A';
        dbUpdates.sub_activity_text = 'N/A';
      }
    }
    if (updates.no !== undefined) dbUpdates.no = normalizeEntryClassificationText(updates.no);
    if (updates.performanceIndicator !== undefined) {
      dbUpdates.performance_indicator = normalizeEntryClassificationText(
        updates.performanceIndicator,
      );
    }
    if (updates.subActivity !== undefined) {
      dbUpdates.sub_activity_text = normalizeEntryClassificationText(updates.subActivity);
    }
    
    if (Object.keys(dbUpdates).length > 0) {
      let response = await supabase
        .from('entries')
        .update(dbUpdates)
        .eq('id', id);

      if (
        response.error?.code === 'PGRST204' ||
        response.error?.message?.includes("'no'") ||
        response.error?.message?.includes('performance_indicator') ||
        response.error?.message?.includes('sub_component_text') ||
        response.error?.message?.includes('key_activity_text') ||
        response.error?.message?.includes('sub_activity_text') ||
        response.error?.message?.includes('admin_comment') ||
        response.error?.message?.includes('reviewer_id')
      ) {
        const shouldUseReviewerNotes =
          response.error?.message?.includes('admin_comment');
        const fallbackUpdates = { ...dbUpdates };
        delete fallbackUpdates.sub_component_text;
        delete fallbackUpdates.key_activity_text;
        delete fallbackUpdates.no;
        delete fallbackUpdates.performance_indicator;
        delete fallbackUpdates.sub_activity_text;
        delete fallbackUpdates.reviewer_id;
        if (shouldUseReviewerNotes && fallbackUpdates.admin_comment !== undefined) {
          fallbackUpdates.reviewer_notes = fallbackUpdates.admin_comment;
          delete fallbackUpdates.admin_comment;
        }
        response = await supabase
          .from('entries')
          .update(fallbackUpdates)
          .eq('id', id);
      }
        
      if (response.error) {
        console.error('Update error:', response.error);
        throw response.error;
      }
    }
    
    // Update monthly targets if provided
    if (updates.monthlyBreakdown && updates.monthlyBreakdown.length > 0) {
      // Delete existing targets
      await supabase.from('monthly_targets').delete().eq('entry_id', id);

      const monthlyTargetRows = buildMonthlyTargetRows(id, updates.monthlyBreakdown);
      if (monthlyTargetRows.length > 0) {
        const { error: mtError } = await supabase
          .from('monthly_targets')
          .insert(monthlyTargetRows);
        if (mtError) throw mtError;
      }
    }
    
    return await this.getById(id);
  },

  async delete(id) {
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error('Entry could not be deleted. You may not have permission to delete it.');
    }
    return data;
  },
};

export const budgetPlanningService = {
  async getUnitStats(planningYear) {
    const rpcArgs = planningYear
      ? { p_planning_year: Number(planningYear) }
      : {};
    const { data, error } = await supabase.rpc('get_unit_planning_budget_stats', rpcArgs);
    if (error) throw error;

    return (data || []).map((row) => ({
      unit: normalizeUnitCode(row.unit),
      planningEstimate: Number(row.planning_estimate) || 0,
      approvedTotal: Number(row.approved_total) || 0,
      variance: Number(row.variance) || 0,
      approvedCount: Number(row.approved_count) || 0,
    }));
  },
};

// Template services (read-only)
export const templateService = {
  async getHierarchy() {
    // Query individual tables instead of the view, because the view
    // does not join the separate performance_indicators table.
    const [compRes, scRes, kaRes, piRes, initialSaRes] = await Promise.all([
      supabase.from('components').select('id, name, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('sub_components').select('id, name, component_id, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('key_activities').select('id, name, sub_component_id, activity_no, performance_indicator, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('performance_indicators').select('id, key_activity_id, activity_no, label, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('sub_activities').select('id, name, performance_indicator_id, key_activity_id, sort_order').eq('is_active', true).order('sort_order'),
    ]);
    let saRes = initialSaRes;
    if (initialSaRes.error?.message?.includes('performance_indicator_id')) {
      saRes = await supabase
        .from('sub_activities')
        .select('id, name, key_activity_id, sort_order')
        .eq('is_active', true)
        .order('sort_order');
    }

    if (compRes.error) throw compRes.error;
    if (scRes.error) throw scRes.error;
    if (kaRes.error) throw kaRes.error;
    if (piRes.error) throw piRes.error;
    if (saRes.error) throw saRes.error;

    // Build lookup maps
    const compMap = Object.fromEntries(compRes.data.map((c) => [c.id, c]));
    const scMap = Object.fromEntries(scRes.data.map((sc) => [sc.id, sc]));

    // Group performance_indicators by key_activity_id
    const piByKa = {};
    for (const pi of piRes.data) {
      if (!piByKa[pi.key_activity_id]) piByKa[pi.key_activity_id] = [];
      piByKa[pi.key_activity_id].push(pi);
    }

    // Group sub_activities by both possible FK columns. Older deployments use
    // key_activity_id; newer ones may use performance_indicator_id.
    const saByPi = {};
    const saByKa = {};
    for (const sa of saRes.data) {
      if (sa.performance_indicator_id) {
        if (!saByPi[sa.performance_indicator_id]) saByPi[sa.performance_indicator_id] = [];
        saByPi[sa.performance_indicator_id].push(sa);
      }
      if (sa.key_activity_id) {
        if (!saByKa[sa.key_activity_id]) saByKa[sa.key_activity_id] = [];
        saByKa[sa.key_activity_id].push(sa);
      }
    }

    // Build flat rows that match the structure the frontend expects
    const rows = [];

    for (const comp of compRes.data) {
      const subComponents = scRes.data.filter((sc) => sc.component_id === comp.id);
      if (subComponents.length > 0) continue;
      // Emit parent-only rows so Submit Entry can show N/A instead of losing
      // components that do not have child hierarchy rows yet.
      rows.push({
        component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
        sub_component: null, sub_component_id: null, sub_component_sort_order: null,
        key_activity: null, key_activity_id: null, key_activity_sort_order: null,
        activity_no: null, label: null, performance_indicator_sort_order: null,
        sub_activity: null, sub_activity_id: null, sub_activity_sort_order: null,
      });
    }

    for (const sc of scRes.data) {
      const comp = compMap[sc.component_id];
      if (!comp) continue;
      const keyActivities = kaRes.data.filter((ka) => ka.sub_component_id === sc.id);
      if (keyActivities.length > 0) continue;
      // Preserve sub-components with no key activities so the next dropdown can
      // intentionally fall back to N/A instead of appearing broken.
      rows.push({
        component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
        sub_component: sc.name, sub_component_id: sc.id, sub_component_sort_order: sc.sort_order,
        key_activity: null, key_activity_id: null, key_activity_sort_order: null,
        activity_no: null, label: null, performance_indicator_sort_order: null,
        sub_activity: null, sub_activity_id: null, sub_activity_sort_order: null,
      });
    }

    for (const ka of kaRes.data) {
      const sc = scMap[ka.sub_component_id];
      if (!sc) continue;
      const comp = compMap[sc.component_id];
      if (!comp) continue;
      if (!keyActivityBelongsToSubComponent(ka.name, sc.name)) continue;

      const pis = piByKa[ka.id] || [];
      if (pis.length === 0) {
        const hasLegacyIndicator =
          ka.activity_no !== null &&
          ka.activity_no !== undefined &&
          ka.activity_no !== "";

        if (hasLegacyIndicator) {
          const subs = (saByKa[ka.id] || []).filter((sa) =>
            subActivityBelongsToKeyActivity(sa.name, ka.name),
          );
          const rowsToAdd = subs.length > 0 ? subs : [null];

          for (const sa of rowsToAdd) {
            rows.push({
              component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
              sub_component: sc.name, sub_component_id: sc.id, sub_component_sort_order: sc.sort_order,
              key_activity: ka.name, key_activity_id: ka.id, key_activity_sort_order: ka.sort_order,
              activity_no: ka.activity_no, label: ka.performance_indicator || '', performance_indicator_sort_order: ka.sort_order,
              sub_activity: sa?.name || null, sub_activity_id: sa?.id || null, sub_activity_sort_order: sa?.sort_order || null,
            });
          }
          continue;
        }
        // Key activity with no performance indicators yet — emit placeholder row
        rows.push({
          component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
          sub_component: sc.name, sub_component_id: sc.id, sub_component_sort_order: sc.sort_order,
          key_activity: ka.name, key_activity_id: ka.id, key_activity_sort_order: ka.sort_order,
          activity_no: null, label: null, performance_indicator_sort_order: null,
          sub_activity: null, sub_activity_id: null, sub_activity_sort_order: null,
        });
      } else {
        for (const pi of pis) {
          const piSubs = saByPi[pi.id] || [];
          const legacySubs = pis.length === 1 ? saByKa[ka.id] || [] : [];
          const subs = (piSubs.length > 0 ? piSubs : legacySubs).filter((sa) =>
            subActivityBelongsToKeyActivity(sa.name, ka.name),
          );
          if (subs.length === 0) {
            rows.push({
              component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
              sub_component: sc.name, sub_component_id: sc.id, sub_component_sort_order: sc.sort_order,
              key_activity: ka.name, key_activity_id: ka.id, key_activity_sort_order: ka.sort_order,
              activity_no: pi.activity_no, label: pi.label, performance_indicator_sort_order: pi.sort_order,
              sub_activity: null, sub_activity_id: null, sub_activity_sort_order: null,
            });
          } else {
            for (const sa of subs) {
              rows.push({
                component: comp.name, component_id: comp.id, component_sort_order: comp.sort_order,
                sub_component: sc.name, sub_component_id: sc.id, sub_component_sort_order: sc.sort_order,
                key_activity: ka.name, key_activity_id: ka.id, key_activity_sort_order: ka.sort_order,
                activity_no: pi.activity_no, label: pi.label, performance_indicator_sort_order: pi.sort_order,
                sub_activity: sa.name, sub_activity_id: sa.id, sub_activity_sort_order: sa.sort_order,
              });
            }
          }
        }
      }
    }

    return rows;
  },

  async getUnits() {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('is_active', true)
      .order('code');
    if (error) throw error;
    return data;
  },

  async getComponents() {
    const { data, error } = await supabase
      .from('components')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return data;
  },

  async getSubComponents(componentId) {
    const { data, error } = await supabase
      .from('sub_components')
      .select('*')
      .eq('component_id', componentId)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return data;
  },

  async getKeyActivities(subComponentId) {
    const { data, error } = await supabase
      .from('key_activities')
      .select('*')
      .eq('sub_component_id', subComponentId)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return data;
  },

  async getSubActivities(performanceIndicatorId) {
    const { data, error } = await supabase
      .from('sub_activities')
      .select('*')
      .eq('performance_indicator_id', performanceIndicatorId)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return data;
  }
};

function assertTemplateMutation(action, payload, result, error) {
  if (error) {
    console.error(`[templateMgmtService.${action}] Supabase error`, {
      payload,
      error,
    });
    throw error;
  }

  if (!result) {
    const missingResultError = new Error(`${action} did not return a saved row from Supabase.`);
    console.error(`[templateMgmtService.${action}] Missing saved row`, {
      payload,
      error: missingResultError,
    });
    throw missingResultError;
  }

  return result;
}

function withoutUndefined(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

async function getComponentIdByName(name) {
  const { data, error } = await supabase
    .from('components')
    .select('id')
    .eq('name', name)
    .limit(1);
  if (error || !data || data.length === 0) throw new Error(`Component not found: ${name}`);
  return data[0].id;
}

async function getSubComponentIdByName(subCompName, componentName) {
  const compId = await getComponentIdByName(componentName);
  const { data, error } = await supabase
    .from('sub_components')
    .select('id')
    .eq('component_id', compId)
    .eq('name', subCompName)
    .limit(1);
  if (error || !data || data.length === 0) throw new Error(`Sub-component not found: ${subCompName}`);
  return data[0].id;
}

async function getKeyActivityIdByName(kaName, subCompName, componentName) {
  const subCompId = await getSubComponentIdByName(subCompName, componentName);
  const { data, error } = await supabase
    .from('key_activities')
    .select('id')
    .eq('sub_component_id', subCompId)
    .eq('name', kaName)
    .limit(1);
  if (error || !data || data.length === 0) throw new Error(`Key activity not found: ${kaName}`);
  return data[0].id;
}

async function getPerformanceIndicatorRowByNo(indicatorNo, kaName, subCompName, componentName) {
  const kaId = await getKeyActivityIdByName(kaName, subCompName, componentName);
  const { data, error } = await supabase
    .from('performance_indicators')
    .select('id, is_active, sort_order')
    .eq('key_activity_id', kaId)
    .eq('activity_no', indicatorNo)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1);
  if (error) throw error;
  if (data?.[0]) return data[0];

  const fallback = await supabase
    .from('performance_indicators')
    .select('id, is_active, sort_order')
    .eq('key_activity_id', kaId)
    .eq('activity_no', indicatorNo)
    .order('sort_order')
    .limit(1);
  if (fallback.error) throw fallback.error;
  return fallback.data?.[0] || null;
}

async function getPerformanceIndicatorIdByNo(indicatorNo, kaName, subCompName, componentName) {
  const row = await getPerformanceIndicatorRowByNo(indicatorNo, kaName, subCompName, componentName);
  if (!row) throw new Error(`Performance indicator not found: ${indicatorNo}`);
  return row.id;
}

async function getSubActivityRowByName({
  keyActivityId,
  performanceIndicatorId,
  name,
}) {
  if (performanceIndicatorId) {
    const { data, error } = await supabase
      .from('sub_activities')
      .select('id')
      .eq('performance_indicator_id', performanceIndicatorId)
      .eq('name', name)
      .limit(1);

    if (!error && data?.length > 0) return data;
  }

  const { data, error } = await supabase
    .from('sub_activities')
    .select('id')
    .eq('key_activity_id', keyActivityId)
    .eq('name', name)
    .limit(1);

  if (error) throw error;
  return data || [];
}

async function probeSubActivitySchema() {
  const keyActivityProbe = await supabase
    .from('sub_activities')
    .select('id, key_activity_id')
    .limit(1);
  const performanceIndicatorProbe = await supabase
    .from('sub_activities')
    .select('id, performance_indicator_id')
    .limit(1);

  return {
    hasKeyActivityId: !keyActivityProbe.error,
    hasPerformanceIndicatorId: !performanceIndicatorProbe.error,
    keyActivityProbeError: keyActivityProbe.error || null,
    performanceIndicatorProbeError: performanceIndicatorProbe.error || null,
  };
}

async function verifySavedSubActivity(row, payload) {
  if (!row?.id) {
    throw new Error('Sub activity insert did not return an id.');
  }

  let response = await supabase
    .from('sub_activities')
    .select('id, name, key_activity_id, performance_indicator_id, sort_order, is_active')
    .eq('id', row.id)
    .maybeSingle();

  if (response.error?.message?.includes('performance_indicator_id')) {
    response = await supabase
      .from('sub_activities')
      .select('id, name, key_activity_id, sort_order, is_active')
      .eq('id', row.id)
      .maybeSingle();
  }

  if (response.error) {
    console.error('[templateMgmtService.createSubActivity] Verification failed', {
      payload,
      savedRow: row,
      error: response.error,
    });
    throw response.error;
  }

  if (!response.data) {
    const error = new Error(`Sub activity was not readable after insert: ${row.id}`);
    console.error('[templateMgmtService.createSubActivity] Verification missing row', {
      payload,
      savedRow: row,
      error,
    });
    throw error;
  }

  return response.data;
}

function makeTemplateCode(prefix, value, index = 0) {
  const slug = String(value || 'item')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);

  return `${prefix}_${index}_${slug || 'ITEM'}`;
}

function makeUniqueTemplateCode(rows, prefix, value, index) {
  const existingCodes = new Set((rows || []).map((row) => row.code).filter(Boolean));
  const baseCode = makeTemplateCode(prefix, value, index);
  let nextCode = baseCode;
  let suffix = 2;

  while (existingCodes.has(nextCode)) {
    nextCode = `${baseCode}_${suffix}`;
    suffix += 1;
  }

  return nextCode;
}

function normalizeTemplateValue(value) {
  return String(value ?? '').trim();
}

function templateValuesEqual(currentValue, nextValue) {
  return normalizeTemplateValue(currentValue) === normalizeTemplateValue(nextValue);
}

function rowMatchesParent(row, parentColumn, parentId) {
  return !parentColumn || row?.[parentColumn] === parentId;
}

function findReusableTemplateRow(rows, usedIds, {
  name,
  sortOrder,
  parentColumn,
  parentId,
  activityNo,
} = {}) {
  const candidates = (rows || []).filter(
    (row) => row?.id && !usedIds.has(row.id) && rowMatchesParent(row, parentColumn, parentId),
  );
  const normalizedName = normalizeTemplateValue(name).toLowerCase();
  const normalizedActivityNo = normalizeTemplateValue(activityNo);

  if (normalizedActivityNo) {
    const byActiveActivityNo = candidates.find(
      (row) => row.is_active !== false && templateValuesEqual(row.activity_no, normalizedActivityNo),
    );
    if (byActiveActivityNo) return byActiveActivityNo;

    const byActivityNo = candidates.find((row) =>
      templateValuesEqual(row.activity_no, normalizedActivityNo),
    );
    if (byActivityNo) return byActivityNo;
  }

  if (normalizedName) {
    const byActiveName = candidates.find(
      (row) => row.is_active !== false && normalizeTemplateValue(row.name).toLowerCase() === normalizedName,
    );
    if (byActiveName) return byActiveName;

    const byName = candidates.find(
      (row) => normalizeTemplateValue(row.name).toLowerCase() === normalizedName,
    );
    if (byName) return byName;
  }

  const byActiveSortOrder = candidates.find(
    (row) => row.is_active !== false && templateValuesEqual(row.sort_order, sortOrder),
  );
  if (byActiveSortOrder) return byActiveSortOrder;

  return candidates.find((row) => templateValuesEqual(row.sort_order, sortOrder)) || null;
}

async function updateTemplateRow(table, row, payload, action) {
  const updates = withoutUndefined(payload);
  const changedPayload = Object.fromEntries(
    Object.entries(updates).filter(([key, value]) => !templateValuesEqual(row?.[key], value)),
  );

  if (Object.keys(changedPayload).length === 0) {
    return row;
  }

  const { data, error } = await supabase
    .from(table)
    .update(changedPayload)
    .eq('id', row.id)
    .select()
    .single();

  return assertTemplateMutation(action, { id: row.id, ...changedPayload }, data, error);
}

async function insertTemplateRow(table, payload, action) {
  const { data, error } = await supabase
    .from(table)
    .insert(withoutUndefined(payload))
    .select()
    .single();

  return assertTemplateMutation(action, payload, data, error);
}

async function ensureTemplateRow({
  table,
  rows,
  usedIds,
  match,
  payload,
  codePrefix,
}) {
  const existing = findReusableTemplateRow(rows, usedIds, match);

  if (existing) {
    const savedRow = await updateTemplateRow(table, existing, payload, `restore.${table}`);
    Object.assign(existing, savedRow);
    usedIds.add(savedRow.id);
    return savedRow;
  }

  const insertPayload = {
    ...payload,
    code: codePrefix
      ? makeUniqueTemplateCode(rows, codePrefix, payload.name, payload.sort_order)
      : undefined,
  };
  const savedRow = await insertTemplateRow(table, insertPayload, `restore.${table}`);
  rows.push(savedRow);
  usedIds.add(savedRow.id);
  return savedRow;
}

async function fetchTemplateRows(table, { optional = false } = {}) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('sort_order');

  if (
    optional &&
    (
      error?.message?.includes(table) ||
      error?.code === '42P01' ||
      error?.code === 'PGRST205'
    )
  ) {
    return [];
  }

  if (error) throw error;
  return data || [];
}

async function fetchOptionalTemplateRows(table) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('sort_order');

  if (
    error?.message?.includes(table) ||
    error?.code === '42P01' ||
    error?.code === 'PGRST205'
  ) {
    return { rows: [], exists: false };
  }

  if (error) throw error;
  return { rows: data || [], exists: true };
}

async function deactivateRowsOutsideSnapshot(table, rows, usedIds) {
  const staleRows = (rows || []).filter(
    (row) => row?.id && row.is_active !== false && !usedIds.has(row.id),
  );

  for (const row of staleRows) {
    await updateTemplateRow(table, row, { is_active: false }, `restore.deactivate.${table}`);
  }
}

async function deactivateIndicatorsOutsideKeyActivitySnapshot(rows, allowedIndicatorNosByKeyActivity) {
  const staleRows = (rows || []).filter((row) => {
    if (!row?.id || row.is_active === false) return false;
    const allowedIndicatorNos = allowedIndicatorNosByKeyActivity.get(row.key_activity_id);
    if (!allowedIndicatorNos) return false;

    return !allowedIndicatorNos.has(normalizeTemplateValue(row.activity_no));
  });

  for (const row of staleRows) {
    await updateTemplateRow(
      'performance_indicators',
      row,
      { is_active: false },
      'restore.deactivate.performance_indicators.byKeyActivity',
    );
  }
}

async function restoreTemplateSnapshot(templateData) {
  const hierarchy = templateData?.hierarchy || {};
  if (Object.keys(hierarchy).length === 0) {
    throw new Error('No default template snapshot is available.');
  }

  const subActivitySchema = await probeSubActivitySchema();
  const [components, subComponents, keyActivities, performanceIndicatorResult, subActivities] =
    await Promise.all([
      fetchTemplateRows('components'),
      fetchTemplateRows('sub_components'),
      fetchTemplateRows('key_activities'),
      fetchOptionalTemplateRows('performance_indicators'),
      fetchTemplateRows('sub_activities'),
    ]);

  const performanceIndicators = performanceIndicatorResult.rows;
  const supportsPerformanceIndicators = performanceIndicatorResult.exists;
  const used = {
    components: new Set(),
    subComponents: new Set(),
    keyActivities: new Set(),
    performanceIndicators: new Set(),
    subActivities: new Set(),
  };
  const allowedIndicatorNosByKeyActivity = new Map();

  for (const [componentIndex, [componentName, subComponentMap]] of Object.entries(hierarchy).entries()) {
    const componentSortOrder = componentIndex + 1;
    const component = await ensureTemplateRow({
      table: 'components',
      rows: components,
      usedIds: used.components,
      match: { name: componentName, sortOrder: componentSortOrder },
      payload: {
        name: componentName,
        sort_order: componentSortOrder,
        is_active: true,
      },
      codePrefix: 'COMP',
    });

    for (const [subComponentIndex, [subComponentName, keyActivityMap]] of Object.entries(subComponentMap || {}).entries()) {
      const subComponentSortOrder = subComponentIndex + 1;
      const subComponent = await ensureTemplateRow({
        table: 'sub_components',
        rows: subComponents,
        usedIds: used.subComponents,
        match: {
          name: subComponentName,
          sortOrder: subComponentSortOrder,
          parentColumn: 'component_id',
          parentId: component.id,
        },
        payload: {
          component_id: component.id,
          name: subComponentName,
          sort_order: subComponentSortOrder,
          is_active: true,
        },
        codePrefix: `SUB_COMP_${String(component.id).slice(0, 8)}`,
      });

      for (const [keyActivityIndex, [keyActivityName, indicators]] of Object.entries(keyActivityMap || {}).entries()) {
        const keyActivitySortOrder = keyActivityIndex + 1;
        const firstIndicator = indicators?.[0] || {};
        const keyActivity = await ensureTemplateRow({
          table: 'key_activities',
          rows: keyActivities,
          usedIds: used.keyActivities,
          match: {
            name: keyActivityName,
            sortOrder: keyActivitySortOrder,
            parentColumn: 'sub_component_id',
            parentId: subComponent.id,
          },
          payload: {
            sub_component_id: subComponent.id,
            name: keyActivityName,
            activity_no: firstIndicator.no ?? null,
            performance_indicator: firstIndicator.performanceIndicator || '',
            sort_order: keyActivitySortOrder,
            is_active: true,
          },
          codePrefix: `KEY_ACT_${String(subComponent.id).slice(0, 8)}`,
        });
        allowedIndicatorNosByKeyActivity.set(
          keyActivity.id,
          new Set((indicators || []).map((indicator) => normalizeTemplateValue(indicator?.no))),
        );

        let legacySubActivitySortOrder = 0;

        for (const [indicatorIndex, indicator] of (indicators || []).entries()) {
          const indicatorSortOrder = indicatorIndex + 1;
          let performanceIndicator = null;

          if (supportsPerformanceIndicators) {
            performanceIndicator = await ensureTemplateRow({
              table: 'performance_indicators',
              rows: performanceIndicators,
              usedIds: used.performanceIndicators,
              match: {
                sortOrder: indicatorSortOrder,
                parentColumn: 'key_activity_id',
                parentId: keyActivity.id,
                activityNo: indicator.no,
              },
              payload: {
                key_activity_id: keyActivity.id,
                activity_no: indicator.no,
                label: indicator.performanceIndicator || '',
                sort_order: indicatorSortOrder,
                is_active: true,
              },
            });
          }

          for (const [subActivityIndex, subActivityName] of (indicator.subActivities || []).entries()) {
            const subActivitySortOrder = supportsPerformanceIndicators
              ? subActivityIndex + 1
              : legacySubActivitySortOrder + 1;
            legacySubActivitySortOrder += 1;

            await ensureTemplateRow({
              table: 'sub_activities',
              rows: subActivities,
              usedIds: used.subActivities,
              match: {
                name: subActivityName,
                sortOrder: subActivitySortOrder,
                parentColumn: supportsPerformanceIndicators && subActivitySchema.hasPerformanceIndicatorId
                  ? 'performance_indicator_id'
                  : 'key_activity_id',
                parentId: supportsPerformanceIndicators && subActivitySchema.hasPerformanceIndicatorId
                  ? performanceIndicator?.id
                  : keyActivity.id,
              },
              payload: {
                key_activity_id: subActivitySchema.hasKeyActivityId ? keyActivity.id : undefined,
                performance_indicator_id: subActivitySchema.hasPerformanceIndicatorId
                  ? performanceIndicator?.id
                  : undefined,
                name: subActivityName,
                sort_order: subActivitySortOrder,
                is_active: true,
              },
              codePrefix: `SUB_ACT_${String(performanceIndicator?.id || keyActivity.id).slice(0, 8)}`,
            });
          }
        }
      }
    }
  }

  await deactivateRowsOutsideSnapshot('sub_activities', subActivities, used.subActivities);
  if (supportsPerformanceIndicators) {
    await deactivateIndicatorsOutsideKeyActivitySnapshot(
      performanceIndicators,
      allowedIndicatorNosByKeyActivity,
    );
    await deactivateRowsOutsideSnapshot(
      'performance_indicators',
      performanceIndicators,
      used.performanceIndicators,
    );
  }
  await deactivateRowsOutsideSnapshot('key_activities', keyActivities, used.keyActivities);
  await deactivateRowsOutsideSnapshot('sub_components', subComponents, used.subComponents);
  await deactivateRowsOutsideSnapshot('components', components, used.components);

  return templateData;
}

export const templateMgmtService = {
  getComponentIdByName,
  getSubComponentIdByName,
  getKeyActivityIdByName,
  getPerformanceIndicatorIdByNo,
  getPerformanceIndicatorRowByNo,
  getSubActivityRowByName,
  restoreTemplateSnapshot,

  async createComponent(data) {
    const payload = {
      name: data.name,
      code: data.code,
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    };
    const { data: result, error } = await supabase
      .from('components')
      .insert(payload)
      .select()
      .single();
    return assertTemplateMutation('createComponent', payload, result, error);
  },

  async updateComponent(id, updates) {
    const payload = withoutUndefined({
      name: updates.name,
      code: updates.code,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    });
    const { data: result, error } = await supabase
      .from('components')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return assertTemplateMutation('updateComponent', { id, ...payload }, result, error);
  },

  async deleteComponent(id) {
    const { error } = await supabase.from('components').delete().eq('id', id);
    if (error) throw error;
  },

  async createSubComponent(data) {
    const payload = {
      component_id: data.component_id,
      name: data.name,
      code: data.code,
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    };
    const { data: result, error } = await supabase
      .from('sub_components')
      .insert(payload)
      .select()
      .single();
    return assertTemplateMutation('createSubComponent', payload, result, error);
  },

  async updateSubComponent(id, updates) {
    const payload = withoutUndefined({
      name: updates.name,
      code: updates.code,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    });
    const { data: result, error } = await supabase
      .from('sub_components')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return assertTemplateMutation('updateSubComponent', { id, ...payload }, result, error);
  },

  async deleteSubComponent(id) {
    const { error } = await supabase.from('sub_components').delete().eq('id', id);
    if (error) throw error;
  },

  async createKeyActivity(data) {
    const payload = {
      sub_component_id: data.sub_component_id,
      name: data.name,
      code: data.code,
      activity_no: data.activity_no,
      performance_indicator: data.performance_indicator || '',
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    };
    const { data: result, error } = await supabase
      .from('key_activities')
      .insert(payload)
      .select()
      .single();
    return assertTemplateMutation('createKeyActivity', payload, result, error);
  },

  async updateKeyActivity(id, updates) {
    const payload = withoutUndefined({
      name: updates.name,
      code: updates.code,
      activity_no: updates.activity_no,
      performance_indicator: updates.performance_indicator,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    });
    const { data: result, error } = await supabase
      .from('key_activities')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return assertTemplateMutation('updateKeyActivity', { id, ...payload }, result, error);
  },

  async deleteKeyActivity(id) {
    const { error } = await supabase.from('key_activities').delete().eq('id', id);
    if (error) throw error;
  },

  async createPerformanceIndicator(data) {
    const payload = {
      key_activity_id: data.key_activity_id,
      activity_no: data.activity_no,
      label: data.label,
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    };
    const { data: result, error } = await supabase
      .from('performance_indicators')
      .insert(payload)
      .select()
      .single();
    return assertTemplateMutation('createPerformanceIndicator', payload, result, error);
  },

  async updatePerformanceIndicator(id, updates) {
    const payload = withoutUndefined({
      activity_no: updates.activity_no,
      label: updates.label,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    });
    const { data: result, error } = await supabase
      .from('performance_indicators')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return assertTemplateMutation('updatePerformanceIndicator', { id, ...payload }, result, error);
  },

  async deletePerformanceIndicator(id) {
    const { error } = await supabase.from('performance_indicators').delete().eq('id', id);
    if (error) throw error;
  },

  async createSubActivity(data) {
    const schema = await probeSubActivitySchema();
    const shouldUseKeyActivityId =
      schema.hasKeyActivityId || !schema.hasPerformanceIndicatorId;
    const shouldUsePerformanceIndicatorId = schema.hasPerformanceIndicatorId;

    const payload = withoutUndefined({
      performance_indicator_id: shouldUsePerformanceIndicatorId ? data.performance_indicator_id : undefined,
      key_activity_id: shouldUseKeyActivityId ? data.key_activity_id : undefined,
      name: data.name,
      code: data.code,
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    });

    const response = await supabase
      .from('sub_activities')
      .insert(payload)
      .select()
      .single();

    if (!response.error) {
      const savedRow = assertTemplateMutation('createSubActivity', payload, response.data, response.error);
      return verifySavedSubActivity(savedRow, payload);
    }

    const mentionsPerformanceIndicator = response.error.message?.includes('performance_indicator_id');
    const mentionsKeyActivity = response.error.message?.includes('key_activity_id');
    const shouldFallbackToKeyActivity =
      data.key_activity_id &&
      (mentionsPerformanceIndicator || response.error.code === 'PGRST204' || response.error.code === '23502');
    const shouldFallbackToPerformanceIndicator =
      data.performance_indicator_id &&
      mentionsKeyActivity &&
      !mentionsPerformanceIndicator;

    if (!shouldFallbackToKeyActivity && !shouldFallbackToPerformanceIndicator) {
      console.error('[templateMgmtService.createSubActivity] Insert failed without fallback', {
        payload,
        schema,
        error: response.error,
      });
      return assertTemplateMutation('createSubActivity', payload, response.data, response.error);
    }

    const fallbackPayload = withoutUndefined({
      key_activity_id: shouldFallbackToKeyActivity ? data.key_activity_id : undefined,
      performance_indicator_id: shouldFallbackToPerformanceIndicator ? data.performance_indicator_id : undefined,
      name: data.name,
      code: data.code,
      sort_order: data.sort_order,
      is_active: data.is_active ?? true
    });

    const { data: result, error } = await supabase
      .from('sub_activities')
      .insert(fallbackPayload)
      .select()
      .single();
    if (error) {
      console.error('[templateMgmtService.createSubActivity] Fallback insert failed', {
        fallbackPayload,
        error,
      });
    }
    const savedRow = assertTemplateMutation('createSubActivity', fallbackPayload, result, error);
    return verifySavedSubActivity(savedRow, fallbackPayload);
  },

  async updateSubActivity(id, updates) {
    const payload = withoutUndefined({
      name: updates.name,
      code: updates.code,
      sort_order: updates.sort_order,
      is_active: updates.is_active
    });
    const { data: result, error } = await supabase
      .from('sub_activities')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return assertTemplateMutation('updateSubActivity', { id, ...payload }, result, error);
  },

  async deleteSubActivity(id) {
    const { error } = await supabase.from('sub_activities').delete().eq('id', id);
    if (error) throw error;
  }
};

// Submission window services
export const submissionService = {
  async getActiveWindow() {
    const { data, error } = await supabase
      .from('submission_windows')
      .select('*')
      .eq('is_active', true)
      .single();
    if (error) throw error;
    return data;
  },

  async updateWindow(id, updates) {
    const { data, error } = await supabase
      .from('submission_windows')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

export const archiveBackupService = {
  async getAll() {
    const { data, error } = await supabase
      .from('archive_backups')
      .select('*')
      .order('planning_year', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getEvents(limit = 100) {
    const { data, error } = await supabase
      .from('archive_backup_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async recordCsvBackup({ planningYear, filename, recordCount }) {
    const { data, error } = await supabase.rpc('admin_record_csv_backup', {
      p_planning_year: Number(planningYear),
      p_filename: filename,
      p_record_count: Number(recordCount || 0),
    });

    if (error) throw error;
    return data;
  },

  async cleanupYear(planningYear) {
    const { data, error } = await supabase.rpc('admin_cleanup_archive_year', {
      p_planning_year: Number(planningYear),
    });

    if (error) throw error;
    return data;
  }
};

// Real-time subscriptions
export const realtimeService = {
  subscribeToEntries(callback) {
    return supabase
      .channel('entries_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'entries' },
        async (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const entry = await entriesService.getById(payload.new.id);
            callback({ ...payload, new: entry });
          } else {
            callback(payload);
          }
        }
      )
      .subscribe();
  },

  subscribeToProfiles(callback) {
    return supabase
      .channel('profiles_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'profiles' },
        callback
      )
      .subscribe();
  }
};
