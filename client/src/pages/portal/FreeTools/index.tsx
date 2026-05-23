import { Link } from "wouter";
import {
  FileCode2,
  HelpCircle,
  Clock,
  ShieldCheck,
  MapPin,
  PhoneCall,
  Star,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * Free Tools — foundation wave.
 *
 * The index renders a card grid of every planned free tool. Only the
 * Schema Generator is live in v1; the remaining 6 cards from the
 * brainstorm short-list render as "coming soon" placeholders so customers
 * can see the trajectory.
 *
 * This page is read-only — no editable form fields, so it lives on the
 * scripts/copilot-form-exempt.txt list.
 */

type ToolStatus = "available" | "coming-soon";

interface Tool {
  slug: string;
  title: string;
  description: string;
  icon: React.ElementType;
  status: ToolStatus;
  href?: string;
}

const TOOLS: Tool[] = [
  {
    slug: "schema",
    title: "Local Business Schema",
    description:
      "Generate Google-friendly JSON-LD markup. Paste once, ranks forever.",
    icon: FileCode2,
    status: "available",
    href: "/portal/free-tools/schema",
  },
  {
    slug: "faq",
    title: "FAQ Widget",
    description:
      "Embed a styled accordion of Q&As with SEO schema baked in.",
    icon: HelpCircle,
    status: "available",
    href: "/portal/free-tools/faq",
  },
  {
    slug: "hours",
    title: "Hours Block",
    description:
      "Drop-in business hours panel — auto-shows open/closed status.",
    icon: Clock,
    status: "available",
    href: "/portal/free-tools/hours",
  },
  {
    slug: "trust-badges",
    title: "Trust Badges",
    description:
      "Licensed, insured, BBB-style badges that build instant credibility.",
    icon: ShieldCheck,
    status: "available",
    href: "/portal/free-tools/trust-badges",
  },
  {
    slug: "service-area-map",
    title: "Service Area Map",
    description:
      "Embed a styled map of the postal codes you cover — no Google account needed.",
    icon: MapPin,
    status: "coming-soon",
  },
  {
    slug: "callback",
    title: "Callback Request",
    description:
      "One-tap callback button — captures lead even when you're on the truck.",
    icon: PhoneCall,
    status: "coming-soon",
  },
  {
    slug: "review-link",
    title: "Review Link Generator",
    description:
      "Short, branded link that sends customers straight to your Google review form.",
    icon: Star,
    status: "coming-soon",
  },
];

export default function FreeToolsIndex() {
  usePageTitle("Free Tools");
  return (
    <PortalLayout breadcrumb="Free Tools">
      <div data-theme="light" className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Free Tools</h1>
          <p className="text-sm text-gray-600">
            Valuable add-ons for your site — yours to use, no upgrade required.
          </p>
        </header>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr"
          data-testid="free-tools-grid"
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const available = tool.status === "available";
            return (
              <Card
                key={tool.slug}
                className={cn("relative", !available && "opacity-60")}
                data-testid={`free-tool-card-${tool.slug}`}
              >
                <CardContent className="p-5 flex flex-col h-full">
                  <Icon
                    className="w-5 h-5 text-gray-400 absolute top-3 right-3"
                    aria-hidden="true"
                  />
                  <h3 className="font-semibold text-gray-900 mb-1 pr-8">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 flex-1">
                    {tool.description}
                  </p>
                  {available && tool.href ? (
                    <Button asChild className="btn-primary-premium self-start">
                      <Link href={tool.href}>Open</Link>
                    </Button>
                  ) : (
                    <span className="inline-block self-start text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                      Coming soon
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PortalLayout>
  );
}
