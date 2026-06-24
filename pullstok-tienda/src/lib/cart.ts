// Carrito client-side puro (spec: "Client-Side Cart" — sin persistencia
// server-side). nanostores + @nanostores/persistent: persiste en
// localStorage automáticamente y re-renderiza cualquier componente
// suscripto en cualquier página (Astro islands comparten el mismo store
// en memoria del browser tab).
//
// Las cantidades acá son SOLO advisory — el server SIEMPRE re-valida stock
// real en /api/store/checkout (ver design: "Cart exceeds real stock at
// submission"). Este store nunca debe ser la fuente de verdad de negocio.
import { persistentAtom } from "@nanostores/persistent";
import { computed } from "nanostores";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string | null;
  quantity: number;
  maxQuantity: number;
}

function encodeCart(items: CartItem[]): string {
  return JSON.stringify(items);
}

function decodeCart(raw: string): CartItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Key con prefijo "pullstok-tienda:" para no colisionar con otro localStorage
// del mismo dominio (ej. si en el futuro se sirve la tienda bajo el mismo
// origin que otra app).
export const cartItems = persistentAtom<CartItem[]>("pullstok-tienda:cart", [], {
  encode: encodeCart,
  decode: decodeCart,
});

export const cartCount = computed(cartItems, (items) =>
  items.reduce((sum, item) => sum + item.quantity, 0),
);

export const cartSubtotal = computed(cartItems, (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0),
);

// Agrega un producto al carrito. Si ya existe, suma la cantidad (clamped a
// maxQuantity — el stock visible al momento de agregar; el server vuelve a
// validar esto en checkout de todas formas).
export function addToCart(product: {
  productId: string;
  name: string;
  price: number;
  image: string | null;
  maxQuantity: number;
}, quantity = 1) {
  const items = cartItems.get();
  const existing = items.find((i) => i.productId === product.productId);

  if (existing) {
    const next = Math.min(existing.quantity + quantity, product.maxQuantity || existing.maxQuantity);
    cartItems.set(
      items.map((i) =>
        i.productId === product.productId ? { ...i, quantity: next, maxQuantity: product.maxQuantity } : i,
      ),
    );
  } else {
    cartItems.set([
      ...items,
      {
        productId: product.productId,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: Math.min(Math.max(quantity, 1), product.maxQuantity || quantity),
        maxQuantity: product.maxQuantity,
      },
    ]);
  }
}

export function removeFromCart(productId: string) {
  cartItems.set(cartItems.get().filter((i) => i.productId !== productId));
}

export function setItemQuantity(productId: string, quantity: number) {
  const items = cartItems.get();
  if (quantity <= 0) {
    cartItems.set(items.filter((i) => i.productId !== productId));
    return;
  }
  cartItems.set(
    items.map((i) =>
      i.productId === productId
        ? { ...i, quantity: Math.min(quantity, i.maxQuantity || quantity) }
        : i,
    ),
  );
}

export function clearCart() {
  cartItems.set([]);
}
