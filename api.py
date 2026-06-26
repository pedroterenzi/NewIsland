from fastapi import FastAPI, HTTPException, Query
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

DATABASE_URL = "postgresql://neondb_owner:npg_G9jBAgO0hpXr@ep-broad-sky-ate4cjbm.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def inicializar_banco():
    try:
        # Apenas cria a infraestrutura se não existir (SEM DROP, SEM INJEÇÃO PESADA)
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cursor:
                cursor.execute("CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, login VARCHAR(100) UNIQUE NOT NULL, senha VARCHAR(100) NOT NULL, nome VARCHAR(255) NOT NULL, nivel INT DEFAULT 1);")
                cursor.execute("CREATE TABLE IF NOT EXISTS maquinas (id SERIAL PRIMARY KEY, numero_maquina INT UNIQUE NOT NULL, tipo VARCHAR(50) NOT NULL, ativo BOOLEAN DEFAULT TRUE);")
                cursor.execute("CREATE TABLE IF NOT EXISTS tipos_tno (id SERIAL PRIMARY KEY, nome VARCHAR(100) UNIQUE NOT NULL);")
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS master_sku (
                        id SERIAL PRIMARY KEY, codigo_sku VARCHAR(100) UNIQUE NOT NULL, descricao VARCHAR(255),
                        fraldas_por_pacote INT NOT NULL, pacotes_por_fardo INT NOT NULL, fardos_por_pallet INT NOT NULL
                    );
                """)
                cursor.execute("CREATE TABLE IF NOT EXISTS codigos_parada (id SERIAL PRIMARY KEY, tipo_maquina VARCHAR(50) NOT NULL, numero VARCHAR(50) NOT NULL, problema VARCHAR(255) NOT NULL, UNIQUE(tipo_maquina, numero));")
                cursor.execute("CREATE TABLE IF NOT EXISTS registro_turnos (id SERIAL PRIMARY KEY, data_registro DATE NOT NULL, turno INT NOT NULL, operador VARCHAR(255) NOT NULL, maquina_numero INT NOT NULL);")
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS result_by_order (
                        id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                        ordem VARCHAR(100) NOT NULL, codigo_sku VARCHAR(100) NOT NULL, horario_padrao INT NOT NULL,
                        run_time INT NOT NULL, machine_counter INT NOT NULL, pallets INT NOT NULL, fardos_avulsos INT NOT NULL,
                        total_pecas_estoque INT NOT NULL, taxa_movimentacao NUMERIC(5,2), taxa_loss NUMERIC(5,2)
                    );
                """)
                cursor.execute("CREATE TABLE IF NOT EXISTS ordem_tno (id SERIAL PRIMARY KEY, ordem_id INT REFERENCES result_by_order(id) ON DELETE CASCADE, tipo_tno VARCHAR(100) NOT NULL, tempo_tno INT NOT NULL);")
                cursor.execute("CREATE TABLE IF NOT EXISTS stop_machine_item (id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE, numero_parada VARCHAR(50) NOT NULL, minutos_parados INT NOT NULL);")

                # Garante apenas que o Admin exista para não perder acesso
                cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
                if not cursor.fetchone():
                    cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")
            
            conn.commit()
            print("⚡ Banco Inicializado Limpo, Rápido e Seguro!")
    except Exception as e:
        print(f"Erro na Inicialização: {e}")

inicializar_banco()

# ================= MODELOS PYDANTIC =================
class ModelAuth(BaseModel): login: str; senha: str
class ModelUsuario(BaseModel): login: str; senha: str; nome: str; nivel: int
class ModelSKU(BaseModel): codigo_sku: str; descricao: str; fraldas_por_pacote: int; pacotes_por_fardo: int; fardos_por_pallet: int
class ModelMaquina(BaseModel): numero_maquina: int; tipo: str; ativo: bool
class ModelParadaMestre(BaseModel): tipo_maquina: str; numero: str; problema: str
class ModelTNOMestre(BaseModel): nome: str

