// hh_push.js — Ayudante de notificaciones push para la versión web de
// HH-INSTALL. Lo carga la app (lib/core/services/push_web.dart) y lo usa a
// través de window.hhPush.
//
// Usa su PROPIO "service worker" (hh_push_sw.js) con un alcance aparte
// (./hh-push/), para no pisar el que Flutter usa para guardar la app
// offline. Ese service worker es el que recibe los avisos aunque la app
// esté cerrada y los muestra en pantalla.
//
// Este archivo vive en la carpeta web/ del repo: `flutter create` (que corre
// en Codemagic) no lo pisa, y `flutter build web` lo copia tal cual.
(function () {
  'use strict';

  var SW_URL = 'hh_push_sw.js';
  var SW_SCOPE = './hh-push/';

  function soportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function esIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function esStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
  }

  function b64urlABytes(texto) {
    var base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var bin = atob(base64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function mismosBytes(a, b) {
    if (!a || !b) return false;
    var x = new Uint8Array(a), y = new Uint8Array(b);
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  function registroActual() {
    return navigator.serviceWorker.getRegistration(SW_SCOPE);
  }

  // El navegador solo deja suscribirse cuando el service worker ya está
  // activo (recién registrado puede estar "instalándose").
  function esperarActivo(reg) {
    return new Promise(function (resolve, reject) {
      if (reg.active) return resolve(reg);
      var w = reg.installing || reg.waiting;
      if (!w) return reject(new Error('El service worker no arrancó'));
      var timer = setTimeout(function () { reject(new Error('El service worker tardó demasiado en activarse')); }, 15000);
      w.addEventListener('statechange', function () {
        if (w.state === 'activated') { clearTimeout(timer); resolve(reg); }
        if (w.state === 'redundant') { clearTimeout(timer); reject(new Error('El service worker falló al instalarse')); }
      });
    });
  }

  function suscripcionActual() {
    return registroActual().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    });
  }

  window.hhPush = {
    // 'no_soportado' | 'requiere_instalar' | 'bloqueado' | 'inactivo' | 'activo'
    estado: function () {
      if (!soportado()) {
        return Promise.resolve(esIOS() && !esStandalone() ? 'requiere_instalar' : 'no_soportado');
      }
      if (Notification.permission === 'denied') return Promise.resolve('bloqueado');
      return suscripcionActual().then(function (sub) {
        return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
      }).catch(function () { return 'inactivo'; });
    },

    // Hay que llamarla DIRECTO desde el toque del botón: el iPhone solo
    // muestra el cartel de permiso si viene de un toque del usuario. Por eso
    // el pedido de permiso es lo primero que se hace, sin esperar nada antes.
    // Devuelve la suscripción en JSON ({endpoint, keys: {p256dh, auth}}).
    activar: function (vapidPublica) {
      if (!soportado()) return Promise.reject(new Error(esIOS() && !esStandalone() ? 'requiere_instalar' : 'no_soportado'));
      var clave = b64urlABytes(vapidPublica);
      return Promise.resolve(Notification.requestPermission()).then(function (permiso) {
        if (permiso !== 'granted') throw new Error(permiso === 'denied' ? 'bloqueado' : 'sin_permiso');
        return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      }).then(esperarActivo).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          // Si ya había una suscripción hecha con otra clave, se rehace.
          if (sub && !mismosBytes(sub.options && sub.options.applicationServerKey, clave)) {
            return sub.unsubscribe().then(function () { return null; });
          }
          return sub;
        }).then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
        });
      }).then(function (sub) {
        return JSON.stringify(sub.toJSON());
      });
    },

    // La suscripción que ya tiene este navegador (JSON) o null.
    suscripcion: function () {
      if (!soportado()) return Promise.resolve(null);
      return suscripcionActual().then(function (sub) {
        return sub ? JSON.stringify(sub.toJSON()) : null;
      }).catch(function () { return null; });
    },

    // Deja de recibir avisos en este navegador. Devuelve el endpoint que
    // había (para borrarlo también de la base) o null.
    desactivar: function () {
      if (!soportado()) return Promise.resolve(null);
      return suscripcionActual().then(function (sub) {
        if (!sub) return null;
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () { return endpoint; }, function () { return endpoint; });
      }).catch(function () { return null; });
    }
  };
})();
