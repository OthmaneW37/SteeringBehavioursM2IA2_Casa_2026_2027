// Joueur automatique « vitrine » : il joue la campagne comme un bon joueur de Souls, pour la partie complète de la
// vidéo de démonstration (le joueur robot de l'entraînement, lui, est volontairement moyen). Il n'a aucun
// avantage caché : il passe par la même intention que le clavier (Player.control), avec les mêmes règles
// (endurance, fenêtres de parade, invulnérabilité de la roulade). Temps en secondes ; aléatoire injecté (graine).
// Comme un humain, il lit le télégraphe : face à un coup retardé, il se fait piéger avec la probabilité FOOLED.
//
// Contre le Gardien (combat de boss) :
//   1. ruée qui arrive : pas de côté, puis roulade au contact ; souffle visé sur lui : il s'écarte ;
//   2. hallebarde : parade PARRY_LEAD s avant la frappe, une seule fois par coup. Il lit le remplissage du
//      télégraphe ; mais face à un coup retardé, avec la probabilité FOOLED, il pare au rythme habituel (0,6 s) et
//      tombe trop tôt ;
//   3. boss déséquilibré : riposte critique (coup lourd s'il a l'endurance) ;
//   4. vie basse : il boit quand le boss est loin, déséquilibré ou en longue récupération ;
//   5. boss en récupération : il punit d'un coup léger ;
//   6. sinon il reste à portée de hallebarde en tournant autour du boss : il l'invite à frapper, pour parer.
// Contre la meute (même interface, la liste des Creux à la place du boss) :
//   1. une seule morsure va frapper : parade face au Creux ; plusieurs : roulade à travers ;
//   2. un Creux déséquilibré : riposte critique au coup lourd (90 dégâts : le Creux tombe) ;
//   3. vie basse et personne autour : il boit ;
//   4. le plus proche est à portée et les autres sont loin : il frappe, en gardant une réserve d'endurance ;
//   5. sinon il recule face à la meute, qui s'étire : les Creux arrivent un par un.
class ShowcasePlayerController {
    constructor(rng = seededRandom(1)) {
        this.rng = rng;
        this.fooled = new Map();    // coup retardé → se laisse-t-il piéger (tiré une fois par coup) ?
        this.t = 0;
        this.attackClock = 0;
        this.escapeClock = 0;
        this.side = 1;
        this.parried = new Set();   // coups déjà parés (une parade par coup : il ne réessaie pas)
    }

    static base(focus = null) {
        return { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false, drink: false, parry: false, avoid: true, focus: focus };
    }

    intent(player, foe, arena, dt, wisps = null) {
        this.t += dt;
        this.attackClock -= dt;
        this.escapeClock -= dt;
        this.side = Math.floor(this.t / ShowcasePlayerController.STRAFE_SWITCH) % 2 === 0 ? 1 : -1;
        if (!player.alive) return ShowcasePlayerController.base();
        if (Array.isArray(foe)) return this.packIntent(player, foe, arena);
        if (foe instanceof Veilleur) return this.veilleurIntent(player, foe, wisps || [], arena);
        return this.bossIntent(player, foe, arena);
    }

