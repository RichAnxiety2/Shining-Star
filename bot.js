const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = String(process.env.TELEGRAM_CHAT_ID);
const URL_TSE =
  "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws";
const API = `https://api.telegram.org/bot${TOKEN}`;

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const ARQUIVO_ASSINANTES = path.join(DATA_DIR, "assinantes.json");

function carregarAssinantes() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_ASSINANTES, "utf8"));
  } catch {
    return [];
  }
}

function salvarAssinantes() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ARQUIVO_ASSINANTES, JSON.stringify([...destinatarios]));
  } catch (erro) {
    console.error("Erro ao salvar assinantes:", erro.message);
  }
}

const destinatarios = new Set([
  ADMIN_ID,
  ...carregarAssinantes(),
  ...(process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
]);

let intervaloMin = 1;
let ultimaSt = null;
let ultimaMensagem = null;
const ultimosPct = new Map();
let offsetUpdates = 0;
let acordarMonitor = null;

async function chamarTelegram(metodo, corpo) {
  const res = await fetch(`${API}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return res.json();
}

function enviarMensagem(chatId, texto, extra = {}) {
  return chamarTelegram("sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    ...extra,
  });
}

// Envia para todos os assinantes. Se alguém bloqueou o bot, os outros recebem normalmente.
async function transmitir(texto, extra = {}) {
  const resultados = await Promise.allSettled(
    [...destinatarios].map((id) => enviarMensagem(id, texto, extra))
  );
  resultados
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.error("Falha ao enviar:", r.reason?.message));
}

function dormir(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    acordarMonitor = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function decodificarJws(token) {
  const payload = token.trim().split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function milhar(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtPct(valor) {
  return Number(String(valor).replace(",", "."))
    .toFixed(1)
    .replace(".", ",");
}

function fmtVariacao(d) {
  const r = Math.round(d * 10) / 10;
  const sinal = r > 0 ? "+" : r < 0 ? "-" : "";
  return `${sinal}${Math.abs(r).toFixed(1).replace(".", ",")}%`;
}

function listarCandidatos(dados) {
  return dados.carg[0].agr
    .flatMap((a) =>
      (a.par ?? []).flatMap((p) =>
        (p.cand ?? []).map((c) => ({
          nome: c.nmu || c.nm,
          pctNum: Number(String(c.pvap).replace(",", ".")),
          pct: fmtPct(c.pvap),
          votos: Number(c.vap),
        }))
      )
    )
    .sort((a, b) => b.votos - a.votos);
}

function montarMensagem(dados) {
  const s = dados.s;
  const hora = (dados.hg || "").slice(0, 5);

  const linhas = listarCandidatos(dados).map((c) => {
    const anterior = ultimosPct.get(c.nome);
    const variacao =
      anterior === undefined ? "" : ` ${fmtVariacao(c.pctNum - anterior)}`;
    return `<b>${escapeHtml(c.nome)}</b>: ${c.pct}% (${milhar(c.votos)} votos)${variacao}`;
  });

  return [
    `<b>Apuração atualizada${hora ? ` - ${hora}` : ""}</b>`,
    `Seções totalizadas: ${fmtPct(s.pst)}% (${milhar(s.st)}/${milhar(s.ts)})`,
    ``,
    ...linhas,
  ].join("\n");
}

async function consultar() {
  const res = await fetch(`${URL_TSE}?nocache=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`TSE respondeu ${res.status}`);

  const dados = decodificarJws(await res.text());
  const st = dados.s.st;
  if (st === ultimaSt) return;

  const texto = montarMensagem(dados);
  await transmitir(texto);

  for (const c of listarCandidatos(dados)) {
    ultimosPct.set(c.nome, c.pctNum);
  }

  ultimaMensagem = texto;
  ultimaSt = st;
}

function tecladoIntervalo() {
  return {
    inline_keyboard: [
      [1, 5, 10].map((m) => ({
        text: m === intervaloMin ? `${m} min (atual)` : `${m} min`,
        callback_data: `intervalo:${m}`,
      })),
    ],
  };
}

async function tratarMensagem(message) {
  const chatId = String(message.chat.id);
  const texto = message.text ?? "";
  const nome = message.from?.first_name ?? "sem nome";

  if (texto.startsWith("/start")) {
    const jaEra = destinatarios.has(chatId);
    destinatarios.add(chatId);

    if (jaEra) {
      await enviarMensagem(chatId, "Você já recebe as atualizações da apuração.");
      return;
    }

    salvarAssinantes();

    await enviarMensagem(
      chatId,
      "Acesso liberado. Você passa a receber as atualizações da apuração."
    );
    if (ultimaMensagem) await enviarMensagem(chatId, ultimaMensagem);

    await enviarMensagem(
      ADMIN_ID,
      `Novo assinante: <b>${escapeHtml(nome)}</b> (<code>${chatId}</code>). Total: ${destinatarios.size}.`
    );
    return;
  }

  if (chatId !== ADMIN_ID) return;

  if (texto.startsWith("/intervalo")) {
    await enviarMensagem(
      ADMIN_ID,
      `<b>Intervalo de atualização</b>\nAtual: ${intervaloMin} min`,
      { reply_markup: tecladoIntervalo() }
    );
  }
}

async function tratarCallback(cb) {
  if (String(cb.from?.id) !== ADMIN_ID) return;

  const [acao, valor] = (cb.data || "").split(":");
  if (acao !== "intervalo") return;

  const novo = Number(valor);
  if (![1, 5, 10].includes(novo)) return;

  intervaloMin = novo;
  await chamarTelegram("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: `Intervalo definido para ${novo} min`,
  });
  await enviarMensagem(ADMIN_ID, `Atualização definida para a cada ${novo} min.`);
  acordarMonitor?.();
}

async function loopMonitor() {
  while (true) {
    try {
      await consultar();
    } catch (erro) {
      console.error("Erro na consulta:", erro.message);
    }
    await dormir(intervaloMin * 60_000);
  }
}

async function loopComandos() {
  while (true) {
    try {
      const r = await chamarTelegram("getUpdates", {
        offset: offsetUpdates,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of r.result ?? []) {
        offsetUpdates = update.update_id + 1;
        if (update.message) await tratarMensagem(update.message);
        if (update.callback_query) await tratarCallback(update.callback_query);
      }
    } catch (erro) {
      console.error("Erro nos comandos:", erro.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

loopMonitor();
loopComandos();
