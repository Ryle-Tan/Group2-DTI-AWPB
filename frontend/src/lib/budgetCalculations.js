import { UNIT_CODES, normalizeUnitCode } from "./units";

/**
 * Returns the budget total for an entry.
 * Safely handles both object and array forms of monthlyBreakdown, 
 * falling back cleanly to the pre-calculated grandTotal.
 */
export function getEntryBudgetTotal(entry) {
    if (!entry) return 0;

    // If monthlyBreakdown is an array, reduce it
    if (Array.isArray(entry.monthlyBreakdown)) {
        return entry.monthlyBreakdown.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
        );
    }

    // If monthlyBreakdown is an object, sum up its numerical values
    if (entry.monthlyBreakdown && typeof entry.monthlyBreakdown === 'object') {
        const objectTotal = Object.values(entry.monthlyBreakdown).reduce(
            (sum, val) => sum + Number(val || 0),
            0
        );
        if (objectTotal > 0) return objectTotal;
    }

    // Fallback to the pre-calculated raw grandTotal property
    return Number(entry.grandTotal || 0);
}

/**
 * Returns true when the entry status is approved.
 */
export function isApprovedStatus(status) {
    return String(status || "").trim().toLowerCase() === "approved";
}

/**
 * Returns budgets grouped by unit for approved entries.
 * This includes all known unit codes and also any normalized unit values.
 */
export function calculateUnitBudget(entries, planningYear = null) {
    const filteredEntries = entries.filter((entry) => {
        const approved = isApprovedStatus(entry.status);
        const yearMatch = planningYear
            ? String(entry.planningYear || "") === String(planningYear)
            : true;
        return approved && yearMatch;
    });

    const totalsByUnit = UNIT_CODES.reduce((acc, unit) => {
        acc[unit] = {
            unit,
            amount: 0,
            entries: 0,
        };
        return acc;
    }, {});

    filteredEntries.forEach((entry) => {
        const unitKey = normalizeUnitCode(entry.unit);

        if (!totalsByUnit[unitKey]) {
            totalsByUnit[unitKey] = {
                unit: unitKey,
                amount: 0,
                entries: 0,
            };
        }

        totalsByUnit[unitKey].amount += getEntryBudgetTotal(entry);
        totalsByUnit[unitKey].entries += 1;
    });

    return Object.values(totalsByUnit).sort(
        (a, b) => b.amount - a.amount || a.unit.localeCompare(b.unit),
    );
}

/**
 * Returns a simple map of unit -> approved budget amount.
 */
export function getUnitBudgetMap(entries, planningYear = null) {
    return calculateUnitBudget(entries, planningYear).reduce((acc, item) => {
        acc[item.unit] = item.amount;
        return acc;
    }, {});
}