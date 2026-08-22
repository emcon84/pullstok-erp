import { useState } from "react";
import { Plus, Building2, Trash2, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/atoms/loader";
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useToggleBranchActive,
} from "@/components/hooks/useBranches";
import { useConfirm } from "@/components/hooks/useConfirm";
import { type BranchData } from "@/services/branchService";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const BranchesPage = () => {
  const { branches, loading, refetch } = useBranches();
  const { createBranch, loading: creating } = useCreateBranch();
  const { updateBranch, loading: saving } = useUpdateBranch();
  const { deleteBranch } = useDeleteBranch();
  const { toggleBranchActive } = useToggleBranchActive();
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [puntoVenta, setPuntoVenta] = useState("");

  const [editBranch, setEditBranch] = useState<BranchData | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPuntoVenta, setEditPuntoVenta] = useState("");

  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    const pv =
      puntoVenta.trim() === "" ? undefined : Number(puntoVenta.trim());
    if (pv != null && (Number.isNaN(pv) || pv < 1 || pv > 9999)) {
      toast.error("El punto de venta debe estar entre 1 y 9999");
      return;
    }
    createBranch(
      {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        ...(pv != null ? { puntoVenta: pv } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Sucursal creada");
          setName("");
          setAddress("");
          setPhone("");
          setPuntoVenta("");
          setDialogOpen(false);
          refetch();
        },
        onError: (e: any) => toast.error(e.message || "Error al crear sucursal"),
      },
    );
  };

  const handleToggle = (id: string, currentActive: boolean) => {
    setToggleLoading(id);
    toggleBranchActive(
      { id, isActive: !currentActive },
      {
        onSuccess: () => {
          toast.success("Estado actualizado");
          refetch();
        },
        onError: (e: any) => toast.error(e.message || "Error al actualizar estado"),
        onSettled: () => setToggleLoading(null),
      },
    );
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "¿Eliminar sucursal?",
      description:
        "Esta acción no se puede deshacer. Los usuarios asignados a esta sucursal quedarán sin asignación.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    deleteBranch(id, {
      onSuccess: () => {
        toast.success("Sucursal eliminada");
        refetch();
      },
      onError: (e: any) => toast.error(e.message || "Error al eliminar sucursal"),
      onSettled: () => setDeletingId(null),
    });
  };

  const openEdit = (branch: BranchData) => {
    setEditBranch(branch);
    setEditName(branch.name);
    setEditAddress(branch.address || "");
    setEditPhone(branch.phone || "");
    setEditPuntoVenta(branch.puntoVenta != null ? String(branch.puntoVenta) : "");
  };

  const handleUpdate = () => {
    if (!editBranch) return;
    const data: Record<string, any> = {};
    if (editName !== editBranch.name) data.name = editName || undefined;
    if (editAddress !== (editBranch.address || "")) data.address = editAddress || null;
    if (editPhone !== (editBranch.phone || "")) data.phone = editPhone || null;
    const currentPv = editBranch.puntoVenta != null ? String(editBranch.puntoVenta) : "";
    if (editPuntoVenta !== currentPv) {
      const pv = editPuntoVenta.trim() === "" ? null : Number(editPuntoVenta.trim());
      if (pv != null && pv !== null && (Number.isNaN(pv) || pv < 1 || pv > 9999)) {
        toast.error("El punto de venta debe estar entre 1 y 9999");
        return;
      }
      data.puntoVenta = pv;
    }

    if (Object.keys(data).length === 0) {
      setEditBranch(null);
      return;
    }

    updateBranch(
      { id: editBranch.id, data },
      {
        onSuccess: () => {
          toast.success("Sucursal actualizada");
          refetch();
          setEditBranch(null);
        },
        onError: (e: any) => toast.error(e.message || "Error al actualizar"),
      },
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sucursales</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná las sucursales de tu organización. {branches.length} sucursal
            {branches.length === 1 ? "" : "es"}.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva sucursal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear sucursal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="b-name">Nombre</Label>
                <Input
                  id="b-name"
                  type="text"
                  placeholder="Sucursal Centro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-address">Dirección</Label>
                <Input
                  id="b-address"
                  type="text"
                  placeholder="Av. Siempreviva 742"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-phone">Teléfono</Label>
                <Input
                  id="b-phone"
                  type="text"
                  placeholder="+54 11 1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-pv">Punto de venta</Label>
                <Input
                  id="b-pv"
                  type="number"
                  min="1"
                  max="9999"
                  placeholder="Ej. 5 (opcional)"
                  value={puntoVenta}
                  onChange={(e) => setPuntoVenta(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={creating || !name.trim()}
              >
                {creating ? "Creando..." : "Crear sucursal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {branches.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay sucursales</p>
          <p className="text-sm text-muted-foreground">
            Creá la primera sucursal de tu organización.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Punto de venta</TableHead>
                <TableHead className="hidden sm:table-cell">Dirección</TableHead>
                <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                <TableHead className="hidden sm:table-cell">Creado</TableHead>
                <TableHead className="w-[80px]">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {branch.puntoVenta ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {branch.address || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {branch.phone || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {formatDate(branch.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={branch.isActive}
                        onCheckedChange={() =>
                          handleToggle(branch.id, branch.isActive)
                        }
                        disabled={toggleLoading === branch.id}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar sucursal"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(branch)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(branch.id)}
                        disabled={deletingId === branch.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog
        open={!!editBranch}
        onOpenChange={(open) => !open && setEditBranch(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Punto de venta</Label>
              <Input
                type="number"
                min="1"
                max="9999"
                placeholder="Ej. 5 (opcional)"
                value={editPuntoVenta}
                onChange={(e) => setEditPuntoVenta(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleUpdate}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
