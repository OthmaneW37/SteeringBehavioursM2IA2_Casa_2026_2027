// Présentation (vidéo de démonstration) : d'abord une PARTIE COMPLÈTE (la campagne, jouée dans le vrai jeu par le
// joueur automatique « vitrine », ShowcasePlayerController), puis une suite de scènes scriptées, jouées dans de
// VRAIS combats, avec des légendes. Une scène 'campaign' dure jusqu'à la fin de la campagne (au plus `duration` s). Les scènes sont des données (Presentation.SCENES) ; PresentationRun fait avancer le temps (secondes) ;
// Presentation.build() monte le combat d'une scène ; les « marionnettes » (PuppetController) jouent le chevalier
// pour provoquer ce que la scène montre (s'approcher, attaquer, parer…). Rien ici ne dessine : le câblage
// (sketch.js) dessine le combat et les couches demandées par la scène (`show`).
//
// Couches possibles (show) :
//   'debug'    : cercle de détection, ligne de vue, rayons, cercle du wander (DebugPanel.drawWorld) ;
//   'forces'   : forces de pilotage du boss et du chevalier, avec leur nom et leur cible (lues dans .forces) ;
//   'formula'  : rappel « force = vitesse désirée − vitesse actuelle » ;
//   'network'  : schéma du réseau du boss en direct ; 'packNetwork' : réseau partagé vu par le Creux visé ;
//   'pack'     : perception et forces de chaque Creux, cercle d'encerclement ; 'chart' : courbes d'entraînement.
// `zoom` (facultatif) : grossissement de la vue, centrée entre le chevalier et son adversaire.
const Presentation = {
    SCENES: [
        { id: 'intro', kind: 'card', duration: 9, title: "Le Gardien du Brouillard",
            lines: ["Un combat de boss façon Souls, en p5.js.",
                "Le boss n'est pas programmé à la main : un réseau de neurones décide, les steering behaviors de Craig Reynolds exécutent."] },
        { id: 'campaign', kind: 'campaign', duration: 240, title: "Partie complète : la campagne",
            lines: ["Partie jouée en temps réel par un joueur automatique : il pare, riposte, roule et boit comme un joueur de Souls."] },
        { id: 'explain', kind: 'card', duration: 6, title: "Comment ça marche ?",
            lines: ["Rejouons chaque mécanique au ralenti de l'esprit : qui décide, et quelles forces font bouger les personnages."] },
        { id: 'wander', kind: 'boss', duration: 15, title: "1. wander : errer sans but",
            boss: 'learned', player: 'idle', playerPos: { x: 70, y: 640 }, bossPos: { x: 700, y: 220 }, pillars: 4, show: ['debug', 'forces'],
            lines: ["Le chevalier est loin, hors du cercle de détection : le Gardien erre (wander).",
                "Un point vert bouge un peu à chaque image sur un cercle devant lui : la direction change en douceur.",
                "La force de pilotage tire vers ce point. Aucune trajectoire n'est écrite à l'avance."] },
        { id: 'brain', kind: 'boss', duration: 26, title: "2. Le réseau de neurones décide",
            boss: 'learned', player: 'approach', playerPos: { x: 190, y: 560 }, bossPos: { x: 660, y: 250 }, pillars: 4, show: ['network', 'forces'],
            lines: ["Le chevalier avance vers le boss : il entre dans son cercle de détection.",
                "16 entrées : distance, angle, vie et endurance du chevalier, attentes des techniques, obstacles, coin…",
                "Quand le chevalier avance, l'entrée « Distance » baisse : le signal traverse 16 neurones cachés.",
                "6 sorties : se déplacer, tourner autour, frapper, esquiver, ruée, souffle. Celles en or dépassent leur seuil.",
                "Le réseau ne déplace rien lui-même : il choisit, puis seek, arrive, flee ou evade calculent la force."] },
        { id: 'forces', kind: 'boss', duration: 18, title: "3. seek et arrive : la formule de Reynolds",
            boss: 'learned', player: 'robot', pillars: 4, show: ['formula'], zoom: 1.8,
            lines: ["Pour chaque comportement : vitesse désirée vers la cible, à la vitesse maximale.",
                "Force de pilotage = vitesse désirée − vitesse actuelle, limitée à maxForce. Puis applyForce.",
                "arrive ralentit près du point visé ; seek y va à pleine vitesse. Le boss tourne ainsi autour du chevalier."] },
        { id: 'evade', kind: 'boss', duration: 15, title: "4. evade : esquiver un coup",
            boss: 'hand', player: 'pester', pillars: 0, show: ['forces', 'debug'], zoom: 1.5,
            lines: ["Ici le boss écrit à la main : il esquive dès que le chevalier frappe.",
                "evade fuit la position FUTURE du chevalier (position + vitesse × temps), version de Reynolds de flee.",
                "Esquive réussie : sa hallebarde est prête aussitôt, c'est la riposte."] },
        { id: 'charge', kind: 'boss', duration: 16, title: "5. La ruée : pursue",
            boss: 'hand', player: 'kite', playerPos: { x: 220, y: 520 }, bossPos: { x: 700, y: 230 }, pillars: 0, show: ['forces'],
            lines: ["Le chevalier garde ses distances : le boss charge.",
                "Il vise l'endroit où le chevalier SERA dans 0,4 s, comme pursue, puis fonce en ligne droite (seek).",
                "Changer de direction au dernier moment fait rater la ruée."] },
        { id: 'avoid', kind: 'boss', duration: 15, title: "6. Évitement d'obstacles et confinement",
            boss: 'learned', player: 'robot', bossPos: { x: 930, y: 110 }, pillars: 6, show: ['forces', 'debug'],
            lines: ["Piliers et brume : obstacle avoidance. Un point devant l'agent ; s'il tombe dans un obstacle, une force l'en écarte.",
                "Près des murs : stayInside (confinement) pousse vers l'intérieur.",
                "Toutes les forces s'additionnent : chaque comportement reste indépendant."] },
        { id: 'parry', kind: 'boss', duration: 18, title: "7. Parade et riposte critique",
            boss: 'learned', player: 'parry', pillars: 0, show: ['forces'], zoom: 1.7,
            lines: ["Bouclier levé pile quand la hallebarde frappe : le coup est paré.",
                "Le boss est déséquilibré 1,8 s : le coup suivant est une riposte critique (× 3).",
                "La ruée, elle, ne se pare pas."] },
        { id: 'pack', kind: 'pack', duration: 28, title: "8. La meute des Creux : boids et réseau partagé",
            player: 'robot', pillars: 4, show: ['pack', 'packNetwork'], zoom: 2.2,
            lines: ["Cinq Creux, UN seul réseau partagé : chacun l'interroge avec ce qu'il perçoit.",
                "Cercle de perception : jaune, rouge quand un voisin y entre. Les forces partent de chaque Creux.",
                "Séparation (jaune), alignement + cohésion (vert) : les trois règles des boids, gardées distinctes.",
                "pursue (rouge) et flanc (bleu) : le réseau dose chaque comportement.",
                "Note collective : la meute a appris à encercler (cercle rouge autour du chevalier)."] },
        { id: 'evolution', kind: 'chart', duration: 15, title: "9. Comment il apprend : la neuroévolution",
            lines: ["Une population de boss affronte un joueur robot. Les meilleurs ont des enfants (copies mutées).",
                "Après chaque génération, un examen sur des combats jamais vus : le champion ne change que s'il gagne plus souvent.",
                "Pas de rétropropagation : seulement sélection et mutation, comme dans l'exemple 9b du cours."] },
        { id: 'outro', kind: 'card', duration: 9, title: "Le Gardien du Brouillard",
            lines: ["Steering behaviors : seek, arrive, flee, evade, pursue, wander, obstacle avoidance, boids.",
                "Décisions : réseaux de neurones entraînés par neuroévolution. Bonne chance, chevalier."] }
    ],
    KINDS: ['card', 'campaign', 'boss', 'pack', 'chart'],
    // Partie complète : graine choisie parmi les campagnes que le joueur automatique gagne (une victoire serrée)
    CAMPAIGN_SEED: 5,
    fightSeed(seed, stepIndex) { return seed * 31 + stepIndex; },
    playerSeed(seed, stepIndex) { return seed * 7 + stepIndex; },

    /**
     * Simule sans rendu la partie complète de la présentation, comme le câblage la joue : mêmes graines, un
     * joueur automatique neuf par combat, il boit au feu de camp tant que sa vie est sous 75. Retourne
     * { won, steps: [{ id, winner, duration, hp }] }. deps : { arena, bossBrain, packBrain, settings, packSize }.
     */
    showcaseCampaign(deps, seed = Presentation.CAMPAIGN_SEED) {
        const s = deps.settings, run = new CampaignRun(), steps = [];
        while (!run.done) {
            const st = run.step;
            if (st.kind === 'rest') {
                while (run.carry.hp <= 75 && run.drink());
                run.leaveRest();
                continue;
            }
            const i = run.index;
            const common = { arena: deps.arena, playerController: new ShowcasePlayerController(seededRandom(Presentation.playerSeed(seed, i))),
                estus: run.carry.estus, playerHp: run.carry.hp, pillars: s.pillarCount, seed: Presentation.fightSeed(seed, i), maxTime: 240 };
            const f = st.kind === 'pack' ? new PackFight(Object.assign(common, { packController: new NeuralPackController(deps.packBrain), size: deps.packSize }))
                : st.kind === 'veilleur' ? new VeilleurFight(common)
                : new Fight(Object.assign(common, { bossController: new NeuralBossController(deps.bossBrain), detectRadius: s.detectRadius,
                    bossHp: st.options && st.options.bossHp }));
            const r = f.run();
            steps.push({ id: st.id, winner: r.winner, duration: r.duration, hp: f.player.hp });
            if (r.winner !== 'player') return { won: false, steps: steps };
            run.win(f.player);
        }
        return { won: true, steps: steps };
    },
    PLAYERS: ['idle', 'approach', 'robot', 'pester', 'kite', 'parry'],
    LAYERS: ['debug', 'forces', 'formula', 'network', 'packNetwork', 'pack', 'chart'],

    /** Vérifie les scènes (types, durées, légendes, couches connues). */
    check(scenes) {
        const ids = new Set();
        for (const s of scenes) {
            if (!s.id || ids.has(s.id)) throw new RangeError("Scène sans identifiant ou en double : " + s.id);
            ids.add(s.id);
            if (!Presentation.KINDS.includes(s.kind)) throw new RangeError("Type de scène inconnu : " + s.kind);
            if (!(s.duration > 0) || !s.title || !s.lines || s.lines.length === 0) throw new RangeError("Scène incomplète : " + s.id);
            if (s.player && !Presentation.PLAYERS.includes(s.player)) throw new RangeError("Marionnette inconnue : " + s.player);
            for (const l of s.show || []) if (!Presentation.LAYERS.includes(l)) throw new RangeError("Couche inconnue : " + l);
        }
        return scenes;
    },

    /** Durée totale (s). */
    totalDuration(scenes = Presentation.SCENES) {
        return scenes.reduce((t, s) => t + s.duration, 0);
    },

    /**
     * Monte le combat d'une scène. deps : { arena, bossBrain, packBrain, seed }. Retourne { fight, kind } (fight
     * nul pour une carte ou des courbes). Les positions de départ de la scène remplacent celles de l'arène.
     */
    build(scene, deps) {
        if (scene.kind === 'card' || scene.kind === 'chart' || scene.kind === 'campaign') return { fight: null, kind: scene.kind };
        const seed = deps.seed || 1;
        const playerController = scene.player === 'robot'
            ? (scene.kind === 'pack' ? new PackPlayerController(seededRandom(seed)) : new ScriptedPlayerController(seededRandom(seed), Settings.defaults()))
            : new PuppetController(scene.player);
        let fight;
        if (scene.kind === 'pack') {
            fight = new PackFight({ arena: deps.arena, playerController: playerController, packController: new NeuralPackController(deps.packBrain),
                size: PackFight.SIZE, maxTime: Infinity, pillars: scene.pillars || 0, seed: seed });
        } else {
            const ctrl = scene.boss === 'hand' ? new HandBossController() : new NeuralBossController(deps.bossBrain);
            fight = new Fight({ arena: deps.arena, playerController: playerController, bossController: ctrl,
                maxTime: Infinity, pillars: scene.pillars || 0, seed: seed });
            if (scene.bossPos) fight.boss.pos.set(scene.bossPos.x, scene.bossPos.y);
        }
        if (scene.playerPos) fight.player.pos.set(scene.playerPos.x, scene.playerPos.y);
        return { fight: fight, kind: scene.kind };
    }
};

