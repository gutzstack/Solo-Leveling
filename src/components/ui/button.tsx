import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-display text-xs uppercase tracking-[0.14em] transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-sky-500/90 to-violet-500/90 text-white shadow-[0_0_18px_-4px_var(--glow)] hover:shadow-[0_0_26px_-2px_var(--glow)] hover:brightness-110 border border-sky-300/40",
        outline: "border border-line bg-panel/40 text-fg hover:border-line-strong hover:bg-accent/10 hover:shadow-[0_0_16px_-6px_var(--glow)]",
        ghost: "text-dim hover:text-fg hover:bg-accent/10",
        danger: "border border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 light:text-red-800",
        success: "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 light:text-emerald-800",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[10px]",
        lg: "h-12 px-6 text-sm",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
