// Comparaison mesurable : chaque boss (à états, appris) affronte le même joueur scripté sur les
// mêmes N combats (mêmes graines). Résultat : taux de victoire et durée moyenne.
// Découpé comme l'entraînement : work(budget) avance d'au plus `budget` pas.
class Comparison {
    /**
     * contenders : [{ name, makeController: () => contrôleur du boss }]
     * settings : { dodgeProbability, attackInterval, maxFightTime, detectRadius }
     */
    constructor(contenders, settings, fights = 50, seedBase = 5000) {
        this.contenders = contenders;
        this.settings = settings;
        this.fights = fights;
        this.seedBase = seedBase;
        this.arena = new Arena();
        this.c = 0;        // concurrent en cours
        this.k = 0;        // combat en cours
        this.current = null;
        this.records = contenders.map(ct => ({ name: ct.name, results: [] }));
    }

    get done() {
        return this.c >= this.contenders.length;
    }

    makeFight(contender, k) {
        const s = this.settings;
        const seed = this.seedBase + k;
        return new Fight({
            arena: this.arena,
            playerController: new ScriptedPlayerController(seededRandom(seed), {
                dodgeProbability: s.dodgeProbability, attackInterval: s.attackInterval
            }),
            bossController: contender.makeController(),
            maxTime: s.maxFightTime,
            detectRadius: s.detectRadius,
            seed: seed
        });
    }

    work(budget) {
        let done = 0;
        while (done < budget && !this.done) {
            if (!this.current) this.current = this.makeFight(this.contenders[this.c], this.k);
            while (!this.current.over && done < budget) {
                this.current.step();
                done++;
            }
            if (!this.current.over) break;
            this.records[this.c].results.push(this.current.result);
            this.current = null;
            this.k++;
            if (this.k >= this.fights) {
                this.k = 0;
                this.c++;
            }
        }
        return done;
    }

    progress() {
        return Math.min(1, (this.c * this.fights + this.k) / (this.contenders.length * this.fights));
    }

    /** Statistiques de chaque concurrent (sur les combats déjà joués). */
    static summarize(record) {
        const r = record.results;
        const n = r.length;
        const count = w => r.filter(x => x.winner === w).length;
        const wins = r.filter(x => x.winner === 'boss');
        const avg = (list, f) => list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0;
        return {
            name: record.name,
            fights: n,
            wins: count('boss'),
            losses: count('player'),
            draws: count('draw'),
            winRate: n ? count('boss') / n : 0,
            avgDuration: avg(r, x => x.duration),
            avgWinDuration: avg(wins, x => x.duration),
            avgDamageDealt: avg(r, x => x.damageToPlayer),
            avgDamageTaken: avg(r, x => x.damageToBoss),
            avgWhiffs: avg(r, x => x.bossWhiffs)
        };
    }

    summary() {
        return this.records.map(Comparison.summarize);
    }
}
