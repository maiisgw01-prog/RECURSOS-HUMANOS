import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

const GUILD_ID = "1529206705530077225";
const ROLE_ID = "1541840117294170303";
const SESSION_COOKIE = "__Host-rrhh_session";
const STATE_COOKIE = "__Host-rrhh_oauth_state";
const DISCORD_ORIGIN = "https://discord.com";
const DISCORD_API = "https://discord.com/api/v10";
const SESSION_LIFETIME = 60 * 60 * 24 * 30;

export class AuthError extends Error {
  constructor(status, message, clearSession = false) {
    super(message);
    this.status = status;
    this.clearSession = clearSession;
  }
}

export function requiredConfig() {
  const missing = [
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_REDIRECT_URI",
    "SESSION_SECRET"
  ].filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);
  }
  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres.");
  }
  return {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DISCORD_REDIRECT_URI
  };
}

function encryptionKey() {
  requiredConfig();
  return createHash("sha256").update(process.env.SESSION_SECRET).digest();
}

function getCookie(event, name) {
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || "";
  const cookie = cookieHeader.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

function encryptSession(session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final()
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map(part => part.toString("base64url"))
    .join(".");
}

function decryptSession(value) {
  try {
    const [iv, tag, encrypted] = value.split(".").map(part => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString("utf8"));
  } catch {
    throw new AuthError(401, "La sesión no es válida.", true);
  }
}

export function sessionCookie(session) {
  const maxAge = Math.max(0, Math.min(
    SESSION_LIFETIME,
    session.sessionExpiresAt - Math.floor(Date.now() / 1000)
  ));
  return `${SESSION_COOKIE}=${encodeURIComponent(encryptSession(session))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function stateCookie(state) {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getState(event) {
  return getCookie(event, STATE_COOKIE);
}

function responseHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra
  };
}

async function refreshSession(session, config) {
  const response = await fetch(`${DISCORD_ORIGIN}/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken
    })
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new AuthError(401, "La sesión de Discord ha caducado.", true);
    }
    throw new AuthError(502, "Discord no pudo renovar la sesión.");
  }
  const tokens = await response.json();
  return {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in
  };
}

async function getMember(session) {
  return fetch(`${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  });
}

export async function authorize(event) {
  const config = requiredConfig();
  const encrypted = getCookie(event, SESSION_COOKIE);
  if (!encrypted) throw new AuthError(401, "Se requiere iniciar sesión.");

  let session = decryptSession(encrypted);
  const now = Math.floor(Date.now() / 1000);
  if (!session.sessionExpiresAt || session.sessionExpiresAt <= now) {
    throw new AuthError(401, "La sesión ha caducado.", true);
  }

  let refreshed = false;
  if (session.tokenExpiresAt <= now + 60) {
    session = await refreshSession(session, config);
    refreshed = true;
  }

  let memberResponse = await getMember(session);
  if (memberResponse.status === 401 && !refreshed) {
    session = await refreshSession(session, config);
    refreshed = true;
    memberResponse = await getMember(session);
  }
  if (memberResponse.status === 401 || memberResponse.status === 404) {
    throw new AuthError(403, "La cuenta no pertenece al Discord autorizado.", true);
  }
  if (memberResponse.status === 403) {
    throw new AuthError(403, "Discord no permite comprobar la pertenencia al servidor.", true);
  }
  if (!memberResponse.ok) {
    throw new AuthError(502, "Discord no está disponible para verificar el acceso.");
  }

  const member = await memberResponse.json();
  if (!Array.isArray(member.roles) || !member.roles.includes(ROLE_ID)) {
    throw new AuthError(403, "La cuenta no tiene el rol autorizado.", true);
  }
  return {
    user: session.user,
    cookie: refreshed ? sessionCookie(session) : null
  };
}

export function jsonResponse(statusCode, value, cookies = []) {
  const headers = responseHeaders({ "Content-Type": "application/json; charset=utf-8" });
  return {
    statusCode,
    headers,
    ...(cookies.length ? { multiValueHeaders: { "Set-Cookie": cookies } } : {}),
    body: JSON.stringify(value)
  };
}

export function authErrorResponse(error) {
  const cookies = error.clearSession ? [clearSessionCookie()] : [];
  return jsonResponse(error.status || 500, { error: error.message }, cookies);
}

export function sameOrigin(event, redirectUri) {
  const origin = event.headers?.origin || event.headers?.Origin;
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(redirectUri).origin;
  } catch {
    return false;
  }
}

export { DISCORD_API, DISCORD_ORIGIN, GUILD_ID, ROLE_ID, responseHeaders };
