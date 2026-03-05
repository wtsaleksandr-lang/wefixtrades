import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 wft-interactive wft-press wft-focus",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border shadow-[var(--shadow-soft)] wft-lift wft-shimmer hover:shadow-[var(--glow-primary)]",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border shadow-[var(--shadow-soft)] wft-lift",
        outline:
          "border border-[#E5E7EB] bg-transparent shadow-xs wft-lift hover:bg-[#F1F3F6] hover:border-[#D1D5DB]",
        secondary: "border bg-secondary text-secondary-foreground border border-secondary-border wft-lift hover:bg-[#F1F3F6]",
        ghost: "border border-transparent hover:bg-[#F1F3F6]",
      },
      size: {
        default: "min-h-10 px-5 py-2.5",
        sm: "min-h-8 rounded-[8px] px-3 text-xs",
        lg: "min-h-11 rounded-[10px] px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
