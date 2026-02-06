const fs = require('fs-extra');
class Brain {
    constructor() {
        this.data = { stats: { health: 100, treasury: 50000 }, admins: {}, logs: {} };
        this.rules = { mechanics: [], learning: [] };
        this.load();
    }
    load() {
        if (fs.existsSync('./core.json')) this.data = fs.readJsonSync('./core.json');
        if (fs.existsSync('./rules.json')) this.rules = fs.readJsonSync('./rules.json');
    }
    save() {
        fs.writeJsonSync('./core.json', this.data);
        fs.writeJsonSync('./rules.json', this.rules);
    }
    addLog(id, text) {
        if (!this.data.logs[id]) this.data.logs[id] = [];
        this.data.logs[id].push({ t: Date.now(), m: text });
        if (this.data.logs[id].length > 15) this.data.logs[id].shift(); // Retient les 15 derniers
        this.save();
    }
    getHistory(id) { return this.data.logs[id] ? this.data.logs[id].map(l => l.m).join(" | ") : ""; }
}
module.exports = new Brain();
