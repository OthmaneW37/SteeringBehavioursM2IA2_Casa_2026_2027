/**
 * Algorithme génétique : fitness, sélection par tournoi, nouvelle population.
 * Aucune rétropropagation : seuls la sélection et la mutation font évoluer les cerveaux.
 */
const Genetic = {
    TOURNAMENT_SIZE: 5,

    calculateFitness(population, cps) {
        for (let car of population) {
            // Base : Score pur
            car.fitness = car.score;

            // Gradient : Proximité du prochain checkpoint
            // On donne un bonus qui augmente au fur et à mesure qu'on s'approche
            let nextCP = cps[car.checkpointIndex];
            if (nextCP) {
                let cpCenter = p5.Vector.add(nextCP.a, nextCP.b).div(2);
                let d = p5.Vector.dist(car.pos, cpCenter);

                // On ajoute une valeur qui grimpe quand la distance baisse
                // Max bonus de 50 (équivalent à un demi CP franchi)
                let proximityBonus = map(d, 0, 400, 50, 0);
                car.fitness += max(0, proximityBonus);
            }
        }
    },

    // Sélection par tournoi (plus robuste que Roulette Wheel)
    tournamentSelection(population, rng = Math.random) {
        let best = null;
        for (let i = 0; i < Genetic.TOURNAMENT_SIZE; i++) {
            let candidate = population[Math.floor(rng() * population.length)];
            if (best === null || candidate.fitness > best.fitness) {
                best = candidate;
            }
        }
        return best;
    },

    /**
     * Cerveaux de la génération suivante : `size` enfants, chacun copie d'un parent
     * choisi par tournoi puis muté au taux `rate`. La population évaluée n'est pas modifiée.
     */
    nextBrains(population, size, rate, rng = Math.random) {
        const brains = [];
        for (let i = 0; i < size; i++) {
            const parent = Genetic.tournamentSelection(population, rng);
            const child = parent.brain.copy();
            child.mutate(rate);
            brains.push(child);
        }
        return brains;
    }
};
