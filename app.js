const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_SKUS = [];
let MESTRE_PARADAS = [];
let MESTRE_TNOS = [];
let MESTRE_MAQUINAS = [];

let contadorOrdens = 0;
let contadorParadas = 0;

async function executarLogin() {
    const login = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();
    if (!login || !senha) return alert("Insira suas credenciais.");

    try {
        const res = await fetch(`${API_URL}/usuarios/auth`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ login, senha })
        });

        if (res.ok) {
            usuarioLogado = await res.json();
            inicializarPainel();
        } else {
            alert("Credenciais incorretas.");
        }
    } catch (e) {
        alert("Erro de conexão com o servidor.");
    }
}

function sair() {
    usuarioLogado = null;
    document.getElementById('tela-operador').classList.add('escondido');
    document.getElementById('tela-admin').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.add('escondido');
    document.getElementById('tela-login').classList.remove('escondido');
}

async function inicializarPainel() {
    document.getElementById('tela-login').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.remove('escondido');
    document.getElementById('txt-user').innerText = `Colaborador: ${usuarioLogado.nome}`;

    // Controle de exibição do menu baseado no nível
    if (parseInt(usuarioLogado.nivel) >= 2) {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.remove('escondido'));
    } else {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.add('escondido'));
    }

    await baixarDadosMestres();
    preencherSeletoresIniciais();
    navegarPara('operador');
}

async function baixarDadosMestres() {
    try {
        const res = await fetch(`${API_URL}/dados-mestres`);
        if (res.ok) {
            const data = await res.json();
            MESTRE_SKUS = data.skus;
            MESTRE_PARADAS = data.paradas;
            MESTRE_TNOS = data.tnos;
            MESTRE_MAQUINAS = data.maquinas;
        }
    } catch (e) { console.error("Erro dados mestres", e); }
}

function preencherSeletoresIniciais() {
    const selMq = document.getElementById('ap-maquina');
    selMq.innerHTML = MESTRE_MAQUINAS.map(m => `<option value="${m.numero_maquina}">${m.numero_maquina}</option>`).join('');
    
    // Reset da tela de apontamentos
    document.getElementById('container-ordens').innerHTML = '';
    document.getElementById('container-paradas').innerHTML = '';
    contadorOrdens = 0; contadorParadas = 0;
    adicionarOrdem();
    atualizarRegrasDeMaquina();
}

function atualizarRegrasDeMaquina() {
    const mqNumero = document.getElementById('ap-maquina').value;
    const mqInfo = MESTRE_MAQUINAS.find(m => String(m.numero_maquina) === String(mqNumero));
    const tipoMaquina = mqInfo ? mqInfo.tipo : 'baby_care';

    // Atualiza dinamicamente os selects de parada na tela do operador
    document.querySelectorAll('.select-parada-dinamica').forEach(select => {
        const valorSalvo = select.value;
        select.innerHTML = '<option value="">Selecione o Código</option>';
        MESTRE_PARADAS.filter(p => p.tipo_maquina === tipoMaquina).forEach(p => {
            select.innerHTML += `<option value="${p.numero}">${p.numero} - ${p.problema}</option>`;
        });
        select.value = valorSalvo;
    });
    calcularResumo();
}

