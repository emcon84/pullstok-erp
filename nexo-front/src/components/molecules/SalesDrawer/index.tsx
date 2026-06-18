import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "../Drawer";
import { ProductSelector } from "../ProductSelector";
import { GenericModal } from "../GenericModal";
import { ProductsProps } from "../../../models/productsModel";
import { Customer } from "../../../models/customerModel";
import { CartItem } from "../../../models/salesModel";
import { Order } from "../../../models/orderModel";
import Select, { Option } from "../../atoms/select";
import { Button } from "../button";
import { Title } from "../../atoms/title";
import { Text } from "../../atoms/text";
import Separator from "../../atoms/separator";
import { toast } from "react-toastify";
import "./index.css";

interface SalesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductsProps[];
  customers?: Customer[];
  orders?: Order[];
  title: string;
  requireCustomer?: boolean;
  allowOrderSelection?: boolean;
  onConfirm: (cart: CartItem[], customerId?: string, orderId?: string) => void;
}

export const SalesDrawer: React.FC<SalesDrawerProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  orders,
  title,
  requireCustomer = false,
  allowOrderSelection = false,
  onConfirm,
}) => {
  const [mode, setMode] = useState<"products" | "order">("products");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<string>("");
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

  const customerOptions: Option[] = (customers || []).map((customer) => ({
    value: customer._id || customer.id || "",
    label: customer.name,
  }));

  const orderOptions: Option[] = (orders || []).map((order) => ({
    value: order._id || order.id || "",
    label: `${order.receipt} - ${order.customer?.name || "Sin cliente"}`,
  }));

  // Cargar productos del pedido seleccionado
  useEffect(() => {
    if (mode === "order" && selectedOrder && orders) {
      const order = orders.find((o) => (o._id || o.id) === selectedOrder);
      if (order && order.items) {
        const cartItems: CartItem[] = order.items
          .filter((item) => item.product !== null)
          .map((item) => ({
            product: item.product as ProductsProps,
            quantity: item.quantity,
            totalPrice:
              (item.price || item.product?.price || 0) * item.quantity,
          }));
        setCart(cartItems);
      }
    } else if (mode === "products") {
      setCart([]);
    }
  }, [selectedOrder, mode, orders]);

  const handleProductsSelected = (
    selectedProducts: { product: ProductsProps; quantity: number }[],
  ) => {
    const newCartItems: CartItem[] = selectedProducts.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      totalPrice: (item.product.price as number) * item.quantity,
    }));
    setCart([...cart, ...newCartItems]);
  };

  const handleRemoveItem = (index: number) => {
    const newCart = cart.filter((_, i) => i !== index);
    setCart(newCart);
  };

  const handleConfirm = () => {
    if (cart.length === 0) {
      toast.error("Debes agregar al menos un producto o seleccionar un pedido");
      return;
    }

    if (requireCustomer && !selectedCustomer && mode === "products") {
      toast.error("Debes seleccionar un cliente");
      return;
    }

    if (mode === "order" && !selectedOrder) {
      toast.error("Debes seleccionar un pedido");
      return;
    }

    onConfirm(cart, selectedCustomer, selectedOrder);
    setCart([]);
    setSelectedCustomer("");
    setSelectedOrder("");
    setMode("products");
    onClose();
  };

  const handleClose = () => {
    setCart([]);
    setSelectedCustomer("");
    setSelectedOrder("");
    setMode("products");
    onClose();
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <>
      <Drawer isOpen={isOpen} onClose={handleClose} title={title} width="700px">
        {allowOrderSelection && (
          <div className="sales-drawer-section">
            <div className="mode-selector">
              <button
                className={`mode-button ${mode === "products" ? "active" : ""}`}
                onClick={() => setMode("products")}
              >
                Agregar Productos
              </button>
              <button
                className={`mode-button ${mode === "order" ? "active" : ""}`}
                onClick={() => setMode("order")}
              >
                Desde Pedido
              </button>
            </div>
          </div>
        )}

        {mode === "order" && allowOrderSelection && orders && (
          <div className="sales-drawer-section">
            <Title level={3}>Seleccionar Pedido</Title>
            <Select
              options={orderOptions}
              value={selectedOrder}
              onChange={(e) => setSelectedOrder(e.target.value)}
              placeholder="Seleccione un pedido"
            />
          </div>
        )}

        {mode === "products" && requireCustomer && customers && (
          <div className="sales-drawer-section">
            <Title level={3}>Seleccionar Cliente</Title>
            <Select
              options={customerOptions}
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              placeholder="Seleccione un cliente"
            />
          </div>
        )}

        <div className="sales-drawer-section">
          <div
            className="flex-jc-sb"
            style={{ alignItems: "center", marginBottom: "16px" }}
          >
            <Title level={3}>Productos</Title>
            {mode === "products" && (
              <Button onClick={() => setIsProductSelectorOpen(true)}>
                Agregar Productos
              </Button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="sales-drawer-empty">
              <Text type="p">No hay productos agregados</Text>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {mode === "products"
                  ? 'Haz clic en "Agregar Productos" para comenzar'
                  : "Selecciona un pedido para ver sus productos"}
              </p>
            </div>
          ) : (
            <table className="budget-table">
              <thead>
                <tr>
                  <th>Cantidad</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: "right" }}>Precio Unit.</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  {mode === "products" && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {cart.map((item, index) => (
                  <tr key={index}>
                    <td style={{ textAlign: "center" }}>{item.quantity}</td>
                    <td>{item.product.name}</td>
                    <td style={{ textAlign: "right" }}>
                      ${(Number(item.product.price) || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      ${item.totalPrice.toFixed(2)}
                    </td>
                    {mode === "products" && (
                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="sales-drawer-remove-btn"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="budget-total-row">
                  <td
                    colSpan={mode === "products" ? 3 : 3}
                    style={{ textAlign: "right", fontWeight: "bold" }}
                  >
                    Total:
                  </td>
                  <td
                    colSpan={mode === "products" ? 2 : 1}
                    style={{
                      textAlign: "right",
                      fontWeight: "bold",
                      fontSize: "20px",
                      color: "var(--primary-color)",
                    }}
                  >
                    ${totalAmount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="sales-drawer-footer">
          <div className="sales-drawer-actions">
            <Button onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={handleConfirm}
              className="bg-green-500"
              disabled={cart.length === 0}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Drawer>

      {isProductSelectorOpen &&
        createPortal(
          <GenericModal
            isOpen={isProductSelectorOpen}
            onClose={() => setIsProductSelectorOpen(false)}
          >
            <Title level={2}>Seleccionar Productos</Title>
            <Separator
              orientation="horizontal"
              color="var(--border-color)"
              thickness="1px"
            />
            <ProductSelector
              products={products}
              onConfirm={handleProductsSelected}
              onClose={() => setIsProductSelectorOpen(false)}
            />
          </GenericModal>,
          document.body,
        )}
    </>
  );
};
