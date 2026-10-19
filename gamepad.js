// Manette (API Gamepad du navigateur, disposition « standard », celle d'une manette Xbox). Module pur : le
// câblage (sketch.js) lit navigator.getGamepads() à chaque image et passe l'état à update() ; rien ici ne lit
// le navigateur, on peut donc le tester avec de fausses manettes.
//
// Disposition des jeux Souls :
//   stick gauche : se déplacer (zone morte DEADZONE, mise à l'échelle radiale) ; croix : se déplacer aussi
//   RB : attaque légère · RT : attaque lourde · LT : parade · B : roulade · X : fiole d'Estus
//   R3 (clic du stick droit) ou Y : verrouiller · Start : pause
//   Menus : A valider · B retour · croix ou stick haut / bas : choisir
//
// update() retourne { move, pressed, connected } : `move` est le déplacement analogique (ou null au repos),
// `pressed` les boutons qui viennent d'être enfoncés à cette image (front montant), par nom, plus « stickUp » et
// « stickDown » quand le stick gauche bascule franchement vers le haut ou le bas.
//
// Le choix de l'appareil est laissé au joueur (Options) : « clavier et manette » ou « clavier seulement ».
const Controls = {
    KEY: 'gardienDuBrouillard.controls.v1',
    MODES: { auto: "Clavier et manette", clavier: "Clavier seulement" },
    DEFAULT: 'auto',

    load(storage) {
        try {
            const v = storage ? storage.getItem(Controls.KEY) : null;
            return Controls.MODES[v] ? v : Controls.DEFAULT;
        } catch (e) {
            return Controls.DEFAULT;
        }
    },

    save(storage, mode) {
        if (!Controls.MODES[mode]) throw new RangeError("Mode de contrôle inconnu : " + mode);
        try {
            if (!storage) return false;
            storage.setItem(Controls.KEY, mode);
            return true;
        } catch (e) {
            return false;
        }
    }
};
const Pad = {
    DEADZONE: 0.22,
    TRIGGER: 0.5,          // une gâchette (RT, LT) compte comme enfoncée au-delà de cette valeur
    MENU_TILT: 0.6,        // stick incliné au-delà : « haut » ou « bas » dans les menus
    // Index des boutons dans la disposition standard
    BUTTONS: { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15 },
    // Action de combat (HumanController) de chaque bouton
    ACTIONS: { rb: 'light', rt: 'heavy', lt: 'parry', b: 'roll', x: 'drink', r3: 'lock', y: 'lock' },

    /** Stick avec zone morte radiale : nul au centre, puis remis à l'échelle de 0 à 1 (pas de saut). */
    stick(x, y, dead = Pad.DEADZONE) {
        const m = Math.hypot(x, y);
        if (m <= dead) return { x: 0, y: 0 };
        const k = Math.min(1, (m - dead) / (1 - dead)) / m;
        return { x: x * k, y: y * k };
    },

    /** Le bouton est-il enfoncé ? (les gâchettes ont une valeur analogique) */
    down(pad, name) {
        const b = pad && pad.buttons ? pad.buttons[Pad.BUTTONS[name]] : null;
        if (!b) return false;
        if (typeof b === 'number') return b > Pad.TRIGGER;
        return !!b.pressed || (typeof b.value === 'number' && b.value > Pad.TRIGGER);
    }
};

class GamepadInput {
    constructor() {
        this.previous = {};    // état des boutons à l'image précédente
        this.id = null;        // nom de la manette branchée
    }

    /** `pad` : une manette (navigator.getGamepads()[i]) ou null. */
    update(pad) {
        if (!pad || pad.connected === false) {
            this.previous = {};
            this.id = null;
            return { connected: false, move: null, pressed: [] };
        }
        this.id = pad.id || "manette";
        const pressed = [];
        const now = {};
        for (const name in Pad.BUTTONS) {
            now[name] = Pad.down(pad, name);
            if (now[name] && !this.previous[name]) pressed.push(name);
        }
        // Stick poussé franchement vers le haut ou le bas : comme la croix, pour choisir dans les menus
        const axes = pad.axes || [];
        now.stickUp = (axes[1] || 0) < -Pad.MENU_TILT;
        now.stickDown = (axes[1] || 0) > Pad.MENU_TILT;
        for (const name of ['stickUp', 'stickDown']) if (now[name] && !this.previous[name]) pressed.push(name);
        this.previous = now;
        let move = Pad.stick(axes[0] || 0, axes[1] || 0);
        // La croix déplace aussi (pleine vitesse)
        const dx = (now.right ? 1 : 0) - (now.left ? 1 : 0), dy = (now.down ? 1 : 0) - (now.up ? 1 : 0);
        if (dx || dy) move = { x: dx, y: dy };
        return { connected: true, move: move.x || move.y ? move : null, pressed: pressed };
    }

    /** Première manette branchée d'une liste (navigator.getGamepads() peut contenir des trous). */
    static first(list) {
        for (const p of list || []) if (p && p.connected !== false) return p;
        return null;
    }
}
