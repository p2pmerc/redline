import type { ReactNode } from "react";
import { WarningOctagon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: IconComponent, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-6 py-14 text-center shadow-surface-1">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
        <IconComponent size={22} />
      </div>
      <h3 className="text-title font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-body text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={WarningOctagon}
      title="Something went wrong"
      description={message}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    />
  );
}
