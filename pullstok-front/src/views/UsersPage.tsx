import { useEffect, useState } from "react";
import { Plus, Users, Trash2, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader } from "@/components/atoms/loader";
import { useUsers, useDeleteUser, useUpdateUser } from "@/components/hooks/useUsers";
import { useBranches } from "@/components/hooks/useBranches";
import { useConfirm } from "@/components/hooks/useConfirm";
import {
  createUser as createUserApi,
  setUserActive as setUserActiveApi,
  type UserData,
} from "@/services/userService";
import { type BranchData } from "@/services/branchService";
import { ROLE_DISPLAY, type Role } from "@/constants/rolePermissions";

const ORG_ROLES: Role[] = ["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER", "EMPLOYEE"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const UsersPage = () => {
  const { users: initialUsers, loading, refetch } = useUsers();
  const { branches } = useBranches();
  const { deleteUser: deleteUserMut } = useDeleteUser();
  const { updateUser: updateUserMut } = useUpdateUser();
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("EMPLOYEE");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setUsers(initialUsers);
    }
  }, [initialUsers, loading]);

  const handleCreate = async () => {
    if ((!email.trim() && !username.trim()) || !password || password.length < 8) {
      toast.error("Email o usuario y contraseña (mínimo 8 caracteres) son requeridos");
      return;
    }
    setCreating(true);
    try {
      await createUserApi({
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        password,
        role,
        branchIds: selectedBranchIds.length > 0 ? selectedBranchIds : undefined,
      });
      toast.success("Usuario creado");
      setEmail("");
      setUsername("");
      setName("");
      setPhone("");
      setAddress("");
      setPassword("");
      setRole("EMPLOYEE");
      setSelectedBranchIds([]);
      setDialogOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Error al crear usuario");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    setToggleLoading(id);
    try {
      await setUserActiveApi(id, !currentActive);
      toast.success("Estado actualizado");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar estado");
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "¿Eliminar usuario?",
      description: "Esta acción no se puede deshacer. El usuario se eliminará permanentemente.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      deleteUserMut(id, {
        onSuccess: () => {
          toast.success("Usuario eliminado");
          refetch();
        },
        onError: (e: any) => {
          toast.error(e.message || "Error al eliminar usuario");
        },
        onSettled: () => setDeletingId(null),
      });
    } catch {
      setDeletingId(null);
    }
  };

  const openEdit = (user: UserData) => {
    setEditUser(user);
    setEditName(user.name || "");
    setEditEmail(user.email || "");
    setEditUsername(user.username || "");
    setEditPhone((user as any).phone || "");
    setEditAddress((user as any).address || "");
    setEditRole(user.role);
    setEditBranchIds(user.branchIds || []);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    setSaving(true);
    const data: any = {};
    const orig = editUser as any;
    if (editName !== (orig.name || "")) data.name = editName || null;
    if (editEmail !== (orig.email || "")) data.email = editEmail || null;
    if (editUsername !== (orig.username || "")) data.username = editUsername || null;
    if (editPhone !== (orig.phone || "")) data.phone = editPhone || null;
    if (editAddress !== (orig.address || "")) data.address = editAddress || null;
    if (editRole !== orig.role) data.role = editRole;

    // Always include branchIds in update (replace semantics)
    const currentIds = orig.branchIds || [];
    const newIds = editBranchIds.sort();
    const currentSorted = [...currentIds].sort();
    if (JSON.stringify(newIds) !== JSON.stringify(currentSorted)) {
      data.branchIds = editBranchIds;
    }

    if (Object.keys(data).length === 0) {
      setEditUser(null);
      setSaving(false);
      return;
    }

    updateUserMut(
      { id: editUser.id, data },
      {
        onSuccess: () => {
          toast.success("Usuario actualizado");
          refetch();
          setEditUser(null);
        },
        onError: (e: any) => toast.error(e.message || "Error al actualizar"),
        onSettled: () => setSaving(false),
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
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná los usuarios de tu organización. {users.length} usuario
            {users.length === 1 ? "" : "s"}.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="u-email">Email</Label>
                <Input
                  id="u-email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Para roles Admin y Vendedor se recomienda usar email.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-username">Usuario</Label>
                <Input
                  id="u-username"
                  type="text"
                  placeholder="nombre.usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Para Caja, Administración y Empleado. Solo minúsculas, números y puntos.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-name">Nombre completo</Label>
                <Input
                  id="u-name"
                  type="text"
                  placeholder="Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="u-phone">Teléfono</Label>
                  <Input
                    id="u-phone"
                    type="text"
                    placeholder="+54 11 1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u-address">Dirección</Label>
                  <Input
                    id="u-address"
                    type="text"
                    placeholder="Av. Siempreviva 742"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-password">Contraseña</Label>
                <Input
                  id="u-password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="u-role">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="u-role">
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_DISPLAY[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {branches.length > 0 && (
                <div className="space-y-2">
                  <Label>Sucursales</Label>
                  <div className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2">
                    {branches.map((b) => (
                      <label
                        key={b.id}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedBranchIds.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBranchIds([...selectedBranchIds, b.id]);
                            } else {
                              setSelectedBranchIds(
                                selectedBranchIds.filter((id) => id !== b.id),
                              );
                            }
                          }}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={creating || (!email.trim() && !username.trim()) || password.length < 8}
              >
                {creating ? "Creando..." : "Crear usuario"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {users.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay usuarios</p>
          <p className="text-sm text-muted-foreground">
            Creá el primer usuario de tu organización.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email / Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden sm:table-cell">Sucursales</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Creado</TableHead>
                <TableHead className="w-[80px]">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name || user.email || user.username}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {ROLE_DISPLAY[user.role as Role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(user.branchIds || []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        (user.branchIds || []).map((bid) => {
                          const branchName = branches.find((b) => b.id === bid)?.name || bid;
                          return (
                            <Badge key={bid} variant="outline" className="text-xs">
                              {branchName}
                            </Badge>
                          );
                        })
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.isActive
                          ? "border-green-200 text-green-700"
                          : "text-muted-foreground"
                      }
                    >
                      {user.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={user.isActive}
                        onCheckedChange={() =>
                          handleToggle(user.id, user.isActive)
                        }
                        disabled={toggleLoading === user.id}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(user.id)}
                        disabled={deletingId === user.id}
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
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_DISPLAY[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {branches.length > 0 && (
              <div className="space-y-2">
                <Label>Sucursales</Label>
                <div className="max-h-32 overflow-y-auto space-y-1 border rounded-md p-2">
                  {branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={editBranchIds.includes(b.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditBranchIds([...editBranchIds, b.id]);
                          } else {
                            setEditBranchIds(
                              editBranchIds.filter((id) => id !== b.id),
                            );
                          }
                        }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={handleUpdate} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
