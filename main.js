const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const CONFIG = require("./config");
const { consultTheGod } = require("./soul");
const Brain = require("./brain");

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const sock = makeWASocket({ auth: state, logger: pino({ level: "silent" }), browser: ["Gilgamesh-OS", "Chrome", "1.0"] });

    if (CONFIG.PAIRING_MODE && !sock.authState.creds.registered) {
        setTimeout(async () => {
            let code = await sock.requestPairingCode(CONFIG.MAIN_OWNER);
            console.log(`\n🔥 CODE WHATSAPP : ${code}\n`);
        }, 5000);
    }

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        if (text === "/menu") {
            return await sock.sendMessage(sender, { text: "🏛️ *GILGAMESH ABSOLU*\n- Vision d'Enkidu\n- Porte de Babylone (Code)\n- Tablette du Destin (Mémoire)\n- Mode Régent (Autonomie)" });
        }

        Brain.addLog(sender, text);
        let mediaData = null;
        if (msg.message.imageMessage) {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            mediaData = { buffer, mimetype: "image/jpeg" };
        }

        const response = await consultTheGod(text, sender, CONFIG.OWNERS.includes(sender.split('@')[0]), mediaData);
        await sock.sendMessage(sender, { text: response });
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => { if (u.connection === "close") start(); });
}
start();
