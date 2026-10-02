import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Phone, Users, Wallet, Search } from "lucide-react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenericModal } from "../components/molecules/GenericModal";
import {
  ModalContentCustomer,
  EMPTY_CUSTOMER_EXTRA,
  type CustomerExtra,
} from "../components/molecules/GenericModal/ModalContentCustomer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "../components/hooks/useCustomer";
import { useCustomerBalances } from "../components/hooks/useCustomerAccount";
import { CustomerAccountDrawer } from "../components/molecules/CustomerAccountDrawer";
import { CustomerBalancesSummary } from "../components/molecules/CustomerBalancesSummary";
import { Loader } from "../components/atoms/loader";
import { customerDisplayName } from "../utils/customerName";
import { fetchPadron } from "../services/customerService";
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

const money = (n: number) =>
  `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

export const Customers = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerTaxId, setNewCustomerTaxId] = useState("");
  const [newCustomerTaxCondition, setNewCustomerTaxCondition] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerExtra, setNewCustomerExtra] = useState<CustomerExtra>(EMPTY_CUSTOMER_EXTRA);
  const [loadingPadron, setLoadingPadron] = useState(false);
  // Filtros de la lista (búsqueda por nombre/código/CUIT + estado).
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [updatedCustomerName, setUpdatedCustomerName] = useState("");
  const [updatedCustomerEmail, setUpdatedCustomerEmail] = useState("");
  const [updatedCustomerPhone, setUpdatedCustomerPhone] = useState("");
  const [updatedCustomerTaxId, setUpdatedCustomerTaxId] = useState("");
  const [updatedCustomerTaxCondition, setUpdatedCustomerTaxCondition] = useState("");
  const [updatedCustomerAddress, setUpdatedCustomerAddress] = useState("");
  const [updatedCustomerExtra, setUpdatedCustomerExtra] = useState<CustomerExtra>(EMPTY_CUSTOMER_EXTRA);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const { customers, loadingCustomer: loading, errorCustomer } = useCustomers();
  const { submitCustomer, loadingCustomer } = useCreateCustomer();
  const { updateCustomer, loadingUpdate } = useUpdateCustomer();
  const { deleteCustomer } = useDeleteCustomer();
  const { balances } = useCustomerBalances();
  // Cliente cuya cuenta corriente está abierta (el diálogo se monta recién ahí).
  const [accountTarget, setAccountTarget] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  // Company-wide debt totals are for ADMIN/MANAGEMENT only (role from localStorage,
  // same pattern as Sales/Dashboard).
  const canSeeBalancesSummary = useMemo(() => {
    try {
      const role = JSON.parse(localStorage.getItem("user") ?? "null")?.role;
      return role === "ADMIN" || role === "MANAGEMENT";
    } catch {
      return false;
    }
  }, []);
  const balanceById = new Map(balances.map((b) => [b.customerId, b.balance]));

  const queryClient = useQueryClient();

  const openModal = () => setIsOpen(true);

  const onlyDigits = (value: string) => value.replace(/\D/g, "");

  /** Deriva la condición de IVA desde los impuestos del padrón (id 30 = IVA). */
  const deriveTaxCondition = (impuestos: { id: number; descripcion: string; estado: string }[]): string => {
    const iva = impuestos.find((i) => i.id === 30);
    return iva?.descripcion || iva?.estado || "";
  };

  const handleArcaLookup = async (cuit: string) => {
    const digits = onlyDigits(cuit);
    if (digits.length !== 11) {
      toast.error("Ingresá un CUIT de 11 dígitos para consultar ARCA");
      return;
    }
    setLoadingPadron(true);
    try {
      const persona = await fetchPadron(digits);
      setNewCustomerName(persona.razonSocial);
      setNewCustomerTaxCondition(deriveTaxCondition(persona.impuestos));
      if (persona.domicilio) {
        const { direccion, localidad, codPostal, provincia } = persona.domicilio;
        setNewCustomerAddress(
          [direccion, localidad, provincia, codPostal].filter(Boolean).join(", "),
        );
      }
      setNewCustomerTaxId(digits);
      toast.success("Datos cargados desde ARCA. Revisá y confirmá antes de guardar.");
    } catch (error: any) {
      toast.error(error?.message || "Error al consultar el padrón de ARCA");
    } finally {
      setLoadingPadron(false);
    }
  };

  const handleEditArcaLookup = async (cuit: string) => {
    const digits = onlyDigits(cuit);
    if (digits.length !== 11) {
      toast.error("Ingresá un CUIT de 11 dígitos para consultar ARCA");
      return;
    }
    setLoadingPadron(true);
    try {
      const persona = await fetchPadron(digits);
      setUpdatedCustomerName(persona.razonSocial);
      setUpdatedCustomerTaxCondition(deriveTaxCondition(persona.impuestos));
      if (persona.domicilio) {
        const { direccion, localidad, codPostal, provincia } = persona.domicilio;
        setUpdatedCustomerAddress(
          [direccion, localidad, provincia, codPostal].filter(Boolean).join(", "),
        );
      }
      setUpdatedCustomerTaxId(digits);
      toast.success("Datos cargados desde ARCA. Revisá y confirmá antes de guardar.");
    } catch (error: any) {
      toast.error(error?.message || "Error al consultar el padrón de ARCA");
    } finally {
      setLoadingPadron(false);
    }
  };

  const handleAddCustomer = async () => {
    submitCustomer(
      {
        name: newCustomerName.trim() || undefined,
        email: newCustomerEmail.trim() || undefined,
        phone: newCustomerPhone.trim() || undefined,
        taxId: newCustomerTaxId || undefined,
        taxCondition: newCustomerTaxCondition || undefined,
        address: newCustomerAddress || undefined,
        code: newCustomerExtra.code.trim() || undefined,
        locality: newCustomerExtra.locality.trim() || undefined,
        province: newCustomerExtra.province.trim() || undefined,
        zone: newCustomerExtra.zone.trim() || undefined,
        isActive: newCustomerExtra.isActive ? undefined : false,
      },
      {
        onSuccess: () => {
          toast.success("Cliente agregado con éxito");
          closeModal();
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: (error) => {
          toast.error(`Error al agregar cliente: ${error.message}`);
        },
      },
    );
  };

  const askDeleteCustomer = (id: string, name: string) =>
    setDeleteTarget({ id, name });

  const confirmDeleteCustomer = () => {
    if (!deleteTarget) return;
    deleteCustomer(deleteTarget.id, {
      onSuccess: () => {
        toast.success("Cliente eliminado con éxito");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      },
      onError: (error) => {
        toast.error(`Error al eliminar cliente: ${error.message}`);
      },
    });
    setDeleteTarget(null);
  };

  const handleEditCustomer = (customerId: string) => {
    const customerMatch = customers?.find(
      (customer) => (customer.id || customer._id) === customerId,
    );
    if (customerMatch) {
      setEditCustomerId(customerId);
      setUpdatedCustomerName(customerMatch.name ?? "");
      setUpdatedCustomerEmail(customerMatch.email ?? "");
      setUpdatedCustomerPhone(customerMatch.phone ?? "");
      setUpdatedCustomerTaxId(customerMatch.taxId ?? "");
      setUpdatedCustomerTaxCondition(customerMatch.taxCondition ?? "");
      setUpdatedCustomerAddress(customerMatch.address ?? "");
      setUpdatedCustomerExtra({
        code: customerMatch.code ?? "",
        locality: customerMatch.locality ?? "",
        province: customerMatch.province ?? "",
        zone: customerMatch.zone ?? "",
        isActive: customerMatch.isActive !== false,
      });
      setIsEditModalOpen(true);
    }
  };

  const handleSaveEditedCustomer = async () => {
    if (!editCustomerId) return;
    updateCustomer(
      {
        id: editCustomerId,
        name: updatedCustomerName.trim() || undefined,
        email: updatedCustomerEmail.trim() || undefined,
        phone: updatedCustomerPhone.trim() || undefined,
        taxId: updatedCustomerTaxId || undefined,
        taxCondition: updatedCustomerTaxCondition || undefined,
        address: updatedCustomerAddress || undefined,
        // El backend normaliza "" a null, así que acá se puede limpiar el campo.
        code: updatedCustomerExtra.code.trim(),
        locality: updatedCustomerExtra.locality.trim(),
        province: updatedCustomerExtra.province.trim(),
        zone: updatedCustomerExtra.zone.trim(),
        isActive: updatedCustomerExtra.isActive,
      },
      {
        onSuccess: () => {
          toast.success("Cliente editado con éxito");
          setIsEditModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: (error) => {
          toast.error(`Error al editar cliente: ${error.message}`);
        },
      },
    );
  };

  const closeModal = () => {
    setIsOpen(false);
    setNewCustomerName("");
    setNewCustomerEmail("");
    setNewCustomerPhone("");
    setNewCustomerTaxId("");
    setNewCustomerTaxCondition("");
    setNewCustomerAddress("");
    setNewCustomerExtra(EMPTY_CUSTOMER_EXTRA);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditCustomerId(null);
    setUpdatedCustomerName("");
    setUpdatedCustomerEmail("");
    setUpdatedCustomerPhone("");
    setUpdatedCustomerTaxId("");
    setUpdatedCustomerTaxCondition("");
    setUpdatedCustomerAddress("");
    setUpdatedCustomerExtra(EMPTY_CUSTOMER_EXTRA);
  };

  const term = search.trim().toLowerCase();
  const visibleCustomers = (customers ?? []).filter((c) => {
    if (statusFilter === "active" && c.isActive === false) return false;
    if (statusFilter === "inactive" && c.isActive !== false) return false;
    if (!term) return true;
    return [c.name, c.code, c.taxId, c.email].some((v) =>
      (v ?? "").toLowerCase().includes(term),
    );
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (errorCustomer) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error al cargar clientes: {errorCustomer.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {customers?.length ?? 0} cliente
            {(customers?.length ?? 0) === 1 ? "" : "s"} registrado
            {(customers?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openModal}>
          <Plus className="h-4 w-4" />
          Agregar cliente
        </Button>
      </div>

      {canSeeBalancesSummary && (
        <CustomerBalancesSummary
          onSelectCustomer={({ customerId, name }) =>
            setAccountTarget({
              id: customerId,
              name,
              phone:
                customers?.find((c) => (c.id || c._id) === customerId)?.phone ?? "",
            })
          }
        />
      )}

      {customers && customers.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, código o CUIT"
              aria-label="Buscar clientes"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filtrar por estado">
            {(
              [
                ["all", "Todos"],
                ["active", "Activos"],
                ["inactive", "Inactivos"],
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

      {!customers || customers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay clientes</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primer cliente para empezar.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCustomers.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Ningún cliente coincide con la búsqueda.
            </p>
          )}
          {visibleCustomers.map((customer) => {
            const customerId = customer.id || customer._id || "";
            const balance = balanceById.get(customerId) ?? 0;
            return (
              <Card key={customerId} className="gap-0 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-semibold uppercase text-accent-foreground">
                      {customerDisplayName(customer)[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customerDisplayName(customer)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[customer.code, customer.email].filter(Boolean).join(" · ")}
                      </p>
                      {(customer.locality || customer.province || customer.zone) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[customer.locality, customer.province].filter(Boolean).join(", ")}
                          {customer.zone ? ` · Zona ${customer.zone}` : ""}
                        </p>
                      )}
                      {customer.isActive === false && (
                        <Badge variant="secondary" className="mt-1">Inactivo</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEditCustomer(customerId)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => askDeleteCustomer(customerId, customerDisplayName(customer))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {customer.phone || "Sin teléfono"}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Saldo</span>
                  {balance > 0 ? (
                    <span className="font-medium tabular-nums text-destructive">
                      Debe {money(balance)}
                    </span>
                  ) : balance < 0 ? (
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      A favor {money(Math.abs(balance))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() =>
                    setAccountTarget({
                      id: customerId,
                      name: customerDisplayName(customer),
                      phone: customer.phone ?? "",
                    })
                  }
                >
                  <Wallet className="h-4 w-4" />
                  Cuenta corriente
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <GenericModal isOpen={isOpen} onClose={closeModal}>
        <ModalContentCustomer
          name={newCustomerName}
          email={newCustomerEmail}
          phone={newCustomerPhone}
          taxId={newCustomerTaxId}
          taxCondition={newCustomerTaxCondition}
          address={newCustomerAddress}
          extra={newCustomerExtra}
          setExtra={setNewCustomerExtra}
          setName={setNewCustomerName}
          setEmail={setNewCustomerEmail}
          setPhone={setNewCustomerPhone}
          setTaxId={setNewCustomerTaxId}
          setTaxCondition={setNewCustomerTaxCondition}
          setAddress={setNewCustomerAddress}
          handleSaveCustomer={handleAddCustomer}
          handleCloseModal={closeModal}
          loadingCustomer={loadingCustomer}
          loadingPadron={loadingPadron}
          onArcaLookup={handleArcaLookup}
          isEditing={false}
        />
      </GenericModal>

      <GenericModal isOpen={isEditModalOpen} onClose={closeEditModal}>
        <ModalContentCustomer
          name={updatedCustomerName}
          email={updatedCustomerEmail}
          phone={updatedCustomerPhone}
          taxId={updatedCustomerTaxId}
          taxCondition={updatedCustomerTaxCondition}
          address={updatedCustomerAddress}
          extra={updatedCustomerExtra}
          setExtra={setUpdatedCustomerExtra}
          setName={setUpdatedCustomerName}
          setEmail={setUpdatedCustomerEmail}
          setPhone={setUpdatedCustomerPhone}
          setTaxId={setUpdatedCustomerTaxId}
          setTaxCondition={setUpdatedCustomerTaxCondition}
          setAddress={setUpdatedCustomerAddress}
          handleSaveCustomer={handleSaveEditedCustomer}
          handleCloseModal={closeEditModal}
          loadingCustomer={loadingUpdate}
          loadingPadron={loadingPadron}
          onArcaLookup={handleEditArcaLookup}
          isEditing={true}
        />
      </GenericModal>

      {accountTarget && (
        <CustomerAccountDrawer
          customerId={accountTarget.id}
          customerName={accountTarget.name}
          customerPhone={accountTarget.phone}
          open
          onOpenChange={(open) => !open && setAccountTarget(null)}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar a <strong>{deleteTarget?.name}</strong>. Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCustomer}
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
