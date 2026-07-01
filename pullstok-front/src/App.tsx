import "react-toastify/dist/ReactToastify.css";

import AppRoutes from "./routes";
import { ToastContainer } from "react-toastify";
import * as React from "react";
import { ConfirmProvider } from "./components/hooks/useConfirm";

function App() {
  return (
    <React.StrictMode>
      <ConfirmProvider>
        <div>
          <AppRoutes />
          <ToastContainer />
        </div>
      </ConfirmProvider>
    </React.StrictMode>
  );
}

export default App;
