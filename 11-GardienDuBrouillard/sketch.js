// Câblage p5 : écrans, contrôles, modes, boucle de jeu et rendu. Aucune règle de comportement ici :
// elles sont dans les modules (Player, Boss, BossBrain, Fight, Training, Comparison, Demo...), la meute du
// niveau 1 dans Creux, PackBrain, PackFight, PackTraining et PackComparison, et la logique de l'interface
// dans ScreenFlow, TitleMenu, Tutorial, HudLayout et Banner.

const game = {
    mode: 'title',           // 'title', 'combat', 'demo', 'training', 'comparison', 'pantheon' ou 'pack'
    screens: null,           // écrans et fondus (ScreenFlow)
    titleMenu: null,
    labMode: 'demo',         // outil ouvert dans le laboratoire
    titleFight: null,        // combat de fond de l'écran titre (le Gardien contre le joueur robot)
    titleEffects: null,
    titleAccumulator: 0,
    fightStarted: false,     // une partie a été lancée (« Continuer » devient possible)
    optionsFrom: null,       // 'title' ou 'pause' : où revenir en fermant les Options
    tutorialRun: null,
    feel: null,              // tremblement, flash, gel d'impact, ralenti (combat au clavier seulement)
    quality: 'moyen',
    light: null,             // calque d'éclairage (rendu)
    fogLayer: null,          // calque de brouillard (rendu)
    settings: null,
    arena: null,
    campfire: null,
    camera: null,
    human: null,
    effects: null,
    fight: null,             // combat joué au clavier (Fight contre un boss, ou PackFight contre la meute)
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
    pantheon: [],            // boss du Panthéon (fournis + ajoutés)
    tournament: null,
    resetArmed: 0,          // « Tout recommencer » demande une confirmation (deuxième clic)
    storage: null,
    // Niveau 1 : la meute des Creux
    packSettings: null,
    packPretrained: null,    // cerveau partagé fourni (pretrainedPack.js)
    packTraining: null,      // entraînement de la meute dans la page (non sauvegardé)
    packTrainingRunning: false,
    packComparison: null,
    packView: null           // combat observé dans l'onglet Meute : le joueur robot contre la meute choisie
};

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

