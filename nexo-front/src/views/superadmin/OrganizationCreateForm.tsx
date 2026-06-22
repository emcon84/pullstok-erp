import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plan } from "../../services/onboardingService";
import { useCreateOrganization } from "../../components/hooks/useSuperadmin";

const PLAN_OPTIONS: { value: Plan; label: string; description: string }[] = [
  { value: "BASICO", label: "Básico", description: "2 usuarios · 500 productos" },
  { value: "PRO", label: "Pro", description: "10 usuarios · productos ilimitados" },
  { value: "PREMIUM", label: "Premium", description: "Todo ilimitado" },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

interface OrganizationCreateFormProps {
  onSuccess: () => void;
}

/**
 * Form de alta de comercio (org + admin) embebido en un Dialog desde
 * OrganizationsList. El slug se autogenera a partir del nombre pero queda
 * editable (el backend lo valida con regex ^[a-z0-9-]+$, ver schemas.ts).
 */
export const OrganizationCreateForm = ({
  onSuccess,
}: OrganizationCreateFormProps) => {
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [plan, setPlan] = useState<Plan>("BASICO");
  const [error, setError] = useState<string | null>(null);

  const { submitOrganization, loadingCreate } = useCreateOrganization();

  const handleNameChange = (value: string) => {
    setOrganizationName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!organizationName || !slug || !adminEmail || !adminPassword) {
      setError("Completá todos los campos");
      return;
    }
    if (adminPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    submitOrganization(
      { organizationName, slug, adminEmail, adminPassword, plan },
      {
        onSuccess: () => {
          toast.success(`${organizationName} creada con éxito`);
          onSuccess();
        },
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizationName">Nombre del comercio</Label>
        <Input
          id="organizationName"
          value={organizationName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ej: Ferretería El Tornillo"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="ferreteria-el-tornillo"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminEmail">Email del admin</Label>
        <Input
          id="adminEmail"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@comercio.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="adminPassword">Contraseña inicial</Label>
        <Input
          id="adminPassword"
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="plan">Plan</Label>
        <Select value={plan} onValueChange={(value) => setPlan(value as Plan)}>
          <SelectTrigger id="plan" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} — {opt.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loadingCreate}>
          {loadingCreate && <Loader2 className="animate-spin" />}
          {loadingCreate ? "Creando..." : "Crear comercio"}
        </Button>
      </div>
    </form>
  );
};
