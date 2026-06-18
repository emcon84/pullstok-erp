import { Link } from "react-router-dom";

import "./index.css";
import { LogoIcon } from "../../../assets/logo";
import { Button } from "../button";
import { logout } from "../../../controllers/authController";
import { IoMdExit } from "react-icons/io";

const Navbar = () => {
  return (
    <nav className="nav">
      <div>
        <ul className="nav_ul">
          <LogoIcon />
          <li className="nav_li">
            <Link to="/dashboard" className="nav_link">
              Dashboard
            </Link>
          </li>
          <li className="nav_li">
            <Link to="/presupuestos" className="nav_link">
              Presupuestos
            </Link>
          </li>
          <li className="nav_li">
            <Link to="/pedidos" className="nav_link">
              Pedidos
            </Link>
          </li>
          <li className="nav_li">
            <Link to="/Ventas" className="nav_link">
              Ventas
            </Link>
          </li>
          <li className="nav_li">
            <Link to="/facturas" className="nav_link">
              Remitos
            </Link>
          </li>
          <li className="nav_li">
            <Link to="/Clientes" className="nav_link">
              Clientes
            </Link>
          </li>
        </ul>
      </div>
      <div>
        <Button
          className="nav_button"
          onClick={() => logout()}
          iconLeft={<IoMdExit style={{ marginRight: 5 }} size={24} />}
        >
          Salir
        </Button>
      </div>
    </nav>
  );
};

export default Navbar;