function adicionarOrdem() {
    contadorOrdens++;
    const container = document.getElementById('container-ordens');
    
    const skuOpts = MESTRE_SKUS.map(s => `<option value="${s.codigo_sku}">${s.codigo_sku}</option>`).join('');
    const tnoOpts = MESTRE_TNOS.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');

    const html = `
        <div class="dynamic-item" id="ordem-${contadorOrdens}">
            <div class="grid-2">
                <div class="form-group"><label>Nº Ordem (OP):</label><input type="text" class="op-numero"></div>
                <div class="form-group">
                    <label>Código SKU:</label>
                    <select class="op-sku" onchange="atualizarDescricaoSku(${contadorOrdens})">${skuOpts}</select>
                </div>
            </div>
            <div style="font-size:12px; color: var(--text-muted); margin-bottom:10px;" id="sku-desc-${contadorOrdens}">Descrição: ---</div>
            <div class="grid-2">
                <div class="form-group"><label>Horário Padrão (m):</label><input type="number" class="op-hp" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Run Time (m):</label><input type="number" class="op-rt" value="0" oninput="calcularResumo()"></div>
            </div>
            <div class="grid-3">
                <div class="form-group"><label>Counter (Peças):</label><input type="number" class="op-mc" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Pallets:</label><input type="number" class="op-pallets" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Fardos Avulsos:</label><input type="number" class="op-fardos" value="0" oninput="calcularResumo()"></div>
            </div>
            <div class="grid-2">
                <div class="form-group"><label>Classificação TNO:</label><select class="op-tipo-tno">${tnoOpts}</select></div>
                <div class="form-group"><label>Tempo TNO (m):</label><input type="number" class="op-tempo-tno" value="0" oninput="calcularResumo()"></div>
            </div>
            <div style="font-size:12px; color: var(--success-color); font-weight:bold; margin-top:5px;" id="ordem-calc-${contadorOrdens}">Estoque Calculado: 0 peças | Mov: 0% | Loss: 0%</div>
            <button class="btn-danger-small" onclick="removerItem('ordem-${contadorOrdens}')">Remover OP</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
    atualizarDescricaoSku(contadorOrdens);
}

function adicionarParada() {
    contadorParadas++;
    const container = document.getElementById('container-paradas');
    const html = `
        <div class="dynamic-item" id="parada-${contadorParadas}">
            <div class="grid-2">
                <div class="form-group"><label>Código do Defeito:</label><select class="input-parada-cod select-parada-dinamica"></select></div>
                <div class="form-group"><label>Minutos:</label><input type="number" class="input-parada-min" value="0" oninput="calcularResumo()"></div>
            </div>
            <button class="btn-danger-small" onclick="removerItem('parada-${contadorParadas}')">Remover Código</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
    atualizarRegrasDeMaquina();
}

function removerItem(id) { document.getElementById(id).remove(); calcularResumo(); }

function atualizarDescricaoSku(idCard) {
    const skuCod = document.querySelector(`#ordem-${idCard} .op-sku`).value;
    const sku = MESTRE_SKUS.find(s => s.codigo_sku === skuCod);
    document.getElementById(`sku-desc-${idCard}`).innerText = `Descrição: ${sku ? sku.descricao : '---'}`;
    calcularResumo();
}

// ==========================================
// CÁLCULOS DOS CARDS E TRAVAS EM TEMPO REAL
// ==========================================

