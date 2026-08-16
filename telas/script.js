const API_URL = "https://sistema.qcsoftware.com.br";

// VARIÁVEIS DE CONTROLE DE ESTADO (PESQUISA E PAGINAÇÃO)
let todosProdutos = [];      // Armazena a lista bruta vinda da API
let produtosFiltrados = [];  // Armazena o resultado da busca por nome
let paginaAtual = 1;
const ITENS_POR_PAGINA = 10;

// -- Produtos
// =========================================================================
// 1. LISTAR PRODUTOS (READ com Filtro e Paginação)
// =========================================================================
async function listarProdutosCRUD() {
    try {
        // 1. LIMPEZA PREVENTIVA: Esvazia o array e põe um feedback de carregando
        todosProdutos = []; 
        const tabela = document.getElementById('tabela-produtos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando produtos...</td></tr>`;
        }

        // 2. FETCH CORRIGIDO: Passando o objeto de opções com o no-store
        const res = await fetch(`${API_URL}/produtos/`, {
            method: 'GET',
            cache: 'no-store' // <--- Garante que o Render/Navegador traga direto do banco
        });
            
        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todosProdutos = await res.json();
        
        const totalBadge = document.getElementById('total-produtos');
        if (totalBadge) totalBadge.innerText = todosProdutos.length;

        // Processa o filtro inicial e pagina os resultados
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

// FUNÇÃO INTERNA: Filtra os produtos por nome e calcula as páginas disponíveis
function filtrarEAtualizarTabela() {
    const termoPesquisa = document.getElementById('pesquisa-produto')?.value.toLowerCase() || "";
    
    // Filtra pelo nome do produto digitado
produtosFiltrados = todosProdutos.filter(p =>
    p.nome && p.nome.toLowerCase().includes(termoPesquisa)
);

// ===============================
// ORDENAÇÃO ALFABÉTICA
// ===============================
produtosFiltrados.sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
);

// ===============================
// ÚLTIMO CADASTRADO NO TOPO
// ===============================

// Pega o último item cadastrado da API
const ultimoCadastro = todosProdutos[todosProdutos.length - 1];

if (ultimoCadastro) {

    // Remove ele da posição atual
    produtosFiltrados = produtosFiltrados.filter(
        p => p.id_produtos !== ultimoCadastro.id_produtos
    );

    // Adiciona no topo
    produtosFiltrados.unshift(ultimoCadastro);
}

    const totalPaginas = Math.ceil(produtosFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    // Evita que a página atual fique em um limbo vazio se a filtragem reduzir drasticamente os itens
    if (paginaAtual > totalPaginas) {
        paginaAtual = totalPaginas;
    }

    // Calcula os cortes exatos para exibir o limite de 10 por página
    const indiceInicial = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const produtosExibidos = produtosFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabela(produtosExibidos);
    atualizarControlesPaginacao(totalPaginas);
}

// FUNÇÃO INTERNA: Renderiza as linhas visíveis na tabela (CORRIGIDO PARA id_produtos)
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
            // CORREÇÃO EXATA: Captura o ID baseado na estrutura real do seu banco (id_produtos)
            let idBruto = undefined;
            
            if (p) {
                if (p.id_produtos !== undefined && p.id_produtos !== null) idBruto = p.id_produtos;
                else if (p.id !== undefined && p.id !== null) idBruto = p.id;
                else if (p._id !== undefined && p._id !== null) idBruto = p._id;
            }
            
            // Converte o ID encontrado (ex: 11) em uma String limpa
            const produtoId = idBruto !== undefined ? idBruto.toString().trim() : "";

            // Se mesmo assim não encontrar nada, exibe o aviso
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

        // Mapeamento automático da Situação/Ativo (Sua API usa 'ativo: true')
        let situacaoTratada = "Ativo"; 
        if (p.ativo !== undefined && p.ativo !== null) {
            situacaoTratada = p.ativo;
        } else if (p.situacao !== undefined && p.situacao !== null) {
            situacaoTratada = p.situacao;
        }

        // Se o ativo for boolean (true/false), converte para texto amigável
        if (typeof situacaoTratada === 'boolean') {
            situacaoTratada = situacaoTratada ? "Ativo" : "Inativo";
        }

        if (typeof situacaoTratada === 'string' && situacaoTratada.length > 0) {
            situacaoTratada = situacaoTratada.charAt(0).toUpperCase() + situacaoTratada.slice(1).toLowerCase();
        }

        // IMPORTANTE: Unifica a propriedade para o resto do script entender como 'id' e 'situacao'
        p.id = produtoId;
        p.situacao = situacaoTratada;

        const produtoEncoded = encodeURIComponent(JSON.stringify(p));
        
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        return `
            <tr class="align-middle">                
                <td><strong>${p.nome || "Sem Nome"}</strong></td>
                <td>${p.categoria || "Sem Categoria"}</td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                
        <button class="btn btn-sm btn-outline-primary me-1 border-0" 
                onclick="prepararEdicaoSegura('${produtoEncoded}')" 
                title="Editar produto">
            <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger border-0" 
                onclick="deletarItemGeral('produtos', '${produtoId}', listarProdutosCRUD)" 
                title="Excluir produto">
            <i class="bi bi-trash"></i>
        </button>
                </td>
            </tr>
        `;
    }).join('');
}

