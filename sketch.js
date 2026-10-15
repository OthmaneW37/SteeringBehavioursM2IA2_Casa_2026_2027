// Câblage p5 : contrôles, modes, boucle de jeu et rendu. Aucune règle de comportement ici :
// elles sont dans les modules (Player, Boss, BossBrain, Fight, Training, Comparison, Demo...).

const game = {
    mode: 'combat',          // 'combat', 'demo', 'training' ou 'comparison'
    settings: null,
    arena: null,
    campfire: null,
    camera: null,
    human: null,
    effects: null,
    fight: null,             // combat joué au clavier
    state: 'fight',          // 'fight', 'dead' ou 'victory'
    stateTime: 0,
    deaths: 0,
    paused: false,
    debug: false,
    accumulator: 0,          // temps réel en attente de pas fixes
    time: 0,
    trail: { player: 100, boss: 300 },
    pretrained: null,
    training: null,
    trainingRunning: false,
    lastGeneration: 0,
    lastSave: -Infinity,
    replay: null,            // combat de démonstration pendant l'entraînement
    demo: null,
    demoEffects: null,
    comparison: null,
    resetArmed: 0,           // « Tout recommencer » demande une confirmation (deuxième clic)
    storage: null
};

const HELP_SEEN_KEY = 'gardienDuBrouillard.helpSeen';

function byId(id) {
    return document.getElementById(id);
}

function setStatus(message, isError = false) {
    byId('statusMsg').textContent = message || '';
    byId('statusMsg').classList.toggle('error', isError);
}

function safeStorage() {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
}

/** Boss fourni ; s'il n'a pas l'architecture attendue (fichier d'une ancienne version), réseau au hasard. */
function loadPretrained() {
    try {
        const nn = NeuralNetwork.fromJSON(PRETRAINED_BOSS.brain);
        if (nn.sizes.join(',') === BossBrain.SIZES.join(',')) return nn;
    } catch (e) { /* message ci-dessous */ }
    setTimeout(() => setStatus("Le boss fourni date d'une ancienne version : il est remplacé par un boss au hasard. " +
        "Lancez un entraînement ou régénérez-le avec « node tools/pretrain.mjs ».", true), 0);
    return BossBrain.create(Math.random);
}

function viewSize() {
    const holder = byId('canvasHolder');
    return { w: Math.max(320, holder.clientWidth), h: Math.max(240, holder.clientHeight) };
}

// --- Démarrage ---

function setup() {
    const size = viewSize();
    createCanvas(size.w, size.h).parent('canvasHolder');
    textFont('Georgia');

    game.arena = new Arena();
    game.campfire = new Campfire(game.arena.campfirePos.x, game.arena.campfirePos.y);
    game.camera = new Camera();
    game.human = new HumanController();
    game.effects = new Effects();
    game.demoEffects = [new Effects(), new Effects()];
    game.storage = safeStorage();
    game.pretrained = loadPretrained();
    game.bloodstains = Bloodstain.load(game.storage);

    initControls();
    game.settings = readSettings();

    // Entraînement sauvegardé automatiquement lors d'une visite précédente
    const saved = TrainingStore.load(game.storage);
    if (saved.training) {
        game.training = saved.training;
        game.lastGeneration = saved.training.generation;
        applySettingsToControls(saved.training.settings);
        byId('saveInfo').textContent = "Entraînement retrouvé : génération " + saved.training.generation + " (sauvegarde automatique).";
    } else {
        newTraining();
        if (saved.error) setStatus(saved.error, true);
    }

    startFight();
    game.camera.snap(Camera.target(game.arena, width, height, true, game.fight.player, game.fight.boss));
    showMode();
    showHelpOnFirstVisit();
}

// --- Réglages ---

