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
        
        cursor.execute("CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, login VARCHAR(100) UNIQUE NOT NULL, senha VARCHAR(100) NOT NULL, nome VARCHAR(255) NOT NULL, nivel INT DEFAULT 1);")
        cursor.execute("CREATE TABLE IF NOT EXISTS maquinas (id SERIAL PRIMARY KEY, numero_maquina INT UNIQUE NOT NULL, tipo VARCHAR(50) NOT NULL, ativo BOOLEAN DEFAULT TRUE);")
        cursor.execute("CREATE TABLE IF NOT EXISTS master_materiais (id SERIAL PRIMARY KEY, codigo_material VARCHAR(100) UNIQUE NOT NULL, descricao VARCHAR(255) NOT NULL, tipo_material VARCHAR(50) NOT NULL, peso_tubete_padrao NUMERIC(12,3) DEFAULT 0.000, peso_unitario_kg NUMERIC(12,3) DEFAULT 0.000, fator_conversao NUMERIC(15,8) DEFAULT 0.00000000);")
        cursor.execute("CREATE TABLE IF NOT EXISTS lotes_estoque (id SERIAL PRIMARY KEY, codigo_barras_lote VARCHAR(100) UNIQUE NOT NULL, codigo_material VARCHAR(100) REFERENCES master_materiais(codigo_material) ON DELETE CASCADE, lote_fornecedor VARCHAR(100) NOT NULL, peso_inicial NUMERIC(12,3) NOT NULL, peso_atual NUMERIC(12,3) NOT NULL, status VARCHAR(50) DEFAULT 'em_estoque', data_entrada TIMESTAMP DEFAULT CURRENT_TIMESTAMP);")
        cursor.execute("CREATE TABLE IF NOT EXISTS consumo_op_lote (id SERIAL PRIMARY KEY, ordem_producao VARCHAR(100) NOT NULL, maquina_numero INT NOT NULL, codigo_barras_lote VARCHAR(100) REFERENCES lotes_estoque(codigo_barras_lote) ON DELETE CASCADE, peso_alocado NUMERIC(12,3) NOT NULL, peso_devolvido NUMERIC(12,3) DEFAULT 0, consumo_real NUMERIC(12,3) DEFAULT 0, operador VARCHAR(255) NOT NULL, data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP, data_fim TIMESTAMP, status VARCHAR(50) DEFAULT 'em_uso', op_destino_transferencia VARCHAR(100));")
        cursor.execute("CREATE TABLE IF NOT EXISTS apontamento_refugo (id SERIAL PRIMARY KEY, ordem_producao VARCHAR(100) NOT NULL, maquina_numero INT NOT NULL, peso_refugo_kg NUMERIC(12,3) NOT NULL, tipo_refugo VARCHAR(100) NOT NULL, operador VARCHAR(255) NOT NULL, data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP);")

        try:
            cursor.execute("ALTER TABLE master_materiais ALTER COLUMN peso_tubete_padrao TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_inicial TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_atual TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_alocado TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_devolvido TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN consumo_real TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE master_materiais ADD COLUMN IF NOT EXISTS peso_unitario_kg NUMERIC(12,3) DEFAULT 0.000;")
            cursor.execute("ALTER TABLE master_materiais ADD COLUMN IF NOT EXISTS fator_conversao NUMERIC(15,8) DEFAULT 0.00000000;")
        except Exception:
            pass
        
        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone(): cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")
            
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"Erro banco: {e}")
    finally:
        if conn: conn.close()

inicializar_banco()

class ModelAuth(BaseModel): login: str; senha: str
class ModelUsuario(BaseModel): login: str; senha: str; nome: str; nivel: int
class ModelMaquina(BaseModel): numero_maquina: int; tipo: str; ativo: bool
class ModelMaterial(BaseModel): codigo_material: str; descricao: str; tipo_material: str; peso_tubete_padrao: float; peso_unitario_kg: float; fator_conversao: float
class ModelLoteEstoque(BaseModel): codigo_barras_lote: str; codigo_material: str; lote_fornecedor: str; peso_inicial: float
class ModelAbastecerConfirmar(BaseModel): ordem_producao: str; maquina_numero: int; codigo_barras_lote: str; peso_apontado: float; operador: str
class ModelDevolucaoFisica(BaseModel): consumo_id: int; peso_manual_kg: float; operador: str
class ModelDevolucaoSistemica(BaseModel): consumo_id: int; nova_ordem_destino: str; peso_transferido_kg: float; operador: str
class ModelRefugo(BaseModel): ordem_producao: str; maquina_numero: int; peso_refugo_kg: float; tipo_refugo: str; operador: str
class ItemImportacaoMassa(BaseModel): codigo_barras_lote: str; codigo_material: str; lote_fornecedor: str; peso_inicial: float
class ItemImportacaoMaterial(BaseModel): codigo_material: str; descricao: str; peso_unitario_kg: float; fator_conversao: float