/** Déroulé de la présentation dans le temps (secondes) : scène en cours, légende en cours, fin. */
class PresentationRun {
    constructor(scenes = Presentation.SCENES) {
        this.scenes = Presentation.check(scenes);
        this.index = 0;
        this.sceneTime = 0;
        this.time = 0;
        this.done = false;
    }

    get scene() {
        return this.done ? null : this.scenes[this.index];
    }

    /** Légende affichée : les lignes se partagent la durée de la scène. */
    lineIndex() {
        const s = this.scene;
        if (!s) return -1;
        return Math.min(s.lines.length - 1, Math.floor(this.sceneTime / (s.duration / s.lines.length)));
    }

    /** Avance de dt secondes. Retourne true quand une nouvelle scène commence (le câblage monte son combat). */
    update(dt) {
        if (this.done) return false;
        this.time += dt;
        this.sceneTime += dt;
        if (this.sceneTime >= this.scene.duration - 1e-9) return this.next();
        return false;
    }

    /** Scène suivante (touche →). Retourne true s'il en reste une. */
    next() {
        this.index++;
        this.sceneTime = 0;
        if (this.index >= this.scenes.length) {
            this.done = true;
            return false;
        }
        return true;
    }

    /** Avancement global dans [0, 1]. */
    progress() {
        const total = Presentation.totalDuration(this.scenes);
        const before = this.scenes.slice(0, this.index).reduce((t, s) => t + s.duration, 0);
        return this.done ? 1 : Math.min(1, (before + this.sceneTime) / total);
    }
}

