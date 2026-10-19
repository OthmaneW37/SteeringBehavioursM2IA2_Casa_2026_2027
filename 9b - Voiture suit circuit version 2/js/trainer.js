/**
 * Mode Entraînement : une population de voitures évolue par algorithme génétique.
 *
 * Le contrôleur (main.js) fournit :
 *   buildWorld(circuitId) → { walls, checkpoints, width, height, start }
 *   onEvent(type, message) (facultatif) : 'circuit', 'stop' → messages de l'interface
 *
 * À chaque fin de génération :
 *   1. fitness, statistiques (meilleur, moyenne, voitures qui ont fini, tours) ;
 *   2. curriculum : passage au circuit suivant si au moins un tour complet ;
 *   3. fonction de terminaison shouldStop ;
 *   4. nouvelle population (sélection + mutation), ou population figée après l'arrêt.
 */
class Trainer {
    constructor(settings, deps, seedBrain = null) {
        this.deps = deps;
        this.settings = settings;
        this.sizes = Settings.networkSizes(settings);
        this.curriculum = new CircuitCurriculum(settings.circuits);
        this.world = deps.buildWorld(this.curriculum.current());

        this.cars = [];
        this.saved = [];
        this.leader = null;
        this.generation = 0;
        this.progress = { bestScore: -Infinity, generationsWithoutImprovement: 0 };
        this.elapsedSeconds = 0;
        this.stopped = false;
        this.stopReason = null;
        this.frozenBrains = null;
        this.bestBrain = null;       // meilleur cerveau rencontré (copie)
        this.bestBrainScore = -Infinity;
        this.lastStats = { best: 0, mean: 0, finished: 0, successRate: 0, maxLaps: 0, totalLaps: 0 };

        this.spawn(this.seedBrains(seedBrain));
    }

    /** Population initiale : aléatoire, ou issue d'un cerveau sauvegardé (le 1er intact). */
    seedBrains(seedBrain) {
        const n = this.settings.populationSize;
        const brains = [];
        for (let i = 0; i < n; i++) {
            if (!seedBrain) {
                brains.push(null);
            } else {
                const b = seedBrain.copy();
                if (i > 0) b.mutate(this.settings.mutationRate);
                brains.push(b);
            }
        }
        return brains;
    }

    spawn(brains) {
        this.cars = brains.map((brain, i) => new Car(brain, {
            type: CarTypes.forIndex(this.settings.carTypes, i),
            sizes: this.sizes,
            start: this.world.start,
            lapsToFinish: this.settings.lapsPerRun
        }));
        this.saved = [];
        this.leader = null;
    }

    allBrains() {
        return this.cars.concat(this.saved).map(c => c.brain);
    }

    /** Réglages modifiables sans relancer (population, mutation, terminaison, types, tours). */
    updateSettings(settings) {
        this.settings = settings;
    }

    /** Une étape de simulation (1/60 s simulée). */
    step() {
        const world = this.world;
        let maxScore = -1;
        let bestDist = Infinity;
        this.leader = null;

        for (let i = this.cars.length - 1; i >= 0; i--) {
            const car = this.cars[i];
            car.think(world.walls);
            car.update();
            car.checkCheckpoints(world.checkpoints);
            car.checkWalls(world.walls, world.width, world.height);

            if (car.dead) {
                this.saved.push(this.cars.splice(i, 1)[0]);
            } else {
                // Leader : meilleur score, puis le plus proche du prochain checkpoint
                let distToNext = Infinity;
                if (world.checkpoints.length > 0) {
                    const goal = world.checkpoints[car.checkpointIndex % world.checkpoints.length];
                    distToNext = Math.hypot(car.pos.x - (goal.a.x + goal.b.x) / 2, car.pos.y - (goal.a.y + goal.b.y) / 2);
                }
                if (car.score > maxScore || (car.score === maxScore && distToNext < bestDist)) {
                    maxScore = car.score;
                    bestDist = distToNext;
                    this.leader = car;
                }
            }
        }

        if (this.cars.length === 0) this.endGeneration();
    }

