// Mapping colonne del foglio "Facebook Ads" (Meta Lead Ads via automazione esterna)
// A=0 id, B=1 created_time, ... M=12 che_evento_vuoi_organizzare?, N=13 quante_persone_indicativamente?,
// O=14 full_name, P=15 phone_number, Q=16 lead_status (di Meta), R=17 Stato CRM, S=18 Data Lavorazione
const META_COL = {
    data: 1,
    tipoEvento: 12,
    nPersone: 13,
    nome: 14,
    tel: 15,
    stato: 17,
    lavorazione: 18
};

// Note e Prezzo sono gestiti solo lato CRM (localStorage), non sul foglio Google
const CRM_DETAILS_KEY = 'crm_lead_details';

function loadCrmDetails() {
    try { return JSON.parse(localStorage.getItem(CRM_DETAILS_KEY)) || {}; } catch(e) { return {}; }
}

function saveCrmDetails(details) {
    try { localStorage.setItem(CRM_DETAILS_KEY, JSON.stringify(details)); } catch(e) {}
}

function crmDetailKey(source, rowId) {
    return `${source}_${rowId}`;
}

function getCrmDetail(source, rowId) {
    const details = loadCrmDetails();
    return details[crmDetailKey(source, rowId)] || { note: '', prezzo: '' };
}

function setCrmDetail(source, rowId, patch) {
    const details = loadCrmDetails();
    const key = crmDetailKey(source, rowId);
    details[key] = { ...(details[key] || { note: '', prezzo: '' }), ...patch };
    saveCrmDetails(details);
}

let rawBySource = { facebook: [], compleanni: [], eventi: [], chiamate: [] };
let currentSource = 'tutti';
let rawLeads = [];
let allLeads = [];
const SOURCE_LABELS = { facebook: 'Eventi Piscina', compleanni: 'Compleanno Bimbi', eventi: 'Eventi Privati/Aziendali', chiamate: 'Chiamate' };
const HEADERS_DEFAULT = ["Data", "Nome Completo", "Telefono", "Tipo Evento", "N° Persone", "Stato", "Note", "Prezzo"];
const HEADERS_TUTTI = ["Data", "Nome Completo", "Telefono", "Tipo Evento", "N° Persone", "Origine", "Stato", "Note", "Prezzo"];
let currentHeaders = HEADERS_TUTTI;
let chartInstances = {};
let currentStats = {};
let applyActiveFilters = null;


document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    fetchData();
    initNavigation();
    initFilters();
    initLeadTabs();
    initChiamataModal();
    toggleAddChiamataButton();

    setInterval(fetchData, 300000);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const btn = document.getElementById('refreshBtn');
        if (btn.disabled) return;
        btn.disabled = true;
        fetchData().finally(() => { setTimeout(() => { btn.disabled = false; }, 30000); });
    });
  document.getElementById('exportBtn').addEventListener('click', exportExcel);
});

async function fetchData() {
    try {
        const resp = await fetch('/api/leads/all-data');
        if (!resp.ok) throw new Error('API Error: ' + resp.status);
        const data = await resp.json();
        processAllData(data);
        saveToLocalStorage(data);
        updateStatusIndicator(true);
        showToast('Dati sincronizzati');
    } catch (err) {
        console.error(err);
        updateStatusIndicator(false);
        showToast('Dati offline', 'error');
    }
}

function updateStatusIndicator(isOnline) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    if (isOnline) {
        el.textContent = '● Sincronizzato';
        el.style.color = 'var(--accent-success)';
    } else {
        el.textContent = '● Dati offline';
        el.style.color = 'var(--accent-warning)';
    }
}

function processAllData(data) {
    if (!data) return;

    const stripHeader = (rows) => (Array.isArray(rows) && rows.length > 1) ? rows.slice(1) : [];

    rawBySource.facebook = stripHeader(data.facebookLeads);
    rawBySource.compleanni = stripHeader(data.compleanniLeads);
    rawBySource.eventi = stripHeader(data.eventiLeads);
    rawBySource.chiamate = stripHeader(data.chiamateLeads);

    const stats = data.stats || {};
    const config = data.config || {};

    currentStats = stats;
    updateTableStructure();
    if (applyActiveFilters) applyActiveFilters();
    renderStatsCards(stats);
    renderAnalyticsStats(stats);
    renderChartsWithRealData();
    renderSettings(config);
}

