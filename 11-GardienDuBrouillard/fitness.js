// Fitness d'un boss (fonction pure) : moyenne sur ses combats de
//   dégâts infligés au joueur (en % de sa vie)
// − dégâts reçus (en % de la vie du boss)
// + bonus si le boss gagne
// − pénalité par attaque dans le vide (elle évite qu'il frappe sans viser).
// Les deux dégâts sont rapportés à 100 pour peser autant, malgré des vies maximales différentes.
const Fitness = {
    WEIGHTS: { dealt: 100, received: 100, win: 100, whiff: 4 },

    ofFight(r, w = Fitness.WEIGHTS) {
        return w.dealt * r.damageToPlayer / r.playerMaxHp
            - w.received * r.damageToBoss / r.bossMaxHp
            + (r.winner === 'boss' ? w.win : 0)
            - w.whiff * r.bossWhiffs;
    },

    compute(results, w = Fitness.WEIGHTS) {
        if (!results || results.length === 0) throw new RangeError("Aucun combat à évaluer.");
        let sum = 0;
        for (const r of results) sum += Fitness.ofFight(r, w);
        return sum / results.length;
    }
};

// Générateur pseudo-aléatoire reproductible (congruentiel linéaire), partagé par les modules.
function seededRandom(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