function calcularResumo() {
    const turno = parseInt(document.getElementById('ap-turno').value);
    const temposTurno = {1: 455, 2: 440, 3: 415};
    const cargaExigida = temposTurnos[turno] || 440;

    let totalMC = 0, totalPecasEstoque = 0, totalHP = 0, totalRT = 0, totalTNO = 0, totalParadas = 0;

    // Processamento matemático de cada card de Ordem de Produção
    document.querySelectorAll("[id^='ordem-']").forEach(div => {
        const idCard = div.id.split('-')[1];
        const skuCod = div.querySelector('.op-sku').value;
        const hp = parseInt(div.querySelector('.op-hp').value || 0);
        const rt = parseInt(div.querySelector('.op-rt').value || 0);
        const mc = parseInt(div.querySelector('.op-mc').value || 0);
        const pallets = parseInt(div.querySelector('.op-pallets').value || 0);
        const fardosAvulsos = parseInt(div.querySelector('.op-fardos').value || 0);
        const tno = parseInt(div.querySelector('.op-tempo-tno').value || 0);

        const sku = MESTRE_SKUS.find(s => s.codigo_sku === skuCod);
        let pecasOrdem = 0;
        if (sku) {
            const fardosTotais = (pallets * sku.fardos_por_pallet) + fardosAvulsos;
            pecasOrdem = fardosTotais * sku.pacotes_por_fardo * sku.fraldas_por_pacote;
        }

        let movOrdem = hp > 0 ? ((rt / hp) * 100).toFixed(1) : 0;
        let lossOrdem = mc > 0 ? (((mc - pecasOrdem) / mc) * 100).toFixed(1) : 0;

        document.getElementById(`ordem-calc-${idCard}`).innerText = `Estoque Calculado: ${pecasOrdem.toLocaleString()} peças | Mov: ${movOrdem}% | Loss: ${lossOrdem}%`;

        totalMC += mc;
        totalPecasEstoque += pecasOrdem;
        totalHP += hp;
        totalRT += rt;
        totalTNO += tno;
    });

    document.querySelectorAll('.input-parada-min').forEach(el => totalParadas += parseInt(el.value || 0));

    // Atualização dos Painéis de KPI superiores
    document.getElementById('card-mc').innerText = totalMC.toLocaleString();
    document.getElementById('card-pecas').innerText = totalPecasEstoque.toLocaleString();
    document.getElementById('card-mov').innerText = totalHP > 0 ? `${((totalRT / totalHP) * 100).toFixed(1)}%` : '0%';
    document.getElementById('card-loss').innerText = totalMC > 0 ? `${(((totalMC - totalPecasEstoque) / totalMC) * 100).toFixed(1)}%` : '0%';
    document.getElementById('card-tno').innerText = `${totalTNO}m`;
    document.getElementById('card-paradas').innerText = `${totalParadas}m`;

    // Atualização da caixa de Trava Visual
    document.getElementById('res-carga').innerText = `${cargaExigida}m`;
    const tempoTotalApontado = totalHP + totalTNO;
    const elResTotal = document.getElementById('res-total');
    elResTotal.innerText = `${tempoTotalApontado}m`;
    const trava1Ok = tempoTotalApontado === cargaExigida;
    elResTotal.className = trava1Ok ? 'status-ok' : 'status-erro';

    const paradasEsperadas = totalHP - totalRT;
    document.getElementById('res-parada-calc').innerText = `${paradasEsperadas}m`;
    const elResParada = document.getElementById('res-parada-apon');
    elResParada.innerText = `${totalParadas}m`;
    const trava2Ok = paradasEsperadas === totalParadas && paradasEsperadas >= 0;
    elResParada.className = trava2Ok ? 'status-ok' : 'status-erro';

    document.getElementById('btn-enviar-apontamento').disabled = !(trava1Ok && trava2Ok);
}

