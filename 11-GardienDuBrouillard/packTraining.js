// Neuroévolution de la meute : chaque individu de la population est UN cerveau partagé par toute une meute.
// Chaque meute affronte le joueur robot pendant `packFights` combats et reçoit sa note collective
// (PackFitness), puis tournoi + mutation (Genetic, repris de l'exemple 9b).
//
// Comme pour le boss (training.js) : travail découpé (work(budget) avance d'au plus `budget` pas), mêmes
// combats pour toute une génération (graines communes), graines qui changent d'une génération à l'autre,
// et CHAMPION VALIDÉ : après chaque génération, les VALIDATION_CANDIDATES meilleurs rejouent
// VALIDATION_FIGHTS combats de test (graines fixes, jamais utilisées pour l'entraînement) ; le champion
// n'est remplacé que par une meute qui gagne plus souvent sur ces combats (puis, à égalité, mieux notée).
//
// settings : Settings (joueur robot, fioles, piliers, durée) + PackSettings (meute, population, mutation).
class PackTraining {
    constructor(settings, options = {}) {
        this.settings = Object.assign({}, settings);
        this.seed = options.seed || 1;
        this.rng = seededRandom(this.seed);
        this.arena = options.arena || new Arena();
        const initial = options.initialBrains || [];
        this.population = [];
        for (let i = 0; i < this.settings.packPopulation; i++) {
            this.population.push(initial[i] ? initial[i].copy() : PackBrain.create(this.rng));
        }
        this.generation = 0;
        this.index = 0;
        this.results = [];
        this.fitnesses = [];
        this.genResults = [];
        this.current = null;
        this.history = [];          // { generation, best, mean, winRate, surrounded, championWinRate }
        this.champion = null;       // { brain, winRate, fitness, surrounded, generation }
        this.phase = 'train';
        this.queue = [];
        this.vResults = [];
        this.totalSteps = 0;
    }

    static makeFight(controller, seed, s, arena) {
        return new PackFight({
            arena: arena,
            playerController: new PackPlayerController(seededRandom(seed), {
                dodgeProbability: s.dodgeProbability, attackInterval: s.attackInterval
            }),
            packController: controller,
            size: s.packSize,
            perception: s.packPerception,
            maxTime: s.maxFightTime,
            estus: s.estusCharges,
            pillars: s.pillarCount,
            seed: seed
        });
    }

    /** Résumé d'une série de combats : victoires, dégâts, pertes, encerclement. */
    static summary(results) {
        const n = results.length;
        const mean = f => results.reduce((s, r) => s + f(r), 0) / n;
        return {
            fights: n,
            winRate: mean(r => (r.winner === 'pack' ? 1 : 0)),
            dealt: mean(r => r.damageToPlayer),
            killed: mean(r => r.killed / r.packSize),
            surrounded: mean(r => r.surrounded),
            coverage: mean(r => r.coverage),
            duration: mean(r => r.duration),
            fitness: PackFitness.compute(results)
        };
    }

    fightSeed(k) {
        return this.seed * 100003 + this.generation * 101 + k + 1;
    }

    work(budget) {
        let done = 0;
        while (done < budget) {
            if (!this.current) {
                const brain = this.phase === 'validate' ? this.queue[0].brain : this.population[this.index];
                const seed = this.phase === 'validate' ? PackTraining.VALIDATION_SEED + this.vResults.length : this.fightSeed(this.results.length);
                this.current = PackTraining.makeFight(new NeuralPackController(brain), seed, this.settings, this.arena);
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
                if (this.vResults.length >= PackTraining.VALIDATION_FIGHTS) this.finishCandidate();
            } else {
                this.results.push(f.result);
                this.genResults.push(f.result);
                if (this.results.length >= this.settings.packFights) this.finishBrain();
            }
        }
        this.totalSteps += done;
        return done;
    }

    finishBrain() {
        this.fitnesses[this.index] = PackFitness.compute(this.results);
        this.results = [];
        this.index++;
        if (this.index >= this.population.length) this.endGeneration();
    }

    endGeneration() {
        const scored = this.population.map((brain, i) => ({ brain: brain, fitness: this.fitnesses[i] }));
        const ranked = scored.slice().sort((a, b) => b.fitness - a.fitness);
        const sum = PackTraining.summary(this.genResults);
        this.history.push({
            generation: this.generation,
            best: ranked[0].fitness,
            mean: scored.reduce((s, e) => s + e.fitness, 0) / scored.length,
            winRate: sum.winRate,
            surrounded: sum.surrounded,
            championWinRate: this.champion ? this.champion.winRate : 0
        });
        this.queue = ranked.slice(0, PackTraining.VALIDATION_CANDIDATES).map(e => ({ brain: e.brain.copy(), generation: this.generation }));
        this.population = Genetic.nextBrains(scored, this.settings.packPopulation, this.settings.packMutation, PackTraining.ELITES, this.rng);
        this.generation++;
        this.index = 0;
        this.fitnesses = [];
        this.genResults = [];
        this.vResults = [];
        this.phase = 'validate';
    }

    finishCandidate() {
        const c = this.queue.shift();
        const sc = PackTraining.summary(this.vResults);
        this.vResults = [];
        if (Training.better(sc, this.champion)) {
            this.champion = { brain: c.brain, winRate: sc.winRate, fitness: sc.fitness, surrounded: sc.surrounded, generation: c.generation };
        }
        if (this.queue.length === 0) {
            this.phase = 'train';
            this.history[this.history.length - 1].championWinRate = this.champion.winRate;
        }
    }

    bestBrain() {
        return this.champion ? this.champion.brain : null;
    }

    /** Avancement de la génération en cours, dans [0, 1]. */
    progress() {
        const train = this.population.length * this.settings.packFights;
        const test = PackTraining.VALIDATION_CANDIDATES * PackTraining.VALIDATION_FIGHTS;
        if (this.phase === 'validate') {
            const left = this.queue.length * PackTraining.VALIDATION_FIGHTS - this.vResults.length;
            return Math.min(1, Math.max(0, 1 - left / (train + test)));
        }
        return Math.min(1, (this.index * this.settings.packFights + this.results.length) / (train + test));
    }
}

PackTraining.VALIDATION_FIGHTS = 20;
PackTraining.VALIDATION_CANDIDATES = 2;
PackTraining.VALIDATION_SEED = 700000;   // graines des combats de test (jamais utilisées pour l'entraînement)
PackTraining.ELITES = 1;