function initControls() {
    const select = byId('scenarioSelect');
    for (const sc of Scenarios.LIST) {
        const o = document.createElement('option');
        o.value = sc.id;
        o.textContent = sc.label;
        select.appendChild(o);
    }
    const custom = document.createElement('option');
    custom.value = 'personnalise';
    custom.textContent = "Personnalisé";
    select.appendChild(custom);
    select.value = 'reference';
    byId('scenarioInfo').textContent = Scenarios.get('reference').description;

    for (const name in Settings.PARAMETERS) {
        byId(name).addEventListener('input', () => {
            showValue(name);
            settingsChanged();
            showScenario();
        });
        showValue(name);
    }
    select.addEventListener('change', () => {
        if (select.value === 'personnalise') return;
        applySettingsToControls(Scenarios.settings(select.value));
        settingsChanged();
    });

    byId('modeSelect').addEventListener('change', () => {
        game.mode = byId('modeSelect').value;
        showMode();
    });
    byId('opponentSelect').addEventListener('change', startFight);
    byId('restartFightBtn').addEventListener('click', startFight);
    byId('pauseBtn').addEventListener('click', togglePause);
    byId('demoLeftSelect').addEventListener('change', startDemo);
    byId('trainBtn').addEventListener('click', () => {
        game.trainingRunning = !game.trainingRunning;
        updateTrainingButton();
    });
    byId('resetTrainingBtn').addEventListener('click', resetTrainingClicked);
    byId('exportTrainingBtn').addEventListener('click', exportTraining);
    byId('importTrainingInput').addEventListener('change', () => {
        const input = byId('importTrainingInput');
        if (input.files && input.files[0]) importTraining(input.files[0]);
        input.value = '';
    });
    byId('compareBtn').addEventListener('click', startComparison);
    byId('debugCheckbox').addEventListener('change', () => { game.debug = byId('debugCheckbox').checked; });
    byId('menuToggle').addEventListener('click', () => {
        MenuToggle.toggle(document, byId('menuToggle'));
        windowResized();
    });
    byId('helpBtn').addEventListener('click', openHelp);
    // La sauvegarde automatique est espacée de 5 s : on sauve aussi quand la page est fermée ou cachée
    window.addEventListener('beforeunload', () => autosave(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(true); });
}

function showValue(name) {
    byId(name + 'Val').textContent = Settings.format(name, Number(byId(name).value));
}

function showScenario() {
    const match = Scenarios.matching(game.settings);
    byId('scenarioSelect').value = match;
    byId('scenarioInfo').textContent = match === 'personnalise' ? "Réglages modifiés à la main." : Scenarios.get(match).description;
}

function applySettingsToControls(s) {
    for (const name in Settings.PARAMETERS) {
        byId(name).value = String(s[name]);
        showValue(name);
    }
    game.settings = readSettings();
    showScenario();
}

function readSettings() {
    const s = {};
    for (const name in Settings.PARAMETERS) s[name] = Number(byId(name).value);
    return Settings.validate(s);
}

function settingsChanged() {
    try {
        game.settings = readSettings();
    } catch (e) {
        return setStatus(e.message, true);
    }
    if (game.training) game.training.updateSettings(game.settings);
    if (game.fight) game.fight.boss.detectRadius = game.settings.detectRadius;
}

// --- Aide ---

function openHelp() {
    const dialog = byId('helpDialog');
    if (typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
        // Le bouton du bas reçoit le focus et fait défiler la fenêtre : on revient au début du texte
        dialog.scrollTop = 0;
        setTimeout(() => { dialog.scrollTop = 0; }, 0);
    }
}

function showHelpOnFirstVisit() {
    try {
        if (!game.storage || game.storage.getItem(HELP_SEEN_KEY)) return;
        game.storage.setItem(HELP_SEEN_KEY, '1');
    } catch (e) {
        return;
    }
    openHelp();
}

// --- Le boss à affronter ---

/** Cerveau du champion de l'entraînement, ou du boss fourni s'il n'y a pas encore de champion. */
function championBrain() {
    const b = game.training && game.training.bestBrain();
    return b || game.pretrained;
}

