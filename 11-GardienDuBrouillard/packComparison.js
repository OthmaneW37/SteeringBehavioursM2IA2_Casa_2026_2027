// Comparaison de meutes (niveau 1) : chaque meute affronte le joueur robot sur les MÊMES combats (mêmes
// graines), sans rendu. Le travail est découpé (work(budget)) pour que la page reste fluide.
// entries : [{ name, makeController }] ; settings : Settings + PackSettings.
class PackComparison {
    constructor(entries, settings, fights = PackSettings.COMPARISON_FIGHTS, arena = new Arena(), seedBase = PackComparison.SEED) {
        if (!entries || entries.length === 0) throw new RangeError("Aucune meute à comparer.");
        this.entries = entries;
        this.settings = Object.assign({}, settings);
        this.fights = fights;
        this.arena = arena;
        this.seedBase = seedBase;
        this.results = entries.map(() => []);
        this.entryIndex = 0;
        this.current = null;
    }

    get done() {
        return this.entryIndex >= this.entries.length;
    }

    work(budget) {
        let steps = 0;
        while (!this.done && steps < budget) {
            if (!this.current) {
                const k = this.results[this.entryIndex].length;
                this.current = PackTraining.makeFight(this.entries[this.entryIndex].makeController(), this.seedBase + k, this.settings, this.arena);
            }
            while (!this.current.over && steps < budget) {
                this.current.step();
                steps++;
            }
            if (!this.current.over) break;
            const list = this.results[this.entryIndex];
            list.push(this.current.result);
            this.current = null;
            if (list.length >= this.fights) this.entryIndex++;
        }
        return steps;
    }

    progress() {
        const total = this.entries.length * this.fights;
        return this.results.reduce((s, r) => s + r.length, 0) / total;
    }

    /** Résumé par meute (les meutes sans combat terminé ont fights = 0). */
    summary() {
        return this.entries.map((e, i) => Object.assign({ name: e.name },
            this.results[i].length ? PackTraining.summary(this.results[i]) : { fights: 0 }));
    }
}

PackComparison.SEED = 960000;   // mêmes combats d'examen que l'outil de pré-entraînement
