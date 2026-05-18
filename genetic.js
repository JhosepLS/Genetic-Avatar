/* =========================================================
   genetic.js  —  Núcleo del Algoritmo Genético
   ---------------------------------------------------------
   Implementa el ciclo evolutivo completo y se adapta a las
   dos representaciones definidas en agent.js:

     · 'sequence' : genoma de enteros 0..3.
                    - inicialización: entero uniforme
                    - crossover     : un punto
                    - mutación      : cambio de gen aleatorio
     · 'reactive' : genoma de reales [0,1] (4 genes).
                    - inicialización: real uniforme
                    - crossover     : un punto + mezcla aritmética
                    - mutación      : perturbación gaussiana acotada

   Ciclo (igual para ambos modos):
     1. Inicialización de población
     2. Evaluación de fitness  (la realiza game.js)
     3. Selección por TORNEO
     4. Crossover
     5. Mutación  (con tasa ADAPTATIVA anti-estancamiento)
     6. Reemplazo generacional con ELITISMO
     7. Repetición por generaciones
   ========================================================= */

class GeneticAlgorithm {
  /**
   * @param {object} cfg  populationSize, genomeLength,
   *   crossoverRate, mutationRate, eliteCount,
   *   tournamentSize, mode ('sequence'|'reactive')
   */
  constructor(cfg) {
    this.cfg  = cfg;
    this.mode = cfg.mode || 'reactive';

    this.generation = 0;
    this.population = [];
    this.history    = [];      // [{gen,best,avg}] para el gráfico
    this.bestEver   = { fitness: -Infinity, genome: null, distance: 0 };

    // Mutación adaptativa: generaciones sin mejora.
    this._stagnation = 0;
    this._lastBest   = -Infinity;

    // Longitud efectiva del genoma según el modo.
    this._len = (this.mode === 'reactive')
      ? REACTIVE_GENES
      : cfg.genomeLength;

    this._initPopulation();
  }

  /* ---------- 1. INICIALIZACIÓN ----------
     Aleatoria uniforme: cubre ampliamente el espacio de
     búsqueda sin sesgos -> máxima diversidad inicial.       */
  _initPopulation() {
    this.population = [];
    for (let i = 0; i < this.cfg.populationSize; i++) {
      this.population.push(this._randomGenome());
    }
  }

  _randomGenome() {
    const g = new Array(this._len);
    if (this.mode === 'reactive') {
      for (let i = 0; i < g.length; i++) g[i] = Math.random();        // [0,1)
    } else {
      // Inicialización SESGADA hacia "avanzar". Un genoma puramente
      // uniforme (25% de cada acción) casi nunca avanza (mezcla
      // ruido de saltos e inacción). Sesgar la población inicial a
      // mayoría de WALK reduce drásticamente el espacio de búsqueda
      // EFECTIVO y le da al GA un punto de partida del que pueda
      // mejorar (heurística de inicialización informada):
      //   ~70% avanzar · ~22% avanzar+saltar · ~5% saltar · ~3% nada
      for (let i = 0; i < g.length; i++) {
        const r = Math.random();
        g[i] = r < 0.70 ? ACTION.WALK
             : r < 0.92 ? ACTION.WALK_JUMP
             : r < 0.97 ? ACTION.JUMP
             :            ACTION.IDLE;
      }
    }
    return g;
  }

  /* ---------- 3. SELECCIÓN POR TORNEO ----------
     K individuos al azar, gana el de mayor fitness.
       K grande  -> más explotación (converge rápido)
       K pequeño -> más exploración (mantiene diversidad)
     Robusta frente a diferencias extremas de fitness
     (a diferencia de la ruleta).                            */
  _tournamentSelect(scored) {
    let best = null;
    for (let i = 0; i < this.cfg.tournamentSize; i++) {
      const c = scored[(Math.random() * scored.length) | 0];
      if (best === null || c.fitness > best.fitness) best = c;
    }
    return best.genome;
  }

