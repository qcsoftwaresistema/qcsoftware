const API_URL = "https://sistema.qcsoftware.com.br";

// VARIÁVEIS GLOBAIS DE PAGINAÇÃO
let todosProdutos = [];
let produtosFiltrados = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 10;

// =========================================================================
// 1. OBTENÇÃO DO PERFIL DO USUÁRIO LOGADO E DECLARAÇÃO GLOBAL
// =========================================================================
function obterIdPerfilUsuario() {
    let perfilId = localStorage.getItem("id_perfis") || sessionStorage.getItem("id_perfis");
    
    if (!perfilId || perfilId === "undefined" || perfilId === "null") {
        const chavesObjetos = ["qc_user", "usuario"];
        for (const chave of chavesObjetos) {
            const rawData = localStorage.getItem(chave) || sessionStorage.getItem(chave);
            if (rawData) {
                try {
                    const obj = JSON.parse(rawData);
                    if (obj && (obj.id_perfis || obj.id_perfil)) {
                        perfilId = obj.id_perfis || obj.id_perfil;
                        break;
                    }
                } catch (e) {
                    console.error("Erro ao converter JSON do usuário:", e);
                }
            }
        }
    }
    return (perfilId && perfilId !== "undefined" && perfilId !== "null") ? Number(perfilId) : null;
}

// DECLARAÇÃO GLOBAL: Resolve o erro "PERFIL_USUARIO is not defined" no listarProdutosCRUD()
const PERFIL_USUARIO = obterIdPerfilUsuario();

// Objeto global de permissões da tela
let permissoesTelaProdutos = { visualizar: false, inserir: false, alterar: false, excluir: false };

// =========================================================================
// 2. INICIALIZAÇÃO E CONSULTA DE PERMISSÕES VIA API /permissoes/
// =========================================================================
async function inicializarTelaProdutos() {
    console.log("Perfil ID identificado no navegador:", PERFIL_USUARIO);

    if (PERFIL_USUARIO) {
        try {
            // 1. Tenta identificar o ID exato da tela de Produtos
            let idTelaProdutos = 51; // ID padrão da tela de Produtos no seu banco de dados
            
            try {
                const resTelas = await fetch(`${API_URL}/tela/`);
                if (resTelas.ok) {
                    const listaTelas = await resTelas.json();
                    const telaProd = listaTelas.find(t => t.nome && t.nome.toLowerCase() === "produtos");
                    if (telaProd && telaProd.id_telas) {
                        idTelaProdutos = Number(telaProd.id_telas);
                    }
                }
            } catch (eTelas) {
                console.warn("Usando id_telas padrão (51) para Produtos.");
            }

            // 2. Busca a lista completa de permissões registradas na API
            const resPerms = await fetch("https://sistema.qcsoftware.com.br/permissoes/");
            
            if (resPerms.ok) {
                const listaPermissoes = await resPerms.json();

                // Ordena por id_permissoes decrescente para pegar sempre a atualização mais recente do banco
                const listaOrdenada = Array.isArray(listaPermissoes) 
                    ? [...listaPermissoes].sort((a, b) => (b.id_permissoes || 0) - (a.id_permissoes || 0)) 
                    : [];

                // BUSCA EXATA: Filtra estritamente pelo id_perfis do usuário E id_telas da tela de produtos
                const permissaoEncontrada = listaOrdenada.find(p => 
                    Number(p.id_perfis) === Number(PERFIL_USUARIO) && Number(p.id_telas) === Number(idTelaProdutos)
                );

                if (permissaoEncontrada) {
                    permissoesTelaProdutos = {
                        visualizar: Boolean(permissaoEncontrada.visualizar),
                        inserir: Boolean(permissaoEncontrada.inserir),
                        alterar: Boolean(permissaoEncontrada.alterar),
                        excluir: Boolean(permissaoEncontrada.excluir)
                    };
                    console.log(`Permissões exatas para Perfil ${PERFIL_USUARIO} na Tela Produtos (${idTelaProdutos}):`, permissoesTelaProdutos);
                } else {
                    console.warn(`Nenhuma permissão específica encontrada no banco para perfil ${PERFIL_USUARIO} na tela ${idTelaProdutos}. Bloqueando ações por segurança.`);
                    permissoesTelaProdutos = { visualizar: false, inserir: false, alterar: false, excluir: false };
                }
            } else {
                console.error("Erro ao consultar /permissoes/. Status HTTP:", resPerms.status);
            }
        } catch (e) {
            console.error("Erro ao processar verificação de permissões:", e);
        }
    }

    // 3. Aplica os bloqueios/liberações nos elementos e botões da tela
    aplicarPermissoesVisuais();

    // 4. Executa a listagem da tabela apenas se tiver permissão de visualização
    if (permissoesTelaProdutos.visualizar) {
        listarProdutosCRUD();
    } else {
        const tabela = document.getElementById('tabela-produtos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4"><i class="bi bi-lock-fill"></i> Acesso Negado: Seu perfil não possui permissão para visualizar produtos.</td></tr>`;
        }
    }
}

