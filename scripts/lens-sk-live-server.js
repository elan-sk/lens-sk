#!/usr/bin/env node
// Servidor puente local para Lens-SK "modo live": deja que el ícono nuevo
// del toolbar ("pedir cambio" / "aplicar a archivos reales") le mande un
// evento a un Claude Code que esté escuchando este mismo proceso, y que la
// respuesta de Claude vuelva al navegador que sigue esperando en el mismo
// fetch(). No es el dev server del proyecto (Vite/browser-sync) — es un
// proceso HTTP aparte, solo para este puente.
//
// "npm run dev" lo levanta como una tarea paralela más (ver package.json,
// script "live"). Si el puerto ya está tomado, loguea y sigue vivo sin
// tirar abajo el resto de "npm run dev".
//
// Entrega de eventos vía Server-Sent Events (GET /events), NO long-poll:
// v1 de este servidor usaba un GET /poll de ~55s que Claude tenía que
// relanzar constantemente (visible como actividad/notificaciones sin
// ninguna razón real la mayoría de las veces — "se ve prendido revisando
// cosas todo el rato"). SSE es empuje real: Node mantiene la respuesta de
// /events abierta y le escribe una línea "data: ..." apenas hay un evento,
// sin que nadie tenga que "preguntar de nuevo" cada minuto. Se eligió sobre
// un WebSocket real porque http.createServer ya sabe mantener una respuesta
// abierta (es lo mismo que ya hace /event, en la otra dirección) — un WS de
// verdad exigiría el handshake completo a mano o sumar la dependencia "ws"
// sin necesidad, para el mismo resultado.
//
// Estado 100% en memoria, un solo pedido a la vez (un dev, una pestaña) —
// a propósito no hay journal durable tipo el de la skill "impeccable": acá
// no hace falta recuperar sesiones entre reinicios.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const PORT = process.env.LENS_SK_LIVE_PORT ? Number(process.env.LENS_SK_LIVE_PORT) : 8137;
const REPLY_TIMEOUT_MS = 5 * 60 * 1000;
// Las preguntas standalone (/ask-user) esperan una decisión humana con
// calma (leer opciones, pensar, a veces escribir texto propio) — 5 min
// (pensado para el flujo automático de "Aplicar") es corto de verdad: bug
// real de esta sesión, la primera prueba expiró antes de que se pudiera
// contestar. 30 min da margen sin dejar el slot único trabado para siempre
// si el usuario simplemente no vuelve.
const ASK_USER_TIMEOUT_MS = 30 * 60 * 1000;
const ROOT = path.resolve(__dirname, '..');
const PROJECT_MAP_PATH = path.join(ROOT, '.lens-sk-cache', 'project-map.json');

// El único pedido en curso: { id, event, res, timeout }.
// "res" es la respuesta HTTP del POST /event original del navegador —
// se mantiene abierta (sin .end()) hasta que llega el /reply con el mismo id.
let activeCommand = null;

// Pregunta STANDALONE de Claude al usuario — a diferencia de
// activeCommand.question (que solo existe A MITAD de un pedido que el
// NAVEGADOR inició con POST /event), esto lo dispara CLAUDE en cualquier
// momento, sin que haya ningún pedido en curso. Mismo patrón "held open"
// que POST /event↔POST /reply pero en la dirección contraria: quien manda
// POST /ask-user es Claude, y esa respuesta HTTP se mantiene abierta hasta
// que el navegador conteste con POST /answer-user — así Claude no necesita
// pollear nada, la respuesta le llega directo como resultado de su propio
// POST. El navegador, en cambio, sí tiene que pollear (GET /ask-user, ver
// pollAskUser en toolbar.js) porque a diferencia de Claude no tiene ninguna
// conexión abierta esperando algo de este servidor.
// { id, question, options, multiSelect, res, timeout }.
let activeQuestion = null;