/**
 * Marionnette : joue le chevalier pour provoquer ce qu'une scène montre. Même interface que le joueur robot
 * (intent). Stratégies :
 *   idle     : ne bouge pas ;
 *   approach : marche droit vers le boss APPROACH s, puis tourne autour de lui en gardant ses distances ;
 *   pester   : colle le boss et frappe toutes les PESTER_INTERVAL s (il le fait esquiver) ;
 *   kite     : garde ses distances (KITE_DISTANCE px), de côté quand un mur l'en empêche (il provoque la ruée) ;
 *   parry    : reste à portée ; pare quand la hallebarde va frapper, riposte quand le boss est déséquilibré, roule
 *              devant une ruée.
 */
class PuppetController {
    constructor(strategy) {
        if (!Presentation.PLAYERS.includes(strategy) || strategy === 'robot') throw new RangeError("Marionnette inconnue : " + strategy);
        this.strategy = strategy;
        this.t = 0;
        this.clock = 0;
        this.side = 1;
    }

    intent(player, boss, arena, dt) {
        this.t += dt;
        this.clock -= dt;
        const P = PuppetController;
        const intent = { move: { x: 0, y: 0 }, lock: true, light: false, heavy: false, roll: false, drink: false, parry: false, avoid: true };
        if (!player.alive || !boss || !boss.alive || this.strategy === 'idle') return intent;
        const dx = boss.pos.x - player.pos.x, dy = boss.pos.y - player.pos.y;
        const dist = Math.hypot(dx, dy);
        if (Math.floor(this.t / P.STRAFE_SWITCH) % 2 === 1) this.side = -1; else this.side = 1;

        if (this.strategy === 'approach') {
            if (this.t < P.APPROACH) {
                intent.lock = false;
                intent.move = { x: dx / dist, y: dy / dist };
            } else {
                intent.move.x = this.side;
                intent.move.y = dist > P.KEEP ? -0.6 : dist < P.KEEP - 40 ? 0.6 : 0;
            }
            return intent;
        }
        if (this.strategy === 'pester') {
            intent.move.y = dist > P.CLOSE ? -1 : 0;
            intent.move.x = dist <= P.CLOSE ? this.side * 0.4 : 0;
            if (dist < P.CLOSE + 20 && this.clock <= 0) {
                intent.light = true;
                this.clock = P.PESTER_INTERVAL;
            }
            return intent;
        }
        if (this.strategy === 'kite') {
            intent.move.y = dist < P.KITE_DISTANCE ? 1 : dist > P.KITE_DISTANCE + 60 ? -0.5 : 0;
            intent.move.x = this.side * 0.6;
            const a = boss.action;
            if (a && a.kind === 'charge' && Combat.phase(a.spec, a.t) === 'active' && dist < 110) intent.roll = true;
            return intent;
        }
        // parry
        const a = boss.action;
        if (a && a.kind === 'charge' && Combat.phase(a.spec, a.t) !== 'recovery' && dist < 140) {
            intent.move.x = this.side;
            if (Combat.phase(a.spec, a.t) === 'active' && dist < 90) intent.roll = true;
            return intent;
        }
        if (a && a.kind === 'boss' && Combat.phase(a.spec, a.t) === 'windup' && a.spec.windup - a.t <= P.PARRY_LEAD) {
            intent.parry = true;
            return intent;
        }
        if (boss.stun && boss.stun.riposte) {
            if (dist > Combat.ATTACKS.heavy.reach + boss.r - 6) intent.move.y = -1;
            else if (player.stamina >= Combat.ATTACKS.heavy.stamina) intent.heavy = true;
            else intent.light = true;
            return intent;
        }
        intent.move.y = dist > P.PARRY_RANGE ? -1 : dist < P.PARRY_RANGE - 25 ? 0.5 : 0;
        return intent;
    }
}

PuppetController.APPROACH = 4.5;        // secondes de marche droit vers le boss
PuppetController.KEEP = 150;            // distance gardée ensuite (px)
PuppetController.STRAFE_SWITCH = 2.5;   // secondes avant de changer de sens autour du boss
PuppetController.CLOSE = 75;
PuppetController.PESTER_INTERVAL = 1.1;
PuppetController.KITE_DISTANCE = 260;
PuppetController.PARRY_LEAD = 0.1;      // il lève le bouclier 0,1 s avant la frappe (fenêtre de 0,2 s après 0,04 s de garde)
PuppetController.PARRY_RANGE = 95;
