// Tournoi croisé du Panthéon : chaque boss affronte chaque épreuve (joueur robot réglé autrement),
// sur les mêmes N combats (mêmes graines pour tous les boss). On obtient une grille
// « taux de victoire [boss][épreuve] » : elle montre ce que chaque recette d'entraînement a produit,
// où chaque boss est fort, et si son entraînement l'a bien préparé contre l'adversaire qu'il a affronté.
//
// Une épreuve est une Comparison (comparison.js) de tous les boss ; le tournoi les joue l'une après
// l'autre. Découpé comme l'entraînement : work(budget) avance d'au plus `budget` pas.
class CrossTournament {
    /**
     * contenders : [{ name, makeController: () => contrôleur du boss }]
     * trials : [{ id, label, settings }] (réglages complets de chaque épreuve)
     */
    constructor(contenders, trials, fights = CrossTournament.FIGHTS, seedBase = CrossTournament.SEED) {
        if (!contenders.length || !trials.length) throw new RangeError("Il faut au moins un boss et une épreuve.");
        this.contenders = contenders;
        this.trials = trials;
        this.fights = fights;
        this.comparisons = trials.map(t => new Comparison(contenders, t.settings, fights, seedBase));
        this.t = 0;   // épreuve en cours
    }

    get done() {
        return this.t >= this.comparisons.length;
    }

    work(budget) {
        let done = 0;
        while (done < budget && !this.done) {
            const c = this.comparisons[this.t];
            const n = c.work(budget - done);
            done += n;
            if (c.done) this.t++;
            else if (n === 0) break;
        }
        return done;
    }

    progress() {
        if (this.done) return 1;
        return (this.t + this.comparisons[this.t].progress()) / this.comparisons.length;
    }

    /** Statistiques du boss i à l'épreuve j (sur les combats déjà joués). */
    cell(i, j) {
        return Comparison.summarize(this.comparisons[j].records[i]);
    }

    /** grid[i][j] = statistiques du boss i à l'épreuve j. */
    grid() {
        return this.contenders.map((_, i) => this.trials.map((_, j) => this.cell(i, j)));
    }

    /**
     * Profil d'un boss : moyenne de ses statistiques sur toutes les épreuves (chaque épreuve compte
     * autant). C'est sa « fiche de style » : combien il frappe, charge, souffle, et ce qu'il encaisse.
     */
    static profile(row) {
        const keys = ['winRate', 'avgDuration', 'avgDamageDealt', 'avgDamageTaken', 'avgWhiffs', 'avgAttacks', 'avgCharges', 'avgBreaths', 'avgDrinks',
            'avgDodges', 'avgRipostes', 'avgCrashes', 'idleShare', 'campShare'];
        const out = {};
        const played = row.filter(c => c.fights > 0);
        for (const k of keys) out[k] = played.length ? played.reduce((s, c) => s + c[k], 0) / played.length : 0;
        return out;
    }

    /** Pour chaque épreuve, l'indice du boss qui gagne le plus souvent (le premier en cas d'égalité). */
    static bestPerTrial(grid) {
        if (!grid.length) return [];
        return grid[0].map((_, j) => {
            let best = 0;
            for (let i = 1; i < grid.length; i++) if (grid[i][j].winRate > grid[best][j].winRate) best = i;
            return best;
        });
    }

    /** Indice du boss qui a la meilleure moyenne sur toutes les épreuves (le plus polyvalent). */
    static mostVersatile(grid) {
        let best = 0;
        const mean = row => CrossTournament.profile(row).winRate;
        for (let i = 1; i < grid.length; i++) if (mean(grid[i]) > mean(grid[best])) best = i;
        return best;
    }

    /**
     * Phrases de conclusion, pour un public non spécialiste. `homes[i]` est l'indice de l'épreuve
     * contre laquelle le boss i s'est entraîné (ou -1).
     */
    static verdicts(grid, names, trialLabels, homes = []) {
        const out = [];
        const best = CrossTournament.bestPerTrial(grid);
        best.forEach((i, j) => {
            out.push("Contre le joueur « " + trialLabels[j] + " », le meilleur est " + names[i] + " (" +
                Math.round(grid[i][j].winRate * 100) + " % de victoires).");
        });
        const v = CrossTournament.mostVersatile(grid);
        out.push("Le plus polyvalent : " + names[v] + ", " + Math.round(CrossTournament.profile(grid[v]).winRate * 100) +
            " % de victoires en moyenne sur toutes les épreuves.");
        // Effet de l'entraînement : le rang de chaque boss contre l'adversaire de son entraînement.
        // On compare les boss entre eux sur la même épreuve (une épreuve facile l'est pour tout le monde).
        grid.forEach((row, i) => {
            const h = homes[i];
            if (h === undefined || h < 0) return;
            const rank = CrossTournament.rank(grid, i, h);
            out.push(names[i] + " s'est entraîné contre le joueur « " + trialLabels[h] + " » : " + Math.round(row[h].winRate * 100) +
                " % contre lui, " + (rank === 1 ? "le meilleur score de cette colonne." : rank + "e score sur " + grid.length + "."));
        });
        return out;
    }

    /** Rang du boss i à l'épreuve j (1 = meilleur ; les ex aequo partagent le même rang). */
    static rank(grid, i, j) {
        return 1 + grid.filter(row => row[j].winRate > grid[i][j].winRate + 1e-9).length;
    }
}

CrossTournament.FIGHTS = 30;            // combats par boss et par épreuve
CrossTournament.SEED = 7000;            // graines des combats du tournoi (ni entraînement, ni examen, ni comparaison)
