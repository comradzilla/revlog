module.exports = {
  apps: [
    {
      name: "ceo-dashboard",
      script: "node_modules/.bin/next",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "512M",
      watch: false,
      instances: 1,
    },
  ],
};
