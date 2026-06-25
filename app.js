/**
 * ARQUITETURA CORE DE FINANÇAS E GESTÃO - PROSPERAR CLUB
 * Implementação Reativa Multi-Barbeiros Sincronizada com o Banco de Dados.
 */

const API_URL = "https://prosperar.onrender.com";

// Estado de Sessão
let usuarioLogado = null;
let perfilLogado = null; 
let nomeUsuarioLogado = null;

let servicoSelecionado = null;
let barbeiroSelecionado = null;
let horarioSelecionado = null;
let pagamentoSelecionado = null;
let precoServico = 0;

// Bancos Dinâmicos Sincronizados do Frontend
let DADOS_AGENDAMENTOS = [];
let DADOS_USUARIOS = [];
let DADOS_DESPESAS = [];
let DADOS_SERVICOS = []; 
let DADOS_BLOQUEIOS = [];
let ESTRUTURA_BARBEIROS = []; 

// Configurações gerais da barbearia
let DADOS_CONFIG = {
    hora_abertura: "09:00",
    hora_fechamento: "20:00",
    intervalo_inicio: "12:00",
    intervalo_fim: "13:00",
    datas_fechadas: ""
};

let filtroTempoGlobal = 'mes_atual'; 
let filtroBarbeiroAlvo = 'todos'; 
let dataFiltroInicio = new Date().toISOString().split('T')[0];
let dataFiltroFim = new Date().toISOString().split('T')[0];

document.addEventListener("DOMContentLoaded", () => {
    fetch(`${API_URL}/configuracoes`).catch(() => console.log("Aquecendo servidor..."));

    const todayStr = new Date().toISOString().split('T')[0];
    const inputsData = ['data', 'encaixe-data', 'despesa-data', 'bloqueio-data', 'config-nova-data-folga'];
    inputsData.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = todayStr;
    });

    const btnCadastrar = document.getElementById('btn-cadastrar');
    if(btnCadastrar) btnCadastrar.addEventListener('click', executarCadastro);

    const btnEntrar = document.getElementById('btn-entrar');
    if(btnEntrar) btnEntrar.addEventListener('click', executarLogin);
    
    const inputInicio = document.getElementById('filtro-data-inicio');
    const inputFim = document.getElementById('filtro-data-fim');
    if(inputInicio) inputInicio.value = dataFiltroInicio;
    if(inputFim) inputFim.value = dataFiltroFim;
    
    inicializarListenersEstaticos(); 
});

function fecharModal(idModal) {
    const modal = document.getElementById(idModal);
    if(modal) modal.classList.add('escondido');
}

async function sincronizarBancoDeDados() {
    try {
        const resConfig = await fetch(`${API_URL}/configuracoes`);
        if (resConfig.ok) {
            const conf = await resConfig.json();
            if(conf) DADOS_CONFIG = conf;
        }

        const resBloq = await fetch(`${API_URL}/bloqueios`);
        if(resBloq.ok) DADOS_BLOQUEIOS = await resBloq.json();

        const resAgendamentos = await fetch(`${API_URL}/agendamentos`);
        if (resAgendamentos.ok) DADOS_AGENDAMENTOS = await resAgendamentos.json();
        
        const resUsuarios = await fetch(`${API_URL}/usuarios`);
        if (resUsuarios.ok) {
            DADOS_USUARIOS = await resUsuarios.json();
            
            ESTRUTURA_BARBEIROS = DADOS_USUARIOS
                .filter(u => (u.perfil === 'admin' || u.perfil === 'barbeiro') && u.login !== 'admin')
                .map(u => ({
                    id: u.id, 
                    login: u.login, 
                    nome: u.nome, 
                    celular: u.celular, 
                    comissao: parseFloat(u.comissao || 0.40),
                    perfil: u.perfil,
                    pix: u.pix || ''
                }));
        }

        const resDespesas = await fetch(`${API_URL}/despesas`);
        if (resDespesas.ok) DADOS_DESPESAS = await resDespesas.json();

        const resServicos = await fetch(`${API_URL}/servicos`);
        if (resServicos.ok) DADOS_SERVICOS = await resServicos.json();
    } catch (e) {
        console.error("Aviso: Falha ao sincronizar com banco.", e);
    }
}

// --------- INTEGRAÇÃO DO WHATSAPP ---------
function notificarBarbeiroWhatsApp(tipo, agendamentoInfo) {
    const bInfo = ESTRUTURA_BARBEIROS.find(b => b.nome.trim().toLowerCase() === agendamentoInfo.barbeiro.trim().toLowerCase());
    
    if(!bInfo || !bInfo.celular) return;
    
    const celularLimpo = bInfo.celular.replace(/\D/g, '');
    if(!celularLimpo) return;

    const dataBr = agendamentoInfo.data.split('-').reverse().join('/');
    let mensagem = '';
    
    if(tipo === 'novo') {
        mensagem = `Olá ${bInfo.nome.split(' ')[0]}, você tem um *NOVO AGENDAMENTO*!\n\n👤 Cliente: ${agendamentoInfo.cliente}\n✂️ Serviço: ${agendamentoInfo.servico}\n📅 Data: ${dataBr}\n⏰ Horário: ${agendamentoInfo.hora}\n💳 Pagamento: ${agendamentoInfo.pagamento}`;
    } else if(tipo === 'editado') {
        mensagem = `Olá ${bInfo.nome.split(' ')[0]}, o cliente ${agendamentoInfo.cliente} *ALTEROU* o agendamento.\n\n✂️ Novo Serviço: ${agendamentoInfo.servico}\n📅 Nova Data: ${dataBr}\n⏰ Novo Horário: ${agendamentoInfo.hora}`;
    } else if(tipo === 'cancelado') {
        mensagem = `Olá ${bInfo.nome.split(' ')[0]}, um agendamento foi *CANCELADO*.\n\n👤 Cliente: ${agendamentoInfo.cliente}\n📅 Data: ${dataBr}\n⏰ Horário: ${agendamentoInfo.hora}`;
    }

    const url = `https://wa.me/55${celularLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
}

function parseTime(t) { 
    if(!t) return 0; 
    let [h,m] = t.split(':'); 
    return parseInt(h)*60 + parseInt(m); 
}

function formatTime(m) { 
    let hh = Math.floor(m/60).toString().padStart(2,'0'); 
    let mm = (m%60).toString().padStart(2,'0'); 
    return `${hh}:${mm}`; 
}

function gerarHorariosDoDia(dataStr, nomeBarbeiroAlvo = null) {
    if(!DADOS_CONFIG) return [];
    
    const fechadas = DADOS_CONFIG.datas_fechadas ? DADOS_CONFIG.datas_fechadas.split(',').map(d => d.trim()).filter(Boolean) : [];
    if(fechadas.includes(dataStr)) return []; 
    
    const bloqueiosBarbeiro = DADOS_BLOQUEIOS.filter(b => 
        b.data === dataStr && 
        nomeBarbeiroAlvo && 
        b.barbeiro.trim().toLowerCase() === nomeBarbeiroAlvo.trim().toLowerCase()
    );

    let horarios = [];
    let atual = parseTime(DADOS_CONFIG.hora_abertura || '09:00');
    let fim = parseTime(DADOS_CONFIG.hora_fechamento || '20:00');
    let intIni = parseTime(DADOS_CONFIG.intervalo_inicio || '12:00');
    let intFim = parseTime(DADOS_CONFIG.intervalo_fim || '13:00');

    const temIntervalo = DADOS_CONFIG.intervalo_inicio && DADOS_CONFIG.intervalo_fim;

    while(atual < fim) {
        let isBlocked = false;

        if(temIntervalo && atual >= intIni && atual < intFim) {
            isBlocked = true;
        }

        bloqueiosBarbeiro.forEach(b => {
            const bIni = parseTime(b.hora_inicio);
            const bFim = parseTime(b.hora_fim);
            if(atual >= bIni && atual < bFim) {
                isBlocked = true;
            }
        });

        if(!isBlocked) {
            horarios.push(formatTime(atual));
        }
        
        atual += 30; 
    }

    return [
        { turno: "☀️ Manhã", horas: horarios.filter(h => parseTime(h) < 720) }, 
        { turno: "🌤️ Tarde", horas: horarios.filter(h => parseTime(h) >= 720 && parseTime(h) < 1080) },
        { turno: "🌙 Noite", horas: horarios.filter(h => parseTime(h) >= 1080) } 
    ];
}

function isSlotPast(dateStr, timeStr) {
    const agora = new Date();
    const [ano, mes, dia] = dateStr.split('-').map(Number);
    const [hora, minuto] = timeStr.split(':').map(Number);
    return new Date(ano, mes - 1, dia, hora, minuto, 0, 0) < agora;
}

// --------- GESTÃO DE BLOQUEIOS PESSOAIS DA AGENDA ----------
function renderizarAgendaBloqueios() {
    const selBarbeiro = document.getElementById('bloqueio-barbeiro');
    if(selBarbeiro) {
        selBarbeiro.innerHTML = "";
        if(perfilLogado === 'admin') {
            ESTRUTURA_BARBEIROS.forEach(b => selBarbeiro.innerHTML += `<option value="${b.nome}">${b.nome}</option>`);
        } else {
            selBarbeiro.innerHTML = `<option value="${nomeUsuarioLogado}">${nomeUsuarioLogado}</option>`;
            selBarbeiro.disabled = true;
        }
    }

    const container = document.getElementById('lista-bloqueios-cadastrados');
    if(!container) return;

    let bloqueiosFiltrados = DADOS_BLOQUEIOS;
    if(perfilLogado !== 'admin') {
        bloqueiosFiltrados = DADOS_BLOQUEIOS.filter(b => b.barbeiro.trim().toLowerCase() === nomeUsuarioLogado.trim().toLowerCase());
    }

    container.innerHTML = bloqueiosFiltrados.length === 0 ? "<p style='color:var(--text-muted); font-size: 13px;'>Nenhum bloqueio pessoal registrado.</p>" : "";

    bloqueiosFiltrados.forEach(b => {
        const dataBr = b.data.split('-').reverse().join('/');
        let textoHora = (b.hora_inicio === "00:00" && b.hora_fim === "23:59") ? "O dia todo fechado" : `Das ${b.hora_inicio} às ${b.hora_fim}`;
        
        container.innerHTML += `
            <div class="item-backoffice" style="border-left: 4px solid var(--accent-color); margin-bottom: 8px;">
                <div style="flex:1;">
                    <strong>${b.barbeiro}</strong><br>
                    <span style="font-size:11px; color:var(--text-muted);">Data: ${dataBr}</span>
                    <div style="color: var(--accent-color); font-weight:700; margin-top: 2px; font-size:12px;">⏰ ${textoHora}</div>
                </div>
                <button class="btn-small-delete" onclick="excluirBloqueio(${b.id})" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Liberar</button>
            </div>
        `;
    });
}

function toggleDiaTodoBloqueio() {
    const isChecked = document.getElementById('bloqueio-dia-todo').checked;
    const boxHorarios = document.getElementById('box-horarios-bloqueio');
    if(isChecked) {
        boxHorarios.classList.add('escondido');
        document.getElementById('bloqueio-inicio').value = "00:00";
        document.getElementById('bloqueio-fim').value = "23:59";
    } else {
        boxHorarios.classList.remove('escondido');
        document.getElementById('bloqueio-inicio').value = "14:00";
        document.getElementById('bloqueio-fim').value = "16:00";
    }
}

async function salvarNovoBloqueio() {
    const barbeiro = document.getElementById('bloqueio-barbeiro').value;
    const data = document.getElementById('bloqueio-data').value;
    const hora_inicio = document.getElementById('bloqueio-inicio').value;
    const hora_fim = document.getElementById('bloqueio-fim').value;

    if(!data || !hora_inicio || !hora_fim) return alert("Preencha as informações do bloqueio corretamente.");

    const btn = document.getElementById('btn-salvar-bloqueio');
    btn.innerText = "Bloqueando..."; btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/bloqueios`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ barbeiro, data, hora_inicio, hora_fim })
        });

        if(res.ok) {
            alert("Agenda bloqueada com sucesso!");
            document.getElementById('bloqueio-dia-todo').checked = false;
            toggleDiaTodoBloqueio();
            await sincronizarBancoDeDados();
            renderizarAgendaBloqueios();
        }
    } catch(e) {
        alert("Erro ao bloquear horário.");
    } finally {
        btn.innerText = "Trancar Agenda"; btn.disabled = false;
    }
}

