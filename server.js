const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_COOKIE = "acomp_session";
const SESSION_DAYS = parsePositiveNumber(process.env.AUTH_SESSION_DAYS, 30);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * SESSION_DAYS;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "acompanhamento_integral",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    const status = error.statusCode || (error.code && String(error.code).startsWith("ER_") ? 503 : 500);
    sendJson(res, status, { error: error.statusCode ? error.message : publicErrorMessage(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Acompanhamento Integral em http://localhost:${PORT}`);
});

async function routeApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const user = await authenticateUser(body.email, body.password);
    const sessionId = await createSession(user, req);
    setSessionCookie(res, sessionId);
    sendJson(res, 200, { user });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sessionId = getSessionId(req);
    if (sessionId) await deleteSession(sessionId);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const user = await getSessionUser(req);
    sendJson(res, 200, { authenticated: Boolean(user), user });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    await pool.query("SELECT 1 AS ok");
    sendJson(res, 200, { ok: true });
    return;
  }

  const currentUser = await getSessionUser(req);
  if (!currentUser) {
    sendJson(res, 401, { error: "Faça login para acessar o sistema." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/students") {
    const search = `%${url.searchParams.get("q") || ""}%`;
    const [rows] = await pool.execute(
      `SELECT s.id, s.name, s.class_name AS className, s.teacher_name AS teacherName,
              COALESCE(stats.assessmentCount, 0) AS assessmentCount,
              DATE_FORMAT(stats.lastAssessmentDate, '%d/%m/%Y') AS lastAssessment
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) AS assessmentCount, MAX(assessment_date) AS lastAssessmentDate
             FROM assessments
            GROUP BY student_id
         ) stats ON stats.student_id = s.id
        WHERE s.name LIKE :search OR s.class_name LIKE :search OR s.teacher_name LIKE :search
        ORDER BY s.name ASC`,
      { search }
    );
    sendJson(res, 200, rows);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    const body = await readJson(req);
    requireFields(body, ["name", "className", "teacherName"]);
    const [result] = await pool.execute(
      "INSERT INTO students (name, class_name, teacher_name) VALUES (:name, :className, :teacherName)",
      cleanStudent(body)
    );
    sendJson(res, 201, { id: result.insertId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/assessments") {
    const studentId = Number(url.searchParams.get("studentId"));
    if (!studentId) throw userError("Aluno inválido.");
    const [rows] = await pool.execute(
      `SELECT id, student_id AS studentId, DATE_FORMAT(assessment_date, '%Y-%m-%d') AS assessmentDate,
              period_label AS periodLabel, teacher_name AS teacherName,
              strengths, development_points AS developmentPoints,
              pedagogical_actions AS pedagogicalActions, family_alignment AS familyAlignment,
              created_at AS createdAt
         FROM assessments
        WHERE student_id = :studentId
        ORDER BY assessment_date DESC, id DESC`,
      { studentId }
    );
    sendJson(res, 200, rows);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/assessments") {
    const body = await readJson(req, 12_000_000);
    const assessmentId = await saveAssessment(body);
    sendJson(res, 201, { id: assessmentId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    const [summaryRows] = await pool.query(
      `SELECT COUNT(DISTINCT s.id) AS students,
              COUNT(DISTINCT a.id) AS assessments,
              ROUND(AVG(r.rating), 2) AS averageRating,
              SUM(CASE WHEN r.rating <= 2 THEN 1 ELSE 0 END) AS attentionPoints
         FROM students s
         LEFT JOIN assessments a ON a.student_id = s.id
         LEFT JOIN responses r ON r.assessment_id = a.id`
    );

    const [aspectRows] = await pool.query(
      `SELECT aspect_key AS aspect, ROUND(AVG(rating), 2) AS averageRating, COUNT(*) AS total
         FROM responses
        GROUP BY aspect_key
        ORDER BY FIELD(aspect_key, 'volitivo', 'afetivo', 'cognitivo')`
    );

    const [ratingRows] = await pool.query(
      `SELECT rating, COUNT(*) AS total
         FROM responses
        GROUP BY rating
        ORDER BY rating DESC`
    );

    const [attentionRows] = await pool.query(
      `SELECT s.name, s.class_name AS className, r.aspect_key AS aspect,
              r.indicator_text AS indicator, r.rating, a.assessment_date AS assessmentDate
         FROM responses r
         JOIN assessments a ON a.id = r.assessment_id
         JOIN students s ON s.id = a.student_id
        WHERE r.rating <= 2
        ORDER BY a.assessment_date DESC, r.rating ASC
        LIMIT 10`
    );

    sendJson(res, 200, {
      summary: summaryRows[0],
      byAspect: aspectRows,
      byRating: ratingRows,
      attention: attentionRows
    });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
}

async function authenticateUser(email, password) {
  await ensureAuthSchema();

  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) {
    throw userError("Informe e-mail e senha.");
  }

  const [rows] = await pool.execute(
    "SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = :email LIMIT 1",
    { email: cleanEmail }
  );
  const user = rows[0];

  if (!user || !verifyPassword(cleanPassword, user.passwordHash)) {
    const error = userError("E-mail ou senha inválidos.");
    error.statusCode = 401;
    throw error;
  }

  return { id: user.id, name: user.name, email: user.email };
}

async function ensureAuthSchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_users_email (email)
    )`
  );

  await pool.query("ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL");

  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent VARCHAR(255) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_sessions_token (token_hash),
      INDEX idx_user_sessions_user (user_id),
      INDEX idx_user_sessions_expires (expires_at),
      CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    )`
  );

  const defaultEmail = String(process.env.AUTH_EMAIL || "admin@farol.local").trim().toLowerCase();
  const defaultPassword = String(process.env.AUTH_PASSWORD || "farol123");
  const defaultName = String(process.env.AUTH_NAME || "Colégio Farol");

  const [rows] = await pool.execute("SELECT id FROM users WHERE email = :email LIMIT 1", { email: defaultEmail });
  if (!rows.length) {
    await pool.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :passwordHash)",
      { name: defaultName, email: defaultEmail, passwordHash: hashPassword(defaultPassword) }
    );
  }
}

