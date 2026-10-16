// Joueur robot (scripté) face à la meute, pour l'entraînement et la comparaison du niveau 1. Aléatoire
// injecté, temps en secondes : un adversaire reproductible. Il vise toujours le Creux vivant le plus proche
// (`focus` de l'intention : le combat le passe au chevalier comme cible verrouillée).
//
// Règles, dans l'ordre de priorité :
//   1. un Creux prépare une morsure à portée : à chaque morsure, il décide une fois, avec la probabilité
//      `dodgeProbability`, s'il la voit venir. S'il la voit, il roule ROLL_LEAD s avant la frappe quand il
//      a l'endurance (ROLL_RESERVE), sinon il recule d'un pas hors de portée ; s'il ne la voit pas, il
//      continue avec les règles suivantes ;
//   2. vie basse et fioles restantes : il boit si aucun Creux n'est à moins de DRINK_SAFE_DISTANCE px,
//      sinon il s'éloigne du centre de la meute ;
//   3. encerclé (au moins SURROUND_COUNT Creux à moins de SURROUND_DISTANCE px) : il sort du cercle en
//      s'éloignant du centre des Creux proches, et roule s'il en a l'endurance (au plus une roulade
//      toutes les ESCAPE_COOLDOWN s) ;
//   4. endurance basse : il recule en s'éloignant de la meute ;
//   Fuir n'a de sens que s'il y a de la place : si la direction de fuite mène dans un mur (coin, bord),
//   il est acculé et passe directement à la règle 5 (il se bat) ;
//   5. sinon il marche vers le Creux le plus proche et frappe à intervalles réguliers (`attackInterval`) :
//      coup lourd si plusieurs Creux sont à portée (il les touche tous), sinon coup léger.
class PackPlayerController {
    constructor(rng, options = {}) {
        this.rng = rng;
        this.dodgeProbability = options.dodgeProbability !== undefined ? options.dodgeProbability : 0.4;
        this.attackInterval = options.attackInterval !== undefined ? options.attackInterval : 0.9;
        this.attackTimer = 0;
        this.escapeTimer = 0;
        this.resting = false;
        this.seen = new Set();      // morsures déjà jugées (une décision par morsure)
        this.willDodge = new Map();
    }