function aplicarPermissoesVisuais() {
    const formProdutos = document.getElementById('formProdutos');
    const btnSalvar = formProdutos ? formProdutos.querySelector('button[type="submit"]') : null;
    
    if (btnSalvar) {
        if (!permissoesTelaProdutos.inserir && !permissoesTelaProdutos.alterar) {
            btnSalvar.disabled = true;
            btnSalvar.innerText = "Sem permissão para salvar";
            btnSalvar.classList.replace('btn-primary', 'btn-secondary');
        } else {
            btnSalvar.disabled = false;
            btnSalvar.innerText = "Salvar";
            btnSalvar.classList.replace('btn-secondary', 'btn-primary');
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    inicializarTelaProdutos();
});

// =========================================================================
// 1. LISTAR PRODUTOS (READ com Filtro e Paginação)
// =========================================================================
async function listarProdutosCRUD() {
    try {
        todosProdutos = []; 
        const tabela = document.getElementById('tabela-produtos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando produtos...</td></tr>`;
        }

        const res = await fetch(`${API_URL}/produtos/`, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'x-perfil-id': PERFIL_USUARIO } 
        });
            
        if (!res.ok) {
            if (res.status === 403) throw new Error("Acesso negado: Você não tem permissão para visualizar.");
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todosProdutos = await res.json();
        
        const totalBadge = document.getElementById('total-produtos');
        if (totalBadge) totalBadge.innerText = todosProdutos.length;

        filtrarEAtualizarTabela();

    } catch (e) { 
        console.error("Erro detalhado na requisição dos Produtos:", e); 
        const tabela = document.getElementById('tabela-produtos');
        if (tabela) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-4">
                        ⚠️ Erro ao carregar produtos.<br>
                        <small class="text-muted">Motivo: ${e.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

function filtrarEAtualizarTabela() {
    const termoPesquisa = document.getElementById('pesquisa-produto')?.value.toLowerCase() || "";
    
    produtosFiltrados = todosProdutos.filter(p =>
        p.nome && p.nome.toLowerCase().includes(termoPesquisa)
    );

    produtosFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    const ultimoCadastro = todosProdutos[todosProdutos.length - 1];

    if (ultimoCadastro) {
        produtosFiltrados = produtosFiltrados.filter(
            p => p.id_produtos !== ultimoCadastro.id_produtos
        );
        produtosFiltrados.unshift(ultimoCadastro);
    }

    const totalPaginas = Math.ceil(produtosFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    if (paginaAtual > totalPaginas) {
        paginaAtual = totalPaginas;
    }

    const indiceInicial = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const produtosExibidos = produtosFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabela(produtosExibidos);
    atualizarControlesPaginacao(totalPaginas);
}

function renderizarTabela(produtos) {
    const tabela = document.getElementById('tabela-produtos');
    if (!tabela) return;

    if (!produtos || produtos.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">Nenhum produto encontrado.</td>
            </tr>
        `;
        return;
    }

    tabela.innerHTML = produtos.map(p => {
        let idBruto = undefined;
        
        if (p) {
            if (p.id_produtos !== undefined && p.id_produtos !== null) idBruto = p.id_produtos;
            else if (p.id !== undefined && p.id !== null) idBruto = p.id;
            else if (p._id !== undefined && p._id !== null) idBruto = p._id;
        }
        
        const produtoId = idBruto !== undefined ? idBruto.toString().trim() : "";

        if (!produtoId) {
            console.warn("Produto sem ID detectado. Estrutura recebida do banco:", p);
            return `
                <tr class="table-warning">
                    <td><strong>${p.nome || "Sem Nome"}</strong></td>
                    <td>${p.categoria || "Sem Categoria"}</td>
                    <td><span class="badge bg-warning text-dark">Erro de ID</span></td>
                    <td class="text-end text-muted small">⚠️ ID ausente</td>
                </tr>
            `;
        }

        let situacaoTratada = "Ativo"; 
        if (p.ativo !== undefined && p.ativo !== null) {
            situacaoTratada = p.ativo;
        } else if (p.situacao !== undefined && p.situacao !== null) {
            situacaoTratada = p.situacao;
        }

        if (typeof situacaoTratada === 'boolean') {
            situacaoTratada = situacaoTratada ? "Ativo" : "Inativo";
        }

        if (typeof situacaoTratada === 'string' && situacaoTratada.length > 0) {
            situacaoTratada = situacaoTratada.charAt(0).toUpperCase() + situacaoTratada.slice(1).toLowerCase();
        }

        p.id = produtoId;
        p.situacao = situacaoTratada;

        const produtoEncoded = encodeURIComponent(JSON.stringify(p));
        
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        let botoesAcao = "";
        if (permissoesTelaProdutos.alterar) {
            botoesAcao += `<button class="btn btn-sm btn-outline-primary me-1 border-0" 
                            onclick="prepararEdicaoSegura('${produtoEncoded}')" title="Editar produto">
                                <i class="bi bi-pencil"></i>
                           </button>`;
        }
        if (permissoesTelaProdutos.excluir) {
            botoesAcao += `<button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="deletarItemGeral('produtos', '${produtoId}', listarProdutosCRUD)" title="Excluir produto">
                                <i class="bi bi-trash"></i>
                           </button>`;
        }
        if (!permissoesTelaProdutos.alterar && !permissoesTelaProdutos.excluir) {
            botoesAcao = `<span class="badge bg-secondary">Sem permissão</span>`;
        }

        return `
            <tr class="align-middle">                
                <td><strong>${p.nome || "Sem Nome"}</strong></td>
                <td>${p.categoria || "Sem Categoria"}</td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    ${botoesAcao}
                </td>
            </tr>
        `;
    }).join('');
}

function atualizarControlesPaginacao(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior');
    const btnProximo = document.getElementById('btn-proximo');
    const infoPaginacao = document.getElementById('info-paginacao');

    if (infoPaginacao) {
        infoPaginacao.innerText = `Página ${paginaAtual} de ${totalPaginas}`;
    }

    if (btnAnterior) btnAnterior.disabled = (paginaAtual === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtual === totalPaginas);
}

// =========================================================================
// 2. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE)
// =========================================================================
document.getElementById('formProdutos')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const campoId = document.getElementById('prod-id');
    let id = campoId ? campoId.value.toString().trim() : "";
    
    if (!id || id === "" || id === "undefined" || id === "null") {
        id = null;
    }

    if (!id && !permissoesTelaProdutos.inserir) {
        alert("Acesso negado: Você não tem permissão para inserir novos produtos.");
        return;
    }
    if (id && !permissoesTelaProdutos.alterar) {
        alert("Acesso negado: Você não tem permissão para alterar produtos existentes.");
        return;
    }
    
    const nomeInput = document.getElementById('produtos-nome')?.value || "";
    const categoriaInput = document.getElementById('produtos-categoria')?.value || "";
    
    const selectSituacao = document.getElementById('produtos-situacao');
    const valorSelect = selectSituacao ? selectSituacao.value : "true";
    const ativoBoolean = valorSelect === "true"; 

    const url = id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        let options = {};
        const fileInput = document.getElementById('foto-arquivo');

        if (fileInput && fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('nome', nomeInput);
            formData.append('categoria', categoriaInput);
            formData.append('ativo', ativoBoolean); 
            formData.append('file', fileInput.files[0]);

            options = {
                method: metodo,
                headers: { 'x-perfil-id': PERFIL_USUARIO },
                body: formData
            };
        } else {
            const payloadJSON = {
                nome: nomeInput,
                categoria: categoriaInput,
                ativo: ativoBoolean 
            };

            options = {
                method: metodo,
                headers: {
                    'Content-Type': 'application/json',
                    'x-perfil-id': PERFIL_USUARIO
                },
                body: JSON.stringify(payloadJSON)
            };
        }

        const res = await fetch(url, options);
        
        if (res.ok) {
            e.target.reset(); 
            if (campoId) campoId.value = ""; 
            
            const tituloForm = document.getElementById('titulo-form-prod');
            if (tituloForm) {
                tituloForm.innerHTML = '<i class="bi bi-box-seam text-primary me-2"></i>Novo Produto';
            }
            
            if (metodo === 'POST') {
                dispararNotificacao("Novo cadastro criado com sucesso!", "criar");
            } else {
                dispararNotificacao("Cadastro alterado com sucesso!", "atualizar");
            }
            
            listarProdutosCRUD();
        } else {
            if (res.status === 403) {
                alert("Acesso negado: Você não tem permissão para realizar esta ação no servidor.");
            } else {
                const erroApi = await res.json().catch(() => ({}));
                console.error("Detalhes do erro do servidor:", erroApi);
                alert(`Erro ao salvar produto. Status: ${res.status}\nMotivo: ${erroApi.detail || erroApi.message || 'Erro interno no backend'}`);
            }
        }
    } catch (err) { 
        console.error("Erro no envio:", err);
        alert("Erro de conexão ao salvar produto."); 
    }
});

// =========================================================================
// 3. EXCLUIR PRODUTOS
// =========================================================================
async function deletarItemGeral(endpoint, id, callbackSucesso) {
    if (!id || id === undefined || id === null || id.toString().trim() === "" || id.toString() === "undefined" || id.toString() === "null") {
        alert("Não é possível deletar este item: ID inválido ou ausente.");
        return;
    }

    if (!confirm("Tem certeza que deseja excluir permanentemente este item?")) {
        return; 
    }

    try {
        const res = await fetch(`${API_URL}/${endpoint}/${id.toString().trim()}`, {
            method: 'DELETE',
            headers: { 'x-perfil-id': PERFIL_USUARIO } 
        });

        if (res.ok) {
            dispararNotificacao("Cadastro excluído com sucesso!", "excluir");
            callbackSucesso();
        } else {
            if (res.status === 403) {
                alert("Acesso negado: Você não tem permissão para excluir registros.");
            } else {
                const erroApi = await res.json().catch(() => ({}));
                alert(`Falha: ${erroApi.detail || res.status}`);
            }
        }
    } catch (error) {
        console.error("Erro ao deletar:", error);
        alert("Erro de rede ao tentar deletar o item.");
    }
}

// =========================================================================
// 4. FUNÇÕES DE AUXÍLIO PARA EDIÇÃO
// =========================================================================
window.prepararEdicaoSegura = function(produtoEncoded) {
    try {
        const produto = JSON.parse(decodeURIComponent(produtoEncoded));
        prepararEdicaoProduto(produto);
    } catch (err) {
        console.error("Erro ao decodificar dados do produto:", err);
    }
};

function prepararEdicaoProduto(p) {
    const campoId = document.getElementById('prod-id');
    const campoNome = document.getElementById('produtos-nome');
    const campoCategoria = document.getElementById('produtos-categoria');
    const campoSituacao = document.getElementById('produtos-situacao');
    
    const idLimpo = (p.id !== undefined ? p.id : (p._id || "")).toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = p.nome || "";
    if (campoCategoria) campoCategoria.value = p.categoria || "";
    
    if (campoSituacao) {
        const ehInativo = p.ativo === false || 
                          p.ativo === "false" || 
                          (p.situacao && String(p.situacao).toLowerCase() === "inativo");

        campoSituacao.value = ehInativo ? "false" : "true";
    }
    
    const tituloForm = document.getElementById('titulo-form-produtos');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-2"></i>Editar Produto';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 5. FUNÇÃO AUXILIAR: Disparar Toast no Canto Inferior Direito
// =========================================================================
function dispararNotificacao(mensagem, acao = 'sucesso') {
    const elementoToast = document.getElementById('toast-cadastro');
    const textoToast = document.getElementById('toast-mensagem-texto');
    const iconeToast = document.getElementById('toast-mensagem-icone');
    
    if (!elementoToast || !textoToast) return;

    // Configura o fundo verde padrão (Sucesso)
    elementoToast.className = "toast align-items-center text-white bg-success border-0 shadow";
    
    // Altera o ícone do Bootstrap conforme o evento
    if (acao === 'criar') {
        if (iconeToast) iconeToast.innerHTML = '<i class="bi bi-plus-circle-fill fs-5"></i>';
    } else if (acao === 'atualizar') {
        if (iconeToast) iconeToast.innerHTML = '<i class="bi bi-pencil-square fs-5"></i>';
    } else if (acao === 'excluir') {
        if (iconeToast) iconeToast.innerHTML = '<i class="bi bi-trash3-fill fs-5"></i>';
    } else {
        if (iconeToast) iconeToast.innerHTML = '<i class="bi bi-check-circle-fill fs-5"></i>';
    }

    textoToast.innerText = message = mensagem;

    // Inicializa e exibe o Toast (configurado para sumir sozinho em 3.5 segundos)
    const bootstrapToast = new bootstrap.Toast(elementoToast, { delay: 3500 });
    bootstrapToast.show();
}

// =========================================================================
// 6. OUVINTES DE EVENTOS DA PÁGINA (INPUTS E CLIQUES)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    listarProdutosCRUD();

    // Evento de digitação na caixa de pesquisa
    document.getElementById('pesquisa-produto')?.addEventListener('input', () => {
        paginaAtual = 1; // Força retorno à página 1 a cada busca realizada
        filtrarEAtualizarTabela();
    });

    // Evento de clique para o botão "Anterior"
    document.getElementById('btn-anterior')?.addEventListener('click', () => {
        if (paginaAtual > 1) {
            paginaAtual--;
            filtrarEAtualizarTabela();
        }
    });

    // Evento de clique para o botão "Próximo"
    document.getElementById('btn-proximo')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(produtosFiltrados.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtual < totalPaginas) {
            paginaAtual++;
            filtrarEAtualizarTabela();
        }
    });
});

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO E PERMISSÕES PARA CARGOS
// =========================================================================
let todosCargos = [];       // Armazena a lista bruta vinda da API
let cargosFiltrados = [];   // Armazena o resultado da busca por nome
let paginaAtualCargos = 1;  // Variável de página separada para não chocar com produtos

// Objeto de controle de permissões para a tela de Cargos
let permissoesTelaCargos = { visualizar: false, inserir: false, alterar: false, excluir: false };

// =========================================================================
// 0. INICIALIZAÇÃO E CONSULTA DINÂMICA DE PERMISSÕES (TELA CARGOS)
// =========================================================================
async function inicializarTelaCargos() {
    const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();
    console.log("Perfil ID identificado na tela de Cargos:", perfilId);

    if (perfilId) {
        try {
            // Identifica a ID da tela de Cargos (padrão no banco de dados)
            let idTelaCargos = 52; 

            try {
                const resTelas = await fetch(`${API_URL}/tela/`);
                if (resTelas.ok) {
                    const listaTelas = await resTelas.json();
                    const telaEncontrada = listaTelas.find(t => t.nome && t.nome.toLowerCase() === "cargos");
                    if (telaEncontrada && telaEncontrada.id_telas) {
                        idTelaCargos = Number(telaEncontrada.id_telas);
                    }
                }
            } catch (eTelas) {
                console.warn("Usando id_telas padrão (52) para Cargos.");
            }

            // Busca as permissões gravadas na API /permissoes/
            const resPerms = await fetch("https://sistema.qcsoftware.com.br/permissoes/");
            
            if (resPerms.ok) {
                const listaPermissoes = await resPerms.json();

                // Ordena por id_permissoes decrescente para pegar a alteração mais recente
                const listaOrdenada = Array.isArray(listaPermissoes) 
                    ? [...listaPermissoes].sort((a, b) => (b.id_permissoes || 0) - (a.id_permissoes || 0)) 
                    : [];

                // Filtro estrito para a combinação id_perfis + id_telas
                const permissaoEncontrada = listaOrdenada.find(p => 
                    Number(p.id_perfis) === Number(perfilId) && Number(p.id_telas) === Number(idTelaCargos)
                );

                if (permissaoEncontrada) {
                    permissoesTelaCargos = {
                        visualizar: Boolean(permissaoEncontrada.visualizar),
                        inserir: Boolean(permissaoEncontrada.inserir),
                        alterar: Boolean(permissaoEncontrada.alterar),
                        excluir: Boolean(permissaoEncontrada.excluir)
                    };
                    console.log(`Permissões da Tela Cargos (Perfil ${perfilId}):`, permissoesTelaCargos);
                } else {
                    console.warn(`Nenhuma permissão específica para perfil ${perfilId} na tela de Cargos.`);
                    permissoesTelaCargos = { visualizar: false, inserir: false, alterar: false, excluir: false };
                }
            }
        } catch (e) {
            console.error("Erro ao carregar permissões da tela de Cargos:", e);
        }
    }

    // Aplica restrições na interface
    aplicarPermissoesVisuaisCargos();

    // Carrega dados apenas se puder visualizar
    if (permissoesTelaCargos.visualizar) {
        listarCargosCRUD();
    } else {
        const tabela = document.getElementById('tabela-cargos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4"><i class="bi bi-lock-fill"></i> Acesso Negado: Seu perfil não possui permissão para visualizar os cargos.</td></tr>`;
        }
    }
}

function aplicarPermissoesVisuaisCargos() {
    const formCargos = document.getElementById('formCargos');
    const btnSalvar = formCargos ? formCargos.querySelector('button[type="submit"]') : null;
    
    if (btnSalvar) {
        if (!permissoesTelaCargos.inserir && !permissoesTelaCargos.alterar) {
            btnSalvar.disabled = true;
            btnSalvar.innerText = "Sem permissão para salvar";
            btnSalvar.classList.replace('btn-primary', 'btn-secondary');
        } else {
            btnSalvar.disabled = false;
            btnSalvar.innerText = "Salvar";
            btnSalvar.classList.replace('btn-secondary', 'btn-primary');
        }
    }
}

// =========================================================================
// 1. LISTAR CARGOS (READ com Filtro e Paginação)
// =========================================================================
async function listarCargosCRUD() {
    try {
        todosCargos = []; 
        const tabela = document.getElementById('tabela-cargos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando cargos...</td></tr>`;
        }

        const res = await fetch(`${API_URL}/cargos/`, {
            method: 'GET',
            cache: 'no-store'
        });
        
        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todosCargos = await res.json();
        
        const totalBadge = document.getElementById('total-cargos');
        if (totalBadge) totalBadge.innerText = todosCargos.length;

        filtrarEAtualizarTabelaCargos();

    } catch (e) { 
        console.error("Erro detalhado na requisição dos Cargos:", e); 
        const tabela = document.getElementById('tabela-cargos');
        if (tabela) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-4">
                        ⚠️ Erro ao carregar cargos.<br>
                        <small class="text-muted">Motivo: ${e.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

function filtrarEAtualizarTabelaCargos() {
    const termoPesquisa = document.getElementById('pesquisa-cargo')?.value.toLowerCase() || "";
    
    cargosFiltrados = todosCargos.filter(c =>
        c.nome && c.nome.toLowerCase().includes(termoPesquisa)
    );

    cargosFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    const ultimoCadastro = todosCargos[todosCargos.length - 1];

    if (ultimoCadastro) {
        cargosFiltrados = cargosFiltrados.filter(
            c => c.id_cargos !== ultimoCadastro.id_cargos
        );
        cargosFiltrados.unshift(ultimoCadastro);
    }

    const totalPaginas = Math.ceil(cargosFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    if (paginaAtualCargos > totalPaginas) {
        paginaAtualCargos = totalPaginas;
    }

    const indiceInicial = (paginaAtualCargos - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const cargosExibidos = cargosFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabelaCargos(cargosExibidos);
    atualizarControlesPaginacaoCargos(totalPaginas);
}

function renderizarTabelaCargos(cargos) {
    const tabela = document.getElementById('tabela-cargos');
    if (!tabela) return;

    if (!cargos || cargos.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">Nenhum cargo encontrado.</td>
            </tr>
        `;
        return;
    }

    tabela.innerHTML = cargos.map(c => {
        let idBruto = undefined;
        
        if (c) {
            if (c.id_cargos !== undefined && c.id_cargos !== null) idBruto = c.id_cargos;
            else if (c.id !== undefined && c.id !== null) idBruto = c.id;
            else if (c._id !== undefined && c._id !== null) idBruto = c._id;
        }
        
        const cargoId = idBruto !== undefined ? idBruto.toString().trim() : "";

        if (!cargoId) {
            return `
                <tr class="table-warning">
                    <td><strong>${c.nome || "Sem Nome"}</strong></td>                    
                    <td><span class="badge bg-warning text-dark">Erro de ID</span></td>
                    <td class="text-end text-muted small">⚠️ ID ausente</td>
                </tr>
            `;
        }

        let situacaoTratada = "Ativo"; 
        if (c.ativo !== undefined && c.ativo !== null) {
            situacaoTratada = c.ativo;
        } else if (c.situacao !== undefined && c.situacao !== null) {
            situacaoTratada = c.situacao;
        }

        if (typeof situacaoTratada === 'boolean') {
            situacaoTratada = situacaoTratada ? "Ativo" : "Inativo";
        }

        if (typeof situacaoTratada === 'string' && situacaoTratada.length > 0) {
            situacaoTratada = situacaoTratada.charAt(0).toUpperCase() + situacaoTratada.slice(1).toLowerCase();
        }

        c.id = cargoId;
        c.situacao = situacaoTratada;

        const cargoEncoded = encodeURIComponent(JSON.stringify(c));
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        // CONSTRUÇÃO REATIVA DAS AÇÕES SEGUNDO AS PERMISSÕES DO BANCO
        let acoesHtml = '';
        if (!permissoesTelaCargos.alterar && !permissoesTelaCargos.excluir) {
            acoesHtml = `<span class="badge bg-secondary">Sem permissão</span>`;
        } else {
            if (permissoesTelaCargos.alterar) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-primary me-1 border-0"
                            onclick="prepararEdicaoSeguraCargo('${cargoEncoded}')" 
                            title="Editar cargo">
                        <i class="bi bi-pencil"></i>
                    </button>`;
            }
            if (permissoesTelaCargos.excluir) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="excluirCargos('${cargoId}')" 
                            title="Excluir cargo">
                        <i class="bi bi-trash"></i>
                    </button>`;
            }
        }

        return `
            <tr class="align-middle">                
                <td><strong>${c.nome || "Sem Nome"}</strong></td>                
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    ${acoesHtml}
                </td>
            </tr>
        `;
    }).join('');
}

function atualizarControlesPaginacaoCargos(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior-cargos');
    const btnProximo = document.getElementById('btn-proximo-cargos');
    const infoPaginacao = document.getElementById('info-paginacao-cargos');

    if (infoPaginacao) {
        infoPaginacao.innerText = `Página ${paginaAtualCargos} de ${totalPaginas}`;
    }

    if (btnAnterior) btnAnterior.disabled = (paginaAtualCargos === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtualCargos === totalPaginas);
}

// =========================================================================
// 2. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE)
// =========================================================================
document.getElementById('formCargos')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const campoId = document.getElementById('cargo-id');
    let id = campoId ? campoId.value.toString().trim() : "";
    if (!id || id === "" || id === "undefined" || id === "null") id = null;

    // VALIDAÇÃO DE SEGURANÇA NO FRONT
    if (!id && !permissoesTelaCargos.inserir) {
        alert("Seu perfil não possui permissão para inserir novos cargos.");
        return;
    }
    if (id && !permissoesTelaCargos.alterar) {
        alert("Seu perfil não possui permissão para alterar cargos existentes.");
        return;
    }
    
    const nomeInput = document.getElementById('cargos-nome')?.value || "";
    const selectSituacao = document.getElementById('cargos-situacao');
    const ativoBoolean = (selectSituacao ? selectSituacao.value : "true") === "true"; 

    const url = id ? `${API_URL}/cargos/${id}` : `${API_URL}/cargos/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        const payloadJSON = {
            nome: nomeInput,
            ativo: ativoBoolean
        };

        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(url, {
            method: metodo,
            headers: { 
                'Content-Type': 'application/json',
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            },
            body: JSON.stringify(payloadJSON)
        });
        
        if (res.ok) {
            e.target.reset();
            if (campoId) campoId.value = "";
            listarCargosCRUD();
            dispararNotificacao(metodo === 'POST' ? "Cargo criado com sucesso!" : "Cargo alterado com sucesso!", "atualizar");
        } else {
            const erroApi = await res.json().catch(() => ({}));
            alert(`Erro ao salvar cargo: ${erroApi.message || erroApi.detail || 'Erro interno'}`);
        }
    } catch (err) {
        console.error(err);
        alert("Erro de conexão ao salvar cargo.");
    }
});

// =========================================================================
// 3. FUNÇÕES DE AUXÍLIO PARA EDIÇÃO DE CARGOS
// =========================================================================
window.prepararEdicaoSeguraCargo = function(cargoEncoded) {
    try {
        const cargo = JSON.parse(decodeURIComponent(cargoEncoded));
        prepararEdicaoCargo(cargo);
    } catch (err) {
        console.error("Erro ao decodificar dados do cargo:", err);
    }
};

function prepararEdicaoCargo(c) {
    if (!permissoesTelaCargos.alterar) {
        alert("Seu perfil não tem permissão para alterar cargos.");
        return;
    }

    const campoId = document.getElementById('cargo-id');
    const campoNome = document.getElementById('cargos-nome');
    const campoSituacao = document.getElementById('cargos-situacao');
    
    const idLimpo = (c.id !== undefined ? c.id : (c._id || "")).toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = c.nome || "";
    
    if (campoSituacao) {
        const ehInativo = c.ativo === false || 
                          c.ativo === "false" || 
                          (c.situacao && String(c.situacao).toLowerCase() === "inativo");

        campoSituacao.value = ehInativo ? "false" : "true";
    }
    
    const tituloForm = document.getElementById('titulo-form-cargo');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-2"></i>Editar Cargo';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 4. OUVINTES DE EVENTOS DA PÁGINA
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tabela-cargos')) {
        inicializarTelaCargos();
    }

    document.getElementById('pesquisa-cargo')?.addEventListener('input', () => {
        paginaAtualCargos = 1; 
        filtrarEAtualizarTabelaCargos();
    });

    document.getElementById('btn-anterior-cargos')?.addEventListener('click', () => {
        if (paginaAtualCargos > 1) {
            paginaAtualCargos--;
            filtrarEAtualizarTabelaCargos();
        }
    });

    document.getElementById('btn-proximo-cargos')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(cargosFiltrados.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualCargos < totalPaginas) {
            paginaAtualCargos++;
            filtrarEAtualizarTabelaCargos();
        }
    });
});

// =========================================================================
// 5. EXCLUIR CARGOS
// =========================================================================
window.excluirCargos = async function(id) {
    if (!permissoesTelaCargos.excluir) {
        alert("Seu perfil não possui permissão para excluir cargos.");
        return;
    }

    if (!confirm("Tem certeza que deseja excluir este cargo?")) return;

    try {
        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(`${API_URL}/cargos/${id}`, {
            method: 'DELETE',
            cache: 'no-store',
            headers: {
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            }
        });

        if (res.ok) {
            if (typeof todosCargos !== 'undefined' && Array.isArray(todosCargos)) {
                todosCargos = todosCargos.filter(c => {
                    const idC = c.id_cargos ?? c.id ?? c._id;
                    return idC?.toString().trim() !== id.toString().trim();
                });
            }

            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Registro excluído com sucesso!", "deletar");
            } else {
                alert("Registro excluído com sucesso!");
            }

            if (typeof listarCargosCRUD === "function") {
                await listarCargosCRUD(); 
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            const mensagemErro = erroApi.message || erroApi.detail || 'Servidor recusou a ação';
            
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao(`Erro ao excluir: ${mensagemErro}`, "erro");
            } else {
                alert(`Erro ao excluir: ${mensagemErro}`);
            }
        }
    } catch (err) {
        console.error("Erro ao deletar cargo:", err);
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Erro de conexão ao excluir o cargo.", "erro");
        } else {
            alert("Erro de conexão ao excluir o cargo.");
        }
    }
};

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO E PERMISSÕES PARA MÁQUINAS
// =========================================================================
let todasMaquinas = [];       // Armazena a lista bruta vinda da API
let maquinasFiltrados = [];   // Armazena o resultado da busca por nome
let paginaAtualMaquinas = 1;  // Controle de página exclusivo para máquinas