    /**
     * Contre le Veilleur : il coupe le feu follet qui fonce sur lui (ou roule à travers s'il est trop tard), boit à
     * l'abri des feux follets, et sinon poursuit le Veilleur pour le frapper (coup lourd s'il garde de quoi rouler).
     */
    veilleurIntent(player, v, wisps, arena) {
        const S = ShowcasePlayerController;
        const intent = S.base(v);
        if (!v.alive) return intent;
        const distTo = e => Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y);
        // Feux follets qui arrivent sur lui (vitesse tournée vers lui)
        const incoming = wisps.filter(w => w.alive && distTo(w) < S.WISP_ALERT &&
            (w.vel.x * (player.pos.x - w.pos.x) + w.vel.y * (player.pos.y - w.pos.y)) > 0).sort((a, b) => distTo(a) - distTo(b));
        if (incoming.length) {
            const w = incoming[0];
            const cut = Combat.ATTACKS.light.reach + w.r;
            if (distTo(w) <= cut && player.canAct() && player.stamina >= Combat.ATTACKS.light.stamina) {
                intent.focus = w;
                intent.light = true;
                return intent;
            }
            if (distTo(w) < S.WISP_ROLL && player.stamina >= Combat.PLAYER.roll.stamina) {
                intent.roll = true;
                intent.focus = w;
                return intent;
            }
            if (distTo(w) < cut + 25) {
                intent.focus = w;
                intent.move.y = -0.3;   // il s'avance un peu pour le couper
                return intent;
            }
        }
        if (player.hp <= S.DRINK_HP && player.estus > 0 && !wisps.some(w => w.alive && distTo(w) < 220)) {
            intent.drink = true;
            return intent;
        }
        const d = distTo(v);
        const reach = Combat.ATTACKS.heavy.reach + v.r - 6;
        intent.move.y = d > reach - 8 ? -1 : 0;
        if (d <= reach && player.canAct()) {
            if (player.stamina >= Combat.ATTACKS.heavy.stamina + Combat.PLAYER.roll.stamina) intent.heavy = true;
            else if (player.stamina >= Combat.ATTACKS.light.stamina + Combat.PLAYER.roll.stamina) intent.light = true;
        }
        return intent;
    }

    bossIntent(player, boss, arena) {
        const S = ShowcasePlayerController;
        const intent = S.base();
        if (!boss || !boss.alive) return intent;
        const dist = Math.hypot(boss.pos.x - player.pos.x, boss.pos.y - player.pos.y);
        const a = boss.action;
        const ph = a ? Combat.phase(a.spec, a.t) : null;
        // 1. Ruée et souffle
        if (a && a.kind === 'charge' && ph !== 'recovery') {
            const lineDist = Steering.distanceToSegment(player.pos, boss.pos, a.target);
            if (lineDist < boss.r + player.r + 30) {
                intent.move.x = ScriptedPlayerController.sideAway(player, boss, a.target);
                if (ph === 'active' && dist < S.CHARGE_ROLL) intent.roll = true;
            }
            return intent;
        }
        if (a && a.kind === 'breath' && ph === 'windup') {
            const d = Math.hypot(a.target.x - player.pos.x, a.target.y - player.pos.y);
            if (d < Combat.BOSS.breath.radius + player.r + 30) {
                intent.move.x = ScriptedPlayerController.sideAway(player, boss, a.target);
                intent.move.y = 0.5;
                return intent;
            }
        }
        // 2. Hallebarde : parade au RYTHME HABITUEL (0,6 s de préparation), comme un humain qui a appris la cadence :
        //    il ne lit pas le temps exact, un coup retardé le prend donc à contre-temps
        if (a && a.kind === 'boss' && a.delayed && !this.fooled.has(a)) this.fooled.set(a, this.rng() < S.FOOLED);
        const expected = a && a.delayed && this.fooled.get(a) ? Combat.ATTACKS.boss.windup : a ? a.spec.windup : 0;
        if (a && a.kind === 'boss' && ph === 'windup' && expected - a.t <= S.PARRY_LEAD &&
            dist <= a.spec.reach + player.r + 20 && !this.parried.has(a)) {
            this.parried.add(a);
            if (player.stamina >= Combat.ATTACKS.parry.stamina) intent.parry = true;
            else intent.roll = true;
            return intent;
        }
        // 3. Riposte critique (coup lourd seulement s'il lui reste ensuite de quoi parer)
        if (boss.stun && boss.stun.riposte) {
            const reach = Combat.ATTACKS.heavy.reach + boss.r - 6;
            if (dist > reach) intent.move.y = -1;
            else if (player.stamina >= Combat.ATTACKS.heavy.stamina + Combat.ATTACKS.parry.stamina) intent.heavy = true;
            else if (player.stamina >= Combat.ATTACKS.light.stamina) intent.light = true;
            return intent;
        }
        // 4. Fiole, à l'abri
        if (player.hp <= S.DRINK_HP && player.estus > 0) {
            const safe = boss.stun || dist > S.DRINK_DISTANCE || (a && ph === 'recovery' && Combat.duration(a.spec) - a.t > 0.8);
            if (safe) {
                intent.drink = true;
                return intent;
            }
            intent.move.y = 1;
            intent.move.x = this.side * 0.5;
            return intent;
        }
        // 5. Punition pendant la récupération
        if (a && ph === 'recovery') {
            const remaining = Combat.duration(a.spec) - a.t;
            if (dist > Combat.ATTACKS.light.reach + boss.r - 6) intent.move.y = -1;
            else if (ScriptedPlayerController.safeToCommit('light', remaining) && this.attackClock <= 0 &&
                player.stamina >= Combat.ATTACKS.light.stamina + Combat.ATTACKS.parry.stamina + 10) {
                intent.light = true;
                this.attackClock = 0.5;
            }
            return intent;
        }
        // 6. À court d'endurance : il recule hors de portée pour récupérer ; sinon, à portée de hallebarde, il tourne
        //    autour du boss pour l'inviter à frapper
        if (player.stamina < S.REST_BELOW) {
            intent.move.y = dist < S.REST_RANGE ? 1 : 0;
            intent.move.x = this.side * 0.6;
            return intent;
        }
        intent.move.y = dist > S.BAIT_RANGE ? -1 : dist < S.BAIT_RANGE - 25 ? 0.6 : 0;
        intent.move.x = this.side * 0.5;
        return intent;
    }

    packIntent(player, pack, arena) {
        const S = ShowcasePlayerController;
        const alive = pack.filter(c => c.alive);
        const nearest = PackPlayerController.nearest(player, pack);
        const intent = S.base(nearest);
        if (!nearest) return intent;
        const distTo = c => Math.hypot(c.pos.x - player.pos.x, c.pos.y - player.pos.y);
        // 1. Morsures qui vont frapper : une seule → parade face à elle ; plusieurs, ou trop peu d'endurance →
        //    roulade (invulnérable) en s'éloignant d'elles
        const biting = alive.filter(c => c.action && Combat.phase(c.action.spec, c.action.t) === 'windup' &&
            c.action.spec.windup - c.action.t <= S.PARRY_LEAD && distTo(c) <= c.action.spec.reach + player.r + 12);
        if (biting.length) {
            if (biting.length === 1 && player.canAct() && player.stamina >= Combat.ATTACKS.parry.stamina) {
                intent.focus = biting[0];
                intent.parry = true;
            } else {
                intent.focus = biting[0];
                intent.roll = player.stamina >= Combat.PLAYER.roll.stamina;
                intent.lock = false;
                intent.move = PackPlayerController.awayFrom(player, biting);
            }
            return intent;
        }
        // 2. Riposte critique sur un Creux déséquilibré, puis il le finit
        const staggered = alive.filter(c => c.stun).sort((p, q) => distTo(p) - distTo(q))[0];
        if (staggered && distTo(staggered) < 120) {
            intent.focus = staggered;
            const reach = Combat.ATTACKS.heavy.reach + staggered.r - 4;
            if (distTo(staggered) > reach) intent.move.y = -1;
            else if (player.stamina >= Combat.ATTACKS.heavy.stamina) intent.heavy = true;
            else intent.light = true;
            return intent;
        }
        // 3. Fiole quand personne n'est autour
        if (player.hp <= S.DRINK_HP && player.estus > 0 && PackPlayerController.within(player, pack, 150).length === 0) {
            intent.drink = true;
            return intent;
        }
        // 4. Le plus proche est à portée et les autres sont loin : il frappe (en gardant une réserve d'endurance)
        const d = distTo(nearest);
        const others = alive.filter(c => c !== nearest && distTo(c) < S.CROWD).length;
        const reach = Combat.ATTACKS.light.reach + nearest.r;
        if (d <= reach && others === 0 && this.attackClock <= 0) {
            if (player.stamina >= Combat.ATTACKS.heavy.stamina + S.RESERVE) intent.heavy = true;
            else if (player.stamina >= Combat.ATTACKS.light.stamina + S.RESERVE) intent.light = true;
            this.attackClock = 0.3;
            return intent;
        }
        // 5. Sinon il recule face à la meute (elle s'étire, les Creux arrivent un par un), de côté s'il est acculé
        const near = PackPlayerController.within(player, pack, S.KITE);
        if (near.length) {
            const away = PackPlayerController.awayFrom(player, near);
            if (PackPlayerController.room(player, away, arena)) {
                intent.lock = false;
                intent.move = away;
            } else {
                intent.move.x = this.side;
            }
            return intent;
        }
        intent.move.y = d > S.PACK_RANGE ? -0.6 : 0;
        return intent;
    }
}

