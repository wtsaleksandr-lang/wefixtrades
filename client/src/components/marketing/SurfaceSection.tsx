import { mkt } from "@/theme/tokens";

export function SurfaceSection({
  children,
  className = "",
  innerClassName = "",
  overlap = false,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  overlap?: boolean;
}) {
  return (
    <section
      style={{
        width: "100%",
        /* Vibrant gradient backdrop so the glass inner panel refracts a
         * subtle accent-blue → violet/cyan wash. Reuses the brand accent
         * (#0d3cfc) + a violet/cyan secondary, over the dark sectionLight. */
        background: `radial-gradient(120% 92% at 12% 0%, rgba(13,60,252,0.14) 0%, rgba(13,60,252,0.04) 40%, transparent 70%), radial-gradient(94% 84% at 90% 8%, rgba(124,58,237,0.12) 0%, rgba(6,182,212,0.06) 46%, transparent 76%), ${mkt.sectionLight}`,
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 6,
      }}
      className={className}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 20px",
        }}
      >
        <div
          className={"wft-interactive wft-glass-regular " + innerClassName}
          style={{
            position: "relative",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 10px 20px #33314833",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 40,
              pointerEvents: "none",
              background: "linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)",
            }}
          />
          <div style={{ padding: "24px 24px" }}>{children}</div>
        </div>
      </div>
    </section>
  );
}
