import { randomBytes } from "node:crypto";
import {
  AuthError,
  DISCORD_API,
  DISCORD_ORIGIN,
  GUILD_ID,
  ROLE_ID,
  clearSessionCookie,
  clearStateCookie,
  getState,
  requiredConfig,
  responseHeaders,
  sessionCookie,
  stateCookie
} from "../lib/auth.mjs";

function redirect(statusCode, location, cookies = []) {
  return {
    statusCode,
    headers: responseHeaders({ Location: location }),
    ...(cookies.length ? { multiValueHeaders: { "Set-Cookie": cookies } } : {}),
    body: ""
  };
}

function pageError(statusCode, message) {
  return {
    statusCode,
    headers: responseHeaders({ "Content-Type": "text/plain; charset=utf-8" }),
    body: message
  };
}

async function exchangeCode(code, config) {
  const response = await fetch(`${DISCORD_ORIGIN}/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    })
  });
  if (!response.ok) throw new AuthError(502, "Discord no pudo completar el inicio de sesión.");
  return response.json();
}

async function fetchDiscord(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new AuthError(403, "La cuenta no cumple los requisitos de acceso.");
    }
    throw new AuthError(502, "Discord no pudo verificar el acceso.");
  }
  return response.json();
}

export const handler = async event => {
  const action = new URL(event.rawUrl).searchParams.get("action");
  let config;
  try {
    config = requiredConfig();
  } catch (error) {
    console.error(error.message);
    return pageError(500, "Falta configurar el inicio de sesión en las variables de Netlify.");
  }

  if (action === "login") {
    const state = randomBytes(32).toString("hex");
    const authorizeUrl = new URL(`${DISCORD_ORIGIN}/oauth2/authorize`);
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "identify guilds.members.read",
      state
    }).toString();
    return redirect(302, authorizeUrl.toString(), [stateCookie(state)]);
  }

  if (action === "logout") {
    return redirect(302, "/?access=login", [clearSessionCookie()]);
  }

  if (action === "callback") {
    const query = new URL(event.rawUrl).searchParams;
    if (query.get("error")) {
      return redirect(302, "/?access=denied", [clearSessionCookie(), clearStateCookie()]);
    }
    const expectedState = getState(event);
    if (!expectedState || query.get("state") !== expectedState || !query.get("code")) {
      return redirect(302, "/?access=error", [clearStateCookie()]);
    }

    try {
      const tokens = await exchangeCode(query.get("code"), config);
      const user = await fetchDiscord(`${DISCORD_API}/users/@me`, tokens.access_token);
      const member = await fetchDiscord(
        `${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`,
        tokens.access_token
      );
      if (!Array.isArray(member.roles) || !member.roles.includes(ROLE_ID)) {
        return redirect(302, "/?access=denied", [clearSessionCookie(), clearStateCookie()]);
      }
      const now = Math.floor(Date.now() / 1000);
      const session = {
        user: { id: user.id, username: user.global_name || user.username },
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: now + tokens.expires_in,
        sessionExpiresAt: now + 60 * 60 * 24 * 30
      };
      return redirect(302, "/?access=login", [sessionCookie(session), clearStateCookie()]);
    } catch (error) {
      if (error instanceof AuthError && error.status === 403) {
        return redirect(302, "/?access=denied", [clearSessionCookie(), clearStateCookie()]);
      }
      console.error("Error verificando el inicio de sesión con Discord.", error);
      return redirect(302, "/?access=error", [clearStateCookie()]);
    }
  }

  return pageError(404, "Ruta no encontrada.");
};
