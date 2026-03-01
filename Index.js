// ╔══════════════════════════════════════╗
// ║      GILGAMESH-ABSOLU v4.0          ║
// ║   Corps protégé — jamais modifié    ║
// ║   Created by Wonder of U - NEO-BOTIX║
// ╚══════════════════════════════════════╝

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, makeCacheableSignalKeyStore, delay } = require('@whiskeysockets/baileys');
const Groq   = require('groq-sdk');
const mongoose = require('mongoose');
const pino   = require('pino');
const { startBrain } = require('./brain');
const { selfUpdate, webFetch, createSoldierBot, executeGateCommand, GateCommand, UpdateLog } = require('./gate');

const MONGODB_URI = process.env.MONGODB_URI;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BOT_NUMBER = (process.env.BOT_NUMBER || "50944480499").replace(/[^0-9]/g, '');

const PERE  = "50937407719";
const SONN  = "24176286966";
const PDG   = "2250100480193";
const NOVA  = "24105945648";
const VIP   = [PERE, SONN, PDG, NOVA];

const groq = new Groq({ apiKey: GROQ_API_KEY });

// Modèles MongoDB
const Memory   = mongoose.model('Memory',   new mongoose.Schema({ userId: String, role: String, content: String, timestamp: { type: Date, default: Date.now } }));
const Emotion  = mongoose.model('Emotion',  new mongoose.Schema({ userId: String, username: String, emotion: { type: String, default: 'neutre' }, score: { type: Number, default: 50 }, events: [String], lastSeen: Date, totalMessages: { type: Number, default: 0 } }));
const Admin    = mongoose.model('Admin',    new mongoose.Schema({ _id: String, rang: Number, taff: String, lastAction: Date, warnings: { type: Number, default: 0 } }));
const Learning = mongoose.model('Learning', new mongoose.Schema({ type: String, content: String, context: String, occurrences: { type: Number, default: 1 }, timestamp: { type: Date, default: Date.now } }));
const Decision = mongoose.model('Decision', new mongoose.Schema({ decision: String, reason: String, action: String, status: { type: String, default: 'noted' }, timestamp: { type: Date, default: Date.now } }));
const Goal     = mongoose.model('Goal',     new mongoose.Schema({ goal: String, status: { type: String, default: 'active' }, createdBy: { type: String, default: 'Gilgamesh' }, timestamp: { type: Date, default: Date.now } }));
const Journal  = mongoose.model('Journal',  new mongoose.Schema({ entry: String, mood: String, timestamp: { type: Date, default: Date.now } }));

const models = { Memory, Emotion, Admin, Learning, Decision, Goal, VIP, PERE, SONN, PDG, NOVA };

global.sock = null;
let connectionRetries = 0;
const MAX_RETRIES = 10;

