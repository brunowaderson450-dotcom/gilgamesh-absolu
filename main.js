const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    downloadMediaMessage, 
    DisconnectReason,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const CONFIG = require("./config");
const { consultTheGod } = require("./soul");
const Brain = require("./brain");

async function start() {
    // Dossier de session pour stocker la connexion
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        logger: pino({ level: "silent" }),
        // Identifiant de navigateur plus réaliste pour éviter les blocages
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    // --- LOGIQUE DU PAIRING CODE ---
    if (CONFIG.PAIRING_MODE && !sock.authState.creds.registered) {
        console.log("🏛️  INITIALISATION DU LIEN AVEC LE ROI...");
        // On attend que la socket soit bien établie avant de demander le code
        await delay(8000); 
        try {
            const code = await sock.requestPairingCode(CONFIG.MAIN_OWNER.trim());
            console.log("\n╔════════════════════════════════════╗");
            console.log(`║ 🔥 CODE WHATSAPP : ${code} ║`);
            console.log("╚════════════════════════════════════╝\n");
        } catch (error) {
            console.error("❌ Échec de la génération du code. Vérifie ton numéro dans config.js");
        }
    }

    // --- GESTION DES MESSAGES ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        if (text === "/menu") {
            return await sock.sendMessage(sender, { 
                text: "🏛️ *GILGAMESH ABSOLU*\n- Vision d'Enkidu\n- Porte de Babylone (Code)\n- Tablette du Destin (Mémoire)\n- Mode Régent (Autonomie)" 
            });
        }

        try {
            Brain.addLog(sender, text);
            let mediaData = null;
            if (msg.message.imageMessage) {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                mediaData = { buffer, mimetype: "image/jpeg" };
            }

            const response = await consultTheGod(text, sender, CONFIG.OWNERS.includes(sender.split('@')[0]), mediaData);
            await sock.sendMessage(sender, { text: response });
        } catch (err) {
            console.error("Erreur lors du traitement du message:", err);
        }
    });

    // --- GESTION DE LA CONNEXION ---
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ Connexion perdue. Raison :", lastDisconnect.error, ". Reconnexion :", shouldReconnect);
            if (shouldReconnect) start();
        } else if (connection === "open") {
            console.log("\n✅ GILGAMESH EST CONNECTÉ ET PRÊT SUR WHATSAPP\n");
        }
    });
}

// Lancement du bot
start().catch(err => console.error("Erreur critique au démarrage:", err));

