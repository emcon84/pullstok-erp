import { useEffect, useState } from "react";
import { Plus, Users, Trash2 } from "lucide-react";
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
import { useUsers, useDeleteUser } from "@/components/hooks/useUsers";
import {
  createUser as createUserApi,
  setUserActive as setUserActiveApi,
  type UserData,
} from "@/services/userService";
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
  const { deleteUser: deleteUserMut } = useDeleteUser();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("EMPLOYEE");
  const [creating, setCreating] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

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
        password,
        role,
      });
      toast.success("Usuario creado");
      setEmail("");
      setUsername("");
      setPassword("");
      setRole("EMPLOYEE");
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
    if (!confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) return;
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
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Creado</TableHead>
                <TableHead className="w-[80px]">Activo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.email || user.username}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {ROLE_DISPLAY[user.role as Role] ?? user.role}
                    </Badge>
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
    </div>
  );
};
