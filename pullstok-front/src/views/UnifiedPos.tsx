import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Landmark, ShoppingCart, PackageOpen, PackagePlus, Minus, Plus } from "lucide-react";
import { toast } from "react-toastify";
import { API_URL } from "@/constants";
import { VendorCatalogTab } from "@/components/organisms/VendorCatalogTab";
import { LooseSellTab } from "@/components/organisms/LooseSellTab";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { VendorOrderPanel, type VendorOrderPanelApi } from "@/components/molecules/VendorOrderPanel";
import { OpenBagDialog } from "@/components/molecules/OpenBagDialog";
import { ManualProductDialog } from "@/components/molecules/ManualProductDialog";
import { PrintTicketDialog } from "@/components/molecules/PrintTicketDialog";
import { useBranches } from "@/components/hooks/useBranches";
import { useBrandingContext } from "@/contexts/BrandingContext";
import { printSaleTicket, resolveTicketCompany } from "@/utils/saleTicket";
import ticketLogoUrl from "@/assets/LogoConCirculoNegro.svg";
import { Loader } from "@/components/atoms/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { imgSrc, effectivePrice, computePerUnitPrice } from "@/components/hooks/vendorCatalogHelpers";
import { getMe } from "@/services/onboardingService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DataItem } from "@/types";

type Tab = "unidad" | "suelto";

/** Espera tras cerrar el diálogo de ticket antes de imprimir (directo o panel). */
const PRINT_AFTER_CLOSE_MS = 300;

// Producto devuelto por GET /products/by-scan (rama no-balanza) que se muestra
// en el modal de confirmación antes de sumarlo como BOLSA_CERRADA al pedido.
interface ScannedProduct {
  id?: string;
  _id?: string;
  name: string;
  price?: number | string;
  code?: string | null;
  barcode?: string | null;
  image?: string | null;
  category?: { name?: string } | null;
  quantity?: number | string;
  priceKgSuelto?: number | null;
  unitsPerBox?: number | null;
  wholesalePrice?: number | string | null;
}

interface UnifiedPosProps {
  branchId: string;
}

/**
 * POS unificado del vendedor: UNA sola venta con dos pestañas que comparten el
 * MISMO carrito, y un PANEL de pedido siempre visible a la derecha.
 * - "Por unidad": catálogo de bolsas con carga inline (VendorCatalogTab).
 * - "Suelto": planilla marca × tipo → celda (LooseSellTab).
 * Un único carrito (useVendorCart), un solo checkout y un panel fijo que
 * muestra y cierra el pedido MIXTO (BOLSA_CERRADA + POR_PESO/POR_MONTO).
 */
