// Cerveau de la meute : UN réseau de neurones (NeuralNetwork, repris de l'exemple 9b) PARTAGÉ par tous
// les Creux. Chaque Creux l'interroge avec SES perceptions locales et reçoit SA décision : la même règle,
// des situations différentes. Le réseau ne calcule aucune force : il choisit les poids des comportements
// de pilotage (pursue, flanc, evade, flocking) et la morsure. Les forces sont calculées par Creux.control().
//
// Entrées, toutes dans [0, 1] :
//   0 distance au chevalier / diagonale de l'arène
//   1 le chevalier me fait face (1 = il me regarde, 0 = il me tourne le dos)
//   2 le chevalier attaque (préparation ou frappe)
//   3 le chevalier est vulnérable (il boit, ou récupère après une attaque)
//   4 endurance du chevalier
//   5 vie du chevalier
//   6 ma vie
//   7 attente avant ma prochaine morsure / attente de base
//   8 nombre de voisins perçus / 4 (borné à 1)
//   9 écart d'angle, autour du chevalier, avec le voisin perçu le plus proche / π (1 = seul de mon côté)
//  10 obstacle devant moi (1 = collé, 0 = rien à moins de RAY_SIGHT)
//  11 le chevalier roule (invulnérable)
//
// Sorties (sigmoïdes) : 0 pursue, 1 flanc, 2 evade, 3 flocking (poids dans [0, 1]) ; 4 morsure (> 0,6).
const PackBrain = {
    SIZES: [12, 12, 5],
    THRESHOLD: 0.6,
    RAY_SIGHT: 80,
    INPUT_LABELS: ["Distance", "Il me regarde", "Il attaque", "Il est vulnér.", "Son endurance", "Sa vie",
        "Ma vie", "Att. morsure", "Voisins", "Écart d'angle", "Obstacle", "Il roule"],
    OUTPUT_LABELS: ["Pursue", "Flanc", "Evade", "Flocking", "Morsure"],

    create(rng) {
        return new NeuralNetwork(PackBrain.SIZES, rng);
    },

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    },

    /** Écart d'angle (radians, dans [0, π]) autour de `center` entre l'agent et le voisin le plus proche en angle. */
    angularGap(agent, center, near) {
        const mine = Math.atan2(agent.pos.y - center.y, agent.pos.x - center.x);
        let best = Math.PI;
        for (const o of near) {
            const d = Math.abs(Combat.angleDiff(Math.atan2(o.pos.y - center.y, o.pos.x - center.x), mine));
            if (d < best) best = d;
        }
        return best;
    },

    /** Perceptions locales du Creux (il doit avoir appelé perceive() à ce pas). */
    inputs(creux, player, arena) {
        const c = PackBrain.clamp01;
        const dx = creux.pos.x - player.pos.x, dy = creux.pos.y - player.pos.y;
        const toMe = Math.atan2(dy, dx);
        const ray = arena.rayDistance(creux.pos, creux.facing, PackBrain.RAY_SIGHT, (creux.pillars || []).filter(p => p.alive));
        return [
            c(Math.hypot(dx, dy) / arena.diagonal()),
            c((Math.cos(Combat.angleDiff(toMe, player.facing)) + 1) / 2),
            player.isAttacking() ? 1 : 0,
            player.vulnerable ? 1 : 0,
            c(player.stamina / player.maxStamina),
            c(player.hp / player.maxHp),
            c(creux.hp / creux.maxHp),
            c(creux.biteCooldown / Creux.BITE_COOLDOWN),
            c(creux.near.length / 4),
            c(PackBrain.angularGap(creux, player.pos, creux.near) / Math.PI),
            c(1 - ray / PackBrain.RAY_SIGHT),
            player.invulnerable ? 1 : 0
        ];
    },

    /** Sorties du réseau → décision. */
    decide(outputs) {
        return {
            pursue: outputs[0], flank: outputs[1], evade: outputs[2], flock: outputs[3],
            bite: outputs[4] > PackBrain.THRESHOLD
        };
    }
};

/** Contrôleur de la meute apprise : le même réseau pour chaque Creux. Garde les dernières valeurs (debug). */
class NeuralPackController {
    constructor(brain) {
        this.brain = brain;
        this.name = "Meute apprise";
        this.lastInputs = null;
        this.lastOutputs = null;
        this.memory = new WeakMap();   // dernières entrées et sorties de chaque Creux (debug, sans recalcul)
    }

    decide(creux, player, arena) {
        this.lastInputs = PackBrain.inputs(creux, player, arena);
        this.lastOutputs = this.brain.predict(this.lastInputs);
        // Copie des activations de chaque couche : le schéma du réseau montre CE Creux (le réseau est partagé)
        this.memory.set(creux, { inputs: this.lastInputs, outputs: this.lastOutputs, layers: this.brain.activations.map(x => Float32Array.from(x)) });
        return PackBrain.decide(this.lastOutputs);
    }
}
