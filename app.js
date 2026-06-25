// URL do seu Render
const API_URL = "https://newisland-ho6j.onrender.com";

let usuarioLogado = null;
let DADOS_SKUS = [];
let DADOS_CODIGOS_PARADA = [];

// Variáveis para controle dos IDs dinâmicos dos formulários
let contadorOrdens = 0;
let contadorParadas = 0;

// ==========================================
// FUNÇÃO PARA LIDAR COM O "SONO" DO RENDER
// ==========================================
async function fetchComTentativas(url, options = {}, retries = 4) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            // Se conectou, retorna a resposta
            return response; 
        } catch (err) {
            if (i === retries - 1) throw err; // Se for a última tentativa, lança o erro
            console.log(`Tentativa ${i+1} falhou, aguardando servidor despertar...`);
            // Espera 3 segundos antes de tentar de novo
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Seta a data de hoje no campo de data do apontamento
    const inputData = document.getElementById('ap-data');
    if (inputData) inputData.value = new Date().toISOString().split('T')[0];
});

async function executarLogin() {
    const loginInput = document.getElementById('login-usuario').value.trim();
    const senhaInput = document.getElementById('login-senha').value.trim();
    const btn = document.getElementById('btn-entrar');

    if (!loginInput || !senhaInput) return alert("Preencha usuário e senha.");

    btn.innerText = "Conectando (Pode levar até 1 minuto)..."; 
    btn.disabled = true;

    try {
        const res = await fetchComTentativas(`${API_URL}/usuarios/auth`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ login: loginInput, senha: senhaInput })
        });

        if (res.ok) {
            const user = await res.json();
            usuarioLogado = user;
            iniciarAppOperador();
        } else {
            alert("Usuário ou senha incorretos.");
        }
    } catch (e) {
        alert("O servidor gratuito pode estar despertando. Aguarde alguns segundos e clique novamente!");
    } finally {
        btn.innerText = "Entrar"; 
        btn.disabled = false;
    }
}

function sair() {
    usuarioLogado = null;
    document.getElementById('tela-operador').classList.add('escondido');
    document.getElementById('tela-login').classList.remove('escondido');
    document.getElementById('login-senha').value = '';
}

async function iniciarAppOperador() {
    document.getElementById('tela-login').classList.add('escondido');
    document.getElementById('tela-operador').classList.remove('escondido');
    document.getElementById('boas-vindas').innerText = `Operador: ${usuarioLogado.nome}`;

    await carregarDadosMestres();
    adicionarOrdem(); // Já inicia com uma ordem vazia na tela
}

async function carregarDadosMestres() {
    try {
        // Agora usamos a função que faz retentativas caso o backend esteja lento
        const resSkus = await fetchComTentativas(`${API_URL}/skus`);
        if (resSkus && resSkus.ok) DADOS_SKUS = await resSkus.json();

        const resParadas = await fetchComTentativas(`${API_URL}/paradas-codigos`);
        if (resParadas && resParadas.ok) DADOS_CODIGOS_PARADA = await resParadas.json();
    } catch (e) {
        console.error("Erro ao baixar SKUs e Códigos", e);
        alert("Atenção: Os dados de produtos e paradas não carregaram corretamente. Recarregue a página.");
    }
}

function carregarSkusEParadasDaMaquina() {
    // Se o operador mudar a máquina, seria ideal recarregar os selects de paradas,
    // pois algumas paradas podem ser específicas de cada máquina.
    const selectsParada = document.querySelectorAll('.select-codigo-parada');
    const maquinaSelecionada = document.getElementById('ap-maquina').value;

    selectsParada.forEach(select => {
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione a Parada</option>';
        DADOS_CODIGOS_PARADA.filter(p => String(p.maquina) === String(maquinaSelecionada)).forEach(p => {
            select.innerHTML += `<option value="${p.numero}">${p.numero} - ${p.problema}</option>`;
        });
        select.value = valorAtual; // Tenta manter o valor anterior
    });
}

