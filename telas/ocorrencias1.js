// =========================================================================
// CONFIGURAÇÕES GLOBAIS E CONTROLE DE ESTADO
// =========================================================================
const API_URL = "https://sistema.qcsoftware.com.br";

const ITENS_POR_PAGINA = 10;
let paginaAtualOcorrencias = 1;  

let todasOcorrencias = [];       // Armazena o payload bruto vindo da API
let OcorrenciasFiltradas = [];   // Armazena os registros após aplicação dos filtros superiores
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

    return {
        isoDateTime: `${a}-${m}-${d}T${h}:${min}`,
        dataFormatada: `${d}/${m}/${a}`,
        horaFormatada: `${h}:${min} horas`
    };
}

// GARANTA QUE TENHA O 'async' EXATAMENTE AQUI ANTES DOS PARÊNTESES:
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. CONTROLE DA SIDEBAR E ROTAÇÃO DA SETA
    const toggleBtn = document.querySelector('.sidebar-toggle-btn') || document.getElementById('toggleSidebar');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar-container') || document.querySelector('aside') || document.querySelector('.sidebar');
            const mainContent = document.querySelector('.main-content-wrapper') || document.querySelector('main') || document.querySelector('.content');
            
            if (sidebar) sidebar.classList.toggle('collapsed');
            if (mainContent) mainContent.classList.toggle('expanded');
            toggleBtn.classList.toggle('rotated');
        });
    }

    // 2. ATUALIZAR DATA/HORA DO COLABORADOR NO MENU INFERIOR
    try {
        const tempoLocal = obterDataHoraAtualLocal();
        const inputDataOcorrencia = document.getElementById('ocorrencias-data');
        if (inputDataOcorrencia) inputDataOcorrencia.value = tempoLocal.isoDateTime;

        const containerColaborador = document.querySelector('.sidebar-container') || document.querySelector('aside') || document.querySelector('.sidebar');
        if (containerColaborador) {
            const todosElementos = containerColaborador.querySelectorAll('*');
            todosElementos.forEach(el => {
                if (el.textContent.includes('--/--/----')) {
                    el.innerHTML = el.innerHTML.replace('--/--/----', tempoLocal.dataFormatada);
                }
                if (el.textContent.includes('--:-- horas') || el.textContent.includes('--:--')) {
                    el.innerHTML = el.innerHTML.replace('--:-- horas', tempoLocal.horaFormatada).replace('--:--', tempoLocal.horaFormatada);
                }
            });
        }
    } catch (e) {
        console.warn("Aviso ao carregar data/hora da sidebar:", e);
    }

    // Otimização: Dispara a busca do CRUD em paralelo com os selects para abrir mais rápido
    const promessaOcorrencias = listarOcorrenciasCRUD();

    // 3. Inicializa os selects e datalists dinâmicos usando await com segurança
    try {
        await Promise.all([
            carregarMaquinasNoSelect(),
            carregarColaboradoresNoSelect(),
            carregarProdutosNoSelect()
        ]);
        console.log("Dicionários e seletores carregados com sucesso.");
    } catch (e) {
        console.error("Erro crítico ao carregar seletores dinâmicos:", e);
    }

    try {
        await listarOcorrenciasCRUD();
    } catch (e) {
        console.error("Erro ao listar ocorrências do CRUD:", e);
    }

    // Aguarda o término da renderização inicial dos dados
    await promessaOcorrencias;

    // 4. Configura os ouvintes dos filtros superiores essenciais restantes
    const filtros = ['filterSituacao', 'filterDataInicio', 'filterDataFim'];
    filtros.forEach(id => {
        const elementoFiltro = document.getElementById(id);
        if (elementoFiltro) {
            elementoFiltro.addEventListener('change', () => {
                paginaAtualOcorrencias = 1;
                filtrarEAtualizarTabelaOcorrencias();
            });
            elementoFiltro.addEventListener('input', () => {
                paginaAtualOcorrencias = 1;
                filtrarEAtualizarTabelaOcorrencias();
            });
        }
    });

    // 5. Controles de paginação de tabelas
    document.getElementById('btn-anterior-ocorrencias')?.addEventListener('click', () => {
        if (paginaAtualOcorrencias > 1) {
            paginaAtualOcorrencias--;
            filtrarEAtualizarTabelaOcorrencias();
        }
    });

    document.getElementById('btn-proximo-ocorrencias')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(OcorrenciasFiltradas.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualOcorrencias < totalPaginas) {
            paginaAtualOcorrencias++;
            filtrarEAtualizarTabelaOcorrencias();
        }
    });
});

// =========================================================================
// FILTRAGEM, ORDENAÇÃO E CÁLCULO DE PAGINAÇÃO (OTIMIZADO)
// =========================================================================
function filtrarEAtualizarTabelaOcorrencias() {
    const loteDigitado = document.getElementById('filterLote')?.value.trim().toLowerCase() || "";
    const situacaoSelecionada = document.getElementById('filterSituacao')?.value || "pendente";
    const dataInicio = document.getElementById('filterDataInicio')?.value || "";
    const dataFim = document.getElementById('filterDataFim')?.value || "";
    const rangeData = document.getElementById('filterDataRange')?.value || "";

    OcorrenciasFiltradas = todasOcorrencias.filter(o => {
        // 1. Filtro de Lote do Produto
        const loteOcorrencia = String(o.lote_produtos ?? o.lote_produto ?? o.lote ?? "").toLowerCase();
        const passaLote = (loteDigitado === "") || loteOcorrencia.includes(loteDigitado);

        // 2. Filtro de Situação
        const registroEstaAtivo = o.ativo === true || o.ativo === "true" || 
                                 (o.ativo === undefined && String(o.situacao).toLowerCase() === "ativo") || 
                                 (o.ativo === undefined && o.situacao === undefined);
        const situacaoTratada = registroEstaAtivo ? "Ativo" : "Inativo";
        const valorSituacao = String(o.situacao || situacaoTratada).toLowerCase();
        
        const passaSituacao = (situacaoSelecionada === "todos") || 
                              (valorSituacao === situacaoSelecionada.toLowerCase()) ||
                              (situacaoSelecionada === "Ativo" && registroEstaAtivo) ||
                              (situacaoSelecionada === "Inativo" && !registroEstaAtivo);

        // 3. Filtro de Data Avançado / Simples
        let passaData = true;
        
        if (rangeData && rangeData.includes("à")) {
            const partes = rangeData.split("à");
            const [diaI, mesI, anoI] = partes[0].trim().split("/");
            const [diaF, mesF, anoF] = partes[1].trim().split("/");

            const dInicio = new Date(`${anoI}-${mesI}-${diaI}T00:00:00`);
            const dFim = new Date(`${anoF}-${mesF}-${diaF}T23:59:59`);
            const dataRegistro = o.data_ocorrencias ? new Date(o.data_ocorrencias) : null;

            if (dataRegistro) {
                passaData = (dataRegistro >= dInicio && dataRegistro <= dFim);
            }
        } else {
            const campoData = o.data_ocorrencias ?? o.data_ocorrencia ?? o.data ?? null;
            if (campoData) {
                const dataRegistroIso = String(campoData).substring(0, 10); 
                if (dataInicio) passaData = passaData && (dataRegistroIso >= dataInicio);
                if (dataFim) passaData = passaData && (dataRegistroIso <= dataFim);
            } else if (dataInicio || dataFim) {
                passaData = false;
            }
        }

        return passaLote && passaSituacao && passaData;
    });

    // CORREÇÃO 2: Ordena por lote de forma decrescente para manter a consistência com os filtros
    OcorrenciasFiltradas.sort((a, b) => {
    const loteA = String(a.lote_produtos || "").trim();
    const loteB = String(b.lote_produtos || "").trim();
    return loteB.localeCompare(loteA);
});

    const totalBadge = document.getElementById('totalOcorrencias') || document.getElementById('total-ocorrencias') || document.querySelector('.badge');
    if (totalBadge) totalBadge.innerText = OcorrenciasFiltradas.length;

    const totalPaginas = Math.ceil(OcorrenciasFiltradas.length / ITENS_POR_PAGINA) || 1;
    if (paginaAtualOcorrencias > totalPaginas) paginaAtualOcorrencias = totalPaginas;

    const indiceInicial = (paginaAtualOcorrencias - 1) * ITENS_POR_PAGINA;
    const ocorrenciasExibidas = OcorrenciasFiltradas.slice(indiceInicial, indiceInicial + ITENS_POR_PAGINA);

    renderizarTabelaOcorrencias(ocorrenciasExibidas);
    atualizarControlesPaginacaoOcorrencias(totalPaginas);
}

