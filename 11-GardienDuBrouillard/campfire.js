// Feu de camp : point de réapparition du chevalier. Entité visible, donc sous-classe de Vehicle,
// mais immobile (vitesse et force maximales nulles) : elle ne fait que scintiller.
class Campfire extends Vehicle {
    constructor(x, y) {
        super(x, y, null);
        this.vel.set(0, 0);
        this.maxSpeed = 0;
        this.maxForce = 0;
        this.r = 16;
    }

    show(timeSeconds) {
        const flick = Math.sin(timeSeconds * 13) * 0.5 + Math.sin(timeSeconds * 7.3) * 0.5;
        push();
        translate(this.pos.x, this.pos.y);
        noStroke();
        // Lueur
        for (let i = 4; i >= 1; i--) {
            fill(255, 150, 50, 10);
            circle(0, 0, 60 * i + flick * 8);
        }
        // Bûches et épée plantée (comme les feux de camp des jeux Souls)
        stroke(70, 40, 20);
        strokeWeight(6);
        line(-14, 10, 14, -2);
        line(-14, -2, 14, 10);
        stroke(150, 150, 160);
        strokeWeight(3);
        line(0, 6, 4, -26);
        noStroke();
        fill(255, 120, 30, 220);
        ellipse(0, 0, 22 + flick * 4, 30 + flick * 6);
        fill(255, 220, 120, 230);
        ellipse(0, 3, 10 + flick * 2, 16 + flick * 3);
        pop();
    }
}
