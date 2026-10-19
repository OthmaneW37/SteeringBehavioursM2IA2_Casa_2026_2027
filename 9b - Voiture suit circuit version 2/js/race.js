/**
 * Mode Course : des cerveaux déjà entraînés courent ensemble sur une liste de circuits.
 * Rien n'est entraîné : aucune sélection, aucune mutation (chaque voiture copie son cerveau).
 *
 * options :
 *   entrants   [{ label, brain (NeuralNetwork), typeId }]
 *   circuits   identifiants des circuits à enchaîner
 *   laps       tours à faire sur chaque circuit
 *   buildWorld(circuitId) → monde (murs, checkpoints, départ)
 *   timeLimitPerLap  secondes simulées accordées par tour avant d'arrêter le circuit
 *
 * Classement en direct : arrivées d'abord (temps total croissant), puis progression
 * (checkpoints franchis), voitures encore en course avant les abandons.
 * Points par circuit : 10, 8, 6, 5, 4, 3, 2, 1 (arrivées uniquement).
 */
class Race {
    constructor(options) {
        if (!options.entrants || options.entrants.length === 0) throw new RangeError("Aucune voiture inscrite.");
        if (!options.circuits || options.circuits.length === 0) throw new RangeError("Aucun circuit choisi.");
        this.entrants = options.entrants;
        this.circuits = options.circuits.slice();
        this.laps = options.laps;
        this.buildWorld = options.buildWorld;
        this.timeLimit = (options.timeLimitPerLap || 90) * this.laps;
        this.circuitIndex = 0;
        this.results = [];      // un tableau de classement par circuit terminé
        this.state = 'running';
        this.startCircuit();
    }

    startCircuit() {
        this.world = this.buildWorld(this.circuits[this.circuitIndex]);
        this.time = 0;
        this.cars = this.entrants.map((e, i) => {
            const car = new Car(e.brain, {
                type: CarTypes.get(e.typeId), start: this.world.start, lapsToFinish: this.laps
            });
            car.entrantIndex = i;
            return car;
        });
    }

    currentCircuitId() {
        return this.circuits[this.circuitIndex];
    }

    step() {
        if (this.state !== 'running') return;
        const world = this.world;
        this.time += Car.STEP_SECONDS;
        let running = 0;
        for (const car of this.cars) {
            if (car.dead) continue;
            car.think(world.walls);
            car.update();
            car.checkCheckpoints(world.checkpoints);
            car.checkWalls(world.walls, world.width, world.height);
            if (!car.dead) running++;
        }
        if (running === 0 || this.time >= this.timeLimit) this.finishCircuit();
    }

    /** Ligne de classement d'une voiture (temps en secondes simulées). */
    row(car) {
        const e = this.entrants[car.entrantIndex];
        const times = car.lapFrames.map((f, i) => (f - (i ? car.lapFrames[i - 1] : 0)) * Car.STEP_SECONDS);
        let status = 'En course';
        if (car.finished) status = 'Arrivée';
        else if (car.dead) status = 'Abandon';
        else if (this.state !== 'running' || this.time >= this.timeLimit) status = 'Temps écoulé';
        return {
            entrantIndex: car.entrantIndex, label: e.label, typeId: e.typeId,
            laps: car.laps, progress: car.checkpointsPassed, lapTimes: times,
            bestLap: times.length ? Math.min(...times) : null,
            totalTime: car.finished ? car.lapFrames[car.lapFrames.length - 1] * Car.STEP_SECONDS : null,
            status: status, alive: !car.dead
        };
    }

    standings() {
        const rows = this.cars.map(c => this.row(c));
        rows.sort((a, b) => {
            const fa = a.totalTime !== null, fb = b.totalTime !== null;
            if (fa !== fb) return fa ? -1 : 1;
            if (fa) return a.totalTime - b.totalTime;
            if (a.progress !== b.progress) return b.progress - a.progress;
            return (b.alive ? 1 : 0) - (a.alive ? 1 : 0);
        });
        rows.forEach((r, i) => r.position = i + 1);
        return rows;
    }

    finishCircuit() {
        const points = [10, 8, 6, 5, 4, 3, 2, 1];
        const rows = this.standings();
        for (const r of rows) {
            r.points = r.totalTime !== null ? (points[r.position - 1] || 0) : 0;
        }
        this.results.push({ circuitId: this.currentCircuitId(), rows: rows });
        this.circuitIndex++;
        if (this.circuitIndex >= this.circuits.length) {
            this.state = 'finished';
        } else {
            this.startCircuit();
        }
    }

    /** Classement général : somme des points, puis nombre d'arrivées. */
    overall() {
        const table = this.entrants.map((e, i) => ({ entrantIndex: i, label: e.label, typeId: e.typeId, points: 0, finishes: 0 }));
        for (const res of this.results) {
            for (const r of res.rows) {
                table[r.entrantIndex].points += r.points;
                if (r.totalTime !== null) table[r.entrantIndex].finishes++;
            }
        }
        table.sort((a, b) => b.points - a.points || b.finishes - a.finishes);
        table.forEach((r, i) => r.position = i + 1);
        return table;
    }

    leader() {
        const rows = this.standings();
        const first = rows.find(r => r.alive) || rows[0];
        return this.cars.find(c => c.entrantIndex === first.entrantIndex);
    }
}
