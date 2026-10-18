// Contrôleur du joueur humain : traduit le clavier en intention (même interface que le joueur scripté).
// Les touches sont données par le sketch (keyDown / keyUp) : le module ne lit pas le DOM, il est testable.
//
// Une action demandée pendant une autre (attaque, roulade) est gardée BUFFER secondes, puis jouée
// dès que le chevalier peut agir — comme le tampon d'entrée des jeux Souls.
class HumanController {
    constructor() {
        this.held = new Set();
        this.locked = true;
        this.buffer = null;   // { action, age }
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
        if (action === 'lock') this.locked = !this.locked;
        else if (action === 'light' || action === 'heavy' || action === 'roll' || action === 'drink' || action === 'parry') this.buffer = { action: action, age: 0 };
        else this.held.add(action);
        return true;
    }

    keyUp(k) {
        const action = HumanController.actionOf(String(k).toLowerCase());
        if (action) this.held.delete(action);
    }

    intent(player, boss, arena, dt) {
        const move = {
            x: (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0),
            y: (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0)
        };
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
    }
}

HumanController.BUFFER = 0.25;
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
