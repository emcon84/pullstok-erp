import React from "react";
import { PeriodFilter } from "../../../utils/statsHelpers";
import "./index.css";

interface PeriodSelectorProps {
  selected: PeriodFilter;
  onChange: (period: PeriodFilter) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selected,
  onChange,
}) => {
  const periods: { value: PeriodFilter; label: string }[] = [
    { value: "daily", label: "Diario" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensual" },
    { value: "yearly", label: "Anual" },
  ];

  return (
    <div className="period-selector">
      {periods.map((period) => (
        <button
          key={period.value}
          className={`period-selector__button ${
            selected === period.value ? "period-selector__button--active" : ""
          }`}
          onClick={() => onChange(period.value)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};