function championLabel() {
    const t = game.training;
    if (t && t.champion) {
        return "Champion de la génération " + t.champion.generation + " : il gagne " +
            Math.round(t.champion.winRate * 100) + " % de ses combats d'examen" +
            (t.champion.key !== t.fightKey() ? " (il repassera l'examen à la prochaine génération)." : ".");
    }
    if (t && t.best.brain) return "Meilleur boss de la génération " + t.best.generation + " (examen en cours).";
    return "Pas encore d'entraînement : c'est le boss pré-entraîné fourni (" + PRETRAINED_BOSS.generations + " générations).";
}

function bossController(kind) {
    if (kind === 'hand') return new HandBossController();
    if (kind === 'pretrained') return new NeuralBossController(game.pretrained);
    return new NeuralBossController(championBrain());
}

// --- Modes ---

function showMode() {
    for (const m of ['combat', 'demo', 'training', 'comparison']) {
        byId(m === 'combat' ? 'combatSection' : m + 'Section').style.display = game.mode === m ? '' : 'none';
    }
    if (game.mode === 'combat') {
        setStatus("À vous de jouer ! Esquivez (Espace) quand le cône rouge se remplit.");
        game.stateTime = 0;
    } else if (game.mode === 'demo') {
        startDemo();
        setStatus("À gauche : un boss qui n'a rien appris. À droite : le champion. Même adversaire pour les deux.");
    } else if (game.mode === 'training') {
        setStatus(game.trainingRunning ? "Entraînement en cours." : "Cliquez sur « Lancer l'entraînement ».");
    } else {
        setStatus("Cliquez sur « Lancer 50 combats » pour mesurer les deux boss.");
    }
    updateTrainingButton();
}

function togglePause() {
    game.paused = !game.paused;
    byId('pauseBtn').textContent = game.paused ? "Reprendre (P)" : "Pause (P)";
}

// --- Combat au clavier ---

function startFight() {
    const kind = byId('opponentSelect').value;
    game.fight = new Fight({
        arena: game.arena,
        playerController: game.human,
        bossController: bossController(kind),
        maxTime: Infinity,
        detectRadius: game.settings.detectRadius,
        estus: game.settings.estusCharges
    });
    game.state = 'fight';
    game.stateTime = 0;
    game.accumulator = 0;
    game.trail = { player: game.fight.player.hp, boss: game.fight.boss.hp };
    byId('bossInfo').textContent = kind === 'hand' ? "Machine à états écrite à la main : attente, attaque, recul."
        : kind === 'pretrained' ? "Boss pré-entraîné fourni avec le jeu (" + PRETRAINED_BOSS.generations + " générations)."
            : championLabel();
}

/** Fait avancer un combat à pas fixes selon le temps réel écoulé (au plus 4 pas par image). */
function advance(fight, dt, onEvents) {
    game.accumulator = Math.min(game.accumulator + dt, Combat.DT * 4);
    while (game.accumulator >= Combat.DT && !fight.over) {
        headless(() => fight.step());
        game.accumulator -= Combat.DT;
        if (onEvents) onEvents(fight.events);
    }
}

function updateCombat(dt) {
    const f = game.fight;
    if (game.paused) return;
    game.stateTime += dt;
    if (game.state === 'fight') {
        advance(f, dt, events => events.forEach(e => game.effects.add(e, game.time)));
        if (!f.player.alive) {
            game.state = 'dead';
            game.stateTime = 0;
            game.deaths++;
            // Tache de sang là où le chevalier est tombé, gardée d'une session à l'autre
            Bloodstain.add(game.bloodstains, f.player.pos.x, f.player.pos.y, f.lastCause, game.deaths * 977);
            Bloodstain.save(game.storage, game.bloodstains);
        } else if (!f.boss.alive) {
            game.state = 'victory';
            game.stateTime = 0;
        }
    } else if (game.state === 'dead' && game.stateTime > 3.5) {
        // Réapparition au feu de camp ; le boss retrouve toute sa vie
        startFight();
    }
}

