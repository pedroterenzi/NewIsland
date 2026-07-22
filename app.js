const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_MATERIAIS = [], MESTRE_MAQUINAS = [];
let loteConsultadoTemp = null;
let consumoAtivoDevolucao = null; 

async function executarLogin() {
    const login = document.getElementById('login-usuario').value.trim();
    const senha = document.getElementById('login-senha').value.trim();
    if (!login || !senha) return alert("Insira suas credenciais.");
    
    const btn = document.getElementById('btn-entrar'); 
    btn.innerText = "Conectando ao banco..."; btn.disabled = true;

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
            btn.innerText = "Acessar Sistema"; btn.disabled = false;
        }
    } catch (e) {
        alert("Erro de conexão com o servidor. Tente novamente.");
        btn.innerText = "Acessar Sistema"; btn.disabled = false;
    }
}

function sair() { location.reload(); }

async function inicializarPainel() {
    document.getElementById('tela-login').classList.add('escondido');
    document.getElementById('menu-navegacao').classList.remove('escondido');
    
    document.getElementById('txt-user').innerText = `Operador: ${usuarioLogado.nome}`;
    
    if (parseInt(usuarioLogado.nivel) >= 2) {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.remove('escondido'));
    } else {
        document.querySelectorAll('.restrito-lider-adm').forEach(el => el.classList.add('escondido'));
    }

    await baixarDadosMestres();
    preencherSeletoresIniciais();
    navegarPara('abastecer');
}

async function baixarDadosMestres() {
    try {
        const res = await fetch(`${API_URL}/dados-mestres`);
        if (res.ok) {
            const data = await res.json();
            MESTRE_MATERIAIS = data.materiais || [];
            MESTRE_MAQUINAS = data.maquinas || [];
        }
    } catch (e) {
        console.error("Erro ao sincronizar dados mestres.");
    }
}

function preencherSeletoresIniciais() {
    const selMqAbs = document.getElementById('abs-maquina');
    const selMqRef = document.getElementById('ref-maquina');
    
    const optionsMq = MESTRE_MAQUINAS.map(m => `<option value="${m.numero_maquina}">Máquina ${m.numero_maquina} (${m.tipo})</option>`).join('');
    
    if (selMqAbs) selMqAbs.innerHTML = optionsMq;
    if (selMqRef) selMqRef.innerHTML = optionsMq;

    const selMatLote = document.getElementById('form-lot-mat');
    if (selMatLote) {
        selMatLote.innerHTML = MESTRE_MATERIAIS.map(m => `<option value="${m.codigo_material}">${m.codigo_material} - ${m.descricao}</option>`).join('');
    }
}

function navegarPara(idAba) {
    if (parseInt(usuarioLogado.nivel) < 2 && (idAba === 'visao' || idAba === 'admin')) {
        alert("Acesso Restrito: Apenas gestores podem acessar esta tela.");
        return;
    }

    document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('escondido'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('ativo'));
    
    const tela = document.getElementById(`tela-${idAba}`);
    const nav = document.getElementById(`nav-${idAba}`);
    
    if (tela) tela.classList.remove('escondido');
    if (nav) nav.classList.add('ativo');

    if (idAba === 'visao') document.getElementById('resultado-visao-op').classList.add('escondido');
    if (idAba === 'admin') renderizarGestao();
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('escondido');
}

function fecharModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('escondido'); 
}

// --- FLUXO 1: ABASTECER (CONSULTAR -> CONFIRMAR) ---

async function buscarDetalhesEtiqueta() {
    const barcode = document.getElementById('abs-barcode').value.trim();
    if (!barcode) return;

    try {
        const res = await fetch(`${API_URL}/lotes/consultar/${encodeURIComponent(barcode)}`);
        if (res.ok) {
            loteConsultadoTemp = await res.json();
            
            document.getElementById('prev-cod').innerText = loteConsultadoTemp.codigo_material;
            document.getElementById('prev-desc').innerText = loteConsultadoTemp.descricao;
            document.getElementById('prev-lote').innerText = loteConsultadoTemp.lote_fornecedor;
            document.getElementById('prev-peso').innerText = `${loteConsultadoTemp.peso_atual} kg`;
            
            // Sugere apontar o total disponível no lote
            document.getElementById('abs-peso-apontar').value = loteConsultadoTemp.peso_atual;
            
            document.getElementById('preview-lote-box').classList.remove('escondido');
        } else {
            const err = await res.json();
            alert(`Erro: ${err.detail}`);
            document.getElementById('preview-lote-box').classList.add('escondido');
            document.getElementById('abs-barcode').value = '';
        }
    } catch (e) {
        alert("Erro ao buscar dados da etiqueta.");
    }
}