// Conexiones SSE abiertas (respuestas HTTP de GET /events que nunca se
// cierran solas) — normalmente una sola, pero soporta más de una sin
// problema. GET /status reporta "connected" en base a esta lista, no a
// ningún poll puntual: una conexión SSE dura toda la sesión, así que es una
// señal estable de verdad ("¿hay alguien escuchando ahora?"), no algo que
// parpadea cada rato.
let sseClients = [];

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Un valor nuevo cada vez que arranca este proceso ("npm run dev") — el
// navegador lo compara contra el último que vio (ver checkLiveHelper en
// toolbar.js) para saber si hubo un reinicio real desde la última vez y, si
// lo hubo, limpiar el HISTORIAL de Asistencia Claude de esa página (los
// cambios ya aplicados en la sesión anterior ya son parte del proyecto).
const BOOT_ID = randomId();

function withCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function broadcastEvent(event) {
  const line = 'data: ' + JSON.stringify(event) + '\n\n';
  sseClients.forEach((c) => { try { c.write(line); } catch (e) { /* cliente ya cortado, se limpia solo en close */ } });
}

const server = http.createServer(async (req, res) => {
  withCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/status') {
    sendJSON(res, 200, { connected: sseClients.length > 0, bootId: BOOT_ID });
    return;
  }

  // Mapa componente/card → archivo (ver lens-sk-project-map.js), servido
  // tal cual para que el NAVEGADOR resuelva "Ir al código" solo, sin
  // pedirme ayuda salvo que no encuentre nada — ver doLiveLocate en
  // toolbar.js. Si el mapa todavía no se generó (servidor recién
  // arrancado), 503 — el navegador reintenta más tarde, no rompe nada.
  if (req.method === 'GET' && url.pathname === '/project-map.json') {
    fs.readFile(PROJECT_MAP_PATH, 'utf8', (err, raw) => {
      if (err) { sendJSON(res, 503, { error: 'not_ready', message: 'El mapa del proyecto todavía no se generó.' }); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
    });
    return;
  }

  // ¿Sigue existiendo este archivo? Único chequeo real de "¿el link está
  // roto?" que se puede hacer sin adivinar — no hay forma de saber si
  // vscode://file/... realmente abrió algo (el navegador no da ninguna
  // devolución de eso), pero al menos esto confirma que el archivo que el
  // mapa apunta sigue estando ahí antes de intentarlo.
  if (req.method === 'GET' && url.pathname === '/file-exists') {
    const rel = url.searchParams.get('path') || '';
    const resolved = path.resolve(ROOT, rel);
    if (!resolved.startsWith(ROOT + path.sep)) { sendJSON(res, 400, { error: 'invalid_path' }); return; }
    sendJSON(res, 200, { exists: fs.existsSync(resolved) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': conectado\n\n'); // línea de comentario SSE (arranca con ":") — solo para abrir el stream, un lector de "data:" la ignora sola
    // Si un pedido ya estaba parado ANTES de que este cliente se conectara
    // (nadie escuchaba en el instante exacto del clic), reenviárselo ahora —
    // sin esto, ese evento se transmitía al vacío una sola vez y se perdía
    // para siempre, aunque el navegador siguiera esperando su respuesta
    // (bug real: pasó en la primera prueba de esta versión).
    if (activeCommand) res.write('data: ' + JSON.stringify(activeCommand.event) + '\n\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
      // Si el último Claude que escuchaba se fue (VSCode cerrado a mitad de
      // un pedido) y quedó un activeCommand sin resolver, no lo dejamos
      // colgado hasta el timeout de 5 min: se resuelve como fallido ya
      // mismo, así el slot único queda libre al toque — si no, el próximo
      // clic del navegador choca con 409 "busy" sin que haya ninguna razón
      // visible para quien está del otro lado (bug real, reportado por el
      // usuario).
      if (sseClients.length === 0 && activeCommand) {
        clearTimeout(activeCommand.timeout);
        sendJSON(activeCommand.res, 200, { ok: false, error: 'disconnected', message: 'Claude se desconectó antes de responder. Probá de nuevo.' });
        activeCommand = null;
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/event') {
    if (activeCommand) { sendJSON(res, 409, { error: 'busy', message: 'Ya hay un pedido en curso, esperá a que termine.' }); return; }
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    // El id lo genera el NAVEGADOR (ver buildLiveEventPayload en toolbar.js),
    // no este servidor — así el navegador puede empezar a pollear
    // GET /progress?id=... para ese mismo pedido sin esperar a la respuesta
    // final (que recién llega en /reply, quién sabe cuándo). Fallback a
    // randomId() solo por si algún cliente viejo no manda id.
    const id = body.id || randomId();
    const event = Object.assign({}, body, { id, createdAt: Date.now() });
    const timeout = setTimeout(() => {
      if (activeCommand && activeCommand.id === id) {
        sendJSON(activeCommand.res, 504, { ok: false, error: 'timeout', message: 'Claude no respondió a tiempo.' });
        activeCommand = null;
      }
    }, REPLY_TIMEOUT_MS);
    activeCommand = { id, event, res, timeout, progress: '', question: null, answer: null };
    broadcastEvent(event);
    // OJO: no se llama res.end() acá — esta respuesta se resuelve en /reply.
    return;
  }

  // Progreso legible durante la espera (ver liveStatus/pollLiveProgress en
  // toolbar.js) — reemplaza el "Esperando a Claude…" estático por lo que
  // yo vaya reportando ("Leyendo archivo…", "Aplicando…", etc.) mientras
  // trabajo en el pedido. Puramente informativo: si no llega ningún
  // /progress, el navegador se queda con el texto genérico de siempre.
  if (req.method === 'POST' && url.pathname === '/progress') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (activeCommand && activeCommand.id === body.id) activeCommand.progress = String(body.text || '');
    sendJSON(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/progress') {
    const id = url.searchParams.get('id') || '';
    const match = activeCommand && activeCommand.id === id;
    sendJSON(res, 200, { progress: match ? activeCommand.progress : '', question: match ? (activeCommand.question || '') : '' });
    return;
  }

  // Pregunta de Claude al usuario A MITAD de un pedido en curso — protocolo
  // /ask ↔ /answer. Existe para que Claude NUNCA tenga que frenar a
  // preguntar algo por el chat de VSCode mientras resuelve un pedido de
  // esta herramienta: el usuario puede estar mirando el navegador, no esa
  // ventana. La pregunta viaja por el mismo poll que ya usa /progress (GET
  // /progress?id=... ahora también trae "question"); la respuesta del
  // usuario vuelve por el mismo canal SSE que Claude ya tiene abierto en
  // /events (mismo truco que /cancel: broadcastEvent con el id), sin que
  // Claude tenga que abrir ningún poll nuevo de su lado.
  if (req.method === 'POST' && url.pathname === '/ask') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) { sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' }); return; }
    activeCommand.question = String(body.question || '');
    activeCommand.answer = null;
    sendJSON(res, 200, { ok: true });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/answer') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id || !activeCommand.question) { sendJSON(res, 404, { error: 'no_pending_question', message: 'No hay ninguna pregunta pendiente con ese id.' }); return; }
    activeCommand.question = null;
    activeCommand.answer = String(body.answer || '');
    broadcastEvent({ id: activeCommand.id, answered: true, answer: activeCommand.answer });
    sendJSON(res, 200, { ok: true });
    return;
  }

  // El navegador cancela el pedido en curso (botón Cancelar) — a diferencia
  // de un timeout o una desconexión, esto es SIEMPRE a pedido explícito del
  // usuario. Resuelve el /event pendiente de inmediato (el navegador no
  // sigue esperando ni un segundo más) y avisa por SSE con el mismo id para
  // que Claude, si todavía está trabajando en eso, se entere y no siga.
  if (req.method === 'POST' && url.pathname === '/cancel') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) {
      sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' });
      return;
    }
    clearTimeout(activeCommand.timeout);
    sendJSON(activeCommand.res, 200, { ok: false, error: 'cancelled', message: 'Cancelado por el usuario.' });
    broadcastEvent({ id: activeCommand.id, cancelled: true });
    activeCommand = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  // POST /ask-user: Claude pregunta algo SIN que haya un pedido en curso
  // (ver comentario largo junto a "let activeQuestion" más arriba). Un solo
  // slot, igual que activeCommand — un dev, una pregunta a la vez. Esta
  // respuesta HTTP NO se cierra acá: se resuelve recién en /answer-user.
  if (req.method === 'POST' && url.pathname === '/ask-user') {
    if (activeQuestion) { sendJSON(res, 409, { error: 'busy', message: 'Ya hay una pregunta esperando respuesta.' }); return; }
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    const id = randomId();
    const timeout = setTimeout(() => {
      if (activeQuestion && activeQuestion.id === id) {
        sendJSON(activeQuestion.res, 504, { ok: false, error: 'timeout', message: 'El usuario no respondió a tiempo.' });
        activeQuestion = null;
      }
    }, ASK_USER_TIMEOUT_MS);
    activeQuestion = {
      id,
      question: String(body.question || ''),
      options: Array.isArray(body.options) ? body.options : null,
      multiSelect: !!body.multiSelect,
      res,
      timeout,
    };
    // Si Claude se desconecta (el propio POST /ask-user se corta) antes de
    // que el usuario responda, no dejar el slot único trabado para siempre
    // — mismo criterio que la limpieza de activeCommand en el close de
    // /events.
    res.on('close', () => {
      if (activeQuestion && activeQuestion.id === id) {
        clearTimeout(activeQuestion.timeout);
        activeQuestion = null;
      }
    });
    return;
  }

  // GET /ask-user: poll liviano del navegador (ver pollAskUser en
  // toolbar.js) — a diferencia de Claude, que recibe la respuesta directo
  // como resultado de su propio POST /ask-user, el navegador no tiene
  // ninguna conexión abierta esperando esto, así que tiene que preguntar.
  if (req.method === 'GET' && url.pathname === '/ask-user') {
    if (!activeQuestion) { sendJSON(res, 200, { pending: false }); return; }
    sendJSON(res, 200, {
      pending: true,
      id: activeQuestion.id,
      question: activeQuestion.question,
      options: activeQuestion.options,
      multiSelect: activeQuestion.multiSelect,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/answer-user') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeQuestion || activeQuestion.id !== body.id) { sendJSON(res, 404, { error: 'no_such_question', message: 'No hay ninguna pregunta pendiente con ese id.' }); return; }
    clearTimeout(activeQuestion.timeout);
    if (body.cancelled) {
      sendJSON(activeQuestion.res, 200, { ok: false, error: 'cancelled', message: 'El usuario cerró la pregunta sin responder.' });
    } else {
      sendJSON(activeQuestion.res, 200, { ok: true, answer: body.answer });
    }
    activeQuestion = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/reply') {
    let body;
    try { body = await readBody(req); } catch (e) { sendJSON(res, 400, { error: 'invalid_json' }); return; }
    if (!activeCommand || activeCommand.id !== body.id) {
      sendJSON(res, 404, { error: 'no_such_event', message: 'No hay ningún pedido pendiente con ese id.' });
      return;
    }
    clearTimeout(activeCommand.timeout);
    // Reenviar el body de /reply COMPLETO (menos "id", que es plomería
    // interna de este servidor, no del protocolo evento↔respuesta) — este
    // servidor es un relay tonto, no tiene por qué conocer el esquema de
    // cada tipo de evento (suggest/commit/locate/lo que venga después).
    const browserResponse = Object.assign({}, body, { ok: !!body.ok });
    delete browserResponse.id;
    sendJSON(activeCommand.res, 200, browserResponse);
    activeCommand = null;
    sendJSON(res, 200, { ok: true });
    return;
  }

  sendJSON(res, 404, { error: 'not_found' });
});

let killedStaleInstance = false;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Ya se intentó liberar el puerto una vez (ver killStaleInstanceThenListen)
    // y igual sigue ocupado — puede ser otra herramienta real usando este
    // puerto, no una instancia vieja de este mismo script. No insistir más.
    console.log(`[lens-sk-live] puerto ${PORT} ya está en uso${killedStaleInstance ? ' (después de intentar liberarlo)' : ''} — asumiendo que otra instancia ya está corriendo, no hago nada más.`);
    return;
  }
  console.error('[lens-sk-live] error del servidor:', err);
});

