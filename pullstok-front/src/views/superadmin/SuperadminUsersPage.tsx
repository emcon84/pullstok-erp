import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Users, ArrowLeft, Trash2 } from "lucide-react";
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
import {
  getOrgUsers,
  createOrgUser,
  setOrgUserActive,
  deleteOrgUser,
  type OrgUser,
} from "@/services/superadminService";
import { ROLE_DISPLAY, type Role } from "@/constants/rolePermissions";
import { useConfirm } from "@/components/hooks/useConfirm";

const ORG_ROLES: Role[] = ["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER", "EMPLOYEE"];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export const SuperadminUsersPage = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const confirm = useConfirm();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("EMPLOYEE");
  const [creating, setCreating] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    try {
      const data = await getOrgUsers(orgId);
      setUsers(data);
    } catch (e: any) {
      toast.error(e.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId]);

  const handleCreate = async () => {
    if (!orgId) return;
    if (!email.trim() || !password || password.length < 8) {
      toast.error("Email y contraseña (mínimo 8 caracteres) son requeridos");
      return;
    }
    setCreating(true);
    try {
      await createOrgUser(orgId, {
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        password,
        role,
      });
      toast.success("Usuario creado");
      setEmail("");
      setUsername("");
      setName("");
      setPhone("");
      setAddress("");
      setPassword("");
      setRole("EMPLOYEE");
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error al crear usuario");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    if (!orgId) return;
    setToggleLoading(id);
    try {
      await setOrgUserActive(orgId, id, !currentActive);
      toast.success("Estado actualizado");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error al actualizar estado");
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!orgId) return;
    const ok = await confirm({
      title: "¿Eliminar usuario?",
      description: "Esta acción no se puede deshacer. El usuario se eliminará permanentemente.",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteOrgUser(orgId, id);
      toast.success("Usuario eliminado");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar usuario");
    } finally {
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
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Usuarios de la organización
          </h1>
          <p className="text-sm text-muted-foreground">
            {users.length} usuario{users.length === 1 ? "" : "s"} registrado
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
              <DialogTitle>Crear usuario en esta organización</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-name">Nombre completo</Label>
                <Input
                  id="su-name"
                  type="text"
                  placeholder="Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="su-phone">Teléfono</Label>
                  <Input
                    id="su-phone"
                    type="text"
                    placeholder="+54 11 1234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-address">Dirección</Label>
                  <Input
                    id="su-address"
                    type="text"
                    placeholder="Av. Siempreviva 742"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-password">Contraseña</Label>
                <Input
                  id="su-password"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-role">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="su-role">
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
                disabled={creating || !email.trim() || password.length < 8}
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
          <p className="font-medium">No hay usuarios en esta organización</p>
          <p className="text-sm text-muted-foreground">
            Creá el primer usuario desde el botón de arriba.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
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
                    {user.name || user.email || user.username}
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
