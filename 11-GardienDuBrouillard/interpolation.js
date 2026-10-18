// Interpolation du rendu (affichage seulement). La simulation avance à pas fixe (Combat.DT = 1/60 s), mais
// l'écran peut afficher 60, 75, 120 ou 144 images par seconde : sans interpolation, certaines images montrent
// deux fois le même état et d'autres sautent un pas, d'où des à-coups.
//
// Avant chaque pas, on note la position des entités (snapshot). Au moment de dessiner, il reste
// `accumulateur` secondes de temps réel pas encore simulées : alpha = accumulateur / DT, dans [0, 1[.
// Chaque entité est dessinée à la position prev + alpha × (pos − prev) : on la décale de
// (1 − alpha) × (prev − pos) avec un translate autour de son dessin. Rien n'est modifié dans l'état du jeu.
const Interpolation = {
    /** Positions des entités avant un pas : Map entité → { x, y }. */
    snapshot(entities) {
        const m = new Map();
        for (const e of entities) if (e) m.set(e, { x: e.pos.x, y: e.pos.y });
        return m;
    },

    /** Fraction d'un pas déjà écoulée, dans [0, 1]. */
    alpha(accumulator, dt) {
        return Math.max(0, Math.min(1, accumulator / dt));
    },

    /**
     * Décalage de dessin de l'entité : (1 − alpha) × (prev − pos). Nul sans position précédente ou quand le saut
     * dépasse `maxJump` px (téléportation : réapparition, nouveau combat).
     */
    offset(entity, prev, alpha, maxJump = 60) {
        const p = prev && prev.get(entity);
        if (!p) return { x: 0, y: 0 };
        const dx = p.x - entity.pos.x, dy = p.y - entity.pos.y;
        if (Math.hypot(dx, dy) > maxJump) return { x: 0, y: 0 };
        return { x: (1 - alpha) * dx, y: (1 - alpha) * dy };
    },

    /** Entités dont on interpole le dessin dans un combat (chevalier, boss, Creux). */
    entitiesOf(fight) {
        return [fight.player].concat(fight.boss ? [fight.boss] : [], fight.creux || []);
    }
};
