export default {
  apps: [{
    name: 'lunchtime',
    script: './server/index.js',
    cwd: '/home/azureuser/aiq/lunch-time',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    watch: false,
    max_memory_restart: '200M',
  }],
};
