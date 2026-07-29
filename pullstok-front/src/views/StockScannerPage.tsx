import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, Plus, Minus, Search } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface Product {
  id: string; name: string; code: string; price: number;
  quantity: number; description: string | null;
  category: { name: string } | null;
  variantAssignments: { option: { value: string; variant: { name: string } } }[];
}

export const StockScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanTimerRef = useRef<any>(null);

  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false); // Avoid stale closure in scan loop
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");

  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const lookupProduct = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setManualCode(c);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(c)}`, { headers });
      const data = await res.json();
      if (!res.ok) { setProduct(null); toast.error(data.message || "Producto no encontrado"); }
      else { setProduct(data); toast.success(data.name); stopScanner(); }
    } catch { toast.error("Error al buscar"); }
    setLoading(false);
  };

  const startScanner = async () => {
    setProduct(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Try native BarcodeDetector (Chrome 88+)
      if ("BarcodeDetector" in window) {
        const formats = await (window as any).BarcodeDetector.getSupportedFormats();
        detectorRef.current = new (window as any).BarcodeDetector({ formats });
      }
      setScanning(true);
      scanningRef.current = true;

      const scanLoop = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          if (detectorRef.current) {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (barcodes.length > 0) { lookupProduct(barcodes[0].rawValue); return; }
          }
        } catch {}
        scanTimerRef.current = setTimeout(scanLoop, 200);
      };
      scanLoop();
    } catch (e: any) {
      toast.error(e.message || "Permiso de cámara denegado");
    }
  };

  const stopScanner = () => {
    setScanning(false);
    scanningRef.current = false;
    clearTimeout(scanTimerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => { return () => stopScanner(); }, []);

  const updateStock = async (qty: number) => {
    if (!product) return;
    try {
      await fetch(`${API_URL}/products/${product.id}`, { method: "PUT", headers, body: JSON.stringify({ quantity: qty }) });
      setProduct(p => p ? { ...p, quantity: qty } : p);
      toast.success(`Stock: ${qty}`);
    } catch { toast.error("Error"); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Scanner</h1>
      {/* Debug: always visible */}
      <p className="text-xs text-muted-foreground">API: {API_URL}</p>

      {/* Camera */}
      <Card className="relative aspect-square overflow-hidden bg-black rounded-xl">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline autoPlay muted />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <Camera className="h-10 w-10" />
            <span className="text-sm">Cámara apagada</span>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[18%] rounded-2xl border-2 border-green-400/70" />
            <p className="absolute bottom-3 w-full text-center text-xs text-white/80">Escaneando...</p>
          </div>
        )}
      </Card>

      {/* Camera controls */}
      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanner} className="flex-1"><Camera className="h-4 w-4 mr-2" />Iniciar cámara</Button>
        ) : (
          <Button onClick={stopScanner} variant="secondary" className="flex-1"><CameraOff className="h-4 w-4 mr-2" />Detener</Button>
        )}
      </div>

      {/* Manual input */}
      <div className="flex gap-2">
        <Input placeholder="O escribí el código..." value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === "Enter" && lookupProduct(manualCode)} />
        <Button size="icon" onClick={() => lookupProduct(manualCode)}><Search className="h-4 w-4" /></Button>
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground py-2">Buscando...</p>}

      {/* Product card */}
      {product && !loading && (
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">{product.name}</h2>
          {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}

          <div className="flex flex-wrap gap-2">
            {product.code && <Badge variant="outline">{product.code}</Badge>}
            {product.category && <Badge variant="secondary">{product.category.name}</Badge>}
            {product.variantAssignments?.map((va, i) => (
              <Badge key={i} variant="outline" className="text-xs">{va.option.variant.name}: {va.option.value}</Badge>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-sm text-muted-foreground">Stock:</span>
            <span className={`text-2xl font-bold ${product.quantity <= 0 ? "text-destructive" : ""}`}>{product.quantity}</span>
            <div className="flex gap-1 ml-auto">
              <Button size="icon" variant="outline" onClick={() => updateStock(product.quantity - 1)}><Minus className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => updateStock(product.quantity + 1)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Input type="number" placeholder="Cantidad..." value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="h-9" />
            <Button size="sm" onClick={() => { const q = parseInt(adjustQty); if (!isNaN(q)) { updateStock(q); setAdjustQty(""); } }}>Actualizar</Button>
          </div>

          <Button variant="outline" className="w-full" onClick={() => { setProduct(null); startScanner(); }}>
            <Camera className="h-4 w-4 mr-2" />Escanear otro
          </Button>
        </Card>
      )}
    </div>
  );
};