// Ouvintes adicionais para digitação em tempo real
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('filterLote')?.addEventListener('input', filtrarEAtualizarTabelaOcorrencias);
    document.getElementById('filterSituacao')?.addEventListener('change', filtrarEAtualizarTabelaOcorrencias);
    document.getElementById('filterDataInicio')?.addEventListener('change', filtrarEAtualizarTabelaOcorrencias);
    document.getElementById('filterDataFim')?.addEventListener('change', filtrarEAtualizarTabelaOcorrencias);
    document.getElementById('filterDataRange')?.addEventListener('change', filtrarEAtualizarTabelaOcorrencias);
});

// =========================================================================
// RENDERIZAÇÃO EM TELA DO HTML (ALTA PERFORMANCE) - CORRIGIDO DEFINITIVO
// =========================================================================
function renderizarTabelaOcorrencias(ocorrencias) {
    const tabela = document.getElementById('tabela-ocorrencias');
    if (!tabela) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        tabela.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">Nenhuma ocorrência encontrada para os filtros aplicados.</td></tr>`;
        return;
    }

    tabela.innerHTML = ocorrencias.map(o => {
        // Captura o número identificador real que a API mandou (ex: 66)
        let idBruto = o.numero_ocorrencias ?? o.id ?? o.id_ocorrencias ?? 0;
        const numeroOcoInt = parseInt(idBruto, 10) || 0;

        const textoSituacao = o.situacao || (o.ativo === false || o.ativo === "false" ? "Inativo" : "Ativo");
        
        let badgeClasse = 'bg-secondary-subtle text-secondary';
        const statusNormalizado = String(textoSituacao).toLowerCase().trim();

        if (statusNormalizado === 'pendente') {
            badgeClasse = 'bg-danger-subtle text-danger';
        } else if (statusNormalizado === 'em andamento') {
            badgeClasse = 'bg-warning-subtle text-warning';
        } else if (statusNormalizado === 'concluido' || statusNormalizado === 'concluído' || statusNormalizado === 'ativo') {
            badgeClasse = 'bg-success-subtle text-success';
        }

        let dataOriginalRaw = o.data_ocorrencias ?? o.data_ocorrencia ?? o.data ?? "";
        let dataFormatada = "-";
        if (dataOriginalRaw && dataOriginalRaw !== "-") {
            try {
                const dataObjeto = new Date(dataOriginalRaw.replace(' ', 'T'));
                if (!isNaN(dataObjeto)) {
                    dataFormatada = dataObjeto.toLocaleDateString('pt-BR') + ' ' + dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
            } catch (e) { }
        }

        // --- AJUSTE DOS IDS NUMÉRICOS EXATOS EXIGIDOS PELO SWAGGER ---
        const fkProduto = parseInt(o.id_produtos ?? o.id_produto ?? 0, 10);
        const fkMaquina = parseInt(o.id_maquinas ?? o.id_maquina ?? 0, 10);
        const fkColaborador = parseInt(o.id_colaboradores ?? o.id_colaborador ?? 0, 10);

        let produto = "-";
        if (fkProduto && window.listaDeProdutos) {
            const prodEnc = window.listaDeProdutos.find(p => (p.id_produtos || p.id_Produtos || p.id || p._id)?.toString() === fkProduto.toString());
            if (prodEnc) produto = prodEnc.nome;
        }

        let maquina = "-";
        if (fkMaquina && window.listaDeMaquinas) {
            const maqEnc = window.listaDeMaquinas.find(m => (m.id_maquinas || m.id || m._id)?.toString() === fkMaquina.toString());
            if (maqEnc) maquina = maqEnc.nome;
        }

        let colaborador = "-";
        if (fkColaborador && window.listaDeColaboradores) {
            const colabEnc = window.listaDeColaboradores.find(c => (c.id_colaboradores || c.id_Colaboradores || c.id || c._id)?.toString() === fkColaborador.toString());
            if (colabEnc) colaborador = colabEnc.nome;
        }
        
        const lote = o.lote_produtos || o.lote_produto || o.lote || "-";
        const problema = o.problema || o.falha_como || "-";

        const dataLimpaUrl = dataOriginalRaw ? dataOriginalRaw.toString().split('.')[0].replace(' ', 'T') : '';
        
        const caminhoFoto = o.foto || o.imagem || o.foto_ocorrencia || null;
        let iconeFotoHTML = `<span class="text-muted" title="Sem foto"><i class="bi bi-image-alt opacity-50"></i></span>`;
        
        if (caminhoFoto) {
            iconeFotoHTML = `
                <button type="button" class="btn btn-sm btn-outline-secondary border-0" title="Visualizar Foto" 
                    onclick="let novaAba = window.open('about:blank', '_blank'); novaAba.document.write('<html><body style=\\'margin:0;display:flex;justify-content:center;align-items:center;background:#f0f2f5;\\'><img src=\\'${caminhoFoto}\\' style=\\'max-width:100%;max-height:100vh;object-fit:contain;\\'></body></html>');">
                    <i class="bi bi-image text-primary fs-5"></i>
                </button>
            `;
        }

        // MONTAGEM DO CORPO DA LINHA DA TABELA AJUSTADO COM AS CHAVES CORRETAS
        return `
            <tr class="align-middle">                
                <td>${lote}</td>
                <td><strong>${numeroOcoInt}</strong></td>            
                <td>${dataFormatada}</td>
                <td>${produto}</td>
                <td>${maquina}</td>
                <td>${problema}</td>
                <td>${colaborador}</td>
                <td><span class="badge ${badgeClasse}">${textoSituacao}</span></td>
                <td>${iconeFotoHTML}</td>
                <td style="text-align: left; white-space: nowrap;">
                    
                    <button type="button" class="btn btn-sm btn-outline-primary border-0" 
                            onclick="window.location.href='ocorrencias_editar.html?editar=true&numero_ocorrencias=${numeroOcoInt}&data_ocorrencias=${encodeURIComponent(dataLimpaUrl)}&id_maquinas=${fkMaquina}&id_colaboradores=${fkColaborador}&id_produtos=${fkProduto}'" 
                            title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>

                </td>
            </tr>
        `;
    }).join('');
}

