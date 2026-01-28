// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://lqxntblxbvmzhpwezvte.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxeG50Ymx4YnZtemhwd2V6dnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxOTM3NjUsImV4cCI6MjA4NDc2OTc2NX0._Pd_0eNS7pTeON2McZ9c9k6_JqDNxDje6SVogcG4jMk';

let sb;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error("Erro SB", e); }

// GLOBAIS
let currentUser = null;
let currentOpType = ''; 
let inputMode = 'FINANCEIRO'; // 'FINANCEIRO' ou 'PTS'
let currentCurrencySymbol = 'R$'; // R$ ou US$
let userOperations = []; 

// --- MÁSCARAS DE INPUT (Executa ao carregar) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Máscara do Registro de Trade
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

    // 2. Máscara da Calculadora (Banca)
    const inputBank = document.getElementById('calc-bank');
    if(inputBank) {
        inputBank.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, "");
            let number = Number(value) / 100;
            e.target.value = number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        });
    }

    // 3. Máscara da Calculadora (Stop)
    const inputStop = document.getElementById('calc-stop');
    if(inputStop) {
        inputStop.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, "");
            if (value === "") e.target.value = "";
            else e.target.value = value + " pts";
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

// --- AUTH (LOGIN / LOGOUT / TOGGLE) ---
// A função que estava faltando:
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

// --- CADASTRO INTELIGENTE (TRIAL 30 DIAS + VERIFICAÇÃO LASTLINK) ---
async function cadastro() {
    const nome = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-auth');

    if(!nome || !email || !password) return msg.innerText = "Preencha todos os campos.";
    
    msg.innerText = "Criando sua conta...";

    try {
        // 1. Cria o Login
        const { data, error } = await sb.auth.signUp({ email, password });

        if (error) {
            msg.innerText = "Erro: " + error.message;
            return;
        }

        if (data.user) {
            // 2. Verifica se JÁ PAGOU na Lastlink (Lista VIP)
            const { data: compra } = await sb.from('compras_lastlink').select('*').eq('email', email).single();
            
            let statusInicial = 'teste_gratis'; // Padrão é Trial
            if (compra) statusInicial = 'ativo'; // Se já pagou, vira Ativo direto

            // 3. Calcula data de expiração (Hoje + 30 dias)
            const dataHoje = new Date();
            dataHoje.setDate(dataHoje.getDate() + 30); 
            const dataFimTrial = dataHoje.toISOString();

            // 4. Salva no Banco
            await sb.from('trader_perfil').insert([{ 
                user_id: data.user.id, 
                nome: nome,
                telefone: phone,
                email: email,
                score: 0, 
                nivel: 'Iniciante',
                status_assinatura: statusInicial,
                fim_trial: dataFimTrial
            }]);

            if(statusInicial === 'ativo') {
                alert("Pagamento confirmado! Bem-vindo ao Trader PRO.");
            } else {
                alert("Conta criada! Você ganhou 30 dias de acesso gratuito.");
            }
            toggleAuth('login');
        }
    } catch (err) {
        console.error(err);
        msg.innerText = "Erro ao criar conta.";
    }
}

// --- NAVEGAÇÃO ENTRE ABAS ---
window.setTab = function(tabName) {
    document.querySelectorAll('.panel').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
    
    const panel = document.getElementById('tab-' + tabName);
    if(panel) { panel.style.display = 'block'; setTimeout(() => panel.classList.add('active'), 10); }
    
    // Ativa botão correspondente
    document.querySelectorAll('.pill').forEach(b => { 
        const txt = b.innerText.toLowerCase();
        if(txt.includes(tabName === 'home' ? 'visão' : tabName === 'history' ? 'histórico' : tabName === 'calculator' ? 'calculadora' : tabName === 'analytics' ? 'performance' : tabName)) 
            b.classList.add('active'); 
    });
    
    if(tabName === 'analytics') renderChart();
    if(tabName === 'checklist') verificarChecklists();
    if(tabName === 'history') renderHistory();
}

