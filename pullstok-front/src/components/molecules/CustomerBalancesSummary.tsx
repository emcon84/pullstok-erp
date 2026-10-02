import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CustomerBalance } from "../../models/customerAccountModel";
import { customerDisplayName } from "../../utils/customerName";
import { summarizeBalances } from "../../utils/summarizeBalances";

const money = (n: number) =>
  `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

interface Props {
  balances: CustomerBalance[];
  loading: boolean;
  onSelectCustomer: (customer: { customerId: string; name: string }) => void;
}

/** Company-wide account summary: how much is pending collection and who owes the most. */
export const CustomerBalancesSummary = ({ balances, loading, onSelectCustomer }: Props) => {
  const summary = useMemo(() => summarizeBalances(balances), [balances]);

  return (
    <section aria-label="Cuenta corriente — resumen" className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Cuenta corriente — resumen</h2>
      {loading ? (
        <Card className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando saldos…
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="gap-1 p-5">
              <p className="text-sm text-muted-foreground">Total a cobrar</p>
              <p
                data-testid="total-owed"
                className="text-3xl font-semibold tabular-nums text-destructive"
              >
                {money(summary.totalOwed)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.debtorCount} cliente{summary.debtorCount === 1 ? "" : "s"} con deuda
              </p>
            </Card>
            <Card className="gap-1 p-5">
              <p className="text-sm text-muted-foreground">Total a favor</p>
              <p
                data-testid="total-credit"
                className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
              >
                {money(summary.totalCredit)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.creditorCount} cliente{summary.creditorCount === 1 ? "" : "s"} con saldo a favor
              </p>
            </Card>
            <Card className="gap-1 p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-sm text-muted-foreground">Neto (a cobrar − a favor)</p>
              <p data-testid="net" className="text-2xl font-semibold tabular-nums">
                {money(summary.net)}
              </p>
            </Card>
          </div>

          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">Mayores deudores</p>
            {summary.topDebtors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie debe plata</p>
            ) : (
              <ul className="space-y-1">
                {summary.topDebtors.map((d) => (
                  <li key={d.customerId}>
                    <button
                      type="button"
                      data-testid="top-debtor"
                      onClick={() =>
                        onSelectCustomer({ customerId: d.customerId, name: customerDisplayName(d) })
                      }
                      className="w-full space-y-1 rounded-md p-2 text-left hover:bg-accent/50"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">{customerDisplayName(d)}</span>
                        <span className="shrink-0 tabular-nums text-destructive">
                          {money(d.balance)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive"
                          style={{ width: `${Math.max(2, Math.round(d.share * 100))}%` }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </section>
  );
};
