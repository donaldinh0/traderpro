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
let calcAsset = 'WIN'; // Variável da calculadora

// --- MÁSCARAS E EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    const inputVal = document.getElementById('op-value');
    if(inputVal) {
        inputVal.addEventListener('input', function(e) {
            if(inputMode === 'PTS') { e.target.value = e.target.value.replace(/\D/g, ""); return; }
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
});

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

async function cadastro() {
    const nome = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-auth');

    if(!nome || !email || !password) return msg.innerText = "Preencha todos os campos.";
    msg.innerText = "Criando conta...";

    try {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) { msg.innerText = "Erro: " + error.message; return; }

        if (data.user) {
            // Verifica compra Lastlink
            const { data: compra } = await sb.from('compras_lastlink').select('*').eq('email', email).single();
            let statusInicial = compra ? 'ativo' : 'teste_gratis';
            
            const dataHoje = new Date();
            dataHoje.setDate(dataHoje.getDate() + 30); 

            await sb.from('trader_perfil').insert([{ 
                user_id: data.user.id, nome: nome, telefone: phone, email: email, score: 0, nivel: 'Iniciante',
                status_assinatura: statusInicial, fim_trial: dataHoje.toISOString()
            }]);

            alert(statusInicial === 'ativo' ? "Bem-vindo VIP!" : "Conta criada! 30 dias grátis.");
            toggleAuth('login');
        }
    } catch (err) { console.error(err); msg.innerText = "Erro ao criar conta."; }
}

// --- NAVEGAÇÃO ---
window.setTab = function(tabName) {
    document.querySelectorAll('.panel').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
    
    const panel = document.getElementById('tab-' + tabName);
    if(panel) { panel.style.display = 'block'; setTimeout(() => panel.classList.add('active'), 10); }
    
    document.querySelectorAll('.pill').forEach(b => { 
        if(b.innerText.toLowerCase().includes(tabName === 'home'?'visão':tabName==='history'?'histórico':tabName==='calculator'?'calculadora':tabName)) 
            b.classList.add('active'); 
    });
    if(tabName === 'history') renderHistory();
}

// --- CARREGAMENTO ---
async function carregarTudo() {
    if(!currentUser) return;
    let { data: perfil, error } = await sb.from('trader_perfil').select('*').eq('user_id', currentUser.id).single();

    if (!perfil || error) {
        const nomeProv = currentUser.email.split('@')[0];
        const dataHoje = new Date(); dataHoje.setDate(dataHoje.getDate() + 30);
        const { data: novo } = await sb.from('trader_perfil').insert([{ user_id: currentUser.id, nome: nomeProv, score: 0, status_assinatura: 'teste_gratis', fim_trial: dataHoje.toISOString() }]).select().single();
        perfil = novo;
    }

    const hoje = new Date();
    const dataFim = perfil.fim_trial ? new Date(perfil.fim_trial) : new Date();
    let acessoLiberado = (perfil.status_assinatura === 'ativo') || (hoje < dataFim);

    if (!acessoLiberado) {
        document.getElementById('app-screen').innerHTML = `<div style="text-align:center; padding:50px; color:#fff;"><h1>🔒</h1><h2>Seus 30 dias acabaram!</h2><p>Assine para continuar.</p><button onclick="logout()" style="color:#aaa;background:none;border:none;margin-top:20px;">Sair</button></div>`;
        return; 
    }

    document.getElementById('tp-user-name').innerText = "Olá, " + (perfil.nome || "Trader");
    document.getElementById('avatar-initials').innerText = perfil.nome ? perfil.nome.substring(0,2).toUpperCase() : "TP";
    document.getElementById('dash-score').innerText = perfil.score || 0;
    
    // Nível
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

    const tbody = document.getElementById('home-recent-list');
    tbody.innerHTML = '';
    window.userOperations.slice(0, 5).forEach(op => {
        const color = op.resultado === 'GAIN' ? '#2ecc71' : (op.resultado === 'LOSS' ? '#e74c3c' : '#fff');
        tbody.innerHTML += `<tr><td>${new Date(op.created_at).toLocaleDateString().slice(0,5)}</td><td>${op.ativo}</td><td style="color:${color}">${op.resultado}</td></tr>`;
    });
    
    const total = window.userOperations.length;
    const gains = window.userOperations.filter(o => o.resultado==='GAIN').length;
    document.getElementById('dash-winrate').innerText = total > 0 ? ((gains/total)*100).toFixed(0)+'%' : '0%';
}

// --- OPERAÇÕES ---
window.verificarAtivoDolar = function() {
    const asset = document.getElementById('op-asset').value;
    const dolarAssets = ['WDO'];
    currentCurrencySymbol = dolarAssets.includes(asset) ? 'US$' : 'R$';
    setCurrency(inputMode); 
    document.getElementById('op-value').value = '';
}

window.setCurrency = function(mode) {
    inputMode = mode;
    document.getElementById('toggle-brl').className = mode === 'FINANCEIRO' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('toggle-pts').className = mode === 'PTS' ? 'toggle-btn active' : 'toggle-btn';
    const lbl = document.getElementById('lbl-value');
    if(mode === 'FINANCEIRO') { lbl.innerText = `Valor Financeiro (${currentCurrencySymbol})`; } else { lbl.innerText = 'Quantidade de Pontos'; }
    document.getElementById('op-value').value = '';
}

