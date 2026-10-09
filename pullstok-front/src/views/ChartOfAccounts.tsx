import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ListTree,
  Upload,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GenericModal } from "../components/molecules/GenericModal";
import { Loader } from "../components/atoms/loader";
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useSeedDefaultAccounts,
  useImportAccounts,
} from "../components/hooks/useAccounts";
import type { Account, AccountType, ImportAccountRow } from "../services/accounts";
import { GflowImportDialog } from "../components/molecules/GflowImportDialog";
import { readGflowFile } from "../utils/gflowChartOfAccounts";
import {
  childrenMap,
  flattenTree,
  matchWithAncestors,
  subtreeIds,
} from "../utils/accountTree";

const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Activo",
  LIABILITY: "Pasivo",
  EQUITY: "Patrimonio neto",
  INCOME: "Ingresos",
  EXPENSE: "Egresos",
};
const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as AccountType[]).map((value) => ({
  value,
  label: TYPE_LABEL[value],
}));

const NO_PARENT = "none";

interface AccountForm {
  code: string;
  shortCode: string;
  name: string;
  parentId: string; // NO_PARENT = raíz
  type: AccountType;
  isPostable: boolean;
  isActive: boolean;
}

const EMPTY_FORM: AccountForm = {
  code: "",
  shortCode: "",
  name: "",
  parentId: NO_PARENT,
  type: "ASSET",
  isPostable: false,
  isActive: true,
};

// Mismo patrón que Customers: el rol sale de localStorage.
const readCanWrite = () => {
  try {
    const role = JSON.parse(localStorage.getItem("user") ?? "null")?.role;
    return role === "ADMIN" || role === "MANAGEMENT";
  } catch {
    return false;
  }
};

// La importación reemplaza el plan completo: el backend la limita a ADMIN.
const readIsAdmin = () => {
  try {
    return JSON.parse(localStorage.getItem("user") ?? "null")?.role === "ADMIN";
  } catch {
    return false;
  }
};

interface GflowPreview {
  fileName: string;
  accounts: ImportAccountRow[];
  errors: string[];
}