// --- CARREGAMENTO DE DADOS E CATRACA (BLOQUEIO) ---
async function carregarTudo() {
    if(!currentUser) return;

    // Busca Perfil
    let { data: perfil, error } = await sb.from('trader_perfil').select('*').eq('user_id', currentUser.id).single();

    // Fallback se não existir perfil
    if (!perfil || error) {
        const nomeProv = currentUser.email.split('@')[0];
        const dataHoje = new Date(); dataHoje.setDate(dataHoje.getDate() + 30);
        
        const { data: novo } = await sb.from('trader_perfil').insert([{ 
            user_id: currentUser.id, nome: nomeProv, score: 0, status_assinatura: 'teste_gratis', fim_trial: dataHoje.toISOString() 
        }]).select().single();
        perfil = novo || { nome: nomeProv, score: 0, status_assinatura: 'teste_gratis', fim_trial: dataHoje.toISOString() };
    }

    // --- CATRACA INTELIGENTE (TRIAL 30 DIAS) ---
    const hoje = new Date();
    const dataFim = perfil.fim_trial ? new Date(perfil.fim_trial) : new Date();
    
    let acessoLiberado = false;
    let diasRestantes = 0;

    if (perfil.status_assinatura === 'ativo') {
        acessoLiberado = true;
    } else {
        if (hoje < dataFim) {
            acessoLiberado = true;
            const diferencaTempo = dataFim - hoje;
            diasRestantes = Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24));
        } else {
            acessoLiberado = false;
        }
    }

    if (!acessoLiberado) {
        document.getElementById('app-screen').innerHTML = `
            <div style="text-align:center; padding:50px; color:#fff;">
                <h1 style="color:var(--loss); font-size:3rem;"><i class="ri-timer-flash-line"></i></h1>
                <h2>Seus 30 dias grátis acabaram!</h2>
                <p>Espero que tenha gostado do Trader PRO. Para continuar evoluindo, assine agora.</p>
                <br>
                <a href="https://lastlink.com/p/C495D678C/checkout-payment/" target="_blank" class="btn-primary" style="text-decoration:none; display:inline-block; max-width:300px;">ASSINAR AGORA</a>
                <br><br>
                <button onclick="logout()" style="background:none; border:none; color:#aaa; cursor:pointer;">Sair</button>
            </div>`;
        return; 
    }

    // AVISO DE TRIAL
    if (perfil.status_assinatura !== 'ativo' && diasRestantes <= 30) {
        const avisoId = 'trial-warning';
        if(!document.getElementById(avisoId)){
            const aviso = document.createElement('div');
            aviso.id = avisoId;
            aviso.style = "background:#e67e22; color:#fff; text-align:center; padding:5px; font-size:0.8rem; font-weight:bold;";
            aviso.innerText = `🔥 Período de Teste: Restam ${diasRestantes} dias.`;
            document.body.prepend(aviso);
        }
    }

    // Preenche UI
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

    const tbody = document.getElementById('home-recent-list');
    tbody.innerHTML = '';
    window.userOperations.slice(0, 5).forEach(op => {
        const color = op.resultado === 'GAIN' ? '#2ecc71' : (op.resultado === 'LOSS' ? '#e74c3c' : '#fff');
        let isDollar = op.ativo.includes('FOREX') || op.ativo.includes('CRYPTO') || op.ativo.includes('NASDAQ');
        let valFmt = Number(op.pontos).toLocaleString(isDollar?'en-US':'pt-BR', {style:'currency', currency:isDollar?'USD':'BRL'});
        if(op.ativo.includes('(Pts)')) valFmt = op.pontos + " pts";
        tbody.innerHTML += `<tr><td>${new Date(op.created_at).toLocaleDateString().slice(0,5)}</td><td>${op.ativo}</td><td style="color:${color};font-weight:bold;">${op.resultado}</td><td>${valFmt}</td></tr>`;
    });
    
    const total = window.userOperations.filter(o => o.resultado!=='0x0').length;
    const gains = window.userOperations.filter(o => o.resultado==='GAIN').length;
    document.getElementById('dash-winrate').innerText = total > 0 ? ((gains/total)*100).toFixed(0)+'%' : '0%';
}

// --- OPERAÇÕES ---
window.verificarAtivoDolar = function() {
    const asset = document.getElementById('op-asset').value;
    const dolarAssets = ['FOREX', 'CRYPTO', 'NASDAQ'];
    currentCurrencySymbol = dolarAssets.includes(asset) ? 'US$' : 'R$';
    setCurrency(inputMode); 
    document.getElementById('op-value').value = '';
}

