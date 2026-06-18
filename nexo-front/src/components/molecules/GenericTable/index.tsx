import { useState, useEffect } from "react";
import { Column, DataItem } from "../../../types";
import { Card } from "../card";
import "./index.css";
import { useDeleteProduct } from "../../hooks/useProducts";
import { IoTrashOutline } from "react-icons/io5";
import { API_URL } from "../../../constants";

interface GenericTableProps {
  columns: Column[];
  data: DataItem[];
  onRowDoubleClick: (data: DataItem) => void;
}

export const GenericTable: React.FC<GenericTableProps> = ({
  columns,
  data,
  onRowDoubleClick,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [paginatedData, setPaginatedData] = useState<DataItem[]>([]);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(data.length / itemsPerPage);

  useEffect(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    setPaginatedData(data.slice(indexOfFirstItem, indexOfLastItem));
  }, [currentPage, data]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prevPage) => prevPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prevPage) => prevPage - 1);
    }
  };

  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleFirstPage = () => {
    setCurrentPage(1);
  };

  const handleLastPage = () => {
    setCurrentPage(totalPages);
  };

  const { deleteProduct, loading } = useDeleteProduct();

  const handleDelete = (productId: string) => {
    if (
      window.confirm("¿Estás seguro de que quieres eliminar este producto?")
    ) {
      deleteProduct(productId);
    }
  };

  return (
    <Card>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.title}</th>
            ))}
            <th>Acciones</th> {/* Nueva columna para acciones */}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row) => (
            <tr
              key={row._id || row.id}
              onDoubleClick={() => onRowDoubleClick(row)}
              style={{ cursor: "pointer" }}
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {column.key === "image" ? (
                    <img
                      src={
                        row[column.key]?.startsWith("http")
                          ? row[column.key]
                          : `${API_URL.replace("/api", "")}${row[column.key]}`
                      }
                      alt={row.name}
                      style={{ maxWidth: "100px" }}
                    />
                  ) : (
                    row[column.key]
                  )}
                </td>
              ))}
              <td>
                {/* Botón para eliminar producto */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const productId = row._id || row.id;
                    if (productId) handleDelete(productId);
                  }}
                  disabled={loading}
                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                >
                  <IoTrashOutline size={20} />
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Paginación */}
      <div className="pagination-container">
        <button onClick={handleFirstPage} disabled={currentPage === 1}>
          {"<<"}
        </button>
        <button onClick={handlePrevPage} disabled={currentPage === 1}>
          {"<"}
        </button>
        {Array.from({ length: totalPages }, (_, index) => (
          <button
            key={index + 1}
            onClick={() => goToPage(index + 1)}
            className={`page-number-button ${
              currentPage === index + 1 ? "active" : ""
            }`}
          >
            {index + 1}
          </button>
        ))}
        <button onClick={handleNextPage} disabled={currentPage === totalPages}>
          {">"}
        </button>
        <button onClick={handleLastPage} disabled={currentPage === totalPages}>
          {">>"}
        </button>
      </div>
    </Card>
  );
};
