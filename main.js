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
    // Dossier de session : auth_session
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        // Simulation d'un navigateur stable pour éviter les rejets
        browser: ["Mac OS", "Chrome", "121.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false
    });

    // --- SYSTÈME DE PAIRING CODE (OPTIMISÉ KOYEB) ---
    if (CONFIG.PAIRING_MODE && !sock.authState.creds.registered) {
        console.log("🏛️  SYSTÈME : INITIALISATION DU LIEN (+509)...");
        
        await delay(10000); // Temps pour que Koyeb stabilise la connexion
        try {
            // Nettoyage du numéro au cas où
            const pairNumber = CONFIG.MAIN_OWNER.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(pairNumber);
            
            console.log("\n╔════════════════════════════════════╗");
            console.log(`║ 🔥 CODE WHATSAPP : ${code} ║`);
            console.log("╚════════════════════════════════════╝\n");
        } catch (err) {
            console.log("❌ Erreur de code. Redéploiement nécessaire dans 10s.");
        }
    }

    // --- GESTION DES MESSAGES (TOUTES OPTIONS) ---
    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        // Commande Menu
        if (text.toLowerCase() === "/menu") {
            return await sock.sendMessage(sender, { 
                text: "🏛️ *GILGAMESH ABSOLU*\n- Vision d'Enkidu\n- Porte de Babylone (Code)\n- Tablette du Destin (Mémoire)\n- Mode Régent (Autonomie)" 
            });
        }

        try {
            // Sauvegarde dans le cerveau
            Brain.addLog(sender, text);

            // Gestion des images
            let mediaData = null;
            if (msg.message.imageMessage) {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                mediaData = { buffer, mimetype: "image/jpeg" };
            }

            // Consultation de l'IA (Gemini)
            const isOwner = CONFIG.OWNERS.includes(sender.split('@')[0]);
            const response = await consultTheGod(text, sender, isOwner, mediaData);
            
            await sock.sendMessage(sender, { text: response });

        } catch (err) {
            console.error("⚠️ Erreur lors du traitement :", err);
        }
    });

    // --- SAUVEGARDE ET RECONNEXION ---
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ Reconnexion en cours...");
            if (shouldReconnect) start();
        } else if (connection === "open") {
            console.log("\n✅ GILGAMESH EST CONNECTÉ SUR LE NUMÉRO DU BOT\n");
        }
    });
}

// Lancement avec protection contre les erreurs fatales
start().catch(err => console.error("ERREUR CRITIQUE :", err));
