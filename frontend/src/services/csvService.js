import { supabase } from '../lib/supabase';
import { normalizeUnitCode } from '../lib/units';

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

const YEARLY_BACKUP_STATUS_SECTIONS = [
  { label: 'Approved', statuses: ['approved'] },
  { label: 'Pending Review', statuses: ['pending review', 'pending'] },
  { label: 'Returned', statuses: ['returned', 'return'] },
  { label: 'Rejected', statuses: ['rejected'] },
];

function normalizeMonthKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return MONTHS_LIST.find((month) => {
    const fullName = MONTH_NAMES[month].toLowerCase();
    return normalized === month || normalized === fullName || normalized.slice(0, 3) === month;
  });
}

function getEntryMonthBreakdown(entry, monthKey) {
  const monthlyRows = Array.isArray(entry.monthlyBreakdown)
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
          subComponent: row.sub_components?.name || '',
          keyActivity: row.key_activities?.name || '',
          no: row.no || row.activity_no || row.key_activities?.activity_no || '',
          performanceIndicator:
            row.performance_indicator ||
            row.performanceIndicator ||
            row.key_activities?.performance_indicator ||
            '',
          subActivity: row.sub_activities?.name || '',
          titleOfActivities: row.title_of_activities,
          planningYear: row.planning_year,
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
      'Unit': entry.unit,
      'Component': entry.component,
      'Sub Component': entry.subComponent,
      'Key Activity': entry.keyActivity,
      'Activity No.': entry.no,
      'Performance Indicator': entry.performanceIndicator,
      'Sub Activity': entry.subActivity,
      'Title of Activities': entry.titleOfActivities,
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
        'Entry ID': entry.id || '',
        'Owner Full Name': entry.ownerFullName || entry.ownerDisplayName || '',
        'Reviewer Full Name': entry.reviewerFullName || entry.reviewerDisplayName || '',
        'Unit': entry.unit || '',
        'Component': entry.component || '',
        'Sub Component': entry.subComponent || '',
        'Key Activity': entry.keyActivity || '',
        'Activity No.': entry.no || '',
        'Performance Indicator': entry.performanceIndicator || '',
        'Sub Activity': entry.subActivity || '',
        'Title of Activities': entry.titleOfActivities || '',
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
      'Unit': 'TOTAL',
      'Component': '',
      'Sub Component': '',
      'Key Activity': '',
      'Activity No.': '',
      'Performance Indicator': '',
      'Sub Activity': '',
      'Title of Activities': '',
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

  exportYearlyEntriesBackupToCSV(entries, year) {
    const archiveEntries = (entries || []).filter(
      (entry) => String(entry.planningYear || '') === String(year),
    );

    if (archiveEntries.length === 0) {
      throw new Error(`No entries found for planning year ${year}`);
    }

    const csvContent = this.convertYearlyBackupToCSV(archiveEntries, year);
    const filename = this.generateYearlyBackupFilename(year);

    this.downloadCSV(csvContent, filename);

    return {
      filename,
      recordCount: archiveEntries.length,
    };
  }
};
