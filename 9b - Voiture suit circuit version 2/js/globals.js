// Variables Globales partagées
// Utilisation de 'var' pour garantir l'accès via 'window' ou portée globale simple

var NB_ASSETS = 6; // 5 rayons + 1 vitesse (entrées du réseau)
var CHECKPOINT_RADIUS = 40; // distance de validation d'un checkpoint

// Circuit courant (rempli par buildCircuit dans Track.js)
var walls = [];
var checkpoints = [];
var currentTrackPath = []; // Stockage du tracé central
var currentTiles = [];     // Stockage des positions et types de tuiles (circuit généré)
var currentCircuitId = 'genere';

// Ligne de départ du circuit courant
var startX = 115;
var startY = 115;
var startAngle = 0;
var startCheckpointIndex = 0;

// Réglages du circuit généré et vitesse de référence (curseurs d'origine)
var GAME_SPEED_LIMIT = 6;
var TRACK_DIFFICULTY = 5;
var TRACK_WIDTH = 100;