window.setCurrency = function(mode) {
    inputMode = mode;
    document.getElementById('toggle-brl').className = mode === 'FINANCEIRO' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('toggle-pts').className = mode === 'PTS' ? 'toggle-btn active' : 'toggle-btn';
    const lbl = document.getElementById('lbl-value');
    const toggleBtn = document.getElementById('toggle-brl');
    if(mode === 'FINANCEIRO') { lbl.innerText = `Valor Financeiro (${currentCurrencySymbol})`; toggleBtn.innerText = "Financeiro"; } else { lbl.innerText = 'Quantidade de Pontos'; }
    document.getElementById('op-value').value = '';
}

window.selectType = function(type) {
    currentOpType = type;
    document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
    if(type === 'GAIN') document.getElementById('btn-gain').classList.add('active');
    if(type === 'LOSS') document.getElementById('btn-loss').classList.add('active');
    if(type === '0x0') document.getElementById('btn-zero').classList.add('active');
    const feed = document.getElementById('score-feedback');
    if(type === 'GAIN') feed.innerText = "GAIN: +10 pts + 1% do resultado!";
    if(type === 'LOSS') feed.innerText = "LOSS: -10 pts de penalidade.";
    if(type === '0x0') feed.innerText = "0x0: +1 pt.";
    feed.style.color = type === 'LOSS' ? '#e74c3c' : (type === 'GAIN' ? '#2ecc71' : 'var(--brand)');
}

window.salvarOperacao = async function() {
    const asset = document.getElementById('op-asset').value;
    const rawValue = document.getElementById('op-value').value;
    if(!currentOpType || !rawValue) return alert("Preencha Resultado e Valor.");
    
    const btn = event.target; btn.innerText = "Salvando..."; btn.disabled = true;

    let valParaSalvar = 0;
    if (inputMode === 'FINANCEIRO') valParaSalvar = Number(rawValue.replace(/\D/g, "")) / 100;
    else valParaSalvar = Number(rawValue);

    try {
        await sb.from('trader_diario').insert([{ user_id: currentUser.id, ativo: asset + (inputMode === 'PTS' ? ' (Pts)' : ''), resultado: currentOpType, pontos: valParaSalvar }]);
        let ptsChange = 0;
        if(currentOpType === 'GAIN') ptsChange = 10 + Math.floor(valParaSalvar * 0.01);
        if(currentOpType === 'LOSS') ptsChange = -10;
        if(currentOpType === '0x0') ptsChange = 1;

        let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + ptsChange;
        await sb.from('trader_perfil').update({ score: novoScore }).eq('user_id', currentUser.id);

        alert(`Trade Registrado! ${ptsChange} pts.`);
        document.getElementById('op-value').value = '';
        await carregarTudo();
        setTab('home');
    } catch (e) { console.error(e); alert("Erro ao salvar."); } 
    finally { btn.innerText = "SALVAR NO DIÁRIO"; btn.disabled = false; }
}

// --- HISTÓRICO ---
function renderHistory() {
    const container = document.getElementById('daily-history-list');
    container.innerHTML = '';
    const porDia = {};
    window.userOperations.forEach(op => {
        const dia = op.created_at.split('T')[0];
        if(!porDia[dia]) porDia[dia] = { gainCount:0, lossCount:0, financeiro:0, pontosGerados:0 };
        let val = Number(op.pontos);
        if(op.resultado === 'GAIN') { porDia[dia].gainCount++; porDia[dia].financeiro += val; porDia[dia].pontosGerados += (10 + Math.floor(val*0.01)); } 
        else if(op.resultado === 'LOSS') { porDia[dia].lossCount++; porDia[dia].financeiro -= val; porDia[dia].pontosGerados -= 10; }
    });
    const diasOrdenados = Object.keys(porDia).sort().reverse();
    if(diasOrdenados.length === 0) { container.innerHTML = '<p style="text-align:center;color:#666;">Sem histórico.</p>'; return; }

    diasOrdenados.forEach(dia => {
        const dados = porDia[dia];
        const corSaldo = dados.financeiro >= 0 ? '#2ecc71' : '#e74c3c';
        const valFmt = dados.financeiro.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        container.innerHTML += `<div class="history-day-card"><div class="day-header"><span class="day-date">${dia.split('-').reverse().join('/')}</span><span class="day-result" style="color:${corSaldo}">${valFmt}</span></div><div class="day-stats"><span><i class="ri-arrow-up-circle-line" style="color:#2ecc71"></i> ${dados.gainCount} Gains</span><span><i class="ri-arrow-down-circle-line" style="color:#e74c3c"></i> ${dados.lossCount} Loss</span><span class="day-pts">Score: <b>${dados.pontosGerados > 0 ? '+' : ''}${dados.pontosGerados}</b></span></div></div>`;
    });
}

