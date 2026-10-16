// Disposition du HUD de combat, façon Souls, calculée pour la taille de l'écran (fonction pure, testée) :
//   en haut à gauche : barre de vie, barre d'endurance, puis les fioles d'Estus ;
//   en haut à droite : le compteur de morts ;
//   en bas, centrée : la barre de vie du boss, son nom au-dessus.
// Toutes les tailles sont bornées : le HUD reste lisible sur un petit écran et ne s'étale pas sur un grand.
const HudLayout = {
    clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    },

    compute(w, h) {
        const C = HudLayout.clamp;
        const m = Math.round(C(Math.min(w, h) * 0.035, 12, 32));        // marge
        const barH = Math.round(C(h * 0.016, 8, 14));                     // épaisseur des barres
        const hpW = Math.round(C(w * 0.28, 140, 380));
        const hp = { x: m, y: m, w: hpW, h: barH };
        const stamina = { x: m, y: hp.y + barH + 6, w: Math.round(hpW * 0.75), h: Math.max(5, Math.round(barH * 0.6)) };
        const flaskSize = Math.round(C(barH * 1.6, 12, 22));
        const flasks = { x: m, y: stamina.y + stamina.h + 10, size: flaskSize, gap: Math.round(flaskSize * 0.35) };
        const bossW = Math.round(C(w * 0.6, Math.min(240, w - 2 * m), 780));
        const boss = { x: Math.round((w - bossW) / 2), y: h - m - barH, w: bossW, h: barH };
        const fontSize = Math.round(C(h * 0.022, 11, 18));
        return {
            margin: m,
            fontSize: fontSize,
            hp: hp,
            stamina: stamina,
            flasks: flasks,
            deaths: { x: w - m, y: m },
            boss: boss,
            bossName: { x: boss.x, y: boss.y - 8 },
            // Messages (dans la brume, astuces) sous les fioles
            message: { x: m, y: flasks.y + flaskSize + 10 }
        };
    }
};