// --- Démonstration ---

function startDemo() {
    game.demo = new Demo(byId('demoLeftSelect').value, championBrain(), game.settings);
    game.demoAccumulator = 0;
    byId('demoInfo').textContent = "Boss de droite — " + championLabel();
}

function updateDemo(dt) {
    const d = game.demo;
    if (game.paused) return;
    game.demoAccumulator = Math.min((game.demoAccumulator || 0) + dt, Combat.DT * 4);
    while (game.demoAccumulator >= Combat.DT && !d.over) {
        headless(() => d.step());
        game.demoAccumulator -= Combat.DT;
        d.left.events.forEach(e => game.demoEffects[0].add(e, game.time));
        d.right.events.forEach(e => game.demoEffects[1].add(e, game.time));
    }
    d.update(dt);
}

// --- Entraînement ---

function newTraining() {
    game.training = new Training(game.settings, { seed: 1 + Math.floor(Math.random() * 100000) });
    game.lastGeneration = 0;
    game.replay = null;
}

function updateTrainingButton() {
    byId('trainBtn').textContent = game.trainingRunning ? "⏸ Mettre en pause" : "▶ Lancer l'entraînement";
}

function resetTrainingClicked() {
    const btn = byId('resetTrainingBtn');
    if (game.time < game.resetArmed) {
        game.resetArmed = 0;
        btn.textContent = "Tout recommencer";
        TrainingStore.clear(game.storage);
        newTraining();
        startFight();
        byId('saveInfo').textContent = "";
        setStatus("Nouvel entraînement : " + game.settings.populationSize + " boss au cerveau aléatoire.");
    } else {
        game.resetArmed = game.time + 4;
        btn.textContent = "Confirmer : tout effacer ?";
        setStatus("Cliquez encore pour effacer l'entraînement et sa sauvegarde (4 s pour confirmer).");
    }
}

/** Travail sans rendu : le dessin de debug de wander (vehicle.js) ne doit pas sortir pendant la simulation. */
function headless(work) {
    const debug = Vehicle.debug;
    Vehicle.debug = false;
    try {
        return work();
    } finally {
        Vehicle.debug = debug;
    }
}

function autosave(force = false) {
    if (!game.storage) {
        byId('saveInfo').textContent = "Sauvegarde automatique impossible ici : utilisez « Exporter ».";
        return;
    }
    if (!force && game.time - game.lastSave < 5) return;
    game.lastSave = game.time;
    const res = TrainingStore.save(game.storage, game.training);
    byId('saveInfo').textContent = res.ok
        ? "✔ Sauvegardé automatiquement (génération " + game.training.generation + ")."
        : res.error + " Utilisez « Exporter ».";
}

function updateTraining(dt) {
    const t = game.training;
    if (game.resetArmed && game.time >= game.resetArmed) {
        game.resetArmed = 0;
        byId('resetTrainingBtn').textContent = "Tout recommencer";
    }
    if (game.trainingRunning) headless(() => t.work(game.settings.trainingBudget));
    if (t.generation !== game.lastGeneration) {
        game.lastGeneration = t.generation;
        autosave();
    }
    // Combat de démonstration : le champion contre le joueur robot, en temps réel
    if (!game.replay || (game.replay.over && game.replay.overTime > 2)) {
        game.replay = new Fight({
            arena: game.arena,
            playerController: new ScriptedPlayerController(seededRandom(1 + Math.floor(Math.random() * 1e6)), {
                dodgeProbability: game.settings.dodgeProbability, attackInterval: game.settings.attackInterval
            }),
            bossController: new NeuralBossController(championBrain()),
            maxTime: game.settings.maxFightTime,
            detectRadius: game.settings.detectRadius,
        estus: game.settings.estusCharges
        });
        game.replay.overTime = 0;
        game.accumulator = 0;
    }
    if (!game.paused) {
        if (game.replay.over) game.replay.overTime += dt;
        else advance(game.replay, dt, events => events.forEach(e => game.effects.add(e, game.time)));
    }
    byId('trainingInfo').textContent = "Génération " + t.generation + " · " + t.status() + ". " + championLabel();
}

