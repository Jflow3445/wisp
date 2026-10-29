export default [{
  files: ['**/spin.js', '**/spin-admin.js', '**/network-credits.js', '**/spin-discovery.js', '**/flight-motion.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.fromEntries([
    'window','document','setTimeout','clearTimeout','setInterval','clearInterval','fetch','localStorage',
    'sessionStorage','crypto','URL','Blob','AbortController','FormData','confirm','performance','requestAnimationFrame','cancelAnimationFrame'
  ].map(name => [name, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { caughtErrors: 'none', args: 'none' }], 'eqeqeq': 'error', 'no-var': 'error' }
}];
