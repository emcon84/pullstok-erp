import { ProductCsvUploadForm } from "../../ProductCsvUploadForm";

export const ModalContentUploadCsv = () => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Importar productos
        </h2>
        <p className="text-sm text-muted-foreground">
          Subí un archivo CSV con tus productos (nombre, precio, categoría,
          cantidad).
        </p>
      </div>

      <ProductCsvUploadForm />
    </div>
  );
};
