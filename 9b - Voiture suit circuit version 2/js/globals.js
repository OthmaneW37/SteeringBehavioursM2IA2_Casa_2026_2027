// Variables Globales partagées
// Utilisation de 'var' pour garantir l'accès via 'window' ou portée globale simple

var TOTAL_POP = 50;
var NB_ASSETS = 6; // 5 rayons + 1 vitesse
var SIGHT_DIST = 150;
var FOV = Math.PI / 1.5;

var cars = [];
var savedCars = [];
var walls = [];
var checkpoints = [];
var currentTrackPath = []; // Stockage du tracé LEGO central
var currentTiles = [];     // Stockage des positions et types de tuiles

var startX = 115;
var startY = 115;
var generation = 0;
var bestCar = null;

// Configurations
var MUTATION_RATE = 0.15;
var GAME_SPEED_LIMIT = 6;
var TRACK_DIFFICULTY = 5;
var TRACK_WIDTH = 100;
var trainingFinished = false;
