import React from "react";
import { motion } from "motion/react";
import { Link } from "wouter";

const transition = {
  type: "spring" as const,
  mass: 0.5,
  damping: 11.5,
  stiffness: 100,
  restDelta: 0.001,
  restSpeed: 0.001,
};

export const MenuItem = ({
  setActive,
  active,
  item,
  href,
  children,
}: {
  setActive: (item: string | null) => void;
  active: string | null;
  item: string;
  href?: string;
  children?: React.ReactNode;
}) => {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div onMouseEnter={() => setActive(item)} style={{ position: "relative" }}>
      {hasChildren ? (
        <motion.p
          transition={{ duration: 0.3 }}
          style={{
            cursor: "pointer",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
            padding: "5px 10px",
          }}
        >
          {item}
        </motion.p>
      ) : (
        <Link href={href || "#"}>
          <motion.p
            transition={{ duration: 0.3 }}
            style={{
              cursor: "pointer",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'DM Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
              padding: "5px 10px",
              textDecoration: "none",
            }}
          >
            {item}
          </motion.p>
        </Link>
      )}
      {active !== null && hasChildren && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={transition}
        >
          {active === item && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 1.2rem)",
                left: "50%",
                transform: "translateX(-50%)",
                paddingTop: 16,
              }}
            >
              <motion.div
                transition={transition}
                layoutId="active"
                style={{
                  background: "#0d1514",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  borderRadius: 16,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                <motion.div
                  layout
                  style={{
                    width: "max-content",
                    height: "100%",
                    padding: 16,
                  }}
                >
                  {children}
                </motion.div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export const Menu = ({
  setActive,
  children,
}: {
  setActive: (item: string | null) => void;
  children: React.ReactNode;
}) => {
  return (
    <nav
      onMouseLeave={() => setActive(null)}
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
      }}
    >
      {children}
    </nav>
  );
};

export const ProductItem = ({
  title,
  description,
  href,
  src,
}: {
  title: string;
  description: string;
  href: string;
  src: string;
}) => {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        gap: 8,
        textDecoration: "none",
      }}
    >
      <img
        src={src}
        width={140}
        height={70}
        alt={title}
        style={{
          flexShrink: 0,
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      />
      <div>
        <h4
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 4,
            color: "#ffffff",
            margin: 0,
          }}
        >
          {title}
        </h4>
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: 14,
            maxWidth: "10rem",
            margin: 0,
          }}
        >
          {description}
        </p>
      </div>
    </a>
  );
};

export const HoveredLink = ({
  children,
  href,
  ...rest
}: {
  children: React.ReactNode;
  href: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  return (
    <Link
      href={href}
      {...(rest as any)}
      style={{
        color: "rgba(255,255,255,0.6)",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 500,
        padding: "6px 10px",
        borderRadius: 8,
        display: "block",
        transition: "color 0.15s ease, background 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "#00D4C8";
        el.style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "rgba(255,255,255,0.6)";
        el.style.background = "transparent";
      }}
    >
      {children}
    </Link>
  );
};
