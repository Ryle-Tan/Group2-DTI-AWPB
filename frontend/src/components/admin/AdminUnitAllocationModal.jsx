import { Wallet, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAmountInput(value) {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  const dotIndex = cleaned.indexOf(".");
  const hasDecimal = dotIndex !== -1;
  const rawWhole = hasDecimal ? cleaned.slice(0, dotIndex) : cleaned;
  const rawFraction = hasDecimal
    ? cleaned.slice(dotIndex + 1).replace(/\./g, "").slice(0, 2)
    : "";
  const whole = (rawWhole || "0").replace(/^0+(?=\d)/, "");
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return hasDecimal ? `${formattedWhole}.${rawFraction}` : formattedWhole;
}

export default function AdminUnitAllocationModal({
  adjustmentType = "ADDED",
  amount,
  description,
  onAmountChange,
  onClose,
  onDescriptionChange,
  onSave,
  onTypeChange,
  estimate = 0,
  planningYear,
  saving = false,
  unit,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="w-full max-w-[720px] overflow-hidden rounded-[1.75rem] bg-[#edf4f3] shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#1f2f74] via-[#243b86] to-[#2a4694] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/18 p-3">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">
                Edit Planning Estimate - {unit} {planningYear ? `(${planningYear})` : ""}
              </h3>
              <p className="mt-1 text-sm text-white/75">
                Adjust this unit's estimated AWPB budget for this planning year.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-white/85 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200/80 bg-white px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Current {planningYear || ""} Planning Estimate
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-900">
                ₱{formatCurrency(estimate)}
              </p>
            </div>
            <p className="max-w-[320px] text-sm text-slate-500">
              Approved entries can go above this estimate while the final plan is being formed.
            </p>
          </div>
        </div>

        <div className="grid gap-5 px-6 py-6 md:grid-cols-[220px_1fr]">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Adjustment type
            </label>
            <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => onTypeChange?.("ADDED")}
                disabled={saving}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  adjustmentType === "ADDED"
                    ? "bg-[#233f8f] text-white shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
              >
                Increase Estimate
              </button>
              <button
                type="button"
                onClick={() => onTypeChange?.("DEDUCTED")}
                disabled={saving}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  adjustmentType === "DEDUCTED"
                    ? "bg-[#233f8f] text-white shadow-sm"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
              >
                Reduce Estimate
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Amount (₱)</label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => onAmountChange?.(formatAmountInput(event.target.value))}
              disabled={saving}
              className="h-12 rounded-xl border-slate-200 bg-white text-lg font-medium"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Description
            </label>
            <Input
              type="text"
              placeholder={
                adjustmentType === "ADDED"
                  ? `Additional ${planningYear || ""} planning estimate for ${unit}`
                  : `${planningYear || ""} planning estimate reduction for ${unit}`
              }
              value={description}
              onChange={(event) => onDescriptionChange?.(event.target.value)}
              disabled={saving}
              className="h-12 rounded-xl border-slate-200 bg-white"
            />
          </div>
        </div>

        <div className="flex gap-3 border-t border-slate-200/80 bg-white p-4">
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-xl border-0 bg-gradient-to-r from-[#1f2f74] to-[#2a4694] text-white hover:from-[#19265f] hover:to-[#213a80] disabled:cursor-wait disabled:opacity-75"
          >
            {saving ? "Saving..." : "Save Adjustment"}
          </Button>
          <Button
            type="button"
            onClick={onClose}
            disabled={saving}
            variant="outline"
            className="flex-1 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
