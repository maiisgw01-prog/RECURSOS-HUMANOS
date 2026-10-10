const initialData = {
  empleados: [
    {id:1,nombre:"Ana García López",categoria:"EMS",rango:"EMT Senior",ultimoAscenso:"2026-05-12",certificaciones:["S&R","FTO"],especializaciones:["Urgencias"],turno:"Mañana",estado:"Activo"},
    {id:2,nombre:"Carlos Martín Ruiz",categoria:"PHS",rango:"Médico Adjunto",ultimoAscenso:"2026-03-04",certificaciones:["TAC/MRI"],especializaciones:["Cardiología","Neurología"],turno:"Mañana",estado:"Activo"},
    {id:3,nombre:"Laura Sánchez Pérez",categoria:"PHS",rango:"Enfermero",ultimoAscenso:"2026-07-19",certificaciones:["Angel-1"],especializaciones:["Salud Mental"],turno:"Tarde",estado:"Activo"},
    {id:4,nombre:"Miguel Torres Díaz",categoria:"EMS",rango:"Paramédico",ultimoAscenso:"2026-01-27",certificaciones:["Aqua (B)"],especializaciones:["Forense"],turno:"Mañana",estado:"Activo"}
  ],
  ausencias: [
    {id:1,empleado:"Ana García López",desde:"2026-09-25",hasta:"2026-09-29",tipo:"Ausencia justificada",estado:"Activa"},
    {id:2,empleado:"Laura Sánchez Pérez",desde:"2026-09-28",hasta:"2026-09-28",tipo:"Asunto personal",estado:"Pendiente"}
  ],
  incidencias: [
    {id:1,empleado:"Miguel Torres Díaz",fecha:"2026-09-24",tipo:"Aviso",descripcion:"Entrada registrada fuera de horario"}
  ],
  observaciones: []
};

const hostedApp = location.hostname !== "localhost" && location.hostname !== "127.0.0.1" && location.protocol !== "file:";
let data = hostedApp
  ? JSON.parse(JSON.stringify(initialData))
  : JSON.parse(localStorage.getItem("rrhhHospital")) || JSON.parse(JSON.stringify(initialData));
const normalizeData = () => {
  data.observaciones ||= [];
  data.placasCogidas ||= [];
  data.logosRango ||= {};
  delete data.plantillaPruebas;
};
normalizeData();

