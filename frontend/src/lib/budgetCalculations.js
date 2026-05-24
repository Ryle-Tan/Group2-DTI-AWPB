import { UNIT_CODES, normalizeUnitCode } from "./units";

export function getEntryBudgetTotal(entry) {
    if (!entry) return 0;

    if (Array.isArray(entry.monthlyBreakdown)) {
        return entry.monthlyBreakdown.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
        );
    }

    if (entry.monthlyBreakdown && typeof entry.monthlyBreakdown === 'object') {
        const objectTotal = Object.values(entry.monthlyBreakdown).reduce(
            (sum, val) => sum + Number(val || 0),
            0
        );
        if (objectTotal > 0) return objectTotal;
    }

    return Number(entry.grandTotal || 0);
}

export function isApprovedStatus(status) {
    return String(status || "").trim().toLowerCase() === "approved";
}

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
