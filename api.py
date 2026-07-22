from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI(title="API Controle de Materiais e Rastreabilidade MP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "postgresql://neondb_owner:npg_G9jBAgO0hpXr@ep-broad-sky-ate4cjbm.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def inicializar_banco():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY, 
                login VARCHAR(100) UNIQUE NOT NULL, 
                senha VARCHAR(100) NOT NULL, 
                nome VARCHAR(255) NOT NULL, 
                nivel INT DEFAULT 1
            );
        """)
        
        # 2. Máquinas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS maquinas (
                id SERIAL PRIMARY KEY, 
                numero_maquina INT UNIQUE NOT NULL, 
                tipo VARCHAR(50) NOT NULL, 
                ativo BOOLEAN DEFAULT TRUE
            );
        """)
        
        # 3. Cadastro Mestre de Materiais (TNT, SAP, Cola, Lycra)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_materiais (
                id SERIAL PRIMARY KEY,
                codigo_material VARCHAR(100) UNIQUE NOT NULL,
                descricao VARCHAR(255) NOT NULL,
                tipo_material VARCHAR(50) NOT NULL,
                peso_tubete_padrao NUMERIC(12,3) DEFAULT 0.000
            );
        """)

        # 4. Lotes e Bobinas em Estoque / WIP (Capacidade expandida NUMERIC(12,3))
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lotes_estoque (
                id SERIAL PRIMARY KEY,
                codigo_barras_lote VARCHAR(100) UNIQUE NOT NULL,
                codigo_material VARCHAR(100) REFERENCES master_materiais(codigo_material) ON DELETE CASCADE,
                lote_fornecedor VARCHAR(100) NOT NULL,
                peso_inicial NUMERIC(12,3) NOT NULL,
                peso_atual NUMERIC(12,3) NOT NULL,
                status VARCHAR(50) DEFAULT 'em_estoque',
                data_entrada TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 5. Consumo Real por Ordem de Produção (Scan & Play)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consumo_op_lote (
                id SERIAL PRIMARY KEY,
                ordem_producao VARCHAR(100) NOT NULL,
                maquina_numero INT NOT NULL,
                codigo_barras_lote VARCHAR(100) REFERENCES lotes_estoque(codigo_barras_lote) ON DELETE CASCADE,
                peso_alocado NUMERIC(12,3) NOT NULL,
                peso_devolvido NUMERIC(12,3) DEFAULT 0,
                consumo_real NUMERIC(12,3) DEFAULT 0,
                operador VARCHAR(255) NOT NULL,
                data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_fim TIMESTAMP,
                status VARCHAR(50) DEFAULT 'em_uso',
                op_destino_transferencia VARCHAR(100)
            );
        """)

        # 6. Apontamento de Refugo (Scrap) de Fraldas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS apontamento_refugo (
                id SERIAL PRIMARY KEY,
                ordem_producao VARCHAR(100) NOT NULL,
                maquina_numero INT NOT NULL,
                peso_refugo_kg NUMERIC(12,3) NOT NULL,
                tipo_refugo VARCHAR(100) NOT NULL,
                operador VARCHAR(255) NOT NULL,
                data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # ALTERAÇÃO AUTOMÁTICA DE COLUNAS EXISTENTES (Evita erro NUMERIC OVERFLOW no PostgreSQL)
        try:
            cursor.execute("ALTER TABLE master_materiais ALTER COLUMN peso_tubete_padrao TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_inicial TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_atual TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_alocado TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_devolvido TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN consumo_real TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE apontamento_refugo ALTER COLUMN peso_refugo_kg TYPE NUMERIC(12,3);")
        except Exception as err_alter:
            print(f"Aviso na alteracao de colunas: {err_alter}")
        
        # Garante o admin padrão
        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")
            
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"Erro na inicializacao do banco: {e}")
    finally:
        if conn:
            conn.close()

inicializar_banco()

# --- MODELOS PYDANTIC ---
class ModelAuth(BaseModel):
    login: str
    senha: str

class ModelUsuario(BaseModel):
    login: str
    senha: str
    nome: str
    nivel: int

class ModelMaquina(BaseModel):
    numero_maquina: int
    tipo: str
    ativo: bool

class ModelMaterial(BaseModel):
    codigo_material: str
    descricao: str
    tipo_material: str
    peso_tubete_padrao: float

