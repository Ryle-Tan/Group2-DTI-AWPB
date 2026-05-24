import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

const toneMap = {
  success: {
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-600",
  },
  info: {
    wrapper: "border-slate-200 bg-white text-slate-900",
    icon: "text-slate-500",
  },
  error: {
    wrapper: "border-rose-200 bg-rose-50 text-rose-950",
    icon: "text-rose-600",
  },
};

const iconMap = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  const tone = toneMap[toast.type] || toneMap.info;
  const Icon = iconMap[toast.type] || Info;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-full max-w-sm justify-end md:bottom-10 md:right-10">
      <div
        className={`pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.12)] ${
          toast.exiting
            ? "animate-[toast-out_220ms_ease-in_forwards]"
            : "animate-[toast-in_220ms_ease-out]"
        } ${tone.wrapper}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${tone.icon}`}>
            <Icon size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.description ? (
              <p className="mt-1 text-sm opacity-80">{toast.description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600"
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <style>{`
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateX(28px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes toast-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(28px);
          }
        }
      `}</style>
    </div>
  );
}