function initLeadTabs() {
    document.querySelectorAll('.lead-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentSource = tab.dataset.source;
            document.querySelectorAll('.lead-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            updateTableStructure();
            if (applyActiveFilters) applyActiveFilters();
            renderStatsCards(currentStats);
            renderAnalyticsStats(currentStats);
            renderChartsWithRealData();
            toggleAddChiamataButton();
        });
    });
}

function toggleAddChiamataButton() {
    const btn = document.getElementById('addChiamataBtn');
    if (btn) btn.style.display = currentSource === 'chiamate' ? 'inline-flex' : 'none';
}

function initChiamataModal() {
    const modal = document.getElementById('chiamataModal');
    const form = document.getElementById('chiamataForm');
    const openBtn = document.getElementById('addChiamataBtn');
    const closeBtn = document.getElementById('closeChiamataModal');
    const cancelBtn = document.getElementById('cancelChiamataBtn');
    const submitBtn = document.getElementById('submitChiamataBtn');
    if (!modal || !form || !openBtn) return;

    const closeModal = () => {
        modal.style.display = 'none';
        form.reset();
    };

    openBtn.addEventListener('click', () => {
        const dataInput = document.getElementById('chiamataData');
        if (dataInput && !dataInput.value) {
            dataInput.value = new Date().toISOString().slice(0, 10);
        }
        modal.style.display = 'flex';
    });
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvataggio...';

        try {
            const prezzo = document.getElementById('chiamataPrezzo').value.trim();

            const res = await fetch('/api/leads/chiamate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: document.getElementById('chiamataNome').value,
                    data: document.getElementById('chiamataData').value,
                    tipoEvento: document.getElementById('chiamataTipoEvento').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore durante il salvataggio.');

            closeModal();
            showToast('Lead aggiunto con successo');
            await fetchData();

            // Il prezzo è gestito lato CRM (localStorage, come per gli altri lead):
            // la nuova riga è l'ultima del foglio "Chiamate" appena ricaricato.
            if (prezzo) {
                const newRowIndex = rawBySource.chiamate.length + 1;
                setCrmDetail('chiamate', newRowIndex, { prezzo });
                updateTableStructure();
                if (applyActiveFilters) applyActiveFilters();
            }
        } catch (err) {
            showToast(err.message || 'Errore durante il salvataggio.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Salva Lead';
        }
    });
}

function saveToLocalStorage(data) {
    try { localStorage.setItem('crm_cache', JSON.stringify(data)); } catch(e) {}
}

function loadFromLocalStorage() {
    try {
        const cached = localStorage.getItem('crm_cache');
        if (cached) processAllData(JSON.parse(cached));
    } catch(e) {}
}

