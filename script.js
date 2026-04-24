// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://lqxntblxbvmzhpwezvte.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxeG50Ymx4YnZtemhwd2V6dnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTM3NjUsImV4cCI6MjA4NDc2OTc2NX0._Pd_0eNS7pTeON2McZ9c9k6_JqDNxDje6SVogcG4jMk';

let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error("Erro SB", e); }

// GLOBAIS
let currentUser = null;
let currentOpType = ''; 
let inputMode = 'FINANCEIRO'; 
let currentCurrencySymbol = 'R$'; 
let userOperations = []; 

// --- MÁSCARAS DE INPUT ---
document.addEventListener('DOMContentLoaded', () => {
    const inputVal = document.getElementById('op-value');
    if(inputVal) {
        inputVal.addEventListener('input', function(e) {
            if(inputMode === 'PTS') {
                e.target.value = e.target.value.replace(/\D/g, ""); 
                return;
            }
            let value = e.target.value.replace(/\D/g, "");
            let number = Number(value) / 100;
            let locale = currentCurrencySymbol === 'US$' ? 'en-US' : 'pt-BR';
            let currCode = currentCurrencySymbol === 'US$' ? 'USD' : 'BRL';
            e.target.value = number.toLocaleString(locale, { style: 'currency', currency: currCode });
        });
    }

    const inputBank = document.getElementById('calc-bank');
    if(inputBank) {
        inputBank.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, "");
            let number = Number(value) / 100;
            e.target.value = number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        });
    }

    // --- SUPORTE A TECLA ENTER (AUTH) ---
    const bindEnter = (inputId, actionFunction) => {
        const el = document.getElementById(inputId);
        if (el) {
            el.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') actionFunction();
            });
        }
    };

    // Aplica o "Enter" nos campos de Login
    bindEnter('email', login);
    bindEnter('password', login);

    // Aplica o "Enter" nos campos de Cadastro
    bindEnter('reg-name', cadastro);
    bindEnter('reg-phone', cadastro);
    bindEnter('reg-email', cadastro);
    bindEnter('reg-password', cadastro);

    // Aplica o "Enter" na Recuperação e Nova Senha
    bindEnter('forgot-email', enviarEmailRecuperacao);
    bindEnter('new-password', salvarNovaSenha);
});

// --- INICIALIZAÇÃO E ESCUTA DE EVENTOS ---
async function init() {
    if(!sb) return;

    // Escuta eventos especiais (como clique no link de recuperação de senha)
    sb.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            document.getElementById('auth-screen').style.display = 'flex';
            document.getElementById('app-screen').style.display = 'none';
            toggleAuth('reset');
        }
    });

    const { data: { session } } = await sb.auth.getSession();
    
    // Só loga se não estiver em processo de reset de senha
    const isResetting = document.getElementById('form-reset').style.display === 'block';
    
    if (session && !isResetting) {
        currentUser = session.user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        carregarTudo();
    } else if (!session && !isResetting) {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
}
init();

// --- AUTH (NAVEGAÇÃO E LOGIN) ---
function toggleAuth(mode) {
    document.getElementById('form-login').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('form-forgot').style.display = mode === 'forgot' ? 'block' : 'none';
    document.getElementById('form-reset').style.display = mode === 'reset' ? 'block' : 'none';
    document.getElementById('msg-auth').innerText = "";
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg-auth');
    if(msg) msg.innerText = "Entrando...";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { if(msg) msg.innerText = error.message; } else { location.reload(); }
}

async function logout() { await sb.auth.signOut(); location.reload(); }

// --- CADASTRO (TRIAL 7 DIAS AUTOMÁTICO) ---
async function cadastro() {
    const nome = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-auth');

    if(!nome || !email || !password) return msg.innerText = "Preencha todos os campos.";
    msg.innerText = "Criando sua conta...";

    try {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) { msg.innerText = "Erro: " + error.message; return; }

        if (data.user) {
            const { data: compra } = await sb.from('compras_lastlink').select('*').eq('email', email).single();
            let perfilData = { user_id: data.user.id, nome, telefone: phone, email, score: 0, nivel: 'Iniciante' };
            let ehVIP = false;
            if (compra) { perfilData.status_assinatura = 'ativo'; ehVIP = true; }

            await sb.from('trader_perfil').insert([perfilData]);

            Swal.fire({
                title: ehVIP ? 'Bem-vindo ao Trader PRO!' : 'Conta Criada!',
                text: ehVIP ? 'Seu pagamento foi confirmado.' : 'Você ganhou 7 dias de acesso grátis para testar.',
                icon: 'success',
                background: '#121212',
                color: '#ffffff',
                confirmButtonColor: '#2ecc71',
                confirmButtonText: ehVIP ? 'Acessar Plataforma' : 'Bora pro gain!'
            });
            toggleAuth('login');
        }
    } catch (err) { console.error(err); msg.innerText = "Erro ao criar conta."; }
}

