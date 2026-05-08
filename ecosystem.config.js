module.exports = {
  apps: [{
    name: 'lunchtime',
    script: './server/index.js',
    cwd: '/home/azureuser/aiq/lunch-time',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      // Secrets loaded from .env file — never hardcode here
    },
    watch: false,
    max_memory_restart: '200M',
  }],
};
