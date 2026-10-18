// Enregistrement vidéo de la présentation (rendu seulement) : image du canvas (canvas.captureStream) et son du jeu
// (flux Web Audio), enregistrés par MediaRecorder en .webm. MediaRecorder, le flux d'image et le flux de son sont
// injectés : le module se teste avec des faux, sans navigateur.
class VideoRecorder {
    /**
     * deps : { MediaRecorder, videoStream (canvas.captureStream(fps)), audioStream (facultatif), MediaStream }.
     */
    constructor(deps) {
        this.deps = deps;
        this.chunks = [];
        this.recorder = null;
        this.mime = VideoRecorder.pickMime(deps.MediaRecorder);
    }

    /** Premier format pris en charge par le navigateur, du meilleur au plus simple ('' : celui par défaut). */
    static pickMime(MR) {
        if (!MR || typeof MR.isTypeSupported !== 'function') return '';
        for (const m of VideoRecorder.MIMES) if (MR.isTypeSupported(m)) return m;
        return '';
    }

    /** L'enregistrement est-il possible ici ? */
    static available(MR, canvas) {
        return !!MR && !!canvas && typeof canvas.captureStream === 'function';
    }

    get recording() {
        return !!this.recorder && this.recorder.state === 'recording';
    }

    start() {
        const d = this.deps;
        const tracks = d.videoStream.getVideoTracks().concat(d.audioStream ? d.audioStream.getAudioTracks() : []);
        const stream = d.MediaStream ? new d.MediaStream(tracks) : d.videoStream;
        this.chunks = [];
        this.startedAt = (d.now || Date.now)();
        this.recorder = new d.MediaRecorder(stream, Object.assign({ videoBitsPerSecond: VideoRecorder.BITRATE }, this.mime ? { mimeType: this.mime } : {}));
        this.recorder.ondataavailable = e => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
        this.recorder.start(1000);   // un morceau par seconde : rien n'est perdu si l'onglet se ferme mal
        return this.mime;
    }

    /**
     * Arrête et rend la vidéo (Blob webm). MediaRecorder écrit la vidéo « en direct », sans sa durée : on l'inscrit
     * dans l'en-tête (WebmDuration.fix), sinon la barre de progression et la recherche ne marchent pas partout.
     */
    stop() {
        return new Promise(resolve => {
            const done = () => {
                const raw = this.blob();
                const ms = (this.deps.now || Date.now)() - this.startedAt;
                if (typeof raw.arrayBuffer !== 'function') return resolve(raw);
                raw.arrayBuffer().then(buf => {
                    const B = this.deps.Blob || Blob;
                    resolve(new B([WebmDuration.fix(new Uint8Array(buf), ms)], { type: raw.type }));
                }).catch(() => resolve(raw));
            };
            if (!this.recorder || this.recorder.state === 'inactive') return done();
            this.recorder.onstop = done;
            this.recorder.stop();
        });
    }

    blob() {
        const B = this.deps.Blob || Blob;
        return new B(this.chunks, { type: this.mime ? this.mime.split(';')[0] : 'video/webm' });
    }
}

VideoRecorder.MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
VideoRecorder.BITRATE = 4000000;        // 4 Mbit/s : net en 1080p, environ 30 Mo par minute
VideoRecorder.FILENAME = 'gardien-du-brouillard-presentation.webm';

/**
 * Inscrit la durée dans l'en-tête d'un fichier WebM (format EBML). Le Segment contient un élément Info ; on y
 * ajoute (ou on y remplace) l'élément Duration (ID 0x4489, nombre flottant sur 8 octets, en unités de
 * TimecodeScale, soit des millisecondes par défaut). Si le Segment a une taille connue, elle est mise à jour.
 * Retourne un nouveau tableau d'octets ; un fichier qu'on ne sait pas lire est rendu tel quel.
 */
