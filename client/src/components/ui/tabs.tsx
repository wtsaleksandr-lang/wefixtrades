import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

/**
 * TabsList — outer wrapper for tab triggers. Subtle bottom border anchors
 * the row visually and makes the active-tab underline read clearly without
 * the heavy "pill in a muted strip" look the original Shadcn default had.
 *
 * Wave 48a: every TabsList scrolls horizontally on mobile when its triggers
 * would overflow the viewport (Alex's locked rule: "top navigation tabs on
 * mobile are all visible without scrolling" — when there are too many tabs
 * to fit, horizontal scroll is the fallback, *never* clipped/hidden). We use
 * `overflow-x-auto` + a hidden scrollbar (`[scrollbar-width:none]` and the
 * webkit equivalent) so the tab strip stays uncluttered while still allowing
 * touch/scroll-wheel access to off-screen tabs. `max-w-full` keeps the strip
 * from blowing out its parent. Grid-based callers (`grid grid-cols-N`) still
 * work — overflow-x-auto on a grid is a no-op when content fits.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 max-w-full items-center justify-center gap-1 overflow-x-auto border-b border-gray-200 text-muted-foreground [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

/**
 * TabsTrigger — neutral inactive, subtle border + tint on hover, prominent
 * brand-blue 2px underline + bolder text on active. 150ms transition for
 * smooth state changes. Negative bottom margin overlaps the TabsList's
 * border so the active underline sits flush.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative -mb-px inline-flex items-center justify-center whitespace-nowrap rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-gray-600 ring-offset-background transition-[color,background-color,border-color,font-weight] duration-150 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-brand-blue data-[state=active]:text-brand-blue data-[state=active]:font-semibold",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