@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    if obj.login.strip().lower() == "admin" and obj.senha == "admin": return {"login": "admin", "nome": "Administrador Global", "nivel": 3}
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT login, nome, nivel FROM usuarios WHERE login = %s AND senha = %s;", (obj.login.strip().lower(), obj.senha))
    user = cursor.fetchone()
    conn.close()
    if user: return user
    raise HTTPException(401, "Usuário ou senha inválidos")

@app.get("/dados-mestres")
def obter_dados_mestres():
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    dados = {}
    cursor.execute("SELECT * FROM master_materiais ORDER BY codigo_material ASC;")
    dados["materiais"] = cursor.fetchall()
    cursor.execute("SELECT * FROM maquinas ORDER BY numero_maquina ASC;")
    dados["maquinas"] = cursor.fetchall()
    conn.close()
    return dados

@app.get("/lotes/consultar/{codigo_barras}")
def consultar_lote(codigo_barras: str):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT l.codigo_barras_lote, l.codigo_material, l.lote_fornecedor, l.peso_atual, l.status, m.descricao FROM lotes_estoque l JOIN master_materiais m ON l.codigo_material = m.codigo_material WHERE l.codigo_barras_lote = %s;", (codigo_barras.strip(),))
    lote = cursor.fetchone()
    conn.close()
    if not lote: raise HTTPException(404, "Lote não encontrado!")
    if lote['status'] == 'consumido' or lote['peso_atual'] <= 0: raise HTTPException(400, "Lote totalmente consumido ou zerado!")
    return lote

@app.get("/consumo/buscar-ativo/{codigo_barras}")
def consultar_ativo(codigo_barras: str):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT c.id as consumo_id, c.ordem_producao, c.maquina_numero, c.peso_alocado, c.codigo_barras_lote, l.codigo_material, m.descricao, l.lote_fornecedor, m.fator_conversao, m.peso_unitario_kg FROM consumo_op_lote c JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote JOIN master_materiais m ON l.codigo_material = m.codigo_material WHERE c.codigo_barras_lote = %s AND c.status = 'em_uso';", (codigo_barras.strip(),))
    consumo = cursor.fetchone()
    conn.close()
    if not consumo: raise HTTPException(404, "Etiqueta não apontada na linha no momento.")
    return consumo

@app.post("/consumo/abastecer")
def abastecer(obj: ModelAbastecerConfirmar):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT * FROM lotes_estoque WHERE codigo_barras_lote = %s AND status = 'em_estoque';", (obj.codigo_barras_lote.strip(),))
        lote = cursor.fetchone()
        if not lote: raise HTTPException(400, "Lote não disponível no estoque.")
        
        peso_apontado = float(obj.peso_apontado)
        if peso_apontado <= 0 or peso_apontado > float(lote['peso_atual']):
            raise HTTPException(400, "Peso informado inválido ou maior que o disponível no lote.")

        cursor.execute("INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, operador) VALUES (%s, %s, %s, %s, %s)", (obj.ordem_producao.strip(), obj.maquina_numero, obj.codigo_barras_lote.strip(), peso_apontado, obj.operador))
        
        novo_peso = float(lote['peso_atual']) - peso_apontado
        novo_status = 'em_estoque' if novo_peso > 0 else 'consumido'
        
        cursor.execute("UPDATE lotes_estoque SET peso_atual = %s, status = %s WHERE codigo_barras_lote = %s;", (novo_peso, novo_status, obj.codigo_barras_lote.strip()))
        
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@app.post("/consumo/devolver-fisico")
def devolver_fisico(obj: ModelDevolucaoFisica):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT * FROM consumo_op_lote WHERE id = %s AND status = 'em_uso';", (obj.consumo_id,))
        consumo = cursor.fetchone()
        if not consumo: raise HTTPException(404, "Apontamento não encontrado.")
            
        sobra_liquida = float(obj.peso_manual_kg)
        if sobra_liquida < 0: sobra_liquida = 0.0
            
        peso_alocado = float(consumo['peso_alocado'])
        consumo_real = peso_alocado - sobra_liquida
        if consumo_real < 0: consumo_real = 0.0

        cursor.execute("UPDATE consumo_op_lote SET peso_devolvido = %s, consumo_real = %s, status = 'devolvido_estoque', data_fim = CURRENT_TIMESTAMP WHERE id = %s;", (sobra_liquida, consumo_real, obj.consumo_id))

        cursor.execute("UPDATE lotes_estoque SET peso_atual = peso_atual + %s, status = 'em_estoque' WHERE codigo_barras_lote = %s;", (sobra_liquida, consumo['codigo_barras_lote']))

        conn.commit()
        return {"status": "sucesso", "consumo_real_op": consumo_real, "sobra_liquida_estoque": sobra_liquida}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@app.post("/consumo/transferir-op")
