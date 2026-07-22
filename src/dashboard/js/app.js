let googleFormLeads = [];
let facebookLeads = [];
let allLeads = [];
let currentHeaders = [];
let currentSource = 'all';
let fbColMap = {};
let formColMap = {};
let chartInstances = {};
let currentStats = {};


document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    fetchData();
    initNavigation();
    initFilters();

    setInterval(fetchData, 300000);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        const btn = document.getElementById('refreshBtn');
        if (btn.disabled) return;
        btn.disabled = true;
        fetchData().finally(() => { setTimeout(() => { btn.disabled = false; }, 30000); });
    });
  document.getElementById('exportBtn').addEventListener('click', exportExcel);
    document.getElementById('sourceSelector').addEventListener('change', (e) => {
        currentSource = e.target.value;
        updateTableStructure();
    });
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

    const rawGoogleForm = data.googleFormLeads || [];
    const rawFacebook = data.facebookLeads || [];
    const stats = data.stats || {};
    const config = data.config || {};

        googleFormLeads = (Array.isArray(rawGoogleForm) && rawGoogleForm.length > 1) ? rawGoogleForm.slice(1) : [];
    facebookLeads = (Array.isArray(rawFacebook) && rawFacebook.length > 1) ? rawFacebook.slice(1) : [];

    formColMap = getGoogleFormColMap();
    fbColMap = getFacebookColMap();
    
    currentStats = stats;
    updateTableStructure();
    renderStatsCards(stats);
    renderAnalyticsStats(stats);
    renderChartsWithRealData();
    renderSettings(config);
    renderPipeline();
    

}

function getGoogleFormColMap() {
    return {
        data: 0, nome: [1, 2], email: 8, tel: 7,
        corso: [11, 12, 13], citta: 5, sede: 15, stato: 17, 
        occupazione: 10, lavorazione: 18
    };
}

