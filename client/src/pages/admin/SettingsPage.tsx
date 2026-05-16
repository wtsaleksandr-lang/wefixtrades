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
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Loader2, Save, Shield, ShieldCheck, ShieldOff, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

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

  /* Phase 1c: register the account settings form with the copilot.
   * Booleans are coerced from "true"/"false"; timezone is validated
   * against the allowed list. */
  useCopilotForm({
    formLabel: "Account settings",
    fields: [
      { key: "businessName", label: "Business name" },
      { key: "contactEmail", label: "Contact email" },
      { key: "timezone", label: `Timezone (one of: ${TIMEZONES.join(", ")})` },
      { key: "emailNotifications", label: "Email notifications (true | false)" },
      { key: "weeklyReports", label: "Weekly reports (true | false)" },
      { key: "aiAssistantEnabled", label: "AI assistant enabled (true | false)" },
    ],
    values: form as unknown as Record<string, unknown>,
    onApply: (fills) => {
      setForm((prev) => {
        const next = { ...prev };
        for (const f of fills) {
          switch (f.field_key) {
            case "businessName": next.businessName = f.value; break;
            case "contactEmail": next.contactEmail = f.value; break;
            case "timezone":
              if (TIMEZONES.includes(f.value)) next.timezone = f.value;
              break;
            case "emailNotifications":
            case "weeklyReports":
            case "aiAssistantEnabled":
              if (f.value === "true" || f.value === "false") {
                next[f.field_key] = f.value === "true";
              }
              break;
          }
        }
        return next;
      });
    },
    enabled: !!data,
  });

  return (
    <AdminLayout pageContext={{ page: "settings" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href="/admin/crm"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
          data-testid="back-to-admin"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to admin
        </Link>
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

        {/* AI Customer Service — per-channel kill switches */}
        <AiChannelSettingsSection />

        {/* Two-Factor Authentication */}
        <TwoFactorSection />

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

/* ─── Two-Factor Authentication Section ─── */

function TwoFactorSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setupState, setSetupState] = useState<"idle" | "pending" | "verify">("idle");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const { data: statusData, isLoading: statusLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/user/2fa/status"],
  });

  const is2faEnabled = statusData?.enabled ?? false;

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/2fa/setup", {});
      return res.json();
    },
    onSuccess: (data: { otpauthUrl: string; secret: string }) => {
      setOtpauthUrl(data.otpauthUrl);
      setSecret(data.secret);
      setSetupState("verify");
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const verifySetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/2fa/verify-setup", { code: verifyCode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/2fa/status"] });
      setSetupState("idle");
      setOtpauthUrl("");
      setSecret("");
      setVerifyCode("");
      toast({ title: "2FA enabled", description: "Two-factor authentication is now active on your account." });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/2fa/disable", {
        password: disablePassword,
        code: disableCode,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/2fa/status"] });
      setShowDisable(false);
      setDisablePassword("");
      setDisableCode("");
      toast({ title: "2FA disabled", description: "Two-factor authentication has been removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to disable", description: err.message, variant: "destructive" });
    },
  });

  if (statusLoading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading security settings...
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-700">Two-Factor Authentication</h3>
      </div>

      {is2faEnabled && setupState === "idle" && !showDisable && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <ShieldCheck className="h-4 w-4" />
            Two-factor authentication is enabled
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDisable(true)}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable 2FA
          </Button>
        </div>
      )}

      {is2faEnabled && showDisable && (
        <div className="space-y-3 border border-red-200 rounded-lg p-4 bg-red-50/50">
          <p className="text-sm text-gray-600">
            To disable two-factor authentication, enter your current password and a verification code.
          </p>
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <div className="space-y-2">
            <Label>Verification Code</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={disableMutation.isPending || !disablePassword || disableCode.length !== 6}
              onClick={() => disableMutation.mutate()}
            >
              {disableMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Disable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowDisable(false);
                setDisablePassword("");
                setDisableCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!is2faEnabled && setupState === "idle" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Add an extra layer of security to your admin account with a time-based one-time password (TOTP).
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={setupMutation.isPending}
            onClick={() => setupMutation.mutate()}
          >
            {setupMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Enable Two-Factor Authentication
          </Button>
        </div>
      )}

      {!is2faEnabled && setupState === "verify" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Scan the QR code below with your authenticator app (Google Authenticator, Authy, 1Password, etc.),
            then enter the 6-digit code to confirm.
          </p>

          <div className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
                alt="TOTP QR Code"
                className="rounded"
                width={200}
                height={200}
              />
            </div>
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-600">
                Can't scan? Enter this key manually
              </summary>
              <code className="block mt-2 p-2 bg-gray-50 rounded text-xs font-mono break-all select-all">
                {secret}
              </code>
            </details>
          </div>

          <div className="space-y-2">
            <Label>Verification Code</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono tracking-widest max-w-[200px]"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={verifySetupMutation.isPending || verifyCode.length !== 6}
              onClick={() => verifySetupMutation.mutate()}
            >
              {verifySetupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify and Enable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSetupState("idle");
                setOtpauthUrl("");
                setSecret("");
                setVerifyCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── AI Customer Service — per-channel kill switches (Phase 3a) ─── */

interface AiChannelFlags {
  chat_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  voice_enabled: boolean;
}

const AI_CHANNELS: { key: keyof AiChannelFlags; label: string; description: string }[] = [
  { key: "chat_enabled", label: "Chat widget", description: "AI replies in the client portal chat assistant." },
  { key: "email_enabled", label: "Email", description: "AI handling of customer support email." },
  { key: "sms_enabled", label: "SMS", description: "AI handling of customer support text messages." },
  { key: "voice_enabled", label: "Voice calls", description: "AI handling of inbound voice calls." },
];

function AiChannelSettingsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ settings: AiChannelFlags }>({
    queryKey: ["/api/admin/ai-channel-settings"],
  });

  const toggleMutation = useMutation({
    mutationFn: async (patch: Partial<AiChannelFlags>) => {
      const res = await apiRequest("PATCH", "/api/admin/ai-channel-settings", patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-channel-settings"] });
      toast({ title: "AI channel updated" });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not change the AI channel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const flags = data?.settings;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">AI Customer Service</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Pause AI responses on any channel. Changes take effect immediately.
        </p>
      </div>
      <div className="space-y-4">
        {AI_CHANNELS.map((ch) => (
          <div key={ch.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">{ch.label}</p>
              <p className="text-xs text-gray-400">{ch.description}</p>
            </div>
            <Switch
              checked={flags?.[ch.key] ?? true}
              onCheckedChange={(v) => toggleMutation.mutate({ [ch.key]: v })}
              disabled={isLoading || toggleMutation.isPending}
              data-testid={`ai-channel-${ch.key}`}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
