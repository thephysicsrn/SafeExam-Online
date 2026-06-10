import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, serverTimestamp, push, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// =========================================================
// ⚠️ COLE AQUI AS CHAVES DO SEU PROJETO FIREBASE ⚠️
// =========================================================
const firebaseConfig = {
    apiKey: "AIzaSyAsqcLzCS-ni-H13LPq4u_UyahuEVzszw8",
    authDomain: "sesi-2e0fc.firebaseapp.com",
    databaseURL: "https://sesi-2e0fc-default-rtdb.firebaseio.com",
    projectId: "sesi-2e0fc",
    storageBucket: "sesi-2e0fc.firebasestorage.app",
    messagingSenderId: "594607525814",
    appId: "1:594607525814:web:879453d129479a9d8afb17",
    measurementId: "G-MJ0Y81CVWV"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// =========================================
// STATE
// =========================================
const state = {
    sessionId: '',
    studentId: '',
    studentName: '',
    examUrl: '',
    localPassword: '', // Para desbloqueio offline
    isSecureMode: false,
    isFullscreen: false,
    isBlocked: false,
    isWindows: false,
    isBlockerConnected: false,
    wsConnection: null,
};

// =========================================
// DOM REFERENCES
// =========================================
const $ = (sel) => document.querySelector(sel);
const screens = {
    setup: $('#screen-setup'),
    dashLogin: $('#screen-dash-login'),
    dashboard: $('#screen-dashboard'),
    student: $('#screen-student'),
    exam: $('#screen-exam'),
};

// 1. Setup
const formSetup = $('#form-setup');
const generatedLinkArea = $('#generated-link-area');

// 2. Dash Login
const formDashLogin = $('#form-dash-login');

// 3. Dashboard
const studentsGrid = $('#students-grid');
const dashSessionId = $('#dash-session-id');

// 4. Student
const btnStartExam = $('#btn-start-exam');
const inputStudentName = $('#input-student-name');
const nativeBlockerArea = $('#native-blocker-area');
const blockerStatus = $('#blocker-status');

// 5. Exam
const examIframe = $('#exam-iframe');
const topbarStudentName = $('#topbar-student-name');
const overlayBlocked = $('#overlay-blocked');
const blockedReason = $('#blocked-reason');
const infractionLog = $('#infraction-log');
const overlayFullscreen = $('#overlay-fullscreen');

// =========================================
// ROTEAMENTO SIMPLES
// =========================================
function showScreen(screenKey) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[screenKey].classList.add('active');
}

function handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    
    if (window.location.hash === '#aplicador') {
        showScreen('dashLogin');
    } else if (mode === 'exam') {
        state.sessionId = params.get('session');
        state.examUrl = atob(params.get('url'));
        state.localPassword = params.get('key') ? atob(params.get('key')) : '';
        
        if (!state.sessionId || !state.examUrl) {
            alert('Link inválido!');
            return;
        }

        // Verifica Windows para exigir bloqueador
        state.isWindows = navigator.userAgent.toLowerCase().indexOf('windows') !== -1;
        if (state.isWindows) {
            nativeBlockerArea.style.display = 'block';
            btnStartExam.disabled = true;
            connectToBlocker();
        }

        showScreen('student');
    } else {
        showScreen('setup');
    }
}

window.addEventListener('hashchange', handleRoute);
handleRoute();

