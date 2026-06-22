declare module "jspdf-autotable" {
  import jsPDF from "jspdf";

  export interface RowInput {
    [key: string]: any;
  }

  export interface UserOptions {
    head?: RowInput[];
    body?: RowInput[];
    foot?: RowInput[];
    startY?: number;
    margin?:
      | number
      | { top?: number; right?: number; bottom?: number; left?: number };
    pageBreak?: "auto" | "avoid" | "always";
    theme?: "striped" | "grid" | "plain";
    styles?: any;
    headStyles?: any;
    bodyStyles?: any;
    footStyles?: any;
    alternateRowStyles?: any;
    columnStyles?: any;
    [key: string]: any;
  }

  export default function autoTable(doc: jsPDF, options: UserOptions): jsPDF;
}

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: import("jspdf-autotable").UserOptions) => jsPDF;
    lastAutoTable?: {
      finalY: number;
    };
  }
}
