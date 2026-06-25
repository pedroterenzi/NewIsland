from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "postgresql://neondb_owner:npg_FB5WRUfgniD9@ep-calm-grass-ah0b366i.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

def inicializar_banco():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agendamentos (
                id SERIAL PRIMARY KEY,
                cliente VARCHAR(255) NOT NULL,
                servico VARCHAR(255) NOT NULL,
                barbeiro VARCHAR(255) NOT NULL,
                data VARCHAR(50) NOT NULL,
                hora VARCHAR(50) NOT NULL,
                pagamento VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'Agendado'
            );
        """)
        
        try: cursor.execute("ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_produtos NUMERIC DEFAULT 0.00;")
        except Exception: pass
        
        try: cursor.execute("ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_gorjeta NUMERIC DEFAULT 0.00;")
        except Exception: pass
            
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                login VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(100) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                perfil VARCHAR(50) DEFAULT 'cliente',
                celular VARCHAR(50),
                preferencias TEXT,
                pontos_fidelidade INT DEFAULT 0,
                plano_assinatura VARCHAR(100) DEFAULT 'Nenhum'
            );
        """)

        try: cursor.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comissao NUMERIC DEFAULT 0.00;")
        except Exception: pass
        
        try: cursor.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pix VARCHAR(255) DEFAULT '';")
        except Exception: pass

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS despesas (
                id SERIAL PRIMARY KEY,
                descricao VARCHAR(255) NOT NULL,
                valor NUMERIC NOT NULL,
                data VARCHAR(50) NOT NULL
            );
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                preco NUMERIC NOT NULL,
                sub VARCHAR(255)
            );
        """)
        
        cursor.execute("SELECT COUNT(*) FROM servicos;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO servicos (nome, preco, sub) VALUES 
                ('Corte Simples', 40.00, 'Duração: 30 min'), 
                ('Corte + Sobrancelha', 55.00, 'Duração: 45 min'), 
                ('Barba Completa', 35.00, 'Duração: 30 min'), 
                ('Combo Premium', 85.00, 'Corte + Barba + Sobrancelha');
            """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS configuracoes (
                id SERIAL PRIMARY KEY,
                hora_abertura VARCHAR(10) DEFAULT '09:00',
                hora_fechamento VARCHAR(10) DEFAULT '20:00',
                intervalo_inicio VARCHAR(10) DEFAULT '12:00',
                intervalo_fim VARCHAR(10) DEFAULT '13:00',
                datas_fechadas TEXT DEFAULT ''
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM configuracoes;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO configuracoes (hora_abertura, hora_fechamento, intervalo_inicio, intervalo_fim, datas_fechadas) VALUES ('09:00', '20:00', '12:00', '13:00', '');")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bloqueios (
                id SERIAL PRIMARY KEY,
                barbeiro VARCHAR(255) NOT NULL,
                data VARCHAR(50) NOT NULL,
                hora_inicio VARCHAR(10) NOT NULL,
                hora_fim VARCHAR(10) NOT NULL
            );
        """)

        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO usuarios (login, senha, nome, perfil, celular, plano_assinatura, comissao, pix)
                VALUES ('admin', 'admin', 'Administrador Global', 'admin', '00000000000', 'Premium', 0.0, '');
            """)

        clientes_antigos = [
            ('gabriel', '123456', 'Gabriel Proprietário', 'admin', '11999999999', 'Premium', 0.50, ''),
            ('pedroterenzi', 'pedrinho2013', 'pedro henrique', 'cliente', '19971374936', 'Nenhum', 0.0, ''),
            ('denis', 'denis123', 'denis pompollino', 'cliente', '19 99749-4174', 'Nenhum', 0.0, ''),
            ('cccc', '123456789', 'hchch', 'cliente', '191971347859', 'Nenhum', 0.0, ''),
            ('pedrosilva', '123456', 'pedro silva', 'cliente', '19971232678', 'Nenhum', 0.0, ''),
            ('joasilva', '123456', 'joao', 'cliente', '19987234567', 'Nenhum', 0.0, '')
        ]
        
        for c in clientes_antigos:
            try:
                cursor.execute("SELECT id FROM usuarios WHERE login = %s;", (c[0],))
                if not cursor.fetchone():
                    cursor.execute("""
                        INSERT INTO usuarios (login, senha, nome, perfil, celular, plano_assinatura, comissao, pix)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                    """, c)
            except Exception:
                pass
        
        conn.commit()
        cursor.close()
        conn.close()
        print("⚡ Tabelas estruturadas e sincronizadas no Neon!")
    except Exception as e:
        print(f"❌ Erro ao estruturar banco: {str(e)}")

inicializar_banco()

class ModeloCadastro(BaseModel):
    login: str
    senha: str
    nome: str
    celular: str
    plano_assinatura: Optional[str] = "Nenhum"
    perfil: Optional[str] = "cliente"
    comissao: Optional[float] = 0.0
    pix: Optional[str] = ""

class ModeloEdicaoUsuario(BaseModel):
    nome: str
    celular: str
    comissao: float
    perfil: str 
    pix: str

class ModeloAuth(BaseModel):
    login: str
    senha: str

class ModeloAgendamento(BaseModel):
    cliente: str
    servico: str
    barbeiro: str
    data: str
    hora: str
    pagamento: str
    status: Optional[str] = "Agendado"
    valor_produtos: Optional[float] = 0.0
    valor_gorjeta: Optional[float] = 0.0