function getFacebookColMap() {
    return {
        data: 1, nome: 15, email: 20, tel: 19,
        corso: [13], citta: 16, sede: 14, stato: 21, 
        occupazione: 12, lavorazione: 22
    };
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

function updateTableStructure() {
    if (currentSource === 'all') {
        const unifiedFb = facebookLeads.map((r, i) => mapToUnified(r, fbColMap, 'Facebook', i + 2));
        const unifiedForm = googleFormLeads.map((r, i) => mapToUnified(r, formColMap, 'Google Form', i + 2));
        allLeads = [...unifiedFb, ...unifiedForm].sort((a,b) => {
            const dateA = a[0].split('/').reverse().join('-');
            const dateB = b[0].split('/').reverse().join('-');
            return new Date(dateB) - new Date(dateA);
        });
        currentHeaders = ["Data", "Nome Completo", "Email", "Telefono", "Città", "Corso", "Sede", "Fonte", "Stato"];
        
        // Identifica duplicati
        identifyDuplicates(allLeads);
        
        renderTableUnified(currentHeaders, allLeads);
    } else if (currentSource === 'facebook') {
        renderTableFacebook();
    } else if (currentSource === 'googleform') {
        renderTableGoogleForm();
    }
}

function mapToUnified(row, map, source, rowIndex) {
    let nome = '-';
    if (Array.isArray(map.nome)) {
        const nomi = map.nome.map(idx => row[idx]).filter(v => v && v !== '');
        nome = nomi.join(' ') || '-';
    } else if (typeof map.nome === 'number') {
        nome = row[map.nome] || '-';
    }
    
    let corsi = '-';
    if (Array.isArray(map.corso)) {
        const corsiList = map.corso.map(idx => row[idx]).filter(v => v && v !== '' && v !== 'Nessuna');
        corsi = corsiList.join(', ') || '-';
    } else if (typeof map.corso === 'number') {
        corsi = row[map.corso] || '-';
    }
    
    const citta = row[map.citta] || '-';
    const sede = row[map.sede] || '-';
    let stato = row[map.stato] || 'Nuovo';
    if (stato === '' || stato === undefined) stato = 'Nuovo';
    
    let dataRaw = row[map.data];
    let dataFormattata = '-';
    if (dataRaw) {
        const d = robustParseDate(dataRaw);
        if (d) dataFormattata = d.toLocaleDateString('it-IT');
        else dataFormattata = dataRaw;
    }
    
    const dataLavorazione = row[map.lavorazione] || '-';
    
    return [
        dataFormattata, nome, row[map.email] || '-', row[map.tel] || '-',
        citta, corsi, sede, source, stato,
        { 
            source: source === 'Facebook' ? 'facebook' : 'googleform', 
            originalIndex: rowIndex, 
            occupazione: row[map.occupazione] || 'Non specificato',
            isDuplicate: false,
            dataInserimento: dataRaw,
            dataLavorazione: dataLavorazione
        }
    ];
}

function identifyDuplicates(leads) {
    const emailMap = new Map();
    const telMap = new Map();

    leads.forEach(lead => {
        const email = lead[2].toLowerCase();
        const tel = lead[3].replace(/\s/g, '');
        const meta = lead[lead.length - 1];

        if (email !== '-' && emailMap.has(email)) {
            meta.isDuplicate = true;
            leads[emailMap.get(email)][leads[0].length - 1].isDuplicate = true;
        } else if (email !== '-') {
            emailMap.set(email, leads.indexOf(lead));
        }

        if (tel !== '-' && telMap.has(tel)) {
            meta.isDuplicate = true;
            leads[telMap.get(tel)][leads[0].length - 1].isDuplicate = true;
        } else if (tel !== '-') {
            telMap.set(tel, leads.indexOf(lead));
        }
    });
}

function renderTableUnified(headers, leads) {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;
    
    if (!leads || leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">Nessun lead trovato</td></tr>';
        return;
    }
    
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
            
            if (i === 8) {
                td.innerHTML = getStatusSelectHTML(meta.originalIndex, meta.source, val);
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

function renderTableFacebook() {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;
    
    const headers = ["Data", "Nome", "Email", "Telefono", "Città", "Corso", "Sede", "Stato"];
    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = '';
    
    facebookLeads.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(row[fbColMap.data]) || '-'}</td>
            <td>${row[fbColMap.nome] || '-'}</td>
            <td>${row[fbColMap.email] || '-'}</td>
            <td>${row[fbColMap.tel] || '-'}</td>
            <td>${row[fbColMap.citta] || '-'}</td>
            <td>${row[fbColMap.corso] || '-'}</td>
            <td>${row[fbColMap.sede] || '-'}</td>
            <td>${getStatusSelectHTML(idx + 2, 'facebook', row[fbColMap.stato] || 'Nuovo')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTableGoogleForm() {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;
    
    const headers = ["Data", "Nome", "Cognome", "Email", "Telefono", "Città", "Corso", "Sede", "Stato"];
    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = '';
    
    googleFormLeads.forEach((row, idx) => {
        const nomeCompleto = `${row[1] || ''} ${row[2] || ''}`.trim() || '-';
        const corsi = [row[11], row[12], row[13]].filter(v => v && v !== '').join(', ') || '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(row[0]) || '-'}</td>
            <td>${row[1] || '-'}</td>
            <td>${row[2] || '-'}</td>
            <td>${row[8] || '-'}</td>
            <td>${row[7] || '-'}</td>
            <td>${row[5] || '-'}</td>
            <td>${corsi}</td>
            <td>${row[15] || '-'}</td>
            <td>${getStatusSelectHTML(idx + 2, 'googleform', row[17] || 'Nuovo')}</td>
        `;
        tbody.appendChild(tr);
    });
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

function renderStatsCards(stats) {
    if (!document.getElementById('stat-total')) return;
    
    // Funzione per parsare data in qualsiasi formato
    const parseDate = robustParseDate;
    
    // Totale lead
    const totalElement = document.getElementById('stat-total');
    if (totalElement) {
        totalElement.innerText = allLeads.length || 0;
    }
    
    // Nuovi lead ultimi 7 giorni
    const oggi = new Date();
    const setteGiorniFa = new Date();
    setteGiorniFa.setDate(oggi.getDate() - 7);
    
    let newLeadsCount = 0;
    let facebookLast7 = 0;
    let googleLast7 = 0;
    
    allLeads.forEach(row => {
        const dateStr = row[0];
        const fonte = row[7];
        const leadDate = parseDate(dateStr);
        
        if (leadDate && leadDate >= setteGiorniFa && leadDate <= oggi) {
            newLeadsCount++;
            if (fonte === 'Facebook') {
                facebookLast7++;
            } else if (fonte === 'Google Form') {
                googleLast7++;
            }
        }
    });
    
    console.log(`📊 Ultimi 7 giorni: Tot=${newLeadsCount}, Facebook=${facebookLast7}, Google=${googleLast7}`);
    
    const newElement = document.getElementById('stat-new');
    if (newElement) {
        newElement.innerText = newLeadsCount;
    }
    
    // Tasso conversione
    let convertedCount = 0;
    allLeads.forEach(row => {
        const stato = row[8];
        if (stato === 'Convertito') {
            convertedCount++;
        }
    });
    
    const conversionRate = allLeads.length > 0 ? ((convertedCount / allLeads.length) * 100).toFixed(1) : 0;
    const convRateElement = document.getElementById('stat-conv-rate');
    if (convRateElement) {
        convRateElement.innerText = conversionRate + '%';
    }
    
    // Fonte principale
    let facebookCount = 0;
    let googleFormCount = 0;
    
    allLeads.forEach(row => {
        const fonte = row[7];
        if (fonte === 'Facebook') {
            facebookCount++;
        } else if (fonte === 'Google Form') {
            googleFormCount++;
        }
    });
    
    let topSource = 'Nessuna';
    if (facebookCount > googleFormCount) {
        topSource = `Facebook (${facebookCount})`;
    } else if (googleFormCount > facebookCount) {
        topSource = `Google Form (${googleFormCount})`;
    } else if (facebookCount > 0 && googleFormCount > 0) {
        topSource = `Pari (${facebookCount} vs ${googleFormCount})`;
    } else if (facebookCount > 0) {
        topSource = `Facebook (${facebookCount})`;
    } else if (googleFormCount > 0) {
        topSource = `Google Form (${googleFormCount})`;
    }
    
    const topSourceElement = document.getElementById('stat-top-source');
    if (topSourceElement) {
        topSourceElement.innerText = topSource;
    }
}
function renderAnalyticsStats(stats) {
    if (!document.getElementById('analytics-total')) return;
    
    // Funzione per parsare data in qualsiasi formato
    const parseDate = robustParseDate;
    
    // Totale lead
    const totalElement = document.getElementById('analytics-total');
    if (totalElement) {
        totalElement.innerText = allLeads.length || 0;
    }
    
    // Tasso conversione
    let convertedCount = 0;
    allLeads.forEach(row => {
        const stato = row[8];
        if (stato === 'Convertito') {
            convertedCount++;
        }
    });
    
    const conversionRate = allLeads.length > 0 ? ((convertedCount / allLeads.length) * 100).toFixed(1) : 0;
    const convElement = document.getElementById('analytics-conversion');
    if (convElement) {
        convElement.innerText = conversionRate + '%';
    }
    
    // Lead ultimi 30 giorni
    const oggi = new Date();
    const trentaGiorniFa = new Date();
    trentaGiorniFa.setDate(oggi.getDate() - 30);
    
    let last30Count = 0;
    let facebookLast30 = 0;
    let googleLast30 = 0;
    
    allLeads.forEach(row => {
        const dateStr = row[0];
        const fonte = row[7];
        const leadDate = parseDate(dateStr);
        
        if (leadDate && leadDate >= trentaGiorniFa && leadDate <= oggi) {
            last30Count++;
            if (fonte === 'Facebook') {
                facebookLast30++;
            } else if (fonte === 'Google Form') {
                googleLast30++;
            }
        }
    });
    
    console.log(`📊 Ultimi 30 giorni: Tot=${last30Count}, Facebook=${facebookLast30}, Google=${googleLast30}`);
    
    const last30Element = document.getElementById('analytics-last30');
    if (last30Element) {
        last30Element.innerText = last30Count;
    }
    
    // Lead per fonte (top source)
    let facebookCount = 0;
    let googleFormCount = 0;
    
    allLeads.forEach(row => {
        const fonte = row[7];
        if (fonte === 'Facebook') {
            facebookCount++;
        } else if (fonte === 'Google Form') {
            googleFormCount++;
        }
    });
    
    let topSource = 'Nessuna';
    if (facebookCount > googleFormCount) {
        topSource = `Facebook (${facebookCount})`;
    } else if (googleFormCount > facebookCount) {
        topSource = `Google Form (${googleFormCount})`;
    } else if (facebookCount > 0 && googleFormCount > 0) {
        topSource = `Pari (${facebookCount} vs ${googleFormCount})`;
    } else if (facebookCount > 0) {
        topSource = `Facebook (${facebookCount})`;
    } else if (googleFormCount > 0) {
        topSource = `Google Form (${googleFormCount})`;
    }
    
    const topSourceElement = document.getElementById('analytics-top-source');
    if (topSourceElement) {
        topSourceElement.innerText = topSource;
    }
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
    
    // Calcola distribuzione per situazione occupazionale
    const occupationMap = {};
    allLeads.forEach(row => {
        const meta = row[row.length - 1];
        if (meta && meta.occupazione && meta.occupazione !== '-' && meta.occupazione !== 'Non specificato') {
            const occ = meta.occupazione;
            occupationMap[occ] = (occupationMap[occ] || 0) + 1;
        }
    });
    
    // Calcola distribuzione per stato
    const statusMap = {};
    allLeads.forEach(row => {
        const stato = row[8];
        if (stato && stato !== '-') {
            statusMap[stato] = (statusMap[stato] || 0) + 1;
        }
    });
    
    // Calcola distribuzione per fonte
    const sourceMap = {};
    allLeads.forEach(row => {
        const fonte = row[7];
        if (fonte && fonte !== '-') {
            sourceMap[fonte] = (sourceMap[fonte] || 0) + 1;
        }
    });
    
    // Calcola distribuzione per corso
    const courseMap = {};
    allLeads.forEach(row => {
        const corso = row[5];
        if (corso && corso !== '-') {
            const corsi = corso.split(', ');
            corsi.forEach(c => {
                if (c && c !== 'Nessuna') {
                    courseMap[c] = (courseMap[c] || 0) + 1;
                }
            });
        }
    });
    
    // Calcola distribuzione per sede
    const sedeMap = {};
    allLeads.forEach(row => {
        const sede = row[6];
        if (sede && sede !== '-') {
            sedeMap[sede] = (sedeMap[sede] || 0) + 1;
        }
    });
    
    const destroyChart = (id) => { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } };
    const colors = ['#00878e', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
    
    // Grafico Andamento Lead
    destroyChart('chartVolume');
    const ctxVol = document.getElementById('chartVolume')?.getContext('2d');
    if (ctxVol) {
        chartInstances.chartVolume = new Chart(ctxVol, {
            type: 'line',
            data: {
                labels: weekDays,
                datasets: [{ label: 'Lead', data: dailyLeads, borderColor: '#00878e', backgroundColor: 'rgba(0, 135, 142, 0.1)', tension: 0.3, fill: true }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
        });
    }
    
    // Grafico Lead per Fonte
    destroyChart('chartSource');
    const ctxSource = document.getElementById('chartSource')?.getContext('2d');
    if (ctxSource && Object.keys(sourceMap).length > 0) {
        chartInstances.chartSource = new Chart(ctxSource, {
            type: 'doughnut',
            data: { labels: Object.keys(sourceMap), datasets: [{ data: Object.values(sourceMap), backgroundColor: colors }] },
            options: { plugins: { legend: { position: 'bottom' } } }
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
    
    // Grafico Lead per Corso
    destroyChart('chartCourse');
    const ctxCourse = document.getElementById('chartCourse')?.getContext('2d');
    if (ctxCourse && Object.keys(courseMap).length > 0) {
        chartInstances.chartCourse = new Chart(ctxCourse, {
            type: 'bar',
            data: { labels: Object.keys(courseMap), datasets: [{ label: 'Lead', data: Object.values(courseMap), backgroundColor: '#00878e' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
    
    // Grafico Lead per Sede
    destroyChart('chartSede');
    const ctxSede = document.getElementById('chartSede')?.getContext('2d');
    if (ctxSede && Object.keys(sedeMap).length > 0) {
        chartInstances.chartSede = new Chart(ctxSede, {
            type: 'bar',
            data: { labels: Object.keys(sedeMap), datasets: [{ label: 'Lead', data: Object.values(sedeMap), backgroundColor: '#00878e' }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
    
    // Grafico Lead per Situazione Occupazionale
    destroyChart('chartOccupation');
    const ctxOcc = document.getElementById('chartOccupation')?.getContext('2d');
    if (ctxOcc) {
        const occLabels = Object.keys(occupationMap);
        const occData = Object.values(occupationMap);
        if (occLabels.length > 0) {
            chartInstances.chartOccupation = new Chart(ctxOcc, {
                type: 'bar',
                data: { labels: occLabels, datasets: [{ label: 'Lead', data: occData, backgroundColor: '#10b981' }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
            });
        } else {
            chartInstances.chartOccupation = new Chart(ctxOcc, {
                type: 'bar',
                data: { labels: ['Nessun dato'], datasets: [{ label: 'Lead', data: [0], backgroundColor: '#94a3b8' }] },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
    }
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
    
    // Funzione per parsare data in formato italiano DD/MM/YYYY
    const parseDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        try {
            if (dateStr.includes('/')) {
                const [day, month, year] = dateStr.split('/');
                return new Date(year, month - 1, day);
            } else if (dateStr.includes('-')) {
                return new Date(dateStr);
            }
            return null;
        } catch(e) {
            return null;
        }
    };
    
    // Funzione per formattare data input in DD/MM/YYYY per confronto
    const formatDateForCompare = (dateInput) => {
        if (!dateInput) return null;
        const [year, month, day] = dateInput.split('-');
        return `${day}/${month}/${year}`;
    };
    
    const filterLeads = () => {
        const searchText = searchInput.value.toLowerCase();
        const selectedStatus = statusFilter.value;
        const startDate = dateStart ? dateStart.value : '';
        const endDate = dateEnd ? dateEnd.value : '';
        
        const startDateFormatted = startDate ? formatDateForCompare(startDate) : null;
        const endDateFormatted = endDate ? formatDateForCompare(endDate) : null;
        
        const filtered = allLeads.filter(row => {
            // Filtro ricerca
            const rowText = row.join(' ').toLowerCase();
            const matchesSearch = searchText === '' || rowText.includes(searchText);
            
            // Filtro stato
            const stato = row[8] || '';
            const matchesStatus = selectedStatus === 'Tutti' || stato === selectedStatus;
            
            // Filtro date
            let matchesDate = true;
            const leadDate = row[0]; // Data in formato DD/MM/YYYY
            
            if (startDateFormatted && leadDate && leadDate !== '-') {
                if (startDateFormatted && leadDate < startDateFormatted) {
                    matchesDate = false;
                }
            }
            
            if (endDateFormatted && leadDate && leadDate !== '-') {
                if (endDateFormatted && leadDate > endDateFormatted) {
                    matchesDate = false;
                }
            }
            
            return matchesSearch && matchesStatus && matchesDate;
        });
        
        // Applica il filtro alla tabella
        if (currentSource === 'all') {
            renderTableUnified(currentHeaders, filtered);
        } else if (currentSource === 'facebook') {
            const filteredFacebook = facebookLeads.filter((row, idx) => {
                const dataRow = formatDate(row[fbColMap.data]);
                const stato = row[fbColMap.stato] || 'Nuovo';
                const searchTextLower = searchInput.value.toLowerCase();
                const rowText = Object.values(row).join(' ').toLowerCase();
                
                const matchesSearch = searchTextLower === '' || rowText.includes(searchTextLower);
                const matchesStatus = selectedStatus === 'Tutti' || stato === selectedStatus;
                
                let matchesDate = true;
                if (startDateFormatted && dataRow && dataRow !== '-') {
                    if (dataRow < startDateFormatted) matchesDate = false;
                }
                if (endDateFormatted && dataRow && dataRow !== '-') {
                    if (dataRow > endDateFormatted) matchesDate = false;
                }
                
                return matchesSearch && matchesStatus && matchesDate;
            });
            renderTableFacebookFiltered(filteredFacebook);
        } else if (currentSource === 'googleform') {
            const filteredForm = googleFormLeads.filter((row, idx) => {
                const dataRow = formatDate(row[0]);
                const stato = row[22] || 'Nuovo';
                const searchTextLower = searchInput.value.toLowerCase();
                const rowText = Object.values(row).join(' ').toLowerCase();
                
                const matchesSearch = searchTextLower === '' || rowText.includes(searchTextLower);
                const matchesStatus = selectedStatus === 'Tutti' || stato === selectedStatus;
                
                let matchesDate = true;
                if (startDateFormatted && dataRow && dataRow !== '-') {
                    if (dataRow < startDateFormatted) matchesDate = false;
                }
                if (endDateFormatted && dataRow && dataRow !== '-') {
                    if (dataRow > endDateFormatted) matchesDate = false;
                }
                
                return matchesSearch && matchesStatus && matchesDate;
            });
            renderTableGoogleFormFiltered(filteredForm);
        }
    };
    
    // Event listeners
    searchInput.addEventListener('input', filterLeads);
    statusFilter.addEventListener('change', filterLeads);
    
    if (dateStart) dateStart.addEventListener('change', filterLeads);
    if (dateEnd) dateEnd.addEventListener('change', filterLeads);
    
    // Reset date
    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
            if (dateStart) dateStart.value = '';
            if (dateEnd) dateEnd.value = '';
            filterLeads();
        });
    }
    
    console.log('✅ Filtri inizializzati correttamente (calendario incluso)');
}
// Funzioni helper per il rendering filtrato di Facebook
function renderTableFacebookFiltered(filteredData) {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;
    
    const headers = ["Data", "Nome", "Email", "Telefono", "Città", "Corso", "Sede", "Stato"];
    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = '';
    
    filteredData.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(row[fbColMap.data]) || '-'}</td>
            <td>${row[fbColMap.nome] || '-'}</td>
            <td>${row[fbColMap.email] || '-'}</td>
            <td>${row[fbColMap.tel] || '-'}</td>
            <td>${row[fbColMap.citta] || '-'}</td>
            <td>${row[fbColMap.corso] || '-'}</td>
            <td>${row[fbColMap.sede] || '-'}</td>
            <td>${getStatusSelectHTML(idx + 2, 'facebook', row[fbColMap.stato] || 'Nuovo')}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Funzioni helper per il rendering filtrato di Google Form
function renderTableGoogleFormFiltered(filteredData) {
    const thead = document.getElementById('leadsHeadFull');
    const tbody = document.getElementById('leadsBodyFull');
    if (!thead || !tbody) return;
    
    const headers = ["Data", "Nome", "Cognome", "Email", "Telefono", "Città", "Corso", "Sede", "Stato"];
    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    tbody.innerHTML = '';
    
    filteredData.forEach((row, idx) => {
        const nomeCompleto = `${row[1] || ''} ${row[2] || ''}`.trim() || '-';
        const corsi = [row[11], row[12], row[13]].filter(v => v && v !== '').join(', ') || '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(row[0]) || '-'}</td>
            <td>${row[1] || '-'}</td>
            <td>${row[2] || '-'}</td>
            <td>${row[8] || '-'}</td>
            <td>${row[7] || '-'}</td>
            <td>${row[5] || '-'}</td>
            <td>${corsi}</td>
            <td>${row[15] || '-'}</td>
            <td>${getStatusSelectHTML(idx + 2, 'googleform', row[17] || 'Nuovo')}</td>
        `;
        tbody.appendChild(tr);
    });
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
            
            if (section === 'pipeline') renderPipeline();
        });
    });

    const refreshPipelineBtn = document.getElementById('refreshPipelineBtn');
    if (refreshPipelineBtn) {
        refreshPipelineBtn.addEventListener('click', () => {
            showToast('Aggiornamento pipeline...');
            fetchData();
        });
    }

    const pipelineSearch = document.getElementById('pipelineSearch');
    if (pipelineSearch) {
        pipelineSearch.addEventListener('input', () => {
            renderPipeline();
        });
    }

    const exportPipelineBtn = document.getElementById('exportPipelineBtn');
    if (exportPipelineBtn) {
        exportPipelineBtn.addEventListener('click', exportPipelineExcel);
    }
}

