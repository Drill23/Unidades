self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('unidades-shell-v1').then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon.svg']))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./')));
  }
});