class TNOOrdem(BaseModel): tipo_tno: str; tempo_tno: int
class OrdemProducao(BaseModel): 
    ordem: str; codigo_sku: str; horario_padrao: int; run_time: int; machine_counter: int
    pallets: int; fardos_avulsos: int; tnos: List[TNOOrdem]
class ParadaTurno(BaseModel): numero_parada: str; minutos_parados: int
class PayloadApontamento(BaseModel): data_registro: str; turno: int; operador: str; maquina: int; ordens: List[OrdemProducao]; paradas: List[ParadaTurno]

# ================= ROTAS BÁSICAS =================
@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    login = obj.login.strip().lower()
    if login == "admin" and obj.senha == "admin": return {"login": "admin", "nome": "Administrador Global", "nivel": 3}
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT login, nome, nivel FROM usuarios WHERE login = %s AND senha = %s;", (login, obj.senha))
                user = cursor.fetchone()
                if user: return user
    except Exception: pass
    raise HTTPException(status_code=401, detail="Usuário/Senha inválidos")

@app.get("/dados-mestres")
def obter_dados_mestres():
    dados = {"skus": [], "paradas": [], "tnos": [], "maquinas": [], "usuarios": []}
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM master_sku ORDER BY codigo_sku ASC;"); dados["skus"] = cursor.fetchall()
                cursor.execute("SELECT * FROM codigos_parada ORDER BY tipo_maquina, numero ASC;"); dados["paradas"] = cursor.fetchall()
                cursor.execute("SELECT * FROM tipos_tno ORDER BY nome ASC;"); dados["tnos"] = cursor.fetchall()
                cursor.execute("SELECT * FROM maquinas ORDER BY numero_maquina ASC;"); dados["maquinas"] = cursor.fetchall()
                cursor.execute("SELECT id, login, nome, nivel FROM usuarios WHERE login != 'admin' ORDER BY nome ASC;"); dados["usuarios"] = cursor.fetchall()
        return dados
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ================= ROTAS DE APONTAMENTO =================
def processar_apontamento(dados: PayloadApontamento, cursor, turno_id=None):
    cargas = {1: 455, 2: 440, 3: 415}
    tempo_turno = cargas.get(dados.turno, 440)
    soma_hp = sum(o.horario_padrao for o in dados.ordens)
    soma_rt = sum(o.run_time for o in dados.ordens)
    soma_tno = sum(t.tempo_tno for o in dados.ordens for t in o.tnos)
    soma_paradas = sum(p.minutos_parados for p in dados.paradas)

    if (soma_hp + soma_tno) != tempo_turno: raise HTTPException(status_code=400, detail=f"Soma HP ({soma_hp}m) + TNO ({soma_tno}m) deve ser exatamente {tempo_turno}m.")
    if (soma_hp - soma_rt) != soma_paradas: raise HTTPException(status_code=400, detail=f"Inconsistência: HP - Run Time deve ser igual às paradas apontadas.")

    if turno_id:
        cursor.execute("UPDATE registro_turnos SET data_registro=%s, turno=%s, operador=%s, maquina_numero=%s WHERE id=%s;", (dados.data_registro, dados.turno, dados.operador, dados.maquina, turno_id))
        cursor.execute("DELETE FROM result_by_order WHERE turno_id = %s;", (turno_id,))
        cursor.execute("DELETE FROM stop_machine_item WHERE turno_id = %s;", (turno_id,))
    else:
        cursor.execute("INSERT INTO registro_turnos (data_registro, turno, operador, maquina_numero) VALUES (%s, %s, %s, %s) RETURNING id;", (dados.data_registro, dados.turno, dados.operador, dados.maquina))
        turno_id = cursor.fetchone()[0]

    for o in dados.ordens:
        cursor.execute("SELECT fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet FROM master_sku WHERE codigo_sku = %s;", (o.codigo_sku,))
        sku = cursor.fetchone()
        fraldas, pacotes, fardos_pallet = sku if sku else (0, 0, 0)
        total_fardos = (o.pallets * fardos_pallet) + o.fardos_avulsos
        total_pecas = total_fardos * pacotes * fraldas
        taxa_mov = (o.run_time / o.horario_padrao * 100) if o.horario_padrao > 0 else 0
        taxa_loss = ((o.machine_counter - total_pecas) / o.machine_counter * 100) if o.machine_counter > 0 else 0
        
        cursor.execute("INSERT INTO result_by_order (turno_id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos, total_pecas_estoque, taxa_movimentacao, taxa_loss) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;", (turno_id, o.ordem, o.codigo_sku, o.horario_padrao, o.run_time, o.machine_counter, o.pallets, o.fardos_avulsos, total_pecas, taxa_mov, taxa_loss))
        ordem_id = cursor.fetchone()[0]
        
        for t in o.tnos: cursor.execute("INSERT INTO ordem_tno (ordem_id, tipo_tno, tempo_tno) VALUES (%s, %s, %s);", (ordem_id, t.tipo_tno, t.tempo_tno))
    for p in dados.paradas: cursor.execute("INSERT INTO stop_machine_item (turno_id, numero_parada, minutos_parados) VALUES (%s, %s, %s);", (turno_id, p.numero_parada, p.minutos_parados))

