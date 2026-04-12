import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Loader2, Check, RefreshCw, KeyRound } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

interface SettingsData {
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  trade_type: string | null;
  account_email: string | null;
}

export default function PortalSettings() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<SettingsData>({
    queryKey: ["/api/portal/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    website_url: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        contact_name: data.contact_name || "",
        contact_email: data.contact_email || "",
        contact_phone: data.contact_phone || "",
        website_url: data.website_url || "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      const res = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const labelClass = "block text-xs font-medium text-gray-600 mb-1";
  const inputClass =
    "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] transition-colors";

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your contact information.</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>Failed to load settings.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Account info (read-only) */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Account</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Business Name</p>
                  <p className="text-gray-900 font-medium">{data.business_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Login Email</p>
                  <p className="text-gray-900">{data.account_email || "-"}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Used to sign in — contact us to change</p>
                </div>
                {data.trade_type && (
                  <div>
                    <p className="text-xs text-gray-500">Trade</p>
                    <p className="text-gray-900 capitalize">{data.trade_type}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Contact info (editable) */}
            <form onSubmit={handleSubmit}>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Contact Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Contact Name</label>
                    <input
                      className={inputClass}
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Contact Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      className={inputClass}
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Website</label>
                    <input
                      className={inputClass}
                      value={form.website_url}
                      onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
                  >
                    {saveMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                  {saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                  {saveMutation.error && (
                    <span className="text-xs text-red-600">Failed to save. Try again.</span>
                  )}
                </div>
              </div>
            </form>

            {/* Change Password */}
            <ChangePasswordSection inputClass={inputClass} labelClass={labelClass} />
          </>
        )}
      </div>
    </PortalLayout>
  );
}

/* ─── Change Password Section ─── */
function ChangePasswordSection({ inputClass, labelClass }: { inputClass: string; labelClass: string }) {
  const [pw, setPw] = useState({ current: "", new_password: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  const pwMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: pw.current,
          new_password: pw.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      return data;
    },
    onSuccess: () => {
      setPw({ current: "", new_password: "", confirm: "" });
      setPwError("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    },
    onError: (err: Error) => {
      setPwError(err.message);
    },
  });

  function handlePwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");

    if (pw.new_password.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (pw.new_password !== pw.confirm) {
      setPwError("New passwords don't match.");
      return;
    }

    pwMutation.mutate();
  }

  return (
    <form onSubmit={handlePwSubmit}>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Change Password</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Current Password</label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelClass}>New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputClass}
              value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
              required
              minLength={8}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm New Password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pwMutation.isPending || !pw.current || !pw.new_password || !pw.confirm}
            className="px-4 py-2 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
          >
            {pwMutation.isPending ? "Updating..." : "Update Password"}
          </button>
          {pwSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Password updated
            </span>
          )}
          {pwError && (
            <span className="text-xs text-red-600">{pwError}</span>
          )}
        </div>
      </div>
    </form>
  );
}
