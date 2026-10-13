// Groupe de cibles : une seule au départ, plusieurs quand les cibles fuyantes se reproduisent.
// - Chaque véhicule poursuit la cible la plus proche (nearest), à travers les bords si c'est
//   plus court.
// - Une cible fuyante qui a assez fui se divise en deux (au plus maxTargets cibles).
// - Une cible capturée disparaît s'il en reste d'autres ; la dernière reste toujours.
// - Les cibles retirées sont recyclées : la Target fournie lance un setInterval qui n'est
//   jamais arrêté, donc créer des cibles sans fin ferait s'accumuler les minuteries. Avec le
//   recyclage, il n'existe jamais plus de maxTargets cibles de chaque type.
// make(kind, x, y) crée une cible ('target' : PointTarget, 'fleeing' : TargetFuyante) ;
// configure(cible) lui applique les réglages courants. Les deux sont injectés pour les tests.
const TargetGroup = (() => {
  const MAX_TARGETS = 12;
  const KINDS = ['target', 'fleeing'];

  function create({ make, configure = () => {}, maxTargets = MAX_TARGETS }) {
    const targets = [];
    const pool = { target: [], fleeing: [] };
    let kind = 'target';

    function obtain(targetKind, x, y) {
      const target = pool[targetKind].pop() ?? make(targetKind, x, y);
      target.groupKind = targetKind;
      target.pos.set(x, y);
      if (typeof target.resetFlight === 'function') target.resetFlight();
      configure(target);
      return target;
    }

    function releaseAll() {
      for (const target of targets) pool[target.groupKind].push(target);
      targets.length = 0;
    }

    // une seule cible du type courant, en (x, y)
    function reset(x, y) {
      releaseAll();
      targets.push(obtain(kind, x, y));
    }

    // change le type de cible ; la nouvelle cible prend la place de la première
    function setKind(newKind) {
      if (!KINDS.includes(newKind)) throw new RangeError(`Type de cible inconnu : ${newKind}.`);
      if (newKind === kind && targets.length > 0) return false;
      const position = targets.length > 0 ? { x: targets[0].pos.x, y: targets[0].pos.y } : { x: 0, y: 0 };
      kind = newKind;
      reset(position.x, position.y);
      return true;
    }

    function configureAll() {
      for (const target of targets) configure(target);
    }

    function distanceTo(vehicle, target) {
      const aim = typeof vehicle.nearestImage === 'function' ? vehicle.nearestImage(target.pos) : target.pos;
      return Math.hypot(aim.x - vehicle.pos.x, aim.y - vehicle.pos.y);
    }

    function nearest(vehicle) {
      let best = targets[0];
      let bestDistance = distanceTo(vehicle, best);
      for (let i = 1; i < targets.length; i++) {
        const distance = distanceTo(vehicle, targets[i]);
        if (distance < bestDistance) {
          best = targets[i];
          bestDistance = distance;
        }
      }
      return best;
    }

    // déplace chaque cible, puis réalise les divisions demandées
    function update(dt) {
      for (const target of [...targets]) target.update(dt);
      for (const target of [...targets]) {
        if (typeof target.wantsToSplit !== 'function' || !target.wantsToSplit()) continue;
        if (targets.length < maxTargets) {
          const child = obtain(kind, target.pos.x, target.pos.y);
          target.splitInto(child);
          targets.push(child);
        } else {
          target.postponeSplit();
        }
      }
    }

    function edges() {
      for (const target of targets) target.edges();
    }

    function show() {
      for (const target of targets) target.show();
    }

    // une cible capturée disparaît s'il en reste d'autres ; renvoie true si elle a été retirée
    function capture(target) {
      const index = targets.indexOf(target);
      if (index < 0 || targets.length <= 1) return false;
      targets.splice(index, 1);
      pool[target.groupKind].push(target);
      return true;
    }

    return {
      targets,
      maxTargets,
      get kind() { return kind; },
      primary: () => targets[0],
      reset, setKind, configureAll, nearest, update, edges, show, capture,
    };
  }

  return { MAX_TARGETS, KINDS, create };
})();
