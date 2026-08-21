import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateOrganization,
  type Organization,
} from "../../../services/onboardingService";

interface OrganizationFiscalFormProps {
  organization?: Organization;
}

type FiscalData = Parameters<typeof updateOrganization>[0];

const toField = (value: string | null | undefined) => value ?? "";

export const OrganizationFiscalForm = ({
  organization,
}: OrganizationFiscalFormProps) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    taxId: "",
    taxCondition: "",
    address: "",
  });

  useEffect(() => {
    if (organization) {
      setForm({
        name: toField(organization.name),
        taxId: toField(organization.taxId),
        taxCondition: toField(organization.taxCondition),
        address: toField(organization.address),
      });
    }
  }, [organization]);

  const mutation = useMutation({
    mutationFn: (data: FiscalData) => updateOrganization(data),
    onSuccess: () => {
      toast.success("Datos fiscales actualizados");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => {
      toast.error(
        error.message || "Error al guardar los datos fiscales del emisor",
      );
    },
  });

  const handleField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    mutation.mutate({
      name: form.name.trim(),
      taxId: form.taxId.trim(),
      taxCondition: form.taxCondition.trim(),
      address: form.address.trim(),
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Datos fiscales del emisor</CardTitle>
        <CardDescription>
          Estos datos se muestran en las facturas y comprobantes emitidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="orgName">Razón social</Label>
          <Input
            id="orgName"
            value={form.name}
            onChange={(e) => handleField("name", e.target.value)}
            placeholder="Mi negocio S.A."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxId">CUIT</Label>
          <Input
            id="taxId"
            value={form.taxId}
            onChange={(e) => handleField("taxId", e.target.value)}
            placeholder="20-12345678-9"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxCondition">Condición de IVA</Label>
          <Input
            id="taxCondition"
            value={form.taxCondition}
            onChange={(e) => handleField("taxCondition", e.target.value)}
            placeholder="Ej. IVA Responsable Inscripto"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="orgAddress">Dirección</Label>
          <Input
            id="orgAddress"
            value={form.address}
            onChange={(e) => handleField("address", e.target.value)}
            placeholder="Av. Siempre Viva 123"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};