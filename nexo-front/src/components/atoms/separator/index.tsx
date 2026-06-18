// Separator.tsx
import React from 'react';
import './index.css';

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  color?: string;
  thickness?: string;
  length?: string;
}

const Separator: React.FC<SeparatorProps> = ({
  orientation = 'horizontal',
  color = '#ddd',
  thickness = '2px',
  length = '100%',
}) => {
  return (
    <div
      className={`separator ${orientation}`}
      style={{
        backgroundColor: color,
        width: orientation === 'horizontal' ? length : thickness,
        height: orientation === 'horizontal' ? thickness : length,
      }}
    />
  );
};

export default Separator;
