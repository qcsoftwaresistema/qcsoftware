const API_URL = "https://sistema.qcsoftware.com.br";

let paginaAtual = 1;
const ITENS_POR_PAGINA = 10;

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO PARA OCORRENCIAS
// =========================================================================
let todasOcorrencias = [];       
let OcorrenciasFiltradas = [];   
let paginaAtualOcorrencias = 1;  
let listaDeOcorrencias = [];     
let listaDeCargos = [];          


// --- NOVO: OBJETO DE PERMISSÕES DA TELA OCORRÊNCIAS ---
let permissoesTelaOcorrencias = { visualizar: false, inserir: false, alterar: false, excluir: false };

// Helper para capturar o ID do Perfil logado
function obterIdPerfilUsuarioLocal() {
    if (typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO) return PERFIL_USUARIO;
    if (typeof obterIdPerfilUsuario === 'function') return obterIdPerfilUsuario();
    return localStorage.getItem('id_perfis') || sessionStorage.getItem('id_perfis') || null;
}

// --- NOVO: INICIALIZADOR DINÂMICO DE PERMISSÕES ---
async function inicializarTelaOcorrencias() {
    const perfilId = obterIdPerfilUsuarioLocal();

    if (perfilId) {
        try {
            let idTelaOcorrencias = 50; // ID padrão da tela de Ocorrências no banco

            try {
                const resTelas = await fetch(`${API_URL}/telas/`).catch(() => fetch(`${API_URL}/tela/`));
                if (resTelas && resTelas.ok) {
                    const listaTelas = await resTelas.json();
                    const telaEncontrada = listaTelas.find(t => t.nome && t.nome.toLowerCase().includes("ocorrenc"));
                    if (telaEncontrada && telaEncontrada.id_telas) {
                        idTelaOcorrencias = Number(telaEncontrada.id_telas);
                    }
                }
            } catch (eTelas) {
                console.warn("Usando id_telas padrão (50) para Ocorrências.");
            }

            const resPerms = await fetch(`${API_URL}/permissoes/`).catch(() => fetch(`${API_URL}/permissoes`));
            
            if (resPerms && resPerms.ok) {
                const listaPermissoes = await resPerms.json();

                const listaOrdenada = Array.isArray(listaPermissoes) 
                    ? [...listaPermissoes].sort((a, b) => (b.id_permissoes || 0) - (a.id_permissoes || 0)) 
                    : [];

                const permissaoEncontrada = listaOrdenada.find(p => 
                    Number(p.id_perfis) === Number(perfilId) && Number(p.id_telas) === Number(idTelaOcorrencias)
                );

                if (permissaoEncontrada) {
                    permissoesTelaOcorrencias = {
                        visualizar: Boolean(permissaoEncontrada.visualizar),
                        inserir: Boolean(permissaoEncontrada.inserir),
                        alterar: Boolean(permissaoEncontrada.alterar),
                        excluir: Boolean(permissaoEncontrada.excluir)
                    };
                } else {
                    permissoesTelaOcorrencias = { visualizar: false, inserir: false, alterar: false, excluir: false };
                }
            }
        } catch (e) {
            console.error("Erro ao carregar permissões de Ocorrências:", e);
        }
    }

    aplicarPermissoesVisuaisOcorrencias();

    if (permissoesTelaOcorrencias.visualizar) {
        listarOcorrenciasCRUD();
    } else {
        const tabela = document.getElementById('tabela-ocorrencias') || document.querySelector('tbody');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4 font-semibold"><i class="bi bi-lock-fill me-2"></i>Acesso Negado: Seu perfil não possui permissão para visualizar ocorrências.</td></tr>`;
        }
    }
}

function aplicarPermissoesVisuaisOcorrencias() {
    const formOcorrencias = document.getElementById('formOcorrencias');
    const btnSalvar = formOcorrencias ? formOcorrencias.querySelector('button[type="submit"]') : null;
    
    if (!permissoesTelaOcorrencias.visualizar || (!permissoesTelaOcorrencias.inserir && !permissoesTelaOcorrencias.alterar)) {
        if (formOcorrencias) {
            Array.from(formOcorrencias.elements).forEach(element => {
                if (element.tagName !== 'BUTTON') {
                    element.disabled = true;
                }
            });
        }
    }

    if (btnSalvar) {
        if (!permissoesTelaOcorrencias.inserir && !permissoesTelaOcorrencias.alterar) {
            btnSalvar.disabled = true;
            btnSalvar.innerText = "Sem permissão para salvar";
            btnSalvar.classList.replace('btn-primary', 'btn-secondary');
        } else {
            btnSalvar.disabled = false;
        }
    }
}
// Variável global para reter a foto em memória de forma segura
let FOTO_OCORRENCIA_BASE64 = null;

