// Criptografia AES-GCM 256 para credenciais em repouso.
// A chave é gerada na instalação e fica só em chrome.storage.local (nunca sync,
// nunca sai da máquina). Usado apenas pelo service worker (background.js).

const DWF_KEY_STORAGE = "cryptoKeyJwk";

async function dwfGetKey() {
  const stored = await chrome.storage.local.get(DWF_KEY_STORAGE);
  if (stored[DWF_KEY_STORAGE]) {
    return crypto.subtle.importKey(
      "jwk",
      stored[DWF_KEY_STORAGE],
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await chrome.storage.local.set({ [DWF_KEY_STORAGE]: jwk });
  return key;
}

function dwfBufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function dwfB64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// Retorna { iv, data } em base64.
async function dwfEncrypt(text) {
  const key = await dwfGetKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text)
  );
  return { iv: dwfBufToB64(iv), data: dwfBufToB64(data) };
}

// Recebe { iv, data } em base64, retorna o texto original.
async function dwfDecrypt(payload) {
  const key = await dwfGetKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: dwfB64ToBuf(payload.iv) },
    key,
    dwfB64ToBuf(payload.data)
  );
  return new TextDecoder().decode(plain);
}