function exportTraining() {
    try {
        const blob = new Blob([TrainingStore.serialize(game.training)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = TrainingStore.fileName(game.training);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        setStatus("Fichier « " + a.download + " » téléchargé.");
    } catch (e) {
        setStatus("Export impossible : " + e.message, true);
    }
}

function importTraining(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const t = TrainingStore.parse(String(reader.result));
            game.training = t;
            game.lastGeneration = t.generation;
            game.trainingRunning = false;
            game.replay = null;
            applySettingsToControls(t.settings);
            autosave(true);
            startFight();
            updateTrainingButton();
            setStatus("Entraînement importé : génération " + t.generation + ". " + championLabel());
        } catch (e) {
            setStatus("Import refusé : " + e.message, true);
        }
    };
    reader.readAsText(file);
}

// --- Comparaison ---

function startComparison() {
    const brain = championBrain();
    game.comparison = new Comparison([
        { name: "Boss écrit à la main", makeController: () => new HandBossController() },
        { name: "Boss entraîné (champion)", makeController: () => new NeuralBossController(brain) }
    ], game.settings, Settings.COMPARISON_FIGHTS);
    game.comparison.label = championLabel();
    byId('comparisonResults').innerHTML = '';
    setStatus("Comparaison en cours : " + Settings.COMPARISON_FIGHTS + " combats par boss, les mêmes pour les deux.");
}

function updateComparison() {
    const c = game.comparison;
    if (!c || c.done) return;
    headless(() => c.work(game.settings.trainingBudget));
    if (c.done) {
        showComparisonTable(c.summary());
        setStatus("Comparaison terminée.");
    }
}

/** Phrase de conclusion, compréhensible sans connaître le projet. */
function comparisonSentence(summary) {
    const [hand, learned] = summary;
    const diff = Math.round((learned.winRate - hand.winRate) * 100);
    const verdict = diff > 0 ? "Le boss entraîné gagne " + diff + " combats de plus sur 100 que le boss écrit à la main."
        : diff < 0 ? "Le boss écrit à la main gagne " + (-diff) + " combats de plus sur 100 : l'entraînement doit continuer."
            : "Les deux boss gagnent aussi souvent l'un que l'autre.";
    return "Sur " + Settings.COMPARISON_FIGHTS + " combats identiques, le boss écrit à la main gagne " + Math.round(hand.winRate * 100) +
        " % de ses combats et le boss entraîné " + Math.round(learned.winRate * 100) + " %. " + verdict;
}

function showComparisonTable(summary) {
    const holder = byId('comparisonResults');
    holder.innerHTML = '';
    const table = document.createElement('table');
    const rows = [["Boss", "Victoires", "Durée moy.", "Dégâts infligés"]].concat(summary.map(s => [
        s.name, Math.round(s.winRate * 100) + " %", s.avgDuration.toFixed(1) + " s", s.avgDamageDealt.toFixed(0)
    ]));
    rows.forEach((cells, i) => {
        const tr = document.createElement('tr');
        for (const text of cells) {
            const td = document.createElement(i === 0 ? 'th' : 'td');
            td.textContent = text;
            tr.appendChild(td);
        }
        table.appendChild(tr);
    });
    holder.appendChild(table);
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = comparisonSentence(summary);
    holder.appendChild(p);
}

// --- Boucle ---

