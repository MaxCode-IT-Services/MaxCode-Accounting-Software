module.exports = {
  apps: [
    {
      name: "maxcode",
      script: "server.js",
      cwd: "/var/www/maxcode/server",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
