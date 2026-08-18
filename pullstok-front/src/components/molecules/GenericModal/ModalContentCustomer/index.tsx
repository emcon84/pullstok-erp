import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NewCustomer {
  name: string;
  email: string;
  phone: string;
  taxId: string;
  taxCondition: string;
  address: string;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPhone: (phone: string) => void;
  setTaxId: (taxId: string) => void;
  setTaxCondition: (taxCondition: string) => void;
  setAddress: (address: string) => void;
  handleSaveCustomer: () => void;
  handleCloseModal: () => void;
  loadingCustomer: boolean;
  loadingPadron: boolean;
  onArcaLookup: (cuit: string) => void;
  isEditing: boolean;
}

export const ModalContentCustomer: React.FC<NewCustomer> = ({
  name,
  email,
  phone,
  taxId,
  taxCondition,
  address,
  setName,
  setEmail,
  setPhone,
  setTaxId,
  setTaxCondition,
  setAddress,
  handleSaveCustomer,
  handleCloseModal,
  loadingCustomer,
  loadingPadron,
  onArcaLookup,
  isEditing,
}) => {
  const cuitReady = (taxId ?? "").replace(/\D/g, "").length === 11;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {isEditing ? "Editar cliente" : "Agregar cliente"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Datos de contacto del cliente.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-name">Nombre</Label>
        <Input
          id="c-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del cliente"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-taxid">CUIT</Label>
        <div className="flex gap-2">
          <Input
            id="c-taxid"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="20-00000000-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => onArcaLookup(taxId)}
            disabled={!cuitReady || loadingPadron}
            className="shrink-0"
          >
            {loadingPadron ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Consultar ARCA"
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Consultá el padrón para autocompletar los datos fiscales. Podés
          cargarlos a mano si no existe.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-taxcondition">Condición de IVA</Label>
        <Input
          id="c-taxcondition"
          value={taxCondition}
          onChange={(e) => setTaxCondition(e.target.value)}
          placeholder="Ej. IVA Responsable Inscripto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-address">Domicilio</Label>
        <Input
          id="c-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Domicilio del cliente"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-email">Email</Label>
        <Input
          id="c-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="cliente@mail.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="c-phone">Teléfono</Label>
        <Input
          id="c-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 11 1234 5678"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={handleCloseModal}>
          Cancelar
        </Button>
        <Button onClick={handleSaveCustomer} disabled={loadingCustomer}>
          {loadingCustomer ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
};