// FUNÇÃO INTERNA: Bloqueia ou libera os botões de controle de paginação
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
    
    // CORREÇÃO DA EDIÇÃO: Tratamento estrito do ID fantasma. Se for nulo ou texto vazio vira POST
    if (!id || id === "" || id === "undefined" || id === "null") {
        id = null;
    }
    
    const nomeInput = document.getElementById('produtos-nome')?.value || "";
    const categoriaInput = document.getElementById('produtos-categoria')?.value || "";
    
    // CORREÇÃO AQUI: Apenas capturamos o valor selecionado na tela ("true" ou "false")
    const selectSituacao = document.getElementById('produtos-situacao');
    const valorSelect = selectSituacao ? selectSituacao.value : "true";
    
    // Transforma a string do HTML em um Booleano real para o banco de dados
    const ativoBoolean = valorSelect === "true"; 

    // DEFINIÇÃO DA ROTA E MÉTODO HTTP (Se id existe de verdade faz PUT, senão faz POST)
    const url = id ? `${API_URL}/produtos/${id}` : `${API_URL}/produtos/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        let options = {};
        const fileInput = document.getElementById('foto-arquivo');

        // Estratégia multipart/form-data ou JSON puro baseado em anexos
        if (fileInput && fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('nome', nomeInput);
            formData.append('categoria', categoriaInput);
            
            // Enviando com a chave 'ativo' que o backend espera.
            formData.append('ativo', ativoBoolean); 
            formData.append('file', fileInput.files[0]);

            options = {
                method: metodo,
                body: formData
            };
        } else {
            // No JSON puro, enviamos o booleano real sem aspas
            const payloadJSON = {
                nome: nomeInput,
                categoria: categoriaInput,
                ativo: ativoBoolean // Chave 'ativo' idêntica à coluna do banco de dados
            };

            options = {
                method: metodo,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadJSON)
            };
        }

        const res = await fetch(url, options);
        
        if (res.ok) {
            e.target.reset(); 
            if (campoId) campoId.value = ""; // Limpa completamente o id oculto
            
            const tituloForm = document.getElementById('titulo-form-prod');
            if (tituloForm) {
                tituloForm.innerHTML = '<i class="bi bi-box-seam text-primary me-2"></i>Novo Produto';
            }
            
            // DISPARO DA NOTIFICAÇÃO DE SUCESSO (Canto inferior direito)
            if (metodo === 'POST') {
                dispararNotificacao("Novo cadastro criado com sucesso!", "criar");
            } else {
                dispararNotificacao("Cadastro alterado com sucesso!", "atualizar");
            }
            
            listarProdutosCRUD();
        } else {
            const erroApi = await res.json().catch(() => ({}));
            console.error("Detalhes do erro do servidor:", erroApi);
            alert(`Erro ao salvar produto. Status: ${res.status}\nMotivo: ${erroApi.detail || erroApi.message || 'Erro interno no backend'}`);
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
    // CORREÇÃO DA EXCLUSÃO: Validação estrita do parâmetro recebido
    if (!id || id === undefined || id === null || id.toString().trim() === "" || id.toString() === "undefined" || id.toString() === "null") {
        alert("Não é possível deletar este item: ID inválido ou ausente.");
        return;
    }

    if (!confirm("Tem certeza que deseja excluir permanentemente este item?")) {
        return; 
    }

    try {
        const res = await fetch(`${API_URL}/${endpoint}/${id.toString().trim()}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            // DISPARO DA NOTIFICAÇÃO DE EXCLUSÃO (Canto inferior direito)
            dispararNotificacao("Cadastro excluído com sucesso!", "excluir");
            
            callbackSucesso();
        } else {
            alert(`Não foi possível deletar o item. Código do servidor: ${res.status}`);
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
    
    // Força a extração do ID correto convertido em string limpa
    const idLimpo = (p.id !== undefined ? p.id : (p._id || "")).toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = p.nome || "";
    if (campoCategoria) campoCategoria.value = p.categoria || "";
    
    // CORREÇÃO AQUI: Garante o preenchimento correto do select de Situação (Ativo/Inativo)
    if (campoSituacao) {
        // Verifica todas as possibilidades do que pode vir do banco/objeto (Boolean ou String)
        const ehInativo = p.ativo === false || 
                          p.ativo === "false" || 
                          (p.situacao && String(p.situacao).toLowerCase() === "inativo");

        // Define "false" para Inativo e "true" para Ativo (casando com o value das <option>)
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

// - Cargos

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO PARA CARGOS
// =========================================================================
let todosCargos = [];       // Armazena a lista bruta vinda da API
let cargosFiltrados = [];   // Armazena o resultado da busca por nome
let paginaAtualCargos = 1;  // Variável de página separada para não chocar com produtos

// =========================================================================
// 1. LISTAR CARGOS (READ com Filtro e Paginação)
// =========================================================================
async function listarCargosCRUD() {
    try {
        // 1. LIMPEZA PREVENTIVA: Reseta as variáveis e limpa a tabela para não exibir dados antigos
        todosCargos = []; 
        const tabela = document.getElementById('tabela-cargos');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando cargos...</td></tr>`;
        }

        // 2. FETCH CORRIGIDO: O cache 'no-store' deve ir dentro do objeto de opções
        const res = await fetch(`${API_URL}/cargos/`, {
            method: 'GET',
            cache: 'no-store' // <--- Agora sim o navegador ignora o cache e busca direto do servidor
        });
        
        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todosCargos = await res.json();
        
        const totalBadge = document.getElementById('total-cargos');
        if (totalBadge) totalBadge.innerText = todosCargos.length;

        // Processa o filtro inicial e pagina os resultados
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

// FUNÇÃO INTERNA: Filtra os cargos por nome e calcula as páginas disponíveis
function filtrarEAtualizarTabelaCargos() {
    const termoPesquisa = document.getElementById('pesquisa-cargo')?.value.toLowerCase() || "";
    
    // Filtra pelo nome do cargo digitado
cargosFiltrados = todosCargos.filter(c =>
    c.nome && c.nome.toLowerCase().includes(termoPesquisa)
);

// ===============================
// ORDENAÇÃO ALFABÉTICA
// ===============================
cargosFiltrados.sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
);

// ===============================
// ÚLTIMO CADASTRADO NO TOPO
// ===============================

// Pega o último item cadastrado da API
const ultimoCadastro = todosCargos[todosCargos.length - 1];

if (ultimoCadastro) {

    // Remove ele da posição atual
    cargosFiltrados = cargosFiltrados.filter(
        c => c.id_cargos !== ultimoCadastro.id_cargos
    );

    // Adiciona no topo
    cargosFiltrados.unshift(ultimoCadastro);
}

    const totalPaginas = Math.ceil(cargosFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    if (paginaAtualCargos > totalPaginas) {
        paginaAtualCargos = totalPaginas;
    }

    // Calcula os cortes exatos para exibir o limite de 10 por página
    const indiceInicial = (paginaAtualCargos - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const cargosExibidos = cargosFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabelaCargos(cargosExibidos);
    atualizarControlesPaginacaoCargos(totalPaginas);
}

// FUNÇÃO INTERNA: Renderiza as linhas visíveis na tabela de cargos
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
        // Captura o ID baseado na estrutura real do seu banco (id_cargos, id, _id)
        let idBruto = undefined;
        
        if (c) {
            if (c.id_cargos !== undefined && c.id_cargos !== null) idBruto = c.id_cargos;
            else if (c.id !== undefined && c.id !== null) idBruto = c.id;
            else if (c._id !== undefined && c._id !== null) idBruto = c._id;
        }
        
        const cargoId = idBruto !== undefined ? idBruto.toString().trim() : "";

        if (!cargoId) {
            console.warn("Cargo sem ID detectado. Estrutura recebida do banco:", c);
            return `
                <tr class="table-warning">
                    <td><strong>${c.nome || "Sem Nome"}</strong></td>                    
                    <td><span class="badge bg-warning text-dark">Erro de ID</span></td>
                    <td class="text-end text-muted small">⚠️ ID ausente</td>
                </tr>
            `;
        }

        // Mapeamento automático da Situação/Ativo
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

        // Unifica a propriedade para o resto do script entender como 'id' e 'situacao'
        c.id = cargoId;
        c.situacao = situacaoTratada;

        const cargoEncoded = encodeURIComponent(JSON.stringify(c));
        
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        return `
            <tr class="align-middle">                
                <td><strong>${c.nome || "Sem Nome"}</strong></td>                
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                     <button class="btn btn-sm btn-outline-primary me-1 border-0"
                            onclick="prepararEdicaoSeguraCargo('${cargoEncoded}')" 
                            title="Editar cargo">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="deletarItemGeral('cargos', '${cargoId}', listarCargosCRUD)" 
                            title="Excluir cargo">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// FUNÇÃO INTERNA: Bloqueia ou libera os botões de controle de paginação de cargos
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
    
    const nomeInput = document.getElementById('cargos-nome')?.value || "";
    
    // Captura o select e converte para Booleano nativo
    const selectSituacao = document.getElementById('cargos-situacao');
    const ativoBoolean = (selectSituacao ? selectSituacao.value : "true") === "true"; 

    const url = id ? `${API_URL}/cargos/${id}` : `${API_URL}/cargos/`;
    const metodo = id ? 'PUT' : 'POST';

    try {
        const payloadJSON = {
            nome: nomeInput,
            ativo: ativoBoolean // Nome da coluna do seu banco (geralmente 'ativo')
        };

        const res = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadJSON)
        });
        
        if (res.ok) {
            e.target.reset();
            if (campoId) campoId.value = "";
            listarCargosCRUD(); // Sua função de atualizar a tabela de cargos
            dispararNotificacao(metodo === 'POST' ? "Cargo criado com sucesso!" : "Cargo alterado com sucesso!", "atualizar");
        } else {
            const erroApi = await res.json().catch(() => ({}));
            alert(`Erro ao salvar cargo: ${erroApi.message || 'Erro interno'}`);
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
    const campoId = document.getElementById('cargo-id');
    const campoNome = document.getElementById('cargos-nome');
    const campoSituacao = document.getElementById('cargos-situacao');
    
    const idLimpo = (c.id !== undefined ? c.id : (c._id || "")).toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = c.nome || "";
    
    // Tratamento inteligente para a situação do cargo
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
// 4. OUVINTES DE EVENTOS DA PÁGINA (ADICIONADOS AO DOMContentLoaded EXISTENTE)
// =========================================================================
// Observação: Como você provavelmente já tem um `document.addEventListener('DOMContentLoaded', ...)`
// você pode apenas colar essas linhas extras dentro dele, ou manter este bloco separado abaixo:

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a listagem de cargos se a tabela de cargos existir na página atual
    if (document.getElementById('tabela-cargos')) {
        listarCargosCRUD();
    }

    // Evento de digitação na caixa de pesquisa de cargos
    document.getElementById('pesquisa-cargo')?.addEventListener('input', () => {
        paginaAtualCargos = 1; 
        filtrarEAtualizarTabelaCargos();
    });

    // Evento de clique para o botão "Anterior" dos cargos
    document.getElementById('btn-anterior-cargos')?.addEventListener('click', () => {
        if (paginaAtualCargos > 1) {
            paginaAtualCargos--;
            filtrarEAtualizarTabelaCargos();
        }
    });

    // Evento de clique para o botão "Próximo" dos cargos
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
    if (!confirm("Tem certeza que deseja excluir este cargo?")) return;

    try {
        // 1. Executa o DELETE garantindo que não pegue nenhuma resposta em cache
        const res = await fetch(`${API_URL}/cargos/${id}`, {
            method: 'DELETE',
            cache: 'no-store'
        });

        if (res.ok) {
            // 2. Otimização de Memória Local (Remoção reativa caso exista um array global)
            if (typeof todosCargos !== 'undefined' && Array.isArray(todosCargos)) {
                todosCargos = todosCargos.filter(c => {
                    const idC = c.id_cargos ?? c.id ?? c._id;
                    return idC?.toString().trim() !== id.toString().trim();
                });
            }

            // 3. Notifica o usuário usando o seu padrão visual
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Registro excluído com sucesso!", "deletar");
            } else {
                alert("Registro excluído com sucesso!");
            }

            // 4. Recarrega a listagem direto do servidor com os dados atualizados
            if (typeof listarCargosCRUD === "function") {
                await listarCargosCRUD(); 
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            const mensagemErro = erroApi.message || 'Servidor recusou a ação';
            
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

// - Máquinas

// =========================================================================
// VARIÁVEIS DE CONTROLE DE ESTADO PARA MÁQUINAS
// =========================================================================
let todasMaquinas = [];       // Armazena a lista bruta vinda da API
let maquinasFiltrados = [];   // Armazena o resultado da busca por nome (mantido padrão de nomenclatura)
let paginaAtualMaquinas = 1;  // Controle de página exclusivo para máquinas

// =========================================================================
// 1. LISTAR MÁQUINAS (READ com Filtro e Paginação) - CORRIGIDO
// =========================================================================
async function listarMaquinasCRUD() {
    try {
        // 1. LIMPEZA PREVENTIVA: Zera os dados antigos e avisa que está carregando
        todasMaquinas = []; 
        const tabela = document.getElementById('tabela-maquinas');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="4" class="text-center py-4">Carregando máquinas...</td></tr>`;
        }

        // 2. FETCH: Passando o 'no-store' dentro das opções do fetch
        const res = await fetch(`${API_URL}/maquinas/`, {
            method: 'GET',
            cache: 'no-store' // <--- Diz para o navegador ignorar o cache do Render
        });
        
        if (!res.ok) {
            throw new Error(`Erro no servidor: Status ${res.status}`);
        }

        todasMaquinas = await res.json();
        
        const totalBadge = document.getElementById('total-maquinas');
        if (totalBadge) totalBadge.innerText = todasMaquinas.length;

        // Processa o filtro inicial e pagina os resultados
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

// FUNÇÃO INTERNA: Filtra as máquinas por nome e calcula as páginas disponíveis
function filtrarEAtualizarTabelaMaquinas() {
    const termoPesquisa = document.getElementById('pesquisa-maquina')?.value.toLowerCase() || "";
    
    // Filtra pelo nome da máquina digitada
    maquinasFiltrados = todasMaquinas.filter(m =>
        m.nome && m.nome.toLowerCase().includes(termoPesquisa)
    );

    // ===============================
    // ORDENAÇÃO ALFABÉTICA
    // ===============================
    maquinasFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    // ===============================
    // CORREÇÃO: ÚLTIMO CADASTRADO NO TOPO (Pega o ID dinamicamente e sem erros)
    // ===============================
    const ultimoCadastro = todasMaquinas[todasMaquinas.length - 1];

    if (ultimoCadastro) {
        // Captura o ID do último cadastro varrendo todas as possibilidades reais do banco
        const idUltimo = ultimoCadastro.id_maquinas || ultimoCadastro.id_maquina || ultimoCadastro.id || ultimoCadastro._id || "";

        if (idUltimo) {
            // Remove ele da posição atual de forma segura convertendo para String
            maquinasFiltrados = maquinasFiltrados.filter(m => {
                const idM = m.id_maquinas || m.id_maquina || m.id || m._id || "";
                return idM.toString() !== idUltimo.toString();
            });

            // Adiciona no topo da lista
            maquinasFiltrados.unshift(ultimoCadastro);
        }
    }

    const totalPaginas = Math.ceil(maquinasFiltrados.length / ITENS_POR_PAGINA) || 1;
    
    if (paginaAtualMaquinas > totalPaginas) {
        paginaAtualMaquinas = totalPaginas;
    }

    // Calcula os cortes exatos para exibir o limite de 10 por página
    const indiceInicial = (paginaAtualMaquinas - 1) * ITENS_POR_PAGINA;
    const indiceFinal = indiceInicial + ITENS_POR_PAGINA;
    const maquinasExibidas = maquinasFiltrados.slice(indiceInicial, indiceFinal);

    renderizarTabelaMaquinas(maquinasExibidas);
    atualizarControlesPaginacaoMaquinas(totalPaginas);
}

// FUNÇÃO INTERNA: Renderiza as linhas visíveis na tabela de máquinas
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
        // CORREÇÃO DE VARREDURA: Adicionado 'id_maquinas' à checagem estrita
        let idBruto = undefined;
        
        if (m) {
            if (m.id_maquinas !== undefined && m.id_maquinas !== null) idBruto = m.id_maquinas;
            else if (m.id_maquina !== undefined && m.id_maquina !== null) idBruto = m.id_maquina;
            else if (m.id !== undefined && m.id !== null) idBruto = m.id;
            else if (m._id !== undefined && m._id !== null) idBruto = m._id;
        }
        
        const maquinaId = idBruto !== undefined ? idBruto.toString().trim() : "";

        // Se mesmo assim o ID não for localizado, exibe o aviso visual que vimos na imagem
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

        // Mapeamento automático da Situação/Ativo
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

        // Garante a sincronização das propriedades internas para a Edição funcionar
        m.id = maquinaId;
        m.situacao = situacaoTratada;

        const maquinaEncoded = encodeURIComponent(JSON.stringify(m));
        
        const badgeClasse = situacaoTratada === 'Ativo' 
            ? 'bg-success-subtle text-success' 
            : 'bg-secondary-subtle text-secondary';

        return `
            <tr class="align-middle">                
                <td><strong>${m.nome || "Sem Nome"}</strong></td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1 border-0" 
                            onclick="window.prepararEdicaoMaquina('${maquinaEncoded}')" 
                            title="Editar máquina">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="window.excluirMaquina('${maquinaId}')" 
                            title="Excluir máquina">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// FUNÇÃO INTERNA: Bloqueia ou libera os botões de controle de paginação de máquinas
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
// 2. SALVAR OU ATUALIZAR CADASTRO (CREATE / UPDATE) - ID CORRIGIDO
// =========================================================================
document.getElementById('formMaquinas')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // CASAMENTO DE ID: Agora buscando exatamente o 'maq-id' do seu HTML
    const campoId = document.getElementById('maq-id');
    let id = campoId ? campoId.value.toString().trim() : "";
    
    if (!id || id === "" || id === "undefined" || id === "null" || id === 0) {
        id = null;
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

        const res = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadJSON)
        });
        
        if (res.ok) {
            if (campoId) campoId.value = "";
            e.target.reset();
            
            // CASAMENTO DE ID: Restaurando o título usando 'titulo-form-maq'
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
            alert(`Erro ao salvar máquina: ${erroApi.message || 'Erro interno do servidor'}`);
        }
    } catch (err) {
        console.error("Erro no processo de salvamento:", err);
        alert("Erro de conexão ao salvar máquina.");
    }
});

// =========================================================================
// 3. FUNÇÕES DE AUXÍLIO PARA EDIÇÃO DE MÁQUINAS - ID CORRIGIDO
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
    // CASAMENTO DE ID: Injeta o ID diretamente no 'maq-id'
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
    
    // CASAMENTO DE ID: Altera o texto usando o ID 'titulo-form-maq'
    const tituloForm = document.getElementById('titulo-form-maq');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-3"></i> Editar Máquina';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =========================================================================
// 4. OUVINTES DE EVENTOS DA PÁGINA (DENTRO DO DOMContentLoaded)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tabela-maquinas')) {
        listarMaquinasCRUD();
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
    if (!confirm("Tem certeza que deseja excluir esta máquina?")) return;

    try {
        // 1. Executa o DELETE garantindo que não pegue nenhuma resposta em cache
        const res = await fetch(`${API_URL}/maquinas/${id}`, {
            method: 'DELETE',
            cache: 'no-store'
        });

        if (res.ok) {
            // 2. Otimização de Memória Local (Remoção reativa caso exista um array global)
            if (typeof todasMaquinas !== 'undefined' && Array.isArray(todasMaquinas)) {
                todasMaquinas = todasMaquinas.filter(m => {
                    const idM = m.id_maquinas ?? m.id ?? m._id;
                    return idM?.toString().trim() !== id.toString().trim();
                });
            }

            // 3. Notifica o usuário usando o seu padrão visual
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Registro excluído com sucesso!", "deletar");
            } else {
                alert("Registro excluído com sucesso!");
            }

            // 4. Recarrega a listagem direto do servidor com os dados atualizados
            if (typeof listarMaquinasCRUD === "function") {
                await listarMaquinasCRUD(); 
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            const mensagemErro = erroApi.message || 'Servidor recusou a ação';
            
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
// VARIÁVEIS DE CONTROLE DE ESTADO PARA COLABORADORES
// =========================================================================
let todosColaboradores = [];       // Armazena a lista bruta vinda da API
let colaboradoresFiltrados = [];   // Armazena o resultado da busca por nome
let paginaAtualColaboradores = 1;  // Controle de paginação exclusivo
let listaDeCargos = [];            // CORREÇÃO: Declarada globalmente para evitar o erro "is not defined"

// =========================================================================
// 1. CARREGAR OPÇÕES DO SELECT DE CARGOS (DINÂMICO)
// =========================================================================
async function carregarCargosNoSelect() {
    const inputBusca = document.getElementById('colaboradores-cargo-busca');
    const datalistCargos = document.getElementById('lista-cargos-datalist');
    const inputIdOculto = document.getElementById('colaboradores-cargo') || document.querySelector('input[id*="cargo"]:not([id*="situacao"])');

    if (!inputBusca || !datalistCargos || !inputIdOculto) return;

    try {
        // CORREÇÃO DO CACHE: Passado corretamente dentro da configuração do Fetch
        const res = await fetch(`${API_URL}/cargos/`, { cache: 'no-store' });
        if (res.ok) {
            const cargos = await res.json();
            window.listaDeCargos = cargos; // Garante o salvamento para uso global na tabela

            // 1. Ordena os cargos recebidos em ordem alfabética pelo nome
            cargos.sort((a, b) => a.nome.localeCompare(b.nome));
            
            // 2. Vincula o input de busca ao datalist
            inputBusca.setAttribute('list', 'lista-cargos-datalist');

            // 3. Popula o datalist apenas com os nomes (o data-id guarda o ID de suporte)
            datalistCargos.innerHTML = cargos.map(c => {
                const idCargo = c.id_cargos ?? c.id ?? c._id;
                return `<option value="${c.nome}" data-id="${idCargo}"></option>`;
            }).join('');

            // 4. FUNÇÃO REVERSA PARA A EDIÇÃO: Atualiza o texto visível com base no ID injetado
            window.atualizarInputVisualCargo = function(idAlvo) {
                const opcao = Array.from(datalistCargos.options).find(opt => opt.getAttribute('data-id')?.toString() === idAlvo?.toString());
                if (opcao) {
                    inputBusca.value = opcao.value; // Joga o Nome real do cargo no campo de texto
                } else {
                    inputBusca.value = "";
                }
            };

            // 5. Evento para capturar quando o usuário selecionar um cargo da lista manualmente
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
        // 1. RESET DE ESTADO E LIMPEZA PREVENTIVA
        todosColaboradores = [];
        if (typeof colaboradoresFiltrados !== 'undefined') colaboradoresFiltrados = [];

        // Proteção: Captura APENAS pelo ID exato para não sobrescrever tabelas de outras páginas
        const tabela = document.getElementById('tabela-colaboradores');
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="7" class="text-center py-4">Carregando colaboradores...</td></tr>`;
        }

        // =========================================================================
        // PASSO CRÍTICO: BUSCA CARGOS ATUALIZADOS DO SERVIDOR (CONTRA CACHE DA API)
        // =========================================================================
        try {
            const resCargos = await fetch(`${API_URL}/cargos/`, {
                method: 'GET',
                cache: 'no-store' // Ignora o cache do servidor/API
            });
            if (resCargos.ok) {
                // Sincroniza a lista global que a tabela usa para traduzir o ID em Nome
                window.listaDeCargos = await resCargos.json();
            }
        } catch (erroCargos) {
            console.warn("Aviso: Falha ao atualizar lista de cargos para mapeamento:", erroCargos);
        }

        // 2. REQUISIÇÃO FORÇANDO NO-STORE (DIRETO DO BANCO NO RENDER)
        const res = await fetch(`${API_URL}/colaboradores/`, {
            method: 'GET',
            cache: 'no-store'
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
            tabela.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">⚠️ Erro ao carregar colaboradores.<br><small class="text-muted">Motivo: ${e.message}</small></td></tr>`;
        }
        
        if (typeof dispararNotificacao === "function") {
            dispararNotificacao("Não foi possível carregar a lista de colaboradores.", "erro");
        }
    }
}

function filtrarEAtualizarTabelaColaboradores() {
    const termoPesquisa = document.getElementById('pesquisa-colaborador')?.value.toLowerCase() || "";
    
    // Filtra pelo nome de colaborador digitado
    colaboradoresFiltrados = todosColaboradores.filter(c =>
        c.nome && c.nome.toLowerCase().includes(termoPesquisa)
    );

    // ===============================
    // ORDENAÇÃO ALFABÉTICA
    // ===============================
    colaboradoresFiltrados.sort((a, b) =>
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
    );

    // ===============================
    // ÚLTIMO CADASTRADO NO TOPO
    // ===============================
    const ultimoCadastro = todosColaboradores[todosColaboradores.length - 1];

    if (ultimoCadastro) {
        // Remove ele da posição atual
        colaboradoresFiltrados = colaboradoresFiltrados.filter(
            c => c.id_colaboradores !== ultimoCadastro.id_colaboradores
        );

        // Adiciona no topo
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
        tabela.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Nenhum colaborador encontrado.</td></tr>`;
        return;
    }

    tabela.innerHTML = colaboradores.map(c => {
        const idRegistroAtual = c.id_colaboradores ?? c.id ?? c._id;
        const colaboradorId = idRegistroAtual !== undefined ? idRegistroAtual.toString().trim() : "";

        if (!colaboradorId) {
            return `<tr class="table-warning"><td colspan="6" class="text-center">⚠️ Registro sem ID</td></tr>`;
        }

        const registroEstaAtivo = c.ativo === true || c.ativo === "true" || 
                                  (c.ativo === undefined && (c.situacao === "Ativo" || String(c.situacao).toLowerCase() === "ativo"));
        let situacaoTratada = registroEstaAtivo ? "Ativo" : "Inativo";

        c.situacaoTratada = situacaoTratada;
        c.idUnificado = colaboradorId;   
        c.ativo = registroEstaAtivo;     

        // =========================================================================
        // TRATAMENTO UNIFICADO DO CARGO (CONSULTA DIRETA EM WINDOW.LISTADECARGOS)
        // =========================================================================
        let nomeCargoExibicao = "-";
        let idCargoLimpo = ""; 

        const cargoBruto = c.cargo ?? c.cargos ?? c.id_cargo ?? c.id_cargos;

        if (cargoBruto) {
            if (typeof cargoBruto === 'object') {
                nomeCargoExibicao = cargoBruto.nome || "-";
                idCargoLimpo = cargoBruto.id_cargos ?? cargoBruto.id ?? cargoBruto._id ?? "";
            } else {
                // Isola o ID removendo possíveis prefixos de texto
                idCargoLimpo = String(cargoBruto).replace(/[^\d]/g, '') || String(cargoBruto).trim();
                
                // Pega a lista sincronizada pelo datalist no escopo global da aplicação
                const listaGlobal = window.listaDeCargos || [];
                
                const cargoEncontrado = listaGlobal.find(cargo => {
                    const idC = cargo.id_cargos ?? cargo.id ?? cargo._id;
                    return String(idC).trim() === String(idCargoLimpo).trim();
                });

                if (cargoEncontrado) {
                    nomeCargoExibicao = cargoEncontrado.nome;
                } else {
                    // Mantém o valor bruto original (ex: "Analista de Qualidade *&520") se não achar o ID isolado
                    nomeCargoExibicao = isNaN(cargoBruto) ? cargoBruto : `Cargo ${cargoBruto}`;
                }
            }
        }

        // Deixa salvo no objeto do colaborador para o formulário de edição ler instantaneamente
        c.id_cargo_tratado = idCargoLimpo;
        c.nome_cargo_tratado = nomeCargoExibicao;

        const badgeClasse = situacaoTratada === 'Ativo' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary';

        return `
            <tr class="align-middle">                
                <td><strong>${c.nome || "Sem Nome"}</strong></td>
                <td>${c.matricula || "-"}</td>
                <td>${nomeCargoExibicao}</td>
                <td>${c.setor || "Não Informado"}</td>
                <td>${c.email || "-"}</td>
                <td><span class="badge ${badgeClasse}">${situacaoTratada}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1 border-0"                     
                            onclick="window.prepararEdicaoPorId('${colaboradorId}')" 
                            title="Editar colaborador">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger border-0" 
                            onclick="deletarItemGeral('colaboradores', '${colaboradorId}')" 
                            title="Excluir colaborador">
                        <i class="bi bi-trash"></i>
                    </button>
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
    
    // 1. CAPTURA O ID DO COLABORADOR (SE EXISTIR, SIGNIFICA QUE É EDIÇÃO)
    const campoId = document.getElementById('colab-id');
    const id = campoId ? campoId.value.trim() : "";
    
    // DEFINIÇÃO CENTRALIZADA DA URL E DO MÉTODO HTTP
    let url = id ? `${API_URL}/colaboradores/${id}` : `${API_URL}/colaboradores/`;
    let metodo = id ? 'PUT' : 'POST';

    try {
        // 2. CAPTURA E VALIDAÇÃO DO CARGO
        const selectCargo = document.getElementById('colaboradores-cargo') || document.querySelector('select[id*="cargo"]');
        const valorCargo = selectCargo ? selectCargo.value : "";
        const idCargoInt = parseInt(valorCargo, 10);

        if (isNaN(idCargoInt)) {
            console.error("Valor capturado no select do cargo:", valorCargo);
            if (typeof dispararNotificacao === "function") {
                dispararNotificacao("Selecione um cargo válido para o colaborador.", "erro");
            } else {
                alert("Erro: Não foi possível identificar o código do cargo selecionado.");
            }
            return; 
        }

        // 3. CAPTURA E CONVERSÃO DA SITUAÇÃO (ATIVO/INATIVO)
        const selectSituacao = document.getElementById('colaboradores-situacao');
        const valorSituacaoTela = selectSituacao ? selectSituacao.value.toString().trim() : "true";
        const ehAtivoBoolean = (valorSituacaoTela === "true");

        // 4. CAPTURA DO SETOR (PREDEFINIDO VIA CÓDIGO NO FRONTEND)
        const setorInput = document.getElementById('colaboradores-setor')?.value || "Não Informado";

        // 5. MONTAGEM DO PAYLOAD COMPATÍVEL COM O BANCO DE DADOS
        const payloadJSON = {
            nome: document.getElementById('colaboradores-nome')?.value || "",
            matricula: parseInt(document.getElementById('colaboradores-matricula')?.value, 10) || 0,
            id_cargos: idCargoInt, 
            email: document.getElementById('colaboradores-email')?.value || "",
            ativo: ehAtivoBoolean,
            setor: setorInput
        };

        // Log de inspeção para debug no painel F12
        console.log(`[Envio API] Método: ${metodo} | URL: ${url} | Payload:`, payloadJSON);

        // 6. DISPARO DA REQUISIÇÃO HTTP CONTRA A API
        const res = await fetch(url, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json'
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
            
            // Reseta todos os campos padrão do formulário (Trata ambos os formatos de IDs comuns)
            const formulario = document.getElementById('formColaboradores') || document.getElementById('form-colaboradores');
            if (formulario) formulario.reset();
            
            // Limpezas e resets manuais obrigatórios pós-salvamento
            if (selectSituacao) selectSituacao.value = "true";
            if (campoId) campoId.value = ""; 
            
            // Restaura o título do formulário e reverte o botão para o modo de criação original
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

            // Atualiza a tabela dinamicamente em tempo real na tela
            if (typeof listarColaboradoresCRUD === "function") {
                listarColaboradoresCRUD();
            }
        } else {
            const erroApi = await res.json().catch(() => ({}));
            console.error("Detalhes do erro do servidor:", erroApi);
            
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
    const c = todosColaboradores.find(colab => {
        const idColab = colab.id_colaboradores ?? colab.id ?? colab._id;
        return idColab?.toString().trim() === id.toString().trim();
    });
    
    if (!c) {
        console.error("Colaborador não encontrado na memória local.");
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
    const campoSetor = document.getElementById('colaboradores-setor'); // Captura o elemento na tela
    
    const idLimpo = (c.id_colaboradores ?? c.id ?? c._id ?? "").toString().trim();
    
    if (campoId) campoId.value = idLimpo;
    if (campoNome) campoNome.value = c.nome || "";
    if (campoMatricula) campoMatricula.value = c.matricula || "";
    if (campoEmail) campoEmail.value = c.email || "";

    // 1. CARREGA O CARGO ATUAL NO SELECT DE CARGOS
    if (campoCargo) {
        campoCargo.value = c.id_cargos ?? c.id_cargo ?? "";
    }

    // 2. ATUALIZAÇÃO DO SELECT DE SETOR NA EDIÇÃO (Mapeia chaves alternativas para segurança)
    if (campoSetor) {
        // Tenta buscar 'setor', 'setor_tratado' ou 'area_setor' vindo do objeto de memória local
        const setorBanco = c.setor ?? c.setor_tratado ?? c.area_setor ?? "Não Informado";
        campoSetor.value = setorBanco; 
    }

    // 3. ALTERA O TEXTO DO BOTÃO PARA MODO EDIÇÃO (Tenta tanto com hífen quanto sem hífen no seletor)
    const btnSalvar = document.querySelector('#form-colaboradores button[type="submit"]') || document.querySelector('#formColaboradores button[type="submit"]');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-save me-2"></i> Salvar Alterações';
        btnSalvar.classList.remove('btn-primary');
        btnSalvar.classList.add('btn-warning'); // Muda a cor para destacar a edição
    }

    // Rola a página suavemente até o formulário para facilitar para o usuário
    const formulario = document.getElementById('form-colaboradores') || document.getElementById('formColaboradores');
    if (formulario) {
        formulario.scrollIntoView({ behavior: 'smooth' });
    }
    
    // =========================================================================
    // INJEÇÃO DO CARGO COMPATÍVEL COM O COMPONENTE DATALIST
    // =========================================================================
    if (campoCargo) {
        // Alimenta o campo oculto (o ID que vai salvar no banco)
        const idCargoParaInserir = c.id_cargo_tratado || c.id_cargos || c.id_cargo || "";
        campoCargo.value = idCargoParaInserir;
        
        // Dispara a função reversa do datalist para achar o Nome pelo ID e preencher o input visível
        if (typeof window.atualizarInputVisualCargo === 'function') {
            window.atualizarInputVisualCargo(idCargoParaInserir);
        } else {
            // Fallback caso a lista de cargos demore a carregar, tenta usar o nome salvo na linha
            const inputBusca = document.getElementById('colaboradores-cargo-busca');
            if (inputBusca && c.nome_cargo_tratado) {
                inputBusca.value = c.nome_cargo_tratado;
            }
        }
    }
    
    // 4. ATUALIZAÇÃO DA SITUAÇÃO COM TIMEOUT PARA GARANTIR EVENTO CHANGE
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
    
    // 5. ATUALIZA O TÍTULO VISUAL DO FORMULÁRIO
    const tituloForm = document.getElementById('titulo-form-colab');
    if (tituloForm) {
        tituloForm.innerHTML = '<i class="bi bi-pencil-square text-warning me-2"></i>Editar Colaborador';
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// =========================================================================
// 5. EXCLUIR COLABORADORES
// =========================================================================
window.deletarItemGeral = async function(endpoint, id) {
    if (!confirm("Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.")) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/${endpoint}/${id}`, {
            method: 'DELETE'
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
            console.error("Erro na exclusão. Status:", res.status);
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