import {
  resolveSessionSecret,
  sessionValidFromCookie,
  deviceStepUpFromCookie,
} from "./owner-session";

export type SiteRole = "visitor" | "owner";
export type SitePrincipalVia = "session" | "implicit-local-dev" | "none";

export type SitePrincipal = {
  readonly role: SiteRole;
  readonly via: SitePrincipalVia;
  /** ADR 0022 WebAuthn step-up; ignored when via is implicit-local-dev. */
  readonly deviceStepUp?: boolean;
};

export type SiteCapabilities = {
  readonly uiWrite: boolean;
  readonly musicBff: boolean;
};

export const IMPLICIT_OWNER: SitePrincipal = {
  role: "owner",
  via: "implicit-local-dev",
};

export const ANONYMOUS_VISITOR: SitePrincipal = {
  role: "visitor",
  via: "none",
};

export function isLocalDevPosture(nodeEnv?: string): boolean {
  return (nodeEnv ?? process.env.NODE_ENV) !== "production";
}

export function isUiWriteKilled(env = process.env.ARCHIVE_UI_WRITE): boolean {
  const value = env?.trim().toLowerCase();
  return value === "false" || value === "0";
}

export function resolveSitePrincipal(input: {
  sessionValid: boolean;
  nodeEnv?: string;
  deviceStepUp?: boolean;
}): SitePrincipal {
  if (input.sessionValid) {
    return {
      role: "owner",
      via: "session",
      deviceStepUp: Boolean(input.deviceStepUp),
    };
  }
  if (isLocalDevPosture(input.nodeEnv)) {
    return IMPLICIT_OWNER;
  }
  return ANONYMOUS_VISITOR;
}

export function capabilitiesFrom(
  principal: SitePrincipal,
  options?: { uiWriteKill?: boolean },
): SiteCapabilities {
  const owner = principal.role === "owner";
  const killed = options?.uiWriteKill ?? isUiWriteKilled();
  return {
    uiWrite: owner && !killed,
    musicBff: owner,
  };
}

export function principalFromCookieValue(
  raw: string | undefined,
  env: {
    sessionSecret?: string;
    nodeEnv?: string;
  },
  nowMs = Date.now(),
): SitePrincipal {
  const secret = resolveSessionSecret(env.sessionSecret, env.nodeEnv);
  const valid = sessionValidFromCookie(raw, secret, nowMs);
  return resolveSitePrincipal({
    sessionValid: valid,
    nodeEnv: env.nodeEnv,
    deviceStepUp: valid ? deviceStepUpFromCookie(raw, secret, nowMs) : false,
  });
}
