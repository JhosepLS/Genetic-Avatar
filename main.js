/* =========================================================
   main.js  —  Punto de entrada / cableado de la UI
   ---------------------------------------------------------
   Conecta los controles HTML (botones, sliders) con el
   motor del juego y el algoritmo genético.
   ========================================================= */

(function () {
  'use strict';

  // ---- Referencias del DOM ----
  const $ = id => document.getElementById(id);

  const canvas      = $('gameCanvas');
  const chartCanvas = $('chartCanvas');
  const overlay     = $('stageOverlay');

  const elGen       = $('mGen');
  const elBestFit   = $('mBestFit');
  const elBestDist  = $('mBestDist');
  const elEvaluated = $('mEvaluated');
  const elAlive     = $('mAlive');
  const elGoal      = $('mGoal');

  const statusPill  = $('simStatus');
  const statusText  = $('statusText');

  const btnStart = $('btnStart');
  const btnPause = $('btnPause');
  const btnReset = $('btnReset');

  // Sliders + sus etiquetas
  const sliders = {
    speed:  { range: $('speedRange'),  out: $('speedVal'),  fmt: v => v + '×' },
    pop:    { range: $('popRange'),    out: $('popVal'),    fmt: v => v },
    genome: { range: $('genomeRange'), out: $('genomeVal'), fmt: v => v },
    cross:  { range: $('crossRange'),  out: $('crossVal'),  fmt: v => (+v).toFixed(2) },
    mut:    { range: $('mutRange'),    out: $('mutVal'),    fmt: v => (+v).toFixed(2) },
    elite:  { range: $('eliteRange'),  out: $('eliteVal'),  fmt: v => v },
    tour:   { range: $('tourRange'),   out: $('tourVal'),   fmt: v => v },
  };

  const chkRenderAll = $('chkRenderAll');
  const chkTurbo     = $('chkTurbo');

  const modeRadios   = document.getElementsByName('genMode');
  const genomeField  = $('genomeField');

  function currentMode() {
    for (const r of modeRadios) if (r.checked) return r.value;
    return 'sequence';
  }

  // En modo reactivo el genoma tiene longitud fija (4 genes):
  // el slider de longitud no aplica, así que se atenúa.
  function syncModeUI() {
    const reactive = currentMode() === 'reactive';
    genomeField.style.opacity = reactive ? 0.4 : 1;
    genomeField.style.pointerEvents = reactive ? 'none' : 'auto';
  }

  // ---- Callback que el juego usa para refrescar el HUD ----
  function updateHUD(d) {
    elGen.textContent       = d.gen;
    elBestFit.textContent   = d.bestFit;
    elBestDist.innerHTML    = d.bestDist + '<small>px</small>';
    elEvaluated.textContent = d.evaluated;
    elAlive.textContent     = d.alive;
    elGoal.textContent      = d.goal;
  }

  // ---- Instancia del juego ----
  const game = new Game(canvas, chartCanvas, updateHUD);

  // ---- Construir configuración desde los sliders ----
  function readConfig() {
    return {
      mode:           currentMode(),
      populationSize: +sliders.pop.range.value,
      genomeLength:   +sliders.genome.range.value,
      crossoverRate:  +sliders.cross.range.value,
      mutationRate:   +sliders.mut.range.value,
      eliteCount:     +sliders.elite.range.value,
      tournamentSize: +sliders.tour.range.value,
    };
  }

  function applyConfig() {
    game.stop();
    game.speed     = +sliders.speed.range.value;
    game.renderAll = chkRenderAll.checked;
    game.turbo     = chkTurbo.checked;
    game.setup(readConfig());
    setStatus('idle');
  }

  // ---- Estado visual (pill superior) ----
  function setStatus(state) {
    statusPill.classList.remove('is-running', 'is-paused');
    if (state === 'running') {
      statusPill.classList.add('is-running');
      statusText.textContent = 'EVOLUCIONANDO';
    } else if (state === 'paused') {
      statusPill.classList.add('is-paused');
      statusText.textContent = 'EN PAUSA';
    } else {
      statusText.textContent = 'EN ESPERA';
    }
  }

  // ---- Eventos de sliders ----
  Object.values(sliders).forEach(s => {
    const sync = () => { s.out.textContent = s.fmt(s.range.value); };
    s.range.addEventListener('input', sync);
    sync();
  });

  // La velocidad se aplica en caliente.
  sliders.speed.range.addEventListener('input', () => {
    game.speed = +sliders.speed.range.value;
  });
  chkRenderAll.addEventListener('change', () => {
    game.renderAll = chkRenderAll.checked;
  });
  chkTurbo.addEventListener('change', () => {
    game.turbo = chkTurbo.checked;
  });

  // Cambiar de representación reinicia la simulación con el modo nuevo.
  for (const r of modeRadios) {
    r.addEventListener('change', () => {
      syncModeUI();
      applyConfig();
      overlay.classList.remove('hidden');
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnPause.textContent = '❚❚ Pausar';
    });
  }

  // ---- Botones ----
  btnStart.addEventListener('click', () => {
    overlay.classList.add('hidden');
    game.start();
    setStatus('running');
    btnStart.disabled = true;
    btnPause.disabled = false;
  });

  btnPause.addEventListener('click', () => {
    const paused = game.pause();
    setStatus(paused ? 'paused' : 'running');
    btnPause.textContent = paused ? '▶ Reanudar' : '❚❚ Pausar';
  });

  btnReset.addEventListener('click', () => {
    applyConfig();
    overlay.classList.remove('hidden');
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = '❚❚ Pausar';
  });

  // ---- Inicialización ----
  syncModeUI();
  applyConfig();
})();