// =========================================================================
// SCRIPT DEFINITIVO E ULTRA-BLINDADO DE CARREGAMENTO E SINCRO
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    const paramsURL = new URLSearchParams(window.location.search);
    
    // Captura os identificadores da URL
    const numOcoUrl = paramsURL.get('numero_ocorrencias');
    const dataOcoUrl = paramsURL.get('data_ocorrencias');
    const idMaqUrl = paramsURL.get('id_maquinas');
    const idColabUrl = paramsURL.get('id_colaboradores');
    const idProdUrl = paramsURL.get('id_produtos');

    if (!numOcoUrl && !dataOcoUrl) return; 

    const inputNumero = document.getElementById('ocorrencias-numero') || document.getElementById('numero');
    if (inputNumero) inputNumero.readOnly = true;

    // =========================================================================
    // FUNÇÃO AUXILIAR DE INJEÇÃO INTELIGENTE (RESOLVE O PALPITE DO DROP DOWN)
    // =========================================================================
    function preencherCampoInteligente(elemento, valorBackend) {
        if (!elemento || valorBackend === undefined || valorBackend === null) return;

        const valorStr = valorBackend.toString().trim();

        // Se for um <select> (Dropdown), precisamos garantir o match de texto ou ID
        if (elemento.tagName === 'SELECT') {
            // Tentativa 1: Match exato (ex: 30 === 30)
            elemento.value = valorStr;

            // Tentativa 2: Se não funcionou, busca por correspondência parcial (ex: "30" entra em "30-Ana")
            if (elemento.value !== valorStr) {
                for (let i = 0; i < elemento.options.length; i++) {
                    const optVal = elemento.options[i].value.toString().trim();
                    const optText = elemento.options[i].text.toString().trim();

                    if (optVal.startsWith(valorStr) || valorStr.startsWith(optVal) || 
                        optText.toLowerCase().includes(valorStr.toLowerCase())) {
                        elemento.value = elemento.options[i].value;
                        break;
                    }
                }
            }
        } else {
            // Se for input de texto ou textarea, injeta direto preservando o valor atual se o backend sumir
            elemento.value = valorStr ?? elemento.value;
        }
    }

    try {
        const urlGet = `${API_URL}/ocorrencias/?` +
            `data_ocorrencias=${encodeURIComponent(dataOcoUrl)}&` +
            `id_maquinas=${idMaqUrl}&` +
            `id_colaboradores=${idColabUrl}&` +
            `id_produtos=${idProdUrl}&` +
            `numero_ocorrencias=${numOcoUrl}`;
        
        console.log("[GET] Buscando dados em:", urlGet);
        
        const res = await fetch(urlGet);
        if (!res.ok) throw new Error("Erro ao obter dados do servidor.");
        
        const dados = await res.json();
        let oco = null;

        if (Array.isArray(dados)) {
            oco = dados.find(item => {
                const itemNum = item.numero_ocorrencias ?? item.id ?? 0;
                const itemMaq = item.id_maquinas ?? 0;
                const itemColab = item.id_colaboradores ?? 0;
                const itemProd = item.id_produtos ?? 0;

                return itemNum.toString() === numOcoUrl.toString() &&
                       itemMaq.toString() === idMaqUrl.toString() &&
                       itemColab.toString() === idColabUrl.toString() &&
                       itemProd.toString() === idProdUrl.toString();
            });
            if (!oco && dados.length > 0) oco = dados[0];
        } else {
            oco = dados;
        }

        if (!oco) {
            console.error("Nenhum dado encontrado.");
            return;
        }

        console.log("[Dados Carregados]", oco);

        // =========================================================================
        // APLICAÇÃO DOS DADOS USANDO A INJEÇÃO INTELIGENTE
        // =========================================================================
        
        // Número da Ocorrência e Lote
        if (inputNumero) inputNumero.value = oco.numero_ocorrencias ?? "";
        
        const inputLote = document.getElementById('ocorrencias-lote-produto') || document.getElementById('lote') || document.querySelector('input[placeholder*="lote"]');
        preencherCampoInteligente(inputLote, oco.lote_produtos);

        // Nota Fiscal
        const inputNotaFiscal = document.getElementById('ocorrencias-nota-fiscal') || document.getElementById('numero_nota_fiscal') || document.getElementById('nota_fiscal') || document.getElementById('numero_nota') || document.querySelector('input[placeholder*="nota"]');
        preencherCampoInteligente(inputNotaFiscal, oco.numero_nota ?? oco.numero_nota_fiscal);

        // Datas
        const inputData = document.getElementById('ocorrencias-data') || document.getElementById('data');
        if (inputData && oco.data_ocorrencias) {
            inputData.value = oco.data_ocorrencias.split('.')[0].replace(' ', 'T').substring(0, 16);
        }
        const inputPrazo = document.getElementById('ocorrencias-data-prazo') || document.getElementById('data_prazo') || document.getElementById('prazo') || document.querySelector('input[type="date"]');
        if (inputPrazo && oco.data_prazo) {
            inputPrazo.value = oco.data_prazo.split(' ')[0].split('T')[0];
        }

        // TEXTAREAS / INPUTS (Problema e 5W2H)
        const inputProblema = document.getElementById('ocorrencias-problema') || document.getElementById('problema') || document.querySelector('textarea[placeholder*="Problema"]') || document.querySelector('input[name*="problema"]');
        preencherCampoInteligente(inputProblema, oco.problema);

        const inputOndeFalha = document.getElementById('ocorrencias-onde-falha') || document.getElementById('onde_ocorreu_falha') || document.getElementById('falha_onde') || document.querySelector('textarea[placeholder*="onde"]');
        preencherCampoInteligente(inputOndeFalha, oco.falha_onde);

        const inputComoFalha = document.getElementById('ocorrencias-como-falha') || document.getElementById('como_ocorreu_falha') || document.getElementById('falha_como') || document.querySelector('textarea[placeholder*="como"]');
        preencherCampoInteligente(inputComoFalha, oco.falha_como);

        const inputQuandoFalha = document.getElementById('ocorrencias-quando-falha') || document.getElementById('quando_ocorreu_falha') || document.getElementById('falha_quando') || document.querySelector('textarea[placeholder*="quando"]');
        preencherCampoInteligente(inputQuandoFalha, oco.falha_quando);

        const inputQuemEnvolvido = document.getElementById('ocorrencias-quem-envolvido') || document.getElementById('quem_estava_envolvido') || document.getElementById('falha_quem') || document.querySelector('textarea[placeholder*="quem"]');
        preencherCampoInteligente(inputQuemEnvolvido, oco.falha_quem);

        // CHAVES E SELETORES CRÍTICOS (Mapeamento Flexível)
        const inputColaborador = document.getElementById('ocorrencias-colaborador') || document.getElementById('colaborador') || document.querySelector('[name*="colaborador"]') || document.querySelector('input[placeholder*="Colaborador"]');
        preencherCampoInteligente(inputColaborador, oco.id_colaboradores);

        const inputProduto = document.getElementById('ocorrencias-produto') || document.getElementById('produto') || document.querySelector('[name*="produto"]') || document.querySelector('input[placeholder*="Produto"]');
        preencherCampoInteligente(inputProduto, oco.id_produtos);

        const inputMaquina = document.getElementById('ocorrencias-maquina') || document.getElementById('id_maquinas') || document.getElementById('maquina') || document.querySelector('[name*="maquina"]');
        preencherCampoInteligente(inputMaquina, oco.id_maquinas);

        // Ações Corretivas e Observações
        const inputAcoesCorretivas = document.getElementById('acoes_corretivas') || document.getElementById('ocorrencias-acoes-corretivas') || document.getElementById('acao_corretiva') || document.querySelector('textarea[placeholder^="Digite as ações corretivas"]');
        preencherCampoInteligente(inputAcoesCorretivas, oco.acao_corretiva);

        const inputObservacao = document.getElementById('observacoes') || document.getElementById('ocorrencias-observacao') || document.querySelector('textarea[placeholder*="Observações"]') || ([...document.querySelectorAll('textarea')].find(el => el.placeholder === "" && el.previousElementSibling?.textContent.includes("Observações")));
        preencherCampoInteligente(inputObservacao, oco.observacoes);

        // Situação / Status
        const selectSituacao = document.getElementById('ocorrencias-situacao') || document.getElementById('situacao') || document.getElementById('status') || document.querySelector('select');
        preencherCampoInteligente(selectSituacao, oco.situacao);

        // =========================================================================
        // FOTO / PREVIEW (Mantido)
        // =========================================================================
        try {
            let containerUpload = document.querySelector('.upload-area') || document.querySelector('.foto-container') || document.querySelector('div[style*="dashed"]');
            if (!containerUpload) {
                const divs = document.querySelectorAll('div, label');
                for (let i = 0; i < divs.length; i++) {
                    if (divs[i].textContent.includes("Clique/Toque para usar a Câmera ou arraste")) {
                        containerUpload = divs[i]; break;
                    }
                }
            }
            const inputFiltradoFile = document.querySelector('input[type="file"]') || document.getElementById('foto');

            if (containerUpload) {
                containerUpload.style.display = 'flex';
                containerUpload.style.flexDirection = 'column';
                containerUpload.style.alignItems = 'flex-start';
                containerUpload.style.padding = '15px 20px';
            }

            function anexarMiniFotoEsquerda(base64Data) {
                if (!containerUpload) return;
                const antigo = containerUpload.querySelector('.bloco-mini-preview');
                if (antigo) antigo.remove();

                const bloco = document.createElement('div');
                bloco.classList.add('bloco-mini-preview');
                bloco.style.position = 'relative';
                bloco.style.marginTop = '5px';
                bloco.style.padding = '4px';
                bloco.style.backgroundColor = '#ffffff';
                bloco.style.border = '1px solid #e2e8f0';
                bloco.style.borderRadius = '6px';

                const img = document.createElement('img');
                img.src = base64Data;
                img.style.height = '65px';
                img.style.objectFit = 'contain';

                const btnX = document.createElement('button');
                btnX.innerHTML = '&times;';
                btnX.type = 'button';
                btnX.style.position = 'absolute';
                btnX.style.top = '-8px';
                btnX.style.right = '-8px';
                btnX.style.backgroundColor = '#dc3545';
                btnX.style.color = '#ffffff';
                btnX.style.border = 'none';
                btnX.style.borderRadius = '50%';
                btnX.style.cursor = 'pointer';

                btnX.onclick = function(e) {
                    e.stopPropagation(); bloco.remove(); oco.foto = "";
                    if (inputFiltradoFile) inputFiltradoFile.value = "";
                };

                bloco.appendChild(img); bloco.appendChild(btnX);
                containerUpload.appendChild(bloco);
            }

            if (oco.foto && oco.foto.trim() !== "" && oco.foto.startsWith('data:image')) {
                anexarMiniFotoEsquerda(oco.foto);
            }
        } catch (e) { console.error("Erro foto:", e); }

        // Bloqueio de concorrência
        window.prepararEdicaoCompletaPorId = function() {};
        window.buscarOcorrenciaPorId = function() { return null; };

    } catch (err) {
        console.error("Erro crítico:", err);
    }
});

