// =========================================================================
// CONFIGURAÇÕES GLOBAIS E CONTROLE DE ESTADO
// =========================================================================
const API_URL = "https://sistema.qcsoftware.com.br";
const ITENS_POR_PAGINA = 10;

let paginaAtualOcorrencias = 1;  
let todasOcorrencias = [];       // Armazena o payload bruto vindo da API
let OcorrenciasFiltradas = [];   // Armazena os registros após aplicação dos filtros superiores
let FOTO_OCORRENCIA_BASE64 = null;
let ocoSeguro = {};              // Objeto de backup da ocorrência em edição

// Auxiliar para obter data local formatada no Fuso de Brasília (UTC-3)
function obterDataHoraAtualLocal() {
    const agora = new Date();
    const formatador = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
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

// =========================================================================
// INICIALIZADOR ÚNICO DE DOM (EVITA CONCORRÊNCIA E FORMATOS EM BRANCO)
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Controle da Sidebar
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

    // 2. Atualizar Data/Hora na Sidebar
    try {
        const tempoLocal = obterDataHoraAtualLocal();
        const inputDataOcorrencia = document.getElementById('ocorrencias-data');
        if (inputDataOcorrencia && !window.location.search.includes('editar')) {
            inputDataOcorrencia.value = tempoLocal.isoDateTime;
        }

        const containerColaborador = document.querySelector('.sidebar-container') || document.querySelector('aside') || document.querySelector('.sidebar');
        if (containerColaborador) {
            containerColaborador.querySelectorAll('*').forEach(el => {
                if (el.textContent.includes('--/--/----')) el.innerHTML = el.innerHTML.replace('--/--/----', tempoLocal.dataFormatada);
                if (el.textContent.includes('--:--')) el.innerHTML = el.innerHTML.replace('--:-- horas', tempoLocal.horaFormatada).replace('--:--', tempoLocal.horaFormatada);
            });
        }
    } catch (e) { console.warn("Aviso ao carregar data/hora da sidebar:", e); }

    // 3. Inicializa combos dinâmicos primeiro para garantir a tradução de IDs de Edição
    try {
        await Promise.all([
            carregarMaquinasNoSelect(),
            carregarColaboradoresNoSelect(),
            carregarProdutosNoSelect()
        ]);
        console.log("Dicionários e seletores carregados com sucesso.");
    } catch (e) { console.error("Erro crítico ao carregar seletores dinâmicos:", e); }

    // 4. Verifica se a página está em modo Edição ou Listagem Geral
    const paramsURL = new URLSearchParams(window.location.search);
    if (paramsURL.has('editar') || paramsURL.has('numero_ocorrencias')) {
        await verificarEDirecionarEdicao();
        vincularSalvamentoOcorrencia();
    } else {
        await listarOcorrenciasCRUD();
    }

    // 5. Configura ouvintes dos filtros superiores (Se existirem na tela de listagem)
    ['filterSituacao', 'filterDataInicio', 'filterDataFim', 'filterLote', 'filterDataRange'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const evento = el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change';
            el.addEventListener(evento, () => {
                paginaAtualOcorrencias = 1;
                filtrarEAtualizarTabelaOcorrencias();
            });
        }
    });

    // 6. Controles de Paginação
    document.getElementById('btn-anterior-ocorrencias')?.addEventListener('click', () => {
        if (paginaAtualOcorrencias > 1) { paginaAtualOcorrencias--; filtrarEAtualizarTabelaOcorrencias(); }
    });
    document.getElementById('btn-proximo-ocorrencias')?.addEventListener('click', () => {
        const totalPaginas = Math.ceil(OcorrenciasFiltradas.length / ITENS_POR_PAGINA) || 1;
        if (paginaAtualOcorrencias < totalPaginas) { paginaAtualOcorrencias++; filtrarEAtualizarTabelaOcorrencias(); }
    });
});