async function excluirBloqueio(id) {
    if(!confirm("Liberar este horário para agendamentos novamente?")) return;
    try {
        const res = await fetch(`${API_URL}/bloqueios/${id}`, { method: 'DELETE' });
        if(res.ok) {
            await sincronizarBancoDeDados();
            renderizarAgendaBloqueios();
        }
    } catch(e) {
        alert("Erro ao remover bloqueio.");
    }
}


// --------- FUNÇÕES DE CONFIGURAÇÃO GERAL (ABA ADMIN) ----------
function renderizarConfiguracoesAdmin() {
    document.getElementById('config-abertura').value = DADOS_CONFIG.hora_abertura || '09:00';
    document.getElementById('config-fechamento').value = DADOS_CONFIG.hora_fechamento || '20:00';
    document.getElementById('config-almoco-inicio').value = DADOS_CONFIG.intervalo_inicio || '12:00';
    document.getElementById('config-almoco-fim').value = DADOS_CONFIG.intervalo_fim || '13:00';
    atualizarListaDatasFechadas();
}

async function salvarConfiguracoesAdmin(mostrarAlerta = true) {
    const hora_abertura = document.getElementById('config-abertura').value;
    const hora_fechamento = document.getElementById('config-fechamento').value;
    const intervalo_inicio = document.getElementById('config-almoco-inicio').value;
    const intervalo_fim = document.getElementById('config-almoco-fim').value;
    
    const payload = {
        hora_abertura,
        hora_fechamento,
        intervalo_inicio,
        intervalo_fim,
        datas_fechadas: DADOS_CONFIG.datas_fechadas || ""
    };

    try {
        const res = await fetch(`${API_URL}/configuracoes`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if(res.ok) {
            if(mostrarAlerta) alert("⚙️ Configurações da barbearia atualizadas com sucesso!");
            await sincronizarBancoDeDados();
        }
    } catch(e) {
        if(mostrarAlerta) alert("Erro ao salvar configurações.");
    }
}

function atualizarListaDatasFechadas() {
    const container = document.getElementById('lista-datas-fechadas');
    const datasArray = DADOS_CONFIG.datas_fechadas ? DADOS_CONFIG.datas_fechadas.split(',').filter(Boolean) : [];
    
    container.innerHTML = datasArray.length === 0 ? "<p style='color:var(--text-muted); font-size: 12px;'>Nenhum feriado/folga programado.</p>" : "";

    datasArray.forEach(data => {
        const dataBr = data.split('-').reverse().join('/');
        container.innerHTML += `
            <div class="item-backoffice" style="border-left: 4px solid var(--accent-color); margin-bottom: 6px; padding: 10px;">
                <div style="font-size: 14px; font-weight: 600;">${dataBr}</div>
                <button class="btn-small-delete" onclick="removerDataFechada('${data}')" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer;">Remover</button>
            </div>
        `;
    });
}

async function adicionarDataFechada() {
    const novaData = document.getElementById('config-nova-data-folga').value;
    if(!novaData) return alert("Selecione uma data válida.");

    let datasArray = DADOS_CONFIG.datas_fechadas ? DADOS_CONFIG.datas_fechadas.split(',').filter(Boolean) : [];
    if(datasArray.includes(novaData)) return alert("Esta data já está bloqueada.");

    datasArray.push(novaData);
    DADOS_CONFIG.datas_fechadas = datasArray.join(',');
    document.getElementById('config-nova-data-folga').value = "";
    
    atualizarListaDatasFechadas();
    await salvarConfiguracoesAdmin(false); 
}

async function removerDataFechada(dataRemover) {
    let datasArray = DADOS_CONFIG.datas_fechadas ? DADOS_CONFIG.datas_fechadas.split(',').filter(Boolean) : [];
    datasArray = datasArray.filter(d => d !== dataRemover);
    DADOS_CONFIG.datas_fechadas = datasArray.join(',');
    
    atualizarListaDatasFechadas();
    await salvarConfiguracoesAdmin(false); 
}

function alternarAbasAuth(aba) {
    const tabLogin = document.getElementById('tab-login');
    const tabCadastro = document.getElementById('tab-cadastro');
    const formLogin = document.getElementById('form-login');
    const formCadastro = document.getElementById('form-cadastro');

    if(tabLogin) tabLogin.classList.remove('active');
    if(tabCadastro) tabCadastro.classList.remove('active');
    if(formLogin) formLogin.classList.add('escondido');
    if(formCadastro) formCadastro.classList.add('escondido');
    
    if(aba === 'login') {
        if(tabLogin) tabLogin.classList.add('active');
        if(formLogin) formLogin.classList.remove('escondido');
    } else {
        if(tabCadastro) tabCadastro.classList.add('active');
        if(formCadastro) formCadastro.classList.remove('escondido');
    }
}

function atualizarSeletoresEFormulariosDeEquipe() {
    const seletorFiltro = document.getElementById('filtro-barbeiro-alvo');
    if(seletorFiltro) {
        seletorFiltro.innerHTML = '<option value="todos">-- Todos os Barbeiros (Geral) --</option>';
        ESTRUTURA_BARBEIROS.forEach(b => {
            seletorFiltro.innerHTML += `<option value="${b.id}">${b.nome}</option>`;
        });
    }

    const seletorEncaixe = document.getElementById('encaixe-barbeiro');
    if(seletorEncaixe) {
        seletorEncaixe.innerHTML = '';
        ESTRUTURA_BARBEIROS.forEach(b => {
            seletorEncaixe.innerHTML += `<option value="${b.nome}">${b.nome}</option>`;
        });
    }

    const containerLista = document.getElementById('lista-equipe-cadastrada');
    if(containerLista) {
        containerLista.innerHTML = '';
        ESTRUTURA_BARBEIROS.forEach(b => {
            const isMe = b.login === usuarioLogado;
            const badgeAdmin = b.perfil === 'admin' ? '<span style="font-size:9px; background:var(--accent-color); color:black; padding:2px 6px; border-radius:4px; font-weight:800; margin-left:6px; vertical-align:middle;">ADMIN</span>' : '';
            
            const item = document.createElement('div');
            item.className = 'item-backoffice';
            item.innerHTML = `
                <div style="flex:1;">
                    <strong>${b.nome}</strong> ${badgeAdmin}<br>
                    <span style="font-size:11px; color:var(--text-muted);">User: ${b.login} | Split: ${(b.comissao*100).toFixed(0)}%</span><br>
                    <span style="font-size:11px; color:var(--text-muted);">Pix: ${b.pix || 'Não cadastrado'}</span>
                </div>
                <div style="display: flex; gap: 4px; flex-direction: column;">
                    <button class="btn-small-edit" onclick="abrirModalEdicaoBarbeiro(${b.id})">Editar</button>
                    ${!isMe ? `<button class="btn-small-delete" onclick="removerBarbeiroSistema(${b.id})" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Excluir</button>` : ''}
                </div>
            `;
            containerLista.appendChild(item);
        });
    }
}

function abrirModalEdicaoBarbeiro(id) {
    const barbeiro = ESTRUTURA_BARBEIROS.find(b => b.id == id);
    if(!barbeiro) return;
    document.getElementById('edit-barbeiro-id').value = barbeiro.id;
    document.getElementById('edit-barbeiro-nome').value = barbeiro.nome;
    document.getElementById('edit-barbeiro-celular').value = barbeiro.celular || "";
    document.getElementById('edit-barbeiro-pix').value = barbeiro.pix || "";
    document.getElementById('edit-barbeiro-comissao').value = barbeiro.comissao.toFixed(2);
    document.getElementById('edit-barbeiro-perfil').value = barbeiro.perfil;
    document.getElementById('modal-editar-barbeiro').classList.remove('escondido');
}

async function salvarEdicaoBarbeiro() {
    const id = document.getElementById('edit-barbeiro-id').value;
    const nome = document.getElementById('edit-barbeiro-nome').value.trim();
    const celular = document.getElementById('edit-barbeiro-celular').value.trim();
    const pix = document.getElementById('edit-barbeiro-pix').value.trim();
    const comissao = parseFloat(document.getElementById('edit-barbeiro-comissao').value);
    const perfil = document.getElementById('edit-barbeiro-perfil').value;
    
    if(!nome) return alert("O nome não pode ficar vazio.");

    try {
        const res = await fetch(`${API_URL}/usuarios/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, celular, comissao, perfil, pix })
        });

        if(res.ok) {
            alert("Profissional atualizado no banco de dados!");
            fecharModal('modal-editar-barbeiro');
            await sincronizarBancoDeDados();
            atualizarSeletoresEFormulariosDeEquipe();
            recarregarAbaAtivaAdm();
        }
    } catch(e) {
        alert("Erro ao editar o profissional.");
    }
}

async function incluirBarbeiroSistema() {
    const nome = document.getElementById('adm-barbeiro-nome').value.trim();
    const login = document.getElementById('adm-barbeiro-login').value.trim().toLowerCase();
    const celular = document.getElementById('adm-barbeiro-celular').value.trim();
    const pix = document.getElementById('adm-barbeiro-pix').value.trim();
    const comissao = parseFloat(document.getElementById('adm-barbeiro-comissao').value);
    const perfil = document.getElementById('adm-barbeiro-perfil').value;
    const senha = document.getElementById('adm-barbeiro-senha').value;

    if(!nome || !login || !senha) return alert("Por favor, preencha nome, login e senha.");

    const payload = {
        login: login,
        senha: senha,
        nome: nome,
        celular: celular,
        perfil: perfil,
        plano_assinatura: "Nenhum",
        comissao: comissao,
        pix: pix
    };

    const btn = document.querySelector('button[onclick="incluirBarbeiroSistema()"]');
    btn.innerText = "Salvando no Banco..."; btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/usuarios/cadastro`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if(res.ok) { 
            alert(`✨ Profissional ${nome} cadastrado com sucesso e salvo no banco de dados!`);
            document.getElementById('adm-barbeiro-nome').value = '';
            document.getElementById('adm-barbeiro-login').value = '';
            document.getElementById('adm-barbeiro-celular').value = '';
            document.getElementById('adm-barbeiro-pix').value = '';
            document.getElementById('adm-barbeiro-senha').value = '';

            await sincronizarBancoDeDados();
            atualizarSeletoresEFormulariosDeEquipe();
            recarregarAbaAtivaAdm();
        } else {
            alert("Erro ao cadastrar: Esse login (nome de usuário) já existe. Escolha outro.");
        }
    } catch(e) {
        alert("Falha de comunicação com o servidor.");
    } finally {
        btn.innerText = "Salvar Novo Membro"; btn.disabled = false;
    }
}

async function removerBarbeiroSistema(id) {
    if(!confirm("Atenção: Deseja deletar permanentemente este profissional do banco de dados?")) return;
    
    try {
        const res = await fetch(`${API_URL}/usuarios/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Profissional removido com sucesso!");
            await sincronizarBancoDeDados();
            atualizarSeletoresEFormulariosDeEquipe();
            recarregarAbaAtivaAdm();
        }
    } catch(e) {
        alert("Erro ao remover o profissional.");
    }
}

async function executarCadastro() {
    const nome = document.getElementById('cad-nome').value.trim();
    const login = document.getElementById('cad-login').value.trim().toLowerCase();
    const celular = document.getElementById('cad-celular').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const confirmar = document.getElementById('cad-confirmar-senha').value;
    const btnCadastrar = document.getElementById('btn-cadastrar');

    if(!nome || !login || !senha) return alert("Preencha os dados básicos!");
    if(senha !== confirmar) return alert("As senhas informadas não conferem.");

    if(btnCadastrar) {
        btnCadastrar.innerText = "Criando conta no Banco...";
        btnCadastrar.disabled = true;
    }

    const payload = {
        login: login,
        senha: senha,
        nome: nome,
        celular: celular,
        plano_assinatura: "Nenhum",
        perfil: "cliente"
    };

    try {
        const res = await fetch(`${API_URL}/usuarios/cadastro`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if(res.ok) {
            usuarioLogado = login;
            perfilLogado = "cliente";
            nomeUsuarioLogado = nome;
            alert("✨ Conta criada com sucesso!");
            ativarAcessoAoPainelProfissional();
        } else if(res.status === 400) {
            alert("Este nome de usuário já está em uso. Tente outro.");
        } else {
            alert("Erro ao criar conta no sistema.");
        }
    } catch(e) {
        alert("Erro na rede. Verifique a API.");
    } finally {
        if(btnCadastrar) {
            btnCadastrar.innerText = "Salvar Cadastro Oficial";
            btnCadastrar.disabled = false;
        }
    }
}

async function executarLogin() {
    const loginInput = document.getElementById('login-usuario');
    const senhaInput = document.getElementById('login-senha');
    const btnEntrar = document.getElementById('btn-entrar');
    if(!loginInput || !senhaInput) return;

    const login = loginInput.value.trim().toLowerCase();
    const senha = senhaInput.value;

    if(!login || !senha) return alert("Preencha os campos de acesso.");

    if(btnEntrar) {
        btnEntrar.innerText = "Conectando ao banco... aguarde";
        btnEntrar.disabled = true;
    }

    try {
        let res;
        let tentativas = 0;
        let maxTentativas = 6; 
        
        while(tentativas < maxTentativas) {
            try {
                res = await fetch(`${API_URL}/usuarios/auth`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ login, senha })
                });
                break; 
            } catch(errRede) {
                tentativas++;
                if(tentativas >= maxTentativas) throw errRede; 
                
                if(btnEntrar) btnEntrar.innerText = `Ligando Servidor... ${tentativas}/6`;
                await new Promise(r => setTimeout(r, 5000)); 
            }
        }

        if(res.ok) {
            const user = await res.json();
            usuarioLogado = user.login;
            perfilLogado = user.perfil || 'cliente';
            nomeUsuarioLogado = user.nome;
            ativarAcessoAoPainelProfissional(); 
        } else {
            if(res.status === 404 || res.status === 401) {
                alert("Usuário ou senha incorretos! Verifique os dados e tente novamente.");
            } else {
                alert("Ocorreu um erro no banco de dados. Tente novamente.");
            }
        }
    } catch(e) {
        console.error("Erro final de rede:", e);
        if(login === "admin" && senha === "admin") {
            usuarioLogado = "admin"; perfilLogado = "admin"; nomeUsuarioLogado = "Admin Local";
            ativarAcessoAoPainelProfissional();
        } else {
            alert("O Servidor está passando por uma reinicialização profunda. Volte em 1 minuto e aperte Entrar.");
        }
    } finally {
        if(btnEntrar) {
            btnEntrar.innerText = "Entrar no System";
            btnEntrar.disabled = false;
        }
    }
}

async function mudarStatusAgendamento(id, novoStatus) {
    try {
        await fetch(`${API_URL}/agendamentos/${id}/status`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: novoStatus })
        });
        await sincronizarBancoDeDados();
        recarregarAbaAtivaAdm();
    } catch(e) {
        console.error("Erro ao mudar status: ", e);
    }
}

async function ativarAcessoAoPainelProfissional() {
    await sincronizarBancoDeDados();
    atualizarSeletoresEFormulariosDeEquipe();

    document.getElementById('tela-autenticacao')?.classList.add('escondido');
    document.getElementById('conteudo-app')?.classList.remove('escondido');

    montarMenuNavegacao(perfilLogado);
    
    if(perfilLogado === 'admin') {
        document.querySelectorAll('.restrito-adm').forEach(el => el.classList.remove('escondido'));
        document.querySelectorAll('.restrito-barbeiro-adm').forEach(el => el.classList.remove('escondido'));
        document.getElementById('card-rendimentos-barbeiro')?.classList.add('escondido');
        document.getElementById('bloco-filtros-global-adm')?.classList.remove('escondido');
        
        const seletor = document.getElementById('filtro-barbeiro-alvo');
        if(seletor) { seletor.disabled = false; seletor.value = 'todos'; filtroBarbeiroAlvo = 'todos'; }
        alternarTela('adm-dash');
    } else if (perfilLogado === 'barbeiro') {
        document.querySelectorAll('.restrito-adm').forEach(el => el.classList.add('escondido'));
        document.querySelectorAll('.restrito-barbeiro-adm').forEach(el => el.classList.remove('escondido'));
        document.getElementById('card-rendimentos-barbeiro')?.classList.remove('escondido');
        document.getElementById('bloco-filtros-global-adm')?.classList.remove('escondido');
        
        const bInfo = ESTRUTURA_BARBEIROS.find(b => b.login === usuarioLogado);
        if(bInfo) {
            filtroBarbeiroAlvo = bInfo.id;
            const seletor = document.getElementById('filtro-barbeiro-alvo');
            if(seletor) { seletor.value = bInfo.id; seletor.disabled = true; }
        }
        alternarTela('adm-dash');
    } else {
        document.getElementById('bloco-filtros-global-adm')?.classList.add('escondido');
        const bv = document.getElementById('boas-vistas-cliente');
        if(bv) bv.innerText = `Olá, ${nomeUsuarioLogado || 'Cliente'}!`;
        
        try {
            renderizarFormularioCliente();
            carregarMeusAgendamentosDoBanco();
        } catch (err) {
            console.error("Proteção Ativada: Ignorando dados antigos incompatíveis.", err);
        }
        alternarTela('home');
    }
}

// -------------------------------------------------------------
// FUNÇÃO SUPER BLINDADA - Aqui tratamos e interceptamos TUDO!
// -------------------------------------------------------------
function inicializarListenersEstaticos() {
    const inputData = document.getElementById('data');
    if(inputData) {
        inputData.addEventListener('change', () => {
            if (barbeiroSelecionado) renderizarGradeHorariosReais();
        });
    }

    const btnPreAgendar = document.getElementById('btnPreAgendar');
    if(btnPreAgendar) {
        btnPreAgendar.addEventListener('click', (e) => {
            try {
                e.preventDefault();
                
                // Validações Base
                if (!servicoSelecionado) return alert("Atenção: Por favor, clique e selecione o Serviço.");
                if (!barbeiroSelecionado) return alert("Atenção: Por favor, selecione o Profissional.");
                if (!horarioSelecionado) return alert("Atenção: Por favor, selecione um Horário disponível.");
                if (!pagamentoSelecionado) return alert("Atenção: Por favor, escolha a Forma de Pagamento.");

                const inputDataModal = document.getElementById('data');
                if (!inputDataModal) return alert("Erro no App: O campo de Data sumiu da tela.");
                
                const dataSelecionada = inputDataModal.value;
                if (!dataSelecionada) return alert("Atenção: Você precisa selecionar uma Data válida no calendário.");

                if (isSlotPast(dataSelecionada, horarioSelecionado)) {
                    alert("Atenção: Este horário já expirou ou passou. Escolha um horário válido no futuro.");
                    renderizarGradeHorariosReais();
                    return;
                }

                // Proteção contra divergência de tipo (Garante que Barbeiro seja encontrado)
                const bInfo = ESTRUTURA_BARBEIROS.find(b => String(b.id) === String(barbeiroSelecionado));

                const boxPix = document.getElementById('box-pagamento-pix');
                
                if (pagamentoSelecionado.toLowerCase() === 'pix') {
                    const chavePix = (bInfo && bInfo.pix) ? bInfo.pix : "Chave PIX não foi cadastrada por esse barbeiro.";
                    const elChave = document.getElementById('pix-chave-barbeiro');
                    const elValor = document.getElementById('pix-valor-servico');
                    
                    if(elChave) elChave.innerText = chavePix;
                    if(elValor) elValor.innerText = `R$ ${precoServico.toFixed(2)}`;
                    
                    if(boxPix) boxPix.classList.remove('escondido');
                } else {
                    if(boxPix) boxPix.classList.add('escondido');
                }

                const r = document.getElementById('modal-resumo-detalhes');
                if(r) {
                    r.innerHTML = `
                        <strong>Procedimento:</strong> ${servicoSelecionado}<br>
                        <strong>Profissional:</strong> ${bInfo ? bInfo.nome : 'Não Encontrado'}<br>
                        <strong>Data/Hora:</strong> ${dataSelecionada.split('-').reverse().join('/')} às ${horarioSelecionado}<br>
                        <span style="color:var(--success-color); font-weight:bold;">Valor Estimado: R$ ${precoServico.toFixed(2)}</span>
                    `;
                }
                
                const modalConf = document.getElementById('modal-confirmacao');
                if (modalConf) {
                    modalConf.classList.remove('escondido');
                } else {
                    alert("Erro Estrutural Crítico: O seu HTML não possui a 'div' com o id 'modal-confirmacao'.");
                }
            } catch(err) {
                // Se der qualquer erro em vez de "NADA ACONTECER", ele vai cuspir o motivo aqui!
                alert("Ops! Ocorreu um erro no aplicativo: " + err.message);
                console.error("Erro interno no botão Revisar e Confirmar:", err);
            }
        });
    }

    const btnConfirmarModal = document.getElementById('btn-confirmar-modal');
    if(btnConfirmarModal) {
        btnConfirmarModal.addEventListener('click', async (e) => {
            e.preventDefault();
            const btn = e.target;
            btn.innerText = "Enviando pro Servidor...";
            btn.disabled = true;

            try {
                const dataSelecionada = document.getElementById('data').value;
                const bNome = ESTRUTURA_BARBEIROS.find(b => String(b.id) === String(barbeiroSelecionado))?.nome;
                
                const payload = {
                    cliente: nomeUsuarioLogado ? nomeUsuarioLogado.toUpperCase() : "CLIENTE ANÔNIMO",
                    servico: servicoSelecionado,
                    barbeiro: bNome,
                    data: dataSelecionada,
                    hora: horarioSelecionado,
                    pagamento: pagamentoSelecionado,
                    status: "Agendado",
                    valor_produtos: 0.00,
                    valor_gorjeta: 0.00
                };

                const res = await fetch(`${API_URL}/agendamentos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if(res.ok) {
                    fecharModal('modal-confirmacao');
                    alert("✨ Reserva confirmada no sistema e salva no banco!\nVocê será redirecionado para avisar o barbeiro no WhatsApp.");
                    
                    notificarBarbeiroWhatsApp('novo', payload);

                    await sincronizarBancoDeDados();
                    renderizarGradeHorariosReais();
                    carregarMeusAgendamentosDoBanco();
                    alternarTela('estilo');
                } else {
                    alert("Erro ao confirmar a reserva no Banco de Dados.");
                }
            } catch(error) {
                alert("Falha de comunicação com a Nuvem/Servidor.");
            } finally {
                btn.innerText = "Confirmar Oficialmente";
                btn.disabled = false;
            }
        });
    }

    const btnExecutarEncaixe = document.getElementById('btn-executar-encaixe');
    if(btnExecutarEncaixe) {
        btnExecutarEncaixe.addEventListener('click', async (e) => {
            const btn = e.target;
            btn.innerText = "Salvando...";
            btn.disabled = true;

            const nome = document.getElementById('encaixe-nome')?.value.trim();
            const servico = document.getElementById('encaixe-servico')?.value;
            const barbeiro = document.getElementById('encaixe-barbeiro')?.value;
            const dataEncaixe = document.getElementById('encaixe-data')?.value; 
            const hora = document.getElementById('encaixe-hora')?.value;
            const gorjeta = parseFloat(document.getElementById('encaixe-gorjeta')?.value || 0);
            const pagamento = document.getElementById('encaixe-pagamento')?.value;

            if(!nome || !dataEncaixe) {
                btn.innerText = "Lançar Encaixe Concluído";
                btn.disabled = false;
                return alert("Insira o nome do cliente e a data correta.");
            }

            const payload = {
                cliente: `WALK-IN: ${nome.toUpperCase()}`,
                servico: servico,
                barbeiro: barbeiro,
                data: dataEncaixe,
                hora: hora,
                pagamento: pagamento,
                status: "Concluído",
                valor_produtos: 0.00,
                valor_gorjeta: gorjeta
            };

            try {
                const res = await fetch(`${API_URL}/agendamentos`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                if(res.ok) {
                    alert("⚡ Encaixe registrado com sucesso!");
                    document.getElementById('encaixe-nome').value = "";
                    await sincronizarBancoDeDados();
                    recarregarAbaAtivaAdm();
                }
            } catch (err) {
                alert("Erro ao registrar encaixe.");
            } finally {
                btn.innerText = "Lançar Encaixe Concluído";
                btn.disabled = false;
            }
        });
    }

    const btnSalvarDespesa = document.getElementById('btn-salvar-despesa');
    if(btnSalvarDespesa) {
        btnSalvarDespesa.addEventListener('click', async (e) => {
            const descricao = document.getElementById('despesa-descricao').value.trim();
            const valor = parseFloat(document.getElementById('despesa-valor').value);
            const data = document.getElementById('despesa-data').value;

            if (!descricao || isNaN(valor) || !data) return alert("Preencha todos os campos da despesa corretamente.");

            const btn = e.target;
            btn.innerText = "Lançando...";
            btn.disabled = true;

            const payload = { descricao, valor, data };

            try {
                const res = await fetch(`${API_URL}/despesas`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                if(res.ok) {
                    alert("💸 Despesa registrada com sucesso!");
                    document.getElementById('despesa-descricao').value = "";
                    document.getElementById('despesa-valor').value = "";
                    await sincronizarBancoDeDados();
                    renderizarDespesas();
                }
            } catch (err) {
                alert("Erro ao salvar despesa.");
            } finally {
                btn.innerText = "Lançar Despesa no Banco";
                btn.disabled = false;
            }
        });
    }
}

function preencherSelectServicosEncaixe() {
    const selEncaixe = document.getElementById('encaixe-servico');
    if(selEncaixe) {
        selEncaixe.innerHTML = DADOS_SERVICOS.map(s => 
            `<option value="${s.nome}">${s.nome} (R$ ${parseFloat(s.preco).toFixed(2)})</option>`
        ).join('');
    }
}

async function salvarNovoServico() {
    const nome = document.getElementById('servico-nome').value.trim();
    const preco = parseFloat(document.getElementById('servico-preco').value);
    const sub = document.getElementById('servico-sub').value.trim();

    if (!nome || isNaN(preco)) return alert("Preencha o nome e o preço do serviço.");

    const btn = document.getElementById('btn-salvar-servico');
    btn.innerText = "Salvando..."; btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/servicos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, preco, sub })
        });
        if(res.ok) {
            alert("Serviço adicionado à barbearia!");
            document.getElementById('servico-nome').value = "";
            document.getElementById('servico-preco').value = "";
            document.getElementById('servico-sub').value = "";
            await sincronizarBancoDeDados();
            renderizarServicosAdmin();
        }
    } catch(e) {
        alert("Erro ao salvar serviço.");
    } finally {
        btn.innerText = "Adicionar Serviço"; btn.disabled = false;
    }
}