function atualizarControlesPaginacaoOcorrencias(totalPaginas) {
    const btnAnterior = document.getElementById('btn-anterior-ocorrencias');
    const btnProximo = document.getElementById('btn-proximo-ocorrencias');
    const infoPaginacao = document.getElementById('info-paginacao-ocorrencias');

    if (infoPaginacao) infoPaginacao.innerText = `Página ${paginaAtualOcorrencias} de ${totalPaginas}`;
    if (btnAnterior) btnAnterior.disabled = (paginaAtualOcorrencias === 1);
    if (btnProximo) btnProximo.disabled = (paginaAtualOcorrencias === totalPaginas);
}

// =========================================================================
// FUNÇÃO DE BUSCA DOS DADOS NA API (CRUD)
// =========================================================================
async function listarOcorrenciasCRUD() {
    const tabela = document.getElementById('tabela-ocorrencias') || document.querySelector('tbody');
    
    try {
        const resposta = await fetch(`${API_URL}/ocorrencias/`, { cache: 'no-store' });
        if (!resposta.ok) throw new Error(`Erro na requisição: ${resposta.status}`);

        todasOcorrencias = await resposta.json();
        
        if (!Array.isArray(todasOcorrencias)) {
            if (todasOcorrencias.registros && Array.isArray(todasOcorrencias.registros)) {
                todasOcorrencias = todasOcorrencias.registros;
            } else if (todasOcorrencias.data && Array.isArray(todasOcorrencias.data)) {
                todasOcorrencias = todasOcorrencias.data;
            } else {
                todasOcorrencias = [];
            }
        }

        filtrarEAtualizarTabelaOcorrencias();

    } catch (erro) {
        console.error("Erro crítico ao listar ocorrências:", erro);
        if (tabela) {
            tabela.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">⚠️ Falha ao carregar dados do servidor. Verifique a conexão.</td></tr>`;
        }
    }
}   

// =========================================================================
// ELEMENTOS DOS COMBOS DINÂMICOS (DATALISTS E POPULAÇÃO DOS ARRAYS GLOBAIS)
// =========================================================================
async function carregarMaquinasNoSelect() {
    const inputBusca = document.getElementById('maquinas-nome-busca');
    const datalistMaquinas = document.getElementById('lista-maquinas-datalist');
    const inputIdOculto = document.getElementById('maquinas-nome') || document.querySelector('input[id*="maquinas"]:not([id*="situacao"])');

    try {
        const res = await fetch(`${API_URL}/maquinas/`, { cache: 'no-store' });
        if (res.ok) {
            const maquinas = await res.json();
            window.listaDeMaquinas = maquinas; 

            if (!inputBusca || !datalistMaquinas || !inputIdOculto) return;
            maquinas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            inputBusca.setAttribute('list', 'lista-maquinas-datalist');

            datalistMaquinas.innerHTML = maquinas.map(m => {
                const id_Maquinas = m.id_maquinas || m.id || m._id;
                return `<option value="${m.nome}" data-id="${id_Maquinas}"></option>`;
            }).join('');

            inputBusca.addEventListener('input', function() {
                const valorDigitado = this.value.trim();
                const opcaoSelecionada = Array.from(datalistMaquinas.options).find(opt => opt.value.trim() === valorDigitado);
                if (opcaoSelecionada) inputIdOculto.value = opcaoSelecionada.getAttribute('data-id');
                else if (valorDigitado === "") inputIdOculto.value = "";
            });
        }
    } catch (e) { console.error("Erro ao carregar máquinas:", e); }
}

async function carregarColaboradoresNoSelect() {
    const inputBusca = document.getElementById('colaboradores-nome-busca');
    const datalistColaboradores = document.getElementById('lista-colaboradores-datalist');
    const inputIdOculto = document.getElementById('colaboradores-nome') || document.querySelector('input[id*="colaboradores"]:not([id*="situacao"])');

    try {
        const res = await fetch(`${API_URL}/colaboradores/`, { cache: 'no-store' });
        if (res.ok) {
            const colaboradores = await res.json();
            window.listaDeColaboradores = colaboradores; 

            if (!inputBusca || !datalistColaboradores || !inputIdOculto) return;
            colaboradores.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            inputBusca.setAttribute('list', 'lista-colaboradores-datalist');

            datalistColaboradores.innerHTML = colaboradores.map(c => {
                const id_Colaboradores = c.id_colaboradores || c.id_Colaboradores || c.id || c._id;
                return `<option value="${c.nome}" data-id="${id_Colaboradores}"></option>`;
            }).join('');

            inputBusca.addEventListener('input', function() {
                const valorDigitado = this.value.trim();
                const opcaoSelecionada = Array.from(datalistColaboradores.options).find(opt => opt.value.trim() === valorDigitado);
                if (opcaoSelecionada) inputIdOculto.value = opcaoSelecionada.getAttribute('data-id');
                else if (valorDigitado === "") inputIdOculto.value = "";
            });
        }
    } catch (e) { console.error("Erro ao carregar colaboradores:", e); }
}

async function carregarProdutosNoSelect() {
    const inputBusca = document.getElementById('produtos-nome-busca');
    const datalistProdutos = document.getElementById('lista-produtos-datalist');
    const inputIdOculto = document.getElementById('produtos-nome') || document.querySelector('input[id*="produtos"]:not([id*="situacao"])');

    try {
        const res = await fetch(`${API_URL}/produtos/`, { cache: 'no-store' });
        if (res.ok) {
            const produtos = await res.json();
            window.listaDeProdutos = produtos; 

            if (!inputBusca || !datalistProdutos || !inputIdOculto) return;
            produtos.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            inputBusca.setAttribute('list', 'lista-produtos-datalist');

            datalistProdutos.innerHTML = produtos.map(p => {
                const id_Produtos = p.id_produtos || p.id_Produtos || p.id || p._id;
                return `<option value="${p.nome}" data-id="${id_Produtos}"></option>`;
            }).join('');

            inputBusca.addEventListener('input', function() {
                const valorDigitado = this.value.trim();
                const opcaoSelecionada = Array.from(datalistProdutos.options).find(opt => opt.value.trim() === valorDigitado);
                if (opcaoSelecionada) inputIdOculto.value = opcaoSelecionada.getAttribute('data-id');
                else if (valorDigitado === "") inputIdOculto.value = "";
            });
        }
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}

// =========================================================================
// INTERCEPTADOR DE URL (GERENCIA A CARGA DA PÁGINA EM MODO EDIÇÃO)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const parametros = new URLSearchParams(window.location.search);
    const idParaEditar = parametros.get('editar');
    
    if (idParaEditar) {
        setTimeout(() => {
            window.prepararEdicaoCompletaPorId(idParaEditar);
        }, 800);
    }
});

// ALTERAÇÃO 2: Garante que o ID limpo seja testado e redireciona na MESMA aba para prosseguir
window.irParaEdicao = function(loteProduto) {
    console.log("Lote capturado no clique de edição:", loteProduto);
    
    if (!loteProduto || loteProduto === "undefined" || loteProduto === "null" || loteProduto.toString().trim() === "") {
        dispararNotificacao("Erro: O sistema não conseguiu resgatar o Lote desta linha.", "danger");
        return;
    }

    const loteLimpo = loteProduto.toString().trim();

    // Redireciona passando o lote no parâmetro 'editar' conforme o padrão do seu sistema
    window.location.href = `ocorrencias_editar.html?editar=${loteLimpo}`;
};

