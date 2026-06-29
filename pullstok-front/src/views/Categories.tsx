import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Tags, Check, X } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Category,
  getCategories,
  createCategories,
  updateCategory,
  deleteCategory,
} from "../services/onboardingService";
import { Loader } from "../components/atoms/loader";

export const Categories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar categorías");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Ya existe una categoría con ese nombre");
      return;
    }
    setAdding(true);
    try {
      await createCategories([name]);
      setNewName("");
      await load();
      toast.success("Categoría agregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al agregar");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (cat: Category) => {
    setEditId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    const name = editName.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      await updateCategory(editId, name);
      cancelEdit();
      await load();
      toast.success("Categoría actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al renombrar");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (
      !window.confirm(
        `¿Eliminar la categoría "${cat.name}"? Los productos que la usen quedarán sin categoría.`,
      )
    )
      return;
    try {
      await deleteCategory(cat.id);
      await load();
      toast.success("Categoría eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Organizá tus productos por categoría. {categories.length} categoría
          {categories.length === 1 ? "" : "s"}.
        </p>
      </div>

      {/* Alta inline */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Nueva categoría (ej. Limpieza, Bazar, Bebidas)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="sm:flex-1"
        />
        <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </Card>

      {categories.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Tags className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay categorías</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primera categoría para organizar tus productos.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="flex flex-row items-center gap-2 p-4">
              {editId === cat.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-success hover:bg-success/10"
                    onClick={handleSaveEdit}
                    disabled={savingEdit || !editName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={cancelEdit}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Tags className="h-4 w-4" />
                    </div>
                    <p className="truncate font-medium">{cat.name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(cat)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDelete(cat)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