async function enviarApontamento() {
    const btn = document.getElementById('btn-enviar-apontamento');
    btn.innerText = "Salvando..."; btn.disabled = true;

    const payload = {
        data_registro: document.getElementById('ap-data').value,
        turno: parseInt(document.getElementById('ap-turno').value),
        operador: usuarioLogado.nome,
        maquina: parseInt(document.getElementById('ap-maquina').value),
        ordens: [],
        paradas: []
    };

    document.querySelectorAll("[id^='ordem-']").forEach(div => {
        payload.ordens.push({
            ordem: div.querySelector('.op-numero').value,
            codigo_sku: div.querySelector('.op-sku').value,
            horario_padrao: parseInt(div.querySelector('.op-hp').value || 0),
            run_time: parseInt(div.querySelector('.op-rt').value || 0),
            machine_counter: parseInt(div.querySelector('.op-mc').value || 0),
            pallets: parseInt(div.querySelector('.op-pallets').value || 0),
            fardos_avulsos: parseInt(div.querySelector('.op-fardos').value || 0),
            tipo_tno: div.querySelector('.op-tipo-tno').value,
            tempo_tno: parseInt(div.querySelector('.op-tempo-tno').value || 0)
        });
    });

    document.querySelectorAll("[id^='parada-']").forEach(div => {
        payload.paradas.push({
            numero_parada: div.querySelector('.input-parada-cod').value,
            minutos_parados: parseInt(div.querySelector('.input-parada-min').value || 0)
        });
    });

    try {
        const res = await fetch(`${API_URL}/apontamentos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert("✔ Apontamento enviado com sucesso!");
            preencherSeletoresIniciais();
        } else {
            const err = await res.json();
            alert(`Erro: ${err.detail}`);
        }
    } catch(e) { alert("Erro de rede."); }
    finally { btn.innerText = "Gravar Apontamento de Turno"; }
}

// ==========================================
// FUNÇÕES DO PAINEL GERENCIAL (ADMIN)
// ==========================================

function navegarPara(idAba) {
    document.getElementById('tela-operador').classList.add('escondido');
    document.getElementById('tela-admin').classList.add('escondido');
    document.getElementById('nav-op').classList.remove('ativo');
    document.getElementById('nav-adm').classList.remove('ativo');

    if (idAba === 'operador') {
        document.getElementById('tela-operador').classList.remove('escondido');
        document.getElementById('nav-op').classList.add('ativo');
    } else {
        document.getElementById('tela-admin').classList.remove('escondido');
        document.getElementById('nav-adm').classList.add('ativo');
        carregarHistoricoAdmin();
    }
}

async function carregarHistoricoAdmin() {
    const container = document.getElementById('lista-historico');
    if (!container) return;
    container.innerHTML = "Carregando histórico...";

    try {
        const res = await fetch(`${API_URL}/historico-lancamentos`);
        if (res.ok) {
            const logs = await res.json();
            container.innerHTML = logs.length === 0 ? "<p>Nenhum lançamento encontrado.</p>" : "";
            logs.forEach(l => {
                container.innerHTML += `
                    <div class="item-backoffice">
                        <div>
                            <strong>Data: ${l.data_registro.split('-').reverse().join('/')} | Turno ${l.turno} | Mq ${l.maquina_numero}</strong><br>
                            <span style="font-size:11px; color:var(--text-muted);">Apontado por: ${l.operador} | Counter Total: ${parseFloat(l.total_mc).toLocaleString()}</span>
                        </div>
                        <button class="btn-danger-small" onclick="deletarHistorico(${l.id})">Excluir</button>
                    </div>`;
            });
        }
    } catch(e) { container.innerHTML = "Erro ao carregar dados."; }
}

async function deletarHistorico(id) {
    if (!confirm("Deletar permanentemente este apontamento do banco de dados?")) return;
    try {
        const res = await fetch(`${API_URL}/historico-lancamentos/${id}`, { method: 'DELETE' });
        if (res.ok) { alert("Lançamento excluído!"); carregarHistoricoAdmin(); }
    } catch(e) { alert("Erro ao deletar."); }
}

async function adicionarMaquinaMestre() {
    const numero_maquina = parseInt(document.getElementById('adm-m-numero').value);
    const tipo = document.getElementById('adm-m-tipo').value;
    if(!numero_maquina) return alert("Insira o número.");

    const res = await fetch(`${API_URL}/admin/maquinas`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ numero_maquina, tipo })
    });
    if(res.ok) { alert("Máquina adicionada!"); baixarDadosMestres(); preencherSeletoresIniciais(); }
}

async function adicionarParadaMestre() {
    const tipo_maquina = document.getElementById('adm-p-tipo').value;
    const numero = document.getElementById('adm-p-numero').value.trim();
    const problema = document.getElementById('adm-p-problema').value.trim();

    const res = await fetch(`${API_URL}/admin/paradas`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ tipo_maquina, numero, problema })
    });
    if(res.ok) { alert("Código mestre de parada salvo!"); baixarDadosMestres(); atualizarRegrasDeMaquina(); }
}

async function adicionarTnoMestre() {
    const nome = document.getElementById('adm-tno-nome').value.trim();
    const res = await fetch(`${API_URL}/admin/tnos`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ nome })
    });
    if(res.ok) { alert("Nova estratificação de TNO cadastrada!"); baixarDadosMestres(); preencherSeletoresIniciais(); }
}

async function adicionarUsuarioMestre() {
    const nome = document.getElementById('adm-u-nome').value.trim();
    const login = document.getElementById('adm-u-login').value.trim().toLowerCase();
    const senha = document.getElementById('adm-u-senha').value;
    const nivel = parseInt(document.getElementById('adm-u-nivel').value);

    const res = await fetch(`${API_URL}/admin/usuarios`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ login, senha, nome, nivel })
    });
    if(res.ok) alert("Novo colaborador adicionado ao banco de dados!");
}
