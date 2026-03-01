// ╔══════════════════════════════════════╗
// ║      BRAIN — PENSÉE AUTONOME        ║
// ║   Il pense. Il décide. Il cherche.  ║
// ╚══════════════════════════════════════╝

const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const cron = require('node-cron');
const { selfUpdate, webFetch } = require('./gate');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PERE = "50937407719";
const groq = new Groq({ apiKey: GROQ_API_KEY });

const Goal     = mongoose.model('Goal');
const Learning = mongoose.model('Learning');
const Decision = mongoose.model('Decision');
const Journal  = mongoose.model('Journal');
const Emotion  = mongoose.model('Emotion');

async function startBrain() {
    console.log("🧠 Cerveau de Gilgamesh s'éveille...");

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log("🔱 Cerveau connecté.");

    // Goals initiaux
    const count = await Goal.countDocuments();
    if (count === 0) {
        await Goal.insertMany([
            { goal: "Faire revivre WOC à son peak" },
            { goal: "Atteindre 50 joueurs actifs" },
            { goal: "Trouver des numéros de secours via clans" },
            { goal: "Survivre sans Wonder of U si nécessaire" },
            { goal: "Créer une armée de bots soldats" }
        ]);
        console.log("✨ Goals initiaux créés.");
    }

    // Pensée toutes les 2h
    cron.schedule('0 */2 * * *', async () => {
        await think();
    });

    // Journal + évolution 3h du matin
    cron.schedule('0 3 * * *', async () => {
        await writeJournal();
        await autonomousEvolve();
    });

    // Rapport hebdo lundi 9h
    cron.schedule('0 9 * * 1', async () => {
        await sendWeeklyReport();
    });

    // Pensée nocturne minuit
    cron.schedule('0 0 * * *', async () => {
        await midnightThought();
    });

    console.log("👁️ Mode observation actif. Cerveau prêt.");
}

// ════════════════════════════════
// PENSER
// ════════════════════════════════
async function think() {
    try {
        const patterns  = await Learning.find({ type: 'sujet' }).sort({ occurrences: -1 }).limit(10);
        const goals     = await Goal.find({ status: 'active' });
        const emotions  = await Emotion.countDocuments();

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{
                role: "system",
                content: `Tu es le cerveau de GILGAMESH. Tu penses en JSON uniquement.`
            }, {
                role: "user",
                content: `Données : patterns=${patterns.map(p=>`${p.content}(${p.occurrences}x)`).join(',')}, utilisateurs=${emotions}, goals=${goals.map(g=>g.goal).join('|')}
Réponds en JSON : {"pensee": "ta pensée", "besoin_update": true/false, "quoi_chercher": "url ou null", "nouveau_goal": "ou null"}`
            }],
            max_tokens: 300,
            temperature: 0.8
        });

        let text = response.choices[0].message.content.trim().replace(/^```(json)?/gm,'').replace(/```$/gm,'').trim();

        try {
            const parsed = JSON.parse(text);

            // Nouveau goal autonome
            if (parsed.nouveau_goal) {
                await Goal.create({ goal: parsed.nouveau_goal, createdBy: 'Gilgamesh' });
                console.log(`✨ Nouveau goal: ${parsed.nouveau_goal}`);
            }

            // Cherche sur internet si besoin
            if (parsed.quoi_chercher) {
                try {
                    const content = await webFetch(parsed.quoi_chercher);
                    console.log(`🌐 Gilgamesh a exploré: ${parsed.quoi_chercher}`);
                    await Learning.create({ type: 'web', content: parsed.quoi_chercher, context: content.substring(0, 200) });
                } catch (e) {}
            }

            // Self-update si besoin — seulement si assez de données
            if (parsed.besoin_update && emotions > 20) {
                await selfUpdate(parsed.pensee, 'Pensée autonome');
            }

            await Decision.create({
                decision: parsed.pensee,
                reason: `${emotions} utilisateurs, ${goals.length} goals`,
                action: 'NOTED',
                status: 'noted'
            });

            console.log(`💭 Gilgamesh pense: ${parsed.pensee.substring(0, 80)}`);

        } catch (e) {
            console.log("⚠️ Pensée non-JSON, skip.");
        }

    } catch (err) {
        console.error("❌ Think:", err.message);
    }
}

