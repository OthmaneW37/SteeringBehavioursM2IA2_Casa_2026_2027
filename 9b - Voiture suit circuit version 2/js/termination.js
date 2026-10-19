/**
 * Fonction de terminaison de l'entraînement : fonction pure, sans p5 ni DOM.
 *
 * state (mesuré par l'entraîneur) :
 *   generation                    générations terminées
 *   lapsOnAllCircuits             plus petit nombre de tours réussis (meilleure voiture) parmi
 *                                 les circuits de la liste ; 0 si un circuit n'a jamais été bouclé
 *   generationsWithoutImprovement générations consécutives sans dépasser le meilleur score
 *   elapsedSeconds                temps d'entraînement écoulé, en secondes (pauses exclues)
 *   successRate                   part de la dernière génération qui a terminé ses tours (0..1)
 *
 * settings : { maxGenerations, targetLaps, stagnation, maxTime, successRate },
 *            chacun { enabled: booléen, value: seuil }.
 *
 * Tous les seuils sont inclusifs (valeur égale au seuil ⇒ arrêt).
 * Retourne { stop, code, reason } ; la première condition remplie dans l'ordre
 * ci-dessous donne la raison affichée.
 */
function shouldStop(state, settings) {
    const on = key => settings && settings[key] && settings[key].enabled === true;
    const value = key => settings[key].value;

    if (on('targetLaps') && state.lapsOnAllCircuits >= value('targetLaps')) {
        return { stop: true, code: 'targetLaps', reason: "Objectif atteint : " + value('targetLaps') + " tour(s) réussi(s) sur chaque circuit." };
    }
    if (on('successRate') && state.successRate >= value('successRate')) {
        return { stop: true, code: 'successRate', reason: "Objectif atteint : " + Math.round(state.successRate * 100) + " % de la population a terminé (seuil " + Math.round(value('successRate') * 100) + " %)." };
    }
    if (on('maxGenerations') && state.generation >= value('maxGenerations')) {
        return { stop: true, code: 'maxGenerations', reason: "Nombre maximal de générations atteint (" + value('maxGenerations') + ")." };
    }
    if (on('stagnation') && state.generationsWithoutImprovement >= value('stagnation')) {
        return { stop: true, code: 'stagnation', reason: "Stagnation : aucun progrès du meilleur score depuis " + value('stagnation') + " générations." };
    }
    if (on('maxTime') && state.elapsedSeconds >= value('maxTime')) {
        return { stop: true, code: 'maxTime', reason: "Temps d'entraînement maximal atteint (" + value('maxTime') + " s)." };
    }
    return { stop: false, code: null, reason: null };
}

/**
 * Suivi du meilleur score pour la stagnation (pur) : retourne le nouvel état.
 * Une amélioration doit dépasser strictement l'ancien record.
 */
function updateBestScore(progress, generationBest) {
    if (generationBest > progress.bestScore) {
        return { bestScore: generationBest, generationsWithoutImprovement: 0 };
    }
    return { bestScore: progress.bestScore, generationsWithoutImprovement: progress.generationsWithoutImprovement + 1 };
}
