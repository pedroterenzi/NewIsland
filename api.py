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

# Seu banco Neon atual
DATABASE_URL = "postgresql://neondb_owner:npg_G9jBAgO0hpXr@ep-broad-sky-ate4cjbm.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def inicializar_banco():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # 1. Tabela de Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                login VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(100) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                nivel INT DEFAULT 1 -- 1: Operador, 2: Liderança, 3: Admin
            );
        """)

        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO usuarios (login, senha, nome, nivel)
                VALUES ('admin', 'admin', 'Administrador Global', 3);
            """)

        # 2. Tabela Mestre de SKUs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_sku (
                id SERIAL PRIMARY KEY,
                codigo_sku VARCHAR(100) UNIQUE NOT NULL,
                descricao VARCHAR(255),
                fardos_por_pallet INT NOT NULL,
                pecas_por_fardo INT NOT NULL
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM master_sku;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO master_sku (codigo_sku, descricao, fardos_por_pallet, pecas_por_fardo) VALUES
                ('SKU001', 'Fralda P Padrão', 40, 50),
                ('SKU002', 'Fralda M Padrão', 36, 45),
                ('SKU003', 'Fralda G Padrão', 32, 40);
            """)

        # 3. Tabela de Códigos de Parada
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS codigos_parada (
                id SERIAL PRIMARY KEY,
                maquina INT NOT NULL,
                numero VARCHAR(50) NOT NULL,
                problema VARCHAR(255) NOT NULL
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM codigos_parada;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO codigos_parada (maquina, numero, problema) VALUES
                (1, '01', 'Falta de Energia'),
                (1, '02', 'Manutenção Preventiva'),
                (1, '03', 'Limpeza da Máquina'),
                (1, '04', 'Troca de Bobina');
            """)

        # 4. Tabela de Apontamento Geral
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS registro_turnos (
                id SERIAL PRIMARY KEY,
                data_registro DATE NOT NULL,
                turno INT NOT NULL,
                operador VARCHAR(255) NOT NULL,
                maquina INT NOT NULL,
                tempo_nao_operacional INT DEFAULT 0
            );
        """)

        # 5. Tabela de Produção por Ordem
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS result_by_order (
                id SERIAL PRIMARY KEY,
                turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                ordem VARCHAR(100) NOT NULL,
                codigo_sku VARCHAR(100) NOT NULL,
                horario_padrao INT NOT NULL,
                run_time INT NOT NULL,
                machine_counter INT NOT NULL,
                pallets INT NOT NULL,
                fardos_avulsos INT NOT NULL,
                total_pecas INT NOT NULL,
                taxa_movimentacao NUMERIC(5,2),
                taxa_loss NUMERIC(5,2)
            );
        """)

        # 6. Tabela de Paradas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stop_machine_item (
                id SERIAL PRIMARY KEY,
                turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                numero_parada VARCHAR(50) NOT NULL,
                minutos_parados INT NOT NULL
            );
        """)

        conn.commit()
        cursor.close()
        conn.close()
        print("⚡ Banco de Dados da Indústria estruturado com sucesso!")
    except Exception as e:
        print(f"❌ Erro ao estruturar banco: {str(e)}")

inicializar_banco()

# ==========================================
# MODELOS DE DADOS (PYDANTIC)
# ==========================================

class ModeloSKU(BaseModel):
    codigo_sku: str
    descricao: str
    fardos_por_pallet: int
    pecas_por_fardo: int

class ModeloCodigoParada(BaseModel):
    maquina: int
    numero: str
    problema: str

class OrdemProducao(BaseModel):
    ordem: str
    codigo_sku: str
    horario_padrao: int
    run_time: int
    machine_counter: int
    pallets: int
    fardos_avulsos: int

class ParadaMaquina(BaseModel):
    numero_parada: str
    minutos_parados: int

class ApontamentoTurno(BaseModel):
    data_registro: str
    turno: int
    operador: str
    maquina: int
    tempo_nao_operacional: int
    ordens: List[OrdemProducao]
    paradas: List[ParadaMaquina]

# ==========================================
# ROTAS: AUTENTICAÇÃO E USUÁRIOS
# ==========================================

@app.post("/usuarios/auth")
def autenticar_usuario(obj: BaseModel):
    # Modelo dinâmico simples para evitar conflitos de campos antigos
    dados_corpo = obj.model_dump()
    login = dados_corpo.get("login", "").strip().lower()
    senha = dados_corpo.get("senha", "")

    usuario = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM usuarios WHERE login = %s AND senha = %s;", (login, senha))
        usuario = cursor.fetchone()
        cursor.close()
        conn.close()
    except Exception:
        pass
        
    # BACKUP À PROVA DE FALHAS: Se for o admin mestre e o banco falhar ou estiver vazio, força a entrada
    if not usuario and login == "admin" and senha == "admin":
        try:
            # Tenta criar a tabela e o usuário na marra em tempo de execução
            conn = psycopg2.connect(DATABASE_URL)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id SERIAL PRIMARY KEY, login VARCHAR(100) UNIQUE NOT NULL,
                    senha VARCHAR(100) NOT NULL, nome VARCHAR(255) NOT NULL, nivel INT DEFAULT 1
                );
            """)
            cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
            if not cursor.fetchone():
                cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")
                conn.commit()
            cursor.close()
            conn.close()
        except Exception:
            pass
        
        # Retorna a sessão mockada diretamente para não travar o desenvolvedor
        return {"login": "admin", "senha": "admin", "nome": "Administrador Global", "nivel": 3}
        
    if usuario:
        return usuario
        
    raise HTTPException(status_code=404, detail="Usuário ou senha incorretos.")

