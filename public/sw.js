/* Vigia Placa · service worker de notificações push */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