function draw() {
    const dt = Math.min(deltaTime / 1000, 0.1);
    game.time += dt;
    background(7, 8, 12);
    Vehicle.debug = game.debug;

    if (game.mode === 'combat') {
        updateCombat(dt);
        drawWorld(game.fight, game.fight.player.locked, game.effects);
        drawCombatHud(dt);
    } else if (game.mode === 'demo') {
        updateDemo(dt);
        drawDemo();
    } else if (game.mode === 'training') {
        updateTraining(dt);
        drawWorld(game.replay, false, game.effects);
        drawTrainingOverlay();
    } else {
        updateComparison();
        drawWorld(game.fight, false, game.effects, true);
        drawComparisonOverlay();
    }
    // Pendant la comparaison et l'entraînement, le combat au clavier reste figé
    game.effects.update(dt);
    game.demoEffects.forEach(e => e.update(dt));
}

/** Dessine l'arène et ses entités dans le repère de la caméra principale. */
function drawWorld(fight, locked, effects, dimmed = false) {
    const { player, boss } = fight;
    game.camera.follow(Camera.target(game.arena, width, height, locked, player, boss), Math.min(deltaTime / 1000, 0.1));
    push();
    game.camera.apply(width, height);
    drawEntities(fight, effects, fight === game.fight ? game.bloodstains : null);
    if (locked && boss.alive) Hud.lockMark(boss, game.time);
    pop();
    if (dimmed) {
        noStroke();
        fill(0, 0, 0, 160);
        rect(0, 0, width, height);
    }
}

function drawEntities(fight, effects, stains = null) {
    const { player, boss } = fight;
    game.arena.showFloor();
    if (stains) for (const b of stains) b.show(game.time, Math.hypot(player.pos.x - b.pos.x, player.pos.y - b.pos.y) < 45);
    game.campfire.show(game.time);
    for (const z of fight.zones) z.show(game.time);
    if (game.debug) DebugPanel.drawWorld(boss, player, game.arena);
    boss.showTelegraph();
    player.show();
    boss.show();
    effects.show();
    game.arena.showFog(game.time);
    Hud.techniqueLabel(boss);
}

/** Un combat dans un rectangle de l'écran (démonstration côte à côte). */
function drawWorldIn(fight, effects, x, y, w, h) {
    const s = Math.min(w / game.arena.width, h / game.arena.height);
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(x, y, w, h);
    drawingContext.clip();
    translate(x + (w - game.arena.width * s) / 2, y + (h - game.arena.height * s) / 2);
    scale(s);
    drawEntities(fight, effects);
    drawingContext.restore();
    pop();
}

function drawDemo() {
    const d = game.demo;
    const top = 70, bottom = 96;
    const w = width / 2;
    const h = height - top - bottom;
    drawWorldIn(d.left, game.demoEffects[0], 6, top, w - 12, h);
    drawWorldIn(d.right, game.demoEffects[1], w + 6, top, w - 12, h);
    push();
    stroke(60);
    line(w, 10, w, height - 10);
    noStroke();
    textAlign(CENTER, TOP);
    const sides = [
        { fight: d.left, title: Demo.leftLabel(d.leftKind), score: d.score.left, x: w / 2, c: color(150, 170, 210) },
        { fight: d.right, title: "Après entraînement : le champion", score: d.score.right, x: w * 1.5, c: color(255, 190, 60) }
    ];
    for (const sd of sides) {
        fill(sd.c);
        textSize(17);
        text(sd.title, sd.x, 14);
        fill(200);
        textSize(12);
        text("Victoires du boss : " + sd.score + " / " + d.score.rounds + " manche" + (d.score.rounds > 1 ? "s" : ""), sd.x, 40);
        const f = sd.fight;
        const bw = w * 0.7, bx = sd.x - bw / 2;
        Hud.bar(bx, height - bottom + 14, bw * 0.45, 9, f.player.hp, f.player.maxHp, color(190, 40, 40));
        Hud.bar(bx + bw * 0.55, height - bottom + 14, bw * 0.45, 9, f.boss.hp, f.boss.maxHp, color(170, 30, 30));
        fill(170);
        textSize(10);
        textAlign(LEFT, TOP);
        text("chevalier (robot)", bx, height - bottom + 28);
        text("boss", bx + bw * 0.55, height - bottom + 28);
        textAlign(CENTER, TOP);
        textSize(14);
        fill(f.over ? (f.result.winner === 'boss' ? color(255, 120, 80) : color(140, 220, 140)) : color(220));
        text(Demo.verdict(f), sd.x, height - bottom + 50);
    }
    fill(140);
    textSize(11);
    text("Manche " + d.round + " · même joueur robot, même graine des deux côtés : seul le cerveau du boss change.", width / 2, height - 20);
    pop();
}

