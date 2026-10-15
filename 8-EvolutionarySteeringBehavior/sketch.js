// Daniel Shiffman
// The Coding Train
// Coding Challenge 69: Steering Evolution

// Part 1: https://youtu.be/flxOkx0yLrY
// Part 2: https://youtu.be/XaOVH8ZSRNA
// Part 3: https://youtu.be/vZUWTlK7D2Q
// Part 4: https://youtu.be/ykOcaInciBI
// Part 5: https://youtu.be/VnFF5V5DS8s

const vehicles = [];
const food = [];
const poison = [];

let debug;

// sliders pour régler la probabilité d'apparition de nourriture et de poison
let foodProbSlider;
let poisonProbSlider;

function setup() {
  createCanvas(windowWidth, windowHeight);
  afficheGUI();
  initSimulation();

}

function afficheGUI() {
  debug = createCheckbox();
  debug.position(50, 10);
  debug.style('color', 'white');
  // label "debug" à gauche de la checkbox
  let label = createDiv('Debug');
  label.position(10, 10);
  label.style('color', 'white');

  // Add label : "click and drag to add vehicles"
  let labelAddVehicles = createDiv('Click and drag to add vehicles');
  labelAddVehicles.position(10, 40);
  labelAddVehicles.style('color', 'white');
  // add Label "press d to toggle debug mode"
  let labelToggleDebug = createDiv('Press d to toggle debug mode');
  labelToggleDebug.position(10, 70);
  labelToggleDebug.style('color', 'white'); 
  // add label "vehicles clone themselves when they live enough"
  let labelClone = createDiv('Vehicles clone themselves when they live enough : possible mutation of genes !');
  labelClone.position(10, 100);
  labelClone.style('color', 'white');
  // add label "vehicles die if they run out of health"
  let labelDie = createDiv('Vehicles die if they run out of health');
  labelDie.position(10, 130);
  labelDie.style('color', 'white');
  // add label "food increases health, poison decreases health"
  let labelFoodPoison = createDiv('Food increases health, poison decreases health');
  labelFoodPoison.position(10, 160);
  labelFoodPoison.style('color', 'white');
  // add label "green dots: food, red dots: poison"
  let labelFoodPoisonDots = createDiv('Green dots: food, red dots: poison');
  labelFoodPoisonDots.position(10, 190);
  labelFoodPoisonDots.style('color', 'white');
  // add label : vehicle color indicates its health (green=healthy, red=sick)
  let labelHealthColor = createDiv('Vehicle color indicates its health (green=healthy, red=sick)');
  labelHealthColor.position(10, 220);
  labelHealthColor.style('color', 'white');
  // add label : vehicle DNA is made of 4 genes: radius of perception for food, radius of perception for poison, attraction weight for food, repulsion weight for poison
  let labelDNA = createDiv('Vehicle DNA: perception radius for food & poison, attraction weight for food, repulsion weight for poison');
  labelDNA.position(10, 250);
  labelDNA.style('color', 'white');
  // label : weights can be negative or positive
  let labelWeights = createDiv('Weights can be negative or positive');
  labelWeights.position(10, 280);
  labelWeights.style('color', 'white');

  // en haut à droite : curseur pour régler la probabilité d'apparition de nourriture
  let labelFoodProb = createDiv('Food Probability');
  labelFoodProb.position(width - 320, 10);
  labelFoodProb.style('color', 'white');
  foodProbSlider = createSlider(0, 1, 0.2, 0.01);
  foodProbSlider.position(width - 200, 10);

  // en haut à droite : curseur pour régler la probabilité d'apparition de poison
  let labelPoisonProb = createDiv('Poison Probability');
  labelPoisonProb.position(width - 320, 40);
  labelPoisonProb.style('color', 'white');
  poisonProbSlider = createSlider(0, 1, 0.01, 0.01);
  poisonProbSlider.position(width - 200, 40);

  // Ajout d'un bouton reset pour remettre la simulation à zéro
  let resetButton = createButton('Reset Simulation');
  resetButton.position(width - 150, 70);
  resetButton.mousePressed(() => {
    initSimulation();
  });
}

