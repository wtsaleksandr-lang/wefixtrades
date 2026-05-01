import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

interface UserSettings {
  businessName: string;
  contactEmail: string;
  timezone: string;
  emailNotifications: boolean;
  weeklyReports: boolean;
  aiAssistantEnabled: boolean;
}

const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function SettingsPage() {
  usePageTitle("Settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ settings: UserSettings }>({
    queryKey: ["/api/user/settings"],
  });

  const [form, setForm] = useState<UserSettings>({
    businessName: "",
    contactEmail: "",
    timezone: "Europe/London",
    emailNotifications: true,
    weeklyReports: true,
    aiAssistantEnabled: true,
  });

  useEffect(() => {
    if (data?.settings) {
      setForm(data.settings);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (settings: UserSettings) => {
      const res = await apiRequest("PATCH", "/api/user/settings", settings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Could not save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const updateField = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <AdminLayout pageContext={{ page: "settings" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Account Settings</h2>

        {/* Business Info */}
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Business Information</h3>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="settings-business-name">Business Name</Label>
              <Input
                id="settings-business-name"
                value={form.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                placeholder="Your business name"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-contact-email">Contact Email</Label>
              <Input
                id="settings-contact-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
                placeholder="contact@yourbusiness.com"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-timezone">Timezone</Label>
              <Select
                value={form.timezone}
                onValueChange={(v) => updateField("timezone", v)}
                disabled={isLoading}
              >
                <SelectTrigger id="settings-timezone">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Notification Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Email Notifications</p>
                <p className="text-xs text-gray-400">Receive email alerts for new leads, tasks, and updates</p>
              </div>
              <Switch
                checked={form.emailNotifications}
                onCheckedChange={(v) => updateField("emailNotifications", v)}
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Weekly Reports</p>
                <p className="text-xs text-gray-400">Get a weekly summary of activity and performance</p>
              </div>
              <Switch
                checked={form.weeklyReports}
                onCheckedChange={(v) => updateField("weeklyReports", v)}
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">AI Assistant</p>
                <p className="text-xs text-gray-400">Enable AI-powered automation and suggestions</p>
              </div>
              <Switch
                checked={form.aiAssistantEnabled}
                onCheckedChange={(v) => updateField("aiAssistantEnabled", v)}
                disabled={isLoading}
              />
            </div>
          </div>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
