import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export const exportToPDF = (data: ExportData) => {
  const doc = new jsPDF();

  // Título
  doc.setFontSize(20);
  doc.text(data.title, 14, 22);

  // Información del documento
  doc.setFontSize(12);
  doc.text(`Número: ${data.documentNumber}`, 14, 32);
  doc.text(`Fecha: ${data.date}`, 14, 39);
  if (data.customer) {
    doc.text(`Cliente: ${data.customer}`, 14, 46);
  }

  // Tabla de productos
  autoTable(doc, {
    startY: data.customer ? 52 : 45,
    head: [["Cantidad", "Descripción", "Precio Unit.", "Total"]],
    body: data.items.map((item) => [
      item.quantity.toString(),
      item.name,
      `$${item.price.toFixed(2)}`,
      `$${item.total.toFixed(2)}`,
    ]),
    foot: [["", "", "Total:", `$${data.total.toFixed(2)}`]],
    theme: "grid",
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold",
      fontSize: 12,
    },
  });

  // Descargar el PDF
  doc.save(`${data.title.replace(/\s+/g, "_")}_${data.documentNumber}.pdf`);
};
