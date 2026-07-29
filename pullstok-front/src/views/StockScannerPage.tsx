import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, Plus, Minus, Search } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface ScannedProduct {
  id: string; name: string; code: string; price: number;
  quantity: number; description: string | null;
  category: { name: string } | null;
  variantAssignments: { option: { value: string; variant: { name: string } } }[];
}

export const StockScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");

  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const lookupProduct = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(c)}`, { headers });
      if (!res.ok) {
        setProduct(null);
        toast.error("Producto no encontrado: " + c);
      } else {
        const data = await res.json();
        setProduct(data);
        toast.success(data.name);
        // Stop scanning after found
        stopScanner();
      }
    } catch { toast.error("Error al buscar"); }
    setLoading(false);
  };

  const startScanner = async () => {
    setProduct(null);
    try {
      // Check for native BarcodeDetector API (Chrome 88+)
      if ("BarcodeDetector" in window) {
        const formats = await (window as any).BarcodeDetector.getSupportedFormats();
        detectorRef.current = new (window as any).BarcodeDetector({ formats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setScanning(true);

        // Poll frames
        const scan = async () => {
          if (!detectorRef.current || !videoRef.current || !scanning) return;
          try {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (barcodes.length > 0) {
              lookupProduct(barcodes[0].rawValue);
            }
          } catch {}
          if (scanning) intervalRef.current = setTimeout(scan, 200);
        };
        scan();
      } else {
        // Fallback: try ZXing
        const { BrowserMultiFormatReader } = await import("@zxing/library");
        const reader = new BrowserMultiFormatReader();
        const devices = await reader.listVideoInputDevices();
        const cam = devices.find(d => d.label.toLowerCase().includes("back")) || devices[0];
        if (!cam) { toast.error("No se encontró cámara"); return; }

        await reader.decodeFromVideoDevice(cam.deviceId, videoRef.current!, (result, _err) => {
          if (result) lookupProduct(result.getText());
        });
        setScanning(true);
      }
    } catch (e: any) {
      toast.error("Cámara: " + (e.message || "Permiso denegado"));
      setScanning(false);
    }
  };

  const stopScanner = () => {
    setScanning(false);
    if (intervalRef.current) clearTimeout(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => { return () => stopScanner(); }, []);

  const updateStock = async (newQty: number) => {
    if (!product) return;
    try {
      await fetch(`${API_URL}/products/${product.id}`, {
        method: "PUT", headers,
        body: JSON.stringify({ quantity: newQty }),
      });
      setProduct(prev => prev ? { ...prev, quantity: newQty } : prev);
      toast.success(`Stock: ${newQty}`);
    } catch { toast.error("Error al actualizar"); }
  };

  const adj = (d: number) => product && updateStock(product.quantity + d);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Escanear Producto</h1>

      <Card className="relative aspect-square overflow-hidden bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline autoPlay muted />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <Camera className="h-10 w-10" />
            <span className="text-sm">Cámara apagada</span>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[20%] rounded-lg border-2 border-green-400/70" />
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">Escaneando...</span>
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanner} className="flex-1"><Camera className="h-4 w-4 mr-2" />Iniciar cámara</Button>
        ) : (
          <Button onClick={stopScanner} variant="secondary" className="flex-1"><CameraOff className="h-4 w-4 mr-2" />Detener</Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input placeholder="O escribí el código..." value={manualCode} onChange={e => setManualCode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && lookupProduct(manualCode)} />
        <Button onClick={() => lookupProduct(manualCode)} size="icon"><Search className="h-4 w-4" /></Button>
      </div>

      {loading && <div className="text-center py-4 text-muted-foreground">Buscando...</div>}

      {product && !loading && (
        <Card className="p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{product.name}</h2>
            {product.description && <p className="text-sm text-muted-foreground mt-1">{product.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {product.code && <Badge variant="outline">{product.code}</Badge>}
            {product.category && <Badge variant="secondary">{product.category.name}</Badge>}
          </div>
          {product.variantAssignments?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {product.variantAssignments.map((va, i) => (
                <Badge key={i} variant="outline" className="text-xs">{va.option.variant.name}: {va.option.value}</Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 pt-2 border-t">
            <span className="text-sm text-muted-foreground">Stock:</span>
            <span className={`text-2xl font-bold ${product.quantity <= 0 ? "text-destructive" : ""}`}>{product.quantity}</span>
            <div className="flex gap-1 ml-auto">
              <Button size="icon" variant="outline" onClick={() => adj(-1)}><Minus className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => adj(1)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Input type="number" placeholder="Cantidad..." value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="h-9" />
            <Button size="sm" onClick={() => { const q = parseInt(adjustQty); if (!isNaN(q)) { updateStock(q); setAdjustQty(""); } }}>Actualizar</Button>
          </div>
        </Card>
      )}
    </div>
  );
};
