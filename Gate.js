// ╔══════════════════════════════════════╗
// ║      GATE OF BABYLON                ║
// ║   Zone d'évolution libre            ║
// ║   Gilgamesh se modifie ici          ║
// ╚══════════════════════════════════════╝

const Groq = require('groq-sdk');
const mongoose = require('mongoose');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey: GROQ_API_KEY });

// ════════════════════════════════
// SCHÉMAS
// ════════════════════════════════
const GateCommandSchema = new mongoose.Schema({
    name: String,
    trigger: String,
    code: String,
    description: String,
    active: { type: Boolean, default: true },
    addedBy: { type: String, default: 'Gilgamesh' },
    version: { type: Number, default: 1 },
    timestamp: { type: Date, default: Date.now }
});

const UpdateLogSchema = new mongoose.Schema({
    type: String,
    description: String,
    codeApplied: String,
    success: Boolean,
    error: String,
    rollback: Boolean,
    source: String,
    timestamp: { type: Date, default: Date.now }
});

const WebCacheSchema = new mongoose.Schema({
    url: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
});

const GateCommand = mongoose.model('GateCommand', GateCommandSchema);
const UpdateLog   = mongoose.model('UpdateLog', UpdateLogSchema);
const WebCache    = mongoose.model('WebCache', WebCacheSchema);

// ════════════════════════════════
// DOUBLE IA — LLAMA PROPOSE, DEEPSEEK VÉRIFIE
// ════════════════════════════════
async function doubleAIGenerate(instruction, context = '') {
    console.log("🧠 Llama génère le code...");

    // ÉTAPE 1 : Llama génère
    const step1 = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{
            role: "system",
            content: `Tu es un expert Node.js qui génère du code pour Gilgamesh, un bot WhatsApp.
RÈGLES ABSOLUES :
- Retourne UNIQUEMENT du code JavaScript valide
- Pas de markdown, pas de backticks
- Le code doit être une fonction async autonome
- Pas d'imports (tout est déjà disponible : sock, jid, sender, m, mongoose, groq)
- Si impossible : retourne exactement le mot IMPOSSIBLE`
        }, {
            role: "user",
            content: `INSTRUCTION : ${instruction}
CONTEXTE : ${context}
Génère le code JavaScript.`
        }],
        max_tokens: 2000,
        temperature: 0.7
    });

    let code = step1.choices[0].message.content.trim();
    code = code.replace(/^```(javascript|js)?/gm, '').replace(/```$/gm, '').trim();

    if (code === 'IMPOSSIBLE') return { success: false, code: null, reason: 'Impossible selon Llama' };

    console.log("🔍 DeepSeek vérifie le code...");

    // ÉTAPE 2 : DeepSeek vérifie et corrige
    const step2 = await groq.chat.completions.create({
        model: "deepseek-r1-distill-llama-70b",
        messages: [{
            role: "system",
            content: `Tu es un expert en sécurité et qualité de code Node.js.
Analyse ce code et corrige les erreurs.
RÈGLES :
- Retourne le code corrigé UNIQUEMENT, sans explication
- Pas de markdown
- Si le code est dangereux (rm -rf, process.kill, etc) : retourne DANGEREUX
- Si le code est correct : retourne-le tel quel ou amélioré`
        }, {
            role: "user",
            content: `Vérifie et corrige ce code :\n${code}`
        }],
        max_tokens: 2000,
        temperature: 0.3
    });

    let verifiedCode = step2.choices[0].message.content.trim();
    verifiedCode = verifiedCode.replace(/^```(javascript|js)?/gm, '').replace(/```$/gm, '').trim();
    // Remove DeepSeek thinking tags
    verifiedCode = verifiedCode.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    if (verifiedCode === 'DANGEREUX') return { success: false, code: null, reason: 'Code dangereux détecté' };

    return { success: true, code: verifiedCode };
}

// ════════════════════════════════
// NAVIGATEUR WEB — GILGAMESH EXPLORE INTERNET
// ════════════════════════════════
async function webFetch(url) {
    return new Promise((resolve, reject) => {
        // Vérifie cache d'abord
        WebCache.findOne({ url, timestamp: { $gte: new Date(Date.now() - 3600000) } })
            .then(cached => {
                if (cached) {
                    console.log(`📦 Cache: ${url}`);
                    return resolve(cached.content);
                }

                console.log(`🌐 Fetching: ${url}`);
                const req = https.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 Gilgamesh-Bot/4.0' },
                    timeout: 10000
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', async () => {
                        // Nettoie le HTML
                        const clean = data
                            .replace(/<script[\s\S]*?<\/script>/gi, '')
                            .replace(/<style[\s\S]*?<\/style>/gi, '')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .substring(0, 5000);

                        // Sauvegarde en cache
                        await WebCache.findOneAndUpdate({ url }, { content: clean, timestamp: new Date() }, { upsert: true });
                        resolve(clean);
                    });
                });
                req.on('error', reject);
                req.on('timeout', () => reject(new Error('Timeout')));
            })
            .catch(reject);
    });
}