const $ = id => document.getElementById(id);
let serverAvailable = false;
let lastServerJson = null;
let pendingSaves = 0;
let saveQueue = Promise.resolve();
const save = () => {
  const json = JSON.stringify(data);
  if (!hostedApp) localStorage.setItem("rrhhHospital", json);
  if (!serverAvailable) return;
  pendingSaves++;
  saveQueue = saveQueue.then(async () => {
    const res = await fetch("/api/data", {method:"PUT", headers:{"Content-Type":"application/json"}, body:json});
    if (!res.ok) {
      const error = new Error(`Error ${res.status} al guardar`);
      error.status = res.status;
      throw error;
    }
    lastServerJson = json;
  }).catch(error => {
    if (hostedApp && (error.status === 401 || error.status === 403)) {
      showLogin("Tu sesión ya no tiene acceso. Inicia sesión con una cuenta autorizada.");
    }
    console.error("No se pudieron guardar los datos en Netlify.", error);
    alert("No se pudieron guardar los cambios en Netlify. Comprueba tu conexión e inténtalo de nuevo.");
  }).finally(() => {
    pendingSaves--;
  });
};
const loadFromServer = async () => {
  const res = await fetch("/api/data", {cache:"no-store"});
  if (!res.ok) {
    const error = new Error(`Error ${res.status} al cargar`);
    error.status = res.status;
    throw error;
  }
  const remote = await res.json();
  serverAvailable = true;
  return remote;
};
const activeEmployees = () => data.empleados;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'": "&#39;"}[char]));
const ranksByCategory = {
  Comandancia: ["Director", "Sub-director", "Director Adjunto"],
  EMS: ["Teniente", "Especialista de Campo", "Paramédico Senior", "Paramédico", "EMT Senior", "EMT", "EMR", "Trainee"],
  PHS: ["Capitán", "Médico Adjunto Senior", "Médico Adjunto", "Residente", "Enfermero", "Interino", "Estudiante de Medicina", "Trainee"]
};
const categoryOrder = ["Comandancia", "EMS", "PHS"];
const certifications = ["S&R", "TAC/MRI", "Angel-1", "FTO"];
const specializations = ["Cardiología", "Salud Mental", "Neurología", "Traumatología", "Forense", "RRPP", "Salud Pública"];
const plateRanges = [
  {rango:"Director",desde:1,hasta:1},
  {rango:"Sub-director",desde:2,hasta:2},
  {rango:"Director Adjunto",desde:3,hasta:3},
  {rango:"Capitán",desde:5,hasta:6},
  {rango:"Teniente",desde:7,hasta:8},
  {rango:"Especialista",desde:9,hasta:14},
  {rango:"Médico Adjunto Senior",desde:15,hasta:20},
  {rango:"Paramédico Senior",desde:21,hasta:25},
  {rango:"Médico Adjunto",desde:26,hasta:30},
  {rango:"Paramédico",desde:31,hasta:35},
  {rango:"Residente",desde:36,hasta:40},
  {rango:"EMT Senior",desde:41,hasta:50},
  {rango:"Enfermero",desde:51,hasta:60},
  {rango:"EMT",desde:61,hasta:70},
  {rango:"Interino",desde:71,hasta:80},
  {rango:"EMR",prefijo:"T-",desde:1,hasta:10},
  {rango:"Estudiante de Medicina",prefijo:"T-",desde:11,hasta:20}
];
const allPlates = plateRanges.flatMap((range, groupIndex) => Array.from({length:range.hasta - range.desde + 1}, (_, index) => ({
  numero:`${range.prefijo || ""}${String(range.desde + index).padStart(2,"0")}`,
  rango:range.rango,
  groupIndex
})));
const rankSortPosition = employee => {
  const categoryIndex = categoryOrder.indexOf(employee.categoria);
  const ranks = ranksByCategory[employee.categoria] || [];
  const rankIndex = ranks.indexOf(employee.rango);
  return (categoryIndex === -1 ? categoryOrder.length : categoryIndex) * 100
    + (rankIndex === -1 ? ranks.length : rankIndex);
};

function plateRangeFor(category, rank) {
  const plateRank = category === "EMS" && rank === "Especialista de Campo" ? "Especialista" : rank;
  return plateRanges.find(range => range.rango === plateRank);
}

function occupiedPlates(employees = activeEmployees()) {
  return new Set([...data.placasCogidas, ...employees.map(employee => employee.placa).filter(Boolean)]);
}

function availablePlatesFor(category, rank, employees, employee) {
  const range = plateRangeFor(category, rank);
  if (!range) return [];
  const assignedElsewhere = new Set(employees.filter(item => item.id !== employee?.id).map(item => item.placa).filter(Boolean));
  const occupied = occupiedPlates(employees);
  return allPlates.filter(plate => plate.rango === range.rango
    && (!occupied.has(plate.numero) || plate.numero === employee?.placa)
    && (!assignedElsewhere.has(plate.numero) || plate.numero === employee?.placa));
}

