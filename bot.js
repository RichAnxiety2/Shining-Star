const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const URL_TSE =
  "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws";
const API = `https://api.telegram.org/bot${TOKEN}`;

let intervaloMin = 1;
let ultimaSt = null;
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

function enviarMensagem(texto, extra = {}) {
  return chamarTelegram("sendMessage", {
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: "HTML",
    ...extra,
  });
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

// 7560 -> "7.560"
function milhar(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// "52,27" -> "52,3"
function fmtPct(valor) {
  return Number(String(valor).replace(",", "."))
    .toFixed(1)
    .replace(".", ",");
}

function montarMensagem(dados) {
  const s = dados.s;
  const hora = (dados.hg || "").slice(0, 5);

  const candidatos = dados.carg[0].agr
    .flatMap((a) =>
      (a.par ?? []).flatMap((p) =>
        (p.cand ?? []).map((c) => ({
          nome: c.nmu || c.nm,
          pct: fmtPct(c.pvap),
          votos: Number(c.vap),
        }))
      )
    )
    .sort((a, b) => b.votos - a.votos);

  return [
    `<b>Apuração atualizada${hora ? ` - ${hora}` : ""}</b>`,
    `Seções totalizadas: ${fmtPct(s.pst)}% (${milhar(s.st)}/${milhar(s.ts)})`,
    ``,
    ...candidatos.map(
      (c) => `<b>${escapeHtml(c.nome)}</b>: ${c.pct}% (${milhar(c.votos)} votos)`
    ),
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

  await enviarMensagem(montarMensagem(dados));
  ultimaSt = st;
}

function tecladoIntervalo() {
  const opcoes = [1, 5, 10];
  return {
    inline_keyboard: [
      opcoes.map((m) => ({
        text: m === intervaloMin ? `${m} min (atual)` : `${m} min`,
        callback_data: `intervalo:${m}`,
      })),
    ],
  };
}

async function tratarUpdate(update) {
  if (update.message?.text?.startsWith("/intervalo")) {
    if (String(update.message.chat.id) !== String(CHAT_ID)) return;
    await enviarMensagem(
      `<b>Intervalo de atualização</b>\nAtual: ${intervaloMin} min`,
      { reply_markup: tecladoIntervalo() }
    );
    return;
  }

  if (update.callback_query) {
    const cb = update.callback_query;
    if (String(cb.message?.chat?.id) !== String(CHAT_ID)) return;

    const [acao, valor] = (cb.data || "").split(":");
    if (acao !== "intervalo") return;

    const novo = Number(valor);
    if (![1, 5, 10].includes(novo)) return;

    intervaloMin = novo;
    await chamarTelegram("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: `Intervalo definido para ${novo} min`,
    });
    await enviarMensagem(`Atualização definida para a cada ${novo} min.`);
    acordarMonitor?.();
  }
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
        await tratarUpdate(update);
      }
    } catch (erro) {
      console.error("Erro nos comandos:", erro.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

loopMonitor();
loopComandos();
