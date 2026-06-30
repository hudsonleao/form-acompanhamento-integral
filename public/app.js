const ASPECTS = [
  {
    key: "volitivo",
    number: "I",
    title: "Aspecto volitivo",
    subtitle: "Vontade e temperamento",
    indicators: [
      "Demonstra autocontrole diante de frustrações e contrariedades",
      "Persevera em tarefas até concluí-las, mesmo quando difíceis",
      "Toma decisões com autonomia e assume suas consequências",
      "Cumpre compromissos e responsabilidades assumidas",
      "Obedece com prontidão e respeito à autoridade legítima",
      "Demonstra fortaleza diante de dificuldades e fracassos",
      "Exercita a temperança: modera impulsos, desejos e reações",
      "Demonstra iniciativa sem necessidade de cobrança constante",
      "Consegue adiar a gratificação imediata em favor de um objetivo maior",
      "Mantém constância de esforço ao longo do tempo",
      "Reconhece seus erros e se esforça por corrigi-los",
      "Apresenta sinais claros de um temperamento predominante"
    ]
  },
  {
    key: "afetivo",
    number: "II",
    title: "Aspecto afetivo",
    subtitle: "Sentimento, comunicação e relacionamento",
    indicators: [
      "Demonstra autoestima e autoimagem equilibradas",
      "Expressa emoções e sentimentos de forma adequada",
      "Mantém equilíbrio emocional diante de estresse ou conflito",
      "Relaciona-se bem com colegas, com empatia e cordialidade",
      "Relaciona-se com respeito e confiança com professores e adultos",
      "Comunica-se com clareza, verbalmente e pela linguagem corporal",
      "Resolve conflitos interpessoais de modo pacífico",
      "Sente-se pertencente ao grupo e à turma",
      "Demonstra compaixão e solidariedade para com o próximo",
      "Manifesta vida espiritual voltada a Deus: oração, reverência e gratidão",
      "Aceita correções e feedback sem reações desproporcionais",
      "Demonstra gratidão e reconhecimento pelo que recebe"
    ]
  },
  {
    key: "cognitivo",
    number: "III",
    title: "Aspecto cognitivo",
    subtitle: "Capacidades intelectuais de aprendizagem",
    indicators: [
      "Mantém atenção e concentração adequadas",
      "Demonstra raciocínio lógico ao resolver problemas",
      "Apresenta boa retenção e uso da memória",
      "Compreende textos de acordo com sua etapa",
      "Expressa-se com clareza na escrita",
      "Expressa-se com clareza na oralidade",
      "Demonstra criatividade na resolução de problemas e produções",
      "Apresenta capacidade de abstração e generalização de conceitos",
      "Acompanha o ritmo de aprendizagem esperado para a turma",
      "Organiza o pensamento de forma estruturada",
      "Demonstra curiosidade intelectual e interesse pelo saber",
      "Estuda e busca conhecimento com autonomia",
      "Domina habilidades do Trivium conforme a fase"
    ]
  }
];

const RATINGS = [
  { value: 4, label: "Sempre" },
  { value: 3, label: "Quase sempre" },
  { value: 2, label: "Às vezes" },
  { value: 1, label: "Raramente" }
];

const TOTAL_INDICATORS = ASPECTS.reduce((total, aspect) => total + aspect.indicators.length, 0);

const state = {
  students: [],
  selectedStudent: null,
  evidencePhotos: [],
  initialized: false,
  deferredInstallPrompt: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
  bindAuthEvents();
  setupPwa();
  checkSession();
});

function bindAuthEvents() {
  $("#loginForm").addEventListener("submit", login);
  $("#logoutButton").addEventListener("click", logout);
}

function setupPwa() {
  registerServiceWorker();

  $("#installAppButton").addEventListener("click", installApp);
  $("#dismissInstallButton").addEventListener("click", dismissInstallPrompt);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    showInstallPrompt();
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    localStorage.setItem("acompInstallDismissed", "installed");
    hideInstallPrompt();
    showToast("App instalado com sucesso.");
  });

  window.setTimeout(showInstallPrompt, 2500);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.warn("Não foi possível registrar o service worker.");
    });
  });
}

