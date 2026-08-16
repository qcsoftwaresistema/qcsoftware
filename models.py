from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, CheckConstraint, Text, text
from sqlalchemy.sql import func
from database import Base

class Cargo(Base):
    __tablename__ = "cargos"
    id_cargos = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Produto(Base):
    __tablename__ = "produtos"
    id_produtos = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    categoria = Column(String(100), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Maquina(Base):
    __tablename__ = "maquinas"
    id_maquinas = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Tela(Base):
    __tablename__ = "tela"
    id_telas = Column(Integer, primary_key=True, index=True)
    nome = Column(String(50), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Perfil(Base):
    __tablename__ = "perfis"
    id_perfis = Column(Integer, primary_key=True, index=True)
    nome = Column(String(50), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Colaborador(Base):
    __tablename__ = "colaboradores"
    id_colaboradores = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    matricula = Column(Integer, nullable=False)
    id_cargos = Column(Integer, ForeignKey("cargos.id_cargos"), nullable=False)
    email = Column(String(100), nullable=True)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)
    setor = Column(String(255), nullable=False)

class Usuario(Base):
    __tablename__ = "usuarios"
    id_usuarios = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(100), nullable=False)
    id_colaboradores = Column(Integer, ForeignKey("colaboradores.id_colaboradores"), nullable=False)
    id_perfis = Column(Integer, ForeignKey("perfis.id_perfis"), nullable=False)
    email = Column(String(100), nullable=True)
    senha_hash = Column(String(255), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Permissao(Base):
    __tablename__ = "permissoes"
    id_permissoes = Column(Integer, primary_key=True, index=True)
    id_perfis = Column(Integer, ForeignKey("perfis.id_perfis"), nullable=False)
    id_telas = Column(Integer, ForeignKey("tela.id_telas"), nullable=False)
    visualizar = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    inserir = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    alterar = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    excluir = Column(Boolean, default=False, server_default=text("false"), nullable=False)
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    ativo = Column(Boolean, default=True, server_default=text("true"), nullable=True)

class Ocorrencia(Base):
    __tablename__ = "ocorrencias"    
    
    # 💡 AJUSTE CRÍTICO PARA O POST: 
    # autoincrement=False impede o SQLAlchemy de tentar ler um ID serial gerado pelo banco.
    # primary_key=True é mantido apenas como uma exigência estrutural da API.
    numero_ocorrencias = Column(Integer, primary_key=True, autoincrement=False, nullable=False, default=0)
    
    # --- Restante das colunas idênticas ao seu banco ---
    data_ocorrencias = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    id_maquinas = Column(Integer, ForeignKey("maquinas.id_maquinas"), nullable=False)
    id_colaboradores = Column(Integer, ForeignKey("colaboradores.id_colaboradores"), nullable=False)
    id_produtos = Column(Integer, ForeignKey("produtos.id_produtos"), nullable=False)
    
    lote_produtos = Column(String(255), nullable=False, default="0")
    numero_nota = Column(Integer, nullable=False, default=0)
    problema = Column(String(255), nullable=False, default="")
    falha_onde = Column(String(255), nullable=False, default="Não informado")
    falha_como = Column(String(255), nullable=False, default="")
    falha_quando = Column(String(255), nullable=False, default="")
    falha_quem = Column(String(255), nullable=False, default="")
    observacoes = Column(String(1000), nullable=False, default="")
    acao_corretiva = Column(String(255), nullable=False, default="")
    
    data_prazo = Column(DateTime(timezone=True), nullable=True)
    situacao = Column(String(20), default="Pendente", server_default=text("'Pendente'"), nullable=False)
    foto = Column(Text, nullable=True)
    
    data_criacao = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    data_atualizacao = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)
    
    __table_args__ = (
        CheckConstraint("situacao IN ('Pendente', 'Em andamento', 'Em análise', 'Concluído')", name="chk_situacao"),
    )