// Objeto de controle de permissões exclusivo para a tela de Máquinas
let permissoesTelaMaquinas = { visualizar: false, inserir: false, alterar: false, excluir: false };

// =========================================================================
// 0. INICIALIZAÇÃO E CONSULTA DINÂMICA DE PERMISSÕES (TELA MÁQUINAS)
// =========================================================================
async function inicializarTelaMaquinas() {
    const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();
    console.log("Perfil ID identificado na tela de Máquinas:", perfilId);

    if (perfilId) {
        try {
            // ID padrão para a tela de Máquinas no seu banco de dados
            let idTelaMaquinas = 50; 

            try {
                const resTelas = await fetch(`${API_URL}/tela/`);
                if (resTelas && resTelas.ok) {
                    const listaTelas = await resTelas.json();
                    const telaEncontrada = listaTelas.find(t => 
                        t.nome && (t.nome.toLowerCase() === "maquinas" || t.nome.toLowerCase() === "máquinas")
                    );
                    if (telaEncontrada && telaEncontrada.id_telas) {
                        idTelaMaquinas = Number(telaEncontrada.id_telas);
                    }
                }
            } catch (eTelas) {
                console.warn("Usando id_telas padrão (50) para Máquinas.");
            }

            // Busca as permissões gravadas na API /permissoes/
            const resPerms = await fetch(`${API_URL}/permissoes/`).catch(() => fetch(`${API_URL}/permissoes`));
            
            if (resPerms && resPerms.ok) {
                const listaPermissoes = await resPerms.json();

                // Ordena por id_permissoes decrescente para pegar a alteração mais recente
                const listaOrdenada = Array.isArray(listaPermissoes) 
                    ? [...listaPermissoes].sort((a, b) => (b.id_permissoes || 0) - (a.id_permissoes || 0)) 
                    : [];

                // Filtro estrito para o perfil e a tela de Máquinas
                const permissaoEncontrada = listaOrdenada.find(p => 
                    Number(p.id_perfis) === Number(perfilId) && Number(p.id_telas) === Number(idTelaMaquinas)
                );

                if (permissaoEncontrada) {
                    permissoesTelaMaquinas = {
                        visualizar: Boolean(permissaoEncontrada.visualizar),
                        inserir: Boolean(permissaoEncontrada.inserir),
                        alterar: Boolean(permissaoEncontrada.alterar),
                        excluir: Boolean(permissaoEncontrada.excluir)
                    };
                    console.log(`Permissões da Tela Máquinas (Perfil ${perfilId}):`, permissoesTelaMaquinas);
                } else {
                    console.warn(`Nenhuma permissão específica para perfil ${perfilId} na tela de Máquinas.`);
                    permissoesTelaMaquinas = { visualizar: false, inserir: false, alterar: false, excluir: false };
                }
            }
        } catch (e) {
            console.error("Erro ao carregar permissões da tela de Máquinas:", e);
        }
    }

    // Aplica restrições visuais no formulário/botão salvar
    aplicarPermissoesVisuaisMaquinas();

    // Valida a exibição da listagem segundo o flag de visualização
    if (permissoesTelaMaquinas.visualizar) {
        listarMaquinasCRUD();
    } else {
        const tabela = document.getElementById('tabela-maquinas');
        if (tabela) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger py-4 font-semibold">
                        <i class="bi bi-lock-fill me-2"></i>Acesso Negado: Seu perfil não possui permissão para visualizar máquinas.
                    </td>
                </tr>
            `;
        }
        
        // Zera o contador visual do topo
        const totalBadge = document.getElementById('total-maquinas');
        if (totalBadge) totalBadge.innerText = "0";
    }
}

function aplicarPermissoesVisuaisMaquinas() {
    const formMaquinas = document.getElementById('formMaquinas');
    const btnSalvar = formMaquinas ? formMaquinas.querySelector('button[type="submit"]') : null;
    
    // Se não puder visualizar ou não puder inserir nem alterar, desabilita todos os inputs do formulário
    if (!permissoesTelaMaquinas.visualizar || (!permissoesTelaMaquinas.inserir && !permissoesTelaMaquinas.alterar)) {
        if (formMaquinas) {
            Array.from(formMaquinas.elements).forEach(element => {
                if (element.tagName !== 'BUTTON') {
                    element.disabled = true;
                }
            });
        }
    }

    // Ajuste visual do botão Salvar
    if (btnSalvar) {
        if (!permissoesTelaMaquinas.inserir && !permissoesTelaMaquinas.alterar) {
            btnSalvar.disabled = true;
            btnSalvar.innerText = "Sem permissão para salvar";
            btnSalvar.classList.replace('btn-primary', 'btn-secondary');
        } else {
            btnSalvar.disabled = false;
            btnSalvar.innerText = "Salvar";
            btnSalvar.classList.replace('btn-secondary', 'btn-primary');
        }
    }
}

// =========================================================================
// 1. LISTAR MÁQUINAS (READ com Filtro e Paginação)
// =========================================================================
async function listarMaquinasCRUD() {
    try {
        todasMaquinas = []; 
        const tabela = document.getElementById('tabela-maquinas');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando máquinas...</td></tr>`;
        }

        // 1. Obtém o ID do perfil ativo
        const perfilId = typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO !== null 
            ? PERFIL_USUARIO 
            : (typeof obterIdPerfilUsuario === 'function' ? obterIdPerfilUsuario() : localStorage.getItem("id_perfis"));

        // 2. Garante uma URL base absoluta válida (local ou produção)
        let baseUrl = (typeof API_URL !== 'undefined' && API_URL && API_URL.trim() !== "") 
            ? API_URL.trim().replace(/\/+$/, '') 
            : window.location.origin;

        // Se estiver rodando pelo arquivo estático ou sem protocolo, força a API da nuvem
        if (baseUrl.startsWith("file://") || !baseUrl.includes("http")) {
            baseUrl = "https://sistema.qcsoftware.com.br";
        }

        const headersPadrao = {
            'Content-Type': 'application/json',
            'x-perfil-id': perfilId ? String(perfilId) : ""
        };

        // 3. Executa a requisição (tenta /maquinas/ e, se der 404 por proxy rewrite, tenta /maquinas)
        let res = await fetch(`${baseUrl}/maquinas/`, {
            method: 'GET',
            cache: 'no-store',
            headers: headersPadrao
        });

        if (res.status === 404) {
            res = await fetch(`${baseUrl}/maquinas`, {
                method: 'GET',
                cache: 'no-store',
                headers: headersPadrao
            });
        }

        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todasMaquinas = await res.json();
        
        const totalBadge = document.getElementById('total-maquinas');
        if (totalBadge) totalBadge.innerText = todasMaquinas.length;

        filtrarEAtualizarTabelaMaquinas();

    } catch (e) { 
        console.error("Erro detalhado na requisição das Máquinas:", e); 
        const tabela = document.getElementById('tabela-maquinas');
        if (tabela) {
            tabela.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-danger py-4">
                        ⚠️ Erro ao carregar máquinas.<br>
                        <small class="text-muted">Motivo: ${e.message}</small>
                    </td>
                </tr>
            `;
        }
    }
}

function filtrarEAtualizarTabelaMaquinas() {
    const termoPesquisa = document.getElementById('pesquisa-maquina')?.value.toLowerCase() || "";
    
    maquinasFiltrados = todasMaquinas.filter(m =>
        m.nome && m.nome.toLowerCase().includes(termoPesquisa)
    );

    maquinasFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    const ultimoCadastro = todasMaquinas[todasMaquinas.length - 1];

    if (ultimoCadastro) {
        const idUltimo = ultimoCadastro.id_maquinas || ultimoCadastro.id_maquina || ultimoCadastro.id || ultimoCadastro._id || "";

        if (idUltimo) {
            maquinasFiltrados = maquinasFiltrados.filter(m => {
                const idM = m.id_maquinas || m.id_maquina || m.id || m._id || "";
                return idM.toString() !== idUltimo.toString();
            });

            maquinasFiltrados.unshift(ultimoCadastro);
        }
    }

    const totalPaginas = Math.ceil(maquinasFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    if (paginaAtualMaquinas > totalPaginas) {
        paginaAtualMaquinas = totalPaginas;
    }

    const indiceInicial = (paginaAtualMaquinas - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const maquinasExibidas = maquinasFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabelaMaquinas(maquinasExibidas);
    atualizarControlesPaginacaoMaquinas(totalPaginas);
}

function renderizarTabelaMaquinas(maquinas) {
    const tabela = document.getElementById('tabela-maquinas');
    if (!tabela) return;

    if (!maquinas || maquinas.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-muted">Nenhuma máquina encontrada.</td>
            </tr>
        `;
        return;
    }

    tabela.innerHTML = maquinas.map(m => {
        let idBruto = undefined;
        
        if (m) {
            if (m.id_maquinas !== undefined && m.id_maquinas !== null) idBruto = m.id_maquinas;
            else if (m.id_maquina !== undefined && m.id_maquina !== null) idBruto = m.id_maquina;
            else if (m.id !== undefined && m.id !== null) idBruto = m.id;
            else if (m._id !== undefined && m._id !== null) idBruto = m._id;
        }
        
        const maquinaId = idBruto !== undefined ? idBruto.toString().trim() : "";

        if (!maquinaId) {
            console.warn("Máquina sem ID detectada. Estrutura recebida do banco:", m);
            return `
                <tr class="table-warning align-middle">
                    <td><strong>${m.nome || "Sem Nome"}</strong></td>
                    <td><span class="badge bg-warning text-dark">Erro de ID</span></td>
                    <td class="text-end text-muted small">⚠️ ID ausente no banco</td>
                </tr>
            `;
        }

        let situacaoTratada = "Ativo"; 
        if (m.ativo !== undefined && m.ativo !== null) {
            situacaoTratada = m.ativo;
        } else if (m.situacao !== undefined && m.situacao !== null) {
            situacaoTratada = m.situacao;
        }

        if (typeof situacaoTratada === 'boolean') {
            situacaoTratada = situacaoTratada ? "Ativo" : "Inativo";
        }

        if (typeof situacaoTratada === 'string' && situacaoTratada.length > 0) {
            situacaoTratada = situacaoTratada.charAt(0).toUpperCase() + situacaoTratada.slice(1).toLowerCase();
        }

        m.id = maquinaId;
        m.situacao = situacaoTratada;

        const maquinaEncoded = encodeURIComponent(JSON.stringify(m));
        
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        // MONTAGEM DINÂMICA DOS BOTÕES BASEADA NAS PERMISSÕES DO BANCO
        let acoesHtml = '';
        if (!permissoesTelaMaquinas.alterar && !permissoesTelaMaquinas.excluir) {
            acoesHtml = `<span class="badge bg-secondary">Sem permissão</span>`;
        } else {
            if (permissoesTelaMaquinas.alterar) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-primary me-1 border-0" 
                            onclick="window.prepararEdicaoMaquina('${maquinaEncoded}')" 
                            title="Editar máquina">
                        <i class="bi bi-pencil"></i>
                    </button>`;
            }
            if (permissoesTelaMaquinas.excluir) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="window.excluirMaquina('${maquinaId}')" 
                            title="Excluir máquina">
                        <i class="bi bi-trash"></i>
                    </button>`;
            }
        }

        return `
            <tr class="align-middle">                
                <td><strong>${m.nome || "Sem Nome"}</strong></td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    ${acoesHtml}
                </td>
            </tr>
        `;
    }).join('');
}

