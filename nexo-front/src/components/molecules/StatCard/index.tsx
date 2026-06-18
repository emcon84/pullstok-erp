import React from "react";
import { Title } from "../../atoms/title";
import { Text } from "../../atoms/text";
import "./index.css";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color: "primary" | "secondary" | "success" | "warning" | "info" | "error";
  onClick?: () => void;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  onClick,
  loading = false,
}) => {
  return (
    <div
      className={`stat-card stat-card--${color} ${onClick ? "stat-card--clickable" : ""}`}
      onClick={onClick}
    >
      <div className="stat-card__header">
        <Title level={4} className="stat-card__title">
          {title}
        </Title>
        {icon && <div className="stat-card__icon">{icon}</div>}
      </div>
      <div className="stat-card__content">
        {loading ? (
          <div className="stat-card__loading">Cargando...</div>
        ) : (
          <>
            <Text type="p" className="stat-card__value">
              {value}
            </Text>
            {subtitle && (
              <Text type="p" className="stat-card__subtitle">
                {subtitle}
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  );
};
