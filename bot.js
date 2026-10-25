const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function enviarMensagem() {
  const response = await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: "✅ Bot implantado no Railway com sucesso!"
      })
    }
  );

  const resultado = await response.json();

  console.log(resultado);
}

enviarMensagem();
