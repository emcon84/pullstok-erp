import { ReactNode } from "react";

/**
 * Layout full-page sin sidebar, compartido por el cambio de contraseña
 * forzado y el wizard de onboarding — ambos ocurren antes de que el usuario
 * tenga acceso al MainLayout normal.
 */
const OnboardingLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen w-full bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
};

export default OnboardingLayout;
