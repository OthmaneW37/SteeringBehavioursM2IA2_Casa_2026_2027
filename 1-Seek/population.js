// Gestion de scène : aucun calcul de steering ou de locomotion ici.
const SeekPopulation = (() => {
  const MIN_COUNT = 1;
  const MAX_COUNT = 200;
  const INITIAL_COUNT = 20;
  const ARRIVAL_RADIUS = 16;
  const SPAWN_MARGIN = 4; // distance minimale entre un véhicule qui réapparaît et le bord de la cible

  function distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  // Une cible est soit un simple vecteur (rayon d'arrivée par défaut), soit un objet
  // avec pos et r, comme Target : c'est alors sa taille qui décide de l'arrivée.
  function targetInfo(target) {
    return target.pos
      ? { pos: target.pos, radius: target.r }
      : { pos: target, radius: ARRIVAL_RADIUS };
  }

  // Un véhicule a atteint la cible quand son centre entre dans le disque de la cible.
  function hasArrived(vehicle, target) {
    const { pos, radius } = targetInfo(target);
    return distanceSquared(vehicle.pos, pos) <= radius ** 2;
  }

  // null signifie qu'aucune position ne respecte la zone d'exclusion.
  function spawnPosition(target, w, h, radius, rng = Math.random) {
    const { pos: targetPos, radius: targetRadius } = targetInfo(target);
    const exclusion = targetRadius + SPAWN_MARGIN;
    const marginX = w >= radius * 2 ? radius : 0;
    const marginY = h >= radius * 2 ? radius : 0;
    const bounds = { left: marginX, right: w - marginX, top: marginY, bottom: h - marginY };
    for (let attempt = 0; attempt < 32; attempt++) {
      const point = {
        x: bounds.left + rng() * (bounds.right - bounds.left),
        y: bounds.top + rng() * (bounds.bottom - bounds.top),
      };
      if (distanceSquared(point, targetPos) > exclusion ** 2) return point;
    }
    const corner = farthestCorner(targetPos, bounds);
    if (distanceSquared(corner, targetPos) > exclusion ** 2) return corner;
    const fallback = farthestCorner(targetPos, { left: 0, right: w, top: 0, bottom: h });
    return distanceSquared(fallback, targetPos) > exclusion ** 2 ? fallback : null;
  }

  function farthestCorner(target, bounds) {
    const corners = [
      { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
      { x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom },
    ];
    return corners.reduce((best, point) =>
      distanceSquared(point, target) > distanceSquared(best, target) ? point : best);
  }

  function resize(vehicles, count, target, w, h, createVehicle, rng = Math.random) {
    if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
      throw new RangeError('Le nombre de véhicules doit être un entier entre 1 et 200.');
    }
    if (count < vehicles.length) vehicles.length = count;
    while (vehicles.length < count) {
      const vehicle = createVehicle(0, 0);
      const point = spawnPosition(target, w, h, vehicle.r, rng)
        ?? farthestCorner(targetInfo(target).pos, { left: 0, right: w, top: 0, bottom: h });
      vehicle.pos.set(point.x, point.y);
      vehicles.push(vehicle);
    }
  }

  function respawn(vehicle, target, w, h, rng = Math.random) {
    const point = spawnPosition(target, w, h, vehicle.r, rng);
    if (!point) return false;
    vehicle.pos.set(point.x, point.y);
    vehicle.vel.set(0, 0);
    vehicle.acc.set(0, 0);
    return true;
  }

  // La réapparition à l'arrivée ne concerne que les véhicules qui poursuivent la cible.
  // Renvoie true si le véhicule vient de capturer la cible (et a réapparu ailleurs).
  function step(vehicle, target, w, h, rng = Math.random) {
    const chasing = !vehicle.fleeing;
    if (chasing && hasArrived(vehicle, target)) return respawn(vehicle, target, w, h, rng);
    vehicle.applyBehaviors(targetInfo(target).pos);
    vehicle.update();
    vehicle.edges();
    if (chasing && hasArrived(vehicle, target)) return respawn(vehicle, target, w, h, rng);
    return false;
  }

  function bindSlider(slider, output, vehicles, target, dimensions, createVehicle, rng = Math.random) {
    const synchronize = () => {
      const { width: w, height: h } = dimensions();
      resize(vehicles, Number(slider.value), target, w, h, createVehicle, rng);
      output.value = `${vehicles.length} / ${MAX_COUNT}`;
    };
    slider.addEventListener('input', synchronize);
    synchronize();
  }

  // Réglages de locomotion communs à tous les véhicules suiveurs.
  // maxSpeed reste sous le diamètre d'une cible de rayon par défaut (2 * ARRIVAL_RADIUS)
  // pour qu'un véhicule ne puisse pas la traverser en un pas sans la détecter.
  const PARAMETERS = {
    maxSpeed: { min: 0, max: 20, step: 0.5, initial: 4, decimals: 1 },
    maxForce: { min: 0, max: 10, step: 0.05, initial: 0.1, decimals: 2 },
    // distance à partir de laquelle un véhicule en fuite s'enfuit (et la cible, si elle fuit)
    fleeRadius: { min: 50, max: 600, step: 10, initial: 300, decimals: 0 },
  };

  function createSettings() {
    return {
      maxSpeed: PARAMETERS.maxSpeed.initial,
      maxForce: PARAMETERS.maxForce.initial,
      fleeRadius: PARAMETERS.fleeRadius.initial,
      fleeing: false,
    };
  }

  // Les véhicules créés plus tard (slider de population) reprennent les réglages courants.
  function applySettings(vehicle, settings) {
    vehicle.maxSpeed = settings.maxSpeed;
    vehicle.maxForce = settings.maxForce;
    vehicle.fleeRadius = settings.fleeRadius;
    vehicle.fleeing = settings.fleeing;
  }

  function setParameter(vehicles, settings, name, value) {
    const range = PARAMETERS[name];
    if (!range) throw new RangeError(`Paramètre inconnu : ${name}.`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) {
      throw new RangeError(`${name} doit être un nombre entre ${range.min} et ${range.max}.`);
    }
    settings[name] = value;
    for (const vehicle of vehicles) vehicle[name] = value;
  }

  // Mode fuite : les véhicules fuient la cible au lieu de la poursuivre.
  function setFleeing(vehicles, settings, fleeing) {
    if (typeof fleeing !== 'boolean') throw new TypeError('Le mode fuite doit être un booléen.');
    settings.fleeing = fleeing;
    for (const vehicle of vehicles) vehicle.fleeing = fleeing;
  }

  function bindFleeCheckbox(checkbox, vehicles, settings) {
    const synchronize = () => setFleeing(vehicles, settings, Boolean(checkbox.checked));
    checkbox.addEventListener('change', synchronize);
    synchronize();
  }

  function bindParameterSlider(slider, output, name, vehicles, settings) {
    const { decimals } = PARAMETERS[name];
    const synchronize = () => {
      setParameter(vehicles, settings, name, Number(slider.value));
      output.value = settings[name].toFixed(decimals);
    };
    slider.addEventListener('input', synchronize);
    synchronize();
  }

  return { MIN_COUNT, MAX_COUNT, INITIAL_COUNT, ARRIVAL_RADIUS, PARAMETERS,
    targetInfo, hasArrived, spawnPosition, resize, respawn, step, bindSlider,
    createSettings, applySettings, setParameter, bindParameterSlider,
    setFleeing, bindFleeCheckbox };
})();