function renderizarServicosAdmin() {
    const container = document.getElementById('lista-servicos-cadastrados');
    if(!container) return;
    
    container.innerHTML = DADOS_SERVICOS.length === 0 ? "<p style='color:var(--text-muted); font-size: 13px;'>Nenhum serviço cadastrado.</p>" : "";

    DADOS_SERVICOS.forEach(s => {
        container.innerHTML += `
            <div class="item-backoffice" style="border-left: 4px solid var(--accent-color); margin-bottom: 8px;">
                <div style="flex:1;">
                    <strong>${s.nome}</strong><br>
                    <span style="font-size:11px; color:var(--text-muted);">${s.sub || ''}</span>
                    <div style="color: var(--success-color); font-weight:800; margin-top: 2px;">R$ ${parseFloat(s.preco).toFixed(2)}</div>
                </div>
                <div style="display: flex; gap: 4px; flex-direction: column;">
                    <button class="btn-small-edit" onclick="abrirModalEdicaoServico(${s.id})">Editar</button>
                    <button class="btn-small-delete" onclick="excluirServico(${s.id})" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Excluir</button>
                </div>
            </div>
        `;
    });

    preencherSelectServicosEncaixe();
}

function abrirModalEdicaoServico(id) {
    const s = DADOS_SERVICOS.find(serv => serv.id === id);
    if(!s) return;
    document.getElementById('edit-servico-id').value = s.id;
    document.getElementById('edit-servico-nome').value = s.nome;
    document.getElementById('edit-servico-preco').value = parseFloat(s.preco).toFixed(2);
    document.getElementById('edit-servico-sub').value = s.sub;
    document.getElementById('modal-editar-servico').classList.remove('escondido');
}

