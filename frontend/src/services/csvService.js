import { supabase } from '../lib/supabase';
import { normalizeUnitCode } from '../lib/units';
import { entriesService } from './supabaseService';

// Utility functions for data formatting (reuse from existing components)

const MONTHS_LIST = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec'
]

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

const MONTH_SHORT_NAMES = {
  jan: 'Jan',
  feb: 'Feb',
  mar: 'Mar',
  apr: 'Apr',
  may: 'May',
  jun: 'Jun',
  jul: 'Jul',
  aug: 'Aug',
  sep: 'Sep',
  oct: 'Oct',
  nov: 'Nov',
  dec: 'Dec',
};

const YEARLY_BACKUP_STATUS_SECTIONS = [
  { label: 'Approved', statuses: ['approved'] },
  { label: 'Pending', statuses: ['pending review', 'pending'] },
  { label: 'Returned', statuses: ['returned', 'return'] },
  { label: 'Rejected', statuses: ['rejected'] },
];

const FALLBACK_CLASSIFICATION_VALUE = 'N/A';

const IMPORTABLE_STATUS_MAP = new Map([
  ['approved', 'Approved'],
  ['pending', 'Pending Review'],
  ['pending review', 'Pending Review'],
  ['returned', 'Returned'],
  ['return', 'Returned'],
  ['rejected', 'Rejected'],
  ['draft', 'draft'],
  ['submitted', 'submitted'],
]);

function normalizeMonthKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return MONTHS_LIST.find((month) => {
    const fullName = MONTH_NAMES[month].toLowerCase();
    return normalized === month || normalized === fullName || normalized.slice(0, 3) === month;
  });
}

