import React, { ChangeEvent, useState } from "react";
import { ProductsProps } from "../../../models/productsModel";
import { Input } from "../../atoms/inputs";
import { Text } from "../../atoms/text";
import { Button } from "../button";
import { API_URL } from "../../../constants";

//css
import "./index.css";
import { Validation } from "../../../types/index";

interface ProductSearchProps {
  products: ProductsProps[];
  onAddToCart: (
    product: ProductsProps,
    quantity: number,
    totalPrice: number,
  ) => void;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({
  products,
  onAddToCart,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [quantities, setQuantities] = useState<{ [key: string]: string }>({});
  const [filteredProducts, setFilteredProducts] =
    useState<ProductsProps[]>(products);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    const filtered = products.filter((product) =>
      product.name.toLowerCase().includes(term),
    );
    setFilteredProducts(filtered);
  };

  const handleQuantityChange = (
    e: ChangeEvent<HTMLInputElement>,
    productId: string,
  ) => {
    setQuantities({
      ...quantities,
      [productId]: e.target.value,
    });
  };

  const handleAddToCart = (product: ProductsProps) => {
    const productId = product._id || product.id || "";
    const quantity = parseInt(quantities[productId]) || 1;
    const totalPrice = (product.price as unknown as number) * quantity;
    onAddToCart(product, quantity, totalPrice);
  };

  const validateSearch: Validation[] = [
    { rule: "noSQL", message: "Entrada inválida" },
  ];

  return (
    <div>
      <Input
        type="text"
        value={searchTerm}
        onChange={handleSearch}
        placeholder="Buscar productos..."
      />
      <ul className="ul-content">
        {filteredProducts.map((product) => {
          const productId = product._id || product.id || "";
          return (
            <li key={productId}>
              <div className="flex-ai-c-sb">
                <div style={{ width: "20%" }}>
                  <img
                    src={
                      product.image?.startsWith("http")
                        ? product.image
                        : `${API_URL.replace("/api", "")}${product.image}`
                    }
                    alt={product.name}
                    width="50"
                  />
                </div>
                <div style={{ width: "60%" }}>
                  <Text type="strong">{product.name}</Text> - ${product.price}
                </div>
                <div style={{ width: "10%" }}>
                  <Input
                    type="number"
                    value={quantities[productId] || "1"}
                    onChange={(e) => handleQuantityChange(e, productId)}
                    validationRules={validateSearch}
                  />
                </div>
                <div style={{ width: "15%" }}>
                  <Button onClick={() => handleAddToCart(product)}>
                    Agregar
                  </Button>
                </div>
                <div></div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
