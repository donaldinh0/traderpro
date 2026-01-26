// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://lqxntblxbvmzhpwezvte.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxeG50Ymx4YnZtemhwd2V6dnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTM3NjUsImV4cCI6MjA4NDc2OTc2NX0._Pd_0eNS7pTeON2McZ9c9k6_JqDNxDje6SVogcG4jMk';

let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase conectado.");
} catch (e) { console.error("Erro SB", e); }

// GLOBAIS
let currentUser = null;
let currentOpType = ''; 
let currentCurrency = 'BRL'; 
let userOperations = []; 

// --- INICIALIZAÇÃO ---
async function init() {
    if(!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        carregarTudo();
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
}
init();

// --- AUTH ---
function toggleAuth(mode) {
    document.getElementById('form-login').style.display = mode === 'register' ? 'none' : 'block';
    document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
    const msg = document.getElementById('msg-auth');
    if(msg) msg.innerText = "";
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg-auth');
    
    if(msg) msg.innerText = "Entrando...";
    
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        if(msg) msg.innerText = "Erro: " + error.message;
    } else {
        location.reload();
    }
}

// --- AQUI ESTAVA O PROBLEMA DO NOME ---
async function cadastro() {
    const nome = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-auth');

    // Validação
    if(!nome || !email || !password) {
        if(msg) msg.innerText = "Preencha Nome, Email e Senha obrigatórios.";
        return;
    }
    if(password.length < 6) {
        if(msg) msg.innerText = "Senha muito curta (mínimo 6).";
        return;
    }

    if(msg) msg.innerText = "Criando conta...";

    // 1. Cria o Login (Auth)
    const { data, error } = await sb.auth.signUp({ email, password });

    if (error) {
        if(msg) msg.innerText = "Erro no Login: " + error.message;
        return;
    }

    // 2. Tenta salvar o Perfil (Nome e Telefone)
    if (data.user) {
        try {
            console.log("Tentando salvar perfil para:", nome);
            
            const { error: perfilError } = await sb.from('trader_perfil').insert([{ 
                user_id: data.user.id, 
                nome: nome,        // <--- AQUI VAI O NOME
                telefone: phone,   // <--- AQUI VAI O TELEFONE
                score: 0,
                nivel: 'Iniciante'
            }]);

            if (perfilError) {
                console.error("Erro ao salvar perfil:", perfilError);
                // Se der erro aqui, é 99% certeza que o RLS está ativado
                alert("Conta criada, mas o banco bloqueou o nome. Desative o RLS no Supabase!");
            } else {
                alert("Conta criada com sucesso! Faça login.");
                toggleAuth('login');
            }

        } catch (err) {
            console.error("Erro crítico:", err);
        }
    }
}

async function logout() { await sb.auth.signOut(); location.reload(); }

// --- UI TABS ---
window.setTab = function(tabName) {
    document.querySelectorAll('.panel').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
    
    const panel = document.getElementById('tab-' + tabName);
    if(panel) {
        panel.style.display = 'block';
        setTimeout(() => panel.classList.add('active'), 10);
    }
    
    const btns = document.querySelectorAll('.pill');
    btns.forEach(b => {
        if(b.innerText.toLowerCase().includes(tabName === 'home' ? 'visão' : (tabName === 'analytics' ? 'performance' : tabName))) 
            b.classList.add('active');
    });
    
    if(tabName === 'analytics') renderChart();
    if(tabName === 'checklist') verificarChecklistDia();
}

