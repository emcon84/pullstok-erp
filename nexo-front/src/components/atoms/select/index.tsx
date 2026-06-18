import React from 'react';
import './index.css'; // Asegúrate de crear este archivo CSS para estilizar el componente

// Define los tipos para las opciones del select
export interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  options: Option[]; // Opciones del select
  value: string; // Valor seleccionado
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void; // Maneja el cambio de selección
  placeholder?: string; // Texto de marcador de posición
  className?: string; // Clase CSS opcional para personalización adicional
}

// Componente Select
const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  className = '',
}) => {
  return (
    <div className={`select-container ${className}`}>
      <select
        value={value}
        onChange={onChange}
        className="select-element"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;