function showInstallPrompt() {
  if (localStorage.getItem("acompInstallDismissed")) return;
  if (window.matchMedia("(display-mode: standalone)").matches) return;
  $("#installPrompt").classList.remove("is-hidden");
}

function hideInstallPrompt() {
  $("#installPrompt").classList.add("is-hidden");
}

async function installApp() {
  if (!state.deferredInstallPrompt) {
    showToast("Use o menu do navegador para instalar este app.");
    return;
  }

  state.deferredInstallPrompt.prompt();
  const choice = await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;

  if (choice.outcome === "accepted") {
    hideInstallPrompt();
  }
}

function dismissInstallPrompt() {
  localStorage.setItem("acompInstallDismissed", "true");
  hideInstallPrompt();
}

function bindEvents() {
  $("#searchInput").addEventListener("input", debounce(loadStudents, 250));
  $("#newStudentButton").addEventListener("click", openStudentDialog);
  $("#cancelStudentButton").addEventListener("click", () => $("#studentDialog").close());
  $("#studentForm").addEventListener("submit", createStudent);
  $("#dashboardButton").addEventListener("click", openDashboard);
  $("#exportCsvButton").addEventListener("click", exportVisibleStudents);
  $("#startAssessmentButton").addEventListener("click", startAssessment);
  $("#assessmentForm").addEventListener("submit", saveAssessment);
  $("#assessmentDate").addEventListener("change", syncPeriodLabel);
  $("#printButton").addEventListener("click", () => window.print());
  $("#photoInput").addEventListener("change", handlePhotos);

  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

async function checkSession() {
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      showApp();
      return;
    }
  } catch {
    // The login screen remains visible when the session check cannot be completed.
  }

  showLogin();
}

async function login(event) {
  event.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  if (!email || !password) {
    showToast("Informe e-mail e senha.", true);
    return;
  }

  setButtonLoading($("#loginButton"), "Entrando...");
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    $("#loginForm").reset();
    showApp();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    restoreButton($("#loginButton"));
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST" });
  } catch {
    // Even if the server is unavailable, clear the local view.
  }

  state.students = [];
  state.selectedStudent = null;
  showLogin();
}

function showApp() {
  $("#loginView").classList.add("is-hidden");
  $("#appShell").classList.remove("is-hidden");

  if (!state.initialized) {
    bindEvents();
    renderAspectSections();
    setToday();
    updateProgress();
    state.initialized = true;
  }

  loadStudents();
}

function showLogin() {
  $("#appShell").classList.add("is-hidden");
  $("#loginView").classList.remove("is-hidden");
  window.setTimeout(() => $("#loginEmail").focus(), 50);
}

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const requestPath = method === "GET" ? withCacheBuster(path) : path;
  const response = await fetch(requestPath, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, max-age=0",
      "Pragma": "no-cache",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/login" && path !== "/api/session") {
      showLogin();
    }
    throw new Error(data.error || "Não foi possível concluir a ação.");
  }
  return data;
}

function withCacheBuster(path) {
  if (!path.startsWith("/api/")) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function loadStudents() {
  const list = $("#studentList");
  list.innerHTML = skeletonCards();
  const search = $("#searchInput").value.trim();
  const q = encodeURIComponent(search);

  try {
    state.students = await api(`/api/students?q=${q}`);
    console.info("[acompanhamento] alunos carregados", { total: state.students.length, search });
    renderStudents();
  } catch (error) {
    list.innerHTML = emptyState("Não foi possível carregar os alunos", "Confira a conexão com o MySQL e tente novamente.");
    showToast(error.message, true);
  }
}

function renderStudents() {
  const list = $("#studentList");
  if (!state.students.length) {
    list.innerHTML = emptyState("Nenhum aluno encontrado", "Cadastre o primeiro aluno ou ajuste a busca por nome, turma ou professora.");
    return;
  }

  list.innerHTML = state.students.map((student) => `
    <article class="student-card">
      <div>
        <h2>${escapeHtml(student.name)}</h2>
        <p>${escapeHtml(student.className)} · ${escapeHtml(student.teacherName)}</p>
        <span class="pill">${student.assessmentCount || 0} preenchimento(s)</span>
        <p>Último registro: ${student.lastAssessment || "sem registros"}</p>
      </div>
      <div class="card-actions">
        <button type="button" title="Ver histórico do aluno" aria-label="Ver histórico de ${escapeHtml(student.name)}" data-open-student="${student.id}">Ver histórico</button>
        <button type="button" title="Registrar acompanhamento semanal" aria-label="Registrar acompanhamento para ${escapeHtml(student.name)}" data-new-assessment="${student.id}">Registrar semana</button>
      </div>
    </article>
  `).join("");

  $$("[data-open-student]").forEach((button) => {
    button.addEventListener("click", () => openStudent(Number(button.dataset.openStudent)));
  });
  $$("[data-new-assessment]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStudent = state.students.find((student) => student.id === Number(button.dataset.newAssessment));
      startAssessment();
    });
  });
}

