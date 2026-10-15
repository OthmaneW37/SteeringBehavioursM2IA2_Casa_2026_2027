// Essaims d'insectes : détection et dessin, sans aucune force. Un essaim est un groupe d'au moins
// MIN_SIZE insectes de la MÊME espèce reliés de proche en proche (deux insectes sont reliés s'ils
// sont à moins de `radius` l'un de l'autre ; la chaîne compte : A-B et B-C font un essaim même si A
// et C sont plus éloignés). C'est de l'affichage et des statistiques ; le mouvement de groupe lui-
// même vient des forces de boids (Steering.flock*), pas d'ici.
const Swarms = (() => {
  const MIN_SIZE = 3;
  // couleur de halo par espèce (composantes r, g, b)
  const COLORS = {
    coccinelle: '255, 80, 70', scarabee: '40, 200, 170', fourmi: '170, 100, 55',
    abeille: '255, 200, 40', sauterelle: '120, 210, 70',
  };

  // essaims { species, members, center: { x, y }, radius }, du plus gros au plus petit
  function detect(insects, radius) {
    const n = insects.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = i => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (insects[i].species !== insects[j].species) continue;
        if (Math.hypot(insects[i].pos.x - insects[j].pos.x, insects[i].pos.y - insects[j].pos.y) < radius) {
          parent[find(i)] = find(j);
        }
      }
    }
    const groups = new Map();
    insects.forEach((insect, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(insect);
    });
    const swarms = [];
    for (const members of groups.values()) {
      if (members.length < MIN_SIZE) continue;
      const center = {
        x: members.reduce((sum, m) => sum + m.pos.x, 0) / members.length,
        y: members.reduce((sum, m) => sum + m.pos.y, 0) / members.length,
      };
      const reach = Math.max(...members.map(m => Math.hypot(m.pos.x - center.x, m.pos.y - center.y) + m.r));
      swarms.push({ species: members[0].species, members, center, radius: reach });
    }
    return swarms.sort((a, b) => b.members.length - a.members.length);
  }

  function stats(swarms) {
    return { count: swarms.length, largest: swarms.length ? swarms[0].members.length : 0 };
  }

  // halo doux sous chaque essaim, de la couleur de son espèce
  function draw(ctx, swarms) {
    ctx.save();
    for (const swarm of swarms) {
      const rgb = COLORS[swarm.species] ?? '255, 255, 255';
      const outer = swarm.radius + 18;
      const halo = ctx.createRadialGradient(swarm.center.x, swarm.center.y, 0, swarm.center.x, swarm.center.y, outer);
      halo.addColorStop(0, `rgba(${rgb}, 0.28)`);
      halo.addColorStop(0.7, `rgba(${rgb}, 0.16)`);
      halo.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(swarm.center.x, swarm.center.y, outer, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // debug : contour de chaque essaim, liens entre voisins de l'essaim et effectif
  function drawDebug(ctx, swarms, radius) {
    ctx.save();
    ctx.lineWidth = 1;
    for (const swarm of swarms) {
      ctx.strokeStyle = `rgb(${COLORS[swarm.species] ?? '255, 255, 255'})`;
      ctx.beginPath();
      ctx.arc(swarm.center.x, swarm.center.y, swarm.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      swarm.members.forEach((a, i) => {
        for (let j = i + 1; j < swarm.members.length; j++) {
          const b = swarm.members[j];
          if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < radius) {
            ctx.moveTo(a.pos.x, a.pos.y);
            ctx.lineTo(b.pos.x, b.pos.y);
          }
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#101018';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(swarm.members.length), swarm.center.x, swarm.center.y + 4);
    }
    ctx.restore();
  }

  return { MIN_SIZE, COLORS, detect, stats, draw, drawDebug };
})();