export const ChartOfAccounts = () => {
  const { accounts, loadingAccounts, errorAccounts } = useAccounts();
  const { submitAccount, loadingCreate } = useCreateAccount();
  const { updateAccount, loadingUpdate } = useUpdateAccount();
  const { deleteAccount } = useDeleteAccount();
  const { seedAccounts, loadingSeed } = useSeedDefaultAccounts();
  const { importAccounts, loadingImport } = useImportAccounts();

  const canWrite = useMemo(readCanWrite, []);
  const isAdmin = useMemo(readIsAdmin, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [gflowPreview, setGflowPreview] = useState<GflowPreview | null>(null);
  const [search, setSearch] = useState("");
  // null = estado por defecto (solo los rubros raíz abiertos).
  const [expandedState, setExpandedState] = useState<Set<string> | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const list = accounts ?? [];
  const children = useMemo(() => childrenMap(list), [list]);
  const term = search.trim();

  const defaultExpanded = useMemo(
    () => new Set((children.get("") ?? []).map((a) => a.id)),
    [children],
  );
  const expanded = expandedState ?? defaultExpanded;

  const rows = useMemo(() => {
    if (term) {
      // Con búsqueda: coincidencias + ancestros, todo expandido.
      const only = matchWithAncestors(list, term);
      return flattenTree(list, only, only);
    }
    return flattenTree(list, expanded);
  }, [list, term, expanded]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedState(next);
  };
  const expandAll = () =>
    setExpandedState(new Set(list.filter((a) => children.has(a.id)).map((a) => a.id)));
  const collapseAll = () => setExpandedState(new Set());

  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = (parent?: Account) => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      parentId: parent?.id ?? NO_PARENT,
      type: parent?.type ?? EMPTY_FORM.type,
    });
    setIsOpen(true);
  };

  const openEdit = (a: Account) => {
    setEditId(a.id);
    setForm({
      code: a.code,
      shortCode: a.shortCode ?? "",
      name: a.name,
      parentId: a.parentId ?? NO_PARENT,
      type: a.type,
      isPostable: a.isPostable,
      isActive: a.isActive,
    });
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const editingHasChildren = !!editId && children.has(editId);

  // Madres posibles: solo no imputables; al editar, sin la cuenta ni sus descendientes.
  const parentOptions = useMemo(() => {
    const excluded = editId ? subtreeIds(list, editId) : new Set<string>();
    return [
      { value: NO_PARENT, label: "Sin cuenta madre (raíz)" },
      ...list
        .filter((a) => !a.isPostable && !excluded.has(a.id))
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    ];
  }, [list, editId]);

  const handleParentChange = (value: string) => {
    const parent = list.find((a) => a.id === value);
    setForm((f) => ({ ...f, parentId: value, type: parent ? parent.type : f.type }));
  };

  const handleSave = () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) return void toast.error("El código es requerido");
    if (!name) return void toast.error("El nombre es requerido");
    // En edición "" limpia el código corto; en alta los vacíos no se mandan.
    const shortCode = editId ? form.shortCode.trim() : form.shortCode.trim() || undefined;
    const hasParent = form.parentId !== NO_PARENT;
    const payload = {
      code,
      shortCode,
      name,
      // Con madre el tipo lo hereda el backend de ella.
      type: hasParent ? undefined : form.type,
      parentId: hasParent ? form.parentId : editId ? null : undefined,
      isPostable: form.isPostable,
      isActive: form.isActive,
    };
    if (editId) {
      updateAccount(
        { id: editId, ...payload },
        {
          onSuccess: () => {
            toast.success("Cuenta editada con éxito");
            closeModal();
          },
          onError: (error) => toast.error(`Error al editar cuenta: ${error.message}`),
        },
      );
    } else {
      submitAccount(payload, {
        onSuccess: () => {
          toast.success("Cuenta agregada con éxito");
          closeModal();
        },
        onError: (error) => toast.error(`Error al agregar cuenta: ${error.message}`),
      });
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteAccount(deleteTarget.id, {
      onSuccess: () => toast.success("Cuenta eliminada"),
      onError: (error) => toast.error(`Error al eliminar cuenta: ${error.message}`),
    });
    setDeleteTarget(null);
  };

  const handleSeed = () =>
    seedAccounts(undefined, {
      onSuccess: (r) => toast.success(`Plan base cargado (${r.count} cuentas)`),
      onError: (error) => toast.error(`Error al cargar el plan base: ${error.message}`),
    });

  const handleGflowFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    try {
      const { accounts: parsed, errors } = await readGflowFile(file);
      setGflowPreview({ fileName: file.name, accounts: parsed, errors });
    } catch {
      toast.error("No se pudo leer el archivo de GFLOW");
    }
  };

  const confirmGflowImport = () => {
    if (!gflowPreview) return;
    importAccounts(gflowPreview.accounts, {
      onSuccess: (r) => {
        toast.success(`Plan importado (${r.imported} cuentas)`);
        setGflowPreview(null);
      },
      onError: (error) => toast.error(`Error al importar el plan: ${error.message}`),
    });
  };

  if (loadingAccounts) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorAccounts) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar el plan de cuentas: {errorAccounts.message}
      </div>
    );
  }

  const total = list.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plan de cuentas</h1>
          <p className="text-sm text-muted-foreground">
            {total} cuenta{total === 1 ? "" : "s"} registrada{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                aria-label="Archivo de GFLOW"
                data-testid="gflow-file-input"
                onChange={handleGflowFile}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Importar desde GFLOW
              </Button>
            </>
          )}
          {canWrite && (
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Agregar cuenta
            </Button>
          )}
        </div>
      </div>

      <GflowImportDialog
        open={gflowPreview !== null}
        fileName={gflowPreview?.fileName ?? ""}
        accounts={gflowPreview?.accounts ?? []}
        errors={gflowPreview?.errors ?? []}
        loading={loadingImport}
        onConfirm={confirmGflowImport}
        onCancel={() => setGflowPreview(null)}
      />

      {total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código o nombre"
              aria-label="Buscar cuentas"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={expandAll}>
              <ChevronsUpDown className="h-4 w-4" />
              Expandir todo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={collapseAll}>
              <ChevronsDownUp className="h-4 w-4" />
              Colapsar todo
            </Button>
          </div>
        </div>
      )}

      {total === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <ListTree className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay plan de cuentas</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Podés cargar un plan base argentino (activo, pasivo, patrimonio neto, ingresos y
            egresos) y editarlo después, o armar el tuyo cuenta por cuenta.
          </p>
          {canWrite && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={handleSeed} disabled={loadingSeed}>
                {loadingSeed ? "Cargando..." : "Cargar plan base"}
              </Button>
              <Button variant="outline" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" />
                Agregar cuenta
              </Button>
            </div>
          )}
        </Card>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ninguna cuenta coincide con la búsqueda.
        </p>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <ul className="divide-y" role="tree" aria-label="Plan de cuentas">
            {rows.map(({ account: a, depth, hasChildren }) => {
              const isExpanded = term ? hasChildren : expanded.has(a.id);
              return (
                <li
                  key={a.id}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div
                    className="flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: depth * 20 }}
                  >
                    {hasChildren ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        aria-label={`${isExpanded ? "Contraer" : "Expandir"} ${a.name}`}
                        onClick={() => toggle(a.id)}
                        disabled={!!term}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <span className="inline-block h-6 w-6 shrink-0" />
                    )}
                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                      {a.code}
                    </span>
                    <span
                      className={
                        "truncate " +
                        (a.isPostable ? "" : "font-semibold ") +
                        (a.isActive ? "" : "text-muted-foreground")
                      }
                    >
                      {a.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="outline">{TYPE_LABEL[a.type]}</Badge>
                    {a.isPostable && <Badge variant="secondary">Imputable</Badge>}
                    {!a.isActive && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1">
                      {!a.isPostable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Agregar subcuenta a ${a.name}`}
                          onClick={() => openCreate(a)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Editar ${a.name}`}
                        onClick={() => openEdit(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Eliminar ${a.name}`}
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <GenericModal isOpen={isOpen} onClose={closeModal}>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {editId ? "Editar cuenta" : "Agregar cuenta"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Las cuentas imputables son las hojas del plan: las únicas que reciben asientos.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a-code">Código</Label>
              <Input
                id="a-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="Ej. 1.1.01"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-shortcode">Código corto</Label>
              <Input
                id="a-shortcode"
                value={form.shortCode}
                onChange={(e) => set("shortCode", e.target.value)}
                placeholder="Código del sistema anterior"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-name">Nombre</Label>
            <Input
              id="a-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej. Caja"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-parent">Cuenta madre</Label>
            <NativeSelect
              id="a-parent"
              value={form.parentId}
              onValueChange={handleParentChange}
              options={parentOptions}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-type">Tipo</Label>
            <NativeSelect
              id="a-type"
              value={form.type}
              onValueChange={(v) => set("type", v as AccountType)}
              options={TYPE_OPTIONS}
              disabled={form.parentId !== NO_PARENT || editingHasChildren}
            />
            {form.parentId !== NO_PARENT && (
              <p className="text-xs text-muted-foreground">Se hereda de la cuenta madre.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="a-postable">Imputable</Label>
              {editingHasChildren && (
                <p className="text-xs text-muted-foreground">
                  Tiene subcuentas: no puede ser imputable.
                </p>
              )}
            </div>
            <Switch
              id="a-postable"
              checked={form.isPostable}
              disabled={editingHasChildren}
              onCheckedChange={(checked) => set("isPostable", checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label htmlFor="a-active">Cuenta activa</Label>
            <Switch
              id="a-active"
              checked={form.isActive}
              onCheckedChange={(checked) => set("isActive", checked)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loadingCreate || loadingUpdate}>
              {loadingCreate || loadingUpdate ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </GenericModal>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar la cuenta <strong>{deleteTarget?.name}</strong>. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
