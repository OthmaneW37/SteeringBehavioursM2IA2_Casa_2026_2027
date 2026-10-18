// Un Creux : mort-vivant de la meute du niveau 1. Sous-classe de Vehicle (vehicle.js, fourni et protégé).
//
// Séparation de Reynolds :
//   - sélection de l'action : une décision vient du contrôleur de la meute (réseau partagé ou règles
//     écrites à la main) : poids des comportements et morsure ;
//   - steering : somme pondérée de forces, chacune calculée par un comportement du cours :
//       pursue (position future du chevalier), flanc (`seek` d'un point en avance sur le cercle autour du
//       chevalier, du côté opposé au Creux le plus proche), evade (fuite de la position future),
//       alignement + cohésion (boids), plus toujours la séparation, l'évitement des piliers et le
//       confinement dans l'arène ;
//   - locomotion : applyForce puis update(), hérités de Vehicle.
//
// Décision : { pursue, flank, evade, flock } dans [0, 1] (poids), bite (booléen).
// La somme pondérée des quatre comportements choisis est limitée à maxForce ; séparation, évitement et
// confinement s'y ajoutent (ils passent toujours, comme une priorité).
// Morsure : préparation visible, fenêtre de frappe, récupération (mêmes phases que les coups du jeu).
class Creux extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        const C = Creux.STATS;
        this.r = C.r;
        this.maxSpeed = C.maxSpeed;
        this.maxForce = C.maxForce;
        this.vel.set(0, 0);
        this.pathLength = 0;
        this.maxHp = C.hp;
        this.hp = C.hp;
        this.facing = Math.PI;
        this.action = null;        // morsure en cours
        this.stun = null;          // déséquilibré après une morsure parée : { t, duration, riposte }
        this.biteCooldown = 0;
        this.hurtTimer = 0;
        this.deadTime = 0;         // secondes depuis la mort (effet visuel)
        this.perception = Creux.PERCEPTION;
        this.pillars = null;       // piliers du combat (évitement)
        this.near = [];            // voisins perçus au dernier pas (debug)
        this.side = 1;             // sens du flanc choisi au dernier pas
        this.decision = null;      // dernière décision (debug)
        this.forces = null;        // dernières forces (debug, lues sans recalcul)
        this.stats = { bites: 0, hits: 0, whiffs: 0, damageDealt: 0 };
    }

    get alive() {
        return this.hp > 0;
    }

    // Comportements de steering.js à la place des versions de vehicle.js (flee de Reynolds, pursue sans dessin)
    flee(target) {
        return Steering.flee(this, target);
    }

    pursue(target) {
        return Steering.pursue(this, target, Creux.PREDICT);
    }

    evade(target) {
        return Steering.evade(this, target, Creux.PREDICT);
    }

    /**
     * Côté du flanc (+1 ou −1) : on tourne autour du chevalier en s'éloignant (en angle) du voisin le plus
     * proche autour de lui. Sans voisin, on garde le sens précédent.
     */
    static flankSide(agent, target, near, previous = 1) {
        const mine = Math.atan2(agent.pos.y - target.pos.y, agent.pos.x - target.pos.x);
        let best = null, bestGap = Infinity;
        for (const o of near) {
            const d = Combat.angleDiff(Math.atan2(o.pos.y - target.pos.y, o.pos.x - target.pos.x), mine);
            if (Math.abs(d) < bestGap) { bestGap = Math.abs(d); best = d; }
        }
        if (best === null) return previous;
        // Le voisin est du côté des angles croissants (d > 0) : on part vers les angles décroissants
        return best > 0 ? -1 : 1;
    }

    /** Point de flanc : sur le cercle de rayon FLANK_RADIUS autour du chevalier, en avance de FLANK_LEAD px. */
    flankPoint(target, side) {
        return Steering.orbitPoint(this, target.pos, Creux.FLANK_RADIUS, side, Creux.FLANK_LEAD);
    }

    /** Perception : voisins vivants dans le rayon de perception (appelée avant la décision). */
    perceive(pack) {
        this.near = this.alive ? Flocking.neighbours(this, pack, this.perception) : [];
        return this.near;
    }

    /**
     * Décision → forces, avec les voisins perçus par perceive(). Les forces sont gardées dans this.forces
     * pour le debug.
     */
    control(decision, player, arena) {
        this.decision = decision;
        if (!this.alive || this.action || this.stun) {
            // Mort, planté pendant la morsure, ou déséquilibré par une parade : `arrive` sur place freine
            this.applyForce(this.arrive(this.pos));
            this.forces = null;
            return;
        }
        this.side = Creux.flankSide(this, player, this.near, this.side);
        const blend = createVector(0, 0);
        const forces = {
            pursue: this.pursue(player).mult(decision.pursue),
            flank: this.seek(this.flankPoint(player, this.side)).mult(decision.flank),
            evade: this.evade(player).mult(decision.evade),
            flock: Flocking.alignment(this, this.near).add(Flocking.cohesion(this, this.near)).mult(decision.flock / 2)
        };
        for (const k in forces) blend.add(forces[k]);
        blend.limit(this.maxForce);
        forces.separation = Flocking.separation(this, this.near, Creux.SEPARATION).mult(Creux.SEPARATION_WEIGHT);
        forces.avoid = Steering.avoidZones(this, (this.pillars || []).filter(p => p.alive), 40, 6).mult(2);
        forces.wall = Steering.stayInside(this, arena, 30).mult(2);
        this.applyForce(blend);
        this.applyForce(forces.separation);
        this.applyForce(forces.avoid);
        this.applyForce(forces.wall);
        this.forces = forces;

        const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y;
        if (this.vel.mag() > 0.3) this.facing = this.vel.heading();
        const dist = Math.hypot(dx, dy);
        if (dist < Creux.FACE_DISTANCE) this.facing = Math.atan2(dy, dx);
        if (decision.bite && this.canBite(player)) this.startBite(Math.atan2(dy, dx));
    }

    /** Morsure possible : prête, et le chevalier est à portée. */
    canBite(player) {
        const reach = Creux.BITE.reach + player.r + Creux.BITE_MARGIN;
        return this.biteCooldown <= 0 && player.alive &&
            Math.hypot(player.pos.x - this.pos.x, player.pos.y - this.pos.y) <= reach;
    }

    startBite(facing) {
        this.facing = facing;
        this.action = { kind: 'bite', spec: Creux.BITE, t: 0, facing: facing, hasHit: false };
        this.biteCooldown = Creux.BITE_COOLDOWN;
        this.stats.bites++;
    }

    /** Morsure parée : le Creux est déséquilibré Creux.PARRY_STAGGER s, ouvert à une riposte critique. */
    parried() {
        this.action = null;
        this.stun = { t: 0, duration: Creux.PARRY_STAGGER, riposte: true };
    }

    /** Coup reçu : une morsure encore en préparation est interrompue. Retourne true (toujours touché). */
    receiveHit(damage) {
        if (!this.alive) return false;
        this.hp = Math.max(0, this.hp - damage);
        this.hurtTimer = 0.25;
        if (this.action && Combat.phase(this.action.spec, this.action.t) === 'windup') this.action = null;
        return true;
    }

    /** Avance les minuteries de `dt` secondes. */
    tick(dt) {
        if (!this.alive) {
            this.deadTime += dt;
            this.action = null;
            return;
        }
        if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        if (this.biteCooldown > 0) this.biteCooldown = Math.max(0, this.biteCooldown - dt);
        if (this.stun) {
            this.stun.t += dt;
            if (this.stun.t >= this.stun.duration - 1e-9) this.stun = null;
        }
        if (this.action) {
            this.action.t += dt;
            if (Combat.phase(this.action.spec, this.action.t) === 'done') {
                if (!this.action.hasHit) this.stats.whiffs++;
                this.action = null;
            }
        }
    }

    show() {
        if (!this.alive && this.deadTime > Creux.FADE_TIME) return;
        const fade = this.alive ? 1 : 1 - this.deadTime / Creux.FADE_TIME;
        push();
        noStroke();
        fill(0, 0, 0, 80 * fade);
        ellipse(this.pos.x + 2, this.pos.y + 4, this.r * 2.2, this.r * 1.8);
        translate(this.pos.x, this.pos.y);
        rotate(this.facing);
        const hurt = this.hurtTimer > 0;
        // Haillons qui traînent derrière
        const sway = Math.sin(this.pos.x * 0.08 + this.pos.y * 0.06) * 2;
        fill(40, 36, 34, 220 * fade);
        triangle(-this.r * 0.4, -this.r * 0.8, -this.r * 1.7, sway - this.r * 0.3, -this.r * 0.4, this.r * 0.1);
        triangle(-this.r * 0.4, this.r * 0.8, -this.r * 1.6, sway + this.r * 0.4, -this.r * 0.4, -this.r * 0.1);
        // Corps décharné
        stroke(14, 12, 12, 255 * fade);
        strokeWeight(1.5);
        fill(hurt ? color(200, 110, 100) : color(96, 88, 80, 255 * fade));
        circle(0, 0, this.r * 2);
        // Bras tendus : ils s'avancent pendant la morsure
        let reachOut = 0;
        if (this.action) {
            const s = this.action.spec, t = this.action.t, ph = Combat.phase(s, t);
            reachOut = ph === 'windup' ? -3 * t / s.windup : ph === 'active' ? 10 : 4;
        }
        stroke(80, 72, 66, 255 * fade);
        strokeWeight(3);
        line(this.r * 0.3, -this.r * 0.6, this.r * 1.1 + reachOut, -this.r * 0.45);
        line(this.r * 0.3, this.r * 0.6, this.r * 1.1 + reachOut, this.r * 0.45);
        // Tête et yeux pâles (rouges pendant la préparation de la morsure)
        noStroke();
        fill(70, 64, 58, 255 * fade);
        circle(this.r * 0.35, 0, this.r * 1.1);
        const winding = this.action && Combat.phase(this.action.spec, this.action.t) === 'windup';
        fill(winding ? color(255, 90, 60, 230 * fade) : color(200, 220, 255, 190 * fade));
        circle(this.r * 0.6, -this.r * 0.22, 3);
        circle(this.r * 0.6, this.r * 0.22, 3);
        pop();
        // Déséquilibré par une parade : étoiles dorées au-dessus de lui (riposte critique possible)
        if (this.alive && this.stun) {
            push();
            noStroke();
            fill(255, 215, 90);
            for (let i = 0; i < 3; i++) {
                const a = this.stun.t * 7 + i * 2.1;
                circle(this.pos.x + Math.cos(a) * this.r * 0.8, this.pos.y - this.r - 5 + Math.sin(a) * 4, 5);
            }
            pop();
        }
    }

    /**
     * Télégraphe de la morsure (dessiné au-dessus de l'obscurité) : arc qui se remplit pendant la préparation.
     */
    showTelegraph() {
        if (!this.alive || !this.action || Combat.phase(this.action.spec, this.action.t) !== 'windup') return;
        const s = this.action.spec;
        const k = this.action.t / s.windup;
        push();
        noFill();
        stroke(255, 80, 50, 60 + 150 * k);
        strokeWeight(2 + 2 * k);
        const R = (s.reach + this.r) * 2;
        arc(this.pos.x, this.pos.y, R, R, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2);
        pop();
    }

    /** Debug : rayon de perception (jaune, rouge si un voisin est dedans) et poids des comportements. */
    showDebug() {
        if (!this.alive) return;
        push();
        noFill();
        strokeWeight(1);
        stroke(this.near.length > 0 ? color(255, 70, 60, 150) : color(255, 220, 60, 120));
        circle(this.pos.x, this.pos.y, this.perception * 2);
        if (this.forces) {
            const draw = (f, c) => {
                stroke(c);
                strokeWeight(2);
                line(this.pos.x, this.pos.y, this.pos.x + f.x * 120, this.pos.y + f.y * 120);
            };
            draw(this.forces.pursue, color(255, 90, 80));
            draw(this.forces.flank, color(90, 200, 255));
            draw(this.forces.evade, color(255, 255, 255));
            draw(this.forces.flock, color(120, 255, 120));
            draw(this.forces.separation, color(255, 200, 60));
        }
        pop();
    }
}

