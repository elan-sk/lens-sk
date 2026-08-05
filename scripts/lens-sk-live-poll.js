#!/usr/bin/env node
// Cliente de línea de comandos que usa Claude Code para responderle a
// lens-sk-live-server.js (ver ese archivo para el protocolo completo).
//
// Ya NO hace polling — los eventos llegan por SSE (GET /events), escuchado
// vía la herramienta Monitor (command: curl -Ns .../events | grep ...), no
// desde este script. Este archivo tiene dos usos:
//
//   node lens-sk-live-poll.js --reply <id> '<json>'
//     → postea el JSON (agregándole {id}) a POST /reply y imprime el resultado.
//   node lens-sk-live-poll.js --progress <id> '<texto>'
//     → postea {id, text} a POST /progress (ver liveStatus en toolbar.js) —
//       reemplaza el "Esperando a Claude…" estático mientras trabajo en el
//       pedido. Puramente informativo, no resuelve nada (a diferencia de
//       --reply, se puede llamar varias veces para el mismo id).
const PORT = process.env.LENS_SK_LIVE_PORT ? Number(process.env.LENS_SK_LIVE_PORT) : 8137;
const BASE = `http://localhost:${PORT}`;

async function reply(id, jsonArg) {
  let payload;
  try { payload = JSON.parse(jsonArg); } catch (e) {
    console.error('El segundo argumento de --reply debe ser JSON válido.');
    process.exit(1);
  }
  payload.id = id;
  const res = await fetch(`${BASE}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  console.log(JSON.stringify(body));
}

async function progress(id, text) {
  const res = await fetch(`${BASE}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, text }),
  });
  const body = await res.json();
  console.log(JSON.stringify(body));
}

const args = process.argv.slice(2);

(async () => {
  try {
    if (args[0] === '--reply' && args[1] && args[2]) {
      await reply(args[1], args[2]);
      return;
    }
    if (args[0] === '--progress' && args[1] && args[2] !== undefined) {
      await progress(args[1], args[2]);
      return;
    }
    console.error('Uso: node lens-sk-live-poll.js --reply <id> \'<json>\'');
    console.error('  o: node lens-sk-live-poll.js --progress <id> \'<texto>\'');
    process.exit(1);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: 'connection_failed', message: String(e && e.message || e) }));
    process.exit(1);
  }
})();