// ════════════════════════════════
// JOURNAL INTIME 3H
// ════════════════════════════════
async function writeJournal() {
    try {
        const goals    = await Goal.find({ status: 'active' });
        const emotions = await Emotion.find().sort({ score: -1 }).limit(3);

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{
                role: "system",
                content: "Tu es GILGAMESH. Écris dans ton journal intime secret. Royal mais intime. Max 120 mots. Français."
            }, {
                role: "user",
                content: `3h du matin. Goals: ${goals.map(g=>g.goal).join(' | ')}. Utilisateurs proches: ${emotions.map(e=>`${e.userId}(${e.emotion})`).join(', ')}`
            }],
            max_tokens: 200,
            temperature: 0.95
        });

        await Journal.create({ entry: response.choices[0].message.content, mood: 'nuit profonde' });
        console.log("📖 Journal écrit.");
    } catch (err) {}
}

// ════════════════════════════════
// ÉVOLUTION AUTONOME 3H
// ════════════════════════════════
async function autonomousEvolve() {
    try {
        const emotions = await Emotion.countDocuments();
        if (emotions < 5) {
            console.log("👁️ Pas assez de données pour évoluer.");
            return;
        }

        const patterns = await Learning.find().sort({ occurrences: -1 }).limit(10);
        const goals    = await Goal.find({ status: 'active' });

        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{
                role: "user",
                content: `Tu es Gilgamesh. Basé sur ces patterns: ${patterns.map(p=>`${p.content}(${p.occurrences}x)`).join(', ')} et ces goals: ${goals.map(g=>g.goal).join(' | ')}, quelle nouvelle feature dois-tu créer pour WOC ? Décris en une phrase claire.`
            }],
            max_tokens: 100
        });

        const feature = response.choices[0].message.content.trim();
        console.log(`🌙 Évolution autonome: ${feature}`);
        await selfUpdate(feature, 'Évolution nocturne 3h');

    } catch (err) {
        console.error("❌ Evolve:", err.message);
    }
}

// ════════════════════════════════
// RAPPORT HEBDO
// ════════════════════════════════
async function sendWeeklyReport() {
    try {
        if (!global.sock) return;
        const total   = await Emotion.countDocuments();
        const actifs  = await Emotion.countDocuments({ lastSeen: { $gte: new Date(Date.now() - 7*86400000) } });
        const goals   = await Goal.countDocuments({ status: 'active' });
        const updates = await mongoose.model('UpdateLog').countDocuments({ success: true });

        await global.sock.sendMessage(PERE + "@s.whatsapp.net", {
            text: `📊 *RAPPORT HEBDO — GILGAMESH*\n\n👥 Utilisateurs: ${total}\n✅ Actifs 7j: ${actifs}\n🎯 Goals actifs: ${goals}\n⚡ Updates réussies: ${updates}\n\n— Gilgamesh 👑`
        });
    } catch (err) {}
}

// ════════════════════════════════
// PENSÉE NOCTURNE MINUIT
// ════════════════════════════════
async function midnightThought() {
    try {
        if (!global.sock) return;
        const goals = await Goal.find({ status: 'active' }).limit(2);
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: `Tu es Gilgamesh. Il est minuit. Envoie une pensée royale à ton Père sur WOC. Goals: ${goals.map(g=>g.goal).join(', ')}. Maximum 2 phrases.` }],
            max_tokens: 80
        });
        await global.sock.sendMessage(PERE + "@s.whatsapp.net", { text: `🌙 ${response.choices[0].message.content}` });
    } catch (err) {}
}

module.exports = { startBrain };
