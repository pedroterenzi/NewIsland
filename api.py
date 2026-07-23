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
        
        # 3. Cadastro Mestre de Materiais
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_materiais (
                id SERIAL PRIMARY KEY,
                codigo_material VARCHAR(100) UNIQUE NOT NULL,
                descricao VARCHAR(255) NOT NULL,
                tipo_material VARCHAR(50) NOT NULL,
                peso_tubete_padrao NUMERIC(12,3) DEFAULT 0.000,
                peso_unitario_kg NUMERIC(12,3) DEFAULT 0.000,
                fator_conversao NUMERIC(15,8) DEFAULT 0.00000000
            );
        """)

        # 4. Lotes e Bobinas em Estoque
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

        # 5. Consumo Real por Ordem de Produção
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

        # 6. Apontamento de Refugo
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

        # 7. Histórico Geral de Movimentações (Auditoria)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS historico_movimentacoes (
                id SERIAL PRIMARY KEY,
                ordem_producao VARCHAR(100) NOT NULL,
                maquina_numero INT,
                codigo_barras_lote VARCHAR(100),
                tipo_movimentacao VARCHAR(100) NOT NULL,
                quantidade_kg NUMERIC(12,3) NOT NULL,
                operador VARCHAR(255) NOT NULL,
                data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                detalhes TEXT
            );
        """)

        # ALTERAÇÃO AUTOMÁTICA DE COLUNAS EXISTENTES
        try:
            cursor.execute("ALTER TABLE master_materiais ALTER COLUMN peso_tubete_padrao TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_inicial TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE lotes_estoque ALTER COLUMN peso_atual TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_alocado TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN peso_devolvido TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE consumo_op_lote ALTER COLUMN consumo_real TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE apontamento_refugo ALTER COLUMN peso_refugo_kg TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE historico_movimentacoes ALTER COLUMN quantidade_kg TYPE NUMERIC(12,3);")
            cursor.execute("ALTER TABLE master_materiais ADD COLUMN IF NOT EXISTS peso_unitario_kg NUMERIC(12,3) DEFAULT 0.000;")
            cursor.execute("ALTER TABLE master_materiais ADD COLUMN IF NOT EXISTS fator_conversao NUMERIC(15,8) DEFAULT 0.00000000;")
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
    peso_unitario_kg: float
    fator_conversao: float

class ModelLoteEstoque(BaseModel):
    codigo_barras_lote: str
    codigo_material: str
    lote_fornecedor: str
    peso_inicial: float

class ModelAbastecerConfirmar(BaseModel):
    ordem_producao: str
    maquina_numero: int
    codigo_barras_lote: str
    peso_apontado: float
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

class ModelEdicaoMovimento(BaseModel):
    quantidade_kg: float
    operador: str
    detalhes: str

class ItemImportacaoMassa(BaseModel):
    codigo_barras_lote: str
    codigo_material: str
    lote_fornecedor: str
    peso_inicial: float
    descricao_material: Optional[str] = None

