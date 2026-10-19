// Câblage p5 et interface : aucune règle de comportement ici.
// Les règles sont dans les modules (Trainer, Race, Car, shouldStop, ConfigStore...).

const app = {
    mode: 'training',     // 'training' ou 'race'
    paused: false,
    settings: null,       // réglages appliqués à l'entraînement en cours
    trainer: null,
    race: null,
    shownResults: 0,      // nombre de tableaux de résultats déjà affichés
    entrants: [],         // grille de départ : { source, typeId }
    configs: [],
    showNetwork: true
};
let networkPanel = null;
let storage = null;

function byId(id) {
    return document.getElementById(id);
}

function setStatus(message, isError = false) {
    const el = byId('statusMsg');
    el.textContent = message || '';
    el.classList.toggle('error', isError);
}

function setConfigMsg(message, isError = false) {
    const el = byId('configMsg');
    el.textContent = message || '';
    el.classList.toggle('error', isError);
}

// Accès au stockage protégé : un navigateur peut le refuser
function safeLocalStorage() {
    try {
        return window.localStorage;
    } catch (e) {
        return null;
    }
}

function canvasSize() {
    const c = byId('canvas-container');
    return { w: Math.max(200, c.clientWidth), h: Math.max(200, c.clientHeight) };
}

function setup() {
    const size = canvasSize();
    let canvas = createCanvas(size.w, size.h);
    canvas.parent('canvas-container');

    Controls.init(document);
    Controls.showLayers(document);
    Controls.showCarTypeMode(document);
    networkPanel = new NetworkPanel();
    storage = safeLocalStorage();

    app.settings = Controls.readSettings(document);
    applyGlobals(app.settings);
    startTraining(null, "Entraînement lancé : réseau [" + Settings.networkSizes(app.settings).join(', ') + "].");

    bindControls();
    refreshConfigList();
    refreshRaceBrains();
    addAllTypes();
}

function applyGlobals(s) {
    GAME_SPEED_LIMIT = s.speedLimit;
    TRACK_DIFFICULTY = s.trackDifficulty;
    TRACK_WIDTH = s.trackWidth;
}

function buildWorld(id) {
    buildCircuit(id);
    return currentWorld();
}

// --- Entraînement ---

function startTraining(seedBrain, message) {
    app.trainer = new Trainer(app.settings, {
        buildWorld: buildWorld,
        onEvent: (type, msg) => {
            setStatus(msg);
            if (type === 'stop') byId('saveBestBtn').disabled = false;
        }
    }, seedBrain);
    byId('saveBestBtn').disabled = true;
    updateArchInfo();
    updateCircuitInfo();
    setStatus(message);
}

/** Réglages qui s'appliquent sans relancer (prochaine génération). */
function liveSettingsChanged() {
    try {
        const s = Controls.readSettings(document);
        // L'architecture ne change qu'avec le bouton « Appliquer »
        s.hiddenLayers = app.settings.hiddenLayers;
        s.brake = app.settings.brake;
        app.settings = s;
        app.trainer.updateSettings(s);
        updateCarTypeInfo();
    } catch (e) {
        setStatus(e.message, true);
    }
}

function updateArchInfo() {
    let pending = false;
    try {
        const s = Controls.readSettings(document);
        pending = Settings.networkSizes(s).join() !== Settings.networkSizes(app.settings).join();
    } catch (e) { /* message affiché ailleurs */ }
    const nn = app.trainer.cars.length ? app.trainer.cars[0].brain : null;
    byId('archInfo').textContent = "Réseau actuel : [" + Settings.networkSizes(app.settings).join(', ') + "]" +
        (nn ? ", " + nn.paramCount() + " paramètres" : "") +
        (pending ? ". Modifié : cliquer « Appliquer » pour relancer l'entraînement." : ".");
}

function updateCircuitInfo() {
    const ids = app.settings.circuits;
    byId('circuitInfo').textContent = ids.map(id => Circuits.get(id).name).join(' → ') +
        (ids.length > 1 ? " (puis retour au premier)" : "");
}