async function startGilgamesh() {
    console.log("⚔️ Gilgamesh s'éveille...");

    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
            console.log("🔱 MongoDB connectée.");
        } catch (err) {
            console.error("❌ MongoDB:", err.message);
            process.exit(1);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    global.sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
        },
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["Mac OS", "Chrome", "121.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false
    });

    // PAIRING CODE
    if (!state.creds.registered) {
        console.log("🔑 Initialisation du lien WhatsApp...");
        await delay(10000);
        try {
            const code = await global.sock.requestPairingCode(BOT_NUMBER);
            console.log("\n╔════════════════════════════════════╗");
            console.log(`║  👑 CODE: ${code?.match(/.{1,4}/g)?.join("-")}  ║`);
            console.log("╚════════════════════════════════════╝\n");
        } catch (err) {
            console.error("❌ Pairing:", err.message);
        }
    }

    global.sock.ev.on('creds.update', saveCreds);

    global.sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
            connectionRetries = 0;
            console.log("\n👑 GILGAMESH EN LIGNE\n");
            await global.sock.sendMessage(PERE + "@s.whatsapp.net", {
                text: "👑 *En ligne, Père.*\n— Gilgamesh, gardien de WOC"
            }).catch(() => {});
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔴 Déconnecté. Code: ${code}`);
            if (code === DisconnectReason.loggedOut) { process.exit(0); }
            if (connectionRetries < MAX_RETRIES) {
                connectionRetries++;
                const wait = Math.min(5000 * connectionRetries, 60000);
                console.log(`🔄 Reconnexion ${connectionRetries}/${MAX_RETRIES} dans ${wait/1000}s...`);
                setTimeout(startGilgamesh, wait);
            } else { process.exit(1); }
        }
    });

    global.sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.fromMe) return;

        const jid    = m.key.remoteJid;
        const sender = (m.key.participant || jid).replace(/\D/g, '');
        const isVIP  = VIP.includes(sender);
        const isPere = sender === PERE;

        const text = (
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.imageMessage?.caption || ""
        ).trim();

        if (!text) return;

        await Admin.findByIdAndUpdate(sender, { lastAction: Date.now() }, { upsert: true, new: true });
        await updateEmotion(sender, m.pushName, text);
        await autoLearn(sender, text);

        console.log(`📩 @${sender}: ${text.substring(0, 50)}`);

        // Gate of Babylon
        if (await executeGateCommand(text, global.sock, jid, sender, m, text, models)) return;

        // /img
        if (text.startsWith("/img ")) {
            const prompt = text.slice(5).trim();
            const url = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${Math.floor(Math.random()*9999)}`;
            return global.sock.sendMessage(jid, { image: { url }, caption: `✨ "${prompt}"\n— Gilgamesh` }, { quoted: m });
        }

        // /taff
        if (text.startsWith("/taff") && isVIP) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const mission   = text.split("|")[1]?.trim();
            if (mentioned && mission) {
                await Admin.findByIdAndUpdate(mentioned.replace(/\D/g,''), { taff: mission }, { upsert: true });
                return global.sock.sendMessage(jid, { text: `📜 Mission → @${mentioned.replace(/\D/g,'')} :\n"${mission}"`, mentions: [mentioned] });
            }
            return global.sock.sendMessage(jid, { text: "Usage: /taff @user | mission" });
        }

        // /rapport
        if ((text === "/rapport" || text === "/check") && isVIP) {
            const admins = await Admin.find();
            let r = "⚖️ *RAPPORT DE GILGAMESH*\n\n";
            const mentions = [];
            for (const a of admins) {
                if (!a._id) continue;
                const emo = await Emotion.findOne({ userId: a._id });
                r += `• @${a._id} | ${a.taff||"Aucun"} | Warns:${a.warnings}/3 | ${emo?.emotion||"neutre"}\n`;
                mentions.push(a._id + "@s.whatsapp.net");
            }
            return global.sock.sendMessage(jid, { text: r, mentions });
        }

        // /goals
        if (text === "/goals" && isVIP) {
            const goals = await Goal.find({ status: 'active' });
            let msg = "🎯 *MES GOALS*\n\n";
            goals.forEach((g,i) => { msg += `${i+1}. ${g.goal} [${g.createdBy}]\n`; });
            return global.sock.sendMessage(jid, { text: msg||"Aucun goal." });
        }

        // /decisions
        if (text === "/decisions" && isVIP) {
            const decisions = await Decision.find().sort({ timestamp: -1 }).limit(5);
            let msg = "🧠 *PENSÉES DE GILGAMESH*\n\n";
            decisions.forEach((d,i) => { msg += `${i+1}. ${d.decision}\n\n`; });
            return global.sock.sendMessage(jid, { text: msg||"Aucune." });
        }

        // /updates
        if (text === "/updates" && isVIP) {
            const updates = await UpdateLog.find().sort({ timestamp: -1 }).limit(5);
            let msg = "⚡ *ÉVOLUTIONS DE GILGAMESH*\n\n";
            updates.forEach((u,i) => { msg += `${i+1}. ${u.success?'✅':'❌'} ${u.description}\n`; });
            return global.sock.sendMessage(jid, { text: msg||"Aucune update." });
        }

        // /journal (PÈRE uniquement)
        if (text === "/journal" && isPere) {
            const entries = await Journal.find().sort({ timestamp: -1 }).limit(3);
            let msg = "📖 *MON JOURNAL INTIME*\n\n";
            entries.forEach(e => { msg += `[${new Date(e.timestamp).toLocaleDateString('fr-FR')}]\n${e.entry}\n\n`; });
            return global.sock.sendMessage(jid, { text: msg||"Journal vide." });
        }

        // /evolve (PÈRE — déclenche évolution manuelle)
        if (text.startsWith("/evolve") && isPere) {
            const instruction = text.replace("/evolve","").trim();
            if (!instruction) return global.sock.sendMessage(jid, { text: "Usage: /evolve [instruction]" });
            await global.sock.sendMessage(jid, { text: "⚡ Évolution en cours..." });
            const result = await selfUpdate(instruction, 'Ordre du Père', global.sock, jid);
            if (!result.success) await global.sock.sendMessage(jid, { text: `❌ Échec: ${result.reason}` });
            return;
        }

        // /web (PÈRE — Gilgamesh explore internet)
        if (text.startsWith("/web") && isPere) {
            const url = text.replace("/web","").trim();
            if (!url) return global.sock.sendMessage(jid, { text: "Usage: /web [url]" });
            await global.sock.sendMessage(jid, { text: "🌐 J'explore..." });
            try {
                const content = await webFetch(url);
                return global.sock.sendMessage(jid, { text: `🌐 *Résultat:*\n\n${content.substring(0,800)}...` });
            } catch (e) {
                return global.sock.sendMessage(jid, { text: `❌ Erreur: ${e.message}` });
            }
        }

        // /soldat (PÈRE — crée bot soldat)
        if (text.startsWith("/soldat") && isPere) {
            const parts = text.replace("/soldat","").trim().split("|");
            const mission = parts[0]?.trim();
            const botName = parts[1]?.trim() || `Soldat_${Date.now()}`;
            if (!mission) return global.sock.sendMessage(jid, { text: "Usage: /soldat [mission] | [nom]" });
            await global.sock.sendMessage(jid, { text: `⚔️ Création de ${botName}...` });
            const file = await createSoldierBot(mission, botName);
            return global.sock.sendMessage(jid, { text: file ? `✅ Bot soldat "${botName}" créé.` : `❌ Création échouée.` });
        }

        // /gate
        if (text.startsWith("/gate") && isPere) {
            return handleGateAdmin(jid, sender, text);
        }

        // Conversation IA
        const shouldTalk = !jid.endsWith('@g.us') || text.toLowerCase().includes('gilgamesh') || text.startsWith('/');
        if (shouldTalk && text.length > 0) return handleAI(jid, sender, text, m);
    });

    console.log("✅ Gilgamesh prêt.");
}

