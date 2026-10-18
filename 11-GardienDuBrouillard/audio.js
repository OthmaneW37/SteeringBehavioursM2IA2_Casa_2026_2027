// Sons et musique (rendu seulement : ils lisent les événements et l'état du combat, sans jamais les modifier).
// Fichiers CC0 dans libraries/audio (voir CREDITS.md) : effets de Kenney, musiques de qubodup (d'après yd) et
// de MintoDog.
//
// - AudioSettings : volumes (PARAMETERS, RangeError hors plage, curseurs identiques dans index.html), gardés
//   dans le navigateur ;
// - SoundBank : quels fichiers pour quel son, quel son pour quel événement du combat, quelle musique pour quelle
//   scène (fonctions pures) ;
// - AudioMixer : variantes, délai minimal entre deux répétitions d'un même son, volumes, coupure, fondu entre deux
//   musiques ; il parle à un « moteur » injecté (WebAudioBackend dans la page, un faux dans les tests) ;
// - WebAudioBackend : Web Audio pour les effets (plusieurs à la fois, sans latence), un élément <audio> en
//   boucle pour la musique. AudioContext, Audio et fetch sont injectés.
// Le navigateur n'autorise le son qu'après un geste du joueur (touche, clic) : unlock() est appelé à ce moment.
const AudioSettings = {
    KEY: 'gardienDuBrouillard.audio.v1',
    PARAMETERS: {
        masterVolume: { min: 0, max: 1, step: 0.05, initial: 0.7, decimals: 2, label: "Volume général" },
        musicVolume: { min: 0, max: 1, step: 0.05, initial: 0.5, decimals: 2, label: "Musique" },
        sfxVolume: { min: 0, max: 1, step: 0.05, initial: 0.8, decimals: 2, label: "Effets sonores" }
    },

    check(name, value) {
        const p = AudioSettings.PARAMETERS[name];
        if (!p) throw new RangeError("Réglage inconnu : " + name);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min - 1e-9 || value > p.max + 1e-9) {
            throw new RangeError(p.label + " : " + value + " hors de [" + p.min + ", " + p.max + "]");
        }
        return value;
    },

    defaults() {
        const out = { muted: false };
        for (const name in AudioSettings.PARAMETERS) out[name] = AudioSettings.PARAMETERS[name].initial;
        return out;
    },

    validate(s) {
        const out = { muted: !!s.muted };
        for (const name in AudioSettings.PARAMETERS) out[name] = AudioSettings.check(name, s[name]);
        return out;
    },

    format(name, value) {
        return Number(value).toFixed(AudioSettings.PARAMETERS[name].decimals);
    },

    load(storage) {
        try {
            const raw = storage ? storage.getItem(AudioSettings.KEY) : null;
            return raw ? AudioSettings.validate(Object.assign(AudioSettings.defaults(), JSON.parse(raw))) : AudioSettings.defaults();
        } catch (e) {
            return AudioSettings.defaults();
        }
    },

    save(storage, s) {
        const v = AudioSettings.validate(s);
        try {
            if (!storage) return false;
            storage.setItem(AudioSettings.KEY, JSON.stringify(v));
            return true;
        } catch (e) {
            return false;
        }
    }
};

