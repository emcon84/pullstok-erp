import React from 'react';
import './index.css'; // Asegúrate de crear este archivo con el CSS correspondiente

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  return (
    <div className="pagination-container">
      <button 
        className="pagination-button"
        onClick={() => handlePageChange(1)}
        disabled={currentPage === 1}
      >
        Inicio
      </button>
      <button 
        className="pagination-button"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Anterior
      </button>
      {[...Array(totalPages)].map((_, index) => (
        <button 
          key={index} 
          className={`pagination-button ${currentPage === index + 1 ? 'active' : ''}`} 
          onClick={() => handlePageChange(index + 1)}
        >
          {index + 1}
        </button>
      ))}
      <button 
        className="pagination-button"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Siguiente
      </button>
      <button 
        className="pagination-button"
        onClick={() => handlePageChange(totalPages)}
        disabled={currentPage === totalPages}
      >
        Final
      </button>
    </div>
  );
};
