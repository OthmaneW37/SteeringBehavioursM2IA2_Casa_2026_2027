// Contrôleur du joueur humain : traduit le clavier et la manette en intention (même interface que le joueur
// scripté). Les touches sont données par le sketch (keyDown / keyUp), la manette par trigger() (boutons) et
// setPadMove() (stick) : le module ne lit ni le DOM ni le navigateur, il est testable.
//
// Une action demandée pendant une autre (attaque, roulade) est gardée BUFFER secondes, puis jouée
// dès que le chevalier peut agir — comme le tampon d'entrée des jeux Souls.
class HumanController {
    constructor() {
        this.held = new Set();
        this.locked = true;
        this.buffer = null;   // { action, age }
        this.padMove = null;  // déplacement du stick de la manette (ou null)
    }

    static actionOf(k) {
        for (const action in HumanController.KEYS) {
            if (HumanController.KEYS[action].includes(k)) return action;
        }
        return null;
    }

    keyDown(k) {
        const key = String(k).toLowerCase();
        const action = HumanController.actionOf(key);
        if (!action) return false;
        if (HumanController.MOVES.includes(action)) this.held.add(action);
        else this.trigger(action);
        return true;
    }

    /** Action ponctuelle (touche ou bouton de manette) : verrouillage, ou action gardée dans le tampon. */
    trigger(action) {
        if (action === 'lock') this.locked = !this.locked;
        else if (HumanController.BUFFERED.includes(action)) this.buffer = { action: action, age: 0 };
        else return false;
        return true;
    }

    /** Stick de la manette : { x, y } dans [−1, 1], ou null au repos. */
    setPadMove(move) {
        this.padMove = move;
    }

    keyUp(k) {
        const action = HumanController.actionOf(String(k).toLowerCase());
        if (action) this.held.delete(action);
    }

    intent(player, boss, arena, dt) {
        let move = {
            x: (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0),
            y: (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0)
        };
        // Le clavier a la priorité ; sinon le stick de la manette
        if (!move.x && !move.y && this.padMove) move = { x: this.padMove.x, y: this.padMove.y };
        const intent = { move: move, lock: this.locked, light: false, heavy: false, roll: false, drink: false, parry: false };
        if (this.buffer) {
            if (player.canAct()) {
                intent[this.buffer.action] = true;
                this.buffer = null;
            } else {
                this.buffer.age += dt;
                if (this.buffer.age > HumanController.BUFFER) this.buffer = null;
            }
        }
        return intent;
    }

    reset() {
        this.held.clear();
        this.buffer = null;
        this.padMove = null;
    }
}

HumanController.BUFFER = 0.25;
HumanController.MOVES = ['up', 'down', 'left', 'right'];
HumanController.BUFFERED = ['light', 'heavy', 'roll', 'drink', 'parry'];
// Touches (en minuscules, telles que p5 les donne dans `key`) ; ZQSD et WASD et les flèches
HumanController.KEYS = {
    up: ['z', 'w', 'arrowup'],
    down: ['s', 'arrowdown'],
    left: ['q', 'a', 'arrowleft'],
    right: ['d', 'arrowright'],
    light: ['j'],
    heavy: ['k'],
    roll: [' '],
    drink: ['e'],
    parry: ['u', 'shift'],
    lock: ['l', 'tab']
};
