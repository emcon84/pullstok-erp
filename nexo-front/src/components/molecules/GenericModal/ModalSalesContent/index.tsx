
import { ProductsProps } from "../../../../models/productsModel";
import Separator from "../../../atoms/separator";
import { Title } from "../../../atoms/title";
import { SalesList } from "../../SalesList";

interface ModalSalesContentProps {
  products: ProductsProps[];
  closeModalSales: () => void;
  getProducts: () => void; 
}



export const ModalSalesContent: React.FC<ModalSalesContentProps> =({products, closeModalSales, getProducts}) => {
   return (
     <div>
       <Title level={3} className="text-bold" >Listado de Productos</Title>
       <Separator orientation="horizontal" color="#ccc" thickness="1px" />
       <SalesList products={products} closeModalSales={closeModalSales} getProducts={getProducts}/>
       <br />
       
     </div>
   )
}