export const UnifiedPos = ({ branchId }: UnifiedPosProps) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("unidad");

  // Producto de BOLSA CERRADA escaneado, pendiente de confirmación en el modal.
  // null = sin modal abierto. La rama balanza (isScale) NO pasa por acá: se
  // agrega directo al pedido (flujo suelto intacto).
  const [scanProduct, setScanProduct] = useState<ScannedProduct | null>(null);
  // Cantidad a agregar del producto escaneado (bolsa cerrada). Arranca en 1 y
  // se reinicia en cada escaneo nuevo — el input la recibe con foco para que
  // el operador pueda tipear la cantidad (ej. pouches/latas x3) y confirmar
  // con Enter, sin soltar el teclado.
  const [scanQty, setScanQty] = useState(1);

  // sdd/venta-pastillas-sueltas-blister — switch "Vender pastillas sueltas"
  // del modal de escaneo (SOLO categoría FARMACIA). `piecesPerBlister` es el
  // conteo AD-HOC que carga el vendedor (no viene de catálogo); `scanQty`
  // reusa el stepper existente como "cantidad de pastillas a vender".
  const [sellLooseBlister, setSellLooseBlister] = useState(false);
  const [piecesPerBlister, setPiecesPerBlister] = useState(0);

  // Modal de "Abrir bolsa" - flujo para abrir bolsas y creditar kg a celda suelta
  const [openBagDialogOpen, setOpenBagDialogOpen] = useState(false);

  // Modal "Producto manual": el vendedor carga nombre + precio de algo que no
  // encuentra; se crea en el server y se suma al pedido como BOLSA_CERRADA.
  const [manualOpen, setManualOpen] = useState(false);

  // Modal de pago: lo abre la tecla V (listado y panel) y el botón Vender.
  const [paymentOpen, setPaymentOpen] = useState(false);
  const openPayment = useCallback(() => setPaymentOpen(true), []);

  // Precio mayorista: cache-hit de ["me"] (ProtectedLayout ya lo trajo), no
  // dispara un request nuevo.
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const sellsWholesale = me?.sellsWholesale ?? false;

  // Encabezado del ticket térmico: logo/nombre del branding, CUIT/condición y
  // dirección/teléfono de la organización (cache de ["me"]). La sucursal
  // (dirección/teléfono propios) solo la puede listar ADMIN/MANAGEMENT
  // (GET /branches); para el resto queda deshabilitada y rige la organización.
  const { branding } = useBrandingContext();
  const canListBranches = me?.role === "ADMIN" || me?.role === "MANAGEMENT";
  const { branches } = useBranches(canListBranches);
  const ticketCompany = resolveTicketCompany({
    businessName: branding.displayName,
    // Logo negro empaquetado en la app: mismo origen (sin CORS) y oscuro sobre
    // transparente, que es lo que se ve en papel térmico. El logo de branding
    // está pensado para el tema oscuro y no se imprime bien.
    logoUrl: ticketLogoUrl,
    org: me?.organization,
    branch: branches.find((b) => b.id === branchId),
  });

  // Carrito ÚNICO de todo el POS (compartido entre ambas pestañas vía props).
  const cart = useVendorCart();
  const checkout = useVendorCheckout({
    branchId,
    cartItems: cart.items,
    clearCart: cart.clearCart,
    totalAmount: cart.totalAmount,
    ticketCompany,
  });
  // Caja OPEN del vendedor (R8/R9): GATE — sin caja abierta no se puede vender
  // ni guardar pedido; también se propaga al confirmar la venta.
  const { session: currentSession, loading: cashLoading } = useGetCurrentCashSession(branchId);

  // ── Navegación por teclado entre el listado y el panel de pedido ──
  // El listado (tab) y el panel se registran acá para saltar de zona con las
  // flechas: ↓ en la última fila → panel; ↑ en el primer control → listado.
  const panelApiRef = useRef<VendorOrderPanelApi | null>(null);
  const gridApiRef = useRef<{ focusSelectedRow: () => void; clearSearch?: () => void } | null>(null);

  const focusPanelFirst = useCallback(() => {
    panelApiRef.current?.focusFirstControl();
  }, []);

  const exitToGrid = useCallback(() => {
    gridApiRef.current?.focusSelectedRow();
  }, []);

  // "¿Imprimir ticket?": Sí imprime y cierra; No solo cierra. La venta ya se
  // confirmó, así que nada de esto puede afectarla.
  // window.print() bloquea el hilo mientras el navegador muestra su panel: si se
  // llama con el diálogo todavía en pantalla, la animación de salida nunca
  // termina y queda abierto. Por eso se cierra PRIMERO y se imprime cuando ya
  // se fue (PRINT_AFTER_CLOSE_MS > duración de la animación de salida).
  const { pendingTicket, dismissTicket } = checkout;
  const handlePrintTicket = useCallback(() => {
    const ticket = pendingTicket;
    dismissTicket();
    if (!ticket) return;
    setTimeout(() => {
      try {
        // Puede ser síncrona o devolver una promesa: se atrapan ambas.
        Promise.resolve(printSaleTicket(ticket)).catch(() => {});
      } catch {
        // La venta ya está confirmada: un fallo de impresión no la afecta.
      }
    }, PRINT_AFTER_CLOSE_MS);
  }, [pendingTicket, dismissTicket]);

  const registerGridApi = useCallback(
    (api: { focusSelectedRow: () => void; clearSearch?: () => void }) => {
      gridApiRef.current = api;
    },
    [],
  );

  // Producto manual ya creado en el server → línea BOLSA_CERRADA del pedido.
  // stock 0: el server no valida stock de manuales (isManual) y el carrito no
  // topea esa línea.
  const { addToCart } = cart;
  const handleManualCreated = useCallback(
    (product: DataItem, quantity: number) => {
      addToCart(
        { ...product, _id: product._id ?? product.id, isManual: true, quantity: 0, category: "" },
        quantity,
        branchId,
        0,
        "BOLSA_CERRADA",
      );
      toast.success(`${product.name} agregado`);
    },
    [addToCart, branchId],
  );

  // Tecla T: alterna entre "Por unidad" y "Suelto".
  const toggleTab = useCallback(() => {
    setTab((t) => (t === "unidad" ? "suelto" : "unidad"));
  }, []);

  // ── Escaneo de la pistola (balanza / barcode) ──
  // La pistola USB HID emula teclado: tipea los dígitos y manda Enter. Acá
  // capturamos un run de dígitos terminado en Enter, llamamos a /by-scan y:
  //  - etiqueta de balanza (isScale) → agrega el producto con POR_PESO y el
  //    peso en kg (el backend calculó total = peso × precio/kg). FLUJO INTACTO.
  //  - código normal (bolsa cerrada) → NO agrega en el acto: abre un modal de
  //    confirmación con el producto y su precio; recién al confirmar se suma
  //    como BOLSA_CERRADA (qty 1).
  const handleScan = useCallback(
    async (barcode: string) => {
      if (!barcode || !/^[0-9A-Za-z]+$/.test(barcode)) return;
      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(
          `${API_URL}/products/by-scan/${encodeURIComponent(barcode)}`,
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
        );
        if (res.status === 404) {
          toast.error("Producto no encontrado para ese código");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Error al procesar el código" }));
          toast.error(err.message || "Error al procesar el código");
          return;
        }
        const data = await res.json();

        if (data.isScale) {
          cart.addToCart(
            {
              _id: data.cell.id,
              id: data.cell.id,
              name: data.looseName,
              price: data.priceKg,
              priceKgSuelto: data.priceKg,
              quantity: 0,
              category: "",
            },
            data.weightKg,
            branchId,
            0, // stock lo resuelve el backend (LooseStock de la celda)
            "POR_PESO",
            data.priceKg,
            data.cell.id, // loosePriceId = celda de la planilla
            data.looseName,
          );
          toast.success(
            `${data.looseName}: ${data.weightKg.toFixed(3)} kg → $${(data.total ?? 0).toLocaleString("es-AR")}`,
          );
        } else {
          // Bolsa cerrada: abrimos el modal de confirmación con producto+precio
          // en lugar de sumar directo. La balanza (isScale) NUNCA llega acá.
          // Si es EL MISMO producto que ya está en el modal (mismo id), el
          // escaneo repetido suma como conteo en vez de resetear la cantidad
          // — es el "chiche" de escanear 3 veces la misma bolsa y que quede
          // cantidad 3, en vez de tener que tocar el stepper a mano.
          const newProduct = data.product;
          const prevId = scanProduct ? scanProduct._id || scanProduct.id : null;
          const newId = newProduct._id || newProduct.id;
          if (scanProduct && prevId && prevId === newId) {
            const stock = Number(newProduct.quantity ?? 0);
            const maxQty = stock > 0 ? stock : 999;
            setScanQty((q) => Math.min(q + 1, maxQty));
          } else {
            setScanQty(1);
            setScanProduct(newProduct);
            setSellLooseBlister(false);
            setPiecesPerBlister(0);
          }
        }
      } catch (e: any) {
        toast.error(e?.message || "Error al escanear");
      }
    },
    [cart, branchId, scanProduct],
  );

  // ── Modal de confirmación de bolsa cerrada escaneada ──
  const handleCancelScan = useCallback(() => {
    setScanProduct(null);
    setSellLooseBlister(false);
    setPiecesPerBlister(0);
  }, []);

  // sdd/venta-pastillas-sueltas-blister: switch activo (SOLO FARMACIA) → la
  // línea se agrega POR_UNIDAD_BLISTER con el conteo ad-hoc de piecesPerBlister;
  // requiere piecesPerBlister entero > 1 (mismo criterio que el server, T1).
  const isFarmacia = scanProduct?.category?.name === "FARMACIA";
  const isBlisterSale = isFarmacia && sellLooseBlister;
  const piecesPerBlisterValid = Number.isInteger(piecesPerBlister) && piecesPerBlister > 1;

  const handleConfirmScan = useCallback(() => {
    if (!scanProduct) return;
    if (isBlisterSale && !piecesPerBlisterValid) return;
    const p = scanProduct;
    cart.addToCart(
      {
        _id: p._id || p.id,
        id: p.id,
        name: p.name,
        price: p.price ?? 0,
        wholesalePrice: p.wholesalePrice ?? null,
        priceKgSuelto: p.priceKgSuelto ?? null,
        quantity: 0,
        category: p.category?.name ?? "",
        image: p.image ?? undefined,
        code: p.code ?? "",
        unitsPerBox: p.unitsPerBox ?? null,
      },
      scanQty,
      branchId,
      Number(p.quantity ?? 0),
      isBlisterSale ? "POR_UNIDAD_BLISTER" : "BOLSA_CERRADA",
      undefined,
      undefined,
      undefined,
      sellsWholesale,
      // Solo se manda el 10º argumento en la venta de blister: mantiene el
      // call-site de BOLSA_CERRADA con la misma aridad de siempre (los tests
      // existentes verifican la lista exacta de argumentos).
      ...(isBlisterSale ? [piecesPerBlister] : []),
    );
    toast.success(`${p.name} agregado`);
    setScanProduct(null);
    setSellLooseBlister(false);
    setPiecesPerBlister(0);
  }, [cart, branchId, scanProduct, scanQty, sellsWholesale, isBlisterSale, piecesPerBlisterValid, piecesPerBlister]);

  // Capturador global (fase CAPTURE) del patrón de la pistola. Acepta dígitos
  // Y letras (nuestros códigos internos BLST#####/INT##### son alfanuméricos,
  // no solo EAN-13/balanza numéricos) + Enter, run de al menos 6 caracteres.
  // Reset si hay pausas largas. Texto corto tipeado a mano no se intercepta.
  // IMPORTANTE: Si el diálogo "Abrir bolsa" está abierto, NO interceptamos
  // el escaneo para que el input del diálogo reciba el código de barras. Lo
  // mismo con "Producto manual": el nombre tipeado rápido + Enter (>= 6
  // caracteres) se confundiría con un escaneo.
  useEffect(() => {
    if (openBagDialogOpen || manualOpen) return; // El diálogo maneja su propio input
    let buffer = "";
    let lastKeyAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastKeyAt;
      if (gap > 400) buffer = "";
      lastKeyAt = now;

      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= 6 && /^[0-9A-Za-z]+$/.test(code)) {
          e.preventDefault();
          e.stopPropagation();
          // El primer caracter de la ráfaga puede haberse escrito en el input
          // enfocado (buscador). Limpiamos el buscador para que no quede mezclado.
          gridApiRef.current?.clearSearch?.();
          void handleScan(code);
        }
        return;
      }
      if (/^[0-9A-Za-z]$/.test(e.key)) {
        // La pistola manda los caracteres en ráfaga muy rápida (<60ms). Si ya
        // hay buffer (escaneo en curso) y el caracter llega en ráfaga, lo
        // prevenimos para que NO se escriba en el input enfocado (buscador) y
        // no se mezcle con lo que el operador tipea. El tipeo humano (más
        // lento, >100ms) no se intercepta.
        if (buffer.length > 0 && gap < 60) {
          e.preventDefault();
          e.stopPropagation();
        }
        buffer += e.key;
      } else if (e.key.length > 1) {
        // Teclas con nombre largo (Shift, Control, CapsLock, Alt, Meta...) no
        // son caracteres: para tipear/escanear una MAYÚSCULA (los códigos
        // internos BLST#####/INT##### empiezan con letras) el teclado manda un
        // keydown de Shift ANTES de la letra. Si tratábamos eso como "carácter
        // inválido" el buffer se reseteaba justo antes de cada letra mayúscula
        // y el código nunca se armaba completo — ni con la pistola ni tipeando
        // a mano. Se ignoran (no tocan el buffer), no se tratan como reset.
      } else {
        buffer = "";
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleScan, openBagDialogOpen, manualOpen]);

  // Teclas +/- del teclado para ajustar la cantidad del modal de escaneo sin
  // mouse. Solo mientras el modal está abierto (scanProduct), y en captura
  // para ganarle a cualquier otro listener; no interfiere con el detector de
  // la pistola de arriba porque ese ignora "+"/"-" (solo mira dígitos/Enter).
  useEffect(() => {
    if (!scanProduct) return;
    const stock = Number(scanProduct.quantity ?? 0);
    const maxQty = stock > 0 ? stock : 999;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        e.preventDefault();
        e.stopPropagation();
        setScanQty((q) => Math.min(maxQty, q + 1));
      } else if (e.key === "-" || e.code === "NumpadSubtract") {
        e.preventDefault();
        e.stopPropagation();
        setScanQty((q) => Math.max(1, q - 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [scanProduct]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "unidad", label: "Por unidad" },
    { id: "suelto", label: "Suelto" },
  ];

  // ── Gate: la caja del día debe estar abierta para vender/guardar pedidos ──
  if (cashLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (!currentSession) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Landmark className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Caja no abierta</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Para vender o guardar pedidos necesitás tener abierta la caja del día
            en esta sucursal.
          </p>
        </div>
        <Button onClick={() => navigate("/caja")}>Abrir caja</Button>
      </div>
    );
  }

  return (
    <>
      {/* En "Suelto" la planilla tiene ancho máximo (56rem = max-w-4xl): el
          espacio sobrante (p. ej. al colapsar la sidebar) lo toma el panel de
          pedido en vez de quedar como margen vacío entre ambos. */}
      <div
        className={cn(
          "grid gap-6 lg:items-start",
          tab === "suelto"
            ? "lg:grid-cols-[minmax(0,56rem)_minmax(360px,1fr)]"
            : "lg:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
      {/* ── Columna izquierda: header + tabs + contenido ── */}
      <div className="min-w-0 space-y-4 lg:flex lg:h-[calc(100vh_-_2rem)] lg:flex-col lg:space-y-0 lg:overflow-hidden">
        <div className="space-y-4 lg:shrink-0">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Nueva venta</h1>
            <p className="text-sm text-muted-foreground">
              Vendé por unidad o suelto desde el mismo pedido
            </p>
          </div>

          {/* ── Segmented tabs + Abrir bolsa button ── */}
          <div className="flex items-center gap-3">
            <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    tab === t.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "unidad" && (
              <Button
                onClick={() => setOpenBagDialogOpen(true)}
                className="whitespace-nowrap"
                aria-label="Abrir bolsa"
              >
                <PackageOpen className="h-4 w-4 mr-2" />
                Abrir bolsa
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setManualOpen(true)}
              className="whitespace-nowrap"
              aria-label="Producto manual"
            >
              <PackagePlus className="h-4 w-4 mr-2" />
              Producto manual
            </Button>
          </div>
        </div>

        {/* ── Pestaña activa. En desktop la columna queda fija y es la LISTA la
             que scrollea internamente (buscador/filtros fijos arriba) ── */}
        <div className="min-h-0 lg:flex-1 lg:flex lg:flex-col lg:pr-1">
          {tab === "unidad" ? (
            <VendorCatalogTab
              branchId={branchId}
              cart={cart}
              onSaveOrder={checkout.handleSaveOrder}
              onConfirmSale={openPayment}
              onEnterPanel={focusPanelFirst}
              onToggleTab={toggleTab}
              registerGridApi={registerGridApi}
            />
          ) : (
            <LooseSellTab
              branchId={branchId}
              cart={cart}
              onSaveOrder={checkout.handleSaveOrder}
              onConfirmSale={openPayment}
              onEnterPanel={focusPanelFirst}
              onToggleTab={toggleTab}
              registerGridApi={registerGridApi}
            />
          )}
        </div>
      </div>

      {/* ── Columna derecha: panel de pedido SIEMPRE visible ── */}
      <VendorOrderPanel
        cart={cart}
        status={{
          confirming: checkout.confirming,
          savingOrder: checkout.savingOrder,
        }}
        saveOrder={checkout.handleSaveOrder}
        confirmSale={checkout.handleConfirmSale}
        cashSessionId={currentSession?.id}
        apiRef={panelApiRef}
        onExitToGrid={exitToGrid}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        className="lg:sticky lg:top-4 lg:max-h-[calc(100vh_-_2rem)]"
      />
    </div>

    {/* ── Modal de confirmación de bolsa cerrada escaneada ── */}
    <Dialog open={!!scanProduct} onOpenChange={(open) => !open && handleCancelScan()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{scanProduct?.name}</DialogTitle>
          <DialogDescription>
            Producto escaneado — confirmá para sumarlo al pedido
          </DialogDescription>
        </DialogHeader>

        {scanProduct?.image && imgSrc(scanProduct.image) && (
          <div className="flex justify-center">
            <img
              src={imgSrc(scanProduct.image)!}
              alt={scanProduct.name}
              className="h-32 w-32 object-cover rounded-lg"
            />
          </div>
        )}

        {(scanProduct?.code || scanProduct?.barcode) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {scanProduct.code && (
              <p>
                Código:{" "}
                <span className="font-medium text-foreground">{scanProduct.code}</span>
              </p>
            )}
            {scanProduct.barcode && (
              <p>
                Código de barras:{" "}
                <span className="font-medium text-foreground">{scanProduct.barcode}</span>
              </p>
            )}
          </div>
        )}

        {/* Stepper de cantidad + total (cantidad × precio) en una sola caja.
            El input SIN autoFocus a propósito: el botón "Agregar al pedido"
            es el que queda enfocado (como antes), así seguir escaneando con
            el modal abierto sigue reemplazando el producto normalmente en
            vez de filtrar dígitos acá. Si el operador toca el campo o los
            +/− a propósito para poner una cantidad (ej. pouches/latas x3),
            Enter o el botón confirman igual. type="text" + maxLength (no
            type="number") pone un techo duro de caracteres a nivel DOM por
            si algo se filtra estando el campo enfocado, y el clamp contra
            el stock es la segunda barrera. */}
        {/* sdd/venta-pastillas-sueltas-blister: switch SOLO para FARMACIA. Al
            activarlo se pide "Pastillas por blister" y el stepper de cantidad
            de arriba pasa a representar "cantidad de pastillas a vender". */}
        {isFarmacia && (
          <div className="flex items-center gap-2">
            <Switch
              id="sell-loose-blister"
              checked={sellLooseBlister}
              onCheckedChange={(v) => {
                setSellLooseBlister(v);
                if (!v) setPiecesPerBlister(0);
              }}
            />
            <Label htmlFor="sell-loose-blister" className="cursor-pointer text-sm font-medium">
              Vender pastillas sueltas
            </Label>
          </div>
        )}

        {isBlisterSale && (
          <div className="space-y-1.5">
            <Label htmlFor="pieces-per-blister-input">Pastillas por blister</Label>
            <Input
              id="pieces-per-blister-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={piecesPerBlister || ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                setPiecesPerBlister(digits === "" ? 0 : parseInt(digits, 10));
              }}
              className="h-9 w-20 text-center tabular-nums"
            />
          </div>
        )}

        {(() => {
          const catalogPrice = scanProduct
            ? effectivePrice(
                { name: scanProduct.name, price: scanProduct.price ?? 0, wholesalePrice: scanProduct.wholesalePrice ?? null, quantity: 0 },
                sellsWholesale,
              )
            : 0;
          // Preview (UX only — el server SIEMPRE recomputa el precio real al
          // cobrar): con el switch activo, precio por pastilla derivado de
          // piecesPerBlister; si no, el precio de catálogo de siempre.
          const unitPrice = isBlisterSale
            ? computePerUnitPrice(catalogPrice, piecesPerBlister || null) ?? 0
            : catalogPrice;
          const stock = Number(scanProduct?.quantity ?? 0);
          const maxQty = stock > 0 ? stock : 999;
          return (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={scanQty <= 1}
                  onClick={() => setScanQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Label htmlFor="scan-qty-input" className="sr-only">
                  Cantidad
                </Label>
                <Input
                  id="scan-qty-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={scanQty || ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    if (digits === "") {
                      setScanQty(0);
                      return;
                    }
                    setScanQty(Math.min(parseInt(digits, 10), maxQty));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmScan();
                    }
                  }}
                  className="h-9 w-14 shrink-0 text-center tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={scanQty >= maxQty}
                  onClick={() => setScanQty((q) => Math.min(maxQty, q + 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-2xl font-bold tabular-nums">
                ${Math.round(unitPrice * scanQty).toLocaleString("es-AR")}
              </span>
            </div>
          );
        })()}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancelScan}>
            Cancelar
          </Button>
          <Button
            autoFocus
            onClick={handleConfirmScan}
            disabled={scanQty <= 0 || (isBlisterSale && !piecesPerBlisterValid)}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── ¿Imprimir ticket? (tras una venta confirmada) ──
        Al cerrarse, el foco vuelve al listado: el botón que lo tenía (Vender)
        ya no existe porque el carrito se vació. */}
    <PrintTicketDialog
      open={!!pendingTicket}
      onPrint={handlePrintTicket}
      onSkip={dismissTicket}
      onClosed={exitToGrid}
    />

    {/* ── Modal de Producto manual (vuelve el foco al listado al cerrarse) ── */}
    <ManualProductDialog
      open={manualOpen}
      onOpenChange={setManualOpen}
      onCreated={handleManualCreated}
      onClosed={exitToGrid}
    />

    {/* ── Modal de Abrir bolsa ── */}
    <OpenBagDialog
      branchId={branchId}
      open={openBagDialogOpen}
      onOpenChange={setOpenBagDialogOpen}
      onSuccess={() => {
        // Optionally refresh loose stock tab data here
      }}
    />
    </>
  );
};
