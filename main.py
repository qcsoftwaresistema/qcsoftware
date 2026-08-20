from datetime import datetime
from multiprocessing import get_context
import os
from fastapi import APIRouter, BackgroundTasks, FastAPI, Depends, HTTPException, logger, status
from fastapi.responses import FileResponse
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from database import engine, get_db
import logging
import resend
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# Criação das tabelas (caso ainda não existam no banco)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Q.C Software", version="1.0.0")
app.mount("/telas", StaticFiles(directory="telas", html=True), name="telas")

# Configura as origens permitidas
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]

# Adiciona o middleware de CORS no aplicativo
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Ou digite ["*"] para liberar para qualquer um durante os testes
    allow_credentials=True,
    allow_methods=["*"], # Permite GET, POST, PUT, DELETE, etc.
    allow_headers=["*"], # Permite todos os cabeçalhos
)

# --- FUNÇÃO AUXILIAR PARA UPDATE GENÉRICO ---
def update_item(db: Session, db_obj, obj_in):
    obj_data = obj_in.model_dump(exclude_unset=True)
    for field in obj_data:
        setattr(db_obj, field, obj_data[field])
    db.commit()
    db.refresh(db_obj)
    return db_obj

# ==========================================
# 1. CARGOS
# ==========================================
@app.get("/cargos/", response_model=List[schemas.Cargo], tags=["Cargos"])
def listar_cargos(db: Session = Depends(get_db)):
    return db.query(models.Cargo).all()

