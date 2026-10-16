// Éclairage 2D (rendu seulement) : une obscurité générale, percée par des sources de lumière. Les sources sont
// calculées à partir de l'état du combat par une fonction pure (Lighting.sources, testée) ; LightLayer les
// dessine dans un calque en coordonnées de l'arène, à résolution réduite (Quality.lightScale), puis le calque
// est posé sur la scène avec la caméra. Les télégraphes et le HUD sont dessinés APRÈS : aucun danger n'est
// jamais caché par l'obscurité.
//
// Technique : le calque est rempli de noir semi-transparent, puis chaque lumière y « découpe » un trou en
// dégradé radial (globalCompositeOperation = 'destination-out'). Les lueurs colorées sont ajoutées par-dessus
// en mode additif (si la qualité le permet).
const Lighting = {
    DARKNESS: 0.58,   // opacité de l'obscurité hors des lumières

    /** Lumières du combat : { x, y, r, power (0..1), color [r, g, b] }. Ne modifie rien. */
    sources(fight, campfire, time) {
        const out = [];
        const flick = 0.5 * Math.sin(time * 13) + 0.5 * Math.sin(time * 7.3);
        if (campfire) out.push({ x: campfire.x, y: campfire.y, r: 320 + 14 * flick, power: 1, color: [255, 150, 60] });
        if (!fight) return out;
        const { player, boss } = fight;
        // Le chevalier porte une faible lueur : il reste lisible partout dans l'arène
        if (player.alive) out.push({ x: player.pos.x, y: player.pos.y, r: 175, power: 0.75, color: [200, 205, 230] });
        if (boss.alive) {
            const rage = boss.enraged;
            out.push({ x: boss.pos.x, y: boss.pos.y, r: rage ? 150 : 110, power: rage ? 0.75 : 0.55, color: rage ? [255, 70, 40] : [110, 200, 255] });
        }
        for (const z of fight.zones) {
            const fade = Math.max(0, Math.min(1, (z.lifetime - z.age) / 0.8, z.age / 0.3));
            out.push({ x: z.pos.x, y: z.pos.y, r: z.radius * 1.7, power: 0.45 * fade, color: [110, 240, 190] });
        }
        return out;
    }
};

class LightLayer {
    constructor(arena) {
        this.arena = arena;
        this.g = null;
        this.scale = 0;
    }

    ensure(scale) {
        if (this.g && this.scale === scale) return;
        if (this.g) this.g.remove();
        this.scale = scale;
        this.g = createGraphics(Math.max(1, Math.round(this.arena.width * scale)), Math.max(1, Math.round(this.arena.height * scale)));
        this.g.pixelDensity(1);
    }

    /** Dessine l'obscurité percée par les sources, puis la pose sur la scène (repère de l'arène). */
    draw(sources, quality, darkness = Lighting.DARKNESS) {
        this.ensure(quality.lightScale);
        const g = this.g, k = this.scale, ctx = g.drawingContext;
        g.clear();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(4,5,10,' + darkness + ')';
        ctx.fillRect(0, 0, g.width, g.height);
        ctx.globalCompositeOperation = 'destination-out';
        for (const s of sources) {
            const r = s.r * k;
            const grd = ctx.createRadialGradient(s.x * k, s.y * k, 0, s.x * k, s.y * k, r);
            grd.addColorStop(0, 'rgba(0,0,0,' + s.power + ')');
            grd.addColorStop(0.55, 'rgba(0,0,0,' + (s.power * 0.6) + ')');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(s.x * k, s.y * k, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        image(g, 0, 0, this.arena.width, this.arena.height);
        if (quality.glow) {
            push();
            blendMode(ADD);
            noStroke();
            for (const s of sources) {
                const c = drawingContext;
                const grd = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 0.45);
                grd.addColorStop(0, 'rgba(' + s.color.join(',') + ',' + (0.16 * s.power) + ')');
                grd.addColorStop(1, 'rgba(' + s.color.join(',') + ',0)');
                c.fillStyle = grd;
                c.beginPath();
                c.arc(s.x, s.y, s.r * 0.45, 0, Math.PI * 2);
                c.fill();
            }
            blendMode(BLEND);
            pop();
        }
    }
}
