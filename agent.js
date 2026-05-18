/* =========================================================
   agent.js  —  El avatar, su física y la decodificación
                 del genoma
   ---------------------------------------------------------
   El proyecto soporta DOS representaciones de la solución
   (seleccionables en la interfaz). Esto es muy didáctico:
   permite comparar cómo la REPRESENTACIÓN afecta a la
   capacidad del Algoritmo Genético para resolver el problema.

   ── Modo "secuencia" (representación directa) ──────────────
     El genoma es un arreglo de enteros 0..3. Cada gen indica
     la acción durante GENE_TICKS frames:
        0 = no hacer nada
        1 = avanzar
        2 = saltar
        3 = avanzar y saltar
     Sencillo de entender, pero NO generaliza: la solución de
     un tramo no sirve para otro y la mutación rompe tramos
     ya resueltos (convergencia prematura frecuente).

   ── Modo "reactivo" (representación por política) ──────────
     El genoma es un arreglo CORTO de números reales [0,1]
     que se decodifican como UMBRALES de una política que
     reacciona a sensores del entorno (distancia al obstáculo
     y al hueco más próximos). Como el comportamiento depende
     del entorno y no del frame, GENERALIZA: la misma "regla"
     supera todos los obstáculos. El espacio de búsqueda es
     mucho menor → converge a soluciones que completan el
     nivel.

   La función fitness es idéntica para ambos modos, lo que
   hace que la comparación sea justa.
   ========================================================= */

const ACTION = { IDLE: 0, WALK: 1, JUMP: 2, WALK_JUMP: 3 };

// Frames de física por gen en el modo "secuencia".
const GENE_TICKS = 8;

// Cantidad de genes del modo "reactivo".
const REACTIVE_GENES = 4;

// Constantes de física del avatar.
// Calibradas para que un salto en carrera cubra el hueco más
// ancho del nivel (~130 px) con margen, de modo que exista
// una solución alcanzable que el GA pueda descubrir.
const PHYS = {
  walkSpeed:  3.6,    // px por frame al avanzar
  gravity:    0.62,   // aceleración hacia abajo
  jumpForce: -13.5,   // impulso vertical inicial al saltar
  bodyW:      22,     // ancho del bounding-box
  bodyH:      40,     // alto del bounding-box
  maxFall:    14,     // velocidad terminal de caída
};

class Agent {
  /**
   * @param {Array<number>} genome
   * @param {World} world
   * @param {'sequence'|'reactive'} mode
   */
  constructor(genome, world, mode = 'reactive') {
    this.genome = genome;
    this.world  = world;
    this.mode   = mode;

    // Estado físico
    this.x  = 40;
    this.y  = world.groundY - PHYS.bodyH;
    this.vy = 0;
    this.onGround = true;

    // Estado de simulación
    this.alive       = true;
    this.reachedGoal = false;
    this.ticks       = 0;
    this.maxX        = this.x;
    this.fitness     = 0;
    this.deathCause  = null;       // 'pit' | 'obstacle' | 'timeout' | null

    // Cosmético
    this.legPhase = Math.random() * Math.PI * 2;
    this.hue      = 150 + Math.random() * 70;

    // Decodificación de la política reactiva (una sola vez).
    if (mode === 'reactive') {
      const g = genome;
      this._obstTrig = 12 + g[0] * 60;   // saltar si obstáculo a < 12..72 px
      this._pitTrig  = 8  + g[1] * 45;   // saltar si borde de hueco a < 8..53 px
      this._wideBias = g[2] * 22;        // adelanto extra para huecos anchos
      this._jitter   = (g[3] - 0.5) * 6; // ajuste fino del disparo
    }
  }

  /* ----------------------------------------------------------
     Decide la acción de este frame según la representación.
     ---------------------------------------------------------- */
  _decide() {
    if (this.mode === 'sequence') {
      const idx = Math.floor(this.ticks / GENE_TICKS);
      const gene = idx >= this.genome.length ? ACTION.WALK : this.genome[idx];
      return {
        walk: gene === ACTION.WALK || gene === ACTION.WALK_JUMP,
        jump: gene === ACTION.JUMP || gene === ACTION.WALK_JUMP,
      };
    }

    // --- Modo reactivo: política basada en sensores ---
    const dObst = this.world.distanceToNextObstacle(this.x);
    const dPit  = this.world.distanceToNextPit(this.x);

    let jump = false;
    if (this.onGround) {
      if (dObst >= 0 && dObst < this._obstTrig + this._jitter) jump = true;

      // Para huecos: cuanto más ancho, antes hay que despegar.
      let pitW = 0;
      for (const p of this.world.pits) {
        if (p.x + p.w > this.x) { pitW = p.w; break; }
      }
      const trig = this._pitTrig + (pitW > 95 ? this._wideBias : 0) + this._jitter;
      if (dPit >= 0 && dPit < trig) jump = true;
    }
    return { walk: true, jump }; // en modo reactivo siempre avanza
  }

