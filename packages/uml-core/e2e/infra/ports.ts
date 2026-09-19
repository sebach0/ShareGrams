import { createServer } from 'node:net';

/** Puerto TCP libre real (regla 13): se abre un socket en el puerto 0 -- el SO asigna uno libre -- se lee y se cierra. Evita colisiones al correr varios backends generados en paralelo. */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('No se pudo obtener un puerto libre.'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