  /* ---------- 4. CROSSOVER ----------
     Un punto de corte aleatorio. En modo reactivo, además,
     se aplica una mezcla aritmética suave en el gen del
     corte para explorar valores intermedios entre padres
     (útil porque el genoma es real-valued).                 */
  _crossover(a, b) {
    if (Math.random() > this.cfg.crossoverRate) return a.slice();

    const point = 1 + ((Math.random() * (a.length - 1)) | 0);
    const child = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      child[i] = (i < point) ? a[i] : b[i];
    }
    if (this.mode === 'reactive') {
      const t = Math.random();
      child[point - 1] = a[point - 1] * t + b[point - 1] * (1 - t);
    }
    return child;
  }

  /* ---------- 5. MUTACIÓN (con tasa ADAPTATIVA) ----------
     La tasa efectiva sube si hay estancamiento prolongado
     (cada 8 generaciones sin mejora añade un extra, hasta un
     tope). Esto es DIVERSIFICACIÓN dirigida: cuando el GA se
     atasca en un óptimo local, inyecta más variación para
     escapar; al volver a mejorar, regresa a la tasa base.

       · 'sequence' : cambia el gen a otra acción 0..3.
       · 'reactive' : perturbación gaussiana acotada a [0,1].
  */
  _mutate(genome) {
    const boost = Math.min(0.20, Math.floor(this._stagnation / 8) * 0.04);
    const rate  = this.cfg.mutationRate + boost;

    for (let i = 0; i < genome.length; i++) {
      if (Math.random() < rate) {
        if (this.mode === 'reactive') {
          const v = genome[i] + this._gaussian() * 0.18;
          genome[i] = Math.min(1, Math.max(0, v));
        } else {
          let nv;
          do { nv = (Math.random() * 4) | 0; } while (nv === genome[i]);
          genome[i] = nv;
        }
      }
    }

    // --- MACRO-MUTACIÓN (solo modo secuencia) ---
    // La mutación gen-a-gen rara vez recompone la secuencia EXACTA
    // de saltos necesaria para superar un obstáculo donde la
    // población se atascó (convergencia prematura). La macro-mutación
    // reescribe, con baja probabilidad, un BLOQUE contiguo completo
    // del genoma. Esto permite "saltar" a otra cuenca de atracción
    // sin destruir el resto del comportamiento ya aprendido. La
    // probabilidad sube si el estancamiento se prolonga.
    if (this.mode === 'sequence') {
      const macroP = 0.12 + (this._stagnation > 10 ? 0.18 : 0);
      if (Math.random() < macroP) {
        const len = 3 + ((Math.random() * 10) | 0);
        const st  = (Math.random() * Math.max(1, genome.length - len)) | 0;
        for (let i = st; i < st + len && i < genome.length; i++) {
          const r = Math.random();
          genome[i] = r < 0.60 ? ACTION.WALK
                    : r < 0.90 ? ACTION.WALK_JUMP
                    : r < 0.96 ? ACTION.JUMP
                    :            ACTION.IDLE;
        }
      }
    }
    return genome;
  }

  /* Ruido gaussiano (Box-Muller) para la mutación real. */
  _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- 6. REEMPLAZO GENERACIONAL CON ELITISMO ----------
     - ELITISMO: los `eliteCount` mejores pasan intactos
       (intensificación: nunca se pierde la mejor solución).
     - El resto: selección + crossover + mutación
       (diversificación: explora soluciones nuevas).
     @param {Array<{genome,fitness,agent}>} scored
  */
  evolve(scored) {
    scored.sort((p, q) => q.fitness - p.fitness);

    const top = scored[0];
    if (top.fitness > this.bestEver.fitness) {
      this.bestEver = {
        fitness:  top.fitness,
        genome:   top.genome.slice(),
        distance: top.agent ? Math.round(top.agent.maxX) : 0,
      };
    }

    // Estancamiento (mejora real > 1 unidad de fitness).
    if (top.fitness > this._lastBest + 1) {
      this._stagnation = 0;
      this._lastBest   = top.fitness;
    } else {
      this._stagnation++;
    }

    // Estadísticas para el gráfico.
    const avg = scored.reduce((s, x) => s + x.fitness, 0) / scored.length;
    this.history.push({ gen: this.generation, best: top.fitness, avg });
    if (this.history.length > 220) this.history.shift();

    // Nueva población.
    const next = [];
    const elite = Math.min(this.cfg.eliteCount, scored.length);
    for (let i = 0; i < elite; i++) next.push(scored[i].genome.slice());

    while (next.length < this.cfg.populationSize) {
      const pa = this._tournamentSelect(scored);
      const pb = this._tournamentSelect(scored);
      let child = this._crossover(pa, pb);
      child = this._mutate(child);
      next.push(child);
    }

    this.population = next;

    // --- INMIGRANTES ALEATORIOS (diversificación de choque) ---
    // Si el estancamiento es severo y persistente, ni la mutación
    // adaptativa ni la macro-mutación bastan: la población es
    // demasiado homogénea (poca diversidad genética). Cada 18
    // generaciones sin mejora se sustituye al ~20% peor por
    // genomas totalmente nuevos. Es un "random restart" parcial:
    // reinyecta material genético fresco conservando a la élite.
    if (this.mode === 'sequence' && this._stagnation > 0) {
      // A más estancamiento, diversificación más agresiva:
      //   · estancamiento moderado (≥18): reinyecta 20% cada 18 gens
      //   · estancamiento severo (≥40):  reinyecta 35% cada 10 gens
      let period = 0, frac = 0;
      if (this._stagnation >= 40)      { period = 10; frac = 0.35; }
      else if (this._stagnation >= 18) { period = 18; frac = 0.20; }
      if (period && this._stagnation % period === 0) {
        const n = Math.floor(this.population.length * frac);
        for (let i = 0; i < n; i++) {
          this.population[this.population.length - 1 - i] = this._randomGenome();
        }
      }
    }

    this.generation++;
  }

  lastStats() {
    return this.history[this.history.length - 1] || { gen: 0, best: 0, avg: 0 };
  }
}

window.GeneticAlgorithm = GeneticAlgorithm;
