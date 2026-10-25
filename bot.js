const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_KEY = process.env.ELEICOES_API_KEY;

async function enviarMensagem(texto) {
  await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: texto
      })
    }
  );
}

async function verificar() {
  try {
    const response = await fetch(
      "https://eleicoes.dev/results?office=president&scope=br",
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json"
        }
      }
    );

    const texto = await response.text();

    console.log("STATUS:", response.status);
    console.log("BODY:", texto);

    await enviarMensagem(
      `Status ${response.status}\n\n${texto.substring(0, 300)}`
    );

  } catch (erro) {
    console.error(erro);

    await enviarMensagem(
      `ERRO: ${erro.message}`
    );
  }
}

verificar();
