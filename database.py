import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 1. Tratamento seguro de credenciais e URL de conexão
# Usamos o quote_plus para escapar caracteres especiais na senha de forma segura
usuario = "fabricio"
senha_segura = urllib.parse.quote_plus("Myfab@123")
host = "179.198.119.225"
porta = "5432"
banco = "qcsoftware"

SQLALCHEMY_DATABASE_URL = f"postgresql://{usuario}:{senha_segura}@{host}:{porta}/{banco}?sslmode=disable"

# 2. Configuração do Engine e Sessão
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Declarative base (Padrão moderno do SQLAlchemy 2.0+)
class Base(DeclarativeBase):
    pass

# Dependência para obter a sessão do banco nas rotas do FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()