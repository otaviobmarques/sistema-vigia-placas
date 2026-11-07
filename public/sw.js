/* Vigia Placa · service worker de notificações push */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// App instalável: páginas sempre da rede (dados em tempo real); sem conexão, mostra um aviso amigável.
const OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão · Vigia Placa</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0B2545;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><div style="font-size:48px">📡</div><h1 style="font-size:22px">Sem conexão com a internet</h1><p style="opacity:.8">O Vigia Placa precisa de internet para mostrar as multas e os prazos atualizados.</p>
<button onclick="location.reload()" style="margin-top:12px;background:#FFB703;color:#0B2545;border:0;border-radius:12px;padding:12px 20px;font-weight:700">Tentar de novo</button></div></body></html>`;
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
});

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { titulo: "Vigia Placa", corpo: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(d.titulo || "Vigia Placa", {
      body: d.corpo || "",
      icon: "/icone.svg",
      badge: "/icone.svg",
      tag: d.tag,
      data: { url: d.url || "/hoje" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/hoje", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) if (j.url.startsWith(self.location.origin) && "focus" in j) { j.navigate(url); return j.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