class ItemImportacaoMaterial(BaseModel):
    codigo_material: str
    descricao: str
    peso_unitario_kg: float
    fator_conversao: float

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
        if lote['status'] == 'consumido' or lote['peso_atual'] <= 0:
            raise HTTPException(status_code=400, detail="Este lote já consta como totalmente consumido (0 kg restantes)!")
            
        return lote
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/consumo/buscar-ativo/{op}/{codigo_barras}")
def consultar_lote_ativo_para_devolver(op: str, codigo_barras: str):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT c.id as consumo_id, c.ordem_producao, c.maquina_numero, c.peso_alocado, c.codigo_barras_lote,
                   l.codigo_material, m.descricao, m.peso_unitario_kg, l.lote_fornecedor, m.fator_conversao
            FROM consumo_op_lote c
            JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
            JOIN master_materiais m ON l.codigo_material = m.codigo_material
            WHERE c.codigo_barras_lote = %s AND c.ordem_producao = %s AND c.status = 'em_uso'
            ORDER BY c.id DESC LIMIT 1;
        """, (codigo_barras.strip(), op.strip()))
        consumo = cursor.fetchone()
        cursor.close()
        
        if not consumo:
            raise HTTPException(status_code=404, detail="Atenção: Nenhum apontamento ATIVO encontrado para essa Etiqueta na OP informada.")
            
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
        
        cursor.execute("""
            SELECT * FROM lotes_estoque WHERE codigo_barras_lote = %s;
        """, (obj.codigo_barras_lote.strip(),))
        lote = cursor.fetchone()
        
        if not lote:
            raise HTTPException(status_code=400, detail="Lote não disponível para abastecimento.")
            
        peso_disponivel = float(lote['peso_atual'])
        peso_apontado = float(obj.peso_apontado)
        
        if peso_apontado <= 0:
            raise HTTPException(status_code=400, detail="Peso informado inválido para apontamento.")
            
        if peso_apontado > peso_disponivel:
            raise HTTPException(status_code=400, detail=f"Peso apontado maior que o saldo disponível no lote ({peso_disponivel} kg).")

        # Insere o Consumo
        cursor.execute("""
            INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, consumo_real, operador)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;
        """, (obj.ordem_producao.strip(), obj.maquina_numero, obj.codigo_barras_lote.strip(), peso_apontado, peso_apontado, obj.operador.strip()))
        
        # Grava Histórico de Movimentação (AUDITORIA)
        cursor.execute("""
            INSERT INTO historico_movimentacoes (ordem_producao, maquina_numero, codigo_barras_lote, tipo_movimentacao, quantidade_kg, operador, detalhes)
            VALUES (%s, %s, %s, 'ABASTECIMENTO', %s, %s, 'Alocação de MP na Máquina')
        """, (obj.ordem_producao.strip(), obj.maquina_numero, obj.codigo_barras_lote.strip(), peso_apontado, obj.operador.strip()))

        novo_peso_lote = peso_disponivel - peso_apontado
        novo_status = 'em_estoque' if novo_peso_lote > 0 else 'consumido'
        
        cursor.execute("""
            UPDATE lotes_estoque 
            SET peso_atual = %s, status = %s 
            WHERE codigo_barras_lote = %s;
        """, (novo_peso_lote, novo_status, obj.codigo_barras_lote.strip()))
        
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
            SELECT c.*, l.codigo_material, l.lote_fornecedor
            FROM consumo_op_lote c
            JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
            WHERE c.id = %s AND c.status = 'em_uso';
        """, (obj.consumo_id,))
        consumo = cursor.fetchone()
        
        if not consumo:
            raise HTTPException(status_code=404, detail="Apontamento de uso não encontrado.")
            
        sobra_liquida = float(obj.peso_manual_kg)
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

        cursor.execute("""
            UPDATE lotes_estoque 
            SET peso_atual = peso_atual + %s, status = 'em_estoque' 
            WHERE codigo_barras_lote = %s;
        """, (sobra_liquida, consumo['codigo_barras_lote']))

        # Grava Histórico de Movimentação (AUDITORIA)
        cursor.execute("""
            INSERT INTO historico_movimentacoes (ordem_producao, maquina_numero, codigo_barras_lote, tipo_movimentacao, quantidade_kg, operador, detalhes)
            VALUES (%s, %s, %s, 'DEVOLUÇÃO FÍSICA', %s, %s, 'Retorno do material para o Estoque Geral')
        """, (consumo['ordem_producao'], consumo['maquina_numero'], consumo['codigo_barras_lote'], sobra_liquida, obj.operador.strip()))

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

        cursor.execute("""
            UPDATE consumo_op_lote 
            SET peso_devolvido = %s, consumo_real = %s, status = 'transferido', 
                op_destino_transferencia = %s, data_fim = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (peso_transferido, consumo_real_origem, obj.nova_ordem_destino.strip(), obj.consumo_id))

        cursor.execute("""
            INSERT INTO consumo_op_lote (ordem_producao, maquina_numero, codigo_barras_lote, peso_alocado, consumo_real, operador)
            VALUES (%s, %s, %s, %s, %s, %s);
        """, (obj.nova_ordem_destino.strip(), consumo_origem['maquina_numero'], consumo_origem['codigo_barras_lote'], peso_transferido, peso_transferido, obj.operador.strip()))

        # Grava Histórico de Movimentação DUPLO (Saída e Entrada)
        cursor.execute("""
            INSERT INTO historico_movimentacoes (ordem_producao, maquina_numero, codigo_barras_lote, tipo_movimentacao, quantidade_kg, operador, detalhes)
            VALUES (%s, %s, %s, 'TRANSFERÊNCIA (SAÍDA)', %s, %s, %s)
        """, (consumo_origem['ordem_producao'], consumo_origem['maquina_numero'], consumo_origem['codigo_barras_lote'], peso_transferido, obj.operador.strip(), f"Enviado para a OP {obj.nova_ordem_destino.strip()}"))

        cursor.execute("""
            INSERT INTO historico_movimentacoes (ordem_producao, maquina_numero, codigo_barras_lote, tipo_movimentacao, quantidade_kg, operador, detalhes)
            VALUES (%s, %s, %s, 'TRANSFERÊNCIA (ENTRADA)', %s, %s, %s)
        """, (obj.nova_ordem_destino.strip(), consumo_origem['maquina_numero'], consumo_origem['codigo_barras_lote'], peso_transferido, obj.operador.strip(), f"Recebido da OP {consumo_origem['ordem_producao']}"))

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
        """, (obj.ordem_producao, obj.maquina_numero, obj.peso_refugo_kg, obj.tipo_refugo, obj.operador.strip()))
        
        # Grava Histórico de Movimentação (AUDITORIA)
        cursor.execute("""
            INSERT INTO historico_movimentacoes (ordem_producao, maquina_numero, codigo_barras_lote, tipo_movimentacao, quantidade_kg, operador, detalhes)
            VALUES (%s, %s, NULL, 'REFUGO', %s, %s, %s)
        """, (obj.ordem_producao, obj.maquina_numero, obj.peso_refugo_kg, obj.operador.strip(), obj.tipo_refugo))

        conn.commit()
        cursor.close()
        return {"status": "sucesso", "mensagem": "Refugo registrado com sucesso!"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.get("/visao-ordens/{op}")
def visao_ordem_detalhe(op: str):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT 
                c.codigo_barras_lote, 
                l.lote_fornecedor, 
                m.codigo_material, 
                m.descricao,
                SUM(c.peso_alocado) as peso_alocado, 
                SUM(c.peso_devolvido) as peso_devolvido, 
                SUM(CASE WHEN c.status = 'em_uso' THEN c.peso_alocado ELSE c.consumo_real END) as consumo_real
            FROM consumo_op_lote c
            JOIN lotes_estoque l ON c.codigo_barras_lote = l.codigo_barras_lote
            JOIN master_materiais m ON l.codigo_material = m.codigo_material
            WHERE c.ordem_producao = %s
            GROUP BY c.codigo_barras_lote, l.lote_fornecedor, m.codigo_material, m.descricao
            ORDER BY m.codigo_material, l.lote_fornecedor;
        """, (op.strip(),))
        
        dados = cursor.fetchall()
        cursor.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# --- NOVO: HISTÓRICO DE MOVIMENTAÇÕES (FILTROS) E EDIÇÃO ---

@app.get("/historico-movimentacoes")
def buscar_historico(
    op: Optional[str] = None,
    lote: Optional[str] = None,
    operador: Optional[str] = None,
    tipo: Optional[str] = None
):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = "SELECT * FROM historico_movimentacoes WHERE 1=1"
        params = []
        
        if op:
            query += " AND ordem_producao ILIKE %s"
            params.append(f"%{op.strip()}%")
        if lote:
            query += " AND codigo_barras_lote ILIKE %s"
            params.append(f"%{lote.strip()}%")
        if operador:
            query += " AND operador ILIKE %s"
            params.append(f"%{operador.strip()}%")
        if tipo:
            query += " AND tipo_movimentacao ILIKE %s"
            params.append(f"%{tipo.strip()}%")
            
        query += " ORDER BY data_hora DESC LIMIT 500;"
        
        cursor.execute(query, tuple(params))
        dados = cursor.fetchall()
        cursor.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.put("/admin/movimentacoes/{hist_id}/editar")
def editar_movimentacao(hist_id: int, obj: ModelEdicaoMovimento):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Busca o histórico original para ver o que mudou
        cursor.execute("SELECT * FROM historico_movimentacoes WHERE id = %s", (hist_id,))
        hist = cursor.fetchone()
        if not hist: raise HTTPException(status_code=404, detail="Movimentação não encontrada.")
        
        old_qtd = float(hist['quantidade_kg'])
        new_qtd = float(obj.quantidade_kg)
        diff = new_qtd - old_qtd
        
        tipo = hist['tipo_movimentacao']
        op = hist['ordem_producao']
        lote = hist['codigo_barras_lote']
        
        # INTELIGÊNCIA DE CORREÇÃO: Ajusta saldos de OP e Estoque retroativamente se houver diferença de peso
        if diff != 0:
            if tipo == 'ABASTECIMENTO' and lote:
                # O operador alocou mais/menos do que deveria.
                cursor.execute("""
                    UPDATE consumo_op_lote 
                    SET peso_alocado = peso_alocado + %s, consumo_real = consumo_real + %s 
                    WHERE ordem_producao = %s AND codigo_barras_lote = %s AND status IN ('em_uso', 'devolvido_estoque', 'transferido')
                """, (diff, diff, op, lote))
                
                cursor.execute("""
                    UPDATE lotes_estoque SET peso_atual = peso_atual - %s WHERE codigo_barras_lote = %s
                """, (diff, lote))
                
            elif tipo == 'DEVOLUÇÃO FÍSICA' and lote:
                # O operador devolveu mais/menos do que deveria.
                cursor.execute("""
                    UPDATE consumo_op_lote 
                    SET peso_devolvido = peso_devolvido + %s, consumo_real = consumo_real - %s 
                    WHERE ordem_producao = %s AND codigo_barras_lote = %s AND status = 'devolvido_estoque'
                """, (diff, diff, op, lote))
                
                cursor.execute("""
                    UPDATE lotes_estoque SET peso_atual = peso_atual + %s WHERE codigo_barras_lote = %s
                """, (diff, lote))

        # Atualiza a linha de auditoria (Histórico)
        cursor.execute("""
            UPDATE historico_movimentacoes 
            SET quantidade_kg = %s, operador = %s, detalhes = %s 
            WHERE id = %s
        """, (new_qtd, obj.operador.strip(), obj.detalhes.strip(), hist_id))
        
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except HTTPException as h:
        if conn: conn.rollback()
        raise h
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()


# --- ADMIN E CADASTROS ---

@app.post("/admin/estoque/limpar")
def limpar_estoque():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE lotes_estoque SET peso_atual = 0, status = 'consumido' WHERE status = 'em_estoque';")
        conn.commit()
        cursor.close()
        return {"status": "sucesso"}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.post("/admin/materiais")
def criar_material(m: ModelMaterial):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao)
            VALUES (%s, %s, %s, %s, %s, %s);
        """, (m.codigo_material, m.descricao, m.tipo_material, m.peso_tubete_padrao, m.peso_unitario_kg, m.fator_conversao))
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