async function createSession(user, req) {
  await cleanupSessions();
  const sessionId = crypto.randomBytes(32).toString("hex");
  await pool.execute(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent)
     VALUES (:userId, :tokenHash, :expiresAt, :userAgent)`,
    {
      userId: user.id,
      tokenHash: hashSessionToken(sessionId),
      expiresAt: toMysqlDateTime(getSessionExpiration()),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 255) || null
    }
  );
  return sessionId;
}

async function getSessionUser(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;

  const tokenHash = hashSessionToken(sessionId);
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
        WHERE us.token_hash = :tokenHash AND us.expires_at > :now
        LIMIT 1`,
      { tokenHash, now: toMysqlDateTime(new Date()) }
    );

    const user = rows[0];
    if (!user) {
      await deleteSession(sessionId);
      return null;
    }

    await pool.execute(
      "UPDATE user_sessions SET expires_at = :expiresAt, last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = :tokenHash",
      { tokenHash, expiresAt: toMysqlDateTime(getSessionExpiration()) }
    );
    return { id: user.id, name: user.name, email: user.email };
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return null;
    }
    throw error;
  }
}

function getSessionId(req) {
  const cookies = Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
  );
  return cookies[SESSION_COOKIE];
}

function setSessionCookie(res, sessionId) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const expires = getSessionExpiration().toUTCString();
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; Expires=${expires}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

async function deleteSession(sessionId) {
  try {
    await pool.execute("DELETE FROM user_sessions WHERE token_hash = :tokenHash", {
      tokenHash: hashSessionToken(sessionId)
    });
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
  }
}

function hashSessionToken(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex");
}

function getSessionExpiration() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

function toMysqlDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(":");
}

async function cleanupSessions() {
  try {
    await pool.execute("DELETE FROM user_sessions WHERE expires_at <= :now", {
      now: toMysqlDateTime(new Date())
    });
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
  }
}

function parsePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

async function saveAssessment(body) {
  requireFields(body, ["studentId", "assessmentDate", "periodLabel", "teacherName", "responses"]);
  if (!Array.isArray(body.responses) || body.responses.length === 0) {
    throw userError("Preencha ao menos um indicador.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assessment] = await connection.execute(
      `INSERT INTO assessments
        (student_id, assessment_date, period_label, teacher_name, strengths, development_points,
         pedagogical_actions, family_alignment, evidence_photos)
       VALUES
        (:studentId, :assessmentDate, :periodLabel, :teacherName, :strengths, :developmentPoints,
         :pedagogicalActions, :familyAlignment, :evidencePhotos)`,
      {
        studentId: Number(body.studentId),
        assessmentDate: body.assessmentDate,
        periodLabel: String(body.periodLabel).trim(),
        teacherName: String(body.teacherName).trim(),
        strengths: body.strengths || null,
        developmentPoints: body.developmentPoints || null,
        pedagogicalActions: body.pedagogicalActions || null,
        familyAlignment: body.familyAlignment || null,
        evidencePhotos: JSON.stringify((body.evidencePhotos || []).slice(0, 6))
      }
    );

    for (const response of body.responses) {
      await connection.execute(
        `INSERT INTO responses
          (assessment_id, aspect_key, indicator_id, indicator_text, rating, observation)
         VALUES
          (:assessmentId, :aspectKey, :indicatorId, :indicatorText, :rating, :observation)`,
        {
          assessmentId: assessment.insertId,
          aspectKey: response.aspectKey,
          indicatorId: response.indicatorId,
          indicatorText: response.indicatorText,
          rating: Number(response.rating),
          observation: response.observation || null
        }
      );
    }

    await connection.commit();
    return assessment.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function serveStatic(rawPathname, res) {
  const pathname = rawPathname === "/" ? "/index.html" : rawPathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Acesso negado." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          sendJson(res, 404, { error: "Arquivo não encontrado." });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallbackContent);
      });
      return;
    }

    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function readJson(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(userError("Arquivo ou formulário muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(userError("JSON inválido."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw userError(`Campo obrigatório: ${field}`);
    }
  }
}

function cleanStudent(body) {
  return {
    name: String(body.name).trim(),
    className: String(body.className).trim(),
    teacherName: String(body.teacherName).trim()
  };
}

function userError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function publicErrorMessage(error) {
  if (error.code && String(error.code).startsWith("ER_")) {
    return "Não foi possível conectar ao MySQL. Confira o arquivo .env e importe o schema.sql.";
  }
  return "Erro interno do servidor.";
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    process.env[match[1]] ??= value;
  }
}
