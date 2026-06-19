import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useUploadProductsCsv } from "../../../hooks/useUploadProductCsv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ModalContentUploadCsv = () => {
  const [file, setFile] = useState<File | null>(null);
  const { submitUpload, loading, error, success } = useUploadProductsCsv();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (file) submitUpload(file);
  };

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

      <div className="rounded-lg border border-dashed p-6 text-center">
        <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">
          {file ? file.name : "Seleccioná un archivo .csv"}
        </p>
        <div className="mt-3">
          <Input
            id="csv"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="cursor-pointer"
          />
        </div>
      </div>

      {success && (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Productos importados correctamente.
        </p>
      )}
      {error && (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Error al importar los productos.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleUpload} disabled={loading || !file}>
          <Upload className="h-4 w-4" />
          {loading ? "Subiendo..." : "Subir CSV"}
        </Button>
      </div>
    </div>
  );
};
