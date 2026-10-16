// Animation des grands bandeaux « VOUS ÊTES MORT » et « ENNEMI VAINCU » (fonctions pures du temps, en
// secondes, testées). Le dessin est dans hud.js ; ici, seulement les courbes :
//   band    : ouverture du bandeau sombre (0 → 1) ;
//   text    : opacité du texte (0 → 1) ;
//   spacing : espacement des lettres, en fraction de la taille du texte (il s'élargit lentement) ;
//   black   : fondu au noir de la fin (mort seulement : on repart du feu de camp).
// Les durées correspondent au jeu : après une mort, la réapparition a lieu à DURATION.death secondes.
const Banner = {
    DURATION: { death: 3.5, victory: 5 },

    /** Transition douce de 0 (avant a) à 1 (après b). */
    smoothstep(a, b, x) {
        if (b <= a) return x >= b ? 1 : 0;
        const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return k * k * (3 - 2 * k);
    },

    state(kind, t) {
        if (kind !== 'death' && kind !== 'victory') throw new RangeError("Bandeau inconnu : " + kind);
        const S = Banner.smoothstep;
        const end = Banner.DURATION[kind];
        return {
            band: S(0, 0.5, t),
            text: S(0.25, 1.1, t),
            spacing: 0.04 + 0.22 * S(0.25, end, t),
            black: kind === 'death' ? S(end - 1, end, t) : 0
        };
    }
};
