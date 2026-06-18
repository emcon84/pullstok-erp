import React from 'react';

//css
import "./index.css";

interface TextProps {
  level: 1 | 2 | 3 | 4; // Define los niveles de encabezado permitidos
  children: React.ReactNode; // El contenido del encabezado
  className?: string;
}

export const Title: React.FC<TextProps> = ({ level, children, className }) => {
  switch (level) {
    case 1:
      return <h1 className={className}>{children}</h1>;
    case 2:
      return <h2 className={className}>{children}</h2>;
    case 3:
      return <h3 className={className}>{children}</h3>;
    case 4:
      return <h4 className={className}>{children}</h4>;
    default:
      return <p className={className}>{children}</p>;
  }
};
