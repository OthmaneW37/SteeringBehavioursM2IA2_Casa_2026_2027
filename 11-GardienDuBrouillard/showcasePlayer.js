// Joueur automatique « vitrine » : il joue la campagne comme un bon joueur de Souls, pour la partie complète de la
// vidéo de démonstration (le joueur robot de l'entraînement, lui, est volontairement moyen). Il n'a aucun
// avantage caché : il passe par la même intention que le clavier (Player.control), avec les mêmes règles
// (endurance, fenêtres de parade, invulnérabilité de la roulade). Temps en secondes, aucun aléatoire.
//
// Contre le Gardien (combat de boss) :
//   1. ruée qui arrive : pas de côté, puis roulade au contact ; souffle visé sur lui : il s'écarte ;
//   2. hallebarde qui va frapper à portée : parade PARRY_LEAD s avant la frappe (sinon roulade) ;
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
    constructor() {
        this.t = 0;
        this.attackClock = 0;
        this.escapeClock = 0;
        this.side = 1;
    }

    static base(focus = null) {
        return { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false, drink: false, parry: false, avoid: true, focus: focus };
    }

    intent(player, foe, arena, dt) {
        this.t += dt;
        this.attackClock -= dt;
        this.escapeClock -= dt;
        this.side = Math.floor(this.t / ShowcasePlayerController.STRAFE_SWITCH) % 2 === 0 ? 1 : -1;
        if (!player.alive) return ShowcasePlayerController.base();
        return Array.isArray(foe) ? this.packIntent(player, foe, arena) : this.bossIntent(player, foe, arena);
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
        // 2. Hallebarde : parade au bon moment
        if (a && a.kind === 'boss' && ph === 'windup' && a.spec.windup - a.t <= S.PARRY_LEAD &&
            dist <= a.spec.reach + player.r + 20) {
            if (player.stamina >= Combat.ATTACKS.parry.stamina) intent.parry = true;
            else intent.roll = true;
            return intent;
        }
        // 3. Riposte critique
        if (boss.stun && boss.stun.riposte) {
            const reach = Combat.ATTACKS.heavy.reach + boss.r - 6;
            if (dist > reach) intent.move.y = -1;
            else if (player.stamina >= Combat.ATTACKS.heavy.stamina) intent.heavy = true;
            else intent.light = true;
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
            else if (ScriptedPlayerController.safeToCommit('light', remaining) && this.attackClock <= 0) {
                intent.light = true;
                this.attackClock = 0.5;
            }
            return intent;
        }
        // 6. À portée de hallebarde, il tourne autour du boss
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

ShowcasePlayerController.PARRY_LEAD = 0.1;       // garde levée 0,1 s avant la frappe (fenêtre de 0,2 s après 0,04 s)
ShowcasePlayerController.CHARGE_ROLL = 95;
ShowcasePlayerController.DRINK_HP = 50;
ShowcasePlayerController.DRINK_DISTANCE = 230;
ShowcasePlayerController.BAIT_RANGE = 100;       // distance gardée contre le Gardien (dans sa portée : il frappe)
ShowcasePlayerController.PACK_RANGE = 120;       // contre la meute : il attend à cette distance
ShowcasePlayerController.CROWD = 90;             // il ne frappe que si aucun autre Creux n'est à moins de 90 px
ShowcasePlayerController.KITE = 110;             // il recule quand des Creux sont à moins de 110 px
ShowcasePlayerController.RESERVE = 25;           // endurance gardée pour une parade ou une roulade
ShowcasePlayerController.STRAFE_SWITCH = 3;