function drawCombatHud(dt) {
    const f = game.fight;
    // Barres « fantômes » qui rattrapent la vie réelle (comme dans les jeux Souls)
    game.trail.player = Math.max(f.player.hp, game.trail.player - 40 * dt);
    game.trail.boss = Math.max(f.boss.hp, game.trail.boss - 60 * dt);
    Hud.drawPlayer(f.player, game.deaths, game.trail.player);
    Hud.drawBoss(f.boss, game.trail.boss);
    if (game.debug) DebugPanel.draw(f.bossController, f.boss, width - DebugPanel.WIDTH - 12, 12);
    if (game.state === 'dead') {
        Hud.banner("VOUS ÊTES MORT", Bloodstain.labelFor(f.lastCause).replace("Ici, vaincu", "Vaincu") + " · retour au feu de camp…",
            color(170, 20, 20), Math.min(1, game.stateTime / 0.8));
    } else if (game.state === 'victory') {
        Hud.banner("ENNEMI VAINCU", "Temps " + f.time.toFixed(1) + " s · morts " + game.deaths + " · R pour recommencer",
            color(230, 190, 90), Math.min(1, game.stateTime / 0.8));
    } else if (game.paused) {
        Hud.banner("PAUSE", "P pour reprendre", color(220, 220, 220), 1);
    } else if (f.time < 6) {
        Hud.controlsHint(Math.min(1, (6 - f.time) / 1.5));
    }
}

function drawTrainingOverlay() {
    const t = game.training;
    // Panneau d'information en haut à gauche (décalé pour laisser la place au bouton du menu),
    // courbes à droite si l'écran est assez large, sinon sous le panneau
    const px = 48, py = 12, pw = 330;
    const wide = width >= pw + 420;
    const w = wide ? Math.min(360, width - pw - px - 70) : Math.min(360, width - px - 40);
    const h = 260;
    FitnessChart.draw(t.history, wide ? width - w - 24 : px + 12, wide ? 44 : py + 196, w, h);
    push();
    noStroke();
    fill(10, 12, 18, 225);
    rect(px, py, pw, 150, 8);
    fill(232, 220, 184);
    textSize(15);
    textAlign(LEFT, TOP);
    text("Entraînement " + (game.trainingRunning ? "en cours" : "en pause"), px + 12, py + 10);
    fill(205);
    textSize(11);
    const s = game.settings;
    text("Génération " + t.generation + " — " + t.status(), px + 12, py + 34);
    text(t.population.length + " boss × " + s.fightsPerBoss + " combats contre le joueur robot", px + 12, py + 52);
    text("Le joueur robot esquive " + Math.round(s.dodgeProbability * 100) + " % des attaques", px + 12, py + 68);
    fill(255, 190, 60);
    text(t.champion ? "Champion : génération " + t.champion.generation + ", gagne " + Math.round(t.champion.winRate * 100) +
        " % de ses combats d'examen" : "Pas encore de champion (première génération en cours)", px + 12, py + 86);
    fill(40);
    rect(px + 12, py + 110, pw - 24, 10, 3);
    fill(232, 190, 90);
    rect(px + 12, py + 110, (pw - 24) * t.progress(), 10, 3);
    fill(150);
    text("avancement de la génération", px + 12, py + 126);
    pop();
    if (game.replay) {
        Hud.drawBoss(game.replay.boss, game.replay.boss.hp);
        push();
        fill(200);
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text("En direct : le champion contre le joueur robot", width / 2, height - 72);
        pop();
        if (game.debug) DebugPanel.draw(game.replay.bossController, game.replay.boss, 14, 180);
    }
}

