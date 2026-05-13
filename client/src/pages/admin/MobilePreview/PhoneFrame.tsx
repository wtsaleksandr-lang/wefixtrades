/**
 * iPhone / Android phone frame components for the admin mobile-preview
 * route. Pure CSS — no real device chrome, just a stylised bezel + screen
 * area that the preview screens render inside.
 *
 * Phase 5 from the original spec: lets Alex (and investors) click
 * through the softphone UI without an actual device or simulator.
 */

import { type ReactNode } from "react";

const IPHONE_WIDTH = 380;
const IPHONE_HEIGHT = 780;
const ANDROID_WIDTH = 380;
const ANDROID_HEIGHT = 780;

interface FrameProps {
  variant: "iphone" | "android";
  children: ReactNode;
}

export function PhoneFrame({ variant, children }: FrameProps) {
  if (variant === "iphone") return <IPhoneFrame>{children}</IPhoneFrame>;
  return <AndroidFrame>{children}</AndroidFrame>;
}

function IPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative bg-gray-900 rounded-[44px] shadow-2xl p-3"
      style={{ width: IPHONE_WIDTH, height: IPHONE_HEIGHT }}
    >
      {/* Outer ring highlight */}
      <div className="absolute inset-0 rounded-[44px] ring-1 ring-gray-700/40 pointer-events-none" />
      {/* Screen */}
      <div className="relative w-full h-full rounded-[36px] overflow-hidden bg-[#F9FAFB]">
        {/* Dynamic Island */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[120px] h-[32px] bg-black rounded-full z-50" />
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 h-[46px] flex items-center justify-between px-7 text-[11px] font-semibold text-gray-900 z-40 pt-3">
          <span>9:41</span>
          <span className="absolute left-1/2 -translate-x-1/2 invisible">spacer</span>
          <span className="flex items-center gap-1">
            <span className="opacity-90">●●●●</span>
            <span className="opacity-70">5G</span>
            <span className="ml-1">▮▮</span>
          </span>
        </div>
        {/* Content */}
        <div className="absolute top-[46px] left-0 right-0 bottom-0 overflow-hidden">
          {children}
        </div>
        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-gray-900 rounded-full z-50" />
      </div>
    </div>
  );
}

function AndroidFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative bg-gray-800 rounded-[28px] shadow-2xl p-2"
      style={{ width: ANDROID_WIDTH, height: ANDROID_HEIGHT }}
    >
      <div className="absolute inset-0 rounded-[28px] ring-1 ring-gray-600/40 pointer-events-none" />
      <div className="relative w-full h-full rounded-[20px] overflow-hidden bg-[#F9FAFB]">
        {/* Punch-hole camera */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[14px] h-[14px] bg-black rounded-full z-50" />
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 h-[32px] flex items-center justify-between px-5 text-[11px] font-medium text-gray-900 z-40 pt-1.5">
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <span className="opacity-80">5G</span>
            <span>▮▮</span>
          </span>
        </div>
        {/* Content */}
        <div className="absolute top-[32px] left-0 right-0 bottom-0 overflow-hidden">
          {children}
        </div>
        {/* Soft nav bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[20px] bg-white flex items-center justify-center gap-12 z-50 border-t border-gray-200">
          <div className="w-[14px] h-[14px] border border-gray-500 rounded-sm rotate-45" />
          <div className="w-[14px] h-[14px] rounded-full bg-gray-500" />
          <div className="w-[18px] h-[2px] bg-gray-500" />
        </div>
      </div>
    </div>
  );
}
