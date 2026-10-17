import mysql from "mysql2/promise";

const globalForDB = globalThis as unknown as {
  mysqlPool?: mysql.Pool;
};

export const db =
  globalForDB.mysqlPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

globalForDB.mysqlPool = db;