@app.post("/admin/materiais/importar-massa")
def importar_materiais_massa(materiais: List[ItemImportacaoMaterial]):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cont_importados = 0

        for item in materiais:
            cod_mat = item.codigo_material.strip()
            if not cod_mat or cod_mat.lower() == 'nan':
                continue

            cursor.execute("""
                INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao)
                VALUES (%s, %s, 'bobina', 0.00, %s, %s)
                ON CONFLICT (codigo_material) 
                DO UPDATE SET 
                    peso_unitario_kg = EXCLUDED.peso_unitario_kg,
                    fator_conversao = EXCLUDED.fator_conversao;
            """, (cod_mat, item.descricao.strip(), item.peso_unitario_kg, item.fator_conversao))
            
            cont_importados += 1

        conn.commit()
        cursor.close()
        return {"status": "sucesso", "importados": cont_importados}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

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
            
            desc_mat = item.descricao_material.strip() if item.descricao_material else f"Material {cod_mat} (Importado)"

            cursor.execute("""
                INSERT INTO master_materiais (codigo_material, descricao, tipo_material, peso_tubete_padrao, peso_unitario_kg, fator_conversao)
                VALUES (%s, %s, 'bobina', 0.00, 0.00, 0.00)
                ON CONFLICT (codigo_material) 
                DO UPDATE SET descricao = EXCLUDED.descricao;
            """, (cod_mat, desc_mat))

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
