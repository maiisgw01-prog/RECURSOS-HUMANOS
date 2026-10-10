import { getStore } from "@netlify/blobs";
import {
  AuthError,
  authErrorResponse,
  authorize,
  jsonResponse,
  sameOrigin
} from "../lib/auth.mjs";

const STORE_NAME = "rrhh-hospital-data";
const DATA_KEY = "data.json";
const MAX_BYTES = 20_000_000;

function validData(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Array.isArray(value.empleados)
    && Array.isArray(value.ausencias)
    && Array.isArray(value.incidencias)
    && Array.isArray(value.observaciones);
}

export const handler = async event => {
  if (!["GET", "PUT"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  let authorization;
  try {
    authorization = await authorize(event);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("No se pudo comprobar el acceso a los datos.", error);
    return jsonResponse(500, { error: "No se pudo comprobar el acceso." });
  }

  const cookies = authorization.cookie ? [authorization.cookie] : [];
  if (event.httpMethod === "GET") {
    try {
      const store = getStore(STORE_NAME);
      const data = await store.get(DATA_KEY, { type: "json", consistency: "strong" });
      return jsonResponse(200, data ?? null, cookies);
    } catch (error) {
      console.error("No se pudieron leer los datos guardados en Netlify Blobs.", error);
      return jsonResponse(500, { error: "No se pudieron leer los datos guardados." }, cookies);
    }
  }

  if (!sameOrigin(event, process.env.DISCORD_REDIRECT_URI)) {
    return jsonResponse(403, { error: "Origen no autorizado." }, cookies);
  }
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
    return jsonResponse(413, { error: "Los datos superan el tamaño permitido." }, cookies);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "El contenido no es JSON válido." }, cookies);
  }
  if (!validData(data)) {
    return jsonResponse(400, { error: "La estructura de los datos no es válida." }, cookies);
  }

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(DATA_KEY, data);
    return {
      statusCode: 204,
      headers: {
        "Cache-Control": "no-store",
        ...(authorization.cookie ? { "Set-Cookie": authorization.cookie } : {})
      },
      body: ""
    };
  } catch (error) {
    console.error("No se pudieron guardar los datos en Netlify Blobs.", error);
    return jsonResponse(500, { error: "No se pudieron guardar los datos." }, cookies);
  }
};
