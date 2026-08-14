/*
 * Vercel serverless function.
 *
 * Meng-export app Express dari server.js.
 * Semua request /api/* diarahkan ke sini
 * lewat vercel.json.
 */

const app =
    require("../server.js");


module.exports = app;
