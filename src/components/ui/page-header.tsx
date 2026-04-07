"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
  sticky?: boolean;
  collapsible?: boolean;
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  (
    {
      className,
      title,
      subtitle,
      backHref,
      onBack,
      trailing,
      sticky = false,
      collapsible = false,
      ...props
    },
    ref
  ) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    React.useEffect(() => {
      if (!collapsible) return;

      const handleScroll = () => {
        setIsCollapsed(window.scrollY > 0);
      };

      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }, [collapsible]);

    const handleBackClick = () => {
      if (onBack) {
        onBack();
      } else if (backHref) {
        window.location.href = backHref;
      } else {
        window.history.back();
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "safe-px safe-pt bg-background",
          sticky && "sticky top-0 z-40 border-b border-border/50",
          collapsible && "transition-all duration-200",
          isCollapsed && "py-2",
          !isCollapsed && "py-4",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-3">
          {(backHref || onBack) && (
            <button
              onClick={handleBackClick}
              className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-muted active:bg-muted/75 transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1
              className={cn(
                "font-bold tracking-tight truncate transition-all duration-200",
                isCollapsed ? "text-lg" : "text-2xl"
              )}
            >
              {title}
            </h1>
            {subtitle && !isCollapsed && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>

          {trailing && (
            <div className="flex-shrink-0 flex items-center gap-2">
              {trailing}
            </div>
          )}
        </div>
      </div>
    );
  }
);
PageHeader.displayName = "PageHeader";

export { PageHeader };
