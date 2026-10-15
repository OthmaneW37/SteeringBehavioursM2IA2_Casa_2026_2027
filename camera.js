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