function renderPlates() {
  const query = $("buscar-placa").value.trim().toLowerCase();
  const filter = $("filtrar-placas").value;
  const employees = activeEmployees();
  const occupied = occupiedPlates(employees);
  const occupiedCount = allPlates.filter(plate => occupied.has(plate.numero)).length;
  const filteredPlates = allPlates.filter(plate => {
    const isOccupied = occupied.has(plate.numero);
    const assignedEmployee = employees.find(employee => employee.placa === plate.numero);
    const matchesState = filter === "todas" || (filter === "cogidas" ? occupied : !occupied);
    return matchesState && `${plate.numero} ${plate.rango} ${assignedEmployee?.nombre || ""}`.toLowerCase().includes(query);
  });
  $("resumen-placas").textContent = `${allPlates.length} placas · ${occupiedCount} cogidas · ${allPlates.length - occupiedCount} libres`;
  $("tabla-placas").innerHTML = filteredPlates.length ? filteredPlates.map((plate, index) => {
    const isOccupied = occupied.has(plate.numero);
    const assignedEmployee = employees.find(employee => employee.placa === plate.numero);
    const statusText = assignedEmployee ? `Asignada a ${assignedEmployee.nombre}` : isOccupied ? "Cogida" : "Disponible";
    const startsGroup = index === 0 || filteredPlates[index - 1].groupIndex !== plate.groupIndex;
    const groupClass = plate.groupIndex % 2 === 0 ? "plate-group-a" : "plate-group-b";
    return `<tr class="${groupClass}${startsGroup ? " plate-group-start" : ""}"><td><strong class="plate-number">${escapeHtml(plate.numero)}</strong></td><td>${escapeHtml(plate.rango)}</td><td><div class="plate-status"><span class="plate-availability ${isOccupied ? "unavailable" : "available"}" aria-label="${isOccupied ? "No disponible" : "Disponible"}"><span class="plate-availability-mark" aria-hidden="true">${isOccupied ? "×" : "✓"}</span>${escapeHtml(statusText)}</span><button class="plate-toggle" type="button" data-toggle-plate="${escapeHtml(plate.numero)}" aria-pressed="${isOccupied}" ${assignedEmployee ? "disabled title=\"Para liberar esta placa, quítala de la ficha del profesional\"" : ""}>${assignedEmployee ? "Asignada" : isOccupied ? "Marcar libre" : "Marcar cogida"}</button></div></td></tr>`;
  }).join("") : `<tr><td colspan="3" class="empty">No hay placas que coincidan con el filtro.</td></tr>`;
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => showSection(btn.dataset.section));
});

$("buscar-placa").addEventListener("input", renderPlates);
$("filtrar-placas").addEventListener("change", renderPlates);
$("tabla-placas").addEventListener("click", event => {
  const button = event.target.closest("[data-toggle-plate]");
  if (!button) return;
  const plateNumber = button.dataset.togglePlate;
  data.placasCogidas = data.placasCogidas.includes(plateNumber)
    ? data.placasCogidas.filter(plate => plate !== plateNumber)
    : [...data.placasCogidas, plateNumber];
  save();
  renderPlates();
});

function showSection(section) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  $(section).classList.add("active");
  document.querySelector(`[data-section="${section}"]`).classList.add("active");
  const titles = {plantilla:"Plantilla",ausencias:"Ausencias",incidencias:"Sanciones",observaciones:"Observaciones",placas:"Placas por rango"};
  $("page-title").textContent = titles[section];
  render();
}

function statusClass(status) {
  if (["Activo","Activa","Justificada","Resuelta"].includes(status)) return "ok";
  if (status === "Tiempo Partido") return "absent";
  if (["Ausente", "Ausencia", "Finalizada"].includes(status)) return "danger";
  if (["Pendiente","Pendiente de revisión"].includes(status)) return "warn";
  return "danger";
}