@app.post("/apontamentos")
def criar_apontamento(dados: PayloadApontamento):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cursor: processar_apontamento(dados, cursor); conn.commit()
            return {"status": "sucesso"}
    except HTTPException as h: raise h
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/apontamentos/{id}")
def atualizar_apontamento(id: int, dados: PayloadApontamento):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cursor: processar_apontamento(dados, cursor, turno_id=id); conn.commit()
            return {"status": "sucesso"}
    except HTTPException as h: raise h
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/apontamentos")
def listar_lancamentos(data: str = None, turno: str = None, maquina: str = None, ordem: str = None):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                query = "SELECT r.id, r.data_registro::text, r.turno, r.operador, r.maquina_numero, (SELECT COALESCE(SUM(machine_counter),0) FROM result_by_order WHERE turno_id = r.id) as total_mc FROM registro_turnos r WHERE 1=1 "
                params = []
                if data: query += "AND r.data_registro = %s "; params.append(data)
                if turno: query += "AND r.turno = %s "; params.append(turno)
                if maquina: query += "AND r.maquina_numero = %s "; params.append(maquina)
                if ordem: query += "AND EXISTS (SELECT 1 FROM result_by_order WHERE turno_id = r.id AND ordem ILIKE %s) "; params.append(f"%{ordem}%")
                query += "ORDER BY r.data_registro DESC, r.turno ASC LIMIT 100;"
                cursor.execute(query, tuple(params))
                return cursor.fetchall()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/apontamentos/{id}")
