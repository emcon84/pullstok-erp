
// import { CartItem, SaleRequest } from "../models/salesModel";
// import SaleService from "../services/saleServices";

// export const createSale = async (cart: CartItem[]) => {
//     const saleRequest: SaleRequest = {
//         products: cart.map(item => ({
//             productId: item.product._id,
//             quantity: item.quantity,
//             name: item.product.name,
//             price: item.product.price,
//             description: item.product.description,
//             category: item.product.category,
//         }))
//     };
    
//     return await SaleService.createSale(saleRequest);
// }

// export const getAllSales = async () => {
//     return await SaleService.getAllSales();
// }
