const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_SKUS = [], MESTRE_PARADAS = [], MESTRE_TNOS = [], MESTRE_MAQUINAS = [], MESTRE_USUARIOS = [];
let contadorOrdens = 0, contadorParadas = 0, contadorTnos = 0;
let editandoTurnoId = null;
let dadosTotvs = {}; // Variável global para armazenar a planilha lida

async function executarLogin() {
    const login = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();
    if (!login || !senha) return alert("Insira suas credenciais.");
    
    const btn = document.getElementById('btn-entrar'); 
    btn.innerText = "Conectando ao banco... (pode levar 50s)"; btn.disabled = true;

    let tentativas = 0;
    while(tentativas < 2) {
        try {
            const res = await fetch(`${API_URL}/usuarios/auth`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ login, senha })
            });
            if (res.ok) {
                usuarioLogado = await res.json();
                await inicializarPainel();
                return;
            } else {
                alert("Credenciais incorretas.");
                btn.innerText = "Entrar no Sistema"; btn.disabled = false;
                return;
            }
        } catch (e) {
            tentativas++;
            if(tentativas >= 2) {
                alert("Erro de conexão persistente. Verifique sua internet ou tente novamente.");
            } else {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }
    btn.innerText = "Entrar no Sistema"; btn.disabled = false;
}

function sair() { location.reload(); }

async function inicializarPainel() {
    document.getElementById('tela-login').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.remove('escondido');
    
    document.getElementById('txt-user').innerText = `Operador: ${usuarioLogado.nome}`;
    if (parseInt(usuarioLogado.nivel) >= 2) {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.remove('escondido'));
    }
    const inputData = document.getElementById('ap-data');
    if (inputData) inputData.value = new Date().toISOString().split('T')[0];

    await baixarDadosMestres();
    preencherSeletoresIniciais();
    navegarPara('operador');
}

async function baixarDadosMestres() {
    let tentativas = 0;
    while (tentativas < 3) {
        try {
            const res = await fetch(`${API_URL}/dados-mestres`);
            if (res.ok) {
                const data = await res.json();
                MESTRE_SKUS = data.skus || [];
                MESTRE_PARADAS = data.paradas || [];
                MESTRE_TNOS = data.tnos || [];
                MESTRE_MAQUINAS = data.maquinas || [];
                MESTRE_USUARIOS = data.usuarios || [];
                return;
            }
        } catch (e) {
            console.warn("Tentativa de carregar dados falhou. Retentando em segundo plano...");
        }
        tentativas++;
        await new Promise(r => setTimeout(r, 1500));
    }
    console.error("Falha ao sincronizar dados mestres com o servidor.");
}

// ================= NAVEGAÇÃO =================
function navegarPara(idAba) {
    document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('escondido'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('ativo'));
    
    const tela = document.getElementById(`tela-${idAba}`);
    const nav = document.getElementById(`nav-${idAba}`);
    
    if (tela) tela.classList.remove('escondido');
    if (nav) nav.classList.add('ativo');

    if(idAba === 'admin') renderizarGestao();
    if(idAba === 'visao') carregarVisaoOP();
    if(idAba === 'lancamentos') filtrarLancamentos(); 
}

function abrirModal(id) {
    document.getElementById(id).classList.remove('escondido');
    const inputs = document.getElementById(id).querySelectorAll('input');
    inputs.forEach(i => i.type !== 'hidden' ? i.value = '' : null);
}
function fecharModal(id) { document.getElementById(id).classList.add('escondido'); }

