import React, { useState, ChangeEvent } from "react";
import { ProductsProps } from "../../../models/productsModel";
import { Input } from "../../atoms/inputs";
import { Button } from "../button";
import { API_URL } from "../../../constants";
import "./index.css";

interface SelectedProduct {
  product: ProductsProps;
  quantity: number;
}

interface ProductSelectorProps {
  products: ProductsProps[];
  onConfirm: (selectedProducts: SelectedProduct[]) => void;
  onClose: () => void;
}

export const ProductSelector: React.FC<ProductSelectorProps> = ({
  products,
  onConfirm,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<
    Map<string, SelectedProduct>
  >(new Map());

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleCheckboxChange = (product: ProductsProps) => {
    const productId = product._id || product.id || "";
    const newSelected = new Map(selectedProducts);

    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.set(productId, { product, quantity: 1 });
    }

    setSelectedProducts(newSelected);
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    if (quantity < 1) return;
    const newSelected = new Map(selectedProducts);
    const item = newSelected.get(productId);
    if (item) {
      newSelected.set(productId, { ...item, quantity });
      setSelectedProducts(newSelected);
    }
  };

  const handleConfirm = () => {
    const productsArray = Array.from(selectedProducts.values());
    onConfirm(productsArray);
    onClose();
  };

  return (
    <div className="product-selector">
      <div className="product-selector-search">
        <Input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          placeholder="Buscar productos..."
        />
      </div>

      <div className="product-selector-list">
        {filteredProducts.map((product) => {
          const productId = product._id || product.id || "";
          const isSelected = selectedProducts.has(productId);
          const selectedItem = selectedProducts.get(productId);

          return (
            <div
              key={productId}
              className={`product-selector-item ${isSelected ? "selected" : ""}`}
            >
              <div className="product-selector-item-main">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleCheckboxChange(product)}
                  className="product-selector-checkbox"
                />
                <img
                  src={
                    product.image?.startsWith("http")
                      ? product.image
                      : `${API_URL.replace("/api", "")}${product.image}`
                  }
                  alt={product.name}
                  className="product-selector-image"
                />
                <div className="product-selector-info">
                  <span className="product-selector-name">{product.name}</span>
                  <span className="product-selector-price">
                    ${product.price}
                  </span>
                  <span className="product-selector-stock">
                    Stock: {product.quantity}
                  </span>
                </div>
              </div>
              {isSelected && (
                <div className="product-selector-quantity">
                  <button
                    onClick={() =>
                      handleQuantityChange(
                        productId,
                        (selectedItem?.quantity || 1) - 1,
                      )
                    }
                    className="quantity-btn"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={selectedItem?.quantity || 1}
                    onChange={(e) =>
                      handleQuantityChange(
                        productId,
                        parseInt(e.target.value) || 1,
                      )
                    }
                    className="quantity-input"
                    min="1"
                  />
                  <button
                    onClick={() =>
                      handleQuantityChange(
                        productId,
                        (selectedItem?.quantity || 1) + 1,
                      )
                    }
                    className="quantity-btn"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="product-selector-footer">
        <span className="product-selector-count">
          {selectedProducts.size} producto(s) seleccionado(s)
        </span>
        <div className="product-selector-actions">
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            className="bg-green-500"
            disabled={selectedProducts.size === 0}
          >
            Agregar productos
          </Button>
        </div>
      </div>
    </div>
  );
};