// --- RECUPERAÇÃO DE SENHA ---
async function enviarEmailRecuperacao() {
    const email = document.getElementById('forgot-email').value;
    if (!email) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Digite seu e-mail.', background: '#121212', color: '#fff' });

    const siteURL = window.location.origin;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: siteURL });

    if (error) {
        Swal.fire({ icon: 'error', title: 'Erro', text: error.message, background: '#121212', color: '#fff' });
    } else {
        Swal.fire({ icon: 'success', title: 'E-mail enviado!', text: 'Verifique sua caixa de entrada e spam.', background: '#121212', color: '#fff' });
        toggleAuth('login');
    }
}

async function salvarNovaSenha() {
    const newPassword = document.getElementById('new-password').value;
    if (!newPassword || newPassword.length < 6) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'A senha deve ter pelo menos 6 caracteres.', background: '#121212', color: '#fff' });

    const { error } = await sb.auth.updateUser({ password: newPassword });

    if (error) {
        Swal.fire({ icon: 'error', title: 'Erro', text: error.message, background: '#121212', color: '#fff' });
    } else {
        Swal.fire({ icon: 'success', title: 'Senha atualizada!', text: 'Sua senha foi alterada com sucesso.', background: '#121212', color: '#fff' }).then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            location.reload();
        });
    }
}

// --- NAVEGAÇÃO ---
window.setTab = function(tabName) {
    // Esconde todos os painéis e remove a classe ativa dos botões
    document.querySelectorAll('.panel').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
    
    // Mostra o painel selecionado
    const panel = document.getElementById('tab-' + tabName);
    if(panel) { 
        panel.style.display = 'block'; 
        setTimeout(() => panel.classList.add('active'), 10); 
    }
    
    // Destaca o botão correspondente
    document.querySelectorAll('.pill').forEach(b => { 
        const txt = b.innerText.toLowerCase();
        // Mapeamento de nomes para garantir que o botão fique ativo
        if(
            (tabName === 'welcome' && txt.includes('início')) ||
            (tabName === 'home' && txt.includes('visão')) ||
            (tabName === 'history' && txt.includes('histórico')) ||
            (tabName === 'calculator' && txt.includes('calculadora')) ||
            (tabName === 'analytics' && txt.includes('performance')) ||
            (tabName === 'checklist' && txt.includes('checklist'))
        ) {
            b.classList.add('active'); 
        }
    });
    
    if(tabName === 'analytics') renderChart();
    if(tabName === 'checklist') verificarChecklists();
    if(tabName === 'history') renderHistory();
}

// --- CARREGAMENTO ---
async function carregarTudo() {
    if(!currentUser) return;
    let { data: perfil, error } = await sb.from('trader_perfil').select('*').eq('user_id', currentUser.id).single();

    if (!perfil || error) {
        const nomeProv = currentUser.email.split('@')[0];
        const { data: novo } = await sb.from('trader_perfil').insert([{ user_id: currentUser.id, nome: nomeProv, score: 0 }]).select().single();
        perfil = novo || { nome: nomeProv, score: 0, status_assinatura: 'teste_gratis' };
    }

    const hoje = new Date();
    const dataFim = perfil.fim_trial ? new Date(perfil.fim_trial) : new Date();
    let acessoLiberado = (perfil.status_assinatura === 'ativo' || hoje < dataFim);
    let diasRestantes = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));

    if (!acessoLiberado) {
        document.getElementById('app-screen').innerHTML = `
            <div style="text-align:center; padding:50px; color:#fff;">
                <h1 style="color:var(--loss); font-size:3rem;"><i class="ri-lock-2-line"></i></h1>
                <h2>Acesso Bloqueado</h2>
                <p>Seu período de teste expirou ou sua assinatura está pendente.</p>
                <br><a href="https://lastlink.com/p/C495D678C/checkout-payment/" target="_blank" class="btn-primary" style="text-decoration:none; display:inline-block; max-width:300px;">ASSINAR AGORA</a>
                <br><br><button onclick="logout()" style="background:none; border:none; color:#aaa; cursor:pointer;">Sair</button>
            </div>`;
        return; 
    }

    if (perfil.status_assinatura !== 'ativo' && diasRestantes > 0) {
        const avisoId = 'trial-warning';
        if(!document.getElementById(avisoId)){
            const aviso = document.createElement('div'); aviso.id = avisoId;
            aviso.style = "background:#e67e22; color:#fff; text-align:center; padding:5px; font-size:0.8rem; font-weight:bold;";
            aviso.innerText = `🔥 Período de Teste: Restam ${diasRestantes} dias.`;
            document.body.prepend(aviso);
        }
    }

    document.getElementById('tp-user-name').innerText = "Olá, " + (perfil.nome || "Trader");
    let inicias = "TP"; if(perfil.nome && perfil.nome.length>=2) inicias = perfil.nome.substring(0,2).toUpperCase();
    document.getElementById('avatar-initials').innerText = inicias;
    document.getElementById('dash-score').innerText = perfil.score || 0;
    
    let nivel = 'Iniciante'; const s = perfil.score || 0;
    if(s > 100) nivel = 'Intermediário'; if(s > 500) nivel = 'Trader PRO'; if(s > 2000) nivel = 'Lenda';
    const badge = document.getElementById('tp-user-level'); badge.innerText = nivel;
    badge.className = 'badge-level ' + (nivel==='Iniciante'?'bronze':(nivel==='Intermediário'?'silver':(nivel==='Trader PRO'?'gold':'diamond')));

    const { data: ops } = await sb.from('trader_diario').select('*').eq('user_id', currentUser.id).order('created_at', {ascending: false});
    window.userOperations = ops || [];
    atualizarResumo();
}