// =========================================================================
// FILTRAGEM, ORDENAÇÃO E CÁLCULO DE PAGINAÇÃO
// =========================================================================
function filtrarEAtualizarTabelaOcorrencias() {
    const loteDigitado = document.getElementById('filterLote')?.value.trim().toLowerCase() || "";
    const situacaoSelecionada = document.getElementById('filterSituacao')?.value || "todos";
    const dataInicio = document.getElementById('filterDataInicio')?.value || "";
    const dataFim = document.getElementById('filterDataFim')?.value || "";
    const rangeData = document.getElementById('filterDataRange')?.value || "";

    OcorrenciasFiltradas = todasOcorrencias.filter(o => {
        const loteOcorrencia = String(o.lote_produtos ?? o.lote_produto ?? o.lote ?? "").toLowerCase();
        const passaLote = (loteDigitado === "") || loteOcorrencia.includes(loteDigitado);

        const registroEstaAtivo = o.ativo === true || o.ativo === "true" || (o.ativo === undefined && String(o.situacao).toLowerCase() === "ativo") || (o.ativo === undefined && o.situacao === undefined);
        const statusNormalizado = String(o.situacao || (registroEstaAtivo ? "Ativo" : "Inativo")).toLowerCase();
        
        let passaSituacao = (situacaoSelecionada === "todos") || (statusNormalizado === situacaoSelecionada.toLowerCase());
        if (situacaoSelecionada === "Ativo" && registroEstaAtivo) passaSituacao = true;
        if (situacaoSelecionada === "Inativo" && !registroEstaAtivo) passaSituacao = true;

        let passaData = true;
        if (rangeData && rangeData.includes("à")) {
            const partes = rangeData.split("à");
            const [diaI, mesI, anoI] = partes[0].trim().split("/");
            const [diaF, mesF, anoF] = partes[1].trim().split("/");
            const dInicio = new Date(`${anoI}-${mesI}-${diaI}T00:00:00`);
            const dFim = new Date(`${anoF}-${mesF}-${diaF}T23:59:59`);
            const dataRegistro = o.data_ocorrencias ? new Date(o.data_ocorrencias) : null;
            if (dataRegistro) passaData = (dataRegistro >= dInicio && dataRegistro <= dFim);
        } else {
            const campoData = o.data_ocorrencias ?? o.data_ocorrenia ?? o.data ?? null;
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

    OcorrenciasFiltradas.sort((a, b) => {
        const loteA = String(a.lote_produtos || a.lote_produto || "").trim();
        const loteB = String(b.lote_produtos || b.lote_produto || "").trim();
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

// =========================================================================
// RENDERIZAÇÃO EM TELA DA TABELA (LISTAGEM)
// =========================================================================
function renderizarTabelaOcorrencias(ocorrencias) {
    const tabela = document.getElementById('tabela-ocorrencias');
    if (!tabela) return;

    if (!ocorrencias || ocorrencias.length === 0) {
        tabela.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">Nenhuma ocorrência encontrada para os filtros aplicados.</td></tr>`;
        return;
    }

    tabela.innerHTML = ocorrencias.map((o, index) => {
        let idBruto = o.numero_ocorrencias ?? o.id ?? o.id_ocorrencias ?? 0;
        const numeroOcoInt = parseInt(idBruto, 10) || 0;
        const textoSituacao = o.situacao || (o.ativo === false || o.ativo === "false" ? "Inativo" : "Ativo");
        
        let badgeClasse = 'bg-secondary-subtle text-secondary';
        const statusNormalizado = String(textoSituacao).toLowerCase().trim();
        if (statusNormalizado === 'pendente') badgeClasse = 'bg-danger-subtle text-danger';
        else if (statusNormalizado === 'em andamento') badgeClasse = 'bg-warning-subtle text-warning';
        else if (['concluido', 'concluído', 'ativo'].includes(statusNormalizado)) badgeClasse = 'bg-success-subtle text-success';

        let dataOriginalRaw = o.data_ocorrencias ?? o.data_ocorrenca ?? o.data ?? "";
        let dataFormatada = "-";
        if (dataOriginalRaw && dataOriginalRaw !== "-") {
            try {
                const dataObjeto = new Date(dataOriginalRaw.replace(' ', 'T'));
                if (!isNaN(dataObjeto)) {
                    dataFormatada = dataObjeto.toLocaleDateString('pt-BR') + ' ' + dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                }
            } catch (e) { }
        }

        const fkProduto = parseInt(o.id_produtos ?? o.id_produto ?? 0, 10);
        const fkMaquina = parseInt(o.id_maquinas ?? o.id_maquina ?? 0, 10);
        const fkColaborador = parseInt(o.id_colaboradores ?? o.id_colaborador ?? 0, 10);

        let produto = "-", maquina = "-", colaborador = "-";
        if (fkProduto && window.listaDeProdutos) {
            const pEnc = window.listaDeProdutos.find(p => (p.id_produtos || p.id || p._id)?.toString() === fkProduto.toString());
            if (pEnc) produto = pEnc.nome;
        }
        if (fkMaquina && window.listaDeMaquinas) {
            const mEnc = window.listaDeMaquinas.find(m => (m.id_maquinas || m.id || m._id)?.toString() === fkMaquina.toString());
            if (mEnc) maquina = mEnc.nome;
        }
        if (fkColaborador && window.listaDeColaboradores) {
            const cEnc = window.listaDeColaboradores.find(c => (c.id_colaboradores || c.id || c._id)?.toString() === fkColaborador.toString());
            if (cEnc) colaborador = cEnc.nome;
        }
        
        const lote = o.lote_produtos || o.lote_produto || o.lote || "-";
        const problema = o.problema || o.falha_como || "-";
        const dataOriginalString = dataOriginalRaw ? dataOriginalRaw.toString().trim() : '';
        
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

        // --- MUDANÇA AQUI: Adicionado &posicao_lista=${index} ---
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
                            onclick="window.location.href='ocorrencias_editar.html?editar=true&numero_ocorrencias=${numeroOcoInt}&data_ocorrencias=${encodeURIComponent(dataOriginalString)}&id_maquinas=${fkMaquina}&id_colaboradores=${fkColaborador}&id_produtos=${fkProduto}&posicao_lista=${index}'" 
                            title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                </td>
            </tr>
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
// CARGA DOS DADOS PARA EDICÃO (MÉTODO BLINDADO POR MULTICRITÉRIOS REST)
// =========================================================================
async function verificarEDirecionarEdicao() {
    const paramsURL = new URLSearchParams(window.location.search);
    
    const numOco = paramsURL.get('numero_ocorrencias');
    const dataOco = paramsURL.get('data_ocorrencias');
    const idMaq = paramsURL.get('id_maquinas');
    const idColab = paramsURL.get('id_colaboradores');
    const idProd = paramsURL.get('id_produtos');

    if (!numOco && !dataOco) return;

    const inputNumero = document.getElementById('ocorrencias-numero');
    if (inputNumero) inputNumero.readOnly = true;

    try {
        const urlGet = `${API_URL}/ocorrencias/?data_ocorrencias=${encodeURIComponent(dataOco)}&id_maquinas=${idMaq}&id_colaboradores=${idColab}&id_produtos=${idProd}&numero_ocorrencias=${numOco}`;
        console.log("[GET REST] Buscando registro específico em:", urlGet);
        
        const res = await fetch(urlGet);
        if (!res.ok) throw new Error("Erro ao buscar dados do registro no servidor.");
        
        const dados = await res.json();
        
        // --- BLINDAGEM DE FILTRO LOCAL ---
        let oco = null;
        if (Array.isArray(dados)) {
            // Se a API trouxe uma lista com vários itens, procuramos o que bate exatamente com o número clicado
            oco = dados.find(item => String(item.numero_ocorrencias) === String(numOco));
            // Se não achar pelo find estrito, pega a primeira como fallback secundário
            if (!oco) oco = dados[0];
        } else {
            oco = dados;
        }

        if (!oco) {
            dispararNotificacaoOcorrencia("Ocorrência não localizada no banco de dados.", "danger");
            return;
        }

        ocoSeguro = oco; // Armazena estado global para backup
        console.log("[Dados Carregados com Sucesso]", oco);

        // --- PREENCHIMENTO DOS INPUTS COM VERIFICAÇÃO DE CHAVE EXATA DA API ---
        const setCampo = (id, valor) => { const el = document.getElementById(id); if (el) el.value = valor ?? ""; };
        
        setCampo('ocorrencias-numero', oco.numero_ocorrencias);
        setCampo('ocorrencias-lote-produto', oco.lote_produtos ?? oco.lote_produto);
        setCampo('ocorrencias-nota-fiscal', oco.numero_nota ?? oco.numero_nota_fiscal);
        setCampo('ocorrencias-situacao', oco.situacao || "Pendente");
        setCampo('ocorrencias-problema', oco.problema);
        setCampo('ocorrencias-onde-falha', oco.falha_onde);
        setCampo('ocorrencias-como-falha', oco.falha_como);
        setCampo('ocorrencias-quando-falha', oco.falha_quando);
        setCampo('ocorrencias-quem-envolvido', oco.falha_quem);
        setCampo('ocorrencias-observacoes', oco.observacoes);
        setCampo('ocorrencias-acao-corretiva', oco.acao_corretiva);

        if (oco.data_ocorrencias) {
            setCampo('ocorrencias-data', oco.data_ocorrencias.split('.')[0].replace(' ', 'T').substring(0, 16));
        }
        if (oco.data_prazo) {
            setCampo('ocorrencias-data-prazo', oco.data_prazo.split(' ')[0].split('T')[0]);
        }

        // Preenchimento e tradução visual dos Datalists
        definirValorEDatalist('maquinas-nome', 'maquinas-nome-busca', 'lista-maquinas-datalist', oco.id_maquinas);
        definirValorEDatalist('colaboradores-nome', 'colaboradores-nome-busca', 'lista-colaboradores-datalist', oco.id_colaboradores);
        definirValorEDatalist('produtos-nome', 'produtos-nome-busca', 'lista-produtos-datalist', oco.id_produtos);

        // Foto / Preview
        if (oco.foto) {
            FOTO_OCORRENCIA_BASE64 = oco.foto;
            const fotoPreview = document.getElementById('foto-preview');
            const previewContainer = document.getElementById('preview-container');
            const uploadInstrucoes = document.getElementById('upload-instrucoes');
            if (fotoPreview) fotoPreview.src = oco.foto;
            previewContainer?.classList.remove('d-none');
            uploadInstrucoes?.classList.add('d-none');
        }

        const tituloForm = document.getElementById('titulo-form-colab');
        if (tituloForm) tituloForm.innerHTML = `<i class="fa-solid fa-pencil me-3"></i> Editar Ocorrência Lote: ${oco.lote_produtos ?? oco.lote_produto}`;

    } catch (err) {
        console.error("Erro crítico ao carregar formulário:", err);
        dispararNotificacaoOcorrencia("Não foi possível carregar os dados desta ocorrência.", "danger");
    }
}

function definirValorEDatalist(idHidden, idBusca, idDatalist, idVal) {
    const hidden = document.getElementById(idHidden);
    const busca = document.getElementById(idBusca);
    const datalist = document.getElementById(idDatalist);

    if (hidden && idVal) hidden.value = idVal;
    if (busca && datalist && idVal) {
        const opcao = Array.from(datalist.options).find(opt => opt.getAttribute('data-id')?.toString() === idVal.toString());
        if (opcao) busca.value = opcao.value;
        else busca.value = idVal; // Fallback caso o dicionário ainda não esteja totalmente renderizado
    }
}

// =========================================================================
// SALVAMENTO / ATUALIZAÇÃO VIA FORM SUBMIT (PUT / POST)
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
}

window.executarEnvioOcorrencia = async function() {
    const paramsURL = new URLSearchParams(window.location.search);
    const estaEditando = paramsURL.has('editar') || paramsURL.has('numero_ocorrencias');
    const metodo = estaEditando ? 'PUT' : 'POST';

    try {
        const obterIdValido = (idInputBusca, idDatalist, idInputHidden) => {
            const inputBusca = document.getElementById(idInputBusca);
            const inputHidden = document.getElementById(idInputHidden);
            const datalist = document.getElementById(idDatalist);
            let idFinal = parseInt(inputHidden?.value, 10);
            
            if ((isNaN(idFinal) || idFinal <= 0) && inputBusca && inputBusca.value.trim() !== "" && datalist) {
                const textoBusca = inputBusca.value.trim().toLowerCase();
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim().toLowerCase() === textoBusca);
                if (opcao) idFinal = parseInt(opcao.getAttribute('data-id'), 10);
            }
            return idFinal;
        };

        const idMaquinasTela = obterIdValido('maquinas-nome-busca', 'lista-maquinas-datalist', 'maquinas-nome');
        const idColaboradoresTela = obterIdValido('colaboradores-nome-busca', 'lista-colaboradores-datalist', 'colaboradores-nome');
        const idProdutosTela = obterIdValido('produtos-nome-busca', 'lista-produtos-datalist', 'produtos-nome');
        
        const numeroOcoTela = parseInt(document.getElementById('ocorrencias-numero')?.value, 10) || 0;
        const campoDataOcorrencia = document.getElementById('ocorrencias-data')?.value;
        
        let dataOcorrenciaIso = campoDataOcorrencia ? campoDataOcorrencia.replace(' ', 'T') : new Date().toISOString().slice(0, 19);
        if (dataOcorrenciaIso.length === 16) dataOcorrenciaIso += ":00";

        const maqFinal = idMaquinasTela > 0 ? idMaquinasTela : (parseInt(ocoSeguro.id_maquinas, 10) || 0);
        const colabFinal = idColaboradoresTela > 0 ? idColaboradoresTela : (parseInt(ocoSeguro.id_colaboradores, 10) || 0);
        const prodFinal = idProdutosTela > 0 ? idProdutosTela : (parseInt(ocoSeguro.id_produtos, 10) || 0);
        const numOcorrenciaFinal = numeroOcoTela > 0 ? numeroOcoTela : (parseInt(ocoSeguro.numero_ocorrencias, 10) || 0);
        const dataOcoFinal = estaEditando && (!campoDataOcorrencia || campoDataOcorrencia.trim() === "") ? (ocoSeguro.data_ocorrencias || dataOcorrenciaIso) : dataOcorrenciaIso;

        if (isNaN(maqFinal) || maqFinal <= 0 || isNaN(colabFinal) || colabFinal <= 0 || isNaN(prodFinal) || prodFinal <= 0) {
            dispararNotificacaoOcorrencia("Erro: IDs de relacionamento inválidos ou não selecionados.", "danger");
            return;
        }

        const urlFinal = `${API_URL}/ocorrencias/?data_ocorrencias=${encodeURIComponent(dataOcoFinal)}&id_maquinas=${maqFinal}&id_colaboradores=${colabFinal}&id_produtos=${prodFinal}&numero_ocorrencias=${numOcorrenciaFinal}`;

        const campoDataPrazo = document.getElementById('ocorrencias-data-prazo')?.value;
        const dataPrazoTratada = (campoDataPrazo && campoDataPrazo.trim() !== "") ? campoDataPrazo : (ocoSeguro.data_prazo || null);
        
        // Foto Base64
        let fotoTratada = null;
        const previewContainer = document.getElementById('preview-container');
        const fotoPreviewElement = document.getElementById('foto-preview');
        if (previewContainer && previewContainer.classList.contains('d-none')) {
            fotoTratada = null;
        } else if (fotoPreviewElement && fotoPreviewElement.src && fotoPreviewElement.src.startsWith('data:image')) {
            fotoTratada = fotoPreviewElement.src;
        } else {
            fotoTratada = ocoSeguro.foto || null;
        }

        const obterValorCampo = (idElemento, propriedadeBackup) => {
            const valorTela = document.getElementById(idElemento)?.value;
            if (estaEditando && (valorTela === undefined || valorTela.trim() === "")) {
                return ocoSeguro[propriedadeBackup] !== undefined ? String(ocoSeguro[propriedadeBackup]) : "";
            }
            return valorTela || "";
        };

        // --- NOVA BLINDAGEM AGRESSIVA DO LOTE (EVITA LOTE ZERADO) ---
        // 1. Busca o valor diretamente do elemento HTML
        const inputLote = document.getElementById('ocorrencias-lote-produto');
        let loteCalculado = inputLote ? inputLote.value.trim() : "";
        
        // 2. Se o campo na tela estiver vazio, recorre ao backup (ocoSeguro) mapeando todas as possibilidades
        if (loteCalculado === "") {
            loteCalculado = String(ocoSeguro.lote_produtos ?? ocoSeguro.lote_produto ?? ocoSeguro.lote ?? "").trim();
        }
        
        // 3. Só vira "0" em último caso se realmente não houver dado algum
        const loteFinalString = loteCalculado !== "" ? loteCalculado : "0";

        // PAYLOAD COM CHAVES E CORREÇÕES PARALELAS FIÉIS AO SWAGGER FASTAPI
        const payloadBody = {
            id_maquinas: maqFinal,
            id_colaboradores: colabFinal,
            id_produtos: prodFinal,
            data_ocorrencias: dataOcoFinal,
            numero_ocorrencias: numOcorrenciaFinal,
            
            // --- BLINDAGEM DUPLA: Enviamos tanto no singular quanto no plural para aceitar qualquer especificação da API ---
            lote_produto: loteFinalString,
            lote_produtos: loteFinalString, 

            numero_nota: parseInt(obterValorCampo('ocorrencias-nota-fiscal', 'numero_nota'), 10) || 0,
            problema: obterValorCampo('ocorrencias-problema', 'problema'),
            falha_onde: obterValorCampo('ocorrencias-onde-falha', 'falha_onde'),
            falha_como: obterValorCampo('ocorrencias-como-falha', 'falha_como'),
            falha_quando: obterValorCampo('ocorrencias-quando-falha', 'falha_quando'),
            falha_quem: obterValorCampo('ocorrencias-quem-envolvido', 'falha_quem'),
            observacoes: obterValorCampo('ocorrencias-observacoes', 'observacoes'),
            acao_corretiva: obterValorCampo('ocorrencias-acao-corretiva', 'acao_corretiva'),
            data_prazo: dataPrazoTratada,
            situacao: document.getElementById('ocorrencias-situacao')?.value || ocoSeguro.situacao || "Pendente",
            foto: fotoTratada
        };

        if (estaEditando && ocoSeguro.id) payloadBody.id = parseInt(ocoSeguro.id, 10);

        console.log(`[${metodo}] Enviando Payload Unificado:`, payloadBody);

        const res = await fetch(urlFinal, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadBody)
        });
        
        if (res.ok) {
            dispararNotificacaoOcorrencia(estaEditando ? "Ocorrência atualizada com sucesso!" : "Nova ocorrência cadastrada com sucesso!", "sucesso");
            setTimeout(() => { window.location.replace("ocorrencias_listagem.html"); }, 1500);
        } else {
            const erroCorpo = await res.json().catch(() => ({}));
            console.error("Erro retornado pela API:", erroCorpo);
            dispararNotificacaoOcorrencia("Erro de validação nos dados. Verifique os campos obrigatórios.", "danger");
        }
    } catch (err) {
        console.error("Erro crítico no envio:", err);
        dispararNotificacaoOcorrencia("Falha de comunicação com o servidor.", "danger");
    }
};

// =========================================================================
// CRUD LISTAR REQUISIÇÃO PRINCIPAL
// =========================================================================
async function listarOcorrenciasCRUD() {
    const tabela = document.getElementById('tabela-ocorrencias');
    try {
        const resposta = await fetch(`${API_URL}/ocorrencias/`, { cache: 'no-store' });
        if (!resposta.ok) throw new Error(`Erro: ${resposta.status}`);

        let dados = await resposta.json();
        todasOcorrencias = Array.isArray(dados) ? dados : (dados.registros || dados.data || []);
        filtrarEAutomatizarTabelaOcorrenciasRedirecionada();
    } catch (erro) {
        console.error("Erro crítico ao listar ocorrências:", erro);
        if (tabela) tabela.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">⚠️ Falha ao carregar dados do servidor.</td></tr>`;
    }
}

function filtrarEAutomatizarTabelaOcorrenciasRedirecionada() {
    filtrarEAtualizarTabelaOcorrencias();
}

// =========================================================================
// COMBOS DINÂMICOS (POPULAÇÃO DE SELECTS / DATALISTS)
// =========================================================================
async function carregarMaquinasNoSelect() {
    const inputBusca = document.getElementById('maquinas-nome-busca');
    const datalist = document.getElementById('lista-maquinas-datalist');
    const inputHidden = document.getElementById('maquinas-nome');
    try {
        const res = await fetch(`${API_URL}/maquinas/`, { cache: 'no-store' });
        if (res.ok) {
            const maquinas = await res.json();
            window.listaDeMaquinas = maquinas; 
            if (!datalist) return;
            maquinas.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            datalist.innerHTML = maquinas.map(m => `<option value="${m.nome}" data-id="${m.id_maquinas || m.id}"></option>`).join('');
            
            inputBusca?.addEventListener('input', function() {
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim() === this.value.trim());
                if (inputHidden) inputHidden.value = opcao ? opcao.getAttribute('data-id') : "";
            });
        }
    } catch (e) { console.error(e); }
}

async function carregarColaboradoresNoSelect() {
    const inputBusca = document.getElementById('colaboradores-nome-busca');
    const datalist = document.getElementById('lista-colaboradores-datalist');
    const inputHidden = document.getElementById('colaboradores-nome');
    try {
        const res = await fetch(`${API_URL}/colaboradores/`, { cache: 'no-store' });
        if (res.ok) {
            const colaboradores = await res.json();
            window.listaDeColaboradores = colaboradores; 
            if (!datalist) return;
            colaboradores.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            datalist.innerHTML = colaboradores.map(c => `<option value="${c.nome}" data-id="${c.id_colaboradores || c.id}"></option>`).join('');
            
            inputBusca?.addEventListener('input', function() {
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim() === this.value.trim());
                if (inputHidden) inputHidden.value = opcao ? opcao.getAttribute('data-id') : "";
            });
        }
    } catch (e) { console.error(e); }
}

async function carregarProdutosNoSelect() {
    const inputBusca = document.getElementById('produtos-nome-busca');
    const datalist = document.getElementById('lista-produtos-datalist');
    const inputHidden = document.getElementById('produtos-nome');
    try {
        const res = await fetch(`${API_URL}/produtos/`, { cache: 'no-store' });
        if (res.ok) {
            const produtos = await res.json();
            window.listaDeProdutos = produtos; 
            if (!datalist) return;
            produtos.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
            datalist.innerHTML = produtos.map(p => `<option value="${p.nome}" data-id="${p.id_produtos || p.id}"></option>`).join('');
            
            inputBusca?.addEventListener('input', function() {
                const opcao = Array.from(datalist.options).find(opt => opt.value.trim() === this.value.trim());
                if (inputHidden) inputHidden.value = opcao ? opcao.getAttribute('data-id') : "";
            });
        }
    } catch (e) { console.error(e); }
}

// =========================================================================
// SISTEMA DE NOTIFICAÇÃO TOAST DINÂMICO
// =========================================================================
function dispararNotificacaoOcorrencia(mensagem, tipo = "sucesso") {
    let container = document.getElementById('toast-container-sistema');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container-sistema';
        container.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column-reverse;gap:10px;";
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = "padding:15px 20px;border-radius:6px;color:#fff;font-family:sans-serif;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transform:translateY(20px);transition:all 0.3s ease;min-width:250px;";
    toast.style.backgroundColor = tipo === "sucesso" ? "#2ecc71" : (tipo === "danger" ? "#e74c3c" : "#3498db");
    toast.innerText = mensagem;
    container.appendChild(toast);

    setTimeout(() => { toast.style.opacity = "1"; toast.style.transform = "translateY(0)"; }, 10);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(20px)"; setTimeout(() => toast.remove(), 300); }, 3500);
}

// =========================================================================
// CONTROLE DE ARQUIVOS E IMAGENS PREVIEW (BLINDAGEM DE EVENTOS GHOST CLICKS)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const containerFoto = document.getElementById('dropzone-foto');
    const inputOculto = document.getElementById('ocorrencias-foto-ocorrencia');
    const previewContainer = document.getElementById('preview-container');
    const fotoPreviewElement = document.getElementById('foto-preview');
    const instrucoesUpload = document.getElementById('upload-instrucoes');
    const btnRemoverFoto = document.getElementById('btn-remover-foto');

    if (containerFoto && inputOculto) {
        containerFoto.onclick = function(e) {
            if (e.target.closest('#btn-remover-foto')) return; 
            e.preventDefault(); e.stopPropagation();
            inputOculto.click();
        };
    }
    if (inputOculto) {
        inputOculto.onchange = function(e) {
            const arquivo = e.target.files[0];
            if (arquivo) {
                const leitor = new FileReader();
                leitor.onload = function(evt) {
                    if (fotoPreviewElement) fotoPreviewElement.src = evt.target.result;
                    previewContainer?.classList.remove('d-none');
                    instrucoesUpload?.classList.add('d-none');
                };
                leitor.readAsDataURL(arquivo);
            }
        };
    }
    if (btnRemoverFoto) {
        btnRemoverFoto.onclick = function(e) {
            e.stopPropagation(); 
            if (inputOculto) inputOculto.value = "";
            if (fotoPreviewElement) fotoPreviewElement.src = "";
            previewContainer?.classList.add('d-none');
            instrucoesUpload?.classList.remove('d-none');
        };
    }
});

// Relógio de Brasília Continuo
(function() {
    function atualizarRelogio() {
        const agora = new Date();
        const elData = document.getElementById('data-brasilia');
        const elHora = document.getElementById('hora-brasilia');
        if (elData) elData.textContent = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        if (elHora) elHora.textContent = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    atualizarRelogio(); setInterval(atualizarRelogio, 10000);
})();