    /** Creux vivant le plus proche du chevalier, ou null. */
    static nearest(player, pack) {
        let best = null, bestD = Infinity;
        for (const c of pack) {
            if (!c.alive) continue;
            const d = Math.hypot(c.pos.x - player.pos.x, c.pos.y - player.pos.y);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    }

    /** Creux vivants à moins de `radius` px du chevalier. */
    static within(player, pack, radius) {
        return pack.filter(c => c.alive && Math.hypot(c.pos.x - player.pos.x, c.pos.y - player.pos.y) < radius);
    }

    /** Direction (vecteur unitaire, coordonnées du monde) qui éloigne le chevalier du centre de `group`. */
    static awayFrom(player, group) {
        let cx = 0, cy = 0;
        for (const c of group) { cx += c.pos.x; cy += c.pos.y; }
        cx /= group.length; cy /= group.length;
        let x = player.pos.x - cx, y = player.pos.y - cy;
        const m = Math.hypot(x, y);
        if (m < 1e-9) return { x: 1, y: 0 };
        return { x: x / m, y: y / m };
    }

    /** Peut-il reculer dans la direction `dir` sans buter contre un mur à ESCAPE_ROOM px ? */
    static room(player, dir, arena) {
        const R = PackPlayerController.ESCAPE_ROOM;
        return !arena.clampPoint({ x: player.pos.x + dir.x * R, y: player.pos.y + dir.y * R }, player.r + 4).clamped;
    }

    intent(player, pack, arena, dt) {
        const S = PackPlayerController;
        this.attackTimer -= dt;
        this.escapeTimer -= dt;
        const focus = S.nearest(player, pack);
        const intent = { move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false, avoid: true, focus: focus };
        if (!player.alive || !focus) return intent;
        if (player.stamina < S.REST_LOW) this.resting = true;
        if (player.stamina >= S.REST_HIGH) this.resting = false;

        // 1. Morsures en préparation à portée
        for (const c of pack) {
            const a = c.action;
            if (!c.alive || !a || Combat.phase(a.spec, a.t) !== 'windup') continue;
            if (!this.seen.has(a)) {
                this.seen.add(a);
                this.willDodge.set(a, this.rng() < this.dodgeProbability);
            }
            const d = Math.hypot(c.pos.x - player.pos.x, c.pos.y - player.pos.y);
            if (d > a.spec.reach + player.r + S.THREAT_MARGIN) continue;
            if (!this.willDodge.get(a)) continue;
            if (player.stamina >= S.ROLL_RESERVE) {
                if (a.spec.windup - a.t <= S.ROLL_LEAD) {
                    intent.roll = true;
                    intent.focus = c;   // la roulade fuit (evade) ce Creux
                    return intent;
                }
            } else {
                intent.move = S.awayFrom(player, [c]);   // pas de côté hors de portée
                return intent;
            }
        }

        const close = S.within(player, pack, S.SURROUND_DISTANCE);
        const near = S.within(player, pack, S.DRINK_SAFE_DISTANCE);
        // 2. Fiole
        if (player.hp <= S.DRINK_HP && player.estus > 0) {
            if (near.length === 0) {
                intent.drink = true;
                return intent;
            }
            const away = S.awayFrom(player, near);
            if (S.room(player, away, arena)) {
                intent.move = away;
                return intent;
            }
        }
        // 3. Encerclé : il sort du cercle
        const escape = close.length >= S.SURROUND_COUNT ? S.awayFrom(player, close) : null;
        if (escape && S.room(player, escape, arena)) {
            intent.move = escape;
            if (player.stamina >= S.ESCAPE_STAMINA && this.escapeTimer <= 0) {
                intent.roll = true;
                intent.focus = PackPlayerController.nearest(player, close);
                this.escapeTimer = S.ESCAPE_COOLDOWN;
            }
            return intent;
        }
        // 4. Repos
        if (this.resting) {
            const away = near.length ? S.awayFrom(player, near) : null;
            if (!away) return intent;
            if (S.room(player, away, arena)) {
                intent.move = away;
                return intent;
            }
        }
        // 5. Attaque du plus proche
        const d = Math.hypot(focus.pos.x - player.pos.x, focus.pos.y - player.pos.y);
        const reach = Combat.ATTACKS.light.reach + focus.r;
        // Verrouillé sur le Creux : move.y = −1 avance vers lui (coordonnées verrouillées du chevalier)
        intent.lock = true;
        if (d > reach - 6) intent.move = { x: 0, y: -1 };
        if (d <= reach && this.attackTimer <= 0) {
            const inReach = S.within(player, pack, Combat.ATTACKS.heavy.reach + focus.r).length;
            if (inReach >= 2 && player.stamina >= Combat.ATTACKS.heavy.stamina + 20) intent.heavy = true;
            else intent.light = true;
            this.attackTimer = this.attackInterval;
        }
        return intent;
    }
}

PackPlayerController.ROLL_LEAD = 0.12;
PackPlayerController.THREAT_MARGIN = 10;
PackPlayerController.DRINK_HP = 45;
PackPlayerController.DRINK_SAFE_DISTANCE = 110;
PackPlayerController.ROLL_RESERVE = 40;            // sous cette endurance, il recule au lieu de rouler
PackPlayerController.SURROUND_DISTANCE = 80;
PackPlayerController.SURROUND_COUNT = 3;
PackPlayerController.ESCAPE_STAMINA = 50;
PackPlayerController.ESCAPE_COOLDOWN = 3;
PackPlayerController.ESCAPE_ROOM = 70;            // place nécessaire pour reculer (px)
PackPlayerController.REST_LOW = 25;
PackPlayerController.REST_HIGH = 70;