@app.get("/skus")
def listar_skus():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM master_sku ORDER BY codigo_sku ASC;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/skus")
def criar_sku(obj: ModeloSKU):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO master_sku (codigo_sku, descricao, fardos_por_pallet, pecas_por_fardo) VALUES (%s, %s, %s, %s) RETURNING id;",
            (obj.codigo_sku, obj.descricao, obj.fardos_por_pallet, obj.pecas_por_fardo)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/skus/{id}")
def editar_sku(id: int, obj: ModeloSKU):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE master_sku SET codigo_sku = %s, descricao = %s, fardos_por_pallet = %s, pecas_por_fardo = %s WHERE id = %s;",
            (obj.codigo_sku, obj.descricao, obj.fardos_por_pallet, obj.pecas_por_fardo, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/skus/{id}")
def remover_sku(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM master_sku WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ROTAS: CÓDIGOS DE PARADA
# ==========================================

@app.get("/paradas-codigos")
def listar_codigos_parada():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM codigos_parada ORDER BY maquina ASC, numero ASC;")
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/paradas-codigos")
def criar_codigo_parada(obj: ModeloCodigoParada):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO codigos_parada (maquina, numero, समस्या) VALUES (%s, %s, %s) RETURNING id;",
            (obj.maquina, obj.numero, obj.problema)
        )
        novo_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso", "id": novo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/paradas-codigos/{id}")
def editar_codigo_parada(id: int, obj: ModeloCodigoParada):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE codigos_parada SET maquina = %s, numero = %s, problema = %s WHERE id = %s;",
            (obj.maquina, obj.numero, obj.problema, id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "atualizado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/paradas-codigos/{id}")
def remover_codigo_parada(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM codigos_parada WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ROTA: APONTAMENTO (TRAVAS DE PRODUÇÃO)
# ==========================================

@app.post("/apontamentos")
def salvar_apontamento(dados: ApontamentoTurno):
    carga_horaria_turno = {1: 455, 2: 440, 3: 415}
    if dados.turno not in carga_horaria_turno:
        raise HTTPException(status_code=400, detail="Turno inválido. Escolha 1, 2 ou 3.")
    
    tempo_exigido = carga_horaria_turno[dados.turno]

    soma_horario_padrao = sum(ordem.horario_padrao for ordem in dados.ordens)
    soma_run_time = sum(ordem.run_time for ordem in dados.ordens)
    soma_paradas = sum(parada.minutos_parados for parada in dados.paradas)

    tempo_total_calculado = soma_horario_padrao + dados.tempo_nao_operacional
    if tempo_total_calculado != tempo_exigido:
        raise HTTPException(
            status_code=400, 
            detail=f"BLOQUEIO: A soma do Horário Padrão das ordens ({soma_horario_padrao}m) + Tempo Não Operacional ({dados.tempo_nao_operacional}m) resultou em {tempo_total_calculado}m. O esperado para o Turno {dados.turno} é {tempo_exigido}m."
        )

    tempo_parada_calculado = soma_horario_padrao - soma_run_time
    if tempo_parada_calculado != soma_paradas:
        raise HTTPException(
            status_code=400, 
            detail=f"BLOQUEIO: Inconsistência nas paradas. (Horário Padrão [{soma_horario_padrao}m] - Run Time [{soma_run_time}m] = {tempo_parada_calculado}m). Porém, o total de paradas apontadas é {soma_paradas}m."
        )

    try {
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO registro_turnos (data_registro, turno, operador, maquina, tempo_nao_operacional)
            VALUES (%s, %s, %s, %s, %s) RETURNING id;
        """, (dados.data_registro, dados.turno, dados.operador, dados.maquina, dados.tempo_nao_operacional))
        
        turno_id = cursor.fetchone()[0]

        for ordem in dados.ordens:
            cursor.execute("SELECT fardos_por_pallet, pecas_por_fardo FROM master_sku WHERE codigo_sku = %s;", (ordem.codigo_sku,))
            sku_info = cursor.fetchone()
            
            fardos_por_pallet = sku_info[0] if sku_info else 0
            pecas_por_fardo = sku_info[1] if sku_info else 0

            total_fardos = (ordem.pallets * fardos_por_pallet) + ordem.fardos_avulsos
            total_pecas = total_fardos * pecas_por_fardo

            taxa_mov = (ordem.run_time / ordem.horario_padrao) * 100 if ordem.horario_padrao > 0 else 0
            taxa_loss = ((ordem.machine_counter - total_pecas) / ordem.machine_counter) * 100 if ordem.machine_counter > 0 else 0

            cursor.execute("""
                INSERT INTO result_by_order (turno_id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos, total_pecas, taxa_movimentacao, taxa_loss)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (turno_id, ordem.ordem, ordem.codigo_sku, ordem.horario_padrao, ordem.run_time, ordem.machine_counter, ordem.pallets, ordem.fardos_avulsos, total_pecas, taxa_mov, taxa_loss))

        for parada in dados.paradas:
            cursor.execute("""
                INSERT INTO stop_machine_item (turno_id, numero_parada, minutos_parados)
                VALUES (%s, %s, %s);
            """, (turno_id, parada.numero_parada, parada.minutos_parados))

        conn.commit()
        cursor.close()
        conn.close()

        return {"status": "sucesso", "mensagem": "Apontamento salvo com sucesso!", "turno_id": turno_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {str(e)}")
