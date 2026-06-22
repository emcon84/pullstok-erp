import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NewCustomer {
  name: string;
  email: string;
  phone: string;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPhone: (phone: string) => void;
  handleSaveCustomer: () => void;
  handleCloseModal: () => void;
  loadingCustomer: boolean;
  isEditing: boolean;
}

export const ModalContentCustomer: React.FC<NewCustomer> = ({
  name,
  email,
  phone,
  setName,
  setEmail,
  setPhone,
  handleSaveCustomer,
  handleCloseModal,
  loadingCustomer,
  isEditing,
}) => {
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
