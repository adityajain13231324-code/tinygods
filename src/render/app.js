import { Application, Container } from 'pixi.js';

/**
 * Create the Pixi app and a `stage` container for the town. Letterboxing, zoom and shake
 * are handled by the Camera, which owns this container's transform.
 * @param {HTMLElement} host
 */
export async function createApp(host) {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x2a3d27,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), // cap: integrated GPUs hate 4K canvases
  });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  return { app, world };
}