// --- CHECKLIST ---
async function verificarChecklists() {
    const { data } = await sb.from('trader_perfil').select('check_pre, check_pos').eq('user_id', currentUser.id).single();
    const hoje = new Date().toISOString().split('T')[0];
    
    const updateCheck = (tipo, btnId, statusId, checkClass) => {
        const feito = data && data[tipo] === hoje;
        const btn = document.getElementById(btnId);
        const status = document.getElementById(statusId);
        if(feito) {
            btn.disabled = true; btn.innerText = "Concluído ✅"; status.innerText = "Concluído"; status.className = "status-badge success";
            document.querySelectorAll(checkClass).forEach(i=>{i.checked=true;i.disabled=true});
        } else {
            btn.disabled = false; status.innerText = "Pendente"; status.className = "status-badge pending";
            document.querySelectorAll(checkClass).forEach(i=>{i.checked=false;i.disabled=false});
        }
    }
    updateCheck('check_pre', 'btn-pre', 'status-pre', '.chk-pre');
    updateCheck('check_pos', 'btn-pos', 'status-pos', '.chk-pos');
}

window.salvarChecklist = async function(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    let updateData = {};
    if(tipo === 'PRE') updateData = { check_pre: hoje };
    if(tipo === 'POS') updateData = { check_pos: hoje };
    let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + 5;
    updateData.score = novoScore;
    const { error } = await sb.from('trader_perfil').update(updateData).eq('user_id', currentUser.id);
    if(!error) { alert("Checklist Salvo! +5 Pontos."); document.getElementById('dash-score').innerText = novoScore; verificarChecklists(); }
}

// --- CALCULADORA ---
window.calcularPositionSize = function() {
    const rawBank = document.getElementById('calc-bank').value;
    const rawStop = document.getElementById('calc-stop').value;
    const riskPercent = Number(document.getElementById('calc-risk').value);

    const bank = Number(rawBank.replace(/\D/g, "")) / 100;
    const stopPoints = Number(rawStop.replace(/\D/g, ""));

    if (!bank || !riskPercent || !stopPoints) return alert("Preencha todos os campos.");

    const riskValue = bank * (riskPercent / 100);
    const valuePerPoint = riskValue / stopPoints;
    const contractsWIN = Math.floor(valuePerPoint / 0.20);
    const contractsWDO = Math.floor(valuePerPoint / 10.00);

    document.getElementById('res-risk-value').innerText = riskValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('res-per-point').innerText = valuePerPoint.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('res-contracts-win').innerText = contractsWIN + " contratos";
    document.getElementById('res-contracts-wdo').innerText = contractsWDO + " contratos";
    document.getElementById('calc-result-box').style.display = 'block';
}

// --- MODAL E GRÁFICOS ---
window.openLevelsModal = function() { document.getElementById('modal-levels').style.display = 'flex'; }
window.closeLevelsModal = function() { document.getElementById('modal-levels').style.display = 'none'; }

window.renderChart = function() {
    const ctx = document.getElementById('chart-equity'); if(!ctx) return;
    const cronoOps = [...window.userOperations].reverse();
    let lbl=[], dat=[], acc=0;
    cronoOps.forEach(op=>{
        let v=Number(op.pontos); if(op.resultado==='LOSS') v=-v; if(op.resultado==='0x0') v=0;
        acc+=v; lbl.push(new Date(op.created_at).toLocaleDateString().slice(0,5)); dat.push(acc);
    });
    if(window.myChart instanceof Chart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {type:'line',data:{labels:lbl,datasets:[{label:'R$',data:dat,borderColor:'#66fcf1',backgroundColor:'rgba(102, 252, 241, 0.1)',fill:true}]},options:{responsive:true,scales:{y:{grid:{color:'#2d3436'}},x:{display:false}},plugins:{legend:{display:false}}}});
}