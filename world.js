/* =========================================================
   world.js  —  Definición del escenario 2D
   ---------------------------------------------------------
   El mundo es estático: define dónde está el suelo, los
   obstáculos rectangulares, los huecos (caídas) y la meta.
   La física del avatar (gravedad, colisiones) se resuelve
   en agent.js consultando estos datos.
   ========================================================= */

class World {
  constructor() {
    // Dimensiones lógicas del nivel (más ancho que el canvas: hay scroll)
    this.width      = 3400;   // longitud total del recorrido en px
    this.height     = 460;    // alto del canvas
    this.groundY    = 360;    // coordenada Y de la superficie del suelo
    this.goalX      = 3200;   // posición X de la meta

    // Obstáculos: rectángulos que el avatar debe saltar.
    // {x, w, h}  ->  se dibujan apoyados sobre el suelo.
    // Diseño: separación mínima ~280 px entre elementos
    // consecutivos para que un avatar bien evolucionado pueda
    // aterrizar y volver a saltar (la solución existe).
    this.obstacles = [
      { x: 470,  w: 32, h: 55 },
      { x: 980,  w: 34, h: 70 },
      { x: 1780, w: 36, h: 60 },
      { x: 2320, w: 34, h: 78 },
      { x: 2900, w: 36, h: 62 },
    ];

    // Huecos: tramos del suelo SIN piso. Si el avatar entra
    // en este rango y su Y supera el suelo, cae y "muere".
    // Anchos <= 120 px: cruzables con un salto en carrera.
    // {x, w}
    this.pits = [
      { x: 1320, w: 95  },
      { x: 2080, w: 105 },
    ];
  }

  /* ¿La X dada está sobre un hueco? -> no hay suelo ahí */
  isOverPit(x) {
    for (const p of this.pits) {
      if (x >= p.x && x <= p.x + p.w) return true;
    }
    return false;
  }

  /* Devuelve el obstáculo que colisiona con el bounding-box
     del avatar, o null si no hay colisión.                   */
  collidingObstacle(ax, ay, aw, ah) {
    for (const o of this.obstacles) {
      const ox = o.x;
      const oy = this.groundY - o.h;
      const ow = o.w;
      const oh = o.h;
      if (ax < ox + ow && ax + aw > ox &&
          ay < oy + oh && ay + ah > oy) {
        return o;
      }
    }
    return null;
  }

  /* Distancia horizontal al obstáculo siguiente desde X.
     Se usa como "sensor" para los agentes reactivos.        */
  distanceToNextObstacle(x) {
    let best = Infinity;
    for (const o of this.obstacles) {
      if (o.x + o.w > x) best = Math.min(best, o.x - x);
    }
    return best;
  }

  /* Distancia horizontal al próximo hueco desde X. */
  distanceToNextPit(x) {
    let best = Infinity;
    for (const p of this.pits) {
      if (p.x + p.w > x) best = Math.min(best, p.x - x);
    }
    return best;
  }
}

window.World = World;
