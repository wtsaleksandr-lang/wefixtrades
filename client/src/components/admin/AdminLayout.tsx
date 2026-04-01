import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Inbox,
  CreditCard,
  Factory,
  ChevronLeft,
  Menu,
  BrainCircuit,
  Plus,
  UserPlus,
  ClipboardPlus,
  StickyNote,
  DollarSign,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin/crm", icon: LayoutDashboard },
  { label: "Clients", href: "/admin/crm/clients", icon: Users },
  { label: "Inbox", href: "/admin/crm/inbox", icon: Inbox },
  { label: "Billing", href: "/admin/crm/billing", icon: CreditCard },
  { label: "Suppliers", href: "/admin/crm/suppliers", icon: Factory },
];

const SECONDARY_ITEMS = [
  { label: "AI Dashboard", href: "/admin/ai", icon: BrainCircuit },
];

function isActive(location: string, href: string): boolean {
  if (href === "/admin/crm") return location === "/admin/crm";
  return location.startsWith(href);
}

interface QuickAddProps {
  onAction: (action: string) => void;
}

function QuickAddButton({ onAction }: QuickAddProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332] h-8 px-3 gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Quick Add</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onAction("client")}>
          <UserPlus className="w-4 h-4 mr-2 text-gray-500" /> Add Client
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("task")}>
          <ClipboardPlus className="w-4 h-4 mr-2 text-gray-500" /> Add Task
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("note")}>
          <StickyNote className="w-4 h-4 mr-2 text-gray-500" /> Add Note
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("payment")}>
          <DollarSign className="w-4 h-4 mr-2 text-gray-500" /> Add Payment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminLayout({
  children,
  onQuickAdd,
}: {
  children: React.ReactNode;
  onQuickAdd?: (action: string) => void;
}) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#F6F7F9] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
          <Link href="/admin/crm" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
              <span className="text-white text-xs font-bold">W</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">WFT Admin</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                    active
                      ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-6 mb-2 px-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Other
            </span>
          </div>
          <div className="space-y-0.5">
            {SECONDARY_ITEMS.map((item) => {
              const active = isActive(location, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]",
                    active
                      ? "bg-[#F0F7F4] text-[#2D6A4F] font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-[#2D6A4F]" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-[11px] text-gray-400">WeFixTrades Admin v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden mr-2 min-h-[44px] min-w-[44px]"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-sm font-medium text-gray-700">
              {NAV_ITEMS.find((item) => isActive(location, item.href))?.label ??
                SECONDARY_ITEMS.find((item) => isActive(location, item.href))?.label ??
                "Admin"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {onQuickAdd && <QuickAddButton onAction={onQuickAdd} />}
            <div className="w-7 h-7 rounded-full bg-[#2D6A4F] flex items-center justify-center" title="Admin">
              <span className="text-white text-[10px] font-bold">A</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
