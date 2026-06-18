import "react-toastify/dist/ReactToastify.css";

import AppRoutes from "./routes";
import { ToastContainer } from "react-toastify";
import * as React from "react";

function App() {
  return (
    <React.StrictMode>
      <div className="container-app">
        <AppRoutes />
        <ToastContainer />
      </div>
    </React.StrictMode>
  );
}

export default App;
