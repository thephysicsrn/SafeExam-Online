import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, serverTimestamp, push, get, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// =========================================================
// ⚠️ CONFIGURAÇÃO DO FIREBASE ⚠️
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
// UTILITÁRIOS DE CRIPTOGRAFIA (SHA-256)
// =========================================
async function sha256(message) {
    if (!message) return '';
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeExamUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    // Formatação automática para formulários do Google (modo embed)
    if (url.includes('docs.google.com/forms') && !url.includes('embedded=true')) {
        url += (url.includes('?') ? '&' : '?') + 'embedded=true';
    }
    return url;
}

// =========================================
// CONFIGURAÇÕES GLOBAIS (ADMIN)
// =========================================
let globalSettings = {
    requireBlocker: true,
    masterPassword: 'MateusSesi'
};

onValue(ref(db, 'admin_settings'), (snap) => {
    const data = snap.val();
    if (data) {
        if (data.requireBlocker !== undefined) globalSettings.requireBlocker = data.requireBlocker;
        if (data.masterPassword) globalSettings.masterPassword = data.masterPassword;
    } else {
        set(ref(db, 'admin_settings'), {
            masterPassword: 'MateusSesi',
            requireBlocker: true
        });
    }
});

// =========================================
// ESTADO DA APLICAÇÃO
// =========================================
const state = {
    sessionId: '',
    studentId: '',
    studentName: '',
    examUrl: '',
    localPasswordHash: '', // Hash SHA-256 da senha da sala (seguro contra inspeção de URL)
    isSecureMode: false,
    isFullscreen: false,
    isBlocked: false,
    isWindows: false,
    isBlockerConnected: false,
    wsConnection: null,
};

// =========================================
// REFERÊNCIAS AO DOM
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
// ROTEAMENTO
// =========================================
function showScreen(screenKey) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    if (screens[screenKey]) {
        screens[screenKey].classList.add('active');
    }
}

function checkAdminHash() {
    const hash = window.location.hash;
    if (hash === '#admin') {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        const adminLoginScreen = document.getElementById('screen-admin-login');
        if (adminLoginScreen) adminLoginScreen.classList.add('active');
        return true;
    }
    return false;
}

function handleRoute() {
    if (checkAdminHash()) return;
    
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    
    if (window.location.hash === '#aplicador') {
        showScreen('dashLogin');
    } else if (mode === 'exam') {
        state.sessionId = (params.get('session') || '').toUpperCase();
        try {
            state.examUrl = params.get('url') ? atob(params.get('url')) : '';
        } catch (e) {
            state.examUrl = '';
        }
        
        if (!state.sessionId || !state.examUrl) {
            alert('Link de prova inválido ou incompleto!');
            showScreen('setup');
            return;
        }

        // Detecta Windows para sugerir/exigir bloqueador nativo
        state.isWindows = navigator.userAgent.toLowerCase().indexOf('windows') !== -1;
        if (state.isWindows && globalSettings.requireBlocker) {
            nativeBlockerArea.style.display = 'block';
            btnStartExam.disabled = true;
            connectToBlocker();
        } else {
            nativeBlockerArea.style.display = 'none';
            btnStartExam.disabled = false;
        }

        showScreen('student');
    } else {
        showScreen('setup');
    }
}

window.addEventListener('hashchange', handleRoute);
handleRoute();

// =========================================
// TELA: ADMIN LOGIN E DASHBOARD MASTER
// =========================================
document.getElementById('form-admin-login')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = document.getElementById('input-admin-password').value;
    
    if (pwd === globalSettings.masterPassword) {
        document.getElementById('screen-admin-login').classList.remove('active');
        document.getElementById('screen-admin-dashboard').classList.add('active');
        initAdminDashboard();
    } else {
        alert("Senha incorreta!");
    }
});