@app.post("/cargos/", response_model=schemas.Cargo, tags=["Cargos"])
def criar_cargo(obj: schemas.CargoCreate, db: Session = Depends(get_db)):
    novo = models.Cargo(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/cargos/{id}", response_model=schemas.Cargo, tags=["Cargos"])
def atualizar_cargo(id: int, obj: schemas.CargoUpdate, db: Session = Depends(get_db)):
    # 1. Busca o cargo no banco pelo ID correto
    db_obj = db.query(models.Cargo).filter(models.Cargo.id_cargos == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Cargo não encontrado")
    
    # 2. Atualiza os campos de texto se forem enviados
    if obj.nome is not None:
        db_obj.nome = obj.nome
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/cargos/{id}", tags=["Cargos"])
def deletar_cargo(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Cargo).filter(models.Cargo.id_cargos == id).first()
    if not db_obj: raise HTTPException(404, "Cargo não encontrado")
    db.delete(db_obj)
    db.commit()
    return {"status": "Cargo deletado com sucesso"}

# ==========================================
# 2. PRODUTOS
# ==========================================
@app.get("/produtos/", response_model=List[schemas.Produto], tags=["Produtos"])
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(models.Produto).all()

@app.post("/produtos/", response_model=schemas.Produto, tags=["Produtos"])
def criar_produto(obj: schemas.ProdutoCreate, db: Session = Depends(get_db)):
    novo = models.Produto(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/produtos/{id}", response_model=schemas.Produto, tags=["Produtos"])
def atualizar_produto(id: int, obj: schemas.ProdutoUpdate, db: Session = Depends(get_db)):
    # 1. Busca o produto no banco pelo ID correto
    db_obj = db.query(models.Produto).filter(models.Produto.id_produtos == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    # 2. Atualiza os campos de texto e categoria se forem enviados
    if obj.nome is not None:
        db_obj.nome = obj.nome
    if obj.categoria is not None:
        db_obj.categoria = obj.categoria
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/produtos/{id}", tags=["Produtos"])
def deletar_produto(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Produto).filter(models.Produto.id_produtos == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Produto deletado com sucesso"}

# ==========================================
# 3. MÁQUINAS
# ==========================================
@app.get("/maquinas/", response_model=List[schemas.Maquina], tags=["Máquinas"])
def listar_maquinas(db: Session = Depends(get_db)):
    return db.query(models.Maquina).all()

@app.post("/maquinas/", response_model=schemas.Maquina, tags=["Máquinas"])
def criar_maquina(obj: schemas.MaquinaCreate, db: Session = Depends(get_db)):
    novo = models.Maquina(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/maquinas/{id}", response_model=schemas.Maquina, tags=["Máquinas"])
def atualizar_maquina(id: int, obj: schemas.MaquinaUpdate, db: Session = Depends(get_db)):
    # 1. Busca a máquina no banco pelo ID correto
    db_obj = db.query(models.Maquina).filter(models.Maquina.id_maquinas == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Máquina não encontrada")
    
    # 2. Atualiza os campos de texto se forem enviados
    if obj.nome is not None:
        db_obj.nome = obj.nome
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/maquinas/{id}", tags=["Máquinas"])
def deletar_maquina(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Maquina).filter(models.Maquina.id_maquinas == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Máquina deletada com sucesso"}

# ==========================================
# 4. OCORRÊNCIAS
# ==========================================
# --- LISTAR ---
@app.get("/ocorrencias/", response_model=List[schemas.Ocorrencia], tags=["Ocorrências"])
def listar_ocorrencias(db: Session = Depends(get_db)):
    try:
        return db.query(models.Ocorrencia).all()
    except Exception as e:
        # Retorna o erro real do banco na resposta HTTP para você ler no Swagger/Postman
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Erro real do banco: {str(e)}"
        )

# --- CRIAR ---
@app.post("/ocorrencias/", response_model=schemas.Ocorrencia, status_code=status.HTTP_201_CREATED, tags=["Ocorrências"])
def criar_ocorrencia(obj: schemas.OcorrenciaCreate, db: Session = Depends(get_db)):
    try:
        dados_input = obj.model_dump()
        novo = models.Ocorrencia(**dados_input)
        
        db.add(novo)
        db.commit()
        db.refresh(novo) 
        return novo
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao criar ocorrência: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Erro nos dados enviados: {str(e)}"
        )
    
# --- ATUALIZAR ---
@app.put("/ocorrencias/", response_model=schemas.Ocorrencia, tags=["Ocorrências"])
def atualizar_ocorrencia(
    *,
    data_ocorrencias: datetime,
    id_maquinas: int,
    id_colaboradores: int,
    id_produtos: int,
    numero_ocorrencias: int,
    obj: schemas.OcorrenciaUpdate,
    db: Session = Depends(get_db)
):
    # 1. Filtro usando a chave primária composta de 5 campos
    db_obj = db.query(models.Ocorrencia).filter(
        models.Ocorrencia.data_ocorrencias == data_ocorrencias,
        models.Ocorrencia.id_maquinas == id_maquinas,
        models.Ocorrencia.id_colaboradores == id_colaboradores,
        models.Ocorrencia.id_produtos == id_produtos,
        models.Ocorrencia.numero_ocorrencias == numero_ocorrencias
    ).first()

    if not db_obj:
        raise HTTPException(
            status_code=404, 
            detail="Ocorrência não encontrada com a chave informada."
        )

    try:
        # 2. Atualiza os campos de texto e informações gerais se enviados
        if obj.lote_produtos is not None: db_obj.lote_produtos = obj.lote_produtos
        if obj.numero_nota is not None: db_obj.numero_nota = obj.numero_nota
        if obj.problema is not None: db_obj.problema = obj.problema
        if obj.falha_onde is not None: db_obj.falha_onde = obj.falha_onde
        if obj.falha_como is not None: db_obj.falha_como = obj.falha_como
        if obj.falha_quando is not None: db_obj.falha_quando = obj.falha_quando
        if obj.falha_quem is not None: db_obj.falha_quem = obj.falha_quem
        if obj.observacoes is not None: db_obj.observacoes = obj.observacoes
        if obj.acao_corretiva is not None: db_obj.acao_corretiva = obj.acao_corretiva
        if obj.foto is not None: db_obj.foto = obj.foto
        if obj.data_prazo is not None: db_obj.data_prazo = obj.data_prazo
        
        # 3. CORREÇÃO CRÍTICA PARA A SITUAÇÃO:
        # Garante a troca de "Pendente" para qualquer outra string enviada pelo front-end
        if obj.situacao is not None:
            db_obj.situacao = obj.situacao

        # 4. Grava em definitivo no banco de dados
        db.commit()
        db.refresh(db_obj)
        return db_obj

    except Exception as e:
        db.rollback()
        # Caso não tenha configurado o logger, use o print ou certifique-se de que o 'logger' está importado
        print(f"Erro ao atualizar ocorrência: {str(e)}") 
        raise HTTPException(
            status_code=500, 
            detail=f"Erro interno ao atualizar banco de dados: {str(e)}"
        )

# --- DELETAR ---
@app.delete("/ocorrencias/", tags=["Ocorrências"])
def deletar_ocorrencia(
    data_ocorrencias: datetime,
    id_maquinas: int,
    id_colaboradores: int,
    id_produtos: int,
    numero_ocorrencias: int,  # Adicionado na assinatura da query
    db: Session = Depends(get_db)
):
    # Filtro usando a chave primária composta de 5 campos
    db_query = db.query(models.Ocorrencia).filter(
        models.Ocorrencia.data_ocorrencias == data_ocorrencias,
        models.Ocorrencia.id_maquinas == id_maquinas,
        models.Ocorrencia.id_colaboradores == id_colaboradores,
        models.Ocorrencia.id_produtos == id_produtos,
        models.Ocorrencia.numero_ocorrencias == numero_ocorrencias  # Adicionado no filtro
    )
    db_obj = db_query.first()
    
    if not db_obj:
        logger.warning(f"Tentativa de deletar ocorrência inexistente.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Ocorrência não encontrada com a chave informada."
        )

    try:
        db_query.delete(synchronize_session=False)
        db.commit()
        
        return {
            "status": "sucesso",
            "mensagem": "Cadastro excluído com sucesso",
            "chave_deletada": {
                "data_ocorrencias": data_ocorrencias,
                "id_maquinas": id_maquinas,
                "id_colaboradores": id_colaboradores,
                "id_produtos": id_produtos,
                "numero_ocorrencias": numero_ocorrencias  # Adicionado no retorno de confirmação
            }
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao deletar ocorrência: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro de integridade ao deletar registro: {str(e)}"
        )
    
# ==========================================
# 5. COLABORADORES
# ==========================================
@app.get("/colaboradores/", response_model=List[schemas.Colaborador], tags=["Colaboradores"])
def listar_colaboradores(db: Session = Depends(get_db)):
    return db.query(models.Colaborador).all()

@app.post("/colaboradores/", response_model=schemas.Colaborador, tags=["Colaboradores"])
def criar_colaborador(obj: schemas.ColaboradorCreate, db: Session = Depends(get_db)):
    novo = models.Colaborador(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo  

@app.put("/colaboradores/{id}", response_model=schemas.Colaborador, tags=["Colaboradores"])
def atualizar_colaborador(id: int, obj: schemas.ColaboradorUpdate, db: Session = Depends(get_db)):
    # 1. Busca o colaborador no banco pelo ID correto
    db_obj = db.query(models.Colaborador).filter(models.Colaborador.id_colaboradores == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")
    
    # 2. Atualiza apenas os campos que foram enviados no Payload do front-end
    if obj.nome is not None:
        db_obj.nome = obj.nome
    if obj.matricula is not None:
        db_obj.matricula = obj.matricula
    if obj.id_cargos is not None:
        db_obj.id_cargos = obj.id_cargos
    if obj.email is not None:
        db_obj.email = obj.email
    if obj.setor is not None:
        db_obj.setor = obj.setor
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/colaboradores/{id}", tags=["Colaboradores"])
def deletar_colaborador(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Colaborador).filter(models.Colaborador.id_colaboradores == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Colaborador deletado com sucesso"}

# ==========================================
# 6. USUÁRIOS
# ==========================================
@app.get("/usuarios/", response_model=List[schemas.Usuario], tags=["Usuários"])
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(models.Usuario).all()

@app.post("/usuarios/", response_model=schemas.Usuario, tags=["Usuários"])
def criar_usuario(obj: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    novo = models.Usuario(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/usuarios/{id}", response_model=schemas.Usuario, tags=["Usuários"])
def atualizar_usuario(id: int, obj: schemas.UsuarioUpdate, db: Session = Depends(get_db)):
    # 1. Busca o usuário no banco pelo ID correto
    db_obj = db.query(models.Usuario).filter(models.Usuario.id_usuarios == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # 2. Atualiza apenas os campos de texto e relacionamentos enviados
    if obj.usuario is not None:
        db_obj.usuario = obj.usuario
    if obj.id_perfis is not None:
        db_obj.id_perfis = obj.id_perfis
    if obj.email is not None:
        db_obj.email = obj.email
        
    # 3. Tratamento da senha (só atualiza se uma nova senha for enviada)
    if obj.senha_hash is not None:
        db_obj.senha_hash = obj.senha_hash # Se você usar hash (ex: passlib), faça o hash aqui
        
    # 4. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 5. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/usuarios/{id}", tags=["Usuários"])
def deletar_usuario(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Usuario).filter(models.Usuario.id_usuarios == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Usuário deletado com sucesso"}

# ==========================================
# 7. PERMISSÕES
# ==========================================
@app.get("/permissoes/", response_model=List[schemas.Permissao], tags=["Permissões"])
def listar_permissoes(db: Session = Depends(get_db)):
    return db.query(models.Permissao).all()

@app.post("/permissoes/", response_model=schemas.Permissao, tags=["Permissões"])
def criar_permissao(obj: schemas.PermissaoCreate, db: Session = Depends(get_db)):
    novo = models.Permissao(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/permissoes/{id}", response_model=schemas.Permissao, tags=["Permissões"])
def atualizar_permissao(id: int, obj: schemas.PermissaoUpdate, db: Session = Depends(get_db)):
    # 1. Busca a permissão no banco pelo ID correto
    db_obj = db.query(models.Permissao).filter(models.Permissao.id_permissoes == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Permissão não encontrada")
    
    # 2. Atualiza os relacionamentos (se enviados)
    if obj.id_perfis is not None:
        db_obj.id_perfis = obj.id_perfis
    if obj.id_telas is not None:
        db_obj.id_telas = obj.id_telas
        
    # 3. CORREÇÃO CRÍTICA PARA TODOS OS BOOLEANOS:
    # Garante que o sistema aceite 'False' para revogar acessos!
    if obj.visualizar is not None:
        db_obj.visualizar = obj.visualizar
    if obj.inserir is not None:
        db_obj.inserir = obj.inserir
    if obj.alterar is not None:
        db_obj.alterar = obj.alterar
    if obj.excluir is not None:
        db_obj.excluir = obj.excluir
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/permissoes/{id}", tags=["Permissões"])
def deletar_permissao(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Permissao).filter(models.Permissao.id_permissoes == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Permissão deletada com sucesso"}

# ==========================================
# 8. TELA
# ==========================================
@app.get("/tela/", response_model=List[schemas.Tela], tags=["Tela"])
def listar_tela(db: Session = Depends(get_db)):
    return db.query(models.Tela).all()

@app.post("/tela/", response_model=schemas.Tela, tags=["Tela"])
def criar_tela(obj: schemas.TelaCreate, db: Session = Depends(get_db)):
    novo = models.Tela(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/tela/{id}", response_model=schemas.Tela, tags=["Tela"])
def atualizar_tela(id: int, obj: schemas.TelaUpdate, db: Session = Depends(get_db)):
    # 1. Busca a tela no banco (verifique se no seu models é id_telas ou id_tela)
    db_obj = db.query(models.Tela).filter(models.Tela.id_telas == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Tela não encontrada")
    
    # 2. Atualiza o campo de texto se for enviado
    if obj.nome is not None:
        db_obj.nome = obj.nome
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/tela/{id}", tags=["Tela"])
def deletar_tela(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Tela).filter(models.Tela.id_tela == id).first()
    if not db_obj: raise HTTPException(404, "Tela não encontrada")
    db.delete(db_obj)
    db.commit()
    return {"status": "Tela deletada com sucesso", "detail": "Tela removida"}

# ==========================================
# 9. PERFIS
# ==========================================
@app.get("/perfis/", response_model=List[schemas.Perfil], tags=["Perfis"])
def listar_perfis(db: Session = Depends(get_db)):
    return db.query(models.Perfil).all()

@app.post("/perfis/", response_model=schemas.Perfil, tags=["Perfis"])
def criar_perfil(obj: schemas.PerfilCreate, db: Session = Depends(get_db)):
    novo = models.Perfil(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/perfis/{id}", response_model=schemas.Perfil, tags=["Perfis"])
def atualizar_perfil(id: int, obj: schemas.PerfilUpdate, db: Session = Depends(get_db)):
    # 1. Busca o perfil no banco pelo ID correto
    db_obj = db.query(models.Perfil).filter(models.Perfil.id_perfis == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    
    # 2. Atualiza o campo de texto se for enviado
    if obj.nome is not None:
        db_obj.nome = obj.nome
        
    # 3. CORREÇÃO CRÍTICA: Atualiza o booleano 'ativo' mesmo se ele for False
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    # 4. Grava em definitivo no banco de dados
    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/perfis/{id}", tags=["Perfis"])
def deletar_perfil(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Perfil).filter(models.Perfil.id_perfis == id).first()
    if not db_obj: raise HTTPException(404, "Perfil não encontrado")
    db.delete(db_obj)
    db.commit()
    return {"status": "Perfil deletado com sucesso", "detail": "Perfil removido"}

# Importe seus schemas, models, context de hash e get_db do seu projeto
# import schemas, models
# from database import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURAÇÃO SEGURA DO RESEND ---
# O os.getenv busca o valor configurado nas variáveis do Render ou no arquivo .env
RESEND_API_KEY = os.getenv("RESEND_API_KEY")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
else:
    logger.warning("RESEND_API_KEY não foi encontrada nas variáveis de ambiente.") 

router = APIRouter(prefix="/api", tags=["Autenticação"])

@router.post("/recuperar-senha", response_model=schemas.MensagemResposta)
async def solicitar_recuperacao_senha(
    dados: schemas.EsqueciSenhaSchema, 
    db: Session = Depends(get_db)
):
    # 1. Consulta o usuário pelo e-mail informado
    usuario = db.query(models.Usuario).filter(models.Usuario.email == dados.email).first()
    
    # 2. Se o e-mail não existir no banco, lança erro 404
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="E-mail não encontrado em nosso sistema."
        )
    
    # 3. Verificar se o usuário está ativo
    if hasattr(usuario, "ativo") and not usuario.ativo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuário inativo no sistema."
        )

    # 4. Link de redefinição de senha para o usuário
    link_redefinicao = f"https://sistema.qcsoftware.com.br/telas/redefinir-senha.html?email={usuario.email}"

    # 5. Corpo da mensagem de e-mail em HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 20px; color: #333333;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
                <p><img src="https://sistema.qcsoftware.com.br/telas/imagens/logo.png" alt="Q.C Software Logo" style="width: 120px; height: auto;"></p>
                <h2 style="color: #1e293b; margin: 0;">Q.C Software</h2>
                <h2 style="color: #1e293b; margin: 0;">Agilidade que gera resultados!</h2>
                <p style="color: #64748b; font-size: 14px;">Recuperação de Acesso ao Sistema</p>
            </div>
            
            <p>Olá, <strong>{usuario.email}</strong>.</p>
            <p>Recebemos uma solicitação para redefinir a senha do usuário cadastrado sob o e-mail: <strong>{usuario.email}</strong>.</p>
            <p>Para criar uma nova senha, clique no botão abaixo:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{link_redefinicao}" 
                   style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                   Redefinir Minha Senha
                </a>
            </div>
            
            <p style="font-size: 13px; color: #64748b;">
                Se o botão acima não funcionar, copie e cole o link a seguir no seu navegador:<br>
                <a href="{link_redefinicao}" style="color: #2563eb;">{link_redefinicao}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                Se você não fez esta solicitação, por favor ignore este e-mail. Sua senha permanecerá a mesma.
            </p>
        </div>
    </body>
    </html>
    """

    # 6. Parâmetros da requisição para a API do Resend
    params = {
        # Enquanto testa antes de validar o domínio personalizado no Resend, 
        # use "Q.C Software <contato@qcsoftware.com.br>"
        "from": "Q.C Software <contato@qcsoftware.com.br>",
        "to": [usuario.email],
        "subject": "Q.C Software - Redefinição de Senha",
        "html": html_content
    }

    # 7. Envio do e-mail via API REST HTTPS
    try:
        resposta = resend.Emails.send(params)
        logger.info(f"E-mail enviado via Resend com sucesso ID: {resposta}")
    except Exception as err:
        logger.error(f"Erro ao enviar e-mail pelo Resend: {str(err)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao enviar o e-mail: {str(err)}"
        )

    return {"message": "Enviamos um e-mail com as instruções para redefinir sua senha!"}


# --- ENDPOINT DE CONFIRMAÇÃO DA REDEFINIÇÃO DE SENHA ---

class ConfirmarRedefinicaoSchema(BaseModel):
    email: EmailStr
    nova_senha: str

@router.post("/confirmar-redefinicao")
def confirmar_redefinicao_senha(
    dados: ConfirmarRedefinicaoSchema, 
    db: Session = Depends(get_db)
):
    try:
        # 1. Busca o usuário no banco de dados
        usuario = db.query(models.Usuario).filter(models.Usuario.email == dados.email).first()

        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Usuário não encontrado."
            )

        # 2. Gera o hash da nova senha usando a biblioteca correta (ex: pwd_context ou passlib)
        # Substitua 'pwd_context' pelo nome real do seu objeto do PassLib (ex: pwd_context.hash)
        try:
            senha_hash = get_context.hash(dados.nova_senha)
        except Exception as hash_err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Erro ao processar a criptografia da senha: {str(hash_err)}"
            )

        # 3. Atualiza a senha no banco de dados
        usuario.senha_hash = senha_hash
        db.commit()
        db.refresh(usuario)

        return {"message": "Senha redefinida com sucesso!"}

    except HTTPException as http_err:
        # Re-lança exceções HTTP intencionais (404, 400, etc) sem cair no rollback genérico
        db.rollback()
        raise http_err

    except Exception as err:
        # Desfaz qualquer operação pendente no banco para evitar lock/corrupção
        db.rollback()
        
        # Loga o erro real no terminal do servidor para depuração
        print(f"[ERRO CRÍTICO /confirmar-redefinicao]: {str(err)}")
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível redefinir a senha. Verifique os dados e tente novamente."
        )

# Inclui as rotas de autenticação
app.include_router(router)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TELAS_DIR = os.path.join(BASE_DIR, "telas")

# Libera o acesso aos arquivos CSS, JS e imagens dentro de /telas
if os.path.exists(TELAS_DIR):
    app.mount("/telas", StaticFiles(directory=TELAS_DIR, html=True), name="telas")

# Rota principal deve retornar o FileResponse de login.html
@app.get("/", response_class=FileResponse)
async def serve_login():
    login_path = os.path.join(TELAS_DIR, "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    return {"erro": "Arquivo login.html não encontrado na pasta telas"}