// =========================================
// TELA 1: SETUP DO APLICADOR
// =========================================
formSetup.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = $('#input-exam-url').value.trim();
    const pwd = $('#input-password').value;
    
    const btn = $('#btn-generate-link');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Conectando ao Firebase...';
    
    // Gera ID único pra sessão
    const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Cria a sessão no Firebase com timeout de 10s
    try {
        const sessionRef = ref(db, `safeexam_sessions/${sessionId}`);
        const createDocPromise = set(sessionRef, {
            createdAt: serverTimestamp(),
            examUrl: url
        });

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("TIMEOUT")), 10000)
        );

        await Promise.race([createDocPromise, timeoutPromise]);
        
        // Gera links
        const b64url = btoa(url);
        const b64pwd = btoa(pwd);
        const studentLink = `${window.location.origin}${window.location.pathname}?mode=exam&session=${sessionId}&url=${b64url}&key=${b64pwd}`;
        const dashLink = `${window.location.origin}${window.location.pathname}#aplicador`;

        $('#generated-link-input').value = studentLink;
        $('#generated-dash-input').value = dashLink;
        
        // Salva a senha localmente pro caso dele mesmo abrir o painel
        localStorage.setItem('last_dash_session', sessionId);
        
        generatedLinkArea.classList.remove('hidden');
        btn.textContent = 'Sala Criada com Sucesso!';
        btn.style.background = 'var(--success)';
        
    } catch (error) {
        if (error.message === "TIMEOUT") {
            alert("O Firebase demorou muito para responder. Verifique sua conexão ou regras do Realtime Database.");
        } else {
            alert("Erro ao criar sala. Verifique o console ou as regras de segurança do Firebase.");
        }
        console.error("Erro Firebase:", error);
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

$('#btn-copy-link').onclick = () => navigator.clipboard.writeText($('#generated-link-input').value);
$('#btn-copy-dash').onclick = () => navigator.clipboard.writeText($('#generated-dash-input').value);

$('#btn-open-dash').onclick = () => {
    window.location.hash = '#aplicador';
};

// =========================================
// TELA: LOGIN DO PAINEL
// =========================================
formDashLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    const sessionId = $('#input-dash-session').value.trim().toUpperCase();
    openDashboard(sessionId);
});

// Auto preencher se tiver no localStorage
if (localStorage.getItem('last_dash_session')) {
    $('#input-dash-session').value = localStorage.getItem('last_dash_session');
}