function updateCarTypeInfo() {
    const ids = app.settings.carTypes.ids;
    byId('carTypeInfo').textContent = ids.map(id => CarTypes.get(id).description).join(' ');
}

// --- Course ---

function brainFromSource(source) {
    if (source === 'training') {
        const t = app.trainer;
        if (t.bestBrain) return t.bestBrain;
        const any = t.leader || t.cars[0] || t.saved[0];
        return any ? any.brain : null;
    }
    const config = ConfigStore.find(app.configs, source.slice('config:'.length));
    return ConfigStore.brainOf(config);
}

function sourceLabel(source) {
    return source === 'training' ? "Entraînement" : source.slice('config:'.length);
}

function refreshRaceBrains() {
    const options = [{ value: 'training', label: "Meilleur cerveau de l'entraînement" }];
    for (const c of app.configs) {
        if (c.brain) options.push({ value: 'config:' + c.name, label: c.name + " [" + c.brain.sizes.join('-') + "]" });
    }
    const select = byId('raceBrainSelect');
    const previous = select.value;
    Controls.fillSelect(document, 'raceBrainSelect', options);
    if (options.some(o => o.value === previous)) select.value = previous;
    // Les voitures dont le cerveau a disparu quittent la grille
    app.entrants = app.entrants.filter(e => options.some(o => o.value === e.source));
    renderEntrants();
}

function renderEntrants() {
    const list = byId('entrantList');
    list.innerHTML = '';
    app.entrants.forEach((e, i) => {
        const li = document.createElement('li');
        li.textContent = sourceLabel(e.source) + " · " + CarTypes.get(e.typeId).label;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '✕';
        remove.title = "Retirer";
        remove.addEventListener('click', () => { app.entrants.splice(i, 1); renderEntrants(); });
        li.appendChild(remove);
        list.appendChild(li);
    });
}

function addAllTypes() {
    const source = byId('raceBrainSelect').value || 'training';
    for (const id of CarTypes.ids()) app.entrants.push({ source: source, typeId: id });
    renderEntrants();
}

function startRace() {
    try {
        const circuits = Controls.readCircuits(document, 'raceCircuitSet', 'raceCircuitList');
        if (circuits.length === 0) throw new RangeError("Choisir au moins un circuit pour la course.");
        const laps = Controls.sliderValue(document, 'raceLaps');
        const count = {};
        const entrants = app.entrants.map(e => {
            const brain = brainFromSource(e.source);
            if (!brain) throw new RangeError("Cerveau indisponible : " + sourceLabel(e.source));
            const label = sourceLabel(e.source) + " · " + CarTypes.get(e.typeId).label;
            count[label] = (count[label] || 0) + 1;
            return { label: count[label] > 1 ? label + " #" + count[label] : label, brain: brain, typeId: e.typeId };
        });
        app.race = new Race({ entrants: entrants, circuits: circuits, laps: laps, buildWorld: buildWorld });
        app.shownResults = 0;
        byId('raceResults').innerHTML = '';
        app.paused = false;
        byId('pauseBtn').textContent = "Pause";
        setStatus("Course lancée : " + circuits.length + " circuit(s), " + laps + " tour(s) chacun.");
    } catch (e) {
        setStatus(e.message, true);
    }
}

function formatTime(seconds) {
    return seconds === null || seconds === undefined ? '–' : seconds.toFixed(2) + " s";
}

