module.exports = {
  apps: [
    {
      name: 'wstrack',
      script: 'server/dist/index.js',
      cwd: '/home/YOUR_CPANEL_USER/wstrack',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
