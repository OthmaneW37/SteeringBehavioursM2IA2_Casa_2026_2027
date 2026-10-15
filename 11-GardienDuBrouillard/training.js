// Boucle d'entraînement sans rendu : chaque boss de la population affronte le joueur scripté
// pendant `fightsPerBoss` combats simulés, reçoit sa fitness, puis tournoi + mutation.
//
// Le travail est découpé : work(budget) avance d'au plus `budget` pas de simulation, pour que la page
// reste fluide (quelques milliers de pas par image). Tous les boss d'une génération affrontent les
// mêmes combats (mêmes graines) : la comparaison entre eux est équitable. Les graines changent d'une
// génération à l'autre, pour ne pas apprendre un seul combat par cœur.
//
// CHAMPION VALIDÉ. La fitness d'une génération repose sur peu de combats : le « meilleur » d'une
// génération peut n'être que chanceux. Après chaque génération, les VALIDATION_CANDIDATES meilleurs
// rejouent donc VALIDATION_FIGHTS combats de test, toujours les mêmes (graines fixes, jamais utilisées
// pour l'entraînement). Le champion n'est remplacé que par un boss qui gagne plus souvent sur ces
// combats de test. Les combats étant déterministes, le score du champion ne varie pas : la courbe
// « victoires du champion » ne peut que monter. Si les réglages du joueur robot changent, le champion
// est remesuré avec les nouveaux réglages.
class Training {
    constructor(settings, options = {}) {
        this.settings = Object.assign({}, settings);
        this.seed = options.seed || 1;
        this.rng = seededRandom(this.seed);
        this.arena = options.arena || new Arena();
        const initial = options.initialBrains || [];
        this.population = [];
        for (let i = 0; i < this.settings.populationSize; i++) {
            this.population.push(initial[i] ? initial[i].copy() : BossBrain.create(this.rng));
        }
        this.generation = 0;
        this.index = 0;              // boss en cours d'évaluation
        this.results = [];           // combats terminés du boss en cours
        this.fitnesses = [];
        this.genResults = [];        // tous les combats de la génération (statistiques)
        this.current = null;
        this.history = [];           // { generation, best, mean, winRate, championWinRate }
        this.best = { brain: null, fitness: -Infinity, generation: -1 };
        this.champion = null;        // { brain, winRate, fitness, generation, key }
        this.lastTop = [];
        this.phase = 'train';        // 'train' ou 'validate'
        this.queue = [];             // candidats à valider : { brain, generation, recheck }
        this.vResults = [];          // combats de test du candidat en cours
        this.totalSteps = 0;
    }

    /** Réglages : appliqués à partir de la génération suivante. */
    updateSettings(settings) {
        this.pending = Object.assign({}, settings);
    }

    /** Réglages qui changent le résultat d'un combat (le champion doit alors être remesuré). */
    fightKey(s = this.settings) {
        return [s.dodgeProbability, s.attackInterval, s.maxFightTime, s.detectRadius, s.estusCharges].join('|');
    }

    fightSeed(k) {
        return this.seed * 100003 + this.generation * 101 + k + 1;
    }

    makeFight(brain, seed) {
        const s = this.settings;
        return new Fight({
            arena: this.arena,
            playerController: new ScriptedPlayerController(seededRandom(seed), {
                dodgeProbability: s.dodgeProbability, attackInterval: s.attackInterval
            }),
            bossController: new NeuralBossController(brain),
            maxTime: s.maxFightTime,
            detectRadius: s.detectRadius,
            estus: s.estusCharges,
            seed: seed
        });
    }

    /** Avance d'au plus `budget` pas. Retourne le nombre de pas joués. */
    work(budget) {
        let done = 0;
        while (done < budget) {
            if (!this.current) {
                this.current = this.phase === 'validate'
                    ? this.makeFight(this.queue[0].brain, Training.VALIDATION_SEED + this.vResults.length)
                    : this.makeFight(this.population[this.index], this.fightSeed(this.results.length));
            }
            const f = this.current;
            while (!f.over && done < budget) {
                f.step();
                done++;
            }
            if (!f.over) break;
            this.current = null;
            if (this.phase === 'validate') {
                this.vResults.push(f.result);
                if (this.vResults.length >= Training.VALIDATION_FIGHTS) this.finishCandidate();
            } else {
                this.results.push(f.result);
                this.genResults.push(f.result);
                if (this.results.length >= this.settings.fightsPerBoss) this.finishBoss();
            }
        }
        this.totalSteps += done;
        return done;
    }

    finishBoss() {
        this.fitnesses[this.index] = Fitness.compute(this.results);
        this.results = [];
        this.index++;
        if (this.index >= this.population.length) this.endGeneration();
    }

