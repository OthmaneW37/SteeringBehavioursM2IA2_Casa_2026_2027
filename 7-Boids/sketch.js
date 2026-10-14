// Flocking
// Daniel Shiffman
// https://thecodingtrain.com/CodingChallenges/124-flocking-boids.html
// https://youtu.be/mhjuuHl6qHM

// Equivalent du tableau de véhicules dans les autres exemples
const flock = [];
let fishImage;
let requinImage;
let obstacleSouris;

let obstacles = [];

let alignSlider, cohesionSlider, separationSlider;
let labelNbBoids;

let target;
let requin;

function preload() {
  // On charge une image de poisson
  fishImage = loadImage('assets/niceFishtransparent.png');
  //requinImage = loadImage('assets/requin.png');
  requinImage = loadImage('assets/SharkTransparent.png');

  // Préchargement du son du requin quand il mange un poisson
  soundFormats('mp3', 'ogg');
  eatSound = loadSound('assets/eating.wav');
  aie = loadSound('assets/aie.wav');
  ouuu = loadSound('assets/ouuuu.ogg');
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Quelques sliders pour régler les "poids" des trois comportements de flocking
  // flocking en anglais c'est "se rassembler"
  // rappel : tableauDesVehicules, min max val step posX posY propriété
  const posYSliderDeDepart = 10;
  creerUnSlider("Poids alignment", flock, 0, 2, 1.5, 0.1, 10, posYSliderDeDepart, "alignWeight");
  creerUnSlider("Poids cohesion", flock, 0, 2, 1, 0.1, 10, posYSliderDeDepart+30, "cohesionWeight");
  creerUnSlider("Poids séparation", flock, 0, 15, 3, 0.1, 10, posYSliderDeDepart+60,"separationWeight");
  creerUnSlider("Poids boundaries", flock, 0, 15, 10, 1, 10, posYSliderDeDepart+90,"boundariesWeight");
  
  creerUnSlider("Rayon des boids", flock, 4, 40, 6, 1, 10, posYSliderDeDepart+120,"r");
  creerUnSlider("Perception radius", flock, 15, 60, 25, 1, 10, posYSliderDeDepart+150,"perceptionRadius");

  // On créer les "boids". Un boid en anglais signifie "un oiseau" ou "un poisson"
  // Dans cet exemple c'est l'équivalent d'un véhicule dans les autres exemples
  for (let i = 0; i < 200; i++) {
    const b = new Boid(random(width), random(height), fishImage);
    b.r = random(8, 40);
    flock.push(b);
  }

  // Créer un label avec le nombre de boids présents à l'écran
   labelNbBoids = createP("Nombre de boids : " + flock.length);
  // couleur blanche
  labelNbBoids.style('color', 'white');
  labelNbBoids.position(10, posYSliderDeDepart+180);

  // target qui suit la souris
  target = createVector(mouseX, mouseY);
  target.r = 50;

  // requin prédateur
  requin = new Boid(width/2, height/2, requinImage);
  requin.r = 40;
  requin.maxSpeed = 7;
  requin.maxForce = 0.5;

  // souris = obstacle
  obstacleSouris = new Obstacle(mouseX, mouseY, 30, "lightgreen");
  obstacles.push(obstacleSouris);
}

function creerUnSlider(label, tabVehicules, min, max, val, step, posX, posY, propriete) {
  let slider = createSlider(min, max, val, step);
  
  let labelP = createP(label);
  labelP.position(posX, posY);
  labelP.style('color', 'white');

  slider.position(posX + 150, posY + 17);

  let valueSpan = createSpan(slider.value());
  valueSpan.position(posX + 300, posY+17);
  valueSpan.style('color', 'white');
  valueSpan.html(slider.value());

  slider.input(() => {
    valueSpan.html(slider.value());
    tabVehicules.forEach(vehicle => {
      vehicle[propriete] = slider.value();
    });
  });

  return slider;
}

function draw() {
  background(0);
  // une image de fond
  //imageMode(CORNER);
  //image(requinImage, 0, 0, width, height);

  // dessin des obstacles
  obstacles.forEach(obstacle => {
    obstacle.show();
  });

    // mettre à jour le nombre de boids
    labelNbBoids.html("Nombre de boids : " + flock.length);

    // on dessine la cible qui suit la souris
    target.x = mouseX;
    target.y = mouseY;

    push();
    fill("lightgreen");
    noStroke();
    ellipse(target.x, target.y, target.r, target.r);
     pop();

  for (let boid of flock) {
    // équivalent de applyBehaviors, cohesion + separation + alignenement + confinement
    boid.flock(flock, obstacles);

    boid.fleeWithTargetRadius(requin);

    // on tester le comportement fleeWithTargetRadius sur tous les obstacles
    
    boid.fleeWithTargetRadius(obstacles[0]);

    boid.update();
    boid.show();
  }  

  // REQUIN
  let wanderForce = requin.wander();
  wanderForce.mult(1);
  requin.applyForce(wanderForce);

  // calcul du poisson le plus proche du requin
  let seekForce;
  let rayonDeDetection = 70;
  // dessin du cercle en fil de fer jaune
  noFill();
  stroke("yellow");
  ellipse(requin.pos.x, requin.pos.y, rayonDeDetection*2, rayonDeDetection*2);

  let closest = requin.getVehiculeLePlusProche(flock);

  if (closest) {
    // distance entre le requin et le poisson le plus proche
    let d = p5.Vector.dist(requin.pos, closest.pos);
    if(d < rayonDeDetection) {
      // on fonce vers le poisson !!!
      // SI LE SON N'EST PAS EN TRAIN DE JOUER ALORS ON JOUE LE SON DU REQUIN QUI FONCE VERS LE POISSON
      if(!ouuu.isPlaying()) {
        ouuu.play();
      }

      seekForce = requin.seek(closest.pos);
      seekForce.mult(7);
      requin.applyForce(seekForce);
    }
    if (d < 5) {
      // on mange !!!!
      // on retire le poisson du tableau flock
      let index = flock.indexOf(closest);
      flock.splice(index, 1);
      // Le requin grossit en augmentant sa taille
      requin.r += 1;
      // On joue le son du requin qui mange
      eatSound.play();
      aie.play();

    }
  }
  requin.edges();
  requin.update();
  requin.show();

  // souris = obstacle
  obstacleSouris.pos.x = mouseX;
  obstacleSouris.pos.y = mouseY;

  // On dessine tous les obstacles
  obstacles.forEach(obstacle => {
    obstacle.show();
  });

  //
}

function mouseDragged() {
  const b = new Boid(mouseX, mouseY, fishImage);
  
  b.r = random(8, 40);

  flock.push(b);


}

function mousePressed() {
  // TODO : ajouter un obstacle de taille aléatoire à la position de la souris
  obstacles.push(new Obstacle(mouseX, mouseY, random(20, 100), "green"));
}

function keyPressed() {
 if (key === 'd') {
    Boid.debug = !Boid.debug;
  } else if (key === 'r') {
    // On donne une taille différente à chaque boid
    flock.forEach(b => {
      b.r = random(8, 40);
    });
  } else if( key === 'o') {
    // ajouter un obstacle à la position de la souris
    let o = new Obstacle(mouseX, mouseY, random(20, 60), "lightgreen");
    obstacles.push(o);
  }
}