async function salvarEdicaoServico() {
    const id = document.getElementById('edit-servico-id').value;
    const nome = document.getElementById('edit-servico-nome').value.trim();
    const preco = parseFloat(document.getElementById('edit-servico-preco').value);
    const sub = document.getElementById('edit-servico-sub').value.trim();
    
    if(!nome || isNaN(preco)) return alert("Preencha corretamente.");
    
    try {
        const res = await fetch(`${API_URL}/servicos/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome, preco, sub })
        });
        if(res.ok) {
            alert("Serviço editado com sucesso!");
            fecharModal('modal-editar-servico');
            await sincronizarBancoDeDados();
            renderizarServicosAdmin();
            if(abaAtivaAtual === 'adm-dash') carregarDadosEstrategicosDoNeon();
        }
    } catch(e) {
        alert("Erro ao editar o serviço.");
    }
}

async function excluirServico(id) {
    if(!confirm("Atenção: Tem certeza que deseja apagar este serviço da barbearia?")) return;
    try {
        const res = await fetch(`${API_URL}/servicos/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Serviço apagado permanentemente.");
            await sincronizarBancoDeDados();
            renderizarServicosAdmin();
        }
    } catch(e) {
        alert("Erro ao tentar excluir serviço.");
    }
}

async function excluirAgendamento(id) {
    if(!confirm("Tem certeza que deseja cancelar e excluir esta reserva?")) return;
    
    const agendamento = DADOS_AGENDAMENTOS.find(a => a.id === id);

    try {
        const res = await fetch(`${API_URL}/agendamentos/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Sua reserva foi excluída do sistema.");
            if(agendamento) notificarBarbeiroWhatsApp('cancelado', agendamento);
            await sincronizarBancoDeDados();
            carregarMeusAgendamentosDoBanco();
            renderizarGradeHorariosReais();
        }
    } catch(e) {
        alert("Erro ao excluir reserva.");
    }
}

function atualizarHorariosEdicaoReserva(idAtual, horaAtualSelecionada) {
    const dataSel = document.getElementById('edit-reserva-data').value;
    const bNome = document.getElementById('edit-reserva-barbeiro').value;
    const selectHora = document.getElementById('edit-reserva-hora');
    
    if (!dataSel || !bNome) return;

    let ocupados = DADOS_AGENDAMENTOS
        .filter(a => a && a.data === dataSel && a.barbeiro === bNome && (a.status ? a.status.toLowerCase() !== 'falta' : true) && a.id != idAtual)
        .map(a => a.hora ? a.hora.trim() : '');

    selectHora.innerHTML = "";

    const HORARIOS_GERADOS = gerarHorariosDoDia(dataSel, bNome);

    if(HORARIOS_GERADOS.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.text = "Barbearia Fechada nesta data";
        selectHora.appendChild(opt);
        return;
    }

    HORARIOS_GERADOS.forEach(g => {
        if(g.horas.length === 0) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = g.turno;

        g.horas.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h.trim();
            opt.text = h.trim();

            if (isSlotPast(dataSel, h.trim())) {
                opt.disabled = true;
                opt.text += " (Expirado)";
            } else if (ocupados.includes(h.trim())) {
                opt.disabled = true;
                opt.text += " (Ocupado)";
            }

            if (h.trim() === horaAtualSelecionada) {
                opt.selected = true;
            }

            optgroup.appendChild(opt);
        });
        selectHora.appendChild(optgroup);
    });
}

function abrirModalEdicaoReserva(id) {
    const agendamento = DADOS_AGENDAMENTOS.find(a => a.id === id);
    if(!agendamento) return;
    
    document.getElementById('edit-reserva-id').value = id;
    
    const selServico = document.getElementById('edit-reserva-servico');
    selServico.innerHTML = DADOS_SERVICOS.map(s => `<option value="${s.nome}" ${s.nome === agendamento.servico ? 'selected' : ''}>${s.nome}</option>`).join('');
    
    const selBarbeiro = document.getElementById('edit-reserva-barbeiro');
    selBarbeiro.innerHTML = ESTRUTURA_BARBEIROS.map(b => `<option value="${b.nome}" ${b.nome === agendamento.barbeiro ? 'selected' : ''}>${b.nome}</option>`).join('');
    
    document.getElementById('edit-reserva-data').value = agendamento.data;
    document.getElementById('edit-reserva-pagamento').value = agendamento.pagamento;
    
    atualizarHorariosEdicaoReserva(id, agendamento.hora);
    
    document.getElementById('edit-reserva-data').onchange = () => atualizarHorariosEdicaoReserva(id, agendamento.hora);
    document.getElementById('edit-reserva-barbeiro').onchange = () => atualizarHorariosEdicaoReserva(id, agendamento.hora);

    document.getElementById('modal-editar-reserva').classList.remove('escondido');
}

async function salvarEdicaoReserva() {
    const id = document.getElementById('edit-reserva-id').value;
    const agendamento = DADOS_AGENDAMENTOS.find(a => a.id == id);
    if(!agendamento) return;
    
    const payload = {
        cliente: agendamento.cliente,
        servico: document.getElementById('edit-reserva-servico').value,
        barbeiro: document.getElementById('edit-reserva-barbeiro').value,
        data: document.getElementById('edit-reserva-data').value,
        hora: document.getElementById('edit-reserva-hora').value,
        pagamento: document.getElementById('edit-reserva-pagamento').value,
        status: agendamento.status,
        valor_produtos: agendamento.valor_produtos,
        valor_gorjeta: agendamento.valor_gorjeta
    };
    
    try {
        const res = await fetch(`${API_URL}/agendamentos/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if(res.ok) {
            alert("A reserva foi atualizada com sucesso!");
            fecharModal('modal-editar-reserva');
            notificarBarbeiroWhatsApp('editado', payload);
            await sincronizarBancoDeDados();
            carregarMeusAgendamentosDoBanco();
            renderizarGradeHorariosReais();
        }
    } catch(e) {
        alert("Erro ao tentar atualizar os dados da reserva.");
    }
}

async function excluirDespesa(id) {
    if(!confirm("Tem certeza que deseja apagar permanentemente esta despesa?")) return;
    try {
        const res = await fetch(`${API_URL}/despesas/${id}`, { method: 'DELETE' });
        if(res.ok) {
            alert("Despesa apagada do banco de dados.");
            await sincronizarBancoDeDados();
            renderizarDespesas();
        }
    } catch(e) {
        alert("Erro ao tentar excluir a despesa.");
    }
}

function abrirModalEdicaoDespesa(id) {
    const despesa = DADOS_DESPESAS.find(d => d.id === id);
    if(!despesa) return;
    document.getElementById('edit-despesa-id').value = despesa.id;
    document.getElementById('edit-despesa-descricao').value = despesa.descricao;
    document.getElementById('edit-despesa-valor').value = parseFloat(despesa.valor).toFixed(2);
    document.getElementById('edit-despesa-data').value = despesa.data;
    document.getElementById('modal-editar-despesa').classList.remove('escondido');
}

async function salvarEdicaoDespesa() {
    const id = document.getElementById('edit-despesa-id').value;
    const descricao = document.getElementById('edit-despesa-descricao').value.trim();
    const valor = parseFloat(document.getElementById('edit-despesa-valor').value);
    const data = document.getElementById('edit-despesa-data').value;
    
    if(!descricao || isNaN(valor) || !data) return alert("Verifique os campos da despesa!");
    
    try {
        const res = await fetch(`${API_URL}/despesas/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ descricao, valor, data })
        });
        if(res.ok) {
            alert("Despesa ajustada e salva!");
            fecharModal('modal-editar-despesa');
            await sincronizarBancoDeDados();
            renderizarDespesas();
        }
    } catch(e) {
        alert("Erro ao editar despesa.");
    }
}

function regraDeFiltroDeTempo(dataOriginal) {
    if(!dataOriginal) return false;
    const dataAlvo = new Date(dataOriginal + 'T00:00:00');
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    
    if (filtroTempoGlobal === 'hoje') return dataAlvo.getTime() === hoje.getTime();
    if (filtroTempoGlobal === 'ontem') {
        const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
        return dataAlvo.getTime() === ontem.getTime();
    }
    if (filtroTempoGlobal === '7dias') {
        const seteDiasAtras = new Date(hoje); seteDiasAtras.setDate(hoje.getDate() - 7);
        return dataAlvo >= seteDiasAtras && dataAlvo <= hoje;
    }
    if (filtroTempoGlobal === 'mes_atual') return dataAlvo.getMonth() === hoje.getMonth() && dataAlvo.getFullYear() === hoje.getFullYear();
    if (filtroTempoGlobal === 'personalizado') {
        const dInicio = new Date(dataFiltroInicio + 'T00:00:00');
        const dFim = new Date(dataFiltroFim + 'T00:00:00');
        return dataAlvo >= dInicio && dataAlvo <= dFim;
    }
    return true;
}

function filtrarAgendamentoPorRegraGlobal(a) {
    if(!a) return false;
    if(filtroBarbeiroAlvo !== 'todos') {
        const profissionalAlvo = ESTRUTURA_BARBEIROS.find(b => String(b.id) === String(filtroBarbeiroAlvo));
        if(!profissionalAlvo) return false;
        
        if((a.barbeiro || '').trim().toLowerCase() !== (profissionalAlvo.nome || '').trim().toLowerCase()) {
            return false;
        }
    }
    return regraDeFiltroDeTempo(a.data);
}

function mudarFiltroGlobalAdm(periodo, elementoClicado) {
    filtroTempoGlobal = periodo;
    document.querySelectorAll('.btn-filtro-tempo').forEach(b => b.classList.remove('ativo'));
    if (elementoClicado) elementoClicado.classList.add('ativo');

    const seletorData = document.getElementById('box-escolha-data-custom');
    if(seletorData) {
        if (periodo === 'personalizado') seletorData.classList.remove('escondido');
        else seletorData.classList.add('escondido');
    }
    recarregarAbaAtivaAdm();
}

function atualizarFiltroDataRange() {
    const inputInicio = document.getElementById('filtro-data-inicio');
    const inputFim = document.getElementById('filtro-data-fim');
    if(inputInicio && inputFim) {
        dataFiltroInicio = inputInicio.value; dataFiltroFim = inputFim.value;
        if (dataFiltroInicio && dataFiltroFim) recarregarAbaAtivaAdm();
    }
}

let abaAtivaAtual = 'adm-dash';
function recarregarAbaAtivaAdm() {
    const abas = ['adm-dash', 'adm-mkt', 'adm-recepcao', 'adm-despesas', 'adm-servicos', 'adm-config', 'adm-agenda', 'adm-analytics'];
    abas.forEach(id => {
        const el = document.getElementById(`aba-${id}`);
        if (el && !el.classList.contains('escondido')) abaAtivaAtual = id;
    });

    const seletor = document.getElementById('filtro-barbeiro-alvo');
    if(seletor) filtroBarbeiroAlvo = seletor.value;

    if(abaAtivaAtual === 'adm-dash') carregarDadosEstrategicosDoNeon();
    if(abaAtivaAtual === 'adm-mkt' && perfilLogado === 'admin') carregarListaMarketingReal();
    if(abaAtivaAtual === 'adm-recepcao') carregarModoRecepcaoKanban();
    if(abaAtivaAtual === 'adm-despesas' && perfilLogado === 'admin') renderizarDespesas();
    if(abaAtivaAtual === 'adm-servicos' && perfilLogado === 'admin') renderizarServicosAdmin();
    if(abaAtivaAtual === 'adm-config' && perfilLogado === 'admin') renderizarConfiguracoesAdmin();
    if(abaAtivaAtual === 'adm-agenda') renderizarAgendaBloqueios();
    if(abaAtivaAtual === 'adm-analytics') carregarPainelAnalytics();
}

async function carregarDadosEstrategicosDoNeon() {
    try {
        const agendamentos = DADOS_AGENDAMENTOS.filter(filtrarAgendamentoPorRegraGlobal);

        let faturamentoTotal = 0, faturamentoServicosBrutos = 0, faturamentoProdutosBrutos = 0, atendimentosFinalizados = 0, totalFaltasNoShow = 0;
        let balançoEquipe = {};
        
        ESTRUTURA_BARBEIROS.forEach(b => {
            if (filtroBarbeiroAlvo !== 'todos' && String(b.id) !== String(filtroBarbeiroAlvo)) {
                return;
            }

            let rateio = parseFloat(b.comissao);
            if (isNaN(rateio)) rateio = 0.40;
            if (rateio > 1) rateio = rateio / 100;

            balançoEquipe[b.nome.trim().toLowerCase()] = { 
                nomeOriginal: b.nome,
                servicosLiquidos: 0, 
                produtos: 0, 
                gorjetas: 0, 
                totalPagar: 0, 
                rateio: rateio 
            };
        });

        agendamentos.forEach(a => {
            const serv = DADOS_SERVICOS.find(s => s.nome.trim().toLowerCase() === (a.servico || '').trim().toLowerCase());
            const valorServico = serv ? parseFloat(serv.preco) : 0.00;
            
            const valorProd = parseFloat(a.valor_produtos || 0);
            const valorGorjeta = parseFloat(a.valor_gorjeta || 0);
            
            const forma = String(a.pagamento || 'Pix').toLowerCase();
            const taxaMaquininha = (forma.includes('cartao') || forma.includes('crédito') || forma.includes('débito')) ? 0.025 : 0.00;
            const valorServicoLiquido = valorServico - (valorServico * taxaMaquininha);

            const statusAtual = a.status ? a.status.toLowerCase() : "";

            if(statusAtual !== 'falta' && statusAtual !== 'cancelado') {
                faturamentoServicosBrutos += valorServico; 
                faturamentoProdutosBrutos += valorProd;
                faturamentoTotal += (valorServico + valorProd + valorGorjeta); 
                atendimentosFinalizados++;
                
                const keyBarbeiro = (a.barbeiro || '').trim().toLowerCase();
                
                if(balançoEquipe[keyBarbeiro]) {
                    balançoEquipe[keyBarbeiro].servicosLiquidos += (valorServicoLiquido * balançoEquipe[keyBarbeiro].rateio);
                    balançoEquipe[keyBarbeiro].produtos += (valorProd * 0.10); 
                    balançoEquipe[keyBarbeiro].gorjetas += valorGorjeta;
                }
            } else if (statusAtual === 'falta') { 
                totalFaltasNoShow++; 
            }
        });

        if(document.getElementById('kpi-faturamento')) {
            document.getElementById('kpi-faturamento').innerText = `R$ ${faturamentoTotal.toFixed(2)}`;
            const ticketMedio = atendimentosFinalizados > 0 ? (faturamentoServicosBrutos / atendimentosFinalizados) : 0;
            document.getElementById('kpi-ticket').innerText = `R$ ${ticketMedio.toFixed(2)}`;
            document.getElementById('kpi-ocupacao').innerText = atendimentosFinalizados;
            const taxaNoShow = agendamentos.length > 0 ? ((totalFaltasNoShow / agendamentos.length) * 100) : 0;
            document.getElementById('kpi-noshow').innerText = `${taxaNoShow.toFixed(1)}%`;
            document.getElementById('detalhe-servicos').innerText = `Serviços Brutos: R$ ${faturamentoServicosBrutos.toFixed(2)}`;
            document.getElementById('detalhe-produtos').innerText = `Produtos Brutos: R$ ${faturamentoProdutosBrutos.toFixed(2)}`;
        }

        const containerSplit = document.getElementById('lista-split-comissoes-equipe');
        if(containerSplit) {
            containerSplit.innerHTML = '';
            for(let key in balançoEquipe) {
                const b = balançoEquipe[key]; 
                b.totalPagar = b.servicosLiquidos + b.produtos + b.gorjetas;
                containerSplit.innerHTML += `
                    <div class="item-backoffice">
                        <div><strong>${b.nomeOriginal}</strong><br><span style="font-size:11px; color:var(--text-muted);">Serv: R$ ${b.servicosLiquidos.toFixed(2)} | Prod: R$ ${b.produtos.toFixed(2)} | Gorj: R$ ${b.gorjetas.toFixed(2)}</span></div>
                        <div style="color: var(--success-color); font-weight:800;">R$ ${b.totalPagar.toFixed(2)}</div>
                    </div>`;
            }
        }

        if(perfilLogado === 'barbeiro') {
            const bLogado = ESTRUTURA_BARBEIROS.find(b => b.login === usuarioLogado);
            if(bLogado) {
                const d = balançoEquipe[bLogado.nome.trim().toLowerCase()];
                if(d) {
                    document.getElementById('minha-comissao-total').innerText = `R$ ${d.totalPagar.toFixed(2)}`;
                    document.getElementById('minha-breakdown-comissao').innerText = `Serviços: R$ ${d.servicosLiquidos.toFixed(2)} | Vendas: R$ ${d.produtos.toFixed(2)} | Dicas/Gorjetas: R$ ${d.gorjetas.toFixed(2)}`;
                }
            }
        }
    } catch(e) {
        console.error("Erro dados estratégicos:", e);
    }
}

async function carregarModoRecepcaoKanban() {
    const container = document.getElementById('container-kanban-recepcao'); if(!container) return;
    try {
        const dadosFiltrados = DADOS_AGENDAMENTOS.filter(filtrarAgendamentoPorRegraGlobal);
        
        dadosFiltrados.sort((a, b) => new Date(`${a.data||''}T${a.hora||''}:00`) - new Date(`${b.data||''}T${b.hora||''}:00`));

        container.innerHTML = dadosFiltrados.length === 0 ? "<p style='color:var(--text-muted); text-align:center;'>Nenhum registro para o escopo.</p>" : "";
        
        dadosFiltrados.forEach(item => {
            const isConcluido = item.status && item.status.toLowerCase() === 'concluído';
            const dataBr = item.data && item.data.includes('-') ? item.data.split('-').reverse().join('/') : (item.data||'');
            
            container.innerHTML += `
                <div class="item-backoffice" style="border-left: 4px solid ${isConcluido ? 'var(--success-color)' : 'var(--accent-color)'}">
                    <div><strong>👤 ${item.cliente} (${item.status})</strong><br><span style="font-size:12px; color:var(--text-muted);">${item.servico} - ${dataBr} às ${item.hora||''} [Barbeiro: ${item.barbeiro}]</span></div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn-status" style="background:var(--success-color); color:white;" onclick="mudarStatusAgendamento(${item.id}, 'Concluído')">✔</button>
                        <button class="btn-status" style="background:var(--danger-color); color:white;" onclick="mudarStatusAgendamento(${item.id}, 'Falta')">✖</button>
                    </div>
                </div>`;
        });
        preencherSelectServicosEncaixe();
    } catch(e) {
        console.error("Erro no Kanban:", e);
    }
}

function renderizarDespesas() {
    const container = document.getElementById('lista-despesas-cadastradas');
    const labelTotal = document.getElementById('kpi-despesas-total');
    if(!container || !labelTotal) return;

    try {
        const despesasFiltradas = DADOS_DESPESAS.filter(d => regraDeFiltroDeTempo(d.data));
        
        let somaDespesas = 0;
        container.innerHTML = despesasFiltradas.length === 0 ? "<p style='color:var(--text-muted); font-size: 13px;'>Nenhuma despesa para este período.</p>" : "";

        despesasFiltradas.forEach(d => {
            const valor = parseFloat(d.valor);
            somaDespesas += valor;
            const dataBr = d.data && d.data.includes('-') ? d.data.split('-').reverse().join('/') : (d.data||'');
            
            container.innerHTML += `
                <div class="item-backoffice" style="border-left: 4px solid var(--danger-color); margin-bottom: 8px;">
                    <div style="flex:1;">
                        <strong>${d.descricao}</strong><br>
                        <span style="font-size:11px; color:var(--text-muted);">Data: ${dataBr}</span>
                        <div style="color: var(--danger-color); font-weight:800; margin-top: 2px;">R$ ${valor.toFixed(2)}</div>
                    </div>
                    <div style="display: flex; gap: 4px; flex-direction: column;">
                        <button class="btn-small-edit" onclick="abrirModalEdicaoDespesa(${d.id})">Editar</button>
                        <button class="btn-small-delete" onclick="excluirDespesa(${d.id})" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Excluir</button>
                    </div>
                </div>
            `;
        });

        labelTotal.innerText = `R$ ${somaDespesas.toFixed(2)}`;
    } catch(e) {
        console.error("Erro nas despesas:", e);
    }
}

async function carregarPainelAnalytics() {
    const containerMapa = document.getElementById('analytics-heatmap'); if(!containerMapa) return;
    try {
        const agendamentos = DADOS_AGENDAMENTOS.filter(filtrarAgendamentoPorRegraGlobal);

        const turnos = { "Manhã": 0, "Tarde": 0, "Noite": 0 };
        const dias = { "Segunda-feira": 0, "Terça-feira": 0, "Quarta-feira": 0, "Quinta-feira": 0, "Sexta-feira": 0, "Sábado": 0, "Domingo": 0 };
        const nomesDias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

        agendamentos.forEach(a => {
            if(!a.hora || !a.data) return;
            const h = parseInt(a.hora.split(':')[0]);
            if(h >= 9 && h < 12) turnos["Manhã"]++; else if(h >= 12 && h < 18) turnos["Tarde"]++; else turnos["Noite"]++;
            const dNome = nomesDias[new Date(a.data + 'T00:00:00').getDay()];
            if(dias[dNome] !== undefined) dias[dNome]++;
        });

        containerMapa.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px; background: #1f2125; border: 1px solid var(--border-color); padding: 16px; border-radius: 12px; font-size:14px;">
                <div style="display:flex; justify-content:space-between;"><span>🌅 Manhã (09h - 12h):</span> <strong>${turnos['Manhã']} atendimentos</strong></div>
                <div style="display:flex; justify-content:space-between; padding: 4px 0;"><span>🌤️ Tarde (12h - 18h):</span> <strong>${turnos['Tarde']} atendimentos</strong></div>
                <div style="display:flex; justify-content:space-between;"><span>🌙 Noite (18h - 20h):</span> <strong>${turnos['Noite']} atendimentos</strong></div>
            </div>`;

        const containerDias = document.getElementById('analytics-dias-semana');
        if(containerDias) {
            containerDias.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display: flex; flex-direction: column; gap: 12px; background: #1f2125; border: 1px solid var(--border-color); padding: 18px; border-radius: 12px;";
            
            for(let dia in dias) {
                const pct = agendamentos.length > 0 ? Math.min((dias[dia] / agendamentos.length) * 100, 100) : 0;
                wrapper.innerHTML += `
                    <div class="analytics-bar-container">
                        <div class="analytics-bar-header">
                            <span>${dia}</span>
                            <strong style="color: ${dias[dia] > 0 ? 'var(--accent-color)' : 'var(--text-muted)'}">${dias[dia]} clientes</strong>
                        </div>
                        <div class="analytics-bar-bg">
                            <div class="analytics-bar-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>`;
            }
            containerDias.appendChild(wrapper);
        }

        const uClientes = [...new Set(agendamentos.map(a => a.cliente))];
        let rec = 0; uClientes.forEach(c => { if(agendamentos.filter(a => a.cliente === c).length > 1) rec++; });
        
        const containerRetencao = document.getElementById('analytics-retencao');
        if(containerRetencao) {
            containerRetencao.innerHTML = `
                <div class="kpi-card" style="flex: 1; text-align: center; background: #16171a; border: 1px solid var(--border-color);">
                    <div class="kpi-label">Taxa de Retenção</div>
                    <div class="kpi-val" style="color: var(--accent-color); font-size: 24px;">${uClientes.length > 0 ? Math.round((rec / uClientes.length) * 100) : 0}%</div>
                </div>
                <div class="kpi-card" style="flex: 1; text-align: center; background: #16171a; border: 1px solid var(--border-color);">
                    <div class="kpi-label">LTV do Período</div>
                    <div class="kpi-val" style="color: var(--success-color); font-size: 24px;">R$ ${(uClientes.length > 0 ? 62 * (agendamentos.length / uClientes.length) : 0).toFixed(2)}</div>
                </div>`;
        }
    } catch(e) {
        console.error("Erro no BI:", e);
    }
}

function renderizarGradeHorariosReais() {
    const container = document.getElementById('container-horarios'); 
    if (!container) return;
    
    try {
        const dataSel = document.getElementById('data').value || '';
        const bInfo = ESTRUTURA_BARBEIROS.find(b => b.id === barbeiroSelecionado);
        
        container.innerHTML = ""; 

        if (!bInfo) {
            container.innerHTML = "<p style='color:var(--text-muted); font-size:13px; margin: 10px 0;'>👆 Selecione o profissional acima para ver os horários.</p>";
            return;
        }

        const HORARIOS_GERADOS = gerarHorariosDoDia(dataSel, bInfo.nome);

        if(HORARIOS_GERADOS.length === 0) {
            container.innerHTML = "<p style='color:var(--danger-color); font-size:14px; margin: 10px 0; font-weight: 600;'>A barbearia não funcionará nesta data (Folga/Feriado).</p>";
            return;
        }

        let ocupados = DADOS_AGENDAMENTOS
            .filter(a => a && a.data === dataSel && a.barbeiro === bInfo.nome && (a.status ? a.status.toLowerCase() !== 'falta' : true))
            .map(a => a.hora ? a.hora.trim() : '');
            
        HORARIOS_GERADOS.forEach(g => {
            if(g.horas.length === 0) return; 

            const tituloTurno = document.createElement('div');
            tituloTurno.className = "turno-title";
            tituloTurno.innerText = g.turno;
            container.appendChild(tituloTurno);
            
            const grid = document.createElement('div'); 
            grid.className = "grid-horarios";
            
            g.horas.forEach(h => {
                const btn = document.createElement('button'); 
                btn.className = "btn-horario"; 
                btn.innerText = h;
                btn.type = "button";
                
                if (isSlotPast(dataSel, h.trim())) { 
                    btn.disabled = true; 
                    btn.style.opacity = "0.3"; 
                    btn.innerText = "Expirado"; 
                } else if (ocupados.includes(h.trim())) { 
                    btn.disabled = true; 
                    btn.innerText = "Ocupado"; 
                } else { 
                    if(horarioSelecionado === h.trim()) {
                        btn.classList.add('selecionado');
                    }
                    
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        document.querySelectorAll('.btn-horario').forEach(b => b.classList.remove('selecionado')); 
                        btn.classList.add('selecionado'); 
                        horarioSelecionado = h.trim(); 
                    });
                }
                grid.appendChild(btn);
            });
            container.appendChild(grid);
        });
    } catch (e) {
        console.error("Erro nos horários:", e);
    }
}