function initSimulation() {
  vehicles.length = 0;
    food.length = 0;
    poison.length = 0;
    // recréer 50 véhicules
    for (let i = 0; i < 50; i++) {
      const x = random(width);
      const y = random(height);
      vehicles[i] = new Vehicle(x, y);
    }
    // recréer 40 éléments de nourriture
    for (let i = 0; i < 40; i++) {
      const x = random(width);
      const y = random(height);
      food.push(createVector(x, y));
    }
    // recréer 20 éléments de poison
    for (let i = 0; i < 20; i++) {
      const x = random(width);
      const y = random(height);
      poison.push(createVector(x, y));
    }
    // remettre les sliders à leur valeur par défaut
    foodProbSlider.value(0.2);
    poisonProbSlider.value(0.01);
}


// appelée 60 fois par seconde
function draw() {
  background(0);

  // afficher le nombre de véhicules
  fill(255);
  textSize(16);
  text('Vehicles: ' + vehicles.length, 10, height - 10);
  
  // Afficher la probabilité de nourriture et poison
  fill(255);
  textSize(16);
  text('Food Prob: ' + foodProbSlider.value().toFixed(2), foodProbSlider.x * 0.8, foodProbSlider.y + 15);
  text('Poison Prob: ' + poisonProbSlider.value().toFixed(2), poisonProbSlider.x * 0.8, poisonProbSlider.y + 15);

  // On fait apparaitre aléatoirement de la nourriture
  if (random(1) < foodProbSlider.value()) {
    const x = random(width);
    const y = random(height);
    food.push(createVector(x, y));
  }

  // On fait apparaitre aléatoirement du poison
  if (random(1) < poisonProbSlider.value()) {
    const x = random(width);
    const y = random(height);
    poison.push(createVector(x, y));
  }

  // on dessine la nourriture
  for (let i = 0; i < food.length; i++) {
    fill(0, 255, 0);
    noStroke();
    ellipse(food[i].x, food[i].y, 4, 4);
  }

  // on dessine le poison
  for (let i = 0; i < poison.length; i++) {
    fill(255, 0, 0);
    noStroke();
    ellipse(poison[i].x, poison[i].y, 4, 4);
  }

  // On parcourt la liste à l'envers pour pouvoir supprimer
  // des éléments sans problème. Astuce connue...
  for (let i = vehicles.length - 1; i >= 0; i--) {
    // Comportement "confinement" dans le canvas (les vehicules
    // ne peuvent pas sortir de l'écran, ils sont repoussés
    // par les bords)
    vehicles[i].boundaries();

    // attirés par la nourriture et repoussés par le poison
    vehicles[i].behaviors(food, poison);

    vehicles[i].update();
    vehicles[i].display();

    // 0.002% de chances de clonage dans cette fonction
    // voir le code de clone() dans vehicule.js
    const newVehicle = vehicles[i].clone();

    // si par chance le véhicule a été cloné
    // plus sa durée de vie est grande, plus il a de
    // chances d'être cloné....
    if (newVehicle != null) {
      vehicles.push(newVehicle);
    }

    // Si le véhicule est mort, alors on le retire du tableau
    // et on ajoute un élément food à sa position
    if (vehicles[i].dead()) {
      const x = vehicles[i].pos.x;
      const y = vehicles[i].pos.y;
      food.push(createVector(x, y));
      vehicles.splice(i, 1);
    }
  }
}

// on ajoute un véhicule à la position de la souris 
// quand on clique et déplace la souris
function mouseDragged() {
  vehicles.push(new Vehicle(mouseX, mouseY));
}


// Ecouteur de touches pour activer/désactiver le mode debug
function keyPressed() {
  if (key === 'd' || key === 'D') {
    // set the checkbox state to the opposite of its current state
    debug.checked(!debug.checked());
  }
}