/** Boss fourni ; converti s'il date d'une version précédente ; réseau au hasard s'il est illisible. */
function loadPretrained() {
    try {
        return TrainingStore.checkBrain(PRETRAINED_BOSS.brain, true);
    } catch (e) { /* message ci-dessous */ }
    setTimeout(() => setStatus("Le boss fourni est illisible : il est remplacé par un boss au hasard. " +
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
    textFont('Cinzel');

    game.arena = new Arena();
    game.campfire = new Campfire(game.arena.campfirePos.x, game.arena.campfirePos.y);
    game.camera = new Camera();
    game.human = new HumanController();
    game.storage = safeStorage();
    game.quality = Quality.load(game.storage);
    const q = Quality.get(game.quality);
    game.effects = new Effects(q.particles);
    game.demoEffects = [new Effects(q.particles), new Effects(q.particles)];
    game.titleEffects = new Effects(q.particles);
    game.feel = new GameFeel();
    game.light = new LightLayer(game.arena);
    game.fogLayer = new FogLayer(game.arena);
    game.screens = new ScreenFlow('title');
    game.titleMenu = new TitleMenu();
    game.pretrained = loadPretrained();
    game.bloodstains = Bloodstain.load(game.storage);
    const pantheon = Pantheon.load(game.storage);
    game.pantheon = pantheon.list;

    initControls();
    game.settings = readSettings();
    game.packSettings = readPackSettings();
    game.packPretrained = NeuralNetwork.fromJSON(PRETRAINED_PACK.brain);
    newPackTraining();

    // Entraînement sauvegardé automatiquement lors d'une visite précédente
    const saved = TrainingStore.load(game.storage);
    if (saved.training) {
        game.training = saved.training;
        game.lastGeneration = saved.training.generation;
        applySettingsToControls(saved.training.settings);
        byId('saveInfo').textContent = "Entraînement retrouvé : génération " + saved.training.generation + " (sauvegarde automatique)." +
            conversionNote(saved.training);
    } else {
        newTraining();
        if (saved.error) setStatus(saved.error, true);
    }
    if (pantheon.error) setStatus(pantheon.error, true);
    showDoctrine();
    refreshPantheon();

    startFight();
    game.camera.snap(Camera.target(game.arena, width, height, false));
    newTitleFight();
    applyScreen('title');
    // Sauvegarde d'avant les piliers : le message reste dans la ligne d'état (saveInfo est réécrit à chaque sauvegarde)
    if (game.training.convertedFrom) setStatus(conversionNote(game.training).trim());
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

    // Écran titre : souris (survol = choix, clic = valider) ; le clavier passe par keyPressed
    for (const b of document.querySelectorAll('#titleMenu button')) {
        b.addEventListener('mouseenter', () => { if (game.titleMenu.select(b.dataset.item)) refreshTitleMenu(); });
        b.addEventListener('click', () => { b.blur(); activateMenu(b.dataset.item); });
    }
    for (const b of document.querySelectorAll('#labTabs button')) {
        b.addEventListener('click', () => { b.blur(); openLabTool(b.dataset.mode); });
    }
    byId('labBackBtn').addEventListener('click', () => goScreen('title'));
    // Pause, Options, tutoriel
    byId('opponentSelect').addEventListener('change', startFight);
    byId('restartFightBtn').addEventListener('click', () => { startFight(); closePause(); });
    byId('resumeBtn').addEventListener('click', closePause);
    byId('pauseOptionsBtn').addEventListener('click', () => openOptions('pause'));
    byId('quitToTitleBtn').addEventListener('click', () => { closePause(); goScreen('title'); });
    byId('optionsBackBtn').addEventListener('click', closeOptions);
    byId('showTutorialBtn').addEventListener('click', () => { closeOptions(); openTutorial(); });
    byId('tutorialNextBtn').addEventListener('click', tutorialNext);
    byId('tutorialSkipBtn').addEventListener('click', tutorialSkip);
    byId('demoLeftSelect').addEventListener('change', startDemo);
    byId('demoRightSelect').addEventListener('change', startDemo);
    for (const t of Trials.LIST) {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = "Épreuve « " + t.label + " » : " + t.description;
        byId('demoTrialSelect').appendChild(o);
    }
    byId('demoTrialSelect').addEventListener('change', startDemo);
    for (const d of Doctrines.LIST) {
        const o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.name;
        byId('doctrineSelect').appendChild(o);
    }
    byId('doctrineSelect').addEventListener('change', doctrineChanged);
    byId('addToPantheonBtn').addEventListener('click', addChampionToPantheon);
    byId('tournamentBtn').addEventListener('click', startTournament);
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
    // Onglet Meute
    for (const name in PackSettings.PARAMETERS) {
        byId(name).addEventListener('input', () => {
            showPackValue(name);
            packSettingsChanged();
        });
        showPackValue(name);
    }
    byId('packViewSelect').addEventListener('change', () => { game.packView = null; });
    byId('packPlayBtn').addEventListener('click', () => playLevel('pack'));
    byId('packCompareBtn').addEventListener('click', startPackComparison);
    byId('packTrainBtn').addEventListener('click', () => {
        game.packTrainingRunning = !game.packTrainingRunning;
        updatePackButtons();
    });
    byId('packResetBtn').addEventListener('click', () => {
        newPackTraining();
        updatePackButtons();
        setStatus("Nouvel entraînement de la meute, avec les réglages actuels.");
    });
    byId('debugCheckbox').addEventListener('change', () => { game.debug = byId('debugCheckbox').checked; });
    for (const id in Quality.LEVELS) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = Quality.LEVELS[id].label;
        byId('qualitySelect').appendChild(o);
    }
    byId('qualitySelect').value = game.quality;
    byId('qualitySelect').addEventListener('change', () => {
        game.quality = byId('qualitySelect').value;
        Quality.save(game.storage, game.quality);
        const cap = Quality.get(game.quality).particles;
        for (const e of [game.effects, game.titleEffects].concat(game.demoEffects)) e.particles.setCap(cap);
    });
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
    if (game.fight && game.fight.boss) game.fight.boss.detectRadius = game.settings.detectRadius;
}

/** Message pour une sauvegarde d'avant les piliers, convertie au chargement. */
function conversionNote(training) {
    return training.convertedFrom ? " Votre entraînement date d'une version précédente (" + (training.convertedFrom === 2 ? "avant les piliers" : "avant l'anti-camping") +
        ") : ses cerveaux ont été convertis (16 entrées, 6 sorties) et gardent ce qu'ils avaient appris ; le champion repasse l'examen avec les nouvelles règles." : "";
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

/** Boss du Panthéon désigné par une valeur de liste « p:<id> », sinon null. */
function pantheonEntry(value) {
    return value && value.startsWith('p:') ? Pantheon.find(game.pantheon, value.slice(2)) : null;
}

function bossController(kind) {
    if (kind === 'hand') return new HandBossController();
    const entry = pantheonEntry(kind);
    if (entry) return new NeuralBossController(entry.brain);
    return new NeuralBossController(championBrain());
}

// --- Panthéon ---

/** Remplit une liste déroulante : options fixes, puis un groupe « Panthéon ». La sélection est gardée si possible. */
function fillBossSelect(select, fixed) {
    const previous = select.value;
    select.innerHTML = '';
    for (const [value, label] of fixed) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        select.appendChild(o);
    }
    const group = document.createElement('optgroup');
    group.label = "Panthéon";
    for (const e of game.pantheon) {
        const o = document.createElement('option');
        o.value = 'p:' + e.id;
        o.textContent = e.name + (e.builtin ? "" : " ★");
        group.appendChild(o);
    }
    select.appendChild(group);
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

/** Listes de boss et liste du Panthéon, après un ajout ou un retrait. */
function refreshPantheon() {
    const champion = ['champion', "Champion de votre entraînement"], hand = ['hand', "Boss écrit à la main (machine à états)"];
    fillBossSelect(byId('opponentSelect'), [champion, hand, ['pack', "Niveau 1 : la meute des Creux (apprise)"],
        ['packHand', "Niveau 1 : la meute écrite à la main"]]);
    fillBossSelect(byId('demoLeftSelect'), [['random', "Avant entraînement (réseau au hasard)"], hand, champion]);
    fillBossSelect(byId('demoRightSelect'), [champion, hand]);
    const list = byId('pantheonList');
    list.innerHTML = '';
    for (const e of game.pantheon) {
        const row = document.createElement('div');
        row.className = 'pantheon-entry';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = 'rgb(' + Doctrines.get(e.doctrine).color.join(',') + ')';
        const text = document.createElement('span');
        text.textContent = Pantheon.describe(e);
        row.append(dot, text);
        if (!e.builtin) {
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = "Retirer";
            del.addEventListener('click', () => removeFromPantheon(e.id));
            row.appendChild(del);
        }
        list.appendChild(row);
    }
}

function savePantheon() {
    const res = Pantheon.save(game.storage, game.pantheon);
    if (!res.ok) setStatus(res.error, true);
    return res.ok;
}

function addChampionToPantheon() {
    try {
        const entry = Pantheon.fromTraining(game.training);
        const res = Pantheon.add(game.pantheon, entry);
        game.pantheon = res.list;
        refreshPantheon();
        if (savePantheon()) {
            setStatus("« " + entry.name + " » rejoint le Panthéon" + (res.removed ? " (« " + res.removed.name + " », le plus ancien, laisse sa place)" : "") +
                ". Vous pouvez l'affronter, l'opposer à un autre boss en duel ou le mesurer dans le tournoi.");
        }
    } catch (e) {
        setStatus(e.message, true);
    }
}

function removeFromPantheon(id) {
    const entry = Pantheon.find(game.pantheon, id);
    game.pantheon = Pantheon.remove(game.pantheon, id);
    refreshPantheon();
    if (savePantheon() && entry) setStatus("« " + entry.name + " » a quitté le Panthéon.");
}

// --- Recette d'entraînement ---

function showDoctrine() {
    const t = game.training;
    const id = t.pendingDoctrine || t.doctrine;
    byId('doctrineSelect').value = id;
    byId('doctrineInfo').textContent = Doctrines.summary(id) +
        (t.pendingDoctrine && t.pendingDoctrine !== t.doctrine ? " Elle s'appliquera à la prochaine génération." : "");
}

/** Nouvelle recette : la note change à la génération suivante, le joueur robot de son épreuve est réglé dans le menu. */
function doctrineChanged() {
    const id = byId('doctrineSelect').value;
    game.training.setDoctrine(id);
    applySettingsToControls(Doctrines.settings(id, game.settings));
    settingsChanged();
    showDoctrine();
    setStatus("Recette « " + Doctrines.get(id).name + " » : elle s'applique à partir de la prochaine génération ; le champion repassera l'examen.");
}

// --- Modes ---

function showMode() {
    for (const m of LAB_TOOLS) byId(m + 'Section').style.display = game.mode === m ? '' : 'none';
    for (const b of document.querySelectorAll('#labTabs button')) b.classList.toggle('active', b.dataset.mode === game.mode);
    if (game.mode === 'demo') {
        startDemo();
        setStatus("Même joueur robot des deux côtés : seul le cerveau du boss change. Choisissez deux boss du Panthéon pour un duel.");
    } else if (game.mode === 'training') {
        setStatus(game.trainingRunning ? "Entraînement en cours." : "Choisissez une recette, puis cliquez sur « Lancer l'entraînement ».");
    } else if (game.mode === 'pantheon') {
        setStatus("Cliquez sur « Lancer le tournoi » : chaque boss affronte 4 joueurs robots différents.");
    } else if (game.mode === 'pack') {
        game.packView = null;
        setStatus("Le joueur robot contre la meute. « Comparer » mesure la meute apprise et la meute écrite à la main sur les mêmes combats.");
    } else {
        setStatus("Cliquez sur « Lancer 50 combats » pour mesurer les deux boss.");
    }
    updateTrainingButton();
}

function togglePause() {
    game.paused = !game.paused;
}

// --- Écrans (titre, combat, laboratoire) et fenêtres (pause, Options, tutoriel) ---

const LAB_TOOLS = ['demo', 'training', 'comparison', 'pantheon', 'pack'];

function goScreen(name) {
    game.screens.go(name);
}

/** Au noir complet du fondu : on affiche les panneaux du nouvel écran. */
function applyScreen(name) {
    for (const n of ScreenFlow.LIST) document.body.classList.toggle('screen-' + n, n === name);
    closePause(true);
    if (name === 'title') {
        game.mode = 'title';
        game.paused = false;
        refreshTitleMenu();
    } else if (name === 'combat') {
        game.mode = 'combat';
        game.paused = false;
        game.accumulator = 0;
        game.camera.snap(Camera.target(game.arena, width, height, game.fight.player.locked, game.fight.player, foeOf(game.fight)));
        if (Tutorial.shouldShow(game.storage)) openTutorial();
    } else {
        game.mode = game.labMode;
        showMode();
    }
    windowResized();
}

function refreshTitleMenu() {
    game.titleMenu.setEnabled('continue', game.fightStarted && game.state !== 'victory');
    for (const b of document.querySelectorAll('#titleMenu button')) {
        const item = game.titleMenu.items[game.titleMenu.find(b.dataset.item)];
        b.disabled = !item.enabled;
        b.classList.toggle('selected', game.titleMenu.current().id === item.id);
    }
}

function activateMenu(id) {
    if (!game.screens.interactive || !game.titleMenu.select(id)) return;
    if (id === 'new') {
        startFight();
        game.fightStarted = true;
        goScreen('combat');
    } else if (id === 'continue') {
        goScreen('combat');
    } else if (id === 'pack') {
        playLevel('pack');
    } else if (id === 'train') {
        openLabTool('training');
    } else if (id === 'pantheon') {
        openLabTool('pantheon');
    } else if (id === 'lab') {
        openLabTool('demo');
    } else if (id === 'options') {
        openOptions('title');
    }
}

function openLabTool(mode) {
    game.labMode = mode;
    if (game.screens.current === 'lab' && game.screens.interactive) {
        game.mode = mode;
        showMode();
    } else {
        goScreen('lab');
    }
}

function openPause() {
    game.paused = true;
    byId('pauseMenu').hidden = false;
}

/** Ferme le menu de pause ; `keepPaused` laisse le jeu figé (une autre fenêtre s'ouvre). */
function closePause(keepPaused = false) {
    byId('pauseMenu').hidden = true;
    if (!keepPaused) game.paused = false;
}

function openOptions(from) {
    game.optionsFrom = from;
    if (from === 'pause') byId('pauseMenu').hidden = true;
    byId('optionsScreen').hidden = false;
}

function closeOptions() {
    byId('optionsScreen').hidden = true;
    if (game.optionsFrom === 'pause') byId('pauseMenu').hidden = false;
    game.optionsFrom = null;
}

function openTutorial() {
    game.tutorialRun = new TutorialRun();
    game.paused = true;
    byId('tutorial').hidden = false;
    showTutorialCard();
}

function showTutorialCard() {
    const card = game.tutorialRun.card();
    if (!card) return closeTutorial();
    byId('tutorialStep').textContent = game.tutorialRun.progress();
    byId('tutorialTitle').textContent = card.title;
    byId('tutorialText').textContent = card.text;
    byId('tutorialNextBtn').textContent = game.tutorialRun.index === game.tutorialRun.cards.length - 1 ? "Combattre (Entrée)" : "Suivant (Entrée)";
}

function tutorialNext() {
    game.tutorialRun.next();
    showTutorialCard();
}

function tutorialSkip() {
    game.tutorialRun.skip();
    closeTutorial();
}

function closeTutorial() {
    byId('tutorial').hidden = true;
    Tutorial.markSeen(game.storage);
    game.tutorialRun = null;
    if (byId('pauseMenu').hidden) game.paused = false;
}

// --- Écran titre : le Gardien combat le joueur robot en fond, dans le brouillard ---

function newTitleFight() {
    game.titleFight = new Fight({
        arena: game.arena,
        playerController: new ScriptedPlayerController(seededRandom(1 + Math.floor(Math.random() * 1e6)), game.settings),
        bossController: new NeuralBossController(game.pretrained),
        maxTime: 60,
        detectRadius: game.settings.detectRadius,
        estus: game.settings.estusCharges,
        pillars: game.settings.pillarCount
    });
    game.titleFight.overTime = 0;
    game.titleAccumulator = 0;
}

function updateTitleFight(dt) {
    const f = game.titleFight;
    if (f.over) {
        f.overTime += dt;
        if (f.overTime > 2) newTitleFight();
        return;
    }
    game.titleAccumulator = Math.min(game.titleAccumulator + dt, Combat.DT * 4);
    while (game.titleAccumulator >= Combat.DT && !f.over) {
        headless(() => f.step());
        game.titleAccumulator -= Combat.DT;
        f.events.forEach(e => game.titleEffects.add(e, game.time));
    }
}

/** Fond de l'écran titre : le combat, assombri, avec un vignettage (rendu seulement). */
function drawTitleBackground() {
    drawWorld(game.titleFight, false, game.titleEffects);
    push();
    noStroke();
    fill(5, 6, 10, 150);
    rect(0, 0, width, height);
    const ctx = drawingContext;
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    pop();
}

// --- Combat au clavier ---

function startFight() {
    const kind = byId('opponentSelect').value;
    const opt = { arena: game.arena, playerController: game.human, maxTime: Infinity, estus: game.settings.estusCharges, pillars: game.settings.pillarCount };
    if (kind === 'pack' || kind === 'packHand') {
        game.fight = new PackFight(Object.assign(opt, {
            packController: kind === 'pack' ? new NeuralPackController(packBrain()) : new HandPackController(),
            size: game.packSettings.packSize,
            perception: game.packSettings.packPerception
        }));
    } else {
        game.fight = new Fight(Object.assign(opt, { bossController: bossController(kind), detectRadius: game.settings.detectRadius }));
    }
    game.state = 'fight';
    game.stateTime = 0;
    game.accumulator = 0;
    game.trail = { player: game.fight.player.hp, boss: foeHp(game.fight) };
    if (game.feel) game.feel.reset();
    const entry = pantheonEntry(kind);
    byId('bossInfo').textContent = kind === 'hand' ? "Machine à états écrite à la main : attente, attaque, recul."
        : kind === 'pack' ? "Niveau 1 : " + game.packSettings.packSize + " Creux qui partagent un réseau appris. " + packLabel()
        : kind === 'packHand' ? "Niveau 1 : " + game.packSettings.packSize + " Creux menés par des règles écrites à la main (poursuite, recul, morsure)."
        : entry ? Pantheon.describe(entry) : championLabel();
}

/** Lance un niveau depuis le titre ou le laboratoire (l'adversaire de la pause suit). */
function playLevel(kind) {
    byId('opponentSelect').value = kind;
    startFight();
    game.fightStarted = true;
    goScreen('combat');
}

/** L'adversaire d'un combat : le boss, ou le Creux visé par le chevalier (le plus proche). */
function foeOf(fight) {
    return fight.boss || fight.focus || null;
}

/** Vie de l'adversaire : celle du boss, ou la somme des vies de la meute. */
function foeHp(fight) {
    return fight.boss ? fight.boss.hp : fight.creux.reduce((sum, c) => sum + c.hp, 0);
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
    game.feel.update(dt);
    // Après la mort du boss, les animations finales ralentissent (le combat, lui, est terminé)
    game.stateTime += game.state === 'victory' ? dt * game.feel.visualScale() : dt;
    if (game.state === 'fight') {
        // Gel d'impact : le temps de la simulation avance moins vite (chaque pas reste identique)
        advance(f, dt * game.feel.timeScale(), events => {
            events.forEach(e => game.effects.add(e, game.time));
            game.feel.onEvents(events);
        });
        if (!f.player.alive) {
            game.state = 'dead';
            game.stateTime = 0;
            game.deaths++;
            // Tache de sang là où le chevalier est tombé, gardée d'une session à l'autre
            Bloodstain.add(game.bloodstains, f.player.pos.x, f.player.pos.y, f.lastCause, game.deaths * 977);
            Bloodstain.save(game.storage, game.bloodstains);
        } else if (f.boss ? !f.boss.alive : f.over) {
            game.state = 'victory';
            game.feel.onBossDeath();
            if (f.boss) game.effects.particles.emit('curse', f.boss.pos.x, f.boss.pos.y, 40);
            game.victoryCause = f.boss && f.boss.stats.camped ? 'camping' : null;
            game.stateTime = 0;
        }
    } else if (game.state === 'dead' && game.stateTime > 3.5) {
        // Réapparition au feu de camp ; le boss retrouve toute sa vie
        startFight();
    }
}

// --- Niveau 1 : la meute des Creux (onglet Meute) ---

function showPackValue(name) {
    byId(name + 'Val').textContent = PackSettings.format(name, Number(byId(name).value));
}

function readPackSettings() {
    const s = {};
    for (const name in PackSettings.PARAMETERS) s[name] = Number(byId(name).value);
    return PackSettings.validate(s);
}

/** Taille et perception : au prochain combat ; population, combats, mutation : au prochain « Recommencer ». */
function packSettingsChanged() {
    try {
        game.packSettings = readPackSettings();
    } catch (e) {
        return setStatus(e.message, true);
    }
    game.packView = null;
    setStatus("Réglages de la meute : ils valent pour les prochains combats ; l'entraînement les prend en cliquant « Recommencer ».");
}

/** Réglages d'un combat de la meute contre le joueur robot (60 s au plus, comme à l'entraînement). */
function packFightSettings() {
    return Object.assign({}, game.settings, game.packSettings, { maxFightTime: 60 });
}

function newPackTraining() {
    game.packTraining = new PackTraining(packFightSettings(), { seed: 1 + Math.floor(Math.random() * 100000), arena: game.arena });
    game.packTrainingRunning = false;
}

/** Cerveau partagé à affronter : le champion de l'entraînement de la page, sinon la meute fournie. */
function packBrain() {
    return (game.packTraining && game.packTraining.bestBrain()) || game.packPretrained;
}

function packLabel() {
    const t = game.packTraining;
    if (t && t.champion) return "Champion de la génération " + t.champion.generation + " de votre entraînement (" + Math.round(t.champion.winRate * 100) + " % à l'examen).";
    return "Meute fournie : " + PRETRAINED_PACK.generations + " générations, " + Math.round(PRETRAINED_PACK.exam.learned.winRate * 100) +
        " % de victoires contre le joueur robot (meute à la main : " + Math.round(PRETRAINED_PACK.exam.hand.winRate * 100) + " %).";
}

function packController(kind) {
    if (kind === 'hand') return new HandPackController();
    return new NeuralPackController(kind === 'champion' ? packBrain() : game.packPretrained);
}

function updatePackButtons() {
    byId('packTrainBtn').textContent = game.packTrainingRunning ? "⏸ Pause" : "▶ Entraîner la meute";
}

function startPackComparison() {
    const champion = game.packTraining.champion;
    game.packComparison = new PackComparison([
        { name: "Meute écrite à la main", makeController: () => new HandPackController() },
        { name: champion ? "Champion de votre entraînement" : "Meute apprise (fournie)", makeController: () => new NeuralPackController(packBrain()) }
    ], packFightSettings(), PackSettings.COMPARISON_FIGHTS, game.arena);
    setStatus("Comparaison : " + PackSettings.COMPARISON_FIGHTS + " combats pour chaque meute, les mêmes des deux côtés.");
}

function newPackView() {
    const kind = byId('packViewSelect').value;
    game.packView = PackTraining.makeFight(packController(kind), 1 + Math.floor(Math.random() * 1e6), packFightSettings(), game.arena);
    game.packView.overTime = 0;
    game.accumulator = 0;
}

function updatePack(dt) {
    const t = game.packTraining;
    if (game.packTrainingRunning) headless(() => t.work(game.settings.trainingBudget));
    if (game.packComparison && !game.packComparison.done) headless(() => game.packComparison.work(game.settings.trainingBudget));
    if (!game.packView || (game.packView.over && game.packView.overTime > 2)) newPackView();
    if (!game.paused) {
        if (game.packView.over) game.packView.overTime += dt;
        else advance(game.packView, dt, events => events.forEach(e => game.effects.add(e, game.time)));
    }
    byId('packInfo').textContent = (t.generation > 0 || game.packTrainingRunning ? "Entraînement : génération " + t.generation + ". " : "") + packLabel();
}

/** Panneau de l'onglet Meute : combat en direct, comparaison, entraînement (lecture seule de l'état). */
function drawPackOverlay() {
    const f = game.packView, c = game.packComparison, t = game.packTraining;
    // Panneau en haut à gauche ; courbes à droite si la place le permet, sinon sous le panneau
    const chartW = Math.min(360, width * 0.3), wide = width >= 520 + chartW + 110;
    const px = 48, py = 12, pw = Math.min(520, wide ? width - chartW - 110 : width - 70);
    const rows = c ? c.summary() : [];
    const ph = 92 + (c ? 40 + rows.length * 20 : 0);
    push();
    noStroke();
    fill(10, 12, 18, 225);
    rect(px, py, pw, ph, 8);
    textAlign(LEFT, TOP);
    fill(232, 220, 184);
    textSize(15);
    text("En direct : " + f.packController.name + " contre le joueur robot", px + 12, py + 10);
    fill(205);
    textSize(11);
    const e = f.lastEncirclement;
    text("Creux debout : " + f.alivePack.length + " / " + f.creux.length + " · vie du chevalier " + Math.ceil(f.player.hp) +
        (f.over ? " · " + (f.result.winner === 'pack' ? "la meute gagne" : f.result.winner === 'player' ? "le chevalier gagne" : "temps écoulé") : ""), px + 12, py + 34);
    fill(e && e.surrounded ? color(255, 110, 90) : color(150, 220, 160));
    text(e && e.surrounded ? "Chevalier ENCERCLÉ : au moins 3 Creux autour de lui, aucune sortie de 180°" :
        "Encerclé " + Math.round(100 * f.surroundTime / Math.max(f.time, 1e-9)) + " % du temps dans ce combat", px + 12, py + 52);
    fill(255, 190, 60);
    text(t.champion ? "Entraînement : génération " + t.generation + ", champion de la génération " + t.champion.generation + " (" + Math.round(t.champion.winRate * 100) + " % à l'examen)"
        : (game.packTrainingRunning ? "Entraînement : génération " + t.generation + " en cours" : "Entraînement de la meute : pas encore lancé"), px + 12, py + 70);
    if (c) {
        let y = py + 98;
        fill(232, 220, 184);
        textSize(12);
        const cols = [0, 190, 255, 315, 375, 455];
        ["Meute", "victoires", "dégâts", "pertes", "encerclé", "couverture"].forEach((h, i) => text(h, px + 12 + cols[i], y));
        y += 18;
        fill(220);
        textSize(11);
        for (const r of rows) {
            text(r.name, px + 12, y);
            if (r.fights) {
                [Math.round(r.winRate * 100) + " %", r.dealt.toFixed(0), Math.round(r.killed * 100) + " %",
                    (r.surrounded * 100).toFixed(1) + " %", r.coverage.toFixed(2)].forEach((v, i) => text(v, px + 12 + cols[i + 1], y));
            } else text("…", px + 12 + cols[1], y);
            y += 20;
        }
        fill(40);
        rect(px + 12, y, pw - 24, 6, 3);
        fill(232, 190, 90);
        rect(px + 12, y, (pw - 24) * c.progress(), 6, 3);
    }
    pop();
    if (t.history.length && !game.debug) {
        const w = wide ? chartW : Math.min(360, width - px - 40);
        FitnessChart.draw(t.history, wide ? width - w - 24 : px + 12, wide ? 44 : py + ph + 44, w, 220, "des meutes");
    }
    if (game.debug) DebugPanel.drawPack(f.packController, f, 14, py + ph + 12);
}

// --- Démonstration ---

/** Un côté de la démonstration, d'après la valeur choisie dans la liste. */
function demoSide(value) {
    if (value === 'random') return Demo.randomSide();
    if (value === 'hand') return Demo.handSide();
    const entry = pantheonEntry(value);
    if (entry) return Object.assign(Demo.brainSide(entry.name, entry.brain), { color: Doctrines.get(entry.doctrine).color, entry: entry });
    return Demo.brainSide("Après entraînement : le champion", championBrain());
}

function demoInfoText(value) {
    const entry = pantheonEntry(value);
    if (value === 'champion') return championLabel();
    if (entry) return Pantheon.describe(entry);
    return demoSide(value).label + ".";
}

function startDemo() {
    const left = byId('demoLeftSelect').value, right = byId('demoRightSelect').value;
    const trial = byId('demoTrialSelect').value;
    const settings = trial === 'settings' ? game.settings : Trials.settings(trial, game.settings);
    game.demo = new Demo(demoSide(left), demoSide(right), settings);
    game.demo.trialLabel = trial === 'settings' ? null : Trials.get(trial).label;
    game.demo.isDuel = left.startsWith('p:') && right.startsWith('p:');
    game.demoAccumulator = 0;
    byId('demoInfo').textContent = "Gauche — " + demoInfoText(left) + " Droite — " + demoInfoText(right);
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
    game.training = new Training(game.settings, { seed: 1 + Math.floor(Math.random() * 100000), doctrine: byId('doctrineSelect').value || 'gardien' });
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
        showDoctrine();
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
        estus: game.settings.estusCharges,
        pillars: game.settings.pillarCount
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
            showDoctrine();
            autosave(true);
            startFight();
            updateTrainingButton();
            setStatus("Entraînement importé : génération " + t.generation + ". " + championLabel() + conversionNote(t));
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

// --- Tournoi du Panthéon ---

/** Boss du tournoi : le boss à états (repère), les boss du Panthéon et, s'il existe, votre champion actuel. */
function tournamentContenders() {
    const list = [{ name: "Boss écrit à la main", color: [160, 160, 170], home: null, makeController: () => new HandBossController() }];
    const neural = (name, color, home, brain) => ({ name, color, home, makeController: () => new NeuralBossController(brain) });
    for (const e of game.pantheon) list.push(neural(e.name, Doctrines.get(e.doctrine).color, e.trial, e.brain));
    const t = game.training;
    if (t && t.champion) {
        list.push(neural("Votre champion (gén. " + t.champion.generation + ")", [245, 245, 245], Trials.matching(t.settings), t.champion.brain));
    }
    return list;
}

function startTournament() {
    // Réglages d'origine + joueur robot de chaque épreuve : le résultat ne dépend pas des curseurs du menu
    const trials = Trials.LIST.map(t => ({ id: t.id, label: t.label, settings: Trials.settings(t.id) }));
    const contenders = tournamentContenders();
    game.tournament = new CrossTournament(contenders, trials);
    game.tournament.homes = contenders.map(c => trials.findIndex(t => t.id === c.home));
    game.tournament.shown = false;
    byId('tournamentResults').innerHTML = '';
    setStatus("Tournoi en cours : " + contenders.length + " boss × " + trials.length + " joueurs robots × " + CrossTournament.FIGHTS + " combats.");
}

function updateTournament() {
    const tour = game.tournament;
    if (!tour) return;
    if (!tour.done) headless(() => tour.work(game.settings.trainingBudget));
    if (tour.done && !tour.shown) {
        tour.shown = true;
        const holder = byId('tournamentResults');
        holder.innerHTML = '';
        const ul = document.createElement('ul');
        for (const sentence of tournamentVerdicts(tour)) {
            const li = document.createElement('li');
            li.textContent = sentence;
            ul.appendChild(li);
        }
        holder.appendChild(ul);
        setStatus("Tournoi terminé.");
    }
}

function tournamentVerdicts(tour) {
    return CrossTournament.verdicts(tour.grid(), tour.contenders.map(c => c.name), tour.trials.map(t => t.label), tour.homes);
}

function drawPantheonOverlay() {
    const tour = game.tournament;
    const x0 = 60;
    push();
    textAlign(LEFT, TOP);
    noStroke();
    fill(232, 220, 184);
    textSize(24);
    text("Le Panthéon des boss", x0, 28);
    fill(190);
    textSize(13);
    text("Même cerveau, même algorithme génétique, même population de départ : seule la recette d'entraînement change.", x0, 62);
    if (!tour) {
        game.pantheon.forEach((e, i) => {
            const y = 100 + i * 54;
            const d = Doctrines.get(e.doctrine);
            fill(d.color[0], d.color[1], d.color[2]);
            circle(x0 + 8, y + 9, 14);
            textSize(15);
            text(e.name, x0 + 24, y);
            fill(185);
            textSize(11);
            text(d.description + " " + Pantheon.describe(e).replace(e.name + " — ", "").replace(/^./, c => c.toUpperCase()), x0 + 24, y + 20, width - x0 - 60);
        });
        fill(232, 190, 90);
        textSize(14);
        text("Cliquez sur « Lancer le tournoi » dans le menu.", x0, 110 + game.pantheon.length * 54);
        pop();
        return;
    }
    const grid = tour.grid();
    const best = CrossTournament.bestPerTrial(grid);
    const nameW = 190, rowH = 30, y0 = 100;
    const colW = constrain((width - x0 - nameW - 40) / 11, 48, 92);
    const heatCols = tour.trials.map(t => t.label).concat(["Moyenne"]);
    const styleCols = [
        { label: "Frappes", key: 'avgAttacks', digits: 1 },
        { label: "Ruées", key: 'avgCharges', digits: 1 },
        { label: "Souffles", key: 'avgBreaths', digits: 1 },
        { label: "Esquives", key: 'avgDodges', digits: 1 },
        { label: "Coups reçus", key: 'avgDamageTaken', digits: 0 },
        { label: "Fioles bues", key: 'avgDrinks', digits: 1 }
    ];
    const profiles = grid.map(CrossTournament.profile);
    // En-têtes
    textSize(12);
    fill(200);
    textAlign(CENTER, BOTTOM);
    heatCols.forEach((label, j) => text(label, x0 + nameW + j * colW + colW / 2, y0 + rowH - 6));
    fill(160);
    styleCols.forEach((c, k) => text(c.label, x0 + nameW + (heatCols.length + k) * colW + colW / 2 + 12, y0 + rowH - 6));
    textSize(10);
    text("victoires du boss contre chaque joueur robot", x0 + nameW + heatCols.length * colW / 2, y0 + 4);
    text("style : par combat, en moyenne", x0 + nameW + (heatCols.length + styleCols.length / 2) * colW + 12, y0 + 4);
    // Lignes
    grid.forEach((row, i) => {
        const y = y0 + rowH * (i + 1);
        const c = tour.contenders[i].color;
        textAlign(LEFT, CENTER);
        textSize(13);
        fill(c[0], c[1], c[2]);
        text(tour.contenders[i].name, x0, y + rowH / 2);
        const cells = row.concat([{ winRate: profiles[i].winRate, fights: row.some(x => x.fights > 0) ? 1 : 0 }]);
        cells.forEach((cell, j) => {
            const x = x0 + nameW + j * colW;
            fill(cell.fights ? lerpColor(color(30, 34, 50), color(225, 125, 50), cell.winRate) : color(24, 26, 34));
            rect(x + 2, y + 2, colW - 4, rowH - 4, 4);
            if (j === tour.homes[i]) {
                noFill();
                stroke(255, 215, 120);
                strokeWeight(2);
                rect(x + 2, y + 2, colW - 4, rowH - 4, 4);
                noStroke();
            }
            fill(cell.fights ? 245 : 90);
            textAlign(CENTER, CENTER);
            textSize(12);
            text(cell.fights ? Math.round(cell.winRate * 100) + " %" + (j < row.length && best[j] === i && tour.done ? " ★" : "") : "…",
                x + colW / 2, y + rowH / 2);
        });
        styleCols.forEach((sc, k) => {
            const x = x0 + nameW + (heatCols.length + k) * colW + 12;
            const max = Math.max(1e-9, ...profiles.map(p => p[sc.key]));
            fill(45);
            rect(x + 2, y + 9, colW - 8, rowH - 18, 3);
            fill(c[0], c[1], c[2], 200);
            rect(x + 2, y + 9, (colW - 8) * profiles[i][sc.key] / max, rowH - 18, 3);
            fill(235);
            textAlign(RIGHT, CENTER);
            textSize(10);
            text(profiles[i][sc.key].toFixed(sc.digits), x + colW - 8, y + rowH / 2);
        });
    });
    // Avancement, légende, conclusions
    let y = y0 + rowH * (grid.length + 1) + 10;
    const barW = nameW + (heatCols.length + styleCols.length) * colW;
    fill(40);
    rect(x0, y, barW, 8, 3);
    fill(232, 190, 90);
    rect(x0, y + 0, barW * tour.progress(), 8, 3);
    textAlign(LEFT, TOP);
    fill(160);
    textSize(11);
    y += 16;
    text("Case encadrée : le joueur robot contre lequel ce boss s'est entraîné · ★ : meilleur boss contre ce joueur robot · " +
        CrossTournament.FIGHTS + " combats par case, les mêmes pour tous les boss.", x0, y, barW);
    if (tour.done) {
        y += 34;
        fill(255, 220, 140);
        textSize(13);
        for (const sentence of tournamentVerdicts(tour)) {
            text("• " + sentence, x0, y, barW);
            y += textWidth(sentence) > barW - 20 ? 36 : 20;
        }
    }
    pop();
}

// --- Boucle ---

function draw() {
    const dt = Math.min(deltaTime / 1000, 0.1);
    game.time += dt;
    background(7, 8, 12);
    Vehicle.debug = game.debug;
    const change = game.screens.update(dt);
    if (change) applyScreen(change.to);
    // Cinzel (capitales) pour le jeu ; Georgia, plus étroite, pour les tableaux et courbes du laboratoire
    textFont(game.mode === 'title' || game.mode === 'combat' ? 'Cinzel' : 'Georgia');

    if (game.mode === 'title') {
        updateTitleFight(dt);
        drawTitleBackground();
    } else if (game.mode === 'combat') {
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
    } else if (game.mode === 'pantheon') {
        updateTournament();
        drawPantheonOverlay();
    } else if (game.mode === 'pack') {
        updatePack(dt);
        drawWorld(game.packView, false, game.effects);
        drawPackOverlay();
    } else {
        updateComparison();
        drawWorld(game.fight, false, game.effects, true);
        drawComparisonOverlay();
    }
    // Pendant la comparaison et l'entraînement, le combat au clavier reste figé
    const fire = game.arena.campfirePos;
    game.effects.update(game.mode === 'combat' && !game.paused ? dt * game.feel.visualScale() : (game.mode === 'combat' ? 0 : dt), fire);
    game.demoEffects.forEach(e => e.update(dt, fire));
    game.titleEffects.update(dt, fire);
    // Fondu au noir entre deux écrans
    const a = game.screens.alpha();
    if (a > 0) {
        noStroke();
        fill(7, 8, 12, 255 * a);
        rect(0, 0, width, height);
    }
}

/** Dessine l'arène et ses entités dans le repère de la caméra principale. */
function drawWorld(fight, locked, effects, dimmed = false) {
    const player = fight.player, foe = foeOf(fight);
    game.camera.follow(Camera.target(game.arena, width, height, locked, player, foe), Math.min(deltaTime / 1000, 0.1));
    push();
    if (game.mode === 'combat') {
        const s = game.feel.shake(game.time);
        translate(s.x, s.y);
    }
    game.camera.apply(width, height);
    drawEntities(fight, effects, fight === game.fight ? game.bloodstains : null);
    if (locked && foe && foe.alive) Hud.lockMark(foe, game.time);
    pop();
    if (dimmed) {
        noStroke();
        fill(0, 0, 0, 160);
        rect(0, 0, width, height);
    }
}

function drawEntities(fight, effects, stains = null) {
    const { player, boss } = fight;
    const q = Quality.get(game.quality);
    game.arena.showFloor();
    if (stains) for (const b of stains) b.show(game.time, Math.hypot(player.pos.x - b.pos.x, player.pos.y - b.pos.y) < 45);
    game.campfire.show(game.time);
    for (const z of fight.zones || []) z.show(game.time);
    for (const p of fight.pillars) p.show(game.arena.campfirePos);
    player.show();
    if (boss) boss.show();
    for (const c of fight.creux || []) c.show();
    effects.showParticles(q.glow);
    game.fogLayer.draw(game.time, q);
    game.light.draw(Lighting.sources(fight, game.arena.campfirePos, game.time), q);
    // Au-dessus de l'obscurité : ce qui doit toujours rester lisible
    if (boss) {
        game.arena.showCorners(boss.r, Combat.BOSS.camping.margin, boss.campTime / Combat.BOSS.camping.limit, game.time);
        boss.showTelegraph();
    }
    for (const c of fight.creux || []) c.showTelegraph();
    if (game.debug) {
        if (boss) DebugPanel.drawWorld(boss, player, game.arena);
        else DebugPanel.drawPackWorld(fight);
    }
    effects.show();
    if (boss) Hud.techniqueLabel(boss);
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
    const sideColor = (side, fallback) => (side.color ? color(side.color[0], side.color[1], side.color[2]) : fallback);
    const sides = [
        { fight: d.left, key: 'left', title: d.leftSide.label, score: d.score.left, x: w / 2, c: sideColor(d.leftSide, color(150, 170, 210)) },
        { fight: d.right, key: 'right', title: d.rightSide.label, score: d.score.right, x: w * 1.5, c: sideColor(d.rightSide, color(255, 190, 60)) }
    ];
    for (const sd of sides) {
        // Vainqueur de la manche (duel) : cadre à sa couleur pendant la pause
        if (d.over && d.lastWinner === sd.key) {
            noFill();
            stroke(sd.c);
            strokeWeight(3);
            rect(sd.x - w / 2 + 4, top - 4, w - 8, h + 8, 6);
            noStroke();
        }
        fill(sd.c);
        textSize(17);
        text(sd.title, sd.x, 14);
        fill(200);
        textSize(12);
        text("Victoires contre le chevalier : " + sd.score + " / " + d.score.rounds + " · manches de duel gagnées : " + d.score.duel[sd.key], sd.x, 40);
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
    text("Manche " + d.round + (d.trialLabel ? " · joueur robot « " + d.trialLabel + " »" : "") +
        " · même graine des deux côtés : seul le cerveau du boss change · égalités : " + d.score.duel.ties, width / 2, height - 20);
    if (d.over && d.lastWinner) {
        textSize(16);
        fill(255, 220, 140);
        text(d.lastWinner === 'tie' ? "Manche nulle" : "Manche pour " + (d.lastWinner === 'left' ? d.leftSide : d.rightSide).label, width / 2, height - 46);
    }
    pop();
}

function drawCombatHud(dt) {
    const f = game.fight;
    // Barres « fantômes » qui rattrapent la vie réelle (comme dans les jeux Souls)
    game.trail.player = Math.max(f.player.hp, game.trail.player - 40 * dt);
    game.trail.boss = Math.max(foeHp(f), game.trail.boss - 60 * dt);
    const layout = HudLayout.compute(width, height);
    Hud.drawPlayer(f.player, game.deaths, game.trail.player, layout);
    if (f.boss) Hud.drawBoss(f.boss, game.trail.boss, layout);
    else Hud.drawPack(f.creux, game.trail.boss, layout);
    if (game.feel.flash > 0) {
        const ctx = drawingContext;
        const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.7);
        g.addColorStop(0, 'rgba(160,0,0,0)');
        g.addColorStop(1, 'rgba(160,0,0,' + (0.45 * game.feel.flash) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    }
    if (game.debug) {
        if (f.boss) DebugPanel.draw(f.bossController, f.boss, width - DebugPanel.WIDTH - 12, layout.margin + 26, frameRate());
        else DebugPanel.drawPack(f.packController, f, width - DebugPanel.WIDTH - 12, layout.margin + 26, frameRate());
    }
    if (game.state === 'dead') {
        Hud.banner('death', "VOUS ÊTES MORT", Bloodstain.labelFor(f.lastCause).replace("Ici, vaincu", "Vaincu") + " · retour au feu de camp…",
            game.stateTime);
    } else if (game.state === 'victory') {
        Hud.banner('victory', f.boss ? "ENNEMI VAINCU" : "MEUTE ANÉANTIE", (game.victoryCause === 'camping' ? "Il s'est terré dans un coin : le brouillard l'a dévoré · " : "") +
            "Temps " + f.time.toFixed(1) + " s · morts " + game.deaths + " · R pour recommencer", game.stateTime);
    } else if (game.paused && byId('pauseMenu').hidden && byId('tutorial').hidden && byId('optionsScreen').hidden) {
        Hud.pauseLabel("PAUSE · P pour reprendre");
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
    FitnessChart.draw(t.history, wide ? width - w - 24 : px + 12, wide ? 44 : py + 214, w, h);
    push();
    noStroke();
    fill(10, 12, 18, 225);
    rect(px, py, pw, 168, 8);
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
    const doctrine = Doctrines.get(t.doctrine);
    fill(doctrine.color[0], doctrine.color[1], doctrine.color[2]);
    text("Recette : " + doctrine.name + (t.pendingDoctrine && t.pendingDoctrine !== t.doctrine
        ? " → " + Doctrines.get(t.pendingDoctrine).name + " à la prochaine génération" : ""), px + 12, py + 86);
    fill(255, 190, 60);
    text(t.champion ? "Champion : génération " + t.champion.generation + ", gagne " + Math.round(t.champion.winRate * 100) +
        " % de ses combats d'examen" : "Pas encore de champion (première génération en cours)", px + 12, py + 104);
    fill(40);
    rect(px + 12, py + 128, pw - 24, 10, 3);
    fill(232, 190, 90);
    rect(px + 12, py + 128, (pw - 24) * t.progress(), 10, 3);
    fill(150);
    text("avancement de la génération", px + 12, py + 144);
    pop();
    if (game.replay) {
        Hud.drawBoss(game.replay.boss, game.replay.boss.hp);
        push();
        fill(200);
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text("En direct : le champion contre le joueur robot", width / 2, height - 72);
        pop();
        if (game.debug) DebugPanel.draw(game.replay.bossController, game.replay.boss, 14, 198);
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
            s.avgBreaths.toFixed(1) + " souffles · " + s.avgDodges.toFixed(1) + " esquives (" + s.avgRipostes.toFixed(1) + " ripostes) · " +
            "immobile " + Math.round(s.idleShare * 100) + " % du temps · le joueur boit " + s.avgDrinks.toFixed(1) + " fiole(s)", x0, y + 70);
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
    // Fenêtres ouvertes d'abord : tutoriel, Options, pause
    if (!byId('tutorial').hidden) {
        if (k === 'enter' || k === ' ') tutorialNext();
        else if (k === 'escape') tutorialSkip();
        return false;
    }
    if (!byId('optionsScreen').hidden) {
        if (k === 'escape') { closeOptions(); return false; }
        return true;
    }
    if (k === 'g') {
        game.debug = !game.debug;
        byId('debugCheckbox').checked = game.debug;
        return false;
    }
    if (game.mode === 'title') {
        if (!game.screens.interactive) return false;
        if (k === 'arrowup' || k === 'z' || k === 'w') { game.titleMenu.move(-1); refreshTitleMenu(); return false; }
        if (k === 'arrowdown' || k === 's') { game.titleMenu.move(1); refreshTitleMenu(); return false; }
        if (k === 'enter' || k === ' ') { activateMenu(game.titleMenu.current().id); return false; }
        return true;
    }
    if (game.mode === 'combat' && k === 'escape') {
        if (byId('pauseMenu').hidden) openPause();
        else closePause();
        return false;
    }
    if (!byId('pauseMenu').hidden) return true;
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
