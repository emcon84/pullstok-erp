import { useState } from "react";
import { toast } from "react-toastify";
import { Plus, CreditCard, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader } from "../../components/atoms/loader";
import { Plan } from "../../services/onboardingService";
import { SuperadminOrganization } from "../../services/superadminService";
import { useConfirm } from "../../components/hooks/useConfirm";
import {
  useOrganizations,
  useRegisterOrganizationBilling,
  useSetOrganizationActive,
  useUpdateOrganizationPlan,
} from "../../components/hooks/useSuperadmin";
import { OrganizationCreateForm } from "./OrganizationCreateForm";

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "BASICO", label: "Básico" },
  { value: "PRO", label: "Pro" },
  { value: "PREMIUM", label: "Premium" },
];

/**
 * Listado de comercios del panel superadmin (sdd/planes-y-billing, Fase 6).
 * Consume GET /superadmin/organizations (ya devuelve plan, paidUntil,
 * isPaymentOverdue calculados server-side — Fase 3). Acciones inline por
 * fila: cambiar plan (select que dispara PATCH al elegir), registrar pago
 * (botón → PATCH billing), suspender/reactivar (botón → PATCH active).
 */
export const OrganizationsList = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { organizations, loadingOrganizations, errorOrganizations } =
    useOrganizations();
  const { changePlan, loadingPlanChange } = useUpdateOrganizationPlan();
  const { registerPayment, loadingPayment } = useRegisterOrganizationBilling();
  const { toggleActive, loadingToggleActive } = useSetOrganizationActive();

  const handlePlanChange = (org: SuperadminOrganization, plan: Plan) => {
    if (plan === org.plan) return;
    changePlan(
      { id: org.id, plan },
      {
        onSuccess: () => {
          toast.success(`Plan de ${org.name} actualizado a ${plan}`);
        },
        onError: (error) => {
          toast.error(`Error al cambiar el plan: ${error.message}`);
        },
      },
    );
  };

  const handleRegisterPayment = (org: SuperadminOrganization) => {
    registerPayment(org.id, {
      onSuccess: () => {
        toast.success(`Pago registrado para ${org.name}`);
      },
      onError: (error) => {
        toast.error(`Error al registrar el pago: ${error.message}`);
      },
    });
  };

  const confirm = useConfirm();

  const handleToggleActive = async (org: SuperadminOrganization) => {
    const nextActive = !org.isActive;
    const ok = await confirm({
      title: nextActive ? "¿Reactivar organización?" : "¿Suspender organización?",
      description: nextActive
        ? `Vas a reactivar ${org.name}.`
        : `Vas a suspender ${org.name}. El acceso de sus usuarios quedará bloqueado.`,
      confirmLabel: nextActive ? "Sí, reactivar" : "Sí, suspender",
      danger: !nextActive,
    });
    if (!ok) return;
    toggleActive(
      { id: org.id, isActive: nextActive },
      {
        onSuccess: () => {
          toast.success(
            nextActive ? `${org.name} reactivada` : `${org.name} suspendida`,
          );
        },
        onError: (error) => {
          toast.error(`Error al actualizar el estado: ${error.message}`);
        },
      },
    );
  };

  if (loadingOrganizations) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorOrganizations) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar organizaciones: {errorOrganizations.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comercios</h1>
          <p className="text-sm text-muted-foreground">
            {organizations?.length ?? 0} organización
            {(organizations?.length ?? 0) === 1 ? "" : "es"} en la plataforma
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo comercio
        </Button>
      </div>

      {!organizations || organizations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <p className="font-medium">Todavía no hay comercios</p>
          <p className="text-sm text-muted-foreground">
            Creá el primero para empezar.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">
                    <div>{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {org.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={org.plan}
                      onValueChange={(value) =>
                        handlePlanChange(org, value as Plan)
                      }
                      disabled={loadingPlanChange}
                    >
                      <SelectTrigger size="sm" className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAN_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.isPaymentOverdue ? "destructive" : "secondary"}>
                      {org.isPaymentOverdue ? "Vencido" : "Al día"}
                    </Badge>
                    {org.paidUntil && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hasta {new Date(org.paidUntil).toLocaleDateString()}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.isActive ? "default" : "destructive"}>
                      {org.isActive ? "Activo" : "Suspendido"}
                    </Badge>
                  </TableCell>
                  <TableCell>{org._count.users}</TableCell>
                  <TableCell>{org._count.products}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Registrar pago"
                        disabled={loadingPayment}
                        onClick={() => handleRegisterPayment(org)}
                      >
                        <CreditCard className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={org.isActive ? "Suspender" : "Reactivar"}
                        disabled={loadingToggleActive}
                        className={
                          org.isActive
                            ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                            : "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                        }
                        onClick={() => handleToggleActive(org)}
                      >
                        {org.isActive ? (
                          <Ban className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo comercio</DialogTitle>
          </DialogHeader>
          <OrganizationCreateForm onSuccess={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};
