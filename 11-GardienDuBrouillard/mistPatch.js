// Nappe de brume posée par le souffle du boss. Entité visible du monde, donc sous-classe de Vehicle,
// mais immobile (vitesse et force maximales nulles). Elle vit `lifetime` secondes, brûle et ralentit
// le chevalier qui s'y trouve. Le combat (fight.js) la crée, l'applique et la retire ; il en garde au
// plus Combat.BOSS.breath.maxZones (la plus ancienne disparaît).
class MistPatch extends Vehicle {
    constructor(x, y, radius, lifetime) {
        super(x, y, null);
        this.vel.set(0, 0);
        this.maxSpeed = 0;
        this.maxForce = 0;
        this.radius = radius;
        this.r = radius;
        this.lifetime = lifetime;
        this.age = 0;
    }

    get alive() {
        return this.age < this.lifetime;
    }

    contains(entity) {
        return Math.hypot(entity.pos.x - this.pos.x, entity.pos.y - this.pos.y) < this.radius + entity.r * 0.5;
    }

    tick(dt) {
        this.age += dt;
    }

    show(timeSeconds) {
        // Apparition puis disparition en fondu ; volutes qui tournent
        const fadeIn = Math.min(1, this.age / 0.3);
        const fadeOut = Math.min(1, (this.lifetime - this.age) / 0.8);
        const a = Math.max(0, Math.min(fadeIn, fadeOut));
        push();
        translate(this.pos.x, this.pos.y);
        noStroke();
        fill(90, 200, 160, 40 * a);
        circle(0, 0, this.radius * 2);
        for (let i = 0; i < 6; i++) {
            const ang = timeSeconds * 0.8 + i * Math.PI / 3;
            fill(150, 240, 200, 35 * a);
            circle(Math.cos(ang) * this.radius * 0.45, Math.sin(ang) * this.radius * 0.45, this.radius * 0.9);
        }
        noFill();
        stroke(120, 255, 200, 90 * a);
        strokeWeight(2);
        circle(0, 0, this.radius * 2);
        pop();
    }
}
