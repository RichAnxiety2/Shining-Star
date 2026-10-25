const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const URL_TSE =
  "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws";
const INTERVALO_MS = 60_000;

let ultimoIdg = null;

async function enviarMensagem(texto) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: texto }),
  });
}

function decodificarJws(token) {
  const payload = token.trim().split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function montarMensagem(dados) {
  const cargo = dados.carg[0];
  const candidatos = cargo.agr.flatMap((a) =>
    (a.par ?? []).flatMap((p) =>
      (p.cand ?? []).map((c) => `${c.nm}: ${c.vap} votos (${c.pvap}%)`)
    )
  );

  return [
    `Apuração presidente - 2º turno`,
    `Seções totalizadas: ${dados.s.pst}% (geração ${dados.idg})`,
    `Comparecimento: ${dados.e.pc}%`,
    ``,
    ...candidatos,
  ].join("\n");
}

async function consultar() {
  const res = await fetch(`${URL_TSE}?nocache=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`TSE respondeu ${res.status}`);

  const dados = decodificarJws(await res.text());
  if (dados.idg === ultimoIdg) return;

  ultimoIdg = dados.idg;
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
