// Ambient (non-module) declarations so TypeScript understands Vite asset imports.
// Vite resolves an imported image to its final URL string at build time.
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
