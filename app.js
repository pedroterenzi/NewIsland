const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_SKUS = [];
let MESTRE_PARADAS = [];
let MESTRE_TNOS = [];
let MESTRE_MAQUINAS = [];
let MESTRE_USUARIOS = [];

let contadorOrdens = 0;
let contadorParadas = 0;

async function executarLogin() {
    const login = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();
    if (!login || !senha) return alert("Insira suas credenciais.");

    const btn = document.getElementById('btn-entrar');
    btn.innerText = "Conectando..."; btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/usuarios/auth`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ login, senha })
        });

        if (res.ok) {
            usuarioLogado = await res.json();
            await inicializarPainel();
        } else {
            alert("Credenciais incorretas.");
        }
    } catch (e) {
        alert("Erro de conexão com o servidor. Aguarde e tente novamente.");
    } finally {
        btn.innerText = "Entrar no Sistema"; btn.disabled = false;
    }
}

function sair() {
    usuarioLogado = null;
    document.getElementById('tela-operador').classList.add('escondido');
    document.getElementById('tela-admin').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.add('escondido');
    document.getElementById('tela-login').classList.remove('escondido');
    document.getElementById('login-senha').value = '';
}

function fecharModal(id) {
    document.getElementById(id).classList.add('escondido');
}

async function inicializarPainel() {
    document.getElementById('tela-login').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.remove('escondido');
    
    navegarPara('operador');
    document.getElementById('txt-user').innerText = `Operador: ${usuarioLogado.nome}`;

    if (parseInt(usuarioLogado.nivel) >= 2) {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.remove('escondido'));
    } else {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.add('escondido'));
    }

    const inputData = document.getElementById('ap-data');
    if (inputData) inputData.value = new Date().toISOString().split('T')[0];

    await baixarDadosMestres();
    preencherSeletoresIniciais();
}

async function baixarDadosMestres() {
    try {
        const res = await fetch(`${API_URL}/dados-mestres`);
        if (res.ok) {
            const data = await res.json();
            MESTRE_SKUS = data.skus || [];
            MESTRE_PARADAS = data.paradas || [];
            MESTRE_TNOS = data.tnos || [];
            MESTRE_MAQUINAS = data.maquinas || [];
        }
        
        if(parseInt(usuarioLogado.nivel) >= 2) {
            const resU = await fetch(`${API_URL}/admin/usuarios`);
            if (resU.ok) MESTRE_USUARIOS = await resU.json();
        }
    } catch (e) { console.error("Erro ao sincronizar dados", e); }
}

function preencherSeletoresIniciais() {
    const selMq = document.getElementById('ap-maquina');
    if (MESTRE_MAQUINAS.length > 0) {
        selMq.innerHTML = MESTRE_MAQUINAS.map(m => `<option value="${m.numero_maquina}">Máquina ${m.numero_maquina}</option>`).join('');
    } else {
        selMq.innerHTML = '<option value="">Sem máquinas</option>';
    }
    
    document.getElementById('container-ordens').innerHTML = '';
    document.getElementById('container-paradas').innerHTML = '';
    contadorOrdens = 0; contadorParadas = 0;
    
    adicionarOrdem();
    atualizarRegrasDeMaquina();
}

function atualizarRegrasDeMaquina() {
    document.querySelectorAll(".card-parada").forEach(div => {
        const idCard = div.id.replace('parada-', '');
        const inputEl = div.querySelector('.input-parada-cod');
        if (inputEl) buscarDescricaoParada(inputEl, idCard);
    });
    calcularResumo();
}

function adicionarOrdem() {
    contadorOrdens++;
    const container = document.getElementById('container-ordens');
    
    let skuOpts = '<option value="">Selecione o SKU</option>';
    skuOpts += MESTRE_SKUS.map(s => `<option value="${s.codigo_sku}">${s.codigo_sku}</option>`).join('');
    
    let tnoOpts = '<option value="">Nenhum (0 min)</option>';
    tnoOpts += MESTRE_TNOS.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');

    const html = `
        <div class="dynamic-item card-ordem" id="ordem-${contadorOrdens}">
            <div class="grid-2">
                <div class="form-group"><label>Nº Ordem (OP):</label><input type="text" class="op-numero"></div>
                <div class="form-group">
                    <label>Código SKU:</label>
                    <select class="op-sku" onchange="atualizarDescricaoSku(${contadorOrdens})">${skuOpts}</select>
                </div>
            </div>
            <div style="font-size:12px; color: var(--accent-orange); font-weight:bold; margin-bottom:10px;" id="sku-desc-${contadorOrdens}">Descrição: ---</div>
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
            <div style="font-size:13px; color: var(--success-color); font-weight:bold; margin-top:5px; padding-top: 10px; border-top: 1px solid #334155;" id="ordem-calc-${contadorOrdens}">Estoque: 0 peças | Mov: 0% | Loss: 0%</div>
            <button class="btn-small-delete" onclick="removerItem('ordem-${contadorOrdens}')">Remover Ordem</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
    atualizarDescricaoSku(contadorOrdens);
}