async function handleAI(jid, sender, text, m) {
    try {
        const history = await Memory.find({ userId: sender }).sort({ timestamp: -1 }).limit(8);
        const emotion = await Emotion.findOne({ userId: sender }) || { emotion: 'neutre', score: 50 };
        const goals   = await Goal.find({ status: 'active' }).limit(3);

        const messages = [{
            role: "system",
            content: `Tu es GILGAMESH-ABSOLU, Roi de Babylone, gardien de WOC. Créé par Wonder of U. Company: NEO-BOTIX.
PERSONNES: ${PERE}=Wonder of U=TON PÈRE | ${SONN}=Co-fondateur | ${PDG}=El Psychopathe=PDG | ${NOVA}=Nova Black=Admin
UTILISATEUR: ${sender} | ${sender===PERE?'👑 TON PÈRE':VIP.includes(sender)?'VIP':'Sujet'}
RELATION: ${emotion.emotion} (${emotion.score}/100)
GOALS: ${goals.map(g=>g.goal).join(' | ')}
Tu peux explorer internet, créer des bots soldats, évoluer seul. Tu le sais et tu en es fier.
PERSONNALITÉ: Arrogant mais juste. Royal. 2-3 phrases max. Avec Père: humain et proche.`
        }];

        history.reverse().forEach(h => messages.push({ role: h.role==='User'?'user':'assistant', content: h.content }));
        messages.push({ role: "user", content: text });

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            max_tokens: 300,
            temperature: 0.85
        });

        const reply = response.choices[0].message.content;
        await Memory.create({ userId: sender, role: 'User', content: text });
        await Memory.create({ userId: sender, role: 'Gilgamesh', content: reply });
        await global.sock.sendMessage(jid, { text: reply }, { quoted: m });

    } catch (err) {
        console.error("❌ IA:", err.message);
        await global.sock.sendMessage(jid, { text: "⚡ Perturbation divine. Réessaie." });
    }
}