class ModeloStatus(BaseModel):
    status: str

class ModeloDespesa(BaseModel):
    descricao: str
    valor: float
    data: str

class ModeloServico(BaseModel):
    nome: str
    preco: float
    sub: str

class ModeloConfiguracao(BaseModel):
    hora_abertura: str
    hora_fechamento: str
    intervalo_inicio: str
    intervalo_fim: str
    datas_fechadas: str

class ModeloBloqueio(BaseModel):
    barbeiro: str
    data: str
    hora_inicio: str
    hora_fim: str

@app.post("/bloqueios")
def salvar_bloqueio(obj: ModeloBloqueio):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bloqueios (barbeiro, data, hora_inicio, hora_fim) VALUES (%s, %s, %s, %s) RETURNING id;",
            (obj.barbeiro, obj.data, obj.hora_inicio, obj.hora_fim)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/bloqueios")
def listar_bloqueios():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM bloqueios ORDER BY data DESC, hora_inicio ASC;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/bloqueios/{id}")
def remover_bloqueio(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bloqueios WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/configuracoes")
def obter_configuracoes():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM configuracoes LIMIT 1;")
        config = cursor.fetchone()
        cursor.close()
        conn.close()
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/configuracoes")
def atualizar_configuracoes(obj: ModeloConfiguracao):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE configuracoes SET hora_abertura = %s, hora_fechamento = %s, intervalo_inicio = %s, intervalo_fim = %s, datas_fechadas = %s WHERE id = 1;",
            (obj.hora_abertura, obj.hora_fechamento, obj.intervalo_inicio, obj.intervalo_fim, obj.datas_fechadas)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/usuarios/cadastro")
def cadastrar_usuario(obj: ModeloCadastro):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO usuarios (login, senha, nome, perfil, celular, plano_assinatura, comissao, pix) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);",
            (obj.login.strip().lower(), obj.senha, obj.nome, obj.perfil, obj.celular, obj.plano_assinatura, obj.comissao, obj.pix)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e:
        error_msg = str(e).lower()
        if "unique" in error_msg or "duplicate" in error_msg:
            raise HTTPException(status_code=400, detail="Este login já está cadastrado.")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/usuarios/auth")
def autenticar_usuario(obj: ModeloAuth):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM usuarios WHERE login = %s AND senha = %s;", (obj.login.strip().lower(), obj.senha))
        usuario = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if usuario:
            return usuario
        
        raise HTTPException(status_code=404, detail="Usuário ou senha incorretos.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno de conexão: {str(e)}")

@app.get("/usuarios")
def listar_usuarios():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, login, nome, perfil, celular, pontos_fidelidade, plano_assinatura, comissao, pix FROM usuarios;")
        usuarios = cursor.fetchall()
        cursor.close()
        conn.close()
        return usuarios
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/usuarios/{id}")
def editar_usuario(id: int, obj: ModeloEdicaoUsuario):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE usuarios SET nome = %s, celular = %s, comissao = %s, perfil = %s, pix = %s WHERE id = %s;",
            (obj.nome, obj.celular, obj.comissao, obj.perfil, obj.pix, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/usuarios/{id}")
def remover_usuario(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agendamentos")
def salvar_agendamento(obj: ModeloAgendamento):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO agendamentos (cliente, servico, barbeiro, data, hora, pagamento, status, valor_produtos, valor_gorjeta) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;",
            (obj.cliente, obj.servico, obj.barbeiro, obj.data, obj.hora, obj.pagamento, obj.status, obj.valor_produtos, obj.valor_gorjeta)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/agendamentos")
def listar_agendamentos():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM agendamentos;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/agendamentos/{id}/status")
def atualizar_status(id: int, obj: ModeloStatus):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("UPDATE agendamentos SET status = %s WHERE id = %s;", (obj.status, id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/agendamentos/{id}")
def editar_agendamento(id: int, obj: ModeloAgendamento):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE agendamentos SET servico = %s, barbeiro = %s, data = %s, hora = %s, pagamento = %s WHERE id = %s;",
            (obj.servico, obj.barbeiro, obj.data, obj.hora, obj.pagamento, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/agendamentos/{id}")
def remover_agendamento(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM agendamentos WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/despesas")
def salvar_despesa(obj: ModeloDespesa):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO despesas (descricao, valor, data) VALUES (%s, %s, %s) RETURNING id;",
            (obj.descricao, obj.valor, obj.data)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/despesas")
def listar_despesas():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM despesas ORDER BY data DESC;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/despesas/{id}")
def editar_despesa(id: int, obj: ModeloDespesa):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE despesas SET descricao = %s, valor = %s, data = %s WHERE id = %s;",
            (obj.descricao, obj.valor, obj.data, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/despesas/{id}")
def remover_despesa(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM despesas WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servicos")
def salvar_servico(obj: ModeloServico):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO servicos (nome, preco, sub) VALUES (%s, %s, %s) RETURNING id;",
            (obj.nome, obj.preco, obj.sub)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/servicos")
def listar_servicos():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM servicos ORDER BY preco ASC;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/servicos/{id}")
def editar_servico(id: int, obj: ModeloServico):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE servicos SET nome = %s, preco = %s, sub = %s WHERE id = %s;",
            (obj.nome, obj.preco, obj.sub, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/servicos/{id}")
def remover_servico(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM servicos WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
