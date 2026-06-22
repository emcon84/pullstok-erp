import { Validation } from "../types";

export const columns = [
  { key: "image", title: "Imagen" },
  { key: "name", title: "Nombre" },
  { key: "description", title: "Descripción" },
  { key: "category", title: "Categoría" },
  { key: "quantity", title: "Cantidad" },
  { key: "price", title: "Precio" },
];

export const columnsSales = [
  { key: "image", title: "Imagen" },
  { key: "name", title: "Nombre" },
  { key: "quantity", title: "Cantidad" },
  { key: "price", title: "Precio" },
];

export const validateInput = (value: string, validations: Validation[]): string | null => {
  for (const validation of validations) {
    const { rule, value: ruleValue, message } = validation;
    switch (rule) {
      case 'required':
        if (!value.trim()) return message || 'Este campo es obligatorio';
        break;
      case 'email':
        // eslint-disable-next-line no-case-declarations
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return message || 'Por favor, ingresa un email válido';
        break;
      case 'minLength':
        if (value.length < ruleValue) return message || `Debe tener al menos ${ruleValue} caracteres`;
        break;
      case 'maxLength':
        if (value.length > ruleValue) return message || `Debe tener como máximo ${ruleValue} caracteres`;
        break;
      case 'pattern':
        if (!new RegExp(ruleValue).test(value)) return message || 'El formato es inválido';
        break;
      case 'custom':
        if (typeof ruleValue === 'function' && !ruleValue(value)) return message || 'La validación personalizada falló';
        break;
      case 'noSQL':
        // eslint-disable-next-line no-case-declarations
        const sqlInjectionPattern = /(\b(SELECT|UPDATE|DELETE|INSERT|WHERE|DROP|TRUNCATE|EXEC|UNION|AND|OR)\b|['";])/i;
        if (sqlInjectionPattern.test(value)) return message || 'Entrada inválida';
        break;
      default:
        break;
    }
  }
  return null;
};


