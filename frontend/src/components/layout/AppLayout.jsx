import { useRef, useState } from "react";
import logo from "../../assets/dtilogo.png";
import { NavLink, useLocation } from "react-router-dom";
import Toast from "@/components/ui/toast";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ClipboardCheck,
  LogOut,
  User,
  Users,
  UserPlus,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  ArrowLeftRight,
  Archive,
} from "lucide-react";

const iconMap = {
  dashboard: LayoutDashboard,
  entries: FileText,
  submit: PlusCircle,
  review: ClipboardCheck,
  archive: Archive,
  accounts: Users,
  addAccount: UserPlus,
  template: SlidersHorizontal,
};

function getRoleLabel(role) {
  return role === "admin" ? "Admin" : "Account Officer";
}

export default function AppLayout({
  children,
  navItems = [],
  currentRole = "encoder",
  currentView = currentRole,
  currentUser,
  canSwitchView = false,
  onSwitchView,
  onLogout,
  toast,
  onDismissToast,
}) {
  const location = useLocation();
  const [hoveredMenu, setHoveredMenu] = useState(null);

  const closeTimerRef = useRef(null);

  const handleMenuMouseEnter = (label) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoveredMenu(label);
  };

  const handleMenuMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setHoveredMenu(null);
    }, 140);
  };

  const isSubItemActive = (subItems = []) => {
    return subItems.some((subItem) => location.pathname === subItem.to);
  };

  return (
    <div className="flex min-h-screen w-screen overflow-x-hidden flex-col xl:flex-row bg-gradient-to-b from-[#0b4f52] to-[#08393b] text-white">
      <aside className="flex w-full xl:w-[290px] flex-col px-7 py-8">
        <div>
          <div className="mb-10 px-1">
            <div className="flex h-24 items-center justify-center rounded-2xl border border-slate-300 bg-[#edf4f3] px-2 pb-2 pt-1 shadow-sm">
              <img
                src={logo}
                alt="DTI RAPID Growth Project"
                width="931"
                height="476"
                className="h-20 w-auto object-contain"
              />
            </div>
          </div>

          <div className="mb-6">
            <p className="text-3xl font-bold uppercase tracking-wide">
              {getRoleLabel(currentView)}
            </p>
            <div className="mt-4 h-px bg-white/20" />
          </div>

          <nav className="space-y-3">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon];

              if (item.subItems) {
                const hasActiveChild = isSubItemActive(item.subItems);
                const isOpen = hasActiveChild || hoveredMenu === item.label;

                return (
                  <div
                    key={item.label}
                    className="space-y-2"
                    onMouseEnter={() => handleMenuMouseEnter(item.label)}
                    onMouseLeave={handleMenuMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={() => {}}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                        hasActiveChild
                          ? "bg-white/15 text-white"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {Icon ? <Icon size={18} /> : null}
                        {item.label}
                      </span>

                      {isOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>

                    <div
                      className={`ml-4 grid overflow-hidden transition-all duration-150 ease-out ${
                        isOpen
                          ? "max-h-40 translate-y-0 opacity-100"
                          : "max-h-0 -translate-y-1 opacity-0"
                      }`}
                    >
                      <div className="space-y-2 pt-1">
                        {item.subItems.map((subItem) => (
                          <NavLink
                            end={subItem.to === "/admin/manage-accounts"}
                            key={subItem.to}
                            to={subItem.to}
                            className={({ isActive }) =>
                              `flex items-center gap-3 rounded-xl px-4 py-2 text-sm transition ${
                                isActive
                                  ? "bg-white/15 text-white"
                                  : "text-white/75 hover:bg-white/10 hover:text-white"
                              }`
                            }
                          >
                            <UserPlus size={16} />
                            <span>{subItem.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={item.onClick}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-white/15 text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  {Icon ? <Icon size={18} /> : null}
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
                <User size={18} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {currentUser?.fullName || currentUser?.username || "User"}
                </p>
                <p className="text-xs text-white/70 capitalize">
                  {currentRole === "admin"
                    ? `${getRoleLabel(currentView)} View`
                    : getRoleLabel(currentUser?.role)}
                </p>
              </div>
            </div>
          </div>

          {canSwitchView ? (
            <button
              type="button"
              onClick={onSwitchView}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeftRight size={18} />
              <span>
                {currentView === "admin"
                  ? "Switch to Account Officer"
                  : "Switch to Admin"}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-5">
        <div className="h-[calc(100vh-2rem)] overflow-y-auto rounded-[2rem] bg-[#edf4f3] px-6 py-6 text-slate-900 md:px-8 md:py-8">
          <Toast toast={toast} onDismiss={onDismissToast} />
          {children}
        </div>
      </main>
    </div>
  );
}