// =========================================================================
// FUNÇÃO DEFINITIVA DE CARGA E PREENCHIMENTO DO FORMULÁRIO (BUSCA INTELIGENTE)
// =========================================================================
window.prepararEdicaoCompletaPorId = async function(loteOuNumeroRecebido) {
    if (!loteOuNumeroRecebido) return;
    try {
        const resposta = await fetch(`${API_URL}/ocorrencias/`, { cache: 'no-store' });
        if (!resposta.ok) throw new Error(`Status: ${resposta.status}`);
        
        let dados = await resposta.json();
        if (!Array.isArray(dados)) {
            dados = dados.registros || dados.data || [];
        }

        const termoBusca = loteOuNumeroRecebido.toString().trim();

        // BUSCA MULTICRITÉRIO: Procura por lote_produtos OU pelo numero_ocorrencias
        const ocorrencia = dados.find(o => {
            const loteAtual = (o.lote_produtos ?? "").toString().trim();
            const numeroAtual = (o.numero_ocorrencias ?? "").toString().trim();
            
            return loteAtual === termoBusca || numeroAtual === termoBusca;
        });

        if (!ocorrencia) {
            console.warn("Nenhuma ocorrência encontrada com o Lote/Número: " + loteOuNumeroRecebido);
            return;
        }

        // =====================================================================
        // CONSOLE.LOG DE AJUSTE: Exibe o objeto exato da ocorrência encontrada
        // =====================================================================
        console.log("=== OCORRÊNCIA ENCONTRADA (OBJETO COMPLETO) ===");
        console.log(ocorrencia);
        window.ocorrenciaDebug = ocorrencia; // Permite digitar 'window.ocorrenciaDebug' no console
        // =====================================================================

        // A chave de referência para salvar de volta (PUT) será o lote real do produto encontrado
        const chaveLoteReferencia = ocorrencia.lote_produtos || termoBusca;
        
        // CORREÇÃO: Função refinada para buscar o ID correto e injetar a string de texto no input visível
        const sincronizarDatalist = (idInputBusca, idInputHidden, idDatalist, valorId, listaGlobal, nomeCampo) => {
            const inputBusca = document.getElementById(idInputBusca);
            const inputHidden = document.getElementById(idInputHidden);
            const datalist = document.getElementById(idDatalist);
            
            if (inputHidden) inputHidden.value = valorId || "";
            
            // CONSOLE.LOG DE AJUSTE: Verifica o ID recebido e se os elementos HTML existem na tela
            console.log(`[Datalist ${nomeCampo}] ID recebido da API:`, valorId, `| Input Busca existe?`, !!inputBusca, `| Lista global existe?`, Array.isArray(listaGlobal));

            if (valorId && inputBusca) {
                let nomeEncontrado = "";
                
                // 1. Procura primeiro na lista global se ela existir
                if (listaGlobal && Array.isArray(listaGlobal)) {
                    const encontrado = listaGlobal.find(x => {
                        const idItem = (x.id || x._id || x.id_maquinas || x.id_colaboradores || x.id_produtos || "").toString();
                        return idItem === valorId.toString();
                    });
                    if (encontrado) {
                        nomeEncontrado = encontrado.nome || encontrado.value || encontrado.descricao || "";
                    }
                }
                
                // 2. Se não achou na lista global, tenta buscar pelo atributo 'data-id' nas options do datalist HTML
                if (!nomeEncontrado && datalist) {
                    const opcao = Array.from(datalist.options).find(opt => opt.getAttribute('data-id')?.toString() === valorId.toString());
                    if (opcao) nomeEncontrado = opcao.value;
                }
                
                // CONSOLE.LOG DE AJUSTE: Verifica se conseguiu traduzir o ID em Nome amigável
                console.log(`[Datalist ${nomeCampo}] Nome localizado para exibição:`, nomeEncontrado || "MÉTODO FALHOU (Não achou o ID nas listas)");

                // Aplica o nome de exibição no input correspondente (ou o próprio ID como fallback temporário para não sumir)
                inputBusca.value = nomeEncontrado || valorId;
            }
        };

        // Executa a sincronização mapeando as chaves exatas do console
        sincronizarDatalist('maquinas-nome-busca', 'maquinas-nome', 'lista-maquinas-datalist', ocorrencia.id_maquinas, window.listaDeMaquinas, 'Máquinas');
        sincronizarDatalist('colaboradores-nome-busca', 'colaboradores-nome', 'lista-colaboradores-datalist', ocorrencia.id_colaboradores, window.listaDeColaboradores, 'Colaboradores');
        sincronizarDatalist('produtos-nome-busca', 'produtos-nome', 'lista-produtos-datalist', ocorrencia.id_produtos, window.listaDeProdutos, 'Produtos');

        const setValor = (idCampo, valor) => {
            const el = document.getElementById(idCampo) || document.getElementById(idCampo.replace('ocorrencias-', '')); // Fallback de ID se faltar o prefixo
            if (el) el.value = valor ?? "";
        };

        // CORREÇÃO: Propriedades mapeadas estritamente iguais às do JSON exibido no console
        setValor('ocorrencias-id', chaveLoteReferencia); 
        setValor('ocorrencias-numero', ocorrencia.numero_ocorrencias);
        setValor('ocorrencias-lote-produto', ocorrencia.lote_produtos);
        setValor('ocorrencias-numero-nota-fiscal', ocorrencia.numero_nota || ocorrencia.numero_nota_fiscal); // Tratado fallback de nomenclatura
        setValor('ocorrencias-situacao', ocorrencia.situacao);
        setValor('ocorrencias-problema', ocorrencia.problema);
        setValor('ocorrencias-falha-onde', ocorrencia.falha_onde);
        setValor('ocorrencias-falha-como', ocorrencia.falha_como);
        setValor('ocorrencias-falha-quando', ocorrencia.falha_quando);
        setValor('ocorrencias-falha-quem', ocorrencia.falha_quem);
        setValor('ocorrencias-observacoes', ocorrencia.observacoes);
        setValor('ocorrencias-acao-corretiva', ocorrencia.acao_corretiva);

        // CORREÇÃO: Formatação correta do input datetime-local baseado na propriedade 'data_criacao' ou 'data_ocorrencias'
        const campoData = document.getElementById('ocorrencias-data') || document.getElementById('data');
        if (campoData) {
            const dataBruta = ocorrencia.data_ocorrencias || ocorrencia.data_criacao || ocorrencia.data;
            if (dataBruta) {
                // Substitui o espaço por 'T' para o formato exigido pelo HTML5 (YYYY-MM-DDTHH:MM)
                campoData.value = String(dataBruta).trim().replace(' ', 'T').substring(0, 16);
            }
        }

        const campoPrazo = document.getElementById('ocorrencias-data-prazo') || document.getElementById('prazo');
        if (campoPrazo && ocorrencia.data_prazo) {
            campoPrazo.value = String(ocorrencia.data_prazo).substring(0, 10);
        }

        if (ocorrencia.foto) {
            FOTO_OCORRENCIA_BASE64 = ocorrencia.foto;
            const fotoPreview = document.getElementById('foto-preview');
            const previewContainer = document.getElementById('preview-container');
            const uploadInstrucoes = document.getElementById('upload-instrucoes');

            if (fotoPreview) fotoPreview.src = ocorrencia.foto;
            previewContainer?.classList.remove('d-none');
            uploadInstrucoes?.classList.add('d-none');
        }

        const tituloForm = document.getElementById('titulo-form-colab');
        if (tituloForm) tituloForm.innerHTML = `<i class="fa-solid fa-pencil me-3"></i> Editar Ocorrência Lote: ${ocorrencia.lote_produtos}`;

        const tagIdHeader = document.getElementById('exibir-id-edicao');
        if (tagIdHeader) tagIdHeader.textContent = `Lote: ${ocorrencia.lote_produtos}`;

    } catch (erro) {
        console.error("Erro ao processar preenchimento:", erro);
    }
};

// =========================================================================
// FUNÇÃO CENTRALIZADA DE NOTIFICAÇÃO (TOAST)
// =========================================================================
function dispararNotificacao(mensagem, acao = 'sucesso') {
    const elementoToast = document.getElementById('toast-cadastro');
    const textoToast = document.getElementById('toast-mensagem-texto');
    const iconeToast = document.getElementById('toast-mensagem-icone');
    
    if (!elementoToast || !textoToast) {
        console.warn("Elementos do Toast não foram localizados no HTML.");
        return;
    }

    textoToast.innerText = message = mensagem;

    if (acao === 'sucesso' || acao === 'atualizar' || acao === 'criar') {
        elementoToast.className = "toast align-items-center text-white bg-success border-0 shadow";
        if (iconeToast) iconeToast.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>`;
    } else {
        elementoToast.className = "toast align-items-center text-white bg-danger border-0 shadow";
        if (iconeToast) iconeToast.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i>`;
    }

    if (typeof bootstrap !== "undefined" && bootstrap.Toast) {
        const bootstrapToast = new bootstrap.Toast(elementoToast, { delay: 3500 });
        bootstrapToast.show();
    } else {
        elementoToast.classList.add('show');
        setTimeout(() => elementoToast.classList.remove('show'), 3500);
    }
}

