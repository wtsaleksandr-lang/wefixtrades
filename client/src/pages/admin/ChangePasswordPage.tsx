import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ChangePasswordPage() {
  usePageTitle("Change Password");
  return (
    <AdminLayout pageContext={{ page: "change_password" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        <Card className="p-5">
          <p className="text-sm text-gray-500 mb-4">Password change functionality will be available in a future update. For now, use the admin seed script to reset passwords.</p>
          <code className="text-xs bg-gray-50 px-3 py-2 rounded block text-gray-600">
            npx tsx server/scripts/seed-admin.ts your@email.com newpassword
          </code>
        </Card>
      </div>
    </AdminLayout>
  );
}