function atualizarControlesPaginacaoMaquinas(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior-maquinas');
    const btnProximo = document.getElementById('btn-proximo-maquinas');
    const infoPaginacao = document.getElementById('info-paginacao-maquinas');

    if (infoPaginacao) {
        infoPaginacao.innerText = `Página ${paginaAtualMaquinas} de ${totalPaginas}`;
    }

    if (btnAnterior) btnAnterior.disabled = (paginaAtualMaquinas === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtualMaquinas === totalPaginas);
}

// =========================================================================
// 2. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE)
// =========================================================================
document.getElementById('formMaquinas')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const campoId = document.getElementById('maq-id');
    let id = campoId ? campoId.value.toString().trim() : "";
    
    if (!id || id === "" || id === "undefined" || id === "null" || id === "0") {
        id = null;
    }

    // VALIDAÇÕES DE SEGURANÇA NO FRONT-END
    if (!id && !permissoesTelaMaquinas.inserir) {
        alert("Seu perfil não possui permissão para inserir novas máquinas.");
        return;
    }
    if (id && !permissoesTelaMaquinas.alterar) {
        alert("Seu perfil não possui permissão para alterar máquinas existentes.");
        return;
    }
    
    const nomeInput = document.getElementById('maquinas-nome')?.value || "";
    const selectSituacao = document.getElementById('maquinas-situacao');
    const ativoBoolean = (selectSituacao ? selectSituacao.value : "true") === "true"; 

    const url = id ? `${API_URL}/maquinas/${id}` : `${API_URL}/maquinas/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        const payloadJSON = {
            nome: nomeInput,
            ativo: ativoBoolean
        };

        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(url, {
            method: metodo,
            headers: { 
                'Content-Type': 'application/json',
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            },
            body: JSON.stringify(payloadJSON)
        });
        
        if (res.ok) {
            if (campoId) campoId.value = "";
            e.target.reset();
            
            const tituloForm = document.getElementById('titulo-form-maq');
            if (tituloForm) {
                tituloForm.innerHTML = '<i class="sidebar-texto fas fa-industry me-3"></i> Nova Máquina';
            }

            if (typeof listarMaquinasCRUD === "function") {
                await listarMaquinasCRUD(); 
            }
            
            dispararNotificacao(metodo === 'POST' ? "Máquina criada com sucesso!" : "Máquina alterada com sucesso!", "atualizar");
        } else {
            const erroApi = await res.json().catch(() => ({}));
            alert(`Erro ao salvar máquina: ${erroApi.message || erroApi.detail || 'Erro interno do servidor'}`);
        }
    } catch (err) {
        console.error("Erro no processo de salvamento:", err);
        alert("Erro de conexão ao salvar máquina.");
    }
});

// =========================================================================
// 3. FUNÇÕES DE AUXÍLIO PARA EDIÇÃO DE MÁQUINAS
// =========================================================================
window.prepararEdicaoMaquina = function(maquinaEncoded) {
    try {
        const maquina = JSON.parse(decodeURIComponent(maquinaEncoded));
        carregarDadosNoFormMaquina(maquina);
    } catch (err) {
        console.error("Erro ao decodificar dados da máquina:", err);
    }
};

function carregarDadosNoFormMaquina(m) {
    if (!permissoesTelaMaquinas.alterar) {
        alert("Seu perfil não possui permissão para alterar máquinas.");
        return;
    }

    const campoId = document.getElementById('maq-id');
    const campoNome = document.getElementById('maquinas-nome');
    const campoSituacao = document.getElementById('maquinas-situacao');
    
    let idEncontrado = "";
    if (m.id_maquinas !== undefined && m.id_maquinas !== null) idEncontrado = m.id_maquinas;
    else if (m.id_maquina !== undefined && m.id_maquina !== null) idEncontrado = m.id_maquina;
    else if (m.id !== undefined && m.id !== null) idEncontrado = m.id;
    else if (m._id !== undefined && m._id !== null) idEncontrado = m._id;
    
    const idLimpo = idEncontrado.toString().trim();
    
    if (campoId) {
        campoId.value = idLimpo;
        campoId.setAttribute('value', idLimpo); 
    }
    
    if (campoNome) campoNome.value = m.nome || "";
    
    if (campoSituacao) {
        const ehInativo = m.ativo === false || 
                          m.ativo === "false" || 
                          (m.situacao && String(m.situacao).toLowerCase() === "inativo");

        campoSituacao.value = ehInativo ? "false" : "true";
    }
    
    const tituloForm = document.getElementById('titulo-form-maq');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-3"></i> Editar Máquina';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 4. OUVINTES DE EVENTOS DA PÁGINA
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tabela-maquinas')) {
        inicializarTelaMaquinas();
    }

    document.getElementById('pesquisa-maquina')?.addEventListener('input', () => {
        paginaAtualMaquinas = 1; 
        filtrarEAtualizarTabelaMaquinas();
    });

    document.getElementById('btn-anterior-maquinas')?.addEventListener('click', () => {
        if (paginaAtualMaquinas > 1) {
            paginaAtualMaquinas--;
            filtrarEAtualizarTabelaMaquinas();
        }
    });

    document.getElementById('btn-proximo-maquinas')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(maquinasFiltrados.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualMaquinas < totalPaginas) {
            paginaAtualMaquinas++;
            filtrarEAtualizarTabelaMaquinas();
        }
    });
});

// =========================================================================
// 5. EXCLUIR MÁQUINAS
// =========================================================================
window.excluirMaquina = async function(id) {
    if (!permissoesTelaMaquinas.excluir) {
        alert("Seu perfil não possui permissão para excluir máquinas.");
        return;
    }

    if (!confirm("Tem certeza que deseja excluir esta máquina?")) return;

    try {
        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(`${API_URL}/maquinas/${id}`, {
            method: 'DELETE',
            cache: 'no-store',
            headers: {
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            }
        });

        if (res.ok) {
            if (typeof todasMaquinas !== 'undefined' && Array.isArray(todasMaquinas)) {
                todasMaquinas = todasMaquinas.filter(m => {
                    const idM = m.id_maquinas ?? m.id ?? m._id;
                    return idM?.toString().trim() !== id.toString().trim();
                });
            }

            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Registro excluído com sucesso!", "deletar");
            } else {
                alert("Registro excluído com sucesso!");
            }

            if (typeof listarMaquinasCRUD === "function") {
                await listarMaquinasCRUD(); 
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            const mensagemErro = erroApi.message || erroApi.detail || 'Servidor recusou a ação';
            
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao(`Erro ao excluir: ${mensagemErro}`, "erro");
            } else {
                alert(`Erro ao excluir: ${mensagemErro}`);
            }
        }
    } catch (err) {
        console.error("Erro ao deletar máquina:", err);
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Erro de conexão ao excluir a máquina.", "erro");
        } else {
            alert("Erro de conexão ao excluir a máquina.");
        }
    }
};

//-- Colaboradores

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO E PERMISSÕES PARA COLABORADORES
// =========================================================================
let todosColaboradores = [];       // Armazena a lista bruta vinda da API
let colaboradoresFiltrados = [];   // Armazena o resultado da busca por nome
let paginaAtualColaboradores = 1;  // Controle de paginação exclusivo
let listaDeCargos = [];            // Declarada globalmente para evitar o erro "is not defined"

// Objeto de controle de permissões exclusivo para a tela de Colaboradores
let permissoesTelaColaboradores = { visualizar: false, inserir: false, alterar: false, excluir: false };

// =========================================================================
// 0. INICIALIZAÇÃO E CONSULTA DINÂMICA DE PERMISSÕES (TELA COLABORADORES)
// =========================================================================
async function inicializarTelaColaboradores() {
    const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();
    console.log("Perfil ID identificado na tela de Colaboradores:", perfilId);

    if (perfilId) {
        try {
            // ID padrão para a tela de Colaboradores no seu banco de dados
            let idTelaColaboradores = 53; 

            try {
                const resTelas = await fetch(`${API_URL}/tela/`);
                if (resTelas.ok) {
                    const listaTelas = await resTelas.json();
                    const telaEncontrada = listaTelas.find(t => t.nome && t.nome.toLowerCase() === "colaboradores");
                    if (telaEncontrada && telaEncontrada.id_telas) {
                        idTelaColaboradores = Number(telaEncontrada.id_telas);
                    }
                }
            } catch (eTelas) {
                console.warn("Usando id_telas padrão (53) para Colaboradores.");
            }

            // Busca as permissões gravadas na API /permissoes/
            const resPerms = await fetch("https://sistema.qcsoftware.com.br/permissoes/");
            
            if (resPerms.ok) {
                const listaPermissoes = await resPerms.json();

                // Ordena por id_permissoes decrescente para pegar a alteração mais recente
                const listaOrdenada = Array.isArray(listaPermissoes) 
                    ? [...listaPermissoes].sort((a, b) => (b.id_permissoes || 0) - (a.id_permissoes || 0)) 
                    : [];

                // Filtro estrito para o perfil e a tela de Colaboradores
                const permissaoEncontrada = listaOrdenada.find(p => 
                    Number(p.id_perfis) === Number(perfilId) && Number(p.id_telas) === Number(idTelaColaboradores)
                );

                if (permissaoEncontrada) {
                    permissoesTelaColaboradores = {
                        visualizar: Boolean(permissaoEncontrada.visualizar),
                        inserir: Boolean(permissaoEncontrada.inserir),
                        alterar: Boolean(permissaoEncontrada.alterar),
                        excluir: Boolean(permissaoEncontrada.excluir)
                    };
                    console.log(`Permissões da Tela Colaboradores (Perfil ${perfilId}):`, permissoesTelaColaboradores);
                } else {
                    console.warn(`Nenhuma permissão específica para perfil ${perfilId} na tela de Colaboradores.`);
                    permissoesTelaColaboradores = { visualizar: false, inserir: false, alterar: false, excluir: false };
                }
            }
        } catch (e) {
            console.error("Erro ao carregar permissões da tela de Colaboradores:", e);
        }
    }

    // Aplica restrições visuais no formulário/botão salvar
    aplicarPermissoesVisuaisColaboradores();

    // Carrega os select-box de cargos
    carregarCargosNoSelect();

    // Carrega a listagem apenas se o perfil puder visualizar
    if (permissoesTelaColaboradores.visualizar) {
        listarColaboradoresCRUD();
    } else {
        const tabela = document.getElementById('tabela-colaboradores');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4"><i class="bi bi-lock-fill"></i> Acesso Negado: Seu perfil não possui permissão para visualizar colaboradores.</td></tr>`;
        }
    }
}

