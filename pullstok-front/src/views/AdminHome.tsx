import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOrgModulesContext } from "@/contexts/OrgModulesContext";
import { resolveEffectiveModules } from "@/components/molecules/sidebar/navItems";
import {
  ADMIN_WORKSPACE_AREAS,
  filterAdminWorkspace,
  isItemAvailable,
  type AdminWorkspaceItem,
} from "@/constants/adminWorkspace";

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const cardBase =
  "h-full flex-row items-start gap-4 p-4 transition-colors";

const ItemCard = ({ item }: { item: AdminWorkspaceItem }) => {
  const Icon = item.icon;
  const body = (
    <>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isItemAvailable(item)
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium leading-tight">{item.label}</span>
          {!isItemAvailable(item) && (
            <Badge variant="secondary" className="text-[10px]">
              Próximamente
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
      </div>
    </>
  );

  if (isItemAvailable(item)) {
    return (
      <Link
        to={item.route as string}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className={cn(cardBase, "hover:border-primary/50 hover:bg-accent/40")}>
          {body}
        </Card>
      </Link>
    );
  }

  return (
    <Card
      aria-disabled="true"
      data-disabled="true"
      className={cn(cardBase, "cursor-not-allowed opacity-60")}
    >
      {body}
    </Card>
  );
};

/**
 * Home de las organizaciones en modo ADMINISTRATIVO (Organization.uiMode):
 * launcher por áreas (Comercial / Tesorería / Contabilidad) construido desde
 * constants/adminWorkspace.ts. Ítems disponibles navegan; los no
 * implementados se ven deshabilitados con "Próximamente"; los de módulos no
 * habilitados o sin permiso para el rol no se muestran.
 */
export const AdminHome = () => {
  const { enabledModules, plan: modulesPlan, hasPriceKg } = useOrgModulesContext();
  const user = readUser();
  const plan = modulesPlan ?? user?.plan;

  const areas = useMemo(() => {
    const effective = resolveEffectiveModules(enabledModules, plan, hasPriceKg);
    return filterAdminWorkspace(ADMIN_WORKSPACE_AREAS, effective, user?.role);
    // user se relee de localStorage en cada render pero su rol no cambia en sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledModules, plan, hasPriceKg, user?.role]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-sm text-muted-foreground">
          Accedé a las áreas de gestión de tu organización.
        </p>
      </div>

      {areas.map((area) => {
        const AreaIcon = area.icon;
        return (
          <section key={area.key} aria-labelledby={`area-${area.key}`}>
            <h2
              id={`area-${area.key}`}
              className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <AreaIcon className="h-4 w-4" />
              {area.label}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {area.items.map((item) => (
                <ItemCard key={item.key} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