    /** Temps réel écoulé (secondes) : seule la condition de durée en dépend en cours de génération. */
    tick(dtSeconds) {
        if (this.stopped) return;
        this.elapsedSeconds += dtSeconds;
        this.checkStop();
    }

    stopState() {
        return {
            generation: this.generation,
            lapsOnAllCircuits: this.curriculum.lapsOnAllCircuits(),
            generationsWithoutImprovement: this.progress.generationsWithoutImprovement,
            elapsedSeconds: this.elapsedSeconds,
            successRate: this.lastStats.successRate
        };
    }

    checkStop() {
        if (this.stopped) return;
        const verdict = shouldStop(this.stopState(), this.settings.termination);
        if (verdict.stop) {
            this.stopped = true;
            this.stopReason = verdict.reason;
            this.emit('stop', verdict.reason);
        }
    }

    endGeneration() {
        const pop = this.saved;
        Genetic.calculateFitness(pop, this.world.checkpoints);

        let best = -Infinity, sum = 0, finished = 0, maxLaps = 0, totalLaps = 0, bestCar = null;
        for (const car of pop) {
            sum += car.fitness;
            if (car.fitness > best) { best = car.fitness; bestCar = car; }
            if (car.finished) finished++;
            if (car.laps > maxLaps) maxLaps = car.laps;
            totalLaps += car.laps;
        }
        this.lastStats = {
            best: best, mean: pop.length ? sum / pop.length : 0, finished: finished,
            successRate: pop.length ? finished / pop.length : 0, maxLaps: maxLaps, totalLaps: totalLaps
        };
        if (bestCar && best > this.bestBrainScore) {
            this.bestBrainScore = best;
            this.bestBrain = bestCar.brain.copy();
        }
        this.progress = updateBestScore(this.progress, best);
        this.generation++;

        let brains;
        if (this.stopped) {
            // Population figée : on rejoue les mêmes cerveaux, sans sélection ni mutation
            if (!this.frozenBrains) this.frozenBrains = pop.map(c => c.brain.copy());
            brains = this.frozenBrains;
        } else {
            if (this.curriculum.afterGeneration(maxLaps)) {
                this.world = this.deps.buildWorld(this.curriculum.current());
                this.emit('circuit', "Tour complet réussi : passage au circuit « " +
                    Circuits.get(this.curriculum.current()).name + " ».");
            }
            this.checkStop();
            if (this.stopped) {
                this.frozenBrains = pop.map(c => c.brain.copy());
                brains = this.frozenBrains;
            } else {
                brains = Genetic.nextBrains(pop, this.settings.populationSize, this.settings.mutationRate);
            }
        }

        for (const car of pop) car.dispose();
        this.spawn(brains);
    }

    /** Reprend l'entraînement après un arrêt (compteurs d'arrêt remis à zéro). */
    resume() {
        this.stopped = false;
        this.stopReason = null;
        this.frozenBrains = null;
        this.elapsedSeconds = 0;
        this.progress.generationsWithoutImprovement = 0;
        this.lastStats.successRate = 0;
    }

    /** Le circuit a été reconstruit (redimensionnement, curseurs) : on relance la génération en cours. */
    restartGeneration(world) {
        this.world = world || this.deps.buildWorld(this.curriculum.current());
        const brains = this.allBrains();
        this.spawn(brains);
    }

    /** Nouvelle liste de circuits : même population, nouveau curriculum. */
    setCircuits(ids) {
        this.settings = Object.assign({}, this.settings, { circuits: ids.slice() });
        this.curriculum = new CircuitCurriculum(ids);
        this.restartGeneration(this.deps.buildWorld(this.curriculum.current()));
    }

    emit(type, message) {
        if (this.deps.onEvent) this.deps.onEvent(type, message);
    }
}
