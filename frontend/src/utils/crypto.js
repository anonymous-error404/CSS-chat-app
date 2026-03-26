// E2E Encryption using ECDH key exchange + AES-GCM
// Works like WhatsApp: completely transparent to the user
//
// Flow:
// 1. On login/register, generate ECDH key pair (P-256)
// 2. Store private key in localStorage, send public key to server
// 3. When chatting with someone, derive shared secret via ECDH
// 4. Use HKDF to derive AES-256-GCM key from shared secret
// 5. Encrypt outgoing, decrypt incoming — user never knows

const PRIVATE_KEY_STORAGE = "cryptchat_private_key";
const PUBLIC_KEY_STORAGE = "cryptchat_public_key";

/**
 * Generate a new ECDH key pair. Returns JWK-exported public key string.
 * Private key is stored in localStorage.
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true, // extractable
    ["deriveKey", "deriveBits"]
  );

  // Export and store private key
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(privateJwk));

  // Export public key to send to server
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicKeyStr = JSON.stringify(publicJwk);
  localStorage.setItem(PUBLIC_KEY_STORAGE, publicKeyStr);

  return publicKeyStr;
}

/**
 * Check if we already have a key pair stored
 */
export function hasKeyPair() {
  return !!localStorage.getItem(PRIVATE_KEY_STORAGE) && !!localStorage.getItem(PUBLIC_KEY_STORAGE);
}

/**
 * Get the stored public key string
 */
export function getStoredPublicKey() {
  return localStorage.getItem(PUBLIC_KEY_STORAGE);
}

/**
 * Derive a shared AES-GCM key from our private key + their public key
 */
export async function deriveSharedKey(theirPublicKeyStr) {
  // Import our private key
  const privateJwk = JSON.parse(localStorage.getItem(PRIVATE_KEY_STORAGE));
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );

  // Import their public key
  const theirPublicJwk = JSON.parse(theirPublicKeyStr);
  const theirPublicKey = await crypto.subtle.importKey(
    "jwk",
    theirPublicJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: theirPublicKey },
    privateKey,
    256
  );

  // Use HKDF to derive AES key from shared bits
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("cryptchat-e2e-salt"),
      info: new TextEncoder().encode("cryptchat-e2e-key"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return aesKey;
}

// Cache derived keys: recipientId -> CryptoKey
const keyCache = new Map();

export async function getOrDeriveKey(recipientPublicKey, recipientId) {
  if (keyCache.has(recipientId)) {
    return keyCache.get(recipientId);
  }

  const key = await deriveSharedKey(recipientPublicKey);
  keyCache.set(recipientId, key);
  return key;
}

/**
 * Encrypt a message — returns { content (base64 ciphertext), iv (hex) }
 */
export async function encryptMessage(key, plaintext) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    content: bufferToBase64(cipherBuffer),
    iv: bufferToHex(iv),
  };
}

/**
 * Decrypt a message — returns plaintext string
 */
export async function decryptMessage(key, ciphertextBase64, ivHex) {
  try {
    const iv = hexToBuffer(ivHex);
    const cipherBuffer = base64ToBuffer(ciphertextBase64);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipherBuffer
    );

    return new TextDecoder().decode(plainBuffer);
  } catch {
    return "[encrypted message]";
  }
}

export function clearKeys() {
  localStorage.removeItem(PRIVATE_KEY_STORAGE);
  localStorage.removeItem(PUBLIC_KEY_STORAGE);
  keyCache.clear();
}

// ── Helpers ──
function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}
function bufferToBase64(buf) {
  let bin = "";
  new Uint8Array(buf).forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
