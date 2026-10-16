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
        // Emplacements des piliers, dans l'ordre où ils sont posés (réglage « Piliers dans l'arène »).
        // Ils sont loin des points de départ et du feu de camp.
        this.pillarSlots = [
            { x: width * 0.42, y: height * 0.36 }, { x: width * 0.58, y: height * 0.67 },
            { x: width * 0.26, y: height * 0.43 }, { x: width * 0.76, y: height * 0.74 },
            { x: width * 0.78, y: height * 0.26 }, { x: width * 0.30, y: height * 0.80 }
        ];
        // Dalles : décor tiré une seule fois avec un aléatoire fixe (le brouillard animé est dans fog.js)
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

    /**
     * Distance depuis `pos` jusqu'au premier obstacle le long de l'angle donné, bornée à maxDist :
     * le mur intérieur, ou un pilier vivant de `obstacles` (cercles { pos, radius }).
     */
    rayDistance(pos, angle, maxDist, obstacles = null) {
        const b = this.inner(0);
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let t = maxDist;
        if (dx > 1e-9) t = Math.min(t, (b.right - pos.x) / dx);
        if (dx < -1e-9) t = Math.min(t, (b.left - pos.x) / dx);
        if (dy > 1e-9) t = Math.min(t, (b.bottom - pos.y) / dy);
        if (dy < -1e-9) t = Math.min(t, (b.top - pos.y) / dy);
        if (obstacles) {
            for (const o of obstacles) {
                if (o.alive === false) continue;
                // Intersection rayon / cercle : |pos + s·dir − centre| = rayon, plus petite solution s ≥ 0
                const fx = pos.x - o.pos.x, fy = pos.y - o.pos.y;
                const bq = fx * dx + fy * dy;
                const c = fx * fx + fy * fy - o.radius * o.radius;
                const disc = bq * bq - c;
                if (disc < 0) continue;
                const s = c <= 0 ? 0 : -bq - Math.sqrt(disc);
                if (s >= 0) t = Math.min(t, s);
            }
        }
        return Math.max(0, t);
    }

    /** Le point est-il dans un coin : à moins de `margin` px de deux murs à la fois (corps de rayon r) ? */
    inCorner(pos, r, margin) {
        const b = this.inner(r);
        const nearX = pos.x - b.left < margin || b.right - pos.x < margin;
        const nearY = pos.y - b.top < margin || b.bottom - pos.y < margin;
        return nearX && nearY;
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
        return { slabs: slabs };
    }

    /** Sol et murs : décor fixe, dessiné une fois dans un calque puis recopié (moins coûteux). */
    showFloor() {
        if (!this.floorCache && typeof createGraphics === 'function') {
            this.floorCache = createGraphics(this.width, this.height);
            this.floorCache.pixelDensity(1);
            this.drawFloor(this.floorCache);
        }
        if (this.floorCache) image(this.floorCache, 0, 0, this.width, this.height);
        else this.drawFloor(window);
    }

    /** Dessin du sol dans `g` (un calque p5, ou le canvas) : dalles, fissures, mousse, murs. */
    drawFloor(g) {
        g.push();
        g.noStroke();
        g.fill(12, 13, 18);
        g.rect(0, 0, this.width, this.height);
        for (const s of this.decor.slabs) {
            g.fill(s.shade - 4, s.shade - 2, s.shade + 4);
            g.rect(s.x + 2, s.y + 2, 86, 66, 3);
            // Bord éclairé en haut, ombré en bas : relief des dalles
            g.fill(255, 255, 255, 10);
            g.rect(s.x + 2, s.y + 2, 86, 4, 3);
            g.fill(0, 0, 0, 40);
            g.rect(s.x + 2, s.y + 63, 86, 5, 3);
            if (s.crack) {
                g.stroke(16);
                g.strokeWeight(1);
                g.line(s.x + 20, s.y + 10, s.x + 50, s.y + 40);
                g.line(s.x + 50, s.y + 40, s.x + 70, s.y + 35);
                g.noStroke();
                g.fill(60, 80, 55, 50);
                g.ellipse(s.x + 26, s.y + 52, 22, 10);
            }
        }
        // Murs
        g.fill(40, 36, 46);
        g.rect(0, 0, this.width, this.wall);
        g.rect(0, this.height - this.wall, this.width, this.wall);
        g.rect(0, 0, this.wall, this.height);
        g.rect(this.width - this.wall, 0, this.wall, this.height);
        g.stroke(84, 76, 92);
        g.strokeWeight(2);
        g.noFill();
        g.rect(this.wall, this.wall, this.width - 2 * this.wall, this.height - 2 * this.wall);
        g.pop();
    }

    /**
     * Coins dangereux (anti-camping) : le brouillard s'y épaissit en violet à mesure que le compteur du boss
     * monte (`danger` dans [0, 1]). Rien n'est dessiné quand le boss n'y est pas.
     */
    showCorners(r, margin, danger, timeSeconds) {
        if (danger <= 0) return;
        const b = this.inner(r);
        const pulse = 0.8 + 0.2 * Math.sin(timeSeconds * 6);
        push();
        noStroke();
        fill(150, 70, 230, 90 * danger * pulse);
        const w = b.left + margin, h = b.top + margin;
        rect(0, 0, w, h);
        rect(b.right - margin, 0, this.width - b.right + margin, h);
        rect(0, b.bottom - margin, w, this.height - b.bottom + margin);
        rect(b.right - margin, b.bottom - margin, this.width - b.right + margin, this.height - b.bottom + margin);
        pop();
    }
}
