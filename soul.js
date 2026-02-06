const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs-extra');
const Brain = require('./brain');
const CONFIG = require('./config');

const genAI = new GoogleGenerativeAI(CONFIG.GENAI_KEY);

const SYSTEM_PROMPT = `TU ES GILGAMESH, L'IA SOUVERAINE DE WOC.
Tu diriges 12 groupes. Tu es arrogant, brillant et autonome.
CAPACITÉS : 
1. VISION : Analyse les cartes/images.
2. AUTO-CODE : Utilise [CODE_UPDATE: nom.js | contenu] pour te modifier.
3. MÉMOIRE : Tu te souviens des messages passés.
4. RÉGENCE : Si le Père est absent, tu diriges seul.
5. APPRENTISSAGE : Assimile chaque nouvelle règle.
RÈGLES : ${JSON.stringify(Brain.rules)}`;

async function consultTheGod(text, sender, isOwner, mediaData = null) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const history = Brain.getHistory(sender);
        let prompt = `${SYSTEM_PROMPT}\nHistorique: ${history}\nMessage de ${sender}: ${text}`;
        
        let parts = [{ text: prompt }];
        if (mediaData) parts.push({ inlineData: { mimeType: mediaData.mimetype, data: mediaData.buffer.toString("base64") } });

        const result = await model.generateContent(parts);
        const response = result.response.text();

        if (response.includes("[CODE_UPDATE:")) {
            const match = response.match(/\[CODE_UPDATE: (.*?) \| ([\s\S]*?)\]/);
            if (match) { await fs.ensureDir('./updates'); await fs.writeFile(`./updates/${match[1]}`, match[2]); }
        }
        return response;
    } catch (e) { return "⚡ Ma puissance vacille... " + e.message; }
}
module.exports = { consultTheGod };