// =========================================
// TELA: DASHBOARD DO APLICADOR (TEMPO REAL)
// =========================================
function openDashboard(sessionId) {
    state.sessionId = sessionId;
    dashSessionId.textContent = sessionId;
    showScreen('dashboard');

    // Escuta todos os alunos desta sessão no Firebase
    const studentsRef = ref(db, `safeexam_sessions/${sessionId}/students`);
    
    onValue(studentsRef, (snapshot) => {
        studentsGrid.innerHTML = '';
        let activeCount = 0;
        let blockedCount = 0;
        
        const students = snapshot.val() || {};

        Object.keys(students).forEach((studentId) => {
            const student = students[studentId];
            
            if (student.status === 'active') activeCount++;
            if (student.status === 'blocked') blockedCount++;

            const card = document.createElement('div');
            card.className = `student-card ${student.status === 'blocked' ? 'blocked' : ''}`;
            
            const infractionsList = student.infractions ? Object.values(student.infractions) : [];
            const lastInfraction = infractionsList.length > 0 ? infractionsList[infractionsList.length - 1].reason : 'Nenhuma infração';

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-name">${student.name}</span>
                    <span class="card-status status-${student.status}">${student.status === 'active' ? 'Ativo' : 'Bloqueado'}</span>
                </div>
                <div class="card-infractions">Infrações: <strong>${infractionsList.length}</strong></div>
                ${student.status === 'blocked' ? `<div class="card-reason">${lastInfraction}</div>` : ''}
                <div class="card-actions" style="display: flex; gap: 8px; margin-top: 12px;">
                    ${student.status === 'blocked' ? `<button class="btn-unlock-remote" onclick="unlockStudentRemote('${studentId}')" style="flex: 1;">Desbloquear</button>` : ''}
                    <button class="btn-remove-student" onclick="removeStudentRemote('${studentId}')" style="flex: 1; padding: 10px; background: transparent; border: 1px solid var(--danger); color: var(--danger); border-radius: var(--radius-sm); cursor: pointer; font-weight: 600;">Remover</button>
                </div>
            `;
            studentsGrid.appendChild(card);
        });

        $('#stat-active').textContent = activeCount;
        $('#stat-blocked').textContent = blockedCount;
    });
}

// Função global para o botão remoto
window.unlockStudentRemote = async function(studentId) {
    try {
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${studentId}`);
        await update(studentRef, {
            status: 'active'
        });
    } catch (e) {
        alert("Erro ao desbloquear remotamente.");
    }
};

// Função global para remover aluno
window.removeStudentRemote = async function(studentId) {
    if (!confirm("Tem certeza que deseja remover este aluno da sala? Ele será desconectado e o trabalho pode ser perdido.")) return;
    
    try {
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${studentId}`);
        await remove(studentRef);
    } catch (e) {
        alert("Erro ao remover aluno.");
    }
};

// =========================================
// TELA DO ALUNO
// =========================================
btnStartExam.addEventListener('click', async () => {
    state.studentName = inputStudentName.value.trim();
    if (!state.studentName) {
        alert("Digite seu nome!");
        return;
    }
    
    btnStartExam.textContent = "Conectando...";
    btnStartExam.disabled = true;

    // Registra o aluno no Firebase
    try {
        // Verifica primeiro se já existe alguém com esse NOME exato no banco (ignora maiúsculas/minúsculas)
        const allStudentsRef = ref(db, `safeexam_sessions/${state.sessionId}/students`);
        const snapshot = await get(allStudentsRef);
        const students = snapshot.val() || {};
        
        let existingId = null;
        for (const id in students) {
            if (students[id].name.toLowerCase() === state.studentName.toLowerCase()) {
                existingId = id;
                break;
            }
        }
        
        if (existingId) {
            // Achou o nome! Reutiliza a sessão inteira do aluno, não importa o PC
            state.studentId = existingId;
        } else {
            // Tenta pegar da memória local ou cria um novo
            const savedIdKey = `safeexam_student_${state.sessionId}`;
            let studentId = localStorage.getItem(savedIdKey);
            if (!studentId) {
                studentId = Math.random().toString(36).substring(2, 9);
                localStorage.setItem(savedIdKey, studentId);
            }
            state.studentId = studentId;
        }

        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
        
        await update(studentRef, {
            name: state.studentName,
            status: 'active',
            lastPing: serverTimestamp()
        });
        
        startSecureExam();
        
        // Fica escutando o próprio documento para saber se foi desbloqueado ou removido remotamente
        onValue(studentRef, (snapshot) => {
            const data = snapshot.val();
            
            // Se o dado ficou nulo, significa que o professor apagou esse aluno do banco
            if (!data) {
                alert("Você foi removido da sala pelo aplicador.");
                // Remove o ID salvo para não reutilizar ao recarregar
                localStorage.removeItem(`safeexam_student_${state.sessionId}`);
                window.location.reload();
                return;
            }
            
            if (data && data.status === 'active' && state.isBlocked) {
                // Professor desbloqueou remotamente!
                unblockExamLocal();
            }
        });

    } catch (error) {
        alert("Erro ao conectar à sala. Verifique a internet e tente novamente.");
        console.error(error);
        btnStartExam.textContent = "Entrar em Modo Seguro";
        btnStartExam.disabled = false;
    }
});

// =========================================
// LÓGICA DE SEGURANÇA E AMBIENTE (ALUNO)
// =========================================
function startSecureExam() {
    enterFullscreen();
    examIframe.src = state.examUrl;
    topbarStudentName.textContent = state.studentName;
    state.isSecureMode = true;
    document.body.classList.add('no-select');
    showScreen('exam');
    attachSecurityListeners();
}

function enterFullscreen() {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (rfs) {
        rfs.call(el).then(() => {
            state.isFullscreen = true;
            overlayFullscreen.classList.add('hidden');
        }).catch(err => console.warn(err));
    }
}

document.addEventListener('fullscreenchange', () => {
    state.isFullscreen = !!document.fullscreenElement;
    if (!state.isFullscreen && state.isSecureMode) {
        registerInfraction('Saiu do modo de tela cheia');
    }
});

$('#btn-reenter-fullscreen').addEventListener('click', enterFullscreen);

// Atalhos e Visibilidade
function attachSecurityListeners() {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('contextmenu', (e) => {
        if (!state.isSecureMode) return;
        e.preventDefault();
        registerInfraction('Botão direito desativado');
    }, true);
    
    document.addEventListener('visibilitychange', () => {
        if (state.isSecureMode && document.hidden) registerInfraction('Mudou de aba ou minimizou');
    });

    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (state.isSecureMode && !document.hasFocus()) registerInfraction('Janela perdeu o foco');
        }, 200);
    });

    window.addEventListener('beforeunload', (e) => {
        if (state.isSecureMode) e.returnValue = 'Sair encerrará a prova.';
    });
}

function onKeyDown(e) {
    if (!state.isSecureMode) return;
    const key = e.key?.toLowerCase();
    
    if (/^f\d+$/i.test(key) || 
        (e.ctrlKey || e.metaKey) || 
        (e.altKey && (key === 'tab' || key === 'f4')) || 
        key === 'printscreen' || key === 'escape') {
        
        e.preventDefault();
        e.stopPropagation();
        registerInfraction(`Atalho proibido bloqueado`);
    }
}

// =========================================
// REGISTRO DE INFRAÇÃO E BLOQUEIO (ALUNO)
// =========================================
async function registerInfraction(reason) {
    if (state.isBlocked) return; // Já tá bloqueado
    
    state.isBlocked = true;
    
    const time = new Date().toLocaleTimeString('pt-BR');
    
    // Atualiza Firebase
    try {
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
        const infractionsRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}/infractions`);
        
        await update(studentRef, { status: 'blocked' });
        await set(push(infractionsRef), { time, reason });
    } catch(e) { console.error("Erro salvando infração", e); }

    // Atualiza UI Local
    blockedReason.textContent = reason;
    overlayBlocked.classList.remove('hidden');
    overlayFullscreen.classList.add('hidden');
    $('#input-unlock-password').value = '';
    
    const li = document.createElement('li');
    li.textContent = `${time} - ${reason}`;
    infractionLog.appendChild(li);
    $('#infraction-count').textContent = parseInt($('#infraction-count').textContent) + 1;
}

// Desbloqueio Presencial
$('#form-unlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#input-unlock-password').value === state.localPassword) {
        // Atualiza Firebase pra active
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
        await update(studentRef, { status: 'active' });
        // unblockExamLocal() será chamado pelo onValue!
    } else {
        alert('Senha incorreta!');
    }
});

