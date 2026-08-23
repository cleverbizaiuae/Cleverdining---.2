self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) =>
        Promise.all(
          windowClients
            .filter((client) => {
              try {
                return new URL(client.url).origin === self.location.origin;
              } catch {
                return false;
              }
            })
            .map((client) => client.navigate(client.url)),
        ),
      ),
  );
});