function aplicarPermissoesVisuaisColaboradores() {
    const formColaboradores = document.getElementById('formColaboradores') || document.getElementById('form-colaboradores');
    const btnSalvar = formColaboradores ? formColaboradores.querySelector('button[type="submit"]') : null;
    
    if (btnSalvar) {
        if (!permissoesTelaColaboradores.inserir && !permissoesTelaColaboradores.alterar) {
            btnSalvar.disabled = true;
            btnSalvar.innerText = "Sem permissão para salvar";
            btnSalvar.classList.replace('btn-primary', 'btn-secondary');
            btnSalvar.classList.replace('btn-warning', 'btn-secondary');
        } else {
            btnSalvar.disabled = false;
        }
    }
}

// =========================================================================
// 1. CARREGAR OPÇÕES DO SELECT DE CARGOS (DINÂMICO)
// =========================================================================
async function carregarCargosNoSelect() {
    const inputBusca = document.getElementById('colaboradores-cargo-busca');
    const datalistCargos = document.getElementById('lista-cargos-datalist');
    const inputIdOculto = document.getElementById('colaboradores-cargo') || document.querySelector('input[id*="cargo"]:not([id*="situacao"])');

    if (!inputBusca || !datalistCargos || !inputIdOculto) return;

    try {
        const res = await fetch(`${API_URL}/cargos/`, { cache: 'no-store' });
        if (res.ok) {
            const cargos = await res.json();
            window.listaDeCargos = cargos;

            cargos.sort((a, b) => a.nome.localeCompare(b.nome));
            
            inputBusca.setAttribute('list', 'lista-cargos-datalist');

            datalistCargos.innerHTML = cargos.map(c => {
                const idCargo = c.id_cargos ?? c.id ?? c._id;
                return `<option value="${c.nome}" data-id="${idCargo}"></option>`;
            }).join('');

            window.atualizarInputVisualCargo = function(idAlvo) {
                const opcao = Array.from(datalistCargos.options).find(opt => opt.getAttribute('data-id')?.toString() === idAlvo?.toString());
                if (opcao) {
                    inputBusca.value = opcao.value;
                } else {
                    inputBusca.value = "";
                }
            };

            inputBusca.addEventListener('input', function() {
                const valorDigitado = this.value;
                const opcaoSelecionada = Array.from(datalistCargos.options).find(opt => opt.value === valorDigitado);

                if (opcaoSelecionada) {
                    inputIdOculto.value = opcaoSelecionada.getAttribute('data-id');
                } else {
                    inputIdOculto.value = "";
                }
            });
        }
    } catch (e) {
        console.error("Erro ao carregar e ordenar cargos para o formulário:", e);
    }
}