// ================= TELA APONTAMENTO =================
function preencherSeletoresIniciais() {
    const selMq = document.getElementById('ap-maquina');
    if (MESTRE_MAQUINAS.length > 0) {
        selMq.innerHTML = MESTRE_MAQUINAS.filter(m => m.ativo).map(m => `<option value="${m.numero_maquina}">Máquina ${m.numero_maquina} (${m.tipo==='baby_care'?'Baby':'Adulto'})</option>`).join('');
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
    let skuOpts = '<option value="">Selecione o SKU</option>' + MESTRE_SKUS.map(s => `<option value="${s.codigo_sku}">${s.codigo_sku}</option>`).join('');
    
    const html = `
        <div class="dynamic-item card-ordem" id="ordem-${contadorOrdens}">
            <div class="grid-2">
                <div class="form-group"><label>Nº Ordem (OP):</label><input type="text" class="op-numero"></div>
                <div class="form-group"><label>Código SKU:</label><select class="op-sku" onchange="atualizarDescricaoSku(${contadorOrdens})">${skuOpts}</select></div>
            </div>
            <div style="font-size:12px; color:var(--accent-orange); font-weight:bold; margin-bottom:10px;" id="sku-desc-${contadorOrdens}">Descrição: ---</div>
            <div class="grid-2">
                <div class="form-group"><label>Horário Padrão (m):</label><input type="number" class="op-hp" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Run Time (m):</label><input type="number" class="op-rt" value="0" oninput="calcularResumo()"></div>
            </div>
            <div class="grid-3">
                <div class="form-group"><label>Counter (Peças):</label><input type="number" class="op-mc" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Pallets:</label><input type="number" class="op-pallets" value="0" oninput="calcularResumo()"></div>
                <div class="form-group"><label>Fardos Av.:</label><input type="number" class="op-fardos" value="0" oninput="calcularResumo()"></div>
            </div>
            
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 10px; margin-top: 10px;">
                <label style="font-size:12px; font-weight:bold; color:var(--text-muted);">TEMPOS NÃO OPERACIONAIS (TNO)</label>
                <div id="container-tnos-ordem-${contadorOrdens}"></div>
                <button class="btn-dash-orange" onclick="adicionarTnoOrdem(${contadorOrdens})">+ Add TNO na Ordem</button>
            </div>

            <div style="font-size:13px; color:var(--success-color); font-weight:bold; margin-top:10px;" id="ordem-calc-${contadorOrdens}">Estoque: 0 | Mov: 0% | Loss: 0%</div>
            <button class="btn-small-delete" style="margin-top:10px;" onclick="removerItem('ordem-${contadorOrdens}')">Excluir Ordem</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
    atualizarDescricaoSku(contadorOrdens);
}

function adicionarTnoOrdem(idOrdem) {
    contadorTnos++;
    const container = document.getElementById(`container-tnos-ordem-${idOrdem}`);
    let tnoOpts = '<option value="">Selecione</option>' + MESTRE_TNOS.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
    const html = `
        <div class="dynamic-sub-item card-tno" id="tno-${contadorTnos}">
            <div class="grid-2">
                <div class="form-group" style="margin-bottom:0;"><select class="tno-tipo">${tnoOpts}</select></div>
                <div class="form-group" style="margin-bottom:0;"><input type="number" class="tno-minutos" value="0" placeholder="Minutos" oninput="calcularResumo()"></div>
            </div>
            <button class="btn-small-delete" style="margin-top:6px; padding: 4px 8px;" onclick="removerItem('tno-${contadorTnos}')">Excluir TNO</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

function adicionarParada() {
    contadorParadas++;
    const container = document.getElementById('container-paradas');
    const html = `
        <div class="dynamic-item card-parada" id="parada-${contadorParadas}">
            <div class="grid-2">
                <div class="form-group"><label>Cód. Defeito (Nº):</label><input type="text" class="input-parada-cod" oninput="buscarDescricaoParada(this, ${contadorParadas})"></div>
                <div class="form-group"><label>Minutos:</label><input type="number" class="input-parada-min" value="0" oninput="calcularResumo()"></div>
            </div>
            <div style="font-size:12px; color:var(--accent-orange); font-weight:bold; margin-bottom:10px;" id="parada-desc-${contadorParadas}">Digite o código...</div>
            <button class="btn-small-delete" onclick="removerItem('parada-${contadorParadas}')">Remover Parada</button>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

function buscarDescricaoParada(inputEl, idCard) {
    const num = inputEl.value.trim();
    const mqNumero = document.getElementById('ap-maquina').value;
    const mqInfo = MESTRE_MAQUINAS.find(m => String(m.numero_maquina) === String(mqNumero));
    const tipo = mqInfo ? mqInfo.tipo : 'baby_care';
    const parada = MESTRE_PARADAS.find(p => p.tipo_maquina === tipo && String(p.numero) === String(num));
    
    const descEl = document.getElementById(`parada-desc-${idCard}`);
    if(descEl) {
        descEl.innerText = parada ? `Confirmado: ${parada.problema}` : "Não encontrado";
        descEl.style.color = parada ? "var(--success-color)" : "var(--danger-color)";
    }
}

function removerItem(id) { document.getElementById(id).remove(); calcularResumo(); }

function atualizarDescricaoSku(idCard) {
    const skuCod = document.querySelector(`#ordem-${idCard} .op-sku`).value;
    const sku = MESTRE_SKUS.find(s => s.codigo_sku === skuCod);
    document.getElementById(`sku-desc-${idCard}`).innerText = `Descrição: ${sku ? sku.descricao : '---'}`;
    calcularResumo();
}

function calcularResumo() {
    const turno = parseInt(document.getElementById('ap-turno').value || 1);
    const carga = {1:455, 2:440, 3:415}[turno] || 440;

    let totMC = 0, totPecas = 0, totHP = 0, totRT = 0, totTNO = 0, totParadas = 0;

    document.querySelectorAll(".card-ordem").forEach(div => {
        const idCard = div.id.replace('ordem-', '');
        const skuCod = div.querySelector('.op-sku').value;
        const hp = parseInt(div.querySelector('.op-hp').value || 0);
        const rt = parseInt(div.querySelector('.op-rt').value || 0);
        const mc = parseInt(div.querySelector('.op-mc').value || 0);
        const pallets = parseInt(div.querySelector('.op-pallets').value || 0);
        const fardosAvulsos = parseInt(div.querySelector('.op-fardos').value || 0);
        
        let tnoOrdem = 0;
        div.querySelectorAll('.tno-minutos').forEach(t => tnoOrdem += parseInt(t.value || 0));

        const sku = MESTRE_SKUS.find(s => s.codigo_sku === skuCod);
        let pecas = 0;
        if (sku) pecas = ((pallets * sku.fardos_por_pallet) + fardosAvulsos) * sku.pacotes_por_fardo * sku.fraldas_por_pacote;

        let mov = hp > 0 ? ((rt/hp)*100).toFixed(1) : 0;
        let loss = mc > 0 ? (((mc-pecas)/mc)*100).toFixed(1) : 0;

        const calcEl = document.getElementById(`ordem-calc-${idCard}`);
        if(calcEl) calcEl.innerText = `Estoque: ${pecas.toLocaleString()} | Mov: ${mov}% | Loss: ${loss}%`;

        totMC += mc; totPecas += pecas; totHP += hp; totRT += rt; totTNO += tnoOrdem;
    });

    document.querySelectorAll('.input-parada-min').forEach(el => totParadas += parseInt(el.value || 0));

    document.getElementById('card-mc').innerText = totMC.toLocaleString();
    document.getElementById('card-pecas').innerText = totPecas.toLocaleString();
    document.getElementById('card-mov').innerText = totHP>0 ? `${((totRT/totHP)*100).toFixed(1)}%` : '0%';
    document.getElementById('card-loss').innerText = totMC>0 ? `${(((totMC-totPecas)/totMC)*100).toFixed(1)}%` : '0%';
    document.getElementById('card-tno').innerText = `${totTNO}m`;
    document.getElementById('card-paradas').innerText = `${totParadas}m`;

    document.getElementById('res-carga').innerText = `${carga}m`;
    const tempoApontado = totHP + totTNO;
    const elResTot = document.getElementById('res-total');
    elResTot.innerText = `${tempoApontado}m`;
    elResTot.className = tempoApontado === carga ? 'status-ok' : 'status-erro';

    const pCalc = totHP - totRT;
    document.getElementById('res-parada-calc').innerText = `${pCalc}m`;
    const elResPar = document.getElementById('res-parada-apon');
    elResPar.innerText = `${totParadas}m`;
    elResPar.className = (pCalc === totParadas && pCalc >= 0) ? 'status-ok' : 'status-erro';

    document.getElementById('btn-enviar-apontamento').disabled = !(tempoApontado === carga && pCalc === totParadas && pCalc >= 0);
}

async function enviarApontamento() {
    const btn = document.getElementById('btn-enviar-apontamento');
    btn.innerText = "Salvando..."; btn.disabled = true;

    const payload = {
        data_registro: document.getElementById('ap-data').value,
        turno: parseInt(document.getElementById('ap-turno').value),
        operador: usuarioLogado.nome,
        maquina: parseInt(document.getElementById('ap-maquina').value),
        ordens: [], paradas: []
    };

    document.querySelectorAll(".card-ordem").forEach(div => {
        const tnos = [];
        div.querySelectorAll('.card-tno').forEach(t => {
            const tipo = t.querySelector('.tno-tipo').value;
            if (tipo) tnos.push({ tipo_tno: tipo, tempo_tno: parseInt(t.querySelector('.tno-minutos').value || 0) });
        });

        payload.ordens.push({
            ordem: div.querySelector('.op-numero').value,
            codigo_sku: div.querySelector('.op-sku').value,
            horario_padrao: parseInt(div.querySelector('.op-hp').value || 0),
            run_time: parseInt(div.querySelector('.op-rt').value || 0),
            machine_counter: parseInt(div.querySelector('.op-mc').value || 0),
            pallets: parseInt(div.querySelector('.op-pallets').value || 0),
            fardos_avulsos: parseInt(div.querySelector('.op-fardos').value || 0),
            tnos: tnos
        });
    });

    document.querySelectorAll(".card-parada").forEach(div => {
        payload.paradas.push({
            numero_parada: div.querySelector('.input-parada-cod').value,
            minutos_parados: parseInt(div.querySelector('.input-parada-min').value || 0)
        });
    });

    try {
        const metodo = editandoTurnoId ? 'PUT' : 'POST';
        const urlFinal = editandoTurnoId ? `${API_URL}/apontamentos/${editandoTurnoId}` : `${API_URL}/apontamentos`;
        
        const res = await fetch(urlFinal, {
            method: metodo, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert(editandoTurnoId ? "Turno Atualizado com Sucesso!" : "Apontamento Salvo!");
            cancelarEdicaoApontamento();
        } else {
            const err = await res.json(); alert(`Atenção: ${err.detail}`);
        }
    } catch(e) { alert("Erro de rede. Verifique sua conexão."); }
    finally { btn.innerText = editandoTurnoId ? "Atualizar Turno" : "Gravar Apontamento"; calcularResumo(); }
}

function cancelarEdicaoApontamento() {
    editandoTurnoId = null;
    document.getElementById('titulo-apontamento').innerText = "Apontamento Diário";
    document.getElementById('btn-enviar-apontamento').innerText = "Gravar Apontamento";
    document.getElementById('btn-cancelar-edicao').classList.add('escondido');
    document.getElementById('container-ordens').innerHTML = '';
    document.getElementById('container-paradas').innerHTML = '';
    contadorOrdens = 0; contadorParadas = 0;
    adicionarOrdem();
}

// ================= TELA LANÇAMENTOS (FILTROS) =================
async function filtrarLancamentos() {
    const data = document.getElementById('filtro-data').value;
    const turno = document.getElementById('filtro-turno').value;
    const maq = document.getElementById('filtro-maq').value;
    const op = document.getElementById('filtro-op').value.trim();

    let url = new URL(`${API_URL}/apontamentos`);
    if(data) url.searchParams.append('data', data);
    if(turno) url.searchParams.append('turno', turno);
    if(maq) url.searchParams.append('maquina', maq);
    if(op) url.searchParams.append('ordem', op);

    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const div = document.getElementById('resultados-lancamentos');
            div.innerHTML = data.length === 0 ? "<p style='color:var(--text-muted); margin-top:20px; text-align:center;'>Nenhum registro encontrado.</p>" : data.map(l => `
                <div class="item-list">
                    <div>
                        <strong style="color:var(--accent-blue);">Turno ${l.turno} - Data: ${l.data_registro.split('-').reverse().join('/')}</strong><br>
                        <span style="font-size:12px; color:var(--text-muted);">Mák: ${l.maquina_numero} | Op: ${l.operador} | Total MC: ${parseFloat(l.total_mc).toLocaleString()}</span>
                    </div>
                    <div>
                        <button class="btn-small-edit" onclick="carregarParaEdicao(${l.id})">Editar</button>
                        <button class="btn-small-delete" onclick="deletarApontamento(${l.id})">X</button>
                    </div>
                </div>`).join('');
        }
    } catch(e) { console.error(e); }
}

async function deletarApontamento(id) {
    if(!confirm("Excluir todo este turno?")) return;
    try {
        await fetch(`${API_URL}/apontamentos/${id}`, {method:'DELETE'});
        filtrarLancamentos();
    } catch(e) {}
}

async function carregarParaEdicao(id) {
    try {
        const res = await fetch(`${API_URL}/apontamentos/${id}`);
        if(res.ok) {
            const turno = await res.json();
            editandoTurnoId = turno.id;
            navegarPara('operador');
            
            document.getElementById('titulo-apontamento').innerText = "Editando Turno (ID: "+id+")";
            document.getElementById('btn-enviar-apontamento').innerText = "Atualizar Turno";
            document.getElementById('btn-cancelar-edicao').classList.remove('escondido');

            document.getElementById('ap-data').value = turno.data_registro;
            document.getElementById('ap-turno').value = turno.turno;
            document.getElementById('ap-maquina').value = turno.maquina;

            document.getElementById('container-ordens').innerHTML = '';
            document.getElementById('container-paradas').innerHTML = '';
            contadorOrdens = 0; contadorParadas = 0;

            turno.ordens.forEach(o => {
                adicionarOrdem();
                const card = document.getElementById(`ordem-${contadorOrdens}`);
                card.querySelector('.op-numero').value = o.ordem;
                card.querySelector('.op-sku').value = o.codigo_sku;
                card.querySelector('.op-hp').value = o.horario_padrao;
                card.querySelector('.op-rt').value = o.run_time;
                card.querySelector('.op-mc').value = o.machine_counter;
                card.querySelector('.op-pallets').value = o.pallets;
                card.querySelector('.op-fardos').value = o.fardos_avulsos;
                
                o.tnos.forEach(t => {
                    adicionarTnoOrdem(contadorOrdens);
                    const cardsTno = card.querySelectorAll('.card-tno');
                    const cardTno = cardsTno[cardsTno.length - 1];
                    cardTno.querySelector('.tno-tipo').value = t.tipo_tno;
                    cardTno.querySelector('.tno-minutos').value = t.tempo_tno;
                });
                atualizarDescricaoSku(contadorOrdens);
            });

            turno.paradas.forEach(p => {
                adicionarParada();
                const card = document.getElementById(`parada-${contadorParadas}`);
                card.querySelector('.input-parada-cod').value = p.numero_parada;
                card.querySelector('.input-parada-min').value = p.minutos_parados;
                buscarDescricaoParada(card.querySelector('.input-parada-cod'), contadorParadas);
            });

            calcularResumo();
        } else {
            const err = await res.json();
            alert(`Falha do servidor ao carregar turno: ${err.detail}`);
        }
    } catch(e) { 
        alert("O servidor pode estar dormindo ou rejeitou a conexão. Tente novamente em alguns instantes."); 
    }
}

// ================= TELA VISÃO OP E VALIDAÇÃO TOTVS =================
function processarTotvs() {
    const fileInput = document.getElementById('upload-totvs');
    if (!fileInput.files.length) return alert("Selecione a planilha do TOTVS primeiro.");
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n');
        if (lines.length < 2) return alert("Planilha vazia ou formato inválido.");
        
        const headers = lines[0].split(',');
        let idxLote = -1;
        let idxQtde = -1;
        
        headers.forEach((h, i) => {
            const headerLimp = h.trim().toLowerCase();
            if (headerLimp.includes('lote')) idxLote = i;
            if (headerLimp.includes('qtde') || headerLimp.includes('quantidade')) idxQtde = i;
        });
        
        if (idxLote === -1 || idxQtde === -1) {
            return alert("Não foi possível encontrar as colunas 'Lote' e/ou 'Qtde Apontada' na planilha.");
        }
        
        dadosTotvs = {};
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length > Math.max(idxLote, idxQtde)) {
                const lote = cols[idxLote].trim();
                const qtde = parseFloat(cols[idxQtde]) || 0;
                if (lote) {
                    dadosTotvs[lote] = (dadosTotvs[lote] || 0) + qtde;
                }
            }
        }
        
        alert("Planilha TOTVS processada! Verifique a coluna de Status de Validação.");
        carregarVisaoOP(); // Recarrega a tabela aplicando a comparação
    };
    reader.readAsText(file);
}

