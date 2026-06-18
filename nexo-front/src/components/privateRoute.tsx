// src/components/PrivateRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface PrivateRouteProps {
  element: JSX.Element;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ element }) => {
  const isAuthenticated = !!localStorage.getItem('token'); // Aquí puedes usar tu método de autenticación
  const location = useLocation();

  return isAuthenticated ? element : <Navigate to="/" state={{ from: location }} />;
};

export default PrivateRoute;