// =========================================================================
// 2. LISTAR COLABORADORES (READ com Filtro e Paginação)
// =========================================================================
async function listarColaboradoresCRUD() {
    try {
        todosColaboradores = [];
        if (typeof colaboradoresFiltrados !== 'undefined') colaboradoresFiltrados = [];

        const tabela = document.getElementById('tabela-colaboradores');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="7" class="text-center py-4">Carregando colaboradores...</td></tr>`;
        }

        try {
            const resCargos = await fetch(`${API_URL}/cargos/`, {
                method: 'GET',
                cache: 'no-store'
            });
            if (resCargos.ok) {
                window.listaDeCargos = await resCargos.json();
            }
        } catch (erroCargos) {
            console.warn("Aviso: Falha ao atualizar lista de cargos para mapeamento:", erroCargos);
        }

        const perfilId = typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO !== null 
          ? PERFIL_USUARIO 
          : obterIdPerfilUsuario();

      const res = await fetch(`${API_URL}/colaboradores/`, {
          method: 'GET',
          cache: 'no-store',
          headers: {
              'Content-Type': 'application/json',
              'x-perfil-id': perfilId ? perfilId.toString() : ""
          }
      });

      if (!res.ok) throw new Error(`Erro no servidor: Status ${res.status}`);

        todosColaboradores = await res.json();
        
        const totalBadge = document.getElementById('total-colaboradores');
        if (totalBadge) totalBadge.innerText = todosColaboradores.length;

        filtrarEAtualizarTabelaColaboradores();
    } catch (e) { 
        console.error("Erro detalhado na requisição dos Colaboradores:", e); 
        const tabela = document.getElementById('tabela-colaboradores');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">⚠️ Erro ao carregar colaboradores.<br><small class="text-muted">Motivo: ${e.message}</small></td></tr>`;
        }
        
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Não foi possível carregar a lista de colaboradores.", "erro");
        }
    }
}