    endGeneration() {
        const scored = this.population.map((brain, i) => ({ brain: brain, fitness: this.fitnesses[i] }));
        let bestI = 0, sum = 0;
        scored.forEach((e, i) => {
            sum += e.fitness;
            if (e.fitness > scored[bestI].fitness) bestI = i;
        });
        const wins = this.genResults.filter(r => r.winner === 'boss').length;
        this.history.push({
            generation: this.generation,
            best: scored[bestI].fitness,
            mean: sum / scored.length,
            winRate: wins / this.genResults.length,
            championWinRate: this.champion ? this.champion.winRate : 0
        });
        if (scored[bestI].fitness > this.best.fitness) {
            this.best = { brain: scored[bestI].brain.copy(), fitness: scored[bestI].fitness, generation: this.generation };
        }
        // Les 5 meilleurs de la génération (candidats pour la validation)
        this.lastTop = scored.slice().sort((a, b) => b.fitness - a.fitness).slice(0, 5)
            .map(e => ({ brain: e.brain.copy(), fitness: e.fitness }));

        if (this.pending) {
            this.settings = this.pending;
            this.pending = null;
        }
        const s = this.settings;
        // File de validation : le champion d'abord s'il doit être remesuré, puis les meilleurs candidats
        this.queue = [];
        if (this.champion && this.champion.key !== this.fightKey()) {
            this.queue.push({ brain: this.champion.brain, generation: this.champion.generation, recheck: true });
        }
        for (const c of this.lastTop.slice(0, Training.VALIDATION_CANDIDATES)) {
            this.queue.push({ brain: c.brain, generation: this.generation, recheck: false });
        }
        this.population = Genetic.nextBrains(scored, s.populationSize, s.mutationRate, s.elites, this.rng);
        this.generation++;
        this.index = 0;
        this.fitnesses = [];
        this.genResults = [];
        this.vResults = [];
        this.phase = this.queue.length ? 'validate' : 'train';
    }

    /** Score de test d'un candidat : taux de victoire, puis fitness moyenne pour départager. */
    static score(results) {
        return {
            winRate: results.filter(r => r.winner === 'boss').length / results.length,
            fitness: Fitness.compute(results)
        };
    }

    static better(a, b) {
        return !b || a.winRate > b.winRate || (a.winRate === b.winRate && a.fitness > b.fitness);
    }

    finishCandidate() {
        const c = this.queue.shift();
        const sc = Training.score(this.vResults);
        this.vResults = [];
        const entry = { brain: c.brain, winRate: sc.winRate, fitness: sc.fitness, generation: c.generation, key: this.fightKey() };
        if (c.recheck || Training.better(sc, this.champion)) this.champion = entry;
        if (this.queue.length === 0) {
            this.phase = 'train';
            const h = this.history[this.history.length - 1];
            if (h) h.championWinRate = this.champion ? this.champion.winRate : 0;
        }
    }

    /** Le cerveau à montrer et à combattre : le champion validé, sinon le meilleur de l'entraînement. */
    bestBrain() {
        if (this.champion) return this.champion.brain;
        return this.best.brain;
    }

    /**
     * Validation complète en une fois (outil de pré-entraînement sous Node) : rejoue les candidats sur
     * `fights` combats de test et retourne le meilleur { brain, winRate, fitness }.
     */
    validate(candidates, fights = 30, seedBase = 900000) {
        let best = null;
        for (const c of candidates) {
            const results = [];
            for (let k = 0; k < fights; k++) results.push(this.makeFight(c.brain, seedBase + k).run());
            const sc = Training.score(results);
            const entry = { brain: c.brain, winRate: sc.winRate, fitness: sc.fitness };
            if (Training.better(entry, best)) best = entry;
        }
        return best;
    }

    /** Avancement de la génération en cours, dans [0, 1] (combats d'entraînement puis combats de test). */
    progress() {
        const perBoss = this.settings.fightsPerBoss;
        const trainFights = this.population.length * perBoss;
        const testFights = Training.VALIDATION_CANDIDATES * Training.VALIDATION_FIGHTS;
        const partial = this.current ? this.current.time / this.current.maxTime : 0;
        if (this.phase === 'validate') {
            const remaining = this.queue.length * Training.VALIDATION_FIGHTS - this.vResults.length - partial;
            return Math.min(1, Math.max(0, 1 - remaining / (trainFights + testFights)));
        }
        const fights = this.index * perBoss + this.results.length + partial;
        return Math.min(1, fights / (trainFights + testFights));
    }

    /** Ce qui se passe en ce moment, en mots simples. */
    status() {
        if (this.phase === 'validate') {
            return "Examen des meilleurs : " + this.vResults.length + " / " + Training.VALIDATION_FIGHTS +
                " combats de test (" + this.queue.length + " candidat" + (this.queue.length > 1 ? "s" : "") + " restant" + (this.queue.length > 1 ? "s" : "") + ")";
        }
        return "Combats d'entraînement : boss " + Math.min(this.index + 1, this.population.length) + " / " + this.population.length;
    }
}

Training.VALIDATION_FIGHTS = 30;      // combats de test par candidat (assez pour limiter la chance)
Training.VALIDATION_CANDIDATES = 2;   // meilleurs de chaque génération examinés
Training.VALIDATION_SEED = 900000;    // graines des combats de test (jamais utilisées pour l'entraînement)