async function carregarVisaoOP() {
    try {
        const res = await fetch(`${API_URL}/visao-ordens`);
        if(res.ok) {
            const ordens = await res.json();
            const tbody = document.querySelector('#tabela-visao-op tbody');
            tbody.innerHTML = ordens.map(o => {
                const fardosApp = parseFloat(o.total_fardos_calculado) || 0;
                let fardosTotvsHTML = `<span style="color:var(--text-muted); font-size: 11px;">Aguardando CSV...</span>`;
                let statusHTML = `<span class="badge-blue">Pendente</span>`;
                
                // Se o usuário importou a planilha, faz a mágica da comparação!
                if (Object.keys(dadosTotvs).length > 0) {
                    const fardosTotvs = dadosTotvs[o.ordem] || 0;
                    fardosTotvsHTML = `<strong>${fardosTotvs}</strong>`;
                    
                    if (fardosApp === fardosTotvs) {
                        statusHTML = `<span class="badge-success">✔ Bateu</span>`;
                    } else {
                        statusHTML = `<span class="badge-danger">✖ Divergente</span>`;
                    }
                }

                return `
                <tr>
                    <td><strong>${o.ordem}</strong></td>
                    <td><span class="badge-blue">M${o.maquina}</span></td>
                    <td>${o.codigo_sku}</td>
                    <td><strong>${fardosApp}</strong></td>
                    <td>${fardosTotvsHTML}</td>
                    <td>${statusHTML}</td>
                    <td><span class="badge-success">${parseFloat(o.pecas_estoque).toLocaleString()}</span></td>
                    <td><span class="badge-danger">${o.total_mc > 0 ? (((o.total_mc - o.pecas_estoque)/o.total_mc)*100).toFixed(1) : 0}%</span></td>
                </tr>
            `}).join('');
        }
    } catch(e) {}
}