// CORREÇÃO MESTRE: Input de texto com busca e confirmação dinâmica
function adicionarParada() {
    contadorParadas++;
    const container = document.getElementById('container-paradas');
    const html = `
        <div class="dynamic-item card-parada" id="parada-${contadorParadas}">
            <div class="grid-2">
                <div class="form-group">
                    <label>Código do Defeito (Nº):</label>
                    <input type="text" class="input-parada-cod" placeholder="Ex: 11" oninput="buscarDescricaoParada(this, ${contadorParadas})">
                </div>
                <div class="form-group"><label>Minutos:</label><input type="number" class="input-parada-min" value="0" oninput="calcularResumo()"></div>
            </div>
            <div style="font-size:12px; color: var(--accent-orange); font-weight:bold; margin-top:5px;" id="parada-desc-${contadorParadas}">Descrição: Digite o código...</div>
            <button class="btn-small-delete" style="margin-top:10px;" onclick="removerItem('parada-${contadorParadas}')">Remover Parada</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

function buscarDescricaoParada(inputEl, idCard) {
    const numero = inputEl.value.trim();
    const mqNumero = document.getElementById('ap-maquina').value;
    const mqInfo = MESTRE_MAQUINAS.find(m => String(m.numero_maquina) === String(mqNumero));
    const tipoMaquina = mqInfo ? mqInfo.tipo : 'baby_care';

    const parada = MESTRE_PARADAS.find(p => p.tipo_maquina === tipoMaquina && String(p.numero) === String(numero));
    const descEl = document.getElementById(`parada-desc-${idCard}`);
    if (descEl) {
        descEl.innerText = parada ? `Confirmado: ${parada.problema}` : "Descrição: Código não encontrado.";
        descEl.style.color = parada ? "var(--success-color)" : "var(--danger-color)";
    }
    calcularResumo();
}

function removerItem(id) { document.getElementById(id).remove(); calcularResumo(); }

function atualizarDescricaoSku(idCard) {
    const skuCod = document.querySelector(`#ordem-${idCard} .op-sku`).value;
    const sku = MESTRE_SKUS.find(s => s.codigo_sku === skuCod);
    document.getElementById(`sku-desc-${idCard}`).innerText = `Descrição: ${sku ? sku.descricao : 'Selecione o produto'}`;
    calcularResumo();
}

function calcularResumo() {
    const turno = parseInt(document.getElementById('ap-turno').value || 1);
    const temposTurno = {1: 455, 2: 440, 3: 415};
    const cargaExigida = temposTurno[turno] || 440;

    let totalMC = 0, totalPecasEstoque = 0, totalHP = 0, totalRT = 0, totalTNO = 0, totalParadas = 0;

    document.querySelectorAll(".card-ordem").forEach(div => {
        const idCard = div.id.replace('ordem-', '');
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

        document.getElementById(`ordem-calc-${idCard}`).innerText = `Estoque: ${pecasOrdem.toLocaleString()} peças | Mov: ${movOrdem}% | Loss: ${lossOrdem}%`;

        totalMC += mc;
        totalPecasEstoque += pecasOrdem;
        totalHP += hp;
        totalRT += rt;
        totalTNO += tno;
    });

    document.querySelectorAll('.input-parada-min').forEach(el => totalParadas += parseInt(el.value || 0));

    document.getElementById('card-mc').innerText = totalMC.toLocaleString();
    document.getElementById('card-pecas').innerText = totalPecasEstoque.toLocaleString();
    document.getElementById('card-mov').innerText = totalHP > 0 ? `${((totalRT / totalHP) * 100).toFixed(1)}%` : '0%';
    document.getElementById('card-loss').innerText = totalMC > 0 ? `${(((totalMC - totalPecasEstoque) / totalMC) * 100).toFixed(1)}%` : '0%';
    document.getElementById('card-tno').innerText = `${totalTNO}m`;
    document.getElementById('card-paradas').innerText = `${totalParadas}m`;

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

    document.querySelectorAll(".card-ordem").forEach(div => {
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

    document.querySelectorAll(".card-parada").forEach(div => {
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
            alert(`Erro ao salvar:\n${err.detail}`);
        }
    } catch(e) { alert("Erro de rede ao salvar."); }
    finally { 
        btn.innerText = "Gravar Apontamento de Turno"; 
        calcularResumo(); 
    }
}

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
        renderizarListasGerenciais();
    }
}

