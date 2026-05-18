/* =========================================================
   game.js  —  Motor de simulación y render
   ---------------------------------------------------------
   Une el mundo, los agentes y el algoritmo genético:
     - Crea una población de Agents desde los genomas.
     - Simula todos los agentes en paralelo (mismo nivel).
     - Cuando todos mueren o llegan a la meta, evalúa el
       fitness y pide al GA la siguiente generación.
     - Dibuja escenario + avatares + cámara + gráfico.
   ========================================================= */

class Game {
  constructor(canvas, chartCanvas, ui) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.chart  = chartCanvas;
    this.cctx   = chartCanvas.getContext('2d');
    this.ui     = ui;          // callbacks para actualizar el HUD

    this.world  = new World();
    this.ga     = null;
    this.agents = [];

    this.running = false;
    this.paused  = false;
    this.speed   = 1;          // pasos de física por frame de animación
    this.renderAll = true;
    this.turbo   = false;      // si true: simula sin dibujar hasta acabar la gen

    this.maxTicksPerGen = 0;   // límite anti-bucle (timeout)
    this.evaluatedTotal = 0;

    this._raf = null;
    this._loop = this._loop.bind(this);
  }

  /* Configura el GA y prepara la primera generación. */
  setup(cfg) {
    this.ga = new GeneticAlgorithm(cfg);
    this.mode = this.ga.mode;
    // Tiempo máximo por generación (límite anti-bucle):
    //  · secuencia : lo que dura el genoma + margen para caer.
    //  · reactivo  : el genoma es corto y la política es continua,
    //    así que el límite depende del ANCHO del nivel (cuánto
    //    tardaría en cruzarlo caminando) más un margen.
    this.maxTicksPerGen = (this.mode === 'reactive')
      ? Math.ceil(this.world.width / PHYS.walkSpeed) + 220
      : cfg.genomeLength * GENE_TICKS + 120;
    this.evaluatedTotal = 0;
    this._spawnGeneration();
    this._drawChart();
    this.render();   // primer fotograma estático
  }

  /* Crea los Agents de la generación actual (con el modo activo). */
  _spawnGeneration() {
    this.agents = this.ga.population.map(g => new Agent(g, this.world, this.mode));
    this.genTicks = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._raf = requestAnimationFrame(this._loop);
  }

  pause() {
    this.paused = !this.paused;
    if (!this.paused && this.running) {
      this._raf = requestAnimationFrame(this._loop);
    }
    return this.paused;
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  /* ---------- BUCLE PRINCIPAL ---------- */
  _loop() {
    if (!this.running || this.paused) return;

    if (this.turbo) {
      // Modo turbo: resuelve la generación completa sin animar.
      this._runWholeGenerationFast();
    } else {
      // Avanza `speed` pasos de física por frame.
      for (let s = 0; s < this.speed; s++) {
        const finished = this._stepPhysics();
        if (finished) { this._endGeneration(); break; }
      }
      this.render();
    }

    this._updateHUD();
    this._raf = requestAnimationFrame(this._loop);
  }

  /* Un paso de física para toda la población.
     Devuelve true si la generación terminó.            */
  _stepPhysics() {
    let anyAlive = false;
    for (const a of this.agents) {
      if (a.alive && !a.reachedGoal) {
        a.step();
        if (a.alive) anyAlive = true;
      }
    }
    this.genTicks++;

    // Timeout: si nadie progresa o se acaba el tiempo.
    if (this.genTicks >= this.maxTicksPerGen) {
      for (const a of this.agents) {
        if (a.alive) { a.deathCause = 'timeout'; a.alive = false; }
      }
      return true;
    }
    return !anyAlive;
  }

  /* Simula la generación entera lo más rápido posible. */
  _runWholeGenerationFast() {
    let guard = 0;
    while (guard++ < this.maxTicksPerGen + 5) {
      if (this._stepPhysics()) break;
    }
    this._endGeneration();
    // Dibuja solo 1 fotograma cada 5 generaciones en turbo.
    if (this.ga.generation % 5 === 0) this.render();
  }

  /* Evalúa fitness y pide la siguiente generación. */
  _endGeneration() {
    const scored = this.agents.map(a => ({
      genome:  a.genome,
      fitness: a.computeFitness(),
      agent:   a,
    }));

    this.evaluatedTotal += scored.length;
    this.ga.evolve(scored);
    this._drawChart();
    this._spawnGeneration();
  }

  /* ---------- RENDER DEL ESCENARIO ---------- */
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Cámara: sigue al agente vivo más adelantado.
    const lead = this._leadAgent();
    const camX = Math.max(0, Math.min(
      (lead ? lead.x : 0) - W * 0.35,
      this.world.width - W
    ));

    ctx.clearRect(0, 0, W, H);

    // Fondo con parallax suave
    this._drawBackground(ctx, camX, W, H);

    // Suelo (con huecos)
    this._drawGround(ctx, camX, W);

    // Obstáculos
    this._drawObstacles(ctx, camX);

    // Meta
    this._drawGoal(ctx, camX, H);

    // Avatares
    const best = this._bestCurrentAgent();
    if (this.renderAll) {
      for (const a of this.agents) {
        if (a !== best) a.draw(ctx, camX, false);
      }
    }
    if (best) best.draw(ctx, camX, true);

    // Marcador de distancia
    this._drawHUDInCanvas(ctx, lead, W);
  }

  _drawBackground(ctx, camX, W, H) {
    // Líneas verticales tenues que dan sensación de avance
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const spacing = 80;
    const offset = (camX * 0.4) % spacing;
    for (let x = -offset; x < W; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  _drawGround(ctx, camX, W) {
    const gy = this.world.groundY;
    ctx.fillStyle = '#1a2230';
    ctx.strokeStyle = '#b4ff39';
    ctx.lineWidth = 2;

    // Dibuja el suelo por segmentos, dejando huecos.
    const segments = this._groundSegments();
    for (const seg of segments) {
      const x0 = seg.start - camX;
      const w  = seg.end - seg.start;
      if (x0 + w < 0 || x0 > W) continue;
      ctx.fillRect(x0, gy, w, this.canvas.height - gy);
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + w, gy);
      ctx.stroke();
    }
  }

  /* Convierte la lista de huecos en segmentos de suelo sólido. */
  _groundSegments() {
    const pits = [...this.world.pits].sort((a, b) => a.x - b.x);
    const segs = [];
    let cursor = 0;
    for (const p of pits) {
      if (p.x > cursor) segs.push({ start: cursor, end: p.x });
      cursor = p.x + p.w;
    }
    if (cursor < this.world.width) segs.push({ start: cursor, end: this.world.width });
    return segs;
  }

  _drawObstacles(ctx, camX) {
    for (const o of this.world.obstacles) {
      const x = o.x - camX;
      if (x + o.w < 0 || x > this.canvas.width) continue;
      const y = this.world.groundY - o.h;
      const grad = ctx.createLinearGradient(0, y, 0, y + o.h);
      grad.addColorStop(0, '#ff5a6a');
      grad.addColorStop(1, '#a32f3c');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, o.w, o.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, o.w, 4);
    }
  }

  _drawGoal(ctx, camX, H) {
    const x = this.world.goalX - camX;
    if (x < -20 || x > this.canvas.width + 20) return;
    // Poste
    ctx.fillStyle = '#b4ff39';
    ctx.fillRect(x, 80, 4, this.world.groundY - 80);
    // Bandera ondulante
    const t = Date.now() / 200;
    ctx.fillStyle = '#38e8d0';
    ctx.beginPath();
    ctx.moveTo(x + 4, 90);
    ctx.lineTo(x + 44 + Math.sin(t) * 4, 100);
    ctx.lineTo(x + 4, 118);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(180,255,57,0.8)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText('META', x - 6, 74);
  }

  _drawHUDInCanvas(ctx, lead, W) {
    if (!lead) return;
    ctx.fillStyle = 'rgba(230,237,243,0.55)';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText(
      `dist: ${Math.round(lead.maxX)}px  /  ${this.world.goalX}px`,
      14, 24
    );
  }

  _leadAgent() {
    let lead = null;
    for (const a of this.agents) {
      if (a.alive && (!lead || a.x > lead.x)) lead = a;
    }
    // Si nadie está vivo, sigue al que llegó más lejos.
    if (!lead) {
      for (const a of this.agents) {
        if (!lead || a.maxX > lead.maxX) lead = a;
      }
    }
    return lead;
  }

  _bestCurrentAgent() {
    let best = null;
    for (const a of this.agents) {
      if (!best || a.maxX > best.maxX) best = a;
    }
    return best;
  }

  /* ---------- GRÁFICO DE FITNESS ---------- */
  _drawChart() {
    const ctx = this.cctx;
    const W = this.chart.width;
    const H = this.chart.height;
    ctx.clearRect(0, 0, W, H);

    const hist = this.ga.history;
    if (hist.length < 2) {
      ctx.fillStyle = 'rgba(139,151,168,0.6)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('Esperando datos…', 12, H / 2);
      return;
    }

    const maxFit = Math.max(...hist.map(h => h.best), 1);
    const pad = 8;

    const plot = (key, color) => {
      ctx.beginPath();
      hist.forEach((h, i) => {
        const x = pad + (i / (hist.length - 1)) * (W - pad * 2);
        const y = H - pad - (h[key] / maxFit) * (H - pad * 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    plot('avg', '#38e8d0');
    plot('best', '#b4ff39');
  }

  /* ---------- HUD (métricas HTML) ---------- */
  _updateHUD() {
    const s = this.ga.lastStats();
    let alive = 0;
    for (const a of this.agents) if (a.alive) alive++;
    const reached = this.agents.some(a => a.reachedGoal) ||
                    this.ga.bestEver.distance >= this.world.goalX - 10;

    this.ui({
      gen:      this.ga.generation,
      bestFit:  Math.round(this.ga.bestEver.fitness),
      bestDist: this.ga.bestEver.distance,
      evaluated:this.evaluatedTotal,
      alive:    alive,
      goal:     reached ? '¡ALCANZADA!' : 'no',
    });
  }
}

window.Game = Game;
