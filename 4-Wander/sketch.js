let vehicles = [];
let imageFusee;
let debugCheckbox;

function preload() {
  // on charge une image de fusée pour le vaisseau
  imageFusee = loadImage('./assets/vehicule.png');
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  const nbVehicles = 1;
  for (let i = 0; i < nbVehicles; i++) {
    let vehicle = new Vaisseau(100, 100, imageFusee);
    vehicles.push(vehicle);
  }

  // On cree des sliders pour régler les paramètres
  creerSlidersPourProprietesVehicules();

  //TODO : creerSliderPourNombreDeVehicules(nbVehicles);
  //creerSliderPourNombreDeVehicules(nbVehicles);

  //TODO : 
  //creerSliderPourLongueurCheminDerriereVehicules(20);
}

function creerSlidersPourProprietesVehicules() {
  // Slider pour régler la vitesse max
  creerSliderPourProprieteVehicules(
    'Vitesse Max:', 'maxSpeed', 1, 20, 10, 1, 10, 10);

  // Slider pour régler la force max
  creerSliderPourProprieteVehicules(
    'Force Max:', 'maxForce', 0.05, 2, 0.1, 0.05, 10, 40);

  // Slider pour régler la taille du cercle de wander
  creerSliderPourProprieteVehicules(
    'Rayon Wander:', 'wanderRadius', 5, 100, 50, 5, 10, 70);

  // Slider pour régler la distance du cercle de wander
  creerSliderPourProprieteVehicules(
    'Distance Wander:', 'distanceCercle', 10, 300, 150, 10, 10, 100);

  // Slider pour régler le poids du comportement wander
  creerSliderPourProprieteVehicules(
    'Poids Wander:', 'wanderWeight', 0, 5, 2, 0.1, 10, 130);

  // Slider pour régler le poids du comportement arrive
  creerSliderPourProprieteVehicules(
    'Poids Arrive:', 'arriveWeight', 0, 5, 0.5, 0.1, 10, 160);

  // Checkbox pour activer/désactiver le mode debug
  debugCheckbox = createCheckbox('Mode Debug (touche d)', false);
  debugCheckbox.position(10, 190);
  debugCheckbox.style('color', 'white');
  debugCheckbox.style('font-size', '20px');
  debugCheckbox.changed(() => {
    Vehicle.debug = debugCheckbox.checked();
  }); 
}

function creerSliderPourProprieteVehicules(labelText, propertyName,
  min, max, initialValue, step, posX, posY) {
  let slider = createSlider(min, max, initialValue, step);
  slider.position(posX + 150, posY);
  slider.size(180);

  let label = createDiv(labelText);
  label.position(posX, posY - 3);
  label.style('color', 'white');
  label.style('font-size', '20px');

  let valueDisplay = createDiv(slider.value());
  valueDisplay.position(posX + 350, posY - 3);
  valueDisplay.style('color', 'white');
  valueDisplay.style('font-size', '20px');

  slider.input(() => {
    valueDisplay.html(slider.value());
    // on met à jour la propriété pour tous les véhicules
    vehicles.forEach(vehicle => {
      vehicle[propertyName] = slider.value();
    });
  });
}


// appelée 60 fois par seconde
function draw() {
  background(0);
  //background(0, 0, 0, 20);

  vehicles.forEach(vehicle => {
    vehicle.applyBehaviors(createVector(mouseX, mouseY));
    vehicle.update();
    vehicle.show();
    vehicle.edges();
  });
}

function keyPressed() {
  if (key === 'd') {
    Vehicle.debug = !Vehicle.debug;
    // changer la checkbox, elle doit être checkée si debug est true
    debugCheckbox.checked(Vehicle.debug);
  }
}