function renderPipeline() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    // Mapping degli stati alle colonne
    const columns = {
        'Nuovo': document.getElementById('cards-nuovo'),
        'In Valutazione': document.getElementById('cards-valutazione'),
        'Chiamato ma non interessato': document.getElementById('cards-chiamato'),
        'Convertito': document.getElementById('cards-vinti'),
        'Non Convertito': document.getElementById('cards-persi'),
        // Fallback per vecchi stati
        'Colloquio': document.getElementById('cards-chiamato'),
        'Chiamato - Interessato': document.getElementById('cards-vinti'),
        'Chiamato - Non Confermata': document.getElementById('cards-chiamato'),
        'Non Interessato': document.getElementById('cards-persi'),
        'Non Raggiungibile': document.getElementById('cards-persi'),
        'Da Chiamare': document.getElementById('cards-nuovo'),
        'Screening': document.getElementById('cards-nuovo')
    };

    // Pulisci colonne
    const uniqueCols = new Set(Object.values(columns).filter(c => c));
    uniqueCols.forEach(col => {
        col.innerHTML = '';
    });

    // Reset counts nel DOM
    document.querySelectorAll('.kanban-column .count').forEach(el => el.textContent = '0');

    // Inizializza contatori interni
    const counts = { 
        'Nuovo': 0, 
        'In Valutazione': 0,
        'Chiamato ma non interessato': 0, 
        'Convertito': 0, 
        'Non Convertito': 0 
    };

    if (!allLeads || allLeads.length === 0) {
        console.warn('⚠️ Nessun lead da visualizzare nella pipeline');
        return;
    }

    const searchVal = document.getElementById('pipelineSearch')?.value.toLowerCase() || '';

    allLeads.forEach(lead => {
        const nome = lead[1].toLowerCase();
        const email = lead[2].toLowerCase();
        const tel = lead[3].toLowerCase();
        
        // Filtro ricerca
        if (searchVal && !nome.includes(searchVal) && !email.includes(searchVal) && !tel.includes(searchVal)) {
            return;
        }

        const stato = lead[8] || 'Nuovo';
        const targetCol = columns[stato] || columns['Nuovo']; // Fallback sui nuovi
        
        // Aggiorna contatori in base alla colonna di destinazione
        if (stato === 'Convertito' || stato === 'Chiamato - Interessato') {
            counts['Convertito']++;
        } else if (stato === 'Non Convertito' || stato === 'Non Interessato' || stato === 'Non Raggiungibile') {
            counts['Non Convertito']++;
        } else if (stato === 'Chiamato ma non interessato' || stato === 'Colloquio' || stato === 'Chiamato - Non Confermata') {
            counts['Chiamato ma non interessato']++;
        } else if (stato === 'In Valutazione') {
            counts['In Valutazione']++;
        } else {
            counts['Nuovo']++;
        }

        const card = createKanbanCard(lead);
        if (targetCol) targetCol.appendChild(card);
    });

    // Aggiorna contatori nel DOM
    Object.keys(counts).forEach(status => {
        const col = document.querySelector(`.kanban-column[data-status="${status}"]`);
        if (col) {
            const countEl = col.querySelector('.count');
            if (countEl) countEl.textContent = counts[status];
        }
    });
}

