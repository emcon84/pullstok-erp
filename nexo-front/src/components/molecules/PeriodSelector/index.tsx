import { PeriodFilter } from "../../../utils/statsHelpers";
import { cn } from "@/lib/utils";

interface PeriodSelectorProps {
  selected: PeriodFilter;
  onChange: (period: PeriodFilter) => void;
}

const periods: { value: PeriodFilter; label: string }[] = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "yearly", label: "Anual" },
];

export const PeriodSelector = ({ selected, onChange }: PeriodSelectorProps) => {
  return (
    <div className="inline-grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
      {periods.map((period) => (
        <button
          key={period.value}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            selected === period.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(period.value)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};