function filtrarEAtualizarTabelaColaboradores() {
    const termoPesquisa = document.getElementById('pesquisa-colaborador')?.value.toLowerCase() || "";
    
    colaboradoresFiltrados = todosColaboradores.filter(c =>
        c.nome && c.nome.toLowerCase().includes(termoPesquisa)
    );

    colaboradoresFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    const ultimoCadastro = todosColaboradores[todosColaboradores.length - 1];

    if (ultimoCadastro) {
        colaboradoresFiltrados = colaboradoresFiltrados.filter(
            c => c.id_colaboradores !== ultimoCadastro.id_colaboradores
        );
        colaboradoresFiltrados.unshift(ultimoCadastro);
    }

    const totalPaginas = Math.ceil(colaboradoresFiltrados.length / ITENS_POR_PAGINA) || 1;
    if (paginaAtualColaboradores > totalPaginas) paginaAtualColaboradores = totalPaginas;

    const indiceInicial = (paginaAtualColaboradores - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const colaboradoresExibidos = colaboradoresFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabelaColaboradores(colaboradoresExibidos);
    
    if (typeof atualizarControlesPaginacaoColaboradores === "function") {
        atualizarControlesPaginacaoColaboradores(totalPaginas);
    }
}

function renderizarTabelaColaboradores(colaboradores) {
    const tabela = document.getElementById('tabela-colaboradores');
    if (!tabela) return;

    if (!colaboradores || colaboradores.length === 0) {
        tabela.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Nenhum colaborador encontrado.</td></tr>`;
        return;
    }

    tabela.innerHTML = colaboradores.map(c => {
        const idRegistroAtual = c.id_colaboradores ?? c.id ?? c._id;
        const colaboradorId = idRegistroAtual !== undefined ? idRegistroAtual.toString().trim() : "";

        if (!colaboradorId) {
            return `<tr class="table-warning"><td colspan="7" class="text-center">⚠️ Registro sem ID</td></tr>`;
        }

        const registroEstaAtivo = c.ativo === true || c.ativo === "true" || 
                                  (c.ativo === undefined && (c.situacao === "Ativo" || String(c.situacao).toLowerCase() === "ativo"));
        let situacaoTratada = registroEstaAtivo ? "Ativo" : "Inativo";

        c.situacaoTratada = situacaoTratada;
        c.idUnificado = colaboradorId;   
        c.ativo = registroEstaAtivo;     

        let nomeCargoExibicao = "-";
        let idCargoLimpo = ""; 

        const cargoBruto = c.cargo ?? c.cargos ?? c.id_cargo ?? c.id_cargos;

        if (cargoBruto) {
            if (typeof cargoBruto === 'object') {
                nomeCargoExibicao = cargoBruto.nome || "-";
                idCargoLimpo = cargoBruto.id_cargos ?? cargoBruto.id ?? cargoBruto._id ?? "";
            } else {
                idCargoLimpo = String(cargoBruto).replace(/[^\d]/g, '') || String(cargoBruto).trim();
                const listaGlobal = window.listaDeCargos || [];
                
                const cargoEncontrado = listaGlobal.find(cargo => {
                    const idC = cargo.id_cargos ?? cargo.id ?? cargo._id;
                    return String(idC).trim() === String(idCargoLimpo).trim();
                });

                if (cargoEncontrado) {
                    nomeCargoExibicao = cargoEncontrado.nome;
                } else {
                    nomeCargoExibicao = isNaN(cargoBruto) ? cargoBruto : `Cargo ${cargoBruto}`;
                }
            }
        }

        c.id_cargo_tratado = idCargoLimpo;
        c.nome_cargo_tratado = nomeCargoExibicao;

        const badgeClasse = situacaoTratada === 'Ativo' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary';

        // CONSTRUÇÃO DINÂMICA DAS AÇÕES BASEADA NAS PERMISSÕES DO BANCO
        let acoesHtml = '';
        if (!permissoesTelaColaboradores.alterar && !permissoesTelaColaboradores.excluir) {
            acoesHtml = `<span class="badge bg-secondary">Sem permissão</span>`;
        } else {
            if (permissoesTelaColaboradores.alterar) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-primary me-1 border-0"                     
                            onclick="window.prepararEdicaoPorId('${colaboradorId}')" 
                            title="Editar colaborador">
                        <i class="bi bi-pencil"></i>
                    </button>`;
            }
            if (permissoesTelaColaboradores.excluir) {
                acoesHtml += `
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="deletarItemGeral('colaboradores', '${colaboradorId}')" 
                            title="Excluir colaborador">
                        <i class="bi bi-trash"></i>
                    </button>`;
            }
        }

        return `
            <tr class="align-middle">                
                <td><strong>${c.nome || "Sem Nome"}</strong></td>
                <td>${c.matricula || "-"}</td>
                <td>${nomeCargoExibicao}</td>
                <td>${c.setor || "Não Informado"}</td>
                <td>${c.email || "-"}</td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    ${acoesHtml}
                </td>
            </tr>
        `;
    }).join('');
}

function atualizarControlesPaginacaoColaboradores(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior-colaboradores');
    const btnProximo = document.getElementById('btn-proximo-colaboradores');
    const infoPaginacao = document.getElementById('info-paginacao-colaboradores');

    if (infoPaginacao) infoPaginacao.innerText = `Página ${paginaAtualColaboradores} de ${totalPaginas}`;
    if (btnAnterior) btnAnterior.disabled = (paginaAtualColaboradores === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtualColaboradores === totalPaginas);
}

