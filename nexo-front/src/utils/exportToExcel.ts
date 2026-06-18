import * as XLSX from "xlsx";

interface ExportItem {
  quantity: number;
  name: string;
  price: number;
  total: number;
}

interface ExportData {
  title: string;
  documentNumber: string;
  date: string;
  customer?: string;
  items: ExportItem[];
  total: number;
}

export const exportToExcel = (data: ExportData) => {
  // Crear datos para Excel
  const worksheetData = [
    [data.title],
    [`Número: ${data.documentNumber}`],
    [`Fecha: ${data.date}`],
  ];

  if (data.customer) {
    worksheetData.push([`Cliente: ${data.customer}`]);
  }

  worksheetData.push([]);
  worksheetData.push(["Cantidad", "Descripción", "Precio Unit.", "Total"]);

  // Agregar items
  data.items.forEach((item) => {
    worksheetData.push([
      item.quantity.toString(),
      item.name,
      item.price.toString(),
      item.total.toString(),
    ]);
  });

  // Agregar total
  worksheetData.push([]);
  worksheetData.push(["", "", "Total:", data.total.toString()]);

  // Crear libro de trabajo
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, data.title);

  // Ajustar ancho de columnas
  const colWidths = [
    { wch: 10 }, // Cantidad
    { wch: 40 }, // Descripción
    { wch: 15 }, // Precio Unit.
    { wch: 15 }, // Total
  ];
  worksheet["!cols"] = colWidths;

  // Descargar el archivo
  XLSX.writeFile(
    workbook,
    `${data.title.replace(/\s+/g, "_")}_${data.documentNumber}.xlsx`,
  );
};
