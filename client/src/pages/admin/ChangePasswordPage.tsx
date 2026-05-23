import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, AlertCircle, ChevronLeft, HelpCircle } from "lucide-react";
import { Link } from "wouter";

export default function ChangePasswordPage() {
  usePageTitle("Change Password");
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!currentPassword) errs.currentPassword = "Current password is required";
    if (!newPassword) errs.newPassword = "New password is required";
    else if (newPassword.length < 8) errs.newPassword = "Must be at least 8 characters";
    if (!confirmPassword) errs.confirmPassword = "Please confirm your new password";
    else if (newPassword !== confirmPassword) errs.confirmPassword = "Passwords do not match";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const changePw = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/user/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("401")
        ? "Current password is incorrect."
        : "Failed to change password. Please try again.";
      toast({
        title: "Password change failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    changePw.mutate({ currentPassword, newPassword });
  };

  return (
    <AdminLayout pageContext={{ page: "change_password" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href="/admin/crm/profile"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          data-testid="back-to-profile"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to profile
        </Link>
        <div className="flex items-center gap-2">
          <span title="Use at least 8 characters. You'll need your current password to confirm the change." className="inline-flex"><HelpCircle className="w-3 h-3 text-gray-400 cursor-help" /></span>
          <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        </div>

        <Card className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, currentPassword: "" }));
                }}
                placeholder="Enter your current password"
                disabled={changePw.isPending}
                autoComplete="current-password"
              />
              {errors.currentPassword && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.currentPassword}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, newPassword: "" }));
                }}
                placeholder="At least 8 characters"
                disabled={changePw.isPending}
                autoComplete="new-password"
              />
              {errors.newPassword && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.newPassword}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, confirmPassword: "" }));
                }}
                placeholder="Re-enter your new password"
                disabled={changePw.isPending}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={changePw.isPending}>
                {changePw.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Change Password
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AdminLayout>
  );
}
