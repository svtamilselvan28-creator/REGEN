/**
 * server.js - Local Runner for ReCraft Express Application
 * Usage: node server.js or npm start
 */

const app = require('./app');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(` ReCraft (Node.js/Express + Supabase) is running! `);
  console.log(` Local URL: http://localhost:${PORT}              `);
  console.log(` Network:   http://${HOST}:${PORT}                `);
  console.log(`====================================================`);
});
