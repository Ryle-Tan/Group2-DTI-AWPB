import ExcelJS from 'exceljs';
import { csvExportService } from './csvService'; // Pulls from your CSV data pipeline
import { calculateUnitBudget } from '../lib/budgetCalculations';

export const autoExcelWorkbookService = {
    /**
     * Generates a clean, browser-native pie chart using HTML5 Canvas for monthly totals
     */
    generateDashboardChartImage(monthlyTotals) {
        const canvas = document.createElement('canvas');
        canvas.width = 650; // Widened slightly to give full numbers more breathing room
        canvas.height = 450;
        const ctx = canvas.getContext('2d');

        const colors = [
            '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#10B981', '#EC4899', '#0e8173', '#513207',
            '#4546a1', '#EF4444'
        ];

        const labels = Object.keys(monthlyTotals);
        const data = Object.values(monthlyTotals);
        const total = data.reduce((sum, val) => sum + val, 0);

        const centerX = 220;
        const centerY = 225;
        const radius = 160;

        // First Pass: Render Pie Slices
        let startAngle = 0;
        data.forEach((value, index) => {
            if (value === 0) return;
            const sliceAngle = (value / total) * 2 * Math.PI;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();

            startAngle += sliceAngle;
        });

        // Second Pass: Draw percentages directly on the slices
        startAngle = 0;
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        data.forEach((value) => {
            if (value === 0) return;
            const sliceAngle = (value / total) * 2 * Math.PI;
            const percentage = (value / total) * 100;

            // Only display percentage text on slices larger than 3% to prevent cluttering
            if (percentage > 3) {
                const middleAngle = startAngle + sliceAngle / 2;
                // Position text at 60% of the radius length outward from the center
                const textX = centerX + Math.cos(middleAngle) * (radius * 0.6);
                const textY = centerY + Math.sin(middleAngle) * (radius * 0.6);
                ctx.fillText(`${percentage.toFixed(1)}%`, textX, textY);
            }

            startAngle += sliceAngle;
        });

        // Render Professional Side Legend (Restored Text defaults)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#333333';
        ctx.fillText('Monthly Breakdown Summary', 410, 40);

        labels.forEach((label, index) => {
            const yOffset = 70 + (index * 28);
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(410, yOffset - 11, 14, 14);

            ctx.fillStyle = '#555555';
            ctx.font = '12px Arial';

            const formattedAmount = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(data[index]);

            ctx.fillText(`${label} (${formattedAmount})`, 435, yOffset);
        });

        return canvas.toDataURL('image/png');
    },

    /**
     * Generates a native pie chart for budget-per-unit totals.
     */
    generateBudgetByUnitPieChart(unitBudgetArray) {
        const canvas = document.createElement('canvas');
        canvas.width = 800; // Widened slightly to give full numbers more breathing room
        canvas.height = 450;
        const ctx = canvas.getContext('2d');

        const dataItems = unitBudgetArray.filter((item) => item.amount > 0).slice(0, 12);
        if (dataItems.length === 0) {
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('No approved unit budget data available', 30, 60);
            return canvas.toDataURL('image/png');
        }

        const colors = [
            '#FF3B30', // January - Vibrant Red
            '#007AFF', // February - Deep Blue
            '#34C759', // March - Apple Green
            '#FFCC00', // April - Vivid Yellow
            '#AF52DE', // May - Royal Purple
            '#FF9500', // June - Tangerine Orange
            '#5AC8FA', // July - Sky Blue / Cyan
            '#FF2D55', // August - Hot Pink
            '#1ABC9C', // September - Deep Turquoise
            '#E67E22', // October - Burnt Orange
            '#27AE60', // November - Forest Green
            '#2C3E50'  // December - Midnight Navy
        ];

        const total = dataItems.reduce((sum, item) => sum + item.amount, 0);

        const centerX = 220;
        const centerY = 240;
        const radius = 160;

        // First Pass: Render Pie Slices
        let startAngle = 0;
        dataItems.forEach((item, index) => {
            const sliceAngle = (item.amount / total) * 2 * Math.PI;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();

            startAngle += sliceAngle;
        });

        // Second Pass: Draw percentages directly on the slices
        startAngle = 0;
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        dataItems.forEach((item) => {
            const sliceAngle = (item.amount / total) * 2 * Math.PI;
            const percentage = (item.amount / total) * 100;

            // Only display percentage text on slices larger than 3% to prevent cluttering
            if (percentage > 3) {
                const middleAngle = startAngle + sliceAngle / 2;
                const textX = centerX + Math.cos(middleAngle) * (radius * 0.6);
                const textY = centerY + Math.sin(middleAngle) * (radius * 0.6);
                ctx.fillText(`${percentage.toFixed(1)}%`, textX, textY);
            }

            startAngle += sliceAngle;
        });

        // Render Title
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Approved Budget Allocation by Unit', 30, 40);

        // Render Side Legend for Units
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#333333';
        ctx.fillText('Units Allocation Summary', 430, 70);

        dataItems.forEach((item, index) => {
            const yOffset = 105 + (index * 26);

            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(430, yOffset - 11, 14, 14);

            ctx.fillStyle = '#555555';
            ctx.font = '12px Arial';

            // FIXED: Swapped short compactDisplay format for the explicit, un-truncated string layout
            const formattedAmount = new Intl.NumberFormat('en-PH', {
                style: 'currency',
                currency: 'PHP',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(item.amount);

            ctx.fillText(`${item.unit}: ${formattedAmount} (${item.entries} ${item.entries === 1 ? 'entry' : 'entries'})`, 455, yOffset);
        });

        return canvas.toDataURL('image/png');
    },

    async exportWithDashboardChart(planningYear) {
        try {
            const entries = await csvExportService.fetchApprovedEntries(planningYear);

            if (!entries || entries.length === 0) {
                throw new Error('No approved entries found to export');
            }

            // Initialize ExcelJS Workbook
            const wb = new ExcelJS.Workbook();

            // Setup worksheets
            const wsDashboard = wb.addWorksheet('Dashboard');
            const wsData = wb.addWorksheet('Approved Entries');

            // Structural Table Headers mapping to your updated schema
            const headers = [
                { header: 'Planning Year', key: 'planningYear' },
                { header: 'Status', key: 'status' },
                { header: 'Unit', key: 'unit' },
                { header: 'Component', key: 'component' },
                { header: 'Sub Component', key: 'subComponent' },
                { header: 'Key Activity', key: 'keyActivity' },
                { header: 'Activity No.', key: 'no' },
                { header: 'Performance Indicator', key: 'performanceIndicator' },
                { header: 'Sub Activity', key: 'subActivity' },
                { header: 'Title of Activities', key: 'titleOfActivities' },
                { header: 'Unit Cost', key: 'unitCost' },
                { header: 'January Target', key: 'janTarget' },
                { header: 'February Target', key: 'febTarget' },
                { header: 'March Target', key: 'marTarget' },
                { header: 'April Target', key: 'aprTarget' },
                { header: 'May Target', key: 'mayTarget' },
                { header: 'June Target', key: 'junTarget' },
                { header: 'July Target', key: 'julTarget' },
                { header: 'August Target', key: 'augTarget' },
                { header: 'September Target', key: 'sepTarget' },
                { header: 'October Target', key: 'octTarget' },
                { header: 'November Target', key: 'novTarget' },
                { header: 'December Target', key: 'decTarget' },
                { header: 'January', key: 'jan' },
                { header: 'February', key: 'feb' },
                { header: 'March', key: 'mar' },
                { header: 'April', key: 'apr' },
                { header: 'May', key: 'may' },
                { header: 'June', key: 'jun' },
                { header: 'July', key: 'jul' },
                { header: 'August', key: 'aug' },
                { header: 'September', key: 'sep' },
                { header: 'October', key: 'oct' },
                { header: 'November', key: 'nov' },
                { header: 'December', key: 'dec' },
                { header: 'Grand Total', key: 'grandTotal' }
            ];
            wsData.columns = headers;

            // Populate rows with real data types
            entries.forEach(entry => {
                const monthTargets = Object.values(entry.monthlyTargets || {});
                const monthBreakdowns = Object.values(entry.monthlyBreakdown || {});

                wsData.addRow({
                    planningYear: entry.planningYear,
                    status: entry.status || 'Approved',
                    unit: entry.unit,
                    component: entry.component,
                    subComponent: entry.subComponent,
                    keyActivity: entry.keyActivity,
                    no: entry.no,
                    performanceIndicator: entry.performanceIndicator,
                    subActivity: entry.subActivity,
                    titleOfActivities: entry.titleOfActivities,
                    unitCost: entry.unitCost,

                    // Map targets array cleanly
                    janTarget: monthTargets[0] || 0, febTarget: monthTargets[1] || 0, marTarget: monthTargets[2] || 0,
                    aprTarget: monthTargets[3] || 0, mayTarget: monthTargets[4] || 0, junTarget: monthTargets[5] || 0,
                    julTarget: monthTargets[6] || 0, augTarget: monthTargets[7] || 0, sepTarget: monthTargets[8] || 0,
                    octTarget: monthTargets[9] || 0, novTarget: monthTargets[10] || 0, decTarget: monthTargets[11] || 0,

                    // Map values financial breakdown array cleanly
                    jan: monthBreakdowns[0] || 0, feb: monthBreakdowns[1] || 0, mar: monthBreakdowns[2] || 0,
                    apr: monthBreakdowns[3] || 0, may: monthBreakdowns[4] || 0, jun: monthBreakdowns[5] || 0,
                    jul: monthBreakdowns[6] || 0, aug: monthBreakdowns[7] || 0, sep: monthBreakdowns[8] || 0,
                    oct: monthBreakdowns[9] || 0, nov: monthBreakdowns[10] || 0, dec: monthBreakdowns[11] || 0,

                    grandTotal: entry.grandTotal
                });
            });

            // Calculate Totals Accumulation
            const monthlyTargetTotals = {};
            const monthlyTotals = {};
            let totalGrandTotal = 0;

            entries.forEach(entry => {
                Object.keys(entry.monthlyTargets || {}).forEach((month, idx) => {
                    monthlyTargetTotals[idx] = (monthlyTargetTotals[idx] || 0) + Number(entry.monthlyTargets[month] || 0);
                });
                Object.keys(entry.monthlyBreakdown || {}).forEach((month, idx) => {
                    monthlyTotals[idx] = (monthlyTotals[idx] || 0) + entry.monthlyBreakdown[month];
                });
                totalGrandTotal += entry.grandTotal;
            });

            // Append Totals row 
            const totalRowNode = wsData.addRow({
                unit: 'TOTAL',
                janTarget: monthlyTargetTotals[0], febTarget: monthlyTargetTotals[1], marTarget: monthlyTargetTotals[2],
                aprTarget: monthlyTargetTotals[3], mayTarget: monthlyTargetTotals[4], junTarget: monthlyTargetTotals[5],
                julTarget: monthlyTargetTotals[6], augTarget: monthlyTargetTotals[7], sepTarget: monthlyTargetTotals[8],
                octTarget: monthlyTargetTotals[9], novTarget: monthlyTargetTotals[10], decTarget: monthlyTargetTotals[11],
                jan: monthlyTotals[0], feb: monthlyTotals[1], mar: monthlyTotals[2],
                apr: monthlyTotals[3], may: monthlyTotals[4], jun: monthlyTotals[5],
                jul: monthlyTotals[6], aug: monthlyTotals[7], sep: monthlyTotals[8],
                oct: monthlyTotals[9], nov: monthlyTotals[10], dec: monthlyTotals[11],
                grandTotal: totalGrandTotal
            });
            totalRowNode.font = { bold: true };

            const currencyColumns = ['unitCost', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'grandTotal'];

            wsData.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip structural header row
                currencyColumns.forEach(colKey => {
                    row.getCell(colKey).numFmt = '#,##0.00';
                });
            });

            // Auto-fit widths dynamically according to content
            wsData.columns.forEach(column => {
                let maxLen = 0;
                column.eachCell({ includeEmpty: true }, (cell) => {
                    const valueLen = cell.value ? cell.value.toString().length : 0;
                    if (valueLen > maxLen) maxLen = valueLen;
                });
                column.width = maxLen < 12 ? 12 : maxLen + 3;
            });

            // Generate and embed Canvas Charts to Dashboard Worksheet
            const readableMonthsMap = {
                'January': monthlyTotals[0] || 0, 'February': monthlyTotals[1] || 0, 'March': monthlyTotals[2] || 0,
                'April': monthlyTotals[3] || 0, 'May': monthlyTotals[4] || 0, 'June': monthlyTotals[5] || 0,
                'July': monthlyTotals[6] || 0, 'August': monthlyTotals[7] || 0, 'September': monthlyTotals[8] || 0,
                'October': monthlyTotals[9] || 0, 'November': monthlyTotals[10] || 0, 'December': monthlyTotals[11] || 0
            };

            // Generate monthly breakdown pie chart
            const monthlyChartBase64 = this.generateDashboardChartImage(readableMonthsMap);
            const monthlyImageId = wb.addImage({
                base64: monthlyChartBase64,
                extension: 'png',
            });

            wsDashboard.addImage(monthlyImageId, {
                tl: { col: 0, row: 0 },
                ext: { width: 650, height: 450 } // Matches canvas dimension tweaks
            });

            // Generate budget-per-unit pie chart
            const unitBudgetArray = calculateUnitBudget(entries, planningYear);
            const unitChartBase64 = this.generateBudgetByUnitPieChart(unitBudgetArray);
            const unitImageId = wb.addImage({
                base64: unitChartBase64,
                extension: 'png',
            });

            wsDashboard.addImage(unitImageId, {
                tl: { col: 0, row: 24 },
                ext: { width: 800, height: 450 } // Matches canvas dimension tweaks
            });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().split('T')[0];
            const yearPart = planningYear ? `${planningYear}_` : '';

            link.href = URL.createObjectURL(blob);
            link.download = `approved_entries_dashboard_${yearPart}${timestamp}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Failed to run frontend workbook export service:', error);
            throw error;
        }
    }
};