function nextGeneration() {
    // 1. D'abord on calcule les fitness
    calculateFitness();

    // Critère d'arrêt : Est-ce qu'on a assez de vainqueurs ?
    let finishedCount = savedCars.filter(c => c.finished).length;
    let successRate = finishedCount / TOTAL_POP;
    console.log(`Génération ${generation} terminée. Succès : ${finishedCount}/${TOTAL_POP} (${(successRate * 100).toFixed(1)}%)`);

    if (successRate >= 0.6) {
        console.log("OBJECTIF ATTEINT ! 60% des voitures ont fini le circuit.");
        trainingFinished = true;
        // Petit message visuel
        setTimeout(() => alert(`ENTRAÎNEMENT TERMINÉ !\nPlus de 60% de réussite à la Génération ${generation}`), 100);
    }

    // 2. On crée la nouvelle population AVANT de détruire l'ancienne
    cars = [];
    for (let i = 0; i < TOTAL_POP; i++) {
        // Sélection par tournoi (plus robuste que Roulette Wheel)
        let parent = tournamentSelection(savedCars);

        let child = new Car(parent.brain);
        // On ne mute plus si l'entraînement est fini
        if (!trainingFinished) {
            child.mutate(MUTATION_RATE);
        }
        cars[i] = child;
    }

    // 3. MAINTENANT on peut détruire les anciens cerveaux pour libérer la mémoire
    for (let i = 0; i < TOTAL_POP; i++) {
        savedCars[i].dispose();
    }

    savedCars = [];
}

function calculateFitness() {
    for (let car of savedCars) {
        // Base : Score pur
        car.fitness = car.score;

        // Gradient : Proximité du prochain checkpoint
        // On donne un bonus qui augmente au fur et à mesure qu'on s'approche
        let nextCP = checkpoints[car.checkpointIndex];
        if (nextCP) {
            let cpCenter = p5.Vector.add(nextCP.a, nextCP.b).div(2);
            let d = p5.Vector.dist(car.pos, cpCenter);

            // On ajoute une valeur qui grimpe quand la distance baisse
            // Max bonus de 50 (équivalent à un demi CP franchi)
            let proximityBonus = map(d, 0, 400, 50, 0);
            car.fitness += max(0, proximityBonus);
        }
    }
}

function tournamentSelection(population) {
    const TOURNAMENT_SIZE = 5;
    let best = null;

    for (let i = 0; i < TOURNAMENT_SIZE; i++) {
        let ind = Math.floor(random(population.length));
        let candidate = population[ind];

        if (best === null || candidate.fitness > best.fitness) {
            best = candidate;
        }
    }
    return best;
}
