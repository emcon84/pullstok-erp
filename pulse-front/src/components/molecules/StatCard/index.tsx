import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type StatColor = "success" | "primary" | "warning" | "info";

const colorMap: Record<StatColor, string> = {
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  primary: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  warning: "bg-amber-50 text-amber-600 ring-amber-100",
  info: "bg-sky-50 text-sky-600 ring-sky-100",
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color?: StatColor;
  onClick?: () => void;
  loading?: boolean;
}

export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  color = "primary",
  onClick,
  loading,
}: StatCardProps) => {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-5 transition-all",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
          )}
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 [&>svg]:h-5 [&>svg]:w-5",
            colorMap[color],
          )}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
};
