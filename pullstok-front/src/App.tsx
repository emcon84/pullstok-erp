import "react-toastify/dist/ReactToastify.css";

import AppRoutes from "./routes";
import { ToastContainer } from "react-toastify";
import * as React from "react";
import { ConfirmProvider } from "./components/hooks/useConfirm";
import { UpdateBanner } from "./components/molecules/UpdateBanner";

function App() {
  return (
    <React.StrictMode>
      <ConfirmProvider>
        <div>
          <AppRoutes />
          <ToastContainer
            position="bottom-left"
            theme="dark"
            newestOnTop
            closeOnClick
            draggable={false}
          />
          <UpdateBanner />
        </div>
      </ConfirmProvider>
    </React.StrictMode>
  );
}

export default App;