function initAdminDashboard() {
    const toggle = document.getElementById('toggle-require-blocker');
    if (toggle) {
        toggle.checked = globalSettings.requireBlocker;
        toggle.onchange = () => {
            update(ref(db, 'admin_settings'), { requireBlocker: toggle.checked });
        };
    }

    const btnSavePwd = document.getElementById('btn-save-master-pwd');
    if (btnSavePwd) {
        btnSavePwd.onclick = async () => {
            const newPwd = document.getElementById('input-new-master-pwd').value;
            if (newPwd.length < 4) return alert("Senha muito curta. Use pelo menos 4 caracteres.");
            await update(ref(db, 'admin_settings'), { masterPassword: newPwd });
            alert("Senha Master alterada com sucesso!");
            document.getElementById('input-new-master-pwd').value = '';
        };
    }

    onValue(ref(db, 'safeexam_sessions'), (snap) => {
        const sessions = snap.val() || {};
        const listEl = document.getElementById('admin-sessions-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        
        let hasActive = false;
        
        Object.keys(sessions).forEach(sessionId => {
            const sess = sessions[sessionId];
            if (sess.status === 'finished') return; 
            
            hasActive = true;
            const studentsCount = sess.students ? Object.keys(sess.students).length : 0;
            
            const card = document.createElement('div');
            card.style.cssText = 'background: var(--bg-card); padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;';
            card.innerHTML = `
                <div style="flex: 1;">
                    <h3 style="margin: 0; color: var(--text-primary);">${sess.roomName || 'Sem nome'} <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400;">(${sessionId})</span></h3>
                    <p style="margin: 5px 0 0 0; font-size: 0.9rem;" class="text-muted">Alunos: <strong>${studentsCount}</strong> &nbsp;|&nbsp; Senha: <strong id="pwd-display-${sessionId}">${sess.localPassword || '---'}</strong>
                        <button onclick="editSessionPassword('${sessionId}')" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.85rem; text-decoration: underline; margin-left: 6px;">alterar</button>
                    </p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn-primary" onclick="localStorage.setItem('last_dash_session', '${sessionId}'); window.open('#aplicador', '_blank')" style="background: transparent; border: 1px solid var(--primary); color: var(--primary); padding: 8px 15px;">Espiar Painel</button>
                    <button class="btn-primary" onclick="killSessionAdmin('${sessionId}')" style="background: var(--danger); border-color: var(--danger); padding: 8px 15px;">Derrubar Sala</button>
                </div>
            `;
            listEl.appendChild(card);
        });
        
        if (!hasActive) {
            listEl.innerHTML = '<p class="text-muted">Nenhuma sala ativa no momento.</p>';
        }
    });
}

window.killSessionAdmin = async function(sessionId) {
    if (confirm("Deseja DESTRUIR essa sala? Todos os alunos serão desconectados.")) {
        await update(ref(db, `safeexam_sessions/${sessionId}`), { status: 'finished' });
    }
};

window.editSessionPassword = async function(sessionId) {
    const newPwd = prompt("Digite a nova senha para esta sala:");
    if (newPwd && newPwd.length >= 4) {
        await update(ref(db, `safeexam_sessions/${sessionId}`), { localPassword: newPwd });
        alert("Senha da sala alterada com sucesso!");
    } else if (newPwd) {
        alert("Senha muito curta. Use pelo menos 4 caracteres.");
    }
};

// =========================================
// TELA 1: SETUP DO APLICADOR
// =========================================
formSetup.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let rawUrl = $('#input-exam-url').value.trim();
    const url = sanitizeExamUrl(rawUrl);
    const pwd = $('#input-password').value;
    const roomName = $('#input-room-name').value.trim() || 'Sem nome';
    
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
            examUrl: url,
            roomName: roomName,
            localPassword: pwd,
            status: 'active'
        });

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("TIMEOUT")), 10000)
        );

        await Promise.race([createDocPromise, timeoutPromise]);
        
        // Gera links seguros (NÃO inclui a senha em base64 na URL)
        const b64url = btoa(url);
        const studentLink = `${window.location.origin}${window.location.pathname}?mode=exam&session=${sessionId}&url=${b64url}`;
        const dashLink = `${window.location.origin}${window.location.pathname}#aplicador`;

        $('#generated-link-input').value = studentLink;
        $('#generated-dash-input').value = dashLink;
        
        // Salva a sessão localmente
        localStorage.setItem('last_dash_session', sessionId);
        
        generatedLinkArea.classList.remove('hidden');
        btn.textContent = 'Sala Criada com Sucesso!';
        btn.style.background = 'var(--success)';
        
    } catch (error) {
        if (error.message === "TIMEOUT") {
            alert("O Firebase demorou muito para responder. Verifique sua conexão à internet.");
        } else {
            alert("Erro ao criar sala. Verifique sua conexão ou configurações do Firebase.");
        }
        console.error("Erro Firebase:", error);
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

$('#btn-copy-link').onclick = () => {
    navigator.clipboard.writeText($('#generated-link-input').value);
    alert("Link do aluno copiado para a área de transferência!");
};

$('#btn-copy-dash').onclick = () => {
    navigator.clipboard.writeText($('#generated-dash-input').value);
    alert("Link do painel copiado!");
};

$('#btn-open-dash').onclick = () => {
    window.location.hash = '#aplicador';
};

// =========================================
// TELA: LOGIN DO PAINEL DO APLICADOR
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
        const studentKeys = Object.keys(students);

        if (studentKeys.length === 0) {
            studentsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Nenhum aluno conectado ainda. Compartilhe o link da prova.</div>';
        }

        studentKeys.forEach((studentId) => {
            const student = students[studentId];
            
            if (student.status === 'active') activeCount++;
            if (student.status === 'blocked') blockedCount++;
            
            let isOffline = student.connection === 'offline';

            const card = document.createElement('div');
            card.className = `student-card ${student.status === 'blocked' ? 'blocked' : ''} ${isOffline ? 'offline' : ''}`;
            
            const infractionsList = student.infractions ? Object.values(student.infractions) : [];
            const lastInfraction = infractionsList.length > 0 ? infractionsList[infractionsList.length - 1].reason : 'Nenhuma infração';

            let statusBadge = '';
            if (isOffline) {
                statusBadge = '<span class="card-status status-offline">Sem Conexão</span>';
            } else {
                statusBadge = `<span class="card-status status-${student.status}">${student.status === 'active' ? 'Ativo' : 'Bloqueado'}</span>`;
            }

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-name">${student.name}</span>
                    ${statusBadge}
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

    // Botão de Encerrar Sala
    $('#btn-finish-exam').onclick = async () => {
        if (confirm("Deseja realmente encerrar a prova? Todos os alunos serão desconectados imediatamente.")) {
            const sessionRef = ref(db, `safeexam_sessions/${state.sessionId}`);
            try {
                await update(sessionRef, { status: 'finished' });
                alert("Sala encerrada com sucesso!");
                window.location.hash = ''; 
                window.location.reload();
            } catch (e) {
                alert("Erro ao encerrar a sala.");
            }
        }
    };
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
    if (!confirm("Tem certeza que deseja remover este aluno da sala?")) return;
    
    try {
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${studentId}`);
        await remove(studentRef);
    } catch (e) {
        alert("Erro ao remover aluno.");
    }
};

// =========================================
// TELA DO ALUNO (ENTRADA NA PROVA)
// =========================================
btnStartExam.addEventListener('click', async () => {
    state.studentName = inputStudentName.value.trim();
    if (!state.studentName) {
        alert("Digite seu nome completo!");
        return;
    }
    
    btnStartExam.textContent = "Conectando à Sala...";
    btnStartExam.disabled = true;

    try {
        // Valida se a sessão existe e obtém hash da senha
        const sessionRef = ref(db, `safeexam_sessions/${state.sessionId}`);
        const sessionSnap = await get(sessionRef);
        const sessionData = sessionSnap.val();

        if (!sessionData) {
            alert("Esta sala de prova não existe ou expirou.");
            btnStartExam.textContent = "Entrar em Modo Seguro";
            btnStartExam.disabled = false;
            return;
        }

        if (sessionData.status === 'finished') {
            alert("Esta avaliação já foi encerrada pelo aplicador.");
            btnStartExam.textContent = "Entrar em Modo Seguro";
            btnStartExam.disabled = false;
            return;
        }

        // Armazena hash da senha em memória para validação offline segura
        if (sessionData.localPassword) {
            state.localPasswordHash = await sha256(sessionData.localPassword);
        }

        // Atualiza a URL com a versão tratada da sessão
        if (sessionData.examUrl) {
            state.examUrl = sanitizeExamUrl(sessionData.examUrl);
        }

        // Localiza ou cria ID do aluno
        const allStudentsRef = ref(db, `safeexam_sessions/${state.sessionId}/students`);
        const snapshot = await get(allStudentsRef);
        const students = snapshot.val() || {};
        
        let existingId = null;
        for (const id in students) {
            if (students[id].name && students[id].name.toLowerCase() === state.studentName.toLowerCase()) {
                existingId = id;
                break;
            }
        }
        
        if (existingId) {
            state.studentId = existingId;
        } else {
            const savedIdKey = `safeexam_student_${state.sessionId}`;
            let studentId = localStorage.getItem(savedIdKey);
            if (!studentId) {
                studentId = Math.random().toString(36).substring(2, 9);
                localStorage.setItem(savedIdKey, studentId);
            }
            state.studentId = studentId;
        }

        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
        
        // Marca como offline ao desconectar
        onDisconnect(studentRef).update({ connection: 'offline' });
        
        await update(studentRef, {
            name: state.studentName,
            status: 'active',
            connection: 'online',
            lastPing: serverTimestamp()
        });
        
        // Heartbeat a cada 10 segundos
        setInterval(() => {
            update(studentRef, { lastPing: serverTimestamp(), connection: 'online' }).catch(() => {});
        }, 10000);
        
        startSecureExam();
        
        // Escuta atualizações do próprio aluno (ex: desbloqueio remoto)
        onValue(studentRef, (snapshot) => {
            const data = snapshot.val();
            
            if (!data) {
                alert("Você foi removido da sala pelo aplicador.");
                localStorage.removeItem(`safeexam_student_${state.sessionId}`);
                window.location.reload();
                return;
            }
            
            if (data && data.status === 'active' && state.isBlocked) {
                unblockExamLocal();
            }
        });

        // Escuta status geral da sala
        onValue(sessionRef, (snap) => {
            const session = snap.val();
            if (session && session.status === 'finished') {
                alert("A avaliação foi encerrada pelo professor.");
                localStorage.removeItem(`safeexam_student_${state.sessionId}`);
                window.location.reload();
            }
        });

    } catch (error) {
        alert("Erro ao conectar à sala. Verifique sua conexão e tente novamente.");
        console.error(error);
        btnStartExam.textContent = "Entrar em Modo Seguro";
        btnStartExam.disabled = false;
    }
});

// =========================================
// AMBIENTE SEGURO DA PROVA (ALUNO)
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
        }).catch(err => {
            console.warn("Fullscreen request denied or pending user gesture", err);
        });
    }
}

document.addEventListener('fullscreenchange', () => {
    state.isFullscreen = !!document.fullscreenElement;
    if (!state.isFullscreen && state.isSecureMode && !state.isBlocked) {
        registerInfraction('Saiu do modo de tela cheia');
    }
});

$('#btn-reenter-fullscreen').addEventListener('click', enterFullscreen);

// =========================================
// MONITORES DE SEGURANÇA E INFRAÇÕES
// =========================================
function attachSecurityListeners() {
    // 1. Bloqueio de Teclas
    document.addEventListener('keydown', onKeyDown, true);
    
    // 2. Bloqueio de Botão Direito
    document.addEventListener('contextmenu', (e) => {
        if (!state.isSecureMode) return;
        e.preventDefault();
        registerInfraction('Tentativa de abrir menu de contexto (Botão direito)');
    }, true);
    
    // 3. Mudança de Aba / Minimização
    document.addEventListener('visibilitychange', () => {
        if (state.isSecureMode && document.hidden) {
            registerInfraction('Mudou de aba ou minimizou a janela');
        }
    });

    // 4. Perda de Foco (Tratado com exclusão de foco no Iframe da prova)
    window.addEventListener('blur', () => {
        setTimeout(() => {
            if (!state.isSecureMode || state.isBlocked) return;
            
            // Se o foco foi transferido para dentro do iframe da prova, é interação normal!
            if (document.activeElement === examIframe || document.activeElement?.tagName === 'IFRAME') {
                return;
            }
            
            // Se o documento realmente perdeu o foco para outro aplicativo/desktop
            if (!document.hasFocus()) {
                registerInfraction('Janela da avaliação perdeu o foco');
            }
        }, 300);
    });

    // 5. Prevenção de fechamento acidental
    window.addEventListener('beforeunload', (e) => {
        if (state.isSecureMode) {
            e.preventDefault();
            e.returnValue = 'Sair desta página encerrará a sua prova.';
            return e.returnValue;
        }
    });

    // 6. Prevenção de navegação de voltar/avançar no histórico
    history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', () => {
        if (state.isSecureMode) {
            history.pushState(null, null, window.location.href);
        }
    });
}

function onKeyDown(e) {
    if (!state.isSecureMode) return;
    const key = e.key?.toLowerCase();
    
    // Bloquear Teclas de Função (F1 a F12)
    if (/^f\d+$/i.test(key)) {
        e.preventDefault();
        e.stopPropagation();
        registerInfraction(`Tecla de função bloqueada (${e.key})`);
        return;
    }

    // Bloquear atalhos com Ctrl ou Meta/Command
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        registerInfraction(`Atalho com ${e.ctrlKey ? 'Ctrl' : 'Cmd'} bloqueado`);
        return;
    }

    // Bloquear atalhos com Alt
    if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        registerInfraction(`Atalho com Alt bloqueado`);
        return;
    }

    // Bloquear PrintScreen e Escape
    if (key === 'printscreen') {
        e.preventDefault();
        e.stopPropagation();
        registerInfraction('Captura de tela (PrintScreen) bloqueada');
        return;
    }
}

// =========================================
// REGISTRO DE INFRAÇÃO E BLOQUEIO (ALUNO)
// =========================================
async function registerInfraction(reason) {
    if (state.isBlocked || !state.isSecureMode) return;
    
    state.isBlocked = true;
    const time = new Date().toLocaleTimeString('pt-BR');
    
    // Atualiza Firebase
    try {
        const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
        const infractionsRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}/infractions`);
        
        await update(studentRef, { status: 'blocked' });
        await set(push(infractionsRef), { time, reason });
    } catch (e) {
        console.error("Erro ao registrar infração no Firebase:", e);
    }

    // Atualiza UI Local
    blockedReason.textContent = reason;
    overlayBlocked.classList.remove('hidden');
    overlayFullscreen.classList.add('hidden');
    $('#input-unlock-password').value = '';
    
    const li = document.createElement('li');
    li.textContent = `${time} — ${reason}`;
    infractionLog.appendChild(li);
    $('#infraction-count').textContent = parseInt($('#infraction-count').textContent) + 1;
}

// =========================================
// DESBLOQUEIO PRESENCIAL (SENHA LOCAL)
// =========================================
$('#form-unlock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredPwd = $('#input-unlock-password').value;
    const enteredHash = await sha256(enteredPwd);

    let isMatch = false;

    // 1. Tenta validar via hash SHA-256 local
    if (state.localPasswordHash && enteredHash === state.localPasswordHash) {
        isMatch = true;
    } else {
        // 2. Se a senha foi alterada na sessão durante a prova, verifica no Firebase
        try {
            const sessionSnap = await get(ref(db, `safeexam_sessions/${state.sessionId}`));
            const session = sessionSnap.val();
            if (session && session.localPassword === enteredPwd) {
                isMatch = true;
                state.localPasswordHash = enteredHash;
            }
        } catch (err) {
            console.warn("Erro ao consultar Firebase para desbloqueio:", err);
        }
    }

    if (isMatch) {
        try {
            const studentRef = ref(db, `safeexam_sessions/${state.sessionId}/students/${state.studentId}`);
            await update(studentRef, { status: 'active' });
        } catch (e) { }
        unblockExamLocal();
    } else {
        alert('Senha incorreta! Solicite ao aplicador para realizar o desbloqueio.');
    }
});

