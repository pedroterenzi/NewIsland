const API_URL = "https://newisland-zzhk.onrender.com";

let usuarioLogado = null;
let MESTRE_MATERIAIS = [], MESTRE_MAQUINAS = [];

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

    if (idAba === 'abastecer') carregarLotesEmUsoNaLinha();
    if (idAba === 'devolver') carregarListaParaDevolucao();
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

// --- LÓGICA DE ABASTECIMENTO (BIPAR) ---

async function processarBipagem() {
    const op = document.getElementById('abs-op').value.trim();
    const maquina = document.getElementById('abs-maquina').value;
    const barcode = document.getElementById('abs-barcode').value.trim();

    if (!op || !barcode) {
        alert("Digite a OP e bipa o código da bobina/lote!");
        return;
    }

    try {
        const url = `${API_URL}/consumo/abastecer?ordem_producao=${encodeURIComponent(op)}&maquina_numero=${maquina}&codigo_barras_lote=${encodeURIComponent(barcode)}&operador=${encodeURIComponent(usuarioLogado.nome)}`;
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();

        const boxFeedback = document.getElementById('feedback-bipagem');
        boxFeedback.classList.remove('escondido');

        if (res.ok) {
            boxFeedback.style.borderColor = "var(--success-color)";
            boxFeedback.innerHTML = `<strong style="color:var(--success-color);">✔ Sucesso:</strong> ${data.mensagem}`;
            document.getElementById('abs-barcode').value = '';
            carregarLotesEmUsoNaLinha();
        } else {
            boxFeedback.style.borderColor = "var(--danger-color)";
            boxFeedback.innerHTML = `<strong style="color:var(--danger-color);">✖ Erro:</strong> ${data.detail}`;
        }
    } catch (e) {
        alert("Erro de conexão ao processar bipagem.");
    }
}

async function carregarLotesEmUsoNaLinha() {
    const op = document.getElementById('abs-op').value.trim();
    const maquina = document.getElementById('abs-maquina').value;

    let url = `${API_URL}/consumo/em-uso?`;
    if (op) url += `ordem=${encodeURIComponent(op)}&`;
    if (maquina) url += `maquina=${maquina}`;

    try {
        const res = await fetch(url);
        if (res.ok) {
            const lotes = await res.json();
            const div = document.getElementById('lista-lotes-em-uso');
            if (!div) return;

            div.innerHTML = lotes.length === 0 ? "<p style='color:var(--text-muted); font-size:13px;'>Nenhum lote em uso informado para esta OP/Máquina.</p>" : lotes.map(l => `
                <div class="item-list">
                    <div>
                        <strong style="color:var(--accent-orange);">${l.material_descricao}</strong><br>
                        <span style="font-size:12px; color:var(--text-muted);">Lote: ${l.lote_fornecedor} | Peso Alocado: ${l.peso_alocado}kg</span>
                    </div>
                    <span class="badge-blue">Em Uso</span>
                </div>
            `).join('');
        }
    } catch (e) { console.error(e); }
}

// --- LÓGICA DE DEVOLUÇÃO DE SOBRAS ---

async function carregarListaParaDevolucao() {
    const op = document.getElementById('dev-filtro-op').value.trim();
    let url = `${API_URL}/consumo/em-uso?`;
    if (op) url += `ordem=${encodeURIComponent(op)}`;

    try {
        const res = await fetch(url);
        if (res.ok) {
            const lotes = await res.json();
            const div = document.getElementById('lista-para-devolucao');
            if (!div) return;

            div.innerHTML = lotes.length === 0 ? "<p style='color:var(--text-muted); text-align:center;'>Nenhum lote pendente de devolução.</p>" : lotes.map(l => `
                <div class="item-list">
                    <div>
                        <strong style="color:var(--accent-blue);">OP: ${l.ordem_producao} - Máq ${l.maquina_numero}</strong><br>
                        <span style="font-size:13px;">${l.material_descricao} (Lote: ${l.lote_fornecedor})</span>
                    </div>
                    <button class="btn-small-edit" onclick="abrirDevolucaoModal(${l.id})">Devolver Sobra</button>
                </div>
            `).join('');
        }
    } catch (e) { console.error(e); }
}

function abrirDevolucaoModal(idConsumo) {
    document.getElementById('form-dev-id').value = idConsumo;
    document.getElementById('form-dev-peso').value = '';
    abrirModal('modal-devolucao-item');
}

async function confirmarDevolucaoSobra() {
    const idConsumo = parseInt(document.getElementById('form-dev-id').value);
    const pesoBruto = parseFloat(document.getElementById('form-dev-peso').value);

    if (isNaN(pesoBruto) || pesoBruto < 0) {
        return alert("Digite o peso bruto válido medido na balança!");
    }

    const novoBarcodeSobra = "SOBRA-" + Math.floor(Math.random() * 899999 + 100000);

    try {
        const res = await fetch(`${API_URL}/consumo/devolver`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                consumo_id: idConsumo,
                peso_balanca_bruto: pesoBruto,
                novo_codigo_barras_sobra: novoBarcodeSobra
            })
        });

        if (res.ok) {
            const data = await res.json();
            alert(`Sobras devolvidas!\nConsumo Real Registrado na OP: ${data.consumo_real_kg}kg\nSobra Gerada no Estoque: ${data.sobra_liquida_kg}kg\nEtiqueta da Sobra: ${data.nova_etiqueta}`);
            fecharModal('modal-devolucao-item');
            carregarListaParaDevolucao();
        } else {
            const err = await res.json();
            alert(`Erro: ${err.detail}`);
        }
    } catch (e) {
        alert("Erro ao registrar devolução.");
    }
}

// --- LÓGICA DE REFUGO (SCRAP) ---

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

// --- VISÃO CONSOLIDADA DA OP ---

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

// --- GESTÃO / ADMIN ---

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