async function confirmarAbastecimentoLote() {
    const op = document.getElementById('abs-op').value.trim();
    const maquina = parseInt(document.getElementById('abs-maquina').value);
    const pesoApontado = parseFloat(document.getElementById('abs-peso-apontar').value);

    if (!op) {
        return alert("Digite a Ordem de Produção (OP) antes de confirmar!");
    }
    if (!loteConsultadoTemp) {
        return alert("Bipa a etiqueta de matéria-prima primeiro!");
    }
    if (isNaN(pesoApontado) || pesoApontado <= 0) {
        return alert("Digite um peso válido para apontar na máquina!");
    }
    if (pesoApontado > parseFloat(loteConsultadoTemp.peso_atual)) {
        return alert(`Você não pode apontar ${pesoApontado}kg pois o lote tem apenas ${loteConsultadoTemp.peso_atual}kg disponíveis!`);
    }

    try {
        const res = await fetch(`${API_URL}/consumo/abastecer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ordem_producao: op,
                maquina_numero: maquina,
                codigo_barras_lote: loteConsultadoTemp.codigo_barras_lote,
                peso_apontado: pesoApontado,
                operador: usuarioLogado.nome
            })
        });

        if (res.ok) {
            alert(`Sucesso! ${pesoApontado} kg do Lote ${loteConsultadoTemp.lote_fornecedor} alocados na OP ${op}.`);
            
            // Sugere a mesma OP na tela de devolução para facilitar a vida do operador depois
            document.getElementById('dev-op').value = op;

            document.getElementById('abs-barcode').value = '';
            document.getElementById('abs-peso-apontar').value = '';
            document.getElementById('preview-lote-box').classList.add('escondido');
            loteConsultadoTemp = null;
        } else {
            const err = await res.json();
            alert(`Erro: ${err.detail}`);
        }
    } catch (e) {
        alert("Erro de conexão ao salvar apontamento.");
    }
}

// --- FLUXO 2: DEVOLUÇÃO / TRANSFERÊNCIA (AGORA POR OP) ---

async function buscarLoteAtivoDevolucao() {
    const op = document.getElementById('dev-op').value.trim();
    const barcode = document.getElementById('dev-barcode').value.trim();
    
    if (!op) return alert("Informe a OP de onde você está devolvendo o material!");
    if (!barcode) return alert("Bipe a etiqueta do material em uso!");

    try {
        const res = await fetch(`${API_URL}/consumo/buscar-ativo/${encodeURIComponent(op)}/${encodeURIComponent(barcode)}`);
        if (res.ok) {
            consumoAtivoDevolucao = await res.json();
            
            document.getElementById('dev-consumo-id').value = consumoAtivoDevolucao.consumo_id;
            document.getElementById('dev-info-op').innerText = consumoAtivoDevolucao.ordem_producao;
            document.getElementById('dev-info-cod').innerText = consumoAtivoDevolucao.codigo_material;
            document.getElementById('dev-info-desc').innerText = consumoAtivoDevolucao.descricao;
            document.getElementById('dev-info-peso').innerText = `${consumoAtivoDevolucao.peso_alocado} kg`;
            
            document.getElementById('painel-devolucao').classList.remove('escondido');
            alternarCamposDevolucao();
        } else {
            const err = await res.json();
            alert(`Atenção: ${err.detail}`);
            document.getElementById('painel-devolucao').classList.add('escondido');
            document.getElementById('dev-barcode').value = '';
        }
    } catch (e) {
        alert("Erro ao buscar apontamento ativo para devolução.");
    }
}

function alternarCamposDevolucao() {
    const tipo = document.getElementById('dev-tipo-operacao').value;
    
    document.getElementById('box-dev-fisica-parcial').classList.add('escondido');
    document.getElementById('box-dev-fisica-inteira').classList.add('escondido');
    document.getElementById('box-dev-fisica-etiqueta').classList.add('escondido');
    document.getElementById('box-dev-sistemica').classList.add('escondido');
    document.getElementById('box-resultado-fisico').classList.add('escondido');

    if (tipo === 'sistemica') {
        document.getElementById('box-dev-sistemica').classList.remove('escondido');
    } else {
        document.getElementById('box-resultado-fisico').classList.remove('escondido');
        if (tipo === 'fisica_parcial') document.getElementById('box-dev-fisica-parcial').classList.remove('escondido');
        if (tipo === 'fisica_inteira') document.getElementById('box-dev-fisica-inteira').classList.remove('escondido');
        if (tipo === 'fisica_etiqueta') document.getElementById('box-dev-fisica-etiqueta').classList.remove('escondido');
    }
    
    calcularPesoDevolucao();
}

function calcularPesoDevolucao() {
    if (!consumoAtivoDevolucao) return;
    const tipo = document.getElementById('dev-tipo-operacao').value;
    let pesoEstimado = 0;

    if (tipo === 'fisica_parcial') {
        const diamExtCm = parseFloat(document.getElementById('dev-diam-ext').value) || 0;
        const diamTubCm = parseFloat(document.getElementById('dev-diam-tub').value) || 0;
        const fatorConversao = parseFloat(consumoAtivoDevolucao.fator_conversao) || 0;
        if (diamExtCm > 0 && diamTubCm > 0 && fatorConversao > 0) {
            const raioExt = diamExtCm / 2;
            const raioTub = diamTubCm / 2;
            const areaCoroa = (Math.pow(raioExt, 2) - Math.pow(raioTub, 2)) * 3.1416;
            pesoEstimado = areaCoroa * fatorConversao;
        }
    } 
    else if (tipo === 'fisica_inteira') {
        const qtd = parseInt(document.getElementById('dev-qtd-inteiras').value) || 0;
        const pesoUnitario = parseFloat(consumoAtivoDevolucao.peso_unitario_kg) || 0;
        pesoEstimado = qtd * pesoUnitario;
    }
    else if (tipo === 'fisica_etiqueta') {
        pesoEstimado = parseFloat(document.getElementById('dev-peso-etiqueta').value) || 0;
    }

    if (pesoEstimado < 0) pesoEstimado = 0;
    
    document.getElementById('dev-peso-calculado').innerText = pesoEstimado.toFixed(2) + ' kg';
    document.getElementById('dev-peso-manual').value = pesoEstimado.toFixed(2);
}

async function executarDevolucao() {
    const consumoId = parseInt(document.getElementById('dev-consumo-id').value);
    const tipo = document.getElementById('dev-tipo-operacao').value;

    if (tipo !== 'sistemica') {
        const pesoManual = parseFloat(document.getElementById('dev-peso-manual').value);
        if (isNaN(pesoManual) || pesoManual <= 0) {
            return alert("Verifique as medidas ou quantidades para calcular o peso correto de devolução!");
        }

        try {
            const res = await fetch(`${API_URL}/consumo/devolver-fisico`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    consumo_id: consumoId,
                    peso_manual_kg: pesoManual,
                    operador: usuarioLogado.nome
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Devolução física concluída!\nConsumo cobrado da OP: ${data.consumo_real_op} kg\nSaldo retornado ao estoque: ${data.sobra_liquida_estoque} kg`);
                resetarTelaDevolucao();
            } else {
                const err = await res.json();
                alert(`Erro: ${err.detail}`);
            }
        } catch (e) { alert("Erro ao executar devolução física."); }

    } else {
        // SISTÊMICA (TRANSFERÊNCIA)
        const novaOP = document.getElementById('dev-nova-op').value.trim();
        const pesoTransferido = parseFloat(document.getElementById('dev-peso-transferido').value);

        if (!novaOP || isNaN(pesoTransferido) || pesoTransferido <= 0) {
            return alert("Informe a nova OP destino e a quantidade mantida na máquina!");
        }

        try {
            const res = await fetch(`${API_URL}/consumo/transferir-op`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    consumo_id: consumoId,
                    nova_ordem_destino: novaOP,
                    peso_transferido_kg: pesoTransferido,
                    operador: usuarioLogado.nome
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Transferência Sistêmica Concluída!\nOP Anterior debitada em: ${data.consumo_debitado_op_anterior} kg\nNova OP (${novaOP}) carregada com: ${data.peso_carregado_nova_op} kg`);
                resetarTelaDevolucao();
            } else {
                const err = await res.json();
                alert(`Erro: ${err.detail}`);
            }
        } catch (e) { alert("Erro ao executar transferência sistêmica."); }
    }
}

function resetarTelaDevolucao() {
    // Mantemos a OP (dev-op) intacta, caso ele vá devolver outro lote da mesma OP.
    document.getElementById('dev-barcode').value = '';
    document.getElementById('dev-diam-ext').value = '';
    document.getElementById('dev-diam-tub').value = '9.45';
    document.getElementById('dev-qtd-inteiras').value = '';
    document.getElementById('dev-peso-etiqueta').value = '';
    document.getElementById('dev-peso-calculado').innerText = '0.00 kg';
    document.getElementById('dev-peso-manual').value = '';
    document.getElementById('dev-nova-op').value = '';
    document.getElementById('dev-peso-transferido').value = '';
    document.getElementById('painel-devolucao').classList.add('escondido');
    consumoAtivoDevolucao = null;
}

// --- FLUXO 3: REFUGO ---

async function salvarRefugo() {
    const op = document.getElementById('ref-op').value.trim();
    const maquina = parseInt(document.getElementById('ref-maquina').value);
    const peso = parseFloat(document.getElementById('ref-peso').value);
    const motivo = document.getElementById('ref-motivo').value;

    if (!op || isNaN(peso) || peso <= 0) {
        return alert("Preencha todos os campos do refugo corretamente!");
    }

    try {
        const res = await fetch(`${API_URL}/refugo/apontar`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ordem_producao: op,
                maquina_numero: maquina,
                peso_refugo_kg: peso,
                tipo_refugo: motivo,
                operador: usuarioLogado.nome
            })
        });

        if (res.ok) {
            alert("Refugo apontado com sucesso!");
            document.getElementById('ref-peso').value = '';
        }
    } catch (e) {
        alert("Erro ao registrar refugo.");
    }
}

// --- NOVA VISÃO OP (AGRUPADA/RESUMO POR LOTE) ---

async function buscarDetalhesVisaoOP() {
    const op = document.getElementById('busca-visao-op').value.trim();
    if (!op) return alert("Digite o número da OP para buscar!");

    const divResultado = document.getElementById('resultado-visao-op');
    divResultado.classList.remove('escondido');
    divResultado.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Processando resumo da OP...</p>`;

    try {
        const res = await fetch(`${API_URL}/visao-ordens/${encodeURIComponent(op)}`);
        if (res.ok) {
            const materiais = await res.json();
            
            if (materiais.length === 0) {
                divResultado.innerHTML = `<p style="text-align:center; color:var(--accent-orange);">Nenhum apontamento encontrado para a OP ${op}.</p>`;
                return;
            }

            let htmlCards = '';
            materiais.forEach(m => {
                htmlCards += `
                    <div class="card" style="padding: 18px; margin-bottom: 12px; border-left: 4px solid var(--success-color);">
                        <div style="margin-bottom:12px;">
                            <strong style="color:var(--text-color); font-size:15px;">${m.codigo_material} - ${m.descricao}</strong>
                        </div>
                        <div class="grid-3">
                            <div class="resumo-item" style="flex-direction:column; gap:4px; margin:0;">
                                <span style="font-size:11px;">Lote</span>
                                <strong style="color:var(--text-color);">${m.lote_fornecedor}</strong>
                            </div>
                            <div class="resumo-item" style="flex-direction:column; gap:4px; margin:0;">
                                <span style="font-size:11px;">Total Apontado</span>
                                <strong style="color:var(--accent-orange);">${parseFloat(m.peso_alocado).toFixed(1)} kg</strong>
                            </div>
                            <div class="resumo-item" style="flex-direction:column; gap:4px; margin:0;">
                                <span style="font-size:11px;">Consumo Líquido Final</span>
                                <strong style="color:var(--success-color); font-size: 16px;">${parseFloat(m.consumo_real).toFixed(1)} kg</strong>
                            </div>
                        </div>
                    </div>
                `;
            });

            divResultado.innerHTML = `
                <h3 style="margin-top:20px; text-align: left;">Resumo de Lotes na OP ${op}</h3>
                ${htmlCards}
            `;
        } else {
            divResultado.innerHTML = `<p style="text-align:center; color:var(--danger-color);">Erro ao buscar detalhes da OP.</p>`;
        }
    } catch (e) { 
        divResultado.innerHTML = `<p style="text-align:center; color:var(--danger-color);">Erro de conexão ao servidor.</p>`;
    }
}

// --- ADMIN / CADASTROS ---

function renderizarGestao() {
    const boxMat = document.getElementById('lista-admin-materiais');
    if (boxMat) {
        boxMat.innerHTML = MESTRE_MATERIAIS.map(m => `
            <div class="item-list">
                <div><strong>${m.codigo_material}</strong> - ${m.descricao}</div>
                <button class="btn-small-delete" onclick="deletarRegistro('master_materiais', ${m.id})">X</button>
            </div>
        `).join('');
    }

    const boxMq = document.getElementById('lista-admin-maquinas');
    if (boxMq) {
        boxMq.innerHTML = MESTRE_MAQUINAS.map(m => `
            <div class="item-list">
                <div><strong>Máq ${m.numero_maquina}</strong> (${m.tipo})</div>
                <button class="btn-small-delete" onclick="deletarRegistro('maquinas', ${m.id})">X</button>
            </div>
        `).join('');
    }
}

async function salvarMaterial() {
    const payload = {
        codigo_material: document.getElementById('form-mat-cod').value.trim(),
        descricao: document.getElementById('form-mat-desc').value.trim(),
        tipo_material: document.getElementById('form-mat-tipo').value,
        peso_tubete_padrao: 0,
        peso_unitario_kg: parseFloat(document.getElementById('form-mat-peso-uni').value || 0),
        fator_conversao: parseFloat(document.getElementById('form-mat-fator').value || 0)
    };

    await fetch(`${API_URL}/admin/materiais`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    fecharModal('modal-material');
    await baixarDadosMestres();
    renderizarGestao();
    preencherSeletoresIniciais();
}

async function salvarLoteEstoque() {
    const payload = {
        codigo_barras_lote: document.getElementById('form-lot-barcode').value.trim(),
        codigo_material: document.getElementById('form-lot-mat').value,
        lote_fornecedor: document.getElementById('form-lot-forn').value.trim(),
        peso_inicial: parseFloat(document.getElementById('form-lot-peso').value || 0)
    };

    await fetch(`${API_URL}/admin/lotes`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    fecharModal('modal-lote');
    alert("Nova bobina/lote cadastrado no estoque!");
}

async function salvarMaquina() {
    const payload = {
        numero_maquina: parseInt(document.getElementById('form-maq-num').value),
        tipo: document.getElementById('form-maq-tipo').value,
        ativo: true
    };

    await fetch(`${API_URL}/admin/maquinas`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    fecharModal('modal-maq');
    await baixarDadosMestres();
    renderizarGestao();
    preencherSeletoresIniciais();
}

async function deletarRegistro(tabela, id) {
    if (!confirm("Confirmar exclusão?")) return;
    await fetch(`${API_URL}/admin/${tabela}/${id}`, { method: 'DELETE' });
    await baixarDadosMestres();
    renderizarGestao();
}

// --- IMPORTADOR DA PLANILHA DE PARÂMETROS EXCEL ---
function processarPlanilhaParametros() {
    const fileInput = document.getElementById('upload-excel-param');
    if (!fileInput || !fileInput.files.length) return alert("Selecione o arquivo Excel de parâmetros!");

    const file = fileInput.files[0];
    const reader = new FileReader();
    const btn = document.querySelector('button[onclick="processarPlanilhaParametros()"]');
    const txtOriginal = btn.innerText;
    btn.innerText = "Processando Excel...";
    btn.disabled = true;

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet);
            const payload = [];

            json.forEach(row => {
                const cod = String(row['Código'] || '').trim();
                const desc = String(row['Descrição'] || '').trim();
                const peso = parseFloat(row['Peso (kg)']) || 0.0;
                const fator = parseFloat(row['Variável Raio']) || 0.0;

                if (cod && cod !== '0' && cod.toLowerCase() !== 'nan') {
                    payload.push({
                        codigo_material: cod,
                        descricao: desc || `Material ${cod}`,
                        peso_unitario_kg: peso,
                        fator_conversao: fator
                    });
                }
            });

            if (payload.length === 0) {
                alert("Nenhum material válido encontrado na planilha.");
                btn.innerText = txtOriginal; btn.disabled = false;
                return;
            }

            fetch(`${API_URL}/admin/materiais/importar-massa`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            })
            .then(res => {
                if(res.ok) return res.json();
                throw new Error("Erro na importação");
            })
            .then(data => {
                alert(`Sucesso!\n${data.importados} materiais atualizados com Fatores de Conversão e Pesos Unitários.`);
                fileInput.value = '';
                btn.innerText = txtOriginal; btn.disabled = false;
                baixarDadosMestres(); 
            })
            .catch(err => {
                alert("Erro ao enviar dados para o servidor.");
                btn.innerText = txtOriginal; btn.disabled = false;
            });

        } catch (err) {
            console.error(err);
            alert("Erro ao ler o arquivo Excel. Verifique se o formato está correto.");
            btn.innerText = txtOriginal; btn.disabled = false;
        }
    };

    reader.readAsArrayBuffer(file);
}

// --- PARSER E IMPORTADOR NATIVO DO XML SB8 DO TOTVS PROTHEUS ---
function tratarNumeroTotvs(valorTexto) {
    if (!valorTexto) return 0.0;
    let str = String(valorTexto).trim();
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    return parseFloat(str) || 0.0;
}

function processarArquivoTotvs() {
    const fileInput = document.getElementById('upload-xml-totvs');
    if (!fileInput || !fileInput.files.length) return alert("Selecione o arquivo XML exportado da SB8!");

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        const text = e.target.result;
        const listaLotes = [];
        let ignoradosZerados = 0;

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            const rows = xmlDoc.getElementsByTagName("Row");

            let idxProduto = -1;
            let idxLote = -1;
            let idxSaldo = -1;

            for (let r = 0; r < rows.length; r++) {
                const cells = rows[r].getElementsByTagName("Cell");
                let rowData = [];
                let colIdx = 0;

                for (let c = 0; c < cells.length; c++) {
                    const cellIndexAttr = cells[c].getAttribute("ss:Index");
                    if (cellIndexAttr) {
                        colIdx = parseInt(cellIndexAttr) - 1;
                    }
                    const dataTag = cells[c].getElementsByTagName("Data")[0];
                    rowData[colIdx] = dataTag ? dataTag.textContent.trim() : "";
                    colIdx++;
                }

                if (idxProduto === -1 && rowData.some(v => v && v.toLowerCase().includes('produto'))) {
                    rowData.forEach((val, index) => {
                        if (!val) return;
                        const h = val.toLowerCase().trim();
                        if (h === 'produto' || h.includes('cod. produto')) idxProduto = index;
                        if (h === 'lote') idxLote = index; 
                        if (h.includes('saldo lote') || h.includes('sdo.lote')) idxSaldo = index;
                    });
                    continue;
                }

                if (idxProduto !== -1 && idxLote !== -1) {
                    const codMat = rowData[idxProduto];
                    const loteNosso = rowData[idxLote];
                    const saldoTexto = rowData[idxSaldo] || "0";

                    if (codMat && loteNosso) {
                        const pesoDisponivel = tratarNumeroTotvs(saldoTexto);

                        if (pesoDisponivel > 0) {
                            listaLotes.push({
                                codigo_barras_lote: loteNosso, 
                                codigo_material: codMat,
                                lote_fornecedor: loteNosso,
                                peso_inicial: pesoDisponivel
                            });
                        } else {
                            ignoradosZerados++;
                        }
                    }
                }
            }

            if (listaLotes.length === 0) {
                return alert("Nenhum lote com saldo maior que zero foi encontrado no arquivo.");
            }

            const res = await fetch(`${API_URL}/admin/lotes/importar-massa`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(listaLotes)
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Carga SB8 Concluída com Sucesso!\n\nLotes Ativos Importados: ${data.importados}\nLotes Zerados Ignorados: ${ignoradosZerados}`);
                fileInput.value = '';
                await baixarDadosMestres();
            } else {
                const err = await res.json();
                alert(`Erro ao importar lotes: ${err.detail}`);
            }

        } catch (err) {
            console.error(err);
            alert("Erro ao ler o arquivo XML. Certifique-se de que é a exportação original da tabela SB8.");
        }
    };

    reader.readAsText(file, "UTF-8");
}