// Auxiliar para obter data local formatada no Fuso de Brasília (UTC-3)
function obterDataHoraAtualLocal() {
    const agora = new Date();
    const formatador = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const partes = formatador.formatToParts(agora);
    const d = partes.find(p => p.type === 'day').value;
    const m = partes.find(p => p.type === 'month').value;
    const a = partes.find(p => p.type === 'year').value;
    const h = partes.find(p => p.type === 'hour').value;
    const min = partes.find(p => p.type === 'minute').value;

    return `${a}-${m}-${d}T${h}:${min}`;
}

// =========================================================================
// 1. CARREGAR OPÇÕES DO DATALIST DE MÁQUINAS
// =========================================================================
async function carregarMaquinasNoSelect() {
    const inputBusca = document.getElementById('maquinas-nome-busca');
    const datalist = document.getElementById('lista-maquinas-datalist');
    const inputHidden = document.getElementById('maquinas-nome');

    if (!inputBusca || !datalist || !inputHidden) return;

    try {
        const res = await fetch(`${API_URL}/maquinas/`, { cache: 'no-store' });
        if (res.ok) {
            const maquinas = await res.json();
            window.listaDeMaquinas = maquinas;
            maquinas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

            datalist.innerHTML = maquinas.map(m => 
                `<option value="${m.nome}" data-id="${m.id_maquinas}"></option>`
            ).join('');

            window.atualizarInputVisualMaquina = function(idAlvo) {
                if (!idAlvo) { inputBusca.value = ""; inputHidden.value = ""; return; }
                const opt = Array.from(datalist.options).find(o => o.getAttribute('data-id')?.toString() === idAlvo?.toString());
                if (opt) { inputBusca.value = opt.value; inputHidden.value = idAlvo; }
            };

            inputBusca.addEventListener('input', function() {
                const opt = Array.from(datalist.options).find(o => o.value.trim() === this.value.trim());
                inputHidden.value = opt ? opt.getAttribute('data-id') : "";
            });
        }
    } catch (e) { 
        console.error("Erro ao carregar máquinas:", e); 
    }
}

// =========================================================================
// 1.1 CARREGAR OPÇÕES DO DATALIST DE COLABORADORES
// =========================================================================
async function carregarColaboradoresNoSelect() {
    const inputBusca = document.getElementById('colaboradores-nome-busca');
    const datalist = document.getElementById('lista-colaboradores-datalist');
    const inputHidden = document.getElementById('colaboradores-nome');

    if (!inputBusca || !datalist || !inputHidden) return;

    try {
        const res = await fetch(`${API_URL}/colaboradores/`, { cache: 'no-store' });
        if (res.ok) {
            const colaboradores = await res.json();
            window.listaDeColaboradores = colaboradores;
            colaboradores.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

            datalist.innerHTML = colaboradores.map(c => 
                `<option value="${c.nome}" data-id="${c.id_colaboradores}"></option>`
            ).join('');

            window.atualizarInputVisualColaboradores = function(idAlvo) {
                if (!idAlvo) { inputBusca.value = ""; inputHidden.value = ""; return; }
                const opt = Array.from(datalist.options).find(o => o.getAttribute('data-id')?.toString() === idAlvo?.toString());
                if (opt) { inputBusca.value = opt.value; inputHidden.value = idAlvo; }
            };

            inputBusca.addEventListener('input', function() {
                const opt = Array.from(datalist.options).find(o => o.value.trim() === this.value.trim());
                inputHidden.value = opt ? opt.getAttribute('data-id') : "";
            });
        }
    } catch (e) { 
        console.error("Erro ao carregar colaboradores:", e); 
    }
}

// =========================================================================
// 1.2 CARREGAR OPÇÕES DO DATALIST DE PRODUTOS
// =========================================================================
async function carregarProdutosNoSelect() {
    const inputBusca = document.getElementById('produtos-nome-busca');
    const datalist = document.getElementById('lista-produtos-datalist');
    const inputHidden = document.getElementById('produtos-nome');

    if (!inputBusca || !datalist || !inputHidden) return;

    try {
        const res = await fetch(`${API_URL}/produtos/`, { cache: 'no-store' });
        if (res.ok) {
            const produtos = await res.json();
            window.listaDeProdutos = produtos;
            produtos.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

            datalist.innerHTML = produtos.map(p => 
                `<option value="${p.nome}" data-id="${p.id_produtos}"></option>`
            ).join('');

            window.atualizarInputVisualProdutos = function(idAlvo) {
                if (!idAlvo) { inputBusca.value = ""; inputHidden.value = ""; return; }
                const opt = Array.from(datalist.options).find(o => o.getAttribute('data-id')?.toString() === idAlvo?.toString());
                if (opt) { inputBusca.value = opt.value; inputHidden.value = idAlvo; }
            };

            inputBusca.addEventListener('input', function() {
                const opt = Array.from(datalist.options).find(o => o.value.trim() === this.value.trim());
                inputHidden.value = opt ? opt.getAttribute('data-id') : "";
            });
        }
    } catch (e) { 
        console.error("Erro ao carregar produtos:", e); 
    }
}