function unblockExamLocal() {
    state.isBlocked = false;
    overlayBlocked.classList.add('hidden');
    
    // Se saiu de tela cheia, exibe overlay suave para o aluno clicar e reentrar
    if (!state.isFullscreen) {
        overlayFullscreen.classList.remove('hidden');
    }
}

// =========================================
// WEBSOCKET (INTEGRAÇÃO BLOQUEADOR NATIVO)
// =========================================
function connectToBlocker() {
    if (state.wsConnection) return;

    blockerStatus.innerHTML = `<div class="status-dot" style="background: var(--warning); animation: blink 1s infinite;"></div><span>Aguardando execução do bloqueador...</span>`;

    try {
        const ws = new WebSocket('ws://127.0.0.1:8765');
        ws.onopen = () => {
            state.isBlockerConnected = true;
            state.wsConnection = ws;
            blockerStatus.innerHTML = `<div class="status-dot active" style="background: var(--success); animation: none;"></div><span style="color: var(--success);">Bloqueador nativo conectado com sucesso!</span>`;
            btnStartExam.disabled = false;
        };
        ws.onclose = () => {
            state.isBlockerConnected = false;
            state.wsConnection = null;
            btnStartExam.disabled = true;
            if (state.isSecureMode) {
                registerInfraction('O aplicativo bloqueador nativo foi encerrado.');
            } else if (state.isWindows && globalSettings.requireBlocker) {
                setTimeout(connectToBlocker, 2000);
            }
        };
        ws.onerror = () => {};
    } catch (e) {
        setTimeout(connectToBlocker, 2000);
    }
}