function appendTable(container, title, headers, rows) {
    const h = document.createElement('h4');
    h.textContent = title;
    container.appendChild(h);
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const text of headers) {
        const th = document.createElement('th');
        th.textContent = text;
        head.appendChild(th);
    }
    table.appendChild(head);
    for (const cells of rows) {
        const tr = document.createElement('tr');
        for (const text of cells) {
            const td = document.createElement('td');
            td.textContent = text;
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    container.appendChild(table);
}

function showRaceResults() {
    const race = app.race;
    const container = byId('raceResults');
    while (app.shownResults < race.results.length) {
        const res = race.results[app.shownResults];
        appendTable(container, Circuits.get(res.circuitId).name,
            ["Pos", "Voiture", "Tours", "Meilleur tour", "Total", "Pts"],
            res.rows.map(r => [r.position, r.label, r.laps, formatTime(r.bestLap),
            r.totalTime !== null ? formatTime(r.totalTime) : r.status, r.points]));
        app.shownResults++;
    }
    if (race.state === 'finished' && !container.dataset.final) {
        appendTable(container, "Classement général", ["Pos", "Voiture", "Points", "Arrivées"],
            race.overall().map(r => [r.position, r.label, r.points, r.finishes]));
        container.dataset.final = '1';
        setStatus("Course terminée : voir le tableau des résultats.");
    }
}

// --- Modes ---

function switchMode(mode) {
    if (mode === app.mode) return;
    app.mode = mode;
    if (mode === 'race') {
        // L'entraînement est suspendu (rien n'avance) ; la course a ses propres voitures
        app.race = null;
        byId('raceSection').open = true;
        refreshRaceBrains();
        setStatus("Mode course : composez la grille puis lancez la course. L'entraînement est suspendu.");
    } else {
        // Fin de la course, puis remise à zéro contrôlée de la génération en cours
        app.race = null;
        app.trainer.restartGeneration(buildWorld(app.trainer.curriculum.current()));
        setStatus("Retour à l'entraînement : la génération " + app.trainer.generation + " repart du départ.");
    }
    byId('restartBtn').disabled = mode === 'race';
}

// --- Configurations ---

function refreshConfigList(selectName) {
    const read = ConfigStore.readAll(storage);
    app.configs = read.configs;
    if (read.error) setConfigMsg(read.error, true);
    Controls.fillSelect(document, 'configList', app.configs.map(c => ({
        value: c.name, label: c.name + (c.brain ? " 🧠" : "") + " – " + c.savedAt.slice(0, 10)
    })));
    if (selectName) byId('configList').value = selectName;
    refreshRaceBrains();
}

function selectedConfig() {
    const name = byId('configList').value;
    const config = ConfigStore.find(app.configs, name);
    if (!config) setConfigMsg("Choisir une configuration dans la liste.", true);
    return config;
}

function saveConfig(name, withBrain) {
    try {
        const s = Controls.readSettings(document);
        s.hiddenLayers = app.settings.hiddenLayers;  // architecture du cerveau sauvegardé
        s.brake = app.settings.brake;
        const t = app.trainer;
        const brain = withBrain ? (t.bestBrain || (t.leader ? t.leader.brain : null)) : null;
        const config = ConfigStore.create(name, s, brain);
        const res = ConfigStore.save(storage, config);
        if (!res.ok) return setConfigMsg(res.error, true);
        refreshConfigList(config.name);
        setConfigMsg("Configuration « " + config.name + " » sauvegardée" + (brain ? " avec le cerveau." : "."));
    } catch (e) {
        setConfigMsg(e.message, true);
    }
}

function loadConfig(config) {
    Controls.applySettings(document, config.settings);
    app.settings = config.settings;
    applyGlobals(app.settings);
    if (app.mode !== 'training') {
        byId('modeSelect').value = 'training';
        app.mode = 'training';
        app.race = null;
        byId('restartBtn').disabled = false;
    }
    startTraining(ConfigStore.brainOf(config), "Configuration « " + config.name + " » chargée" +
        (config.brain ? " : la population part de son cerveau." : " : nouvelle population."));
    setConfigMsg("Configuration chargée.");
}

function exportConfig(config) {
    const blob = new Blob([ConfigStore.serialize(config)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ConfigStore.fileName(config);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importConfig(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const config = ConfigStore.parse(String(reader.result));
            const res = ConfigStore.save(storage, config);
            if (!res.ok) return setConfigMsg(res.error, true);
            refreshConfigList(config.name);
            setConfigMsg("Fichier importé : « " + config.name + " ».");
        } catch (e) {
            setConfigMsg("Import refusé : " + e.message, true);
        }
    };
    reader.readAsText(file);
}

// --- Contrôles ---

function bindControls() {
    for (const id in Controls.SLIDERS) {
        byId(id).addEventListener('input', () => Controls.showValue(document, id));
    }

    byId('speedSlider').addEventListener('input', () => {
        GAME_SPEED_LIMIT = Controls.sliderValue(document, 'speedSlider');
        liveSettingsChanged();
    });

    for (const id of ['diffSlider', 'widthSlider']) {
        byId(id).addEventListener('input', () => {
            liveSettingsChanged();
            applyGlobals(app.settings);
            if (app.mode === 'training' && app.trainer.curriculum.current() === 'genere') {
                // Comme avant : nouveau circuit généré et reprise de l'entraînement s'il était fini
                buildCircuit('genere', true);
                app.trainer.restartGeneration(currentWorld());
                if (app.trainer.stopped) {
                    app.trainer.resume();
                    byId('saveBestBtn').disabled = true;
                    setStatus("Nouveau circuit généré : l'entraînement reprend.");
                }
            }
        });
    }

    for (const id of ['populationSize', 'mutationRate', 'lapsPerRun', 'carTypeMode', 'carTypeUnique', 'carTypeMix']) {
        byId(id).addEventListener(id.startsWith('carType') ? 'change' : 'input', () => {
            Controls.showCarTypeMode(document);
            liveSettingsChanged();
        });
    }
    for (const key of Settings.TERMINATION_KEYS) {
        const id = Controls.termId(key);
        byId(id).addEventListener('input', liveSettingsChanged);
        byId(id + 'On').addEventListener('change', liveSettingsChanged);
    }

    for (const id of ['hiddenLayerCount', 'neurons1', 'neurons2', 'neurons3', 'neurons4', 'neurons5']) {
        byId(id).addEventListener('input', () => { Controls.showLayers(document); updateArchInfo(); });
    }
    byId('brakeOutput').addEventListener('change', updateArchInfo);
    byId('applyArchBtn').addEventListener('click', () => {
        try {
            app.settings = Controls.readSettings(document);
            applyGlobals(app.settings);
            if (app.mode === 'race') switchModeSelect('training');
            startTraining(null, "Architecture [" + Settings.networkSizes(app.settings).join(', ') +
                "] appliquée : nouvelle population, l'entraînement repart de la génération 0.");
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    // Circuits de l'entraînement : même population, nouveau curriculum
    const circuitsChanged = () => {
        try {
            const ids = Controls.readCircuits(document, 'circuitSet', 'circuitList');
            if (ids.length === 0) throw new RangeError("Choisir au moins un circuit.");
            app.settings = Object.assign({}, app.settings, { circuits: ids });
            app.trainer.setCircuits(ids);
            updateCircuitInfo();
            setStatus("Circuits : " + ids.length + " circuit(s) ; le cerveau est conservé.");
        } catch (e) {
            setStatus(e.message, true);
        }
    };
    byId('circuitSet').addEventListener('change', () => { Controls.applyCircuitSet(document, 'circuitSet', 'circuitList'); circuitsChanged(); });
    byId('circuitList').addEventListener('change', () => { Controls.onCircuitListChanged(document, 'circuitSet', 'circuitList'); circuitsChanged(); });
    byId('raceCircuitSet').addEventListener('change', () => Controls.applyCircuitSet(document, 'raceCircuitSet', 'raceCircuitList'));
    byId('raceCircuitList').addEventListener('change', () => Controls.onCircuitListChanged(document, 'raceCircuitSet', 'raceCircuitList'));

    byId('modeSelect').addEventListener('change', () => switchMode(byId('modeSelect').value));
    byId('pauseBtn').addEventListener('click', () => {
        app.paused = !app.paused;
        byId('pauseBtn').textContent = app.paused ? "Reprendre" : "Pause";
    });
    byId('restartBtn').addEventListener('click', () => {
        try {
            app.settings = Controls.readSettings(document);
            applyGlobals(app.settings);
            startTraining(null, "Entraînement relancé : nouvelle population.");
        } catch (e) {
            setStatus(e.message, true);
        }
    });

    byId('showNetwork').addEventListener('change', () => { app.showNetwork = byId('showNetwork').checked; });
    byId('panelToggle').addEventListener('click', togglePanel);

    // Configurations
    byId('saveConfigBtn').addEventListener('click', () => saveConfig(byId('configName').value, byId('includeBrain').checked));
    byId('saveBestBtn').addEventListener('click', () => {
        const name = byId('configName').value.trim() || ("Meilleur cerveau G" + app.trainer.generation);
        saveConfig(name, true);
    });
    byId('configList').addEventListener('change', () => {
        const c = ConfigStore.find(app.configs, byId('configList').value);
        if (c) byId('configName').value = c.name;
    });
    byId('loadConfigBtn').addEventListener('click', () => { const c = selectedConfig(); if (c) loadConfig(c); });
    byId('renameConfigBtn').addEventListener('click', () => {
        const c = selectedConfig();
        if (!c) return;
        try {
            const res = ConfigStore.rename(storage, c.name, byId('configName').value);
            if (!res.ok) return setConfigMsg(res.error, true);
            refreshConfigList(byId('configName').value.trim());
            setConfigMsg("Configuration renommée.");
        } catch (e) {
            setConfigMsg(e.message, true);
        }
    });
    byId('deleteConfigBtn').addEventListener('click', () => {
        const c = selectedConfig();
        if (!c) return;
        const res = ConfigStore.remove(storage, c.name);
        if (!res.ok) return setConfigMsg(res.error, true);
        refreshConfigList();
        setConfigMsg("Configuration « " + c.name + " » supprimée.");
    });
    byId('exportConfigBtn').addEventListener('click', () => { const c = selectedConfig(); if (c) exportConfig(c); });
    byId('importConfigInput').addEventListener('change', () => {
        const input = byId('importConfigInput');
        if (input.files && input.files[0]) importConfig(input.files[0]);
        input.value = '';
    });

    // Course
    byId('addEntrantBtn').addEventListener('click', () => {
        app.entrants.push({ source: byId('raceBrainSelect').value, typeId: byId('raceTypeSelect').value });
        renderEntrants();
    });
    byId('addAllTypesBtn').addEventListener('click', addAllTypes);
    byId('clearEntrantsBtn').addEventListener('click', () => { app.entrants = []; renderEntrants(); });
    byId('startRaceBtn').addEventListener('click', () => {
        if (app.mode !== 'race') switchModeSelect('race');
        delete byId('raceResults').dataset.final;
        startRace();
    });
}

function switchModeSelect(mode) {
    byId('modeSelect').value = mode;
    switchMode(mode);
}

function togglePanel() {
    document.body.classList.toggle('panel-hidden');
    byId('panelToggle').textContent = document.body.classList.contains('panel-hidden') ? '▶' : '◀';
    windowResized();
}

function keyPressed() {
    // On n'intercepte pas les frappes dans les champs du menu
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (key === 'n' || key === 'N') {
        app.showNetwork = !app.showNetwork;
        byId('showNetwork').checked = app.showNetwork;
    }
}

function windowResized() {
    const size = canvasSize();
    resizeCanvas(size.w, size.h);
    if (app.mode === 'race' && app.race && app.race.state === 'running') {
        app.race.startCircuit(); // le circuit est reconstruit à la nouvelle taille
    } else {
        app.trainer.restartGeneration(buildWorld(app.trainer.curriculum.current()));
    }
}

// --- Boucle ---

function draw() {
    background(30);

    const steps = app.paused ? 0 : Controls.sliderValue(document, 'simSpeed');
    let leader = null;
    let cars = [];

    if (app.mode === 'training') {
        const t = app.trainer;
        for (let k = 0; k < steps; k++) t.step();
        if (!app.paused) t.tick(Math.min(deltaTime, 100) / 1000);
        leader = t.leader;
        cars = t.cars;
    } else if (app.race) {
        for (let k = 0; k < steps; k++) app.race.step();
        if (app.race.results.length > app.shownResults || app.race.state === 'finished') showRaceResults();
        cars = app.race.cars;
        leader = app.race.state === 'running' ? app.race.leader() : null;
    }

    drawTrack();

    // Afficher les voitures (sauf la meilleure qu'on dessine à la fin)
    for (let car of cars) {
        if (car !== leader) car.show(false);
    }
    if (leader) {
        leader.show(true);
        // Debug : Ligne vers le prochain checkpoint
        if (checkpoints.length > 0) {
            let target = checkpoints[leader.checkpointIndex % checkpoints.length];
            let center = p5.Vector.add(target.a, target.b).div(2);
            stroke(0, 0, 255);
            line(leader.pos.x, leader.pos.y, center.x, center.y);
        }
    }

    if (app.showNetwork) networkPanel.draw(leader, 10, height - NetworkView.HEIGHT - 56);

    if (app.mode === 'training') drawTrainingHUD();
    else drawRaceHUD();
}

function drawTrack() {
    showTiles(); // Rendu des "Cartes" LEGO

    // Checkpoints (d'abord pour être dessous)
    for (let i = 0; i < checkpoints.length; i++) {
        checkpoints[i].show();
        let center = p5.Vector.add(checkpoints[i].a, checkpoints[i].b).div(2);
        fill(255, 100);
        noStroke();
        textSize(10);
        textAlign(CENTER, CENTER);
        text(i, center.x, center.y);
    }
    for (let wall of walls) {
        wall.show();
    }
}

function shadowText(lines, x, y, spacing = 22) {
    textSize(16);
    textAlign(LEFT);
    noStroke();
    lines.forEach((l, i) => {
        fill(0, 150);
        text(l, x + 1, y + i * spacing + 1);
        fill(255);
        text(l, x, y + i * spacing);
    });
}

function drawTrainingHUD() {
    const t = app.trainer;
    const s = t.lastStats;
    const c = t.curriculum;
    const current = t.cars.length > 0 ? Math.max(...t.cars.map(car => car.score)) : 0;
    shadowText([
        "Génération : " + t.generation,
        "Voitures en vie : " + t.cars.length + " / " + (t.cars.length + t.saved.length),
        "Meilleur score : " + current.toFixed(0) + "   (record " + (t.progress.bestScore > -Infinity ? t.progress.bestScore.toFixed(0) : "–") + ")",
        "Dernière génération : meilleur " + s.best.toFixed(0) + ", moyenne " + s.mean.toFixed(0),
        "Tours réussis : " + s.totalLaps + " (" + s.finished + " voiture(s), " + Math.round(s.successRate * 100) + " %)",
        "Circuit : " + Circuits.get(c.current()).name + " (" + (c.index + 1) + " / " + c.ids.length + "), circuits passés : " + c.passed,
        "Stagnation : " + t.progress.generationsWithoutImprovement + " gén.   Temps : " + t.elapsedSeconds.toFixed(0) + " s" + (app.paused ? "   [PAUSE]" : "")
    ], 50, 32);

    if (t.stopped) {
        textAlign(CENTER, CENTER);
        textSize(40);
        fill(0, 255, 0);
        stroke(0);
        strokeWeight(4);
        text("ENTRAÎNEMENT TERMINÉ", width / 2, height / 2 - 20);
        textSize(16);
        strokeWeight(3);
        fill(255);
        text(t.stopReason + "\nPopulation figée. « Sauvegarder le meilleur cerveau » dans le menu.", width / 2, height / 2 + 30);
        noStroke();
        strokeWeight(1);
    }
}

function drawRaceHUD() {
    const race = app.race;
    if (!race) {
        shadowText(["MODE COURSE", "Composez la grille dans le menu « Course », puis « Lancer la course »."], 50, 32);
        return;
    }
    if (race.state === 'finished') {
        shadowText(["COURSE TERMINÉE", "Résultats dans le menu « Course »."], 50, 32);
        return;
    }
    const lines = [
        "Course : " + Circuits.get(race.currentCircuitId()).name + " (" + (race.circuitIndex + 1) + " / " + race.circuits.length + ")" +
        "   Temps : " + race.time.toFixed(1) + " s" + (app.paused ? "   [PAUSE]" : "")
    ];
    for (const r of race.standings()) {
        const last = r.lapTimes.length ? formatTime(r.lapTimes[r.lapTimes.length - 1]) : "–";
        lines.push(r.position + ". " + r.label + "  tours " + r.laps + "/" + race.laps + "  dernier tour " + last + "  " + r.status);
    }
    shadowText(lines, 50, 32, 20);
}