// =========================================================================
// REMOÇÃO DEFINITIVA DE OBRIGATORIEDADE DOS CAMPOS OPCIONAIS NO FRONTEND
// =========================================================================
function desativarValidacoesCamposOpcionais() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.noValidate = true;
        form.setAttribute('novalidate', 'novalidate');
    });

    // Termos que identificam os campos opcionais (por id, name, placeholder ou label correspondente)
    const termosOpcionais = [
        'onde', 'como', 'quando', 'quem', 
        'observa', 'corretiv', 'lote', 'nota'
    ];

    const campos = document.querySelectorAll('input, textarea, select');
    
    campos.forEach(campo => {
        const idLower = (campo.id || '').toLowerCase();
        const nameLower = (campo.name || '').toLowerCase();
        const placeholderLower = (campo.placeholder || '').toLowerCase();
        
        // Verifica também o texto da label associada ao campo
        let labelTexto = '';
        if (campo.id) {
            const label = document.querySelector(`label[for="${campo.id}"]`);
            if (label) labelTexto = label.innerText.toLowerCase();
        }
        if (!labelTexto) {
            const labelPai = campo.closest('label') || campo.closest('.form-group, .mb-3, div');
            if (labelPai) labelTexto = labelPai.innerText.toLowerCase();
        }

        const textoIdentificador = `${idLower} ${nameLower} ${placeholderLower} ${labelTexto}`;
        const ehCampoOpcional = termosOpcionais.some(termo => textoIdentificador.includes(termo));

        if (ehCampoOpcional) {
            campo.required = false;
            campo.removeAttribute('required');
            campo.removeAttribute('aria-required');
            campo.setCustomValidity('');

            // Força a validação nativa a sempre retornar positivo
            campo.checkValidity = () => true;
            campo.reportValidity = () => true;
        }
    });
}

// 1. Intercepta globalmente qualquer evento 'invalid' antes do balão ser disparado na tela
window.addEventListener('invalid', (e) => {
    const el = e.target;
    const identificador = `${el.id || ''} ${el.name || ''} ${el.placeholder || ''}`.toLowerCase();
    
    // Lista de campos que não devem travar
    const termos = ['onde', 'como', 'quando', 'quem', 'observa', 'corretiv', 'lote', 'nota'];
    if (termos.some(t => identificador.includes(t))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        el.removeAttribute('required');
        el.required = false;
        el.setCustomValidity('');
    }
}, true);

// 2. Intercepta o clique no botão Salvar antes da validação nativa do formulário acontecer
document.addEventListener('click', (e) => {
    const botao = e.target.closest('button, input[type="submit"]');
    if (botao) {
        desativarValidacoesCamposOpcionais();
    }
}, true);

// 3. Execução no carregamento da tela e monitoramento contínuo
document.addEventListener('DOMContentLoaded', async () => {
    desativarValidacoesCamposOpcionais();

    // Observador contínuo: anula caso algum script reponha o atributo 'required'
    const observer = new MutationObserver(() => {
        desativarValidacoesCamposOpcionais();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['required'] });

    await carregarMaquinasNoSelect();
    await carregarColaboradoresNoSelect();
    await carregarProdutosNoSelect();
    await inicializarTelaOcorrencias();

    desativarValidacoesCamposOpcionais();
});

