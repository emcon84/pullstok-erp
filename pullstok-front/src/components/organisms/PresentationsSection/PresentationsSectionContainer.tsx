import { useCallback, useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { DataItem, ProductPresentation } from "@/types";
import { findLegacyBlisterPrice } from "@/components/hooks/presentationHelpers";
import { usePresentationsEditor } from "@/components/hooks/usePresentationsEditor";
import { EnablePresentationsDialog } from "@/components/molecules/EnablePresentationsDialog";
import { PresentationsSection } from "@/components/organisms/PresentationsSection";

type CatalogItem = { name?: string | null; price: number | string };

/** Products already loaded by the list queries (flat arrays or infinite pages). */
const cachedCatalog = (queryClient: QueryClient): CatalogItem[] =>
  queryClient.getQueriesData({ queryKey: ["products"] }).flatMap(([, data]) => {
    if (Array.isArray(data)) return data as CatalogItem[];
    const pages = (data as { pages?: { items?: CatalogItem[] }[] } | undefined)?.pages;
    return pages ? pages.flatMap((pg) => pg.items ?? []) : [];
  });

interface Props {
  /** Existing product (edit mode) of the FARMACIA category. */
  product: DataItem;
  /** Notified when presentations get enabled/disabled (e.g. to lock the category). */
  onEnabledChange?: (enabled: boolean, presentations: ProductPresentation[]) => void;
}

/** Container: wires the editor hook and the enable dialog to the presentational section. */
export const PresentationsSectionContainer = ({ product, onEnabledChange }: Props) => {
  const queryClient = useQueryClient();
  const productId = (product._id || product.id) as string;
  const [enabled, setEnabled] = useState(product.hasPresentations === true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const presentations = useMemo(() => product.presentations ?? [], [product.presentations]);

  const handleChanged = useCallback(
    (list: ProductPresentation[]) => {
      // The mutation response carries the ACTIVE rows: none left = disabled.
      const nowEnabled = list.length > 0;
      setEnabled(nowEnabled);
      onEnabledChange?.(nowEnabled, list);
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stock", productId] });
    },
    [queryClient, productId, onEnabledChange],
  );

  const editor = usePresentationsEditor({
    productId,
    presentations,
    basePrice: Number(product.price) || 0,
    onChanged: handleChanged,
  });

  const legacyBlister = dialogOpen ? findLegacyBlisterPrice(product.name, cachedCatalog(queryClient)) : null;

  return (
    <>
      <PresentationsSection
        enabled={enabled}
        rows={editor.rows}
        error={dialogOpen ? null : editor.error}
        busy={editor.busy}
        isBase={editor.isBase}
        onAdd={editor.addRow}
        onRemove={editor.removeRow}
        onMove={editor.moveRow}
        onChange={editor.updateRow}
        onSave={editor.save}
        onRequestEnable={() => setDialogOpen(true)}
        onDisable={editor.disable}
      />
      <EnablePresentationsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentStock={Number(product.quantity) || 0}
        basePrice={Number(product.price) || 0}
        legacyBlister={legacyBlister}
        busy={editor.busy}
        error={dialogOpen ? editor.error : null}
        onConfirm={(set, counted) => editor.enable(set, counted)}
      />
    </>
  );
};
