// Caméra : l'arène entière tient dans le canvas ; en verrouillage (lock-on), la caméra se rapproche
// et se cale sur le milieu entre le chevalier et le boss, sans montrer l'extérieur de l'arène.
class Camera {
    constructor() {
        this.scale = 1;
        this.cx = 500;
        this.cy = 350;
    }

    /** Cadrage visé (pur) : { scale, cx, cy } en coordonnées de l'arène. */
    static target(arena, viewW, viewH, locked, player, boss) {
        const fit = Math.min(viewW / arena.width, viewH / arena.height);
        if (!locked || !player || !boss) return { scale: fit, cx: arena.width / 2, cy: arena.height / 2 };
        const scale = fit * Camera.LOCK_ZOOM;
        const halfW = viewW / scale / 2, halfH = viewH / scale / 2;
        let cx = (player.pos.x + boss.pos.x) / 2;
        let cy = (player.pos.y + boss.pos.y) / 2;
        // On ne sort pas de l'arène (si la vue est plus grande que l'arène, on la centre)
        cx = halfW * 2 >= arena.width ? arena.width / 2 : Math.min(arena.width - halfW, Math.max(halfW, cx));
        cy = halfH * 2 >= arena.height ? arena.height / 2 : Math.min(arena.height - halfH, Math.max(halfH, cy));
        return { scale: scale, cx: cx, cy: cy };
    }

    /**
     * Cadrage contre un GROUPE (la meute) : zoom constant (GROUP_ZOOM), centré entre le chevalier et le centre des
     * membres vivants proches (à moins de GROUP_RADIUS px). Il ne dépend pas du verrouillage : la cible verrouillée
     * change sans cesse de Creux, un cadrage verrouillé sauterait de l'un à l'autre.
     */
    static groupTarget(arena, viewW, viewH, player, members) {
        const fit = Math.min(viewW / arena.width, viewH / arena.height);
        const scale = fit * Camera.GROUP_ZOOM;
        let cx = player.pos.x, cy = player.pos.y;
        const near = (members || []).filter(m => m.alive !== false && Math.hypot(m.pos.x - player.pos.x, m.pos.y - player.pos.y) < Camera.GROUP_RADIUS);
        if (near.length) {
            const mx = near.reduce((s, m) => s + m.pos.x, 0) / near.length, my = near.reduce((s, m) => s + m.pos.y, 0) / near.length;
            cx = 0.6 * player.pos.x + 0.4 * mx;
            cy = 0.6 * player.pos.y + 0.4 * my;
        }
        const halfW = viewW / scale / 2, halfH = viewH / scale / 2;
        cx = halfW * 2 >= arena.width ? arena.width / 2 : Math.min(arena.width - halfW, Math.max(halfW, cx));
        cy = halfH * 2 >= arena.height ? arena.height / 2 : Math.min(arena.height - halfH, Math.max(halfH, cy));
        return { scale: scale, cx: cx, cy: cy };
    }

    /** Glissement doux vers le cadrage visé (dt en secondes). */
    follow(t, dt) {
        const k = 1 - Math.exp(-Camera.SMOOTH * dt);
        this.scale += (t.scale - this.scale) * k;
        this.cx += (t.cx - this.cx) * k;
        this.cy += (t.cy - this.cy) * k;
    }

    snap(t) {
        this.scale = t.scale;
        this.cx = t.cx;
        this.cy = t.cy;
    }

    apply(viewW, viewH) {
        translate(viewW / 2, viewH / 2);
        scale(this.scale);
        translate(-this.cx, -this.cy);
    }
}

Camera.LOCK_ZOOM = 1.3;
Camera.SMOOTH = 5;
Camera.GROUP_ZOOM = 1.2;
Camera.GROUP_RADIUS = 320;
