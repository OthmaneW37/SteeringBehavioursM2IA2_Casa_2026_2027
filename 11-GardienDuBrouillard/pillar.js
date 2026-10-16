// Pilier en ruine : obstacle rond de l'arène. Entité visible du monde, donc sous-classe de Vehicle,
// mais immobile (vitesse et force maximales nulles).
//   - Les corps ne le traversent pas (le combat les repousse hors du pilier, comme le mur de l'arène).
//   - Le boss et le joueur robot le contournent avec l'évitement d'obstacles (Steering.avoidZones).
//   - Il bloque les coups et la ligne de vue (Combat.blocker) : on peut s'y abriter pour boire.
//   - Une ruée du boss qui le percute l'abîme ; après Combat.PILLAR.hp chocs, il s'effondre et disparaît.
// Chaque combat crée ses propres piliers (fight.js) : un pilier effondré revient au combat suivant.
class Pillar extends Vehicle {
    constructor(x, y, radius = Combat.PILLAR.r, hp = Combat.PILLAR.hp) {
        super(x, y, null);
        this.vel.set(0, 0);
        this.maxSpeed = 0;
        this.maxForce = 0;
        this.radius = radius;
        this.r = radius;
        this.maxHp = hp;
        this.hp = hp;
        this.shakeTimer = 0;   // tremblement après un choc (effet visuel, secondes)
    }

    get alive() {
        return this.hp > 0;
    }

    /** Choc d'une ruée : un point de solidité en moins. Retourne true si le pilier s'effondre. */
    crack() {
        if (!this.alive) return false;
        this.hp--;
        this.shakeTimer = 0.4;
        return !this.alive;
    }

    /**
     * Collision : un corps qui chevauche le pilier est repoussé sur son bord et perd sa vitesse vers
     * le pilier (comme Arena.constrain pour les murs). Retourne true s'il y avait contact.
     */
    pushOut(entity) {
        if (!this.alive) return false;
        const dx = entity.pos.x - this.pos.x, dy = entity.pos.y - this.pos.y;
        const d = Math.hypot(dx, dy);
        const min = this.radius + entity.r;
        if (d >= min) return false;
        const nx = d > 1e-9 ? dx / d : 1, ny = d > 1e-9 ? dy / d : 0;
        entity.pos.x = this.pos.x + nx * min;
        entity.pos.y = this.pos.y + ny * min;
        const vn = entity.vel.x * nx + entity.vel.y * ny;
        if (vn < 0) {
            entity.vel.x -= vn * nx;
            entity.vel.y -= vn * ny;
        }
        return true;
    }

    /** Point abrité derrière le pilier, à l'opposé de la menace (le joueur robot s'y cache pour boire). */
    coverPoint(threatPos, bodyRadius, margin = 8) {
        let dx = this.pos.x - threatPos.x, dy = this.pos.y - threatPos.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
        const k = (this.radius + bodyRadius + margin) / d;
        return { x: this.pos.x + dx * k, y: this.pos.y + dy * k };
    }

    tick(dt) {
        if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    /** Dessin ; `light` (facultatif) : position du feu de camp, l'ombre part à l'opposé. */
    show(light = null) {
        if (!this.alive) return;
        const shake = this.shakeTimer > 0 ? Math.sin(this.shakeTimer * 80) * 3 : 0;
        push();
        translate(this.pos.x + shake, this.pos.y);
        noStroke();
        // Ombre portée : allongée à l'opposé de la lumière, d'autant plus longue que le feu est proche
        if (light) {
            const dx = this.pos.x - light.x, dy = this.pos.y - light.y;
            const d = Math.hypot(dx, dy) || 1;
            const len = this.radius * (1.2 + 260 / Math.max(d, 120));
            push();
            rotate(Math.atan2(dy, dx));
            fill(0, 0, 0, 70);
            ellipse(len * 0.5, 0, len + this.radius * 1.2, this.radius * 1.9);
            fill(0, 0, 0, 50);
            ellipse(len * 0.85, 0, len * 0.9, this.radius * 1.4);
            pop();
        }
        // Ombre, socle, fût
        fill(0, 0, 0, 90);
        circle(6, 8, this.radius * 2.2);
        fill(70, 66, 78);
        circle(0, 0, this.radius * 2.25);
        stroke(30);
        strokeWeight(2);
        fill(118, 112, 124);
        circle(0, 0, this.radius * 1.8);
        // Cannelures
        stroke(90, 86, 98);
        strokeWeight(1.5);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            line(Math.cos(a) * this.radius * 0.35, Math.sin(a) * this.radius * 0.35, Math.cos(a) * this.radius * 0.85, Math.sin(a) * this.radius * 0.85);
        }
        // Fissures : une par choc reçu
        stroke(25);
        strokeWeight(2.5);
        if (this.hp < this.maxHp) {
            line(-this.radius * 0.7, -this.radius * 0.2, 0, this.radius * 0.1);
            line(0, this.radius * 0.1, this.radius * 0.5, this.radius * 0.6);
        }
        pop();
    }
}
