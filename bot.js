const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const API =
  "https://api.eleicoes.dev/v1/results?office=president&scope=br";

async function enviarMensagem(texto) {
  await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: texto,
      }),
    }
  );
}

async function verificar() {
  try {
    const response = await fetch(API);
    const data = await response.json();

    console.log(data);

    await enviarMensagem(
      `📊 Consulta realizada com sucesso`
    );
  } catch (erro) {
    console.error(erro);
  }
}

verificar();
