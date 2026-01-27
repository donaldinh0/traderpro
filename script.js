// CONFIGURAÇÃO
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

// MÁSCARA INPUT
document.addEventListener('DOMContentLoaded', () => {
    const inputVal = document.getElementById('op-value');
    if(inputVal) {
        inputVal.addEventListener('input', function(e) {
            if(inputMode === 'PTS') {
                e.target.value = e.target.value.replace(/\D/g, ""); // Só números
                return;
            }
            // Modo Financeiro (R$ ou US$)
            let value = e.target.value.replace(/\D/g, "");
            let number = Number(value) / 100;
            // Usa a moeda correta detectada (BRL ou USD)
            let locale = currentCurrencySymbol === 'US$' ? 'en-US' : 'pt-BR';
            let currCode = currentCurrencySymbol === 'US$' ? 'USD' : 'BRL';
            
            e.target.value = number.toLocaleString(locale, { style: 'currency', currency: currCode });
        });
    }
});

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
async function cadastro() {
    const nome = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const msg = document.getElementById('msg-auth');
    if(!nome || !email || !password) return msg.innerText = "Preencha tudo.";
    
    msg.innerText = "Criando...";
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { msg.innerText = error.message; return; }
    if (data.user) {
        try {
            await sb.from('trader_perfil').insert([{ user_id: data.user.id, nome: nome, telefone: phone, score: 0, nivel: 'Iniciante' }]);
            alert("Sucesso! Faça Login."); toggleAuth('login');
        } catch (err) { alert("Erro ao salvar perfil, mas conta criada."); toggleAuth('login'); }
    }
}
async function logout() { await sb.auth.signOut(); location.reload(); }

// --- TABS E DADOS ---
window.setTab = function(tabName) {
    document.querySelectorAll('.panel').forEach(el => { el.style.display = 'none'; el.classList.remove('active'); });
    document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
    const panel = document.getElementById('tab-' + tabName);
    if(panel) { panel.style.display = 'block'; setTimeout(() => panel.classList.add('active'), 10); }
    document.querySelectorAll('.pill').forEach(b => { 
        if(b.innerText.toLowerCase().includes(tabName === 'home' ? 'visão' : (tabName==='history'?'histórico':tabName))) b.classList.add('active'); 
    });
    
    if(tabName === 'analytics') renderChart();
    if(tabName === 'checklist') verificarChecklists();
    if(tabName === 'history') renderHistory();
}