  /* Avanza un frame de física. Devuelve true si sigue vivo. */
  step() {
    if (!this.alive || this.reachedGoal) return this.alive;

    const { walk, jump } = this._decide();

    if (walk) {
      this.x += PHYS.walkSpeed;
      this.legPhase += 0.35;
    }
    if (jump && this.onGround) {
      this.vy = PHYS.jumpForce;
      this.onGround = false;
    }

    // Gravedad
    this.vy += PHYS.gravity;
    if (this.vy > PHYS.maxFall) this.vy = PHYS.maxFall;
    this.y += this.vy;

    // Suelo (solo si no hay hueco bajo los pies)
    const feetX = this.x + PHYS.bodyW / 2;
    const groundTop = this.world.groundY - PHYS.bodyH;
    const overPit = this.world.isOverPit(feetX);

    if (!overPit && this.y >= groundTop) {
      this.y = groundTop;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Muerte por caída
    if (this.y > this.world.height + 40) {
      this.kill('pit');
      return false;
    }

    // Colisión con obstáculos
    const hit = this.world.collidingObstacle(this.x, this.y, PHYS.bodyW, PHYS.bodyH);
    if (hit) {
      const obstacleTop = this.world.groundY - hit.h;
      if (this.y + PHYS.bodyH > obstacleTop + 4) {
        this.kill('obstacle');
        return false;
      }
    }

    if (this.x > this.maxX) this.maxX = this.x;
    this.ticks++;

    if (this.x >= this.world.goalX) {
      this.reachedGoal = true;
      this.alive = false;
    }
    return this.alive;
  }

  kill(cause) {
    this.alive = false;
    this.deathCause = cause;
  }

  /* ----------------------------------------------------------
     FUNCIÓN FITNESS
     ----------------------------------------------------------
       fitness =  distancia (maxX)              [término dominante]
                + ticks * 0.05                  [premia sobrevivir]
                + (reachedGoal ? +3000 : 0)     [bonus por meta]
                + (deathCause==='pit' ? -250:0) [castigo por caer]

     · "distancia" hace que el objetivo principal sea avanzar.
     · El bonus por ticks desempata a favor de los que viven
       más (más estables) cuando avanzan lo mismo.
     · El bonus por meta crea un fuerte gradiente para que,
       una vez que un individuo casi llega, la presión
       selectiva lo termine de empujar a completar el nivel.
     · El castigo por hueco penaliza avanzar a ciegas sin
       aprender a saltar.
     ---------------------------------------------------------- */
  computeFitness() {
    let f = this.maxX;
    f += this.ticks * 0.05;
    if (this.reachedGoal)          f += 3000;
    if (this.deathCause === 'pit') f -= 250;
    this.fitness = Math.max(0, f);
    return this.fitness;
  }

  /* Dibuja el avatar con polígonos: torso + cabeza + 2 piernas. */
  draw(ctx, camX, isBest = false) {
    const sx = this.x - camX;
    const sy = this.y;
    if (sx < -60 || sx > ctx.canvas.width + 60) return;

    ctx.save();
    const baseColor = this.alive
      ? `hsl(${this.hue}, 70%, 60%)`
      : `hsl(${this.hue}, 20%, 38%)`;
    ctx.globalAlpha = this.alive ? (isBest ? 1 : 0.5) : 0.25;

    if (isBest && this.alive) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(sx + PHYS.bodyW/2, sy + PHYS.bodyH/2, 34, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(180,255,57,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,255,57,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const swing = this.onGround ? Math.sin(this.legPhase) * 6 : 4;
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const hipX = sx + PHYS.bodyW/2;
    const hipY = sy + PHYS.bodyH - 14;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY); ctx.lineTo(hipX - 6 + swing, sy + PHYS.bodyH);
    ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + 6 - swing, sy + PHYS.bodyH);
    ctx.stroke();

    ctx.fillStyle = baseColor;
    roundRect(ctx, sx + 3, sy + 8, PHYS.bodyW - 6, PHYS.bodyH - 22, 5);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx + PHYS.bodyW/2, sy + 6, 7, 0, Math.PI*2);
    ctx.fillStyle = isBest && this.alive ? '#b4ff39' : baseColor;
    ctx.fill();

    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

window.Agent = Agent;
window.ACTION = ACTION;
window.GENE_TICKS = GENE_TICKS;
window.REACTIVE_GENES = REACTIVE_GENES;
window.PHYS = PHYS;
