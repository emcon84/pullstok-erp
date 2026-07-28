import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { resetPassword } from "../services/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(
        "Falta el token de recuperación. Asegurate de usar el enlace completo del correo.",
      );
      return;
    }

    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-primary shadow-lg">
            P
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Pullstok
          </h1>
        </div>

        <Card className="border-white/20 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl">¡Contraseña actualizada!</CardTitle>
            <CardDescription>
              Tu contraseña fue restablecida correctamente. Ya podés iniciar
              sesión con tu nueva contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/")}
            >
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-primary shadow-lg">
          P
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Pullstok
        </h1>
      </div>

      <Card className="border-white/20 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Nueva contraseña</CardTitle>
          <CardDescription>
            Elegí una contraseña nueva para tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-4">
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Falta el token de recuperación. Asegurate de usar el enlace
                completo del correo.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link to="/forgot-password">Pedir un nuevo enlace</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repetí la contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {loading ? "Actualizando..." : "Actualizar contraseña"}
              </Button>

              <div className="text-center">
                <Link
                  to="/"
                  className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-indigo-100/80">
        © {new Date().getFullYear()} Pullstok · Gestión de stock
      </p>
    </div>
  );
};
