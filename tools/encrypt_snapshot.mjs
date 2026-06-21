import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 250000;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = dirname(SCRIPT_DIR);

function usage() {
  console.error("Usage: node tools/encrypt_snapshot.mjs <input-json> <output-json>");
  console.error("Set TDX_DASHBOARD_VIEW_PASSWORD or create dashboard.password.txt before running.");
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

async function readDashboardPassword() {
  const config = await readDashboardConfig();
  const envPassword = (process.env.TDX_DASHBOARD_VIEW_PASSWORD || "").trim();
  if (envPassword) {
    return envPassword;
  }

  const configuredPath = resolveSetting(config, "TDX_DASHBOARD_PASSWORD_FILE", "PASSWORD_FILE", "");
  const passwordPath = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : join(PROJECT_DIR, configuredPath)
    : join(PROJECT_DIR, "dashboard.password.txt");

  try {
    const password = (await readFile(passwordPath, "utf8")).replace(/^\uFEFF/, "").trim();
    return password;
  } catch (error) {
    if (configuredPath) {
      throw new Error(`Dashboard password file not found: ${passwordPath}`);
    }
    return "";
  }
}

async function readDashboardConfig() {
  const configuredPath = (process.env.TDX_DASHBOARD_CONFIG_FILE || "").trim();
  const configPath = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : join(PROJECT_DIR, configuredPath)
    : join(PROJECT_DIR, "dashboard.config.txt");

  let text = "";
  try {
    text = await readFile(configPath, "utf8");
  } catch (error) {
    if (configuredPath) {
      throw new Error(`Dashboard config file not found: ${configPath}`);
    }
    return {};
  }

  const config = {};
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim().toUpperCase();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key) {
      config[key] = value;
    }
  }
  return config;
}

function resolveSetting(config, envName, configName, fallback = "") {
  const envValue = (process.env[envName] || "").trim();
  if (envValue) {
    return envValue;
  }
  return (config[configName] || fallback).trim();
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  const password = await readDashboardPassword();

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