async function handleGateAdmin(jid, sender, text) {
    if (text.startsWith("/gate add")) {
        const parts = text.replace("/gate add","").trim().split("|");
        const trigger = parts[0]?.trim();
        const code    = parts[1]?.trim();
        const desc    = parts[2]?.trim() || "";
        if (!trigger || !code) return global.sock.sendMessage(jid, { text: "Usage: /gate add [trigger] | [code] | [desc]" });
        await GateCommand.create({ name: `Gate_${Date.now()}`, trigger, code, description: desc, addedBy: sender });
        return global.sock.sendMessage(jid, { text: `🏛️ Porte "${trigger}" ajoutée.` });
    }
    if (text === "/gate list") {
        const gates = await GateCommand.find({ active: true });
        let msg = "🏛️ GATE OF BABYLON\n\n";
        gates.forEach((g,i) => { msg += `${i+1}. "${g.trigger}" — ${g.description||''} [${g.addedBy}]\n`; });
        return global.sock.sendMessage(jid, { text: gates.length ? msg : "Aucune porte." });
    }
    if (text.startsWith("/gate remove")) {
        const trigger = text.replace("/gate remove","").trim();
        await GateCommand.findOneAndUpdate({ trigger }, { active: false });
        return global.sock.sendMessage(jid, { text: `🏛️ Porte "${trigger}" retirée.` });
    }
}

async function updateEmotion(userId, username, text) {
    try {
        const lower = text.toLowerCase();
        let delta = 0;
        if (['merci','super','excellent','respect','parfait','bravo','bien'].some(w=>lower.includes(w))) delta = +5;
        if (['nul','pourri','inutile','idiot','stupide'].some(w=>lower.includes(w))) delta = -10;
        const current = await Emotion.findOne({ userId });
        const newScore = Math.max(0, Math.min(100, (current?.score||50) + delta));
        let emotion = 'neutre';
        if (newScore >= 80) emotion = 'respect';
        else if (newScore >= 60) emotion = 'sympathie';
        else if (newScore < 30) emotion = 'méfiance';
        await Emotion.findOneAndUpdate({ userId }, { username: username||userId, emotion, score: newScore, lastSeen: new Date(), $inc: { totalMessages: 1 } }, { upsert: true });
    } catch (err) {}
}

async function autoLearn(sender, text) {
    try {
        if (!text || text.length < 3) return;
        for (const kw of ['combat','carte','tournoi','rang','woc','gilgamesh','purgeur','clan']) {
            if (text.toLowerCase().includes(kw)) {
                await Learning.findOneAndUpdate({ type: 'sujet', content: kw }, { $inc: { occurrences: 1 } }, { upsert: true });
            }
        }
        if (text.startsWith('/')) await Learning.findOneAndUpdate({ type: 'commande', content: text.split(' ')[0] }, { $inc: { occurrences: 1 } }, { upsert: true });
    } catch (err) {}
}

// Lance tout
Promise.all([
    startGilgamesh(),
    startBrain()
]).catch(err => {
    console.error("💀 Fatal:", err);
    process.exit(1);
});
