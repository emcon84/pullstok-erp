// Composición de la capa ARCA (D1: ArcaClientHomo = WSAA + WSFEv1).
// Expone la interfaz ArcaClient que inyecta el servicio fiscal; la
// autenticación (con cache de TA) es transparente para el caller.

import { authenticateWsaa } from "./wsaaClient";
import {
  feCompConsultar,
  feCompUltimoAutorizado,
  fecaeSolicitar,
} from "./wsfev1Client";
import type { ArcaAuthContext, ArcaClient } from "./types";

export const createArcaClient = (context: ArcaAuthContext): ArcaClient => ({
  authenticate: () => authenticateWsaa(context),
  getLastInvoiceNumber: (req) =>
    authenticateWsaa(context).then((ta) => feCompUltimoAutorizado(context, ta, req)),
  requestCAE: (req) =>
    authenticateWsaa(context).then((ta) => fecaeSolicitar(context, ta, req)),
  consultarComprobante: (req) =>
    authenticateWsaa(context).then((ta) => feCompConsultar(context, ta, req)),
});

/** Alias del diseño (D1): el cliente homo es la composición WSAA+WSFEv1. */
export const createArcaClientHomo = createArcaClient;