function renderizarFormularioCliente() {
    try {
        const boxS = document.getElementById('container-servicos'); if(boxS) boxS.innerHTML = "";
        DADOS_SERVICOS.forEach(s => {
            const div = document.createElement('div'); div.className = "modern-card"; 
            div.innerHTML = `<div class="title">${s.nome} <span style="font-size:11px;color:gray;font-weight:normal;display:block;">${s.sub||''}</span></div><div class="price">R$ ${parseFloat(s.preco).toFixed(2)}</div>`;
            div.onclick = () => { document.querySelectorAll('#container-servicos .modern-card').forEach(c => c.classList.remove('selected')); div.classList.add('selected'); servicoSelecionado = s.nome; precoServico = parseFloat(s.preco); };
            if(boxS) boxS.appendChild(div);
        });

        const boxB = document.getElementById('container-barbeiros'); if(boxB) boxB.innerHTML = "";
        ESTRUTURA_BARBEIROS.forEach(b => {
            const div = document.createElement('div'); div.className = "modern-card"; div.innerHTML = `<div class="title">${b.nome}</div>`;
            div.onclick = () => { document.querySelectorAll('#container-barbeiros .modern-card').forEach(c => c.classList.remove('selected')); div.classList.add('selected'); barbeiroSelecionado = b.id; renderizarGradeHorariosReais(); };
            if(boxB) boxB.appendChild(div);
        });

        const boxP = document.getElementById('container-pagamentos'); if(boxP) boxP.innerHTML = "";
        ["Pix", "Cartão de Crédito", "Cartão de Débito", "Dinheiro"].forEach(p => {
            const div = document.createElement('div'); div.className = "modern-card"; div.innerHTML = `<div class="title">${p}</div>`;
            div.onclick = () => { document.querySelectorAll('#container-pagamentos .modern-card').forEach(c => c.classList.remove('selected')); div.classList.add('selected'); pagamentoSelecionado = p; };
            if(boxP) boxP.appendChild(div);
        });

        renderizarGradeHorariosReais(); 
    } catch(e) {
        console.error("Erro no formulário:", e);
    }
}