// ================= GESTÃO ADMIN (CRUD) =================
function renderizarGestao() {
    document.getElementById('lista-admin-skus').innerHTML = MESTRE_SKUS.map(s => `
        <div class="item-list"><div><strong>${s.codigo_sku}</strong> - ${s.descricao}</div>
        <div><button class="btn-small-edit" onclick="preencherEdicao('sku', ${s.id})">Editar</button><button class="btn-small-delete" onclick="deletarMestre('skus', ${s.id})">X</button></div></div>`).join('');
    
    document.getElementById('lista-admin-maquinas').innerHTML = MESTRE_MAQUINAS.map(m => `
        <div class="item-list"><div><strong>Mák ${m.numero_maquina}</strong> - ${m.tipo} ${!m.ativo ? '<span style="color:var(--danger-color);">(Inativa)</span>' : ''}</div>
        <div><button class="btn-small-edit" onclick="preencherEdicao('maq', ${m.id})">Editar</button></div></div>`).join('');

    document.getElementById('lista-admin-paradas').innerHTML = MESTRE_PARADAS.map(p => `
        <div class="item-list"><div><strong>[${p.tipo_maquina === 'baby_care' ? 'Baby' : 'Adulto'}] Cód ${p.numero}</strong> - ${p.problema}</div>
        <div><button class="btn-small-edit" onclick="preencherEdicao('parada', ${p.id})">Editar</button><button class="btn-small-delete" onclick="deletarMestre('paradas', ${p.id})">X</button></div></div>`).join('');

    document.getElementById('lista-admin-tnos').innerHTML = MESTRE_TNOS.map(t => `
        <div class="item-list"><div>${t.nome}</div>
        <div><button class="btn-small-edit" onclick="preencherEdicao('tno', ${t.id})">Editar</button><button class="btn-small-delete" onclick="deletarMestre('tnos', ${t.id})">X</button></div></div>`).join('');

    document.getElementById('lista-admin-usuarios').innerHTML = MESTRE_USUARIOS.map(u => `
        <div class="item-list"><div><strong>${u.nome}</strong> (${u.login})</div>
        <div><button class="btn-small-edit" onclick="preencherEdicao('usu', ${u.id})">Editar</button><button class="btn-small-delete" onclick="deletarMestre('usuarios', ${u.id})">X</button></div></div>`).join('');
}

