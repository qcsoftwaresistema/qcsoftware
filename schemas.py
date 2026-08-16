from pydantic import BaseModel, EmailStr, ConfigDict, Field
from typing import Union
from datetime import datetime, date
from typing import Optional, Any


# =========================================================================
# --- MIXIN COM TOLERÂNCIA TOTAL A DIVERGÊNCIAS ---
# =========================================================================
class SafeModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

class TimestampMixin(SafeModel):
    data_criacao: Optional[Any] = None
    data_atualizacao: Optional[Any] = None
    ativo: Optional[Any] = True

# =========================================================================
# --- CARGOS ---
# =========================================================================
class CargoBase(SafeModel):
    nome: str

class CargoCreate(CargoBase):
    pass

class CargoUpdate(SafeModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None

class Cargo(CargoBase, TimestampMixin):
    id_cargos: int

# =========================================================================
# --- PRODUTOS ---
# =========================================================================
class ProdutoBase(SafeModel):
    nome: str
    categoria: str

class ProdutoCreate(ProdutoBase):
    pass

class ProdutoUpdate(SafeModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    ativo: Optional[bool] = None

class Produto(ProdutoBase, TimestampMixin):
    id_produtos: int

# =========================================================================
# --- MÁQUINAS ---
# =========================================================================
class MaquinaBase(SafeModel):
    nome: str

class MaquinaCreate(MaquinaBase):
    pass

class MaquinaUpdate(SafeModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None

class Maquina(MaquinaBase, TimestampMixin):
    id_maquinas: int

# =========================================================================
# --- TELAS ---
# =========================================================================
class TelaBase(SafeModel):
    nome: str

class TelaCreate(TelaBase):
    pass

class TelaUpdate(SafeModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None

class Tela(TelaBase, TimestampMixin):
    id_telas: int

# =========================================================================
# --- PERFIS ---
# =========================================================================
class PerfilBase(SafeModel):
    nome: str

class PerfilCreate(PerfilBase):
    pass

class PerfilUpdate(SafeModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None

class Perfil(PerfilBase, TimestampMixin):
    id_perfis: int

# =========================================================================
# --- COLABORADORES ---
# =========================================================================
class ColaboradorBase(SafeModel):
    nome: str
    matricula: int
    id_cargos: int
    email: Optional[str] = None
    setor: str

class ColaboradorCreate(ColaboradorBase):
    pass

class ColaboradorUpdate(SafeModel):
    nome: Optional[str] = None
    matricula: Optional[int] = None
    id_cargos: Optional[int] = None
    email: Optional[str] = None
    ativo: Optional[bool] = None
    setor: Optional[str] = None

class Colaborador(ColaboradorBase, TimestampMixin):
    id_colaboradores: int

# =========================================================================
# --- USUÁRIOS ---
# =========================================================================
class UsuarioBase(SafeModel):
    usuario: str
    id_colaboradores: int
    id_perfis: int
    email: Optional[str] = None

class UsuarioCreate(UsuarioBase):
    senha_hash: str 

class UsuarioUpdate(SafeModel):
    usuario: Optional[str] = None
    id_perfis: Optional[int] = None
    email: Optional[str] = None
    senha_hash: Optional[str] = None
    ativo: Optional[bool] = None

class Usuario(UsuarioBase, TimestampMixin):
    id_usuarios: int

# =========================================================================
# --- PERMISSÕES ---
# =========================================================================
class PermissaoBase(SafeModel):
    id_perfis: int
    id_telas: int
    visualizar: Optional[bool] = False
    inserir: Optional[bool] = False
    alterar: Optional[bool] = False
    excluir: Optional[bool] = False

class PermissaoCreate(PermissaoBase):
    pass

class PermissaoUpdate(SafeModel):
    id_perfis: Optional[int] = None
    id_telas: Optional[int] = None
    visualizar: Optional[bool] = None
    inserir: Optional[bool] = None
    alterar: Optional[bool] = None
    excluir: Optional[bool] = None
    ativo: Optional[bool] = None

class Permissao(PermissaoBase, TimestampMixin):
    id_permissoes: int

# =========================================================================
# --- OCORRÊNCIAS (CORRIGIDO SEM ID_OCORRENCIAS) ---
# =========================================================================
class OcorrenciaBase(SafeModel):
    id_maquinas: int
    id_colaboradores: int
    id_produtos: int
    numero_ocorrencias: int = Field(default=0)
    
    # CORREÇÃO CRÍTICA: Permite que o Pydantic aceite tanto a String enviada pelo front 
    # quanto o datetime retornado pelo SQLAlchemy sem estourar ResponseValidationError
    data_ocorrencias: Union[datetime, date, str]
    data_prazo: Optional[Union[datetime, date, str]] = Field(default=None)
    
    lote_produtos: Optional[str] = Field(default="0")
    numero_nota: Optional[int] = Field(default=0)
    problema: Optional[str] = Field(default="")
    falha_onde: Optional[str] = Field(default="Não informado")
    falha_como: Optional[str] = Field(default="")
    falha_quando: Optional[str] = Field(default="")
    falha_quem: Optional[str] = Field(default="")
    observacoes: Optional[str] = Field(default="")
    acao_corretiva: Optional[str] = Field(default="")
    situacao: Optional[str] = Field(default="Pendente")
    foto: Optional[str] = Field(default=None)

class OcorrenciaCreate(OcorrenciaBase):
    pass  

class OcorrenciaUpdate(OcorrenciaBase):
    pass  

class Ocorrencia(OcorrenciaBase, TimestampMixin):
    pass

# Schema para receber apenas o e-mail na recuperação
class EsqueciSenhaSchema(BaseModel):
    email: EmailStr

# Schema de resposta padrão
class MensagemResposta(BaseModel):
    message: str