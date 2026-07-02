import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight theme-heading">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("min-w-0 px-6 py-5", className)}>{children}</div>;
}
