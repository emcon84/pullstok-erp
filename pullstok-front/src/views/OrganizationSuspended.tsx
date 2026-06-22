import { ShieldAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Pantalla de bloqueo total cuando la organización del usuario está
 * suspendida (kill switch, sdd/planes-y-billing). Vive fuera de
 * ProtectedLayout (sin sidebar), igual que /cambiar-contrasena y
 * /bienvenida, montada sobre OnboardingLayout. No ofrece ninguna acción
 * de auto-servicio: la reactivación es manual vía panel superadmin.
 */
export const OrganizationSuspended = () => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <CardTitle className="text-xl">
            Tu organización está suspendida
          </CardTitle>
        </div>
        <CardDescription>
          No podés acceder al sistema mientras tu organización esté
          suspendida. Contactá al administrador de tu cuenta para más
          información.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Si creés que esto es un error, comunicate con soporte.
        </p>
      </CardContent>
    </Card>
  );
};
