import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Camera, CameraOff, Plus, Minus, Search, Link2, X, Barcode } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface Product {
  id: string; name: string; code: string; barcode: string; price: number;
  quantity: number; description: string | null;
  category: { name: string } | null;
  variantAssignments: { option: { value: string; variant: { name: string } } }[];
}

export const StockScannerPage = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanTimerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustQty, setAdjustQty] = useState("");
  const lastScannedRef = useRef("");

  // Assignment panel
  const [notFoundCode, setNotFoundCode] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [correctingBarcode, setCorrectingBarcode] = useState(false);
  const correctingRef = useRef(false);
  const [reassignFromId, setReassignFromId] = useState<string | null>(null);

  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine";
      gain.gain.value = 0.15;
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const lookupProduct = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    if (c === lastScannedRef.current && !correctingRef.current) return;
    lastScannedRef.current = c;
    setManualCode(c);

    // Correction mode: update barcode of current product
    if (correctingRef.current && product) {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/products/${product.id}`, {
          method: "PUT", headers,
          body: JSON.stringify({ barcode: c }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          setProduct(data);
          setCorrectingBarcode(false);
          correctingRef.current = false;
          lastScannedRef.current = "";
          toast.success("Código corregido");
          playBeep();
        } else {
          toast.error(data.message || "Error al actualizar código");
        }
      } catch { toast.error("Error de conexión"); }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(c)}`, { headers });
      const data = await res.json();
      playBeep();
      if (!res.ok) {
        setProduct(null);
        setNotFoundCode(c);
        setSearchQuery("");
        setSearchResults([]);
        setAssignOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 300);
      } else {
        setProduct(data);
        setAssignOpen(false);
        lastScannedRef.current = "";
        toast.success(data.name);
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
      setSearchResults(Array.isArray(data) ? data.slice(0, 12) : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const assignCode = async (productId: string) => {
    setAssigning(true);
    try {
      // If reassigning, first clear barcode from old product
      if (reassignFromId && reassignFromId !== productId) {
        await fetch(`${API_URL}/products/${reassignFromId}`, {
          method: "PUT", headers,
          body: JSON.stringify({ barcode: null }),
        });
        setReassignFromId(null);
      }
      const res = await fetch(`${API_URL}/products/${productId}`, {
        method: "PUT", headers,
        body: JSON.stringify({ barcode: notFoundCode }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setProduct(data);
        setAssignOpen(false);
        lastScannedRef.current = "";
        toast.success("¡Código asignado!");
        playBeep();
      } else {
        toast.error(data.message || "Error al asignar código");
      }
    } catch { toast.error("Error de conexión"); }
    setAssigning(false);
  };

  const startScanner = async () => {
    if (!correctingRef.current) setProduct(null);
    setAssignOpen(false);
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
    const t = setTimeout(() => searchProducts(searchQuery), 250);
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

  const resetAndScan = () => {
    setProduct(null);
    setAssignOpen(false);
    setNotFoundCode("");
    setSearchResults([]);
    setSearchQuery("");
    setCorrectingBarcode(false);
    correctingRef.current = false;
    lastScannedRef.current = "";
    startScanner();
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
            <div className={`absolute inset-[18%] rounded-2xl border-2 ${correctingBarcode ? "border-amber-400/70" : "border-green-400/70"}`} />
            <p className="absolute bottom-3 w-full text-center text-xs text-white/80">
              {correctingBarcode ? "Corrigiendo código..." : "Escaneando..."}
            </p>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {!scanning ? (
          <Button onClick={startScanner} className="flex-1"><Camera className="h-4 w-4 mr-2" />Iniciar cámara</Button>
        ) : (
          <Button onClick={stopScanner} variant="secondary" className="flex-1"><CameraOff className="h-4 w-4 mr-2" />Detener</Button>
        )}
        {correctingBarcode && (
          <Button variant="outline" size="sm" onClick={() => { setCorrectingBarcode(false); correctingRef.current = false; }}>
            <X className="h-4 w-4 mr-1" />Cancelar
          </Button>
        )}
      </div>

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
            {product.code && (
              <Badge variant="outline">SKU: {product.code}</Badge>
            )}
            {product.barcode && (
              <span className="inline-flex items-center gap-1">
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  {product.barcode}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Corregir código"
                  onClick={() => {
                    setCorrectingBarcode(true);
                    correctingRef.current = true;
                    lastScannedRef.current = "";
                    if (!scanning) startScanner();
                  }}
                >
                  <Barcode className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
            {!product.barcode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setCorrectingBarcode(true);
                  correctingRef.current = true;
                  lastScannedRef.current = "";
                  if (!scanning) startScanner();
                }}
              >
                <Barcode className="h-3.5 w-3.5 mr-1" />Sin código de barras
              </Button>
            )}
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

          {product.barcode && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setReassignFromId(product.id);
                setNotFoundCode(product.barcode);
                setSearchQuery("");
                setSearchResults([]);
                setAssignOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 300);
              }}
            >
              <Link2 className="h-4 w-4 mr-2" />Reasignar código
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={resetAndScan}>
            <Camera className="h-4 w-4 mr-2" />Escanear otro
          </Button>
        </Card>
      )}

      {/* Assign code panel — fullscreen Sheet */}
      <Sheet open={assignOpen} onOpenChange={(v) => { if (!v) { setAssignOpen(false); lastScannedRef.current = ""; } }}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
            <SheetTitle>Vincular código</SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => { setAssignOpen(false); lastScannedRef.current = ""; }}>
              <X className="h-5 w-5" />
            </Button>
          </SheetHeader>

          <div className="flex flex-col h-full px-4 pb-4 space-y-3">
            {/* Scanned code display */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
              <p className="text-xs text-amber-600 font-medium">Código escaneado</p>
              <p className="text-xl font-mono font-bold text-amber-800 mt-0.5">{notFoundCode}</p>
              <p className="text-xs text-amber-600 mt-1">No está asociado a ningún producto</p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                className="pl-9 h-11 text-base"
                placeholder="Buscá el producto por nombre..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {searching && <p className="text-center text-sm text-muted-foreground py-4">Buscando...</p>}

              {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Sin resultados. Probá con menos palabras.</p>
              )}

              {searchResults.map(p => (
                <button
                  key={p.id}
                  className="w-full flex items-start gap-3 rounded-xl px-3 py-3 mb-1.5 text-left active:bg-accent transition-colors border border-transparent hover:border-primary/30 hover:bg-primary/5"
                  onClick={() => assignCode(p.id)}
                  disabled={assigning}
                >
                  <div className="mt-0.5"><Link2 className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{p.name}</p>
                    {p.variantAssignments?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.variantAssignments.map((va, i) => (
                          <Badge key={i} variant="secondary" className="text-[11px] px-1.5 py-0.5">
                            {va.option.variant.name}: {va.option.value}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {p.category && !p.variantAssignments?.length && (
                      <p className="text-xs text-muted-foreground mt-1">{p.category.name}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