// ==========================================
// LÓGICA DINÂMICA (ORDENS E PARADAS)
// ==========================================

function adicionarOrdem() {
    contadorOrdens++;
    const container = document.getElementById('container-ordens');
    
    // Gera as options do select de SKUs
    let skuOptions = '<option value="">Selecione o Produto (SKU)</option>';
    DADOS_SKUS.forEach(sku => {
        skuOptions += `<option value="${sku.codigo_sku}">${sku.codigo_sku} - ${sku.descricao}</option>`;
    });

    const html = `
        <div class="dynamic-item" id="ordem-${contadorOrdens}">
            <div class="grid-2">
                <div class="form-group">
                    <label>Ordem:</label>
                    <input type="text" class="input-ordem" placeholder="Nº da Ordem">
                </div>
                <div class="form-group">
                    <label>SKU (Produto):</label>
                    <select class="input-sku">${skuOptions}</select>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group">
                    <label>Horário Padrão (min):</label>
                    <input type="number" class="input-hp" value="0" min="0" oninput="calcularResumo()">
                </div>
                <div class="form-group">
                    <label>Run Time (min):</label>
                    <input type="number" class="input-rt" value="0" min="0" oninput="calcularResumo()">
                </div>
            </div>
            <div class="grid-3">
                <div class="form-group">
                    <label>Machine Counter:</label>
                    <input type="number" class="input-mc" value="0" min="0">
                </div>
                <div class="form-group">
                    <label>Pallets:</label>
                    <input type="number" class="input-pallets" value="0" min="0">
                </div>
                <div class="form-group">
                    <label>Fardos Avulsos:</label>
                    <input type="number" class="input-fardos" value="0" min="0">
                </div>
            </div>
            <button class="btn-danger-small" onclick="removerItem('ordem-${contadorOrdens}')">Remover Ordem</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function adicionarParada() {
    contadorParadas++;
    const container = document.getElementById('container-paradas');
    const maquinaSelecionada = document.getElementById('ap-maquina').value;
    
    let paradaOptions = '<option value="">Selecione a Parada</option>';
    DADOS_CODIGOS_PARADA.filter(p => String(p.maquina) === String(maquinaSelecionada)).forEach(p => {
        paradaOptions += `<option value="${p.numero}">${p.numero} - ${p.problema}</option>`;
    });

    const html = `
        <div class="dynamic-item" id="parada-${contadorParadas}">
            <div class="grid-2">
                <div class="form-group">
                    <label>Código do Problema:</label>
                    <select class="input-codigo-parada select-codigo-parada">${paradaOptions}</select>
                </div>
                <div class="form-group">
                    <label>Minutos Parados:</label>
                    <input type="number" class="input-minutos-parada" value="0" min="0" oninput="calcularResumo()">
                </div>
            </div>
            <button class="btn-danger-small" onclick="removerItem('parada-${contadorParadas}')">Remover Parada</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function removerItem(idElemento) {
    document.getElementById(idElemento).remove();
    calcularResumo();
}

// ==========================================
// VALIDAÇÕES VISUAIS EM TEMPO REAL
// ==========================================

function calcularResumo() {
    const turno = parseInt(document.getElementById('ap-turno').value || 1);
    const tno = parseInt(document.getElementById('ap-tno').value || 0);
    
    const cargaTurnos = { 1: 455, 2: 440, 3: 415 };
    const cargaExigida = cargaTurnos[turno];

    // Somar Ordens
    let somaHP = 0;
    let somaRT = 0;
    document.querySelectorAll('.input-hp').forEach(el => somaHP += parseInt(el.value || 0));
    document.querySelectorAll('.input-rt').forEach(el => somaRT += parseInt(el.value || 0));

    // Somar Paradas
    let somaParadas = 0;
    document.querySelectorAll('.input-minutos-parada').forEach(el => somaParadas += parseInt(el.value || 0));

    // TRAVA 1: HP + TNO == Carga Turno
    const tempoTotalApontado = somaHP + tno;
    const trava1Ok = tempoTotalApontado === cargaExigida;

    // TRAVA 2: HP - RT == Paradas
    const paradasEsperadas = somaHP - somaRT;
    const trava2Ok = paradasEsperadas === somaParadas && paradasEsperadas >= 0;

    // Atualizar UI
    document.getElementById('res-carga').innerText = `${cargaExigida}m`;
    
    const elResTotal = document.getElementById('res-total');
    elResTotal.innerText = `${tempoTotalApontado}m`;
    elResTotal.className = trava1Ok ? 'status-ok' : 'status-erro';

    document.getElementById('res-parada-calc').innerText = `${paradasEsperadas}m`;
    
    const elResParada = document.getElementById('res-parada-apon');
    elResParada.innerText = `${somaParadas}m`;
    elResParada.className = trava2Ok ? 'status-ok' : 'status-erro';

    // Habilitar botão apenas se as duas travas passarem
    document.getElementById('btn-enviar-apontamento').disabled = !(trava1Ok && trava2Ok);
}

// ==========================================
// ENVIO PARA O BACKEND
// ==========================================

async function enviarApontamento() {
    const btn = document.getElementById('btn-enviar-apontamento');
    btn.innerText = "Validando e Enviando...";
    btn.disabled = true;

    try {
        const payload = {
            data_registro: document.getElementById('ap-data').value,
            turno: parseInt(document.getElementById('ap-turno').value),
            operador: usuarioLogado.nome,
            maquina: parseInt(document.getElementById('ap-maquina').value),
            tempo_nao_operacional: parseInt(document.getElementById('ap-tno').value || 0),
            ordens: [],
            paradas: []
        };

        // Coletar Ordens
        document.querySelectorAll("[id^='ordem-']").forEach(div => {
            payload.ordens.push({
                ordem: div.querySelector('.input-ordem').value,
                codigo_sku: div.querySelector('.input-sku').value,
                horario_padrao: parseInt(div.querySelector('.input-hp').value || 0),
                run_time: parseInt(div.querySelector('.input-rt').value || 0),
                machine_counter: parseInt(div.querySelector('.input-mc').value || 0),
                pallets: parseInt(div.querySelector('.input-pallets').value || 0),
                fardos_avulsos: parseInt(div.querySelector('.input-fardos').value || 0)
            });
        });

        // Coletar Paradas
        document.querySelectorAll("[id^='parada-']").forEach(div => {
            payload.paradas.push({
                numero_parada: div.querySelector('.input-codigo-parada').value,
                minutos_parados: parseInt(div.querySelector('.input-minutos-parada').value || 0)
            });
        });

        // Verificação final preventiva frontend
        if (payload.ordens.length === 0) {
            throw new Error("Adicione pelo menos uma ordem de produção.");
        }
        for(let o of payload.ordens) {
            if(!o.ordem || !o.codigo_sku) throw new Error("Preencha todos os campos das ordens (Número e SKU).");
        }
        for(let p of payload.paradas) {
            if(!p.numero_parada) throw new Error("Selecione o código de problema para as paradas.");
        }

        const res = await fetch(`${API_URL}/apontamentos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("✅ Apontamento de turno gravado no Banco de Dados com Sucesso!");
            // Limpa a tela para o próximo
            document.getElementById('container-ordens').innerHTML = '';
            document.getElementById('container-paradas').innerHTML = '';
            document.getElementById('ap-tno').value = 0;
            adicionarOrdem();
            calcularResumo();
        } else {
            const erro = await res.json();
            alert(`Erro do Servidor:\n${erro.detail}`);
        }

    } catch (e) {
        alert(e.message || "Erro ao conectar com a API.");
    } finally {
        btn.innerText = "Enviar Apontamento";
        calcularResumo(); // Força a revalidação para destravar/trancar o botão
    }
}
