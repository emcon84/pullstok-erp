import React, { ChangeEvent, useState, useEffect } from "react";
import "./index.css";
import { validateInput } from "../../../helpers";
import { Validation } from "../../../types";

interface InputProps {
  type?: string;
  label?: string;
  placeholder?: string;
  value: string;
  name?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  validationRules?: Validation[]; // Usando el nuevo tipo de validación
  textError?: string;
}

export const Input: React.FC<InputProps> = ({
  type = "text",
  placeholder = "",
  value,
  label,
  name,
  onChange,
  validationRules = [], // Inicializamos como un array vacío
}) => {
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<boolean>(false);

  useEffect(() => {
    // Solo validar si el campo ha sido tocado
    if (touched && validationRules.length > 0) {
      const validationError = validateInput(value, validationRules);
      setError(validationError);
    }
  }, [value, validationRules, touched]);

  const handleBlur = () => {
    setTouched(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {label && <label className="label">{label}</label>}
      <input
        className="input"
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={handleBlur}
      />
      {/* Mostrar mensaje de error estilizado si existe y el campo fue tocado */}
      {touched && error && <span className="error">{error}</span>}
    </div>
  );
};
