import { useMemo, useState } from "react";
import { Plus, Pencil, Factory, Phone, Search, Power } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { GenericModal } from "../components/molecules/GenericModal";
import { Loader } from "../components/atoms/loader";
import { groupByLetter, OTHER_GROUP } from "../utils/groupByLetter";
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
} from "../components/hooks/useProvider";
import { useAccounts } from "../components/hooks/useAccounts";
import type { Provider } from "../services/providers";

/** "2001 · Proveedores Varios" (código corto, con fallback al código jerárquico). */
const accountLabel = (a: { code: string; shortCode?: string | null; name: string }) =>
  `${a.shortCode || a.code} · ${a.name}`;

interface ProviderForm {
  name: string;
  code: string;
  taxId: string;
  taxCondition: string;
  address: string;
  locality: string;
  province: string;
  phone: string;
  email: string;
  classification: string;
  accountingRef: string;
  accountId: string;
  isActive: boolean;
}

const EMPTY_FORM: ProviderForm = {
  name: "",
  code: "",
  taxId: "",
  taxCondition: "",
  address: "",
  locality: "",
  province: "",
  phone: "",
  email: "",
  classification: "",
  accountingRef: "",
  accountId: "",
  isActive: true,
};

const formFromProvider = (p: Provider): ProviderForm => ({
  name: p.name ?? "",
  code: p.code ?? "",
  taxId: p.taxId ?? "",
  taxCondition: p.taxCondition ?? "",
  address: p.address ?? "",
  locality: p.locality ?? "",
  province: p.province ?? "",
  phone: p.phone ?? "",
  email: p.email ?? "",
  classification: p.classification ?? "",
  accountingRef: p.accountingRef ?? "",
  accountId: p.accountId ?? "",
  isActive: p.isActive !== false,
});

type StatusFilter = "all" | "active" | "inactive";

