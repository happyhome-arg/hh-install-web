// hh_push_sw.js — Service worker de notificaciones de HH-INSTALL.
//
// Lo registra hh_push.js con alcance ./hh-push/ (aparte del de Flutter).
// Recibe los avisos que manda la Edge Function `enviar-push` y los muestra
// en pantalla aunque la app esté cerrada. Al tocar el aviso, abre la app (o
// la trae al frente si ya estaba abierta).

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

function urlDeLaApp() {
  // Este archivo está en la raíz de la app (…/hh-install-web/hh_push_sw.js)
  return new URL('./', self.location).href;
}

self.addEventListener('push', function (event) {
  var datos = {};
  if (event.data) {
    try {
      datos = event.data.json();
    } catch (e) {
      datos = { body: event.data.text() };
    }
  }
  var opciones = {
    body: datos.body || '',
    icon: 'icons/Icon-192.png',
    badge: 'icons/Icon-192.png',
    data: { url: urlDeLaApp(), work_id: datos.work_id || null }
  };
  if (datos.tag) {
    opciones.tag = datos.tag;
    opciones.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(datos.title || 'HH-INSTALL', opciones));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || urlDeLaApp();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
      for (var i = 0; i < ventanas.length; i++) {
        var v = ventanas[i];
        if (v.url.indexOf(url) === 0 && 'focus' in v) return v.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