function robustParseDate(dateStr) {
    if (!dateStr || dateStr === '-' || typeof dateStr !== 'string') return null;
    try {
        // Formato italiano DD/MM/YYYY HH:MM:SS
        if (dateStr.includes('/')) {
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('/');
            const d = parseInt(dateParts[0], 10);
            const m = parseInt(dateParts[1], 10) - 1;
            const y = parseInt(dateParts[2], 10);
            
            if (parts.length > 1) {
                const timeParts = parts[1].replace(/\./g, ':').split(':');
                const hh = parseInt(timeParts[0], 10) || 0;
                const mm = parseInt(timeParts[1], 10) || 0;
                const ss = parseInt(timeParts[2], 10) || 0;
                return new Date(y, m, d, hh, mm, ss);
            }
            return new Date(y, m, d);
        }
        // ISO format (Facebook)
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch(e) { return null; }
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    const d = robustParseDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('it-IT');
}

function statoIndex() {
    return currentHeaders.length - 3;
}

function noteIndex() {
    return currentHeaders.length - 2;
}

function prezzoIndex() {
    return currentHeaders.length - 1;
}

function updateTableStructure() {
    if (currentSource === 'tutti') {
        currentHeaders = HEADERS_TUTTI;
        allLeads = ['facebook', 'compleanni', 'eventi', 'chiamate'].flatMap(source =>
            (rawBySource[source] || []).map((row, i) => mapMetaLead(row, i + 2, source, true))
        );
    } else {
        currentHeaders = HEADERS_DEFAULT;
        rawLeads = rawBySource[currentSource] || [];
        allLeads = rawLeads.map((row, i) => mapMetaLead(row, i + 2, currentSource, false));
    }
    identifyDuplicates(allLeads);
    renderTableUnified(currentHeaders, allLeads);
}

// Converte una riga grezza del foglio Meta Lead Ads nella riga unificata usata dalla UI:
// [data, nome, telefono, tipoEvento, nPersone, (origine), stato, meta]
function mapMetaLead(row, rowIndex, source = 'facebook', includeOrigin = false) {
    const dataRaw = row[META_COL.data];
    let dataFormattata = '-';
    if (dataRaw) {
        const d = robustParseDate(dataRaw);
        dataFormattata = d ? d.toLocaleDateString('it-IT') : dataRaw;
    }

    let stato = row[META_COL.stato] || 'Nuovo';
    if (stato === '') stato = 'Nuovo';

    const crmDetail = getCrmDetail(source, rowIndex);
    const note = crmDetail.note || '';
    const prezzo = crmDetail.prezzo || '';

    // Il numero arriva dal foglio con prefisso "p:" (formato Meta)
    const tel = (row[META_COL.tel] || '-').replace(/^p:/, '');

    const baseRow = [
        dataFormattata,
        row[META_COL.nome] || '-',
        tel,
        row[META_COL.tipoEvento] || '-',
        row[META_COL.nPersone] || '-'
    ];
    if (includeOrigin) baseRow.push(SOURCE_LABELS[source] || source);
    baseRow.push(stato, note, prezzo);

    return [
        ...baseRow,
        {
            source,
            originalIndex: rowIndex,
            isDuplicate: false,
            dataInserimento: dataRaw,
            dataLavorazione: row[META_COL.lavorazione] || '-'
        }
    ];
}

function identifyDuplicates(leads) {
    const telMap = new Map();

    leads.forEach((lead, idx) => {
        const tel = (lead[2] || '-').replace(/\s/g, '');
        const meta = lead[lead.length - 1];

        if (tel !== '-' && telMap.has(tel)) {
            meta.isDuplicate = true;
            leads[telMap.get(tel)][leads[0].length - 1].isDuplicate = true;
        } else if (tel !== '-') {
            telMap.set(tel, idx);
        }
    });
}

function renderTableUnified(headers, leads) {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;

    if (!leads || leads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center">Nessun lead trovato</td></tr>`;
        return;
    }

    const statoIdx = headers.length - 3;
    const noteIdx = headers.length - 2;
    const prezzoIdx = headers.length - 1;

    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = '';

    leads.forEach(row => {
        const tr = document.createElement('tr');
        const meta = row[row.length - 1];

        if (meta.isDuplicate) tr.classList.add('row-duplicate');

        for (let i = 0; i < headers.length; i++) {
            const td = document.createElement('td');
            let val = row[i] || '-';

            if (i === 1 && meta.isDuplicate) {
                val = `<span class="duplicate-tag" title="Possibile duplicato">⚠️</span> ` + val;
            }

            if (i === statoIdx) {
                td.innerHTML = getStatusSelectHTML(meta.originalIndex, meta.source, val);
            } else if (i === noteIdx) {
                td.className = 'note-cell';
                td.appendChild(buildNoteCell(meta.originalIndex, meta.source, row[i] || ''));
            } else if (i === prezzoIdx) {
                td.className = 'prezzo-cell';
                td.appendChild(buildPrezzoCell(meta.originalIndex, meta.source, row[i] || '', row[statoIdx]));
            } else if (i === 1 && meta.isDuplicate) {
                td.innerHTML = val;
            } else {
                td.textContent = val;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });
}

function buildNoteCell(rowId, source, note) {
    const cleanNote = (note && note !== '-') ? note : '';
    const hasNote = cleanNote.trim() !== '';

    const wrap = document.createElement('div');
    wrap.className = 'note-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-btn' + (hasNote ? ' has-note' : '');
    btn.title = hasNote ? cleanNote : 'Aggiungi nota';
    btn.textContent = '📝';
    btn.dataset.value = cleanNote;
    btn.addEventListener('click', () => openNoteEditor(btn, rowId, source));

    wrap.appendChild(btn);
    return wrap;
}

let activeNotePopover = null;

function positionPopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const popW = popover.offsetWidth || 240;
    let left = rect.left;
    if (left + popW > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - popW - margin);
    }
    let top = rect.bottom + 4;
    const popH = popover.offsetHeight || 150;
    if (top + popH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popH - 4);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

function openNoteEditor(btn, rowId, source) {
    if (activeNotePopover) {
        const wasSameBtn = activeNotePopover.btn === btn;
        activeNotePopover.close();
        if (wasSameBtn) return;
    }

    const popover = document.createElement('div');
    popover.className = 'note-popover';

    const ta = document.createElement('textarea');
    ta.placeholder = 'Scrivi una nota...';
    ta.value = btn.dataset.value || '';

    const actions = document.createElement('div');
    actions.className = 'note-popover-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'note-save-btn';
    saveBtn.textContent = 'Salva';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'note-cancel-btn';
    cancelBtn.textContent = 'Annulla';

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    popover.appendChild(ta);
    popover.appendChild(actions);
    document.body.appendChild(popover);
    positionPopover(popover, btn);
    ta.focus();

    const reposition = () => positionPopover(popover, btn);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    const close = () => {
        window.removeEventListener('resize', reposition);
        window.removeEventListener('scroll', reposition, true);
        document.removeEventListener('mousedown', onOutsideClick, true);
        popover.remove();
        if (activeNotePopover && activeNotePopover.popover === popover) activeNotePopover = null;
    };

    const onOutsideClick = (e) => {
        if (!popover.contains(e.target) && e.target !== btn) close();
    };
    document.addEventListener('mousedown', onOutsideClick, true);

    activeNotePopover = { popover, btn, close };

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', async () => {
        const value = ta.value;
        const ok = await saveLeadDetails(rowId, source, { note: value });
        if (ok) {
            const hasNote = value.trim() !== '';
            btn.dataset.value = value;
            btn.classList.toggle('has-note', hasNote);
            btn.title = hasNote ? value : 'Aggiungi nota';
        }
        close();
    });
}

