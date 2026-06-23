// ===============================
// 🔔 WEB PUSH API (1 utilizador)
// ===============================

const VAPID_PUBLIC_KEY = "BGrN0Gg3Vw2mas0ckywKfkp-zw2wV6PrKB46tBqSUGbk7oaZRW1uO8m3HWxaiJqrtPZyBKubOI0bmeh4efLGSpA";
const SUBSCRIPTION_FILE = `https://api.github.com/repos/${CONFIG.REPO}/contents/subscription.json`;

let renovacaoEmCurso = false; // ⛔ Evita chamadas concorrentes

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

// ===============================
// 📌 Pedir permissão + criar subscription (SÓ com ação explícita do utilizador)
// ===============================
async function ativarPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    alert("Push notifications não são suportadas neste dispositivo.");
    return;
  }

  if (Notification.permission === "denied") {
    alert("As notificações foram permanentemente bloqueadas. Por favor, desbloqueie nas definições do seu dispositivo.");
    return;
  }

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("Permissão de notificações negada.");
      return;
    }
  }

  const reg = await navigator.serviceWorker.ready;

  // Reutilizar subscrição existente
  let subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    console.log("📨 Subscrição já existente, a guardar novamente...");
    await guardarSubscription(subscription);
    return;
  }

  // Criar nova subscrição
  subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  console.log("📨 Subscription criada:", subscription);
  await guardarSubscription(subscription);
  alert("Push notifications ativadas neste dispositivo!");
}

// ===============================
// 💾 Guardar subscription no GitHub (com retry em conflito 409/422)
// ===============================
async function guardarSubscription(subscription, tentativas = 3) {
  const token = localStorage.getItem("github_token");
  if (!token) {
    alert("Token GitHub não configurado.");
    return false;
  }

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      let sha = null;
      let subs = [];

      const res = await fetch(SUBSCRIPTION_FILE, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const existing = JSON.parse(atob(data.content));
        subs = Array.isArray(existing) ? existing : [existing];
        sha = data.sha;
      }

      const exists = subs.some(s => s.endpoint === subscription.endpoint);
      if (!exists) {
        subs.push(subscription);
      }

      const content = btoa(unescape(encodeURIComponent(JSON.stringify(subs, null, 2))));
      const body = {
        message: "Atualizar subscription Web Push",
        content,
        sha,
        branch: CONFIG.BRANCH || "main"
      };

      const putRes = await fetch(SUBSCRIPTION_FILE, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (putRes.ok) {
        console.log("✅ Subscrição guardada com sucesso.");
        return true;
      }

      // Conflito (SHA desatualizado) → tentar de novo
      if (putRes.status === 409 || putRes.status === 422) {
        console.warn(`⚠️ Conflito ao guardar subscription (tentativa ${tentativa}). A refazer...`);
        continue;
      }

      // Outro erro: parar
      const err = await putRes.json().catch(() => putRes.text());
      console.error("❌ Erro ao guardar subscription:", err);
      alert("Erro ao guardar subscription.");
      return false;

    } catch (e) {
      console.error(`❌ Erro na tentativa ${tentativa}:`, e);
      if (tentativa === tentativas) {
        alert("Erro ao guardar subscription após várias tentativas.");
        return false;
      }
    }
  }
  return false;
}

// ===============================
// 🔄 Renovação automática (apenas para quem já deu permissão)
// ===============================
async function verificarERenovarSubscricao() {
  if (renovacaoEmCurso) return false;
  renovacaoEmCurso = true;

  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    // Não insistir se o utilizador recusou ou ainda não decidiu
    if (Notification.permission === "denied" || Notification.permission === "default") {
      console.log("🔕 Notificações não permitidas ou por decidir. Não se faz renovação automática.");
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      console.warn("⚠️ Sem subscrição ativa, a renovar...");
      // Recriar subscrição (a permissão já foi concedida)
      const novaSubscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      await guardarSubscription(novaSubscription);
      return true;
    }
    return true; // subscrição existente, consideramos ok
  } catch (err) {
    console.error("❌ Erro na renovação automática:", err);
    return false;
  } finally {
    renovacaoEmCurso = false;
  }
}

// ===============================
// ⏱️ Throttle para chamadas periódicas (ex.: visibilitychange)
// ===============================
async function verificarComThrottle() {
  const agora = Date.now();
  const ultima = Number(localStorage.getItem("ultima_verificacao_push") || 0);

  if (agora - ultima < 3600000) { // 1 hora
    console.log("⏳ Verificação de push já foi feita há menos de 1 hora.");
    return;
  }

  const sucesso = await verificarERenovarSubscricao();
  if (sucesso) {
    localStorage.setItem("ultima_verificacao_push", agora);
  }
}

// Expor funções globais
window.ativarPush = ativarPush;
window.verificarERenovarSubscricao = verificarERenovarSubscricao;
window.verificarComThrottle = verificarComThrottle;
