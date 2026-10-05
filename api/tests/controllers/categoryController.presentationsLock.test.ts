import { updateCategory, deleteCategory } from "../../src/controllers/categoryController";
import CategoryService from "../../src/services/categoryService";
import { PresentationError } from "../../src/utils/presentations";

jest.mock("../../src/services/categoryService");
jest.mock("../../src/config/db", () => ({ prisma: {}, basePrisma: {} }));

const mocked = CategoryService as jest.Mocked<typeof CategoryService>;
const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const lockErr = new PresentationError("PRESENTATIONS_CATEGORY_LOCKED", "locked", 409);

it("rename maps the lock to 409 with its code", async () => {
  mocked.rename.mockRejectedValue(lockErr);
  const r = res();
  await updateCategory({ params: { id: "c" }, body: { name: "X" } } as any, r);
  expect(r.status).toHaveBeenCalledWith(409);
  expect(r.json).toHaveBeenCalledWith({ message: "locked", code: "PRESENTATIONS_CATEGORY_LOCKED" });
});

it("delete maps the lock to 409 with its code", async () => {
  mocked.remove.mockRejectedValue(lockErr);
  const r = res();
  await deleteCategory({ params: { id: "c" } } as any, r);
  expect(r.status).toHaveBeenCalledWith(409);
});

it("other errors keep returning 400", async () => {
  mocked.rename.mockRejectedValue(new Error("boom"));
  const r = res();
  await updateCategory({ params: { id: "c" }, body: {} } as any, r);
  expect(r.status).toHaveBeenCalledWith(400);
});
