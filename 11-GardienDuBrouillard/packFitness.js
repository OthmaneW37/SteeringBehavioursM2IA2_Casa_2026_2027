// Note COLLECTIVE de la meute (fonction pure) : une seule note pour toute la meute, puisque tous les Creux
// partagent le même cerveau. Moyenne sur ses combats de
//   dégâts infligés au chevalier (en % de sa vie)
// − pertes (part de la meute tuée)
// + bonus si la meute gagne
// + bonus d'encerclement : part du combat où le chevalier est encerclé (voir PackFight)
// − pénalité par morsure dans le vide.
// Le bonus d'encerclement est plafonné (au plus `surround` points, moins que la victoire) : tourner autour
// du chevalier sans jamais mordre ne rapporte pas plus que de gagner (pas de triche sur la récompense).
const PackFitness = {
    WEIGHTS: { dealt: 100, lost: 60, win: 100, surround: 60, whiff: 1 },

    ofFight(r, w = PackFitness.WEIGHTS) {
        return w.dealt * r.damageToPlayer / r.playerMaxHp
            - w.lost * r.killed / r.packSize
            + (r.winner === 'pack' ? w.win : 0)
            + w.surround * r.surrounded
            - w.whiff * r.biteWhiffs;
    },

    compute(results, w = PackFitness.WEIGHTS) {
        if (!results || results.length === 0) throw new RangeError("Aucun combat à évaluer.");
        let sum = 0;
        for (const r of results) sum += PackFitness.ofFight(r, w);
        return sum / results.length;
    }
};
