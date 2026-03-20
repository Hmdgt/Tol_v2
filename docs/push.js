// ===============================
// 🔔 WEB PUSH API (1 utilizador)
// ===============================

// 👉 Chave VAPID PÚBLICA (esta pode estar no frontend)
const VAPID_PUBLIC_KEY = "BJiUie1vt12aee7fgOWh581KJlkDEdkmcjarrXJ73ApcTW3hzDUhoRmUPCv3j4ITvQs584G42l74_qedUYO7hL8";

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

  // Verificar se já existe subscription.json
  let sha = null;
  try {
    const res = await fetch(SUBSCRIPTION_FILE, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch (_) {}

  const content = btoa(JSON.stringify(subscription, null, 2));

  const body = {
    message: "Atualizar subscription Web Push",
    content,
    sha
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
    console.error("❌ Erro ao guardar subscription:", await resp.text());
    alert("Erro ao guardar subscription no GitHub.");
  }
}

// Expor função global
window.ativarPush = ativarPush;
