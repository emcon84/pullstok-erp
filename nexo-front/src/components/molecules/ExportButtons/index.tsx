import { FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportButtonsProps {
  onExportPDF: () => void;
  onExportExcel: () => void;
  disabled?: boolean;
}

export const ExportButtons = ({
  onExportPDF,
  onExportExcel,
  disabled = false,
}: ExportButtonsProps) => {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onExportPDF}
        disabled={disabled}
        className="text-red-600 hover:text-red-700"
      >
        <FileText className="h-4 w-4" />
        PDF
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onExportExcel}
        disabled={disabled}
        className="text-emerald-600 hover:text-emerald-700"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Excel
      </Button>
    </div>
  );
};
