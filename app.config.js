// Extends app.json. EXPO_BASE_URL is set by the GitHub publishing workflow so the
// web app works at https://<user>.github.io/<repository>/ (empty for local preview).
module.exports = ({ config }) => ({
  ...config,
  web: {
    ...config.web,
    output: 'single',
    name: 'Watch Business',
    shortName: 'Watches',
    themeColor: '#0A0A0B',
    backgroundColor: '#0A0A0B',
  },
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL || '',
  },
});
