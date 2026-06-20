import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 250000;

function usage() {
  console.error("Usage: node tools/encrypt_snapshot.mjs <input-json> <output-json>");
  console.error("Set TDX_DASHBOARD_VIEW_PASSWORD to the access password before running.");
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function encryptPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));

  return {
    version: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext),
    encrypted_at: new Date().toISOString(),
  };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  const password = process.env.TDX_DASHBOARD_VIEW_PASSWORD || "";

  if (!inputPath || !outputPath || !password) {
    usage();
    process.exit(2);
  }

  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const metadata = {
    ...(payload.metadata || {}),
    encrypted_at: new Date().toISOString(),
  };
  const envelope = await encryptPayload({ ...payload, metadata }, password);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log(`encrypted ${inputPath} -> ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
