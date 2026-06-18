import React, { useState } from "react";
import { ProductSearch } from "../SearchProducts";
import { Title } from "../../atoms/title";
import { Text } from "../../atoms/text";
import { Button } from "../button";
import { toast } from "react-toastify";
import { ProductsProps } from "../../../models/productsModel";
import { CartItem } from "../../../models/salesModel";
import { Customer } from "../../../models/customerModel";
import Select, { Option } from "../../atoms/select";
import { useCreateBudget } from "../../hooks/useBudget";
import { useCreateSale } from "../../hooks/useSales"; // Importar el hook useCreateSale
import Separator from "../../atoms/separator";
import { useCreateCustomer } from "../../hooks/useCustomer";
import { GenericModal } from "../GenericModal";
import { useQueryClient } from "@tanstack/react-query";
import { ModalContentCustomer } from "../GenericModal/ModalContentCustomer";

interface SalesListProps {
  products: ProductsProps[];
  closeModalSales: () => void;
  getProducts: () => void;
  budget?: string;
  customers?: Customer[];
}

export const SalesList: React.FC<SalesListProps> = ({
  products,
  closeModalSales,
  getProducts,
  budget,
  customers,
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const { submitBudget } = useCreateBudget();
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] =
    useState<boolean>(false);
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>("");
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>("");
  const {
    createSale,
    loading: creatingSale,
    error: createSaleError,
  } = useCreateSale(); // Usar el hook useCreateSale
  const { submitCustomer, loadingCustomer } = useCreateCustomer(); // Hook para crear cliente
  const queryClient = useQueryClient();

  const handleAddToCart = (
    product: ProductsProps,
    quantity: number,
    totalPrice: number,
  ) => {
    setCart([...cart, { product, quantity, totalPrice }]);
  };

  const handleOpenAddCustomerModal = () => {
    setIsAddCustomerModalOpen(true);
  };

  const handleCloseAddCustomerModal = () => {
    setIsAddCustomerModalOpen(false);
    setNewCustomerName("");
    setNewCustomerName("");
    setNewCustomerName("");
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
          handleCloseAddCustomerModal();
          queryClient.invalidateQueries();
        },
        onError: (error) => {
          toast.error(`Error al agregar cliente: ${error.message}`);
        },
      },
    );
  };

  const handleExecuteSale = async () => {
    try {
      await createSale(cart); // Usar la función del hook para crear la venta
      toast.success("Venta realizada con éxito");
      getProducts();
      setCart([]);
      closeModalSales();
    } catch (error) {
      toast.error("Error al realizar la venta");
    }
  };

  const handleExecuteBudget = async () => {
    if (!selectedCustomer) {
      toast.error("Por favor, seleccione un cliente.");
      return;
    }

    if (cart.length === 0) {
      toast.error("No hay productos en el carrito.");
      return;
    }

    // Transformar el carrito a la estructura requerida por el API
    const productsData = cart.map((item) => ({
      product: item.product._id || item.product.id || "",
      quantity: item.quantity,
      price: item.totalPrice / item.quantity,
    }));

    // Crear el objeto del presupuesto
    if (!selectedCustomer) {
      toast.error("Debe seleccionar un cliente");
      return;
    }

    const budgetData = {
      customer: selectedCustomer,
      products: productsData,
      totalAmount: cart.reduce((total, item) => total + item.totalPrice, 0),
      validUntil: "2024-12-31", // Ajusta la fecha según sea necesario
    };

    try {
      await submitBudget(budgetData); // Usar la función de mutación para crear el presupuesto
      toast.success("Presupuesto creado con éxito");
      getProducts();
      setCart([]);
      closeModalSales();
    } catch (error) {
      toast.error("Error al crear el presupuesto");
      console.error("Error al crear el presupuesto:", error);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCustomer(event.target.value);
  };

  const customerOptions: Option[] = (customers || []).map((customer) => ({
    value: customer._id || customer.id || "",
    label: customer.name,
  }));

  return (
    <div>
      <br />
      {budget && (
        <>
          <Title level={3}>Seleccionar Cliente</Title>
          <div className="flex-ai-c">
            <Select
              options={customerOptions}
              value={selectedCustomer}
              onChange={handleChange}
              placeholder="Seleccione un cliente"
              className="max-w-xs" // Clase opcional para ajustar el tamaño del select
            />
            <Button onClick={handleOpenAddCustomerModal}>Agregar</Button>
          </div>
        </>
      )}
      <ProductSearch products={products} onAddToCart={handleAddToCart} />
      <Title level={3} className="text-bold">
        Lista de Venta
      </Title>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />
      <div className="flex-ai-c-sb mtb-20">
        <div style={{ width: "10%" }}>
          <Text type="p" className="text-md">
            Cant.
          </Text>
        </div>
        <div style={{ width: "80%" }}>
          <Text type="p" className="text-md">
            Producto
          </Text>
        </div>
        <div
          style={{
            width: "25%",
            display: "flex",
            justifyContent: "flex-end",
            marginRight: "30px",
          }}
        >
          <Text type="p" className="text-md">
            Precio Total
          </Text>
        </div>
      </div>
      <ul className="max-height-100">
        {cart.length === 0 && (
          <div className="flex-jc-ac">No hay productos en el carrito</div>
        )}
        {cart.map((item, index) => (
          <li key={index}>
            <div className="flex-ai-c-sb mtb-20">
              <div style={{ width: "10%" }}>
                <Text type="p">{item.quantity}</Text>
              </div>
              <div style={{ width: "80%" }}>
                <Text type="p">{item.product.name}</Text>
              </div>
              <div
                style={{
                  width: "25%",
                  display: "flex",
                  justifyContent: "flex-end",
                  marginRight: "30px",
                }}
              >
                <Text type="p">${item.totalPrice}</Text>
              </div>
              <div></div>
            </div>
          </li>
        ))}
      </ul>
      <Separator orientation="horizontal" color="#ccc" thickness="1px" />
      <div className="flex-je-ac ">
        <Title level={2} className="text-xl">
          Total: ${cart.reduce((total, item) => total + item.totalPrice, 0)}
        </Title>
      </div>
      <br />
      <div className="flex-je-ac mtb-20">
        <Button onClick={closeModalSales}>Cancelar</Button>
        <Button
          className="bg-green-500"
          onClick={budget ? handleExecuteBudget : handleExecuteSale}
          disabled={creatingSale} // Deshabilitar el botón si se está creando la venta
        >
          Confirmar
        </Button>
      </div>
      {createSaleError && (
        <div className="error">Error: {createSaleError.message}</div>
      )}{" "}
      {/* Mostrar el error si ocurre */}
      <GenericModal
        isOpen={isAddCustomerModalOpen}
        onClose={handleOpenAddCustomerModal}
      >
        <ModalContentCustomer
          name={newCustomerName}
          setName={setNewCustomerName}
          email={newCustomerEmail}
          setEmail={setNewCustomerEmail}
          phone={newCustomerPhone}
          setPhone={setNewCustomerPhone}
          handleSaveCustomer={handleAddCustomer}
          handleCloseModal={handleCloseAddCustomerModal}
          loadingCustomer={loadingCustomer}
          isEditing={false}
        />
      </GenericModal>
    </div>
  );
};