function drawComparisonOverlay() {
    const c = game.comparison;
    push();
    textAlign(CENTER, TOP);
    fill(232, 220, 184);
    textSize(24);
    text("Boss écrit à la main contre boss entraîné", width / 2, 40);
    textSize(13);
    fill(190);
    text("Même joueur robot, mêmes " + Settings.COMPARISON_FIGHTS + " combats pour les deux boss : seul le cerveau change.", width / 2, 76);
    if (!c) {
        text("Cliquez sur « Lancer 50 combats » dans le menu.", width / 2, 110);
        pop();
        return;
    }
    const summary = c.summary();
    const barW = Math.min(460, width * 0.6);
    const x0 = (width - barW) / 2;
    summary.forEach((s, i) => {
        const y = 120 + i * 110;
        textAlign(LEFT, TOP);
        fill(232, 220, 184);
        textSize(16);
        text(s.name + "  (" + s.fights + " / " + Settings.COMPARISON_FIGHTS + " combats)", x0, y);
        noStroke();
        fill(40);
        rect(x0, y + 26, barW, 18, 3);
        fill(i === 0 ? color(120, 150, 200) : color(230, 150, 60));
        rect(x0, y + 26, barW * s.winRate, 18, 3);
        fill(255);
        textSize(12);
        text(Math.round(s.winRate * 100) + " %", x0 + 6, y + 28);
        fill(210);
        textSize(13);
        text("Durée moyenne " + s.avgDuration.toFixed(1) + " s · dégâts infligés " + s.avgDamageDealt.toFixed(0) +
            " · reçus " + s.avgDamageTaken.toFixed(0) + " · coups dans le vide " + s.avgWhiffs.toFixed(1), x0, y + 52);
        fill(170);
        text("Par combat : " + s.avgAttacks.toFixed(1) + " coups de hallebarde · " + s.avgCharges.toFixed(1) + " ruées · " +
            s.avgBreaths.toFixed(1) + " souffles · le joueur boit " + s.avgDrinks.toFixed(1) + " fiole(s)", x0, y + 70);
    });
    fill(40);
    rect(x0, 350, barW, 8, 3);
    fill(232, 190, 90);
    rect(x0, 350, barW * c.progress(), 8, 3);
    textAlign(CENTER, TOP);
    fill(170);
    textSize(12);
    text(c.label || "", width / 2, 368);
    if (c.done) {
        fill(255, 220, 140);
        textSize(15);
        const sentence = comparisonSentence(summary);
        text(sentence, width / 2 - barW / 2 - 60, 396, barW + 120);
    }
    pop();
}

// --- Clavier ---

function typingInMenu() {
    const el = document.activeElement;
    // Une liste déroulante qui a gardé le focus ne bloque pas le jeu : keyPressed la libère
    return el && ((el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA' || byId('helpDialog').open);
}

function keyPressed() {
    if (typingInMenu()) return true;
    const k = String(key).toLowerCase();
    if (k === 'g') {
        game.debug = !game.debug;
        byId('debugCheckbox').checked = game.debug;
        return false;
    }
    if (k === 'p') { togglePause(); return false; }
    if (game.mode === 'combat') {
        if (k === 'r') { startFight(); return false; }
        // Un curseur ou un bouton du menu garde le focus après usage : on le libère pour jouer au clavier
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        if (game.human.keyDown(k)) return false;
    }
    return true;
}

function keyReleased() {
    game.human.keyUp(String(key).toLowerCase());
    return true;
}

function windowResized() {
    const size = viewSize();
    resizeCanvas(size.w, size.h);
}