function createKanbanCard(lead) {
    const [data, nome, email, tel, citta, corso, sede, fonte, stato, meta] = lead;
    
    const card = document.createElement('div');
    card.className = 'kanban-card';
    if (meta.isDuplicate) card.classList.add('card-duplicate');
    
    card.setAttribute('draggable', 'true');
    
    const sourceClass = meta.source === 'facebook' ? 'source-facebook' : 'source-googleform';
    const indicators = `
        ${meta.isDuplicate ? '<span class="indicator-duplicate" title="Duplicato">⚠️</span>' : ''}
    `;
    
    card.innerHTML = `
        <div class="card-header-flex">
            <div class="card-title">${nome}</div>
            <div class="card-indicators">${indicators}</div>
        </div>
        <div class="card-info">
            <span>📞 ${tel}</span>
            <span>📍 ${sede || citta}</span>
            <span>🎓 ${corso}</span>
        </div>
        <div class="card-footer">
            <span class="card-source ${sourceClass}">${fonte}</span>
            <span class="card-date">${data}</span>
        </div>
    `;
    
    // Aggiungi drag start event
    card.addEventListener('dragstart', (e) => {
        const dragData = {
            rowIndex: meta.originalIndex,
            source: meta.source,
            name: nome
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
    });
    
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
    });
    
    return card;
}

