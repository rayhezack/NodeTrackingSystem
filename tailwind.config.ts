const { createTailwindPresetOfSimple } = require('@lark-apaas/fullstack-presets');

module.exports = {
  presets: [createTailwindPresetOfSimple()],
  content: [
    './client/src/**/*.{ts,tsx,css}',
  ],
  plugins: [],
}