window.selectType = function(type) {
    currentOpType = type;
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    if(type === 'GAIN') document.getElementById('btn-gain').classList.add('active');
    if(type === 'LOSS') document.getElementById('btn-loss').classList.add('active');
    if(type === '0x0') document.getElementById('btn-zero').classList.add('active');
    document.getElementById('score-feedback').innerText = type === 'GAIN' ? "+10 pts + 1% Financeiro" : (type==='LOSS' ? "-10 pts" : "+1 pt");
}

window.salvarOperacao = async function() {
    const asset = document.getElementById('op-asset').value;
    const rawValue = document.getElementById('op-value').value;
    if(!currentOpType || !rawValue) return alert("Preencha Resultado e Valor.");
    
    let valParaSalvar = inputMode === 'FINANCEIRO' ? Number(rawValue.replace(/\D/g, "")) / 100 : Number(rawValue);

    try {
        await sb.from('trader_diario').insert([{ user_id: currentUser.id, ativo: asset, resultado: currentOpType, pontos: valParaSalvar }]);
        let ptsChange = 0;
        if(currentOpType === 'GAIN') ptsChange = 10 + Math.floor(valParaSalvar * 0.01);
        if(currentOpType === 'LOSS') ptsChange = -10;
        if(currentOpType === '0x0') ptsChange = 1;

        let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + ptsChange;
        await sb.from('trader_perfil').update({ score: novoScore }).eq('user_id', currentUser.id);

        alert("Salvo!");
        document.getElementById('op-value').value = '';
        await carregarTudo();
        setTab('home');
    } catch (e) { console.error(e); alert("Erro ao salvar."); } 
}

// --- HISTÓRICO ---
function renderHistory() {
    const container = document.getElementById('daily-history-list');
    container.innerHTML = '';
    const porDia = {};
    window.userOperations.forEach(op => {
        const dia = op.created_at.split('T')[0];
        if(!porDia[dia]) porDia[dia] = { gainCount:0, lossCount:0, financeiro:0 };
        let val = Number(op.pontos);
        if(op.resultado === 'GAIN') { porDia[dia].gainCount++; porDia[dia].financeiro += val; } 
        else if(op.resultado === 'LOSS') { porDia[dia].lossCount++; porDia[dia].financeiro -= val; }
    });
    Object.keys(porDia).sort().reverse().forEach(dia => {
        const dados = porDia[dia];
        container.innerHTML += `<div class="history-day-card"><div class="day-header"><span class="day-date">${dia.split('-').reverse().join('/')}</span><span>${dados.financeiro.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span></div><div class="day-stats"><span>Gains: ${dados.gainCount}</span><span>Loss: ${dados.lossCount}</span></div></div>`;
    });
}

// --- CHECKLIST ---
async function salvarChecklist(tipo) {
    let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + 5;
    await sb.from('trader_perfil').update({ score: novoScore }).eq('user_id', currentUser.id);
    alert("Checklist Salvo! +5 Pontos.");
    document.getElementById('dash-score').innerText = novoScore;
}

// --- CALCULADORA (Versão Contratos Fixos) ---
window.selectCalcAsset = function(asset) {
    calcAsset = asset;
    document.getElementById('btn-calc-win').className = asset === 'WIN' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('btn-calc-wdo').className = asset === 'WDO' ? 'toggle-btn active' : 'toggle-btn';
}

window.calcularGerenciamento = function() {
    const rawBank = document.getElementById('calc-bank').value;
    const riskPercent = Number(document.getElementById('calc-risk').value);
    const targetPercent = Number(document.getElementById('calc-target').value);
    const qtyContracts = Number(document.getElementById('calc-qty').value);

    const bank = Number(rawBank.replace(/\D/g, "")) / 100;

    if (!bank || !riskPercent || !targetPercent || !qtyContracts) {
        return alert("Preencha todos os campos.");
    }

    const tickUnitValue = calcAsset === 'WIN' ? 0.20 : 10.00;
    
    // Cálculos
    const limitLoss = bank * (riskPercent / 100);
    const targetGain = bank * (targetPercent / 100);
    
    // Mágica: Divide pelo valor total da mão (Qtd * Unitário)
    const valuePerPointTotal = qtyContracts * tickUnitValue;
    const maxPointsLoss = Math.floor(limitLoss / valuePerPointTotal);
    const pointsToTarget = Math.ceil(targetGain / valuePerPointTotal);

    // Exibição
    document.getElementById('res-loss-limit').innerText = limitLoss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('res-target-val').innerText = targetGain.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    document.getElementById('res-qty-show').innerText = qtyContracts;
    document.getElementById('res-max-pts').innerText = maxPointsLoss + " pts";
    document.getElementById('res-target-pts').innerText = pointsToTarget + " pts";
    
    document.getElementById('res-asset-name').innerText = calcAsset;
    document.getElementById('calc-result-box').style.display = 'block';
}