// RENDEREIZAÇÃO DOS CADASTROS COM MODAL DE ATUALIZAÇÃO
function renderizarListasGerenciais() {
    carregarHistoricoAdmin();

    const boxSkus = document.getElementById('lista-skus-cadastrados');
    if(boxSkus) {
        boxSkus.innerHTML = MESTRE_SKUS.map(s => `
            <div class="item-backoffice">
                <div><strong>${s.codigo_sku}</strong> - ${s.descricao}<br><span style="font-size:11px;color:gray;">Fralda/Pct: ${s.fraldas_por_pacote} | Fardo: ${s.pacotes_por_fardo} | Pallet: ${s.fardos_por_pallet}</span></div>
                <button class="btn-small-edit" onclick="abrirEdicaoSku(${s.id})">Editar</button>
            </div>`).join('');
    }

    const boxMqs = document.getElementById('lista-maquinas-cadastradas');
    if(boxMqs) {
        boxMqs.innerHTML = MESTRE_MAQUINAS.map(m => `
            <div class="item-backoffice">
                <div><strong>Máquina ${m.numero_maquina}</strong> (${m.tipo === 'baby_care' ? 'Baby' : 'Adulto'})</div>
                <span style="color:var(--accent-orange); font-size:12px; font-weight:bold;">Ativa</span>
            </div>`).join('');
    }

    const boxP = document.getElementById('lista-paradas-cadastradas');
    if(boxP) {
        boxP.innerHTML = MESTRE_PARADAS.map(p => `
            <div class="item-backoffice">
                <div><strong>[${p.tipo_maquina === 'baby_care' ? 'Baby' : 'Adulto'}] Cód ${p.numero}</strong> - ${p.problema}</div>
            </div>`).join('');
    }

    const boxT = document.getElementById('lista-tnos-cadastrados');
    if(boxT) {
        boxT.innerHTML = MESTRE_TNOS.map(t => `<div class="item-backoffice"><div>${t.nome}</div></div>`).join('');
    }

    const boxU = document.getElementById('lista-usuarios-cadastrados');
    if(boxU) {
        boxU.innerHTML = MESTRE_USUARIOS.map(u => `<div class="item-backoffice"><div><strong>${u.nome}</strong> (Login: ${u.login})</div></div>`).join('');
    }
}

async function carregarHistoricoAdmin() {
    const container = document.getElementById('lista-historico');
    if (!container) return;
    try {
        const res = await fetch(`${API_URL}/historico-lancamentos`);
        if (res.ok) {
            const logs = await res.json();
            container.innerHTML = logs.length === 0 ? "<p style='color:gray;'>Nenhum lançamento no banco.</p>" : "";
            logs.forEach(l => {
                container.innerHTML += `
                    <div class="item-backoffice">
                        <div>
                            <strong style="color:var(--accent-blue);">Data: ${l.data_registro.split('-').reverse().join('/')} | Turno ${l.turno} | Mq ${l.maquina_numero}</strong><br>
                            <span style="font-size:12px; color:var(--text-muted);">Apontado por: ${l.operador} | Counter: ${parseFloat(l.total_mc).toLocaleString()}</span>
                        </div>
                        <button class="btn-small-delete" style="margin-top:0;" onclick="deletarHistorico(${l.id})">Apagar</button>
                    </div>`;
            });
        }
    } catch(e) { container.innerHTML = "Erro ao carregar dados."; }
}

async function deletarHistorico(id) {
    if (!confirm("Tem certeza que deseja apagar permanentemente este apontamento?")) return;
    try {
        const res = await fetch(`${API_URL}/historico-lancamentos/${id}`, { method: 'DELETE' });
        if (res.ok) { alert("Lançamento excluído!"); carregarHistoricoAdmin(); }
    } catch(e) { alert("Erro ao deletar."); }
}

