import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface StatsChartProps {
  data: ChartData[];
  title?: string;
  dataKey?: string;
  color?: string;
  height?: number;
}

export const StatsChart = ({
  data,
  title,
  dataKey = "value",
  color = "#6366f1",
  height = 300,
}: StatsChartProps) => {
  return (
    <div>
      {title && (
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          {title}
        </h3>
      )}
      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No hay datos para el período seleccionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#94a3b8"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: "12px" }}
            />
            <YAxis
              stroke="#94a3b8"
              tickLine={false}
              axisLine={false}
              style={{ fontSize: "12px" }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                fontSize: "13px",
              }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2.5}
              dot={{ fill: color, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
