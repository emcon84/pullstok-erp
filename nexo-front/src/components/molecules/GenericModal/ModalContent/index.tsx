import { useState } from "react";
import { IoMdCheckboxOutline, IoMdCloseCircleOutline } from "react-icons/io";
import { Input } from "../../../atoms/inputs";
import { Title } from "../../../atoms/title";
import { Button } from "../../button";
import { toast } from "react-toastify";
import { API_URL } from "../../../../constants";
import { ProductsProps } from "../../../../models/productsModel";
import { useCreateProduct } from "../../../hooks/useProducts";
import { DataItem, Validation } from "../../../../types";
import { updateProduct } from "../../../../services/productService";
import { useQueryClient } from "@tanstack/react-query";

interface ModalEditContentProps {
  selectedData?: DataItem | null;
  setSelectedData: React.Dispatch<React.SetStateAction<DataItem | null>>;
  closeModalEdit: () => void;
}

export const ModalContent: React.FC<ModalEditContentProps> = ({
  selectedData,
  setSelectedData,
  closeModalEdit,
}) => {
  const [image, setImage] = useState<File | null>(null);
  const { createProduct, loading } = useCreateProduct(); // Usa el hook para crear producto

  const queryClient = useQueryClient();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedData((prevData: any) => {
      if (prevData) {
        return { ...prevData, [name]: value };
      } else {
        return { [name]: value } as unknown as ProductsProps;
      }
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (selectedData) {
      try {
        let imageUrl = selectedData.image || ""; // Usa la imagen existente si no se selecciona una nueva

        if (image) {
          const formData = new FormData();
          formData.append("image", image);
          const response = await fetch(`${API_URL}/image/upload`, {
            method: "POST",
            body: formData,
          });
          const data = await response.json();
          imageUrl = data.url; // Actualiza la URL de la imagen solo si se sube una nueva
        }

        const productData = {
          ...selectedData,
          image: imageUrl,
          price: parseFloat(selectedData.price?.toString() || "0"),
          quantity: parseInt(selectedData.quantity?.toString() || "0"),
        };

        const productId = selectedData._id || selectedData.id;

        if (productId) {
          await updateProduct(productData);
          queryClient.invalidateQueries({ queryKey: ["products"] });
        } else {
          await createProduct(productData);
          queryClient.invalidateQueries({ queryKey: ["products"] });
        }

        closeModalEdit();
        toast.success(
          productId
            ? "Producto actualizado correctamente"
            : "Producto agregado correctamente",
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        toast.error(errorMessage);
      }
    }
  };

  const nameValidations: Validation[] = [
    { rule: "required", message: "El nombre es obligatorio" },
    { rule: "noSQL", message: "Entrada inválida" },
  ];
  const descValidations: Validation[] = [
    { rule: "noSQL", message: "Entrada inválida" },
  ];
  const catValidations: Validation[] = [
    { rule: "noSQL", message: "Entrada inválida" },
  ];
  const cantValidations: Validation[] = [
    { rule: "required", message: "La cantidad es obligatoria" },
    { rule: "noSQL", message: "Entrada inválida" },
  ];
  const priceValidations: Validation[] = [
    { rule: "required", message: "El precio es obligatorio" },
    { rule: "noSQL", message: "Entrada inválida" },
  ];

  return (
    <div>
      <Title level={3} className="header">
        {selectedData?._id ? "Editar Producto" : "Agregar Producto"}
      </Title>
      <hr />
      <br />

      {selectedData?.image && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src={
              selectedData.image.startsWith("http")
                ? selectedData.image
                : `${API_URL.replace("/api", "")}${selectedData.image}`
            }
            alt="Product Image"
            style={{ width: "200px", height: "200px", marginBottom: "10px" }}
          />
        </div>
      )}

      <Input
        type="text"
        label="Nombre"
        name="name"
        placeholder="agregue un nombre"
        value={selectedData?.name || ""}
        onChange={handleChange}
        validationRules={nameValidations}
      />
      <br />
      <Input
        type="text"
        label="Descripción"
        name="description"
        placeholder="Agregue una descripción"
        value={selectedData?.description || ""}
        onChange={handleChange}
        validationRules={descValidations}
      />
      <br />
      <Input
        type="text"
        label="Categoría"
        name="category"
        placeholder="agregue una categoría"
        value={selectedData?.category || ""}
        onChange={handleChange}
        validationRules={catValidations}
      />
      <br />
      <div style={{ display: "flex", gap: 20 }}>
        <Input
          type="text"
          label="Cantidad"
          name="quantity"
          placeholder="agregue una cantidad"
          value={selectedData?.quantity?.toString() || ""}
          onChange={handleChange}
          validationRules={cantValidations}
        />
        <br />
        <Input
          type="text"
          label="Precio"
          name="price"
          placeholder="agregue un precio"
          value={selectedData?.price?.toString() || ""}
          onChange={handleChange}
          validationRules={priceValidations}
        />
      </div>
      <br />
      <input type="file" name="image" onChange={handleImageChange} />
      <br />
      <br />
      <div style={{ display: "flex", gap: 20, justifyContent: "flex-end" }}>
        <Button
          onClick={closeModalEdit}
          iconLeft={
            <IoMdCloseCircleOutline style={{ marginRight: 5 }} size={24} />
          }
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          iconLeft={
            <IoMdCheckboxOutline style={{ marginRight: 5 }} size={24} />
          }
          className="bg-green-500"
          disabled={loading}
        >
          Aceptar
        </Button>
      </div>
    </div>
  );
};
