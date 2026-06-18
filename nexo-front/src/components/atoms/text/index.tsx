import React from 'react';

//css
import "./index.css";

interface TextProps {
  type: 'p' | 'span' | 'strong';
  children: React.ReactNode;
  className?: string;
}

export const Text: React.FC<TextProps> = ({ type, children, className }) => {
  switch (type) {
    case 'p':
      return <p className={className}>{children}</p>;
    case 'span':
      return <span className={className}>{children}</span>;
    case 'strong':
      return <strong className={className}>{children}</strong>;   
    default:
      return <p className={className}>{children}</p>;
  }
};
