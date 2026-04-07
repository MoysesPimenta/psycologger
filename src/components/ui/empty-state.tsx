import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      icon,
      title,
      description,
      action,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center min-h-96 px-4 py-12 text-center",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-muted p-3 text-muted-foreground">
            {icon}
          </div>
        )}

        <h2 className="text-lg font-semibold text-foreground mb-2">
          {title}
        </h2>

        {description && (
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {description}
          </p>
        )}

        {action && (
          <div className="mt-4">
            {action}
          </div>
        )}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
