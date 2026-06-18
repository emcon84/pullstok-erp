
// src/layouts/MainLayout.tsx
import React, { ReactNode } from 'react';
import Navbar from '../components/molecules/navbar';


interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="main-layout">
      <Navbar />
      <div className="content">
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
