const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(data, status = 200) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}
function textResponse(text, status = 200) {
  return new Response(text, { status, headers: CORS_HEADERS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // browsers send this before the real request - just say "yes, CORS is fine"
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Meta calls this once with GET to verify your webhook URL
    if (request.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === env.VERIFY_TOKEN) {
        return textResponse(challenge, 200);
      }
      return textResponse('Forbidden', 403);
    }

    // Meta sends incoming WhatsApp messages here
    if (request.method === 'POST' && url.pathname === '/webhook') {
      try {
        const body = await request.json();
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (message) {
          const payload = {
            id: message.id,
            from: message.from,
            timestamp: Date.now()
          };

          if (message.type === 'text') {
            payload.kind = 'text';
            payload.text = message.text.body;
          } else if (message.type === 'audio') {
            payload.kind = 'audio';
            payload.mediaId = message.audio.id;
          } else {
            payload.kind = 'unsupported';
          }

          await env.JARVIS_KV.put('inbox', JSON.stringify(payload));
        }
      } catch (e) {
        // ignore malformed payloads, still ack so Meta doesn't retry forever
      }
      return textResponse('OK', 200);
    }

    // your Mac polls this endpoint to pick up the latest pending WhatsApp message
    if (request.method === 'GET' && url.pathname === '/inbox') {
      if (url.searchParams.get('secret') !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      const data = await env.JARVIS_KV.get('inbox');
      return jsonResponse(data || '{}');
    }

    // ================================================================
    // WEB CONTROL PANEL (phone browser <-> Mac), independent of WhatsApp
    // ================================================================

    // phone sends a command here (text or recorded audio as base64)
    if (request.method === 'POST' && url.pathname === '/web-send') {
      const body = await request.json();
      if (body.secret !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      const payload = {
        id: body.id || String(Date.now()),
        kind: body.kind,
        text: body.text || null,
        audioBase64: body.audioBase64 || null,
        mimeType: body.mimeType || null,
        timestamp: Date.now()
      };
      await env.JARVIS_KV.put('web_inbox', JSON.stringify(payload));
      return jsonResponse({ ok: true, id: payload.id });
    }

    // Mac polls this to pick up the latest pending web command
    if (request.method === 'GET' && url.pathname === '/web-poll') {
      if (url.searchParams.get('secret') !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      const data = await env.JARVIS_KV.get('web_inbox');
      return jsonResponse(data || '{}');
    }

    // Mac posts the reply here once it's done processing
    if (request.method === 'POST' && url.pathname === '/web-reply') {
      const body = await request.json();
      if (body.secret !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      await env.JARVIS_KV.put('web_outbox', JSON.stringify({
        id: body.id, text: body.text || '', timestamp: Date.now()
      }));
      return jsonResponse({ ok: true });
    }

    // phone polls this to see if the reply for its command id has arrived
    if (request.method === 'GET' && url.pathname === '/web-status') {
      if (url.searchParams.get('secret') !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      const data = await env.JARVIS_KV.get('web_outbox');
      return jsonResponse(data || '{}');
    }

    // Mac clears the command it just answered, so it never runs twice
    if (request.method === 'POST' && url.pathname === '/web-ack') {
      const body = await request.json().catch(() => ({}));
      if (body.secret !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      await env.JARVIS_KV.delete('web_inbox');
      return jsonResponse({ ok: true });
    }

    // Mac clears the WhatsApp message it just answered
    if (request.method === 'POST' && url.pathname === '/ack') {
      const body = await request.json().catch(() => ({}));
      if (body.secret !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      await env.JARVIS_KV.delete('inbox');
      return jsonResponse({ ok: true });
    }

    // Mac posts a heartbeat every few seconds to prove it is alive
    if (request.method === 'POST' && url.pathname === '/heartbeat') {
      const body = await request.json().catch(() => ({}));
      if (body.secret !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      await env.JARVIS_KV.put('heartbeat', JSON.stringify({ at: Date.now() }));
      return jsonResponse({ ok: true });
    }

    // phone checks whether JARVIS (the desktop app) is online right now
    if (request.method === 'GET' && url.pathname === '/ping') {
      if (url.searchParams.get('secret') !== env.SHARED_SECRET) return textResponse('Forbidden', 403);
      const raw = await env.JARVIS_KV.get('heartbeat');
      let online = false;
      if (raw) {
        try {
          const hb = JSON.parse(raw);
          online = (Date.now() - (hb.at || 0)) < 15000; // latido de max 15s de antiguedad
        } catch (e) { online = false; }
      }
      return jsonResponse({ online });
    }

    return textResponse('Not found', 404);
  }
};
