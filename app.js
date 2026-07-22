const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_MATERIAIS = [], MESTRE_MAQUINAS = [];
let loteConsultadoTemp = null;

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

    if (idAba === 'visao') carregarVisaoOP();
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

    if (!op) {
        return alert("Digite a Ordem de Produção (OP) antes de confirmar!");
    }
    if (!loteConsultadoTemp) {
        return alert("Bipa a etiqueta de matéria-prima primeiro!");
    }

    try {
        const res = await fetch(`${API_URL}/consumo/abastecer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ordem_producao: op,
                maquina_numero: maquina,
                codigo_barras_lote: loteConsultadoTemp.codigo_barras_lote,
                operador: usuarioLogado.nome
            })
        });

        if (res.ok) {
            alert(`Sucesso! Lote ${loteConsultadoTemp.lote_fornecedor} alocado na OP ${op}.`);
            document.getElementById('abs-barcode').value = '';
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

// --- FLUXO 2: DEVOLUÇÃO / TRANSFERÊNCIA ---

async function buscarLoteAtivoDevolucao() {
    const barcode = document.getElementById('dev-barcode').value.trim();
    if (!barcode) return;

    try {
        const res = await fetch(`${API_URL}/consumo/buscar-ativo/${encodeURIComponent(barcode)}`);
        if (res.ok) {
            const consumo = await res.json();
            
            document.getElementById('dev-consumo-id').value = consumo.consumo_id;
            document.getElementById('dev-info-op').innerText = consumo.ordem_producao;
            document.getElementById('dev-info-cod').innerText = consumo.codigo_material;
            document.getElementById('dev-info-desc').innerText = consumo.descricao;
            document.getElementById('dev-info-peso').innerText = `${consumo.peso_alocado} kg`;
            
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
    const boxFisica = document.getElementById('box-dev-fisica');
    const boxSistemica = document.getElementById('box-dev-sistemica');

    if (tipo === 'fisica') {
        boxFisica.classList.remove('escondido');
        boxSistemica.classList.add('escondido');
    } else {
        boxFisica.classList.add('escondido');
        boxSistemica.classList.remove('escondido');
    }
}

async function executarDevolucao() {
    const consumoId = parseInt(document.getElementById('dev-consumo-id').value);
    const tipo = document.getElementById('dev-tipo-operacao').value;

    if (tipo === 'fisica') {
        const pesoManual = parseFloat(document.getElementById('dev-peso-manual').value);
        if (isNaN(pesoManual) || pesoManual < 0) {
            return alert("Informe o peso medido na balança!");
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
    document.getElementById('dev-barcode').value = '';
    document.getElementById('dev-peso-manual').value = '';
    document.getElementById('dev-nova-op').value = '';
    document.getElementById('dev-peso-transferido').value = '';
    document.getElementById('painel-devolucao').classList.add('escondido');
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

// --- VISÃO CONSOLIDADA ---

async function carregarVisaoOP() {
    try {
        const res = await fetch(`${API_URL}/visao-ordens`);
        if (res.ok) {
            const ordens = await res.json();
            const tbody = document.querySelector('#tabela-visao-op tbody');
            if (!tbody) return;

            tbody.innerHTML = ordens.map(o => `
                <tr>
                    <td><strong>${o.ordem_producao}</strong></td>
                    <td><span class="badge-blue">Máq ${o.maquina}</span></td>
                    <td><strong>${o.total_lotes_bipados}</strong> Lote(s)</td>
                    <td><span class="badge-success">${parseFloat(o.consumo_real_total_kg).toFixed(1)} kg</span></td>
                    <td><span class="badge-danger">${parseFloat(o.total_refugo_kg).toFixed(1)} kg</span></td>
                </tr>
            `).join('');
        }
    } catch (e) { console.error(e); }
}

// --- ADMIN / CADASTROS ---

function renderizarGestao() {
    const boxMat = document.getElementById('lista-admin-materiais');
    if (boxMat) {
        boxMat.innerHTML = MESTRE_MATERIAIS.map(m => `
            <div class="item-list">
                <div><strong>${m.codigo_material}</strong> - ${m.descricao} (Tubete: ${m.peso_tubete_padrao}kg)</div>
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
        peso_tubete_padrao: parseFloat(document.getElementById('form-mat-tubete').value || 0)
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

// --- PARSER E IMPORTADOR NATIVO DO XML SB8 DO TOTVS PROTHEUS ---
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

                // Mapeia células do XML respeitando o atributo de índice ss:Index
                for (let c = 0; c < cells.length; c++) {
                    const cellIndexAttr = cells[c].getAttribute("ss:Index");
                    if (cellIndexAttr) {
                        colIdx = parseInt(cellIndexAttr) - 1;
                    }
                    const dataTag = cells[c].getElementsByTagName("Data")[0];
                    rowData[colIdx] = dataTag ? dataTag.textContent.trim() : "";
                    colIdx++;
                }

                // Identifica a linha de cabeçalho
                if (idxProduto === -1 && rowData.some(v => v && v.toLowerCase().includes('produto'))) {
                    rowData.forEach((val, index) => {
                        if (!val) return;
                        const h = val.toLowerCase().trim();
                        if (h === 'produto' || h.includes('cod. produto')) idxProduto = index;
                        if (h === 'lote') idxLote = index; // Pega estritamente a coluna Lote (nosso lote)
                        if (h.includes('saldo lote') || h.includes('sdo.lote')) idxSaldo = index;
                    });
                    continue;
                }

                // Mapeia os dados das bobinas/lotes
                if (idxProduto !== -1 && idxLote !== -1) {
                    const codMat = rowData[idxProduto];
                    const loteNosso = rowData[idxLote];
                    let saldoTexto = rowData[idxSaldo] || "0";

                    if (codMat && loteNosso) {
                        saldoTexto = saldoTexto.replace(/\./g, '').replace(',', '.');
                        const pesoDisponivel = parseFloat(saldoTexto) || 0.0;

                        // Importa apenas lotes que possuem saldo físico maior que ZERO
                        if (pesoDisponivel > 0) {
                            listaLotes.push({
                                codigo_barras_lote: loteNosso, // Nosso Lote é a chave/barcode
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

            // Envia em massa para o banco de dados
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