function getEntryMonthBreakdown(entry, monthKey) {
  if (entry?.monthlyBreakdown && !Array.isArray(entry.monthlyBreakdown)) {
    const monthName = MONTH_NAMES[monthKey];
    const amount = entry.monthlyBreakdown[monthName] ?? entry.monthlyBreakdown[monthKey];
    const target =
      entry.monthlyTargets?.[monthName] ??
      entry.monthlyTargets?.[monthKey] ??
      entry.monthly_targets?.[monthName] ??
      entry.monthly_targets?.[monthKey] ??
      0;

    return { month: monthName, target, amount };
  }

  const monthlyRows = Array.isArray(entry?.monthlyBreakdown)
    ? entry.monthlyBreakdown
    : [];

  return monthlyRows.find((row) => normalizeMonthKey(row.month) === monthKey) || {};
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function escapeCSVValue(value) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function getFirstTextValue(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function normalizeOptionalClassification(value) {
  return getFirstTextValue(value) || FALLBACK_CLASSIFICATION_VALUE;
}

function normalizeImportedClassification(row) {
  return {
    subComponent: normalizeOptionalClassification(
      getCell(row, ['Sub Component', 'Sub-Component']),
    ),
    keyActivity: normalizeOptionalClassification(getCell(row, ['Key Activity'])),
    no: normalizeOptionalClassification(getCell(row, ['Activity No.', 'Activity No', 'No'])),
    performanceIndicator: normalizeOptionalClassification(
      getCell(row, ['Performance Indicator']),
    ),
    subActivity: normalizeOptionalClassification(
      getCell(row, ['Sub Activity', 'Sub-Activity']),
    ),
  };
}

function getDisplayClassificationValue(...values) {
  return getFirstTextValue(...values) || FALLBACK_CLASSIFICATION_VALUE;
}

function getTemplatePrefix(value) {
  return String(value || '').match(/\b\d+(?:\.\d+)+/)?.[0] || '';
}

function normalizeEntryStatus(value, fallback = 'Pending Review') {
  const statusKey = normalizeText(value).toLowerCase();
  return IMPORTABLE_STATUS_MAP.get(statusKey) || fallback;
}

function formatStatusForCSV(status) {
  return normalizeEntryStatus(status, normalizeText(status)) === 'Pending Review'
    ? 'Pending'
    : normalizeText(status);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value)
    .replace(/[,\s]/g, '')
    .replace(/[^\d().-]/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDuplicateText(value) {
  return normalizeText(value).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDuplicateMoney(value) {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
}

function normalizeDuplicateClassification(value) {
  return getTemplatePrefix(value) || normalizeDuplicateText(value);
}

function getEntryIdForDuplicateCheck(entry) {
  return normalizeText(entry?.sourceEntryId || entry?.entryId || entry?.entry_id || entry?.id);
}

function parseCSVRows(csvContent) {
  const rows = [];
  let row = [];
  let value = '';
  let insideQuotes = false;

  for (let index = 0; index < csvContent.length; index += 1) {
    const char = csvContent[index];
    const nextChar = csvContent[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows.filter((csvRow) =>
    csvRow.some((cell) => normalizeText(cell) !== ''),
  );
}

function hasRequiredEntryHeaders(headerRow) {
  const headers = new Set(headerRow.map(normalizeHeader));
  return (
    (headers.has('planning year') || headers.has('archive year')) &&
    headers.has('unit') &&
    headers.has('component') &&
    headers.has('title of activities')
  );
}

function buildRowObject(headers, values, rowNumber, section = '') {
  return headers.reduce(
    (acc, header, index) => {
      const normalizedHeader = normalizeHeader(header);
      if (normalizedHeader) acc[normalizedHeader] = values[index] ?? '';
      return acc;
    },
    { __rowNumber: rowNumber, __section: section },
  );
}

function extractEntryRows(csvContent) {
  const rows = parseCSVRows(csvContent);
  const entryRows = [];
  let headers = null;
  let section = '';

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const trimmedCells = row.map(normalizeText);
    const firstCell = trimmedCells[0] || '';

    if (hasRequiredEntryHeaders(trimmedCells)) {
      headers = trimmedCells;
      return;
    }

    if (
      trimmedCells.length === 1 &&
      firstCell &&
      !['no entries', 'awpb yearly csv backup'].includes(firstCell.toLowerCase())
    ) {
      section = firstCell;
      return;
    }

    if (!headers || firstCell.toLowerCase() === 'no entries') return;

    const rowObject = buildRowObject(headers, row, rowNumber, section);
    const unit = normalizeText(rowObject.unit);
    const title = normalizeText(rowObject['title of activities']);

    if (!unit && !title) return;
    if (unit.toLowerCase() === 'total') return;

    entryRows.push(rowObject);
  });

  return entryRows;
}

function getCell(row, headerNames) {
  for (const headerName of headerNames) {
    const normalizedHeader = normalizeHeader(headerName);
    if (Object.prototype.hasOwnProperty.call(row, normalizedHeader)) {
      return row[normalizedHeader];
    }
  }
  return '';
}

function getMonthValue(row, monthKey, suffixes = ['']) {
  const fullName = MONTH_NAMES[monthKey];
  const shortName = MONTH_SHORT_NAMES[monthKey];
  const candidates = suffixes.flatMap((suffix) => {
    const suffixText = suffix ? ` ${suffix}` : '';
    return [
      `${fullName}${suffixText}`,
      `${shortName}${suffixText}`,
      `${monthKey}${suffixText}`,
    ];
  });

  return getCell(row, candidates);
}

function getImportedMonthlyBreakdown(row, unitCost) {
  return MONTHS_LIST.map((monthKey) => {
    const monthName = MONTH_NAMES[monthKey];
    const targetValue = getMonthValue(row, monthKey, ['Target', 'Qty', 'Quantity']);
    const amountValue = getMonthValue(row, monthKey);
    const importedTarget = parseNumber(targetValue);
    const importedAmount = parseNumber(amountValue);
    const target =
      importedTarget > 0
        ? importedTarget
        : unitCost > 0 && importedAmount > 0
          ? importedAmount / unitCost
          : 0;

    return {
      month: monthName,
      target,
      amount: target * unitCost,
    };
  });
}

function getImportedUnitCost(row) {
  const unitCost = parseNumber(getCell(row, ['Unit Cost', 'Cost']));
  if (unitCost > 0) return unitCost;

  const grandTotal = parseNumber(getCell(row, ['Grand Total', 'Total']));
  const totalTargets = MONTHS_LIST.reduce((sum, monthKey) => {
    return sum + parseNumber(getMonthValue(row, monthKey, ['Target', 'Qty', 'Quantity']));
  }, 0);

  if (grandTotal > 0 && totalTargets > 0) return grandTotal / totalTargets;

  const hasMonthlyAmounts = MONTHS_LIST.some(
    (monthKey) => parseNumber(getMonthValue(row, monthKey)) > 0,
  );

  return hasMonthlyAmounts ? 1 : 0;
}

function getImportedStatus(row, fallbackStatus = 'Pending Review') {
  const statusCell = getCell(row, ['Status', 'Entry Status', 'Review Status']);
  if (normalizeText(statusCell)) {
    return normalizeEntryStatus(statusCell, fallbackStatus);
  }

  return normalizeEntryStatus(row.__section, fallbackStatus);
}

function transformImportedRowsToEntries(rows, fallbackStatus = 'Pending Review') {
  return rows.map((row) => {
    const unitCost = getImportedUnitCost(row);
    const monthlyBreakdown = getImportedMonthlyBreakdown(row, unitCost);
    const status = getImportedStatus(row, fallbackStatus);
    const classification = normalizeImportedClassification(row);

    return {
      sourceRowNumber: row.__rowNumber,
      sourceEntryId: normalizeText(getCell(row, ['Entry ID', 'Entry Id', 'ID'])),
      planningYear:
        normalizeText(getCell(row, ['Planning Year', 'Archive Year'])) ||
        String(new Date().getFullYear()),
      unit: normalizeUnitCode(getCell(row, ['Unit'])),
      component: normalizeText(getCell(row, ['Component'])),
      subComponent: classification.subComponent,
      keyActivity: classification.keyActivity,
      no: classification.no,
      performanceIndicator: classification.performanceIndicator,
      subActivity: classification.subActivity,
      titleOfActivities: normalizeText(getCell(row, ['Title of Activities'])),
      unitCost,
      monthlyBreakdown,
      grandTotal: monthlyBreakdown.reduce((sum, month) => sum + month.amount, 0),
      status,
      adminComment: '',
      submittedAt: new Date().toISOString(),
    };
  });
}

function validateImportedEntries(entries) {
  const errors = [];

  entries.forEach((entry) => {
    const rowLabel = `Row ${entry.sourceRowNumber}`;

    if (!entry.planningYear) errors.push(`${rowLabel}: planning year is required.`);
    if (!entry.unit) errors.push(`${rowLabel}: unit is required.`);
    if (!entry.component) errors.push(`${rowLabel}: component is required.`);
    if (!entry.titleOfActivities) {
      errors.push(`${rowLabel}: title of activities is required.`);
    }
    if (entry.unitCost <= 0) {
      errors.push(`${rowLabel}: unit cost or monthly amounts are required.`);
    }
    if (!entry.monthlyBreakdown.some((month) => Number(month.target || 0) > 0)) {
      errors.push(`${rowLabel}: at least one monthly target or amount is required.`);
    }
  });

  return errors;
}

function buildDuplicateParts(entry) {
  const monthlyAmounts = MONTHS_LIST.map((monthKey) => {
    const breakdown = getEntryMonthBreakdown(entry, monthKey);
    return normalizeDuplicateMoney(breakdown.amount || 0);
  });

  return {
    planningYear: normalizeDuplicateText(entry.planningYear || entry.planning_year),
    unit: normalizeUnitCode(entry.unit || entry.units?.code || entry.units?.name || ''),
    component: normalizeDuplicateClassification(entry.component || entry.components?.name),
    subComponent: normalizeDuplicateClassification(
      getDisplayClassificationValue(
        entry.subComponent,
        entry.sub_component_text,
        entry.sub_components?.name,
      ),
    ),
    keyActivity: normalizeDuplicateClassification(
      getDisplayClassificationValue(
        entry.keyActivity,
        entry.key_activity_text,
        entry.key_activities?.name,
      ),
    ),
    no: normalizeDuplicateText(
      getDisplayClassificationValue(entry.no, entry.activity_no),
    ),
    performanceIndicator: normalizeDuplicateText(
      getDisplayClassificationValue(
        entry.performanceIndicator,
        entry.performance_indicator,
        entry.key_activities?.performance_indicator,
      ),
    ),
    subActivity: normalizeDuplicateClassification(
      getDisplayClassificationValue(
        entry.subActivity,
        entry.sub_activity_text,
        entry.sub_activities?.name,
      ),
    ),
    title: normalizeDuplicateText(entry.titleOfActivities || entry.title_of_activities),
    unitCost: normalizeDuplicateMoney(entry.unitCost ?? entry.unit_cost ?? 0),
    monthlyAmounts,
  };
}

function buildDuplicateFingerprints(entry) {
  const parts = buildDuplicateParts(entry);
  const fingerprints = new Set();

  fingerprints.add(JSON.stringify([
    'activity',
    parts.planningYear,
    parts.unit,
    parts.component,
    parts.subComponent,
    parts.keyActivity,
    parts.subActivity,
    parts.title,
  ]));

  fingerprints.add(JSON.stringify([
    'indicator',
    parts.planningYear,
    parts.unit,
    parts.component,
    parts.subComponent,
    parts.keyActivity,
    parts.no,
    parts.performanceIndicator,
    parts.subActivity,
    parts.title,
  ]));

  fingerprints.add(JSON.stringify([
    'budget',
    parts.planningYear,
    parts.unit,
    parts.component,
    parts.subComponent,
    parts.keyActivity,
    parts.no,
    parts.performanceIndicator,
    parts.subActivity,
    parts.title,
    parts.unitCost,
    ...parts.monthlyAmounts,
  ]));

  if (parts.keyActivity && parts.title) {
    fingerprints.add(JSON.stringify([
      'key-title',
      parts.planningYear,
      parts.unit,
      parts.keyActivity,
      parts.subActivity,
      parts.title,
    ]));
  }

  return [...fingerprints];
}

function addDuplicateFingerprints(entry, fingerprintSet, idSet) {
  const entryId = getEntryIdForDuplicateCheck(entry);
  if (entryId) idSet.add(entryId);
  buildDuplicateFingerprints(entry).forEach((fingerprint) => fingerprintSet.add(fingerprint));
}

function hasDuplicateFingerprint(entry, fingerprintSet, idSet) {
  const entryId = getEntryIdForDuplicateCheck(entry);
  if (entryId && idSet.has(entryId)) return true;
  return buildDuplicateFingerprints(entry).some((fingerprint) => fingerprintSet.has(fingerprint));
}

function removeDuplicateFingerprints(entry, fingerprintSet, idSet) {
  const entryId = getEntryIdForDuplicateCheck(entry);
  if (entryId) idSet.delete(entryId);
  buildDuplicateFingerprints(entry).forEach((fingerprint) => fingerprintSet.delete(fingerprint));
}

async function fetchLatestEntriesForDuplicateCheck(existingEntries = []) {
  try {
    const latestEntries = await entriesService.getAll();
    const entriesById = new Map();
    let fallbackIndex = 0;

    [...(existingEntries || []), ...(latestEntries || [])].forEach((entry) => {
      if (!entry) return;
      const key = entry?.id || `entry-without-id-${fallbackIndex}`;
      entriesById.set(key, entry);
      fallbackIndex += 1;
    });

    return [...entriesById.values()];
  } catch (error) {
    console.warn('Could not refresh entries before CSV import duplicate check:', error);
    return existingEntries || [];
  }
}

function isApprovedStatus(status) {
  return normalizeText(status).toLowerCase() === 'approved';
}

function isReviewOutcomeStatus(status) {
  const statusKey = normalizeText(status).toLowerCase();
  return statusKey === 'returned' || statusKey === 'rejected';
}

async function createImportedEntry(entryData) {
  if (isApprovedStatus(entryData.status)) {
    const createdEntry = await entriesService.create({
      ...entryData,
      status: 'Pending Review',
    });

    const { error } = await supabase.rpc('admin_approve_entry', {
      p_entry_id: createdEntry.id,
      p_note: 'Imported from CSV',
    });

    if (error) {
      await entriesService.delete(createdEntry.id).catch(() => null);
      throw error;
    }

    return entriesService.getById(createdEntry.id);
  }

  if (isReviewOutcomeStatus(entryData.status)) {
    const createdEntry = await entriesService.create({
      ...entryData,
      status: 'Pending Review',
    });

    const { error } = await supabase.rpc('admin_set_entry_review_status', {
      p_entry_id: createdEntry.id,
      p_status: entryData.status,
      p_note: 'Imported from CSV',
    });

    if (error) {
      await entriesService.delete(createdEntry.id).catch(() => null);
      throw error;
    }

    return entriesService.getById(createdEntry.id);
  }

  return entriesService.create(entryData, { preserveStatus: true });
}

function getStatusKey(value) {
  return String(value || '').trim().toLowerCase();
}

// CSV Export Service
export const csvExportService = {
  /**
   * Fetch all approved entries from the database
   * @returns {Promise<Array>} Array of approved entries with full data
   */
  async fetchApprovedEntries(planningYear) {
    try {
      let query = supabase
        .from('entries')
        .select(`
          *,
          profiles!owner_id (username, full_name),
          units (name, code),
          components (name),
          sub_components (name),
          key_activities (name, activity_no, performance_indicator),
          sub_activities (name)
        `)
        .eq('status', 'Approved')
        .order('created_at', { ascending: false });

      if (planningYear) {
        query = query.eq('planning_year', Number(planningYear));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching approved entries:', error);
        throw error;
      }

      const entryIds = (data || []).map((row) => row.id);
      let targetsByEntryId = {};

      if (entryIds.length > 0) {
        const { data: monthlyTargets, error: targetsError } = await supabase
          .from('monthly_targets')
          .select('entry_id, month, target_quantity')
          .in('entry_id', entryIds);

        if (targetsError) throw targetsError;

        targetsByEntryId = (monthlyTargets || []).reduce((acc, target) => {
          const entryId = target.entry_id;
          if (!acc[entryId]) acc[entryId] = {};
          acc[entryId][String(target.month || '').toLowerCase()] =
            Number(target.target_quantity || 0);
          return acc;
        }, {});
      }

      const entriesWithBreakdown = (data || []).map((row) => {
        const targets = targetsByEntryId[row.id] || {};
        const monthlyTargets = MONTHS_LIST.reduce((acc, month) => {
          acc[this.getMonthName(month)] = Number(targets[month] || 0);
          return acc;
        }, {});
        const monthlyBreakdown = MONTHS_LIST.reduce((acc, month) => {
          acc[this.getMonthName(month)] =
            Number(targets[month] || 0) * Number(row.unit_cost || 0);
          return acc;
        }, {});

        const grandTotal = Object.values(monthlyBreakdown).reduce(
          (sum, amount) => sum + Number(amount || 0),
          0,
        );

        return {
          unit: normalizeUnitCode(row.units?.code || row.units?.name || ''),
          component: row.components?.name || '',
          subComponent: getDisplayClassificationValue(
            row.sub_component_text,
            row.sub_components?.name,
          ),
          keyActivity: getDisplayClassificationValue(
            row.key_activity_text,
            row.key_activities?.name,
          ),
          no: getDisplayClassificationValue(
            row.no,
            row.activity_no,
            row.key_activities?.activity_no,
          ),
          performanceIndicator:
            getDisplayClassificationValue(
              row.performance_indicator,
              row.performanceIndicator,
              row.key_activities?.performance_indicator,
            ),
          subActivity: getDisplayClassificationValue(
            row.sub_activity_text,
            row.sub_activities?.name,
          ),
          titleOfActivities: row.title_of_activities,
          unitCost: Number(row.unit_cost || 0),
          status: row.status || 'Approved',
          planningYear: row.planning_year,
          monthlyTargets,
          monthlyBreakdown,
          grandTotal,
        };
      });

      return entriesWithBreakdown;
    } catch (error) {
      console.error('Error in fetchApprovedEntries:', error);
      throw error;
    }
  },

  /**
   * Get month name from month code
   * @param {string} monthCode - Three letter month code (jan, feb, etc.)
   * @returns {string} Full month name
   */
  getMonthName(monthCode) {
    return MONTH_NAMES[monthCode?.toLowerCase()] || monthCode;
  },

  /**
   * Transform entry data into CSV-compatible format
   * @param {Array} entries - Array of entry objects
   * @returns {Array} Array of flattened entry objects for CSV
   */
  transformEntriesForCSV(entries) {
    return entries.map(entry => ({
      'Planning Year': entry.planningYear,
      'Status': formatStatusForCSV(entry.status || 'Approved'),
      'Unit': entry.unit,
      'Component': entry.component,
      'Sub Component': getDisplayClassificationValue(entry.subComponent),
      'Key Activity': getDisplayClassificationValue(entry.keyActivity),
      'Activity No.': getDisplayClassificationValue(entry.no),
      'Performance Indicator': getDisplayClassificationValue(entry.performanceIndicator),
      'Sub Activity': getDisplayClassificationValue(entry.subActivity),
      'Title of Activities': entry.titleOfActivities,
      'Unit Cost': entry.unitCost,
      ...entry.monthlyBreakdown,
      'Grand Total': entry.grandTotal,
    }));
  },

  transformEntriesForYearlyBackup(entries, year) {
    return entries.map((entry) => {
      const monthlyColumns = MONTHS_LIST.reduce((acc, monthKey) => {
        const monthName = this.getMonthName(monthKey);
        const breakdown = getEntryMonthBreakdown(entry, monthKey);

        acc[monthName] = Number(breakdown.amount || 0);

        return acc;
      }, {});

      return {
        'Archive Year': year,
        'Status': formatStatusForCSV(entry.status || ''),
        'Entry ID': entry.id || '',
        'Owner Full Name': entry.ownerFullName || entry.ownerDisplayName || '',
        'Reviewer Full Name': entry.reviewerFullName || entry.reviewerDisplayName || '',
        'Unit': entry.unit || '',
        'Component': entry.component || '',
        'Sub Component': getDisplayClassificationValue(entry.subComponent),
        'Key Activity': getDisplayClassificationValue(entry.keyActivity),
        'Activity No.': getDisplayClassificationValue(entry.no),
        'Performance Indicator': getDisplayClassificationValue(entry.performanceIndicator),
        'Sub Activity': getDisplayClassificationValue(entry.subActivity),
        'Title of Activities': entry.titleOfActivities || '',
        'Unit Cost': Number(entry.unitCost || 0),
        ...monthlyColumns,
        'Grand Total': Number(entry.grandTotal || 0),
      };
    });
  },

  convertYearlyBackupToCSV(entries, year) {
    const generatedAt = new Date();
    const headers = Object.keys(
      this.transformEntriesForYearlyBackup([entries[0]], year)[0],
    );
    const rows = [
      ['AWPB Yearly CSV Backup'],
      ['Planning Year', year],
      ['Generated At', formatDateTime(generatedAt)],
      [],
    ];

    const usedEntries = new Set();

    YEARLY_BACKUP_STATUS_SECTIONS.forEach((section) => {
      const sectionEntries = entries.filter((entry) =>
        section.statuses.includes(getStatusKey(entry.status)),
      );

      sectionEntries.forEach((entry) => usedEntries.add(entry));

      rows.push([section.label]);
      rows.push(headers);

      if (sectionEntries.length === 0) {
        rows.push(['No entries']);
      } else {
        this.transformEntriesForYearlyBackup(sectionEntries, year).forEach((row) => {
          rows.push(headers.map((header) => row[header]));
        });
      }

      rows.push([]);
    });

    const otherEntries = entries.filter((entry) => !usedEntries.has(entry));
    if (otherEntries.length > 0) {
      rows.push(['Other Status']);
      rows.push(headers);
      this.transformEntriesForYearlyBackup(otherEntries, year).forEach((row) => {
        rows.push(headers.map((header) => row[header]));
      });
    }

    return rows.map((row) => row.map(escapeCSVValue).join(',')).join('\n');
  },

  calculateTotalsRow(entries) {
    const monthlyTotals = {};
    let totalGrandTotal = 0;

    entries.forEach(entry => {
      Object.keys(entry.monthlyBreakdown).forEach(month => {
        if (!monthlyTotals[month]) {
          monthlyTotals[month] = 0;
        }
        monthlyTotals[month] += entry.monthlyBreakdown[month];
      });
      totalGrandTotal += entry.grandTotal;
    });

    const totalsRow = {
      'Planning Year': '',
      'Status': '',
      'Unit': 'TOTAL',
      'Component': '',
      'Sub Component': '',
      'Key Activity': '',
      'Activity No.': '',
      'Performance Indicator': '',
      'Sub Activity': '',
      'Title of Activities': '',
      'Unit Cost': '',
      ...monthlyTotals,
      'Grand Total': totalGrandTotal,
    };

    return totalsRow;
  },
  /**
   * Convert array of objects to CSV string
   * @param {Array} data - Array of objects to convert
   * @returns {string} CSV formatted string
   */
  convertToCSV(data) {
    if (!data || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [];

    // Add headers
    csvRows.push(headers.join(','));

    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        return escapeCSVValue(row[header]);
      });
      csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
  },

  /**
   * Generate filename with timestamp
   * @returns {string} Filename for the CSV export
   */
  generateFilename(planningYear) {
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const yearPart = planningYear ? `${planningYear}_` : '';
    return `approved_entries_export_${yearPart}${timestamp}.csv`;
  },

  generateYearlyBackupFilename(year) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `awpb_yearly_backup_${year}_${timestamp}.csv`;
  },

  /**
   * Trigger browser download of CSV file
   * @param {string} csvContent - CSV content as string
   * @param {string} filename - Name of the file to download
   */
  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  },

  /**
   * Main export function - fetches approved entries and exports to CSV
   * @returns {Promise<{filename: string, recordCount: number}>} Export result info
   */
  async exportApprovedEntriesToCSV(planningYear) {
    try {
      // Fetch approved entries
      const entries = await this.fetchApprovedEntries(planningYear);

      if (!entries || entries.length === 0) {
        throw new Error(
          planningYear
            ? `No approved entries found to export for ${planningYear}`
            : 'No approved entries found to export',
        );
      }

      // Transform data for CSV
      const csvData = this.transformEntriesForCSV(entries);

      // Calculate totals row
      const totalsRow = this.calculateTotalsRow(entries);
      csvData.push(totalsRow);

      // Convert to CSV string
      const csvContent = this.convertToCSV(csvData);

      // Generate filename
      const filename = this.generateFilename(planningYear);

      // Trigger download
      this.downloadCSV(csvContent, filename);

      return {
        filename,
        recordCount: entries.length
      };
    } catch (error) {
      console.error('Error exporting approved entries to CSV:', error);
      throw error;
    }
  },

  createYearlyEntriesBackup(entries, year) {
    const archiveEntries = (entries || []).filter(
      (entry) => String(entry.planningYear || '') === String(year),
    );

    if (archiveEntries.length === 0) {
      throw new Error(`No entries found for planning year ${year}`);
    }

    const csvContent = this.convertYearlyBackupToCSV(archiveEntries, year);
    const filename = this.generateYearlyBackupFilename(year);

    return {
      csvContent,
      filename,
      recordCount: archiveEntries.length,
    };
  },

  exportYearlyEntriesBackupToCSV(entries, year) {
    const backup = this.createYearlyEntriesBackup(entries, year);

    this.downloadCSV(backup.csvContent, backup.filename);

    return {
      filename: backup.filename,
      recordCount: backup.recordCount,
    };
  }
};

export const csvImportService = {
  async importEntriesFromCSV(file, existingEntries = []) {
    if (!file) throw new Error('Please choose a CSV file to import.');

    const csvContent = await file.text();
    const rows = extractEntryRows(csvContent);

    if (rows.length === 0) {
      throw new Error('No importable AWPB entry rows were found in the CSV file.');
    }

    const fallbackStatus = /approved_entries_export/i.test(file.name || '')
      ? 'Approved'
      : 'Pending Review';
    const importedEntries = transformImportedRowsToEntries(rows, fallbackStatus);
    const validationErrors = validateImportedEntries(importedEntries);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.slice(0, 3).join(' '));
    }

    const createdEntries = [];
    const failedRows = [];
    const skippedRows = [];
    const currentEntries = await fetchLatestEntriesForDuplicateCheck(existingEntries);
    const duplicateFingerprints = new Set();
    const duplicateEntryIds = new Set();

    currentEntries.forEach((entry) => {
      addDuplicateFingerprints(entry, duplicateFingerprints, duplicateEntryIds);
    });

    for (const entry of importedEntries) {
      if (hasDuplicateFingerprint(entry, duplicateFingerprints, duplicateEntryIds)) {
        skippedRows.push({
          rowNumber: entry.sourceRowNumber,
          message: 'Duplicate entry skipped.',
        });
        continue;
      }

      addDuplicateFingerprints(entry, duplicateFingerprints, duplicateEntryIds);

      try {
        const entryData = { ...entry };
        delete entryData.sourceRowNumber;
        delete entryData.sourceEntryId;
        const createdEntry = await createImportedEntry(entryData);
        createdEntries.push(createdEntry);
        addDuplicateFingerprints(createdEntry, duplicateFingerprints, duplicateEntryIds);
      } catch (error) {
        removeDuplicateFingerprints(entry, duplicateFingerprints, duplicateEntryIds);
        failedRows.push({
          rowNumber: entry.sourceRowNumber,
          message: error.message || 'Import failed.',
        });
      }
    }

    if (createdEntries.length === 0 && skippedRows.length === 0 && failedRows.length > 0) {
      throw new Error(
        `Import failed. Row ${failedRows[0].rowNumber}: ${failedRows[0].message}`,
      );
    }

    return {
      importedCount: createdEntries.length,
      skippedRows,
      failedRows,
      createdEntries,
    };
  },
};
