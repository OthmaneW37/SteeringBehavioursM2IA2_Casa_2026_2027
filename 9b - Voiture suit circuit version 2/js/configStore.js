/**
 * Configurations nommées : sérialisation, validation, stockage local et fichiers JSON.
 *
 * Format d'une configuration (fichier .json exporté) :
 * {
 *   "format": "neuro-racing-config", "version": 2,
 *   "name": "Mon réglage", "savedAt": "2026-10-15T12:00:00.000Z",
 *   "settings": { ... voir Settings.defaults() ... },
 *   "brain": null | { "sizes": [8, 20, 2], "weights": [[...], ...], "biases": [[...], ...] }
 * }
 *
 * Le stockage est injecté (localStorage dans le navigateur, faux stockage dans les tests).
 * Chaque lecture et écriture est protégée : un navigateur peut bloquer le stockage
 * (mode privé, quota dépassé...) ; l'erreur est alors retournée, jamais levée.
 */
const ConfigStore = {
    KEY: 'neuroRacing.configs.v1',
    FORMAT: 'neuro-racing-config',
    VERSION: 2,
    NAME_MAX: 60,

    known() {
        return { circuits: Circuits.ids(), carTypes: CarTypes.ids() };
    },

    checkName(name) {
        if (typeof name !== 'string' || name.trim().length === 0) throw new RangeError("Le nom est vide.");
        if (name.trim().length > ConfigStore.NAME_MAX) throw new RangeError("Nom trop long (" + ConfigStore.NAME_MAX + " caractères max).");
        return name.trim();
    },

    /** Nouvelle configuration ; `brain` (NeuralNetwork) est facultatif. */
    create(name, settings, brain = null, now = new Date()) {
        return ConfigStore.validate({
            format: ConfigStore.FORMAT, version: ConfigStore.VERSION,
            name: name, savedAt: now.toISOString(),
            settings: settings, brain: brain ? brain.toJSON() : null
        });
    },

    /** Vérifie un objet configuration et en retourne une copie propre (RangeError / TypeError sinon). */
    validate(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new TypeError("Configuration illisible.");
        if (obj.format !== ConfigStore.FORMAT) throw new RangeError("Ce fichier n'est pas une configuration Neuroévolution Racing.");
        if (obj.version !== ConfigStore.VERSION) throw new RangeError("Version de configuration non prise en charge : " + obj.version);
        const known = ConfigStore.known();
        const settings = Settings.validate(obj.settings, known.circuits, known.carTypes);
        let brain = null;
        if (obj.brain !== null && obj.brain !== undefined) {
            const nn = NeuralNetwork.fromJSON(obj.brain);
            const expected = Settings.networkSizes(settings);
            if (nn.sizes.join(',') !== expected.join(',')) {
                throw new RangeError("Le cerveau [" + nn.sizes.join(', ') + "] ne correspond pas à l'architecture [" + expected.join(', ') + "].");
            }
            brain = nn.toJSON();
        }
        return {
            format: ConfigStore.FORMAT, version: ConfigStore.VERSION,
            name: ConfigStore.checkName(obj.name),
            savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date(0).toISOString(),
            settings: settings, brain: brain
        };
    },

    /** Texte JSON d'une configuration (export). */
    serialize(config) {
        return JSON.stringify(config, null, 2);
    },

    /** Lecture d'un fichier importé : JSON puis validation. */
    parse(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            throw new RangeError("Fichier JSON illisible : " + e.message);
        }
        return ConfigStore.validate(obj);
    },

    brainOf(config) {
        return config && config.brain ? NeuralNetwork.fromJSON(config.brain) : null;
    },

    /** Toutes les configurations valides du stockage. → { configs, error } */
    readAll(storage) {
        if (!storage) return { configs: [], error: "Stockage local indisponible.", failed: true };
        let text;
        try {
            text = storage.getItem(ConfigStore.KEY);
        } catch (e) {
            return { configs: [], error: "Lecture du stockage impossible : " + e.message, failed: true };
        }
        if (!text) return { configs: [], error: null, failed: false };
        let list;
        try {
            list = JSON.parse(text);
        } catch (e) {
            return { configs: [], error: "Stockage corrompu : " + e.message, failed: false };
        }
        const configs = [];
        let rejected = 0;
        for (const item of Array.isArray(list) ? list : []) {
            try { configs.push(ConfigStore.validate(item)); } catch (e) { rejected++; }
        }
        return { configs: configs, error: rejected ? rejected + " configuration(s) invalide(s) ignorée(s)." : null, failed: false };
    },

    writeAll(storage, configs) {
        if (!storage) return { ok: false, error: "Stockage local indisponible." };
        try {
            storage.setItem(ConfigStore.KEY, JSON.stringify(configs));
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: "Écriture du stockage impossible : " + e.message };
        }
    },

    /** Ajoute ou remplace (même nom) une configuration. → { ok, error, configs } */
    save(storage, config) {
        const read = ConfigStore.readAll(storage);
        if (read.failed) {
            return { ok: false, error: read.error, configs: read.configs };
        }
        const valid = ConfigStore.validate(config);
        const configs = read.configs.filter(c => c.name !== valid.name).concat([valid]);
        const res = ConfigStore.writeAll(storage, configs);
        return { ok: res.ok, error: res.error, configs: res.ok ? configs : read.configs };
    },

    rename(storage, oldName, newName) {
        const read = ConfigStore.readAll(storage);
        if (read.failed) return { ok: false, error: read.error, configs: [] };
        const name = ConfigStore.checkName(newName);
        const target = read.configs.find(c => c.name === oldName);
        if (!target) return { ok: false, error: "Configuration introuvable : " + oldName, configs: read.configs };
        if (name !== oldName && read.configs.some(c => c.name === name)) {
            return { ok: false, error: "Le nom « " + name + " » existe déjà.", configs: read.configs };
        }
        const configs = read.configs.map(c => c === target ? Object.assign({}, c, { name: name }) : c);
        const res = ConfigStore.writeAll(storage, configs);
        return { ok: res.ok, error: res.error, configs: res.ok ? configs : read.configs };
    },

    remove(storage, name) {
        const read = ConfigStore.readAll(storage);
        if (read.failed) return { ok: false, error: read.error, configs: [] };
        const configs = read.configs.filter(c => c.name !== name);
        if (configs.length === read.configs.length) {
            return { ok: false, error: "Configuration introuvable : " + name, configs: read.configs };
        }
        const res = ConfigStore.writeAll(storage, configs);
        return { ok: res.ok, error: res.error, configs: res.ok ? configs : read.configs };
    },

    find(configs, name) {
        return configs.find(c => c.name === name) || null;
    },

    /** Nom de fichier d'export sûr. */
    fileName(config) {
        return 'config-' + config.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
    }
};