const SoundBank = {
    DIR: 'libraries/audio/',
    // Chaque son : variantes (fichiers de libraries/audio/sfx, sans extension), volume relatif, délai minimal (s)
    SFX: {
        swingLight: { files: ['knifeSlice'], volume: 0.45, cooldown: 0.05 },
        swingHeavy: { files: ['chop', 'knifeSlice2'], volume: 0.6, cooldown: 0.05 },
        hitFlesh: { files: ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002'], volume: 0.7, cooldown: 0.04 },
        hitHeavy: { files: ['impactPunch_heavy_000', 'impactPunch_heavy_001'], volume: 0.85, cooldown: 0.04 },
        playerHurt: { files: ['impactPlate_heavy_000', 'impactPlate_heavy_001', 'impactPlate_heavy_002'], volume: 0.85, cooldown: 0.08 },
        parry: { files: ['impactMetal_heavy_000', 'impactMetal_heavy_001'], volume: 0.9, cooldown: 0.1 },
        critical: { files: ['impactBell_heavy_000'], volume: 0.75, cooldown: 0.2 },
        blocked: { files: ['impactMining_000', 'impactMining_001'], volume: 0.6, cooldown: 0.1 },
        roll: { files: ['cloth1', 'cloth2', 'cloth3'], volume: 0.55, cooldown: 0.1 },
        drink: { files: ['handleSmallLeather'], volume: 0.6, cooldown: 0.3 },
        crash: { files: ['impactWood_heavy_000'], volume: 0.9, cooldown: 0.2 },
        creuxBite: { files: ['impactSoft_medium_000'], volume: 0.6, cooldown: 0.06 },
        creuxDeath: { files: ['impactSoft_heavy_000'], volume: 0.7, cooldown: 0.1 },
        bossTechnique: { files: ['creak1'], volume: 0.5, cooldown: 0.5 },
        step: { files: ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003'], volume: 0.18, cooldown: 0.2 },
        death: { files: ['impactBell_heavy_004'], volume: 0.9, cooldown: 1 },
        victory: { files: ['impactBell_heavy_000'], volume: 0.8, cooldown: 1 },
        menuMove: { files: ['bookFlip1'], volume: 0.4, cooldown: 0.05 },
        menuOk: { files: ['bookPlace1'], volume: 0.5, cooldown: 0.1 },
        heal: { files: ['metalLatch'], volume: 0.5, cooldown: 0.3 }
    },
    MUSIC: {
        ambient: 'music/qubodup-yd-DarkShrineLoop.ogg',
        boss: 'music/MintoDog-heavy_boss_battle_2_bpm110.ogg'
    },
    STEP_INTERVAL: 0.34,   // secondes entre deux pas quand le chevalier marche

    /** Chemin d'un fichier d'effet. */
    sfxPath(file) {
        return SoundBank.DIR + 'sfx/' + file + '.ogg';
    },

    /** Sons d'un événement du combat (Fight.events, PackFight.events). */
    forEvent(e) {
        switch (e.type) {
            case 'hit':
                if (e.who === 'boss') return e.kind === 'bite' ? ['creuxBite', 'playerHurt'] : ['playerHurt'];
                if (e.critical) return ['critical', 'hitHeavy'];
                return [e.kind === 'heavy' ? 'hitHeavy' : 'hitFlesh'];
            case 'parry': return ['parry'];
            case 'blocked': return ['blocked'];
            case 'dodged': return ['roll'];
            case 'crash': case 'crumble': return ['crash'];
            case 'creuxDeath': return ['creuxDeath'];
            case 'wispBurst': return ['creuxBite'];
            case 'wispCast': return ['bossTechnique'];
            default: return [];
        }
    },

    /**
     * Musique d'une scène : 'ambient', 'boss' ou null (silence).
     * Ambiance sur l'écran titre, au feu de camp et contre la meute ; musique de boss contre le Gardien ; silence
     * à la mort, après une victoire et dans les outils du laboratoire. Présentation : musique de boss pendant les
     * scènes du Gardien, ambiance ailleurs (fightKind 'card' ou 'pack'), silence quand elle ne joue pas.
     */
    musicFor(mode, fightKind, state) {
        if (mode === 'title') return 'ambient';
        if (mode === 'presentation') return fightKind === 'boss' ? 'boss' : fightKind ? 'ambient' : null;
        if (mode !== 'combat') return null;
        if (state === 'rest') return 'ambient';
        if (state !== 'fight') return null;
        return fightKind === 'boss' ? 'boss' : 'ambient';
    }
};

class AudioMixer {
    constructor(backend, settings = AudioSettings.defaults(), rng = Math.random) {
        this.backend = backend;
        this.settings = AudioSettings.validate(settings);
        this.rng = rng;
        this.lastPlayed = {};     // son → instant (s) de sa dernière lecture
        this.track = null;        // musique en cours
        this.target = null;       // musique demandée
        this.fade = 0;            // 0 → 1 : volume relatif de la musique en cours (fondu)
        this.watch = { action: null, roll: null, drink: null, bossAction: null, stepClock: 0 };
    }

    setSettings(s) {
        this.settings = AudioSettings.validate(s);
        this.applyMusicGain();
    }

    sfxGain(name) {
        const s = this.settings;
        return s.muted ? 0 : s.masterVolume * s.sfxVolume * SoundBank.SFX[name].volume;
    }

    musicGain() {
        const s = this.settings;
        return s.muted ? 0 : s.masterVolume * s.musicVolume * this.fade;
    }

    /** Joue un son (une variante au hasard). Retourne le fichier joué, ou null (coupé, trop tôt, inconnu). */
    play(name, now) {
        const spec = SoundBank.SFX[name];
        if (!spec) throw new RangeError("Son inconnu : " + name);
        const gain = this.sfxGain(name);
        if (gain <= 0) return null;
        if (now - (this.lastPlayed[name] ?? -Infinity) < spec.cooldown - 1e-9) return null;   // seuil inclus (tolérance)
        this.lastPlayed[name] = now;
        const file = spec.files[Math.min(spec.files.length - 1, Math.floor(this.rng() * spec.files.length))];
        if (this.backend) this.backend.playSfx(SoundBank.sfxPath(file), gain);
        return file;
    }

    /** Sons des événements d'un pas de combat. */
    onEvents(events, now) {
        const played = [];
        for (const e of events) for (const name of SoundBank.forEvent(e)) if (this.play(name, now)) played.push(name);
        return played;
    }

    /**
     * Sons tirés de l'état (lecture seule) : un coup qui commence (sifflement de l'épée), une roulade, une gorgée,
     * une technique du boss qui commence, et les pas quand le chevalier marche. `dt` : temps écoulé (s).
     */
    cues(fight, now, dt) {
        const w = this.watch, p = fight.player, played = [];
        const once = (key, value, name) => {
            if (value && value !== w[key] && this.play(name, now)) played.push(name);
            w[key] = value;
        };
        const a = p.action;
        once('action', a && a.kind !== 'parry' ? a : null, a && a.kind === 'heavy' ? 'swingHeavy' : 'swingLight');
        once('roll', p.roll, 'roll');
        once('drink', p.drink, 'drink');
        if (fight.boss) once('bossAction', fight.boss.action, 'bossTechnique');
        // Pas : un toutes les STEP_INTERVAL s quand il marche (pas pendant une roulade)
        const walking = p.alive && !p.roll && p.vel.mag() > 1;
        w.stepClock = walking ? w.stepClock + dt : 0;
        if (walking && w.stepClock >= SoundBank.STEP_INTERVAL) {
            w.stepClock -= SoundBank.STEP_INTERVAL;
            if (this.play('step', now)) played.push('step');
        }
        return played;
    }

    /** Musique demandée ('ambient', 'boss' ou null) : le changement se fait par fondu dans update(). */
    setTrack(name) {
        if (name !== null && !SoundBank.MUSIC[name]) throw new RangeError("Musique inconnue : " + name);
        this.target = name;
    }

    /** Fondu : la musique en cours baisse en FADE s, la nouvelle commence et monte en FADE s. */
    update(dt) {
        const step = dt / AudioMixer.FADE;
        if (this.track !== this.target) {
            this.fade = Math.max(0, this.fade - step);
            if (this.fade === 0) {
                this.track = this.target;
                if (this.backend) this.backend.setMusic(this.track ? SoundBank.DIR + SoundBank.MUSIC[this.track] : null);
            }
        } else if (this.track) {
            this.fade = Math.min(1, this.fade + step);
        }
        this.applyMusicGain();
    }

    applyMusicGain() {
        if (this.backend) this.backend.setMusicGain(this.musicGain());
    }

    /** Oublie l'état suivi (nouveau combat) : pas de son « fantôme » à la première image. */
    resetCues(fight = null) {
        const p = fight ? fight.player : null;
        this.watch = { action: p ? p.action : null, roll: p ? p.roll : null, drink: p ? p.drink : null,
            bossAction: fight && fight.boss ? fight.boss.action : null, stepClock: 0 };
    }
}

AudioMixer.FADE = 1.2;   // secondes de fondu de la musique, dans chaque sens

/**
 * Moteur réel : Web Audio pour les effets (tampons décodés une fois), <audio> en boucle pour la musique.
 * deps : { AudioContext, Audio, fetch } (injectés). Sans Web Audio, les effets sont muets ; rien ne plante.
 */
class WebAudioBackend {
    constructor(deps) {
        this.deps = deps;
        this.ctx = deps.AudioContext ? new deps.AudioContext() : null;
        this.buffers = new Map();
        this.loading = new Set();
        this.music = deps.Audio ? new deps.Audio() : null;
        if (this.music) this.music.loop = true;
        this.musicFile = null;
    }

    /** Charge et décode un effet (une seule fois). */
    load(file) {
        if (!this.ctx || this.buffers.has(file) || this.loading.has(file)) return;
        this.loading.add(file);
        this.deps.fetch(file)
            .then(r => r.arrayBuffer())
            .then(b => this.ctx.decodeAudioData(b))
            .then(buf => this.buffers.set(file, buf))
            .catch(() => {})
            .finally(() => this.loading.delete(file));
    }

    preload(files) {
        for (const f of files) this.load(f);
    }

    playSfx(file, gain) {
        if (!this.ctx || this.ctx.state !== 'running') return false;
        const buf = this.buffers.get(file);
        if (!buf) {
            this.load(file);
            return false;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = gain;
        src.connect(g);
        g.connect(this.output());
        src.start();
        return true;
    }

    /** Sortie des effets : les haut-parleurs, ou le bus qui alimente aussi l'enregistrement vidéo. */
    output() {
        return this.bus || this.ctx.destination;
    }

    /**
     * Flux du son du jeu pour l'enregistrement vidéo (effets et musique), ou null sans Web Audio. Au premier appel,
     * un bus est créé : il envoie le son aux haut-parleurs ET à l'enregistrement ; la musique y est raccordée.
     */
    captureStream() {
        if (!this.ctx || typeof this.ctx.createMediaStreamDestination !== 'function') return null;
        if (!this.bus) {
            this.bus = this.ctx.createGain();
            this.bus.connect(this.ctx.destination);
            this.streamDest = this.ctx.createMediaStreamDestination();
            this.bus.connect(this.streamDest);
            if (this.music && typeof this.ctx.createMediaElementSource === 'function') {
                try {
                    this.ctx.createMediaElementSource(this.music).connect(this.bus);
                } catch (e) { /* déjà raccordée */ }
            }
        }
        return this.streamDest.stream;
    }

    setMusic(file) {
        if (!this.music || file === this.musicFile) return;
        this.musicFile = file;
        if (!file) {
            this.music.pause();
            return;
        }
        this.music.src = file;
        const p = this.music.play();
        if (p && p.catch) p.catch(() => {});   // pas encore autorisé : unlock() relancera
    }

    setMusicGain(g) {
        if (this.music) this.music.volume = Math.max(0, Math.min(1, g));
    }

    /** Après un geste du joueur : le navigateur autorise enfin le son. */
    unlock() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        if (this.music && this.musicFile && this.music.paused) {
            const p = this.music.play();
            if (p && p.catch) p.catch(() => {});
        }
    }
}
