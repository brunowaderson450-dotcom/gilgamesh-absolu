// auth-mongo.js — Session Baileys stockée dans MongoDB
const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
    _id: String,
    data: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);

async function useMongoAuthState() {
    const writeData = async (data, key) => {
        await Session.findByIdAndUpdate(key, { data: JSON.parse(JSON.stringify(data)) }, { upsert: true, new: true });
    };

    const readData = async (key) => {
        const doc = await Session.findById(key);
        return doc ? doc.data : null;
    };

    const removeData = async (key) => {
        await Session.findByIdAndDelete(key);
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        const val = await readData(`${type}-${id}`);
                        if (val) data[id] = val;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data)) {
                        for (const id of Object.keys(data[category])) {
                            const val = data[category][id];
                            tasks.push(val ? writeData(val, `${category}-${id}`) : removeData(`${category}-${id}`));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
}

function initAuthCreds() {
    const { Curve, signedKeyPair } = require('@whiskeysockets/baileys');
    const identityKey = Curve.generateKeyPair();
    return {
        noiseKey: Curve.generateKeyPair(),
        pairingEphemeralKeyPair: Curve.generateKeyPair(),
        signedIdentityKey: identityKey,
        signedPreKey: signedKeyPair(identityKey, 1),
        registrationId: Math.floor(Math.random() * 16000 + 1),
        advSecretKey: require('crypto').randomBytes(32).toString('base64'),
        processedHistoryMessages: [],
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSyncCounter: 0,
        accountSettings: { unarchiveChats: false },
        registered: false,
        pairingCode: undefined,
        me: undefined,
        account: undefined,
        signalIdentities: undefined,
        platform: undefined,
        routingInfo: undefined,
        lastAccountSyncTimestamp: undefined,
        lastPropHash: undefined,
    };
}

module.exports = { useMongoAuthState };
