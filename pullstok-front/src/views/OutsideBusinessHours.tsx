import { Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Pantalla de bloqueo total cuando un rol operativo intenta operar fuera del
 * horario comercial de su organización (sdd/business-hours-access). Vive fuera
 * de ProtectedLayout (sin sidebar), montada sobre OnboardingLayout igual que
 * /organizacion-suspendida. Se llega acá vía 403 OUTSIDE_BUSINESS_HOURS en los
 * interceptors (lib/authInterceptor + controllers/authController), que limpian
 * la sesión y redirigen.
 */
export const OutsideBusinessHours = () => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-destructive" />
          <CardTitle className="text-xl">
            Fuera del horario comercial
          </CardTitle>
        </div>
        <CardDescription>
          El acceso al sistema está disponible solo dentro del horario del
          comercio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Volvé dentro del horario de apertura para operar normalmente.
        </p>
      </CardContent>
    </Card>
  );
};