// =========================================================================
// 2. LISTAR OCORRENCIAS (READ com Filtro e Paginação)
// =========================================================================
async function listarOcorrenciasCRUD() {
    try {
        const res = await fetch(`${API_URL}/ocorrencias/`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Erro no servidor: Status ${res.status}`);

        todasOcorrencias = await res.json();
        const totalBadge = document.getElementById('total-ocorrencias') || document.querySelector('.badge');
        if (totalBadge) totalBadge.innerText = todasOcorrencias.length;

        filtrarEAtualizarTabelaOcorrencias();
    } catch (e) { 
        console.error("Erro na requisição das Ocorrencias:", e); 
        const tabela = document.getElementById('tabela-ocorrencias') || document.querySelector('tbody');
        if (tabela) tabela.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">⚠️ Erro ao carregar ocorrencias.</td></tr>`;
    }
}

function filtrarEAtualizarTabelaOcorrencias() {
    const termoPesquisa = document.getElementById('pesquisa-ocorrencias')?.value.toLowerCase() || "";
    OcorrenciasFiltradas = todasOcorrencias.filter(c => c.nome && c.nome.toLowerCase().includes(termoPesquisa));
    OcorrenciasFiltradas.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", 'pt-BR', { sensitivity: 'base' }));

    const ultimoCadastro = todasOcorrencias[todasOcorrencias.length - 1];
    if (ultimoCadastro) {
        OcorrenciasFiltradas = OcorrenciasFiltradas.filter(c => (c.id_ocorrencias ?? c.id) !== (ultimoCadastro.id_ocorrencias ?? ultimoCadastro.id));
        OcorrenciasFiltradas.unshift(ultimoCadastro);
    }

    const totalPaginas = Math.ceil(OcorrenciasFiltradas.length / ITENS_POR_PAGINA) || 1;
    if (paginaAtualOcorrencias > totalPaginas) paginaAtualOcorrencias = totalPaginas;

    const indiceInicial = (paginaAtualOcorrencias - 1) * ITENS_POR_PAGINA;
    const ocorrenciasExibidas = OcorrenciasFiltradas.slice(indiceInicial, indiceInicial + ITENS_POR_PAGINA);

    renderizarTabelaOcorrencias(ocorrenciasExibidas);
    atualizarControlesPaginacaoOcorrencias(totalPaginas);
}

function renderizarTabelaOcorrencias(ocorrencias) {
    const tabela = document.getElementById('tabela-ocorrencias') || document.querySelector('tbody');
    if (!tabela) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        tabela.innerHTML = `<div class="text-center py-4 text-muted">Nenhuma ocorrência encontrada.</div>`;
        return;
    }

    tabela.innerHTML = ocorrencias.map((c, index) => {
        // 1. Identificação segura do ID
        let idBruto = c.id_ocorrencias ?? c.id_ocorrencia ?? c.id ?? c._id;
        const ocorrenciaId = (idBruto !== undefined && idBruto !== null && idBruto !== "") 
            ? idBruto.toString().trim() 
            : (index + 1).toString();

        // 2. Busca dos nomes correspondentes (Máquina, Colaborador e Produto)
        let maquinaNome = c.nome_maquina || c.maquina || "-";
        if (maquinaNome === "-" && c.id_maquinas && Array.isArray(window.listaDeMaquinas)) {
            const mEncontrada = window.listaDeMaquinas.find(m => (m.id_maquinas ?? m.id) == c.id_maquinas);
            if (mEncontrada) maquinaNome = mEncontrada.nome;
        }

        let colaboradorNome = c.nome_colaborador || c.colaborador || "-";
        if (colaboradorNome === "-" && c.id_colaboradores && Array.isArray(window.listaDeColaboradores)) {
            const cEncontrado = window.listaDeColaboradores.find(colab => (colab.id_colaboradores ?? colab.id) == c.id_colaboradores);
            if (cEncontrado) colaboradorNome = cEncontrado.nome;
        }

        let produtoNome = c.nome_produto || c.produto || "-";
        if (produtoNome === "-" && c.id_produtos && Array.isArray(window.listaDeProdutos)) {
            const pEncontrado = window.listaDeProdutos.find(p => (p.id_produtos ?? p.id) == c.id_produtos);
            if (pEncontrado) produtoNome = pEncontrado.nome;
        }

        // 3. Formatação da Situação
        const situacaoTexto = c.situacao || "Pendente";
        let badgeClasse = "text-warning fw-bold";

        if (situacaoTexto.toLowerCase() === "concluído") {
            badgeClasse = "text-success fw-bold";
        } else if (situacaoTexto.toLowerCase() === "em andamento") {
            badgeClasse = "text-primary fw-bold";
        }

        // Renderização em estilo bloco/tabela chave-valor igual às seções 2 e 3
        return `
            <div class="relatorio-secao-1-container border rounded p-2 mb-3">
                <table class="relatorio-tabela tabla-info w-100">
                    <tr>
                        <td style="width: 50%;"><strong>Máquina:</strong> <span>${maquinaNome}</span></td>
                        <td style="width: 50%;"><strong>Colaborador:</strong> <span>${colaboradorNome}</span></td>
                    </tr>
                    <tr>
                        <td><strong>Produto:</strong> <span>${produtoNome}</span></td>
                        <td><strong>Lote do Produto:</strong> <span>${c.lote_produtos || c.lote || "-"}</span></td>
                    </tr>
                    <tr>
                        <td><strong>Número da Nota Fiscal:</strong> <span>${c.numero_nota || "-"}</span></td>
                        <td><strong>Data da Ocorrência:</strong> <span>${c.data_ocorrencias ? c.data_ocorrencias.replace('T', ' ') : "-"}</span></td>
                    </tr>
                    <tr>
                        <td><strong>Situação:</strong> <span class="${badgeClasse}">${situacaoTexto}</span></td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-primary border-0 py-0" onclick="prepararEdicaoPorId('${ocorrenciaId}')" title="Editar"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-danger border-0 py-0" onclick="deletarItemGeral('ocorrencias', '${ocorrenciaId}')" title="Excluir"><i class="bi bi-trash"></i></button>
                        </td>
                    </tr>
                </table>
            </div>
        `;
    }).join('');
}

