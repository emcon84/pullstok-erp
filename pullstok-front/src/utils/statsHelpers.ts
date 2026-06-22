export type PeriodFilter = "daily" | "weekly" | "monthly" | "yearly";

export interface DateRange {
  start: Date;
  end: Date;
}

interface ItemWithCreatedAt {
  createdAt?: string | Date;
  totalAmount?: number;
  relatedDocument?: {
    totalAmount?: number;
  };
}

export const getDateRange = (period: PeriodFilter): DateRange => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case "monthly":
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "yearly":
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end: now };
};

export const filterByDateRange = <T extends ItemWithCreatedAt>(
  items: T[],
  range: DateRange,
): T[] => {
  return items.filter((item) => {
    if (!item.createdAt) return false;
    const itemDate = new Date(item.createdAt);
    return itemDate >= range.start && itemDate <= range.end;
  });
};

export const groupByPeriod = <T extends ItemWithCreatedAt>(
  items: T[],
  period: PeriodFilter,
): Record<string, T[]> => {
  const grouped: Record<string, T[]> = {};

  items.forEach((item) => {
    if (!item.createdAt) return;
    const date = new Date(item.createdAt);
    let key: string;

    switch (period) {
      case "daily":
        key = date.toISOString().split("T")[0]; // YYYY-MM-DD
        break;
      case "weekly": {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split("T")[0];
        break;
      }
      case "monthly":
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "yearly":
        key = String(date.getFullYear());
        break;
    }

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  return grouped;
};

export const calculateTotalAmount = <T extends ItemWithCreatedAt>(
  items: T[],
): number => {
  return items.reduce((sum, item) => {
    // Para receipts, obtener el total del documento relacionado
    if (item.relatedDocument?.totalAmount) {
      return sum + item.relatedDocument.totalAmount;
    }
    // Para otros tipos
    return sum + (item.totalAmount || 0);
  }, 0);
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatPeriodLabel = (
  key: string,
  period: PeriodFilter,
): string => {
  switch (period) {
    case "daily":
      return new Date(key).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      });
    case "weekly":
      return `Semana ${new Date(key).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      })}`;
    case "monthly": {
      const [year, month] = key.split("-");
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(
        "es-ES",
        {
          month: "long",
          year: "numeric",
        },
      );
    }
    case "yearly":
      return key;
  }
};