function unblockExamLocal() {
    state.isBlocked = false;
    overlayBlocked.classList.add('hidden');
    
    // Navegadores bloqueiam requestFullscreen sem clique direto do usuário.
    // Portanto, se ele não estiver em tela cheia, mostramos o aviso para ele clicar.
    if (!state.isFullscreen) {
        overlayFullscreen.classList.remove('hidden');
    }
}

// =========================================
// WEBSOCKET (BLOQUEADOR NATIVO WINDOWS)
// =========================================
function connectToBlocker() {
    if (state.wsConnection) return;

    blockerStatus.innerHTML = `<div class="status-dot" style="background: var(--warning); animation: blink 1s infinite;"></div><span>Aguardando execução do bloqueador...</span>`;

    try {
        const ws = new WebSocket('ws://127.0.0.1:8765');
        ws.onopen = () => {
            state.isBlockerConnected = true;
            state.wsConnection = ws;
            blockerStatus.innerHTML = `<div class="status-dot active" style="background: var(--success); animation: none;"></div><span style="color: var(--success);">Bloqueador conectado!</span>`;
            btnStartExam.disabled = false;
        };
        ws.onclose = () => {
            state.isBlockerConnected = false;
            state.wsConnection = null;
            btnStartExam.disabled = true;
            if (state.isSecureMode) registerInfraction('O bloqueador nativo foi fechado.');
            else if (state.isWindows) setTimeout(connectToBlocker, 2000);
        };
        ws.onerror = () => {};
    } catch (e) {
        setTimeout(connectToBlocker, 2000);
    }
}