function sanctionTypeClass(type) {
  return {"Falta":"falta", "Aviso":"aviso", "Suspensión":"suspension"}[type] || "";
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function finalizeExpiredAbsences() {
  const today = todayKey();
  let changed = false;
  data.ausencias.forEach(absence => {
    if (absence.estado === "Activa" && absence.hasta < today) {
      absence.estado = "Finalizada";
      changed = true;
    }
  });
  if (changed) save();
}

function employeeStatus(employee) {
  const today = todayKey();
  const hasCurrentAbsence = data.ausencias.some(absence => absence.empleado === employee.nombre
    && absence.estado === "Activa"
    && absence.desde <= today
    && absence.hasta >= today);
  if (hasCurrentAbsence) return "Ausencia";
  return ["Ausencia", "Ausente"].includes(employee.estado) ? "Activo" : employee.estado || "Activo";
}

function render() {
  finalizeExpiredAbsences();
  const currentEmployees = activeEmployees();
  const sortedEmployees = currentEmployees.slice().sort((a, b) => rankSortPosition(a) - rankSortPosition(b)
    || String(a.rango || "").localeCompare(String(b.rango || ""), "es")
    || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  const employeeCategories = [...categoryOrder, ...new Set(sortedEmployees.map(e => e.categoria).filter(category => !categoryOrder.includes(category)))];
  $("employee-cards").innerHTML = sortedEmployees.length ? employeeCategories.map(category => {
    const categoryEmployees = sortedEmployees.filter(employee => employee.categoria === category);
    if (!categoryEmployees.length) return "";
    const cards = categoryEmployees.map(e => {
      const currentStatus = employeeStatus(e);
      return `
      <article class="employee-card">
        <div class="employee-card-head">
          ${data.logosRango[e.rango] ? `<img class="avatar" src="${data.logosRango[e.rango]}" alt="Logo de ${escapeHtml(e.rango)}">` : `<span class="avatar avatar-fallback">${escapeHtml(initials(e.rango || e.nombre))}</span>`}
          <div class="employee-card-person"><h3>${escapeHtml(e.nombre)}</h3><p>${escapeHtml(e.discord || "Sin Discord")}</p></div>
          <button class="icon-button" type="button" data-edit="${escapeHtml(e.id)}" aria-label="Editar ${escapeHtml(e.nombre)}" title="Editar ficha">✎</button>
          <button class="icon-button icon-button-danger" type="button" data-delete="${escapeHtml(e.id)}" aria-label="Eliminar ${escapeHtml(e.nombre)}" title="Eliminar ficha">🗑</button>
        </div>
        <div class="employee-card-tags"><span class="employee-tag employee-tag-rank">${escapeHtml(e.rango || "Sin rango")}</span><span class="employee-tag employee-tag-plate">${escapeHtml(e.placa || "Sin placa")}</span><span class="status ${statusClass(currentStatus)}">${escapeHtml(currentStatus)}</span></div>
        <div class="employee-card-details">
          <div><span>Último ascenso</span><strong>${formatDate(e.ultimoAscenso) || "—"}</strong></div>
          <div><span>Certificaciones</span><strong>${escapeHtml((e.certificaciones || []).join(" · ") || "—")}</strong></div>
          <div><span>Especializaciones</span><strong>${escapeHtml((e.especializaciones || []).join(" · ") || "—")}</strong></div>
        </div>
      </article>`;
    }).join("");
    return `<section class="employee-card-group"><h3 class="employee-card-group-title">${escapeHtml(category)}</h3><div class="employee-card-grid">${cards}</div></section>`;
  }).join("") : `<div class="employee-cards-empty">Aún no hay profesionales en esta plantilla.</div>`;
  filterEmployees();

  $("tabla-ausencias").innerHTML = data.ausencias.length ? data.ausencias.map(a => `
    <tr><td>${a.empleado}</td><td>${formatDate(a.desde)}</td><td>${formatDate(a.hasta)}</td>
    <td>${escapeHtml(a.tipo)}</td><td>${escapeHtml(a.motivo || "—")}</td><td><span class="status ${statusClass(a.estado)}">${escapeHtml(a.estado)}</span></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty">No hay ausencias registradas.</td></tr>`;

  const sanctionFilter = $("filtrar-sanciones").value;
  const activeSanctions = data.incidencias.filter(incident => !incident.archivada).length;
  const archivedSanctions = data.incidencias.length - activeSanctions;
  const sortedIncidents = data.incidencias.filter(incident => sanctionFilter === "todas"
    || (sanctionFilter === "archivadas" ? Boolean(incident.archivada) : !incident.archivada)).sort((a, b) => String(a.empleado || "").localeCompare(String(b.empleado || ""), "es")
    || String(b.fecha || "").localeCompare(String(a.fecha || "")));
  $("resumen-sanciones").textContent = `${activeSanctions} activas · ${archivedSanctions} archivadas`;
  let incidentGroupIndex = -1;
  let previousIncidentEmployee = null;
  $("tabla-incidencias").innerHTML = sortedIncidents.length ? sortedIncidents.map((incident, index) => {
    const startsGroup = index === 0 || incident.empleado !== previousIncidentEmployee;
    if (startsGroup) incidentGroupIndex++;
    previousIncidentEmployee = incident.empleado;
    const groupClass = incidentGroupIndex % 2 === 0 ? "incident-group-a" : "incident-group-b";
    return `<tr class="${groupClass}${startsGroup ? " incident-group-start" : ""}"><td>${escapeHtml(incident.empleado)}</td><td>${formatDate(incident.fecha)}</td><td><span class="sanction-type sanction-type-${sanctionTypeClass(incident.tipo)}">${escapeHtml(incident.tipo)}</span></td>
    <td>${escapeHtml(incident.descripcion)}</td><td><button class="sanction-archive" type="button" data-toggle-archive="${incident.id}" aria-label="${incident.archivada ? "Restaurar" : "Archivar"} sanción de ${escapeHtml(incident.empleado)}">${incident.archivada ? "Restaurar" : "Archivar"}</button></td></tr>`;
  }).join("")
    : `<tr><td colspan="5" class="empty">${sanctionFilter === "archivadas" ? "No hay sanciones archivadas." : "No hay sanciones activas."}</td></tr>`;

  $("tabla-observaciones").innerHTML = data.observaciones.length ? data.observaciones.slice().reverse().map(note => `
    <tr><td>${escapeHtml(note.empleado)}</td><td>${formatDate(note.fecha)}</td><td>${escapeHtml(note.nota)}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">No hay notas de seguimiento.</td></tr>`;

  renderPlates();
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value + "T00:00:00").toLocaleDateString("es-ES");
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function preparePhoto(file) {
  if (!file || !file.name) return Promise.resolve("");
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Selecciona un archivo de imagen."));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error("La imagen debe pesar menos de 8 MB."));
  return createImageBitmap(file).then(bitmap => {
    const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.78);
  });
}

function openModal(title, html, onSubmit) {
  $("modal-title").textContent = title;
  $("modal-form").innerHTML = html;
  $("modal").classList.remove("hidden");
  $("modal-form").onsubmit = e => { e.preventDefault(); onSubmit(new FormData(e.target)); };
}
function closeModal(){ $("modal").classList.add("hidden"); }
$("close-modal").onclick = closeModal;
$("modal").onclick = e => { if(e.target === $("modal")) closeModal(); };

$("btn-nuevo-empleado").onclick = () => openEmployeeModal();

function normalizePhotoKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

$("btn-importar-fotos").addEventListener("click", () => $("importar-fotos").click());
$("importar-fotos").addEventListener("change", async event => {
  const files = [...event.target.files].filter(file => file.type.startsWith("image/"));
  const ranksByKey = new Map([...new Set(Object.values(ranksByCategory).flat())].map(rank => [normalizePhotoKey(rank), rank]));
  const originalLogos = {...data.logosRango};
  const updatedLogos = {...data.logosRango};
  const importedRanks = new Set();
  let unmatched = 0;
  let invalid = 0;
  for (const file of files) {
    const fileKey = normalizePhotoKey(file.name.replace(/\.[^.]+$/, ""));
    const rank = ranksByKey.get(fileKey);
    if (!rank) {
      unmatched++;
      continue;
    }
    try {
      updatedLogos[rank] = await preparePhoto(file);
      importedRanks.add(rank);
    } catch {
      invalid++;
    }
  }
  try {
    if (importedRanks.size) {
      data.logosRango = updatedLogos;
      save();
    }
    $("resultado-importacion-fotos").textContent = `${importedRanks.size} logo${importedRanks.size === 1 ? "" : "s"} de rango asignado${importedRanks.size === 1 ? "" : "s"}; ${unmatched} sin coincidencia${unmatched === 1 ? "" : "s"}${invalid ? `; ${invalid} archivo${invalid === 1 ? "" : "s"} no válido${invalid === 1 ? "" : "s"}` : ""}.`;
    $("resultado-importacion-fotos").hidden = false;
    render();
  } catch {
    data.logosRango = originalLogos;
    $("resultado-importacion-fotos").textContent = "No se pudieron guardar los logos. Puede que el almacenamiento del navegador esté lleno.";
    $("resultado-importacion-fotos").hidden = false;
  }
  event.target.value = "";
});

function openEmployeeModal(employee = null) {
  const editing = Boolean(employee);
  const employees = activeEmployees();
  const categoryValue = ["EMS", "PHS", "Comandancia"].includes(employee?.categoria) ? employee.categoria : "";
  const selectedCertifications = employee?.certificaciones || [];
  const selectedSpecializations = employee?.especializaciones || [];
  const checklist = (name, values, selected) => values.map(value => `<label class="check-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${selected.includes(value) ? "checked" : ""}><span>${escapeHtml(value)}</span></label>`).join("");
  openModal(editing ? "Editar profesional" : "Nuevo profesional", `
  <div class="form-grid">
    <div class="field full"><label>Nombre y apellidos</label><input name="nombre" value="${escapeHtml(employee?.nombre || "")}" required></div>
    <div class="field"><label>Categoría</label><select id="categoria" name="categoria" required><option value="">Seleccionar</option>${["EMS","PHS","Comandancia"].map(category => `<option value="${category}" ${categoryValue === category ? "selected" : ""}>${category}</option>`).join("")}</select></div>
    <div class="field"><label>Rango</label><select id="rango" name="rango" required><option value="">Selecciona categoría primero</option></select></div>
    <div class="field"><label>Placa</label><select id="placa" name="placa"><option value="">Selecciona un rango</option></select></div>
    <div class="field full"><label>Fecha del último ascenso</label><input type="date" name="ultimoAscenso" value="${escapeHtml(employee?.ultimoAscenso || "")}"></div>
    <div class="field full"><label>Discord</label><input name="discord" value="${escapeHtml(employee?.discord || "")}" placeholder="Usuario o ID de Discord"></div>
    <div class="field full choice-field"><label>Certificaciones</label><div class="check-grid">${checklist("certificaciones", certifications, selectedCertifications)}</div><div class="level-grid">${["Aqua", "Mine", "Mount"].map(cert => `<label class="level-option"><span>${cert}</span><select name="nivel-${cert.toLowerCase()}"><option value="">Sin certificación</option><option value="B" ${selectedCertifications.includes(`${cert} (B)`) || selectedCertifications.includes(`${cert} (Básica)`) ? "selected" : ""}>B</option><option value="EXP" ${selectedCertifications.includes(`${cert} (EXP)`) || selectedCertifications.includes(`${cert} (Experimentado)`) ? "selected" : ""}>EXP</option></select></label>`).join("")}</div></div>
    <div class="field full choice-field"><label>Especializaciones</label><div class="check-grid">${checklist("especializaciones", specializations, selectedSpecializations)}</div></div>
    <div class="field full"><label>Estado</label><select name="estado">${["Activo","Tiempo Partido","Inactivo"].map(value => `<option ${employee?.estado === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
  </div>
  <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button class="primary">${editing ? "Guardar cambios" : "Añadir profesional"}</button></div>
`, f => {
      const employeeCertifications = f.getAll("certificaciones");
      ["aqua", "mine", "mount"].forEach(key => {
        const level = f.get(`nivel-${key}`);
        if (level) employeeCertifications.push(`${key[0].toUpperCase()}${key.slice(1)} (${level})`);
      });
      const updated = {id: employee?.id || Date.now(), nombre:f.get("nombre").trim(), discord:f.get("discord").trim(), categoria:f.get("categoria"), rango:f.get("rango"), placa:f.get("placa"), ultimoAscenso:f.get("ultimoAscenso"), certificaciones:employeeCertifications, especializaciones:f.getAll("especializaciones"), turno:employee?.turno || "", estado:f.get("estado"), foto:employee?.foto || ""};
      if (editing) employees[employees.findIndex(item => item.id === employee.id)] = updated;
      else employees.push(updated);
      save(); closeModal(); render();
  });
  const updatePlates = (category, rank, preferredPlate = "") => {
    const options = availablePlatesFor(category, rank, employees, employee);
    const placeholder = !rank ? "Selecciona primero un rango" : options.length ? "Sin placa" : "No hay placas libres para este rango";
    $("placa").innerHTML = `<option value="">${placeholder}</option>${options.map(plate => `<option value="${plate.numero}">${plate.numero}</option>`).join("")}`;
    $("placa").value = options.some(plate => plate.numero === preferredPlate) ? preferredPlate : options[0]?.numero || "";
  };
  const updateRanks = (category, selectedRank = "", preferredPlate = "") => {
    const ranks = ranksByCategory[category] || [];
    $("rango").innerHTML = `<option value="">Selecciona un rango</option>${ranks.map(rank => `<option value="${escapeHtml(rank)}" ${rank === selectedRank ? "selected" : ""}>${escapeHtml(rank)}</option>`).join("")}`;
    updatePlates(category, selectedRank, preferredPlate);
  };
  $("categoria").addEventListener("change", () => updateRanks($("categoria").value));
  $("rango").addEventListener("change", () => updatePlates($("categoria").value, $("rango").value));
  updateRanks(categoryValue, employee?.rango, employee?.placa);
}

$("plantilla").addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    const employeeIndex = activeEmployees().findIndex(item => String(item.id) === deleteButton.dataset.delete);
    if (employeeIndex === -1) return;
    const employee = activeEmployees()[employeeIndex];
    const confirmed = window.confirm(`¿Eliminar la ficha de ${employee.nombre}? Se conservarán sus registros de ausencias, sanciones y observaciones.`);
    if (!confirmed) return;
    data.empleados.splice(employeeIndex, 1);
    save();
    render();
    return;
  }

  const button = event.target.closest("[data-edit]");
  if (!button) return;
  const employee = activeEmployees().find(item => String(item.id) === button.dataset.edit);
  if (employee) openEmployeeModal(employee);
});

$("btn-nueva-ausencia").onclick = () => {
  const options = data.empleados.map(e => `<option>${escapeHtml(e.nombre)}</option>`).join("");
  openModal("Registrar ausencia", `
    <div class="form-grid">
      <div class="field full"><label>Trabajador</label><select name="empleado" required>${options}</select></div>
      <div class="field"><label>Desde</label><input type="date" name="desde" required></div>
      <div class="field"><label>Hasta</label><input type="date" name="hasta" required></div>
      <div class="field"><label>Tipo</label><select name="tipo"><option>Ausencia justificada</option><option>Ausencia sin justificar</option></select></div>
      <div class="field full"><label>Motivo</label><textarea name="motivo" required placeholder="Indica el motivo o referencia interna"></textarea></div>
      <div class="field"><label>Estado</label><select name="estado"><option>Activa</option><option>Finalizada</option></select></div>
    </div>
    <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div>
  `, f => {
    if (f.get("hasta") < f.get("desde")) return alert("La fecha de fin no puede ser anterior a la fecha de inicio.");
    data.ausencias.push({id:Date.now(), empleado:f.get("empleado"), desde:f.get("desde"), hasta:f.get("hasta"), tipo:f.get("tipo"), motivo:f.get("motivo").trim(), estado:f.get("estado")});
    save(); closeModal(); render();
  });
};

$("btn-nueva-incidencia").onclick = () => {
  const options = data.empleados.map(e => `<option>${escapeHtml(e.nombre)}</option>`).join("");
  openModal("Nueva incidencia", `
    <div class="form-grid">
      <div class="field full"><label>Trabajador</label><select name="empleado" required>${options}</select></div>
      <div class="field"><label>Fecha</label><input type="date" name="fecha" required></div>
      <div class="field"><label>Tipo</label><select id="tipo-sancion" name="tipo"><option>Aviso</option><option>Falta</option><option>Suspensión</option></select></div>
      <div class="field full"><label>Motivo / descripción</label><textarea name="descripcion" required placeholder="Describe brevemente la incidencia"></textarea></div>
    </div>
    <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button class="primary">Guardar</button></div>
  `, f => {
    data.incidencias.push({id:Date.now(), empleado:f.get("empleado"), fecha:f.get("fecha"), tipo:f.get("tipo"), descripcion:f.get("descripcion"), archivada:false});
    save(); closeModal(); render();
  });
  const typeSelect = $("tipo-sancion");
  const updateTypeColor = () => {
    typeSelect.className = `sanction-type-select sanction-type-${sanctionTypeClass(typeSelect.value)}`;
  };
  typeSelect.addEventListener("change", updateTypeColor);
  updateTypeColor();
};

$("filtrar-sanciones").addEventListener("change", render);
$("tabla-incidencias").addEventListener("click", event => {
  const button = event.target.closest("[data-toggle-archive]");
  if (!button) return;
  const incident = data.incidencias.find(item => String(item.id) === button.dataset.toggleArchive);
  if (!incident) return;
  incident.archivada = !incident.archivada;
  save();
  render();
});

$("btn-nueva-observacion").onclick = () => {
  const options = data.empleados.map(employee => `<option>${escapeHtml(employee.nombre)}</option>`).join("");
  openModal("Nueva nota de seguimiento", `
    <div class="form-grid">
      <div class="field full"><label>Profesional</label><select name="empleado" required>${options}</select></div>
      <div class="field"><label>Fecha</label><input type="date" name="fecha" required></div>
      <div class="field full"><label>Nota</label><textarea name="nota" required placeholder="Añade una observación para el seguimiento interno"></textarea></div>
    </div>
    <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button class="primary">Guardar nota</button></div>
  `, f => {
    data.observaciones.push({id:Date.now(),empleado:f.get("empleado"),fecha:f.get("fecha"),nota:f.get("nota").trim()});
    save(); closeModal(); render();
  });
};

$("buscar-empleado").addEventListener("input", filterEmployees);

function filterEmployees() {
  const query = $("buscar-empleado").value.toLowerCase();
  document.querySelectorAll("#employee-cards .employee-card").forEach(card => {
    card.classList.toggle("is-hidden", !card.textContent.toLowerCase().includes(query));
  });
}

function updateToday() {
  $("today").textContent = new Date().toLocaleDateString("es-ES", {weekday:"long", year:"numeric", month:"long", day:"numeric"});
}

function scheduleDailyRefresh() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  setTimeout(() => {
    updateToday();
    render();
    scheduleDailyRefresh();
  }, nextMidnight.getTime() - Date.now());
}

function showLogin(message) {
  serverAvailable = false;
  $("application").hidden = true;
  $("login-screen").hidden = false;
  $("login-message").textContent = message;
  data = {empleados:[],ausencias:[],incidencias:[],observaciones:[],placasCogidas:[],logosRango:{}};
  lastServerJson = null;
  render();
}

function showApplication() {
  $("login-screen").hidden = true;
  $("application").hidden = false;
  $("btn-cerrar-sesion").hidden = !hostedApp;
}

async function refreshSharedData() {
  if (pendingSaves || !$("modal").classList.contains("hidden")) return;
  try {
    const latest = await loadFromServer();
    const json = JSON.stringify(latest);
    if (latest && latest.empleados && json !== lastServerJson) {
      data = latest;
      normalizeData();
      lastServerJson = JSON.stringify(data);
      if (!hostedApp) localStorage.setItem("rrhhHospital", lastServerJson);
      render();
    }
  } catch (error) {
    if (hostedApp && (error.status === 401 || error.status === 403)) {
      showLogin(error.status === 403
        ? "Tu cuenta de Discord no tiene el rol necesario para acceder."
        : "Tu sesión ha caducado. Inicia sesión de nuevo para continuar.");
      return;
    }
    console.error("No se pudieron actualizar los datos compartidos.", error);
  }
}

async function start() {
  if (hostedApp) {
    try {
      const remote = await loadFromServer();
      if (remote && remote.empleados) data = remote;
      normalizeData();
      lastServerJson = JSON.stringify(data);
      showApplication();
      if (!remote || !remote.empleados) save();
      setInterval(refreshSharedData, 30000);
    } catch (error) {
      const access = new URLSearchParams(location.search).get("access");
      const message = access === "denied" || error.status === 403
        ? "Solo pueden entrar las personas del Discord indicado que tengan el rol autorizado."
        : error.status === 401 || access === "login"
          ? "Inicia sesión con Discord para comprobar que tienes acceso."
          : access === "error"
            ? "Discord no pudo completar el inicio de sesión. Inténtalo de nuevo."
          : "No se pudo verificar el acceso. Revisa la configuración de Netlify e inténtalo de nuevo.";
      showLogin(message);
      history.replaceState(null, "", location.pathname);
      if (error.status !== 401 && error.status !== 403) {
        console.error("No se pudo cargar la aplicación protegida.", error);
      }
    }
  } else {
    try {
      const remote = await loadFromServer();
      if (remote && remote.empleados) data = remote;
      normalizeData();
      lastServerJson = JSON.stringify(data);
      if (!remote || !remote.empleados) save();
      setInterval(refreshSharedData, 10000);
    } catch {
      serverAvailable = false;
    }
    showApplication();
  }
  updateToday();
  if (!$("application").hidden) {
    render();
    scheduleDailyRefresh();
  }
}
start();

document.getElementById("btn-cerrar-sesion").addEventListener("click", () => {
  location.href = "/.netlify/functions/auth?action=logout";
});
