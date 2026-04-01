import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Wrench, ClipboardList, Truck, CreditCard, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";

interface Overview {
  totalClients: number;
  activeServices: number;
  pendingOnboarding: number;
  openFulfillment: number;
  unpaidAmount: number;
  monthlyRevenue: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  href?: string;
  color: string;
}) {
  const inner = (
    <Card className="p-4 hover:shadow-sm transition-shadow cursor-default">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function RecentClientsPlaceholder() {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Clients</h3>
      <p className="text-sm text-gray-500">No clients yet. Add your first client to get started.</p>
      <Link href="/admin/crm/clients">
        <span className="text-sm text-[#2D6A4F] font-medium hover:underline mt-2 inline-block">
          Go to Clients &rarr;
        </span>
      </Link>
    </Card>
  );
}

function RecentFulfillmentPlaceholder() {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Fulfillment Tasks</h3>
      <p className="text-sm text-gray-500">No fulfillment tasks yet. Tasks will appear here once services are assigned.</p>
    </Card>
  );
}

export default function CrmOverview() {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/crm/overview"],
  });

  const formatCurrency = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Operations Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">Your business at a glance</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </Card>
            ))
          ) : (
            <>
              <StatCard
                label="Clients"
                value={data?.totalClients ?? 0}
                icon={Users}
                href="/admin/crm/clients"
                color="bg-[#2D6A4F]"
              />
              <StatCard
                label="Active Services"
                value={data?.activeServices ?? 0}
                icon={Wrench}
                color="bg-blue-500"
              />
              <StatCard
                label="Onboarding"
                value={data?.pendingOnboarding ?? 0}
                icon={ClipboardList}
                color="bg-amber-500"
              />
              <StatCard
                label="Fulfillment"
                value={data?.openFulfillment ?? 0}
                icon={Truck}
                color="bg-purple-500"
              />
              <StatCard
                label="Unpaid"
                value={formatCurrency(data?.unpaidAmount ?? 0)}
                icon={CreditCard}
                color="bg-red-500"
              />
              <StatCard
                label="Revenue (Mo)"
                value={formatCurrency(data?.monthlyRevenue ?? 0)}
                icon={TrendingUp}
                color="bg-emerald-500"
              />
            </>
          )}
        </div>

        {/* Bottom panels */}
        <div className="grid md:grid-cols-2 gap-4">
          <RecentClientsPlaceholder />
          <RecentFulfillmentPlaceholder />
        </div>
      </div>
    </AdminLayout>
  );
}
