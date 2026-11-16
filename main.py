from datetime import datetime
from multiprocessing import get_context
import os
import re
from fastapi import APIRouter, BackgroundTasks, FastAPI, Depends, HTTPException, logger, status, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
import hashlib
import hmac
import secrets
from sqlalchemy import create_engine, func, or_, text
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from database import engine, get_db
import logging
import json
import importlib
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import time
import unicodedata

try:
    genai = importlib.import_module("google.genai")
    types = importlib.import_module("google.genai.types")
except ImportError:
    genai = None
    types = None

def normalizar_texto(texto: str) -> str:
    """Remove acentos, espaços extras e converte para minúsculas."""
    if not texto:
        return ""
    texto_sem_acento = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    return texto_sem_acento.strip().lower()

# ==========================================
# FUNÇÃO DE VALIDAÇÃO DE PERMISSÕES (CORRIGIDA DEFINITIVA)
# ==========================================
def verificar_permissao_tela(tela_nome: str, acao: str):
    def dependency(x_perfil_id: int = Header(default=None), db: Session = Depends(get_db)):
        if not x_perfil_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Perfil do usuário não identificado no cabeçalho."
            )
            
        # 1. Busca todas as telas e localiza ignorando acentos, maiúsculas e singular/plural
        alvo = normalizar_texto(tela_nome)
        todas_telas = db.query(models.Tela).all()
        
        tela = None
        for t in todas_telas:
            nome_banco = normalizar_texto(t.nome)
            # Casa 'maquinas' com 'máquinas', 'maquina', 'tela_maquinas'
            if (
                nome_banco == alvo 
                or nome_banco.rstrip('s') == alvo.rstrip('s')
                or alvo in nome_banco 
                or nome_banco in alvo
            ):
                tela = t
                break

        if not tela:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Acesso negado: Tela '{tela_nome}' não localizada no banco de dados."
            )
            
        # 2. Busca a permissão vinculada ao perfil e à tela
        permissao = db.query(models.Permissao).filter(
            models.Permissao.id_perfis == x_perfil_id,
            models.Permissao.id_telas == tela.id_telas,
            models.Permissao.ativo == True
        ).first()

        if not permissao:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Acesso negado: Nenhuma permissão configurada para o perfil {x_perfil_id} na tela {tela_nome}."
            )

        # 3. Verifica a ação específica
        tem_acesso = False
        if acao == "visualizar" and permissao.visualizar: 
            tem_acesso = True
        elif acao == "inserir" and permissao.inserir: 
            tem_acesso = True
        elif acao == "alterar" and permissao.alterar: 
            tem_acesso = True
        elif acao == "excluir" and permissao.excluir: 
            tem_acesso = True

        if not tem_acesso:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Acesso negado: Você não tem permissão para {acao} na tela {tela_nome}."
            )
            
        return True
    return dependency

try:
    # Importa passlib apenas quando estiver instalado no ambiente.
    CryptContext = importlib.import_module("passlib.context").CryptContext
except ImportError:
    # Permite iniciar mesmo quando passlib não estiver disponível.
    class CryptContext:
        def __init__(self, *args, **kwargs):
            self.schemes = kwargs.get("schemes", [])

        def hash(self, password: str) -> str:
            return hashlib.sha256(password.encode("utf-8")).hexdigest()

        def verify(self, password: str, hash_value: str) -> bool:
            if not hash_value:
                return False
            return hash_value == hashlib.sha256(password.encode("utf-8")).hexdigest()

try:
    # Carrega dotenv sem exigir que o analisador estático resolva o pacote.
    load_dotenv = importlib.import_module("dotenv").load_dotenv
except ImportError:
    # Permite iniciar mesmo quando python-dotenv não está instalado.
    def load_dotenv():
        return False

env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assistenteia.env")
load_dotenv(dotenv_path=env_path)

# Garante o carregamento do assistenteia.env mesmo sem python-dotenv instalado
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                os.environ[chave.strip()] = valor.strip().strip('"').strip("'")

logger = logging.getLogger(__name__)

# Criação das tabelas (caso ainda não existam no banco)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Q.C Software", version="1.0.0")
app.mount("/telas", StaticFiles(directory="telas", html=True), name="telas")