function carregarListaMarketingReal() {
    const container = document.getElementById('lista-marketing-clientes'); if(!container) return;
    try {
        container.innerHTML = "";
        const clientes = DADOS_USUARIOS.filter(u => u.perfil === 'cliente');

        if(clientes.length === 0) {
            container.innerHTML = "<p style='color:var(--text-muted); font-size:12px;'>Nenhum cliente cadastrado ainda.</p>";
            return;
        }

        const hoje = new Date();
        hoje.setHours(0,0,0,0);

        clientes.forEach(cliente => {
            const agendamentosCliente = DADOS_AGENDAMENTOS.filter(a => a && a.cliente && a.cliente.toLowerCase() === cliente.nome.toLowerCase());
            agendamentosCliente.sort((a, b) => new Date(`${b.data||''}T00:00:00`) - new Date(`${a.data||''}T00:00:00`));

            let diasInativo = 999; 
            
            if (agendamentosCliente.length > 0 && agendamentosCliente[0].data) {
                const ultimaData = new Date(`${agendamentosCliente[0].data}T00:00:00`);
                const diffTime = Math.abs(hoje - ultimaData);
                diasInativo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            const celularLimpo = cliente.celular ? cliente.celular.replace(/\D/g, '') : '';
            const msgTexto = encodeURIComponent(`Fala ${cliente.nome.split(' ')[0]}, sumido hein! Aqui é da Prosperar Club, estamos com uma promoção exclusiva pra você dar aquele trato no visual essa semana. Bora agendar?`);
            const linkWpp = `https://wa.me/55${celularLimpo}?text=${msgTexto}`;

            if (diasInativo > 30) {
                container.innerHTML += `
                    <div class="item-backoffice">
                        <div>
                            <strong>${cliente.nome}</strong><br>
                            <span style="font-size:11px;color:var(--danger-color);">Inativo há ${diasInativo === 999 ? 'muito tempo' : diasInativo + ' dias'} • ${cliente.celular || 'S/ Tel'}</span>
                        </div>
                        ${celularLimpo ? `<a href="${linkWpp}" target="_blank" class="btn-status badge-perigo" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; text-decoration: none; border: 1px solid rgba(239,68,68,0.3); padding: 6px 12px; border-radius: 6px;">Resgatar</a>` : '<span style="font-size:10px;color:gray">Sem Num.</span>'}
                    </div>`;
            } else {
                container.innerHTML += `
                    <div class="item-backoffice">
                        <div>
                            <strong>${cliente.nome}</strong><br>
                            <span style="font-size:11px;color:var(--text-muted);">Ativo • Último corte há ${diasInativo} dias</span>
                        </div>
                        <span class="btn-status badge-sucesso" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 6px 12px; border-radius: 6px;">Fiel</span>
                    </div>`;
            }
        });
    } catch(e) { console.error("Erro marketing", e); }
}

function carregarMeusAgendamentosDoBanco() {
    const container = document.getElementById('container-meus-agendamentos'); if(!container) return;
    
    try {
        if(!nomeUsuarioLogado) {
            container.innerHTML = "<p style='font-size:13px; color:var(--text-muted);'>Faça login para ver suas reservas.</p>";
            return;
        }

        let meus = (DADOS_AGENDAMENTOS || []).filter(a => 
            a && a.cliente && typeof a.cliente === 'string' && 
            nomeUsuarioLogado && typeof nomeUsuarioLogado === 'string' && 
            a.cliente.trim().toLowerCase() === nomeUsuarioLogado.trim().toLowerCase()
        );

        meus.sort((a, b) => {
            const dataA = a.data || ""; const horaA = a.hora || "";
            const dataB = b.data || ""; const horaB = b.hora || "";
            return new Date(`${dataB}T${horaB}:00`) - new Date(`${dataA}T${horaA}:00`); 
        });
        
        container.innerHTML = meus.length === 0 ? "<p style='font-size:13px; color:var(--text-muted);'>Nenhum corte agendado no sistema.</p>" : "";
        
        meus.forEach(item => { 
            const status = item.status || 'Agendado';
            const isConcluido = status.toLowerCase() === 'concluído';
            const corBorda = isConcluido ? 'var(--success-color)' : 'var(--accent-color)';
            const corTextoStatus = isConcluido ? 'var(--success-color)' : 'var(--accent-color)';
            
            const dataStr = item.data || '';
            const dataBr = dataStr.includes('-') ? dataStr.split('-').reverse().join('/') : dataStr;
            const servicoStr = item.servico || 'Serviço Indefinido';
            const barbeiroStr = item.barbeiro || 'Não Atribuído';
            const horaStr = item.hora || '--:--';

            container.innerHTML += `
            <div class="card" style="border-left: 4px solid ${corBorda}; margin-bottom: 12px; padding: 16px;">
                <strong style="color:white; font-size: 16px;">${servicoStr}</strong><br>
                <span style="font-size:13px;color:var(--text-muted);">Profissional: ${barbeiroStr} • Dia: ${dataBr} às ${horaStr}</span><br>
                <span style="font-size:11px;color:${corTextoStatus}; font-weight: bold;">Status: ${status}</span>
                <div class="btn-actions-group" style="margin-top: 10px;">
                    <button class="btn-small-edit" onclick="abrirModalEdicaoReserva(${item.id})">Editar Reserva</button>
                    <button class="btn-small-delete" onclick="excluirAgendamento(${item.id})" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Cancelar / Excluir</button>
                </div>
            </div>`; 
        });
    } catch(e) {
        console.error("Erro nas reservas do cliente:", e);
        container.innerHTML = "<p style='color:var(--danger-color); font-size:13px;'>Erro ao carregar reservas. Atualize a página.</p>";
    }
}

function montarMenuNavegacao(role) {
    const nav = document.getElementById('menu-navigation'); 
    const menuNav = document.getElementById('menu-navegacao') || nav; 
    if (!menuNav) return;
    if (role === 'admin') {
        menuNav.innerHTML = `
            <button class="nav-item ativo" onclick="alternarTela('adm-dash')">💰 Finanças</button>
            <button class="nav-item" onclick="alternarTela('adm-recepcao')">📺 Monitor</button>
            <button class="nav-item" onclick="alternarTela('adm-mkt')">📢 CRM</button>
            <button class="nav-item" onclick="alternarTela('adm-despesas')">💸 Despesas</button>
            <button class="nav-item" onclick="alternarTela('adm-servicos')">✂️ Serviços</button>
            <button class="nav-item" onclick="alternarTela('adm-config')">⚙️ Ajustes</button>
            <button class="nav-item" onclick="alternarTela('adm-analytics')">📊 BI</button>`;
    } else if (role === 'barbeiro') {
        menuNav.innerHTML = `
            <button class="nav-item ativo" onclick="alternarTela('adm-dash')">💰 Finanças</button>
            <button class="nav-item" onclick="alternarTela('adm-recepcao')">📺 Monitor</button>
            <button class="nav-item" onclick="alternarTela('adm-agenda')">📅 Agenda</button>
            <button class="nav-item" onclick="alternarTela('adm-analytics')">📊 Analytics</button>`;
    } else { 
        menuNav.innerHTML = `
            <button class="nav-item ativo" onclick="alternarTela('home')">📅 Agendar</button>
            <button class="nav-item" onclick="alternarTela('estilo')">🗂️ Reservas</button>`; 
    }
    menuNav.innerHTML += `<button class="nav-item" style="color:var(--danger-color)" onclick="window.location.reload()">🚪 Sair</button>`;
}

async function alternarTela(idAba) {
    try {
        ['home', 'estilo', 'adm-dash', 'adm-mkt', 'adm-recepcao', 'adm-despesas', 'adm-servicos', 'adm-config', 'adm-agenda', 'adm-analytics'].forEach(id => {
            const el = document.getElementById(`aba-${id}`); if (el) el.classList.add('escondido');
        });
        const abaAlvo = document.getElementById(`aba-${idAba}`); if (abaAlvo) abaAlvo.classList.remove('escondido');
        
        // CORREÇÃO: Remove de todos e readiciona no botão que acabou de ser clicado!
        document.querySelectorAll('.nav-inferior .nav-item').forEach(btn => {
            btn.classList.remove('ativo');
            // Se o botão tem a aba atual no seu evento de clique, ele fica dourado/ativo
            if(btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(idAba)) {
                btn.classList.add('ativo');
            }
        });

        if(idAba === 'estilo') {
            const container = document.getElementById('container-meus-agendamentos');
            if(container) container.innerHTML = "<p style='font-size:13px; color:var(--accent-color);'>Sincronizando reservas...</p>";
            await sincronizarBancoDeDados();
            carregarMeusAgendamentosDoBanco();
        }
        
        if(idAba === 'home') {
            await sincronizarBancoDeDados();
            renderizarFormularioCliente(); 
        }

        recarregarAbaAtivaAdm();
    } catch(e) {
        console.error("Erro ao mudar de tela:", e);
    }
}
