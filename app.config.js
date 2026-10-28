// Extends app.json. `SINGLE_BUNDLE=1` disables web route code-splitting so the web build can be
// packed into one self-contained HTML file (used for the hosted web preview).
module.exports = ({ config }) => {
  if (process.env.SINGLE_BUNDLE !== '1') return config;
  return {
    ...config,
    plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: { web: false } }] : p)),
  };
};