function openStudentDialog() {
  $("#studentDialog").showModal();
  window.setTimeout(() => $("#newStudentName").focus(), 50);
}

async function createStudent(event) {
  event.preventDefault();
  const submit = event.submitter || $("#studentForm button[type='submit']");

  const fields = [$("#newStudentName"), $("#newStudentClass"), $("#newStudentTeacher")];
  const missing = fields.find((field) => !field.value.trim());
  if (missing) {
    missing.focus({ preventScroll: true });
    showToast("Preencha nome, turma e professora.", true);
    return;
  }

  setButtonLoading(submit, "Salvando...");

  try {
    const createdStudent = await api("/api/students", {
      method: "POST",
      body: JSON.stringify({
        name: $("#newStudentName").value.trim(),
        className: $("#newStudentClass").value.trim(),
        teacherName: $("#newStudentTeacher").value.trim()
      })
    });
    $("#studentDialog").close();
    event.target.reset();
    $("#searchInput").value = "";
    console.info("[acompanhamento] aluno cadastrado", createdStudent);
    showToast("Aluno cadastrado.");
    if (Array.isArray(createdStudent.students)) {
      state.students = createdStudent.students;
      console.info("[acompanhamento] lista atualizada pelo cadastro", { total: state.students.length });
      renderStudents();
    } else {
      await loadStudents();
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    restoreButton(submit);
  }
}

async function openStudent(studentId) {
  state.selectedStudent = state.students.find((student) => student.id === studentId);
  $("#studentName").textContent = state.selectedStudent.name;
  $("#studentMeta").textContent = `${state.selectedStudent.className} · ${state.selectedStudent.teacherName}`;
  showView("studentView");
  await loadHistory(studentId);
}

async function loadHistory(studentId) {
  const container = $("#assessmentHistory");
  container.innerHTML = skeletonCards(2);

  try {
    const history = await api(`/api/assessments?studentId=${studentId}`);
    container.innerHTML = history.length ? history.map((item) => `
      <article class="history-card">
        <strong>${formatDate(item.assessmentDate)} · ${escapeHtml(item.periodLabel)}</strong>
        <p>${escapeHtml(item.teacherName)}</p>
        <p>${escapeHtml(item.strengths || "Sem síntese registrada.")}</p>
      </article>
    `).join("") : emptyState("Sem preenchimentos", "Comece um novo registro semanal para este aluno.");
  } catch (error) {
    container.innerHTML = emptyState("Histórico indisponível", "Não foi possível carregar os registros deste aluno.");
    showToast(error.message, true);
  }
}

function startAssessment() {
  if (!state.selectedStudent) return;
  $("#assessmentForm").reset();
  setToday();
  $("#teacherName").value = state.selectedStudent.teacherName;
  syncPeriodLabel();
  state.evidencePhotos = [];
  renderPhotoPreview();
  updateFormHeader();
  updateProgress();
  $("#pageTitle").textContent = "Novo preenchimento";
  $("#pageSubtitle").textContent = `Semana de ${formatDate($("#assessmentDate").value)}`;
  showView("formView");
}

function renderAspectSections() {
  $("#aspectSections").innerHTML = ASPECTS.map((aspect) => `
    <section class="panel aspect-panel" data-aspect="${aspect.key}">
      <div class="panel-heading" data-number="${aspect.number}">
        <strong>${aspect.title}</strong>
        <span>${aspect.subtitle}</span>
      </div>
      ${aspect.indicators.map((indicator, index) => {
        const id = `${aspect.key}-${index + 1}`;
        return `
          <div class="indicator" data-indicator="${id}">
            <p class="indicator-title">${indicator}</p>
            <div class="rating-grid" role="radiogroup" aria-label="${indicator}" aria-required="true">
              ${RATINGS.map((rating) => `
                <label class="rating-option">
                  <input type="radio" name="${id}" value="${rating.value}" required>
                  <span>${rating.label}</span>
                </label>
              `).join("")}
            </div>
            <textarea class="obs-input" name="${id}-obs" placeholder="Observações e evidências concretas"></textarea>
          </div>
        `;
      }).join("")}
    </section>
  `).join("");

  $$('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", updateProgress);
  });
}

