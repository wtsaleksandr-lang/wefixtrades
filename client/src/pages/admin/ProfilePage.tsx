import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Loader2, Save, AlertCircle, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function ProfilePage() {
  usePageTitle("Profile");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isEditing, setIsEditing] = useState(false);

  const updateProfile = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const res = await apiRequest("PATCH", "/api/user/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setIsEditing(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: (err: Error) => {
      const msg = err.message.includes("409")
        ? "That email is already in use by another account."
        : "Failed to update profile. Please try again.";
      toast({
        title: "Update failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Please enter your name.", variant: "destructive" });
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast({ title: "Valid email required", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    updateProfile.mutate({ name: name.trim(), email: email.trim() });
  };

  const handleCancel = () => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setIsEditing(false);
  };

  /* Phase 1c: register the profile edit form with the copilot. The name/
   * email inputs only render in edit mode, so registration is gated on
   * isEditing. */
  useCopilotForm({
    formLabel: "Profile",
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email address", required: true },
    ],
    values: { name, email },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "name") setName(f.value);
        else if (f.field_key === "email") setEmail(f.value);
      }
    },
    enabled: isEditing,
  });

  return (
    <AdminLayout pageContext={{ page: "profile" }}>
      <div data-theme="light" className="max-w-2xl mx-auto space-y-4">
        <Link
          href="/admin/crm"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          data-testid="back-to-admin"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to admin
        </Link>
        <h2 className="text-lg font-semibold text-gray-900">Profile</h2>

        {/* Avatar + display info */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0d3cfc] flex items-center justify-center">
              <span className="text-white text-xl font-bold">
                {(user?.name || user?.email || "A").charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{user?.name || "Admin"}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">Role: {user?.role || "admin"}</p>
            </div>
          </div>
        </Card>

        {/* Edit form */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Edit Profile</h3>
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={updateProfile.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email Address</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={updateProfile.isPending}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button variant="ghost" onClick={handleCancel} disabled={updateProfile.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Full Name</p>
                <p className="text-sm text-gray-700">{user?.name || "Not set"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Email Address</p>
                <p className="text-sm text-gray-700">{user?.email || "Not set"}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