// --- DADOS ---
async function carregarTudo() {
    if(!currentUser) return;

    // Busca Perfil
    let { data: perfil, error } = await sb.from('trader_perfil').select('*').eq('user_id', currentUser.id).single();

    // FALLBACK DE SEGURANÇA (Só roda se o cadastro falhou antes)
    if (!perfil || error) {
        console.log("Perfil não encontrado. Criando provisório...");
        const nomeProvisorio = currentUser.email.split('@')[0];
        
        // Tenta criar de novo
        const { data: novo } = await sb.from('trader_perfil').insert([
            { user_id: currentUser.id, nome: nomeProvisorio, score: 0, nivel: 'Iniciante' }
        ]).select().single();
        
        perfil = novo || { nome: nomeProvisorio, score: 0, nivel: 'Iniciante' };
    }

    // Exibe Nome
    document.getElementById('tp-user-name').innerText = "Olá, " + (perfil.nome || "Trader");
    
    // Avatar
    let inicias = "TP";
    if(perfil.nome && perfil.nome.length >= 2) inicias = perfil.nome.substring(0,2).toUpperCase();
    document.getElementById('avatar-initials').innerText = inicias;

    // Score
    document.getElementById('dash-score').innerText = perfil.score || 0;
    
    let nivel = 'Iniciante';
    const s = perfil.score || 0;
    if(s > 100) nivel = 'Intermediário';
    if(s > 500) nivel = 'Trader PRO';
    if(s > 2000) nivel = 'Lenda';
    
    const badge = document.getElementById('tp-user-level');
    badge.innerText = nivel;
    badge.className = 'badge-level ' + (nivel === 'Iniciante' ? 'bronze' : (nivel === 'Intermediário' ? 'silver' : (nivel === 'Trader PRO' ? 'gold' : 'diamond')));

    // Histórico
    const { data: ops } = await sb.from('trader_diario').select('*').eq('user_id', currentUser.id).order('created_at', {ascending: false});
    window.userOperations = ops || [];
    
    atualizarResumo();
}

function atualizarResumo() {
    const hoje = new Date().toISOString().split('T')[0];
    const opsHoje = window.userOperations.filter(op => op.created_at.startsWith(hoje));
    
    let saldo = 0;
    opsHoje.forEach(op => {
        if(op.resultado === 'GAIN') saldo += Number(op.pontos);
        if(op.resultado === 'LOSS') saldo -= Number(op.pontos);
    });

    const elSaldo = document.getElementById('dash-today-result');
    elSaldo.innerText = "R$ " + saldo.toFixed(2);
    elSaldo.style.color = saldo >= 0 ? '#2ecc71' : '#e74c3c';

    const tbody = document.getElementById('home-recent-list');
    tbody.innerHTML = '';
    window.userOperations.slice(0, 5).forEach(op => {
        const color = op.resultado === 'GAIN' ? '#2ecc71' : (op.resultado === 'LOSS' ? '#e74c3c' : '#fff');
        tbody.innerHTML += `<tr>
            <td>${new Date(op.created_at).toLocaleDateString()}</td>
            <td>${op.ativo}</td>
            <td style="color:${color}; font-weight:bold;">${op.resultado}</td>
            <td>R$ ${Number(op.pontos).toFixed(2)}</td>
        </tr>`;
    });
    
    const gains = window.userOperations.filter(o => o.resultado === 'GAIN').length;
    const total = window.userOperations.filter(o => o.resultado === 'GAIN' || o.resultado === 'LOSS').length;
    document.getElementById('dash-winrate').innerText = total > 0 ? ((gains/total)*100).toFixed(0)+'%' : '0%';
}

// --- OPERAÇÕES ---
window.setCurrency = function(curr) {
    currentCurrency = curr;
    document.getElementById('toggle-brl').className = curr === 'BRL' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('toggle-pts').className = curr === 'PTS' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('lbl-value').innerText = curr === 'BRL' ? 'Valor Financeiro (R$)' : 'Quantidade de Pontos';
}

window.selectType = function(type) {
    currentOpType = type;
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    
    if(type === 'GAIN') document.getElementById('btn-gain').classList.add('active');
    if(type === 'LOSS') document.getElementById('btn-loss').classList.add('active');
    if(type === '0x0') document.getElementById('btn-zero').classList.add('active');

    const feed = document.getElementById('score-feedback');
    if(type === 'GAIN') feed.innerText = "GAIN: +10 pts + 1% do valor!";
    if(type === 'LOSS') feed.innerText = "LOSS: +2 pts (Disciplina).";
    if(type === '0x0') feed.innerText = "0x0: +1 pt.";
}