function atualizarResumo() {
    const hoje = new Date().toISOString().split('T')[0];
    const opsHoje = window.userOperations.filter(op => op.created_at.startsWith(hoje));
    let saldo = 0;
    opsHoje.forEach(op => { if(op.resultado==='GAIN') saldo+=Number(op.pontos); if(op.resultado==='LOSS') saldo-=Number(op.pontos); });
    const elSaldo = document.getElementById('dash-today-result');
    elSaldo.innerText = saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    elSaldo.style.color = saldo >= 0 ? '#2ecc71' : '#e74c3c';

    const tbody = document.getElementById('home-recent-list'); tbody.innerHTML = '';
    window.userOperations.slice(0, 5).forEach(op => {
        const color = op.resultado === 'GAIN' ? '#2ecc71' : (op.resultado === 'LOSS' ? '#e74c3c' : '#fff');
        let isDollar = op.ativo.includes('WDO') || op.ativo.includes('USD');
        let valFmt = Number(op.pontos).toLocaleString(isDollar?'en-US':'pt-BR', {style:'currency', currency:isDollar?'USD':'BRL'});
        if(op.ativo.includes('(Pts)')) valFmt = op.pontos + " pts";
        tbody.innerHTML += `<tr><td>${new Date(op.created_at).toLocaleDateString().slice(0,5)}</td><td>${op.ativo}</td><td style="color:${color};font-weight:bold;">${op.resultado}</td><td>${valFmt}</td></tr>`;
    });
    const total = window.userOperations.filter(o => o.resultado!=='0x0').length;
    const gains = window.userOperations.filter(o => o.resultado==='GAIN').length;
    document.getElementById('dash-winrate').innerText = total > 0 ? ((gains/total)*100).toFixed(0)+'%' : '0%';
}

// --- OPERAÇÕES E CALCULADORA ---
window.verificarAtivoDolar = function() {
    const asset = document.getElementById('op-asset').value;
    currentCurrencySymbol = ['WDO', 'FOREX', 'CRYPTO'].includes(asset) ? 'US$' : 'R$';
    setCurrency(inputMode); document.getElementById('op-value').value = '';
}

window.setCurrency = function(mode) {
    inputMode = mode;
    document.getElementById('toggle-brl').className = mode === 'FINANCEIRO' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('toggle-pts').className = mode === 'PTS' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('lbl-value').innerText = mode === 'FINANCEIRO' ? `Valor Financeiro (${currentCurrencySymbol})` : 'Quantidade de Pontos';
}

window.selectType = function(type) {
    currentOpType = type;
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    if(type === 'GAIN') document.getElementById('btn-gain').classList.add('active');
    if(type === 'LOSS') document.getElementById('btn-loss').classList.add('active');
    if(type === '0x0') document.getElementById('btn-zero').classList.add('active');
}

