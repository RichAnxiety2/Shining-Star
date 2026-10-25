const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const URL_TSE =
  "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws";
const INTERVALO_MS = 60_000;

let ultimaSt = null;

async function enviarMensagem(texto) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: texto,
      parse_mode: "HTML",
    }),
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

function fmtNumero(n) {
  return Number(n).toLocaleString("pt-BR");
}

// "52,27" -> "52,3"
function fmtPct(valor) {
  return Number(String(valor).replace(",", "."))
    .toFixed(1)
    .replace(".", ",");
}

function montarMensagem(dados) {
  const st = Number(dados.st);
  const ts = Number(dados.ts);
  const pctSecoes = fmtPct(((st / ts) * 100).toString().replace(".", ","));
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

  const linhasCandidatos = candidatos.map(
    (c) =>
      `<b>${escapeHtml(c.nome)}</b>: ${c.pct}% (${fmtNumero(c.votos)} votos)`
  );

  return [
    `<b>Apuração atualizada${hora ? ` - ${hora}` : ""}</b>`,
    `Seções totalizadas: ${pctSecoes}% (${fmtNumero(st)}/${fmtNumero(ts)})`,
    ``,
    ...linhasCandidatos,
  ].join("\n");
}

async function consultar() {
  const res = await fetch(`${URL_TSE}?nocache=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`TSE respondeu ${res.status}`);

  const dados = decodificarJws(await res.text());
  if (dados.st === ultimaSt) return;

  ultimaSt = dados.st;
  await enviarMensagem(montarMensagem(dados));
}

async function loop() {
  while (true) {
    try {
      await consultar();
    } catch (erro) {
      console.error("Erro na consulta:", erro.message);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

loop();
