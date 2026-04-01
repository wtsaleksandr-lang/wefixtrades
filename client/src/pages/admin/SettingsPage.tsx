import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <AdminLayout pageContext={{ page: "settings" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Account Settings</h2>
        <Card className="p-5">
          <p className="text-sm text-gray-500">Account settings will be available in a future update. This will include notification preferences, timezone, and display options.</p>
        </Card>
      </div>
    </AdminLayout>
  );
}