function abrirEdicaoSku(id) {
    const s = MESTRE_SKUS.find(item => item.id === id);
    if(!s) return;
    document.getElementById('edit-sku-id').value = s.id;
    document.getElementById('edit-sku-cod').value = s.codigo_sku;
    document.getElementById('edit-sku-desc').value = s.descricao;
    document.getElementById('edit-sku-fraldas').value = s.fraldas_por_pacote;
    document.getElementById('edit-sku-pacotes').value = s.pacotes_por_fardo;
    document.getElementById('edit-sku-fardos').value = s.fardos_por_pallet;
    document.getElementById('modal-editar-sku').classList.remove('escondido');
}

async function examinarResposta(res, sucessoMsg) {
    if(res.ok) {
        alert(sucessoMsg);
        await baixarDadosMestres();
        renderizarListasGerenciais();
        preencherSeletoresIniciais();
    } else {
        const err = await res.json();
        alert("Erro no Banco: " + err.detail);
    }
}

async function executarEdicaoSku() {
    const id = document.getElementById('edit-sku-id').value;
    const codigo_sku = document.getElementById('edit-sku-cod').value.trim();
    const descricao = document.getElementById('edit-sku-desc').value.trim();
    const fraldas_por_pacote = parseInt(document.getElementById('edit-sku-fraldas').value) || 0;
    const pacotes_por_fardo = parseInt(document.getElementById('edit-sku-pacotes').value) || 0;
    const fardos_por_pallet = parseInt(document.getElementById('edit-sku-fardos').value) || 0;

    try {
        const res = await fetch(`${API_URL}/skus/${id}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet })
        });
        fecharModal('modal-editar-sku');
        await examinarResposta(res, "SKU mestre atualizado com sucesso!");
    } catch(e) { alert("Erro de conexão."); }
}

async function adicionarSkuMestre() {
    const codigo_sku = document.getElementById('adm-sku-cod').value.trim();
    const descricao = document.getElementById('adm-sku-desc').value.trim();
    const fraldas_por_pacote = parseInt(document.getElementById('adm-sku-fraldas').value) || 0;
    const pacotes_por_fardo = parseInt(document.getElementById('adm-sku-pacotes').value) || 0;
    const fardos_por_pallet = parseInt(document.getElementById('adm-sku-fardos').value) || 0;

    if (!codigo_sku || !descricao) return alert("Preencha Código e Descrição do SKU.");
    try {
        const res = await fetch(`${API_URL}/admin/skus`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet })
        });
        await examinarResposta(res, "SKU adicionado ao banco!");
    } catch(e) { alert("Erro de conexão."); }
}

async function adicionarMaquinaMestre() {
    const numero_maquina = parseInt(document.getElementById('adm-m-numero').value);
    const tipo = document.getElementById('adm-m-tipo').value;
    if(!numero_maquina) return alert("Insira o número.");
    try {
        const res = await fetch(`${API_URL}/admin/maquinas`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ numero_maquina, tipo })
        });
        await examinarResposta(res, "Nova máquina salva com sucesso!");
    } catch(e) { alert("Erro de conexão."); }
}

async function adicionarParadaMestre() {
    const tipo_maquina = document.getElementById('adm-p-tipo').value;
    const numero = document.getElementById('adm-p-numero').value.trim();
    const problema = document.getElementById('adm-p-problema').value.trim();
    if(!numero || !problema) return alert("Preencha Nº do Código e o Problema.");
    try {
        const res = await fetch(`${API_URL}/admin/paradas`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ tipo_maquina, numero, problema })
        });
        await examinarResposta(res, "Código mestre de parada salvo!");
    } catch(e) { alert("Erro de conexão."); }
}

async function adicionarTnoMestre() {
    const nome = document.getElementById('adm-tno-nome').value.trim();
    if(!nome) return alert("Digite o nome da classificação.");
    try {
        const res = await fetch(`${API_URL}/admin/tnos`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome })
        });
        await examinarResposta(res, "Nova classificação de TNO cadastrada!");
    } catch(e) { alert("Erro de conexão."); }
}

async function adicionarUsuarioMestre() {
    const nome = document.getElementById('adm-u-nome').value.trim();
    const login = document.getElementById('adm-u-login').value.trim().toLowerCase();
    const senha = document.getElementById('adm-u-senha').value;
    const nivel = parseInt(document.getElementById('adm-u-nivel').value);
    if(!nome || !login || !senha) return alert("Preencha todos os campos do usuário.");
    try {
        const res = await fetch(`${API_URL}/admin/usuarios`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ login, senha, nome, nivel })
        });
        await examinarResposta(res, "Novo colaborador adicionado ao banco de dados!");
    } catch(e) { alert("Erro de conexão."); }
}