function preencherEdicao(tipo, id) {
    if(tipo === 'sku') {
        const o = MESTRE_SKUS.find(x=>x.id===id);
        document.getElementById('form-sku-id').value = id; document.getElementById('form-sku-cod').value = o.codigo_sku;
        document.getElementById('form-sku-desc').value = o.descricao; document.getElementById('form-sku-fra').value = o.fraldas_por_pacote;
        document.getElementById('form-sku-pac').value = o.pacotes_por_fardo; document.getElementById('form-sku-far').value = o.fardos_por_pallet;
        document.getElementById('modal-sku-titulo').innerText = "Editar SKU"; abrirModal('modal-sku');
    }
    if(tipo === 'maq') {
        const o = MESTRE_MAQUINAS.find(x=>x.id===id);
        document.getElementById('form-maq-id').value = id; document.getElementById('form-maq-num').value = o.numero_maquina;
        document.getElementById('form-maq-tipo').value = o.tipo; document.getElementById('form-maq-ativo').value = o.ativo;
        document.getElementById('modal-maq-titulo').innerText = "Editar Máquina"; abrirModal('modal-maq');
    }
    if(tipo === 'parada') {
        const o = MESTRE_PARADAS.find(x=>x.id===id);
        document.getElementById('form-parada-id').value = id; document.getElementById('form-parada-tipo').value = o.tipo_maquina;
        document.getElementById('form-parada-num').value = o.numero; document.getElementById('form-parada-prob').value = o.problema;
        document.getElementById('modal-parada-titulo').innerText = "Editar Parada"; abrirModal('modal-parada');
    }
    if(tipo === 'tno') {
        const o = MESTRE_TNOS.find(x=>x.id===id);
        document.getElementById('form-tno-id').value = id; document.getElementById('form-tno-nome').value = o.nome;
        document.getElementById('modal-tno-titulo').innerText = "Editar TNO"; abrirModal('modal-tno');
    }
    if(tipo === 'usu') {
        const o = MESTRE_USUARIOS.find(x=>x.id===id);
        document.getElementById('form-u-id').value = id; document.getElementById('form-u-nome').value = o.nome;
        document.getElementById('form-u-login').value = o.login; document.getElementById('form-u-nivel').value = o.nivel;
        document.getElementById('modal-usuario-titulo').innerText = "Editar Usuário"; abrirModal('modal-usuario');
    }
}

