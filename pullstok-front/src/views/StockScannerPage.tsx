import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, Plus, Minus, Search, Link2 } from "lucide-react";

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
  const scanningRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");
  const lastScannedRef = useRef("");

  // Beep sound
  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.15;
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const resetAndScan = () => {
    setProduct(null);
    setNotFoundCode("");
    setSearchResults([]);
    setSearchQuery("");
    lastScannedRef.current = "";
    startScanner();
  };

  // "Not found" flow
  const [notFoundCode, setNotFoundCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const lookupProduct = async (code: string) => {
    const c = code.trim();
    if (!c || c === lastScannedRef.current) return;
    lastScannedRef.current = c;
    setManualCode(c);
    setLoading(true);
    setNotFoundCode("");
    setSearchResults([]);
    setSearchQuery("");
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(c)}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setProduct(null);
        setNotFoundCode(c);
        playBeep();
      } else {
        setProduct(data);
        toast.success(data.name);
        playBeep();
      }
    } catch { toast.error("Error al buscar"); }
    setLoading(false);
  };

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/products?name=${encodeURIComponent(q)}`, { headers });
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const assignCode = async (productId: string, code: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`${API_URL}/products/${productId}`, {
        method: "PUT", headers,
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProduct(updated);
        setNotFoundCode("");
        setSearchResults([]);
        toast.success("¡Código asignado!");
        playBeep();
      } else {
        toast.error("Error al asignar código");
      }
    } catch { toast.error("Error de conexión"); }
    setAssigning(false);
  };

  const startScanner = async () => {
    setProduct(null);
    setNotFoundCode("");
    setSearchResults([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

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

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts]);

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

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanner} className="flex-1"><Camera className="h-4 w-4 mr-2" />Iniciar cámara</Button>
        ) : (
          <Button onClick={stopScanner} variant="secondary" className="flex-1"><CameraOff className="h-4 w-4 mr-2" />Detener</Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input placeholder="O escribí el código..." value={manualCode} onChange={e => setManualCode(e.target.value)} onKeyDown={e => e.key === "Enter" && lookupProduct(manualCode)} />
        <Button size="icon" onClick={() => lookupProduct(manualCode)}><Search className="h-4 w-4" /></Button>
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground py-2">Buscando...</p>}

      {/* Not found — assign code to existing product */}
      {notFoundCode && !product && !loading && (
        <Card className="p-4 space-y-3 border-amber-400 bg-amber-400/5">
          <div>
            <Badge variant="outline" className="mb-1 text-amber-600 border-amber-400">Código nuevo</Badge>
            <p className="text-lg font-mono font-bold">{notFoundCode}</p>
            <p className="text-sm text-muted-foreground mt-1">No está asociado a ningún producto.</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Buscá el producto por nombre para vincularlo:</p>
            <Input
              placeholder="Ej: Cat Chow Adultos..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  className="w-full rounded-md px-3 py-2 text-left hover:bg-accent transition-colors"
                  onClick={() => assignCode(p.id, notFoundCode)}
                  disabled={assigning}
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {p.code && <Badge variant="secondary" className="text-xs shrink-0 font-mono">{p.code}</Badge>}
                    <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                  </div>
                  {(p.variantAssignments?.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
                      {p.variantAssignments.map((va: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {va.option?.variant?.name}: {va.option?.value}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full" onClick={resetAndScan}>
            <Camera className="h-3.5 w-3.5 mr-1" />Escanear otro
          </Button>
        </Card>
      )}

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

          <Button variant="outline" className="w-full" onClick={resetAndScan}>
            <Camera className="h-4 w-4 mr-2" />Escanear otro
          </Button>
        </Card>
      )}
    </div>
  );
};
