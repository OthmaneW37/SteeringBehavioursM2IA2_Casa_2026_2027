// Algorithme génétique (repris de Genetic.js de l'exemple 9b) : sélection par tournoi et mutation
// gaussienne des poids. Aucune rétropropagation.
//
// `population` est un tableau de { brain, fitness }. Les `elites` meilleurs passent tels quels à la
// génération suivante (élitisme), les autres sont des copies mutées de parents choisis par tournoi.
const Genetic = {
    TOURNAMENT_SIZE: 5,

    tournamentSelection(population, rng = Math.random) {
        let best = null;
        for (let i = 0; i < Genetic.TOURNAMENT_SIZE; i++) {
            const candidate = population[Math.floor(rng() * population.length)];
            if (best === null || candidate.fitness > best.fitness) best = candidate;
        }
        return best;
    },

    nextBrains(population, size, rate, elites = 0, rng = Math.random, gaussian) {
        const brains = [];
        const ranked = population.slice().sort((a, b) => b.fitness - a.fitness);
        for (let i = 0; i < Math.min(elites, size, ranked.length); i++) brains.push(ranked[i].brain.copy());
        while (brains.length < size) {
            const child = Genetic.tournamentSelection(population, rng).brain.copy();
            child.mutate(rate, rng, gaussian);
            brains.push(child);
        }
        return brains;
    }
};
