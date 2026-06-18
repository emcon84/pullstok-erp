import { IoMdAddCircleOutline } from "react-icons/io";
import Separator from "../components/atoms/separator";
import { Title } from "../components/atoms/title";
import { Button } from "../components/molecules/button";
import { GenericModal } from "../components/molecules/GenericModal";
import { ModalContentCustomer } from "../components/molecules/GenericModal/ModalContentCustomer";
import { useState } from "react";
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "../components/hooks/useCustomer";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/molecules/card";
import { Loader } from "../components/atoms/loader";
import { MdOutlineModeEdit } from "react-icons/md";
import { IoTrashOutline } from "react-icons/io5";

export const Customers = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>("");
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>("");

  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [updatedCustomerName, setUpdatedCustomerName] = useState<string>("");
  const [updatedCustomerEmail, setUpdatedCustomerEmail] = useState<string>("");
  const [updatedCustomerPhone, setUpdatedCustomerPhone] = useState<string>("");

  const { customers, loadingCustomer: loading, errorCustomer } = useCustomers();
  const { submitCustomer, loadingCustomer } = useCreateCustomer();
  const { updateCustomer, loadingUpdate } = useUpdateCustomer();
  const { deleteCustomer } = useDeleteCustomer();

  const queryClient = useQueryClient();

  // Define la función openModal
  const openModal = () => {
    setIsOpen(true);
  };

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

  const handleDeleteCustomer = (customerId: string) => {
    deleteCustomer(customerId, {
      onSuccess: () => {
        toast.success("Cliente eliminado con éxito");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      },
      onError: (error) => {
        toast.error(`Error al eliminar cliente: ${error.message}`);
      },
    });
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
      <div className="flex-jc-ac h-100-vh">
        <Loader />
      </div>
    );
  }

  if (errorCustomer) {
    return <div>Error loading customer: {errorCustomer.message}</div>;
  }

  return (
    <div className="p-20">
      <div className="flex-jc-sb">
        <Title level={1} className="header text-xl mx-20">
          Clientes
        </Title>
        <Button
          onClick={openModal}
          iconLeft={
            <IoMdAddCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Agregar Cliente
        </Button>
      </div>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />

      <div className="mx-20">
        {customers?.map((customer) => {
          const customerId = customer.id || customer._id || "";
          return (
            <Card key={customerId}>
              <div className="flex-jc-sb py-5 px-10">
                <div>
                  <p className="text-lg font-bold my-5">{customer.name}</p>
                  <p className="my-5">email: {customer.email}</p>
                  <p className="my-5">teléfono: {customer.phone}</p>
                </div>
                <div className="flex gap-10">
                  <MdOutlineModeEdit
                    size={20}
                    onClick={() => handleEditCustomer(customerId)}
                  />
                  <IoTrashOutline
                    size={20}
                    onClick={() => handleDeleteCustomer(customerId)}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal para agregar cliente */}
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

      {/* Modal para editar cliente */}
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
    </div>
  );
};
