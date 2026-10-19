// « Game feel » du combat au clavier : tremblement d'écran, flash quand on est touché, gel d'impact et ralenti
// final. Module pur (temps réel en secondes) : il réagit aux événements du combat et donne
//   timeScale() : vitesse à laquelle le câblage fait avancer le temps de la simulation (0 pendant un gel
//                 d'impact, 1 sinon). Chaque pas de simulation reste identique : seul le moment où il est joué
//                 change. Utilisé UNIQUEMENT pour le combat au clavier, jamais à l'entraînement ni en comparaison ;
//   visualScale() : vitesse de l'horloge des animations (ralenti après la mort du boss : le combat est fini,
//                 seul le bandeau et la dissolution du boss ralentissent) ;
//   shake(t)    : décalage de caméra { x, y } en pixels, proportionnel au carré du « trauma » (qui s'amortit).
class GameFeel {
    constructor() {
        this.trauma = 0;      // 0..1
        this.hitStop = 0;     // secondes de gel restantes
        this.slowMo = 0;      // secondes de ralenti restantes
        this.flash = 0;       // 0..1, flash rouge quand le joueur est touché
    }

    addTrauma(k) {
        this.trauma = Math.min(1, this.trauma + k);
    }

    /** Réaction aux événements d'un pas de combat (Fight.events). */
    onEvents(events) {
        const F = GameFeel;
        for (const e of events) {
            if (e.type === 'hit' && e.who === 'boss') {
                this.addTrauma(F.TRAUMA.playerHit);
                this.flash = 1;
                this.hitStop = Math.max(this.hitStop, F.HITSTOP.heavy);
            } else if (e.type === 'hit' && e.who === 'player') {
                const k = e.critical ? 'critical' : e.kind === 'heavy' ? 'heavy' : 'light';
                this.addTrauma(F.TRAUMA[k]);
                this.hitStop = Math.max(this.hitStop, F.HITSTOP[k]);
            } else if (e.type === 'parry') {
                this.addTrauma(F.TRAUMA.parry);
                this.hitStop = Math.max(this.hitStop, F.HITSTOP.parry);
            } else if (e.type === 'crash') {
                this.addTrauma(F.TRAUMA.crash);
            } else if (e.type === 'crumble') {
                this.addTrauma(F.TRAUMA.crumble);
            }
        }
    }

    /** Mort du boss : ralenti des animations finales. */
    onBossDeath() {
        this.slowMo = GameFeel.SLOW_DURATION;
        this.addTrauma(GameFeel.TRAUMA.crumble);
    }

    timeScale() {
        return this.hitStop > 0 ? 0 : 1;
    }

    visualScale() {
        return this.slowMo > 0 ? GameFeel.SLOW_SCALE : 1;
    }

    /** Avance de `dt` secondes de temps réel. */
    update(dt) {
        this.hitStop = Math.max(0, this.hitStop - dt);
        this.slowMo = Math.max(0, this.slowMo - dt);
        this.trauma = Math.max(0, this.trauma - GameFeel.DECAY * dt);
        this.flash = Math.max(0, this.flash - GameFeel.FLASH_DECAY * dt);
    }

    /** Décalage de caméra (pixels), borné par MAX_SHAKE ; `t` donne une vibration régulière et reproductible. */
    shake(t) {
        const a = GameFeel.MAX_SHAKE * this.trauma * this.trauma;
        return { x: a * Math.sin(t * 61.3) * Math.cos(t * 17.1), y: a * Math.sin(t * 47.9 + 1.3) };
    }

    reset() {
        this.trauma = 0;
        this.hitStop = 0;
        this.slowMo = 0;
        this.flash = 0;
    }
}

GameFeel.TRAUMA = { light: 0.18, heavy: 0.32, playerHit: 0.55, crash: 0.6, crumble: 0.85, parry: 0.3, critical: 0.7 };
GameFeel.HITSTOP = { light: 0.06, heavy: 0.09, parry: 0.12, critical: 0.16 };   // secondes (repères courants : 50 à 100 ms)
GameFeel.DECAY = 1.6;          // trauma perdu par seconde
GameFeel.FLASH_DECAY = 3;      // le flash disparaît en 1/3 s
GameFeel.MAX_SHAKE = 14;       // pixels
GameFeel.SLOW_DURATION = 1.6;  // secondes de ralenti à la mort du boss
GameFeel.SLOW_SCALE = 0.3;     // vitesse des animations pendant ce ralenti