// =========================================================================
// SISTEMA DE NOTIFICAÇÃO TOAST INJETADO DINAMICAMENTE (EMBAIXO À DIREITA)
// =========================================================================
function dispararNotificacaoOcorrencia(mensagem, tipo = "sucesso") {
    let container = document.getElementById('toast-container-sistema');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container-sistema';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 15px 20px;
        border-radius: 6px;
        color: #fff;
        font-family: sans-serif;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        min-width: 250px;
    `;

    if (tipo === "sucesso") {
        toast.style.backgroundColor = "#2ecc71";
    } else if (tipo === "danger") {
        toast.style.backgroundColor = "#e74c3c";
    } else {
        toast.style.backgroundColor = "#3498db";
    }

    toast.innerText = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 10);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";
        setTimeout(() => { toast.remove(); }, 300);
    }, 3500);
}

// =========================================================================
// PREENCHIMENTO DO FORMULÁRIO EM CASO DE EDIÇÃO (CORRIGE TELA EM BRANCO)
// =========================================================================
async function verificarEDirecionarEdicao() {
    const paramsURL = new URLSearchParams(window.location.search);
    const estaEditando = paramsURL.has('editar') || paramsURL.has('numero_ocorrencias');

    if (!estaEditando) return; // Se for cadastro novo, ignora o preenchimento

    // Desativa o campo do número se sua lógica não permitir alterar o ID visualmente
    const inputNumero = document.getElementById('ocorrencias-numero');
    if (inputNumero) inputNumero.readOnly = true;

    try {
        const numOco = paramsURL.get('numero_ocorrencias');
        const dataOco = paramsURL.get('data_ocorrencias');
        const idMaq = paramsURL.get('id_maquinas');
        const idColab = paramsURL.get('id_colaboradores');
        const idProd = paramsURL.get('id_produtos');

        // Busca a ocorrência específica usando as chaves compostas exigidas pelo backend
        const urlGet = `${API_URL}/ocorrencias/?data_ocorrencias=${encodeURIComponent(dataOco)}&id_maquinas=${idMaq}&id_colaboradores=${idColab}&id_produtos=${idProd}&numero_ocorrencias=${numOco}`;
        
        const res = await fetch(urlGet);
        if (!res.ok) throw new Error("Erro ao buscar dados do registro.");
        
        const dados = await res.json();
        // Caso a API retorne uma lista filtrada, pega o primeiro item
        const oco = Array.isArray(dados) ? dados[0] : dados;

        if (!oco) {
            dispararNotificacaoOcorrencia("Ocorrência não encontrada no banco de dados.", "danger");
            return;
        }

        // --- PREENCHIMENTO DOS CAMPOS ---
        if (inputNumero) inputNumero.value = oco.numero_ocorrencias || "";
        
        const inputLote = document.getElementById('ocorrencias-lote-produto');
        if (inputLote) inputLote.value = oco.lote_produtos || "";

        const inputData = document.getElementById('ocorrencias-data');
        if (inputData && oco.data_ocorrencias) {
            inputData.value = oco.data_ocorrencias.replace('T', ' ').substring(0, 16);
        }

        const inputProblema = document.getElementById('ocorrencias-problema');
        if (inputProblema) inputProblema.value = oco.problema || "";

        const selectSituacao = document.getElementById('ocorrencias-situacao');
        if (selectSituacao) selectSituacao.value = oco.situacao || "Pendente";

        // Preenchimento dos IDs Ocultos e nomes de Busca (Datalist)
        definirValorEDatalist('maquinas-nome', 'maquinas-nome-busca', 'lista-maquinas-datalist', oco.id_maquinas);
        definirValorEDatalist('colaboradores-nome', 'colaboradores-nome-busca', 'lista-colaboradores-datalist', oco.id_colaboradores);
        definirValorEDatalist('produtos-nome', 'produtos-nome-busca', 'lista-produtos-datalist', oco.id_produtos);

    } catch (err) {
        console.error("Erro ao carregar dados para edição:", err);
        dispararNotificacaoOcorrencia("Não foi possível carregar os dados desta ocorrência.", "danger");
    }
}

// Função auxiliar para redefinir o campo oculto e colocar o nome correto no input visível do datalist
function definirValorEDatalist(idHidden, idBusca, idDatalist, idVal) {
    const hidden = document.getElementById(idHidden);
    const busca = document.getElementById(idBusca);
    const datalist = document.getElementById(idDatalist);

    if (hidden && idVal) hidden.value = idVal;
    
    if (busca && datalist && idVal) {
        const opcao = Array.from(datalist.options).find(opt => opt.getAttribute('data-id')?.toString() === idVal.toString());
        if (opcao) busca.value = opcao.value;
    }
}

// =========================================================================
// SALVAR OU ALTERAR REGISTRO POR NÚMERO DE OCORRÊNCIA
// =========================================================================
function vincularSalvamentoOcorrencia() {
    const formulario = document.getElementById('formOcorrencias') || document.querySelector('form');
    
    if (formulario) {
        formulario.removeAttribute('onsubmit');
        formulario.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            await executarEnvioOcorrencia();
        });
    }

    const botaoSubmit = document.querySelector('button[type="submit"]');
    if (botaoSubmit) {
        botaoSubmit.addEventListener('click', async (e) => {
            e.preventDefault();
            await executarEnvioOcorrencia();
        });
    }

    // Executa o carregamento dos dados se a página for de Edição
    verificarEDirecionarEdicao();
}

// =========================================================================
// Gerenciador do Preview de Imagem e Conversão Base64 (Abertura Única)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const containerFoto = document.getElementById('dropzone-foto');
    const inputOculto = document.getElementById('ocorrencias-foto-ocorrencia');
    const previewContainer = document.getElementById('preview-container');
    const fotoPreviewElement = document.getElementById('foto-preview');
    const instrucoesUpload = document.getElementById('upload-instrucoes');
    const btnRemoverFoto = document.getElementById('btn-remover-foto');

    // 1. Abre a janela do arquivo APENAS UMA VEZ matando cliques fantasmas
    if (containerFoto && inputOculto) {
        containerFoto.onclick = function(e) {
            // Se clicou no botão de remover (X), não faz nada
            if (e.target.closest('#btn-remover-foto')) return; 
            
            e.preventDefault();  // Cancela qualquer duplicação do navegador
            e.stopPropagation(); // Para o evento aqui
            inputOculto.click(); // Dispara o clique real de forma controlada
        };
    }

    // 2. Escuta a seleção do arquivo e renderiza na tela imediatamente
    if (inputOculto) {
        inputOculto.onchange = function(e) {
            e.stopPropagation();
            
            const arquivoSelecionado = e.target.files[0];
            if (arquivoSelecionado) {
                const leitorArquivo = new FileReader();
                leitorArquivo.onload = function(evento) {
                    const base64Gerado = evento.target.result;
                    
                    // Altera a imagem do preview
                    if (fotoPreviewElement) {
                        fotoPreviewElement.src = base64Gerado;
                    }
                    
                    // Atualiza a interface gráfica na hora
                    if (previewContainer) previewContainer.classList.remove('d-none');
                    if (instrucoesUpload) instrucoesUpload.classList.add('d-none');
                };
                leitorArquivo.readAsDataURL(arquivoSelecionado);
            }
        };
    }

    // 3. Botão para resetar a imagem
    if (btnRemoverFoto) {
        btnRemoverFoto.onclick = function(e) {
            e.stopPropagation(); 
            if (inputOculto) inputOculto.value = "";
            if (fotoPreviewElement) fotoPreviewElement.src = "";
            if (previewContainer) previewContainer.classList.add('d-none');
            if (instrucoesUpload) instrucoesUpload.classList.remove('d-none');
        };
    }
});

// =========================================================================
// Função de Envio/Atualização da Ocorrência (Blindagem de Textos e Listagem)
// =========================================================================
window.executarEnvioOcorrencia = async function() {
    const paramsURL = new URLSearchParams(window.location.search);
    const estaEditando = paramsURL.has('editar') || paramsURL.has('numero_ocorrencias');
    const metodo = estaEditando ? 'PUT' : 'POST';

    try {
        const obtenerIdValido = (idInputBusca, idDatalist, idInputHidden) => {
            const inputBusca = document.getElementById(idInputBusca);
            const inputHidden = document.getElementById(idInputHidden);
            const datalist = document.getElementById(idDatalist);
            
            let idFinal = parseInt(inputHidden?.value, 10);
            
            if ((isNaN(idFinal) || idFinal <= 0) && inputBusca && inputBusca.value.trim() !== "" && datalist) {
                const textoBusca = inputBusca.value.trim().toLowerCase();
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim().toLowerCase() === textoBusca);
                if (opcao) {
                    idFinal = parseInt(opcao.getAttribute('data-id'), 10);
                }
            }
            return idFinal;
        };

        // 1. Recuperação e salvaguarda dos IDs de Relacionamento
        const idMaquinasTela = obtenerIdValido('maquinas-nome-busca', 'lista-maquinas-datalist', 'maquinas-nome');
        const idColaboradoresTela = obtenerIdValido('colaboradores-nome-busca', 'lista-colaboradores-datalist', 'colaboradores-nome');
        const idProdutosTela = obtenerIdValido('produtos-nome-busca', 'lista-produtos-datalist', 'produtos-nome');
        
        const numeroOcoTela = parseInt(document.getElementById('ocorrencias-numero')?.value, 10) || 0;
        const campoDataOcorrencia = document.getElementById('ocorrencias-data')?.value;
        let dataOcorrenciaIso = campoDataOcorrencia ? campoDataOcorrencia.replace(' ', 'T') : new Date().toISOString().slice(0, 19);
        if (dataOcorrenciaIso.length === 16) dataOcorrenciaIso += ":00";

        // Objeto global que armazena os dados vindos do banco de dados
        const ocoSeguro = (typeof oco !== 'undefined' && oco !== null) ? oco : {};

        const maqFinal = idMaquinasTela > 0 ? idMaquinasTela : (parseInt(ocoSeguro.id_maquinas || ocoSeguro.maquina_id, 10) || 0);
        const colabFinal = idColaboradoresTela > 0 ? idColaboradoresTela : (parseInt(ocoSeguro.id_colaboradores || ocoSeguro.colaborador_id, 10) || 0);
        const prodFinal = idProdutosTela > 0 ? idProdutosTela : (parseInt(ocoSeguro.id_produtos || ocoSeguro.produto_id, 10) || 0);
        const numOcorrenciaFinal = numeroOcoTela > 0 ? numeroOcoTela : (parseInt(ocoSeguro.numero_ocorrencias, 10) || 0);
        
        let dataOcoFinal = dataOcorrenciaIso;
        if (estaEditando && (!campoDataOcorrencia || campoDataOcorrencia.trim() === "")) {
            dataOcoFinal = ocoSeguro.data_ocorrencias || dataOcoFinal;
        }

        if (isNaN(maqFinal) || maqFinal <= 0 || isNaN(colabFinal) || colabFinal <= 0 || isNaN(prodFinal) || prodFinal <= 0) {
            console.error("IDs inválidos detetados antes do envio:", { maqFinal, colabFinal, prodFinal });
            dispararNotificacaoOcorrencia("Erro: IDs de relacionamento inválidos ou zerados.", "danger");
            return;
        }

        // Rota de Query Params do FastAPI
        const urlFinal = `${API_URL}/ocorrencias/?` +
            `data_ocorrencias=${encodeURIComponent(dataOcoFinal)}&` +
            `id_maquinas=${maqFinal}&` +
            `id_colaboradores=${colabFinal}&` +
            `id_produtos=${prodFinal}&` +
            `numero_ocorrencias=${numOcorrenciaFinal}`;

        // Tratamento de datas
        const campoDataPrazo = document.getElementById('ocorrencias-data-prazo')?.value;
        const dataPrazoTratada = (campoDataPrazo && campoDataPrazo.trim() !== "") ? campoDataPrazo : (ocoSeguro.data_prazo || null);
        
        // --- LEITURA DO BASE64 ATUALIZADO PELA FUNÇÃO COMPORTAMENTAL ---
        let fotoTratada = null;
        const previewContainer = document.getElementById('preview-container');
        const fotoPreviewElement = document.getElementById('foto-preview');

        if (previewContainer && previewContainer.classList.contains('d-none')) {
            fotoTratada = null; // Usuário apagou a foto no botão X
        } else if (fotoPreviewElement && fotoPreviewElement.src && fotoPreviewElement.src.includes('data:image')) {
            const decolagemBase64 = fotoPreviewElement.src.indexOf('data:image');
            fotoTratada = fotoPreviewElement.src.substring(decolagemBase64);
        } else {
            fotoTratada = ocoSeguro.foto && ocoSeguro.foto.trim() !== "" ? ocoSeguro.foto : null;
        }

        // Helper interno para ler a tela, mas manter o valor do banco caso esteja em branco
        const obterValorCampo = (idElemento, propriedadeBackup) => {
            const valorTela = document.getElementById(idElemento)?.value;
            if (estaEditando && (!valorTela || valorTela.trim() === "")) {
                return ocoSeguro[propriedadeBackup] !== undefined ? String(ocoSeguro[propriedadeBackup]) : "";
            }
            return valorTela || "";
        };

        // =========================================================================
        // CONSTRUÇÃO DO PAYLOAD BLINDADO (Definitivo conforme chaves reais da API)
        // =========================================================================
        const payloadBody = {
            id_maquinas: maqFinal,
            id_colaboradores: colabFinal,
            id_produtos: prodFinal,
            data_ocorrencias: dataOcoFinal,
            numero_ocorrencias: numOcorrenciaFinal,
            
            // Valores Numéricos/Strings de Identificação
            lote_produtos: obterValorCampo('ocorrencias-lote_produto', 'lote_produtos') || "0",
            numero_nota: parseInt(obterValorCampo('ocorrencias-numero_nota', 'numero_nota'), 10) || 0,
            
            // Descrição dos Problemas e Falhas
            problema: obterValorCampo('ocorrencias-problema', 'problema'),
            falha_onde: obterValorCampo('ocorrencias-falha_onde', 'falha_onde'),
            falha_como: obterValorCampo('ocorrencias-falha_como', 'falha_como'),
            falha_quando: obterValorCampo('ocorrencias-falha_quando', 'falha_quando'),
            falha_quem: obterValorCampo('ocorrencias-falha_quem', 'falha_quem'),
            
            // Ação e Situação
            observacoes: obterValorCampo('ocorrencias-observacoes', 'observacoes'),
            acao_corretiva: obterValorCampo('ocorrencias-acao_corretiva', 'acao_corretiva'),
            data_prazo: dataPrazoTratada,
            situacao: document.getElementById('ocorrencias-situacao')?.value || ocoSeguro.situacao || "Pendente",
            foto: fotoTratada
        };

        if (estaEditando && ocoSeguro.id) {
            payloadBody.id = parseInt(ocoSeguro.id, 10);
        }

        console.log(`[${metodo}] Payload Unificado Enviando Foto Atualizada:`, payloadBody);

        const res = await fetch(urlFinal, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadBody)
        });
        
        if (res.ok) {
            dispararNotificacaoOcorrencia(estaEditando ? "Ocorrência atualizada com sucesso!" : "Nova ocorrência cadastrada com sucesso!", "sucesso");
            
            setTimeout(() => { 
                window.location.replace("ocorrencias_listagem.html"); 
            }, 1500);
        } else {
            const erroCorpo = await res.json().catch(() => ({}));
            console.error("Erro retornado pelo FastAPI:", erroCorpo);
            dispararNotificacaoOcorrencia("Erro de validação nos dados. Verifique os campos.", "danger");
        }
    } catch (err) {
        console.error("Erro crítico no envio:", err);
        dispararNotificacaoOcorrencia("Falha de comunicação com o servidor.", "danger");
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof vincularSalvamentoOcorrencia === 'function') vincularSalvamentoOcorrencia();
    });
} else {
    if (typeof vincularSalvamentoOcorrencia === 'function') vincularSalvamentoOcorrencia();
}

/**
 * REIMPRESSÃO PADRONIZADA (COM LOGO DA QC SOFTWARE)
 */
async function reimprimirPorNumeroOcorrencia(numeroOuEvent = null, eventParam = null) {
    let event = null;
    let numBuscado = "";

    // 1. Identifica se passou evento ou número
    if (numeroOuEvent && (numeroOuEvent instanceof Event || typeof numeroOuEvent.preventDefault === 'function' || numeroOuEvent.target)) {
        event = numeroOuEvent;
    } else {
        numBuscado = String(numeroOuEvent || '').trim();
        event = eventParam;
    }

    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (!numBuscado || numBuscado === "undefined" || numBuscado === "[object Object]") {
        const inputElement = document.getElementById('filtro-numero-ocorrencia') || 
                             document.getElementById('input-reimprimir-numero') ||
                             document.querySelector('input[type="number"]');
        numBuscado = inputElement ? inputElement.value.trim() : '';
    }

    if (!numBuscado || numBuscado === "0") {
        alert("⚠️ Informe um número de ocorrência válido para reimprimir.");
        return;
    }

    // 2. Feedback visual no botão
    const btnTarget = (event && event.currentTarget) ? event.currentTarget : null;
    const iconeOriginal = btnTarget ? btnTarget.innerHTML : '';
    if (btnTarget) {
        btnTarget.disabled = true;
        btnTarget.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
    }

    try {
        // 3. Consulta API de Ocorrências
        const response = await fetch('https://sistema.qcsoftware.com.br/ocorrencias/');
        if (!response.ok) throw new Error(`Erro de conexão com o servidor (${response.status})`);

        const lista = await response.json();
        const dados = Array.isArray(lista)
            ? lista.find(item => String(item.numero_ocorrencias || item.id).trim() === numBuscado)
            : null;

        if (!dados) {
            throw new Error(`A ocorrência Nº ${numBuscado} não foi encontrada no banco de dados.`);
        }

        // 4. Busca dinâmica da Logo QC Software na página
        const imgLogoElement = document.querySelector('img[src*="logo"], .sidebar-brand img, .brand-logo, #img-logo');
        const logoSrc = imgLogoElement ? imgLogoElement.src : '';

        // Helper para resgatar nomes
        const getNome = (id, listaGlobal) => {
            if (!id || !Array.isArray(listaGlobal)) return '--';
            const item = listaGlobal.find(x => x.id == id || x.id_maquinas == id || x.id_colaboradores == id || x.id_produtos == id);
            return item ? (item.nome || item.descricao || '--') : `--`;
        };

        const maquina = getNome(dados.id_maquinas, window.listaDeMaquinas);
        const colaborador = getNome(dados.id_colaboradores, window.listaDeColaboradores);
        const produto = getNome(dados.id_produtos, window.listaDeProdutos);
        const dataPrazo = dados.data_prazo ? new Date(dados.data_prazo).toLocaleDateString('pt-BR') : '--/--/----';

        // Tratamento da Foto da Ocorrência
        const fotoUrl = dados.foto || dados.imagem || dados.url_foto || dados.caminho_foto || null;
        const fotoHtml = fotoUrl 
            ? `<img src="${fotoUrl}" alt="Foto da Ocorrência" style="width: 100%; max-height: 130px; border-radius: 4px; border: 1px solid #cbd5e1; object-fit: cover;">`
            : `<div style="background-color: #f8fafc; color: #94a3b8; height: 100px; display: flex; align-items: center; justify-content: center; border-radius: 4px; border: 1px dashed #cbd5e1; font-size: 11px;">Sem Foto</div>`;

        // 5. Limpa relatório anterior
        const relatorioAntigo = document.getElementById('relatorio-print-container');
        if (relatorioAntigo) relatorioAntigo.remove();

        // 6. Constrói o HTML Padrão idêntico ao do cadastro (A4)
        const containerRelatorio = document.createElement('div');
        containerRelatorio.id = 'relatorio-print-container';

        const logoHtml = logoSrc 
            ? `<img src="${logoSrc}" alt="Q.C Software" style="max-height: 55px; width: auto;">`
            : `<h2 style="margin: 0; color: #0f172a; font-weight: bold;">Q.C SOFTWARE</h2>`;

        containerRelatorio.innerHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; padding: 20px; line-height: 1.4;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${logoHtml}
                    </div>
                    <div style="text-align: right;">
                        <h3 style="margin: 0; color: #0284c7; font-size: 20px; font-weight: bold;">Relatório de Não Conformidades</h3>
                        <p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Ocorrência Nº:</strong> <span style="color: #000000; font-weight: bold;">${dados.numero_ocorrencias || dados.id || '--'}</span></p>
                        <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;"><strong>Data de Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    </div>
                </div>

                <div style="border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 16px; border-radius: 6px; background-color: #ffffff;">
                    <h4 style="margin: 0 0 8px 0; color: #0284c7; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; text-transform: uppercase;">1. Não Conformidade</h4>
                    
                    <div style="display: flex; gap: 12px; align-items: flex-start; margin-top: 8px;">
                        
                        <table style="width: 70%; border-collapse: collapse; font-size: 12px;">
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Máquina:</strong> ${maquina}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Colaborador:</strong> ${colaborador}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Produto:</strong> ${produto}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Lote do Produto:</strong> ${dados.lote_produtos || '--'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Número da Nota Fiscal:</strong> ${dados.numero_nota || '--'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 4px 2px;"><strong>Situação:</strong> <span style="font-weight: bold;">${dados.situacao || 'Pendente'}</span></td>
                            </tr>
                        </table>

                        <div style="width: 30%; text-align: center;">
                            <strong>Foto</strong>
                            ${fotoHtml}
                        </div>

                    </div>
                </div>

                <div style="border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 16px; border-radius: 6px; background-color: #ffffff;">
                    <h4 style="margin: 0 0 8px 0; color: #0284c7; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; text-transform: uppercase;">2. Descrição dos Problemas e Falhas (5W2H)</h4>
                    <p style="font-size: 12px; margin: 4px 0 8px 0;"><strong>Descrição do Problema:</strong> ${dados.problema || '--'}</p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <tr>
                            <td style="padding: 5px 4px; width: 50%;"><strong>Onde ocorreu?</strong> ${dados.falha_onde || '--'}</td>
                            <td style="padding: 5px 4px; width: 50%;"><strong>Como ocorreu?</strong> ${dados.falha_como || '--'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 4px;"><strong>Quando ocorreu?</strong> ${dados.falha_quando || '--'}</td>
                            <td style="padding: 5px 4px;"><strong>Quem estava envolvido?</strong> ${dados.falha_quem || '--'}</td>
                        </tr>
                    </table>
                </div>

                <div style="border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 24px; border-radius: 6px; background-color: #ffffff;">
                    <h4 style="margin: 0 0 8px 0; color: #0284c7; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; text-transform: uppercase;">3. Ação e Situação</h4>
                    <p style="font-size: 12px; margin: 4px 0 6px 0;"><strong>Ações Corretivas:</strong> ${dados.acao_corretiva || '--'}</p>
                    <p style="font-size: 12px; margin: 4px 0 6px 0;"><strong>Observações:</strong> ${dados.observacoes || '--'}</p>
                    <p style="font-size: 12px; margin: 4px 0 0 0;"><strong>Data/Prazo para Resolução:</strong> ${dataPrazo}</p>
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 50px; text-align: center; font-size: 11px;">
                    <div style="width: 42%; border-top: 1px solid #0f172a; padding-top: 6px;">
                        <strong>Responsável</strong><br>${colaborador !== '--' ? colaborador : 'Colaborador Q.C Software'}
                    </div>
                    <div style="width: 42%; border-top: 1px solid #0f172a; padding-top: 6px;">
                        <strong>Qualidade</strong><br>Q.C Software
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(containerRelatorio);

        // 7. Impressão limpa
        setTimeout(() => {
            window.print();
        }, 300);

    } catch (erro) {
        console.error("[REIMPRESSÃO ERRO]", erro);
        alert(`⚠️ ${erro.message || 'Erro ao gerar relatório de ocorrência.'}`);
    } finally {
        if (btnTarget) {
            btnTarget.disabled = false;
            btnTarget.innerHTML = iconeOriginal;
        }
    }
}

// =========================================================================
// MANTER RELÓGIO COM DATA E HORA DE BRASÍLIA NA SIDEBAR
// =========================================================================
(function() {
    function atualizarRelogio() {
        const agora = new Date();
        const opcoesData = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' };
        const opcoesHora = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false };
        
        const dataStr = agora.toLocaleDateString('pt-BR', opcoesData);
        const horaStr = agora.toLocaleTimeString('pt-BR', opcoesHora);
        
        const elData = document.getElementById('data-brasilia');
        const elHora = document.getElementById('hora-brasilia');
        
        if (elData) elData.textContent = dataStr;
        if (elHora) elHora.textContent = horaStr;
    }
    atualizarRelogio();
    setInterval(atualizarRelogio, 10000);
})();