ShowcasePlayerController.PARRY_LEAD = 0.1;
ShowcasePlayerController.FOOLED = 0.5;           // probabilité de se faire piéger par un coup retardé       // garde levée 0,1 s avant la frappe (fenêtre de 0,2 s après 0,04 s)
ShowcasePlayerController.CHARGE_ROLL = 95;
ShowcasePlayerController.DRINK_HP = 50;
ShowcasePlayerController.DRINK_DISTANCE = 230;
ShowcasePlayerController.WISP_ALERT = 90;        // feux follets surveillés à moins de 90 px
ShowcasePlayerController.WISP_ROLL = 34;         // trop tard pour le couper : roulade
ShowcasePlayerController.REST_BELOW = 40;        // sous cette endurance, il recule pour récupérer
ShowcasePlayerController.REST_RANGE = 180;       // ... hors de portée de la hallebarde
ShowcasePlayerController.BAIT_RANGE = 100;       // distance gardée contre le Gardien (dans sa portée : il frappe)
ShowcasePlayerController.PACK_RANGE = 120;       // contre la meute : il attend à cette distance
ShowcasePlayerController.CROWD = 90;             // il ne frappe que si aucun autre Creux n'est à moins de 90 px
ShowcasePlayerController.KITE = 110;             // il recule quand des Creux sont à moins de 110 px
ShowcasePlayerController.RESERVE = 25;           // endurance gardée pour une parade ou une roulade
ShowcasePlayerController.STRAFE_SWITCH = 3;
