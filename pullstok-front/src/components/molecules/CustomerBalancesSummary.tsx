import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { customerDisplayName } from "../../utils/customerName";
import { useBalancesLock } from "../hooks/useBalancesLock";
import { BalancesPasswordDialog } from "./BalancesPasswordDialog";

const MASK = "••••••";

const money = (n: number) =>
  `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Props {
  onSelectCustomer: (customer: { customerId: string; name: string }) => void;
}

/**
 * Company-wide account summary behind a password (banking-app style): values are
 * masked until the owner unlocks them; the numbers come from the server only
 * while a short-lived unlock token is held in memory.
 */
export const CustomerBalancesSummary = ({ onSelectCustomer }: Props) => {
  const lock = useBalancesLock();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { summary } = lock;
  const revealed = lock.unlocked && !!summary;

  const openDialog = () => {
    lock.resetUnlockError();
    setDialogOpen(true);
  };

  const handleUnlock = async (password: string) => {
    await lock.unlock(password);
    setDialogOpen(false);
  };

  return (
    <section aria-label="Cuenta corriente — resumen" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Cuenta corriente — resumen</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={lock.unlocked ? "Ocultar saldos" : "Mostrar saldos"}
          onClick={lock.unlocked ? lock.lock : openDialog}
        >
          {lock.unlocked ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </Button>
      </div>

      {lock.loadingSummary && (
        <Card className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando saldos…
        </Card>
      )}
      {lock.summaryError && lock.summaryError.code !== "BALANCES_LOCKED" && (
        <p role="alert" className="text-sm text-destructive">
          {lock.summaryError.message}
        </p>
      )}

      {!lock.loadingSummary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="gap-1 p-5">
              <p className="text-sm text-muted-foreground">Total a cobrar</p>
              <p
                data-testid="total-owed"
                className="text-3xl font-semibold tabular-nums text-destructive"
              >
                {revealed ? money(summary.totalOwed) : MASK}
              </p>
              <p className="text-xs text-muted-foreground">
                {revealed ? plural(summary.debtorCount, "cliente", "clientes") : MASK} con deuda
              </p>
            </Card>
            <Card className="gap-1 p-5">
              <p className="text-sm text-muted-foreground">Total a favor</p>
              <p
                data-testid="total-credit"
                className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
              >
                {revealed ? money(summary.totalCredit) : MASK}
              </p>
              <p className="text-xs text-muted-foreground">
                {revealed ? plural(summary.creditorCount, "cliente", "clientes") : MASK} con saldo a favor
              </p>
            </Card>
            <Card className="gap-1 p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-sm text-muted-foreground">Neto (a cobrar − a favor)</p>
              <p data-testid="net" className="text-2xl font-semibold tabular-nums">
                {revealed ? money(summary.net) : MASK}
              </p>
            </Card>
          </div>

          <Card className="gap-3 p-5">
            <p className="text-sm font-medium">Mayores deudores</p>
            {!revealed ? (
              <p className="text-sm text-muted-foreground">{MASK}</p>
            ) : summary.topDebtors.length === 0 ? (
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

      <BalancesPasswordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleUnlock}
        loading={lock.unlocking}
        error={lock.unlockError?.message ?? null}
      />
    </section>
  );
};