// Caractéristiques : plus lent que le chevalier (3,2) qui peut toujours fuir ; cinq coups légers ou deux
// lourds. Réglées pour que la meute écrite à la main gagne environ un combat sur cinq contre le joueur robot
Creux.STATS = { hp: 60, r: 12, maxSpeed: 2.8, maxForce: 0.16 };
Creux.BITE = { windup: 0.4, active: 0.1, recovery: 0.55, damage: 15, reach: 22, arc: Math.PI * 0.9, parryable: true };
Creux.PARRY_STAGGER = 1.4;      // secondes de déséquilibre après une morsure parée
Creux.BITE_COOLDOWN = 1.2;       // secondes entre deux morsures d'un même Creux
Creux.BITE_MARGIN = 6;           // la morsure se lance à portée + 6 px (le chevalier bouge pendant la préparation)
Creux.PREDICT = 0.3;             // pursue et evade visent la position du chevalier 0,3 s plus tard
Creux.PERCEPTION = 160;          // rayon de perception des voisins (curseur « Perception des Creux »)
Creux.SEPARATION = 34;           // distance sous laquelle deux Creux s'écartent
Creux.SEPARATION_WEIGHT = 1.5;
Creux.FLANK_RADIUS = 48;         // cercle de flanc autour du chevalier (à portée de morsure)
Creux.FLANK_LEAD = 70;           // avance sur ce cercle (px d'arc)
Creux.FACE_DISTANCE = 90;        // en dessous, le Creux fait face au chevalier
Creux.FADE_TIME = 1.2;           // secondes de disparition après la mort