window.salvarOperacao = async function() {
    const asset = document.getElementById('op-asset').value;
    let val = document.getElementById('op-value').value;
    
    if(!currentOpType || !val) return alert("Preencha Resultado e Valor.");
    
    const btn = event.target;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        await sb.from('trader_diario').insert([{
            user_id: currentUser.id,
            ativo: asset + (currentCurrency === 'PTS' ? ' (Pts)' : ''),
            resultado: currentOpType,
            pontos: val
        }]);

        let ptsGain = 0;
        if(currentOpType === 'GAIN') ptsGain = 10 + Math.floor(Number(val) * 0.01);
        if(currentOpType === 'LOSS') ptsGain = 2;
        if(currentOpType === '0x0') ptsGain = 1;

        let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + ptsGain;
        await sb.from('trader_perfil').update({ score: novoScore }).eq('user_id', currentUser.id);

        alert(`Trade Registrado! +${ptsGain} pts.`);
        document.getElementById('op-value').value = '';
        await carregarTudo();
        setTab('home');

    } catch (e) {
        console.error(e);
        alert("Erro ao salvar.");
    } finally {
        btn.innerText = "SALVAR NO DIÁRIO";
        btn.disabled = false;
    }
}

// --- CHECKLIST ---
async function verificarChecklistDia() {
    const { data } = await sb.from('trader_perfil').select('ultimo_checklist').eq('user_id', currentUser.id).single();
    const hoje = new Date().toISOString().split('T')[0];
    const btn = document.getElementById('btn-save-check');
    const alertBox = document.getElementById('check-alert');
    
    if (data && data.ultimo_checklist === hoje) {
        btn.disabled = true;
        btn.innerText = "Checklist Já Realizado ✅";
        btn.style.opacity = "0.5";
        alertBox.style.display = 'block';
        alertBox.className = 'alert-box alert-success';
        alertBox.innerText = "Você já garantiu seus 10 pontos de disciplina hoje!";
        document.querySelectorAll('.chk-input').forEach(i => { i.checked = true; i.disabled = true; });
    } else {
        btn.disabled = false;
        btn.innerText = "CONCLUIR CHECKLIST (+10 PTS)";
        btn.style.opacity = "1";
        alertBox.style.display = 'none';
        document.querySelectorAll('.chk-input').forEach(i => { i.checked = false; i.disabled = false; });
    }
}

window.salvarChecklist = async function() {
    const hoje = new Date().toISOString().split('T')[0];
    let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + 10;
    
    const { error } = await sb.from('trader_perfil').update({ score: novoScore, ultimo_checklist: hoje }).eq('user_id', currentUser.id);

    if(!error) {
        alert("Checklist Salvo! +10 Pontos.");
        verificarChecklistDia();
        document.getElementById('dash-score').innerText = novoScore;
    }
}

// --- NÍVEIS E GRÁFICOS ---
window.openLevelsModal = function() { document.getElementById('modal-levels').style.display = 'flex'; }
window.closeLevelsModal = function() { document.getElementById('modal-levels').style.display = 'none'; }

window.renderChart = function() {
    const ctx = document.getElementById('chart-equity');
    if(!ctx) return;
    const cronoOps = [...window.userOperations].reverse();
    let labels = [], dataPoints = [], acc = 0;

    cronoOps.forEach(op => {
        let v = Number(op.pontos);
        if(op.resultado === 'LOSS') v = -v;
        if(op.resultado === '0x0') v = 0;
        acc += v;
        labels.push(new Date(op.created_at).toLocaleDateString().slice(0,5));
        dataPoints.push(acc);
    });

    if(window.myChart instanceof Chart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Patrimônio (R$)',
                data: dataPoints,
                borderColor: '#66fcf1',
                backgroundColor: 'rgba(102, 252, 241, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: '#2d3436' }, ticks: { color: '#c5c6c7' } },
                x: { display: false }
            },
            plugins: { legend: { display: false } }
        }
    });
}