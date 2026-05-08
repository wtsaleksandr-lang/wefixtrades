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
        background: mkt.sectionLight,
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
          className={"wft-interactive " + innerClassName}
          style={{
            position: "relative",
            borderRadius: 20,
            overflow: "hidden",
            background: mkt.sectionLight,
            border: `1px solid ${mkt.cardBorder}`,
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