function atualizarControlesPaginacaoOcorrencias(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior-ocorrencias');
    const btnProximo = document.getElementById('btn-proximo-ocorrencias');
    const infoPaginacao = document.getElementById('info-paginacao-ocorrencias');

    if (infoPaginacao) infoPaginacao.innerText = `Página ${paginaAtualOcorrencias} de ${totalPaginas}`;
    if (btnAnterior) btnAnterior.disabled = (paginaAtualOcorrencias === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtualOcorrencias === totalPaginas);
}

// =========================================================================
// 3. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE)
// =========================================================================
document.getElementById('formOcorrencias')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const campoId = document.getElementById('ocorrencias-id');
    const id = campoId ? campoId.value.trim() : "";

    // Validações de permissão protegidas dentro do submit:
    if (!id && !permissoesTelaOcorrencias.inserir) {
        alert("Seu perfil não possui permissão para inserir novas ocorrências.");
        return;
    }
    if (id && !permissoesTelaOcorrencias.alterar) {
        alert("Seu perfil não possui permissão para alterar ocorrências.");
        return;
    }

    const url = id ? `${API_URL}/ocorrencias/${id}` : `${API_URL}/ocorrencias/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        const obtenerIdValido = (idInputBusca, idDatalist, idInputHidden) => {
            const inputBusca = document.getElementById(idInputBusca);
            const inputHidden = document.getElementById(idInputHidden);
            const datalist = document.getElementById(idDatalist);
            let idFinal = parseInt(inputHidden?.value, 10);
            
            if ((isNaN(idFinal) || idFinal <= 0) && inputBusca && inputBusca.value.trim() !== "" && datalist) {
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim() === inputBusca.value.trim());
                if (opcao) idFinal = parseInt(opcao.getAttribute('data-id'), 10);
            }
            return idFinal;
        };

        const idMaquinasInt = obtenerIdValido('maquinas-nome-busca', 'lista-maquinas-datalist', 'maquinas-nome');
        const idColaboradoresInt = obtenerIdValido('colaboradores-nome-busca', 'lista-colaboradores-datalist', 'colaboradores-nome');
        const idProdutosInt = obtenerIdValido('produtos-nome-busca', 'lista-produtos-datalist', 'produtos-nome');

        if (isNaN(idMaquinasInt) || idMaquinasInt <= 0) { alert("Por favor, selecione uma Máquina válida."); return; }
        if (isNaN(idColaboradoresInt) || idColaboradoresInt <= 0) { alert("Por favor, selecione um Colaborador válido."); return; }
        if (isNaN(idProdutosInt) || idProdutosInt <= 0) { alert("Por favor, selecione um Produto válido."); return; }

        const selectSituacao = document.getElementById('ocorrencias-situacao');
        let situacaoTexto = selectSituacao ? selectSituacao.value.trim() : "Pendente";

        const campoDataOcorrencia = document.getElementById('ocorrencias-data')?.value;
        let dataOcorrenciaIso = campoDataOcorrencia ? campoDataOcorrencia.replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');

        const campoDataPrazo = document.getElementById('ocorrencias-data-prazo')?.value;
        let dataPrazoTratada = campoDataPrazo && campoDataPrazo.trim() !== "" ? campoDataPrazo : null;

        const payloadJSON = {
            numero_ocorrencias: parseInt(document.getElementById('ocorrencias-numero')?.value, 10) || 0,
            data_ocorrencias: dataOcorrenciaIso,
            id_maquinas: idMaquinasInt,
            id_colaboradores: idColaboradoresInt,
            id_produtos: idProdutosInt,

            // Salva como "Não informado" no banco de dados quando vazio
            lote_produtos: document.getElementById('ocorrencias-lote-produto')?.value?.trim() || "Não informado",
            numero_nota: parseInt(document.getElementById('ocorrencias-numero-nota-fiscal')?.value, 10) || 0,

            problema: document.getElementById('ocorrencias-problema')?.value?.trim() || "Não informado",

            // Campos salvos como "Não informado" no banco de dados se não preenchidos
            falha_onde: document.getElementById('ocorrencias-falha-onde')?.value?.trim() || "Não informado",
            falha_como: document.getElementById('ocorrencias-falha-como')?.value?.trim() || "Não informado",
            falha_quando: document.getElementById('ocorrencias-falha-quando')?.value?.trim() || "Não informado",
            falha_quem: document.getElementById('ocorrencias-falha-quem')?.value?.trim() || "Não informado",
            observacoes: document.getElementById('ocorrencias-observacoes')?.value?.trim() || "Não informado",
            acao_corretiva: document.getElementById('ocorrencias-acao-corretiva')?.value?.trim() || "Não informado",

            data_prazo: dataPrazoTratada, 
            situacao: situacaoTexto, 
            foto: FOTO_OCORRENCIA_BASE64
        };

        // --- ATUALIZAR O FETCH NO SUBMIT PARA PASSAR O HEADER DE PERFIL ---
        const perfilId = obterIdPerfilUsuarioLocal();

        const res = await fetch(url, {
            method: metodo,
            headers: { 
                'Content-Type': 'application/json',
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            },
            body: JSON.stringify(payloadJSON)
        });
        
            // =========================================================================
// FLUXO DE RESPOSTA DO SALVAMENTO (SUBMIT)
// =========================================================================
if (res.ok) { 
    // Notificação visual de retorno
    dispararNotificacao(
        id ? "Ocorrência alterada com sucesso!" : "Nova ocorrência cadastrada com sucesso!", 
        id ? "atualizar" : "criar"
    );

    // 1. PRIMEIRO: Transfere os dados atuais para o layout de impressão A4 antes de zerar o form
    try {
        if (typeof prepararDadosImpressao === "function") {
            prepararDadosImpressao();
        }
    } catch (errImpressao) {
        console.warn("Aviso ao preparar dados de impressão:", errImpressao);
    }

    // 2. SEGUNDO: Exibe o modal/toast com a opção de imprimir a ocorrência salva
    if (typeof exibirToastImpressao === "function") {
        exibirToastImpressao();
    }

    // 3. TERCEIRO: Limpa completamente a tela para a próxima ocorrência
    try {
        limparTelaParaNovaOcorrencia();
    } catch (errLimpeza) {
        console.error("Erro na limpeza dos campos:", errLimpeza);
    }

    // 4. Atualiza a tabela com a listagem de registros e rola para o topo
    if (typeof listarOcorrenciasCRUD === "function") {
        listarOcorrenciasCRUD();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

} else {
    alert("Erro ao salvar ocorrência no servidor.");
}
    } catch (e) {
        console.error("Erro ao salvar ocorrência:", e);
        alert("Erro ao salvar ocorrência no servidor.");
    }
});

// =========================================================================
// FUNÇÕES AUXILIARES DE LIMPEZA E FORMATAÇÃO
// =========================================================================

/**
 * Atribui texto de maneira segura a um elemento existente no DOM
 */
function setTxt(idElemento, valor) {
    const el = document.getElementById(idElemento);
    if (el) {
        const textoValido = (valor !== undefined && valor !== null && String(valor).trim() !== '') ? valor : "---";
        el.innerText = textoValido;
    }
}

/**
 * Recupera valor tanto de <input> quanto o texto selecionado de <select>
 */
function obterValorElemento(idElemento) {
    const el = document.getElementById(idElemento);
    if (!el) return "";
    if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
        return el.options[el.selectedIndex].text.trim();
    }
    return el.value ? el.value.trim() : "";
}

function limparTelaParaNovaOcorrencia() {
    const form = document.getElementById('formOcorrencias');
    if (form) form.reset();

    const camposParaLimpar = [
        'ocorrencias-id',
        'ocorrencias-numero',
        'ocorrencias-problema',
        'ocorrencias-lote-produto',
        'ocorrencias-numero-nota-fiscal',
        'ocorrencias-falha-onde',
        'ocorrencias-falha-como',
        'ocorrencias-falha-quando',
        'ocorrencias-falha-quem',
        'ocorrencias-observacoes',
        'ocorrencias-acao-corretiva',
        'ocorrencias-data-prazo',
        'maquinas-nome',
        'produtos-nome',
        'colaboradores-nome',
        'maquinas-nome-busca',
        'colaboradores-nome-busca',
        'produtos-nome-busca'
    ];

    camposParaLimpar.forEach(idCampo => {
        const el = document.getElementById(idCampo);
        if (el) {
            el.value = "";
            if (el.tagName === 'SELECT') el.selectedIndex = 0;
        }
    });

    // Redefine a data/hora local atual
    const inputDataOcorrencia = document.getElementById('ocorrencias-data');
    if (inputDataOcorrencia) {
        inputDataOcorrencia.value = typeof obterDataHoraAtualLocal === "function" 
            ? obterDataHoraAtualLocal() 
            : new Date().toISOString().slice(0, 16);
    }

    // Retorna a situação ao status padrão
    const selectSituacao = document.getElementById('ocorrencias-situacao');
    if (selectSituacao) selectSituacao.value = "Pendente";

    // Reseta foto e preview
    if (typeof FOTO_OCORRENCIA_BASE64 !== "undefined") {
        FOTO_OCORRENCIA_BASE64 = null;
    }
    if (typeof resetarVisualFoto === "function") {
        resetarVisualFoto();
    }

    // Restaura o cabeçalho do formulário
    const tituloForm = document.getElementById('titulo-form-colab');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="sidebar-texto fa-solid fa-triangle-exclamation me-3"></i> Nova Ocorrência';
    }
}

function dispararNotificacao(mensagem, acao = 'sucesso') {
    const elementoToast = document.getElementById('toast-cadastro');
    const textoToast = document.getElementById('toast-mensagem-texto');
    if (!elementoToast || !textoToast) return;

    elementoToast.className = "toast align-items-center text-white bg-success border-0 shadow";
    textoToast.innerText = mensagem;

    if (typeof bootstrap !== "undefined" && bootstrap.Toast) {
        const bootstrapToast = bootstrap.Toast.getOrCreateInstance(elementoToast, { delay: 3500 });
        bootstrapToast.show();
    }
}

// =========================================================================
// FUNÇÕES DE IMPRESSÃO E CONTROLE DO MODAL DE CONFIRMAÇÃO
// =========================================================================

function exibirToastImpressao() {
    const toast = document.getElementById('toastConfirmacao');
    const backdrop = document.getElementById('toastBackdrop');
    if (toast) toast.classList.remove('d-none');
    if (backdrop) backdrop.classList.remove('d-none');
}

function fecharToastImpressao() {
    const toast = document.getElementById('toastConfirmacao');
    const backdrop = document.getElementById('toastBackdrop');
    if (toast) toast.classList.add('d-none');
    if (backdrop) backdrop.classList.add('d-none');
}

function confirmarEImprimir() {
    fecharToastImpressao();
    window.print();
}

function prepararDadosImpressao() {
    // 1. Dados Cabeçalho e Meta
    setTxt('print-numero', obterValorElemento('ocorrencias-numero'));
    setTxt('print-data', new Date().toLocaleDateString('pt-BR'));
    
    const usuarioEl = document.getElementById('usuario-nome');
    const usuarioTexto = usuarioEl ? usuarioEl.innerText.replace('Usuário:', '').trim() : '';
    setTxt('print-usuario', usuarioTexto);

    // 2. Informações Gerais
    const maquina = obterValorElemento('maquinas-nome-busca') || obterValorElemento('maquinas-nome');
    const colaborador = obterValorElemento('colaboradores-nome-busca') || obterValorElemento('colaboradores-nome');
    const produto = obterValorElemento('produtos-nome-busca') || obterValorElemento('produtos-nome');

    setTxt('print-maquina', maquina);
    setTxt('print-colaborador', colaborador);
    setTxt('print-produto', produto);
    setTxt('print-lote', obterValorElemento('ocorrencias-lote-produto'));
    setTxt('print-nf', obterValorElemento('ocorrencias-numero-nota-fiscal'));
    setTxt('print-data-ocorrencia', obterValorElemento('ocorrencias-data').replace('T', ' '));

    // =====================================================================
    // CORREÇÃO DEFINITIVA DO CAMPO SITUAÇÃO (Texto Preto e Remoção dos Ícones)
    // =====================================================================
    const situacaoTexto = obterValorElemento('ocorrencias-situacao') || "Pendente";
    const elSituacao = document.getElementById('print-situacao');

    if (elSituacao) {
        // 1. Define o valor e remove estilos de cor anteriores
        elSituacao.innerText = situacaoTexto;
        elSituacao.className = ""; // Remove classes utilitárias como text-warning
        elSituacao.style.color = "#000000";
        elSituacao.style.fontWeight = "normal";

        // 2. Localiza a linha da tabela (<tr>) correspondente e limpa os botões
        const trPai = elSituacao.closest('tr');
        if (trPai) {
            // Remove botões de editar e eliminar
            const botoes = trPai.querySelectorAll('button, .bi-pencil, .bi-trash, a');
            botoes.forEach(btn => {
                const elementoPai = btn.closest('button') || btn;
                elementoPai.remove();
            });

            // Garante que a célula adjacente fique vazia
            const celulas = trPai.querySelectorAll('td');
            if (celulas.length > 1) {
                celulas[1].innerHTML = '';
            }
        }
    }

    // 3. Descrição dos Problemas e Falhas (5W2H)
    setTxt('print-problema', obterValorElemento('ocorrencias-problema'));
    setTxt('print-falha-onde', obterValorElemento('ocorrencias-falha-onde'));
    setTxt('print-falha-como', obterValorElemento('ocorrencias-falha-como'));
    setTxt('print-falha-quando', obterValorElemento('ocorrencias-falha-quando'));
    setTxt('print-falha-quem', obterValorElemento('ocorrencias-falha-quem'));

    // 4. Ações e Observações
    setTxt('print-acao-corretiva', obterValorElemento('ocorrencias-acao-corretiva'));
    setTxt('print-observacoes', obterValorElemento('ocorrencias-observacoes'));
    setTxt('print-prazo', obterValorElemento('ocorrencias-data-prazo'));
    setTxt('print-colaborador-assinatura', colaborador || "Colaborador Q.C Software");

    // 5. Tratamento de Foto
    const imgPrint = document.getElementById('print-foto-img');
    const placeholder = document.getElementById('print-foto-placeholder');
    
    if (imgPrint) {
        if (typeof FOTO_OCORRENCIA_BASE64 !== "undefined" && FOTO_OCORRENCIA_BASE64) {
            imgPrint.src = FOTO_OCORRENCIA_BASE64;
            imgPrint.classList.remove('d-none');
            if (placeholder) placeholder.classList.add('d-none');
        } else {
            imgPrint.src = "";
            imgPrint.classList.add('d-none');
            if (placeholder) placeholder.classList.remove('d-none');
        }
    }
}

// =========================================================================
// 4. CONTROLE DE CAMERA, GALERIA E ESTILIZAÇÃO DO CONTAINER DA FOTO
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone-foto');
    const inputFoto = document.getElementById('ocorrencias-foto-ocorrencia');
    const previewContainer = document.getElementById('preview-container');
    const uploadInstrucoes = document.getElementById('upload-instrucoes');
    const fotoPreview = document.getElementById('foto-preview');
    const btnRemover = document.getElementById('btn-remover-foto');

    if (!dropzone || !inputFoto) return;

    // ESTILO RESPONSIVO BLINDADO: Impede distorções no mobile ou estouro de layout
    if (fotoPreview) {
        fotoPreview.style.width = "100%";
        fotoPreview.style.maxWidth = "400px";
        fotoPreview.style.height = "auto";
        fotoPreview.style.maxHeight = "250px"; 
        fotoPreview.style.objectFit = "contain"; 
        fotoPreview.style.borderRadius = "8px";
        fotoPreview.style.display = "block";
        fotoPreview.style.margin = "0 auto";
    }

    // Clique na dropzone dispara o seletor nativo do sistema
    dropzone.addEventListener('click', (e) => {
        if (e.target.closest('#btn-remover-foto') || e.target.id === 'btn-remover-foto') {
            return; // Bloqueia abertura da câmera caso queira apenas excluir a foto
        }
        inputFoto.click();
    });

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-primary'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('border-primary'); });
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-primary');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            inputFoto.files = e.dataTransfer.files; 
            processarArquivoFoto(e.dataTransfer.files[0]);
        }
    });

    function processarArquivoFoto(arquivo) {
        if (!arquivo) return;

        if (!arquivo.type.startsWith('image/')) {
            alert("Por favor, selecione apenas arquivos de imagem (PNG, JPG, JPEG).");
            return;
        }

        if (arquivo.size > 5 * 1024 * 1024) {
            alert("A imagem selecionada é muito pesada! Escolha uma foto de até 5MB.");
            inputFoto.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            // Salva na variável global imediatamente e exibe a miniatura
            FOTO_OCORRENCIA_BASE64 = event.target.result;
            if (fotoPreview) fotoPreview.src = event.target.result;
            
            previewContainer?.classList.remove('d-none');
            uploadInstrucoes?.classList.add('d-none');
        };
        reader.readAsDataURL(arquivo);
    }

    inputFoto.addEventListener('change', (e) => {
        processarArquivoFoto(e.target.files[0]);
    });

    window.resetarVisualFoto = function() {
        inputFoto.value = "";
        FOTO_OCORRENCIA_BASE64 = null; // Limpa a memória global
        if (fotoPreview) fotoPreview.src = "";
        previewContainer?.classList.add('d-none');
        uploadInstrucoes?.classList.remove('d-none');
    };

    btnRemover?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Impede a bolha de clique de abrir a câmera novamente
        window.resetarVisualFoto();
    });
});