// ===============================
// 🔔 WEB PUSH API (1 utilizador)
// ===============================

// 👉 Chave VAPID PÚBLICA (esta pode estar no frontend)
const VAPID_PUBLIC_KEY = "BGrN0Gg3Vw2mas0ckywKfkp-zw2wV6PrKB46tBqSUGbk7oaZRW1uO8m3HWxaiJqrtPZyBKubOI0bmeh4efLGSpA";

// Caminho para guardar a subscription no GitHub
const SUBSCRIPTION_FILE = `https://api.github.com/repos/${CONFIG.REPO}/contents/subscription.json`;

// Converter chave base64 → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

// ===============================
// 📌 Pedir permissão + criar subscription
// ===============================
async function ativarPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Push notifications não são suportadas neste dispositivo.");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert("Permissão de notificações negada.");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  console.log("📨 Subscription criada:", subscription);

  await guardarSubscription(subscription);
  alert("Push notifications ativadas neste dispositivo!");
}

// ===============================
// 💾 Guardar subscription no GitHub
// ===============================
async function guardarSubscription(subscription) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token GitHub não configurado.");
    return;
  }

  let sha = null;
  let subs = [];

  try {
    const res = await fetch(SUBSCRIPTION_FILE, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      const existing = JSON.parse(atob(data.content));
      subs = Array.isArray(existing) ? existing : [existing];
      sha = data.sha;
    }
  } catch (e) {
    console.warn("⚠️ Não foi possível ler subscriptions existentes");
  }

  const exists = subs.some(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push(subscription);
  }

  const content = btoa(
    unescape(encodeURIComponent(JSON.stringify(subs, null, 2)))
  );

  const body = {
    message: "Atualizar subscription Web Push",
    content,
    sha,
    branch: CONFIG.BRANCH || "main"
  };

  const resp = await fetch(SUBSCRIPTION_FILE, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    let err;
    try {
      err = await resp.json();
    } catch {
      err = await resp.text();
    }

    console.error("❌ Erro ao guardar subscription:", err);
    alert("Erro ao guardar subscription.");
  }
}

// Expor função global
window.ativarPush = ativarPush;