function buildPrezzoCell(rowId, source, prezzo, stato) {
    const isChiuso = stato === 'Convertito';
    const value = (prezzo && prezzo !== '-') ? prezzo : '';

    const wrap = document.createElement('div');
    wrap.className = 'prezzo-wrap' + (isChiuso ? ' prezzo-chiuso' : '');

    const currency = document.createElement('span');
    currency.className = 'prezzo-currency';
    currency.textContent = '€';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.className = 'prezzo-input';
    input.placeholder = '0';
    input.value = value;

    const persist = async () => {
        const ok = await saveLeadDetails(rowId, source, { prezzo: input.value });
        wrap.classList.toggle('prezzo-saved', ok);
        if (ok) setTimeout(() => wrap.classList.remove('prezzo-saved'), 1200);
    };
    input.addEventListener('change', persist);

    wrap.appendChild(currency);
    wrap.appendChild(input);
    return wrap;
}

async function saveLeadDetails(rowId, source, payload) {
    setCrmDetail(source, rowId, payload);
    showToast('Salvato');
    return true;
}

function getStatusSelectHTML(rowId, source, currentStatus) {
    const options = ["Nuovo", "In Valutazione", "Chiamato ma non interessato", "Convertito", "Non Convertito"];
    const cls = getBadgeClass(currentStatus);
    let html = `<select onchange="updateStatus(${rowId}, this.value, '${source}')" class="status-select-badge ${cls}">`;
    options.forEach(opt => html += `<option value="${opt}" ${currentStatus === opt ? 'selected' : ''}>${opt}</option>`);
    html += `</select>`;
    return html;
}