class ModelLoteEstoque(BaseModel):
    codigo_barras_lote: str
    codigo_material: str
    lote_fornecedor: str
    peso_inicial: float

class ModelAbastecerConfirmar(BaseModel):
    ordem_producao: str
    maquina_numero: int
    codigo_barras_lote: str
    operador: str

class ModelDevolucaoFisica(BaseModel):
    consumo_id: int
    peso_manual_kg: float
    operador: str

class ModelDevolucaoSistemica(BaseModel):
    consumo_id: int
    nova_ordem_destino: str
    peso_transferido_kg: float
    operador: str

class ModelRefugo(BaseModel):
    ordem_producao: str
    maquina_numero: int
    peso_refugo_kg: float
    tipo_refugo: str
    operador: str

class ItemImportacaoMassa(BaseModel):
    codigo_barras_lote: str
    codigo_material: str
    lote_fornecedor: str
    peso_inicial: float

# --- AUTENTICAÇÃO E MESTRES ---
@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    login = obj.login.strip().lower()
    if login == "admin" and obj.senha == "admin":
        return {"login": "admin", "nome": "Administrador Global", "nivel": 3}
    
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT login, nome, nivel FROM usuarios WHERE login = %s AND senha = %s;", (login, obj.senha))
        user = cursor.fetchone()
        cursor.close()
        if user:
            return user
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/dados-mestres")
def obter_dados_mestres():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        dados = {}
        cursor.execute("SELECT * FROM master_materiais ORDER BY codigo_material ASC;")
        dados["materiais"] = cursor.fetchall()
        cursor.execute("SELECT * FROM maquinas ORDER BY numero_maquina ASC;")
        dados["maquinas"] = cursor.fetchall()
        cursor.execute("SELECT id, login, nome, nivel FROM usuarios WHERE login != 'admin' ORDER BY nome ASC;")
        dados["usuarios"] = cursor.fetchall()
        cursor.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# --- CONSULTA E PRÉ-VISUALIZAÇÃO DE BARRAS ---

@app.get("/lotes/consultar/{codigo_barras}")
def consultar_lote_para_abastecer(codigo_barras: str):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT l.codigo_barras_lote, l.codigo_material, l.lote_fornecedor, l.peso_atual, l.status, m.descricao, m.tipo_material
            FROM lotes_estoque l
            JOIN master_materiais m ON l.codigo_material = m.codigo_material
            WHERE l.codigo_barras_lote = %s;
        """, (codigo_barras.strip(),))
        lote = cursor.fetchone()
        cursor.close()
        if not lote:
            raise HTTPException(status_code=404, detail="Etiqueta / Lote não encontrado no sistema!")
        if lote['status'] == 'consumido':
            raise HTTPException(status_code=400, detail="Este lote já consta como totalmente consumido!")
        if lote['status'] == 'em_linha':
            raise HTTPException(status_code=400, detail="Este lote já está alocado em uma máquina!")
            
        return lote
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/consumo/buscar-ativo/{codigo_barras}")
def consultar_lote_ativo_para_devolver(codigo_barras: str):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT c.id as consumo_id, c.ordem_producao, c.maquina_numero, c.peso_alocado, c.codigo_barras_lote,
                   l.codigo_material, m.descricao, m.peso_tubete_padrao, l.lote_fornecedor
            FROM consumo_op_lote c
            JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
            JOIN master_materiais m ON l.codigo_material = m.codigo_material
            WHERE c.codigo_barras_lote = %s AND c.status = 'em_uso';
        """, (codigo_barras.strip(),))
        consumo = cursor.fetchone()
        cursor.close()
        if not consumo:
            raise HTTPException(status_code=404, detail="Esta etiqueta não está atualmente apontada em nenhuma OP ativa!")
            
        return consumo
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# --- OPERAÇÕES: ABASTECER, DEVOLVER FÍSICO E DEVOLVER SISTÊMICO ---

