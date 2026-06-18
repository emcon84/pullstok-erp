import React from 'react';
import './index.css';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> =({
  children,
  onClick,
  disabled = false,
  className = "",
  type = "button",
  style = {},
  iconLeft,
  iconRight,
  loading,
}) => {
   return (
     <button
      className={`button ${className}`}
      onClick={onClick}
      disabled={disabled}
      type={type}
      style={style}
     >
        {iconLeft || !loading  ? iconLeft : <span className="loader_button"></span>} 
        {children}
        {iconRight ? iconRight : null}
     </button>
   )
}