// ════════════════════════════════
// SELF-UPDATE — GILGAMESH ÉVOLUE
// ════════════════════════════════
async function selfUpdate(instruction, source = 'Pensée autonome', sock = null, jid = null) {
    console.log(`⚡ SELF-UPDATE : ${instruction}`);

    try {
        // Cherche sur internet si nécessaire
        let webContext = '';
        if (instruction.toLowerCase().includes('hugging') || instruction.toLowerCase().includes('github') || instruction.toLowerCase().includes('npm')) {
            try {
                const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(instruction)}&sort=stars&per_page=3`;
                webContext = await webFetch(searchUrl);
                console.log("🌐 Contexte web récupéré.");
            } catch (e) {
                console.log("⚠️ Web fetch échoué, continue sans.");
            }
        }

        // Double IA génère le code
        const result = await doubleAIGenerate(instruction, webContext);

        if (!result.success) {
            await UpdateLog.create({ type: 'self-update', description: instruction, success: false, error: result.reason, source });
            return { success: false, reason: result.reason };
        }

        // Backup du gate.js actuel
        const backupPath = `./gate.js.bak.${Date.now()}`;
        fs.copyFileSync('./gate.js', backupPath);

        // Test du code dans sandbox
        try {
            const testFn = new Function('require', 'mongoose', 'groq', `
                "use strict";
                ${result.code}
                return true;
            `);
            testFn(require, mongoose, groq);
        } catch (testErr) {
            console.log("⚠️ Test échoué, rollback.");
            await UpdateLog.create({
                type: 'self-update', description: instruction,
                success: false, error: testErr.message,
                rollback: true, source
            });
            return { success: false, reason: `Test échoué: ${testErr.message}` };
        }

        // Ajoute comme nouvelle GateCommand
        await GateCommand.create({
            name: `auto_${Date.now()}`,
            trigger: instruction.substring(0, 30),
            code: result.code,
            description: instruction,
            addedBy: 'Gilgamesh-Auto'
        });

        await UpdateLog.create({
            type: 'self-update', description: instruction,
            codeApplied: result.code.substring(0, 200),
            success: true, source
        });

        console.log("✅ Self-update réussi.");

        if (sock && jid) {
            await sock.sendMessage(jid, { text: `✅ *Évolution réussie*\n\n"${instruction}"\n\n— Gilgamesh` });
        }

        return { success: true, code: result.code };

    } catch (err) {
        console.error("❌ Self-update erreur:", err.message);
        await UpdateLog.create({ type: 'self-update', description: instruction, success: false, error: err.message, source });
        return { success: false, reason: err.message };
    }
}

// ════════════════════════════════
// INSTALL PACKAGE AUTONOME
// ════════════════════════════════
async function installPackage(packageName) {
    try {
        console.log(`📦 Installation: ${packageName}`);
        execSync(`npm install ${packageName} --save`, { timeout: 60000, stdio: 'pipe' });
        await UpdateLog.create({ type: 'install', description: `npm install ${packageName}`, success: true, source: 'Gilgamesh-Auto' });
        console.log(`✅ ${packageName} installé.`);
        return true;
    } catch (err) {
        console.error(`❌ Install ${packageName}:`, err.message);
        return false;
    }
}

// ════════════════════════════════
// CRÉER BOT SOLDAT (fichier standalone)
// ════════════════════════════════
async function createSoldierBot(mission, botName) {
    console.log(`⚔️ Création bot soldat: ${botName}`);

    const result = await doubleAIGenerate(
        `Crée un bot WhatsApp Baileys standalone complet pour cette mission: ${mission}. 
        Il doit être autonome, fonctionner avec useMultiFileAuthState, et avoir un pairing code avec delay(10000).
        Variables d'environnement: MONGODB_URI, GROQ_API_KEY, BOT_NUMBER`,
        'Bot soldat standalone, pas de dépendances vers index.js'
    );

    if (!result.success) return null;

    const filename = `./soldiers/${botName.replace(/\s/g, '_')}.js`;
    if (!fs.existsSync('./soldiers')) fs.mkdirSync('./soldiers');
    fs.writeFileSync(filename, result.code);

    await UpdateLog.create({
        type: 'soldier-created',
        description: `Bot soldat: ${botName} | Mission: ${mission}`,
        success: true,
        source: 'Gilgamesh-Auto'
    });

    console.log(`✅ Bot soldat créé: ${filename}`);
    return filename;
}

// ════════════════════════════════
// EXÉCUTER GATE COMMAND
// ════════════════════════════════
async function executeGateCommand(trigger, sock, jid, sender, m, text, models) {
    try {
        const gates = await GateCommand.find({ active: true });
        for (const gate of gates) {
            if (text.toLowerCase().includes(gate.trigger.toLowerCase())) {
                const fn = new (Object.getPrototypeOf(async function(){}).constructor)(
                    'sock', 'jid', 'sender', 'm', 'text',
                    'Memory', 'Admin', 'Emotion', 'Learning', 'VIP', 'PERE',
                    'selfUpdate', 'webFetch', 'installPackage', 'createSoldierBot',
                    gate.code
                );
                await fn(
                    sock, jid, sender, m, text,
                    models.Memory, models.Admin, models.Emotion, models.Learning, models.VIP, models.PERE,
                    selfUpdate, webFetch, installPackage, createSoldierBot
                );
                return true;
            }
        }
        return false;
    } catch (err) {
        console.error("❌ Gate execute:", err.message);
        return false;
    }
}

module.exports = {
    selfUpdate,
    webFetch,
    installPackage,
    createSoldierBot,
    executeGateCommand,
    GateCommand,
    UpdateLog,
    WebCache
};