@app.post("/consumo/abastecer")
def confirmar_abastecimento(obj: ModelAbastecerConfirmar):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM lotes_estoque WHERE codigo_barras_lote = %s AND status = 'em_estoque';", (obj.codigo_barras_lote.strip(),))
        lote = cursor.fetchone()
        if not lote:
            raise HTTPException(status_code=400, detail="Lote não disponível para abastecimento.")

        cursor.execute("""
            INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, operador)
            VALUES (%s, %s, %s, %s, %s) RETURNING id;
        """, (obj.ordem_producao.strip(), obj.maquina_numero, obj.codigo_barras_lote.strip(), lote['peso_atual'], obj.operador))
        
        cursor.execute("UPDATE lotes_estoque SET status = 'em_linha' WHERE codigo_barras_lote = %s;", (obj.codigo_barras_lote.strip(),))
        
        conn.commit()
        cursor.close()
        return {"status": "sucesso", "mensagem": "Abastecimento gravado com sucesso!"}
    except HTTPException as h:
        if conn: conn.rollback()
        raise h
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.post("/consumo/devolver-fisico")
def devolver_sobra_fisica(obj: ModelDevolucaoFisica):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT c.*, m.peso_tubete_padrao, l.codigo_material, l.lote_fornecedor
            FROM consumo_op_lote c
            JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
            JOIN master_materiais m ON l.codigo_material = m.codigo_material
            WHERE c.id = %s AND c.status = 'em_uso';
        """, (obj.consumo_id,))
        consumo = cursor.fetchone()
        
        if not consumo:
            raise HTTPException(status_code=404, detail="Apontamento de uso não encontrado.")
            
        peso_tubete = float(consumo['peso_tubete_padrao'])
        sobra_liquida = float(obj.peso_manual_kg) - peso_tubete
        if sobra_liquida < 0:
            sobra_liquida = 0.0
            
        peso_alocado = float(consumo['peso_alocado'])
        consumo_real = peso_alocado - sobra_liquida
        if consumo_real < 0:
            consumo_real = 0.0

        cursor.execute("""
            UPDATE consumo_op_lote 
            SET peso_devolvido = %s, consumo_real = %s, status = 'devolvido_estoque', data_fim = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (sobra_liquida, consumo_real, obj.consumo_id))

        if sobra_liquida > 0:
            cursor.execute("UPDATE lotes_estoque SET peso_atual = %s, status = 'em_estoque' WHERE codigo_barras_lote = %s;", 
                           (sobra_liquida, consumo['codigo_barras_lote']))
        else:
            cursor.execute("UPDATE lotes_estoque SET peso_atual = 0, status = 'consumido' WHERE codigo_barras_lote = %s;", 
                           (consumo['codigo_barras_lote'],))

        conn.commit()
        cursor.close()
        return {
            "status": "sucesso", 
            "consumo_real_op": consumo_real, 
            "sobra_liquida_estoque": sobra_liquida
        }
    except HTTPException as h:
        if conn: conn.rollback()
        raise h
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.post("/consumo/transferir-op")
def transferir_sistemico_op(obj: ModelDevolucaoSistemica):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM consumo_op_lote WHERE id = %s AND status = 'em_uso';", (obj.consumo_id,))
        consumo_origem = cursor.fetchone()
        
        if not consumo_origem:
            raise HTTPException(status_code=404, detail="Apontamento de origem não encontrado ou já baixado.")
            
        peso_alocado = float(consumo_origem['peso_alocado'])
        peso_transferido = float(obj.peso_transferido_kg)
        
        if peso_transferido > peso_alocado:
            raise HTTPException(status_code=400, detail="O peso transferido não pode ser maior que o peso alocado originalmente!")
            
        consumo_real_origem = peso_alocado - peso_transferido

        # 1. Encerra a OP de Origem debitando apenas o consumido real
        cursor.execute("""
            UPDATE consumo_op_lote 
            SET peso_devolvido = %s, consumo_real = %s, status = 'transferido', 
                op_destino_transferencia = %s, data_fim = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (peso_transferido, consumo_real_origem, obj.nova_ordem_destino.strip(), obj.consumo_id))

        # 2. Cria automaticamente o apontamento de entrada na Nova OP
        cursor.execute("""
            INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, operador)
            VALUES (%s, %s, %s, %s, %s);
        """, (obj.nova_ordem_destino.strip(), consumo_origem['maquina_numero'], consumo_origem['codigo_barras_lote'], peso_transferido, obj.operador))

        cursor.execute("UPDATE lotes_estoque SET peso_atual = %s, status = 'em_linha' WHERE codigo_barras_lote = %s;", 
                       (peso_transferido, consumo_origem['codigo_barras_lote']))

        conn.commit()
        cursor.close()
        return {
            "status": "sucesso",
            "consumo_debitado_op_anterior": consumo_real_origem,
            "peso_carregado_nova_op": peso_transferido
        }
    except HTTPException as h:
        if conn: conn.rollback()
        raise h
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.post("/refugo/apontar")
def apontar_refugo(obj: ModelRefugo):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO apontamento_refugo (ordem_producao, maquina_numero, peso_refugo_kg, tipo_refugo, operador)
            VALUES (%s, %s, %s, %s, %s);
        """, (obj.ordem_producao, obj.maquina_numero, obj.peso_refugo_kg, obj.tipo_refugo, obj.operador))
        conn.commit()
        cursor.close()
        return {"status": "sucesso", "mensagem": "Refugo registrado com sucesso!"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.get("/visao-ordens")
def visao_ordens():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT 
                c.ordem_producao,
                MAX(c.maquina_numero) as maquina,
                COUNT(DISTINCT c.codigo_barras_lote) as total_lotes_bipados,
                SUM(c.peso_alocado) as total_alocado_kg,
                SUM(c.peso_devolvido) as total_devolvido_kg,
                SUM(c.consumo_real) as consumo_real_total_kg,
                COALESCE((SELECT SUM(r.peso_refugo_kg) FROM apontamento_refugo r WHERE r.ordem_producao = c.ordem_producao), 0) as total_refugo_kg
            FROM consumo_op_lote c
            GROUP BY c.ordem_producao
            ORDER BY c.ordem_producao DESC LIMIT 100;
        """)
        linhas = cursor.fetchall()
        cursor.close()
        return linhas
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# --- ADMIN E CADASTROS ---

@app.post("/admin/materiais")
def criar_material(m: ModelMaterial):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao)
            VALUES (%s, %s, %s, %s);
        """, (m.codigo_material, m.descricao, m.tipo_material, m.peso_tubete_padrao))
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/admin/lotes")
def cadastrar_lote(l: ModelLoteEstoque):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO lotes_estoque (codigo_barras_lote, codigo_material, lote_fornecedor, peso_inicial, peso_atual)
            VALUES (%s, %s, %s, %s, %s);
        """, (l.codigo_barras_lote, l.codigo_material, l.lote_fornecedor, l.peso_inicial, l.peso_inicial))
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# --- ENDPOINT IMPORTAÇÃO EM MASSA (XML TOTVS SB8) ---
@app.post("/admin/lotes/importar-massa")
def importar_lotes_massa(lotes: List[ItemImportacaoMassa]):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cont_importados = 0

        for item in lotes:
            cod_mat = item.codigo_material.strip()
            barcode = item.codigo_barras_lote.strip()

            # 1. Garante que o material exista no cadastro mestre para evitar erro de Foreign Key
            cursor.execute("""
                INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao)
                VALUES (%s, %s, 'bobina', 0.00)
                ON CONFLICT (codigo_material) DO NOTHING;
            """, (cod_mat, f"Material {cod_mat} (TOTVS)"))

            # 2. Insere ou atualiza o saldo do lote na tabela lotes_estoque
            cursor.execute("""
                INSERT INTO lotes_estoque (codigo_barras_lote, codigo_material, lote_fornecedor, peso_inicial, peso_atual, status)
                VALUES (%s, %s, %s, %s, %s, 'em_estoque')
                ON CONFLICT (codigo_barras_lote) 
                DO UPDATE SET peso_inicial = EXCLUDED.peso_inicial,
                              peso_atual = EXCLUDED.peso_inicial,
                              status = 'em_estoque';
            """, (barcode, cod_mat, item.lote_fornecedor.strip(), item.peso_inicial, item.peso_inicial))
            
            cont_importados += 1

        conn.commit()
        cursor.close()
        return {"status": "sucesso", "importados": cont_importados}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.post("/admin/maquinas")
def criar_maquina(m: ModelMaquina):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO maquinas (numero_maquina, tipo, ativo) VALUES (%s, %s, %s);", (m.numero_maquina, m.tipo, m.ativo))
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/admin/usuarios")
def criar_usuario(u: ModelUsuario):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login.lower(), u.senha, u.nome, u.nivel))
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/admin/{tabela}/{id_reg}")
def deletar_registro(tabela: str, id_reg: int):
    tabelas_validas = ["master_materiais", "lotes_estoque", "maquinas", "usuarios"]
    if tabela not in tabelas_validas:
        raise HTTPException(status_code=400, detail="Tabela inválida")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(f"DELETE FROM {tabela} WHERE id = %s;", (id_reg,))
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