async function deletarMestre(rota, id) {
    if(!confirm("Tem certeza que deseja excluir permanentemente este registro?")) return;
    await fetch(`${API_URL}/admin/${rota}/${id}`, {method:'DELETE'});
    await baixarDadosMestres(); renderizarGestao(); preencherSeletoresIniciais();
}

async function salvarMestreGenerico(rota, idForm, payload, modalId) {
    const id = document.getElementById(idForm).value;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/admin/${rota}/${id}` : `${API_URL}/admin/${rota}`;
    try {
        await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        fecharModal(modalId); await baixarDadosMestres(); renderizarGestao(); preencherSeletoresIniciais();
    } catch(e) { alert("Erro ao salvar no banco."); }
}

function salvarSku() {
    salvarMestreGenerico('skus', 'form-sku-id', {
        codigo_sku: document.getElementById('form-sku-cod').value, descricao: document.getElementById('form-sku-desc').value,
        fraldas_por_pacote: parseInt(document.getElementById('form-sku-fra').value||0), pacotes_por_fardo: parseInt(document.getElementById('form-sku-pac').value||0), fardos_por_pallet: parseInt(document.getElementById('form-sku-far').value||0)
    }, 'modal-sku');
}
function salvarMaquina() {
    salvarMestreGenerico('maquinas', 'form-maq-id', { numero_maquina: parseInt(document.getElementById('form-maq-num').value), tipo: document.getElementById('form-maq-tipo').value, ativo: document.getElementById('form-maq-ativo').value === 'true' }, 'modal-maq');
}
function salvarParada() {
    salvarMestreGenerico('paradas', 'form-parada-id', { tipo_maquina: document.getElementById('form-parada-tipo').value, numero: document.getElementById('form-parada-num').value, problema: document.getElementById('form-parada-prob').value }, 'modal-parada');
}
function salvarTno() { salvarMestreGenerico('tnos', 'form-tno-id', { nome: document.getElementById('form-tno-nome').value }, 'modal-tno'); }
function salvarUsuario() {
    salvarMestreGenerico('usuarios', 'form-u-id', { login: document.getElementById('form-u-login').value, senha: document.getElementById('form-u-senha').value, nome: document.getElementById('form-u-nome').value, nivel: parseInt(document.getElementById('form-u-nivel').value) }, 'modal-usuario');
}
