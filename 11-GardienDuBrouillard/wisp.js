// Feu follet : flamme lancée par le Veilleur des cendres. Sous-classe de Vehicle (vehicle.js, protégé).
//
// Steering : pursue du chevalier (position future, Steering.pursue) + séparation des autres feux follets
// (Flocking.separation : ils ne s'empilent pas). Sa force maximale est faible : il tourne large, un pas de côté au
// dernier moment le fait passer à côté (c'est tout l'intérêt de pursue face à seek : il vise où l'on VA).
// Il s'éteint après LIFETIME s, explose au contact du chevalier (sauf pendant les images d'invulnérabilité de la
// roulade) et un coup d'épée le dissipe. Temps en secondes.
class Wisp extends Vehicle {
    constructor(x, y, heading = 0) {
        super(x, y, null);
        this.r = Wisp.R;
        this.maxSpeed = Wisp.SPEED;
        this.maxForce = Wisp.FORCE;
        this.vel.set(Math.cos(heading) * Wisp.SPEED * 0.6, Math.sin(heading) * Wisp.SPEED * 0.6);
        this.pathLength = 0;
        this.age = 0;
        this.hp = 1;
        this.forces = [];
    }

    get alive() {
        return this.hp > 0 && this.age < Wisp.LIFETIME;
    }

    flee(target) {
        return Steering.flee(this, target);
    }

    /** Forces : pursue du chevalier, séparation des autres feux follets, confinement. */
    control(player, wisps, arena) {
        this.forces = [];
        if (!this.alive) return;
        const add = (name, f) => {
            this.forces.push({ name: name, force: f.copy(), target: null });
            this.applyForce(f);
        };
        add('pursue', Steering.pursue(this, player, Wisp.PREDICT));
        add('separation', Flocking.separation(this, Flocking.neighbours(this, wisps, Wisp.SEPARATION), Wisp.SEPARATION).mult(1.2));
        add('stayInside', Steering.stayInside(this, arena, 20));
    }

    /** Dissipé (coup d'épée) ou explosé (contact). */
    burst() {
        this.hp = 0;
    }

    tick(dt) {
        this.age += dt;
    }

    show() {
        if (!this.alive) return;
        const fade = Math.min(1, (Wisp.LIFETIME - this.age) / 0.6);
        push();
        noStroke();
        const flick = Math.sin(this.age * 25 + this.pos.x) * 1.5;
        fill(255, 120, 40, 60 * fade);
        circle(this.pos.x, this.pos.y, this.r * 4 + flick);
        fill(255, 170, 70, 160 * fade);
        circle(this.pos.x, this.pos.y, this.r * 2.2);
        fill(255, 240, 190, 230 * fade);
        circle(this.pos.x, this.pos.y, this.r * 1.1);
        // Traînée dans le sens de la marche
        const back = this.vel.copy().setMag(this.r * 1.6);
        fill(255, 110, 30, 90 * fade);
        circle(this.pos.x - back.x, this.pos.y - back.y, this.r * 1.4);
        pop();
    }
}

Wisp.R = 8;
Wisp.SPEED = 2.9;        // un peu plus lent que le chevalier (3,2) : on peut le distancer
Wisp.FORCE = 0.12;       // il tourne large : un pas de côté au dernier moment l'évite
Wisp.PREDICT = 0.3;      // pursue : position du chevalier 0,3 s plus tard
Wisp.LIFETIME = 5;
Wisp.DAMAGE = 12;
Wisp.SEPARATION = 26;
