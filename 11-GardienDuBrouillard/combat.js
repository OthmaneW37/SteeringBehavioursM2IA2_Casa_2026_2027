// Règles du combat : données et fonctions pures (aucun dessin, aucun accès au DOM).
//
// Le temps est en SECONDES. La simulation avance à pas fixe : DT = 1/60 s, et une mise à jour
// de Vehicle (vehicle.js) correspond à un pas. Les vitesses de Vehicle sont donc en pixels par pas.
//
// Une attaque passe par trois phases mesurées depuis son début :
//   préparation (windup)  : visible, l'adversaire peut réagir — 0,6 s pour le boss (télégraphe) ;
//   frappe (active)       : la seule fenêtre où les dégâts sont appliqués (une fois au plus) ;
//   récupération          : l'attaquant est vulnérable et ne peut rien faire.
//
// Le boss a trois techniques : le coup de hallebarde ('boss'), la ruée ('charge', une charge en ligne
// droite vers la position prédite du joueur) et le souffle du brouillard ('breath', qui pose une nappe
// de brume brûlante). Le joueur a des fioles d'Estus : boire soigne, mais on reste presque immobile.
const Combat = {
    DT: 1 / 60,

    PLAYER: {
        maxHp: 100, maxStamina: 100,
        staminaRegen: 45,      // points par seconde
        regenDelay: 0.5,       // secondes sans régénération après une dépense
        maxSpeed: 3.2, maxForce: 0.4, r: 14,
        roll: { stamina: 22, duration: 0.4, iframes: 0.3, maxSpeed: 3.8, maxForce: 1.0 },
        // Fiole d'Estus : 1 s pour boire, soin appliqué à 0,6 s (on peut être interrompu avant), marche lente
        estus: { charges: 2, duration: 1.0, healAt: 0.6, heal: 25, maxSpeed: 1.2 }
    },

    BOSS: {
        maxHp: 200, maxSpeed: 2.5, maxForce: 0.2, r: 32,
        cooldown: 1.5,                     // secondes entre deux attaques
        turnRate: 3,                       // radians par seconde (le boss pivote vers sa cible)
        windupTurnRate: 1.6,               // il suit encore un peu le joueur pendant la préparation
        keepDistance: 70,                  // distance d'attaque gardée avec `arrive`
        swingMargin: 15,                   // la hallebarde ne se lève que si le joueur est à portée + 15 px
        detectRadius: 350,                 // au-delà : `wander`, sans décision du réseau
        // Esquive (`evade`) quand le joueur attaque ; réussie (pas touché), elle rend la hallebarde prête
        // aussitôt : c'est la riposte. Un coup de hallebarde LEVÉ dans les `riposteWindow` s qui suivent et
        // qui touche est une « riposte qui touche » (c'est elle, et elle seule, que la note récompense)
        dodge: { duration: 0.35, cooldown: 3, maxSpeed: 6, maxForce: 1.2, riposteWindow: 0.5 },
        // Déplacement latéral : le boss tourne autour du joueur en visant un point en avance sur le cercle
        // centré sur le joueur (`seek`, ou `arrive` en approche). Sans ordre du réseau, il rôde : il tourne
        // lentement (poids `prowlSpeed`) et change de sens toutes les `prowlSwitch` s.
        // En approche, il vise un point en avance de `latéral × orbitLead` px sur son cercle de garde ;
        // sinon, un point en avance de `orbitLead` px sur le cercle où il se trouve
        prowlSpeed: 0.35, prowlSwitch: 3, strafeDeadzone: 0.12, orbitLead: 100,
        // Ruée qui percute un pilier : le boss reste étourdi `stun` s
        stun: 1.6,
        // Anti-camping : le boss dont le centre est à moins de `margin` px de deux murs à la fois est dans
        // un coin. Son compteur monte d'1 s par seconde dans le coin et redescend de `recover` s par seconde
        // ailleurs ; à `limit` s, le brouillard le dévore : il meurt (défaite, toute sa vie comptée perdue)
        camping: { margin: 110, limit: 6, recover: 2 },
        rage: { threshold: 0.3, speedMul: 1.35, cooldownMul: 0.55 },
        // Ruée : vise la position du joueur prédite `predict` s plus tard (comme pursue), visée figée
        // `lockBefore` s avant la fin de la préparation, puis charge en ligne droite (seek du point visé)
        charge: { cooldown: 5, predict: 0.4, lockBefore: 0.15, maxSpeed: 8, maxForce: 2.5, length: 260 },
        // Souffle : une nappe de brume apparaît où le joueur sera dans `predict` s ; elle dure `lifetime` s,
        // brûle `dps` points de vie par seconde et ralentit (vitesse × `slow`) ; au plus `maxZones` nappes
        breath: { cooldown: 7, predict: 0.5, lifetime: 6, radius: 60, dps: 10, slow: 0.55, maxZones: 3 }
    },

    // Piliers en ruine : obstacles ronds. Ils arrêtent les corps, bloquent les coups et la ligne de vue ;
    // une ruée qui en percute un l'abîme (`hp` chocs avant effondrement)
    PILLAR: { r: 28, hp: 2 },

    ATTACKS: {
        light: { stamina: 16, windup: 0.12, active: 0.1, recovery: 0.22, damage: 14, reach: 52, arc: Math.PI * 0.6 },
        heavy: { stamina: 32, windup: 0.42, active: 0.12, recovery: 0.45, damage: 30, reach: 62, arc: Math.PI * 0.75 },
        boss: { windup: 0.6, active: 0.15, recovery: 1.0, damage: 22, reach: 95, arc: Math.PI * 0.8 },
        // La ruée touche au contact, dans toutes les directions (arc complet), pendant la charge
        charge: { windup: 0.5, active: 0.45, recovery: 1.2, damage: 20, reach: 42, arc: Math.PI * 2 },
        // Le souffle ne frappe pas directement : il pose une nappe au début de sa phase active
        breath: { windup: 0.6, active: 0.05, recovery: 0.4, damage: 0, reach: 0, arc: 0 }
    },

    /** Phase d'une action après `t` secondes : 'windup', 'active', 'recovery' ou 'done'. */
    phase(spec, t) {
        if (t < spec.windup) return 'windup';
        if (t < spec.windup + spec.active) return 'active';
        if (t < spec.windup + spec.active + spec.recovery) return 'recovery';
        return 'done';
    },

    duration(spec) {
        return spec.windup + spec.active + spec.recovery;
    },

    /** Nouvelle action d'attaque. */
    newAttack(kind, facing) {
        return { kind: kind, spec: Combat.ATTACKS[kind], t: 0, facing: facing, hasHit: false };
    },

    /** Écart d'angle dans [−π, π]. */
    angleDiff(a, b) {
        let d = (a - b) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return d;
    },

    /** Tourne l'angle `from` vers `to` d'au plus `maxStep` radians. */
    turnToward(from, to, maxStep) {
        const d = Combat.angleDiff(to, from);
        if (Math.abs(d) <= maxStep) return to;
        return from + Math.sign(d) * maxStep;
    },

    /**
     * La cible est-elle dans le cône de frappe ? Distance de centre à centre ≤ portée + rayon de la
     * cible, et angle par rapport à l'orientation de l'attaque ≤ moitié de l'ouverture.
     */
    inArc(attackerPos, facing, target, reach, arc) {
        const dx = target.pos.x - attackerPos.x, dy = target.pos.y - attackerPos.y;
        const d = Math.hypot(dx, dy);
        if (d > reach + target.r) return false;
        if (d < 1e-9) return true;
        return Math.abs(Combat.angleDiff(Math.atan2(dy, dx), facing)) <= arc / 2;
    },

    /**
     * Pilier qui coupe le segment [a, b] (ligne de vue, trajectoire d'un coup), ou null.
     * Le segment est coupé si un pilier vivant est à moins de son rayon (+ `margin`) du segment.
     */
    blocker(a, b, pillars, margin = 0) {
        if (!pillars) return null;
        for (const p of pillars) {
            if (p.alive && Steering.distanceToSegment(p.pos, a, b) < p.radius + margin) return p;
        }
        return null;
    }
};
