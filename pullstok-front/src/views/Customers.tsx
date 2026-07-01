import { useState } from "react";
import { Plus, Pencil, Trash2, Phone, Users } from "lucide-react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenericModal } from "../components/molecules/GenericModal";
import { ModalContentCustomer } from "../components/molecules/GenericModal/ModalContentCustomer";
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "../components/hooks/useCustomer";
import { Loader } from "../components/atoms/loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Customers = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [updatedCustomerName, setUpdatedCustomerName] = useState("");
  const [updatedCustomerEmail, setUpdatedCustomerEmail] = useState("");
  const [updatedCustomerPhone, setUpdatedCustomerPhone] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { customers, loadingCustomer: loading, errorCustomer } = useCustomers();
  const { submitCustomer, loadingCustomer } = useCreateCustomer();
  const { updateCustomer, loadingUpdate } = useUpdateCustomer();
  const { deleteCustomer } = useDeleteCustomer();

  const queryClient = useQueryClient();

  const openModal = () => setIsOpen(true);

  const handleAddCustomer = async () => {
    submitCustomer(
      {
        name: newCustomerName,
        email: newCustomerEmail,
        phone: newCustomerPhone,
      },
      {
        onSuccess: () => {
          toast.success("Cliente agregado con éxito");
          closeModal();
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: (error) => {
          toast.error(`Error al agregar cliente: ${error.message}`);
        },
      },
    );
  };

  const askDeleteCustomer = (id: string, name: string) =>
    setDeleteTarget({ id, name });

  const confirmDeleteCustomer = () => {
    if (!deleteTarget) return;
    deleteCustomer(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Cliente eliminado con éxito");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      },
      onError: (error) => {
        toast.error(`Error al eliminar cliente: ${error.message}`);
      },
    });
    setDeleteTarget(null);
  };

  const handleEditCustomer = (customerId: string) => {
    const customerMatch = customers?.find(
      (customer) => (customer.id || customer._id) === customerId,
    );
    if (customerMatch) {
      setEditCustomerId(customerId);
      setUpdatedCustomerName(customerMatch.name);
      setUpdatedCustomerEmail(customerMatch.email);
      setUpdatedCustomerPhone(customerMatch.phone);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEditedCustomer = async () => {
    if (!editCustomerId) return;
    updateCustomer(
      {
        id: editCustomerId,
        name: updatedCustomerName,
        email: updatedCustomerEmail,
        phone: updatedCustomerPhone,
      },
      {
        onSuccess: () => {
          toast.success("Cliente editado con éxito");
          setIsEditModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: (error) => {
          toast.error(`Error al editar cliente: ${error.message}`);
        },
      },
    );
  };

  const closeModal = () => {
    setIsOpen(false);
    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditCustomerId(null);
    setUpdatedCustomerName("");
    setUpdatedCustomerEmail("");
    setUpdatedCustomerPhone("");
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorCustomer) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar clientes: {errorCustomer.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {customers?.length ?? 0} cliente
            {(customers?.length ?? 0) === 1 ? "" : "s"} registrado
            {(customers?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openModal}>
          <Plus className="h-4 w-4" />
          Agregar cliente
        </Button>
      </div>

      {!customers || customers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay clientes</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primer cliente para empezar.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((customer) => {
            const customerId = customer.id || customer._id || "";
            return (
              <Card key={customerId} className="gap-0 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-semibold uppercase text-accent-foreground">
                      {customer.name?.[0] ?? "C"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {customer.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditCustomer(customerId)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => askDeleteCustomer(customerId, customer.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone || "Sin teléfono"}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GenericModal isOpen={isOpen} onClose={closeModal}>
        <ModalContentCustomer
          name={newCustomerName}
          email={newCustomerEmail}
          phone={newCustomerPhone}
          setName={setNewCustomerName}
          setEmail={setNewCustomerEmail}
          setPhone={setNewCustomerPhone}
          handleSaveCustomer={handleAddCustomer}
          handleCloseModal={closeModal}
          loadingCustomer={loadingCustomer}
          isEditing={false}
        />
      </GenericModal>

      <GenericModal isOpen={isEditModalOpen} onClose={closeEditModal}>
        <ModalContentCustomer
          name={updatedCustomerName}
          email={updatedCustomerEmail}
          phone={updatedCustomerPhone}
          setName={setUpdatedCustomerName}
          setEmail={setUpdatedCustomerEmail}
          setPhone={setUpdatedCustomerPhone}
          handleSaveCustomer={handleSaveEditedCustomer}
          handleCloseModal={closeEditModal}
          loadingCustomer={loadingUpdate}
          isEditing={true}
        />
      </GenericModal>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar a <strong>{deleteTarget?.name}</strong>. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCustomer}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
