import { getContentRoot } from "./content";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

export type StoredWebAuthnCredential = {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
};

function storePath(): string {
  return path.join(path.dirname(getContentRoot()), "data", "webauthn-credentials.json");
}

export async function loadWebAuthnCredentials(): Promise<
  StoredWebAuthnCredential[]
> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("credentials" in parsed)) {
      return [];
    }
    const list = (parsed as { credentials: unknown }).credentials;
    if (!Array.isArray(list)) return [];
    return list as StoredWebAuthnCredential[];
  } catch {
    return [];
  }
}

export async function saveWebAuthnCredentials(
  credentials: StoredWebAuthnCredential[],
): Promise<void> {
  const file = storePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ credentials }, null, 2)}\n`,
    "utf8",
  );
}

export function webAuthnRp(): { rpID: string; origin: string } {
  const raw = process.env.ARCHIVE_PUBLIC_ORIGIN?.trim() || "http://localhost:3000";
  const origin = raw.replace(/\/$/, "");
  let hostname = "localhost";
  try {
    hostname = new URL(origin).hostname;
  } catch {
    hostname = "localhost";
  }
  return { rpID: hostname, origin };
}
