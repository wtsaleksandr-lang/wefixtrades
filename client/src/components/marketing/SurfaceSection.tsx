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
            "relative rounded-[18px] sm:rounded-[22px] bg-white border border-[#E5E7EB] shadow-[var(--shadow-card)] overflow-hidden wft-interactive " +
            innerClassName
          }
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.90),rgba(255,255,255,0))]" />
          <div className="p-6 sm:p-10">{children}</div>
        </div>
      </div>
    </section>
  );
}