// Inizializzazione Drag and Drop per le colonne
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
});

function initDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');
    
    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', (e) => {
            // Evita flickering quando si passa sopra i figli
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');
            
            try {
                const dataStr = e.dataTransfer.getData('text/plain');
                if (!dataStr) return;
                
                const data = JSON.parse(dataStr);
                const newStatus = column.dataset.status;
                const card = document.querySelector('.kanban-card.dragging');
                
                if (newStatus && data.rowIndex) {
                    // Spostamento Ottimistico: muovi subito la card nel DOM
                    if (card) {
                        const targetCardsContainer = column.querySelector('.kanban-cards');
                        if (targetCardsContainer) targetCardsContainer.appendChild(card);
                    }

                    showToast(`Spostando ${data.name}...`);
                    
                    const success = await updateStatus(data.rowIndex, newStatus, data.source);
                    
                    if (!success) {
                        // Se fallisce, ricarica per ripristinare la posizione originale
                        fetchData();
                    }
                }
            } catch (err) {
                console.error('Errore durante il drop:', err);
                fetchData();
            }
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

        // 5. Creazione del file Excel (Workbook)
        // Usiamo raw: true per evitare che la libreria XLSX tenti di interpretare le date o altri numeri
        // Questo garantisce che quello che vedi in tabella (già formattato correttamente) finisca in Excel
        const wb = XLSX.utils.table_to_book(tableClone, { sheet: "Lista Lead", raw: true });
        
        // 6. Nome file con Data
        const date = new Date().toISOString().split('T')[0];
        const fileName = `Export_Leads_${currentSource}_${date}.xlsx`;

        // 7. Download
        XLSX.writeFile(wb, fileName);
        
        console.log("Esportazione completata con successo.");
        if (typeof showToast === 'function') showToast('Excel scaricato!');

    } catch (err) {
        console.error("Errore durante l'export Excel:", err);
        alert("Errore tecnico durante la creazione del file.");
    }
}

