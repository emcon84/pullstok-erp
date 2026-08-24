import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Wallet, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useCloseCashSession,
} from "@/components/hooks/useCashSession";
import { useBranches } from "@/components/hooks/useBranches";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/models/cashSessionModel";

const round2 = (n: number) => Math.round(n * 100) / 100;

const money = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

/**
 * Caja (sdd/caja-apertura-cierre) — apertura/cierre/arqueo.
 *
 * Sin sesión OPEN → form "Abrir caja" (fondo inicial + sucursal si aplica).
 * Con sesión → panel de saldo (openingAmount, vendido por método, expected en
 * vivo) y botón "Cerrar / Arqueo" que abre un modal de conteo por método.
 */
export const CashSessionPage = () => {
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);
  const userRole = currentUser?.role as string | undefined;
  const userBranchIds = currentUser?.branchIds as string[] | undefined;

  // Sucursal efectiva: operativos con 1 asignación quedan fijos; gestión/
  // multi-sucursal eligen.
  const [branchId, setBranchId] = useState<string | undefined>(
    userRole === "VENDEDOR" || userRole === "CASHIER"
      ? userBranchIds?.length === 1
        ? userBranchIds[0]
        : undefined
      : undefined,
  );
  const { branches } = useBranches();

  const {
    session,
    loading: loadingSession,
    refetch: refetchCurrent,
  } = useGetCurrentCashSession(branchId);

  const { openCashSession, loading: opening } = useOpenCashSession();
  const { closeCashSession, loading: closing } = useCloseCashSession();

  // ── Abrir caja ──
  const [openingAmount, setOpeningAmount] = useState("");
  const [openObs, setOpenObs] = useState("");

  const handleOpen = () => {
    const effectiveBranch = branchId ?? branches[0]?.id;
    if (!effectiveBranch) {
      toast.error("Seleccioná una sucursal para abrir la caja");
      return;
    }
    openCashSession(
      {
        branchId: effectiveBranch,
        openingAmount: Number(openingAmount) || 0,
        observations: openObs || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Caja abierta");
          setOpeningAmount("");
          setOpenObs("");
          refetchCurrent();
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "";
          toast.error(msg || "No se pudo abrir la caja");
        },
      },
    );
  };

  // ── Cerrar / Arqueo ──
  const [arqueoOpen, setArqueoOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [closeObs, setCloseObs] = useState("");

  const handleClose = () => {
    if (!session) return;
    const closingByMethod: Record<string, number> = {};
    for (const m of PAYMENT_METHODS) {
      const raw = counts[m];
      if (raw !== undefined && raw !== "") closingByMethod[m] = Number(raw) || 0;
    }
    closeCashSession(
      {
        id: session.id,
        payload: { closingByMethod, observations: closeObs || undefined },
      },
      {
        onSuccess: (res: unknown) => {
          const r = res as { difference?: number };
          setArqueoOpen(false);
          setCounts({});
          setCloseObs("");
          refetchCurrent();
          const diff = r?.difference ?? 0;
          toast.success(
            diff === 0
              ? "Caja cerrada — arqueo sin diferencia"
              : `Caja cerrada — diferencia de $${money(diff)}`,
          );
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "";
          toast.error(msg || "No se pudo cerrar la caja");
        },
      },
    );
  };

  // Vendido por método (solo EFECTIVO suma al arqueo — R10).
  const soldByMethod = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of session?.payments ?? []) {
      acc[p.method] = round2((acc[p.method] ?? 0) + p.amount);
    }
    return acc;
  }, [session]);

  const expectedAmount = useMemo(
    () =>
      session
        ? round2((session.openingAmount ?? 0) + (soldByMethod["EFECTIVO"] ?? 0))
        : 0,
    [session, soldByMethod],
  );

  // Caja compartida por sucursal: solo quien la abrió (cashierId) o un rol de
  // gestión puede cerrarla. El resto la ve (detalle en vivo) pero no la cierra.
  const canClose = useMemo(() => {
    if (!session) return false;
    const role = currentUser?.role;
    if (role === "ADMIN" || role === "MANAGEMENT") return true;
    return !!currentUser?.id && session.cashierId === currentUser?.id;
  }, [session, currentUser]);

  if (loadingSession) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-muted-foreground">Cargando caja...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet className="h-6 w-6" />
          Caja
        </h1>
        <p className="text-sm text-muted-foreground">
          Abrí tu caja para registrar los medios de pago de cada venta y cerrar
          con arqueo.
        </p>
      </div>

      {session ? (
        <OpenSessionPanel
          session={session}
          soldByMethod={soldByMethod}
          expectedAmount={expectedAmount}
          canClose={canClose}
          onClose={() => setArqueoOpen(true)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Abrir caja</CardTitle>
            <CardDescription>
              Registrá el fondo inicial con el que empezás a operar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {branches.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="cs-branch">Sucursal</Label>
                <NativeSelect
                  id="cs-branch"
                  value={branchId ?? ""}
                  onValueChange={(v) => setBranchId(v || undefined)}
                  placeholder="Seleccioná una sucursal"
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cs-opening">Fondo inicial ($)</Label>
              <Input
                id="cs-opening"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-open-obs">Observaciones (opcional)</Label>
              <Input
                id="cs-open-obs"
                value={openObs}
                onChange={(e) => setOpenObs(e.target.value)}
              />
            </div>
            <Button onClick={handleOpen} disabled={opening}>
              {opening ? "Abriendo..." : "Abrir caja"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Modal de arqueo ── */}
      <Dialog open={arqueoOpen} onOpenChange={setArqueoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar / Arqueo</DialogTitle>
            <DialogDescription>
              Ingresá el conteo real por método de pago. La diferencia contra el
              esperado se calcula automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
              <span>Esperado (efectivo)</span>
              <span className="font-bold tabular-nums">${money(expectedAmount)}</span>
            </div>
            {PAYMENT_METHODS.map((m) => (
              <div key={m} className="flex items-center gap-3">
                <Label htmlFor={`count-${m}`} className="w-40 shrink-0">
                  {PAYMENT_METHOD_LABELS[m]}
                </Label>
                <Input
                  id={`count-${m}`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={counts[m] ?? ""}
                  onChange={(e) =>
                    setCounts((prev) => ({ ...prev, [m]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="cs-close-obs">Observaciones (opcional)</Label>
              <Input
                id="cs-close-obs"
                value={closeObs}
                onChange={(e) => setCloseObs(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArqueoOpen(false)}
              disabled={closing}
            >
              Cancelar
            </Button>
            <Button onClick={handleClose} disabled={closing}>
              {closing ? "Cerrando..." : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function OpenSessionPanel({
  session,
  soldByMethod,
  expectedAmount,
  canClose,
  onClose,
}: {
  session: NonNullable<ReturnType<typeof useGetCurrentCashSession>["session"]>;
  soldByMethod: Record<string, number>;
  expectedAmount: number;
  canClose: boolean;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Saldo</CardTitle>
            <CardDescription>
              Abierta el{" "}
              {new Date(session.openedAt).toLocaleString("es-AR")}
            </CardDescription>
          </div>
          <Badge variant="secondary">Abierta</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fondo inicial</span>
            <span className="font-semibold tabular-nums">
              ${money(session.openingAmount ?? 0)}
            </span>
          </div>
          {PAYMENT_METHODS.map((m) => (
            <div key={m} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Vendido ({PAYMENT_METHOD_LABELS[m]})
              </span>
              <span className="tabular-nums">${money(soldByMethod[m] ?? 0)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="flex items-center gap-2 font-medium">
              <TrendingUp className="h-4 w-4" />
              Esperado (efectivo)
            </span>
            <span className="text-lg font-bold tabular-nums">
              ${money(expectedAmount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {canClose ? (
        <Button size="lg" onClick={onClose}>
          Cerrar / Arqueo
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Solo quien la abrió o gestión pueden cerrarla.
        </p>
      )}
    </div>
  );
}