async function carregarTudo() {
    if(!currentUser) return;
    let { data: perfil } = await sb.from('trader_perfil').select('*').eq('user_id', currentUser.id).single();
    if (!perfil) {
        const nomeProv = currentUser.email.split('@')[0];
        const { data: novo } = await sb.from('trader_perfil').insert([{ user_id: currentUser.id, nome: nomeProv, score: 0 }]).select().single();
        perfil = novo || { nome: nomeProv, score: 0, nivel: 'Iniciante' };
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

    const tbody = document.getElementById('home-recent-list');
    tbody.innerHTML = '';
    window.userOperations.slice(0, 5).forEach(op => {
        const color = op.resultado === 'GAIN' ? '#2ecc71' : (op.resultado === 'LOSS' ? '#e74c3c' : '#fff');
        // Se for dólar, formata dólar, se não BRL
        let isDollar = op.ativo.includes('FOREX') || op.ativo.includes('CRYPTO') || op.ativo.includes('NASDAQ');
        let valFmt = Number(op.pontos).toLocaleString(isDollar?'en-US':'pt-BR', {style:'currency', currency:isDollar?'USD':'BRL'});
        if(op.ativo.includes('(Pts)')) valFmt = op.pontos + " pts";

        tbody.innerHTML += `<tr><td>${new Date(op.created_at).toLocaleDateString().slice(0,5)}</td><td>${op.ativo}</td><td style="color:${color};font-weight:bold;">${op.resultado}</td><td>${valFmt}</td></tr>`;
    });
    
    const total = window.userOperations.filter(o => o.resultado!=='0x0').length;
    const gains = window.userOperations.filter(o => o.resultado==='GAIN').length;
    document.getElementById('dash-winrate').innerText = total > 0 ? ((gains/total)*100).toFixed(0)+'%' : '0%';
}

// --- LÓGICA DE MOEDA E ATIVOS ---
window.verificarAtivoDolar = function() {
    const asset = document.getElementById('op-asset').value;
    const dolarAssets = ['FOREX', 'CRYPTO', 'NASDAQ'];
    
    if(dolarAssets.includes(asset)) {
        currentCurrencySymbol = 'US$';
    } else {
        currentCurrencySymbol = 'R$';
    }
    
    // Atualiza o label e reseta o input
    setCurrency(inputMode); 
    document.getElementById('op-value').value = '';
}

window.setCurrency = function(mode) {
    inputMode = mode;
    document.getElementById('toggle-brl').className = mode === 'FINANCEIRO' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('toggle-pts').className = mode === 'PTS' ? 'toggle-btn active' : 'toggle-btn';
    
    const lbl = document.getElementById('lbl-value');
    const toggleBtn = document.getElementById('toggle-brl');
    
    if(mode === 'FINANCEIRO') {
        lbl.innerText = `Valor Financeiro (${currentCurrencySymbol})`;
        toggleBtn.innerText = "Financeiro";
    } else {
        lbl.innerText = 'Quantidade de Pontos';
    }
    
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

    // Conversão do valor
    let valParaSalvar = 0;
    if (inputMode === 'FINANCEIRO') {
        valParaSalvar = Number(rawValue.replace(/\D/g, "")) / 100; // Divide por 100 para centavos
    } else {
        valParaSalvar = Number(rawValue); // Pontos puros
    }

    try {
        await sb.from('trader_diario').insert([{
            user_id: currentUser.id,
            ativo: asset + (inputMode === 'PTS' ? ' (Pts)' : ''),
            resultado: currentOpType,
            pontos: valParaSalvar
        }]);

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

// --- HISTÓRICO DIÁRIO (Lógica Nova) ---
function renderHistory() {
    const container = document.getElementById('daily-history-list');
    container.innerHTML = '';

    // Agrupa por data
    const porDia = {};
    window.userOperations.forEach(op => {
        const dia = op.created_at.split('T')[0]; // YYYY-MM-DD
        if(!porDia[dia]) porDia[dia] = { gainCount:0, lossCount:0, financeiro:0, pontosGerados:0 };
        
        let val = Number(op.pontos);
        if(op.resultado === 'GAIN') {
            porDia[dia].gainCount++;
            porDia[dia].financeiro += val;
            porDia[dia].pontosGerados += (10 + Math.floor(val*0.01));
        } else if(op.resultado === 'LOSS') {
            porDia[dia].lossCount++;
            porDia[dia].financeiro -= val;
            porDia[dia].pontosGerados -= 10;
        }
    });

    // Ordena dias (mais recente primeiro)
    const diasOrdenados = Object.keys(porDia).sort().reverse();

    if(diasOrdenados.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Sem histórico ainda.</p>';
        return;
    }

    diasOrdenados.forEach(dia => {
        const dados = porDia[dia];
        const dataFmt = dia.split('-').reverse().join('/');
        const corSaldo = dados.financeiro >= 0 ? '#2ecc71' : '#e74c3c';
        const valFmt = dados.financeiro.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

        const html = `
        <div class="history-day-card">
            <div class="day-header">
                <span class="day-date">${dataFmt}</span>
                <span class="day-result" style="color:${corSaldo}">${valFmt}</span>
            </div>
            <div class="day-stats">
                <span><i class="ri-arrow-up-circle-line" style="color:#2ecc71"></i> ${dados.gainCount} Gains</span>
                <span><i class="ri-arrow-down-circle-line" style="color:#e74c3c"></i> ${dados.lossCount} Loss</span>
                <span class="day-pts">Score do Dia: <b>${dados.pontosGerados > 0 ? '+' : ''}${dados.pontosGerados}</b></span>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

// --- CHECKLISTS INDEPENDENTES ---
async function verificarChecklists() {
    const { data } = await sb.from('trader_perfil').select('check_pre, check_pos').eq('user_id', currentUser.id).single();
    const hoje = new Date().toISOString().split('T')[0];
    
    // PRÉ
    if(data && data.check_pre === hoje) {
        document.getElementById('btn-pre').disabled = true;
        document.getElementById('btn-pre').innerText = "Pré-Mercado OK ✅";
        document.getElementById('status-pre').innerText = "Concluído";
        document.getElementById('status-pre').className = "status-badge success";
        document.querySelectorAll('.chk-pre').forEach(i=>{i.checked=true;i.disabled=true});
    } else {
        document.getElementById('btn-pre').disabled = false;
        document.getElementById('btn-pre').innerText = "CONCLUIR PRÉ (+5 PTS)";
        document.getElementById('status-pre').innerText = "Pendente";
        document.getElementById('status-pre').className = "status-badge pending";
        document.querySelectorAll('.chk-pre').forEach(i=>{i.checked=false;i.disabled=false});
    }

    // PÓS
    if(data && data.check_pos === hoje) {
        document.getElementById('btn-pos').disabled = true;
        document.getElementById('btn-pos').innerText = "Pós-Mercado OK ✅";
        document.getElementById('status-pos').innerText = "Concluído";
        document.getElementById('status-pos').className = "status-badge success";
        document.querySelectorAll('.chk-pos').forEach(i=>{i.checked=true;i.disabled=true});
    } else {
        document.getElementById('btn-pos').disabled = false;
        document.getElementById('btn-pos').innerText = "CONCLUIR PÓS (+5 PTS)";
        document.getElementById('status-pos').innerText = "Pendente";
        document.getElementById('status-pos').className = "status-badge pending";
        document.querySelectorAll('.chk-pos').forEach(i=>{i.checked=false;i.disabled=false});
    }
}

window.salvarChecklist = async function(tipo) {
    const hoje = new Date().toISOString().split('T')[0];
    let updateData = {};
    if(tipo === 'PRE') updateData = { check_pre: hoje };
    if(tipo === 'POS') updateData = { check_pos: hoje };
    
    // +5 Pontos
    let novoScore = parseInt(document.getElementById('dash-score').innerText || 0) + 5;
    updateData.score = novoScore;

    const { error } = await sb.from('trader_perfil').update(updateData).eq('user_id', currentUser.id);

    if(!error) {
        alert("Checklist Salvo! +5 Pontos.");
        document.getElementById('dash-score').innerText = novoScore;
        verificarChecklists();
    }
}

window.openLevelsModal = function() { document.getElementById('modal-levels').style.display = 'flex'; }
window.closeLevelsModal = function() { document.getElementById('modal-levels').style.display = 'none'; }

// GRÁFICOS
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

// --- CALCULADORA DE RISCO ---
window.calcularPositionSize = function() {
    // 1. Pega os valores
    const bank = Number(document.getElementById('calc-bank').value);
    const riskPercent = Number(document.getElementById('calc-risk').value);
    const stopPoints = Number(document.getElementById('calc-stop').value);

    // 2. Validação
    if (!bank || !riskPercent || !stopPoints) {
        alert("Por favor, preencha todos os campos (Banca, Risco e Stop).");
        return;
    }

    // 3. Cálculos
    // Risco Financeiro = Banca * (Porcentagem / 100)
    const riskValue = bank * (riskPercent / 100);
    
    // Valor por Ponto Necessário = Risco Financeiro / Pontos do Stop
    const valuePerPoint = riskValue / stopPoints;

    // Contratos
    // WIN: Cada contrato vale R$ 0,20 por ponto
    const contractsWIN = Math.floor(valuePerPoint / 0.20);
    
    // WDO: Cada contrato vale R$ 10,00 por ponto
    const contractsWDO = Math.floor(valuePerPoint / 10.00);

    // 4. Exibir Resultados
    document.getElementById('res-risk-value').innerText = riskValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('res-per-point').innerText = valuePerPoint.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    document.getElementById('res-contracts-win').innerText = contractsWIN + " contratos";
    document.getElementById('res-contracts-wdo').innerText = contractsWDO + " contratos";

    // Mostra a caixa de resultado
    document.getElementById('calc-result-box').style.display = 'block';
}