async function updateStatus(rowId, newStatus, source) {
    try {
        const resp = await fetch(`/api/leads/${rowId}/status?source=${source}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (resp.ok) {
            showToast('Stato salvato');
            fetchData();
            return true;
        } else {
            const errorData = await resp.json().catch(() => ({}));
            const msg = errorData.error || 'Errore permessi Google Sheets';
            showToast(`${msg}. Verifica che crm-aletheia@crm-aletheia.iam.gserviceaccount.com sia Editor del foglio.`, 'error');
            return false;
        }
    } catch(e) { 
        showToast('Errore di rete', 'error'); 
        return false;
    }
}

function computeTopTipoEvento() {
    const counts = {};
    allLeads.forEach(row => {
        const tipo = row[3];
        if (tipo && tipo !== '-') counts[tipo] = (counts[tipo] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? `${entries[0][0]} (${entries[0][1]})` : 'Nessuno';
}

function renderStatsCards(stats) {
    if (!document.getElementById('stat-total')) return;

    const parseDate = robustParseDate;

    const totalElement = document.getElementById('stat-total');
    if (totalElement) totalElement.innerText = allLeads.length || 0;

    const oggi = new Date();
    const setteGiorniFa = new Date();
    setteGiorniFa.setDate(oggi.getDate() - 7);

    let newLeadsCount = 0;
    allLeads.forEach(row => {
        const leadDate = parseDate(row[0]);
        if (leadDate && leadDate >= setteGiorniFa && leadDate <= oggi) newLeadsCount++;
    });

    const newElement = document.getElementById('stat-new');
    if (newElement) newElement.innerText = newLeadsCount;

    let convertedCount = 0;
    allLeads.forEach(row => { if (row[statoIndex()] === 'Convertito') convertedCount++; });

    const conversionRate = allLeads.length > 0 ? ((convertedCount / allLeads.length) * 100).toFixed(1) : 0;
    const convRateElement = document.getElementById('stat-conv-rate');
    if (convRateElement) convRateElement.innerText = conversionRate + '%';

    const topSourceElement = document.getElementById('stat-top-source');
    if (topSourceElement) topSourceElement.innerText = computeTopTipoEvento();
}

function renderAnalyticsStats(stats) {
    if (!document.getElementById('analytics-total')) return;

    const parseDate = robustParseDate;

    const totalElement = document.getElementById('analytics-total');
    if (totalElement) totalElement.innerText = allLeads.length || 0;

    let convertedCount = 0;
    allLeads.forEach(row => { if (row[statoIndex()] === 'Convertito') convertedCount++; });

    const conversionRate = allLeads.length > 0 ? ((convertedCount / allLeads.length) * 100).toFixed(1) : 0;
    const convElement = document.getElementById('analytics-conversion');
    if (convElement) convElement.innerText = conversionRate + '%';

    const oggi = new Date();
    const trentaGiorniFa = new Date();
    trentaGiorniFa.setDate(oggi.getDate() - 30);

    let last30Count = 0;
    allLeads.forEach(row => {
        const leadDate = parseDate(row[0]);
        if (leadDate && leadDate >= trentaGiorniFa && leadDate <= oggi) last30Count++;
    });

    const last30Element = document.getElementById('analytics-last30');
    if (last30Element) last30Element.innerText = last30Count;

    const topSourceElement = document.getElementById('analytics-top-source');
    if (topSourceElement) topSourceElement.innerText = computeTopTipoEvento();
}
function renderChartsWithRealData() {
    if (typeof Chart === 'undefined') return;
    
    // Calcola i lead per giorno della settimana (ultimi 7 giorni)
    const weekDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    const dailyLeads = [0, 0, 0, 0, 0, 0, 0];
    const oggi = new Date();
    const setteGiorniFa = new Date();
    setteGiorniFa.setDate(oggi.getDate() - 7);
    
    allLeads.forEach(row => {
        const dateStr = row[0];
        if (dateStr && dateStr !== '-') {
            const [day, month, year] = dateStr.split('/');
            const leadDate = new Date(year, month - 1, day);
            if (leadDate >= setteGiorniFa && leadDate <= oggi) {
                const dayOfWeek = leadDate.getDay();
                // Adatta per settimana italiana (Lunedì=0)
                const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                if (idx >= 0 && idx < 7) dailyLeads[idx]++;
            }
        }
    });
    
    // Calcola distribuzione per stato
    const statusMap = {};
    allLeads.forEach(row => {
        const stato = row[statoIndex()];
        if (stato && stato !== '-') {
            statusMap[stato] = (statusMap[stato] || 0) + 1;
        }
    });

    // Calcola distribuzione per tipo evento
    const courseMap = {};
    allLeads.forEach(row => {
        const tipoEvento = row[3];
        if (tipoEvento && tipoEvento !== '-') {
            courseMap[tipoEvento] = (courseMap[tipoEvento] || 0) + 1;
        }
    });

    // Calcola distribuzione per numero persone
    const nPersoneMap = {};
    allLeads.forEach(row => {
        const nPersone = row[4];
        if (nPersone && nPersone !== '-') {
            nPersoneMap[nPersone] = (nPersoneMap[nPersone] || 0) + 1;
        }
    });

    const destroyChart = (id) => { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } };
    const colors = ['#004f71', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

    // Grafico Andamento Lead
    destroyChart('chartVolume');
    const ctxVol = document.getElementById('chartVolume')?.getContext('2d');
    if (ctxVol) {
        chartInstances.chartVolume = new Chart(ctxVol, {
            type: 'line',
            data: {
                labels: weekDays,
                datasets: [{ label: 'Lead', data: dailyLeads, borderColor: '#004f71', backgroundColor: 'rgba(0, 79, 113, 0.1)', tension: 0.3, fill: true }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
        });
    }

    // Grafico Distribuzione per Stato
    destroyChart('chartStatus');
    const ctxStatus = document.getElementById('chartStatus')?.getContext('2d');
    if (ctxStatus && Object.keys(statusMap).length > 0) {
        chartInstances.chartStatus = new Chart(ctxStatus, {
            type: 'doughnut',
            data: { labels: Object.keys(statusMap), datasets: [{ data: Object.values(statusMap), backgroundColor: colors }] },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    }

    // Grafico Lead per Tipo Evento
    destroyChart('chartCourse');
    const ctxCourse = document.getElementById('chartCourse')?.getContext('2d');
    if (ctxCourse && Object.keys(courseMap).length > 0) {
        chartInstances.chartCourse = new Chart(ctxCourse, {
            type: 'bar',
            data: { labels: Object.keys(courseMap), datasets: [{ label: 'Lead', data: Object.values(courseMap), backgroundColor: '#004f71' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }

    // Grafico Lead per Numero Persone
    destroyChart('chartSede');
    const ctxSede = document.getElementById('chartSede')?.getContext('2d');
    if (ctxSede && Object.keys(nPersoneMap).length > 0) {
        chartInstances.chartSede = new Chart(ctxSede, {
            type: 'bar',
            data: { labels: Object.keys(nPersoneMap), datasets: [{ label: 'Lead', data: Object.values(nPersoneMap), backgroundColor: '#004f71' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
}
// Data di partenza fissa per il filtro lead: 22/07/2026
const DEFAULT_DATE_START = '2026-07-22';

// Data odierna (nel fuso dell'utente) in formato aaaa-mm-gg, per il campo <input type="date">
function todayAsDateInputValue() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function initFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const dateStart = document.getElementById('dateStart');
    const dateEnd = document.getElementById('dateEnd');
    const clearDateBtn = document.getElementById('clearDateRange');

    // Verifica elementi essenziali
    if (!searchInput || !statusFilter) {
        console.error('Elementi filtro non trovati');
        return;
    }

    if (dateStart && !dateStart.value) dateStart.value = DEFAULT_DATE_START;
    if (dateEnd && !dateEnd.value) dateEnd.value = todayAsDateInputValue();

    // Funzione per parsare data (gg/mm/aaaa oppure aaaa-mm-gg) in un oggetto Date confrontabile
    const parseDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        try {
            if (dateStr.includes('/')) {
                const [day, month, year] = dateStr.split('/');
                return new Date(year, month - 1, day);
            } else if (dateStr.includes('-')) {
                const [year, month, day] = dateStr.split('-');
                return new Date(year, month - 1, day);
            }
            return null;
        } catch(e) {
            return null;
        }
    };

    const filterLeads = () => {
        const searchText = searchInput.value.toLowerCase();
        const selectedStatus = statusFilter.value;
        const startDate = dateStart ? parseDate(dateStart.value) : null;
        const endDate = dateEnd ? parseDate(dateEnd.value) : null;

        const filtered = allLeads.filter(row => {
            // Filtro ricerca
            const rowText = row.join(' ').toLowerCase();
            const matchesSearch = searchText === '' || rowText.includes(searchText);

            // Filtro stato
            const stato = row[statoIndex()] || '';
            const matchesStatus = selectedStatus === 'Tutti' || stato === selectedStatus;

            // Filtro date (confronto reale su oggetti Date, non su stringhe)
            let matchesDate = true;
            const leadDate = parseDate(row[0]);

            if (startDate && leadDate && leadDate < startDate) {
                matchesDate = false;
            }

            if (endDate && leadDate && leadDate > endDate) {
                matchesDate = false;
            }

            return matchesSearch && matchesStatus && matchesDate;
        });

        renderTableUnified(currentHeaders, filtered);
    };

    applyActiveFilters = filterLeads;

    // Event listeners
    searchInput.addEventListener('input', filterLeads);
    statusFilter.addEventListener('change', filterLeads);

    if (dateStart) dateStart.addEventListener('change', filterLeads);
    if (dateEnd) dateEnd.addEventListener('change', filterLeads);

    // Reset date: torna alla data di partenza fissa, non a un campo vuoto
    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
            if (dateStart) dateStart.value = DEFAULT_DATE_START;
            if (dateEnd) dateEnd.value = todayAsDateInputValue();
            filterLeads();
        });
    }

    filterLeads();

    console.log('✅ Filtri inizializzati correttamente (calendario incluso)');
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.backgroundColor = type === 'error' ? '#ef4444' : '#00878e';
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

function getBadgeClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('nuovo')) return 'badge-nuovo';
    if (s.includes('chiamato')) return 'badge-chiamato';
    if (s.includes('non convertito')) return 'badge-perso';
    if (s.includes('convertito')) return 'badge-vinto';
    return 'badge-nuovo';
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            document.getElementById(`section-${section}`).style.display = 'block';
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function renderSettings(config) {
    if (!document.getElementById('cfg-spreadsheet-id')) return;
    document.getElementById('cfg-spreadsheet-id').innerText = config.spreadsheetId || 'N/A';
    document.getElementById('cfg-sheet-range').innerText = config.sheetRange || 'N/A';
    document.getElementById('cfg-client-email').innerText = config.serviceEmail || 'N/A';
}

function exportExcel() {
    console.log("Avvio esportazione Excel...");

    // 1. Controllo se la libreria XLSX esiste nell'HTML
    if (typeof XLSX === 'undefined') {
        alert("Errore: La libreria Excel non è caricata. Controlla di aver inserito lo script corretto nell'HTML.");
        return;
    }

    // 2. Trova la tabella corretta nel DOM
    const table = document.querySelector('.leads-table') || document.querySelector('table');
    
    if (!table || table.rows.length <= 1) {
        alert("Nessun dato presente in tabella da esportare.");
        return;
    }

    try {
        // 3. Cloniamo la tabella per non rovinare quella che vedi a schermo
        const tableClone = table.cloneNode(true);
        
        // 4. Trasformiamo le SELECT (Stato) in testo semplice
        // Excel non legge i menu a tendina, quindi prendiamo il valore selezionato
        const originalSelects = table.querySelectorAll('select');
        const cloneSelects = tableClone.querySelectorAll('select');

        cloneSelects.forEach((select, index) => {
            const val = originalSelects[index].value;
            const parent = select.parentElement;
            parent.textContent = val || "Nuovo";
        });

        // Trasformiamo gli input Prezzo in testo semplice
        const originalPrezzi = table.querySelectorAll('.prezzo-input');
        const clonePrezzi = tableClone.querySelectorAll('.prezzo-input');
        clonePrezzi.forEach((input, index) => {
            const val = originalPrezzi[index].value;
            input.closest('td').textContent = val ? `€ ${val}` : '';
        });

        // Trasformiamo le celle Note in testo semplice
        const originalNoteCells = table.querySelectorAll('td.note-cell');
        const cloneNoteCells = tableClone.querySelectorAll('td.note-cell');
        cloneNoteCells.forEach((cell, index) => {
            const btn = originalNoteCells[index].querySelector('.note-btn');
            cell.textContent = btn ? btn.dataset.value || '' : '';
        });

        // 5. Creazione del file Excel (Workbook)
        // Usiamo raw: true per evitare che la libreria XLSX tenti di interpretare le date o altri numeri
        // Questo garantisce che quello che vedi in tabella (già formattato correttamente) finisca in Excel
        const wb = XLSX.utils.table_to_book(tableClone, { sheet: "Lista Lead", raw: true });
        
        // 6. Nome file con Data
        const date = new Date().toISOString().split('T')[0];
        const fileName = `Export_Leads_${date}.xlsx`;

        // 7. Download
        XLSX.writeFile(wb, fileName);
        
        console.log("Esportazione completata con successo.");
        if (typeof showToast === 'function') showToast('Excel scaricato!');

    } catch (err) {
        console.error("Errore durante l'export Excel:", err);
        alert("Errore tecnico durante la creazione del file.");
    }
}