# Configura as origens permitidas
origins = [
        "https://qcsoftware.tech",
        "https://www.qcsoftware.tech",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
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
# 2. PRODUTOS (Com validação de permissões)
# ==========================================
@app.get("/produtos/", response_model=List[schemas.Produto], tags=["Produtos"], dependencies=[Depends(verificar_permissao_tela("Produtos", "visualizar"))])
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(models.Produto).all()

@app.post("/produtos/", response_model=schemas.Produto, tags=["Produtos"], dependencies=[Depends(verificar_permissao_tela("Produtos", "inserir"))])
def criar_produto(obj: schemas.ProdutoCreate, db: Session = Depends(get_db)):
    novo = models.Produto(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/produtos/{id}", response_model=schemas.Produto, tags=["Produtos"], dependencies=[Depends(verificar_permissao_tela("Produtos", "alterar"))])
def atualizar_produto(id: int, obj: schemas.ProdutoUpdate, db: Session = Depends(get_db)):
    db_obj = db.query(models.Produto).filter(models.Produto.id_produtos == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    if obj.nome is not None:
        db_obj.nome = obj.nome
    if obj.categoria is not None:
        db_obj.categoria = obj.categoria
    if obj.ativo is not None:
        db_obj.ativo = obj.ativo

    db.commit()
    db.refresh(db_obj)
    return db_obj

@app.delete("/produtos/{id}", tags=["Produtos"], dependencies=[Depends(verificar_permissao_tela("Produtos", "excluir"))])
def deletar_produto(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Produto).filter(models.Produto.id_produtos == id).first()
    db.delete(db_obj)
    db.commit()
    return {"status": "Produto deletado com sucesso"}

# ==========================================
# 3. MÁQUINAS (Com suporte a rota com/sem barra)
# ==========================================
@app.get("/maquinas", response_model=List[schemas.Maquina], tags=["Máquinas"], include_in_schema=False, dependencies=[Depends(verificar_permissao_tela("Máquinas", "visualizar"))])
@app.get("/maquinas/", response_model=List[schemas.Maquina], tags=["Máquinas"], dependencies=[Depends(verificar_permissao_tela("Máquinas", "visualizar"))])
def listar_maquinas(db: Session = Depends(get_db)):
    return db.query(models.Maquina).all()

@app.post("/maquinas/", response_model=schemas.Maquina, tags=["Máquinas"], dependencies=[Depends(verificar_permissao_tela("Máquinas", "inserir"))])
def criar_maquina(obj: schemas.MaquinaCreate, db: Session = Depends(get_db)):
    novo = models.Maquina(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.put("/maquinas/{id}", response_model=schemas.Maquina, tags=["Máquinas"], dependencies=[Depends(verificar_permissao_tela("Máquinas", "alterar"))])
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

@app.delete("/maquinas/{id}", tags=["Máquinas"], dependencies=[Depends(verificar_permissao_tela("Máquinas", "excluir"))])
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
@app.get("/colaboradores/", response_model=List[schemas.Colaborador], tags=["Colaboradores"], dependencies=[Depends(verificar_permissao_tela("Colaboradores", "visualizar"))])
def listar_colaboradores(db: Session = Depends(get_db)):
    return db.query(models.Colaborador).all()

@app.post("/colaboradores/", response_model=schemas.Colaborador, tags=["Colaboradores"], dependencies=[Depends(verificar_permissao_tela("Colaboradores", "inserir"))])
def criar_colaborador(obj: schemas.ColaboradorCreate, db: Session = Depends(get_db)):
    novo = models.Colaborador(**obj.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo  

@app.put("/colaboradores/{id}", response_model=schemas.Colaborador, tags=["Colaboradores"], dependencies=[Depends(verificar_permissao_tela("Colaboradores", "alterar"))])
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

@app.delete("/colaboradores/{id}", tags=["Colaboradores"], dependencies=[Depends(verificar_permissao_tela("Colaboradores", "excluir"))])
def deletar_colaborador(id: int, db: Session = Depends(get_db)):
    db_obj = db.query(models.Colaborador).filter(models.Colaborador.id_colaboradores == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")
        
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
    # 1. Busca o usuário no banco pelo ID correto (com fallback para .id caso a coluna varie no model)
    db_obj = db.query(models.Usuario).filter(models.Usuario.id_usuarios == id).first()
    if not db_obj and hasattr(models.Usuario, "id"):
        db_obj = db.query(models.Usuario).filter(models.Usuario.id == id).first()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # 2. Atualização dos campos enviados
    if obj.usuario is not None:
        db_obj.usuario = obj.usuario
    if obj.id_perfis is not None:
        db_obj.id_perfis = obj.id_perfis
    if hasattr(obj, "id_colaboradores") and obj.id_colaboradores is not None:
        db_obj.id_colaboradores = obj.id_colaboradores
    if obj.email is not None:
        db_obj.email = obj.email
        
    # 3. Tratamento da senha
    if hasattr(obj, "senha_hash") and obj.senha_hash is not None:
        db_obj.senha_hash = obj.senha_hash
    elif hasattr(obj, "senha") and obj.senha:
        db_obj.senha_hash = obj.senha
        
    # 4. Força a conversão booleana estrita para evitar que False seja ignorado
    if obj.ativo is not None:
        db_obj.ativo = bool(obj.ativo)

    # 5. Persiste as alterações no banco
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
# ENDPOINT PARA CONSULTAR PERMISSÕES DA TELA
# ==========================================
# Coloque esta rota junto com os outros endpoints GET (ex: perto de /produtos/)
@app.get("/permissoes/tela/{nome_tela}", tags=["Permissões"])
def buscar_permissoes_por_tela(
    nome_tela: str, 
    x_perfil_id: int = Header(default=None, alias="x-perfil-id"), 
    db: Session = Depends(get_db)
):
    permissoes_negadas = {"visualizar": False, "inserir": False, "alterar": False, "excluir": False}
    
    if not x_perfil_id:
        return permissoes_negadas

    # Busca a tela ignorando maiúsculas/minúsculas
    tela = db.query(models.Tela).filter(func.lower(models.Tela.nome) == nome_tela.lower()).first()
    if not tela:
        return permissoes_negadas

    # Busca permissão vinculada ao id_perfis e id_telas
    permissao = db.query(models.Permissao).filter(
        models.Permissao.id_perfis == x_perfil_id,
        models.Permissao.id_telas == tela.id_telas
    ).first()

    if not permissao:
        return permissoes_negadas

    return {
        "visualizar": bool(permissao.visualizar),
        "inserir": bool(permissao.inserir),
        "alterar": bool(permissao.alterar),
        "excluir": bool(permissao.excluir)
    }

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

# Importe seus schemas, models e get_db do seu projeto:
# import schemas, models
# from database import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURAÇÃO SEGURA DO BREVO ---
BREVO_API_KEY = os.getenv("BREVO_API_KEY")

if not BREVO_API_KEY:
    logger.warning("BREVO_API_KEY não foi encontrada nas variáveis de ambiente.")

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

    # 6. Estrutura de payload exigida pela API v3 do Brevo
    payload = {
        "sender": {
            "name": "Q.C Software",
            "email": "contato@qcsoftware.com.br"
        },
        "to": [
            {"email": usuario.email}
        ],
        "subject": "Q.C Software - Redefinição de Senha",
        "htmlContent": html_content
    }

    # 7. Envio do e-mail via API REST HTTPS do Brevo
    try:
        chave_api = BREVO_API_KEY or os.getenv("BREVO_API_KEY", "").strip()

        if not chave_api:
            raise RuntimeError("BREVO_API_KEY não configurada no ambiente.")

        request = Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "accept": "application/json",
                "api-key": chave_api,
                "content-type": "application/json"
            },
            method="POST",
        )
        with urlopen(request, timeout=15) as response:
            resposta = json.loads(response.read().decode("utf-8"))
        logger.info(f"E-mail enviado via Brevo com sucesso: {resposta}")

    except HTTPError as err:
        corpo_resposta = err.read().decode("utf-8")
        logger.error(f"Erro HTTP {err.code} do Brevo: {corpo_resposta}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Brevo HTTP {err.code}: {corpo_resposta}"
        )
    except Exception as err:
        logger.error(f"Erro ao enviar e-mail pelo Brevo: {str(err)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro interno ao enviar o e-mail: {str(err)}"
        )

    return {"message": "Enviamos um e-mail com as instruções para redefinir sua senha!"}


# --- ENDPOINT DE CONFIRMAÇÃO DA REDEFINIÇÃO DE SENHA ---

class ConfirmarRedefinicaoSchema(BaseModel):
    email: EmailStr
    nova_senha: str

class PasswordContext:
    """Hash de senhas sem depender de um pacote externo não instalado."""

    _iterations = 600_000

    def hash(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, self._iterations
        )
        return f"pbkdf2_sha256${self._iterations}${salt.hex()}${digest.hex()}"

    def verify(self, password: str, encoded: str) -> bool:
        try:
            algorithm, iterations, salt, expected = encoded.split("$", 3)
            if algorithm != "pbkdf2_sha256":
                return False
            actual = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
            )
            return hmac.compare_digest(actual.hex(), expected)
        except (ValueError, TypeError):
            return False


pwd_context = PasswordContext()

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

        # 2. Gera o hash correto da nova senha plana
        senha_hash = pwd_context.hash(dados.nova_senha)

        # 3. Atualiza o registro e salva no BD
        usuario.senha_hash = senha_hash
        db.commit()
        db.refresh(usuario)

        return {"message": "Senha redefinida com sucesso!"}

    except HTTPException as http_err:
        db.rollback()
        raise http_err

    except Exception as err:
        db.rollback()
        logger.error(f"[ERRO /confirmar-redefinicao]: {str(err)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível processar a alteração de senha."
        )

# Inclui as rotas de autenticação
app.include_router(router)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TELAS_DIR = os.path.join(BASE_DIR, "telas")

# Libera o acesso aos arquivos CSS, JS e imagens dentro de /telas
if os.path.exists(TELAS_DIR):
    app.mount("/telas", StaticFiles(directory=TELAS_DIR, html=True), name="telas")

pwd_context = CryptContext(
    schemes=["bcrypt", "django_pbkdf2_sha256"],
    deprecated="auto"
)

class LoginSchema(BaseModel):
    usuario: str
    senha: str


def buscar_usuario_no_banco(usuario_input: str, db: Session):
    termo = usuario_input.strip().lower()
    return db.query(models.Usuario).filter(
        or_(
            func.lower(models.Usuario.usuario) == termo,
            func.lower(models.Usuario.email) == termo
        )
    ).first()


def verificar_senha(senha_plain: str, hash_banco: str) -> bool:
    if not hash_banco:
        return False

    hash_banco_clean = hash_banco.strip()

    # 1. TRATAMENTO PARA O HASH DA NUVEM (Formato salt$hash SHA-256)
    # Exemplo da foto: 3d764ad49f...$36a1699cc25c...
    if "$" in hash_banco_clean and not hash_banco_clean.startswith(("$2", "pbkdf2_")):
        partes = hash_banco_clean.split("$")
        if len(partes) == 2:
            salt, hash_esperado = partes[0], partes[1]
            
            # Testa combinação 1: salt + senha
            calc1 = hashlib.sha256((salt + senha_plain).encode("utf-8")).hexdigest()
            if calc1.lower() == hash_esperado.lower():
                return True

            # Testa combinação 2: senha + salt
            calc2 = hashlib.sha256((senha_plain + salt).encode("utf-8")).hexdigest()
            if calc2.lower() == hash_esperado.lower():
                return True

    # 2. HASHEs SIMPLES SEM PREFIXO (SHA-256 / MD5 / Texto Puro)
    if not hash_banco_clean.startswith(("$2", "pbkdf2_")):
        # SHA-256 simples
        sha256_hash = hashlib.sha256(senha_plain.encode("utf-8")).hexdigest()
        if sha256_hash.lower() == hash_banco_clean.lower():
            return True

        # MD5 simples
        md5_hash = hashlib.md5(senha_plain.encode("utf-8")).hexdigest()
        if md5_hash.lower() == hash_banco_clean.lower():
            return True

        # Texto puro
        if senha_plain == hash_banco_clean:
            return True

        return False

    # 3. HASHEs MODERNOS (Bcrypt / PBKDF2)
    try:
        if pwd_context.verify(senha_plain, hash_banco_clean):
            return True
    except Exception:
        pass

    # Fallback Bcrypt ($2b$ vs $2a$)
    try:
        hash_ajustado = hash_banco_clean.replace("$2b$", "$2a$")
        return pwd_context.verify(senha_plain, hash_ajustado)
    except Exception:
        pass

    return False


@app.get("/", response_class=FileResponse)
async def serve_login():
    login_path = os.path.join(TELAS_DIR, "login.html")
    if os.path.exists(login_path):
        return FileResponse(login_path)
    raise HTTPException(status_code=404, detail="Arquivo login.html não encontrado na pasta telas")


@app.post("/autenticar")
async def autenticar(dados: LoginSchema, db: Session = Depends(get_db)):
    user = buscar_usuario_no_banco(dados.usuario, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos."
        )

    # 1. Validação de usuário inativo antes de processar ou confirmar o login
    is_ativo = getattr(user, "ativo", True)
    if is_ativo is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: Usuário inativo no sistema."
        )

    senha_hash_banco = getattr(user, "senha_hash", None) or getattr(user, "senha", None)
    senha_digitada = dados.senha.strip()

    if not verificar_senha(senha_digitada, senha_hash_banco):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos."
        )

    user_dict = {
        column.name: getattr(user, column.name)
        for column in user.__table__.columns
        if column.name not in ["senha_hash", "senha"]
    }

    return {
        "sucesso": True,
        "usuario": user_dict
    }

# ==========================================
# ASSISTENTE DE IA (SOMENTE LEITURA - DASHBOARD)
# ==========================================

DATABASE_URL_RO = os.getenv(
    "DATABASE_URL_READONLY",
    "postgresql://qcsoftwareia:QcsoftwareIA@179.198.119.225:5432/qcsoftware?sslmode=disable"
)
engine_ro = create_engine(DATABASE_URL_RO, pool_pre_ping=True)

MODELOS_GEMINI = ["gemini-3.8-flash-lite", "gemini-3.8-flash"]

SYSTEM_PROMPT_IA = """Você é o Assistente Executivo de Dados do sistema Q.C Software.
Sua tarefa é gerar APENAS uma consulta SQL PostgreSQL válida e segura (somente SELECT) para responder de forma executiva e objetiva à pergunta do líder.
Retorne APENAS o código SQL puro, sem blocos markdown (```sql), sem explicações.

REGRAS ESTRITAS:
- Apenas comandos SELECT ou WITH. Proibido INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE.
- Consulte EXCLUSIVAMENTE as 7 tabelas listadas abaixo. É estritamente proibido acessar qualquer outra tabela (como usuarios, permissoes, auditoria, perfis, tela).
- Nunca selecione a coluna 'foto' da tabela ocorrencias.
- Use ILIKE '%termo%' para filtros de texto.
- Quando consultar ocorrências, inclua data e hora formatadas com TO_CHAR(data_ocorrencias, 'DD/MM/YYYY HH24:MI') AS "Data/Hora".
- Dê apelidos (AS) curtos e executivos em português para as colunas (no máximo 4 colunas no SELECT).
- Adicione sempre LIMIT 3 quando não for uma agregação de linha única (COUNT, AVG, SUM).

TABELAS AUTORIZADAS:
- cargos (id_cargos, nome, data_criacao, data_atualizacao, ativo)
- colaboradores (id_colaboradores, nome, matricula, id_cargos, email, data_criacao, data_atualizacao, ativo, setor)
- maquinas (id_maquinas, nome, data_criacao, data_atualizacao, ativo)
- maquinas_historico_ocorrencias (id, id_maquinas, data_hora, colaborador, problema)
- maquinas_mapa (id_maquinas, nome, x, y, status, ativo) -- status: 'Normal', 'Manutenção', 'Parado'
- ocorrencias (numero_ocorrencias, data_ocorrencias, id_maquinas, id_colaboradores, id_produtos, lote_produtos, numero_nota, problema, falha_onde, falha_como, falha_quando, falha_quem, observacoes, acao_corretiva, data_prazo, situacao, data_criacao, data_atualizacao) -- situacao: 'Pendente', 'Em andamento', 'Em análise', 'Concluído'
- produtos (id_produtos, nome, categoria, data_criacao, data_atualizacao, ativo)
"""

def _norm(txt: str) -> str:
    return unicodedata.normalize("NFKD", txt or "").encode("ASCII", "ignore").decode("ASCII").lower().strip()

def resolver_sql_local_rapido(pergunta: str):
    """Motor local instantâneo retornando a quantidade total real + no máximo 3 informações com data/hora."""
    p = _norm(pergunta)

    # Bloqueio imediato de tentativas de escrita
    if any(w in p.split() for w in ["inserir", "cadastrar", "criar", "adicionar", "alterar", "atualizar", "editar", "excluir", "deletar", "apagar", "remover"]):
        raise ValueError("Operação de escrita bloqueada.")

# 1. Tempo médio em DIAS de máquinas paradas e em manutenção (baseado em maquinas_historico_ocorrencias)
    if any(k in p for k in ["tempo", "media", "dias"]) and any(k in p for k in ["maquina", "parada", "manutencao", "andamento"]):
        return """
            WITH base_datas AS (
                SELECT
                    id,
                    id_maquinas,
                    problema,
                    CASE
                        WHEN data_hora ~ '^\\d{2}/\\d{2}/\\d{4}' THEN TO_TIMESTAMP(data_hora, 'DD/MM/YYYY HH24:MI:SS')
                        WHEN data_hora ~ '^\\d{4}-\\d{2}-\\d{2}' THEN data_hora::timestamp
                        ELSE NULL
                    END AS dt_evento
                FROM public.maquinas_historico_ocorrencias
            ),
            intervalos AS (
                SELECT
                    problema,
                    EXTRACT(EPOCH FROM (
                        COALESCE(
                            LEAD(dt_evento) OVER (PARTITION BY id_maquinas ORDER BY dt_evento ASC, id ASC),
                            NOW()::timestamp
                        ) - dt_evento
                    )) / 86400.0 AS dias
                FROM base_datas
                WHERE dt_evento IS NOT NULL
            )
            SELECT
                REPLACE(COALESCE(ROUND(AVG(dias) FILTER (WHERE problema ILIKE '%parada%' OR problema ILIKE '%parado%')::numeric, 1), 0)::text, '.', ',') || ' dias' AS "Média Máquinas Paradas",
                REPLACE(COALESCE(ROUND(AVG(dias) FILTER (WHERE problema ILIKE '%manuten%')::numeric, 1), 0)::text, '.', ',') || ' dias' AS "Média Em Manutenção"
            FROM intervalos
            WHERE dias >= 0
        """

    # 2. Máquina que fica mais parada / em manutenção ou com mais ocorrências (Top 3 + Total)
    if ("maquina" in p) and ("mais" in p or "ranking" in p or "maior" in p):
        if "parada" in p or "manutencao" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    m.nome AS "Máquina",
                    COUNT(*) AS "Paradas/Manutenções"
                FROM public.maquinas_historico_ocorrencias h
                JOIN public.maquinas m ON m.id_maquinas = h.id_maquinas
                WHERE h.problema ILIKE '%parada%' OR h.problema ILIKE '%manuten%' OR h.problema ILIKE '%parado%'
                GROUP BY m.nome
                ORDER BY "Paradas/Manutenções" DESC
                LIMIT 3
            """
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                m.nome AS "Máquina",
                COUNT(o.numero_ocorrencias) AS "Ocorrências"
            FROM public.ocorrencias o
            JOIN public.maquinas m ON m.id_maquinas = o.id_maquinas
            GROUP BY m.nome
            ORDER BY "Ocorrências" DESC
            LIMIT 3
        """

    # 3. Produto com mais ocorrências (Top 3 + Total)
    if "produto" in p and ("mais" in p or "ranking" in p or "maior" in p) and "ocorrencia" in p:
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                pr.nome AS "Produto",
                COUNT(o.numero_ocorrencias) AS "Ocorrências"
            FROM public.ocorrencias o
            JOIN public.produtos pr ON pr.id_produtos = o.id_produtos
            GROUP BY pr.nome
            ORDER BY "Ocorrências" DESC
            LIMIT 3
        """

    # 4. Colaborador com mais ocorrências (Top 3 + Total)
    if "colaborador" in p and ("mais" in p or "ranking" in p or "maior" in p) and "ocorrencia" in p:
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                c.nome AS "Colaborador",
                COUNT(o.numero_ocorrencias) AS "Ocorrências"
            FROM public.ocorrencias o
            JOIN public.colaboradores c ON c.id_colaboradores = o.id_colaboradores
            GROUP BY c.nome
            ORDER BY "Ocorrências" DESC
            LIMIT 3
        """

    # 5. Quantidade de ocorrências por Dia, Mês e Ano (Últimos 3 períodos + Total)
    if "ocorrencia" in p and any(w in p for w in ["dia", "mes", "ano", "hoje", "periodo"]):
        if "dia" in p or "hoje" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    TO_CHAR(data_ocorrencias, 'DD/MM/YYYY') AS "Dia",
                    COUNT(*) AS "Ocorrências"
                FROM public.ocorrencias
                WHERE data_ocorrencias IS NOT NULL
                GROUP BY DATE(data_ocorrencias), TO_CHAR(data_ocorrencias, 'DD/MM/YYYY')
                ORDER BY DATE(data_ocorrencias) DESC
                LIMIT 3
            """
        if "mes" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    TO_CHAR(data_ocorrencias, 'MM/YYYY') AS "Mês/Ano",
                    COUNT(*) AS "Ocorrências"
                FROM public.ocorrencias
                WHERE data_ocorrencias IS NOT NULL
                GROUP BY DATE_TRUNC('month', data_ocorrencias), TO_CHAR(data_ocorrencias, 'MM/YYYY')
                ORDER BY DATE_TRUNC('month', data_ocorrencias) DESC
                LIMIT 3
            """
        if "ano" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    EXTRACT(YEAR FROM data_ocorrencias)::int AS "Ano",
                    COUNT(*) AS "Ocorrências"
                FROM public.ocorrencias
                WHERE data_ocorrencias IS NOT NULL
                GROUP BY EXTRACT(YEAR FROM data_ocorrencias)
                ORDER BY "Ano" DESC
                LIMIT 3
            """

    # 6. Ocorrências separadas: Pendentes, Em andamento e Concluídas (com Data e Hora)
    if "ocorrencia" in p:
        if "andamento" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    o.numero_ocorrencias AS "Nº",
                    TO_CHAR(COALESCE(o.data_ocorrencias, o.data_criacao), 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
                    m.nome AS "Máquina",
                    o.problema AS "Problema"
                FROM public.ocorrencias o
                LEFT JOIN public.maquinas m ON m.id_maquinas = o.id_maquinas
                WHERE o.situacao = 'Em andamento'
                ORDER BY COALESCE(o.data_ocorrencias, o.data_criacao) DESC
                LIMIT 3
            """
        if "pendente" in p or "aberta" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    o.numero_ocorrencias AS "Nº",
                    TO_CHAR(COALESCE(o.data_ocorrencias, o.data_criacao), 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
                    m.nome AS "Máquina",
                    o.problema AS "Problema"
                FROM public.ocorrencias o
                LEFT JOIN public.maquinas m ON m.id_maquinas = o.id_maquinas
                WHERE o.situacao = 'Pendente'
                ORDER BY COALESCE(o.data_ocorrencias, o.data_criacao) DESC
                LIMIT 3
            """
        if "concluida" in p or "resolvida" in p or "finalizada" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    o.numero_ocorrencias AS "Nº",
                    TO_CHAR(COALESCE(o.data_ocorrencias, o.data_criacao), 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
                    m.nome AS "Máquina",
                    o.problema AS "Problema"
                FROM public.ocorrencias o
                LEFT JOIN public.maquinas m ON m.id_maquinas = o.id_maquinas
                WHERE o.situacao = 'Concluído'
                ORDER BY COALESCE(o.data_ocorrencias, o.data_criacao) DESC
                LIMIT 3
            """
        if "quantas" in p or "total" in p or "resumo" in p or "situacao" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    situacao AS "Situação",
                    COUNT(*) AS "Quantidade"
                FROM public.ocorrencias
                GROUP BY situacao
                ORDER BY "Quantidade" DESC
                LIMIT 3
            """
        # Consulta genérica de ocorrências recentes com data e hora
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                o.numero_ocorrencias AS "Nº",
                TO_CHAR(COALESCE(o.data_ocorrencias, o.data_criacao), 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
                m.nome AS "Máquina",
                o.problema AS "Problema"
            FROM public.ocorrencias o
            LEFT JOIN public.maquinas m ON m.id_maquinas = o.id_maquinas
            ORDER BY COALESCE(o.data_ocorrencias, o.data_criacao) DESC
            LIMIT 3
        """

    # 7. Máquinas paradas ou em manutenção no mapa atual (Total real + 3 itens)
    if "maquina" in p and ("parada" in p or "manutencao" in p):
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                nome AS "Máquina",
                status AS "Status"
            FROM public.maquinas_mapa
            WHERE ativo = true AND status IN ('Parado', 'Manutenção')
            ORDER BY status, nome
            LIMIT 3
        """

    if "maquina" in p and ("status" in p or "mapa" in p or "quantas" in p or "quantidade" in p):
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                status AS "Status",
                COUNT(*) AS "Quantidade"
            FROM public.maquinas_mapa
            WHERE ativo = true
            GROUP BY status
            ORDER BY "Quantidade" DESC
            LIMIT 3
        """

    # 8. Colaboradores e Cargos (Total real + 3 itens)
    if ("colaborador" in p and "cargo" in p) or ("cargo" in p and ("colaborador" in p or "quantos" in p or "quantidade" in p)):
        if "quantidade" in p or "quantos" in p or "por cargo" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    COALESCE(cg.nome, 'Sem Cargo') AS "Cargo",
                    COUNT(c.id_colaboradores) AS "Colaboradores"
                FROM public.cargos cg
                LEFT JOIN public.colaboradores c ON c.id_cargos = cg.id_cargos AND c.ativo = true
                WHERE cg.ativo = true
                GROUP BY cg.nome
                ORDER BY "Colaboradores" DESC
                LIMIT 3
            """
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                c.nome AS "Colaborador",
                COALESCE(cg.nome, 'Sem Cargo') AS "Cargo"
            FROM public.colaboradores c
            LEFT JOIN public.cargos cg ON cg.id_cargos = c.id_cargos
            WHERE c.ativo = true
            ORDER BY c.nome
            LIMIT 3
        """

    if "cargo" in p:
        if "quantidade" in p or "quantos" in p or "total" in p:
            return """
                SELECT COUNT(*) AS "Total de Cargos Ativos"
                FROM public.cargos
                WHERE ativo = true
            """
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                nome AS "Cargo"
            FROM public.cargos
            WHERE ativo = true
            ORDER BY nome
            LIMIT 3
        """

    if "colaborador" in p:
        if "setor" in p:
            return """
                SELECT
                    COUNT(*) OVER() AS "_total_geral",
                    COALESCE(setor, 'Não Informado') AS "Setor",
                    COUNT(*) AS "Colaboradores"
                FROM public.colaboradores
                WHERE ativo = true
                GROUP BY setor
                ORDER BY "Colaboradores" DESC
                LIMIT 3
            """
        if "quantidade" in p or "quantos" in p or "total" in p:
            return """
                SELECT COUNT(*) AS "Total de Colaboradores Ativos"
                FROM public.colaboradores
                WHERE ativo = true
            """
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                c.nome AS "Nome",
                c.setor AS "Setor"
            FROM public.colaboradores c
            WHERE c.ativo = true
            ORDER BY c.nome
            LIMIT 3
        """

    # 9. Produtos (Total real + 3 itens)
    if "produto" in p:
        if "quantidade" in p or "quantos" in p or "total" in p:
            return """
                SELECT
                    COUNT(*) AS "Total de Produtos Ativos",
                    COUNT(DISTINCT categoria) AS "Total de Categorias"
                FROM public.produtos
                WHERE ativo = true
            """
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                nome AS "Produto",
                categoria AS "Categoria"
            FROM public.produtos
            WHERE ativo = true
            ORDER BY nome
            LIMIT 3
        """

    # 10. Histórico de ocorrências das máquinas (Total real + 3 itens com data/hora)
    if "historico" in p:
        return """
            SELECT
                COUNT(*) OVER() AS "_total_geral",
                TO_CHAR(data_hora, 'DD/MM/YYYY HH24:MI') AS "Data/Hora",
                problema AS "Ocorrência"
            FROM public.maquinas_historico_ocorrencias
            ORDER BY id DESC
            LIMIT 3
        """

    return None

def validar_sql_seguro(sql_query: str) -> str:
    """Trava de segurança no backend para garantir que a query seja 100% leitura e use apenas tabelas permitidas."""
    sql_limpo = re.sub(r"```sql|```", "", sql_query or "", flags=re.IGNORECASE).strip().rstrip(";").strip()

    if ";" in sql_limpo:
        raise ValueError("Múltiplas instruções SQL não são permitidas.")

    if not re.match(r"^(SELECT|WITH)\b", sql_limpo, flags=re.IGNORECASE):
        raise ValueError(f"Apenas consultas SELECT ou WITH são permitidas.")

    palavras_proibidas = [
        r"\bINSERT\b", r"\bUPDATE\b", r"\bDELETE\b", r"\bDROP\b",
        r"\bALTER\b", r"\bTRUNCATE\b", r"\bGRANT\b", r"\bREVOKE\b",
        r"\bCREATE\b", r"\bCOPY\b", r"\bEXECUTE\b",
        r"\bUSUARIOS\b", r"\bPERMISSOES\b", r"\bAUDITORIA\b",
        r"\bPERFIS\b", r"\bTELA\b", r"\bSENHA_HASH\b", r"\bPG_CATALOG\b",
        r"\bINFORMATION_SCHEMA\b"
    ]
    for padrao in palavras_proibidas:
        if re.search(padrao, sql_limpo, flags=re.IGNORECASE):
            raise ValueError(f"Termo bloqueado na consulta: {padrao}")

    return sql_limpo

def gerar_sql_gemini(api_key: str, pergunta: str) -> str:
    """Chama a API do Gemini apenas para perguntas abertas, com timeout curto."""
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=10_000)
    )
    ultimo_erro = None
    for modelo in MODELOS_GEMINI:
        try:
            resposta = client.models.generate_content(
                model=modelo,
                contents=f"Pergunta do usuário: {pergunta}",
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT_IA,
                    temperature=0.0,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                )
            )
            return resposta.text
        except Exception as err:
            ultimo_erro = err
            logger.warning(f"[IA Gemini] Modelo '{modelo}' falhou ({type(err).__name__}), tentando próximo...")
            continue
    raise ultimo_erro

def formatar_resultado_rapido(linhas: list, colunas: list) -> str:
    """Exibe primeiro a quantidade total real e em seguida a listagem com até 3 registros (incluindo Data/Hora)."""
    if not linhas:
        return "**Quantidade total:** 0"

    total_real = linhas[0].get("_total_geral", len(linhas))
    colunas_visiveis = [c for c in colunas if c != "_total_geral"]

    # Caso 1: Indicador único / consolidado (ex: Tempo Médio Geral, Contagens diretas)
    if len(linhas) == 1 and "_total_geral" not in colunas:
        partes = []
        for col in colunas_visiveis[:4]:
            val = linhas[0][col]
            if val is not None and str(val).strip() != "":
                label = col.replace("_", " ").capitalize()
                if isinstance(val, bool):
                    val = "Sim" if val else "Não"
                partes.append(f"**{label}:** {val}")
        return "\n".join(partes)

    # Caso 2: Quantidade total no topo + listagem com no máximo 3 itens
    cabecalho = f"**Quantidade total:** {total_real}\n\n"
    itens = []
    for row in linhas[:3]:
        partes = []
        for col in colunas_visiveis[:4]:
            val = row[col]
            if val is not None and str(val).strip() != "":
                label = col.replace("_", " ").capitalize()
                if isinstance(val, bool):
                    val = "Sim" if val else "Não"
                partes.append(f"**{label}:** {val}")
        itens.append("- " + " | ".join(partes))

    return cabecalho + "\n".join(itens)

class PerguntaDashboardSchema(BaseModel):
    pergunta: str

@app.post("/api/assistente-dashboard", tags=["Assistente IA"])
async def consultar_assistente_dashboard(dados: PerguntaDashboardSchema):
    try:
        # Etapa 1: Tenta resolver instantaneamente pelo motor local (< 10ms)
        sql_gerado = resolver_sql_local_rapido(dados.pergunta)

        # Se for uma pergunta aberta/customizada, usa o Gemini para gerar o SQL
        if not sql_gerado:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada no servidor.")
            texto_sql = gerar_sql_gemini(api_key=api_key, pergunta=dados.pergunta)
            sql_gerado = validar_sql_seguro(texto_sql)
        else:
            sql_gerado = validar_sql_seguro(sql_gerado)

        logger.info(f"[IA SQL Executado]: {sql_gerado}")

        # Etapa 2: Executa a consulta no PostgreSQL em modo Read-Only
        with engine_ro.connect() as conn:
            conn.execute(text("SET LOCAL statement_timeout = '5000'"))
            conn.execute(text("SET TRANSACTION READ ONLY"))
            resultado = conn.execute(text(sql_gerado))
            colunas = list(resultado.keys())
            linhas = [dict(zip(colunas, row)) for row in resultado.fetchall()]

        # Etapa 3: Formatação executiva imediata
        resposta_formatada = formatar_resultado_rapido(linhas, colunas)

        return {
            "sucesso": True,
            "resposta": resposta_formatada,
            "total_registros": linhas[0].get("_total_geral", len(linhas)) if linhas else 0
        }

    except ValueError as sec_err:
        logger.warning(f"[IA Bloqueio de Segurança]: {str(sec_err)}")
        return {
            "sucesso": False,
            "resposta": f"Consulta bloqueada pela política de segurança: {str(sec_err)}"
        }
    except Exception as e:
        erro_str = str(e)
        logger.error(f"[Erro Assistente Dashboard]: {type(e).__name__}: {erro_str}")
        if "503" in erro_str or "504" in erro_str or "DEADLINE_EXCEEDED" in erro_str:
            return {
                "sucesso": False,
                "resposta": "O servidor da IA está temporariamente congestionado para perguntas livres. Use os botões rápidos ou pergunte sobre **máquinas paradas**, **tempo médio**, **ocorrências** ou **colaboradores**."
            }
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{type(e).__name__}: {erro_str}"
        )

@app.get("/api/dashboard/catalogos", tags=["Dashboard"])
def obter_catalogos_dashboard():
    """Retorna produtos, máquinas e setores dos colaboradores para o Dashboard."""
    try:
        with engine_ro.connect() as conn:
            conn.execute(text("SET LOCAL statement_timeout = '5000'"))
            conn.execute(text("SET TRANSACTION READ ONLY"))
            
            produtos = conn.execute(
                text("SELECT id_produtos, nome FROM public.produtos")
            ).mappings().all()
            
            maquinas = conn.execute(
                text("SELECT id_maquinas, nome FROM public.maquinas")
            ).mappings().all()
            
            colaboradores = conn.execute(
                text("SELECT id_colaboradores, nome, matricula, setor FROM public.colaboradores")
            ).mappings().all()

        return {
            "produtos": [dict(r) for r in produtos],
            "maquinas": [dict(r) for r in maquinas],
            "colaboradores": [dict(r) for r in colaboradores],
        }
    except Exception as e:
        logger.error(f"[Erro Catálogos Dashboard]: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao carregar catálogos do dashboard: {str(e)}"
        )