window.salvarOperacao = async function() {
    const asset = document.getElementById('op-asset').value;
    const rawValue = document.getElementById('op-value').value;
    if(!currentOpType || !rawValue) return Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Preencha os campos.', background: '#121212', color: '#fff' });
    
    let valParaSalvar = (inputMode === 'FINANCEIRO') ? Number(rawValue.replace(/\D/g, "")) / 100 : Number(rawValue);
    try {
        await sb.from('trader_diario').insert([{ user_id: currentUser.id, ativo: asset + (inputMode === 'PTS' ? ' (Pts)' : ''), resultado: currentOpType, pontos: valParaSalvar }]);
        let ptsChange = currentOpType === 'GAIN' ? (10 + Math.floor(valParaSalvar * 0.01)) : (currentOpType === 'LOSS' ? -10 : 1);
        let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + ptsChange;
        await sb.from('trader_perfil').update({ score: novoScore }).eq('user_id', currentUser.id);

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Registrado! +${ptsChange} pts`, showConfirmButton: false, timer: 3000, background: '#121212', color: '#fff' });
        await carregarTudo(); setTab('welcome');
    } catch (e) { console.error(e); }
}

// --- HISTÓRICO, CHECKLIST, MODAL E GRÁFICOS ---
function renderHistory() {
    const container = document.getElementById('daily-history-list'); container.innerHTML = '';
    const porDia = {};
    window.userOperations.forEach(op => {
        const dia = op.created_at.split('T')[0];
        if(!porDia[dia]) porDia[dia] = { gainCount:0, lossCount:0, financeiro:0, pontosGerados:0 };
        let val = Number(op.pontos);
        if(op.resultado === 'GAIN') { porDia[dia].gainCount++; porDia[dia].financeiro += val; porDia[dia].pontosGerados += (10 + Math.floor(val*0.01)); } 
        else if(op.resultado === 'LOSS') { porDia[dia].lossCount++; porDia[dia].financeiro -= val; porDia[dia].pontosGerados -= 10; }
    });
    Object.keys(porDia).sort().reverse().forEach(dia => {
        const d = porDia[dia]; const cor = d.financeiro >= 0 ? '#2ecc71' : '#e74c3c';
        container.innerHTML += `<div class="history-day-card"><div class="day-header"><span>${dia.split('-').reverse().join('/')}</span><span style="color:${cor}">${d.financeiro.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div></div>`;
    });
}

async function verificarChecklists() {
    const { data } = await sb.from('trader_perfil').select('check_pre, check_pos').eq('user_id', currentUser.id).single();
    const hoje = new Date().toISOString().split('T')[0];
    const updateCheck = (tipo, btnId, statusId) => {
        const feito = data && data[tipo] === hoje;
        document.getElementById(btnId).disabled = feito;
        document.getElementById(statusId).innerText = feito ? "Concluído" : "Pendente";
    }
    updateCheck('check_pre', 'btn-pre', 'status-pre'); updateCheck('check_pos', 'btn-pos', 'status-pos');
}

window.salvarChecklist = async function(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    let updateData = tipo === 'PRE' ? { check_pre: hoje } : { check_pos: hoje };
    let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + 5;
    updateData.score = novoScore;
    await sb.from('trader_perfil').update(updateData).eq('user_id', currentUser.id);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Checklist Salvo!', showConfirmButton: false, timer: 2000, background: '#121212', color: '#fff' });
    verificarChecklists(); carregarTudo();
}

window.selectCalcAsset = (asset) => { document.getElementById('btn-calc-win').className = asset === 'WIN' ? 'toggle-btn active' : 'toggle-btn'; document.getElementById('btn-calc-wdo').className = asset === 'WDO' ? 'toggle-btn active' : 'toggle-btn'; }
window.setRiskMode = (mode) => { document.getElementById('btn-risk-pct').className = mode === 'PERCENT' ? 'mt-btn active' : 'mt-btn'; document.getElementById('btn-risk-pts').className = mode === 'POINTS' ? 'mt-btn active' : 'mt-btn'; }
window.setTargetMode = (mode) => { document.getElementById('btn-target-pct').className = mode === 'PERCENT' ? 'mt-btn active' : 'mt-btn'; document.getElementById('btn-target-pts').className = mode === 'POINTS' ? 'mt-btn active' : 'mt-btn'; }

window.calcularGerenciamento = function() {
    const rawBank = document.getElementById('calc-bank').value;
    const bank = Number(rawBank.replace(/\D/g, "")) / 100;
    if (!bank) return Swal.fire({ icon: 'warning', title: 'Calculadora', text: 'Preencha a banca.', background: '#121212', color: '#fff' });
    document.getElementById('calc-result-box').style.display = 'block';
}

window.openLevelsModal = () => document.getElementById('modal-levels').style.display = 'flex';
window.closeLevelsModal = () => document.getElementById('modal-levels').style.display = 'none';

window.renderChart = function() {
    const ctx = document.getElementById('chart-equity'); if(!ctx) return;
    const cronoOps = [...window.userOperations].reverse();
    let lbl=[], dat=[], acc=0;
    cronoOps.forEach(op=>{ let v=Number(op.pontos); if(op.resultado==='LOSS') v=-v; acc+=v; lbl.push(new Date(op.created_at).toLocaleDateString().slice(0,5)); dat.push(acc); });
    if(window.myChart instanceof Chart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {type:'line',data:{labels:lbl,datasets:[{label:'R$',data:dat,borderColor:'#66fcf1',backgroundColor:'rgba(102,252,241,0.1)',fill:true}]},options:{responsive:true,plugins:{legend:{display:false}}}});
}