export const Providers = () => {
  const { providers, loadingProvider, errorProvider } = useProviders();
  const { submitProvider, loadingProvider: creating } = useCreateProvider();
  const { updateProvider, loadingUpdate } = useUpdateProvider();
  const { accounts } = useAccounts();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  // editId null + isOpen = alta; editId definido = edición.
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);

  // Solo cuentas imputables, por código; la ya vinculada se conserva aunque
  // dejara de ser imputable para no perder el valor al editar.
  const editing = editId ? providers?.find((p) => p.id === editId) : undefined;
  const accountOptions = useMemo(() => {
    const postable = (accounts ?? [])
      .filter((a) => a.isPostable)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ value: a.id, label: accountLabel(a) }));
    const linked = editing?.account;
    if (linked && !postable.some((o) => o.value === linked.id)) {
      postable.unshift({ value: linked.id, label: accountLabel(linked) });
    }
    return [{ value: "", label: "Sin cuenta" }, ...postable];
  }, [accounts, editing]);

  const set = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setIsOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditId(p.id);
    setForm(formFromProvider(p));
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("El nombre es requerido");
      return;
    }
    // En edición "" limpia el campo (el backend lo normaliza a null); en alta
    // los vacíos simplemente no se mandan.
    const text = (v: string) => (editId ? v.trim() : v.trim() || undefined);
    const payload = {
      name,
      code: text(form.code),
      taxId: text(form.taxId),
      taxCondition: text(form.taxCondition),
      address: text(form.address),
      locality: text(form.locality),
      province: text(form.province),
      phone: text(form.phone),
      email: text(form.email),
      classification: text(form.classification),
      accountingRef: text(form.accountingRef),
      accountId: editId ? form.accountId || null : form.accountId || undefined,
      isActive: form.isActive,
    };
    if (editId) {
      updateProvider(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            toast.success("Proveedor editado con éxito");
            closeModal();
          },
          onError: (error) => toast.error(`Error al editar proveedor: ${error.message}`),
        },
      );
    } else {
      submitProvider(payload, {
        onSuccess: () => {
          toast.success("Proveedor agregado con éxito");
          closeModal();
        },
        onError: (error) => toast.error(`Error al agregar proveedor: ${error.message}`),
      });
    }
  };

  // Desactivar en vez de borrar: los productos y las planillas conservan el proveedor.
  const toggleActive = (p: Provider) => {
    const next = p.isActive === false;
    updateProvider(
      { id: p.id, isActive: next },
      {
        onSuccess: () =>
          toast.success(next ? "Proveedor activado" : "Proveedor desactivado"),
        onError: (error) => toast.error(`Error al actualizar proveedor: ${error.message}`),
      },
    );
  };

  const term = search.trim().toLowerCase();
  const visible = (providers ?? []).filter((p) => {
    if (statusFilter === "active" && p.isActive === false) return false;
    if (statusFilter === "inactive" && p.isActive !== false) return false;
    if (!term) return true;
    return [p.name, p.code, p.taxId].some((v) => (v ?? "").toLowerCase().includes(term));
  });

  const letterGroups = groupByLetter(visible);

  if (loadingProvider) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorProvider) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar proveedores: {errorProvider.message}
      </div>
    );
  }

  const total = providers?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            {total} proveedor{total === 1 ? "" : "es"} registrado{total === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Agregar proveedor
        </Button>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o CUIT"
              aria-label="Buscar proveedores"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filtrar por estado">
            {(
              [
                ["active", "Activos"],
                ["inactive", "Inactivos"],
                ["all", "Todos"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? "default" : "outline"}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {total === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Factory className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay proveedores</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primer proveedor para empezar.
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ningún proveedor coincide con la búsqueda.
        </p>
      ) : (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-1" aria-label="Saltar a letra">
            {letterGroups.map(({ letter }) => (
              <a
                key={letter}
                href={"#letra-" + (letter === OTHER_GROUP ? "otros" : letter)}
                className="flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-xs font-medium hover:bg-accent"
              >
                {letter}
              </a>
            ))}
          </nav>
          <Card className="gap-0 divide-y overflow-hidden p-0">
            {letterGroups.map(({ letter, items }) => (
              <section
                key={letter}
                id={"letra-" + (letter === OTHER_GROUP ? "otros" : letter)}
                aria-label={"Proveedores con " + letter}
                className="scroll-mt-4"
              >
                <h2 className="bg-muted/50 px-4 py-1.5 text-sm font-semibold text-muted-foreground">
                  {letter}
                </h2>
                <ul className="divide-y">
                  {items.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {p.name}
                          {p.classification && (
                            <Badge variant="outline" className="ml-2">
                              {p.classification}
                            </Badge>
                          )}
                          {p.isActive === false && (
                            <Badge variant="secondary" className="ml-2">
                              Inactivo
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[
                            p.code,
                            p.taxId,
                            [p.locality, p.province].filter(Boolean).join(", "),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Sin código ni CUIT"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:w-40">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{p.phone || "Sin teléfono"}</span>
                      </div>
                      <div className="truncate text-sm text-muted-foreground sm:w-48">
                        {p.account ? accountLabel(p.account) : p.accountingRef || "—"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Editar ${p.name}`}
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`${p.isActive === false ? "Activar" : "Desactivar"} ${p.name}`}
                          onClick={() => toggleActive(p)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        </div>
      )}

      <GenericModal isOpen={isOpen} onClose={closeModal}>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {editId ? "Editar proveedor" : "Agregar proveedor"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Datos administrativos del proveedor.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-name">Nombre</Label>
            <Input
              id="p-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Razón social o nombre"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-code">Código</Label>
              <Input
                id="p-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="Código del sistema anterior"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-taxid">CUIT</Label>
              <Input
                id="p-taxid"
                value={form.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                placeholder="30-00000000-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-taxcondition">Condición de IVA</Label>
            <Input
              id="p-taxcondition"
              value={form.taxCondition}
              onChange={(e) => set("taxCondition", e.target.value)}
              placeholder="Ej. RI, EX, MT, CF"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-address">Domicilio</Label>
            <Input
              id="p-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-locality">Localidad</Label>
              <Input
                id="p-locality"
                value={form.locality}
                onChange={(e) => set("locality", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-province">Provincia</Label>
              <Input
                id="p-province"
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-phone">Teléfono</Label>
              <Input
                id="p-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+54 11 1234 5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-email">Email</Label>
              <Input
                id="p-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="proveedor@mail.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-classification">Clasificación</Label>
              <Input
                id="p-classification"
                value={form.classification}
                onChange={(e) => set("classification", e.target.value)}
                placeholder="Ej. GAST, SERV"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-account">Cuenta contable</Label>
              <SearchableSelect
                id="p-account"
                ariaLabel="Cuenta contable"
                value={form.accountId}
                onValueChange={(v) => set("accountId", v)}
                options={accountOptions}
                placeholder="Sin cuenta"
                searchPlaceholder="Buscar cuenta…"
                emptyMessage="Sin cuentas imputables"
              />
              {!form.accountId && form.accountingRef && (
                <p className="text-xs text-muted-foreground">
                  Referencia GFLOW: {form.accountingRef}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label htmlFor="p-active">Proveedor activo</Label>
            <Switch
              id="p-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set("isActive", checked)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={creating || loadingUpdate}>
              {creating || loadingUpdate ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </GenericModal>
    </div>
  );
};