def transferir_op(obj: ModelDevolucaoSistemica):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("SELECT * FROM consumo_op_lote WHERE id = %s AND status = 'em_uso';", (obj.consumo_id,))
        consumo_origem = cursor.fetchone()
        if not consumo_origem: raise HTTPException(404, "Apontamento não encontrado.")
            
        peso_alocado = float(consumo_origem['peso_alocado'])
        peso_transferido = float(obj.peso_transferido_kg)
        if peso_transferido > peso_alocado: raise HTTPException(400, "Peso transferido maior que alocado!")
            
        consumo_real_origem = peso_alocado - peso_transferido

        cursor.execute("UPDATE consumo_op_lote SET peso_devolvido = %s, consumo_real = %s, status = 'transferido', op_destino_transferencia = %s, data_fim = CURRENT_TIMESTAMP WHERE id = %s;", (peso_transferido, consumo_real_origem, obj.nova_ordem_destino.strip(), obj.consumo_id))
        cursor.execute("INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, operador) VALUES (%s, %s, %s, %s, %s);", (obj.nova_ordem_destino.strip(), consumo_origem['maquina_numero'], consumo_origem['codigo_barras_lote'], peso_transferido, obj.operador))

        conn.commit()
        return {"status": "sucesso", "consumo_debitado_op_anterior": consumo_real_origem, "peso_carregado_nova_op": peso_transferido}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@app.post("/refugo/apontar")
def apontar_refugo(obj: ModelRefugo):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO apontamento_refugo (ordem_producao, maquina_numero, peso_refugo_kg, tipo_refugo, operador) VALUES (%s, %s, %s, %s, %s);", (obj.ordem_producao, obj.maquina_numero, obj.peso_refugo_kg, obj.tipo_refugo, obj.operador))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.get("/visao-ordens/{op}")
def visao_ordem_detalhe(op: str):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("""
        SELECT c.codigo_barras_lote, l.lote_fornecedor, m.codigo_material, m.descricao,
               c.peso_alocado, c.peso_devolvido, c.consumo_real, c.status
        FROM consumo_op_lote c
        JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
        JOIN master_materiais m ON l.codigo_material = m.codigo_material
        WHERE c.ordem_producao = %s
        ORDER BY c.data_inicio DESC;
    """, (op.strip(),))
    dados = cursor.fetchall()
    conn.close()
    return dados

@app.post("/admin/materiais")
def criar_material(m: ModelMaterial):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao) VALUES (%s, %s, %s, %s, %s, %s);", (m.codigo_material, m.descricao, m.tipo_material, m.peso_tubete_padrao, m.peso_unitario_kg, m.fator_conversao))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.post("/admin/lotes")
def cadastrar_lote(l: ModelLoteEstoque):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO lotes_estoque (codigo_barras_lote, codigo_material, lote_fornecedor, peso_inicial, peso_atual) VALUES (%s, %s, %s, %s, %s);", (l.codigo_barras_lote, l.codigo_material, l.lote_fornecedor, l.peso_inicial, l.peso_inicial))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.post("/admin/materiais/importar-massa")
def importar_materiais_massa(materiais: List[ItemImportacaoMaterial]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cont_importados = 0
    try:
        for item in materiais:
            cod_mat = item.codigo_material.strip()
            if not cod_mat or cod_mat.lower() == 'nan': continue
            cursor.execute("INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao) VALUES (%s, %s, 'bobina', 0.00, %s, %s) ON CONFLICT (codigo_material) DO UPDATE SET peso_unitario_kg = EXCLUDED.peso_unitario_kg, fator_conversao = EXCLUDED.fator_conversao;", (cod_mat, item.descricao.strip(), item.peso_unitario_kg, item.fator_conversao))
            cont_importados += 1
        conn.commit()
        return {"status": "sucesso", "importados": cont_importados}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@app.post("/admin/lotes/importar-massa")
def importar_lotes_massa(lotes: List[ItemImportacaoMassa]):
    conn = get_db_connection()
    cursor = conn.cursor()
    cont_importados = 0
    try:
        for item in lotes:
            cod_mat = item.codigo_material.strip()
            barcode = item.codigo_barras_lote.strip()
            cursor.execute("INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao) VALUES (%s, %s, 'bobina', 0.00, 0.00, 0.00) ON CONFLICT (codigo_material) DO NOTHING;", (cod_mat, f"Material {cod_mat} (TOTVS)"))
            cursor.execute("INSERT INTO lotes_estoque (codigo_barras_lote, codigo_material, lote_fornecedor, peso_inicial, peso_atual, status) VALUES (%s, %s, %s, %s, %s, 'em_estoque') ON CONFLICT (codigo_barras_lote) DO UPDATE SET peso_inicial = EXCLUDED.peso_inicial, peso_atual = EXCLUDED.peso_inicial, status = 'em_estoque';", (barcode, cod_mat, item.lote_fornecedor.strip(), item.peso_inicial, item.peso_inicial))
            cont_importados += 1
        conn.commit()
        return {"status": "sucesso", "importados": cont_importados}
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

@app.post("/admin/maquinas")
def criar_maquina(m: ModelMaquina):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO maquinas (numero_maquina, tipo, ativo) VALUES (%s, %s, %s);", (m.numero_maquina, m.tipo, m.ativo))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.post("/admin/usuarios")
def criar_usuario(u: ModelUsuario):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login.lower(), u.senha, u.nome, u.nivel))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.delete("/admin/{tabela}/{id_reg}")
def deletar_registro(tabela: str, id_reg: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"DELETE FROM {tabela} WHERE id = %s;", (id_reg,))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}
