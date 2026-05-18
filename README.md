# 🧬 Genetic Avatar — Aprendizaje de locomoción 2D con Algoritmos Genéticos

Aplicación web donde una población de avatares **aprende automáticamente** a
caminar, saltar obstáculos y cruzar huecos para alcanzar una meta, usando un
**Algoritmo Genético (AG)**. No hay ningún comportamiento programado a mano:
todo emerge de la evolución generación tras generación.

Implementada **solo con HTML, CSS y JavaScript puro**, sin frameworks ni
librerías externas. Pensada como proyecto académico, con código comentado y
enfoque didáctico.

---

## 📑 Tabla de contenidos

1. [Descripción del problema](#1-descripción-del-problema)
2. [Formulación del problema](#2-formulación-del-problema)
3. [Representación de la solución](#3-representación-de-la-solución)
4. [Función fitness](#4-función-fitness)
5. [Método de inicialización](#5-método-de-inicialización)
6. [Método de selección](#6-método-de-selección)
7. [Método de crossover](#7-método-de-crossover)
8. [Método de mutación](#8-método-de-mutación)
9. [Reemplazo](#9-reemplazo)
10. [Problemas encontrados](#10-problemas-encontrados)
11. [Estrategias de intensificación y diversificación](#11-estrategias-de-intensificación-y-diversificación)
12. [Instrucciones de ejecución](#12-instrucciones-de-ejecución)
13. [Estructura del proyecto](#13-estructura-del-proyecto)
14. [Cómo crear el repositorio Git](#14-cómo-crear-el-repositorio-git)
15. [Video demostrativo](#15-video-demostrativo)

---

## 1. Descripción del problema

Se dispone de un escenario 2D lateral (estilo *runner*) con:

- **Suelo** continuo, interrumpido por **huecos** (tramos sin piso: caer = morir).
- **Obstáculos** rectangulares de distinta altura que hay que saltar.
- Una **meta** al final del recorrido.

Un avatar (representado con polígonos: torso, cabeza y dos piernas animadas)
puede ejecutar cuatro acciones: *no hacer nada*, *avanzar*, *saltar* o
*avanzar y saltar*. Está sujeto a gravedad y muere si choca contra un
obstáculo o cae en un hueco.

El reto: **nadie le dice al avatar cuándo saltar**. Debe descubrirlo solo,
mediante evolución artificial, partiendo de comportamientos completamente
aleatorios.

## 2. Formulación del problema

Se formula como un **problema de optimización** resuelto con un Algoritmo
Genético:

- **Individuo:** un *genoma* que codifica el comportamiento de un avatar.
- **Espacio de búsqueda:** todos los genomas posibles.
- **Función objetivo (fitness):** mide *qué tan lejos llega* el avatar y *si
  alcanza la meta*. Se busca **maximizarla**.
- **Restricciones implícitas:** la física (gravedad, colisiones, huecos) hace
  que la mayoría de los genomas mueran pronto; solo los que codifican una
  secuencia/política viable progresan.

El AG mantiene una **población** de individuos, los evalúa simulándolos en el
mismo nivel, y aplica selección + crossover + mutación para producir
generaciones cada vez mejores.

## 3. Representación de la solución

El proyecto implementa **dos representaciones distintas**, seleccionables
desde la interfaz. Esto es deliberadamente didáctico: permite **comparar cómo
la elección de la representación cambia por completo la dificultad del
problema** para el mismo AG.

### Modo «Secuencia» (representación directa) — *por defecto*

- El genoma es un **arreglo de enteros** `[g₀, g₁, …, gₙ]` con `gᵢ ∈ {0,1,2,3}`.
- Cada gen indica la acción a ejecutar durante un bloque de `GENE_TICKS = 8`
  frames de simulación:

  | Valor | Acción              |
  |:-----:|---------------------|
  | `0`   | No hacer nada       |
  | `1`   | Avanzar             |
  | `2`   | Saltar              |
  | `3`   | Avanzar y saltar    |

- **Interpretación:** en el frame *t* se ejecuta el gen
  `índice = ⌊t / GENE_TICKS⌋`. El genoma es, literalmente, un *guion* de
  acciones reproducido en el tiempo.
- **Ventaja:** intuitivo y muy visual; se ve la evolución progresar tramo a
  tramo, generación a generación (es lo que se aprecia en el video de
  referencia *Genetic Algorithm — Learning to walk*).
- **Desventaja:** **no generaliza**. La solución de un tramo no sirve para
  otro y el espacio de búsqueda es enorme → propenso a convergencia prematura
  (ver §10).

### Modo «Reactivo» (representación por política)

- El genoma es un **arreglo corto de 4 números reales** en `[0,1]`.
- Esos 4 valores se **decodifican como umbrales** de una política que **reacciona
  a sensores** del entorno (distancia al obstáculo y al hueco más próximos):

  | Gen   | Decodificación              | Significado                              |
  |:-----:|-----------------------------|------------------------------------------|
  | `g₀`  | `obstTrig = 12 + g₀·60`     | saltar si el obstáculo está a < *obstTrig* px |
  | `g₁`  | `pitTrig  = 8  + g₁·45`     | saltar si el borde del hueco está a < *pitTrig* px |
  | `g₂`  | `wideBias = g₂·22`          | adelanto extra del salto para huecos anchos |
  | `g₃`  | `jitter   = (g₃−0.5)·6`     | ajuste fino del instante de disparo      |

- **Interpretación:** el comportamiento depende del *entorno*, no del frame.
  Por eso **generaliza**: una misma "regla" supera todos los obstáculos.
- **Ventaja:** espacio de búsqueda diminuto → converge en muy pocas
  generaciones y completa el nivel de forma fiable.
- **Desventaja:** justamente por ser tan eficiente, a veces resuelve el
  problema casi de inmediato y se aprecia menos la "evolución" paso a paso.

> La función fitness es **idéntica** en ambos modos, lo que hace la comparación
> justa: lo único que cambia es *cómo se representa la solución*.

## 4. Función fitness

La aptitud de cada individuo se calcula tras simularlo en el nivel:

```
fitness = maxX
        + ticks · 0.05
        + (alcanzóMeta ? +3000 : 0)
        − (murióEnHueco ? 250 : 0)

fitness = max(0, fitness)
```

Desglose y justificación de cada término:

| Término | Rol | Por qué |
|---|---|---|
| `maxX` | **dominante** | La distancia máxima alcanzada hacia la derecha es el objetivo principal: crea un gradiente continuo y denso que guía la búsqueda incluso cuando aún nadie llega a la meta. |
| `ticks · 0.05` | desempate | Premia ligeramente sobrevivir más tiempo. Entre dos individuos que llegan igual de lejos, prefiere al más estable (no al que avanza a ciegas y se mata). |
| `+3000` (meta) | atractor fuerte | Un bono grande y discreto al alcanzar la meta. Una vez que algún individuo "casi llega", este salto de fitness ejerce una presión selectiva intensa que termina de empujar a la población a completar el nivel. |
| `−250` (hueco) | castigo | Penaliza específicamente caer en un hueco, desincentivando la estrategia de "avanzar sin saltar". |

El recorte `max(0, ·)` evita fitness negativos que distorsionarían la selección
por torneo.

## 5. Método de inicialización

**Inicialización aleatoria** de toda la población, con una diferencia clave
según el modo:

- **Modo reactivo:** cada gen es uniforme en `[0,1)`. Cubre todo el espacio de
  políticas sin sesgo → máxima diversidad inicial.
- **Modo secuencia:** inicialización **aleatoria pero *informada* (sesgada)**.
  Un genoma uniforme (25 % de cada acción) produce avatares que casi nunca
  avanzan (mezclan saltos e inacción al azar y mueren en el sitio). Por eso la
  población inicial se sesga hacia *avanzar*:

  ```
  ≈70 % avanzar · ≈22 % avanzar+saltar · ≈5 % saltar · ≈3 % nada
  ```

  Esto **no inyecta la solución**, solo garantiza que la población de partida
  *se mueva*, dándole al AG un gradiente del que pueda mejorar. Es una
  heurística de inicialización estándar para reducir el espacio de búsqueda
  *efectivo*.

## 6. Método de selección

**Selección por torneo** de tamaño *K* (configurable, por defecto `K = 4`):

1. Se eligen *K* individuos al azar de la población.
2. Gana (es seleccionado como padre) el de mayor fitness.

Se eligió torneo frente a la ruleta porque:

- Es **robusto frente a diferencias extremas de fitness** (al principio unos
  pocos individuos pueden tener fitness muchísimo mayor; con ruleta acapararían
  toda la reproducción y la diversidad colapsaría).
- La **presión selectiva es ajustable** con un solo parámetro:
  - *K* grande → más **explotación** (converge rápido, menos diversidad).
  - *K* pequeño → más **exploración** (preserva diversidad, converge más lento).

## 7. Método de crossover

**Crossover de un punto** (single-point), respetando la probabilidad
`crossoverRate` (por defecto `0.75`):

1. Con prob. `1 − crossoverRate`, el hijo es una copia del primer padre.
2. En caso contrario, se elige un punto de corte aleatorio *p* y el hijo toma
   los genes `[0, p)` del padre A y `[p, fin)` del padre B.

En **modo reactivo** (genoma real) se añade además una **mezcla aritmética**
suave en el gen del corte: `hijo[p−1] = α·A[p−1] + (1−α)·B[p−1]` con α
aleatorio. Esto permite explorar valores intermedios entre los padres, algo
útil y natural cuando los genes son continuos.

## 8. Método de mutación

La mutación es el principal motor de **diversificación**. Se compone de tres
mecanismos:

**a) Mutación gen a gen (tasa adaptativa).**
Cada gen muta con probabilidad `rate`:

- Modo secuencia: el gen cambia a *otra* acción `{0,1,2,3}` distinta.
- Modo reactivo: perturbación **gaussiana** (Box–Muller) de desviación 0.18,
  acotada a `[0,1]`.

La tasa es **adaptativa**: `rate = mutationRate + boost`, donde `boost` crece
`+0.04` por cada 8 generaciones sin mejora (hasta un tope de `+0.20`). Al
volver a mejorar, vuelve a la tasa base. Es diversificación **dirigida**: solo
sube cuando el AG se atasca.

**b) Macro-mutación de segmento (solo modo secuencia).**
Con probabilidad baja (12 %, que sube a 30 % bajo estancamiento) se **reescribe
un bloque contiguo** de 3–12 genes con acciones nuevas. La mutación gen a gen
casi nunca recompone *la secuencia exacta* de saltos que hace falta para
superar un obstáculo concreto; la macro-mutación permite "saltar" a otra
cuenca de atracción sin destruir el resto del comportamiento ya aprendido.

**c) Inmigrantes aleatorios (solo modo secuencia).**
Si el estancamiento es severo y persistente, periódicamente se sustituye a la
porción peor de la población por genomas totalmente nuevos (un *random restart*
parcial). Reinyecta material genético fresco conservando a la élite.

## 9. Reemplazo

**Reemplazo generacional con elitismo.** Para formar la siguiente generación:

1. **Élite:** los `eliteCount` mejores individuos (por defecto 5) pasan
   **intactos** a la nueva generación. Garantiza que la mejor solución nunca
   se pierda (intensificación).
2. **Resto:** se generan por *selección por torneo → crossover → mutación*
   hasta completar el tamaño de población (diversificación).

## 10. Problemas encontrados

Durante el desarrollo y la calibración aparecieron varios problemas clásicos de
los Algoritmos Genéticos:

- **Convergencia prematura.** Con la representación de secuencia y la
  inicialización uniforme original, la población convergía rápidamente a un
  genoma que moría siempre en el mismo obstáculo y ya no mejoraba (se quedaba
  estancada cientos de generaciones). Causa: pérdida de diversidad genética +
  un espacio de búsqueda enorme donde la mutación simple destruye los tramos ya
  resueltos.

- **Falta de diversidad.** Tras unas pocas generaciones casi todos los
  individuos eran copias del mismo elite. Sin variación, el crossover deja de
  producir nada nuevo y el AG se "congela".

- **Mutación insuficiente vs. excesiva.** Una tasa muy baja no permitía
  escapar de óptimos locales; una tasa muy alta convertía la búsqueda en
  aleatoria y destruía buenas soluciones. Hubo que equilibrarla y, sobre todo,
  hacerla **adaptativa**.

- **Calibración física.** Con los parámetros iniciales (`jumpForce ≈ −10.6`,
  `walkSpeed ≈ 3.1`) un salto **no alcanzaba** a cubrir los huecos: el problema
  era *físicamente irresoluble* y el AG nunca podría ganar. Se recalibró a
  `jumpForce = −13.5` y `walkSpeed = 3.6` para garantizar que **existe una
  solución alcanzable**.

- **Diseño del nivel.** En una versión, dos obstáculos/huecos estaban tan
  juntos (~70 px) que era imposible aterrizar y volver a saltar a tiempo. Se
  adoptó como regla de diseño una separación mínima de ~280 px entre elementos,
  asegurando que la solución existe sin volver el nivel trivial.

- **Balance exploración/explotación.** Demasiada explotación (élite grande,
  torneo grande) → convergencia prematura. Demasiada exploración → no consolida
  nunca lo aprendido. El ajuste de `eliteCount`, `tournamentSize` y la
  diversificación adaptativa fue el núcleo del trabajo de calibración.

## 11. Estrategias de intensificación y diversificación

Un buen AG necesita equilibrar **intensificación** (explotar las mejores
soluciones encontradas) y **diversificación** (explorar zonas nuevas del
espacio de búsqueda). Aquí conviven ambas:

**Intensificación (explotación):**

- **Elitismo:** los mejores genomas se conservan intactos cada generación.
- **Selección por torneo:** sesga la reproducción hacia los individuos aptos;
  *K* mayor intensifica más.
- **Mezcla aritmética en el crossover reactivo:** refina alrededor de buenas
  combinaciones de padres.

**Diversificación (exploración):**

- **Inicialización aleatoria** (uniforme o sesgada): amplia cobertura inicial.
- **Mutación con tasa adaptativa:** sube automáticamente cuando hay
  estancamiento, baja al volver a mejorar.
- **Macro-mutación de segmento:** escapa de óptimos locales reescribiendo
  bloques completos.
- **Inmigrantes aleatorios:** *random restart* parcial cuando el estancamiento
  es severo, sin perder a la élite.

**Cómo mejorar aún más** (líneas futuras): *fitness sharing* / *crowding* para
penalizar individuos demasiado parecidos, *island model* con migración entre
subpoblaciones, o un genoma híbrido que combine la legibilidad de la secuencia
con la generalización de la política reactiva.

## 12. Instrucciones de ejecución

No requiere instalación ni dependencias. Hay dos formas:

**Opción A — Abrir directamente:**

```bash
git clone <URL_DEL_REPOSITORIO>
cd genetic-avatar
# Abre index.html con doble clic, o arrástralo al navegador.
```

**Opción B — Servidor local (recomendado, evita restricciones de archivos
locales con las fuentes web):**

```bash
git clone <URL_DEL_REPOSITORIO>
cd genetic-avatar
python -m http.server 8000
# Luego abre en el navegador:
#   http://localhost:8000
```

**Uso:**

1. Pulsa **▶ Iniciar**: la población empieza a evolucionar.
2. Observa cómo la *Mejor distancia* y el gráfico de fitness crecen
   generación a generación.
3. Ajusta los parámetros (población, mutación, élite, torneo…) y pulsa
   **↺ Reiniciar** para experimentar.
4. Cambia entre **Secuencia** y **Reactivo** para comparar representaciones.
5. Usa el deslizador de **velocidad** o el **modo turbo** para acelerar la
   simulación.

## 13. Estructura del proyecto

```
genetic-avatar/
├── index.html      # Estructura de la página y controles de la UI
├── style.css       # Estilos (tema oscuro, responsive: PC/tablet/móvil)
├── world.js        # Definición del escenario: suelo, obstáculos, huecos, meta
├── agent.js        # El avatar: física, decodificación del genoma, fitness, dibujo
├── genetic.js      # Núcleo del Algoritmo Genético (init, selección, crossover,
│                   #   mutación, reemplazo, estadísticas)
├── game.js         # Motor de simulación: corre la población y renderiza el canvas
├── main.js         # Punto de entrada: conecta la UI con el motor y el AG
├── .gitignore
└── README.md       # Este documento
```

Flujo general: `main.js` lee la configuración de la UI → `game.js` crea el AG
(`genetic.js`) y una población de avatares (`agent.js`) en el mundo
(`world.js`) → simula a todos en paralelo → al terminar la generación calcula
el fitness y pide la siguiente al AG → repite.

## 14. Cómo crear el repositorio Git

```bash
cd genetic-avatar
git init
git add .
git commit -m "Genetic Avatar: aprendizaje de locomoción 2D con Algoritmo Genético"

# Crea un repositorio vacío en GitHub y luego:
git branch -M main
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

## 15. Video demostrativo

El video de entrega debería mostrar:

1. **La aplicación ejecutándose** en el navegador (la interfaz completa).
2. **Varias generaciones evolucionando**: arrancar en la generación 0 con
   movimiento caótico y dejar correr hasta que se complete el nivel.
3. **La mejora progresiva**: señalar cómo la *Mejor distancia* y la línea del
   gráfico de fitness suben con cada generación, y cómo los avatares pasan de
   morir en el primer obstáculo a llegar a la meta.
4. **Explicación breve del algoritmo y resultados**: comentar la
   representación del genoma, la función fitness y la diferencia entre el modo
   *Secuencia* y el modo *Reactivo*.

Sugerencias para grabarlo:

- Usa cualquier grabador de pantalla (OBS Studio gratuito, Xbox Game Bar en
  Windows con `Win+G`, o la grabación de pantalla del sistema).
- Empieza en modo **Secuencia** con los valores por defecto: la evolución es
  visible y suele completar el nivel en ~10–20 generaciones. Sube la
  *velocidad* a 4×–8× para no alargar el video.
- Después cambia a modo **Reactivo** para mostrar, como comparación, que con
  una representación mejor el problema se resuelve casi de inmediato.
- Duración recomendada: 3–5 minutos.

---

*Proyecto académico · Algoritmos Genéticos · HTML + CSS + JavaScript puro, sin
dependencias externas.*