async function saveAssessment(event) {
  event.preventDefault();
  if (!state.selectedStudent) return;

  const missingField = findFirstMissingRequiredField();
  if (missingField) {
    missingField.focus({ preventScroll: true });
    missingField.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    showToast("Preencha os campos obrigatórios antes de salvar.", true);
    return;
  }

  const missing = findFirstMissingIndicator();
  if (missing) {
    missing.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    missing.classList.add("needs-answer");
    window.setTimeout(() => missing.classList.remove("needs-answer"), 1800);
    showToast("Responda todos os indicadores antes de salvar.", true);
    return;
  }

  const responses = [];
  for (const aspect of ASPECTS) {
    aspect.indicators.forEach((indicator, index) => {
      const indicatorId = `${aspect.key}-${index + 1}`;
      const checked = $(`input[name="${indicatorId}"]:checked`);
      responses.push({
        aspectKey: aspect.key,
        indicatorId,
        indicatorText: indicator,
        rating: Number(checked.value),
        observation: $(`textarea[name="${indicatorId}-obs"]`).value.trim()
      });
    });
  }

  setButtonLoading($("#saveButton"), "Salvando...");
  try {
    await api("/api/assessments", {
      method: "POST",
      body: JSON.stringify({
        studentId: state.selectedStudent.id,
        assessmentDate: $("#assessmentDate").value,
        periodLabel: $("#periodLabel").value,
        teacherName: $("#teacherName").value,
        responses,
        strengths: $("#strengths").value,
        developmentPoints: $("#developmentPoints").value,
        pedagogicalActions: $("#pedagogicalActions").value,
        familyAlignment: $("#familyAlignment").value,
        evidencePhotos: state.evidencePhotos
      })
    });
    showToast("Preenchimento salvo.");
    await loadStudents();
    await openStudent(state.selectedStudent.id);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    restoreButton($("#saveButton"));
  }
}

async function handlePhotos(event) {
  const files = Array.from(event.target.files).slice(0, 6);
  if (!files.length) return;

  showToast("Preparando fotos...");
  const compressed = [];
  for (const file of files) {
    compressed.push(await compressImage(file));
  }
  state.evidencePhotos = compressed;
  renderPhotoPreview();
  showToast(`${compressed.length} foto(s) anexada(s).`);
}

