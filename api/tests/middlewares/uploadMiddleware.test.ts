import { Request, Response, NextFunction } from "express";
import {
  handleUploadError,
  PDF_MAX_SIZE,
  pdfFileFilter,
} from "../../src/middlewares/uploadMiddleware";

const fakeRes = () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
};

const fakeReq = () => ({ file: {} }) as unknown as Request;

describe("uploadPdf — multer dedicado para planillas de proveedor (10MB, PDF only)", () => {
  it("exposes the 10MB limit constant", () => {
    expect(PDF_MAX_SIZE).toBe(10 * 1024 * 1024);
  });

  it("accepts application/pdf mimetypes", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq(), { mimetype: "application/pdf", originalname: "planilla.pdf" } as any, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("accepts .pdf extension even when the mimetype is generic", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq(), { mimetype: "application/octet-stream", originalname: "planilla.pdf" } as any, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("rejects non-PDF files with an error", () => {
    const cb = jest.fn();
    pdfFileFilter(fakeReq(), { mimetype: "text/plain", originalname: "datos.txt" } as any, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("handleUploadError — 413 tamaño / 400 archivo no-PDF", () => {
  it("maps LIMIT_FILE_SIZE to 413 with the 10MB message", () => {
    const res = fakeRes();
    handleUploadError(
      { code: "LIMIT_FILE_SIZE" } as any,
      fakeReq(),
      res,
      jest.fn() as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(413);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe(
      "El archivo excede 10MB",
    );
  });

  it("maps a non-PDF error to 400", () => {
    const res = fakeRes();
    handleUploadError(
      new Error("Solo se aceptan archivos PDF"),
      fakeReq(),
      res,
      jest.fn() as NextFunction,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe(
      "Solo se aceptan archivos PDF",
    );
  });

  it("calls next() when there is no error", () => {
    const next = jest.fn() as NextFunction;
    handleUploadError(null as any, fakeReq(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