def obter_lancamento_completo(id: int):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT id, data_registro::text, turno, operador, maquina_numero as maquina FROM registro_turnos WHERE id = %s;", (id,))
                turno = cursor.fetchone()
                if not turno: raise HTTPException(status_code=404)
                cursor.execute("SELECT id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos FROM result_by_order WHERE turno_id = %s;", (id,))
                ordens = cursor.fetchall()
                for o in ordens:
                    cursor.execute("SELECT tipo_tno, tempo_tno FROM ordem_tno WHERE ordem_id = %s;", (o['id'],))
                    o['tnos'] = cursor.fetchall()
                cursor.execute("SELECT numero_parada, minutos_parados FROM stop_machine_item WHERE turno_id = %s;", (id,))
                paradas = cursor.fetchall()
                turno['ordens'] = ordens; turno['paradas'] = paradas
                return turno
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/apontamentos/{id}")
def deletar_lancamento(id: int):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cursor: cursor.execute("DELETE FROM registro_turnos WHERE id = %s;", (id,)); conn.commit()
            return {"status": "removido"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/visao-ordens")
def visao_ordens():
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT ro.ordem, MAX(rt.maquina_numero) as maquina, ro.codigo_sku, 
                    SUM(ro.machine_counter) as total_mc, SUM(ro.total_pecas_estoque) as pecas_estoque, 
                    SUM(ro.horario_padrao) as hp_total, SUM(ro.run_time) as rt_total, 
                    SUM(ro.pallets) as pallets, SUM(ro.fardos_avulsos) as fardos_avulsos,
                    MAX(s.fardos_por_pallet) as fat_pallet
                    FROM result_by_order ro
                    JOIN registro_turnos rt ON ro.turno_id = rt.id
                    JOIN master_sku s ON ro.codigo_sku = s.codigo_sku
                    GROUP BY ro.ordem, ro.codigo_sku ORDER BY ro.ordem DESC LIMIT 100;
                """)
                linhas = cursor.fetchall()
                for l in linhas: l['total_fardos_calculado'] = (l['pallets'] * l['fat_pallet']) + l['fardos_avulsos']
                return linhas
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ================= ROTAS DE EDIÇÃO E CADASTRO =================
def db_execute(query, params=None):
    try:
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as c: 
                if params: c.execute(query, params)
                else: c.execute(query)
                conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/maquinas")
def c_m(m: ModelMaquina): return db_execute("INSERT INTO maquinas (numero_maquina, tipo, ativo) VALUES (%s, %s, %s);", (m.numero_maquina, m.tipo, m.ativo))
@app.put("/admin/maquinas/{id}")
def u_m(id: int, m: ModelMaquina): return db_execute("UPDATE maquinas SET numero_maquina=%s, tipo=%s, ativo=%s WHERE id=%s;", (m.numero_maquina, m.tipo, m.ativo, id))

@app.post("/admin/tnos")
def c_t(t: ModelTNOMestre): return db_execute("INSERT INTO tipos_tno (nome) VALUES (%s);", (t.nome,))
@app.put("/admin/tnos/{id}")
def u_t(id: int, t: ModelTNOMestre): return db_execute("UPDATE tipos_tno SET nome=%s WHERE id=%s;", (t.nome, id))
@app.delete("/admin/tnos/{id}")
def d_t(id: int): return db_execute("DELETE FROM tipos_tno WHERE id=%s;", (id,))

@app.post("/admin/paradas")
def c_p(p: ModelParadaMestre): return db_execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES (%s, %s, %s);", (p.tipo_maquina, p.numero, p.problema))
@app.put("/admin/paradas/{id}")
def u_p(id: int, p: ModelParadaMestre): return db_execute("UPDATE codigos_parada SET tipo_maquina=%s, numero=%s, problema=%s WHERE id=%s;", (p.tipo_maquina, p.numero, p.problema, id))
@app.delete("/admin/paradas/{id}")
def d_p(id: int): return db_execute("DELETE FROM codigos_parada WHERE id=%s;", (id,))

@app.post("/admin/usuarios")
def c_u(u: ModelUsuario): return db_execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login, u.senha, u.nome, u.nivel))
@app.put("/admin/usuarios/{id}")
def u_u(id: int, u: ModelUsuario): return db_execute("UPDATE usuarios SET login=%s, senha=%s, nome=%s, nivel=%s WHERE id=%s;", (u.login.lower(), u.senha, u.nome, u.nivel, id))
@app.delete("/admin/usuarios/{id}")
def d_u(id: int): return db_execute("DELETE FROM usuarios WHERE id=%s;", (id,))

@app.post("/admin/skus")
def c_s(s: ModelSKU): return db_execute("INSERT INTO master_sku (codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet) VALUES (%s, %s, %s, %s, %s);", (s.codigo_sku, s.descricao, s.fraldas_por_pacote, s.pacotes_por_fardo, s.fardos_por_pallet))
@app.put("/skus/{id}")
def u_s(id: int, s: ModelSKU): return db_execute("UPDATE master_sku SET codigo_sku=%s, descricao=%s, fraldas_por_pacote=%s, pacotes_por_fardo=%s, fardos_por_pallet=%s WHERE id=%s;", (s.codigo_sku, s.descricao, s.fraldas_por_pacote, s.pacotes_por_fardo, s.fardos_por_pallet, id))
@app.delete("/skus/{id}")
def d_s(id: int): return db_execute("DELETE FROM master_sku WHERE id=%s;", (id,))