function exportPipelineExcel() {
    console.log("Avvio esportazione Pipeline (solo lavorati)...");
    
    if (typeof XLSX === 'undefined') {
        alert("Libreria Excel non caricata.");
        return;
    }

    const searchVal = document.getElementById('pipelineSearch')?.value.toLowerCase() || '';
    
    const filteredLeads = allLeads.filter(lead => {
        const statoRaw = (lead[8] || '').toString().trim();
        const nome = lead[1].toLowerCase();
        const email = lead[2].toLowerCase();
        
        // WHITELIST: Esportiamo SOLO questi stati specifici
        const statiLavorati = [
            'In Valutazione', 
            'Chiamato ma non interessato', 
            'Convertito', 
            'Non Convertito'
        ];
        
        // Verifica se lo stato del lead è nella lista dei lavorati
        if (!statiLavorati.includes(statoRaw)) {
            return false;
        }
        
        // Rispetta comunque la ricerca attiva
        if (searchVal && !nome.includes(searchVal) && !email.includes(searchVal)) return false;
        
        return true;
    });

    if (filteredLeads.length === 0) {
        alert("Nessun lead lavorato da esportare.");
        return;
    }

    // Prepariamo i dati per Excel
    const excelData = filteredLeads.map(lead => {
        const meta = lead[lead.length - 1];
        return {
            "Data Inserimento": meta.dataInserimento || lead[0],
            "Data Lavorazione": meta.dataLavorazione || '-',
            "Nome Completo": lead[1],
            "Email": lead[2],
            "Telefono": lead[3],
            "Città": lead[4],
            "Corso": lead[5],
            "Sede": lead[6],
            "Fonte": lead[7],
            "Stato": lead[8]
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lead Lavorati");

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Pipeline_Lavorati_${date}.xlsx`);
    showToast('Excel Lavorati scaricato!');
}