// Mapa "clase → archivo:línea" (ver lens-sk-project-map.js): se levanta en
// background, sin bloquear el arranque del servidor — si tarda o falla, el
// puente navegador↔Claude sigue funcionando igual (el mapa es un atajo de
// velocidad, nunca una dependencia dura).
function startProjectMapWatcher() {
  const child = spawn(process.execPath, [path.join(__dirname, 'lens-sk-project-map.js'), '--watch'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (err) => console.error('[lens-sk-live] no se pudo levantar el mapa del proyecto:', err.message));
}

// Cada "npm run dev" puede dejar este proceso vivo si la terminal/VSCode que
// lo lanzó se cerró de golpe (queda huérfano, reasignado al gestor de
// sesión) — la próxima vez que se arranca "npm run dev", ese huérfano sigue
// ocupando el puerto y el servidor nuevo nunca llega a escuchar (bug real,
// diagnosticado a mano más de una vez: EADDRINUSE silencioso, sin que quede
// ningún /events/status sirviendo el código actual). Antes de intentar
// escuchar, se chequea si YA hay algo respondiendo en este puerto con nuestro
// propio protocolo (`GET /status` devolviendo `{connected: bool, ...}`) — si
// lo hay, se asume que es una instancia vieja de este mismo script (nunca se
// toca un proceso que no confirme el protocolo, sea lo que sea) y se cierra
// antes de arrancar la propia.
function killStaleInstanceThenListen() {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/status', timeout: 800 }, (res) => {
    let raw = '';
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      let looksLikeOurs = false;
      try { looksLikeOurs = typeof JSON.parse(raw).connected === 'boolean'; } catch (e) {}
      if (!looksLikeOurs) { server.listen(PORT, onListening); return; }
      try {
        const pids = execSync(`lsof -ti tcp:${PORT}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        pids.forEach((pid) => {
          if (Number(pid) === process.pid) return;
          try {
            const cmd = execSync(`ps -o cmd= -p ${pid}`, { encoding: 'utf8' });
            if (cmd.indexOf('lens-sk-live-server.js') !== -1) {
              process.kill(Number(pid), 'SIGTERM');
              killedStaleInstance = true;
              console.log(`[lens-sk-live] instancia vieja (PID ${pid}, huérfana de una sesión anterior) cerrada para poder arrancar en el puerto ${PORT}.`);
            }
          } catch (e) { /* el proceso ya no existe o no se pudo inspeccionar — seguir */ }
        });
      } catch (e) { /* lsof/ps no disponibles (ej. no-Linux) — seguir sin tocar nada */ }
      setTimeout(() => server.listen(PORT, onListening), killedStaleInstance ? 400 : 0);
    });
  });
  req.on('timeout', () => { req.destroy(); server.listen(PORT, onListening); });
  req.on('error', () => server.listen(PORT, onListening)); // nada respondiendo: puerto libre, seguir normal
}

function onListening() {
  console.log(`[lens-sk-live] escuchando en http://localhost:${PORT} (GET /status, GET /events [SSE], POST /event, POST /reply, POST+GET /progress, POST /ask, POST /answer)`);
  startProjectMapWatcher();
}

killStaleInstanceThenListen();
