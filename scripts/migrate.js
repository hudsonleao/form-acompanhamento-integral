const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

loadEnv();

const rootDir = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDir, "schema.sql");

async function main() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Arquivo não encontrado: ${schemaPath}`);
  }

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    multipleStatements: true
  });

  try {
    const schema = prepareSchema(fs.readFileSync(schemaPath, "utf8"));
    await connection.query(schema);
    console.log("Migração concluída com sucesso.");
  } finally {
    await connection.end();
  }
}

function prepareSchema(schema) {
  const database = process.env.MYSQL_DATABASE || "acompanhamento_integral";
  const escapedDatabase = `\`${database.replaceAll("`", "``")}\``;

  return schema
    .replace(
      /CREATE DATABASE IF NOT EXISTS acompanhamento_integral\s+CHARACTER SET/i,
      `CREATE DATABASE IF NOT EXISTS ${escapedDatabase}\n  CHARACTER SET`
    )
    .replace(/USE acompanhamento_integral;/i, `USE ${escapedDatabase};`);
}

function loadEnv() {
  const envPath = path.join(path.resolve(__dirname, ".."), ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    process.env[match[1]] ??= value;
  }
}

main().catch((error) => {
  console.error("Erro ao executar migração:");
  console.error(error.message);
  process.exit(1);
});
