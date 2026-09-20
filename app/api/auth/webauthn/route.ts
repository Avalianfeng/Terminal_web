import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import {
  loadWebAuthnCredentials,
  saveWebAuthnCredentials,
  webAuthnRp,
} from "@/lib/archive/webauthn-store";
import {
  OWNER_COOKIE_NAME,
  ownerCookieSetOptions,
  resolveSessionSecret,
  signOwnerSession,
} from "@/lib/archive/owner-session";
import { resolveRequestPrincipal } from "@/lib/archive/site-auth";
import { actorFromSitePrincipal } from "@/lib/archive/grant-principal";

export const runtime = "nodejs";

type ChallengeKind = "reg" | "auth";
const challenges = new Map<string, { kind: ChallengeKind; challenge: string }>();

const OWNER_USER_ID = isoUint8Array.fromUTF8String("cylf-archive-owner");

function challengeKey(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(
      `(?:^|;\\s*)${OWNER_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match?.[1] ?? request.headers.get("x-forwarded-for") ?? "anon";
}

export async function POST(request: Request) {
  let body: { action?: string; credential?: unknown };
  try {
    body = (await request.json()) as { action?: string; credential?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, message: "JSON required" },
      { status: 400 },
    );
  }

  const { rpID, origin } = webAuthnRp();
  const key = challengeKey(request);

  if (body.action === "register-options") {
    const principal = await resolveRequestPrincipal();
    const actor = actorFromSitePrincipal(principal);
    if (actor !== "owner-password" && actor !== "owner") {
      return NextResponse.json(
        { ok: false, message: "需要先 login" },
        { status: 401 },
      );
    }
    const existing = await loadWebAuthnCredentials();
    const options = await generateRegistrationOptions({
      rpName: "cylf.me archive",
      rpID,
      userName: "owner",
      userID: OWNER_USER_ID,
      userDisplayName: "owner",
      attestationType: "none",
      excludeCredentials: existing.map((cred) => ({
        id: cred.id,
        transports: cred.transports,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
    challenges.set(key, { kind: "reg", challenge: options.challenge });
    return NextResponse.json({ ok: true, options });
  }

  if (body.action === "register-verify") {
    const pending = challenges.get(key);
    if (!pending || pending.kind !== "reg") {
      return NextResponse.json(
        { ok: false, message: "无登记挑战" },
        { status: 400 },
      );
    }
    const principal = await resolveRequestPrincipal();
    const actor = actorFromSitePrincipal(principal);
    if (actor !== "owner-password" && actor !== "owner") {
      return NextResponse.json(
        { ok: false, message: "需要先 login" },
        { status: 401 },
      );
    }
    try {
      const verified = await verifyRegistrationResponse({
        response: body.credential as Parameters<
          typeof verifyRegistrationResponse
        >[0]["response"],
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
      challenges.delete(key);
      if (!verified.verified || !verified.registrationInfo) {
        return NextResponse.json(
          { ok: false, message: "登记失败" },
          { status: 400 },
        );
      }
      const { credential } = verified.registrationInfo;
      const list = await loadWebAuthnCredentials();
      list.push({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports,
      });
      await saveWebAuthnCredentials(list);
      const secret = resolveSessionSecret(process.env.ARCHIVE_SESSION_SECRET);
      if (!secret) {
        return NextResponse.json({ ok: true, registered: true });
      }
      const token = signOwnerSession(Date.now(), secret, undefined, {
        device: true,
      });
      const res = NextResponse.json({
        ok: true,
        registered: true,
        deviceStepUp: true,
        role: "owner",
        via: "session",
      });
      res.cookies.set(
        OWNER_COOKIE_NAME,
        token,
        ownerCookieSetOptions(process.env.NODE_ENV === "production"),
      );
      return res;
    } catch {
      return NextResponse.json(
        { ok: false, message: "登记校验失败" },
        { status: 400 },
      );
    }
  }

  if (body.action === "auth-options") {
    const existing = await loadWebAuthnCredentials();
    if (existing.length === 0) {
      return NextResponse.json(
        { ok: false, message: "尚未登记本机。请先 login 再 device。" },
        { status: 400 },
      );
    }
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: existing.map((cred) => ({
        id: cred.id,
        transports: cred.transports,
      })),
      userVerification: "preferred",
    });
    challenges.set(key, { kind: "auth", challenge: options.challenge });
    return NextResponse.json({ ok: true, options });
  }

  if (body.action === "auth-verify") {
    const pending = challenges.get(key);
    if (!pending || pending.kind !== "auth") {
      return NextResponse.json(
        { ok: false, message: "无校验挑战" },
        { status: 400 },
      );
    }
    const existing = await loadWebAuthnCredentials();
    const credId =
      body.credential &&
      typeof body.credential === "object" &&
      "id" in body.credential
        ? String((body.credential as { id: string }).id)
        : "";
    const stored = existing.find((item) => item.id === credId);
    if (!stored) {
      return NextResponse.json(
        { ok: false, message: "未知凭证" },
        { status: 400 },
      );
    }
    try {
      const verified = await verifyAuthenticationResponse({
        response: body.credential as Parameters<
          typeof verifyAuthenticationResponse
        >[0]["response"],
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: stored.id,
          publicKey: Buffer.from(stored.publicKey, "base64url"),
          counter: stored.counter,
          transports: stored.transports,
        },
      });
      challenges.delete(key);
      if (!verified.verified) {
        return NextResponse.json(
          { ok: false, message: "校验失败" },
          { status: 400 },
        );
      }
      stored.counter = verified.authenticationInfo.newCounter;
      await saveWebAuthnCredentials(existing);
      const secret = resolveSessionSecret(process.env.ARCHIVE_SESSION_SECRET);
      if (!secret) {
        return NextResponse.json(
          { ok: false, message: "会话密钥未配置" },
          { status: 500 },
        );
      }
      const token = signOwnerSession(Date.now(), secret, undefined, {
        device: true,
      });
      const res = NextResponse.json({
        ok: true,
        deviceStepUp: true,
        role: "owner",
        via: "session",
      });
      res.cookies.set(
        OWNER_COOKIE_NAME,
        token,
        ownerCookieSetOptions(process.env.NODE_ENV === "production"),
      );
      return res;
    } catch {
      return NextResponse.json(
        { ok: false, message: "校验失败" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: false, message: "未知 action" }, { status: 400 });
}
