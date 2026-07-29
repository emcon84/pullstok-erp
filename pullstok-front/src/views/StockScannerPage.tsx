import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/atoms/loader";
import { Camera, CameraOff, Plus, Minus, RefreshCw, Search } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface ScannedProduct {
  id: string;
  name: string;
  code: string;
  price: number;
  quantity: number;
  description: string | null;
  category: { name: string } | null;
  variantAssignments: {
    option: { value: string; variant: { name: string } };
  }[];
}

export const StockScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");

  const headers = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  }), []);

  const lookupProduct = useCallback(async (code: string) => {
    if (!code.trim() || code === lastCode) return;
    setLastCode(code);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(code)}`, { headers: headers() });
      if (!res.ok) {
        setProduct(null);
        toast.error("Producto no encontrado");
      } else {
        const data = await res.json();
        setProduct(data);
        toast.success(data.name);
      }
    } catch {
      toast.error("Error al buscar producto");
    }
    setLoading(false);
  }, [headers, lastCode]);

  const startScanner = async () => {
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const devices = await reader.listVideoInputDevices();
      const backCamera = devices.find(d => d.label.toLowerCase().includes("back")) || devices[0];
      if (!backCamera) {
        toast.error("No se encontró cámara");
        return;
      }

      await reader.decodeFromVideoDevice(backCamera.deviceId, videoRef.current!, (result, err) => {
        if (result) {
          const code = result.getText();
          lookupProduct(code);
        }
        if (err && !(err as any)?.message?.includes("NotFound")) {
          // Silenciar errores de frame sin barcode
        }
      });
      setScanning(true);
    } catch (e: any) {
      toast.error("Error al iniciar cámara: " + e.message);
    }
  };

  const stopScanner = () => {
    readerRef.current?.reset();
    readerRef.current = null;
    setScanning(false);
  };

  useEffect(() => {
    return () => { readerRef.current?.reset(); };
  }, []);

  const updateStock = async (newQty: number) => {
    if (!product) return;
    try {
      const res = await fetch(`${API_URL}/products/${product.id}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ quantity: newQty }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProduct(prev => prev ? { ...prev, quantity: newQty } : prev);
        toast.success(`Stock: ${newQty}`);
      } else {
        toast.error("Error al actualizar stock");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const adj = (delta: number) => product && updateStock(product.quantity + delta);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Escanear Producto</h1>

      {/* Camera viewfinder */}
      <Card className="relative overflow-hidden bg-black aspect-square">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <Camera className="h-12 w-12" />
            <span>Cámara apagada</span>
          </div>
        )}
        {/* Crosshair overlay */}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[15%] border-2 border-green-400/60 rounded-lg">
              <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
        )}
      </Card>

      {/* Controls */}
      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanner} className="flex-1"><Camera className="h-4 w-4 mr-2" />Iniciar cámara</Button>
        ) : (
          <Button onClick={stopScanner} variant="secondary" className="flex-1"><CameraOff className="h-4 w-4 mr-2" />Detener</Button>
        )}
      </div>

      {/* Manual code input */}
      <div className="flex gap-2">
        <Input
          placeholder="O escribí el código..."
          value={manualCode}
          onChange={e => setManualCode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookupProduct(manualCode)}
        />
        <Button onClick={() => lookupProduct(manualCode)} size="icon"><Search className="h-4 w-4" /></Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8"><Loader /></div>
      )}

      {/* Product card */}
      {product && !loading && (
        <Card className="p-4 space-y-3 animate-in fade-in slide-in-from-bottom-4">
          <div>
            <h2 className="text-lg font-semibold">{product.name}</h2>
            {product.description && (
              <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {product.code && <Badge variant="outline">{product.code}</Badge>}
            {product.category && <Badge variant="secondary">{product.category.name}</Badge>}
          </div>

          {/* Variants */}
          {product.variantAssignments?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.variantAssignments.map((va, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {va.option.variant.name}: {va.option.value}
                </Badge>
              ))}
            </div>
          )}

          {/* Stock adjustment */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-sm font-medium text-muted-foreground">Stock:</span>
            <span className={`text-2xl font-bold ${product.quantity <= 0 ? "text-destructive" : "text-foreground"}`}>
              {product.quantity}
            </span>
            <div className="flex gap-1 ml-auto">
              <Button size="icon" variant="outline" onClick={() => adj(-1)}><Minus className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => adj(1)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Manual quantity set */}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Cantidad..."
              value={adjustQty}
              onChange={e => setAdjustQty(e.target.value)}
              className="h-9"
            />
            <Button size="sm" onClick={() => { const q = parseInt(adjustQty); if (!isNaN(q)) { updateStock(q); setAdjustQty(""); } }}>
              <RefreshCw className="h-4 w-4 mr-1" />Actualizar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