function renderPhotoPreview() {
  $("#photoPreview").innerHTML = state.evidencePhotos.map((src) => `<img src="${src}" alt="Evidência anexada">`).join("");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 900;
        const ratio = Math.min(max / image.width, max / image.height, 1);
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function openDashboard() {
  try {
    const data = await api("/api/dashboard");
    renderDashboard(data);
    $("#pageTitle").textContent = "Dashboard";
    $("#pageSubtitle").textContent = "Indicadores do acompanhamento integral";
    showView("dashboardView");
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderDashboard(data) {
  const summary = data.summary || {};
  $("#dashboardCards").innerHTML = [
    ["Alunos", summary.students || 0],
    ["Preenchimentos", summary.assessments || 0],
    ["Média geral", summary.averageRating || "-"],
    ["Pontos de atenção", summary.attentionPoints || 0]
  ].map(([label, value]) => `<article class="metric"><strong>${value}</strong><span>${label}</span></article>`).join("");

  $("#aspectChart").innerHTML = (data.byAspect || []).map((item) => {
    const width = Math.max(4, (Number(item.averageRating || 0) / 4) * 100);
    return `<div class="bar-row"><strong>${aspectName(item.aspect)} · ${item.averageRating || "-"}</strong><div><i style="width:${width}%"></i></div></div>`;
  }).join("") || "<p class='helper-text'>Sem dados para exibir.</p>";

  $("#attentionList").innerHTML = (data.attention || []).map((item) => `
    <div class="attention-item">
      <strong>${escapeHtml(item.name)} · ${aspectName(item.aspect)}</strong>
      <p>${escapeHtml(item.indicator)}</p>
      <span class="pill">${ratingLabel(item.rating)}</span>
    </div>
  `).join("") || "<p class='helper-text'>Nenhum ponto crítico registrado.</p>";
}

function exportVisibleStudents() {
  const rows = [["Aluno", "Turma", "Professora", "Preenchimentos", "Ultimo registro"]];
  state.students.forEach((student) => rows.push([
    student.name,
    student.className,
    student.teacherName,
    student.assessmentCount || 0,
    student.lastAssessment || ""
  ]));
  const csv = rows.map((row) => row.map(formatCsvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "acompanhamento-integral.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatCsvCell(value) {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\r?\n/g, " ")
    .trim();

  return `"${text.replaceAll('"', '""')}"`;
}

function updateFormHeader() {
  if (!state.selectedStudent) return;
  $("#formStudentName").textContent = state.selectedStudent.name;
  $("#formStudentMeta").textContent = `${state.selectedStudent.className} · ${state.selectedStudent.teacherName}`;
}

function updateProgress() {
  const answered = ASPECTS.reduce((total, aspect) => {
    return total + aspect.indicators.filter((_, index) => {
      return Boolean($(`input[name="${aspect.key}-${index + 1}"]:checked`));
    }).length;
  }, 0);
  const percent = Math.round((answered / TOTAL_INDICATORS) * 100);

  $("#progressPercent").textContent = `${percent}%`;
  $("#progressText").textContent = `${answered} de ${TOTAL_INDICATORS} indicadores`;
  $("#progressBar").style.width = `${percent}%`;
}

function findFirstMissingIndicator() {
  for (const aspect of ASPECTS) {
    for (let index = 0; index < aspect.indicators.length; index += 1) {
      const id = `${aspect.key}-${index + 1}`;
      if (!$(`input[name="${id}"]:checked`)) {
        return $(`[data-indicator="${id}"]`);
      }
    }
  }
  return null;
}

function findFirstMissingRequiredField() {
  return [$("#assessmentDate"), $("#periodLabel"), $("#teacherName")]
    .find((field) => !field.value.trim());
}

function showView(id) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  if (id === "homeView") {
    $("#pageTitle").textContent = "Acompanhamento Integral";
    $("#pageSubtitle").textContent = "Educação personalizada - Colégio Farol";
  }
}

function syncPeriodLabel() {
  $("#periodLabel").value = `Semana de ${formatDate($("#assessmentDate").value)}`;
  $("#pageSubtitle").textContent = `Semana de ${formatDate($("#assessmentDate").value)}`;
}

function setToday() {
  $("#assessmentDate").value = new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function aspectName(key) {
  return ({ volitivo: "Volitivo", afetivo: "Afetivo", cognitivo: "Cognitivo" })[key] || key;
}

function ratingLabel(value) {
  const rating = RATINGS.find((item) => item.value === Number(value));
  return rating ? rating.label : `Nota ${value}`;
}

function setButtonLoading(button, label) {
  if (!button) return;
  button.dataset.originalText = button.textContent;
  button.textContent = label;
  button.disabled = true;
}

function restoreButton(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

function skeletonCards(count = 3) {
  return Array.from({ length: count }, () => `
    <article class="student-card skeleton-card">
      <div>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </article>
  `).join("");
}

function emptyState(title, text) {
  return `
    <article class="empty-state">
      <h2>${title}</h2>
      <p>${text}</p>
    </article>
  `;
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.background = isError ? "var(--danger)" : "var(--blue)";
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
