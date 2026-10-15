// Arène fermée : géométrie (bords, rayons vers les murs, mur physique) et rendu du décor.
// Les murs et le sol sont du décor, pas des entités : ils ne bougent pas et n'ont pas de steering.
class Arena {
    constructor(width = 1000, height = 700, wall = 28) {
        this.width = width;
        this.height = height;
        this.wall = wall;
        // Feu de camp (point de réapparition) et position de départ du boss
        this.campfirePos = { x: wall + 110, y: height - wall - 110 };
        this.bossStart = { x: width * 0.66, y: height * 0.38 };
        this.playerStart = { x: wall + 170, y: height - wall - 150 };
        // Dalles et brouillard : décor tiré une seule fois avec un aléatoire fixe
        this.decor = Arena.makeDecor(width, height, wall, 7);
    }

    /** Bords intérieurs pour un corps de rayon r (le centre doit rester dans ce rectangle). */
    inner(r = 0) {
        return { left: this.wall + r, top: this.wall + r, right: this.width - this.wall - r, bottom: this.height - this.wall - r };
    }

    /** Point ramené à au moins `margin` des murs ; `clamped` indique s'il a fallu le déplacer. */
    clampPoint(p, margin) {
        const b = this.inner(margin);
        const x = Math.min(b.right, Math.max(b.left, p.x));
        const y = Math.min(b.bottom, Math.max(b.top, p.y));
        return { x: x, y: y, clamped: x !== p.x || y !== p.y };
    }

    /**
     * Mur physique : un corps qui dépasse est remis contre le mur et perd sa vitesse vers le mur.
     * C'est la collision avec le décor, appliquée après la locomotion ; le pilotage reste
     * dans les forces (Steering.stayInside).
     */
    constrain(entity) {
        const b = this.inner(entity.r);
        if (entity.pos.x < b.left) { entity.pos.x = b.left; if (entity.vel.x < 0) entity.vel.x = 0; }
        if (entity.pos.x > b.right) { entity.pos.x = b.right; if (entity.vel.x > 0) entity.vel.x = 0; }
        if (entity.pos.y < b.top) { entity.pos.y = b.top; if (entity.vel.y < 0) entity.vel.y = 0; }
        if (entity.pos.y > b.bottom) { entity.pos.y = b.bottom; if (entity.vel.y > 0) entity.vel.y = 0; }
    }

    /** Distance depuis `pos` jusqu'au mur intérieur le long de l'angle donné, bornée à maxDist. */
    rayDistance(pos, angle, maxDist) {
        const b = this.inner(0);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let t = maxDist;
        if (dx > 1e-9) t = Math.min(t, (b.right - pos.x) / dx);
        if (dx < -1e-9) t = Math.min(t, (b.left - pos.x) / dx);
        if (dy > 1e-9) t = Math.min(t, (b.bottom - pos.y) / dy);
        if (dy < -1e-9) t = Math.min(t, (b.top - pos.y) / dy);
        return Math.max(0, t);
    }

    diagonal() {
        const b = this.inner(0);
        return Math.hypot(b.right - b.left, b.bottom - b.top);
    }

    // --- Rendu ---

    static makeDecor(w, h, wall, seed) {
        let s = seed;
        const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
        const slabs = [];
        for (let y = wall; y < h - wall; y += 70) {
            for (let x = wall; x < w - wall; x += 90) slabs.push({ x: x, y: y, shade: 34 + rnd() * 14, crack: rnd() < 0.25 });
        }
        const fog = [];
        for (let i = 0; i < 40; i++) fog.push({ x: rnd() * w, y: rnd() * h, r: 80 + rnd() * 160, speed: 6 + rnd() * 14, phase: rnd() * Math.PI * 2 });
        return { slabs: slabs, fog: fog };
    }

    showFloor() {
        push();
        noStroke();
        fill(14, 15, 20);
        rect(0, 0, this.width, this.height);
        for (const s of this.decor.slabs) {
            fill(s.shade, s.shade, s.shade + 6);
            rect(s.x + 2, s.y + 2, 86, 66, 3);
            if (s.crack) {
                stroke(20);
                strokeWeight(1);
                line(s.x + 20, s.y + 10, s.x + 50, s.y + 40);
                line(s.x + 50, s.y + 40, s.x + 70, s.y + 35);
                noStroke();
            }
        }
        // Murs
        fill(46, 42, 52);
        rect(0, 0, this.width, this.wall);
        rect(0, this.height - this.wall, this.width, this.wall);
        rect(0, 0, this.wall, this.height);
        rect(this.width - this.wall, 0, this.wall, this.height);
        stroke(80, 74, 90);
        strokeWeight(2);
        noFill();
        rect(this.wall, this.wall, this.width - 2 * this.wall, this.height - 2 * this.wall);
        pop();
    }

    /** Nappes de brouillard qui dérivent lentement (dessinées au-dessus des entités). */
    showFog(timeSeconds) {
        push();
        // Le brouillard reste dans l'arène
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(0, 0, this.width, this.height);
        drawingContext.clip();
        noStroke();
        for (const f of this.decor.fog) {
            const x = (f.x + timeSeconds * f.speed) % (this.width + 2 * f.r) - f.r;
            const y = f.y + Math.sin(timeSeconds * 0.3 + f.phase) * 20;
            fill(190, 200, 215, 6);
            circle(x, y, f.r * 2);
        }
        drawingContext.restore();
        pop();
    }
}
