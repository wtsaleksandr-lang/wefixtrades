import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Smartphone, ExternalLink, Camera, Video } from "lucide-react";

const ANDROID_PUBLIC_KEY =
  (import.meta.env.VITE_APPETIZE_PUBLIC_KEY_ANDROID as string | undefined) ||
  "tok_ibheyws7qdsa2zyfklx2vyjbl4";
const IOS_PUBLIC_KEY = import.meta.env.VITE_APPETIZE_PUBLIC_KEY_IOS as string | undefined;

type Platform = "android" | "ios";

function buildEmbedUrl(platform: Platform, publicKey: string): string {
  const params = new URLSearchParams({
    device: platform === "android" ? "pixel7" : "iphone15pro",
    osVersion: platform === "android" ? "14.0" : "17.5",
    scale: "75",
    autoplay: "false",
    deviceColor: "black",
    orientation: "portrait",
  });
  return `https://appetize.io/embed/${publicKey}?${params.toString()}`;
}

function SetupInstructions({ platform }: { platform: Platform }) {
  const envVar = platform === "android" ? "VITE_APPETIZE_PUBLIC_KEY_ANDROID" : "VITE_APPETIZE_PUBLIC_KEY_IOS";
  const appName = platform === "android" ? "Android APK" : "iOS IPA";
  const artifactPath = platform === "android"
    ? "wtsaleksandr-lang/wefixtrades-softphone → Actions → Android APK build → latest run → android-apk artifact"
    : "wtsaleksandr-lang/wefixtrades-softphone → Actions → iOS build + TestFlight → latest run → ios-ipa artifact";

  return (
    <Card className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Smartphone className="w-6 h-6 text-gray-400" />
        <h3 className="text-base font-semibold text-gray-900">Appetize.io setup needed for {platform === "android" ? "Android" : "iOS"}</h3>
      </div>
      <ol className="space-y-3 text-sm text-gray-600 list-decimal list-inside">
        <li>Sign up free at <a href="https://appetize.io/signup" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">appetize.io <ExternalLink className="w-3 h-3" /></a> (100 min/month, no credit card)</li>
        <li>Download the {appName} from GitHub Actions: <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">{artifactPath}</span></li>
        <li>In Appetize dashboard → <b>Upload App</b> → drop the file → copy the <b>publicKey</b> from the app's settings page</li>
        <li>Set <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">{envVar}</span> in your Replit Secrets (or <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded">.env</span> for local dev) to that publicKey</li>
        <li>Redeploy. The iframe will render here.</li>
      </ol>
      <p className="text-xs text-gray-400 mt-5">publicKey is non-secret — it's literally embedded in the iframe URL. Safe to commit if you prefer hardcoding over env vars.</p>
    </Card>
  );
}

function MarketingHelper({ platform }: { platform: Platform }) {
  return (
    <Card className="p-5 mt-4 max-w-3xl mx-auto bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Camera className="w-4 h-4 text-amber-600" /> Marketing Capture Tips
      </h4>
      <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
        <div>
          <p className="font-medium text-gray-700 mb-1.5">For App Store / Play Store screenshots:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>OS-level screenshot of the iframe (Win+Shift+S / Cmd+Shift+4)</li>
            <li>Crop to phone bezel only</li>
            <li>{platform === "android" ? "Play Store wants 1080×1920 (or 1080×2400)" : "App Store wants 1290×2796 (6.7\") + 1242×2688 (6.5\")"}</li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-gray-700 mb-1.5">For demo videos:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Use Loom or OS screen recorder on the iframe area</li>
            <li>Keep under 30s for store preview videos</li>
            <li>{platform === "android" ? "Play Store: max 30s, 1080p" : "App Store: max 30s, 1290×2796 portrait"}</li>
          </ul>
        </div>
      </div>
      <p className="text-xs text-amber-700 mt-3 flex items-start gap-1.5">
        <Video className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Better long-term: <span className="font-mono">fastlane snapshot</span> (iOS) + <span className="font-mono">gradle screengrab</span> (Android) generate all required sizes in CI. Worth setting up once you're closer to submission.</span>
      </p>
    </Card>
  );
}

export default function AppetizeEmbed() {
  const [platform, setPlatform] = useState<Platform>("android");
  const publicKey = platform === "android" ? ANDROID_PUBLIC_KEY : IOS_PUBLIC_KEY;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mobile App — Live Preview</h2>
          <p className="text-xs text-gray-500 mt-0.5">Real build running in browser via Appetize.io. Touch + scroll + navigate. Backend API calls hit production normally.</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button type="button" onClick={() => setPlatform("android")} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${platform === "android" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Android</button>
          <button type="button" onClick={() => setPlatform("ios")} className={`px-3 py-1 rounded text-xs font-medium transition-colors ${platform === "ios" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>iOS</button>
        </div>
      </div>

      <Card className="bg-amber-50/40 border-amber-200 px-4 py-2.5 text-xs text-amber-900">
        <span className="font-medium">Heads up:</span> Twilio Voice calls + Apple Push won't work in the emulator (no phone radio / APNs). UI, navigation, AI assistant, login, and image attachments all work normally.
      </Card>

      {publicKey ? (
        <div className="flex justify-center">
          <iframe
            key={platform}
            src={buildEmbedUrl(platform, publicKey)}
            title={`${platform} app preview`}
            className="border border-gray-200 rounded-2xl shadow-lg"
            style={{ width: 320, height: 680 }}
            allow="camera; microphone; geolocation"
          />
        </div>
      ) : (
        <SetupInstructions platform={platform} />
      )}

      <MarketingHelper platform={platform} />
    </div>
  );
}
