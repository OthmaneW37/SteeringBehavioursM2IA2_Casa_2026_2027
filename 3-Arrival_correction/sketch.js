let nbVehicules = 20;
let target;
let vehicle;
let vehicles = [];
let snakes = [];
// mode = pour changer le comportement de l'application
let mode = "snake";


// Appelée avant de démarrer l'animation
function preload() {
  // en général on charge des images, des fontes de caractères etc.
  font = loadFont('./assets/inconsolata.otf');
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // on crée un snake
  let snake = new Snake(width / 2, height / 2, 30, 30, 'lime');
  snakes.push(snake);

  let snake2 = new Snake(width / 2, height / 2, 20, 20, 'lightblue');
  snakes.push(snake2);

  // La cible, ce sera la position de la souris
  target = createVector(random(width), random(height));

  // On creer un tableau de points à partir du texte
  // Texte qu'on affiche avec textToPoint
  // Get the point array.
  // parameters are : text, x, y, fontSize, options. 
  // sampleFactor : 0.01 = gros points, 0.1 = petits points
  // ca représente la densité des points
  points = font.textToPoints('Casablanca', 10, 250, 305, { sampleFactor: 0.03 });

  // on cree des vehicules, autant que de points
  creerVehicules(points.length);
}

function creerVehicules(n) {
  for (let i = 0; i < n; i++) {
    let v = new Vehicle(random(width), random(height));
    vehicles.push(v);
  }
}

// appelée 60 fois par seconde
function draw() {
  // couleur pour effacer l'écran
  background(0);
  // pour effet psychedelique
  //background(0, 0, 0, 10);

  // On dessine les snakes instances de la classe Snake
  snakes.forEach(snake => {
    let targetBruitee = target.copy();
    // Le 1er serpent sera sur la gauche de la souris à 50 pixels
    // Le 2ème à droite, etc.
    let index = snakes.indexOf(snake);
    let angleOffset = map(index, 0, snakes.length, -PI / 6, PI / 6);
    let distanceFromTarget = 50;
    let offsetX = cos(angleOffset) * distanceFromTarget;
    let offsetY = sin(angleOffset) * distanceFromTarget;
    targetBruitee.x += offsetX;
    targetBruitee.y += offsetY; 
    snake.move(targetBruitee);
    snake.show();
  });

  dessinerLesPointsDuTexte();

  target.x = mouseX;
  target.y = mouseY;

  // dessin de la cible à la position de la souris
  push();
  fill(255, 0, 0);
  noStroke();
  ellipse(target.x, target.y, 32);
  pop();

  // si on a affaire au premier véhicule
  // alors il suit la souris (target)
  let steeringForce;
  // le premier véhicule suit la souris avec arrivée
  vehicles.forEach((vehicle, index) => {
    switch (mode) {
      case "snake":
        if (index === 0) {
          // le premier véhicule suit la souris avec arrivée
          steeringForce = vehicle.wander();
        } else {
          // les autres véhicules suivent le véhicule précédent avec arrivée
          let cible = vehicles[index - 1].pos;
          steeringForce = vehicle.arrive(cible, 30);
        };
        break;
      case "text":
        // chaque véhicule suit le point correspondant du texte
        let cibleTexte = points[index % points.length];
        let cible = createVector(cibleTexte.x, cibleTexte.y);
        steeringForce = vehicle.arrive(cible);
        break;
    }
    vehicle.applyForce(steeringForce);
    vehicle.update();
    vehicle.show();
  });
}

function dessinerLesPointsDuTexte() {
  // On affiche le texte avec des cercles définis par le tableau points
  points.forEach(pt => {
    push();
    fill("grey");
    noStroke();
    circle(pt.x, pt.y, 15);
    pop();
  });
}

function keyPressed() {
  if (key === 'd') {
    Vehicle.debug = !Vehicle.debug;
  } else if (key === 's') {
    mode = "snake";
  } else if (key === 't') {
    mode = "text";
  } else if (key === 'a') {
    // on crée un nouveau snake
    // taille aléatoire entre 10 et 50
    let taille = floor(random(10, 50));
    // couleur aléatoire
    let couleur = color(random(255), random(255), random(255));
    let snake = new SnakeWander(random(width), random(height), taille, 20, couleur);
    snakes.push(snake);
  }
  // todo : touche "s" fait le snake, "v" ajoute un véhicule,
  // "t" passe en mode="texte" etc.
}