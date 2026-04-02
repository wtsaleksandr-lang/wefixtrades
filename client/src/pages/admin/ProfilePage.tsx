import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { User } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <AdminLayout pageContext={{ page: "profile" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#2D6A4F] flex items-center justify-center">
              <span className="text-white text-xl font-bold">{(user?.name || user?.email || "A").charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{user?.name || "Admin"}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">Role: {user?.role || "admin"}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Profile editing will be available in a future update.</p>
        </Card>
      </div>
    </AdminLayout>
  );
}
