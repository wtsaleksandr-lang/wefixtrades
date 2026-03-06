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
    <section className={"w-full " + className}>
      <div
        className={
          "mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8 " +
          (overlap ? "-mt-5 sm:-mt-6" : "")
        }
      >
        <div
          className={
            "relative rounded-[20px] sm:rounded-[24px] overflow-hidden wft-interactive " +
            innerClassName
          }
          style={{
            background: mkt.surface,
            border: `1px solid ${mkt.cardBorder}`,
            boxShadow: "0 10px 20px #33314833",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-10"
            style={{
              background: `linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)`,
            }}
          />
          <div className="p-6 sm:p-10">{children}</div>
        </div>
      </div>
    </section>
  );
}
