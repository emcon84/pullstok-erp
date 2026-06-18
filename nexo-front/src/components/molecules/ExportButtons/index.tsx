import React from "react";
import { Button } from "../button";
import { FaFilePdf, FaFileExcel } from "react-icons/fa";

interface ExportButtonsProps {
  onExportPDF: () => void;
  onExportExcel: () => void;
  disabled?: boolean;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExportPDF,
  onExportExcel,
  disabled = false,
}) => {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <Button
        onClick={onExportPDF}
        disabled={disabled}
        iconLeft={<FaFilePdf style={{ marginRight: 5 }} />}
        style={{
          background: "var(--error-color)",
          padding: "8px 16px",
          fontSize: "14px",
        }}
      >
        PDF
      </Button>
      <Button
        onClick={onExportExcel}
        disabled={disabled}
        iconLeft={<FaFileExcel style={{ marginRight: 5 }} />}
        style={{
          background: "var(--success-color)",
          padding: "8px 16px",
          fontSize: "14px",
        }}
      >
        Excel
      </Button>
    </div>
  );
};
