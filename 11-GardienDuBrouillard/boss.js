// Le Gardien du Brouillard : sous-classe de Vehicle (vehicle.js, fourni et protégé).
//
// Le boss ne décide pas lui-même : un contrôleur (réseau de neurones ou machine à états) lui donne
// une décision { mode: 'approach' | 'retreat' | 'hold', speed: 0..1, attack: bool, dodge: bool }.
// Le boss la traduit en forces :
//   approche → `arrive` vers un point à distance d'attaque (il ralentit au lieu de foncer dessus) ;
//   recul    → `flee` (Reynolds, steering.js) ;
//   esquive  → `evade` (fuite de la position prédite du joueur) pendant 0,35 s ;
//   joueur hors du rayon de détection → `wander`, sans décision du contrôleur ;
//   toujours → confinement `stayInside` près des murs.
//
// Attaque télégraphiée : 0,6 s de préparation visible, puis 0,15 s de frappe, puis récupération.
// Phase enragée (vie ≤ 30 %) : vitesse × 1,35 et attente entre deux attaques × 0,55 (un seul réseau).
class Boss extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        const B = Combat.BOSS;
        this.r = B.r;
        this.baseSpeed = B.maxSpeed;
        this.baseForce = B.maxForce;
        this.maxSpeed = B.maxSpeed;
        this.maxForce = B.maxForce;
        this.vel.set(0, 0);
        this.maxHp = B.maxHp;
        this.hp = B.maxHp;
        this.detectRadius = B.detectRadius;

        // Errance (wander de vehicle.js) : cercle plus proche, adapté à l'arène
        this.distanceCercle = 80;
        this.wanderRadius = 40;
        this.displaceRange = 0.3;

        this.cooldown = 0;        // secondes avant la prochaine attaque possible
        this.dodgeCooldown = 0;
        this.action = null;       // attaque en cours
        this.dodge = null;        // esquive en cours : { t }
        this.facing = Math.PI;
        this.wandering = false;
        this.hurtTimer = 0;
        this.rageTime = -1;       // instant (s) du passage en phase enragée, pour l'effet visuel
        this.time = 0;
        this.stats = { attacks: 0, hits: 0, whiffs: 0, damageDealt: 0, dodges: 0 };
    }

    flee(target) {
        return Steering.flee(this, target);
    }

    evade(vehicle) {
        return Steering.evade(this, vehicle);
    }

    get alive() {
        return this.hp > 0;
    }

    /** Phase enragée : seuil inclusif (30 % de la vie maximale). */
    get enraged() {
        return this.hp <= this.maxHp * Combat.BOSS.rage.threshold;
    }

    speedMultiplier() {
        return this.enraged ? Combat.BOSS.rage.speedMul : 1;
    }

    attackCooldown() {
        return Combat.BOSS.cooldown * (this.enraged ? Combat.BOSS.rage.cooldownMul : 1);
    }

    isAttacking() {
        return this.action !== null;
    }

    canAct() {
        return this.alive && this.action === null && this.dodge === null;
    }

    /** Applique une décision du contrôleur (sélection de l'action → steering). */
    control(decision, player, arena, dt) {
        const B = Combat.BOSS;
        const toPlayer = Math.atan2(player.pos.y - this.pos.y, player.pos.x - this.pos.x);
        const dist = p5.Vector.dist(this.pos, player.pos);
        this.wandering = false;

        if (!this.alive) {
            this.applyForce(this.arrive(this.pos));
            return;
        }

        if (this.dodge) {
            this.applyForce(this.evade(player));
        } else if (this.action) {
            // Planté pendant l'attaque ; il suit encore un peu le joueur pendant la préparation
            this.applyForce(this.arrive(this.pos));
            if (Combat.phase(this.action.spec, this.action.t) === 'windup') {
                this.action.facing = Combat.turnToward(this.action.facing, toPlayer, B.windupTurnRate * dt);
                this.facing = this.action.facing;
            }
        } else if (dist > this.detectRadius || !player.alive) {
            // Joueur hors de portée : errance, sans décision
            this.wandering = true;
            this.maxSpeed = this.baseSpeed * 0.6;
            this.applyForce(this.wander());
        } else {
            this.maxSpeed = this.baseSpeed * this.speedMultiplier() * (0.35 + 0.65 * decision.speed);
            this.maxForce = this.baseForce * this.speedMultiplier();
            if (decision.mode === 'approach') {
                this.applyForce(this.arrive(Steering.keepDistancePoint(this, player.pos, B.keepDistance)));
            } else if (decision.mode === 'retreat') {
                this.applyForce(this.flee(player.pos));
            } else {
                this.applyForce(this.arrive(this.pos));
            }
        }

        // Confinement : priorité forte près des murs
        this.applyForce(Steering.stayInside(this, arena, 70).mult(1.5));

        if (!this.action) {
            const target = this.wandering ? this.vel.heading() : toPlayer;
            this.facing = Combat.turnToward(this.facing, target, B.turnRate * dt);
        }

        if (!this.canAct() || !player.alive || this.wandering) return;
        if (decision.attack && this.cooldown <= 0) {
            this.action = Combat.newAttack('boss', this.facing);
            this.cooldown = this.attackCooldown();
            this.stats.attacks++;
        } else if (decision.dodge && player.isAttacking() && this.dodgeCooldown <= 0) {
            this.dodge = { t: 0 };
            this.dodgeCooldown = B.dodge.cooldown;
            this.maxSpeed = B.dodge.maxSpeed * this.speedMultiplier();
            this.maxForce = B.dodge.maxForce;
            this.stats.dodges++;
        }
    }

    receiveHit(damage) {
        if (!this.alive) return false;
        const wasEnraged = this.enraged;
        this.hp = Math.max(0, this.hp - damage);
        this.hurtTimer = 0.2;
        if (!wasEnraged && this.enraged && this.alive) this.rageTime = this.time;
        return true;
    }

    tick(dt) {
        this.time += dt;
        if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
        if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
        if (this.action) {
            this.action.t += dt;
            if (Combat.phase(this.action.spec, this.action.t) === 'done') {
                if (!this.action.hasHit) this.stats.whiffs++;
                this.action = null;
            }
        }
        if (this.dodge) {
            this.dodge.t += dt;
            if (this.dodge.t >= Combat.BOSS.dodge.duration) {
                this.dodge = null;
                this.maxSpeed = this.baseSpeed;
                this.maxForce = this.baseForce;
            }
        }
    }

    reset(x, y) {
        this.pos.set(x, y);
        this.vel.set(0, 0);
        this.acc.set(0, 0);
        this.hp = this.maxHp;
        this.cooldown = 0;
        this.dodgeCooldown = 0;
        this.action = null;
        this.dodge = null;
        this.maxSpeed = this.baseSpeed;
        this.maxForce = this.baseForce;
        this.rageTime = -1;
        this.path = [];
    }

    // --- Rendu ---

    /** Télégraphe : le cône d'attaque se remplit pendant la préparation (0,6 s). */
    showTelegraph() {
        if (!this.action) return;
        const s = this.action.spec;
        const ph = Combat.phase(s, this.action.t);
        const reach = s.reach + 6;
        push();
        translate(this.pos.x, this.pos.y);
        noStroke();
        if (ph === 'windup') {
            const k = this.action.t / s.windup;
            fill(200, 30, 30, 45);
            arc(0, 0, reach * 2, reach * 2, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2, PIE);
            fill(255, 60, 40, 60 + 100 * k);
            arc(0, 0, reach * 2 * k, reach * 2 * k, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2, PIE);
        } else if (ph === 'active') {
            fill(255, 230, 200, 200);
            arc(0, 0, reach * 2, reach * 2, this.action.facing - s.arc / 2, this.action.facing + s.arc / 2, PIE);
        }
        pop();
    }

    show() {
        push();
        // Aura enragée
        if (this.enraged && this.alive) {
            noStroke();
            const pulse = 1 + 0.08 * Math.sin(this.time * 12);
            fill(255, 40, 20, 40);
            circle(this.pos.x, this.pos.y, this.r * 3.2 * pulse);
            fill(255, 80, 30, 30);
            circle(this.pos.x, this.pos.y, this.r * 2.6 * pulse);
        }
        // Onde de colère au passage en phase enragée
        if (this.rageTime >= 0 && this.time - this.rageTime < 1) {
            const k = this.time - this.rageTime;
            noFill();
            stroke(255, 60, 30, 255 * (1 - k));
            strokeWeight(6);
            circle(this.pos.x, this.pos.y, this.r * 2 + k * 400);
        }
        translate(this.pos.x, this.pos.y);
        rotate(this.facing);
        // Cape de brouillard
        noStroke();
        fill(60, 66, 80, 120);
        ellipse(-this.r * 0.5, 0, this.r * 2.4, this.r * 2.2);
        // Armure
        stroke(10);
        strokeWeight(3);
        if (this.hurtTimer > 0) fill(230, 230, 240);
        else if (this.enraged) fill(80, 30, 30);
        else fill(52, 56, 68);
        circle(0, 0, this.r * 2);
        // Cornes
        fill(200, 190, 170);
        triangle(this.r * 0.2, -this.r * 0.6, this.r * 0.9, -this.r * 1.25, this.r * 0.6, -this.r * 0.35);
        triangle(this.r * 0.2, this.r * 0.6, this.r * 0.9, this.r * 1.25, this.r * 0.6, this.r * 0.35);
        // Yeux
        noStroke();
        fill(this.enraged ? color(255, 60, 30) : color(120, 220, 255));
        circle(this.r * 0.55, -this.r * 0.25, 7);
        circle(this.r * 0.55, this.r * 0.25, 7);
        // Hallebarde : levée pendant la préparation, abattue pendant la frappe
        let swing = 0.9;
        if (this.action) {
            const s = this.action.spec;
            const ph = Combat.phase(s, this.action.t);
            if (ph === 'windup') swing = 0.9 + 0.9 * (this.action.t / s.windup);
            else if (ph === 'active') swing = 1.8 - 3.4 * ((this.action.t - s.windup) / s.active);
            else swing = -1.6;
        }
        rotate(swing);
        stroke(120, 110, 100);
        strokeWeight(5);
        line(this.r * 0.6, 0, this.r + 62, 0);
        noStroke();
        fill(190, 195, 205);
        triangle(this.r + 50, -12, this.r + 72, 0, this.r + 50, 12);
        pop();
    }

    /** Cercle de détection (debug) : jaune, rouge quand le joueur est dedans. */
    showDetection(player) {
        const inside = p5.Vector.dist(this.pos, player.pos) <= this.detectRadius;
        push();
        noFill();
        strokeWeight(1.5);
        stroke(inside ? color(255, 60, 60) : color(255, 220, 0));
        circle(this.pos.x, this.pos.y, this.detectRadius * 2);
        stroke(255, 255, 255, 60);
        circle(this.pos.x, this.pos.y, (Combat.ATTACKS.boss.reach + player.r) * 2);
        pop();
    }
}
