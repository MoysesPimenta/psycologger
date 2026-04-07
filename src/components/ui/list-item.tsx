import * as React from "react";
import { cn } from "@/lib/utils";

export interface ListItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  variant?: "default" | "destructive" | "muted";
  hasDivider?: boolean;
}

const ListItem = React.forwardRef<HTMLButtonElement, ListItemProps>(
  (
    {
      className,
      icon,
      title,
      subtitle,
      trailing,
      disabled = false,
      variant = "default",
      hasDivider = true,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      default: "text-foreground hover:bg-muted active:bg-muted/75",
      destructive: "text-destructive hover:bg-destructive/10 active:bg-destructive/20",
      muted: "text-muted-foreground hover:bg-muted active:bg-muted/75",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          hasDivider && "border-b border-border/50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          className
        )}
        {...props}
      >
        {icon && (
          <div className="flex-shrink-0 flex items-center justify-center">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{title}</div>
          {subtitle && (
            <div className="text-sm text-muted-foreground truncate">{subtitle}</div>
          )}
        </div>
        {trailing && (
          <div className="flex-shrink-0 flex items-center justify-center">
            {trailing}
          </div>
        )}
      </button>
    );
  }
);
ListItem.displayName = "ListItem";

export { ListItem };