// =========================================================================
// 3. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE)
// =========================================================================
document.getElementById('formColaboradores')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const campoId = document.getElementById('colab-id');
    const id = campoId ? campoId.value.trim() : "";

    // VALIDAÇÕES DE SEGURANÇA NO FRONT-END
    if (!id && !permissoesTelaColaboradores.inserir) {
        alert("Seu perfil não possui permissão para inserir novos colaboradores.");
        return;
    }
    if (id && !permissoesTelaColaboradores.alterar) {
        alert("Seu perfil não possui permissão para alterar colaboradores existentes.");
        return;
    }
    
    let url = id ? `${API_URL}/colaboradores/${id}` : `${API_URL}/colaboradores/`;
    let metodo = id ? 'PUT' : 'POST';

    try {
        const selectCargo = document.getElementById('colaboradores-cargo') || document.querySelector('select[id*="cargo"]');
        const valorCargo = selectCargo ? selectCargo.value : "";
        const idCargoInt = parseInt(valorCargo, 10);

        if (isNaN(idCargoInt)) {
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Selecione um cargo válido para o colaborador.", "erro");
            } else {
                alert("Erro: Não foi possível identificar o código do cargo selecionado.");
            }
            return; 
        }

        const selectSituacao = document.getElementById('colaboradores-situacao');
        const valorSituacaoTela = selectSituacao ? selectSituacao.value.toString().trim() : "true";
        const ehAtivoBoolean = (valorSituacaoTela === "true");

        const setorInput = document.getElementById('colaboradores-setor')?.value || "Não Informado";

        const payloadJSON = {
            nome: document.getElementById('colaboradores-nome')?.value || "",
            matricula: parseInt(document.getElementById('colaboradores-matricula')?.value, 10) || 0,
            id_cargos: idCargoInt, 
            email: document.getElementById('colaboradores-email')?.value || "",
            ativo: ehAtivoBoolean,
            setor: setorInput
        };

        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(url, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            },
            body: JSON.stringify(payloadJSON)
        });
        
        if (res.ok) { 
            const ehCriacao = metodo === 'POST' || !id; 

            if (typeof dispararNotificacao === "function") {
                const acao = ehCriacao ? 'criar' : 'atualizar';
                const mensagem = ehCriacao ? "Novo colaborador cadastrado com sucesso!" : "Cadastro de colaborador alterado!";
                dispararNotificacao(mensagem, acao);
            } else {
                const mensagemAlert = ehCriacao ? "Colaborador cadastrado com sucesso!" : "Cadastro atualizado com sucesso!";
                alert(mensagemAlert);
            }
            
            const formulario = document.getElementById('formColaboradores') || document.getElementById('form-colaboradores');
            if (formulario) formulario.reset();
            
            if (selectSituacao) selectSituacao.value = "true";
            if (campoId) campoId.value = ""; 
            
            const tituloForm = document.getElementById('titulo-form-colab');
            if (tituloForm) {
                tituloForm.innerHTML = '<i class="bi bi-person-plus text-primary me-2"></i>Novo Colaborador';
            }
            
            const btnSalvar = formulario ? formulario.querySelector('button[type="submit"]') : null;
            if (btnSalvar) {
                btnSalvar.innerHTML = '<i class="fas fa-plus me-2"></i> Cadastrar Colaborador';
                btnSalvar.classList.remove('btn-warning');
                btnSalvar.classList.add('btn-primary');
            }

            if (typeof listarColaboradoresCRUD === "function") {
                listarColaboradoresCRUD();
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao(`Não foi possível salvar os dados do colaborador. Erro ${res.status}`, "erro");
            } else {
                alert(`Erro ao salvar colaborador. Status do servidor: ${res.status}`);
            }
        }
    } catch (err) { 
        console.error("Erro no envio:", err);
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Erro de conexão ao tentar salvar o colaborador.", "erro");
        } else {
            alert("Erro de conexão ao tentar salvar o colaborador.");
        }
    }
});

// =========================================================================
// 4. FUNÇÕES DE AUXÍLIO PARA EDIÇÃO (UPDATE)
// =========================================================================
window.prepararEdicaoPorId = function(id) {
    if (!permissoesTelaColaboradores.alterar) {
        alert("Seu perfil não possui permissão para alterar colaboradores.");
        return;
    }

    const c = todosColaboradores.find(colab => {
        const idColab = colab.id_colaboradores ?? colab.id ?? colab._id;
        return idColab?.toString().trim() === id.toString().trim();
    });
    
    if (!c) {
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Erro ao carregar dados do colaborador para edição.", "erro");
        }
        return;
    }

    const campoId = document.getElementById('colab-id');
    const campoNome = document.getElementById('colaboradores-nome');
    const campoMatricula = document.getElementById('colaboradores-matricula');
    const campoCargo = document.getElementById('colaboradores-cargo');
    const campoEmail = document.getElementById('colaboradores-email');
    const campoSituacao = document.getElementById('colaboradores-situacao');
    const campoSetor = document.getElementById('colaboradores-setor');
    
    const idLimpo = (c.id_colaboradores ?? c.id ?? c._id ?? "").toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = c.nome || "";
    if (campoMatricula) campoMatricula.value = c.matricula || "";
    if (campoEmail) campoEmail.value = c.email || "";

    if (campoCargo) {
        campoCargo.value = c.id_cargos ?? c.id_cargo ?? "";
    }

    if (campoSetor) {
        const setorBanco = c.setor ?? c.setor_tratado ?? c.area_setor ?? "Não Informado";
        campoSetor.value = setorBanco; 
    }

    const btnSalvar = document.querySelector('#form-colaboradores button[type="submit"]') || document.querySelector('#formColaboradores button[type="submit"]');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-save me-2"></i> Salvar Alterações';
        btnSalvar.classList.remove('btn-primary');
        btnSalvar.classList.add('btn-warning');
    }

    const formulario = document.getElementById('form-colaboradores') || document.getElementById('formColaboradores');
    if (formulario) {
        formulario.scrollIntoView({ behavior: 'smooth' });
    }

    if (campoCargo) {
        const idCargoParaInserir = c.id_cargo_tratado || c.id_cargos || c.id_cargo || "";
        campoCargo.value = idCargoParaInserir;
        
        if (typeof window.atualizarInputVisualCargo === 'function') {
            window.atualizarInputVisualCargo(idCargoParaInserir);
        } else {
            const inputBusca = document.getElementById('colaboradores-cargo-busca');
            if (inputBusca && c.nome_cargo_tratado) {
                inputBusca.value = c.nome_cargo_tratado;
            }
        }
    }

    if (campoSituacao) {
        const statusAtivo = c.ativo === true || 
                            c.ativo === "true" || 
                            c.ativo === 1 ||
                            c.situacao === "Ativo" || 
                            String(c.situacao).toLowerCase() === "ativo" ||
                            (c.ativo === undefined && c.situacao === undefined);

        const valorParaOSelect = statusAtivo ? "true" : "false";
        
        setTimeout(() => {
            campoSituacao.value = valorParaOSelect;
            campoSituacao.dispatchEvent(new Event('change', { bubbles: true }));
        }, 50);
    }

    const tituloForm = document.getElementById('titulo-form-colab');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-2"></i>Editar Colaborador';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// =========================================================================
// 5. OUVINTES DE EVENTOS DA PÁGINA (DENTRO DO DOMCONTENTLOADED)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tabela-colaboradores')) {
        inicializarTelaColaboradores();
    }

    document.getElementById('pesquisa-colaborador')?.addEventListener('input', () => {
        paginaAtualColaboradores = 1; 
        filtrarEAtualizarTabelaColaboradores();
    });

    document.getElementById('btn-anterior-colaboradores')?.addEventListener('click', () => {
        if (paginaAtualColaboradores > 1) {
            paginaAtualColaboradores--;
            filtrarEAtualizarTabelaColaboradores();
        }
    });

    document.getElementById('btn-proximo-colaboradores')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(colaboradoresFiltrados.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualColaboradores < totalPaginas) {
            paginaAtualColaboradores++;
            filtrarEAtualizarTabelaColaboradores();
        }
    });
});

// =========================================================================
// 6. EXCLUIR COLABORADORES
// =========================================================================
window.deletarItemGeral = async function(endpoint, id) {
    if (!permissoesTelaColaboradores.excluir) {
        alert("Seu perfil não possui permissão para excluir colaboradores.");
        return;
    }

    if (!confirm("Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.")) {
        return;
    }

    try {
        const perfilId = typeof PERFIL_USUARIO !== 'undefined' ? PERFIL_USUARIO : obterIdPerfilUsuario();

        const res = await fetch(`${API_URL}/${endpoint}/${id}`, {
            method: 'DELETE',
            headers: {
                'x-perfil-id': perfilId ? perfilId.toString() : ""
            }
        });

        if (res.ok) {
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Registro excluído com sucesso!", "excluir");
            } else {
                alert("Registro excluído com sucesso!");
            }
            
            if (endpoint === 'colaboradores') {
                listarColaboradoresCRUD();
            }
        } else {
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao(`Não foi possível excluir o registro. Status: ${res.status}`, "erro");
            } else {
                alert(`Erro ao excluir. O servidor retornou: ${res.status}`);
            }
        }
    } catch (err) {
        console.error("Erro de conexão ao excluir:", err);
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Erro de conexão ao tentar excluir o registro.", "erro");
        } else {
            alert("Erro de conexão ao tentar excluir o registro.");
        }
    }
};

// =========================================================================
// 6. OUVINTES DE EVENTOS DA PÁGINA (DOM)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    listarColaboradoresCRUD();
    carregarCargosNoSelect();

    document.getElementById('pesquisa-colaborador')?.addEventListener('input', () => {
        paginaAtualColaboradores = 1; 
        filtrarEAtualizarTabelaColaboradores();
    });

    document.getElementById('btn-anterior-colaboradores')?.addEventListener('click', () => {
        if (paginaAtualColaboradores > 1) {
            paginaAtualColaboradores--;
            filtrarEAtualizarTabelaColaboradores();
        }
    });

    document.getElementById('btn-proximo-colaboradores')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(colaboradoresFiltrados.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualColaboradores < totalPaginas) {
            paginaAtualColaboradores++;
            filtrarEAtualizarTabelaColaboradores();
        }
    });
});
    
    // -- DEFINIR DATA E HORA DE BRASÍLIA --
     (function() {
        function atualizarRelogio() {
            const agora = new Date();
            
            // Força o fuso horário de Brasília de forma nativa no navegador
            const opcoesData = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' };
            const opcoesHora = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false };
            
            const dataStr = agora.toLocaleDateString('pt-BR', opcoesData);
            const horaStr = agora.toLocaleTimeString('pt-BR', opcoesHora);
            
            // Captura os elementos do HTML
            const elData = document.getElementById('data-brasilia');
            const elHora = document.getElementById('hora-brasilia');
            
            // Aplica os valores se eles existirem na tela
            if (elData) elData.textContent = dataStr;
            if (elHora) elHora.textContent = horaStr;
        }

        // Executa imediatamente assim que o HTML chega nesse ponto
        atualizarRelogio();
        
        // Mantém atualizando a cada 10 segundos
        setInterval(atualizarRelogio, 10000);
    })();