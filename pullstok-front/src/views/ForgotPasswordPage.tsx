import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { forgotPassword } from "../services/authService";
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

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
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
            <CardTitle className="text-xl">Revisá tu correo</CardTitle>
            <CardDescription>
              Te enviamos un enlace de recuperación a{" "}
              <strong>{email}</strong>. Revisá tu bandeja de entrada (y spam). El
              enlace vence en 15 minutos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link to="/">Volver al inicio de sesión</Link>
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
          <CardTitle className="text-xl">¿Olvidaste tu contraseña?</CardTitle>
          <CardDescription>
            Ingresá tu correo electrónico y te enviaremos un enlace para
            restablecerla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="vos@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "Enviando..." : "Enviar enlace"}
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
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-indigo-100/80">
        © {new Date().getFullYear()} Pullstok · Gestión de stock
      </p>
    </div>
  );
};
