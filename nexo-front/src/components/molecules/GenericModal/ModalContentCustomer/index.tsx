import { Input } from "../../../atoms/inputs";
import Separator from "../../../atoms/separator";
import { Title } from "../../../atoms/title";
import { Button } from "../../button";

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
  isEditing: boolean; // Añadir esta nueva propiedad
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
  isEditing, // Recibe la nueva propiedad
}) => {
  return (
    <div>
      <div className="modal">
        <div className="">
          <Title level={3} className="text-bold">
            {isEditing ? "Editar Cliente" : "Agregar Nuevo Cliente"}
          </Title>
          <Separator orientation="horizontal" color="#ccc" thickness="1px" />
          <Input
            type="text"
            placeholder="Nombre del cliente"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="text"
            placeholder="telefono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="flex-je-ac">
          <Button onClick={handleCloseModal}>Cancelar</Button>
          <Button
            onClick={handleSaveCustomer}
            disabled={loadingCustomer}
            className="bg-green-500"
            loading={loadingCustomer}
          >
            {loadingCustomer ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
};
