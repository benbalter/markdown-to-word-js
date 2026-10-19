/* global module */
// TypeScript 7 waits on @astrojs/check (peer ^5 || ^6) and typescript-eslint
// (peer <6.1.0). Drop this once both accept 7.
module.exports = {
  reject: ['typescript'],
};
