// Cerveau du boss : un NeuralNetwork (repris de l'exemple 9b) de 16 entrées, 16 neurones cachés
// sigmoïdes et 6 sorties sigmoïdes, plus sa traduction en décision pour Boss.control().
//
// Entrées, toutes dans [0, 1] :
//   0 distance au joueur / diagonale de l'arène
//   1 angle du joueur par rapport au cap du boss (0 = derrière à gauche, 0,5 = droit devant, 1 = derrière à droite)
//   2 vitesse du joueur / vitesse de roulade
//   3 endurance du joueur / endurance maximale
//   4 attente avant le prochain coup de hallebarde / attente de base
//   5 vie du boss / vie maximale
//   6 rayon à −45° du cap vers le premier obstacle, mur ou pilier (1 = collé, 0 = rien à moins de RAY_SIGHT)
//   7 rayon à +45° du cap
//   8 vie du joueur / vie maximale
//   9 joueur vulnérable (1 s'il boit une fiole ou récupère après une attaque, sinon 0)
//  10 attente avant la prochaine ruée / attente de base
//  11 attente avant le prochain souffle / attente de base
//  12 le joueur attaque (1 pendant la préparation et la frappe de son coup) : le moment d'esquiver
//  13 attente avant la prochaine esquive / attente de base
//  14 un pilier coupe la ligne de vue entre le boss et le joueur (1) : le joueur est à l'abri
//  15 danger du coin : temps passé dans un coin / limite de l'anti-camping (1 = le brouillard va le dévorer)
//
// Sorties :
//   0 déplacement : > 0,5 approche (`arrive` à distance d'attaque), < 0,5 recul (`flee`) ;
//     l'écart à 0,5 donne la vitesse ; une petite zone morte autour de 0,5 = rester sur place
//   1 hallebarde : au-dessus de 0,6 (strict), si son attente est finie → coup télégraphié
//   2 esquive    : au-dessus de 0,6 (strict), si le joueur attaque → `evade`
//   3 ruée       : au-dessus de 0,6 (strict), si son attente est finie → charge vers la position prédite
//   4 souffle    : au-dessus de 0,6 (strict), si son attente est finie → nappe de brume
//   5 latéral    : > 0,5 tourne autour du joueur dans un sens, < 0,5 dans l'autre (`orbit`) ; l'écart à 0,5
//     donne la vitesse ; près de 0,5, le boss rôde lentement (il ne reste jamais planté)
// Si plusieurs techniques dépassent le seuil, la plus forte sortie passe en premier (si elle est prête).
//
// Les cerveaux des versions précédentes (12-16-5 avant les piliers, 15-16-6 avant l'anti-camping) sont
// convertis par migrate() : poids nuls pour les nouvelles entrées, sortie latérale neutre si elle manquait.
// Ils jouent comme avant (en rôdant au lieu de rester plantés) ; l'évolution apprend ensuite le reste.
const BossBrain = {
    SIZES: [16, 16, 6],
    OLD_SIZES: [[12, 16, 5], [15, 16, 6]],   // architectures des versions précédentes, convertibles
    THRESHOLD: 0.6,
    DEADZONE: 0.06,
    RAY_SIGHT: 200,
    RAY_ANGLE: Math.PI / 4,
    INPUT_LABELS: ["Distance", "Angle", "Vit. joueur", "Endur. joueur", "Att. hallebarde", "Vie boss",
        "Obstacle gauche", "Obstacle droit", "Vie joueur", "Joueur vulnér.", "Att. ruée", "Att. souffle",
        "Joueur attaque", "Att. esquive", "Abri (pilier)", "Danger coin"],
    OUTPUT_LABELS: ["Déplacement", "Hallebarde", "Esquive", "Ruée", "Souffle", "Latéral"],
    TECHNIQUES: [['attack', 1], ['charge', 3], ['breath', 4]],

    create(rng) {
        return new NeuralNetwork(BossBrain.SIZES, rng);
    },

    /** Ce cerveau est-il d'une version précédente, convertible ? */
    isOld(nn) {
        return BossBrain.OLD_SIZES.some(s => s.join(',') === nn.sizes.join(','));
    },

    /**
     * Cerveau d'une version précédente → architecture actuelle. Les poids existants sont gardés ; les
     * nouvelles entrées ont des poids nuls (le cerveau les ignore d'abord, l'évolution apprendra à s'en
     * servir) ; une sortie latérale absente a des poids et un biais nuls : elle vaut 0,5, le boss rôde.
     */
    migrate(old) {
        if (!BossBrain.isOld(old)) throw new RangeError("Seuls les cerveaux " + BossBrain.OLD_SIZES.map(s => "[" + s.join(', ') + "]").join(" ou ") + " peuvent être convertis.");
        const [oIn, hid, oOut] = old.sizes;
        const [nIn] = BossBrain.SIZES;
        const nn = new NeuralNetwork(BossBrain.SIZES, () => 0.5);   // poids nuls ((0,5 × 2 − 1) × limite)
        for (let j = 0; j < hid; j++) {
            for (let i = 0; i < oIn; i++) nn.weights[0][j * nIn + i] = old.weights[0][j * oIn + i];
            nn.biases[0][j] = old.biases[0][j];
        }
        for (let k = 0; k < oOut; k++) {
            for (let j = 0; j < hid; j++) nn.weights[1][k * hid + j] = old.weights[1][k * hid + j];
            nn.biases[1][k] = old.biases[1][k];
        }
        return nn;
    },

    clamp01(v) {
        return Math.max(0, Math.min(1, v));
    },

    inputs(boss, player, arena) {
        const B = Combat.BOSS;
        const dx = player.pos.x - boss.pos.x, dy = player.pos.y - boss.pos.y;
        const angle = Combat.angleDiff(Math.atan2(dy, dx), boss.facing);
        const ray = a => 1 - arena.rayDistance(boss.pos, boss.facing + a, BossBrain.RAY_SIGHT, boss.pillars) / BossBrain.RAY_SIGHT;
        const c = BossBrain.clamp01;
        return [
            c(Math.hypot(dx, dy) / arena.diagonal()),
            c((angle + Math.PI) / (2 * Math.PI)),
            c(player.vel.mag() / Combat.PLAYER.roll.maxSpeed),
            c(player.stamina / player.maxStamina),
            c(boss.cooldown / B.cooldown),
            c(boss.hp / boss.maxHp),
            c(ray(-BossBrain.RAY_ANGLE)),
            c(ray(BossBrain.RAY_ANGLE)),
            c(player.hp / player.maxHp),
            player.vulnerable ? 1 : 0,
            c(boss.chargeCooldown / B.charge.cooldown),
            c(boss.breathCooldown / B.breath.cooldown),
            player.isAttacking() ? 1 : 0,
            c(boss.dodgeCooldown / B.dodge.cooldown),
            Combat.blocker(boss.pos, player.pos, boss.pillars) ? 1 : 0,
            c(boss.campTime / B.camping.limit)
        ];
    },

    /** Sorties du réseau → décision. */
    decide(outputs) {
        const m = outputs[0] - 0.5;
        let mode = 'hold';
        if (m > BossBrain.DEADZONE) mode = 'approach';
        else if (m < -BossBrain.DEADZONE) mode = 'retreat';
        const order = BossBrain.TECHNIQUES.slice().sort((a, b) => outputs[b[1]] - outputs[a[1]]).map(t => t[0]);
        return {
            mode: mode,
            speed: Math.min(1, Math.abs(m) * 2),
            strafe: (outputs[5] - 0.5) * 2,
            attack: outputs[1] > BossBrain.THRESHOLD,
            dodge: outputs[2] > BossBrain.THRESHOLD,
            charge: outputs[3] > BossBrain.THRESHOLD,
            breath: outputs[4] > BossBrain.THRESHOLD,
            order: order
        };
    }
};

/** Contrôleur du boss appris : entrées → réseau → décision. Garde les dernières valeurs pour le debug. */
class NeuralBossController {
    constructor(brain) {
        this.brain = brain;
        this.name = "Boss appris";
        this.lastInputs = null;
        this.lastOutputs = null;
    }

    decide(boss, player, arena) {
        this.lastInputs = BossBrain.inputs(boss, player, arena);
        this.lastOutputs = this.brain.predict(this.lastInputs);
        return BossBrain.decide(this.lastOutputs);
    }
}
