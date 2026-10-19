// Brouillard animé (rendu seulement) : un bruit lisse (bruit de valeur, interpolé, deux octaves) qui dérive
// lentement, calculé sur une grille grossière (Quality.fogCells) une image sur `fogEvery`. La grille est
// ensuite composée dans le calque de lumière (LightLayer, petit) au lieu d'être étirée sur tout l'écran :
// c'est un grand dessin de moins par image. Les fonctions de bruit sont pures et reproductibles (testées) ;
// elles ne dépendent pas de p5.
const Fog = {
    SCALE: 0.0045,         // fréquence du bruit (par pixel d'arène)
    DRIFT: [9, 3],         // dérive (px/s) de la grande couche
    ALPHA: 115,            // opacité maximale du brouillard (sur 255)
    COLOR: [175, 188, 205],

    /** Valeur pseudo-aléatoire dans [0, 1] d'un point entier de la grille (hachage). */
    hash(ix, iy, seed) {
        let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967295;
    },

    /** Bruit de valeur lisse dans [0, 1]. */
    noise(x, y, seed = 1) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const fx = x - ix, fy = y - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const h = Fog.hash;
        const a = h(ix, iy, seed), b = h(ix + 1, iy, seed), c = h(ix, iy + 1, seed), d = h(ix + 1, iy + 1, seed);
        return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    },

    /** Densité du brouillard dans [0, 1] au point (x, y) de l'arène, à l'instant t (s). */
    density(x, y, t) {
        const s = Fog.SCALE;
        const n = 0.65 * Fog.noise(x * s - t * Fog.DRIFT[0] * s, y * s - t * Fog.DRIFT[1] * s, 1) +
            0.35 * Fog.noise(x * s * 2.3 + t * 0.02, y * s * 2.3, 2);
        return Math.max(0, Math.min(1, (n - 0.35) / 0.55));
    }
};

class FogLayer {
    constructor(arena) {
        this.arena = arena;
        this.g = null;
        this.cells = 0;
        this.frame = 0;
    }

    ensure(cells) {
        if (this.g && this.cells === cells) return false;
        if (this.g) this.g.remove();
        this.cells = cells;
        const rows = Math.max(1, Math.round(cells * this.arena.height / this.arena.width));
        this.g = createGraphics(cells, rows);
        this.g.pixelDensity(1);
        return true;
    }

    /** Recalcule la grille si c'est son tour. Retourne le calque (petit) à composer dans la lumière. */
    update(time, quality) {
        const fresh = this.ensure(quality.fogCells);
        if (fresh || this.frame % quality.fogEvery === 0) {
            const g = this.g, A = this.arena;
            const cw = A.width / g.width, ch = A.height / g.height;
            g.loadPixels();
            for (let j = 0; j < g.height; j++) {
                for (let i = 0; i < g.width; i++) {
                    const k = 4 * (j * g.width + i);
                    g.pixels[k] = Fog.COLOR[0];
                    g.pixels[k + 1] = Fog.COLOR[1];
                    g.pixels[k + 2] = Fog.COLOR[2];
                    g.pixels[k + 3] = Fog.ALPHA * Fog.density((i + 0.5) * cw, (j + 0.5) * ch, time);
                }
            }
            g.updatePixels();
        }
        this.frame++;
        return this.g;
    }

    /** Recalcule la grille, puis l'étire sur l'arène (repère de l'arène) : usage seul, sans calque de lumière. */
    draw(time, quality) {
        image(this.update(time, quality), 0, 0, this.arena.width, this.arena.height);
    }
}