const WebmDuration = {
    SEGMENT: 0x18538067, INFO: 0x1549A966, DURATION: 0x4489, TIMECODE_SCALE: 0x2AD7B1,

    /** Identifiant EBML à la position p : { id, len } (le marqueur de longueur fait partie de l'identifiant). */
    readId(b, p) {
        const first = b[p];
        let len = 1;
        while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
        if (len > 4) return null;
        let id = 0;
        for (let i = 0; i < len; i++) id = id * 256 + b[p + i];
        return { id: id, len: len };
    },

    /** Taille EBML à la position p : { size, len, unknown } (taille « inconnue » : tous les bits de valeur à 1). */
    readSize(b, p) {
        const first = b[p];
        let len = 1;
        while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
        if (len > 8) return null;
        let size = first & (0xFF >> len);
        let allOnes = size === (0xFF >> len);
        for (let i = 1; i < len; i++) {
            size = size * 256 + b[p + i];
            if (b[p + i] !== 0xFF) allOnes = false;
        }
        return { size: size, len: len, unknown: allOnes };
    },

    /** Taille codée sur 8 octets (assez pour tout fichier). */
    sizeBytes(n) {
        const out = [0x01];
        for (let i = 6; i >= 0; i--) out.push(Math.floor(n / Math.pow(256, i)) % 256);
        return out;
    },

    floatBytes(v) {
        const dv = new DataView(new ArrayBuffer(8));
        dv.setFloat64(0, v);
        return Array.from(new Uint8Array(dv.buffer));
    },

    fix(bytes, durationMs) {
        const W = WebmDuration, b = bytes;
        try {
            // En-tête EBML, puis le Segment
            let p = 0;
            const head = W.readId(b, p);
            const headSize = W.readSize(b, p + head.len);
            p += head.len + headSize.len + headSize.size;
            const seg = W.readId(b, p);
            if (!seg || seg.id !== W.SEGMENT) return bytes;
            const segSizeAt = p + seg.len;
            const segSize = W.readSize(b, segSizeAt);
            const segData = segSizeAt + segSize.len;
            const segEnd = segSize.unknown ? b.length : Math.min(b.length, segData + segSize.size);
            // Élément Info dans le Segment
            let q = segData;
            while (q < segEnd) {
                const el = W.readId(b, q);
                const sz = W.readSize(b, q + el.len);
                const data = q + el.len + sz.len;
                if (el.id === W.INFO) {
                    // Échelle des temps (TimecodeScale, en ns ; 1 ms par défaut) et Duration existante éventuelle
                    let scale = 1000000, r = data, durAt = -1, durLen = 0;
                    const infoEnd = data + sz.size;
                    while (r < infoEnd) {
                        const c = W.readId(b, r), cs = W.readSize(b, r + c.len), cd = r + c.len + cs.len;
                        if (c.id === W.TIMECODE_SCALE) { scale = 0; for (let i = 0; i < cs.size; i++) scale = scale * 256 + b[cd + i]; }
                        if (c.id === W.DURATION) { durAt = r; durLen = c.len + cs.len + cs.size; }
                        r = cd + cs.size;
                    }
                    const value = durationMs * 1000000 / scale;
                    const durEl = [0x44, 0x89, 0x88].concat(W.floatBytes(value));
                    const payload = Array.from(b.slice(data, infoEnd));
                    if (durAt >= 0) payload.splice(durAt - data, durLen, ...durEl);
                    else payload.push(...durEl);
                    const info = [0x15, 0x49, 0xA9, 0x66].concat(W.sizeBytes(payload.length), payload);
                    const delta = info.length - (infoEnd - q);
                    // Tableau d'octets typé : un fichier de plusieurs dizaines de Mo reste léger en mémoire
                    const out = new Uint8Array(b.length + delta);
                    out.set(b.subarray(0, q), 0);
                    out.set(info, q);
                    out.set(b.subarray(infoEnd), q + info.length);
                    if (!segSize.unknown) {
                        // Taille du Segment, réécrite sur sa longueur d'origine (si elle y tient)
                        const n = segSize.size + delta;
                        const max = Math.pow(2, 7 * segSize.len) - 2;
                        if (n > max) return bytes;
                        for (let i = segSize.len - 1, v = n; i >= 0; i--, v = Math.floor(v / 256)) out[segSizeAt + i] = v % 256;
                        out[segSizeAt] |= 0x80 >> (segSize.len - 1);
                    }
                    return out;
                }
                if (sz.unknown) break;
                q = data + sz.size;
            }
            return bytes;
        } catch (e) {
            return bytes;
        }
    }
};
