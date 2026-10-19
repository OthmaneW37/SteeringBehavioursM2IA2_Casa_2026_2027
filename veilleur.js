// Le Veilleur des cendres : sorcier du niveau 2. Sous-classe de Vehicle (vehicle.js, protégé).
//
// Séparation de Reynolds :
//   - sélection de l'action : VeilleurController (règles écrites à la main) donne une décision ;
//   - steering : selon la décision, `arrive` vers un point à distance de garde du chevalier
//     (Steering.keepDistancePoint), `seek` d'un point en avance sur le cercle (il tourne autour), `flee` quand le
//     chevalier est trop près, `evade` pendant le saut de cendres ; toujours l'évitement des piliers et le
//     confinement dans l'arène. Chaque force passe par steer() (applyForce, notée pour l'affichage) ;
//   - locomotion : update(), hérité de Vehicle.
//
// Techniques (temps en secondes) :
//   - invocation : CAST.windup s planté, bâton qui s'embrase (télégraphe), puis CAST.count feux follets
//     (Wisp) ; attente CAST.cooldown ; au plus MAX_WISPS en jeu. Il est vulnérable pendant l'incantation ;
//   - saut de cendres : quand le chevalier le serre de près, il s'échappe d'un bond (evade rapide) ; attente.
class Veilleur extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        const V = Veilleur.STATS;
        this.r = V.r;
        this.baseSpeed = V.maxSpeed;
        this.baseForce = V.maxForce;
        this.maxSpeed = V.maxSpeed;
        this.maxForce = V.maxForce;
        this.vel.set(0, 0);
        this.pathLength = 0;
        this.maxHp = V.hp;
        this.hp = V.hp;
        this.facing = Math.PI;
        this.cast = null;          // incantation en cours : { t }
        this.castCooldown = 1.5;   // première invocation peu après le début
        this.blink = null;         // saut de cendres en cours : { t }
        this.blinkCooldown = 0;
        this.pendingWisps = 0;     // feux follets à créer (le combat les crée)
        this.hurtTimer = 0;
        this.time = 0;
        this.forces = [];
        this.pillars = null;
        this.stats = { casts: 0, blinks: 0, damageDealt: 0 };
    }

    get alive() {
        return this.hp > 0;
    }

    flee(target) {
        return Steering.flee(this, target);
    }

    steer(name, force, target = null) {
        this.forces.push({ name: name, force: force.copy(), target: target ? { x: target.x, y: target.y } : null });
        this.applyForce(force);
    }

    /** Décision → forces et techniques. decision : { mode: 'keep' | 'flee', side, cast, blink }. */
    control(decision, player, arena) {
        this.forces = [];
        const V = Veilleur;
        if (!this.alive) {
            this.steer('arrive', this.arrive(this.pos), this.pos);
            return;
        }
        if (decision.blink && this.blinkCooldown <= 0 && !this.cast && !this.blink) {
            this.blink = { t: 0 };
            this.blinkCooldown = V.BLINK.cooldown;
            this.maxSpeed = V.BLINK.maxSpeed;
            this.maxForce = V.BLINK.maxForce;
            this.stats.blinks++;
        }
        if (this.blink) {
            this.steer('evade', Steering.evade(this, player, 0.25), Steering.predict(player, 0.25));
        } else if (this.cast) {
            this.steer('arrive', this.arrive(this.pos), this.pos);   // planté pendant l'incantation
        } else if (decision.mode === 'flee') {
            this.steer('flee', this.flee(player.pos), player.pos);
        } else {
            const point = Steering.keepDistancePoint(this, player.pos, V.KEEP);
            this.steer('arrive', this.arrive(point), point);
            const orbit = Steering.orbitPoint(this, player.pos, Math.max(1, Math.hypot(this.pos.x - player.pos.x, this.pos.y - player.pos.y)), decision.side, 90);
            this.steer('seek', this.seek(orbit).mult(0.6), orbit);
        }
        if (this.pillars) this.steer('avoid', Steering.avoidZones(this, this.pillars.filter(p => p.alive), 60, 8).mult(1.5));
        this.steer('stayInside', Steering.stayInside(this, arena, 60).mult(1.5));
        this.facing = Math.atan2(player.pos.y - this.pos.y, player.pos.x - this.pos.x);
        if (decision.cast && this.castCooldown <= 0 && !this.cast && !this.blink) {
            this.cast = { t: 0 };
            this.stats.casts++;
        }
    }

    receiveHit(damage) {
        if (!this.alive || this.blink) return false;   // insaisissable pendant le saut
        this.hp = Math.max(0, this.hp - damage);
        this.hurtTimer = 0.2;
        return true;
    }

    tick(dt) {
        const V = Veilleur;
        this.time += dt;
        if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
        if (this.castCooldown > 0) this.castCooldown = Math.max(0, this.castCooldown - dt);
        if (this.blinkCooldown > 0) this.blinkCooldown = Math.max(0, this.blinkCooldown - dt);
        if (this.cast) {
            this.cast.t += dt;
            if (this.cast.t >= V.CAST.windup - 1e-9) {
                this.pendingWisps = V.CAST.count;
                this.cast = null;
                this.castCooldown = V.CAST.cooldown;
            }
        }
        if (this.blink) {
            this.blink.t += dt;
            if (this.blink.t >= V.BLINK.duration - 1e-9) {
                this.blink = null;
                this.maxSpeed = this.baseSpeed;
                this.maxForce = this.baseForce;
            }
        }
    }

    show() {
        if (!this.alive) return;
        push();
        noStroke();
        fill(0, 0, 0, 90);
        ellipse(this.pos.x + 3, this.pos.y + 5, this.r * 2.3, this.r * 1.9);
        // Saut de cendres : traînée de braises
        if (this.blink) {
            fill(255, 140, 60, 70);
            const back = this.vel.copy().setMag(this.r * 2);
            circle(this.pos.x - back.x, this.pos.y - back.y, this.r * 2);
        }
        translate(this.pos.x, this.pos.y);
        rotate(this.facing);
        const hurt = this.hurtTimer > 0;
        // Robe à capuche
        fill(hurt ? color(180, 90, 80) : color(52, 40, 46));
        stroke(15);
        strokeWeight(1.5);
        beginShape();
        vertex(this.r * 0.9, 0);
        vertex(-this.r * 0.6, -this.r * 1.05);
        vertex(-this.r * 1.3, -this.r * 0.4);
        vertex(-this.r * 1.3, this.r * 0.4);
        vertex(-this.r * 0.6, this.r * 1.05);
        endShape(CLOSE);
        fill(30, 24, 28);
        circle(this.r * 0.15, 0, this.r * 1.2);
        noStroke();
        fill(255, 150, 60, 220);
        circle(this.r * 0.45, -this.r * 0.18, 3);
        circle(this.r * 0.45, this.r * 0.18, 3);
        // Bâton : la braise grossit pendant l'incantation
        stroke(90, 60, 40);
        strokeWeight(3);
        line(this.r * 0.2, this.r * 0.8, this.r * 1.5, this.r * 0.9);
        noStroke();
        const k = this.cast ? this.cast.t / Veilleur.CAST.windup : 0;
        fill(255, 130, 40, 120 + 120 * k);
        circle(this.r * 1.55, this.r * 0.9, 6 + 14 * k);
        pop();
    }

    /** Télégraphe de l'incantation (au-dessus de l'obscurité) : un cercle de braises qui se referme. */
    showTelegraph() {
        if (!this.alive || !this.cast) return;
        const k = this.cast.t / Veilleur.CAST.windup;
        push();
        noFill();
        stroke(255, 140, 50, 80 + 170 * k);
        strokeWeight(2 + 2 * k);
        circle(this.pos.x, this.pos.y, this.r * 2 + (1 - k) * 70);
        pop();
    }
}

Veilleur.STATS = { hp: 200, r: 18, maxSpeed: 2.8, maxForce: 0.2 };   // un peu moins vif que le chevalier (3,2)
Veilleur.KEEP = 250;            // distance de garde (px) : il reste loin pour lancer ses feux follets
Veilleur.CAST = { windup: 0.8, count: 3, cooldown: 3.0 };
Veilleur.BLINK = { duration: 0.35, cooldown: 2.8, maxSpeed: 7, maxForce: 1.4 };
Veilleur.MAX_WISPS = 6;
